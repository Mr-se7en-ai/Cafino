// E2E 1.88: پیامک ملی پیامک در مرورگر واقعی (Chromium) با سرور ملی پیامکِ ساختگی —
// ورود با کد پیامکی، ثبت‌نام با تأیید شماره، پروفایل، تنظیمات پیامک (اتصال/اعتبار/آزمایشی) و ارسال به مشتریان.
// اجرا:  TEST_DATABASE_URL=... node test/e2e-v188.mjs   (نیاز به بیلد pwa/ و Chromium). با سرویس واقعی ملی پیامک آزمایش نمی‌کند.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { startDb, stopDb, makeApp } from "./helpers.js";
import { solveForTest } from "../src/lib/loginCaptcha.js";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "../../node_modules/playwright-core");

const PWA = path.resolve(import.meta.dirname, "../../pwa");
const csp = fs.readFileSync(path.resolve(import.meta.dirname, "../deploy/csp.conf"), "utf8").match(/"([^"]+)"/)[1];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".css": "text/css" };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? "PASS" : "FAIL", m); };

// ── ملی پیامک ساختگی ───────────────────────────────────────────────────────────────────────────────────────────────
const fake = { calls: [], seq: 2000000000 };
const meli = http.createServer((req, res) => {
  let raw = ""; req.on("data", (d) => { raw += d; });
  req.on("end", () => {
    const ep = req.url.split("/").pop(), f = Object.fromEntries(new URLSearchParams(raw)); fake.calls.push({ ep, ...f });
    const good = (f.username === "plat" && f.password === "platpw") || (f.username === "u1" && f.password === "p1");
    const reply = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (!good) return reply({ Value: "0", RetStatus: 0, StrRetStatus: "Failed" });
    if (ep === "GetCredit") return reply({ Value: "123456", RetStatus: 1, StrRetStatus: "Ok" });
    return reply({ Value: String(++fake.seq), RetStatus: 1, StrRetStatus: "Ok" });
  });
});
await new Promise((r) => meli.listen(0, "127.0.0.1", r));
const meliBase = `http://127.0.0.1:${meli.address().port}/api/SendSMS`;
const lastOtp = () => [...fake.calls].reverse().find((x) => x.ep === "BaseServiceNumber")?.text;
const customerTexts = () => fake.calls.filter((x) => x.ep === "SendSMS" && x.username === "u1").map((x) => x.text);

