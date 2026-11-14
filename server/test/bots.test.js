// ربات‌های گزارش بله/تلگرام (1.79). روی PostgreSQL واقعی + یک API جعلیِ سازگار با Bot API (سرور HTTP محلی).
// توجه: با بله و تلگرام واقعی آزمایش نشده است (شبکهٔ این محیط بسته است)؛ پروتکل (getMe/getUpdates/sendMessage) با سرور جعلی پوشش داده می‌شود.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { TOKEN_RE, decryptToken, encryptToken, parseCommand, money, fmtDate, toJalali, formatReport, localNow, faDigits, hashCode, normalizeCode } from "../src/lib/bots.js";

const PW = "رمز-خیلی-قوی-۱۲۳";
const TOKEN_T = "111111111:AAH-telegram_token_for_tests_0001", TOKEN_B = "222222222:bale_token_for_tests_zz9999aa00", TOKEN_BAD = "333333333:not_a_real_token_for_tests_xxxxxx";
let url, ctx, O, O2, M, S, fake, srv, cafeId1, cafeId2;

// ── Bot API جعلی ──────────────────────────────────────────────────────────────────────────────────────────────────────
function makeFake() {
  const st = { tokens: { [TOKEN_T]: { id: 111111111, username: "cafino_t_bot", first_name: "کافینو تلگرام" }, [TOKEN_B]: { id: 222222222, username: "cafino_b_bot", first_name: "کافینو بله" } },
    queue: {}, sent: [], calls: [], uid: 100, failSend: null, hits: { getUpdates: 0 }, revoked: new Set(), slowUpdates: 0 };
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url), reply = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (!m) return reply({ ok: false, error_code: 404, description: "Not Found" }, 404);
      const [, token, method] = m, bot = st.tokens[token], b = body ? JSON.parse(body) : {};
      st.calls.push({ token, method, b });
      if (!bot || st.revoked.has(token)) return reply({ ok: false, error_code: 401, description: `Unauthorized (${token})` }, 401);
      if (method === "getMe") return reply({ ok: true, result: bot });
      if (method === "deleteWebhook") return reply({ ok: true, result: true });
      if (method === "getUpdates") {
        st.hits.getUpdates++; const q = (st.queue[token] ||= []);
        if (b.offset < 0) return reply({ ok: true, result: q.slice(-1) });
        return reply({ ok: true, result: q.filter((u) => u.update_id >= (b.offset || 0)).slice(0, b.limit || 20) });
      }
      if (method === "sendMessage") {
        if (st.failSend) return reply(st.failSend.body, st.failSend.code);
        st.sent.push({ token, chat_id: String(b.chat_id), text: b.text, parse_mode: b.parse_mode }); return reply({ ok: true, result: { message_id: st.sent.length } });
      }
      return reply({ ok: false, error_code: 404, description: "no method" }, 404);
    });
  });
  return { st, server, say(token, chatId, text, chat = {}) { const q = (st.queue[token] ||= []); q.push({ update_id: ++st.uid, message: { message_id: st.uid, text, chat: { id: chatId, type: "private", first_name: "علی", ...chat } } }); }, sentTo: (chatId, token) => st.sent.filter((s) => s.chat_id === String(chatId) && (!token || s.token === token)) };
}

before(async () => {
  url = await startDb(); fake = makeFake();
  await new Promise((ok) => fake.server.listen(0, "127.0.0.1", ok)); srv = `http://127.0.0.1:${fake.server.address().port}`;
  ctx = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", BOTS_ENABLED: "false", TELEGRAM_API_BASE: srv, BALE_API_BASE: srv, BOT_TZ: "Asia/Tehran" } });
  const reg = async (email, shop) => { const c = client(ctx.app), r = await c.post("/api/auth/register", { email, password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: shop }); assert.equal(r.status, 201, JSON.stringify(r.json)); return (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }); };
  O = await reg("own@bots.test", "کافه‌ی بات"); O2 = await reg("own2@bots.test", "کافه‌ی دیگر");
  const inv = await O("POST", "/api/users/invite", { email: "staff@bots.test", role: "staff", firstName: "ک", lastName: "۱" });
  const cc = client(ctx.app), lg = await cc.post("/api/auth/login", { email: "staff@bots.test", password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email: "staff@bots.test", password: PW }); S = (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
  cafeId1 = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه‌ی بات'")).rows[0].id; cafeId2 = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه‌ی دیگر'")).rows[0].id;
});
after(async () => { await ctx.app.close(); await ctx.pool.end(); await new Promise((ok) => fake.server.close(ok)); await stopDb(); });
const tick = () => ctx.app.bots.tick();
const row = async (cafe, p) => (await ctx.pool.query("SELECT * FROM bot_connections WHERE cafe_id=$1 AND provider=$2", [cafe, p])).rows[0];
const linkChat = async (api, token, provider, chatId, owner = O) => {
  const l = await owner("POST", `/api/bots/${provider}/link`); assert.equal(l.status, 200, JSON.stringify(l.json));
  fake.say(token, chatId, l.data.command); await tick();
  return l.data;
};

