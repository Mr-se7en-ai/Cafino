// مینی‌اپ — پرداخت، رسید و گفتگو (1.84). ثبت‌شده از انتهای registerMiniappStaff (همان نشست و ابزارها).
//  مشتری (Bearer مینی‌اپ):  GET pay-info · POST requests/:id/receipt {image(base64), ref?} · GET chat?after= · POST chat {body, requestId?} · GET chat/unread
//  برنامه (ورود، مجوز مشاهدهٔ فایل‌ها):  POST requests-admin/:id/pay {action: confirm|reject|cash_received, note?} · GET requests-admin/:id/receipt
//                                         GET chats-admin · GET chats-admin/:tg?after= · POST chats-admin/:tg {body, requestId?} · GET inbox-summary
//  کافی‌نت (مینی‌اپ):       POST staff/requests/:id/pay · GET staff/requests/:id/receipt · GET staff/chats · GET staff/chats/:tg · POST staff/chats/:tg
// امنیت: مشتری فقط درخواست/گفتگوی خودش را می‌بیند؛ رسید فقط با امضای فایل (jpeg/png/webp) و حداکثر ۱٫۵ مگابایت؛ تأیید پرداخت فقط برای کاربر کافی‌نت با مجوز مدیریت؛ همهٔ تغییرها در گزارش حسابرسی ثبت می‌شود.
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { HttpError, invalid, notFound, forbidden } from "../lib/errors.js";
import { parseReceipt, payOptions, cleanLine } from "../lib/miniappShop.js";

const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);
const fullName = (r) => [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim();
const msgText = (v) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1000);
const toman = (rial) => Math.round(Number(rial || 0) / 10).toLocaleString("fa-IR");
const tgParam = (v) => { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw invalid("شناسهٔ مشتری نامعتبر است"); return n; };
const msgView = (m) => ({ id: Number(m.id), sender: m.sender, by: m.by_name || "", body: m.body, requestId: m.request_id || null, at: iso(m.created_at), read: !!m.read_at });
const PAY_ACTIONS = ["confirm", "reject", "cash_received"];

