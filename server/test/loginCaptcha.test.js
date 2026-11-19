// کپچای ورود (۱۰ تست): فقط بعد از شکست‌های پیاپی، یکسان برای ایمیل موجود/ناموجود، یک‌بارمصرف، ارقام فارسی، بدون قفل‌کردن حساب دیگران.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { createLoginGuard, normalizeAnswer, renderSvg, solveForTest } from "../src/lib/loginCaptcha.js";

let ctx;
const PW = "رمز-خیلی-قوی-۱۲۳";
const ip = (n) => `10.0.${n}.1`;
before(async () => {
  ctx = await makeApp(await startDb(), { env: { CAPTCHA_AFTER_FAILS: "3" } });
  const r = await client(ctx.app).post("/api/auth/register", { email: "cap@cafe.test", password: PW, firstName: "ع", lastName: "ر", phone: "09121234567", shopName: "کپچا" });
  assert.equal(r.status, 201);
});
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); });

const login = (email, password, extra = {}, remoteAddress = "198.51.100.1") => ctx.app.inject({ method: "POST", url: "/api/auth/login", remoteAddress, headers: { "content-type": "application/json" }, payload: { email, password, ...extra } }).then((r) => ({ status: r.statusCode, json: r.body ? JSON.parse(r.body) : null }));
const fetchCaptcha = async (remoteAddress = "198.51.100.1") => { const r = await ctx.app.inject({ method: "GET", url: "/api/auth/captcha", remoteAddress }); return { status: r.statusCode, data: JSON.parse(r.body).data, headers: r.headers }; };
const solved = async (remoteAddress) => { const c = await fetchCaptcha(remoteAddress); return { captchaId: c.data.id, captchaAnswer: solveForTest(ctx.cfg, c.data.id) }; };