// ── واحد: توابع خالص ─────────────────────────────────────────────────────────────────────────────────────────────────
test("واحد: فرمان‌ها، پول، تاریخ شمسی و قالب گزارش", () => {
  assert.deepEqual(parseCommand("/today@MyBot"), { cmd: "today", arg: "" }); assert.deepEqual(parseCommand("امروز"), { cmd: "today", arg: "" });
  assert.deepEqual(parseCommand("/start AB12-CD34"), { cmd: "start", arg: "AB12-CD34" }); assert.equal(parseCommand("/rm -rf"), null); assert.equal(parseCommand("سلام"), null); assert.equal(parseCommand(""), null); assert.equal(parseCommand(null), null);
  assert.equal(money(12345670), "۱٬۲۳۴٬۵۶۷ تومان"); assert.equal(money(-50, "rial"), "−۵۰ ریال"); assert.equal(money(0), "۰ تومان");
  assert.deepEqual(toJalali(2026, 11, 13), [1405, 8, 22]); assert.deepEqual(toJalali(2025, 3, 21), [1404, 1, 1]); assert.equal(fmtDate("2026-11-13", true), "۲۲ آبان ۱۴۰۵ (جمعه)");
  assert.match(localNow("Asia/Tehran").date, /^\d{4}-\d{2}-\d{2}$/); assert.equal(faDigits("a1b2"), "a۱b۲");
  assert.equal(normalizeCode("ab12-cd34"), "AB12CD34"); assert.equal(hashCode("ab12-cd34"), hashCode("AB12CD34"));
  assert.ok(TOKEN_RE.test(TOKEN_T) && !TOKEN_RE.test("abc") && !TOKEN_RE.test("1:short") && !TOKEN_RE.test(`${TOKEN_T}\n/../x`));
  const txt = formatReport({ revenue: 5e6, invoiceCount: 3, discount: 0, collected: 4e6, income: 0, expense: 1e6, netCash: 3e6, receivable: 2e6, openInvoices: 1, topCustomers: [], lowStock: [{ name: "کاغذ‮A4", qty: 2, minQty: 5 }] }, { range: "today", cafeName: "کافه\u0000ی من", today: "2026-11-13" });
  assert.match(txt, /گزارش امروز — کافه ی من/); assert.match(txt, /۵۰۰٬۰۰۰ تومان \(۳ فاکتور\)/); assert.match(txt, /کاغذ A4: ۲/); assert.ok(!/[‮\u0000]/.test(txt));
});
test("واحد: رمزنگاری توکن — رفت‌وبرگشت، AAD و دست‌کاری", () => {
  const cfg = { jwtSecret: "k".repeat(40) }, e = encryptToken(cfg, TOKEN_T, "c:telegram");
  assert.ok(!e.includes(TOKEN_T) && e.startsWith("v1.")); assert.equal(decryptToken(cfg, e, "c:telegram"), TOKEN_T);
  assert.throws(() => decryptToken(cfg, e, "other:telegram")); assert.throws(() => decryptToken({ jwtSecret: "z".repeat(40) }, e, "c:telegram"));
  const p = e.split("."); p[3] = Buffer.from("xxxxxxxxxxxxxxxxxxxxxxxx").toString("base64url"); assert.throws(() => decryptToken(cfg, p.join("."), "c:telegram"));
  assert.notEqual(encryptToken(cfg, TOKEN_T), encryptToken(cfg, TOKEN_T), "IV تصادفی");
});

