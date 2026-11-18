// ربات مینی‌اپ اختصاصی هر کافی‌نت (1.86): اتصال تلگرام/بله، پرسش جدا، هویت محدود به کافی‌نت، ورود با امضای توکن همان کافی‌نت،
// اعلان با ربات درست، و جلوگیری از جعل/برخورد. روی PostgreSQL واقعی + Bot API جعلی (سرور HTTP محلی).
// توجه: با تلگرام/بلهٔ واقعی آزمایش نشده است (شبکه بسته است)؛ امضای initData همان الگوریتم مستند تلگرام است و برای بله «فرض» شده.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { resolveIdentity } from "../src/lib/miniapp.js";

const PW = "رمز-خیلی-قوی-۱۲۳";
const SHARED = "444444444:AAMiniApp_test_token_for_tests_00001";
const TG_A = "555555551:AATelegram_cafeA_token_for_tests_000001", TG_B = "555555552:AATelegram_cafeB_token_for_tests_000002";
const BALE_A = "666666661:AABale_cafeA_token_for_tests_000000001";
const REPORT = "777777771:AAReport_bot_token_for_tests_000000001";
const KNOWN = [SHARED, TG_A, TG_B, BALE_A, REPORT];
let ctx, O, O2, S, fake, srv, cafeA, cafeB, codeA, codeB;

function makeFake() {
  const st = { sent: [], calls: [], queues: new Map(), uid: 900 };
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url), reply = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (!m) return reply({ ok: false, error_code: 404, description: "Not Found" }, 404);
      const [, token, method] = m, b = body ? JSON.parse(body) : {};
      st.calls.push({ token, method, b });
      if (!KNOWN.includes(token)) return reply({ ok: false, error_code: 401, description: "Unauthorized" }, 401);
      const id = Number(token.split(":")[0]);
      if (method === "getMe") return reply({ ok: true, result: { id, is_bot: true, username: `bot_${id}`, first_name: `ربات ${id}` } });
      if (["deleteWebhook", "setMyCommands", "setChatMenuButton"].includes(method)) return reply({ ok: true, result: true });
      if (method === "getUpdates") return reply({ ok: true, result: (st.queues.get(token) || []).filter((u) => u.update_id >= (b.offset || 0)).slice(0, b.limit || 20) });
      if (method === "sendMessage") { st.sent.push({ token, chat_id: b.chat_id, text: b.text, markup: b.reply_markup }); return reply({ ok: true, result: { message_id: st.sent.length } }); }
      return reply({ ok: false, error_code: 404, description: "no method" }, 404);
    });
  });
  const text = (token, id, t) => { const q = st.queues.get(token) || []; q.push({ update_id: ++st.uid, message: { message_id: st.uid, date: Math.floor(Date.now() / 1000), chat: { id, type: "private" }, from: { id, is_bot: false, first_name: "کاربر" + id }, text: t } }); st.queues.set(token, q); };
  return { st, server, text };
}

function sign(fields, token) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) p.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const check = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return p.toString();
}
const initFor = (id, token) => sign({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAH" + id, user: { id, first_name: "کاربر", last_name: String(id), username: "u" + id, language_code: "fa" } }, token);
const auth = (initData, cafe) => ctx.app.inject({ method: "POST", url: "/api/miniapp/auth", payload: { initData, ...(cafe ? { cafe } : {}) } });
const M = (token) => (path) => ctx.app.inject({ method: "GET", url: `/api/miniapp/${path}`, headers: { authorization: `Bearer ${token}` } }).then((r) => ({ status: r.statusCode, data: r.json().data }));
const sentTo = (token, chat) => fake.st.sent.filter((s) => s.token === token && s.chat_id === chat);
const tick = () => ctx.app.miniappCafeBots.tick();
const B = (m, p, b) => O(m, `/api/miniapp/cafe-bots${p}`, b);

before(async () => {
  const url = await startDb(); fake = makeFake();
  await new Promise((ok) => fake.server.listen(0, "127.0.0.1", ok)); srv = `http://127.0.0.1:${fake.server.address().port}`;
  ctx = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", BOTS_ENABLED: "false", TELEGRAM_API_BASE: srv, BALE_API_BASE: srv, MINIAPP_BOT_TOKEN: SHARED, MINIAPP_URL: "https://cafino.example.ir/m", MINIAPP_AUTH_RATE_PER_MIN: "5000" } });
  const reg = async (email, shop) => { const c = client(ctx.app), r = await c.post("/api/auth/register", { email, password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: shop }); return (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }); };
  O = await reg("own@cb.test", "کافه‌ی الف"); O2 = await reg("own2@cb.test", "کافه‌ی ب");
  const inv = await O("POST", "/api/users/invite", { email: "staff@cb.test", role: "staff", firstName: "ک", lastName: "۱" });
  const cc = client(ctx.app), lg = await cc.post("/api/auth/login", { email: "staff@cb.test", password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email: "staff@cb.test", password: PW }); S = (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
  cafeA = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه‌ی الف'")).rows[0].id; cafeB = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه‌ی ب'")).rows[0].id;
  assert.equal((await O("GET", "/api/miniapp/info")).status, 200); assert.equal((await O2("GET", "/api/miniapp/info")).status, 200);
  codeA = (await ctx.pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeA])).rows[0].code; codeB = (await ctx.pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeB])).rows[0].code;
});
after(async () => { await ctx.app.close(); await ctx.pool.end(); await new Promise((ok) => fake.server.close(ok)); await stopDb(); });

