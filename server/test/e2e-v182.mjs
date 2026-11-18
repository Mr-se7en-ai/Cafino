// تست سرتاسری ۱.۸۲: مرکز اعلان موضوعی، حسابرسی+مرکز مالی، تنظیمات←اتصال، دفتر کل و مغایرت‌گیری (مرورگر واقعی).
// اجرا: node test/e2e-v182.mjs  (نیاز به بیلد pwa/ و Chromium)
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

const SHOT = (process.env.SHOT || "/tmp/v182.png").replace(/\.png$/, "");
const seed = async () => p.evaluate(() => {
  localStorage.setItem("cafenet_inventory", JSON.stringify([{ id: 1, cat: "paper", name: "کاغذ A4", qty: 0, minQty: 10, unit: "برگ", unitCost: 500, salePrice: 1000 }, { id: 2, cat: "paper", name: "تونر", qty: 2, minQty: 5, unit: "عدد", unitCost: 1, salePrice: 1 }]));
  localStorage.setItem("cafenet_tx3", JSON.stringify([
    { id: "t1", type: "income", category: "خدمات", amount: 1000000, desc: "فروش ۱", date: "2026-10-01", method: "cash" },
    { id: "t2", type: "income", category: "خدمات", amount: 2500000, desc: "فروش کارتی", date: "2026-10-05", method: "pos" },
    { id: "t3", type: "expense", category: "اجاره", amount: 300000, desc: "اجارهٔ مغازه", date: "2026-10-07", method: "cash" },
    { id: "t4", type: "income", category: "خدمات", amount: 400000, desc: "فروش ۲", date: "2026-10-09", method: "cash" },
  ]));
  localStorage.removeItem("cafenet_gl_recon");
});
await seed();

// ── ۱) مرکز اعلان: دسته‌بندی موضوعی ──
await p.goto(base + "/"); await p.waitForSelector('[data-testid="notif-bell"]', { timeout: 30000 }); await p.waitForTimeout(800);
await p.click('[data-testid="notif-bell"]'); await p.waitForSelector('[data-testid="notif-groups"]', { timeout: 10000 });
const topics = await p.$$eval('[data-testid="notif-group"]', (els) => els.map((e) => e.getAttribute("data-topic")));
ok(topics.includes("انبار"), `notification center is grouped by topic (${topics.join("، ")})`);
const stockGroup = p.locator('[data-testid="notif-group"][data-topic="انبار"]');
ok((await stockGroup.locator('[data-testid="notif-item"]').count()) >= 2, "stock group lists its notifications");
await stockGroup.locator('[data-testid="notif-group-head"]').click();
ok((await stockGroup.locator('[data-testid="notif-item"]').count()) === 0, "group collapses on click");
ok((await p.evaluate(() => localStorage.getItem("cafino_notif_collapsed"))).includes("انبار"), "collapsed state is remembered");
await p.screenshot({ path: SHOT + "-notif.png" });
await stockGroup.locator('[data-testid="notif-group-head"]').click();
await stockGroup.locator('[data-testid="notif-item"]').first().click();
await p.waitForTimeout(500);
ok(/inventory|انبار/.test(await p.textContent("body")), "clicking a notification opens its page");

// ── ۲) حسابرسی + مرکز مالی در یک منو ──
await p.goto(base + "/?tab=audit"); await p.waitForSelector('[data-testid="auditfin-page"]', { timeout: 30000 });
ok((await p.locator('[data-testid="auditfin-tab-audit"]').count()) === 1 && (await p.locator('[data-testid="auditfin-tab-finance"]').count()) === 1, "one menu with two sub-tabs (audit + server finance center)");
const sidebar = await p.textContent("body");
ok(!sidebar.includes("ربات بله و تلگرام"), "the old «ربات بله و تلگرام» menu item is gone from the main menu");
await p.click('[data-testid="auditfin-tab-finance"]'); await p.waitForTimeout(800);
ok(/مرکز مالی/.test(await p.textContent('[data-testid="auditfin-page"]')) || (await p.locator('[data-testid="auditfin-page"] >> text=/درآمد|فاکتور|گزارش/').count()) > 0, "finance center sub-tab renders");
await p.click('[data-testid="auditfin-tab-audit"]'); await p.waitForTimeout(500);
ok(/حسابرسی|زنجیره|لاگ|ابطال/.test(await p.textContent('[data-testid="auditfin-page"]')), "audit sub-tab renders");
await p.screenshot({ path: SHOT + "-auditfin.png" });

// ── ۳) تنظیمات ← اتصال ──
await p.goto(base + "/?tab=settings"); await p.waitForSelector('[data-testid="settings-tab-connections"]', { timeout: 30000 });
ok((await p.locator('[data-testid="settings-tab-ai"]').count()) === 0, "the standalone «هوش مصنوعی» settings tab moved under «اتصال»");
await p.click('[data-testid="settings-tab-connections"]'); await p.waitForSelector('[data-testid="connections-panel"]');
ok((await p.locator('[data-testid^="conn-tab-"]').count()) === 5, "five sub-tabs: ربات بله، ربات تلگرام، مینی‌اپ تلگرام، مینی‌اپ بله، هوش مصنوعی (1.86)");
await p.waitForTimeout(1200);
const bale = await p.textContent('[data-testid="connections-panel"]'); ok(/بله/.test(bale), "ربات بله sub-tab shows the Bale bot");
await p.click('[data-testid="conn-tab-telegram"]'); await p.waitForTimeout(1200);
const tgTxt = await p.textContent('[data-testid="connections-panel"]'); ok(/تلگرام/.test(tgTxt), "ربات تلگرام sub-tab shows the Telegram bot");
await p.screenshot({ path: SHOT + "-conn-telegram.png" });
await p.click('[data-testid="conn-tab-ai"]'); await p.waitForTimeout(600);
ok(/هوش مصنوعی|دستیار|کلید/.test(await p.textContent('[data-testid="connections-panel"]')), "هوش مصنوعی sub-tab shows the AI assistant settings");

