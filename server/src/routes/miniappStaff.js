// مینی‌اپ تلگرام — بخش کافی‌نت و درخواست مشتری (1.81). ثبت‌شده از داخل registerMiniapp (از همان نشست و ابزارها).
//  اتصال (برنامه، ورود):   POST /api/miniapp/staff-codes (کد یک‌بارمصرف ۱۰ دقیقه‌ای برای خود کاربر) · GET /api/miniapp/staff-links · DELETE /api/miniapp/staff-links/:userId · PATCH …/:userId {notify}
//  اتصال (مینی‌اپ):       POST /api/miniapp/staff/link {code} · DELETE /api/miniapp/staff/link · GET /api/miniapp/staff/me
//  کافی‌نت (مینی‌اپ):     GET staff/home · staff/orders · staff/uploads · staff/requests  |  POST staff/orders/:id/status · staff/uploads/:batch/status · staff/requests/:id/status
//  مشتری (مینی‌اپ):       POST /api/miniapp/requests {service, note} · GET /api/miniapp/requests
//  برنامه (ورود):          GET /api/miniapp/requests-admin · POST /api/miniapp/requests-admin/:id (پذیرش/رد/انجام) · GET /api/miniapp/order-actions · POST /api/miniapp/order-actions/ack
// امنیت: هویت کافی‌نت = حساب تلگرام امضاشده + اتصال ثبت‌شده با کدی که فقط کاربر واردشده می‌سازد؛ مجوزها در هر درخواست از پایگاه‌داده و سیاست مجوز کافی‌نت تازه می‌شود (غیرفعال‌شدن کاربر فوراً اثر دارد).
import crypto from "node:crypto";
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { HttpError, forbidden, invalid, notFound } from "../lib/errors.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => { const b = crypto.randomBytes(8); return [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join(""); };
const normCode = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z2-9]/g, "");
const hashCode = (c) => crypto.createHash("sha256").update(`miniapp-staff:${c}`).digest("hex");
const ORDER_STATUS = ["new", "inprogress", "waiting_docs", "completed", "delivered"];
const UP_STATUS = ["new", "seen", "printed", "done"];
const REQ_STATUS = ["accepted", "rejected", "done"];
const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const fullName = (r) => [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim();
const ROLE_FA = { owner: "مالک", manager: "مدیر", staff: "کارمند" };

export function registerMiniappStaff(app, bot, h) {
  const { pool, cfg } = app;
  const { session, mini, ok, needCafe, linkOf, phoneOf, CAFE_SQL, cafeView, usable } = h;

  // ── ورود کافی‌نت در مینی‌اپ: نشست تلگرام + اتصال + کاربر فعال + مجوزها (هر درخواست تازه) ──
  async function staffCtx(req, { optional = false } = {}) {
    const r = (await pool.query(
      `SELECT l.cafe_id, l.user_id, l.notify, u.first_name, u.last_name, u.role, u.is_active, u.cafe_id AS user_cafe, c.name AS cafe_name, c.status AS cafe_status, s.shop_name
       FROM telegram_staff_links l JOIN users u ON u.id=l.user_id JOIN cafes c ON c.id=l.cafe_id LEFT JOIN upload_settings s ON s.cafe_id=l.cafe_id
       WHERE l.telegram_id=$1 ORDER BY l.linked_at DESC LIMIT 1`, [req.mini.tg.telegram_id])).rows[0];
    if (!r || !r.is_active || r.cafe_status !== "active" || String(r.user_cafe) !== String(r.cafe_id)) {
      if (optional) return null;
      throw forbidden("حساب تلگرام شما به کافی‌نت وصل نیست (یا کاربر غیرفعال شده است)", "not_staff");
    }
    const perms = await app.perms.forUser({ id: r.user_id, role: r.role, cafeId: r.cafe_id });
    return { cafeId: r.cafe_id, userId: r.user_id, role: r.role, name: fullName(r) || ROLE_FA[r.role] || "کاربر", notify: r.notify, cafeName: r.shop_name || r.cafe_name, can: (k) => perms.has(k) };
  }
  const staffPre = async (req) => { await session(req); req.staff = await staffCtx(req); };
  const staff = { preHandler: [staffPre], config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
  const staffInfo = (s) => ({ name: s.name, role: s.role, roleLabel: ROLE_FA[s.role] || s.role, cafeName: s.cafeName, notify: s.notify, canUploads: s.can("upload.view") || s.can("upload.manage"), canMoney: s.can("report.financial") });

  /** برای /auth: آیا این حساب تلگرام کافی‌نتی است؟ */
  h.staffOf = async (telegramId) => { const fake = { mini: { tg: { telegram_id: telegramId } } }; const s = await staffCtx(fake, { optional: true }); return s ? staffInfo(s) : null; };

  // ── اتصال: ساخت کد در برنامه ──
  const login = { preHandler: [app.requireCafe()] };
  app.post("/api/miniapp/staff-codes", { ...login, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req) => {
    if (!bot.enabled()) throw new HttpError(503, "miniapp_disabled", "مینی‌اپ در این سرور فعال نیست");
    const code = makeCode(), expires = new Date(Date.now() + 10 * 60 * 1000);
    await tx(pool, async (c) => {
      await c.query("UPDATE miniapp_staff_codes SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", [req.user.id]);          // فقط آخرین کد معتبر است
      await c.query("INSERT INTO miniapp_staff_codes (cafe_id,user_id,code_hash,expires_at) VALUES ($1,$2,$3,$4)", [req.user.cafeId, req.user.id, hashCode(code), expires]);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "miniapp.staff_code", entity: "miniapp", ip: req.ip });
    });
    return { data: { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: expires.toISOString(), botUsername: bot.info()?.username || "" } };
  });
  const canManageUsers = async (req) => (await app.perms.forRequest(req)).has("users.manage");
  app.get("/api/miniapp/staff-links", login, async (req) => {
    const all = await canManageUsers(req);
    const r = await pool.query(
      `SELECT l.user_id, l.notify, l.linked_at, u.first_name, u.last_name, u.role, t.username, t.first_name AS tg_name, (t.chat_id IS NOT NULL) AS can_message
       FROM telegram_staff_links l JOIN users u ON u.id=l.user_id JOIN telegram_users t ON t.telegram_id=l.telegram_id WHERE l.cafe_id=$1 AND ($2 OR l.user_id=$3) ORDER BY l.linked_at`, [req.user.cafeId, all, req.user.id]);
    return { data: { items: r.rows.map((x) => ({ userId: x.user_id, name: fullName(x) || ROLE_FA[x.role], role: x.role, roleLabel: ROLE_FA[x.role], notify: x.notify, linkedAt: iso(x.linked_at), telegram: x.username ? `@${x.username}` : x.tg_name, canMessage: x.can_message, mine: x.user_id === req.user.id })), canManageAll: all } };
  });
  const guardTarget = async (req) => { if (req.params.userId !== req.user.id && !(await canManageUsers(req))) throw forbidden("فقط مدیر یا خود کاربر", "permission_denied"); };
  app.delete("/api/miniapp/staff-links/:userId", login, async (req) => {
    await guardTarget(req);
    const r = await pool.query("DELETE FROM telegram_staff_links WHERE cafe_id=$1 AND user_id=$2", [req.user.cafeId, req.params.userId]);
    if (r.rowCount) await tx(pool, (c) => audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "miniapp.staff_unlink", entity: "user", entityId: req.params.userId, ip: req.ip }));
    return { data: { removed: r.rowCount } };
  });
  app.patch("/api/miniapp/staff-links/:userId", login, async (req) => {
    await guardTarget(req);
    if (typeof req.body?.notify !== "boolean") throw invalid("مقدار «notify» باید بله/خیر باشد");
    const r = await pool.query("UPDATE telegram_staff_links SET notify=$3 WHERE cafe_id=$1 AND user_id=$2", [req.user.cafeId, req.params.userId, req.body.notify]);
    return { data: { updated: r.rowCount } };
  });

  // ── اتصال: وارد کردن کد در مینی‌اپ ──
  app.post("/api/miniapp/staff/link", { preHandler: [session], config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const code = normCode(req.body?.code);
    if (code.length !== 8) throw invalid("کد اتصال ۸ حرفی است (مثل ABCD-2345)");
    const tg = Number(req.mini.tg.telegram_id);
    const res = await tx(pool, async (c) => {
      const row = (await c.query("SELECT k.*, u.is_active, u.cafe_id AS user_cafe, u.first_name, u.last_name, u.role FROM miniapp_staff_codes k JOIN users u ON u.id=k.user_id WHERE k.code_hash=$1 FOR UPDATE OF k", [hashCode(code)])).rows[0];
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now() || !row.is_active || String(row.user_cafe) !== String(row.cafe_id)) return null;
      await c.query("UPDATE miniapp_staff_codes SET used_at=now() WHERE id=$1", [row.id]);
      await c.query("DELETE FROM telegram_staff_links WHERE user_id=$1 OR (cafe_id=$2 AND telegram_id=$3)", [row.user_id, row.cafe_id, tg]);
      await c.query("INSERT INTO telegram_staff_links (cafe_id, telegram_id, user_id) VALUES ($1,$2,$3)", [row.cafe_id, tg, row.user_id]);
      await audit(c, { cafeId: row.cafe_id, userId: row.user_id, action: "miniapp.staff_link", entity: "user", entityId: row.user_id, details: { telegramId: tg }, ip: req.ip });
      return row;
    });
    if (!res) throw new HttpError(400, "bad_code", "کد اتصال نامعتبر یا منقضی است؛ در برنامه کد تازه بسازید");
    req.staff = await staffCtx(req);
    return ok(reply, { staff: staffInfo(req.staff) });
  });
  app.delete("/api/miniapp/staff/link", staff, async (req, reply) => { await pool.query("DELETE FROM telegram_staff_links WHERE telegram_id=$1", [req.mini.tg.telegram_id]); return ok(reply, { staff: null }); });
  app.patch("/api/miniapp/staff/me", staff, async (req, reply) => {
    if (typeof req.body?.notify !== "boolean") throw invalid("مقدار «notify» باید بله/خیر باشد");
    await pool.query("UPDATE telegram_staff_links SET notify=$2 WHERE telegram_id=$1", [req.mini.tg.telegram_id, req.body.notify]);
    return ok(reply, { notify: req.body.notify, canMessage: !!req.mini.tg.chat_id });
  });
  app.get("/api/miniapp/staff/me", staff, async (req, reply) => ok(reply, { staff: staffInfo(req.staff), canMessage: !!req.mini.tg.chat_id, botUsername: bot.info()?.username || "" }));

  // ── کافی‌نت: خانه / سفارش‌ها / فایل‌ها / درخواست‌ها ──
  app.get("/api/miniapp/staff/home", staff, async (req, reply) => {
    const id = req.staff.cafeId;
    const [o, u, q] = await Promise.all([
      pool.query("SELECT count(*)::int AS n FROM orders WHERE cafe_id=$1 AND deleted_at IS NULL AND status IN ('new','inprogress','waiting_docs')", [id]),
      pool.query("SELECT count(DISTINCT batch_id)::int AS n FROM customer_uploads WHERE cafe_id=$1 AND deleted_at IS NULL AND derived_from IS NULL AND status='new'", [id]),
      pool.query("SELECT count(*)::int AS n FROM miniapp_requests WHERE cafe_id=$1 AND status='new'", [id]),
    ]);
    return ok(reply, { staff: staffInfo(req.staff), openOrders: o.rows[0].n, newUploads: req.staff.can("upload.view") || req.staff.can("upload.manage") ? u.rows[0].n : null, newRequests: q.rows[0].n, canMessage: !!req.mini.tg.chat_id });
  });
  app.get("/api/miniapp/staff/orders", staff, async (req, reply) => {
    const id = req.staff.cafeId, st = ["open", "done", "all"].includes(req.query?.filter) ? req.query.filter : "open", q = clean(req.query?.q, 60);
    const money = req.staff.can("report.financial");
    const where = st === "open" ? "AND o.status IN ('new','inprogress','waiting_docs')" : st === "done" ? "AND o.status IN ('completed','delivered')" : "";
    const r = await pool.query(
      `SELECT o.id, o.title, o.status, o.amount, o.created_at, c.first_name, c.last_name, a.status AS pending_status, a.created_at AS pending_at
       FROM orders o LEFT JOIN customers c ON c.cafe_id=o.cafe_id AND c.id=o.customer_id LEFT JOIN miniapp_order_actions a ON a.cafe_id=o.cafe_id AND a.order_id=o.id AND a.result='pending'
       WHERE o.cafe_id=$1 AND o.deleted_at IS NULL ${where} AND ($2 = '' OR o.title ILIKE '%' || $2 || '%' OR c.first_name ILIKE '%' || $2 || '%' OR c.last_name ILIKE '%' || $2 || '%')
       ORDER BY o.created_at DESC LIMIT 100`, [id, q]);
    return ok(reply, { items: r.rows.map((x) => ({ id: x.id, title: x.title || "سفارش", status: x.status, amount: money ? Number(x.amount) : null, customer: fullName(x), createdAt: iso(x.created_at), pending: x.pending_status ? { status: x.pending_status, at: iso(x.pending_at) } : null })), asOfNote: "وضعیت سفارش‌ها از آخرین همگام‌سازی برنامه است" });
  });
  app.post("/api/miniapp/staff/orders/:id/status", { ...staff, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const status = req.body?.status;
    if (!ORDER_STATUS.includes(status)) throw invalid("وضعیت سفارش نامعتبر است");
    const o = (await pool.query("SELECT id, status FROM orders WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL", [req.staff.cafeId, req.params.id])).rows[0];
    if (!o) throw notFound("سفارش پیدا نشد");
    if (o.status === status) { await pool.query("UPDATE miniapp_order_actions SET result='applied', done_at=now() WHERE cafe_id=$1 AND order_id=$2 AND result='pending'", [req.staff.cafeId, o.id]); return ok(reply, { pending: null, status }); }
    await tx(pool, async (c) => {
      await c.query("DELETE FROM miniapp_order_actions WHERE cafe_id=$1 AND order_id=$2 AND result='pending'", [req.staff.cafeId, o.id]);
      await c.query("INSERT INTO miniapp_order_actions (cafe_id,order_id,status,by_user,by_name) VALUES ($1,$2,$3,$4,$5)", [req.staff.cafeId, o.id, status, req.staff.userId, req.staff.name]);
      await audit(c, { cafeId: req.staff.cafeId, userId: req.staff.userId, action: "miniapp.order_status_request", entity: "order", entityId: o.id, details: { from: o.status, to: status }, ip: req.ip });
    });
    return ok(reply, { pending: { status }, note: "دستور ثبت شد و وقتی برنامهٔ کافی‌نت باز باشد اعمال می‌شود" });
  });
  const needUploads = (req) => { if (!(req.staff.can("upload.view") || req.staff.can("upload.manage"))) throw forbidden("دسترسی به فایل‌های مشتری ندارید", "permission_denied"); };
  app.get("/api/miniapp/staff/uploads", staff, async (req, reply) => {
    needUploads(req);
    const r = await pool.query(
      `SELECT batch_id, max(batch_code) AS code, count(*)::int AS files, min(created_at) AS created_at, max(sender_name) AS sender, max(sender_phone) AS phone, max(note) AS note, max(order_label) AS label,
              min(CASE status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'printed' THEN 2 ELSE 3 END) AS stage
       FROM customer_uploads WHERE cafe_id=$1 AND deleted_at IS NULL AND derived_from IS NULL GROUP BY batch_id ORDER BY min(created_at) DESC LIMIT 60`, [req.staff.cafeId]);
    return ok(reply, { items: r.rows.map((x) => ({ batchId: x.batch_id, code: x.code, files: x.files, sender: x.sender || "", phone: x.phone || "", note: x.note || "", label: x.label || "", stage: Number(x.stage), createdAt: iso(x.created_at) })) });
  });
  app.post("/api/miniapp/staff/uploads/:batch/status", { ...staff, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    needUploads(req);
    const status = req.body?.status;
    if (!UP_STATUS.includes(status)) throw invalid("وضعیت فایل نامعتبر است");
    if (!/^[0-9a-f-]{36}$/i.test(req.params.batch)) throw invalid("شناسهٔ ارسال نامعتبر است");
    const r = await pool.query("UPDATE customer_uploads SET status=$3, status_at=now(), status_by=$4 WHERE cafe_id=$1 AND batch_id=$2 AND deleted_at IS NULL AND derived_from IS NULL", [req.staff.cafeId, req.params.batch, status, req.staff.userId]);
    if (!r.rowCount) throw notFound("ارسال پیدا نشد");
    return ok(reply, { status, files: r.rowCount });
  });
  app.get("/api/miniapp/staff/requests", staff, async (req, reply) => {
    const r = await pool.query("SELECT id, customer_name, phone, service, note, status, reply, created_at, status_at FROM miniapp_requests WHERE cafe_id=$1 ORDER BY (status='new') DESC, created_at DESC LIMIT 80", [req.staff.cafeId]);
    return ok(reply, { items: r.rows.map(reqView) });
  });
  const reqView = (x) => ({ id: x.id, customer: x.customer_name || "", phone: x.phone || "", service: x.service, note: x.note || "", status: x.status, reply: x.reply || "", createdAt: iso(x.created_at), statusAt: iso(x.status_at) });
  async function setRequest(cafeId, id, userId, body, ip) {
    if (!REQ_STATUS.includes(body?.status)) throw invalid("وضعیت درخواست نامعتبر است");
    const reply = clean(body?.reply, 300);
    const r = await tx(pool, async (c) => {
      const row = (await c.query("UPDATE miniapp_requests SET status=$3, status_at=now(), status_by=$4, reply=CASE WHEN $5 <> '' THEN $5 ELSE reply END WHERE cafe_id=$1 AND id=$2 RETURNING *", [cafeId, id, body.status, userId, reply])).rows[0];
      if (row) await audit(c, { cafeId, userId, action: "miniapp.request_status", entity: "miniapp_request", entityId: id, details: { status: body.status }, ip });
      return row;
    });
    if (!r) throw notFound("درخواست پیدا نشد");
    return r;
  }
  app.post("/api/miniapp/staff/requests/:id/status", { ...staff, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => ok(reply, reqView(await setRequest(req.staff.cafeId, req.params.id, req.staff.userId, req.body, req.ip))));

  // ── مشتری: ثبت و پیگیری درخواست ──
  app.post("/api/miniapp/requests", { ...mini, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const cafe = needCafe(req);
    if (!req.mini.tg.phone_verified_at) throw new HttpError(409, "phone_required", "برای ثبت درخواست ابتدا شمارهٔ موبایل خود را تأیید کنید");
    const service = clean(req.body?.service, 120), note = clean(req.body?.note, 500);
    if (!service) throw invalid("نام خدمت یا کار درخواستی را بنویسید");
    const tg = Number(req.mini.tg.telegram_id);
    const open = (await pool.query("SELECT count(*)::int AS n FROM miniapp_requests WHERE cafe_id=$1 AND telegram_id=$2 AND status='new'", [cafe.cafe_id, tg])).rows[0].n;
    if (open >= 5) throw new HttpError(429, "too_many_open", "چند درخواست باز دارید؛ تا بررسی توسط کافی‌نت صبر کنید");
    const link = await linkOf(req);
    const name = link?.name || fullName({ first_name: req.mini.tg.first_name, last_name: req.mini.tg.last_name });
    const row = (await pool.query("INSERT INTO miniapp_requests (cafe_id,telegram_id,customer_id,customer_name,phone,service,note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [cafe.cafe_id, tg, link?.customerId || null, clean(name, 200), phoneOf(req), service, note])).rows[0];
    bot.notifyStaff?.(cafe.cafe_id, `🛎 درخواست جدید در مینی‌اپ\n${row.customer_name || "مشتری"}${row.phone ? ` (۰${row.phone})` : ""}\n${row.service}${row.note ? `\n${row.note}` : ""}`).catch(() => {});
    reply.code(201);
    return ok(reply, reqView(row));
  });
  app.get("/api/miniapp/requests", mini, async (req, reply) => {
    const cafe = needCafe(req);
    const r = await pool.query("SELECT id, customer_name, phone, service, note, status, reply, created_at, status_at FROM miniapp_requests WHERE cafe_id=$1 AND telegram_id=$2 ORDER BY created_at DESC LIMIT 30", [cafe.cafe_id, req.mini.tg.telegram_id]);
    return ok(reply, { items: r.rows.map(reqView) });
  });

  // ── برنامه (ورود): مدیریت درخواست‌ها و اعمال صف تغییر وضعیت ──
  const view = { preHandler: [app.requirePerm("upload.view", "upload.manage")] };
  app.get("/api/miniapp/requests-admin", view, async (req) => {
    const r = await pool.query("SELECT id, customer_id, customer_name, phone, service, note, status, reply, order_id, created_at, status_at FROM miniapp_requests WHERE cafe_id=$1 ORDER BY (status='new') DESC, created_at DESC LIMIT 200", [req.user.cafeId]);
    return { data: { items: r.rows.map((x) => ({ ...reqView(x), customerId: x.customer_id, orderId: x.order_id })), newCount: r.rows.filter((x) => x.status === "new").length } };
  });
  app.post("/api/miniapp/requests-admin/:id", view, async (req) => {
    const row = await setRequest(req.user.cafeId, req.params.id, req.user.id, req.body, req.ip);
    if (typeof req.body?.orderId === "string" && req.body.orderId.length <= 80) await pool.query("UPDATE miniapp_requests SET order_id=$3 WHERE cafe_id=$1 AND id=$2", [req.user.cafeId, row.id, req.body.orderId]);
    return { data: { ...reqView(row), customerId: row.customer_id } };
  });
  app.get("/api/miniapp/order-actions", login, async (req) => {
    const r = await pool.query("SELECT id, order_id, status, by_name, created_at FROM miniapp_order_actions WHERE cafe_id=$1 AND result='pending' ORDER BY created_at LIMIT 50", [req.user.cafeId]);
    return { data: { items: r.rows.map((x) => ({ id: x.id, orderId: x.order_id, status: x.status, by: x.by_name, createdAt: iso(x.created_at) })) } };
  });
  app.post("/api/miniapp/order-actions/ack", { ...login, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const b = req.body || {}, list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100) : []);
    const applied = list(b.applied), missing = list(b.notFound);
    const a = applied.length ? await pool.query("UPDATE miniapp_order_actions SET result='applied', done_at=now() WHERE cafe_id=$1 AND id = ANY($2::uuid[]) AND result='pending'", [req.user.cafeId, applied]) : { rowCount: 0 };
    const m = missing.length ? await pool.query("UPDATE miniapp_order_actions SET result='not_found', done_at=now() WHERE cafe_id=$1 AND id = ANY($2::uuid[]) AND result='pending'", [req.user.cafeId, missing]) : { rowCount: 0 };
    return { data: { applied: a.rowCount, notFound: m.rowCount } };
  });
}
export { CODE_ALPHABET as _CODE_ALPHABET };