test("اتصال: تلگرام و بله با getMe، تنظیم ربات، توکن هرگز در پاسخ/پایگاه‌داده/ممیزی به‌صورت متن ساده نیست", async () => {
  const empty = await B("GET", "");
  assert.equal(empty.status, 200); assert.deepEqual(empty.data.providers.map((p) => [p.provider, p.connected]), [["telegram", false], ["bale", false]]);
  assert.equal(empty.data.serverReady, true); assert.equal(empty.data.httpsOk, true);
  const t = await B("PUT", "/telegram", { token: TG_A });
  assert.equal(t.status, 200, JSON.stringify(t.json));
  assert.equal(t.data.connected, true); assert.equal(t.data.botUsername, "bot_555555551"); assert.equal(t.data.tokenHint, TG_A.slice(-4)); assert.equal(t.data.enabled, true);
  assert.equal(t.data.startLink, `https://t.me/bot_555555551?start=c_${codeA}`);
  const b = await B("PUT", "/bale", { token: BALE_A });
  assert.equal(b.status, 200); assert.equal(b.data.botLink, "https://ble.ir/bot_666666661");
  for (const raw of [JSON.stringify(t.json), JSON.stringify(b.json), JSON.stringify((await B("GET", "")).json)]) for (const tok of [TG_A, BALE_A]) assert.ok(!raw.includes(tok) && !raw.includes(tok.split(":")[1]), "توکن در پاسخ");
  const row = (await ctx.pool.query("SELECT * FROM miniapp_cafe_bots WHERE cafe_id=$1 AND provider='telegram'", [cafeA])).rows[0];
  assert.ok(!JSON.stringify(row).includes(TG_A.split(":")[1]), "توکن در پایگاه‌داده رمزنگاری است"); assert.match(row.token_enc, /^v1\./);
  const aud = JSON.stringify((await ctx.pool.query("SELECT details FROM audit_log WHERE action LIKE 'miniapp_bot.%'")).rows);
  assert.ok(aud.includes("miniapp_bot.") || aud.length > 2); assert.ok(!aud.includes(TG_A.split(":")[1]) && !aud.includes(BALE_A.split(":")[1]), "توکن در ممیزی");
  // ربات تنظیم شد: منوی پیش‌فرض به همین کافی‌نت وصل است
  const menu = fake.st.calls.find((c) => c.token === TG_A && c.method === "setChatMenuButton");
  assert.ok(menu && menu.b.menu_button.web_app.url.includes(`?c=${codeA}`), "دکمهٔ منو با کد کافی‌نت");
  assert.ok(fake.st.calls.some((c) => c.token === TG_A && c.method === "deleteWebhook"));
});

test("اتصال: مجوز، توکن بد، پیام‌رسان ناشناخته، و برخورد (مشترک، گزارش، کافی‌نت دیگر)", async () => {
  assert.equal((await S("GET", "/api/miniapp/cafe-bots")).status, 403, "کارمند معمولی مجوز ندارد");
  assert.equal((await S("PUT", "/api/miniapp/cafe-bots/telegram", { token: TG_B })).status, 403);
  assert.equal((await B("PUT", "/telegram", { token: "abc" })).status, 422, "قالب توکن نامعتبر");
  const junk = await B("PUT", "/telegram", { token: "123456789:AAnot_known_by_fake_server_0000000000" });
  assert.equal(junk.status, 422); assert.equal(junk.json.error.code, "bot_bad_token");
  assert.equal((await B("PUT", "/signal", { token: TG_B })).status, 404);
  const sh = await O2("PUT", "/api/miniapp/cafe-bots/telegram", { token: SHARED }); assert.equal(sh.status, 409, "ربات مشترک");
  const dup = await O2("PUT", "/api/miniapp/cafe-bots/telegram", { token: TG_A }); assert.equal(dup.status, 409, "ربات کافی‌نت دیگر"); assert.equal(dup.json.error.code, "bot_in_use");
  // ربات گزارش ↔ ربات مینی‌اپ: هر ربات فقط یک کار
  const rep = await O("PUT", "/api/bots/telegram", { token: REPORT }); assert.equal(rep.status, 200, JSON.stringify(rep.json));
  assert.equal((await B("PUT", "/telegram", { token: REPORT })).status, 409, "ربات گزارش برای مینی‌اپ");
  assert.equal((await O("PUT", "/api/bots/bale", { token: BALE_A })).status, 409, "ربات مینی‌اپ برای گزارش");
  assert.equal((await O("PUT", "/api/bots/telegram", { token: TG_A })).status, 409);
});

