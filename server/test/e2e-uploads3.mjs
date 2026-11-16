// E2E «مشخصات کافی‌نت + لوگو + فونت وزیرمتن در صفحهٔ مشتری» (1.78): مرورگر واقعی، PostgreSQL واقعی، CSP سخت‌گیر استقرار، Web Worker واقعی.
// پروفایل فروشگاه ← همگام‌سازی خودکار ← صفحهٔ مشتری (موبایل): فونت، دو لوگو، نام/نشانی/تلفن، خاموش/روشن، حذف لوگو ← صفحهٔ «درباره من».
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-uploads3.mjs   (نیاز به بیلد pwa/ و Chromium)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import os from "node:os";
import { startDb, stopDb, makeApp } from "./helpers.js";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "../../node_modules/playwright-core");

const ROOT = path.resolve(import.meta.dirname, "../..");
const PWA = path.join(ROOT, "pwa");
const FIX = path.join(ROOT, "src/tests/fixtures");
const csp = fs.readFileSync(path.resolve(import.meta.dirname, "../deploy/csp.conf"), "utf8").match(/"([^"]+)"/)[1];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? "PASS" : "FAIL", m); };
const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

const dbUrl = await startDb();
const upDir = fs.mkdtempSync(path.join(os.tmpdir(), "cafino-e2e-up2-"));
const { app, pool } = await makeApp(dbUrl, { env: { RATE_LIMIT_MAX: "100000", UPLOAD_DIR: upDir, UPLOAD_IP_PER_HOUR: "1000" } });
await app.listen({ port: 0, host: "127.0.0.1" });
const apiPort = app.server.address().port;
const web = http.createServer((req, res) => {
  if (req.url.startsWith("/api/") || req.url.startsWith("/u/")) {
    const p = http.request({ host: "127.0.0.1", port: apiPort, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on("error", () => { res.writeHead(502); res.end(); }); req.pipe(p); return;
  }
  if (req.url.split("?")[0] === "/config.js") { res.writeHead(200, { "content-type": "application/javascript", "content-security-policy": csp }); return res.end('window.CAFINO_CONFIG={apiBaseUrl:"same-origin",cafeId:"",pushUrl:"",vapidPublicKey:"",pushKey:""};'); }
  let f = path.join(PWA, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!f.startsWith(PWA)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PWA, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "content-security-policy": csp, "x-content-type-options": "nosniff", "cache-control": "no-cache" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${web.address().port}`;
const api = async (m, u, body, tok) => { const r = await fetch(base + u, { method: m, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const getBytes = async (u, tok) => new Uint8Array(await (await fetch(base + u, { headers: { authorization: `Bearer ${tok}` } })).arrayBuffer());

const email = "owner@cafe.test", password = "Str0ng-pass-123";
const reg = await api("POST", "/api/auth/register", { email, password, firstName: "حامد", lastName: "تست", shopName: "کافی‌نت آزمایشی" });
ok(reg.status === 201, "register via API");
const tok = reg.json.data.accessToken;
const other = await api("POST", "/api/auth/register", { email: "other@cafe.test", password, firstName: "دیگر", lastName: "کافی", shopName: "کافی‌نت دیگر" });
const otherCode = (await api("GET", "/api/uploads/settings", null, other.json.data.accessToken)).json.data.code;
const TXT = Buffer.from("سلام\nخط دوم", "utf8");


const LOGO = process.env.SHOP_LOGO;   // PNG آزمایشی
const logoUrl = "data:image/png;base64," + fs.readFileSync(LOGO).toString("base64");
const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const viol = [], errs = [];
const watch = (page, tag) => { page.on("pageerror", (e) => errs.push(`${tag}: ${e.message}`)); page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(`${tag}: ${m.text().slice(0, 200)}`); }); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage(); watch(p, "cafe");
await p.goto(base + "/"); await p.waitForSelector('input[type="email"]', { timeout: 30000 });
await p.fill('input[type="email"]', "owner@cafe.test"); await p.fill('input[type="password"]', "Str0ng-pass-123"); await p.press('input[type="password"]', "Enter");
await p.waitForSelector('[data-testid="sync-chip"]', { timeout: 30000 });
// پروفایل فروشگاه (همان کلیدی که صفحهٔ «پروفایل فروشگاه» می‌نویسد)
await p.evaluate((logo) => localStorage.setItem("cafenet_shop", JSON.stringify({ name: "کافی‌نت آفتاب", address: "تهران، خیابان آزادی، پلاک ۱۲", phone: "021-12345678", mobile: "09121234567", logo })), logoUrl);
await p.goto(base + "/?tab=uploads"); await p.waitForSelector('[data-testid="up-sessions"], [data-testid="up-settings"], [data-testid="uploads-page"]', { timeout: 30000 }).catch(() => {});
// همگام‌سازی خودکار باید متن‌ها و لوگو را به سرور برساند
let st; for (let i = 0; i < 40; i++) { st = (await api("GET", "/api/uploads/settings", null, tok)).json.data; if (st.hasLogo && st.shopAddress) break; await p.waitForTimeout(500); }
ok(st.shopName === "کافی‌نت آفتاب" && st.shopAddress.includes("آزادی") && st.shopPhone === "021-12345678" && st.shopMobile === "09121234567", "profile texts auto-synced to the server");
ok(st.hasLogo, "profile logo auto-uploaded (resized) to the server");
const lg = await fetch(base + `/u/${st.code}/logo`); const lb = Buffer.from(await lg.arrayBuffer());
ok(lg.status === 200 && /^image\/(png|webp)$/.test(lg.headers.get("content-type")) && lb.length < 150 * 1024, `server logo ${lg.headers.get("content-type")} ${lb.length}B (<150KB)`);

// ── مشتری (موبایل، بدون ورود)
const cctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
const c = await cctx.newPage(); watch(c, "customer");
const fontReq = []; c.on("response", (r) => { if (/\/u\/assets\/vazirmatn/.test(r.url())) fontReq.push([r.url().split("/").pop(), r.status()]); });
await c.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`)); });
await c.goto(base + `/u/${st.code}`); await c.waitForSelector("#form:not(.hide)", { timeout: 15000 });
await c.evaluate(() => document.fonts.ready); await c.waitForTimeout(500);
const info = await c.evaluate(() => {
  const imgs = [...document.querySelectorAll("header img, .brand img, img")].map((i) => ({ src: i.getAttribute("src") || "", w: i.naturalWidth, h: i.naturalHeight, vis: i.getBoundingClientRect().width > 8 && getComputedStyle(i).visibility !== "hidden", x: Math.round(i.getBoundingClientRect().left) }));
  const ff = getComputedStyle(document.body).fontFamily;
  return { imgs, ff, body: document.body.innerText, vaz: document.fonts.check("16px Vazirmatn"), loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + f.weight) };
});
console.log(JSON.stringify({ imgs: info.imgs, ff: info.ff, loaded: info.loaded, fontReq }));
ok(/Vazirmatn/i.test(info.ff), "body font-family starts with Vazirmatn: " + info.ff.slice(0, 60));
ok(info.loaded.some((f) => /Vazirmatn/i.test(f)), "Vazirmatn actually loaded by the browser: " + info.loaded.join(","));
ok(fontReq.length >= 1 && fontReq.every(([, s]) => s === 200), "font files served 200 from the same origin: " + JSON.stringify(fontReq));
const boxes = await c.evaluate(() => { const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; }; return { cafe: r(document.querySelector("#shopLogo")), cafino: r(document.querySelector(".logos svg")), cafeVisible: !document.querySelector("#shopLogo").classList.contains("hide") }; });
ok(boxes.cafeVisible && boxes.cafe.w >= 40 && boxes.cafino.w >= 40 && Math.abs(boxes.cafe.y - boxes.cafino.y) < 12 && Math.abs(boxes.cafe.x - boxes.cafino.x) >= 40, "cafe logo is beside the Cafino logo (same row): " + JSON.stringify(boxes));
ok(info.imgs.some((i) => /logo\?v=/.test(i.src) && i.w > 0), "cafe logo image decoded (naturalWidth>0)");
for (const t of ["کافی‌نت آفتاب", "تهران، خیابان آزادی، پلاک ۱۲", "021-12345678", "09121234567"]) ok(info.body.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).includes(t.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))), "customer page shows: " + t);
const tel = await c.$$eval('a[href^="tel:"]', (a) => a.map((x) => x.getAttribute("href")));
ok(tel.length >= 1 && tel.every((h) => /^tel:[+0-9]+$/.test(h)), "tel: links are clean: " + tel.join(","));
ok((await c.evaluate(() => window.__csp)).length === 0, "customer page: no CSP violations");
ok(viol.length === 0 && errs.length === 0, "no console CSP/page errors " + JSON.stringify([...viol, ...errs]));
await c.screenshot({ path: process.env.SHOT || "/tmp/customer-page.png", fullPage: true });

