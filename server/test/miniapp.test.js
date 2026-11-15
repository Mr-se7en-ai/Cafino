// مینی‌اپ تلگرام مشتریان (1.80). روی PostgreSQL واقعی + Bot API جعلی (سرور HTTP محلی).
// توجه: با تلگرام واقعی آزمایش نشده است (شبکهٔ این محیط بسته است). امضای initData با همان الگوریتم مستند تلگرام (HMAC-SHA256 با کلید
// "WebAppData") در همین فایل ساخته و در سرور راستی‌آزمایی می‌شود؛ یعنی منطق ما آزموده شده، نه «پذیرش واقعی تلگرام».
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { MiniappAuthError, codeFromPayload, normalizePhone, sanitizeTariff, signSession, tariffHash, verifyInitData, verifySession } from "../src/lib/miniapp.js";
import { signAccess } from "../src/lib/security.js";

const PW = "رمز-خیلی-قوی-۱۲۳";
const TOKEN = "444444444:AAMiniApp_test_token_for_tests_00001";
let url, ctx, O, S, fake, srv, cafeA, cafeB, codeA, codeB;

// امضای initData دقیقاً مطابق مستند تلگرام
function sign(fields, token = TOKEN) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) p.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const check = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return p.toString();
}
const nowSec = () => Math.floor(Date.now() / 1000);
const initFor = (id, extra = {}, token = TOKEN) => sign({ auth_date: String(nowSec()), query_id: "AAH" + id, user: { id, first_name: "کاربر", last_name: String(id), username: "u" + id, language_code: "fa" }, ...extra }, token);

function makeFake() {
  const st = { sent: [], calls: [], queue: [], uid: 500, failGetMe: false };
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url), reply = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (!m) return reply({ ok: false, error_code: 404, description: "Not Found" }, 404);
      const [, token, method] = m, b = body ? JSON.parse(body) : {};
      st.calls.push({ token, method, b });
      if (token !== TOKEN) return reply({ ok: false, error_code: 401, description: "Unauthorized" }, 401);
      if (method === "getMe") return st.failGetMe ? reply({ ok: false, error_code: 502, description: "bad gateway" }, 502) : reply({ ok: true, result: { id: 444444444, is_bot: true, username: "cafino_mini_bot", first_name: "کافینو" } });
      if (["deleteWebhook", "setMyCommands", "setChatMenuButton"].includes(method)) return reply({ ok: true, result: true });
      if (method === "getUpdates") return reply({ ok: true, result: st.queue.filter((u) => u.update_id >= (b.offset || 0)).slice(0, b.limit || 20) });
      if (method === "sendMessage") { st.sent.push({ chat_id: b.chat_id, text: b.text, markup: b.reply_markup, parse_mode: b.parse_mode }); return reply({ ok: true, result: { message_id: st.sent.length } }); }
      return reply({ ok: false, error_code: 404, description: "no method" }, 404);
    });
  });
  const push = (message) => { st.queue.push({ update_id: ++st.uid, message: { message_id: st.uid, date: nowSec(), chat: { id: message.from?.id, type: "private" }, ...message } }); };
  return { st, server, push,
    text(id, text, extra = {}) { push({ from: { id, is_bot: false, first_name: "کاربر", language_code: "fa" }, text, ...extra }); },
    contact(id, phone, userId = id) { push({ from: { id, is_bot: false, first_name: "کاربر" }, contact: { phone_number: phone, user_id: userId, first_name: "کاربر" } }); } };
}

