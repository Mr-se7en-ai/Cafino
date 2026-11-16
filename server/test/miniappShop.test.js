// مینی‌اپ — سبد خرید، رسید کارت‌به‌کارت، تأیید پرداخت و گفتگو (1.84). PostgreSQL واقعی + Bot API جعلی. با تلگرام واقعی آزموده نشده است.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { startDb, stopDb, makeApp, client } from "./helpers.js";

const PW = "رمز-خیلی-قوی-۱۲۳", TOKEN = "444444444:AAMiniApp_test_token_for_tests_00002";
let ctx, fake, O, S, O2, cafeA, cafeB, codeA;
const sent = [];
const sign = (fields) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(fields)) p.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const check = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join("\n"); p.set("hash", crypto.createHmac("sha256", crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest()).update(check).digest("hex")); return p.toString(); };
const initFor = (id) => sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: { id, first_name: "کاربر", last_name: String(id), username: "u" + id, language_code: "fa" } });

before(async () => {
  const url = await startDb();
  fake = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { const m = /^\/bot[^/]+\/(\w+)$/.exec(req.url), body = b ? JSON.parse(b) : {}; res.writeHead(200, { "content-type": "application/json" });
    if (m && m[1] === "sendMessage") sent.push(body);
    res.end(JSON.stringify(m && m[1] === "getMe" ? { ok: true, result: { id: 444444444, is_bot: true, username: "cafino_mini_bot" } } : m && m[1] === "getUpdates" ? { ok: true, result: [] } : { ok: true, result: { message_id: 1 } })); }); });
  await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
  ctx = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", BOTS_ENABLED: "false", TELEGRAM_API_BASE: `http://127.0.0.1:${fake.address().port}`, MINIAPP_BOT_TOKEN: TOKEN, MINIAPP_URL: "https://cafino.example.ir/m", MINIAPP_AUTH_RATE_PER_MIN: "5000" } });
  const reg = async (email, shop) => { const c = client(ctx.app), r = await c.post("/api/auth/register", { email, password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: shop }); return (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }); };
  O = await reg("own@staff.test", "کافه الف"); O2 = await reg("own2@staff.test", "کافه ب");
  const inv = await O("POST", "/api/users/invite", { email: "emp@staff.test", role: "staff", firstName: "کارمند", lastName: "یک" });
  const cc = client(ctx.app), lg = await cc.post("/api/auth/login", { email: "emp@staff.test", password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email: "emp@staff.test", password: PW }); S = (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
  cafeA = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه الف'")).rows[0].id; cafeB = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه ب'")).rows[0].id;
  await O("GET", "/api/miniapp/info"); await O2("GET", "/api/miniapp/info");
  codeA = (await ctx.pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeA])).rows[0].code;
  await ctx.app.miniappBot.init();
});
after(async () => { await ctx.app.close(); await ctx.pool.end(); await new Promise((ok) => fake.close(ok)); await stopDb(); });
const auth = async (id, cafe) => (await ctx.app.inject({ method: "POST", url: "/api/miniapp/auth", payload: { initData: initFor(id), ...(cafe ? { cafe } : {}) } })).json().data;
let ipSeq = 0;   // هر فراخوانی از «IP» جدا می‌آید تا سقف نرخ روی هر IP آزمون را مختل نکند (سقف نرخ در آزمون جدا بررسی می‌شود)
const call = async (token, method, path, body, ip) => { const r = await ctx.app.inject({ method, url: `/api/miniapp/${path}`, remoteAddress: ip || `10.7.${Math.floor(ipSeq / 250) % 250}.${(ipSeq++ % 250) + 1}`, headers: { authorization: `Bearer ${token}` }, ...(body ? { payload: body } : {}) }); return { status: r.statusCode, data: r.json().data, error: r.json().error }; };
const mkCode = async (api) => (await api("POST", "/api/miniapp/staff-codes")).data.code;
const verified = (id, phone) => ctx.pool.query("UPDATE telegram_users SET phone=$2, phone_verified_at=now(), chat_id=$1 WHERE telegram_id=$1", [id, phone]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 7)]).toString("base64");
const TARIFF = [{ cat: "چاپ", items: [{ name: "پرینت رنگی A4", price: 50000 }, { name: "پرینت سیاه‌وسفید", price: 10000 }] }, { cat: "اسکن", items: [{ name: "اسکن مدارک", price: 30000 }] }];
const textsTo = (chat) => sent.filter((m) => m.chat_id === chat).map((m) => m.text);
let cust, cust2;

