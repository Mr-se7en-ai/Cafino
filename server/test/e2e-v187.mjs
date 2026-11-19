// E2E 1.87: کپچای ورود در مرورگر واقعی — کاربر عادی کپچا نمی‌بیند؛ بعد از ۳ رمز اشتباه کادر کپچا ظاهر می‌شود؛ بدون کد ورود نمی‌شود؛ با کد درست (فارسی هم) وارد می‌شود.
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-v187.mjs   (نیاز به بیلد pwa/ و Chromium)
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

const { app, pool, cfg } = await makeApp(await startDb(), { env: { CAPTCHA_AFTER_FAILS: "3", BOTS_ENABLED: "false" } });
await app.listen({ port: 0, host: "127.0.0.1" });
const apiPort = app.server.address().port;
// نگه‌داشتن آخرین چالش دریافتی برای حل (از طریق همان پاسخ شبکه)
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
const email = "owner@cafe.test", password = "Str0ng-pass-123";
const reg = await fetch(base + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, firstName: "حامد", lastName: "تست", shopName: "کافی‌نت آزمایشی" }) });
ok(reg.status === 201, "register via API");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, locale: "fa-IR" });
const p = await ctx.newPage(); const consoleErrors = [];
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
p.on("pageerror", (e) => consoleErrors.push(String(e)));
const csp403 = []; p.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) csp403.push(m.text()); });

await p.goto(base + "/", { waitUntil: "domcontentloaded" });
await p.waitForSelector('input[type="email"]', { timeout: 20000 });
ok((await p.$$('[data-testid="login-captcha"]')).length === 0, "ورود عادی: کپچا نمایش داده نمی‌شود");
// سه رمز اشتباه
for (let i = 0; i < 3; i++) { await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', "wrong-password-1"); await p.locator('button', { hasText: /^ورود$/ }).last().click(); await p.waitForTimeout(600); }
ok((await p.$$('[data-testid="login-captcha"]')).length === 0, "بعد از ۳ شکست هنوز کپچا نیست (چهارمین تلاش آن را فعال می‌کند)");
// تلاش چهارم (رمز درست!) → سرور captcha_required می‌دهد و کادر ظاهر می‌شود
await p.fill('input[type="password"]', password); await p.locator('button', { hasText: /^ورود$/ }).last().click();
await p.waitForSelector('[data-testid="login-captcha"]', { timeout: 8000 });
ok(true, "تلاش بعدی: کادر کپچا ظاهر شد");
await p.waitForSelector('[data-testid="captcha-image"]', { timeout: 8000 });
const img = await p.getAttribute('[data-testid="captcha-image"]', "src");
ok(/^data:image\/svg\+xml;base64,/.test(img), "تصویر کپچا data-URI SVG است (و CSP آن را نمی‌بندد)");
const box = await p.locator('[data-testid="captcha-image"]').boundingBox(); ok(box && box.width >= 140 && box.height >= 48, `تصویر کپچا دیده می‌شود (${Math.round(box?.width)}×${Math.round(box?.height)})`);
// بدون پر کردن کپچا: ارسال نمی‌شود
await p.locator('button', { hasText: /^ورود$/ }).last().click(); await p.waitForTimeout(400);
ok(await p.locator("text=عدد ۵ رقمی تصویر را وارد کنید").count() > 0, "ارسال بدون کد: پیام «عدد ۵ رقمی…»");
// کد غلط → captcha_invalid و چالش تازه
const before = lastCaptchaId;
const right = solveForTest(cfg, before); const wrong = right === "00000" ? "00001" : "00000";
await p.fill('[data-testid="captcha-input"]', wrong); await p.locator('button', { hasText: /^ورود$/ }).last().click(); await p.waitForTimeout(900);
ok(await p.locator("text=کد تصویر درست نیست").count() > 0, "کد غلط: پیام خطا");
ok(lastCaptchaId && lastCaptchaId !== before, "کد غلط: چالش تازه گرفته شد");
ok((await p.inputValue('[data-testid="captcha-input"]')) === "", "کد غلط: ورودی خالی شد");
// کد درست به ارقام فارسی
const right2 = solveForTest(cfg, lastCaptchaId);
await p.fill('[data-testid="captcha-input"]', right2.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]));
ok((await p.inputValue('[data-testid="captcha-input"]')) === right2, "ارقام فارسی به لاتین تبدیل می‌شود");
await p.locator('button', { hasText: /^ورود$/ }).last().click();
await p.waitForSelector('input[type="email"]', { state: "detached", timeout: 15000 }).catch(() => {});
ok((await p.$$('input[type="email"]')).length === 0, "با کد درست: وارد برنامه شد");
ok(consoleErrors.length === 0, "بدون خطای کنسول" + (consoleErrors.length ? " — " + consoleErrors.slice(0, 3).join(" | ") : ""));
ok(csp403.length === 0, "بدون نقض CSP" + (csp403.length ? " — " + csp403[0] : ""));
await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/e2e-v187.png" }).catch(() => {});
await browser.close(); web.close(); await app.close(); await pool.end(); await stopDb();
console.log(fails ? `\n${fails} FAIL` : "\nALL PASS"); process.exit(fails ? 1 : 0);
