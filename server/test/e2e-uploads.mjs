// E2E دریافت فایل از مشتری با QR: مرورگر کافی‌نت (QR واقعی) ← مرورگر موبایلِ مشتری (آدرسِ رمزگشایی‌شده از خود QR) ← فایل در برنامهٔ کافی‌نت.
// (هارنس از e2e-browser.mjs) تست سرتاسری واقعی: PostgreSQL واقعی ← API ← nginx-مانند (فایل‌های pwa + CSP سخت‌گیر + پراکسی) ← مرورگر ← برنامه.
// اجرا:  node test/e2e-browser.mjs   (نیاز به بیلد pwa/ و Chromium؛ در npm test نیست چون مرورگر می‌خواهد)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import os from "node:os";
import { startDb, stopDb, makeApp } from "./helpers.js";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "../../node_modules/playwright-core");

const PWA = path.resolve(import.meta.dirname, "../../pwa");
const csp = fs.readFileSync(path.resolve(import.meta.dirname, "../deploy/csp.conf"), "utf8").match(/"([^"]+)"/)[1];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? "PASS" : "FAIL", m); };

const dbUrl = await startDb();
const upDir = fs.mkdtempSync(path.join(os.tmpdir(), "cafino-e2e-up-"));
const { app, pool } = await makeApp(dbUrl, { env: { RATE_LIMIT_MAX: "100000", UPLOAD_DIR: upDir, UPLOAD_IP_PER_HOUR: "1000" } });
await app.listen({ port: 0, host: "127.0.0.1" });
const apiPort = app.server.address().port;

const web = http.createServer((req, res) => {
  if (req.url.startsWith("/api/") || req.url.startsWith("/u/")) {
    const p = http.request({ host: "127.0.0.1", port: apiPort, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on("error", () => { res.writeHead(502); res.end(); }); req.pipe(p); return;
  }
  if (req.url.split("?")[0] === "/config.js") { res.writeHead(200, { "content-type": "application/javascript", "content-security-policy": csp }); return res.end('window.CAFINO_CONFIG={apiBaseUrl:"same-origin",cafeId:"",pushUrl:"",vapidPublicKey:"",pushKey:""};'); }   // همان config.js استقرار
  let f = path.join(PWA, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!f.startsWith(PWA)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PWA, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "content-security-policy": csp, "x-content-type-options": "nosniff", "cache-control": "no-cache" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${web.address().port}`;
const api = async (m, u, body, tok) => { const r = await fetch(base + u, { method: m, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };


const email = "owner@cafe.test", password = "Str0ng-pass-123";
const reg = await api("POST", "/api/auth/register", { email, password, firstName: "حامد", lastName: "تست", shopName: "کافی‌نت آزمایشی" });
ok(reg.status === 201, "register via API");
const jsQR = require("jsqr");
const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const watch = (page, tag, errs, viol) => {
  page.on("pageerror", (e) => errs.push(`${tag}: ${e.message}`));
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(`${tag}: ${m.text().slice(0, 200)}`); });
};
const errs = [], viol = [];

// ── کافی‌نت: ورود واقعی → تب «دریافت فایل از مشتری»
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage(); watch(p, "cafe", errs, viol);
await p.goto(base + "/"); await p.waitForSelector('input[type="email"]', { timeout: 30000 });
await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', password); await p.press('input[type="password"]', "Enter");
await p.waitForSelector('[data-testid="sync-chip"]', { timeout: 30000 });
await p.goto(base + "/?tab=uploads"); await p.waitForSelector('[data-testid="up-qr"] svg', { timeout: 30000 });
ok(true, "uploads tab shows the cafe's own QR");
const url = (await p.textContent('[data-testid="up-url"]')).trim();
ok(url.startsWith(base + "/u/") && /\/u\/[a-z2-7]{16}$/.test(url), "QR URL is this cafe's unguessable /u/<code>: " + url);
await p.waitForSelector('[data-testid="up-empty"]', { timeout: 15000 }).catch(() => {});
ok((await p.textContent('[data-testid="uploads-page"]')).includes("هنوز فایلی نرسیده"), "empty state before any upload");

// ── رمزگشایی QR از روی صفحه (نه از روی URL متنی): SVG → canvas → jsQR
const svg = await p.$eval('[data-testid="up-qr"] svg', (e) => e.outerHTML.replace("width=\"100%\" height=\"100%\"", 'width="400" height="400"'));
const blank = await ctx.newPage(); await blank.goto("about:blank");
const px = await blank.evaluate(async (s) => { const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s); }); const c = document.createElement("canvas"); c.width = c.height = 400; const g = c.getContext("2d"); g.drawImage(img, 0, 0, 400, 400); return Array.from(g.getImageData(0, 0, 400, 400).data); }, svg);
await blank.close();
const decoded = jsQR(Uint8ClampedArray.from(px), 400, 400)?.data;
ok(decoded === url, "the rendered QR decodes (jsQR) to exactly the page URL: " + decoded);
await p.screenshot({ path: "/tmp/e2e-uploads-cafe-empty.png" });

// ── مشتری: گوشی بدون ورود، آدرسِ رمزگشایی‌شده را باز می‌کند
const cctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
const c = await cctx.newPage(); watch(c, "customer", errs, viol);
await c.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`)); });
await c.goto(decoded); await c.waitForSelector("#form:not(.hide)", { timeout: 15000 });
ok((await c.textContent("#cafe")).includes("کافی‌نت آزمایشی"), "customer page shows the cafe name (public info only)");
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(3000, 0x41)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 3)]);
await c.setInputFiles("#pick", [{ name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }]);
ok(/پذیرفته نمی/.test(await c.textContent("#msg")) && (await c.$$("#list li")).length === 0, "client-side rejects a disallowed type before upload");
await c.setInputFiles("#pick", [{ name: "رزومه.pdf", mimeType: "application/pdf", buffer: PDF }, { name: "scan.png", mimeType: "image/png", buffer: PNG }]);
ok((await c.$$("#list li")).length === 2 && !(await c.$eval("#send", (e) => e.disabled)), "two files listed and send enabled");
await c.fill("#name", "مشتری تست"); await c.fill("#phone", "09121234567"); await c.fill("#note", "۲ نسخه رنگی");
await c.screenshot({ path: "/tmp/e2e-uploads-customer-form.png" });
await c.click("#send"); await c.waitForSelector("#done:not(.hide)", { timeout: 20000 });
const code = (await c.textContent("#receipt")).trim();
ok(/^[۰-۹]{5}$/.test(code), "customer got a 5-digit tracking code: " + code);
await c.screenshot({ path: "/tmp/e2e-uploads-customer-done.png" });
const cv = await c.evaluate(() => window.__csp);
ok(cv.length === 0, "customer page: no CSP violations (hash-based CSP works)" + JSON.stringify(cv));
// سرور واقعاً فایل را با همان بایت‌ها نگه داشته است
const rows = (await pool.query("SELECT original_name,size,storage_key FROM customer_uploads ORDER BY original_name")).rows;
ok(rows.length === 2 && rows.some((r) => r.original_name === "رزومه.pdf" && r.size === PDF.length), "two rows stored with exact sizes");
ok(fs.readFileSync(path.join(upDir, rows.find((r) => r.original_name === "scan.png").storage_key)).equals(PNG), "bytes on disk identical to what the customer sent");

