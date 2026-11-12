// تست سرتاسری واقعی: PostgreSQL واقعی ← API ← nginx-مانند (فایل‌های pwa + CSP سخت‌گیر + پراکسی) ← مرورگر ← برنامه.
// اجرا:  node test/e2e-browser.mjs   (نیاز به بیلد pwa/ و Chromium؛ در npm test نیست چون مرورگر می‌خواهد)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { startDb, stopDb, makeApp } from "./helpers.js";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "../../node_modules/playwright-core");

const PWA = path.resolve(import.meta.dirname, "../../pwa");
const csp = fs.readFileSync(path.resolve(import.meta.dirname, "../deploy/csp.conf"), "utf8").match(/"([^"]+)"/)[1];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? "PASS" : "FAIL", m); };

const dbUrl = await startDb();
const { app, pool } = await makeApp(dbUrl, { env: { RATE_LIMIT_MAX: "100000" } });
await app.listen({ port: 0, host: "127.0.0.1" });
const apiPort = app.server.address().port;

const web = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
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

// داده‌های اولیه از راه API (مثل پنل مرکزی): کافی‌نت + مالک + یک مشتری
const email = "owner@cafe.test", password = "Str0ng-pass-123";
const reg = await api("POST", "/api/auth/register", { email, password, firstName: "حامد", lastName: "تست", shopName: "کافی‌نت آزمایشی" });
ok(reg.status === 201, "register via API: " + reg.status);
const tok = reg.json.data.accessToken;
await api("POST", "/api/customers", { id: "c1", firstName: "علی", lastName: "رضایی", phone: "09121234567" }, tok);