// ── ۴) دفتر کل + مغایرت‌گیری ──
await p.goto(base + "/?tab=report"); await p.waitForSelector('text=دفتر کل و مغایرت‌گیری', { timeout: 30000 });
await p.click('text=دفتر کل و مغایرت‌گیری'); await p.waitForSelector('[data-testid="gl-summary"]', { timeout: 10000 });
const sumTxt = await p.textContent('[data-testid="gl-summary"]');
ok((await p.locator('[data-testid="gl-sum-row"]').count()) >= 2 && sumTxt.includes("نقدی"), "ledger summary lists the accounts");
await p.selectOption('[data-testid="gl-account"]', "cash"); await p.waitForSelector('[data-testid="gl-table"]');
ok((await p.locator('[data-testid="gl-row"]').count()) === 3, "cash ledger has 3 rows (2 income, 1 expense)");
const fa = (t) => t.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٬,\s]/g, "");
ok(fa(await p.textContent('[data-testid="gl-closing"]')).includes("1100000"), "closing balance = 1,000,000 − 300,000 + 400,000");
await p.fill('[data-testid="gl-q"]', "اجاره"); ok((await p.locator('[data-testid="gl-row"]').count()) === 1, "search narrows the ledger"); await p.fill('[data-testid="gl-q"]', "");
const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 5000 }).catch(() => null), p.click('[data-testid="gl-csv"]')]);
ok(!!dl && /cafino-gl-cash\.csv/.test(dl.suggestedFilename()), "CSV export downloads");
await p.screenshot({ path: SHOT + "-ledger.png", fullPage: true });

await p.click('[data-testid="gl-view-recon"]'); await p.waitForSelector('[data-testid="rc-text"]');
await p.fill('[data-testid="rc-closing"]', "698000");
await p.fill('[data-testid="rc-text"]', ["1405/07/10\t1000000\tواریز", "1405/07/15 -300000 اجاره", "1405/07/18 -2000 کارمزد", "خراب"].join("\n"));
await p.click('[data-testid="rc-run"]'); await p.waitForSelector('[data-testid="rc-result"]');
ok((await p.textContent('[data-testid="rc-matched"]')).includes("۲"), "auto-match pairs the 2 matching rows (1-day tolerance)");
ok((await p.locator('[data-testid="rc-unb-row"]').count()) === 1 && (await p.locator('[data-testid="rc-uns-row"]').count()) === 1, "one row only in books (فروش ۲), one only in statement (کارمزد)");
ok((await p.locator('[data-testid="rc-ok"]').count()) === 1 && (await p.textContent('[data-testid="rc-unexplained"]')).includes("۰"), "difference of −402,000 is fully explained → balanced");
ok((await p.locator('[data-testid="rc-errors"]').count()) === 1, "unreadable statement line is reported");
await p.screenshot({ path: SHOT + "-recon.png", fullPage: true });
await p.click('[data-testid="rc-commit"]'); await p.waitForSelector('[data-testid="rc-msg"]');
ok((await p.textContent('[data-testid="rc-msg"]')).includes("۲"), "reconciliation saved (2 rows)");
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("cafenet_gl_recon") || "{}"));
ok(Object.keys(stored.matches || {}).sort().join() === "tx:t1,tx:t3" && stored.sessions?.length === 1 && stored.sessions[0].unexplained === 0, "matches + session persisted");
await p.click('[data-testid="gl-view-ledger"]'); await p.waitForSelector('[data-testid="gl-table"]');
ok((await p.locator('[data-testid="gl-row"][data-state="ok"]').count()) === 2 && (await p.locator('[data-testid="gl-row"][data-state="none"]').count()) === 1, "ledger now marks 2 rows ✓ and leaves 1 open");
// تغییر تراکنش پس از مغایرت‌گیری → هشدار
await p.evaluate(() => { const t = JSON.parse(localStorage.getItem("cafenet_tx3")); t.find((x) => x.id === "t3").amount = 350000; localStorage.setItem("cafenet_tx3", JSON.stringify(t)); window.dispatchEvent(new Event("cafenet:datachange")); });
await p.goto(base + "/?tab=report"); await p.click('text=دفتر کل و مغایرت‌گیری'); await p.selectOption('[data-testid="gl-account"]', "cash");
ok((await p.locator('[data-testid="gl-row"][data-state="changed"]').count()) === 1, "editing a reconciled transaction afterwards shows a ⚠ marker");
ok(errs.length === 0, "no page errors: " + errs.join(" | ").slice(0, 200));
ok((await p.evaluate(() => window.__csp)).length === 0, "no CSP violations");

await b.close(); await app.close(); await stopDb(); web.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