before(async () => {
  url = await startDb(); fake = makeFake();
  await new Promise((ok) => fake.server.listen(0, "127.0.0.1", ok)); srv = `http://127.0.0.1:${fake.server.address().port}`;
  ctx = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", BOTS_ENABLED: "false", TELEGRAM_API_BASE: srv, MINIAPP_BOT_TOKEN: TOKEN, MINIAPP_URL: "https://cafino.example.ir/m", MINIAPP_AUTH_RATE_PER_MIN: "5000" } });
  const reg = async (email, shop) => { const c = client(ctx.app), r = await c.post("/api/auth/register", { email, password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: shop }); return (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }); };
  O = await reg("own@mini.test", "کافه‌ی مینی"); const O2 = await reg("own2@mini.test", "کافه‌ی دوم");
  const inv = await O("POST", "/api/users/invite", { email: "staff@mini.test", role: "staff", firstName: "ک", lastName: "۱" });
  const cc = client(ctx.app), lg = await cc.post("/api/auth/login", { email: "staff@mini.test", password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email: "staff@mini.test", password: PW }); S = (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
  cafeA = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه‌ی مینی'")).rows[0].id; cafeB = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه‌ی دوم'")).rows[0].id;
  assert.equal((await O("GET", "/api/miniapp/info")).status, 200);     // ساخت تنظیمات کافی‌نت (کد عمومی)
  assert.equal((await O2("GET", "/api/miniapp/info")).status, 200);
  codeA = (await ctx.pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeA])).rows[0].code; codeB = (await ctx.pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeB])).rows[0].code;
  assert.notEqual(codeA, codeB);
});
after(async () => { await ctx.app.close(); await ctx.pool.end(); await new Promise((ok) => fake.server.close(ok)); await stopDb(); });
const tick = () => ctx.app.miniappBot.tick();
const auth = (initData, cafe) => ctx.app.inject({ method: "POST", url: "/api/miniapp/auth", payload: { initData, ...(cafe ? { cafe } : {}) } });
const login = async (id, cafe) => { const r = await auth(initFor(id), cafe); assert.equal(r.statusCode, 200, r.body); return r.json().data; };
const M = (token) => (path, method = "GET") => ctx.app.inject({ method, url: `/api/miniapp/${path}`, headers: { authorization: `Bearer ${token}` } }).then((r) => ({ status: r.statusCode, json: r.json(), headers: r.headers, data: r.json().data }));
const lastSent = (chat) => [...fake.st.sent].reverse().find((s) => s.chat_id === chat);
const setCustomer = (cafe, id, first, last, phone) => ctx.pool.query("INSERT INTO customers (cafe_id,id,first_name,last_name,phone) VALUES ($1,$2,$3,$4,$5)", [cafe, id, first, last, phone]);

// ── واحد ────────────────────────────────────────────────────────────────────────────
test("واحد: initData — معتبر، دست‌کاری، توکن دیگر، منقضی، آینده، بی‌امضا، تکراری، ربات", () => {
  const ok = verifyInitData(initFor(777, { start_param: "c_abc" }), TOKEN);
  assert.equal(ok.user.id, 777); assert.equal(ok.user.firstName, "کاربر"); assert.equal(ok.startParam, "c_abc");
  const good = initFor(777);
  assert.throws(() => verifyInitData(good.replace("%D8%A7", "%D8%A8"), TOKEN), (e) => e instanceof MiniappAuthError && e.code === "bad_signature");
  const p = new URLSearchParams(good); p.set("user", JSON.stringify({ id: 1, first_name: "x" }));
  assert.throws(() => verifyInitData(p.toString(), TOKEN), (e) => e.code === "bad_signature", "تغییر هویت با همان hash");
  assert.throws(() => verifyInitData(good, "999999999:AAother_token_for_tests_zzzzzzzzzzzz"), (e) => e.code === "bad_signature");
  assert.throws(() => verifyInitData(initFor(1, { auth_date: String(nowSec() - 90000) }), TOKEN), (e) => e.code === "expired");
  assert.equal(verifyInitData(initFor(1, { auth_date: String(nowSec() - 90000) }), TOKEN, { maxAgeSec: 100000 }).user.id, 1);
  assert.throws(() => verifyInitData(initFor(1, { auth_date: String(nowSec() + 3600) }), TOKEN), (e) => e.code === "bad_init_data");
  assert.throws(() => verifyInitData(good.replace(/&?hash=[0-9a-f]+/, ""), TOKEN), (e) => e.code === "bad_init_data");
  assert.throws(() => verifyInitData(`${good}&auth_date=1`, TOKEN), (e) => e.code === "bad_init_data" || e.code === "bad_signature");
  assert.throws(() => verifyInitData(sign({ auth_date: String(nowSec()), user: { id: 5, is_bot: true, first_name: "b" } }), TOKEN), (e) => e.code === "bad_init_data");
  assert.throws(() => verifyInitData(sign({ auth_date: String(nowSec()) }), TOKEN), (e) => e.code === "bad_init_data", "بدون کاربر");
  for (const junk of ["", "x", null, undefined, 5, "a".repeat(5000)]) assert.throws(() => verifyInitData(junk, TOKEN), MiniappAuthError);
  assert.throws(() => verifyInitData(good, ""), (e) => e.code === "disabled");
});
test("واحد: شمارهٔ موبایل، کد کافی‌نت، تعرفه، نشست", async () => {
  for (const v of ["09121234567", "+98 912 123 4567", "0098-912-123-4567", "989121234567", "۰۹۱۲۱۲۳۴۵۶۷", "٠٩١٢١٢٣٤٥٦٧", "9121234567"]) assert.equal(normalizePhone(v), "9121234567", v);
  for (const v of ["", "123", "02112345678", "+1 202 555 0100", "0912123456", null]) assert.equal(normalizePhone(v), "", String(v));
  assert.equal(codeFromPayload("c_abcdefghijklmnop"), "abcdefghijklmnop"); assert.equal(codeFromPayload("C_ABCDEFGHIJKLMNOP"), "abcdefghijklmnop");
  for (const v of ["", "c_short", "c_abcdefghijklmno1", "x_abcdefghijklmnop", "abcdefghijklmnop1", "c_abcdefghijklmnop'; DROP"]) assert.equal(codeFromPayload(v), "", v);
  assert.deepEqual(sanitizeTariff([{ cat: " چاپ ", items: [{ name: "A4  سیاه", price: 30000.4 }, { name: "", price: 1 }, null] }, { cat: "", items: [{ name: "x", price: 1 }] }, { cat: "خالی", items: [] }]).groups, [{ cat: "چاپ", items: [{ name: "A4 سیاه", price: 30000 }] }]);
  for (const bad of [null, "x", [{ cat: "a", items: [{ name: "n", price: -1 }] }], [{ cat: "a", items: [{ name: "n", price: 1e12 }] }], [{ cat: "a", items: [{ name: "n", price: "abc" }] }], Array.from({ length: 41 }, () => ({ cat: "a", items: [] }))]) assert.ok(sanitizeTariff(bad).error, JSON.stringify(bad)?.slice(0, 40));
  assert.equal(tariffHash([{ cat: "a", items: [] }]), tariffHash([{ cat: "a", items: [] }]));
  const t = await signSession({ jwtSecret: "s".repeat(40), miniappSessionTtlSec: 60 }, { telegramId: 42, cafeId: "00000000-0000-0000-0000-000000000001" });
  assert.deepEqual(await verifySession({ jwtSecret: "s".repeat(40) }, t), { telegramId: 42, cafeId: "00000000-0000-0000-0000-000000000001" });
  assert.equal(await verifySession({ jwtSecret: "z".repeat(40) }, t), null, "کلید دیگر");
  assert.equal(await verifySession({ jwtSecret: "s".repeat(40) }, await signAccess({ jwtSecret: "s".repeat(40), accessTtlSec: 60 }, { id: "u1", role: "owner" })), null, "توکن برنامهٔ کافی‌نت در مینی‌اپ پذیرفته نمی‌شود");
  const exp = await signSession({ jwtSecret: "s".repeat(40), miniappSessionTtlSec: -10 }, { telegramId: 1, cafeId: null }); assert.equal(await verifySession({ jwtSecret: "s".repeat(40) }, exp), null);
});

