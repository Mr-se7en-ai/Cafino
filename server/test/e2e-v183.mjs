// E2E «سفارش‌های مینی‌اپ» (1.83): مرورگر واقعی + PostgreSQL واقعی. درخواست مشتری ← دیده‌شدن در برنامه ← پذیرش/ثبت سفارش/مشتری جدید ← انجام شد.
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-v183.mjs   (نیاز به بیلد pwa/ و Chromium)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import os from "node:os";
import crypto from "node:crypto";
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
const TOKEN = "555555555:AAE2e_telegram_token_for_browser_01", TOKEN_BALE = "666666666:bale_e2e_token_for_browser_zz0099aa";
const botSt = { tokens: { [TOKEN]: { id: 555555555, username: "cafino_e2e_bot", first_name: "کافینو" }, [TOKEN_BALE]: { id: 666666666, username: "cafino_e2e_bale", first_name: "کافینو بله" } }, q: {}, sent: [], uid: 10 };
const botSrv = http.createServer((req, res) => { let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
  const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url), b = body ? JSON.parse(body) : {}, rep = (o, c = 200) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (!m || !botSt.tokens[m[1]]) return rep({ ok: false, error_code: 401, description: "Unauthorized" }, 401);
  const [, tk, meth] = m;
  if (meth === "getMe") return rep({ ok: true, result: botSt.tokens[tk] }); if (meth === "deleteWebhook") return rep({ ok: true, result: true });
  if (meth === "getUpdates") { const q = (botSt.q[tk] ||= []); return rep({ ok: true, result: b.offset < 0 ? q.slice(-1) : q.filter((u) => u.update_id >= (b.offset || 0)) }); }
  if (meth === "sendMessage") { botSt.sent.push({ tk, chat: String(b.chat_id), text: b.text }); return rep({ ok: true, result: { message_id: 1 } }); }
  rep({ ok: false, error_code: 404, description: "x" }, 404); }); });
await new Promise((r) => botSrv.listen(0, "127.0.0.1", r)); const botBase = `http://127.0.0.1:${botSrv.address().port}`;
const say = (tk, chat, text) => { (botSt.q[tk] ||= []).push({ update_id: ++botSt.uid, message: { text, chat: { id: chat, type: "private", first_name: "علی" } } }); };
const { app, pool } = await makeApp(dbUrl, { env: { RATE_LIMIT_MAX: "100000", UPLOAD_DIR: upDir, BOTS_ENABLED: "false", TELEGRAM_API_BASE: botBase, BALE_API_BASE: botBase, MINIAPP_BOT_TOKEN: TOKEN, MINIAPP_URL: "https://cafino.example.ir/m" } });
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
await app.miniappBot.init();     // getMe از Bot API جعلی → نام کاربری ربات