export function registerMiniappShop(app, bot, h) {
  const { pool } = app;
  const { mini, ok, needCafe, staff, view, reqView, REQ_COLS } = h;

  // ── پرداخت: تنظیمات برای مشتری ──
  app.get("/api/miniapp/pay-info", mini, async (req, reply) => ok(reply, payOptions(needCafe(req))));

  // ── رسید کارت‌به‌کارت (مشتری) ──
  app.post("/api/miniapp/requests/:id/receipt", { ...mini, bodyLimit: 2_300_000, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const cafe = needCafe(req), tg = Number(req.mini.tg.telegram_id);
    const row = (await pool.query("SELECT id, service, total, pay_method, pay_status, status FROM miniapp_requests WHERE cafe_id=$1 AND id=$2 AND telegram_id=$3", [cafe.cafe_id, req.params.id, tg])).rows[0];
    if (!row) throw notFound("درخواست پیدا نشد");
    if (row.pay_method !== "card" || !(Number(row.total) > 0)) throw new HttpError(409, "not_card", "این درخواست پرداخت کارت‌به‌کارت ندارد");
    if (row.pay_status === "paid") throw new HttpError(409, "already_paid", "پرداخت این درخواست قبلاً تأیید شده است");
    if (row.status === "rejected") throw new HttpError(409, "request_rejected", "این درخواست رد شده است");
    const p = parseReceipt(req.body?.image);
    if (p.error) throw invalid(p.error);
    const ref = cleanLine(req.body?.ref, 40);
    await tx(pool, async (c) => {
      const n = (await c.query("SELECT count(*)::int AS n FROM miniapp_receipts WHERE request_id=$1", [row.id])).rows[0].n;
      if (n >= 5) throw new HttpError(429, "too_many_receipts", "حداکثر ۵ رسید برای هر درخواست؛ با کافی‌نت تماس بگیرید");
      await c.query("INSERT INTO miniapp_receipts (cafe_id, request_id, telegram_id, mime, data) VALUES ($1,$2,$3,$4,$5)", [cafe.cafe_id, row.id, tg, p.mime, p.buf]);
      await c.query("UPDATE miniapp_requests SET pay_status='receipt_sent', pay_ref=$2, pay_note='' WHERE id=$1", [row.id, ref]);
    });
    bot.notifyStaff?.(cafe.cafe_id, `🧾 رسید پرداخت جدید\n${row.service} — ${toman(row.total)} تومان\nبرای تأیید، بخش «سفارش‌های مینی‌اپ» را باز کنید.`).catch(() => {});
    const out = (await pool.query(`SELECT ${REQ_COLS} FROM miniapp_requests WHERE id=$1`, [row.id])).rows[0];
    return ok(reply, reqView(out));
  });

  // ── تأیید/رد پرداخت (کافی‌نت) ──
  async function payAction(cafeId, id, userId, body, ip) {
    const action = body?.action;
    if (!PAY_ACTIONS.includes(action)) throw invalid("عملیات پرداخت نامعتبر است");
    const note = cleanLine(body?.note, 300);
    const out = await tx(pool, async (c) => {
      const row = (await c.query("SELECT id, telegram_id, service, total, pay_method, pay_status FROM miniapp_requests WHERE cafe_id=$1 AND id=$2 FOR UPDATE", [cafeId, id])).rows[0];
      if (!row) throw notFound("درخواست پیدا نشد");
      if (!(Number(row.total) > 0)) throw new HttpError(409, "no_total", "این درخواست مبلغی ندارد");
      if (row.pay_status === "paid") throw new HttpError(409, "already_paid", "پرداخت قبلاً تأیید شده است");
      if (action === "confirm" && !(row.pay_method === "card" && row.pay_status === "receipt_sent")) throw new HttpError(409, "no_receipt", "رسیدی برای تأیید نیست؛ اگر مشتری حضوری پرداخت کرده «دریافت حضوری» را بزنید");
      if (action === "reject" && row.pay_status !== "receipt_sent") throw new HttpError(409, "no_receipt", "رسیدی برای رد کردن نیست");
      const paid = action !== "reject";
      await c.query("UPDATE miniapp_requests SET pay_status=$3, pay_note=$4, paid_at=CASE WHEN $5 THEN now() ELSE paid_at END, paid_by=CASE WHEN $5 THEN $6::uuid ELSE paid_by END WHERE cafe_id=$1 AND id=$2",
        [cafeId, id, paid ? "paid" : "rejected", paid ? "" : note, paid, userId]);
      await audit(c, { cafeId, userId, action: `miniapp.pay_${action}`, entity: "miniapp_request", entityId: id, details: { total: Number(row.total), method: row.pay_method }, ip });
      return row;
    });
    const msg = action === "reject" ? `❌ رسید پرداخت «${out.service}» پذیرفته نشد${note ? `: ${note}` : ""}\nلطفاً رسید درست را دوباره بفرستید.` : `✅ پرداخت «${out.service}» (${toman(out.total)} تومان) تأیید شد. سپاس!`;
    bot.notifyCustomer?.(cafeId, out.telegram_id, msg).catch(() => {});
    const r = (await pool.query(`SELECT ${REQ_COLS} FROM miniapp_requests WHERE id=$1`, [id])).rows[0];
    return reqView(r);
  }
  const needManage = (s) => { if (!(s.can("upload.manage") || s.role === "owner" || s.role === "manager")) throw forbidden("تأیید پرداخت فقط برای مالک/مدیر یا کاربر دارای مجوز مدیریت است"); };
  const slow = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };
  app.post("/api/miniapp/requests-admin/:id/pay", { ...view, ...slow }, async (req) => ({ data: await payAction(req.user.cafeId, req.params.id, req.user.id, req.body, req.ip) }));
  app.post("/api/miniapp/staff/requests/:id/pay", { ...staff, ...slow }, async (req, reply) => { needManage(req.staff); return ok(reply, await payAction(req.staff.cafeId, req.params.id, req.staff.userId, req.body, req.ip)); });
  async function latestReceipt(cafeId, id) {
    const r = (await pool.query("SELECT r.mime, r.data, r.created_at, q.pay_ref, (SELECT count(*)::int FROM miniapp_receipts x WHERE x.request_id=q.id) AS n FROM miniapp_receipts r JOIN miniapp_requests q ON q.id=r.request_id WHERE q.cafe_id=$1 AND q.id=$2 ORDER BY r.created_at DESC LIMIT 1", [cafeId, id])).rows[0];
    if (!r) throw notFound("رسیدی ثبت نشده است");
    return { mime: r.mime, data: r.data.toString("base64"), at: iso(r.created_at), ref: r.pay_ref || "", count: r.n };
  }
  app.get("/api/miniapp/requests-admin/:id/receipt", view, async (req) => ({ data: await latestReceipt(req.user.cafeId, req.params.id) }));
  app.get("/api/miniapp/staff/requests/:id/receipt", staff, async (req, reply) => ok(reply, await latestReceipt(req.staff.cafeId, req.params.id)));

  // ── گفتگو ──
  async function readMessages(cafeId, tg, after, viewer) {
    const a = Number.isSafeInteger(Number(after)) && Number(after) > 0 ? Number(after) : 0;
    const r = a
      ? await pool.query("SELECT * FROM miniapp_messages WHERE cafe_id=$1 AND telegram_id=$2 AND id>$3 ORDER BY id ASC LIMIT 200", [cafeId, tg, a])
      : await pool.query("SELECT * FROM (SELECT * FROM miniapp_messages WHERE cafe_id=$1 AND telegram_id=$2 ORDER BY id DESC LIMIT 100) t ORDER BY id ASC", [cafeId, tg]);
    await pool.query("UPDATE miniapp_messages SET read_at=now() WHERE cafe_id=$1 AND telegram_id=$2 AND sender<>$3 AND read_at IS NULL", [cafeId, tg, viewer]);
    return r.rows.map(msgView);
  }
  async function writeMessage(cafeId, tg, side, who, body) {
    const text = msgText(body?.body);
    if (!text) throw invalid("متن پیام را بنویسید");
    const recent = (await pool.query("SELECT count(*)::int AS n FROM miniapp_messages WHERE cafe_id=$1 AND telegram_id=$2 AND sender=$3 AND created_at > now() - interval '1 minute'", [cafeId, tg, side])).rows[0].n;
    if (recent >= 20) throw new HttpError(429, "chat_rate", "پیام‌های زیادی فرستادید؛ کمی صبر کنید");
    if (side === "cafe") {
      const known = (await pool.query("SELECT 1 FROM telegram_users t WHERE t.telegram_id=$2 AND (EXISTS (SELECT 1 FROM miniapp_messages WHERE cafe_id=$1 AND telegram_id=$2) OR EXISTS (SELECT 1 FROM miniapp_requests WHERE cafe_id=$1 AND telegram_id=$2) OR EXISTS (SELECT 1 FROM telegram_links WHERE cafe_id=$1 AND telegram_id=$2))", [cafeId, tg])).rowCount;
      if (!known) throw notFound("این مشتری برای کافی‌نت شناخته‌شده نیست");
    }
    let requestId = null;
    if (typeof body?.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId)) requestId = (await pool.query("SELECT id FROM miniapp_requests WHERE id=$1 AND cafe_id=$2 AND telegram_id=$3", [body.requestId, cafeId, tg])).rows[0]?.id || null;
    // اعلان تلگرام فقط وقتی پیام خوانده‌نشدهٔ تازه‌ای از همین طرف در ۳ دقیقهٔ اخیر نیست (ضد اسپم)
    const burst = (await pool.query("SELECT count(*)::int AS n FROM miniapp_messages WHERE cafe_id=$1 AND telegram_id=$2 AND sender=$3 AND read_at IS NULL AND created_at > now() - interval '3 minutes'", [cafeId, tg, side])).rows[0].n;
    const m = (await pool.query("INSERT INTO miniapp_messages (cafe_id, telegram_id, sender, by_user, by_name, request_id, body) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [cafeId, tg, side, side === "cafe" ? who.userId : null, cleanLine(who.name, 100), requestId, text])).rows[0];
    if (!burst) {
      const snip = text.length > 160 ? `${text.slice(0, 160)}…` : text;
      if (side === "customer") bot.notifyStaff?.(cafeId, `💬 پیام جدید از ${who.name || "مشتری"}\n${snip}`).catch(() => {});
      else bot.notifyCustomer?.(cafeId, tg, `💬 پیام جدید از کافی‌نت\n${snip}`).catch(() => {});
    }
    return msgView(m);
  }
  const threadList = async (cafeId) => {
    const last = (await pool.query("SELECT DISTINCT ON (telegram_id) telegram_id, id, sender, body, created_at FROM miniapp_messages WHERE cafe_id=$1 ORDER BY telegram_id, id DESC", [cafeId])).rows.sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 100);
    if (!last.length) return { items: [], unread: 0 };
    const ids = last.map((x) => Number(x.telegram_id));
    const [un, nm] = await Promise.all([
      pool.query("SELECT telegram_id, count(*)::int AS n FROM miniapp_messages WHERE cafe_id=$1 AND sender='customer' AND read_at IS NULL GROUP BY telegram_id", [cafeId]),
      pool.query(`SELECT t.telegram_id, t.first_name, t.last_name, t.phone, t.phone_verified_at, c.first_name AS cf, c.last_name AS cl
                  FROM telegram_users t LEFT JOIN telegram_links l ON l.cafe_id=$1 AND l.telegram_id=t.telegram_id LEFT JOIN customers c ON c.cafe_id=$1 AND c.id=l.customer_id AND c.deleted_at IS NULL WHERE t.telegram_id = ANY($2::bigint[])`, [cafeId, ids]),
    ]);
    const unread = new Map(un.rows.map((x) => [Number(x.telegram_id), x.n])), names = new Map(nm.rows.map((x) => [Number(x.telegram_id), x]));
    const items = last.map((x) => { const n = names.get(Number(x.telegram_id)) || {}; const nameStr = fullName({ first_name: n.cf, last_name: n.cl }) || fullName(n) || "مشتری"; return { telegramId: Number(x.telegram_id), name: nameStr, phone: n.phone_verified_at && n.phone ? `0${n.phone}` : "", last: { sender: x.sender, body: x.body.length > 120 ? `${x.body.slice(0, 120)}…` : x.body, at: iso(x.created_at) }, unread: unread.get(Number(x.telegram_id)) || 0 }; });
    return { items, unread: items.reduce((a, x) => a + x.unread, 0) };
  };
  const threadName = async (cafeId, tg) => (await threadList(cafeId)).items.find((x) => x.telegramId === tg)?.name || "";

  // مشتری
  const chatLimit = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
  app.get("/api/miniapp/chat", { ...mini, ...chatLimit }, async (req, reply) => { const cafe = needCafe(req); return ok(reply, { items: await readMessages(cafe.cafe_id, Number(req.mini.tg.telegram_id), req.query?.after, "customer") }); });
  app.get("/api/miniapp/chat/unread", mini, async (req, reply) => { const cafe = needCafe(req); return ok(reply, { unread: (await pool.query("SELECT count(*)::int AS n FROM miniapp_messages WHERE cafe_id=$1 AND telegram_id=$2 AND sender='cafe' AND read_at IS NULL", [cafe.cafe_id, Number(req.mini.tg.telegram_id)])).rows[0].n }); });
  app.post("/api/miniapp/chat", { ...mini, config: { rateLimit: { max: 40, timeWindow: "1 minute" } } }, async (req, reply) => {
    const cafe = needCafe(req), tgu = req.mini.tg;
    const who = { name: fullName({ first_name: tgu.first_name, last_name: tgu.last_name }) || "مشتری" };
    reply.code(201); return ok(reply, await writeMessage(cafe.cafe_id, Number(tgu.telegram_id), "customer", who, req.body));
  });
  // برنامه
  app.get("/api/miniapp/chats-admin", view, async (req) => ({ data: await threadList(req.user.cafeId) }));
  app.get("/api/miniapp/chats-admin/:tg", view, async (req) => { const tg = tgParam(req.params.tg); return { data: { items: await readMessages(req.user.cafeId, tg, req.query?.after, "cafe"), name: await threadName(req.user.cafeId, tg) } }; });
  app.post("/api/miniapp/chats-admin/:tg", { ...view, config: { rateLimit: { max: 40, timeWindow: "1 minute" } } }, async (req) => {
    const u = (await pool.query("SELECT first_name, last_name FROM users WHERE id=$1", [req.user.id])).rows[0];
    return { data: await writeMessage(req.user.cafeId, tgParam(req.params.tg), "cafe", { userId: req.user.id, name: fullName(u) || "کافی‌نت" }, req.body) };
  });
  // کافی‌نت (مینی‌اپ)
  app.get("/api/miniapp/staff/chats", staff, async (req, reply) => ok(reply, await threadList(req.staff.cafeId)));
  app.get("/api/miniapp/staff/chats/:tg", staff, async (req, reply) => { const tg = tgParam(req.params.tg); return ok(reply, { items: await readMessages(req.staff.cafeId, tg, req.query?.after, "cafe"), name: await threadName(req.staff.cafeId, tg) }); });
  app.post("/api/miniapp/staff/chats/:tg", { ...staff, config: { rateLimit: { max: 40, timeWindow: "1 minute" } } }, async (req, reply) => { reply.code(201); return ok(reply, await writeMessage(req.staff.cafeId, tgParam(req.params.tg), "cafe", { userId: req.staff.userId, name: req.staff.name }, req.body)); });

  // ── خلاصهٔ صندوق ورودی برای نشان/اعلان برنامه و مینی‌اپ ──
  const summary = async (cafeId) => {
    const [a, b, c] = await Promise.all([
      pool.query("SELECT count(*)::int AS n FROM miniapp_requests WHERE cafe_id=$1 AND status='new'", [cafeId]),
      pool.query("SELECT count(*)::int AS n FROM miniapp_requests WHERE cafe_id=$1 AND pay_status='receipt_sent'", [cafeId]),
      pool.query("SELECT count(*)::int AS n FROM miniapp_messages WHERE cafe_id=$1 AND sender='customer' AND read_at IS NULL", [cafeId]),
    ]);
    return { newRequests: a.rows[0].n, pendingPayments: b.rows[0].n, unreadChats: c.rows[0].n };
  };
  h.inboxSummary = summary;
  app.get("/api/miniapp/inbox-summary", view, async (req) => ({ data: await summary(req.user.cafeId) }));
}