// ── کافی‌نت: فایل می‌رسد (بدون ورود دوباره)
await p.click('button:has-text("بازخوانی")');
await p.waitForSelector('[data-testid="up-batch"]', { timeout: 20000 });
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
ok(toEn(await p.textContent('[data-testid="up-code"]')).includes(toEn(code)), "the same tracking code appears in the cafe app");
ok((await p.$$('[data-testid="up-file"]')).length === 2 && (await p.textContent('[data-testid="up-batch"]')).includes("مشتری تست") && (await p.textContent('[data-testid="up-batch"]')).includes("۲ نسخه رنگی"), "sender name, note and both files are listed");
await p.fill('[data-testid="up-search"]', toEn(code)); await p.waitForTimeout(700);
ok((await p.$$('[data-testid="up-batch"]')).length === 1, "search by tracking code finds the batch");
await p.fill('[data-testid="up-search"]', ""); await p.waitForTimeout(700);
const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }), p.locator('[data-testid="up-file"]', { hasText: "scan.png" }).locator('[data-testid="up-dl"]').click()]);
const saved = fs.readFileSync(await dl.path());
ok(dl.suggestedFilename() === "scan.png" && saved.equals(PNG), "download via the app returns the exact file with its original name");
await p.waitForTimeout(800);
await p.screenshot({ path: "/tmp/e2e-uploads-cafe-files.png" });
await p.locator('[data-testid="up-file"]', { hasText: "رزومه.pdf" }).locator("select").selectOption("printed");
await p.waitForTimeout(800);
ok((await pool.query("SELECT status FROM customer_uploads WHERE original_name='رزومه.pdf'")).rows[0].status === "printed", "status change persisted");
p.on("dialog", (d) => d.accept());
await p.locator('[data-testid="up-file"]', { hasText: "رزومه.pdf" }).locator('[data-testid="up-del"]').click();
await p.waitForTimeout(1200);
ok((await p.$$('[data-testid="up-file"]')).length === 1 && !fs.existsSync(path.join(upDir, rows.find((r) => r.original_name === "رزومه.pdf").storage_key)), "delete removes the row and the file on disk");

// ── پوستر چاپی
const [pop] = await Promise.all([ctx.waitForEvent("page", { timeout: 15000 }), p.click('[data-testid="up-poster"]')]);
await pop.waitForLoadState("domcontentloaded"); await pop.waitForTimeout(800);
const ph = await pop.content();
ok(ph.includes("فایلت را همین‌جا بفرست") && ph.includes("<svg") && ph.includes("/u/"), "printable poster has headline, logo/QR svg and the URL");
await pop.screenshot({ path: "/tmp/e2e-uploads-poster.png", fullPage: true }); await pop.close();

// ── غیرفعال‌سازی و تعویض کد
await p.screenshot({ path: "/tmp/e2e-uploads-cafe-settings.png", fullPage: true });
p.removeAllListeners("dialog"); p.on("dialog", (d) => d.accept());
await p.click('[data-testid="up-rotate"]'); await p.waitForTimeout(1500);
const url2 = (await p.textContent('[data-testid="up-url"]')).trim();
ok(url2 !== url && (await (await fetch(url)).status) === 200 && (await fetch(url.replace("/u/", "/api/public/upload/"))).status === 404, "rotating the code invalidates the old QR's API (page shell is static, data is gone)");

ok(errs.length === 0, "no page errors " + errs.join("|").slice(0, 300));
ok(viol.length === 0, "no CSP violations in the cafe app " + viol.join("|").slice(0, 300));
await b.close(); web.close(); await app.close(); await pool.end(); await stopDb(); fs.rmSync(upDir, { recursive: true, force: true });
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
process.exit(fails ? 1 : 0);