const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = [], violations = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 200)); });
await p.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`)); });
await p.goto(base + "/");
await p.waitForSelector('input[type="email"]', { timeout: 30000 });
ok(true, "login screen shown (server mode: same-origin API)");
await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', password);
await p.press('input[type="password"]', 'Enter');
await p.waitForSelector('[data-testid="sync-chip"]', { timeout: 30000 });
ok(true, "logged in through the real login form → main app");
await p.waitForTimeout(1500);

// نشست با کوکی HttpOnly: بعد از reload دوباره وارد نمی‌خواهد
const cookies = await ctx.cookies();
ok(cookies.some((c) => c.name === "cafino_rt" && c.httpOnly) && cookies.some((c) => c.name === "cafino_at" && c.httpOnly), "session cookies are HttpOnly");
ok(!(await p.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).some((k) => /token|jwt|refresh/i.test(k)))), "no token in web storage");
await p.reload();
await p.waitForSelector('[data-testid="sync-chip"]', { timeout: 30000 });
ok(true, "reload keeps the session (cookie → /api/auth/me)");

// یک فروش واقعی از راه دستیار صوتی (متنی) و همگام‌سازی به سرور
await p.click('[data-testid="va-fab"]');
await p.fill('[data-testid="va-input"]', "فروش ۲ برگ پرینت رنگی ۱۰ هزار تومان به علی رضایی"); await p.click('[data-testid="va-send"]');
await p.waitForSelector('[data-testid="va-confirm"]', { timeout: 15000 }); await p.click('[data-testid="va-confirm"]');
let inv = [], pay = [];
for (let i = 0; i < 40; i++) { inv = (await api("GET", "/api/invoices", null, tok)).json?.data || []; pay = (await api("GET", "/api/payments", null, tok)).json?.data || []; if (inv.length && pay.length) break; await p.waitForTimeout(500); }
ok(inv.length === 1 && pay.length === 1, `sale synced to PostgreSQL: invoices=${inv.length} payments=${pay.length}`);
ok(inv[0]?.status === "paid" && inv[0]?.remainingAmount === 0 && inv[0]?.totalAmount === pay[0]?.amount, `server-derived status ok: ${inv[0]?.status}, total=${inv[0]?.totalAmount}`);
const rep = await api("GET", "/api/reports/summary", null, tok);
ok(rep.status === 200, "report endpoint: " + rep.status + " " + JSON.stringify(rep.json?.data || {}).slice(0, 120));

// «مرکز مالی سرور» (UI واقعی روی سرور واقعی): تطبیق مالی + درخواست اصلاح، شیفت صندوق، دسترسی‌ها، BI
p.on("dialog", (d) => d.accept());
await p.click('[data-testid="va-close"]').catch(() => {});   // پنل دستیار صوتی از مرحلهٔ قبل باز مانده و روی صفحه را می‌پوشاند
await p.click('[data-testid="nav-fincenter"]'); await p.waitForSelector('[data-testid="fincenter-page"]', { timeout: 15000 });
await p.waitForSelector('[data-testid="rec-status"]', { timeout: 15000 });
ok(/سالم/.test(await p.textContent('[data-testid="rec-status"]')), "finance center: reconciliation report loads and is healthy");
await p.fill('[data-testid="rec-reason"]', "بازبینی دوره‌ای آزمایشی"); await p.click('[data-testid="rec-submit"]');
await p.waitForSelector('[data-testid="rec-request"][data-status="pending"]', { timeout: 15000 }).catch(async (e) => { console.log("rec-msg:", await p.textContent('[data-testid="rec-msg"]').catch(() => "(none)")); throw e; });
ok(true, "finance center: correction request created (pending, with dry-run preview)");
await p.click('[data-testid="rec-approve"]');
await p.waitForSelector('[data-testid="rec-request"][data-status="approved"]', { timeout: 20000 });
ok((await api("GET", "/api/integrity/corrections?status=approved", null, tok)).json.data.length === 1, "finance center: owner approval applied on the server");

await p.click('[data-testid="fin-tab-shift"]'); await p.waitForSelector('[data-testid="shift-opening"]', { timeout: 15000 });
await p.fill('[data-testid="shift-opening"]', "۱۰۰۰۰۰"); await p.click('[data-testid="shift-open"]');
await p.waitForSelector('[data-testid="shift-expected"]', { timeout: 15000 });
ok(/۱۰۰٬۰۰۰|۱۰۰,۰۰۰/.test(await p.textContent('[data-testid="shift-expected"]')), "shift opened: expected cash = opening cash");
const cur = (await api("GET", "/api/shifts/current", null, tok)).json.data;
ok(cur && cur.status === "open" && cur.openingCash === 100000, "shift stored on server with exact integer opening cash");
await p.fill('[data-testid="shift-counted"]', "۹۵۰۰۰"); await p.waitForSelector('[data-testid="shift-diff"]');
ok(/کسری/.test(await p.textContent('[data-testid="shift-diff"]')), "difference preview shows shortage");
await p.click('[data-testid="shift-close"]'); await p.waitForSelector('[data-testid="shift-msg"]', { timeout: 15000 });
ok(/توضیح/.test(await p.textContent('[data-testid="shift-msg"]')) && (await api("GET", "/api/shifts/current", null, tok)).json.data?.status === "open", "closing with a difference and no note is rejected by the server (shift stays open)");
await p.fill('[data-testid="shift-note"]', "کسری بابت خرید خرد");
await p.click('[data-testid="shift-close"]'); await p.waitForSelector('[data-testid="shift-list"] tr[data-status="closed"]', { timeout: 15000 });
const closed = (await api("GET", "/api/shifts", null, tok)).json.data[0];
ok(closed.status === "closed" && closed.difference === -5000 && closed.expectedCash === 100000 && closed.countedCash === 95000, `shift closed with exact difference: ${closed.difference}`);

await p.click('[data-testid="fin-tab-perm"]'); await p.waitForSelector('[data-testid="perm-tab"]', { timeout: 15000 });
await p.selectOption('[data-testid="perm-select"]', "role:staff");
await p.click('[data-testid="perm-report.bi"] input'); await p.click('[data-testid="perm-save"]');
await p.waitForSelector('[data-testid="perm-msg"]', { timeout: 15000 });
const pol = (await api("GET", "/api/permissions", null, tok)).json.data.policy;
ok(pol.version >= 1 && (pol.roles.staff?.grant || []).includes("report.bi"), "permissions panel saved a staff grant (only the diff vs defaults) with audit");

await p.click('[data-testid="fin-tab-bi"]'); await p.waitForSelector('[data-testid="bi-forecast"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="bi-tab"]')).includes("فروش ماه جاری"), "BI tab renders real series + forecast card (insufficient-data note is acceptable)");
await p.screenshot({ path: "/tmp/e2e-fincenter.png" });

// اطلاعیه از پنل مرکزی → برنامه
const adminPw = "Adm1n-strong-pass-9";
const hash = (await import("../src/lib/security.js")).hashPassword;
await pool.query("INSERT INTO users(email,password_hash,role,first_name) VALUES ('admin@central.test',$1,'platform_admin','مدیر')", [await hash(adminPw)]);
const al = await api("POST", "/api/auth/login", { email: "admin@central.test", password: adminPw });
await api("POST", "/api/admin/announcements", { title: "اطلاعیهٔ فوری آزمایشی", body: "سرویس شب تعطیل است", severity: "critical" }, al.json.data.accessToken);
await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await p.waitForSelector('[data-testid="urgent-bar"]', { timeout: 90000 });
ok(/اطلاعیهٔ فوری آزمایشی/.test(await p.textContent('[data-testid="urgent-bar"]')), "announcement from the central panel reached the app (urgent bar)");

// ایمنی
const viol = await p.evaluate(() => window.__csp);
ok(viol.length === 0 && violations.length === 0, "no CSP violations under the strict policy: " + JSON.stringify(viol.concat(violations)).slice(0, 300));
ok(errs.length === 0, "no page errors " + errs.join("|").slice(0, 200));
await p.screenshot({ path: "/tmp/e2e-server.png" });

await b.close(); web.close(); await app.close(); await pool.end(); await stopDb();
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
process.exit(fails ? 1 : 0);