test("ربات اختصاصی: /start هر چه باشد همان کافی‌نت؛ هویت مصنوعی و جدا برای تلگرام و بله؛ بدون ردیف واقعی", async () => {
  fake.text(TG_A, 9001, "/start"); fake.text(TG_A, 9002, `/start c_${codeB}`); fake.text(BALE_A, 9001, "/start");
  await tick();
  const a = sentTo(TG_A, 9001)[0], a2 = sentTo(TG_A, 9002)[0], bl = sentTo(BALE_A, 9001)[0];   // پیام اول = خوش‌آمد (دومی درخواست شماره)
  assert.ok(a, "پاسخ /start " + JSON.stringify(fake.st.sent.slice(-4)) + JSON.stringify(fake.st.calls.filter((c) => c.method === "getUpdates").slice(-2)));
  assert.ok(a.text.includes("کافه‌ی الف") && a.markup.inline_keyboard[0][0].web_app.url.includes(`?c=${codeA}`), JSON.stringify(a));
  assert.ok(a2 && a2.text.includes("کافه‌ی الف") && !a2.text.includes("کافه‌ی ب"), "کد کافی‌نت دیگر در /start نادیده است");
  assert.ok(bl && bl.text.includes("کافه‌ی الف"), "ربات بله");
  const ids = (await ctx.pool.query("SELECT provider, raw_id, telegram_id FROM miniapp_identities WHERE cafe_id=$1 ORDER BY provider, raw_id", [cafeA])).rows;
  assert.equal(ids.length, 3); assert.ok(ids.every((r) => Number(r.telegram_id) >= 1e15));
  assert.notEqual(ids.find((r) => r.provider === "telegram" && Number(r.raw_id) === 9001).telegram_id, ids.find((r) => r.provider === "bale" && Number(r.raw_id) === 9001).telegram_id, "همان شناسه در تلگرام و بله یکی نیست");
  assert.equal((await ctx.pool.query("SELECT 1 FROM telegram_users WHERE telegram_id IN (9001, 9002)")).rowCount, 0, "هیچ هویت واقعی ساخته نشد");
  assert.equal(await resolveIdentity(ctx.pool, cafeA, "telegram", 9001), Number(ids.find((r) => r.provider === "telegram" && Number(r.raw_id) === 9001).telegram_id), "پایدار");
  // چت ذخیره شد؛ پردازش دوباره، پیام تکراری نمی‌فرستد (آفست)
  const n = fake.st.sent.length; await tick(); assert.equal(fake.st.sent.length, n);
});