// ── مجوز و اتصال ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("مجوز: کارمند ۴۰۳؛ مالک مجاز؛ پیام‌رسان ناشناخته ۴۰۴؛ بدون ورود ۴۰۱", async () => {
  assert.equal((await S("GET", "/api/bots")).status, 403); assert.equal((await S("PUT", "/api/bots/bale", { token: TOKEN_B })).status, 403);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/bots" })).statusCode, 401);
  const g = await O("GET", "/api/bots"); assert.equal(g.status, 200);
  assert.deepEqual(g.data.providers.map((p) => [p.provider, p.connected]), [["telegram", false], ["bale", false]]); assert.equal(g.data.schedulerOn, false);
  assert.equal((await O("PUT", "/api/bots/signal", { token: TOKEN_T })).status, 404);
  assert.equal((await O("POST", "/api/bots/telegram/link")).status, 404, "بدون اتصال");
});
test("اتصال: توکن بد (قالب/نامعتبر)، اتصال درست، توکن هرگز برنمی‌گردد و در پایگاه رمزنگاری‌شده است", async () => {
  for (const bad of ["", "abc", "123:short", `${TOKEN_T} x`, `x${TOKEN_T}`, 5]) assert.equal((await O("PUT", "/api/bots/telegram", { token: bad })).status, 422, String(bad));
  const nope = await O("PUT", "/api/bots/telegram", { token: TOKEN_BAD }); assert.equal(nope.status, 422); assert.equal(nope.json.error.code, "bot_bad_token"); assert.ok(!JSON.stringify(nope.json).includes(TOKEN_BAD), "توکن در خطا نیست");
  const r = await O("PUT", "/api/bots/telegram", { token: TOKEN_T }); assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.data.connected, true); assert.equal(r.data.botUsername, "cafino_t_bot"); assert.equal(r.data.tokenHint, TOKEN_T.slice(-4)); assert.equal(r.data.linked, false);
  assert.equal(r.data.botLink, "https://t.me/cafino_t_bot"); assert.ok(!JSON.stringify(r.json).includes(TOKEN_T));
  assert.ok(!JSON.stringify((await O("GET", "/api/bots")).json).includes(TOKEN_T));
  const db = await row(cafeId1, "telegram"); assert.ok(!db.token_enc.includes(TOKEN_T)); assert.equal(decryptToken(ctx.cfg, db.token_enc, `${cafeId1}:telegram`), TOKEN_T);
  assert.throws(() => decryptToken(ctx.cfg, db.token_enc, `${cafeId2}:telegram`), "انتقال رمزنگاشته به کافی‌نت دیگر کار نمی‌کند");
  assert.ok(fake.st.calls.some((c) => c.method === "deleteWebhook"));
  assert.equal((await O("PUT", "/api/bots/bale", { token: TOKEN_B })).data.botLink, "https://ble.ir/cafino_b_bot");
  assert.equal((await O2("GET", "/api/bots")).data.providers.every((p) => !p.connected), true, "کافی‌نت دیگر چیزی نمی‌بیند");
});

