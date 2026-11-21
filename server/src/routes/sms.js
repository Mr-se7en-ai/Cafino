// پیامک به مشتریان با پنل ملی پیامکِ خود هر کافی‌نت (تنظیمات ← اتصال ← پیامک).
//   GET    /api/sms            وضعیت اتصال (بدون رمز)           [sms.send | sms.manage]
//   PUT    /api/sms            اتصال/تعویض (نام کاربری، رمز، خط)  [sms.manage] — قبل از ذخیره با GetCredit بررسی می‌شود
//   PATCH  /api/sms            روشن/خاموش یا تغییر خط            [sms.manage]
//   DELETE /api/sms            حذف اتصال و رمز ذخیره‌شده         [sms.manage]
//   GET    /api/sms/credit     اعتبار پنل                        [sms.send | sms.manage]
//   POST   /api/sms/test       پیام آزمایشی به یک شماره          [sms.manage]
//   POST   /api/sms/send       ارسال به فهرست گیرندگان (تا ۳۰۰)    [sms.send]
//   GET    /api/sms/messages   سابقهٔ ارسال                      [sms.send | sms.manage]
// رمز پنل با AES-256-GCM رمزنگاری می‌شود (AAD = کافی‌نت) و هرگز به برنامه یا لاگ برنمی‌گردد.
import crypto from "node:crypto";
import { audit } from "../lib/audit.js";
import { tx } from "../db.js";
import { decryptToken, encryptToken } from "../lib/bots.js";
import { HttpError, conflict, invalid, notFound } from "../lib/errors.js";
import { SmsError, createMeliClient, normalizeMobile, smsParts } from "../lib/sms.js";
import { clampInt, toText } from "../lib/validate.js";

const MAX_RECIPIENTS = 300, MAX_TEXT = 500, CONCURRENCY = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FROM_RE = /^\+?\d{3,20}$/;
const cleanText = (t) => String(t ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‎‏‪-‮]/g, "").replace(/\r\n?/g, "\n").trim();
const hint = (u) => (u.length <= 2 ? "*".repeat(u.length) : `${u.slice(0, 2)}${"*".repeat(Math.min(6, u.length - 2))}`);