// ── ربات مشترک ─────────────────────────────────────────────────────────────────────────
test("ربات: راه‌اندازی خودکار (getMe، حذف وب‌هوک، فرمان‌ها، دکمهٔ منو) و /start با کد کافی‌نت", async () => {
  fake.text(9001, `/start c_${codeA}`); await tick();
  const m = fake.st.calls.map((c) => c.method);
  for (const x of ["getMe", "deleteWebhook", "setMyCommands", "setChatMenuButton"]) assert.ok(m.includes(x), x);
  assert.equal(ctx.app.miniappBot.info().username, "cafino_mini_bot");
  const menu = fake.st.calls.filter((c) => c.method === "setChatMenuButton");
  assert.equal(menu[0].b.menu_button.web_app.url, "https://cafino.example.ir/m/", "منوی پیش‌فرض بدون کافی‌نت");
  assert.equal(menu.at(-1).b.chat_id, 9001); assert.equal(menu.at(-1).b.menu_button.web_app.url, `https://cafino.example.ir/m/?c=${codeA}`, "منوی همین گفتگو → همین کافی‌نت");
  const sent = fake.st.sent.filter((s) => s.chat_id === 9001);
  assert.equal(sent.length, 2); assert.match(sent[0].text, /کافی‌نت «کافه‌ی مینی»/); assert.equal(sent[0].markup.inline_keyboard[0][0].web_app.url, `https://cafino.example.ir/m/?c=${codeA}`);
  assert.equal(sent[1].markup.keyboard[0][0].request_contact, true, "درخواست شماره");
  assert.ok(sent.every((s) => !s.parse_mode), "متن ساده");
  const u = (await ctx.pool.query("SELECT * FROM telegram_users WHERE telegram_id=9001")).rows[0]; assert.equal(String(u.last_cafe_id), cafeA); assert.equal(u.phone_verified_at, null);
  assert.ok(!JSON.stringify(fake.st.sent).includes(TOKEN));
});
test("ربات: کد ناشناخته/نامعتبر، بدون کد، گفتگوی گروهی، ربات‌ها", async () => {
  const before = fake.st.sent.length;
  fake.text(9002, "/start"); fake.text(9003, "/start c_zzzzzzzzzzzzzzzz"); fake.text(9004, "/start c_zzzzzz'; DROP"); await tick();
  const s = fake.st.sent.slice(before); assert.equal(s.length, 3); assert.ok(s.every((x) => /لینک یا QR/.test(x.text) && !x.markup));
  fake.push({ from: { id: 9005, is_bot: false, first_name: "g" }, chat: { id: -100, type: "group" }, text: `/start c_${codeA}` });
  fake.push({ from: { id: 9006, is_bot: true, first_name: "bot" }, text: `/start c_${codeA}` }); await tick();
  assert.equal(fake.st.sent.length, before + 3, "گروه و ربات نادیده گرفته شدند");
  fake.text(9002, "سلام"); await tick(); assert.match(lastSent(9002).text, /دکمهٔ «ورود به کافینو»/);
  fake.text(9002, "/help"); await tick(); assert.match(lastSent(9002).text, /\/start/);
});
test("ربات: شمارهٔ تأییدشده فقط وقتی contact.user_id همان فرستنده باشد", async () => {
  fake.contact(9001, "+98 912 123 4567", 12345); await tick();
  assert.match(lastSent(9001).text, /فقط شمارهٔ خودتان/); assert.equal((await ctx.pool.query("SELECT phone_verified_at FROM telegram_users WHERE telegram_id=9001")).rows[0].phone_verified_at, null);
  fake.contact(9001, "+1 202 555 0100"); await tick(); assert.match(lastSent(9001).text, /موبایل ایران/);
  fake.contact(9001, "+98 912 123 4567"); await tick();
  const u = (await ctx.pool.query("SELECT phone, phone_verified_at FROM telegram_users WHERE telegram_id=9001")).rows[0]; assert.equal(u.phone, "9121234567"); assert.ok(u.phone_verified_at);
  const msgs = fake.st.sent.filter((s) => s.chat_id === 9001).slice(-2); assert.match(msgs[0].text, /تأیید شد/); assert.equal(msgs[0].markup.inline_keyboard[0][0].web_app.url, `https://cafino.example.ir/m/?c=${codeA}`);
});
test("ربات: خطای getMe موقت است و در دور بعد جبران می‌شود؛ توکن هرگز در لاگ/خطا نیست", async () => {
  const a = ctx.app.miniappBot; fake.st.failGetMe = true;
  const r = await ctx.pool.query("UPDATE miniapp_bot_state SET last_error='' RETURNING 1"); void r;
  // نمونهٔ جدید با info خالی
  const { createMiniappBot } = await import("../src/lib/miniappBot.js");
  const b = createMiniappBot({ pool: ctx.pool, cfg: ctx.cfg, log: {} }); assert.equal(await b.tick(), false);
  const err = (await ctx.pool.query("SELECT last_error FROM miniapp_bot_state")).rows[0].last_error; assert.ok(err && !err.includes(TOKEN));
  fake.st.failGetMe = false; void a;
});