// ── پیوند چت ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("پیوند: چت ناشناس بدون کد جواب فرمان نمی‌گیرد؛ کد غلط؛ ۵ بار غلط → باطل؛ کد درست → پیوند", async () => {
  const n0 = fake.st.hits.getUpdates; fake.say(TOKEN_T, 900, "/today"); await tick(); assert.equal(fake.st.hits.getUpdates, n0, "بدون کد پیوند و بدون چت، اصلاً صف دریافت نمی‌شود");
  const l = await O("POST", "/api/bots/telegram/link");
  fake.say(TOKEN_T, 900, "/debts"); await tick(); assert.equal(fake.sentTo(900).length, 0, "چت پیوندنخورده: سکوت");
  fake.say(TOKEN_T, 900, "/start"); await tick(); assert.match(fake.sentTo(900).at(-1).text, /اتصال/); assert.equal(l.status, 200); assert.match(l.data.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.equal(l.data.command, `/start ${l.data.code.replace("-", "")}`);
  assert.match(l.data.botLink, new RegExp(`^https://t.me/cafino_t_bot\\?start=${l.data.code.replace("-", "")}$`));
  assert.ok(!(await row(cafeId1, "telegram")).link_hash.includes(l.data.code.replace("-", "")), "فقط هش کد ذخیره می‌شود");
  fake.say(TOKEN_T, 900, "/start WRONGCODE"); await tick(); assert.match(fake.sentTo(900).at(-1).text, /نادرست/); assert.equal((await row(cafeId1, "telegram")).chat_id, null);
  for (let i = 0; i < 4; i++) fake.say(TOKEN_T, 900, `/start BADBAD0${i}`); await tick();
  assert.match(fake.sentTo(900).at(-1).text, /باطل/); assert.equal((await row(cafeId1, "telegram")).link_hash, null);
  fake.say(TOKEN_T, 900, `/start ${l.data.code}`); await tick(); assert.equal((await row(cafeId1, "telegram")).chat_id, null, "کد صحیحِ باطل‌شده هم دیگر کار نمی‌کند");
  const l2 = await O("POST", "/api/bots/telegram/link"); fake.say(TOKEN_T, 901, `/start ${l2.data.code.toLowerCase()}`, { first_name: "حامد", last_name: "الف" }); await tick();
  const st = (await O("GET", "/api/bots")).data.providers[0]; assert.equal(st.linked, true); assert.equal(st.chatTitle, "حامد الف"); assert.equal(st.linkPending, false);
  assert.match(fake.sentTo(901).at(-1).text, /وصل شد[\s\S]*\/today/); assert.match(fake.sentTo(901).at(-1).text, /کافه‌ی بات/);
  fake.say(TOKEN_T, 901, `/start ${l2.data.code}`); await tick(); assert.ok(!/وصل شد/.test(fake.sentTo(901).at(-1).text) || fake.sentTo(901).filter((s) => /وصل شد/.test(s.text)).length === 1, "کد یک‌بارمصرف است");
});
test("پیوند: کد منقضی پذیرفته نمی‌شود", async () => {
  await O("PUT", "/api/bots/bale", { token: TOKEN_B }); const l = await O("POST", "/api/bots/bale/link");
  await ctx.pool.query("UPDATE bot_connections SET link_expires_at = now() - interval '1 minute' WHERE cafe_id=$1 AND provider='bale'", [cafeId1]);
  fake.say(TOKEN_B, 950, l.data.command); await tick(); assert.match(fake.sentTo(950).at(-1).text, /منقضی/); assert.equal((await row(cafeId1, "bale")).chat_id, null);
  assert.equal((await O("GET", "/api/bots")).data.providers[1].linkPending, false);
});