test("سبد: قیمت از تعرفهٔ سرور محاسبه می‌شود (ورودی قیمت نادیده)، جمع و خلاصه درست، آیتم ناشناخته/تعداد نامعتبر رد", async () => {
  assert.equal((await O("PUT", "/api/miniapp/tariff", { groups: TARIFF })).status, 200);
  cust = (await auth(8101, codeA)).token; cust2 = (await auth(8102, codeA)).token;
  await verified(8101, "9121110001"); await verified(8102, "9121110002");
  const r = await call(cust, "POST", "requests", { items: [{ cat: "چاپ", name: "پرینت رنگی A4", qty: 3, price: 1 }, { name: "اسکن مدارک", qty: 2 }, { name: "پرینت رنگی A4", qty: 1 }], note: "فوری" });
  assert.equal(r.status, 201, JSON.stringify(r.error));
  assert.equal(r.data.total, 50000 * 4 + 30000 * 2, "ردیف‌های تکراری ادغام و قیمت از سرور"); assert.equal(r.data.items.length, 2); assert.equal(r.data.items[0].qty, 4);
  assert.match(r.data.service, /پرینت رنگی A4 ×4 و 1 مورد دیگر/); assert.equal(r.data.payMethod, "cash"); assert.equal(r.data.payStatus, "unpaid");
  assert.equal((await call(cust, "POST", "requests", { items: [{ name: "خدمت ساختگی", qty: 1 }] })).status, 422);
  for (const qty of [0, -1, 1.5, 1000, "x"]) assert.equal((await call(cust, "POST", "requests", { items: [{ name: "اسکن مدارک", qty }] })).status, 422, `qty ${qty}`);
  assert.equal((await call(cust, "POST", "requests", { items: [] , service: "" })).status, 422);
  const free = await call(cust, "POST", "requests", { service: "چاپ بنر ۲×۱", note: "x" });
  assert.equal(free.status, 201); assert.equal(free.data.total, 0); assert.deepEqual(free.data.items, []);
  const mine = await call(cust, "GET", "requests"); assert.equal(mine.data.items.length, 2);
  assert.equal((await call(cust2, "GET", "requests")).data.items.length, 0, "درخواست دیگران دیده نمی‌شود");
  const adm = await O("GET", "/api/miniapp/requests-admin"); assert.equal(adm.data.items.find((x) => x.total === 260000).items.length, 2);
});

test("تنظیمات پرداخت: شمارهٔ کارت ۱۶ رقمی، کارت بدون شماره/خاموشی هر دو روش رد؛ مشتری فقط روش‌های فعال را می‌بیند", async () => {
  assert.equal((await O("PATCH", "/api/miniapp/settings", { payCardEnabled: true })).status, 422, "کارت بدون شماره");
  assert.equal((await O("PATCH", "/api/miniapp/settings", { payCardNumber: "1234" })).status, 422);
  assert.equal((await O("PATCH", "/api/miniapp/settings", { payCashEnabled: false })).status, 422, "حداقل یک روش");
  assert.equal((await O("PATCH", "/api/miniapp/settings", {})).status, 422);
  let info = await call(cust, "GET", "pay-info"); assert.equal(info.data.card, false); assert.equal(info.data.cash, true); assert.deepEqual(info.data.soon, ["gateway", "wallet"]);
  assert.equal((await call(cust, "POST", "requests", { items: [{ name: "اسکن مدارک", qty: 1 }], payMethod: "card" })).status, 422, "کارت‌به‌کارت خاموش");
  const set = await O("PATCH", "/api/miniapp/settings", { payCardEnabled: true, payCardNumber: "۶۰۳۷ ۹۹۷۳ ۱۲۳۴ ۵۶۷۸", payCardHolder: "علی رضایی", payBank: "ملی" });
  assert.equal(set.status, 200, JSON.stringify(set)); assert.equal(set.data.pay.cardNumber, "6037997312345678");
  info = await call(cust, "GET", "pay-info"); assert.equal(info.data.card, true); assert.equal(info.data.cardInfo.holder, "علی رضایی"); assert.equal(info.data.cardInfo.number, "6037997312345678");
  assert.equal((await O("GET", "/api/miniapp/info")).data.pay.cardEnabled, true);
  const other = await call((await auth(8102, codeA)).token, "GET", "pay-info"); assert.equal(other.data.card, true);
  const noCafeB = await O2("GET", "/api/miniapp/info"); assert.equal(noCafeB.data.pay.cardEnabled, false, "کافه ب جدا");
});