// ── احراز هویت و نشست ───────────────────────────────────────────────────────────────
test("auth: امضای معتبر + کد کافی‌نت → توکن؛ امضا/زمان بد ۴۰۱؛ بدنهٔ بد", async () => {
  const d = await login(9101, codeA); assert.ok(d.token.split(".").length === 3); assert.equal(d.cafe.name, "کافه‌ی مینی"); assert.equal(d.cafe.code, codeA); assert.equal(d.problem, ""); assert.equal(d.phoneVerified, false);
  assert.equal(d.botUsername, "cafino_mini_bot");
  const viaStart = await auth(initFor(9102, { start_param: `c_${codeA}` })); assert.equal(viaStart.json().data.cafe.code, codeA);
  assert.equal((await auth(initFor(9101).replace(/hash=[0-9a-f]{4}/, "hash=0000"))).statusCode, 401);
  const exp = await auth(initFor(9101, { auth_date: String(nowSec() - 999999) })); assert.equal(exp.statusCode, 401); assert.equal(exp.json().error.code, "expired");
  assert.equal((await auth(initFor(9101, {}, "555555555:AAother_token_for_tests_yyyyyyyyyyyy"), codeA)).statusCode, 401);
  for (const body of [undefined, {}, { initData: 5 }, { initData: "x" }]) assert.equal((await ctx.app.inject({ method: "POST", url: "/api/miniapp/auth", payload: body })).statusCode, 401);
  assert.equal((await ctx.app.inject({ method: "POST", url: "/api/miniapp/auth", headers: { "content-type": "text/plain" }, payload: "x" })).statusCode, 415);
});
test("auth: کافی‌نت نامعلوم/بسته/بدون کد؛ آخرین کافی‌نت یادآوری می‌شود", async () => {
  assert.equal((await login(9103, "cccccccccccccccc")).problem, "not_found"); assert.equal((await login(9104)).problem, "no_cafe");
  assert.equal((await login(9104, "c_short")).problem, "no_cafe", "کد نامعتبر مثل بدون کد");
  const a = await login(9105, codeA); assert.equal(a.cafe.code, codeA);
  const again = await login(9105); assert.equal(again.cafe.code, codeA, "بدون کد → آخرین کافی‌نت (دکمهٔ منو)");
  const b = await login(9105, codeB); assert.equal(b.cafe.name, "کافه‌ی دوم"); assert.equal((await login(9105)).cafe.code, codeB);
  const noCafe = await login(9104); const r = await M(noCafe.token)("me"); assert.equal(r.status, 409); assert.equal(r.json.error.code, "no_cafe");
});
test("نشست: بدون توکن/دست‌کاری‌شده/منقضی/توکن برنامهٔ کافی‌نت ۴۰۱؛ توکن مینی‌اپ در API کافی‌نت بی‌اثر", async () => {
  const d = await login(9106, codeA);
  for (const p of ["me", "home", "orders", "services", "shop"]) {
    assert.equal((await ctx.app.inject({ method: "GET", url: `/api/miniapp/${p}` })).statusCode, 401, p);
    assert.equal((await M(d.token.slice(0, -3) + "abc")(p)).status, 401, p);
    assert.equal((await M(await signAccess(ctx.cfg, { id: "00000000-0000-0000-0000-000000000009", role: "owner" }))(p)).status, 401, p);
  }
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/uploads/summary", headers: { authorization: `Bearer ${d.token}` } })).statusCode, 401);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/customers", headers: { authorization: `Bearer ${d.token}` } })).statusCode, 401);
  assert.equal((await M(d.token)("me")).status, 200);
  assert.equal((await M(d.token)("me")).headers["cache-control"], "no-store");
});