test("ورود مینی‌اپ: امضای توکن همان کافی‌نت (تلگرام/بله) ← هویت مصنوعی؛ جعل به کافی‌نت دیگر/هویت واقعی نمی‌رسد", async () => {
  const ok = await auth(initFor(9001, TG_A), codeA); assert.equal(ok.statusCode, 200, ok.body);
  const d = ok.json().data; assert.equal(d.problem, ""); assert.equal(d.botUsername, "bot_555555551"); assert.equal(d.cafe.code, codeA);
  const me = await M(d.token)("me"); assert.equal(me.status, 200); assert.equal(me.data.botUsername, "bot_555555551");
  const synth = (await ctx.pool.query("SELECT telegram_id FROM miniapp_identities WHERE cafe_id=$1 AND provider='telegram' AND raw_id=9001", [cafeA])).rows[0].telegram_id;
  assert.ok(Number(synth) >= 1e15);
  const bale = await auth(initFor(9001, BALE_A), codeA); assert.equal(bale.statusCode, 200, bale.body);
  assert.equal(bale.json().data.cafe.code, codeA);
  // بدون کد کافی‌نت یا با کد کافی‌نت دیگر: امضای ربات اختصاصی پذیرفته نمی‌شود
  assert.equal((await auth(initFor(9001, TG_A))).statusCode, 401, "بدون کد");
  assert.equal((await auth(initFor(9001, TG_A), codeB)).statusCode, 401, "کد کافی‌نت دیگر");
  assert.equal((await auth(initFor(9001, "999999999:AAunknown_token_for_tests_zzzzzzzzzzzzz"), codeA)).statusCode, 401);
  // ربات مشترک همچنان کار می‌کند (هویت واقعی)
  const sh = await auth(initFor(9001, SHARED), codeA); assert.equal(sh.statusCode, 200);
  const real = (await ctx.pool.query("SELECT telegram_id FROM telegram_users WHERE telegram_id=9001")).rowCount; assert.equal(real, 1);
  // جعل: صاحب ربات اختصاصیِ الف برای «قربانی»ی واقعی (۴۲۴۲) که شماره‌اش با ربات مشترک تأیید شده امضا می‌سازد
  await ctx.pool.query("INSERT INTO telegram_users (telegram_id, first_name, phone, phone_verified_at) VALUES (4242,'قربانی','9121112233', now()) ON CONFLICT (telegram_id) DO UPDATE SET phone='9121112233', phone_verified_at=now()");
  const real4242 = await auth(initFor(4242, SHARED), codeA); assert.equal((await M(real4242.json().data.token)("me")).data.phoneVerified, true);
  const forged = await auth(initFor(4242, TG_A), codeA); assert.equal(forged.statusCode, 200);
  assert.equal((await M(forged.json().data.token)("me")).data.phoneVerified, false, "هویت جعلی به شمارهٔ تأییدشدهٔ حساب واقعی نمی‌رسد");
  assert.equal((await ctx.pool.query("SELECT count(*)::int AS n FROM telegram_users WHERE telegram_id=4242")).rows[0].n, 1, "حساب واقعی دست‌نخورده");
  // نشست ربات اختصاصی فقط همان کافی‌نت است
  assert.equal((await M(d.token)("orders")).status, 200);
});

test("اعلان با ربات درست: هویت مصنوعی ← ربات اختصاصی؛ هویت واقعی ← مشترک؛ کافی‌نت دیگر ← هیچ", async () => {
  const synthTg = Number((await ctx.pool.query("SELECT telegram_id FROM miniapp_identities WHERE cafe_id=$1 AND provider='telegram' AND raw_id=9001", [cafeA])).rows[0].telegram_id);
  const synthBale = Number((await ctx.pool.query("SELECT telegram_id FROM miniapp_identities WHERE cafe_id=$1 AND provider='bale' AND raw_id=9001", [cafeA])).rows[0].telegram_id);
  const bot = ctx.app.miniappBot;
  assert.equal(await bot.notifyCustomer(cafeA, synthTg, "📦 سفارش شما آماده است"), true);
  assert.equal(sentTo(TG_A, 9001).at(-1).text, "📦 سفارش شما آماده است"); assert.ok(!fake.st.sent.some((s) => s.token === SHARED && s.text.includes("آماده")));
  assert.equal(await bot.notifyCustomer(cafeA, synthBale, "پیام بله"), true); assert.equal(sentTo(BALE_A, 9001).at(-1).text, "پیام بله");
  assert.equal(await bot.notifyCustomer(cafeB, synthTg, "نباید برود"), false, "هویت مصنوعی فقط برای کافی‌نت خودش");
  // کاربر واقعی ربات مشترک
  await ctx.pool.query("UPDATE telegram_users SET chat_id=9001 WHERE telegram_id=9001");
  assert.equal(await bot.notifyCustomer(cafeA, 9001, "با ربات مشترک"), true); assert.equal(sentTo(SHARED, 9001).at(-1).text, "با ربات مشترک");
});