const { app, pool, cfg } = await makeApp(await startDb(), { env: { MELIPAYAMAK_USERNAME: "plat", MELIPAYAMAK_PASSWORD: "platpw", MELIPAYAMAK_OTP_BODY_ID: "98765", MELIPAYAMAK_API_BASE: meliBase, SMS_OTP_RESEND_SEC: "10", BOTS_ENABLED: "false" } });
await app.listen({ port: 0, host: "127.0.0.1" });
const apiPort = app.server.address().port;
let lastCaptchaId = "";
const web = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const p = http.request({ host: "127.0.0.1", port: apiPort, path: req.url, method: req.method, headers: req.headers }, (r) => {
      if (req.url.startsWith("/api/auth/captcha")) { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => { try { lastCaptchaId = JSON.parse(b).data.id; } catch { /* ignore */ } res.writeHead(r.statusCode, r.headers); res.end(b); }); return; }
      res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on("error", () => { res.writeHead(502); res.end(); }); req.pipe(p); return;
  }
  if (req.url.split("?")[0] === "/config.js") { res.writeHead(200, { "content-type": "application/javascript", "content-security-policy": csp }); return res.end('window.CAFINO_CONFIG={apiBaseUrl:"same-origin",cafeId:"",pushUrl:""};'); }
  let f = path.join(PWA, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!f.startsWith(PWA)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PWA, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "content-security-policy": csp, "x-content-type-options": "nosniff", "cache-control": "no-cache" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${web.address().port}`;
const api = async (method, url, body, tok) => { const r = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { /* ignore */ } return { status: r.status, json: j }; };
const toFa = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

// مالک آزمایشی: ثبت‌نام با API (با کد پیامکی، چون سرور پیامک دارد)
const email = "owner@cafe.test", password = "Str0ng-pass-123", phone = "09121112233";
const cap = (await api("GET", "/api/auth/captcha")).json.data;
ok((await api("POST", "/api/auth/sms/send", { phone, purpose: "register", captchaId: cap.id, captchaAnswer: solveForTest(cfg, cap.id) })).status === 202, "API: کد ثبت‌نام فرستاده شد (۲۰۲)");
const reg = await api("POST", "/api/auth/register", { email, password, firstName: "حامد", lastName: "تست", phone, shopName: "کافی‌نت آزمایشی", smsCode: lastOtp() });
ok(reg.status === 201, "API: ثبت‌نام با کد پیامکی");
const tok = reg.json?.data?.accessToken;
for (const [fn, ln, ph] of [["علی", "رضایی", "09351234567"], ["سارا", "احمدی", "09111234567"], ["بدون", "شماره", ""]]) { const r = await api("POST", "/api/customers", { id: crypto.randomUUID(), firstName: fn, lastName: ln, phone: ph }, tok); ok(r.status === 201, `API: مشتری «${fn}» ساخته شد (${r.status}${r.status === 201 ? "" : " " + JSON.stringify(r.json).slice(0, 160)})`); }

const browser = await chromium.launch();
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: "fa-IR" });
  const p = await ctx.newPage(); p.consoleErrors = []; p.csp = [];
  // شناخته‌شده و ربطی به پیامک ندارد: دکمهٔ onclick="location.reload()" در pwa/index.html را CSP تولید می‌بندد؛ فقط همین مورد نادیده گرفته می‌شود.
  const known = (m) => /inline event handler/.test(m.text());
  p.on("console", (m) => {
    if (known(m)) return;
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) p.consoleErrors.push(m.text().slice(0, 160) + " @ " + p.url());
    if (/Content Security Policy|Refused to/.test(m.text())) p.csp.push(m.text().slice(0, 160) + " @ " + p.url());
  });
  p.on("pageerror", (e) => p.consoleErrors.push(String(e)));
  p.on("dialog", (d) => d.accept());
  return p;
};
const solveShown = async (p) => { await p.waitForSelector('[data-testid="captcha-image"]', { timeout: 10000 }); const id = lastCaptchaId; await p.fill('[data-testid="captcha-input"]', solveForTest(cfg, id)); };

// ── A) ورود با کد پیامکی ───────────────────────────────────────────────────────────────────────────────────────────
const p = await newPage();
await p.goto(base + "/", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="sms-login-toggle"]', { timeout: 20000 });
ok(true, "صفحهٔ ورود: دکمهٔ «ورود با کد پیامکی» هست (سرور پیامک را اعلام کرده)");
await p.click('[data-testid="sms-login-toggle"]');
ok((await p.$$('input[type="email"]')).length === 0 && (await p.$$('[data-testid="sms-login-phone"]')).length === 1, "حالت پیامکی: ایمیل/رمز پنهان، شمارهٔ موبایل نمایان");
ok((await p.$$('[data-testid="forgot-link"]')).length === 0, "حالت پیامکی: لینک فراموشی رمز پنهان");
await p.fill('[data-testid="sms-login-phone"]', toFa(phone));
ok(await p.locator('[data-testid="sms-login-send"]').isDisabled(), "بدون کپچا دکمهٔ ارسال کد غیرفعال است");
await solveShown(p);
await p.click('[data-testid="sms-login-send"]');
await p.waitForSelector('[data-testid="sms-login-code"]', { timeout: 10000 });
ok(/\d{6}/.test(lastOtp() || ""), "پیامک کد از طریق ملی پیامکِ ساختگی (الگو/پترن) رفت: " + (lastOtp() ? "کد ۶رقمی" : "—"));
ok((await p.locator('[data-testid="sms-login-send"]').textContent()).includes("ارسال مجدد تا"), "شمارندهٔ ارسال مجدد نمایش داده می‌شود");
const good = lastOtp(), wrong = good === "000000" ? "111111" : "000000";
await p.fill('[data-testid="sms-login-code"]', wrong); await p.locator("button", { hasText: "ورود با کد" }).click(); await p.waitForTimeout(800);
ok((await p.$$('[data-testid="sms-login-phone"]')).length === 1 && (await p.locator("text=/نادرست|منقضی/").count()) > 0, "کد غلط: وارد نمی‌شود و پیام خطا می‌آید");
await p.fill('[data-testid="sms-login-code"]', toFa(good)); ok((await p.inputValue('[data-testid="sms-login-code"]')) === good, "ارقام فارسی کد به لاتین تبدیل می‌شود");
await p.locator("button", { hasText: "ورود با کد" }).click();
await p.waitForSelector('[data-testid="sms-login-phone"]', { state: "detached", timeout: 15000 }).catch(() => {});
ok((await p.$$('[data-testid="sms-login-phone"]')).length === 0, "کد درست: وارد برنامه شد");

// ── B) تنظیمات ← اتصال ← پیامک ─────────────────────────────────────────────────────────────────────────────────────
await p.goto(base + "/?tab=settings", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="settings-tab-connections"]', { timeout: 20000 });
await p.click('[data-testid="settings-tab-connections"]'); await p.click('[data-testid="conn-tab-sms"]');
await p.waitForSelector('[data-testid="sms-status"]', { timeout: 10000 });
ok((await p.textContent('[data-testid="sms-status"]')).includes("متصل نیست"), "تنظیمات پیامک: ابتدا «متصل نیست»");
await p.fill('[data-testid="sms-username"]', "u1"); await p.fill('[data-testid="sms-password"]', "bad"); await p.fill('[data-testid="sms-from"]', "30001234");
await p.click('[data-testid="sms-save"]'); await p.waitForSelector('[data-testid="sms-error"]', { timeout: 10000 });
ok((await p.textContent('[data-testid="sms-error"]')).includes("نام کاربری یا رمز"), "رمز غلط پنل: خطای مشخص از ملی پیامک و ذخیره نمی‌شود");
await p.fill('[data-testid="sms-password"]', "p1"); await p.click('[data-testid="sms-save"]');
await p.waitForFunction(() => document.querySelector('[data-testid="sms-status"]')?.textContent.includes("فعال"), null, { timeout: 10000 });
ok(true, "با مشخصات درست: «فعال» شد");
ok((await p.$$('[data-testid="sms-password"]')).length === 0, "بعد از ذخیره فرم رمز بسته است (رمز دوباره نمایش داده نمی‌شود)");
await p.click('[data-testid="sms-credit-btn"]'); await p.waitForSelector('[data-testid="sms-credit"]', { timeout: 10000 });
ok((await p.textContent('[data-testid="sms-credit"]')).includes("۱۲۳٬۴۵۶") || (await p.textContent('[data-testid="sms-credit"]')).includes("۱۲۳,۴۵۶"), "اعتبار پنل نمایش داده شد");
await p.fill('[data-testid="sms-test-to"]', "۰۹۱۲۰۰۰۱۱۱۱"); await p.click('[data-testid="sms-test-btn"]'); await p.waitForSelector('[data-testid="sms-ok"]', { timeout: 10000 });
ok(customerTexts().some((t) => t.includes("آزمایشی")), "پیام آزمایشی به ملی پیامک ساختگی رسید");
const row = (await pool.query("SELECT username_enc, password_enc FROM sms_connections")).rows[0];
ok(row && !row.username_enc.includes("u1") && !row.password_enc.includes("p1"), "نام‌کاربری/رمز پنل در پایگاه‌داده رمزنگاری‌شده است");
const apiGet = (await api("GET", "/api/sms", undefined, tok)).json;
ok(!JSON.stringify(apiGet).includes("p1") && !/password/i.test(JSON.stringify(apiGet).replace(/usernameHint/g, "")), "API وضعیت پیامک رمز برنمی‌گرداند");

// ── C) پروفایل ← کارت تأیید شماره ──────────────────────────────────────────────────────────────────────────────────
await p.goto(base + "/?tab=settings", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="settings-tab-profile"]', { timeout: 20000 }); await p.click('[data-testid="settings-tab-profile"]');
await p.waitForSelector('[data-testid="phone-verify-card"]', { timeout: 10000 });
ok((await p.textContent('[data-testid="phone-verified-pill"]')).includes("تأییدشده"), "پروفایل: شمارهٔ ثبت‌نام «تأییدشده» است");

// ── D) مشتریان ← پیامک ─────────────────────────────────────────────────────────────────────────────────────────────
await p.goto(base + "/?tab=customers", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="mode-sms"]', { timeout: 20000 }); await p.click('[data-testid="mode-sms"]');
await p.waitForSelector('[data-testid="sms-customers"]', { timeout: 10000 });
let count = ""; for (let i = 0; i < 20; i++) { count = await p.textContent('[data-testid="sms-cust-count"]'); if (/۲ مشتری/.test(count)) break; await p.waitForTimeout(500); }
ok(/۲ مشتری/.test(count), "فهرست مشتریان سروری با شماره: " + count.trim());
ok(await p.locator('[data-testid="sms-cust-send"]').isDisabled(), "بدون انتخاب/متن دکمهٔ ارسال غیرفعال است");
await p.click('[data-testid="sms-cust-all"]');
await p.fill('[data-testid="sms-cust-text"]', "سلام {نام}، سفارش شما آماده است. لغو ۱۱");
ok((await p.textContent('[data-testid="sms-cust-stats"]')).includes("بخش"), "شمارندهٔ نویسه/بخش نمایش داده می‌شود");
await p.click('[data-testid="sms-cust-send"]'); await p.waitForSelector('[data-testid="sms-cust-result"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="sms-cust-result"]')).includes("۲ موفق"), "نتیجه: ۲ موفق");
const texts = customerTexts().filter((t) => t.includes("سفارش شما آماده"));
ok(texts.length === 2 && texts.some((t) => t.includes("علی رضایی")) && texts.some((t) => t.includes("سارا احمدی")), "{نام} برای هر مشتری جایگزین شد: " + texts.map((t) => t.slice(0, 14)).join(" | "));
const hist = await p.textContent('[data-testid="sms-cust-history"]'); ok(hist.includes("علی رضایی") && hist.includes("سارا احمدی"), "سابقهٔ ارسال در صفحه نمایش داده شد");
ok((await pool.query("SELECT count(*)::int n FROM sms_messages WHERE kind='customer' AND status='sent'")).rows[0].n === 2, "سابقهٔ ارسال در پایگاه‌داده ثبت شد");
ok(p.consoleErrors.length === 0, "صفحهٔ اصلی: بدون خطای کنسول" + (p.consoleErrors.length ? " — " + p.consoleErrors.slice(0, 3).join(" | ") : ""));
ok(p.csp.length === 0, "بدون نقض CSP" + (p.csp.length ? " — " + p.csp[0] : ""));
await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/e2e-v188-customers.png" }).catch(() => {});

// ── E) ثبت‌نام در UI با تأیید شمارهٔ موبایل ────────────────────────────────────────────────────────────────────────
const q = await newPage();
await q.goto(base + "/", { waitUntil: "domcontentloaded" });
await q.waitForSelector('[data-testid="sms-login-toggle"]', { timeout: 20000 });
await q.locator("button", { hasText: /^ثبت‌نام$/ }).first().click();
await q.waitForSelector('input[placeholder="نام خانوادگی"]', { timeout: 5000 });
await q.fill('input[placeholder="نام"]', "نگار"); await q.fill('input[placeholder="نام خانوادگی"]', "کریمی");
await q.fill('input[type="tel"]', "09351112233"); await q.fill('input[type="email"]', "negar@cafe.test");
const pw = q.locator('input[type="password"]'); await pw.nth(0).fill(password); await pw.nth(1).fill(password);
await q.locator("button", { hasText: /^ثبت‌نام و ورود$/ }).click(); await q.waitForTimeout(600);
ok((await q.$$('input[type="email"]')).length === 1 && (await q.locator("text=/کد/").count()) > 0, "ثبت‌نام بدون تأیید شماره انجام نمی‌شود");
await solveShown(q); await q.click('[data-testid="sms-register-send"]'); await q.waitForSelector('[data-testid="sms-register-code"]', { timeout: 10000 });
await q.fill('[data-testid="sms-register-code"]', lastOtp());
await q.locator("button", { hasText: /^ثبت‌نام و ورود$/ }).click();
await q.waitForSelector('input[type="email"]', { state: "detached", timeout: 20000 }).catch(() => {});
ok((await q.$$('input[type="email"]')).length === 0, "ثبت‌نام با کد پیامکی: وارد برنامه شد");
const u = (await pool.query("SELECT phone_norm, phone_verified_at FROM users WHERE email='negar@cafe.test'")).rows[0];
ok(u?.phone_norm === "09351112233" && u.phone_verified_at, "شمارهٔ کاربر جدید در پایگاه‌داده «تأییدشده» ثبت شد");
ok(q.consoleErrors.length === 0, "ثبت‌نام: بدون خطای کنسول" + (q.consoleErrors.length ? " — " + q.consoleErrors.slice(0, 3).join(" | ") : ""));

await browser.close(); web.close(); meli.close(); await app.close(); await pool.end(); await stopDb();
console.log(fails ? `\n${fails} FAIL` : "\nALL PASS"); process.exit(fails ? 1 : 0);