// ── اتصال حساب، خانه، سفارش‌ها ───────────────────────────────────────────────────────────
test("اتصال خودکار: فقط با شمارهٔ تأییدشده؛ ارقام فارسی؛ مشتری نامرتبط/کافی‌نت دیگر وصل نمی‌شود", async () => {
  await setCustomer(cafeA, "cu-1", "مریم", "رضایی", "۰۹۱۲-۱۲۳-۴۵۶۷"); await setCustomer(cafeA, "cu-2", "علی", "کریمی", "09350000000"); await setCustomer(cafeB, "cu-b", "دیگری", "کافه‌ی دوم", "09121234567");
  const d = await login(9001, codeA); assert.equal(d.phoneVerified, true);
  const me = await M(d.token)("me"); assert.equal(me.status, 200); assert.deepEqual(me.data.linked, { name: "مریم رضایی" }); assert.equal(me.data.ambiguous, false);
  assert.equal((await ctx.pool.query("SELECT customer_id FROM telegram_links WHERE cafe_id=$1 AND telegram_id=9001", [cafeA])).rows[0].customer_id, "cu-1");
  assert.equal((await ctx.pool.query("SELECT count(*)::int n FROM telegram_links WHERE cafe_id=$1", [cafeB])).rows[0].n, 0, "مشتری کافی‌نت دیگر با همان شماره وصل نمی‌شود");
  const un = await login(9106, codeA); assert.equal((await M(un.token)("me")).data.linked, null, "بدون شمارهٔ تأییدشده اتصالی نیست");
  fake.contact(9107, "09350000000"); await tick(); const l = await login(9107, codeA); assert.deepEqual((await M(l.token)("me")).data.linked, { name: "علی کریمی" });
});
test("خانه: بدهی فقط فاکتورهای باز همین مشتری؛ سفارش‌ها؛ فایل‌های ارسالی با شمارهٔ فرستنده", async () => {
  const inv = (id, cust, status, rem, del = null) => ctx.pool.query("INSERT INTO invoices (cafe_id,id,customer_id,status,remaining_amount,total_amount,deleted_at) VALUES ($1,$2,$3,$4,$5,$5,$6)", [cafeA, id, cust, status, rem, del]);
  await inv("i1", "cu-1", "unpaid", 300000); await inv("i2", "cu-1", "partial", 150000); await inv("i3", "cu-1", "paid", 0); await inv("i4", "cu-1", "void", 999999); await inv("i5", "cu-1", "unpaid", 777777, new Date()); await inv("i6", "cu-2", "unpaid", 555555);
  const ord = (id, cust, title, status, amount, extra = "now()") => ctx.pool.query(`INSERT INTO orders (cafe_id,id,customer_id,title,status,amount,created_at) VALUES ($1,$2,$3,$4,$5,$6,${extra})`, [cafeA, id, cust, title, status, amount]);
  await ord("o1", "cu-1", "پرینت رنگی", "inprogress", 240000); await ord("o2", "cu-1", "تایپ", "delivered", 100000, "now() - interval '90 days'"); await ord("o3", "cu-2", "سفارش دیگران", "new", 1);
  const up = (batch, code, status, phone = "", ref = "") => ctx.pool.query("INSERT INTO customer_uploads (cafe_id,batch_id,batch_code,original_name,storage_key,size,sha256,sender_phone,customer_ref,status) VALUES ($1,$2,$3,'a.pdf',$4,1,'x',$5,$6,$7)", [cafeA, batch, code, crypto.randomUUID(), phone, ref, status]);
  const b1 = crypto.randomUUID(), b2 = crypto.randomUUID(), b3 = crypto.randomUUID(); await up(b1, "48173", "seen", "۰۹۱۲۱۲۳۴۵۶۷"); await up(b1, "48173", "printed", "09121234567"); await up(b2, "11111", "done", "", "cu-1"); await up(b3, "22222", "new", "09350000000");
  const d = await login(9001, codeA), h = await M(d.token)("home");
  assert.equal(h.status, 200); assert.equal(h.data.debtRial, 450000, "۳۰۰هزار+۱۵۰هزار؛ پرداخت‌شده/باطل/حذف‌شده/مشتری دیگر نه"); assert.equal(h.data.monthOrders, 1);
  assert.equal(h.data.active.kind, "upload", "جدیدترین مورد باز"); assert.equal(h.data.active.code, "48173"); assert.equal(h.data.active.stage, 1, "کمترین مرحلهٔ فایل‌های دسته"); assert.equal(h.data.active.files, 2);
  const o = await M(d.token)("orders"); assert.equal(o.data.linked, true); const codes = o.data.items.filter((x) => x.kind === "upload").map((x) => x.code).sort(); assert.deepEqual(codes, ["11111", "48173"], "فایل مشتری دیگر نیست");
  const orders = o.data.items.filter((x) => x.kind === "order"); assert.deepEqual(orders.map((x) => x.title).sort(), ["پرینت رنگی", "تایپ"].sort()); assert.equal(orders.find((x) => x.title === "تایپ").done, true); assert.equal(orders.find((x) => x.title === "پرینت رنگی").stage, 1);
  assert.ok(!JSON.stringify(o.json).includes("سفارش دیگران") && !JSON.stringify(o.json).includes("22222"));
  const guest = await login(9106, codeA), g = await M(guest.token)("home"); assert.equal(g.data.linked, null); assert.equal(g.data.debtRial, 0); assert.equal(g.data.active, null);
  assert.equal((await M(guest.token)("orders")).data.items.length, 0);
});
test("جداسازی کافی‌نت‌ها: توکن کافی‌نت A هیچ دادهٔ B را نمی‌بیند", async () => {
  await ctx.pool.query("INSERT INTO shop_public_tariff (cafe_id, data, hash) VALUES ($1,$2,'h')", [cafeB, JSON.stringify([{ cat: "فقط B", items: [{ name: "x", price: 1 }] }])]);
  const a = await login(9001, codeA); assert.ok(!JSON.stringify((await M(a.token)("services")).json).includes("فقط B"));
  const b = await login(9001, codeB); assert.ok(JSON.stringify((await M(b.token)("services")).json).includes("فقط B"));
  const hb = (await M(b.token)("home")).data; assert.deepEqual(hb.linked, { name: "دیگری کافه‌ی دوم" }, "همان تلگرام در کافی‌نت B به مشتریِ همان کافی‌نت وصل می‌شود");
  assert.equal(hb.debtRial, 0, "بدهی ۴۵۰هزارتومانیِ کافی‌نت A به کافی‌نت B نشت نمی‌کند"); assert.equal(hb.active, null);
  assert.equal((await M(b.token)("home")).data.cafe.name, "کافه‌ی دوم");
});
test("اتصال مبهم و جابه‌جایی شماره: دو مشتری هم‌شماره وصل نمی‌شوند؛ تأیید همان شماره در حساب تلگرام دیگر، حساب قبلی را قطع می‌کند", async () => {
  await setCustomer(cafeA, "dup-1", "الف", "یک", "09361111111"); await setCustomer(cafeA, "dup-2", "ب", "دو", "+98 936 111 1111");
  fake.contact(9201, "09361111111"); await tick(); const d = await login(9201, codeA); const me = await M(d.token)("me"); assert.equal(me.data.linked, null); assert.equal(me.data.ambiguous, true);
  await setCustomer(cafeA, "one-1", "ج", "سه", "09372222222");
  fake.contact(9202, "09372222222"); await tick(); const x = await login(9202, codeA); assert.equal((await M(x.token)("me")).data.linked.name, "ج سه");
  fake.contact(9203, "09372222222"); await tick();       // شمارهٔ بازیافت‌شده: مالک تازه تأیید می‌کند
  const y = await login(9203, codeA); assert.equal((await M(y.token)("me")).data.linked.name, "ج سه");
  assert.equal((await ctx.pool.query("SELECT count(*)::int n FROM telegram_links WHERE cafe_id=$1 AND customer_id='one-1'", [cafeA])).rows[0].n, 1, "هر مشتری یک حساب تلگرام");
  assert.equal((await M(x.token)("me")).data.linked, null, "حساب قدیمی دیگر وصل نیست و دوباره هم نمی‌تواند وصل شود");
  assert.equal((await M(x.token)("home")).data.debtRial, 0);
  assert.equal((await ctx.pool.query("SELECT phone_verified_at FROM telegram_users WHERE telegram_id=9202")).rows[0].phone_verified_at, null);
});
test("حذف اتصال و حذف شمارهٔ من", async () => {
  const d = await login(9107, codeA); assert.ok((await M(d.token)("me")).data.linked);
  const del = await M(d.token)("link", "DELETE"); assert.equal(del.status, 200);
  assert.equal((await ctx.pool.query("SELECT count(*)::int n FROM telegram_links WHERE telegram_id=9107")).rows[0].n, 0);
  const me = await M(d.token)("me"); assert.ok(me.data.linked, "شمارهٔ تأییدشده هنوز هست → دوباره خودکار وصل می‌شود");
  const gone = await M(d.token)("me", "DELETE"); assert.equal(gone.status, 200); assert.equal(gone.data.phoneVerified, false);
  assert.equal((await M(d.token)("me")).data.linked, null); assert.equal((await ctx.pool.query("SELECT phone, phone_verified_at FROM telegram_users WHERE telegram_id=9107")).rows[0].phone, "");
});