test("خاموش/روشن، بررسی دوباره، حذف: ورود و پرسش متوقف می‌شود؛ داده‌های کاربران می‌ماند", async () => {
  const off = await B("PATCH", "/telegram", { enabled: false }); assert.equal(off.status, 200); assert.equal(off.data.enabled, false);
  assert.equal((await B("PATCH", "/telegram", { enabled: "x" })).status, 422);
  assert.equal((await auth(initFor(9001, TG_A), codeA)).statusCode, 401, "خاموش: ورود ممکن نیست");
  fake.text(TG_A, 9003, "/start"); const n = fake.st.sent.length; await tick(); assert.equal(fake.st.sent.filter((s) => s.chat_id === 9003 && s.token === TG_A).length, 0, "خاموش: پرسش نمی‌شود"); void n;
  assert.equal((await B("PATCH", "/telegram", { enabled: true })).data.enabled, true);
  await tick(); assert.equal(sentTo(TG_A, 9003).length >= 1, true, "روشن: صف پردازش می‌شود");
  const chk = await B("POST", "/telegram/check"); assert.equal(chk.status, 200); assert.ok(chk.data.lastOkAt);
  // اجارهٔ فعال یعنی نمونهٔ دیگری در حال پردازش است
  await ctx.pool.query("UPDATE miniapp_cafe_bots SET lease_until = now() + interval '1 minute' WHERE cafe_id=$1 AND provider='telegram'", [cafeA]);
  fake.text(TG_A, 9004, "/start"); await tick(); assert.equal(sentTo(TG_A, 9004).length, 0, "اجاره‌شده پرسش نمی‌شود");
  await ctx.pool.query("UPDATE miniapp_cafe_bots SET lease_until = NULL WHERE cafe_id=$1", [cafeA]); await tick(); assert.ok(sentTo(TG_A, 9004).length >= 1);
  // حذف
  const idsBefore = (await ctx.pool.query("SELECT count(*)::int AS n FROM miniapp_identities WHERE cafe_id=$1", [cafeA])).rows[0].n;
  assert.equal((await B("DELETE", "/telegram")).status, 200); assert.equal((await B("DELETE", "/telegram")).status, 404);
  assert.equal((await B("GET", "")).data.providers[0].connected, false); assert.equal((await B("GET", "")).data.providers[1].connected, true);
  assert.equal((await auth(initFor(9001, TG_A), codeA)).statusCode, 401, "حذف‌شده");
  assert.equal((await ctx.pool.query("SELECT count(*)::int AS n FROM miniapp_identities WHERE cafe_id=$1", [cafeA])).rows[0].n, idsBefore, "هویت‌ها می‌ماند");
  // کافی‌نت ب حالا می‌تواند ربات حذف‌شده را بردارد؛ و کافی‌نت الف دیگر ربات ب را نه
  assert.equal((await O2("PUT", "/api/miniapp/cafe-bots/telegram", { token: TG_A })).status, 200, "ربات آزاد شد");
  assert.equal((await B("PUT", "/telegram", { token: TG_B })).status, 200);
});

test("info کافی‌نت: لینک QR به ربات اختصاصی اشاره می‌کند و ربات مشترک جدا می‌ماند", async () => {
  const i = await O("GET", "/api/miniapp/info");
  assert.equal(i.status, 200); assert.equal(i.data.serverEnabled, true);
  assert.equal(i.data.link, `https://t.me/bot_555555552?start=c_${codeA}`); assert.ok(i.data.sharedLink.includes("c_" + codeA) || i.data.sharedLink === "");
  assert.deepEqual(i.data.ownBots.map((b) => b.provider).sort(), ["bale", "telegram"]);
});

test("کافی‌نتی که هنوز کد مینی‌اپ نداشته: با اتصال ربات، کد ساخته می‌شود و دکمهٔ منوی ربات کد دارد", async () => {
  const c = client(ctx.app), r = await c.post("/api/auth/register", { email: "own3@cb.test", password: PW, firstName: "مالک", lastName: "ج", phone: "09121234567", shopName: "کافه‌ی ج" });
  const O3 = (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken });
  const cafeC = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه‌ی ج'")).rows[0].id;
  assert.equal((await ctx.pool.query("SELECT 1 FROM upload_settings WHERE cafe_id=$1", [cafeC])).rowCount, 0);
  const TG_C = "555555553:AATelegram_cafeC_token_for_tests_000003"; KNOWN.push(TG_C);
  const put = await O3("PUT", "/api/miniapp/cafe-bots/telegram", { token: TG_C }); assert.equal(put.status, 200, JSON.stringify(put.json));
  const code = (await ctx.pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeC])).rows[0]?.code;
  assert.ok(code, "کد ساخته شد"); assert.equal(put.data.startLink, `https://t.me/bot_555555553?start=c_${code}`);
  const menu = fake.st.calls.filter((x) => x.token === TG_C && x.method === "setChatMenuButton").at(-1);
  assert.ok(menu.b.menu_button.web_app.url.endsWith(`?c=${code}`));
  fake.text(TG_C, 8801, "/start"); await tick();
  assert.ok(sentTo(TG_C, 8801)[0]?.text.includes("کافه‌ی ج"), "ربات این کافی‌نت را می‌شناسد");
});