const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const viol = [], errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 1300 }, permissions: ["clipboard-read", "clipboard-write"] });
const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(m.text().slice(0, 200)); });
await p.goto(base + "/"); await p.waitForSelector('input[type="email"]', { timeout: 30000 });
await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', password); await p.press('input[type="password"]', "Enter");
const cafeId = (await pool.query("SELECT id FROM cafes LIMIT 1")).rows[0].id;
const SHOT = (process.env.SHOT || "/tmp/v183.png").replace(/\.png$/, "");
// ── دو درخواست: مشتریِ شناخته‌شده و مشتریِ ناشناخته (با موبایل به‌شکل +98) ──
await pool.query("INSERT INTO customers (cafe_id,id,first_name,last_name,phone) VALUES ($1,'c1','علی','رضایی','09123334455') ON CONFLICT DO NOTHING", [cafeId]);
await pool.query("INSERT INTO telegram_users (telegram_id,first_name) VALUES (424242,'علی'),(515151,'سارا') ON CONFLICT DO NOTHING");
await pool.query("INSERT INTO miniapp_requests (cafe_id,telegram_id,customer_id,customer_name,phone,service,note) VALUES ($1,424242,'c1','علی رضایی','09123334455','پرینت رنگی A4','۲۰ برگ')", [cafeId]);
await pool.query("INSERT INTO miniapp_requests (cafe_id,telegram_id,customer_id,customer_name,phone,service,note) VALUES ($1,515151,NULL,'سارا محمدی','+989351112233','اسکن مدارک','۵ صفحه، فوری')", [cafeId]);
await p.waitForTimeout(2500);   // ذخیرهٔ نشست پس از ورود
await p.goto(base + "/?tab=miniapp-orders");
try { await p.waitForSelector('[data-testid="mo-row"]', { timeout: 30000 }); } catch (e) { console.log("DEBUG", (await p.evaluate(() => document.body.innerText)).slice(0, 600), errs.slice(0, 3)); await p.screenshot({ path: `${SHOT}-debug.png` }); throw e; }
ok(await p.$('[data-testid="nav-miniapp-orders"]') !== null, "the new «سفارش‌های مینی‌اپ» entry exists in the shop menu");
ok((await p.textContent('[data-testid="mo-new-count"]')).includes("۲"), "header shows 2 new requests");
ok((await p.$$('[data-testid="mo-row"]')).length === 2, "default filter «جدید» lists both requests");
await p.waitForSelector('[data-testid="miniapp-orders-badge"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="miniapp-orders-badge"]')).includes("۲"), "menu badge shows 2");
await p.click('[data-testid="notif-bell"]'); await p.waitForSelector('[data-testid="notif-group"][data-topic="سفارش‌ها"]', { timeout: 10000 });
ok((await p.textContent('[data-testid="notif-group"][data-topic="سفارش‌ها"]')).includes("سفارش تازه از مینی‌اپ"), "notification center shows the new-orders notice in the «سفارش‌ها» topic");
await p.keyboard.press("Escape"); await p.mouse.click(5, 5);
// جست‌وجو
await p.fill('[data-testid="mo-q"]', "اسکن"); ok((await p.$$('[data-testid="mo-row"]')).length === 1 && (await p.textContent('[data-testid="mo-service"]')).includes("اسکن"), "search by service narrows to 1");
await p.fill('[data-testid="mo-q"]', "۰۹۳۵۱۱۱۲۲۳۳"); ok((await p.$$('[data-testid="mo-row"]')).length === 1, "search by phone matches +98 / Persian digits");
await p.fill('[data-testid="mo-q"]', "نامی-که-نیست"); await p.waitForSelector('[data-testid="mo-empty"]', { timeout: 5000 }); ok(true, "no-match shows the empty message");
await p.fill('[data-testid="mo-q"]', "");
await p.screenshot({ path: `${SHOT}-list.png`, fullPage: true });
// ── پذیرش مشتری شناخته‌شده با مبلغ و پاسخ سریع ──
await p.evaluate(() => { localStorage.setItem("cafenet_customers", JSON.stringify([{ id: "c1", firstName: "علی", lastName: "رضایی", phone: "09123334455" }])); });
const r1 = p.locator('[data-testid="mo-row"]', { hasText: "پرینت رنگی A4" });
await r1.locator('[data-testid="mo-quick"]').first().click();
ok((await r1.locator('[data-testid="mo-reply"]').inputValue()).includes("پذیرفته شد"), "quick-reply chip fills the reply box");
await r1.locator('[data-testid="mo-amount"]').fill("۴۵۰۰۰۰");
await r1.locator('[data-testid="mo-accept"]').click();
for (let i = 0; i < 30; i++) { if ((await pool.query("SELECT status FROM miniapp_requests WHERE customer_id='c1'")).rows[0].status === "accepted") break; await p.waitForTimeout(250); }
const q1 = (await pool.query("SELECT status, reply, order_id FROM miniapp_requests WHERE customer_id='c1'")).rows[0];
ok(q1.status === "accepted" && q1.reply.includes("پذیرفته شد") && !!q1.order_id, "accept saves status + reply + linked order id on the server");
const o1 = (await p.evaluate(() => JSON.parse(localStorage.getItem("cafenet_orders") || "[]"))).find((o) => String(o.id) === String(q1.order_id));
ok(o1 && o1.customerId === "c1" && o1.amount === 450000 && o1.source === "miniapp" && o1.status === "new", "local order created for the known customer with the typed amount");
// ── پذیرش مشتری ناشناخته: مشتری هم ساخته می‌شود ──
await p.fill('[data-testid="mo-q"]', "");
const r2 = p.locator('[data-testid="mo-row"]', { hasText: "اسکن مدارک" });
await r2.locator('[data-testid="mo-accept"]').click();
for (let i = 0; i < 30; i++) { if ((await pool.query("SELECT status FROM miniapp_requests WHERE telegram_id=515151")).rows[0].status === "accepted") break; await p.waitForTimeout(250); }
const q2 = (await pool.query("SELECT status, order_id FROM miniapp_requests WHERE telegram_id=515151")).rows[0];
ok(q2.status === "accepted" && !!q2.order_id, "unknown customer's request accepted with an order id");
const cust = await p.evaluate(() => JSON.parse(localStorage.getItem("cafenet_customers") || "[]"));
const nc = cust.find((c) => c.phone === "+989351112233");
ok(nc && nc.firstName === "سارا" && nc.lastName === "محمدی" && cust.length === 2, "a new customer was created in the app from the request (name split, phone kept)");
const o2 = (await p.evaluate(() => JSON.parse(localStorage.getItem("cafenet_orders") || "[]"))).find((o) => String(o.id) === String(q2.order_id));
ok(o2 && nc && o2.customerId === String(nc.id) && o2.amount === 0, "the order is linked to the new customer (no amount typed → 0)");
let synced = false; for (let i = 0; i < 40 && !synced; i++) { await p.waitForTimeout(500); synced = (await pool.query("SELECT 1 FROM orders WHERE id=$1", [String(q2.order_id)])).rowCount === 1 && (await pool.query("SELECT 1 FROM customers WHERE id=$1", [String(nc.id)])).rowCount === 1; }
ok(synced, "the new customer and the order both reached the server through the sync queue");
// ── دکمهٔ «ثبت فروش آنلاین» و «انجام شد» ──
await p.click('[data-testid="mo-filter-accepted"]');
ok((await p.$$('[data-testid="mo-row"]')).length === 2, "«در حال انجام» lists the 2 accepted requests");
await p.locator('[data-testid="mo-row"]', { hasText: "پرینت رنگی A4" }).locator('[data-testid="mo-sell"]').click();
await p.waitForSelector('[data-testid="online-panel"]', { timeout: 15000 }); ok(true, "«ثبت فروش آنلاین» opens the online sale wizard");
await p.screenshot({ path: `${SHOT}-sell.png`, fullPage: true });
await p.goto(base + "/?tab=miniapp-orders"); await p.waitForSelector('[data-testid="mo-row"]', { timeout: 30000 });
await p.click('[data-testid="mo-filter-accepted"]');
await p.locator('[data-testid="mo-row"]', { hasText: "پرینت رنگی A4" }).locator('[data-testid="mo-done"]').click();
for (let i = 0; i < 30; i++) { if ((await pool.query("SELECT status FROM miniapp_requests WHERE customer_id='c1'")).rows[0].status === "done") break; await p.waitForTimeout(250); }
ok((await pool.query("SELECT status FROM miniapp_requests WHERE customer_id='c1'")).rows[0].status === "done", "«انجام شد» is saved");
await p.click('[data-testid="mo-filter-done"]'); ok((await p.$$('[data-testid="mo-row"]')).length === 1, "done filter shows the finished request");
ok((await p.$('[data-testid="miniapp-orders-badge"]')) === null, "menu badge disappears once nothing is new");
ok((await p.evaluate(() => localStorage.getItem("cafino_miniapp_req_new"))) === "0", "cached new-count reset (notification clears)");
await p.screenshot({ path: `${SHOT}-done.png`, fullPage: true });
ok(viol.length === 0, `no CSP violations${viol.length ? ": " + viol[0] : ""}`); ok(errs.length === 0, `no page errors${errs.length ? ": " + errs[0] : ""}`);
await b.close(); await app.close(); await pool.end(); botSrv.close(); web.close(); fs.rmSync(upDir, { recursive: true, force: true }); await stopDb();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