// ── سمت کافی‌نت: تعرفه، اطلاعات، خاموش/روشن ──────────────────────────────────────────────
test("کافی‌نت: مجوز؛ info؛ همگام‌سازی تعرفه (اعتبارسنجی، هش بدون تغییر)؛ نمایش برای مشتری", async () => {
  assert.equal((await S("GET", "/api/miniapp/info")).status, 403); assert.equal((await S("PUT", "/api/miniapp/tariff", { groups: [] })).status, 403); assert.equal((await S("PATCH", "/api/miniapp/settings", { enabled: false })).status, 403);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/miniapp/info" })).statusCode, 401);
  const i = await O("GET", "/api/miniapp/info"); assert.equal(i.status, 200); assert.equal(i.data.serverEnabled, true); assert.equal(i.data.enabled, true); assert.equal(i.data.botUsername, "cafino_mini_bot");
  assert.equal(i.data.link, `https://t.me/cafino_mini_bot?start=c_${codeA}`); assert.ok(i.data.linkedCustomers >= 1); assert.equal(i.data.tariff, null);
  for (const bad of [{}, { groups: "x" }, { groups: [{ cat: "a", items: [{ name: "n", price: -5 }] }] }]) assert.equal((await O("PUT", "/api/miniapp/tariff", bad)).status, 422);
  const g = [{ cat: "پرینت", items: [{ name: "A4 سیاه‌وسفید", price: 30000 }, { name: "A4 رنگی", price: 100000 }] }, { cat: "تایپ", items: [{ name: "هر صفحه", price: 200000 }] }];
  const p1 = await O("PUT", "/api/miniapp/tariff", { groups: g }); assert.equal(p1.status, 200); assert.equal(p1.data.changed, true); assert.equal(p1.data.groups, 2);
  assert.equal((await O("PUT", "/api/miniapp/tariff", { groups: g })).data.changed, false);
  const d = await login(9106, codeA), s = await M(d.token)("services"); assert.equal(s.data.groups.length, 2); assert.equal(s.data.groups[0].items[1].price, 100000);
  assert.equal((await O("GET", "/api/miniapp/info")).data.tariff.groups, 2);
  assert.equal((await O("PUT", "/api/miniapp/tariff", { groups: [{ cat: "<img src=x onerror=alert(1)>", items: [{ name: "x‮", price: 1 }] }] })).status, 200);
  const raw = (await M(d.token)("services")).data.groups[0]; assert.ok(!/[‮\u0000]/.test(JSON.stringify(raw)));
});
test("کافی‌نت: خاموش‌کردن مینی‌اپ — ورود با کد، نشست‌های موجود و دکمهٔ ربات بسته می‌شود؛ حسابرسی ثبت می‌شود", async () => {
  const live = await login(9001, codeA);
  assert.equal((await O("PATCH", "/api/miniapp/settings", { enabled: "no" })).status, 422);
  assert.equal((await O("PATCH", "/api/miniapp/settings", { enabled: false })).status, 200);
  assert.equal((await login(9001, codeA)).problem, "disabled"); const r = await M(live.token)("home"); assert.equal(r.status, 403); assert.equal(r.json.error.code, "miniapp_closed");
  const before = fake.st.sent.length; fake.text(9300, `/start c_${codeA}`); await tick(); assert.match(fake.st.sent[before].text, /لینک یا QR/, "ربات هم کافی‌نت بسته را نمی‌پذیرد");
  assert.equal((await O("PATCH", "/api/miniapp/settings", { enabled: true })).status, 200); assert.equal((await M(live.token)("home")).status, 200);
  const a = await ctx.pool.query("SELECT action, details FROM audit_log WHERE cafe_id=$1 AND action='miniapp.settings' ORDER BY id", [cafeA]); assert.deepEqual(a.rows.map((x) => x.details.enabled), [false, true]);
});
test("کافی‌نت معلق: مینی‌اپ بسته", async () => {
  const live = await login(9001, codeA); await ctx.pool.query("UPDATE cafes SET status='suspended' WHERE id=$1", [cafeA]);
  assert.equal((await M(live.token)("home")).status, 403); assert.equal((await login(9001, codeA)).problem, "disabled");
  await ctx.pool.query("UPDATE cafes SET status='active' WHERE id=$1", [cafeA]);
});

