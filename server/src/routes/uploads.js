// دریافت فایل از مشتری با QR (1.76) + QR موقت هر سفارش، مدیریت فایل، ضدویروس و اعلان فایل تازه (1.77).
//  عمومی (بدون ورود، فقط با کد نامحدس):  GET /u/:code (صفحه) · GET/POST /api/public/upload/:code · GET /api/public/upload/:code/status/:token
//     کد می‌تواند «QR دائمی کافی‌نت» یا «QR موقت یک سفارش/جلسه» باشد؛ مشتری فقط می‌فرستد و وضعیت ارسال خودش را (با رمز همان ارسال) می‌بیند.
//  کافی‌نت (ورود + مجوز):  /api/uploads/settings · /sessions · /summary · /blocked · /link · /bulk-* · /derive · /:id (دانلود، وضعیت، تغییر نام، نگه‌داری ویژه، حذف)
// امنیت: فقط پسوندهای فهرست سفید + امضای بایت؛ اسکن ClamAV (در صورت پیکربندی)؛ سقف حجم/تعداد/فضا/روزانه؛ سقف نرخ IP؛ هش IP؛ ذخیره با نام تصادفی؛
// دانلود فقط attachment با nosniff؛ حذف خودکار؛ فایل «نگه‌داری ویژه» خودکار و گروهی پاک نمی‌شود.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import multipart from "@fastify/multipart";
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { HttpError, invalid, notFound } from "../lib/errors.js";
import { createScanner } from "../lib/av.js";
import { ALLOWED_EXTS, MIME_BY_EXT, batchCode, checkFile, extOf, generateCode, hashSecret, ipHash, isCode, newKey, newSecret, pathForKey, renameKeepExt, safeEqualHex, sanitizeName, tmpDir } from "../lib/uploads.js";
import { clampInt, toText } from "../lib/validate.js";
import { UPLOAD_PAGE_CSP, UPLOAD_PAGE_HTML } from "../lib/uploadPage.js";

const STATUSES = ["new", "seen", "printed", "done"];
const SORTS = { created: "created_at", name: "lower(original_name)", size: "size", status: "CASE status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'printed' THEN 2 ELSE 3 END" };
const UUID = /^[0-9a-f-]{36}$/;
const closed = () => new HttpError(403, "upload_closed", "دریافت فایل در این کافی‌نت فعلاً بسته است");
const bad = (m, code = "upload_rejected") => new HttpError(422, code, m);
const ids = (v, max = 200) => {
  if (!Array.isArray(v) || !v.length) throw invalid("فهرست فایل‌ها خالی است");
  if (v.length > max) throw invalid(`حداکثر ${max} فایل در هر عملیات`);
  if (!v.every((x) => typeof x === "string" && UUID.test(x))) throw invalid("شناسهٔ فایل نامعتبر است");
  return [...new Set(v)];
};