// ── فرمان‌ها ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("فرمان‌ها: فقط از چت پیوندخورده؛ گزارش واقعی از داده‌ها؛ بدهکاران و موجودی", async () => {
  const today = localNow("Asia/Tehran").date;
  assert.equal((await O("POST", "/api/customers", { id: "cb1", firstName: "رضا", lastName: "کریمی" })).status, 201);
  const a = await O("POST", "/api/invoices", { id: "ib1", number: "1", customerId: "cb1", customerName: "رضا کریمی", date: today, items: [{ description: "پرینت", quantity: 2, unitPrice: 50000 }] }); assert.equal(a.status, 201, JSON.stringify(a.json));
  assert.equal((await O("POST", "/api/payments", { id: "pb1", invoiceId: "ib1", amount: 40000, method: "cash", date: today })).status, 201);
  await ctx.pool.query("INSERT INTO inventory (cafe_id,id,name,qty,min_qty) VALUES ($1,'k1','کاغذ A4',2,10),($1,'k2','جوهر',50,5)", [cafeId1]);
  const n0 = fake.sentTo(901).length;
  fake.say(TOKEN_T, 901, "/today"); fake.say(TOKEN_T, 901, "بدهکاران"); fake.say(TOKEN_T, 901, "/stock@cafino_t_bot"); fake.say(TOKEN_T, 902, "/today"); fake.say(TOKEN_T, 901, "چرت و پرت"); await tick();
  const got = fake.sentTo(901).slice(n0).map((s) => s.text);
  assert.equal(got.length, 3, "سه فرمان معتبر → سه پاسخ؛ متن نامربوط جواب ندارد"); assert.equal(fake.sentTo(902).length, 0, "چت دیگر (پیوندنخورده) پاسخ نمی‌گیرد");
  assert.match(got[0], /گزارش امروز — کافه‌ی بات/); assert.match(got[0], /فروش: ۱۰٬۰۰۰ تومان \(۱ فاکتور\)/); assert.match(got[0], /دریافتی: ۴٬۰۰۰ تومان/); assert.match(got[0], /مطالبات باز \(کل\): ۶٬۰۰۰ تومان/); assert.match(got[0], /کاغذ A4: ۲ \(حداقل ۱۰\)/); assert.ok(!/جوهر/.test(got[0]));
  assert.match(got[1], /رضا کریمی: ۶٬۰۰۰ تومان \(۱ فاکتور\)/); assert.match(got[2], /کاغذ A4/); assert.ok(fake.st.sent.every((s) => s.parse_mode === undefined), "متن ساده؛ بدون parse_mode");
  fake.say(TOKEN_T, 901, "/week"); fake.say(TOKEN_T, 901, "/month"); fake.say(TOKEN_T, 901, "/yesterday"); await tick();
  const w = fake.sentTo(901).slice(n0 + 3).map((s) => s.text); assert.match(w[0], /۷ روز اخیر/); assert.match(w[0], /مشتریان برتر[\s\S]*رضا کریمی/); assert.match(w[1], /۳۰ روز/); assert.match(w[2], /دیروز/); assert.match(w[2], /فروش: ۰ تومان/);
});
test("فرمان‌ها: واحد ریال، خاموش‌کردن فرمان‌ها، هر به‌روزرسانی فقط یک‌بار پردازش می‌شود", async () => {
  assert.equal((await O("PATCH", "/api/bots/telegram", { currency: "euro" })).status, 422);
  assert.equal((await O("PATCH", "/api/bots/telegram", { currency: "rial" })).data.currency, "rial");
  const n = fake.sentTo(901).length; fake.say(TOKEN_T, 901, "/today"); await tick(); await tick(); assert.equal(fake.sentTo(901).length, n + 1, "ایدمپوتنت: آفست جلو می‌رود");
  assert.match(fake.sentTo(901).at(-1).text, /فروش: ۱۰۰٬۰۰۰ ریال/);
  await O("PATCH", "/api/bots/telegram", { currency: "toman", commandsEnabled: false }); fake.say(TOKEN_T, 901, "/today"); await tick(); assert.equal(fake.sentTo(901).length, n + 1, "فرمان‌ها خاموش");
  await O("PATCH", "/api/bots/telegram", { commandsEnabled: true }); await tick(); assert.equal(fake.sentTo(901).length, n + 1, "فرمانِ زمانِ خاموشی بعد از روشن‌شدن بازپخش نمی‌شود");
  fake.say(TOKEN_T, 901, "/today"); await tick(); assert.equal(fake.sentTo(901).length, n + 2, "بعد از روشن‌شدن دوباره جواب می‌دهد");
});
test("هم‌زمانی: دو tick هم‌زمان یک فرمان را فقط یک‌بار پاسخ می‌دهند (اجاره)", async () => {
  await ctx.pool.query("UPDATE bot_connections SET update_offset=(SELECT COALESCE(MAX(update_offset),0) FROM bot_connections) WHERE false");
  const n = fake.sentTo(901).length; fake.say(TOKEN_T, 901, "/stock"); await Promise.all([tick(), tick(), tick()]);
  assert.equal(fake.sentTo(901).length, n + 1);
});