// ── پوسته و فایل‌ها ───────────────────────────────────────────────────────────────────────
test("پوسته: CSP فقط تلگرام را برای قاب‌کردن مجاز می‌کند؛ بدون X-Frame-Options؛ فایل‌های مجاز و مسیر آزاد ۴۰۴", async () => {
  const r = await ctx.app.inject({ method: "GET", url: "/m/" }); assert.equal(r.statusCode, 200);
  const csp = r.headers["content-security-policy"]; assert.match(csp, /frame-ancestors https:\/\/web\.telegram\.org/); assert.match(csp, /script-src 'self' https:\/\/telegram\.org/); assert.ok(!/unsafe-inline'? *;|unsafe-eval/.test(csp.replace("style-src-attr 'unsafe-inline'", "")), csp);
  assert.ok(!("x-frame-options" in r.headers), "X-Frame-Options مانع نمایش درون تلگرام می‌شد"); assert.equal(r.headers["cache-control"], "no-store"); assert.match(r.body, /telegram-web-app\.js/); assert.match(r.body, /dir="rtl"/);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/m" })).statusCode, 200);
  assert.match((await ctx.app.inject({ method: "GET", url: "/healthz" })).headers["content-security-policy"], /frame-ancestors 'none'/, "بقیهٔ مسیرها همچنان قاب‌شدن را رد می‌کنند");
  for (const f of ["vazirmatn-400.woff2", "vazirmatn-700.woff2"]) { const x = await ctx.app.inject({ method: "GET", url: `/m/assets/${f}` }); assert.equal(x.statusCode, 200); assert.equal(x.headers["content-type"], "font/woff2"); assert.match(x.headers["cache-control"], /immutable/); }
  for (const f of ["..%2f..%2fconfig.js", "x.js", "app.js%00", "%2e%2e/package.json", "index.html"]) assert.equal((await ctx.app.inject({ method: "GET", url: `/m/assets/${f}` })).statusCode, 404, f);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/healthz" })).statusCode, 200);
});
test("بدون MINIAPP_BOT_TOKEN: مینی‌اپ خاموش (۵۰۳) و ربات هیچ کاری نمی‌کند؛ توکن بدقالب خطای پیکربندی است", async () => {
  const c2 = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", BOTS_ENABLED: "false" } });
  try {
    const r = await c2.app.inject({ method: "POST", url: "/api/miniapp/auth", payload: { initData: initFor(1) } }); assert.equal(r.statusCode, 503); assert.equal(r.json().error.code, "miniapp_disabled");
    assert.equal(await c2.app.miniappBot.tick(), false); assert.equal(c2.app.miniappBot.enabled(), false);
  } finally { await c2.app.close(); await c2.pool.end(); }
  const { loadConfig } = await import("../src/config.js");
  assert.ok(loadConfig({ DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40), MINIAPP_BOT_TOKEN: "not-a-token" }).problems.some((p) => /MINIAPP_BOT_TOKEN/.test(p)));
  assert.ok(loadConfig({ DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40), NODE_ENV: "production", MINIAPP_BOT_TOKEN: TOKEN, MINIAPP_URL: "http://x.ir/m" }).problems.some((p) => /HTTPS/.test(p)));
  assert.equal(loadConfig({ DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40), MINIAPP_BOT_TOKEN: TOKEN, PUBLIC_BASE_URL: "https://c.ir/" }).miniappUrl, "https://c.ir/m");
});
