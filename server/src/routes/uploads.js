// دریافت فایل از مشتری با QR.
//  عمومی (بدون ورود، فقط با «کد عمومی» نامحدسِ کافی‌نت):  GET /u/:code (صفحه) · GET/POST /api/public/upload/:code
//  کافی‌نت (ورود + مجوز upload.view / upload.manage):  /api/uploads/settings · /api/uploads (فهرست/دانلود/وضعیت/حذف)
// امنیت: فقط پسوندهای فهرست سفید + امضای بایت؛ سقف حجم/تعداد/فضا/تعداد روزانه؛ سقف نرخ هر IP؛ هش IP؛ ذخیره روی دیسک با نام تصادفی؛
// دانلود فقط attachment با nosniff؛ حذف خودکار پس از retention_days. هیچ ضدویروسی اجرا نمی‌شود (در راهنما توصیه شده).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import multipart from "@fastify/multipart";
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { HttpError, forbidden, invalid, notFound } from "../lib/errors.js";
import { ALLOWED_EXTS, MIME_BY_EXT, batchCode, checkFile, extOf, generateCode, ipHash, isCode, newKey, pathForKey, sanitizeName, tmpDir, uploadRoot } from "../lib/uploads.js";
import { clampInt, toText } from "../lib/validate.js";
import { UPLOAD_PAGE_CSP, UPLOAD_PAGE_HTML } from "../lib/uploadPage.js";

const STATUSES = ["new", "seen", "printed", "done"];
const closed = () => new HttpError(403, "upload_closed", "دریافت فایل در این کافی‌نت فعلاً بسته است");
const bad = (m, code = "upload_rejected") => new HttpError(422, code, m);