test("رسید: فقط تصویر واقعی (امضای فایل)، فقط صاحب درخواست، فقط پرداخت کارتی؛ ۵ رسید سقف؛ ادمین رسید را می‌بیند و کافه دیگر نه", async () => {
  const r = await call(cust, "POST", "requests", { items: [{ name: "پرینت سیاه‌وسفید", qty: 10 }], payMethod: "card" });
  assert.equal(r.status, 201, JSON.stringify(r.error)); assert.equal(r.data.payMethod, "card"); assert.equal(r.data.total, 100000);
  const id = r.data.id;
  assert.equal((await call(cust, "POST", `requests/${id}/receipt`, { image: Buffer.from("این یک متن است نه تصویر".repeat(10)).toString("base64") })).status, 422, "امضای فایل");
  assert.equal((await call(cust, "POST", `requests/${id}/receipt`, { image: "!!!" })).status, 422);
  assert.equal((await call(cust2, "POST", `requests/${id}/receipt`, { image: PNG })).status, 404, "درخواست دیگران");
  const ok1 = await call(cust, "POST", `requests/${id}/receipt`, { image: `data:image/png;base64,${PNG}`, ref: "۱۲۳۴۵۶" });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.error)); assert.equal(ok1.data.payStatus, "receipt_sent"); assert.equal(ok1.data.hasReceipt, true); assert.equal(ok1.data.payRef, "۱۲۳۴۵۶");
  const rec = await O("GET", `/api/miniapp/requests-admin/${id}/receipt`); assert.equal(rec.status, 200); assert.equal(rec.data.mime, "image/png"); assert.equal(Buffer.from(rec.data.data, "base64").length, 308);
  assert.equal((await O2("GET", `/api/miniapp/requests-admin/${id}/receipt`)).status, 404, "کافه دیگر رسید را نمی‌بیند");
  const cashReq = await call(cust, "POST", "requests", { items: [{ name: "اسکن مدارک", qty: 1 }], payMethod: "cash" });
  assert.equal((await call(cust, "POST", `requests/${cashReq.data.id}/receipt`, { image: PNG })).error.code, "not_card");
  assert.equal((await call(cust, "POST", `requests/${(await call(cust, "POST", "requests", { service: "چاپ بنر", note: "" })).data.id}/receipt`, { image: PNG })).error.code, "not_card", "بدون مبلغ");
  for (let i = 0; i < 4; i++) assert.equal((await call(cust, "POST", `requests/${id}/receipt`, { image: PNG })).status, 200);
  assert.equal((await call(cust, "POST", `requests/${id}/receipt`, { image: PNG })).error.code, "too_many_receipts");
});