export async function registerSms(app, { client = createMeliClient(app.cfg) } = {}) {
  const { pool, cfg } = app;
  const rate = (max) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });
  const view = app.requirePerm("sms.send", "sms.manage");
  const manage = app.requirePerm("sms.manage");
  const send = app.requirePerm("sms.send");

  const creds = (row, cafeId) => ({ username: decryptToken(cfg, row.username_enc, `sms:${cafeId}:u`), password: decryptToken(cfg, row.password_enc, `sms:${cafeId}:p`) });
  async function connOf(cafeId, { needEnabled = false } = {}) {
    const row = (await pool.query("SELECT * FROM sms_connections WHERE cafe_id=$1", [cafeId])).rows[0];
    if (!row) throw new HttpError(409, "sms_not_connected", "پنل ملی پیامک هنوز متصل نشده است (تنظیمات ← اتصال ← پیامک)");
    if (needEnabled && !row.enabled) throw new HttpError(409, "sms_disabled", "ارسال پیامک خاموش است");
    return row;
  }
  const mark = (cafeId, err) => pool.query(err
    ? "UPDATE sms_connections SET last_error=$2, last_error_at=now(), updated_at=now() WHERE cafe_id=$1"
    : "UPDATE sms_connections SET last_ok_at=now(), last_error=NULL, last_error_at=NULL, updated_at=now() WHERE cafe_id=$1", err ? [cafeId, String(err).slice(0, 300)] : [cafeId]).catch(() => {});
  const fail = (e) => { if (e instanceof SmsError) throw new HttpError(e.status === 422 ? 422 : 502, `sms_${e.code}`, e.message); throw e; };
  const status = (row) => row
    ? { connected: true, enabled: row.enabled, usernameHint: row.username_hint, from: row.from_number, lastOkAt: row.last_ok_at, lastError: row.last_error, lastErrorAt: row.last_error_at }
    : { connected: false, enabled: false, usernameHint: "", from: "", lastOkAt: null, lastError: null, lastErrorAt: null };

  app.get("/api/sms", { preHandler: view }, async (req) => ({ data: status((await pool.query("SELECT * FROM sms_connections WHERE cafe_id=$1", [req.user.cafeId])).rows[0]) }));

  app.put("/api/sms", { preHandler: manage, ...rate(10) }, async (req) => {
    const b = req.body || {}, cafeId = req.user.cafeId;
    const username = toText(b.username, { max: 64, key: "username" }), password = String(b.password ?? "");
    const from = String(b.from ?? "").replace(/\s/g, "");
    if (!username) throw invalid("نام کاربری پنل ملی پیامک را وارد کنید");
    if (!password || password.length > 128) throw invalid("رمز پنل ملی پیامک را وارد کنید");
    if (!FROM_RE.test(from)) throw invalid("شمارهٔ خط ارسال معتبر نیست (فقط ارقام، مثلاً 3000xxxx یا 5000xxxx)");
    try { await client.credit({ username, password }); }
    catch (e) { if (e instanceof SmsError && e.code === "bad_credentials") throw new HttpError(422, "sms_bad_credentials", e.message); fail(e); }
    await tx(pool, async (c) => {
      await c.query(
        `INSERT INTO sms_connections(cafe_id,username_enc,password_enc,username_hint,from_number,enabled,last_ok_at)
         VALUES ($1,$2,$3,$4,$5,true,now())
         ON CONFLICT (cafe_id) DO UPDATE SET username_enc=EXCLUDED.username_enc, password_enc=EXCLUDED.password_enc, username_hint=EXCLUDED.username_hint,
           from_number=EXCLUDED.from_number, enabled=true, last_ok_at=now(), last_error=NULL, last_error_at=NULL, updated_at=now()`,
        [cafeId, encryptToken(cfg, username, `sms:${cafeId}:u`), encryptToken(cfg, password, `sms:${cafeId}:p`), hint(username), from]);
      await audit(c, { cafeId, userId: req.user.id, action: "sms.connect", entity: "sms_connection", entityId: cafeId, details: { from }, ip: req.ip });
    });
    return { data: status((await pool.query("SELECT * FROM sms_connections WHERE cafe_id=$1", [cafeId])).rows[0]) };
  });

  app.patch("/api/sms", { preHandler: manage }, async (req) => {
    const cafeId = req.user.cafeId, b = req.body || {};
    await connOf(cafeId);
    const sets = [], vals = [cafeId];
    if (typeof b.enabled === "boolean") { vals.push(b.enabled); sets.push(`enabled=$${vals.length}`); }
    if (b.from !== undefined) { const from = String(b.from).replace(/\s/g, ""); if (!FROM_RE.test(from)) throw invalid("شمارهٔ خط ارسال معتبر نیست"); vals.push(from); sets.push(`from_number=$${vals.length}`); }
    if (!sets.length) throw invalid("چیزی برای تغییر نیست");
    await tx(pool, async (c) => {
      await c.query(`UPDATE sms_connections SET ${sets.join(", ")}, updated_at=now() WHERE cafe_id=$1`, vals);
      await audit(c, { cafeId, userId: req.user.id, action: "sms.update", entity: "sms_connection", entityId: cafeId, details: { enabled: b.enabled, from: b.from }, ip: req.ip });
    });
    return { data: status((await pool.query("SELECT * FROM sms_connections WHERE cafe_id=$1", [cafeId])).rows[0]) };
  });

  app.delete("/api/sms", { preHandler: manage }, async (req, reply) => {
    const cafeId = req.user.cafeId;
    await tx(pool, async (c) => {
      const r = await c.query("DELETE FROM sms_connections WHERE cafe_id=$1", [cafeId]);
      if (r.rowCount) await audit(c, { cafeId, userId: req.user.id, action: "sms.disconnect", entity: "sms_connection", entityId: cafeId, ip: req.ip });
    });
    return reply.code(204).send();
  });

  app.get("/api/sms/credit", { preHandler: view, ...rate(20) }, async (req) => {
    const cafeId = req.user.cafeId, row = await connOf(cafeId);
    try { const credit = await client.credit(creds(row, cafeId)); await mark(cafeId); return { data: { credit } }; }
    catch (e) { await mark(cafeId, e?.message); fail(e); }
  });

  // ثبت یک پیام در سابقه (خطا در ثبت هرگز ارسال را خراب نمی‌کند)
  const logMsg = (cafeId, userId, m) => pool.query(
    "INSERT INTO sms_messages(cafe_id,user_id,batch_id,kind,customer_ref,name,phone,body,parts,status,provider_ref,error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    [cafeId, userId, m.batchId || null, m.kind, m.ref || null, m.name || null, m.phone, m.body, smsParts(m.body), m.status, m.providerRef || null, m.error ? String(m.error).slice(0, 300) : null]).catch((e) => app.log.error({ err: e }, "sms log failed"));

  app.post("/api/sms/test", { preHandler: manage, ...rate(5) }, async (req) => {
    const cafeId = req.user.cafeId, row = await connOf(cafeId, { needEnabled: true });
    const to = normalizeMobile(req.body?.to);
    if (!to) throw invalid("شمارهٔ موبایل معتبر نیست");
    const body = "این یک پیام آزمایشی از کافینو است.";
    try {
      const ref = await client.send({ ...creds(row, cafeId), from: row.from_number, to, text: body });
      await mark(cafeId); await logMsg(cafeId, req.user.id, { kind: "test", phone: to, body, status: "sent", providerRef: ref });
      return { data: { ok: true, to } };
    } catch (e) { await mark(cafeId, e?.message); await logMsg(cafeId, req.user.id, { kind: "test", phone: to, body, status: "failed", error: e?.message }); fail(e); }
  });

  app.post("/api/sms/send", { preHandler: send, ...rate(30) }, async (req) => {
    const cafeId = req.user.cafeId, b = req.body || {};
    const template = cleanText(b.text);
    if (!template) throw invalid("متن پیام را وارد کنید");
    if ([...template].length > MAX_TEXT) throw invalid(`متن پیام حداکثر ${MAX_TEXT} نویسه است`);
    if (!Array.isArray(b.recipients) || !b.recipients.length) throw invalid("گیرنده‌ای انتخاب نشده است");
    if (b.recipients.length > MAX_RECIPIENTS) throw invalid(`در هر ارسال حداکثر ${MAX_RECIPIENTS} گیرنده مجاز است`);
    const batchId = b.batchId === undefined ? crypto.randomUUID() : String(b.batchId);
    if (!UUID.test(batchId)) throw invalid("batchId باید UUID باشد");
    const row = await connOf(cafeId, { needEnabled: true });
    if ((await pool.query("SELECT 1 FROM sms_messages WHERE cafe_id=$1 AND batch_id=$2 LIMIT 1", [cafeId, batchId])).rows[0]) throw conflict("این ارسال قبلاً انجام شده است", "duplicate_batch");

    const seen = new Set(), todo = [], skipped = [];
    for (const r of b.recipients) {
      const name = toText(r?.name, { max: 100, key: "name" }), ref = toText(r?.ref ?? r?.customerId, { max: 64, key: "ref" });
      const phone = normalizeMobile(r?.phone);
      if (!phone) { skipped.push({ name, phone: String(r?.phone ?? "").slice(0, 20), reason: "شمارهٔ موبایل معتبر نیست" }); continue; }
      if (seen.has(phone)) { skipped.push({ name, phone, reason: "شمارهٔ تکراری" }); continue; }
      seen.add(phone);
      const body = cleanText(template.replace(/\{(?:نام|name)\}/g, name || "مشتری گرامی"));
      todo.push({ phone, name, ref, body });
    }
    if (!todo.length) throw invalid("هیچ شمارهٔ معتبری در فهرست نیست", { skipped });

    const auth = creds(row, cafeId), results = new Array(todo.length);
    let next = 0, fatal = null;
    const worker = async () => {
      for (;;) {
        const i = next++; if (i >= todo.length) return;
        const m = todo[i];
        if (fatal) { results[i] = { ...m, status: "failed", error: fatal }; await logMsg(cafeId, req.user.id, { ...m, batchId, kind: "customer", status: "failed", error: fatal }); continue; }
        try {
          const ref = await client.send({ ...auth, from: row.from_number, to: m.phone, text: m.body });
          results[i] = { ...m, status: "sent", providerRef: ref };
          await logMsg(cafeId, req.user.id, { ...m, batchId, kind: "customer", status: "sent", providerRef: ref });
        } catch (e) {
          const msg = e instanceof SmsError ? e.message : "ارسال ناموفق بود";
          if (e instanceof SmsError && e.fatal) fatal = msg;          // اعتبار/اعتبارنامه/خط: ادامه‌دادن بی‌فایده است
          results[i] = { ...m, status: "failed", error: msg };
          await logMsg(cafeId, req.user.id, { ...m, batchId, kind: "customer", status: "failed", error: msg });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    const sent = results.filter((r) => r.status === "sent").length, failed = results.length - sent;
    await mark(cafeId, sent === 0 && failed ? (fatal || results.find((r) => r.error)?.error) : null);
    await tx(pool, (c) => audit(c, { cafeId, userId: req.user.id, action: "sms.send", entity: "sms_batch", entityId: batchId, details: { sent, failed, skipped: skipped.length, chars: [...template].length }, ip: req.ip })).catch(() => {});
    return { data: { batchId, total: todo.length, sent, failed, skipped, stopped: Boolean(fatal), results: results.map((r) => ({ phone: r.phone, name: r.name, ref: r.ref, status: r.status, error: r.error || null })) } };
  });

  app.get("/api/sms/messages", { preHandler: view }, async (req) => {
    const cafeId = req.user.cafeId, q = req.query || {};
    const vals = [cafeId], where = ["cafe_id=$1"];
    if (q.customerRef) { vals.push(String(q.customerRef).slice(0, 64)); where.push(`customer_ref=$${vals.length}`); }
    if (q.batchId) { if (!UUID.test(String(q.batchId))) throw invalid("batchId نامعتبر است"); vals.push(q.batchId); where.push(`batch_id=$${vals.length}`); }
    vals.push(clampInt(q.limit, 50, 1, 200));
    const { rows } = await pool.query(`SELECT id, batch_id, kind, customer_ref, name, phone, body, parts, status, error, created_at FROM sms_messages WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${vals.length}`, vals);
    return { data: rows.map((r) => ({ id: r.id, batchId: r.batch_id, kind: r.kind, customerRef: r.customer_ref, name: r.name, phone: r.phone, body: r.body, parts: r.parts, status: r.status, error: r.error, createdAt: r.created_at })) };
  });
  void notFound;
}