export async function registerUploads(app) {
  const { pool, cfg } = app;
  const view = { preHandler: [app.requirePerm("upload.view", "upload.manage")] };
  const manage = { preHandler: [app.requirePerm("upload.manage")] };
  fs.mkdirSync(tmpDir(cfg), { recursive: true });

  const settingsFor = async (c, cafeId) => {
    let r = await c.query("SELECT * FROM upload_settings WHERE cafe_id = $1", [cafeId]);
    if (!r.rows[0]) {
      for (let i = 0; i < 5 && !r.rows[0]; i++) r = await c.query("INSERT INTO upload_settings (cafe_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *", [cafeId, generateCode()]);
      if (!r.rows[0]) r = await c.query("SELECT * FROM upload_settings WHERE cafe_id = $1", [cafeId]);
    }
    return r.rows[0];
  };
  const usage = async (c, cafeId) => Number((await c.query("SELECT COALESCE(SUM(size),0)::bigint AS s FROM customer_uploads WHERE cafe_id=$1 AND deleted_at IS NULL", [cafeId])).rows[0].s);
  const shapeSettings = (s, used) => ({
    code: s.code, path: `/u/${s.code}`, url: cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/u/${s.code}` : null, enabled: s.enabled,
    maxFileMb: s.max_file_mb, maxFiles: s.max_files, retentionDays: s.retention_days, requirePhone: s.require_phone, notice: s.notice,
    allowedExts: ALLOWED_EXTS, usedBytes: used, quotaBytes: cfg.uploadQuotaMb * 1048576, updatedAt: s.updated_at,
  });

  // ════════ عمومی ════════
  const byCode = async (code) => {
    if (!isCode(code)) throw notFound("این نشانی معتبر نیست");
    const r = await pool.query("SELECT s.*, c.name AS cafe_name, c.status AS cafe_status FROM upload_settings s JOIN cafes c ON c.id = s.cafe_id WHERE s.code = $1", [code]);
    const s = r.rows[0];
    if (!s) throw notFound("این نشانی معتبر نیست");
    if (!s.enabled || s.cafe_status !== "active") throw closed();
    return s;
  };
  app.get("/u/:code", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!isCode(req.params.code)) return reply.code(404).type("text/plain; charset=utf-8").send("not found");
    return reply.header("content-security-policy", UPLOAD_PAGE_CSP).header("cache-control", "no-store").header("x-robots-tag", "noindex, nofollow").type("text/html; charset=utf-8").send(UPLOAD_PAGE_HTML);
  });
  app.get("/api/public/upload/:code", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await byCode(req.params.code);
    reply.header("cache-control", "no-store");
    return { data: { cafeName: s.cafe_name, maxFileMb: s.max_file_mb, maxFiles: s.max_files, allowedExts: ALLOWED_EXTS, notice: s.notice, requirePhone: s.require_phone } };
  });

  await app.register(async (pub) => {
    await pub.register(multipart, { limits: { fileSize: 100 * 1048576 + 1, files: 30, fields: 6, fieldSize: 2048, parts: 40, headerPairs: 200 } });
    pub.post("/api/public/upload/:code", { config: { rateLimit: { max: cfg.uploadIpPerHour, timeWindow: "1 hour" } } }, async (req, reply) => {
      const s = await byCode(req.params.code);
      if (!req.isMultipart()) throw new HttpError(415, "unsupported_media_type", "ارسال باید به‌صورت فرم فایل باشد");
      const maxBytes = s.max_file_mb * 1048576;
      const declared = Number(req.headers["content-length"] || 0);
      if (declared > s.max_files * maxBytes + 1048576) throw new HttpError(413, "payload_too_large", "حجم کل ارسال زیاد است");
      const cafeId = s.cafe_id, ih = ipHash(cfg, req.ip);
      // سقف‌ها (پیش از دریافت): فضای کافی‌نت، تعداد فایل در ۲۴ ساعت، تعداد ارسال از یک IP در ساعت
      if ((await usage(pool, cafeId)) + Math.max(declared, 1) > cfg.uploadQuotaMb * 1048576) throw new HttpError(507, "upload_quota", "فضای دریافت فایل این کافی‌نت پر است؛ به کارمند اطلاع دهید");
      const day = await pool.query("SELECT count(*)::int AS n FROM customer_uploads WHERE cafe_id=$1 AND created_at > now() - interval '24 hours'", [cafeId]);
      if (day.rows[0].n >= cfg.uploadDailyFiles) throw new HttpError(429, "upload_daily_limit", "سقف دریافت فایل امروز این کافی‌نت پر شده است");
      const hr = await pool.query("SELECT count(DISTINCT batch_id)::int AS n FROM customer_uploads WHERE cafe_id=$1 AND ip_hash=$2 AND created_at > now() - interval '1 hour'", [cafeId, ih]);
      if (hr.rows[0].n >= 15) throw new HttpError(429, "rate_limited", "تعداد ارسال‌ها زیاد است؛ کمی بعد تلاش کنید");

      const fields = {}, saved = [];
      const cleanup = () => Promise.all(saved.map((f) => fs.promises.rm(f.tmp, { force: true }).catch(() => {})));
      try {
        for await (const part of req.parts({ limits: { fileSize: maxBytes + 1, files: s.max_files } })) {
          if (part.type === "field") { if (part.fieldname in { name: 1, phone: 1, note: 1 }) fields[part.fieldname] = String(part.value ?? ""); continue; }
          if (part.fieldname !== "files") { part.file.resume(); continue; }
          const name = sanitizeName(part.filename);
          const tmp = path.join(tmpDir(cfg), crypto.randomUUID());
          const rec = { tmp, name, size: 0, head: Buffer.alloc(0), hash: crypto.createHash("sha256") };
          saved.push(rec);
          const meter = new Transform({ transform(chunk, _e, cb) { rec.size += chunk.length; rec.hash.update(chunk); if (rec.head.length < 8192) rec.head = Buffer.concat([rec.head, chunk]).subarray(0, 8192); cb(null, chunk); } });
          await pipeline(part.file, meter, fs.createWriteStream(tmp, { mode: 0o640 }));
          if (part.file.truncated || rec.size > maxBytes) throw bad(`«${name}» بزرگ‌تر از ${s.max_file_mb} مگابایت است`, "file_too_large");
        }
        if (!saved.length) throw invalid("هیچ فایلی انتخاب نشده است");
        if (saved.length > s.max_files) throw invalid(`حداکثر ${s.max_files} فایل در هر ارسال`);
        for (const f of saved) {
          if (f.size === 0) throw bad(`«${f.name}» خالی است`, "empty_file");
          const e = checkFile(f.name, f.head);
          if (e === "bad_ext") throw bad(`«${f.name}» پذیرفته نمی‌شود. فرمت‌های مجاز: ${ALLOWED_EXTS.join("، ")}`, "bad_ext");
          if (e) throw bad(`محتوای «${f.name}» با فرمت آن نمی‌خواند`, "bad_signature");
        }
        const sender = { name: toText(fields.name, { max: 60, key: "نام" }).trim(), phone: toText(fields.phone, { max: 16, key: "موبایل" }).replace(/[\s-]/g, ""), note: toText(fields.note, { max: 300, key: "توضیح" }).trim() };
        if (s.require_phone && !/^[0-9۰-۹]{10,13}$/.test(sender.phone)) throw invalid("شمارهٔ موبایل را درست وارد کنید");
        if (sender.phone && !/^[0-9۰-۹+]{6,16}$/.test(sender.phone)) throw invalid("شمارهٔ موبایل نامعتبر است");
        // انتقال به محل نهایی + ثبت در یک تراکنش؛ اگر ثبت شکست بخورد فایل‌های منتقل‌شده پاک می‌شوند
        const batchId = crypto.randomUUID(), code = batchCode(), moved = [];
        try {
          for (const f of saved) { f.key = newKey(cafeId); const dest = pathForKey(cfg, f.key); await fs.promises.mkdir(path.dirname(dest), { recursive: true, mode: 0o750 }); await fs.promises.rename(f.tmp, dest); moved.push(dest); }
          await tx(pool, async (c) => {
            for (const f of saved) await c.query("INSERT INTO customer_uploads (cafe_id,batch_id,batch_code,original_name,storage_key,mime,size,sha256,sender_name,sender_phone,note,ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
              [cafeId, batchId, code, f.name, f.key, MIME_BY_EXT[extOf(f.name)] || "application/octet-stream", f.size, f.hash.digest("hex"), sender.name, sender.phone, sender.note, ih]);
          });
        } catch (e) { await Promise.all(moved.map((p) => fs.promises.rm(p, { force: true }).catch(() => {}))); throw e; }
        reply.code(201);
        return { data: { batchCode: code, count: saved.length } };
      } catch (e) {
        if (e?.code === "FST_REQ_FILE_TOO_LARGE") throw bad(`حجم فایل بیش از ${s.max_file_mb} مگابایت است`, "file_too_large");
        if (typeof e?.code === "string" && e.code.startsWith("FST_") && !(e instanceof HttpError)) throw invalid("فرم ارسال نامعتبر یا بیش‌ازحد بزرگ است");
        throw e;
      } finally { await cleanup(); }
    });
  });

  // ════════ کافی‌نت ════════
  app.get("/api/uploads/settings", view, async (req) => {
    const s = await settingsFor(pool, req.user.cafeId);
    return { data: { ...shapeSettings(s, await usage(pool, req.user.cafeId)), canManage: (await app.perms.forRequest(req)).has("upload.manage") } };
  });
  app.put("/api/uploads/settings", manage, async (req) => {
    const b = req.body || {};
    const next = {
      enabled: b.enabled === undefined ? undefined : !!b.enabled,
      max_file_mb: b.maxFileMb === undefined ? undefined : clampInt(b.maxFileMb, 20, 1, 100),
      max_files: b.maxFiles === undefined ? undefined : clampInt(b.maxFiles, 10, 1, 30),
      retention_days: b.retentionDays === undefined ? undefined : clampInt(b.retentionDays, 30, 1, 365),
      require_phone: b.requirePhone === undefined ? undefined : !!b.requirePhone,
      notice: b.notice === undefined ? undefined : toText(b.notice, { max: 300, key: "اطلاعیه" }).trim(),
    };
    return tx(pool, async (c) => {
      const cur = await settingsFor(c, req.user.cafeId);
      const m = { ...cur }; for (const [k, v] of Object.entries(next)) if (v !== undefined) m[k] = v;
      const r = await c.query("UPDATE upload_settings SET enabled=$2,max_file_mb=$3,max_files=$4,retention_days=$5,require_phone=$6,notice=$7,updated_at=now() WHERE cafe_id=$1 RETURNING *",
        [req.user.cafeId, m.enabled, m.max_file_mb, m.max_files, m.retention_days, m.require_phone, m.notice]);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.settings", entity: "upload_settings", entityId: req.user.cafeId, details: { before: { enabled: cur.enabled, maxFileMb: cur.max_file_mb, maxFiles: cur.max_files, retentionDays: cur.retention_days, requirePhone: cur.require_phone }, after: { enabled: m.enabled, maxFileMb: m.max_file_mb, maxFiles: m.max_files, retentionDays: m.retention_days, requirePhone: m.require_phone } }, ip: req.ip });
      return { data: shapeSettings(r.rows[0], await usage(c, req.user.cafeId)) };
    });
  });
  app.post("/api/uploads/settings/rotate-code", manage, async (req) => tx(pool, async (c) => {
    await settingsFor(c, req.user.cafeId);
    let r;
    for (let i = 0; i < 5 && !r; i++) { try { r = await c.query("UPDATE upload_settings SET code=$2, updated_at=now() WHERE cafe_id=$1 RETURNING *", [req.user.cafeId, generateCode()]); } catch (e) { if (e.code !== "23505") throw e; } }
    await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.rotate_code", entity: "upload_settings", entityId: req.user.cafeId, details: {}, ip: req.ip });
    return { data: shapeSettings(r.rows[0], await usage(c, req.user.cafeId)) };
  }));

  const shape = (r) => ({ id: r.id, batchId: r.batch_id, batchCode: r.batch_code, name: r.original_name, size: r.size, mime: r.mime, senderName: r.sender_name, senderPhone: r.sender_phone, note: r.note, status: r.status, createdAt: r.created_at, statusAt: r.status_at });
  app.get("/api/uploads", view, async (req) => {
    const q = req.query || {}, cafeId = req.user.cafeId;
    const limit = clampInt(q.limit, 50, 1, 200), offset = clampInt(q.offset, 0, 0, 1e6);
    const w = ["cafe_id = $1", "deleted_at IS NULL"], p = [cafeId];
    if (q.status) { if (!STATUSES.includes(q.status)) throw invalid("وضعیت نامعتبر است"); p.push(q.status); w.push(`status = $${p.length}`); }
    if (q.q) { const t = String(q.q).slice(0, 60); p.push(t.replace(/[\\%_]/g, "\\$&")); const i = p.length; w.push(`(batch_code = $${i} OR original_name ILIKE '%' || $${i} || '%' OR sender_name ILIKE '%' || $${i} || '%' OR sender_phone LIKE '%' || $${i} || '%')`); }
    const rows = await pool.query(`SELECT * FROM customer_uploads WHERE ${w.join(" AND ")} ORDER BY created_at DESC, id LIMIT ${limit} OFFSET ${offset}`, p);
    const meta = await pool.query("SELECT count(*) FILTER (WHERE status='new')::int AS new_count, count(*)::int AS total FROM customer_uploads WHERE cafe_id=$1 AND deleted_at IS NULL", [cafeId]);
    return { data: rows.rows.map(shape), meta: { newCount: meta.rows[0].new_count, total: meta.rows[0].total, limit, offset } };
  });
  const load = async (req) => {
    const r = await pool.query("SELECT * FROM customer_uploads WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL", [req.user.cafeId, req.params.id]);
    if (!r.rows[0]) throw notFound("فایل پیدا نشد");
    return r.rows[0];
  };
  app.get("/api/uploads/:id/download", view, async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound("فایل پیدا نشد");
    const u = await load(req);
    const p = pathForKey(cfg, u.storage_key);
    let st; try { st = await fs.promises.stat(p); } catch { throw new HttpError(410, "file_gone", "فایل از روی سرور حذف شده است"); }
    if (u.status === "new") await pool.query("UPDATE customer_uploads SET status='seen', status_at=now(), status_by=$3 WHERE cafe_id=$1 AND id=$2 AND status='new'", [req.user.cafeId, u.id, req.user.id]);
    const fname = u.original_name.replace(/[^\x20-\x7e]/g, "_").replace(/["\;]/g, "_");
    return reply.header("content-type", "application/octet-stream").header("content-length", st.size)
      .header("content-disposition", `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(u.original_name)}`)
      .header("x-content-type-options", "nosniff").header("cache-control", "private, no-store").send(fs.createReadStream(p));
  });
  app.patch("/api/uploads/:id", view, async (req) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound("فایل پیدا نشد");
    const st = req.body?.status; if (!STATUSES.includes(st)) throw invalid("وضعیت نامعتبر است");
    const u = await load(req);
    const r = await pool.query("UPDATE customer_uploads SET status=$3, status_at=now(), status_by=$4 WHERE cafe_id=$1 AND id=$2 RETURNING *", [req.user.cafeId, u.id, st, req.user.id]);
    return { data: shape(r.rows[0]) };
  });
  app.delete("/api/uploads/:id", view, async (req) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound("فایل پیدا نشد");
    const u = await load(req);
    await fs.promises.rm(pathForKey(cfg, u.storage_key), { force: true });
    await tx(pool, async (c) => {
      await c.query("UPDATE customer_uploads SET deleted_at=now(), original_name='', note='' WHERE cafe_id=$1 AND id=$2", [req.user.cafeId, u.id]);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.delete", entity: "customer_upload", entityId: u.id, details: { name: u.original_name, size: u.size, batchCode: u.batch_code }, ip: req.ip });
    });
    return { data: { ok: true } };
  });
}