export async function registerUploads(app) {
  const { pool, cfg } = app;
  const av = createScanner(cfg, (m) => app.log.warn(m));
  const view = { preHandler: [app.requirePerm("upload.view", "upload.manage")] };
  const manage = { preHandler: [app.requirePerm("upload.manage")] };
  const bulkDel = { preHandler: [app.requirePerm("upload.bulk_delete", "upload.manage")] };
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
  const avInfo = async () => ({ mode: av.mode, engine: av.engine, available: av.mode === "off" ? false : await av.available() });
  // متن تک‌خطی بدون نویسهٔ کنترلی؛ برای مشخصاتی که روی صفحهٔ عمومی نشان داده می‌شود.
  const oneLine = (v, max, key) => toText(String(v ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, " "), { max, key }).trim();
  const shopOf = (s) => (s.show_shop_info === false ? null : { name: s.shop_name || "", address: s.shop_address || "", phone: s.shop_phone || "", mobile: s.shop_mobile || "", logo: s.shop_logo_hash ? `logo?v=${s.shop_logo_hash.slice(0, 16)}` : "" });
  const sniffLogo = (b) => (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? "image/png" : b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "image/jpeg" : b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" ? "image/webp" : null);
  const shapeSettings = (s, used) => ({
    code: s.code, path: `/u/${s.code}`, url: cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/u/${s.code}` : null, enabled: s.enabled,
    maxFileMb: s.max_file_mb, maxFiles: s.max_files, retentionDays: s.retention_days, doneRetentionDays: s.done_retention_days, requirePhone: s.require_phone, notice: s.notice,
    allowedExts: ALLOWED_EXTS, usedBytes: used, quotaBytes: cfg.uploadQuotaMb * 1048576, updatedAt: s.updated_at,
    showShopInfo: s.show_shop_info, shopName: s.shop_name || "", shopAddress: s.shop_address || "", shopPhone: s.shop_phone || "", shopMobile: s.shop_mobile || "", hasLogo: !!s.shop_logo_hash, logoHash: s.shop_logo_hash || "",
  });
  const shapeSession = (r, n = 0) => {
    const now = Date.now(), exp = new Date(r.expires_at).getTime();
    return {
      id: r.id, code: r.code, path: `/u/${r.code}`, url: cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/u/${r.code}` : null, label: r.label,
      orderRef: r.order_ref, orderLabel: r.order_label, customerRef: r.customer_ref, customerLabel: r.customer_label,
      maxFiles: r.max_files, maxFileMb: r.max_file_mb, expiresAt: r.expires_at, closedAt: r.closed_at, createdAt: r.created_at,
      state: r.closed_at ? "closed" : exp <= now ? "expired" : "active", uploads: n,
    };
  };
  const uniqueCode = async (c) => {
    for (let i = 0; i < 8; i++) {
      const code = generateCode();
      const r = await c.query("SELECT 1 FROM upload_settings WHERE code=$1 UNION ALL SELECT 1 FROM upload_sessions WHERE code=$1", [code]);
      if (!r.rows.length) return code;
    }
    throw new HttpError(500, "code_generation_failed", "ساخت کد ممکن نشد؛ دوباره تلاش کنید");
  };

  // ════════ دریافت چندبخشی (مشترک بین مشتری و ساخت فایل با ابزار PDF) ════════
  const receive = async (req, { maxBytes, maxFiles, field, textFields = [] }) => {
    const fields = {}, saved = [];
    const cleanup = () => Promise.all(saved.map((f) => fs.promises.rm(f.tmp, { force: true }).catch(() => {})));
    try {
      for await (const part of req.parts({ limits: { fileSize: maxBytes + 1, files: maxFiles } })) {
        if (part.type === "field") { if (textFields.includes(part.fieldname)) fields[part.fieldname] = String(part.value ?? ""); continue; }
        if (part.fieldname !== field) { part.file.resume(); continue; }
        const name = sanitizeName(part.filename);
        const tmp = path.join(tmpDir(cfg), crypto.randomUUID());
        const rec = { tmp, name, size: 0, head: Buffer.alloc(0), hash: crypto.createHash("sha256") };
        saved.push(rec);
        const meter = new Transform({ transform(chunk, _e, cb) { rec.size += chunk.length; rec.hash.update(chunk); if (rec.head.length < 8192) rec.head = Buffer.concat([rec.head, chunk]).subarray(0, 8192); cb(null, chunk); } });
        await pipeline(part.file, meter, fs.createWriteStream(tmp, { mode: 0o640 }));
        if (part.file.truncated || rec.size > maxBytes) throw bad(`«${name}» بزرگ‌تر از ${Math.round(maxBytes / 1048576)} مگابایت است`, "file_too_large");
      }
      return { fields, saved, cleanup };
    } catch (e) {
      await cleanup();
      if (e?.code === "FST_REQ_FILE_TOO_LARGE") throw bad(`حجم فایل بیش از ${Math.round(maxBytes / 1048576)} مگابایت است`, "file_too_large");
      if (typeof e?.code === "string" && e.code.startsWith("FST_") && !(e instanceof HttpError)) throw invalid("فرم ارسال نامعتبر یا بیش‌ازحد بزرگ است");
      throw e;
    }
  };
  const validateSaved = (saved) => {
    if (!saved.length) throw invalid("هیچ فایلی انتخاب نشده است");
    for (const f of saved) {
      if (f.size === 0) throw bad(`«${f.name}» خالی است`, "empty_file");
      const e = checkFile(f.name, f.head);
      if (e === "bad_ext") throw bad(`«${f.name}» پذیرفته نمی‌شود. فرمت‌های مجاز: ${ALLOWED_EXTS.join("، ")}`, "bad_ext");
      if (e) throw bad(`محتوای «${f.name}» با فرمت آن نمی‌خواند`, "bad_signature");
    }
  };
  // ضدویروس: آلوده → کل ارسال رد (و ثبت در upload_blocked)؛ clamd در دسترس نبود → در حالت required رد، در optional بدون اسکن
  const scanSaved = async (saved, cafeId, ih) => {
    let scanned = true;
    for (const f of saved) {
      const r = await av.scan(f.tmp);
      if (r.status === "infected") {
        await pool.query("INSERT INTO upload_blocked (cafe_id, file_name, reason, ip_hash) VALUES ($1,$2,$3,$4)", [cafeId, f.name, `ویروس: ${r.signature}`, ih]).catch(() => {});
        throw new HttpError(422, "infected", `«${f.name}» آلوده تشخیص داده شد و پذیرفته نشد`);
      }
      if (r.status === "unavailable") throw new HttpError(503, "av_unavailable", "بررسی ویروس فعلاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید");
      if (r.status !== "clean") scanned = false;
    }
    return scanned ? "clean" : "skipped";
  };
  const moveFinal = async (saved, cafeId) => {
    const moved = [];
    try {
      for (const f of saved) { f.key = newKey(cafeId); const dest = pathForKey(cfg, f.key); await fs.promises.mkdir(path.dirname(dest), { recursive: true, mode: 0o750 }); await fs.promises.rename(f.tmp, dest); moved.push(dest); }
    } catch (e) { await Promise.all(moved.map((p) => fs.promises.rm(p, { force: true }).catch(() => {}))); throw e; }
    return () => Promise.all(moved.map((p) => fs.promises.rm(p, { force: true }).catch(() => {})));
  };
  const INSERT = "INSERT INTO customer_uploads (cafe_id,batch_id,batch_code,original_name,storage_key,mime,size,sha256,sender_name,sender_phone,note,ip_hash,session_id,order_ref,order_label,customer_ref,customer_label,scan_status,secret_hash,derived_from,status,status_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,CASE WHEN $21 = 'new' THEN NULL ELSE now() END)";

  // ════════ عمومی ════════
  /** کد را به «QR دائمی کافی‌نت» یا «QR موقت سفارش» ترجمه می‌کند. strict=false: برای خواندن وضعیت، بسته/منقضی‌بودن مانع نیست. */
  const byCode = async (code, { strict = true } = {}) => {
    if (!isCode(code)) throw notFound("این نشانی معتبر نیست");
    const sr = await pool.query(`SELECT ss.*, s.enabled, s.max_file_mb AS shop_mb, s.max_files AS shop_files, s.require_phone, s.notice, s.show_shop_info, s.shop_name, s.shop_address, s.shop_phone, s.shop_mobile, s.shop_logo_hash, c.name AS cafe_name, c.status AS cafe_status
      FROM upload_sessions ss JOIN upload_settings s ON s.cafe_id = ss.cafe_id JOIN cafes c ON c.id = ss.cafe_id WHERE ss.code = $1`, [code]);
    const ss = sr.rows[0];
    if (ss) {
      if (strict) {
        if (!ss.enabled || ss.cafe_status !== "active") throw closed();
        if (ss.closed_at) throw new HttpError(410, "session_closed", "این QR بسته شده است. از کارمند یک QR تازه بگیرید");
        if (new Date(ss.expires_at).getTime() <= Date.now()) throw new HttpError(410, "session_expired", "مهلت این QR تمام شده است. از کارمند یک QR تازه بگیرید");
      }
      return { kind: "session", cafeId: ss.cafe_id, cafeName: ss.cafe_name, session: ss, label: ss.label, expiresAt: ss.expires_at, maxFileMb: Math.min(ss.shop_mb, ss.max_file_mb || ss.shop_mb), maxFiles: Math.min(ss.shop_files, ss.max_files), requirePhone: ss.require_phone, notice: ss.notice, shop: shopOf(ss), cafeLabel: ss.shop_name || ss.cafe_name };
    }
    const r = await pool.query("SELECT s.*, c.name AS cafe_name, c.status AS cafe_status FROM upload_settings s JOIN cafes c ON c.id = s.cafe_id WHERE s.code = $1", [code]);
    const s = r.rows[0];
    if (!s) throw notFound("این نشانی معتبر نیست");
    if (strict && (!s.enabled || s.cafe_status !== "active")) throw closed();
    return { kind: "shop", cafeId: s.cafe_id, cafeName: s.cafe_name, session: null, label: "", expiresAt: null, maxFileMb: s.max_file_mb, maxFiles: s.max_files, requirePhone: s.require_phone, notice: s.notice, shop: shopOf(s), cafeLabel: s.shop_name || s.cafe_name };
  };
  app.get("/u/:code", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!isCode(req.params.code)) return reply.code(404).type("text/plain; charset=utf-8").send("not found");
    return reply.header("content-security-policy", UPLOAD_PAGE_CSP).header("cache-control", "no-store").header("x-robots-tag", "noindex, nofollow").type("text/html; charset=utf-8").send(UPLOAD_PAGE_HTML);
  });
  app.get("/api/public/upload/:code", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await byCode(req.params.code);
    reply.header("cache-control", "no-store");
    return { data: { cafeName: s.cafeLabel || s.cafeName, shop: s.shop, kind: s.kind, label: s.label, expiresAt: s.expiresAt, serverTime: new Date().toISOString(), maxFileMb: s.maxFileMb, maxFiles: s.maxFiles, allowedExts: ALLOWED_EXTS, notice: s.notice, requirePhone: s.requirePhone } };
  });
  // لوگوی کافی‌نت (فقط اگر مدیر «نمایش مشخصات» را روشن گذاشته باشد). تصویر ساده؛ هرگز اجرا نمی‌شود (nosniff + CSP خالی).
  app.get("/u/:code/logo", { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await byCode(req.params.code, { strict: false });
    const r = await pool.query("SELECT shop_logo, shop_logo_mime, shop_logo_hash, show_shop_info FROM upload_settings WHERE cafe_id=$1", [s.cafeId]);
    const row = r.rows[0];
    if (!row || !row.show_shop_info || !row.shop_logo) throw notFound("پیدا نشد");
    const etag = `"${row.shop_logo_hash}"`;
    reply.header("etag", etag).header("cache-control", "public, max-age=300").header("x-content-type-options", "nosniff").header("content-security-policy", "default-src 'none'").header("cross-origin-resource-policy", "same-origin");
    if (req.headers["if-none-match"] === etag) return reply.code(304).send();
    return reply.type(row.shop_logo_mime).send(row.shop_logo);
  });
  // فونت وزیرمتن برای صفحهٔ مشتری (OFL؛ فقط دو فایل مجاز، بدون مسیر دلخواه)
  const FONTS = { "vazirmatn-400.woff2": "Vazirmatn-Regular.woff2", "vazirmatn-700.woff2": "Vazirmatn-Bold.woff2" };
  const fontCache = new Map();
  app.get("/u/assets/:file", { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } }, async (req, reply) => {
    const real = Object.prototype.hasOwnProperty.call(FONTS, req.params.file) ? FONTS[req.params.file] : null;
    if (!real) throw notFound("پیدا نشد");
    if (!fontCache.has(real)) fontCache.set(real, await fs.promises.readFile(new URL(`../assets/fonts/${real}`, import.meta.url)));
    return reply.header("cache-control", "public, max-age=31536000, immutable").header("x-content-type-options", "nosniff").header("cross-origin-resource-policy", "same-origin").type("font/woff2").send(fontCache.get(real));
  });
  // وضعیت ارسال خود مشتری: رمز = <batchId>.<secret>. بدون رمز درست هیچ‌چیز (حتی وجود ارسال) فاش نمی‌شود.
  app.get("/api/public/upload/:code/status/:token", { config: { rateLimit: { max: 90, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await byCode(req.params.code, { strict: false });
    reply.header("cache-control", "no-store");
    const [bid, secret] = String(req.params.token || "").split(".");
    if (!UUID.test(bid || "") || !/^[0-9a-f]{32}$/.test(secret || "")) throw notFound("پیدا نشد");
    const r = await pool.query("SELECT batch_code, original_name, size, status, deleted_at, secret_hash FROM customer_uploads WHERE cafe_id=$1 AND batch_id=$2 AND derived_from IS NULL ORDER BY created_at, id", [s.cafeId, bid]);
    if (!r.rows.length || !safeEqualHex(r.rows[0].secret_hash, hashSecret(secret))) throw notFound("پیدا نشد");
    return { data: { batchCode: r.rows[0].batch_code, files: r.rows.map((x) => (x.deleted_at ? { name: "", size: 0, status: "removed" } : { name: x.original_name, size: x.size, status: x.status })) } };
  });

  await app.register(async (pub) => {
    await pub.register(multipart, { limits: { fileSize: 100 * 1048576 + 1, files: 30, fields: 6, fieldSize: 2048, parts: 40, headerPairs: 200 } });
    pub.post("/api/public/upload/:code", { config: { rateLimit: { max: cfg.uploadIpPerHour, timeWindow: "1 hour" } } }, async (req, reply) => {
      const s = await byCode(req.params.code);
      if (!req.isMultipart()) throw new HttpError(415, "unsupported_media_type", "ارسال باید به‌صورت فرم فایل باشد");
      const maxBytes = s.maxFileMb * 1048576;
      const declared = Number(req.headers["content-length"] || 0);
      if (declared > s.maxFiles * maxBytes + 1048576) throw new HttpError(413, "payload_too_large", "حجم کل ارسال زیاد است");
      const cafeId = s.cafeId, ih = ipHash(cfg, req.ip);
      // سقف‌ها (پیش از دریافت): فضای کافی‌نت، تعداد فایل در ۲۴ ساعت، تعداد ارسال از یک IP در ساعت
      if ((await usage(pool, cafeId)) + Math.max(declared, 1) > cfg.uploadQuotaMb * 1048576) throw new HttpError(507, "upload_quota", "فضای دریافت فایل این کافی‌نت پر است؛ به کارمند اطلاع دهید");
      const day = await pool.query("SELECT count(*)::int AS n FROM customer_uploads WHERE cafe_id=$1 AND derived_from IS NULL AND created_at > now() - interval '24 hours'", [cafeId]);
      if (day.rows[0].n >= cfg.uploadDailyFiles) throw new HttpError(429, "upload_daily_limit", "سقف دریافت فایل امروز این کافی‌نت پر شده است");
      const hr = await pool.query("SELECT count(DISTINCT batch_id)::int AS n FROM customer_uploads WHERE cafe_id=$1 AND ip_hash=$2 AND created_at > now() - interval '1 hour'", [cafeId, ih]);
      if (hr.rows[0].n >= 15) throw new HttpError(429, "rate_limited", "تعداد ارسال‌ها زیاد است؛ کمی بعد تلاش کنید");

      const { fields, saved, cleanup } = await receive(req, { maxBytes, maxFiles: s.maxFiles, field: "files", textFields: ["name", "phone", "note"] });
      try {
        if (saved.length > s.maxFiles) throw invalid(`حداکثر ${s.maxFiles} فایل در هر ارسال`);
        validateSaved(saved);
        const sender = { name: toText(fields.name, { max: 60, key: "نام" }).trim(), phone: toText(fields.phone, { max: 16, key: "موبایل" }).replace(/[\s-]/g, ""), note: toText(fields.note, { max: 300, key: "توضیح" }).trim() };
        if (s.requirePhone && !/^[0-9۰-۹]{10,13}$/.test(sender.phone)) throw invalid("شمارهٔ موبایل را درست وارد کنید");
        if (sender.phone && !/^[0-9۰-۹+]{6,16}$/.test(sender.phone)) throw invalid("شمارهٔ موبایل نامعتبر است");
        const scan = await scanSaved(saved, cafeId, ih);
        const batchId = crypto.randomUUID(), code = batchCode(), secret = newSecret(), sh = hashSecret(secret);
        const undo = await moveFinal(saved, cafeId);
        try {
          await tx(pool, async (c) => {
            const ss = s.session;
            if (ss) {
              // سطر جلسه قفل می‌شود تا سقف کل فایل‌های QR با ارسال‌های هم‌زمان رد نشود
              const cur = (await c.query("SELECT * FROM upload_sessions WHERE cafe_id=$1 AND id=$2 FOR UPDATE", [cafeId, ss.id])).rows[0];
              if (!cur || cur.closed_at) throw new HttpError(410, "session_closed", "این QR بسته شده است. از کارمند یک QR تازه بگیرید");
              if (new Date(cur.expires_at).getTime() <= Date.now()) throw new HttpError(410, "session_expired", "مهلت این QR تمام شده است. از کارمند یک QR تازه بگیرید");
              const have = (await c.query("SELECT count(*)::int AS n FROM customer_uploads WHERE cafe_id=$1 AND session_id=$2 AND deleted_at IS NULL", [cafeId, ss.id])).rows[0].n;
              if (have + saved.length > cur.max_files) throw bad(`سقف فایل‌های این QR (${cur.max_files} فایل) پر شده است`, "session_full");
            }
            for (const f of saved) await c.query(INSERT, [cafeId, batchId, code, f.name, f.key, MIME_BY_EXT[extOf(f.name)] || "application/octet-stream", f.size, f.hash.digest("hex"), sender.name, sender.phone, sender.note, ih,
              ss?.id || null, ss?.order_ref || "", ss?.order_label || "", ss?.customer_ref || "", ss?.customer_label || "", scan, sh, null, "new"]);
          });
        } catch (e) { await undo(); throw e; }
        reply.code(201);
        return { data: { batchCode: code, count: saved.length, scanned: scan === "clean", statusToken: `${batchId}.${secret}` } };
      } finally { await cleanup(); }
    });
  });

  // ════════ کافی‌نت: تنظیمات ════════
  app.get("/api/uploads/settings", view, async (req) => {
    const s = await settingsFor(pool, req.user.cafeId);
    const pm = await app.perms.forRequest(req), mng = pm.has("upload.manage");
    return { data: { ...shapeSettings(s, await usage(pool, req.user.cafeId)), av: await avInfo(), canManage: mng, canBulkDelete: mng || pm.has("upload.bulk_delete") } };
  });
  app.put("/api/uploads/settings", manage, async (req) => {
    const b = req.body || {};
    const next = {
      enabled: b.enabled === undefined ? undefined : !!b.enabled,
      max_file_mb: b.maxFileMb === undefined ? undefined : clampInt(b.maxFileMb, 20, 1, 100),
      max_files: b.maxFiles === undefined ? undefined : clampInt(b.maxFiles, 10, 1, 30),
      retention_days: b.retentionDays === undefined ? undefined : clampInt(b.retentionDays, 30, 1, 365),
      done_retention_days: b.doneRetentionDays === undefined ? undefined : clampInt(b.doneRetentionDays, 7, 1, 365),
      require_phone: b.requirePhone === undefined ? undefined : !!b.requirePhone,
      notice: b.notice === undefined ? undefined : toText(b.notice, { max: 300, key: "اطلاعیه" }).trim(),
      show_shop_info: b.showShopInfo === undefined ? undefined : !!b.showShopInfo,
      shop_name: b.shopName === undefined ? undefined : oneLine(b.shopName, 80, "نام کافی‌نت"),
      shop_address: b.shopAddress === undefined ? undefined : oneLine(b.shopAddress, 200, "نشانی"),
      shop_phone: b.shopPhone === undefined ? undefined : oneLine(b.shopPhone, 40, "تلفن"),
      shop_mobile: b.shopMobile === undefined ? undefined : oneLine(b.shopMobile, 40, "موبایل"),
    };
    return tx(pool, async (c) => {
      const cur = await settingsFor(c, req.user.cafeId);
      const m = { ...cur }; for (const [k, v] of Object.entries(next)) if (v !== undefined) m[k] = v;
      const r = await c.query("UPDATE upload_settings SET enabled=$2,max_file_mb=$3,max_files=$4,retention_days=$5,require_phone=$6,notice=$7,done_retention_days=$8,show_shop_info=$9,shop_name=$10,shop_address=$11,shop_phone=$12,shop_mobile=$13,updated_at=now() WHERE cafe_id=$1 RETURNING *",
        [req.user.cafeId, m.enabled, m.max_file_mb, m.max_files, m.retention_days, m.require_phone, m.notice, m.done_retention_days, m.show_shop_info, m.shop_name, m.shop_address, m.shop_phone, m.shop_mobile]);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.settings", entity: "upload_settings", entityId: req.user.cafeId, details: { before: { enabled: cur.enabled, maxFileMb: cur.max_file_mb, maxFiles: cur.max_files, retentionDays: cur.retention_days, doneRetentionDays: cur.done_retention_days, requirePhone: cur.require_phone }, after: { enabled: m.enabled, maxFileMb: m.max_file_mb, maxFiles: m.max_files, retentionDays: m.retention_days, doneRetentionDays: m.done_retention_days, requirePhone: m.require_phone } }, ip: req.ip });
      return { data: shapeSettings(r.rows[0], await usage(c, req.user.cafeId)) };
    });
  });
  app.post("/api/uploads/settings/rotate-code", manage, async (req) => tx(pool, async (c) => {
    await settingsFor(c, req.user.cafeId);
    const r = await c.query("UPDATE upload_settings SET code=$2, updated_at=now() WHERE cafe_id=$1 RETURNING *", [req.user.cafeId, await uniqueCode(c)]);
    await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.rotate_code", entity: "upload_settings", entityId: req.user.cafeId, details: {}, ip: req.ip });
    return { data: shapeSettings(r.rows[0], await usage(c, req.user.cafeId)) };
  }));

  // لوگوی کافی‌نت برای صفحهٔ مشتری: JSON {data: base64} تا ۱۵۰ کیلوبایت؛ فقط PNG/JPEG/WEBP (با بررسی بایت‌های ابتدایی؛ SVG عمداً رد می‌شود).
  app.put("/api/uploads/shop-logo", { ...manage, bodyLimit: 300 * 1024 }, async (req) => {
    const b64 = typeof req.body?.data === "string" ? req.body.data.replace(/^data:[^,]*,/, "") : "";
    if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new HttpError(400, "bad_logo", "تصویر لوگو معتبر نیست");
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 150 * 1024) throw new HttpError(413, "logo_too_large", "لوگو باید کمتر از ۱۵۰ کیلوبایت باشد");
    const mime = sniffLogo(buf);
    if (!mime) throw new HttpError(415, "bad_logo_type", "فقط PNG، JPEG یا WEBP پذیرفته می‌شود");
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    return tx(pool, async (c) => {
      await settingsFor(c, req.user.cafeId);
      const r = await c.query("UPDATE upload_settings SET shop_logo=$2, shop_logo_mime=$3, shop_logo_hash=$4, updated_at=now() WHERE cafe_id=$1 RETURNING *", [req.user.cafeId, buf, mime, hash]);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.shop_logo", entity: "upload_settings", entityId: req.user.cafeId, details: { bytes: buf.length, mime }, ip: req.ip });
      return { data: shapeSettings(r.rows[0], await usage(c, req.user.cafeId)) };
    });
  });
  app.delete("/api/uploads/shop-logo", manage, async (req) => tx(pool, async (c) => {
    await settingsFor(c, req.user.cafeId);
    const r = await c.query("UPDATE upload_settings SET shop_logo=NULL, shop_logo_mime=NULL, shop_logo_hash=NULL, updated_at=now() WHERE cafe_id=$1 RETURNING *", [req.user.cafeId]);
    await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.shop_logo_remove", entity: "upload_settings", entityId: req.user.cafeId, details: {}, ip: req.ip });
    return { data: shapeSettings(r.rows[0], await usage(c, req.user.cafeId)) };
  }));

  // ════════ کافی‌نت: QR موقت سفارش/جلسه ════════
  app.post("/api/uploads/sessions", view, async (req, reply) => {
    const b = req.body || {}, cafeId = req.user.cafeId;
    const ttl = clampInt(b.ttlMinutes, 1440, 5, 10080);
    const s = await settingsFor(pool, cafeId);
    if (!s.enabled) throw closed();
    const row = await tx(pool, async (c) => {
      const code = await uniqueCode(c);
      const r = await c.query(`INSERT INTO upload_sessions (cafe_id, code, label, order_ref, order_label, customer_ref, customer_label, max_files, max_file_mb, expires_at, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + make_interval(mins => $10), $11) RETURNING *`,
        [cafeId, code, toText(b.label, { max: 80, key: "عنوان" }).trim(), toText(b.orderRef, { max: 64, key: "سفارش" }).trim(), toText(b.orderLabel, { max: 120, key: "عنوان سفارش" }).trim(),
          toText(b.customerRef, { max: 64, key: "مشتری" }).trim(), toText(b.customerLabel, { max: 120, key: "نام مشتری" }).trim(),
          clampInt(b.maxFiles, 20, 1, 100), b.maxFileMb === undefined || b.maxFileMb === null || b.maxFileMb === "" ? null : clampInt(b.maxFileMb, s.max_file_mb, 1, 100), ttl, req.user.id]);
      await audit(c, { cafeId, userId: req.user.id, action: "upload.session_create", entity: "upload_session", entityId: r.rows[0].id, details: { label: r.rows[0].label, orderRef: r.rows[0].order_ref, ttlMinutes: ttl }, ip: req.ip });
      return r.rows[0];
    });
    reply.code(201);
    return { data: shapeSession(row, 0) };
  });
  app.get("/api/uploads/sessions", view, async (req) => {
    const all = req.query?.all === "1" || req.query?.all === "true";
    const w = all ? "" : "AND ss.closed_at IS NULL AND ss.expires_at > now()";
    const orderRef = req.query?.order ? String(req.query.order).slice(0, 64) : null;
    const p = [req.user.cafeId]; let extra = "";
    if (orderRef) { p.push(orderRef); extra = ` AND ss.order_ref = $${p.length}`; }
    const r = await pool.query(`SELECT ss.*, (SELECT count(*)::int FROM customer_uploads u WHERE u.cafe_id = ss.cafe_id AND u.session_id = ss.id AND u.deleted_at IS NULL) AS n
      FROM upload_sessions ss WHERE ss.cafe_id = $1 ${w}${extra} ORDER BY ss.created_at DESC LIMIT 100`, p);
    return { data: r.rows.map((x) => shapeSession(x, x.n)) };
  });
  app.post("/api/uploads/sessions/:id/close", view, async (req) => {
    if (!UUID.test(req.params.id)) throw notFound("QR پیدا نشد");
    return tx(pool, async (c) => {
      const r = await c.query("UPDATE upload_sessions SET closed_at = COALESCE(closed_at, now()) WHERE cafe_id=$1 AND id=$2 RETURNING *", [req.user.cafeId, req.params.id]);
      if (!r.rows[0]) throw notFound("QR پیدا نشد");
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.session_close", entity: "upload_session", entityId: r.rows[0].id, details: { label: r.rows[0].label }, ip: req.ip });
      return { data: shapeSession(r.rows[0], 0) };
    });
  });

  // ════════ کافی‌نت: خلاصه (نشان منو و اعلان) ════════
  app.get("/api/uploads/summary", view, async (req, reply) => {
    const cafeId = req.user.cafeId;
    const m = await pool.query("SELECT count(*) FILTER (WHERE status='new')::int AS new_count, count(*)::int AS total FROM customer_uploads WHERE cafe_id=$1 AND deleted_at IS NULL", [cafeId]);
    const l = await pool.query(`SELECT batch_id, batch_code, max(sender_name) AS sender_name, max(order_label) AS order_label, count(*)::int AS n, max(created_at) AS at
      FROM customer_uploads WHERE cafe_id=$1 AND deleted_at IS NULL AND status='new' GROUP BY batch_id, batch_code ORDER BY max(created_at) DESC LIMIT 1`, [cafeId]);
    const bl = await pool.query("SELECT count(*)::int AS n FROM upload_blocked WHERE cafe_id=$1 AND created_at > now() - interval '7 days'", [cafeId]);
    reply.header("cache-control", "no-store");
    const x = l.rows[0];
    return { data: { newCount: m.rows[0].new_count, total: m.rows[0].total, blocked7d: bl.rows[0].n, latest: x ? { batchId: x.batch_id, batchCode: x.batch_code, senderName: x.sender_name, orderLabel: x.order_label, count: x.n, at: x.at } : null } };
  });
  app.get("/api/uploads/blocked", view, async (req) => {
    const r = await pool.query("SELECT id, file_name, reason, created_at FROM upload_blocked WHERE cafe_id=$1 ORDER BY created_at DESC LIMIT 30", [req.user.cafeId]);
    return { data: r.rows.map((x) => ({ id: x.id, name: x.file_name, reason: x.reason, at: x.created_at })) };
  });

  // ════════ کافی‌نت: فهرست و مدیریت فایل ════════
  const shape = (r) => ({
    id: r.id, batchId: r.batch_id, batchCode: r.batch_code, name: r.original_name, size: r.size, mime: r.mime, senderName: r.sender_name, senderPhone: r.sender_phone, note: r.note,
    status: r.status, createdAt: r.created_at, statusAt: r.status_at, protected: r.protected, sessionId: r.session_id,
    orderRef: r.order_ref, orderLabel: r.order_label, customerRef: r.customer_ref, customerLabel: r.customer_label, scan: r.scan_status, derivedFrom: r.derived_from,
  });
  app.get("/api/uploads", view, async (req) => {
    const q = req.query || {}, cafeId = req.user.cafeId;
    const limit = clampInt(q.limit, 50, 1, 200), offset = clampInt(q.offset, 0, 0, 1e6);
    const w = ["cafe_id = $1", "deleted_at IS NULL"], p = [cafeId];
    if (q.status) { if (!STATUSES.includes(q.status)) throw invalid("وضعیت نامعتبر است"); p.push(q.status); w.push(`status = $${p.length}`); }
    if (q.session) { if (!UUID.test(String(q.session))) throw invalid("شناسهٔ QR نامعتبر است"); p.push(q.session); w.push(`session_id = $${p.length}`); }
    if (q.order) { p.push(String(q.order).slice(0, 64)); w.push(`order_ref = $${p.length}`); }
    if (q.customer) { p.push(String(q.customer).slice(0, 64)); w.push(`customer_ref = $${p.length}`); }
    if (q.batch) { if (!UUID.test(String(q.batch))) throw invalid("شناسهٔ ارسال نامعتبر است"); p.push(q.batch); w.push(`batch_id = $${p.length}`); }
    if (q.unlinked === "1") w.push("order_ref = '' AND customer_ref = ''");
    if (q.protected === "1") w.push("protected");
    if (q.q) {
      const t = String(q.q).slice(0, 60); p.push(t.replace(/[\\%_]/g, "\\$&")); const i = p.length;
      w.push(`(batch_code = $${i} OR original_name ILIKE '%' || $${i} || '%' OR sender_name ILIKE '%' || $${i} || '%' OR sender_phone LIKE '%' || $${i} || '%' OR order_label ILIKE '%' || $${i} || '%' OR customer_label ILIKE '%' || $${i} || '%')`);
    }
    const sortKey = q.sort === undefined ? "created" : q.sort;
    if (!SORTS[sortKey]) throw invalid("مرتب‌سازی نامعتبر است");
    const dir = q.dir === "asc" ? "ASC" : "DESC";
    const rows = await pool.query(`SELECT * FROM customer_uploads WHERE ${w.join(" AND ")} ORDER BY ${SORTS[sortKey]} ${dir}, created_at DESC, id LIMIT ${limit} OFFSET ${offset}`, p);
    const meta = await pool.query("SELECT count(*) FILTER (WHERE status='new')::int AS new_count, count(*)::int AS total FROM customer_uploads WHERE cafe_id=$1 AND deleted_at IS NULL", [cafeId]);
    const filtered = await pool.query(`SELECT count(*)::int AS n FROM customer_uploads WHERE ${w.join(" AND ")}`, p);
    return { data: rows.rows.map(shape), meta: { newCount: meta.rows[0].new_count, total: meta.rows[0].total, matched: filtered.rows[0].n, limit, offset } };
  });
  const load = async (req) => {
    if (!UUID.test(req.params.id)) throw notFound("فایل پیدا نشد");
    const r = await pool.query("SELECT * FROM customer_uploads WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL", [req.user.cafeId, req.params.id]);
    if (!r.rows[0]) throw notFound("فایل پیدا نشد");
    return r.rows[0];
  };
  app.get("/api/uploads/:id/download", view, async (req, reply) => {
    const u = await load(req);
    const p = pathForKey(cfg, u.storage_key);
    let st; try { st = await fs.promises.stat(p); } catch { throw new HttpError(410, "file_gone", "فایل از روی سرور حذف شده است"); }
    if (u.status === "new") await pool.query("UPDATE customer_uploads SET status='seen', status_at=now(), status_by=$3 WHERE cafe_id=$1 AND id=$2 AND status='new'", [req.user.cafeId, u.id, req.user.id]);
    const fname = u.original_name.replace(/[^\x20-\x7e]/g, "_").replace(/["\;]/g, "_");
    return reply.header("content-type", "application/octet-stream").header("content-length", st.size)
      .header("content-disposition", `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(u.original_name)}`)
      .header("x-content-type-options", "nosniff").header("cache-control", "private, no-store").send(fs.createReadStream(p));
  });
  // وضعیت، تغییر نام و «نگه‌داری ویژه» در یک مسیر (هر کدام که در بدنه باشد)
  app.patch("/api/uploads/:id", view, async (req) => {
    const b = req.body || {};
    if (b.status === undefined && b.name === undefined && b.protected === undefined) throw invalid("چیزی برای تغییر ارسال نشده است");
    if (b.status !== undefined && !STATUSES.includes(b.status)) throw invalid("وضعیت نامعتبر است");
    const u = await load(req);
    return tx(pool, async (c) => {
      const sets = [], p = [req.user.cafeId, u.id]; const add = (col, v) => { p.push(v); sets.push(`${col}=$${p.length}`); };
      if (b.status !== undefined) { add("status", b.status); sets.push("status_at=now()"); add("status_by", req.user.id); }
      if (b.protected !== undefined) add("protected", !!b.protected);
      let renamed = null;
      if (b.name !== undefined) {
        const r = renameKeepExt(b.name, u.original_name);
        if (r.error === "empty") throw invalid("نام فایل خالی است");
        if (r.error === "ext_changed") throw invalid("پسوند فایل را نمی‌توان تغییر داد");
        if (r.name !== u.original_name) { add("original_name", r.name); renamed = r.name; }
      }
      if (!sets.length) return { data: shape(u) };
      const r = await c.query(`UPDATE customer_uploads SET ${sets.join(",")} WHERE cafe_id=$1 AND id=$2 RETURNING *`, p);
      if (renamed) await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.rename", entity: "customer_upload", entityId: u.id, details: { from: u.original_name, to: renamed }, ip: req.ip });
      if (b.protected !== undefined && !!b.protected !== u.protected) await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: b.protected ? "upload.protect" : "upload.unprotect", entity: "customer_upload", entityId: u.id, details: { name: u.original_name }, ip: req.ip });
      return { data: shape(r.rows[0]) };
    });
  });
  const removeRows = async (c, rows, req) => {
    for (const u of rows) {
      await fs.promises.rm(pathForKey(cfg, u.storage_key), { force: true });
      await c.query("UPDATE customer_uploads SET deleted_at=now(), original_name='', note='' WHERE cafe_id=$1 AND id=$2", [req.user.cafeId, u.id]);
    }
  };
  app.delete("/api/uploads/:id", view, async (req) => {
    const u = await load(req);
    if (u.protected && !(await app.perms.forRequest(req)).has("upload.manage")) throw new HttpError(403, "forbidden", "این فایل در «نگه‌داری ویژه» است؛ حذف آن فقط با مجوز مدیریت ممکن است");
    await tx(pool, async (c) => {
      await removeRows(c, [u], req);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.delete", entity: "customer_upload", entityId: u.id, details: { name: u.original_name, size: u.size, batchCode: u.batch_code }, ip: req.ip });
    });
    return { data: { ok: true } };
  });
  // حذف گروهی: نیازمند مجوز upload.bulk_delete؛ فایل‌های «نگه‌داری ویژه» حذف نمی‌شوند و در skipped برمی‌گردند
  app.post("/api/uploads/bulk-delete", bulkDel, async (req) => {
    const list = ids(req.body?.ids);
    return tx(pool, async (c) => {
      const rows = (await c.query("SELECT * FROM customer_uploads WHERE cafe_id=$1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL FOR UPDATE", [req.user.cafeId, list])).rows;
      const del = rows.filter((x) => !x.protected), skipped = rows.filter((x) => x.protected).map((x) => x.id);
      await removeRows(c, del, req);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.bulk_delete", entity: "customer_upload", entityId: null, details: { count: del.length, skippedProtected: skipped.length, ids: del.map((x) => x.id), names: del.map((x) => x.original_name).slice(0, 50), size: del.reduce((a, x) => a + x.size, 0) }, ip: req.ip });
      return { data: { deleted: del.length, skipped, notFound: list.length - rows.length } };
    });
  });
  app.post("/api/uploads/bulk-status", view, async (req) => {
    const list = ids(req.body?.ids); const st = req.body?.status;
    if (!STATUSES.includes(st)) throw invalid("وضعیت نامعتبر است");
    const r = await pool.query("UPDATE customer_uploads SET status=$3, status_at=now(), status_by=$4 WHERE cafe_id=$1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL", [req.user.cafeId, list, st, req.user.id]);
    return { data: { updated: r.rowCount } };
  });
  // اتصال فایل‌ها (یا کل یک ارسال) به سفارش/مشتری؛ همهٔ فیلدها خالی = رفع اتصال
  app.post("/api/uploads/link", view, async (req) => {
    const b = req.body || {};
    const rec = { orderRef: toText(b.orderRef, { max: 64, key: "سفارش" }).trim(), orderLabel: toText(b.orderLabel, { max: 120, key: "عنوان سفارش" }).trim(), customerRef: toText(b.customerRef, { max: 64, key: "مشتری" }).trim(), customerLabel: toText(b.customerLabel, { max: 120, key: "نام مشتری" }).trim() };
    let where, p = [req.user.cafeId, rec.orderRef, rec.orderLabel, rec.customerRef, rec.customerLabel];
    if (b.batchId) { if (!UUID.test(String(b.batchId))) throw invalid("شناسهٔ ارسال نامعتبر است"); p.push(b.batchId); where = `batch_id = $6`; }
    else { p.push(ids(b.ids)); where = `id = ANY($6::uuid[])`; }
    return tx(pool, async (c) => {
      const r = await c.query(`UPDATE customer_uploads SET order_ref=$2, order_label=$3, customer_ref=$4, customer_label=$5 WHERE cafe_id=$1 AND ${where} AND deleted_at IS NULL`, p);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "upload.link", entity: "customer_upload", entityId: null, details: { count: r.rowCount, ...rec, batchId: b.batchId || null }, ip: req.ip });
      return { data: { updated: r.rowCount } };
    });
  });

  // ساخت فایل جدید از نتیجهٔ ابزارهای PDF (ادغام، جداسازی، فشرده‌سازی …): همان ارسال/سفارش/مشتری فایل مبدأ، وضعیت «دیده‌شده»؛ اسکن ضدویروس هم اجرا می‌شود
  await app.register(async (st) => {
    await st.register(multipart, { limits: { fileSize: 100 * 1048576 + 1, files: 1, fields: 3, fieldSize: 2048, parts: 6, headerPairs: 100 } });
    st.post("/api/uploads/derive", view, async (req, reply) => {
      if (!req.isMultipart()) throw new HttpError(415, "unsupported_media_type", "ارسال باید به‌صورت فرم فایل باشد");
      const cafeId = req.user.cafeId;
      const { fields, saved, cleanup } = await receive(req, { maxBytes: 100 * 1048576, maxFiles: 1, field: "file", textFields: ["from", "name"] });
      try {
        validateSaved(saved);
        if (!UUID.test(fields.from || "")) throw invalid("فایل مبدأ مشخص نیست");
        const src = (await pool.query("SELECT * FROM customer_uploads WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL", [cafeId, fields.from])).rows[0];
        if (!src) throw notFound("فایل مبدأ پیدا نشد");
        const f = saved[0];
        if (fields.name) { const n = sanitizeName(fields.name); if (n !== "file" && checkFile(n, f.head) === null) f.name = n; }
        if ((await usage(pool, cafeId)) + f.size > cfg.uploadQuotaMb * 1048576) throw new HttpError(507, "upload_quota", "فضای دریافت فایل این کافی‌نت پر است");
        const scan = await scanSaved(saved, cafeId, ipHash(cfg, req.ip));
        const undo = await moveFinal(saved, cafeId);
        let row;
        try {
          row = await tx(pool, async (c) => {
            const r = await c.query(`${INSERT} RETURNING *`, [cafeId, src.batch_id, src.batch_code, f.name, f.key, MIME_BY_EXT[extOf(f.name)] || "application/octet-stream", f.size, f.hash.digest("hex"), src.sender_name, src.sender_phone, src.note, "",
              src.session_id, src.order_ref, src.order_label, src.customer_ref, src.customer_label, scan, "", src.id, "seen"]);
            await audit(c, { cafeId, userId: req.user.id, action: "upload.derive", entity: "customer_upload", entityId: r.rows[0].id, details: { from: src.id, name: f.name, size: f.size }, ip: req.ip });
            return r.rows[0];
          });
        } catch (e) { await undo(); throw e; }
        reply.code(201);
        return { data: shape(row) };
      } finally { await cleanup(); }
    });
  });
}