test("تأیید پرداخت: رد با دلیل ← ارسال دوباره ← تأیید؛ تأیید دوباره رد؛ دریافت حضوری؛ اعلان به مشتری؛ ممیزی؛ کارمند بدون مجوز نمی‌تواند", async () => {
  const id = (await O("GET", "/api/miniapp/requests-admin")).data.items.find((x) => x.payMethod === "card" && x.hasReceipt).id;
  assert.equal((await O("POST", `/api/miniapp/requests-admin/${id}/pay`, { action: "bad" })).status, 422);
  const rej = await O("POST", `/api/miniapp/requests-admin/${id}/pay`, { action: "reject", note: "مبلغ رسید با فاکتور نمی‌خواند" });
  assert.equal(rej.status, 200); assert.equal(rej.data.payStatus, "rejected");
  const mine = (await call(cust, "GET", "requests")).data.items.find((x) => x.id === id); assert.equal(mine.payStatus, "rejected"); assert.match(mine.payNote, /نمی‌خواند/);
  assert.equal((await O("POST", `/api/miniapp/requests-admin/${id}/pay`, { action: "confirm" })).json.error.code, "no_receipt", "بدون رسیدِ تازه تأیید نمی‌شود");
  await ctx.pool.query("DELETE FROM miniapp_receipts WHERE request_id=$1", [id]);   // سقف ۵ رسید در آزمون قبلی پر شد
  assert.equal((await call(cust, "POST", `requests/${id}/receipt`, { image: PNG })).data.payStatus, "receipt_sent", "ارسال دوبارهٔ رسید پس از رد");
  // کارمند (نقش staff) در مینی‌اپ نمی‌تواند تأیید کند
  const ts = (await auth(7002)).token; assert.equal((await call(ts, "POST", `staff/requests/${id}/pay`, { action: "confirm" })).status, 403);
  // مالک از مینی‌اپ تأیید می‌کند
  const tOwner = (await auth(8201)).token;
  assert.equal((await call(tOwner, "POST", "staff/link", { code: await mkCode(O) })).status, 200);
  await ctx.pool.query("UPDATE telegram_users SET chat_id=8201 WHERE telegram_id=8201");   // مالک ربات را Start کرده است
  const rc = await call(tOwner, "GET", `staff/requests/${id}/receipt`); assert.equal(rc.status, 200); assert.equal(rc.data.mime, "image/png");
  const okc = await call(tOwner, "POST", `staff/requests/${id}/pay`, { action: "confirm" }); assert.equal(okc.status, 200, JSON.stringify(okc.error)); assert.equal(okc.data.payStatus, "paid"); assert.ok(okc.data.paidAt);
  assert.equal((await call(tOwner, "POST", `staff/requests/${id}/pay`, { action: "confirm" })).error.code, "already_paid");
  assert.equal((await call(cust, "POST", `requests/${id}/receipt`, { image: PNG })).error.code, "already_paid");
  const cash = (await O("GET", "/api/miniapp/requests-admin")).data.items.find((x) => x.payMethod === "cash" && x.total === 30000);
  const cr = await O("POST", `/api/miniapp/requests-admin/${cash.id}/pay`, { action: "cash_received" }); assert.equal(cr.data.payStatus, "paid");
  const free = (await O("GET", "/api/miniapp/requests-admin")).data.items.find((x) => x.total === 0);
  assert.equal((await O("POST", `/api/miniapp/requests-admin/${free.id}/pay`, { action: "cash_received" })).json.error.code, "no_total");
  assert.equal((await O2("POST", `/api/miniapp/requests-admin/${id}/pay`, { action: "reject" })).status, 404, "کافه دیگر");
  const audits = (await ctx.pool.query("SELECT action FROM audit_log WHERE cafe_id=$1 AND action LIKE 'miniapp.pay_%'", [cafeA])).rows.map((x) => x.action);
  for (const a of ["miniapp.pay_reject", "miniapp.pay_confirm", "miniapp.pay_cash_received"]) assert.ok(audits.includes(a), a);
  const sum = await O("GET", "/api/miniapp/inbox-summary"); assert.equal(typeof sum.data.pendingPayments, "number");
});