// ── گزارش روزانه ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("گزارش روزانه: بدون چت رد؛ ساعت نامعتبر رد؛ زمان‌نرسیده نمی‌رود؛ رسیده یک‌بار می‌رود؛ فردا دوباره", async () => {
  assert.equal((await O("PATCH", "/api/bots/bale", { dailyEnabled: true })).status, 422, "بله هنوز پیوند ندارد");
  for (const t of ["25:00", "9:00", "21:60", "", 5]) assert.equal((await O("PATCH", "/api/bots/telegram", { dailyTime: t })).status, 422, String(t));
  const now = localNow("Asia/Tehran"), late = now.hhmm === "23:59" ? "23:58" : "23:59"; if (now.hhmm >= late) return;
  await O("PATCH", "/api/bots/telegram", { dailyEnabled: true, dailyTime: late }); let n = fake.sentTo(901).length; await tick(); assert.equal(fake.sentTo(901).length, n, "هنوز زمانش نرسیده");
  await O("PATCH", "/api/bots/telegram", { dailyTime: "00:00" }); await tick(); assert.equal(fake.sentTo(901).length, n + 1); assert.match(fake.sentTo(901).at(-1).text, /گزارش امروز/);
  assert.equal((await O("GET", "/api/bots")).data.providers[0].lastDailyDate, now.date); await tick(); await tick(); assert.equal(fake.sentTo(901).length, n + 1, "همان روز دوباره نمی‌رود");
  await ctx.pool.query("UPDATE bot_connections SET last_daily_date = last_daily_date - 1 WHERE cafe_id=$1 AND provider='telegram'", [cafeId1]); await tick(); assert.equal(fake.sentTo(901).length, n + 2, "روز بعد دوباره");
});
test("گزارش روزانه: خطای ارسال → ثبت خطا و تلاش دوباره (نه ازدست‌رفتن)", async () => {
  await ctx.pool.query("UPDATE bot_connections SET last_daily_date = NULL WHERE cafe_id=$1 AND provider='telegram'", [cafeId1]); const n = fake.sentTo(901).length;
  fake.st.failSend = { code: 429, body: { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 7 } } }; await tick();
  let r = await row(cafeId1, "telegram"); assert.equal(r.last_daily_date, null); assert.ok(r.daily_retry_at && new Date(r.daily_retry_at) > new Date()); assert.match(r.last_error, /Too Many/); assert.ok(r.next_try_at);
  fake.st.failSend = null; await ctx.pool.query("UPDATE bot_connections SET daily_retry_at=NULL, next_try_at=NULL WHERE cafe_id=$1 AND provider='telegram'", [cafeId1]); await tick();
  assert.equal(fake.sentTo(901).length, n + 1); r = await row(cafeId1, "telegram"); assert.equal(r.last_error, ""); assert.ok(r.last_daily_date);
});