// ── خاموش کردن نمایش مشخصات → فقط لوگوی کافینو
await api("PUT", "/api/uploads/settings", { showShopInfo: false }, tok);
await c.reload(); await c.waitForSelector("#form:not(.hide)", { timeout: 15000 });
const off = await c.evaluate(() => ({ body: document.body.innerText, imgs: [...document.querySelectorAll("img")].filter((i) => /logo\?v=/.test(i.getAttribute("src") || "")).length }));
ok(!off.body.includes("آزادی") && off.imgs === 0, "with 'show shop info' off: no address and no cafe logo");
await api("PUT", "/api/uploads/settings", { showShopInfo: true }, tok);

// ── حذف لوگو در پروفایل → از سرور هم پاک می‌شود
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("cafenet_shop")); s.logo = ""; localStorage.setItem("cafenet_shop", JSON.stringify(s)); });
await p.reload(); await p.waitForTimeout(500); await p.goto(base + "/?tab=uploads");
let gone = false; for (let i = 0; i < 40; i++) { if (!(await api("GET", "/api/uploads/settings", null, tok)).json.data.hasLogo) { gone = true; break; } await p.waitForTimeout(500); }
ok(gone, "removing the logo in the shop profile removes it on the server");

// ── «درباره من»
await p.goto(base + "/?tab=about"); await p.waitForSelector('[data-testid="about-page"]', { timeout: 20000 });
const feats = await p.$$eval('[data-testid="about-feature"]', (e) => e.map((x) => [x.dataset.since, x.textContent]));
ok(feats.filter(([s]) => s === "1.83.0").length >= 1 && (await p.$$('[data-testid="about-new"]')).length >= 1, "About page shows the new 1.83.0 feature with a «جدید» badge");
ok((await p.textContent('[data-testid="about-version"]')).includes("1.83.0"), "About page shows v1.83.0");
ok(feats.some(([, t]) => t.includes("QR موقت")) && feats.some(([, t]) => t.includes("ابزارهای PDF")), "About page lists the 1.77 features too");
await p.screenshot({ path: process.env.SHOT_ABOUT || "/tmp/about.png", fullPage: true });

await b.close(); web.close(); await app.close(); await pool.end(); await stopDb(); fs.rmSync(upDir, { recursive: true, force: true });
console.log(fails ? `FAILED: ${fails}` : "ALL PASSED"); process.exit(fails ? 1 : 0);