test("گفتگو: مشتری ↔ برنامه ↔ مینی‌اپ کافی‌نت؛ خوانده‌شدن، شمارندهٔ خوانده‌نشده، جداسازی کافی‌نت‌ها، سقف نرخ و ورودی نامعتبر", async () => {
  const before = sent.length;
  const m1 = await call(cust, "POST", "chat", { body: "سلام، فایلم آماده است؟" }); assert.equal(m1.status, 201); assert.equal(m1.data.sender, "customer");
  await new Promise((r) => setTimeout(r, 300));   // اعلان تلگرام ناهمگام است
  assert.ok(sent.slice(before).some((m) => /پیام جدید/.test(m.text)), "اعلان تلگرام به کارکنان");
  assert.equal((await call(cust, "POST", "chat", { body: "   " })).status, 422);
  assert.equal((await call(cust, "POST", "chat", { body: "ب".repeat(2000) })).data.body.length, 1000, "پیام بلند به ۱۰۰۰ نویسه کوتاه می‌شود");
  let list = await O("GET", "/api/miniapp/chats-admin"); assert.equal(list.data.items.length, 1); assert.equal(list.data.items[0].unread, 2); assert.equal(list.data.unread, 2);
  assert.equal((await O2("GET", "/api/miniapp/chats-admin")).data.items.length, 0, "کافه ب پیام کافه الف را نمی‌بیند");
  const tgId = list.data.items[0].telegramId; assert.equal(tgId, 8101);
  const th = await O("GET", `/api/miniapp/chats-admin/${tgId}`); assert.equal(th.data.items.length, 2);
  assert.equal((await O("GET", "/api/miniapp/chats-admin")).data.unread, 0, "با باز کردن رشته خوانده می‌شود");
  const rep = await O("POST", `/api/miniapp/chats-admin/${tgId}`, { body: "بله، تا نیم ساعت دیگر" }); assert.equal(rep.status, 200); assert.equal(rep.data.sender, "cafe");
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(textsTo(8101).some((t) => /پیام جدید از کافی‌نت/.test(t)), "اعلان تلگرام به مشتری");
  assert.equal((await call(cust, "GET", "chat/unread")).data.unread, 1);
  const mine = await call(cust, "GET", "chat"); assert.equal(mine.data.items.length, 3); assert.equal(mine.data.items[2].body, "بله، تا نیم ساعت دیگر");
  assert.equal((await call(cust, "GET", "chat/unread")).data.unread, 0);
  assert.equal((await call(cust, "GET", `chat?after=${mine.data.items[1].id}`)).data.items.length, 1, "after فقط پیام‌های تازه");
  assert.equal((await call(cust2, "GET", "chat")).data.items.length, 0, "مشتری دیگر پیام‌ها را نمی‌بیند");
  assert.equal((await O("POST", "/api/miniapp/chats-admin/999999", { body: "x" })).status, 404, "تلگرام ناشناخته");
  assert.equal((await O("POST", "/api/miniapp/chats-admin/abc", { body: "x" })).status, 422);
  assert.equal((await O2("POST", `/api/miniapp/chats-admin/${tgId}`, { body: "نفوذ" })).status, 404, "کافه دیگر نمی‌تواند به این مشتری پیام بدهد");
  const tOwner = (await auth(8201)).token;
  const sl = await call(tOwner, "GET", "staff/chats"); assert.equal(sl.data.items.length, 1);
  assert.equal((await call(tOwner, "POST", `staff/chats/${tgId}`, { body: "از مینی‌اپ کافی‌نت" })).status, 201);
  assert.equal((await call(cust, "GET", "chat")).data.items.at(-1).body, "از مینی‌اپ کافی‌نت");
  assert.equal((await call(cust, "GET", "staff/chats")).status, 403, "مشتری به مسیر کافی‌نت دسترسی ندارد");
  const home = await call(tOwner, "GET", "staff/home"); assert.equal(typeof home.data.unreadChats, "number"); assert.equal(typeof home.data.pendingPayments, "number");
  let last; for (let i = 0; i < 22; i++) last = await call(cust2, "POST", "chat", { body: `پیام ${i}` }, "10.99.0.1");
  assert.equal(last.status, 429, "بیش از ۲۰ پیام در دقیقه");
});