// ── ارسال فوری، آزمایش، خطاها ────────────────────────────────────────────────────────────────────────────────────────
test("ارسال فوری و پیام آزمایشی؛ بازهٔ بد رد؛ خطای API → ۵۰۲ بدون نشت توکن", async () => {
  const n = fake.sentTo(901).length;
  assert.equal((await O("POST", "/api/bots/telegram/test")).status, 200); assert.match(fake.sentTo(901).at(-1).text, /آزمایشی/);
  assert.equal((await O("POST", "/api/bots/telegram/send", { range: "week" })).status, 200); assert.match(fake.sentTo(901).at(-1).text, /۷ روز/); assert.equal(fake.sentTo(901).length, n + 2);
  assert.equal((await O("POST", "/api/bots/telegram/send", { range: "year" })).status, 422);
  assert.equal((await S("POST", "/api/bots/telegram/test")).status, 403);
  fake.st.failSend = { code: 403, body: { ok: false, error_code: 403, description: `Forbidden: bot was blocked by the user ${TOKEN_T}` } };
  const f = await O("POST", "/api/bots/telegram/test"); assert.equal(f.status, 502); assert.ok(!JSON.stringify(f.json).includes(TOKEN_T), "توکن اسکراب می‌شود");
  assert.ok(!(await row(cafeId1, "telegram")).last_error.includes(TOKEN_T)); fake.st.failSend = null;
  assert.equal((await O("POST", "/api/bots/bale/test")).status, 409, "بله چت ندارد");
});
test("توکن باطل‌شده (۴۰۱): ربات غیرفعال و علت ثبت می‌شود؛ تعویض توکن همان ربات، پیوند را نگه می‌دارد", async () => {
  fake.st.revoked.add(TOKEN_T); await tick();
  let r = await row(cafeId1, "telegram"); assert.equal(r.enabled, false); assert.match(r.last_error, /نامعتبر|باطل/); assert.ok(!r.last_error.includes(TOKEN_T));
  fake.st.revoked.delete(TOKEN_T);
  const re = await O("PUT", "/api/bots/telegram", { token: TOKEN_T }); assert.equal(re.data.enabled, true); assert.equal(re.data.linked, true, "همان ربات؛ چت می‌ماند"); assert.equal(re.data.lastError, "");
  fake.st.tokens["444444444:other_bot_token_for_tests_abcdef12"] = { id: 444444444, username: "other_bot", first_name: "دیگر" };
  const sw = await O("PUT", "/api/bots/telegram", { token: "444444444:other_bot_token_for_tests_abcdef12" }); assert.equal(sw.data.botUsername, "other_bot"); assert.equal(sw.data.linked, false, "ربات دیگر؛ پیوند پاک می‌شود");
  await O("PUT", "/api/bots/telegram", { token: TOKEN_T });
});
test("خطای شبکه: پیام فارسی و بدون نشت؛ سرور ناپایدار tick را نمی‌شکند", async () => {
  const dead = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", BOTS_ENABLED: "false", TELEGRAM_API_BASE: "http://127.0.0.1:9", BALE_API_BASE: "http://127.0.0.1:9" } });
  try { const c = client(dead.app), r = await c.post("/api/auth/register", { email: "dead@bots.test", password: PW, firstName: "م", lastName: "ا", phone: "09121234567", shopName: "مرده" });
    const o = (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }); const res = await o("PUT", "/api/bots/telegram", { token: TOKEN_T });
    assert.equal(res.status, 502); assert.match(res.json.error.message, /اتصال سرور به تلگرام/); assert.match(res.json.error.message, /TELEGRAM_API_BASE/); assert.ok(!JSON.stringify(res.json).includes(TOKEN_T)); await dead.app.bots.tick();
  } finally { await dead.app.close(); await dead.pool.end(); }
});

// ── جداسازی، قطع اتصال، ممیزی ────────────────────────────────────────────────────────────────────────────────────────
test("جداسازی کافی‌نت‌ها: تنظیمات/ارسال/حذفِ کافی‌نت دیگر روی ربات من اثر ندارد", async () => {
  assert.equal((await O2("PATCH", "/api/bots/telegram", { enabled: false })).status, 404); assert.equal((await O2("POST", "/api/bots/telegram/send", { range: "today" })).status, 404); assert.equal((await O2("DELETE", "/api/bots/telegram")).status, 404);
  assert.equal((await row(cafeId1, "telegram")).enabled, true);
  await O2("PUT", "/api/bots/telegram", { token: TOKEN_T }); fake.say(TOKEN_T, 901, "/today"); await tick();   // همان ربات برای دو کافی‌نت: چت ۹۰۱ فقط به کافی‌نت اول پیوند دارد
  assert.equal((await row(cafeId2, "telegram")).chat_id, null);
  await O2("DELETE", "/api/bots/telegram");
});
test("جداکردن چت و حذف اتصال؛ ممیزی بدون توکن", async () => {
  const u = await O("POST", "/api/bots/telegram/unlink"); assert.equal(u.data.linked, false); assert.equal(u.data.dailyEnabled, false);
  const n = fake.sentTo(901).length; fake.say(TOKEN_T, 901, "/today"); await tick(); assert.equal(fake.sentTo(901).length, n, "بعد از جداشدن پاسخی نیست");
  assert.equal((await O("DELETE", "/api/bots/bale")).data.connected, false); assert.equal(await row(cafeId1, "bale"), undefined);
  const a = (await ctx.pool.query("SELECT action, details FROM audit_log WHERE cafe_id=$1 AND action LIKE 'bot.%' ORDER BY id", [cafeId1])).rows;
  for (const x of ["bot.connect", "bot.link_code", "bot.settings", "bot.unlink", "bot.disconnect", "bot.test", "bot.send_report"]) assert.ok(a.some((r) => r.action === x), x);
  assert.ok(!JSON.stringify(a).includes(TOKEN_T) && !JSON.stringify(a).includes(TOKEN_B), "توکن در ممیزی نیست");
});