test("ورود عادی بدون کپچا کار می‌کند و تا ۳ شکست کپچا نمی‌خواهد", async () => {
  for (let i = 0; i < 2; i++) { const r = await login("cap@cafe.test", "bad-password-1", {}, ip(1)); assert.equal(r.json.error.code, "unauthorized", "دو شکست: هنوز کپچا نمی‌خواهد"); }
  assert.equal((await login("cap@cafe.test", PW, {}, ip(1))).status, 200);
  const g = await fetchCaptcha(ip(1)); assert.equal(g.status, 200);
});
test("بعد از ۳ شکست از یک IP: کپچا لازم است (حتی با رمز درست)؛ پاسخ ایمیل موجود و ناموجود یکسان است", async () => {
  for (let i = 0; i < 3; i++) await login("nobody1@cafe.test", "bad-password-1", {}, ip(3));
  const a = await login("cap@cafe.test", PW, {}, ip(3));            // رمز درست ولی IP مشکوک
  const b = await login("ghost@cafe.test", "bad-password-1", {}, ip(3));
  assert.equal(a.status, 403); assert.equal(a.json.error.code, "captcha_required");
  assert.equal(b.status, 403); assert.deepEqual(b.json.error, a.json.error, "ایمیل موجود/ناموجود از هم تشخیص‌داده نشود");
});
test("با کپچای درست، ورود درست پذیرفته می‌شود؛ ارقام فارسی هم قبول است", async () => {
  const c = await solved(ip(3));
  const fa = c.captchaAnswer.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const r = await login("cap@cafe.test", PW, { captchaId: c.captchaId, captchaAnswer: fa }, ip(3));
  assert.equal(r.status, 200, JSON.stringify(r.json));
});
test("کپچای غلط/منقضی/دوباره‌مصرف → captcha_invalid؛ هر توکن فقط یک حدس دارد", async () => {
  for (let i = 0; i < 3; i++) await login("nobody2@cafe.test", "bad-password-1", {}, ip(4));
  const c = await fetchCaptcha(ip(4)); const right = solveForTest(ctx.cfg, c.data.id); const wrong = right === "00000" ? "00001" : "00000";
  assert.equal((await login("cap@cafe.test", PW, { captchaId: c.data.id, captchaAnswer: wrong }, ip(4))).json.error.code, "captcha_invalid");
  assert.equal((await login("cap@cafe.test", PW, { captchaId: c.data.id, captchaAnswer: right }, ip(4))).json.error.code, "captcha_invalid", "همان توکن بعد از یک حدس سوخته است");
  assert.equal((await login("cap@cafe.test", PW, { captchaId: "x.y.z.w", captchaAnswer: "12345" }, ip(4))).json.error.code, "captcha_invalid");
  assert.equal((await login("cap@cafe.test", PW, { captchaId: c.data.id, captchaAnswer: "12" }, ip(4))).json.error.code, "captcha_invalid");
  const ok = await solved(ip(4)); assert.equal((await login("cap@cafe.test", PW, ok, ip(4))).status, 200);
  assert.equal((await login("cap@cafe.test", PW, ok, ip(4))).json.error.code, "captcha_invalid", "موفق‌شدن هم توکن را مصرف می‌کند");
});
test("کپچای غلط «شکست رمز» حساب نمی‌شود: نمی‌توان حساب دیگری را با کپچای غلط قفل کرد", async () => {
  await ctx.pool.query("UPDATE users SET failed_logins=0, locked_until=NULL WHERE email='cap@cafe.test'");
  for (let i = 0; i < 3; i++) await login("nobody3@cafe.test", "bad-password-1", {}, ip(5));
  for (let i = 0; i < 20; i++) await login("cap@cafe.test", "bad-password-1", { captchaId: "bad", captchaAnswer: "11111" }, ip(5));
  const u = (await ctx.pool.query("SELECT failed_logins, locked_until FROM users WHERE email='cap@cafe.test'")).rows[0];
  assert.equal(u.failed_logins, 0); assert.equal(u.locked_until, null);
});
test("حدس رمز با کپچای درست همچنان شمارش و قفل حساب را پیش می‌برد", async () => {
  await ctx.pool.query("UPDATE users SET failed_logins=0, locked_until=NULL WHERE email='cap@cafe.test'");
  for (let i = 0; i < 3; i++) await login("nobody4@cafe.test", "bad-password-1", {}, ip(6));
  let last; for (let i = 0; i < 8; i++) last = await login("cap@cafe.test", "bad-password-1", await solved(ip(6)), ip(6));
  assert.equal(last.json.error.code, "unauthorized");
  const r = await login("cap@cafe.test", PW, await solved(ip(6)), ip(6));
  assert.equal(r.status, 429); assert.equal(r.json.error.code, "account_locked");
  await ctx.pool.query("UPDATE users SET failed_logins=0, locked_until=NULL WHERE email='cap@cafe.test'");
});
test("شمارندهٔ هر ایمیل از IP دیگر هم کپچا را روشن می‌کند؛ ورود موفق فقط شمارندهٔ همان ایمیل را پاک می‌کند", async () => {
  for (let i = 0; i < 3; i++) await login("cap@cafe.test", "bad-password-1", {}, ip(7 + i));   // سه IP متفاوت، یک ایمیل
  assert.equal((await login("cap@cafe.test", PW, {}, ip(20))).json.error.code, "captcha_required");
  assert.equal((await login("cap@cafe.test", PW, await solved(ip(20)), ip(20))).status, 200);
  assert.equal((await login("cap@cafe.test", PW, {}, ip(21))).status, 200, "بعد از موفقیت، شمارندهٔ ایمیل صفر شد");
});
test("GET /api/auth/captcha: تصویر SVG (data-URI)، no-store، و پیش‌فرض آزمون‌ها خاموش است", async () => {
  const c = await fetchCaptcha(ip(30));
  assert.equal(c.status, 200); assert.match(c.data.image, /^data:image\/svg\+xml;base64,/); assert.equal(c.data.expiresIn, 300); assert.match(c.headers["cache-control"], /no-store/);
  const svg = Buffer.from(c.data.image.split(",")[1], "base64").toString();
  assert.match(svg, /^<svg /); assert.equal((svg.match(/<text /g) || []).length, 5);
  const off = await makeApp(ctx.cfg.databaseUrl, { env: { CAPTCHA_AFTER_FAILS: "0" } });
  try { assert.equal((await off.app.inject({ method: "GET", url: "/api/auth/captcha" })).statusCode, 404); } finally { await off.app.close(); await off.pool.end(); }
});
test("واحد: نرمال‌سازی پاسخ، انقضا، امضای دست‌کاری‌شده، و پاسخ در توکن/تصویر نشت نمی‌کند", () => {
  assert.equal(normalizeAnswer(" ۱۲ ۳۴۵ "), "12345"); assert.equal(normalizeAnswer("٠١٢٣٤"), "01234"); assert.equal(normalizeAnswer("1234"), ""); assert.equal(normalizeAnswer("12a45"), "");
  let t = 1_000_000; const g = createLoginGuard({ jwtSecret: "k".repeat(40), captchaAfterFails: 3 }, { now: () => t });
  const c = g.challenge(); const ans = solveForTest({ jwtSecret: "k".repeat(40) }, c.id);
  assert.ok(ans.length === 5 && !c.id.split(".").slice(0, 3).some((p) => p === ans), "پاسخ ساده در توکن نیست");
  const tampered = c.id.replace(/\.[0-9a-f]{64}$/, `.${"0".repeat(64)}`); assert.equal(g.verify(tampered, ans).ok, false);
  t += 6 * 60 * 1000; assert.deepEqual(g.verify(c.id, ans), { ok: false, reason: "expired" });
  const c2 = g.challenge(); assert.equal(g.verify(c2.id, solveForTest({ jwtSecret: "k".repeat(40) }, c2.id)).ok, true);
  assert.equal(g.verify("", "").reason, "missing");
  assert.ok(!renderSvg("48271").includes("48271"), "ارقام نباید پشت‌سرهم در متن SVG بیایند");
});
test("پنجرهٔ ۱۵ دقیقه‌ای: شمارش شکست‌ها بعد از پنجره صفر می‌شود و سقف حافظه رعایت می‌شود", () => {
  let t = 0; const g = createLoginGuard({ jwtSecret: "k".repeat(40), captchaAfterFails: 3, captchaWindowMin: 15 }, { now: () => t });
  for (let i = 0; i < 3; i++) g.fail("1.1.1.1", "a@b.co");
  assert.equal(g.required("1.1.1.1", "x@y.co"), true);
  t += 16 * 60 * 1000; assert.equal(g.required("1.1.1.1", "a@b.co"), false);
  for (let i = 0; i < 25000; i++) g.fail(`9.9.${i >> 8}.${i & 255}`, `u${i}@x.co`);
  assert.ok(g.stats().fails <= 20000 + 2, `حافظه محدود نماند: ${g.stats().fails}`);
});
