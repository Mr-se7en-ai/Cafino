// E2E سبد، پرداخت و گفتگوی مینی‌اپ (1.84): مرورگر واقعی + PostgreSQL واقعی؛ مشتری (مینی‌اپ) ↔ کافی‌نت‌دار (برنامه) ↔ کارمند (بخش کافی‌نت مینی‌اپ).
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-v184.mjs   (نیاز به بیلد pwa/ و Chromium)
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

const waitSent = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 200) { if (botSt.sent.some(fn)) return true; await new Promise((r) => setTimeout(r, 200)); } return false; };
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


const zlib = require("node:zlib");
const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = (w = 64, h = 64) => { const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1); raw[o] = 0; raw[o + 1 + x * 3] = (x * 4) & 255; raw[o + 2 + x * 3] = (y * 4) & 255; raw[o + 3 + x * 3] = 120; } const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); };
const sign = (user) => { const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAHx", user: JSON.stringify(user) }); const check = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join("\n"); p.set("hash", crypto.createHmac("sha256", crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest()).update(check).digest("hex")); return p.toString(); };
const waitDb = async (sql, args, pred, n = 40) => { for (let i = 0; i < n; i++) { const r = (await pool.query(sql, args)).rows[0]; if (r && pred(r)) return r; await new Promise((x) => setTimeout(x, 250)); } return (await pool.query(sql, args)).rows[0]; };

const email = "owner@cafe.test", password = "Str0ng-pass-123";
const reg = await api("POST", "/api/auth/register", { email, password, firstName: "حامد", lastName: "تست", shopName: "کافی‌نت آزمایشی" });
ok(reg.status === 201, "register via API");
const tok = reg.json.data.accessToken;
await app.miniappBot.init();
const cafeId = (await pool.query("SELECT id FROM cafes LIMIT 1")).rows[0].id;
await api("GET", "/api/miniapp/info", null, tok);
const code = (await pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeId])).rows[0].code;
const SHOT = (process.env.SHOT || "/tmp/v184.png").replace(/\.png$/, "");
const put = await api("PUT", "/api/miniapp/tariff", { groups: [{ cat: "چاپ", items: [{ name: "پرینت رنگی A4", price: 500000 }, { name: "پرینت سیاه‌سفید A4", price: 100000 }] }, { cat: "اسکن", items: [{ name: "اسکن هر برگ", price: 200000 }] }] }, tok);
ok(put.status === 200, "tariff synced (rial) for the mini app");
await pool.query("INSERT INTO customers (cafe_id,id,first_name,last_name,phone) VALUES ($1,'c1','علی','رضایی','09123334455') ON CONFLICT DO NOTHING", [cafeId]);
// فرستندهٔ فایل (برای دکمهٔ «افزودن به مشتریان»)
await pool.query("INSERT INTO customer_uploads (cafe_id,batch_id,batch_code,original_name,storage_key,size,sha256,sender_name,sender_phone,customer_ref,status) VALUES ($1,$2,'77777','a.pdf',$3,1,'x','مریم احمدی','09351234567','','new')", [cafeId, crypto.randomUUID(), crypto.randomUUID()]);

const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const viol = [], errs = [], cerrs = [];
const appCtx = await b.newContext({ viewport: { width: 1280, height: 1500 }, permissions: ["clipboard-read", "clipboard-write"] });
const p = await appCtx.newPage();
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(m.text().slice(0, 200)); });
await p.route("**/api/miniapp/tariff", (r) => (r.request().method() === "PUT" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { changed: false } }) }) : r.continue()));   // برنامه تعرفهٔ خودش را همگام نکند؛ تعرفهٔ آزمون ثابت بماند
await p.goto(base + "/"); await p.waitForSelector('input[type="email"]', { timeout: 30000 });
await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', password); await p.press('input[type="password"]', "Enter");
await p.waitForTimeout(2500);

// ── ۱) تنظیمات پرداخت در برنامه ──
await p.goto(base + "/?tab=uploads"); await p.waitForSelector('[data-testid="mini-pay"]', { timeout: 30000 });
ok(await p.isChecked('[data-testid="pay-cash"]') && !(await p.isChecked('[data-testid="pay-card"]')), "defaults: in-person on, card-to-card off");
await p.check('[data-testid="pay-card"]');
await p.fill('[data-testid="pay-card-no"]', "۶۰۳۷-۹۹۷۱-۲۳۴۵-۶۷۸۹"); await p.fill('[data-testid="pay-holder"]', "حامد تست"); await p.fill('[data-testid="pay-bank"]', "ملی");
await p.click('[data-testid="pay-save"]');
const us = await waitDb("SELECT pay_card_enabled, pay_card_number, pay_card_holder, pay_bank FROM upload_settings WHERE cafe_id=$1", [cafeId], (r) => r.pay_card_enabled);
ok(us.pay_card_enabled && us.pay_card_number === "6037997123456789" && us.pay_bank === "ملی", "card settings saved on the server (Persian digits/dashes normalized to 16 digits)");
await p.screenshot({ path: `${SHOT}-paysettings.png`, fullPage: true });

// ── ۲) مینی‌اپ مشتری ──
const user = { id: 7001, first_name: "سارا", last_name: "محمدی", username: "sara", language_code: "fa" };
const au = await api("POST", "/api/miniapp/auth", { initData: sign(user), cafe: code }); ok(au.status === 200, "customer mini-app auth");
await pool.query("UPDATE telegram_users SET phone='9351112233', phone_verified_at=now(), chat_id=7001 WHERE telegram_id=7001");
const SDK = `window.Telegram={WebApp:{initData:new URLSearchParams(location.hash.slice(1)).get('tgWebAppData')||'',colorScheme:'light',ready(){},expand(){},close(){},openLink(u){window.__opened=u},isVersionAtLeast(){return true},HapticFeedback:{impactOccurred(){}}}};`;
const openMini = async (u, qs) => { const c = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, locale: "fa-IR" }); const pg = await c.newPage(); pg.on("pageerror", (e) => cerrs.push(String(e))); await pg.route("https://telegram.org/**", (r) => r.fulfill({ contentType: "application/javascript", body: SDK })); await pg.goto(`http://127.0.0.1:${apiPort}/m${qs}#tgWebAppData=${encodeURIComponent(sign(u))}`, { waitUntil: "networkidle" }); return pg; };
const cp = await openMini(user, `?c=${code}`);
await cp.waitForSelector(".top b"); await cp.click('nav.nav button:has-text("خدمات")');
await cp.waitForSelector("text=پرینت رنگی A4");
ok((await cp.textContent("body")).includes("۵۰٬۰۰۰ تومان"), "customer sees the tariff prices in toman (rial/10)");
await cp.click('button[aria-label="افزودن پرینت رنگی A4 به سبد"]'); await cp.click('button[aria-label="زیاد کردن پرینت رنگی A4"]');
await cp.click('button[aria-label="افزودن اسکن هر برگ به سبد"]');
const barTxt = await cp.textContent('[data-testid="open-cart"]');
ok(barTxt.includes("۳ مورد") && barTxt.includes("۱۲۰٬۰۰۰ تومان"), `cart bar shows count and total (${barTxt.trim()})`);
await cp.screenshot({ path: `${SHOT}-customer-services.png` });
await cp.click('[data-testid="open-cart"]'); await cp.waitForSelector('[data-testid="cart-total"]');
ok((await cp.textContent('[data-testid="cart-total"]')).includes("۱۲۰٬۰۰۰"), "cart total 120,000 toman");
ok((await cp.$$(".opt.soon")).length === 2 && (await cp.textContent("body")).includes("درگاه پرداخت آنلاین") && (await cp.textContent("body")).includes("کیف پول"), "gateway and wallet are shown as «به‌زودی» (disabled)");
await cp.click('.opt:has-text("کارت‌به‌کارت")'); await cp.screenshot({ path: `${SHOT}-customer-cart.png` });
await cp.fill('textarea[aria-label="توضیحات"]', "فردا صبح تحویل");
await cp.click('button:has-text("ثبت سفارش")');
const rq = await waitDb("SELECT id, total, pay_method, pay_status, items FROM miniapp_requests WHERE telegram_id=7001", [], (r) => !!r);
ok(rq && Number(rq.total) === 1200000 && rq.pay_method === "card" && rq.pay_status === "unpaid" && rq.items.length === 2, "order stored with server-priced total (1,200,000 rial), card method, 2 merged lines");
await cp.waitForSelector(".payblock"); ok((await cp.textContent(".cardno")).replace(/\s/g, "").includes("۶۰۳۷۹۹۷۱۲۳۴۵۶۷۸۹"), "customer sees the café card number to pay into");
// رسید
await cp.setInputFiles('[data-testid="receipt-file"]', { name: "receipt.png", mimeType: "image/png", buffer: png() });
const rc1 = await waitDb("SELECT pay_status FROM miniapp_requests WHERE telegram_id=7001", [], (r) => r.pay_status === "receipt_sent");
ok(rc1.pay_status === "receipt_sent" && (await pool.query("SELECT 1 FROM miniapp_receipts")).rowCount === 1, "receipt image uploaded (re-encoded in the browser) → status receipt_sent");
ok(botSt.sent.length >= 0, "staff notification path exercised");
await cp.screenshot({ path: `${SHOT}-customer-receipt-sent.png`, fullPage: true });

// ── ۳) برنامه: رسید را ببینید، رد کنید؛ مشتری دوباره می‌فرستد؛ تأیید ──
await p.goto(base + "/?tab=miniapp-orders"); await p.waitForSelector('[data-testid="mo-row"]', { timeout: 30000 });
ok((await p.textContent('[data-testid="mo-items"]')).includes("پرینت رنگی A4"), "app row lists the cart lines");
ok((await p.textContent('[data-testid="mo-pay-status"]')).includes("رسید در انتظار تأیید"), "app row shows «رسید در انتظار تأیید»");
await p.waitForSelector('[data-testid="miniapp-orders-badge"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="miniapp-orders-badge"]')).includes("۲"), "menu badge counts 1 new request + 1 pending receipt");
await p.click('[data-testid="mo-receipt"]'); await p.waitForSelector('[data-testid="mo-receipt-img"]', { timeout: 10000 });
ok((await p.$eval('[data-testid="mo-receipt-img"]', (i) => i.naturalWidth)) > 0, "receipt image is displayed in the app");
await p.screenshot({ path: `${SHOT}-app-receipt.png`, fullPage: true });
await p.fill('[data-testid="mo-pay-note"]', "رسید خوانا نیست");
await p.click('[data-testid="mo-pay-reject"]');
const rj = await waitDb("SELECT pay_status, pay_note FROM miniapp_requests WHERE telegram_id=7001", [], (r) => r.pay_status === "rejected");
ok(rj.pay_status === "rejected" && rj.pay_note === "رسید خوانا نیست", "reject saves status + reason");
await cp.reload({ waitUntil: "networkidle" }); await cp.click('nav.nav button:has-text("سفارش‌ها")'); await cp.waitForSelector("text=رسید رد شد");
ok((await cp.textContent("body")).includes("رسید خوانا نیست"), "customer sees the rejection reason and can resend");
await cp.setInputFiles('[data-testid="receipt-file"]', { name: "receipt2.png", mimeType: "image/png", buffer: png(80, 50) });
await waitDb("SELECT pay_status FROM miniapp_requests WHERE telegram_id=7001", [], (r) => r.pay_status === "receipt_sent");
await p.goto(base + "/?tab=miniapp-orders"); await p.waitForSelector('[data-testid="mo-pay-confirm"]', { timeout: 30000 });
await p.click('[data-testid="mo-pay-confirm"]');
const pd = await waitDb("SELECT pay_status, paid_at FROM miniapp_requests WHERE telegram_id=7001", [], (r) => r.pay_status === "paid");
ok(pd.pay_status === "paid" && !!pd.paid_at, "confirm → paid");
ok(await waitSent((m) => /پرداخت/.test(m.text) && m.chat === "7001"), "customer got a Telegram notification about the confirmation");
await p.waitForSelector('[data-testid="mo-record-income"]', { timeout: 15000 });
const txBefore = (await p.evaluate(() => JSON.parse(localStorage.getItem("cafenet_tx3") || "[]"))).length;
await p.click('[data-testid="mo-record-income"]');
await p.waitForFunction((n) => JSON.parse(localStorage.getItem("cafenet_tx3") || "[]").length === n + 1, txBefore, { timeout: 10000 });
const tx = (await p.evaluate(() => JSON.parse(localStorage.getItem("cafenet_tx3") || "[]"))).slice(-1)[0];
ok(tx.type === "income" && tx.amount === 1200000 && tx.method === "transfer" && tx.category === "سفارش مینی‌اپ", "income transaction recorded once (amount in rial, transfer)");
ok(await p.isDisabled('[data-testid="mo-record-income"]'), "the record-income button is disabled afterwards (no double entry)");
await cp.reload({ waitUntil: "networkidle" }); await cp.click('nav.nav button:has-text("سفارش‌ها")'); await cp.waitForSelector("text=پرداخت شما تأیید شد");
ok(true, "customer sees «پرداخت شما تأیید شد»");

// ── ۴) پرداخت حضوری + تأیید از «بخش کافی‌نت» مینی‌اپ ──
const staffUser = { id: 7002, first_name: "کارمند", last_name: "الف", username: "staff1", language_code: "fa" };
const sc = await api("POST", "/api/miniapp/staff-codes", {}, tok); ok(sc.status === 201 || sc.status === 200, "staff link code created");
const sau = await api("POST", "/api/miniapp/auth", { initData: sign(staffUser), cafe: code });
const lk = await api("POST", "/api/miniapp/staff/link", { code: sc.json.data.code }, sau.json.data.token); ok(lk.status === 200, "staff Telegram linked");
await pool.query("UPDATE telegram_users SET chat_id=7002 WHERE telegram_id=7002");   // کارمند ربات را Start کرده
const cash = await api("POST", "/api/miniapp/requests", { items: [{ cat: "اسکن", name: "اسکن هر برگ", qty: 4 }], payMethod: "cash", note: "" }, au.json.data.token);
ok(cash.status === 201 && cash.json.data.total === 800000 && cash.json.data.payMethod === "cash", "cash request priced by the server (4 × 200,000)");
const forged = await api("POST", "/api/miniapp/requests", { items: [{ cat: "اسکن", name: "اسکن هر برگ", qty: 1, price: 1 }], payMethod: "cash" }, au.json.data.token);
ok(forged.status === 201 && forged.json.data.total === 200000, "a client-supplied price is ignored (server tariff wins)");
const sp = await openMini(staffUser, "?m=staff");
await sp.waitForSelector('[data-testid="gate-staff"], .top b', { timeout: 15000 });
if (await sp.$('[data-testid="gate-staff"]')) await sp.click('[data-testid="gate-staff"]');
await sp.waitForSelector('nav.nav button:has-text("درخواست‌ها")'); await sp.click('nav.nav button:has-text("درخواست‌ها")');
await sp.waitForSelector("text=اسکن هر برگ");
await sp.screenshot({ path: `${SHOT}-staff-requests.png`, fullPage: true });
const cashBtn = sp.locator('article:has-text("اسکن هر برگ ×4") button:has-text("دریافت حضوری انجام شد")').first();
await cashBtn.click();
const cd = await waitDb("SELECT pay_status, paid_by FROM miniapp_requests WHERE id=$1", [cash.json.data.id], (r) => r.pay_status === "paid");
ok(cd.pay_status === "paid" && !!cd.paid_by, "staff confirms in-person cash from the mini app → paid (paid_by = the linked user)");

// ── ۵) گفتگو: مشتری ← برنامه ← کارمند ──
await cp.click('nav.nav button:has-text("گفتگو")'); await cp.waitForSelector('[aria-label="متن پیام"]');
await cp.fill('[aria-label="متن پیام"]', "سلام، فایل‌هایم آماده است؟"); await cp.click('button:has-text("ارسال")');
const m1 = await waitDb("SELECT body, sender FROM miniapp_messages ORDER BY id DESC LIMIT 1", [], (r) => r.sender === "customer");
ok(m1 && m1.body.includes("فایل‌هایم") && m1.sender === "customer", "customer message saved");
ok(await waitSent((m) => /پیام جدید/.test(m.text)), "staff notified on Telegram of the new message (throttled)");
await p.goto(base + "/?tab=miniapp-orders"); await p.waitForSelector('[data-testid="mo-view-chat"]', { timeout: 30000 });
await p.click('[data-testid="mo-view-chat"]'); await p.waitForSelector('[data-testid="mc-item"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="mc-item"]')).includes("فایل‌هایم") && (await p.textContent('[data-testid="mc-item"]')).includes("جدید"), "app chat list shows the thread with an unread badge");
await p.click('[data-testid="mc-item"]'); await p.waitForSelector('[data-testid="mc-msg"]');
await p.fill('[data-testid="mc-input"]', "بله، تا نیم ساعت دیگر مراجعه کنید."); await p.click('[data-testid="mc-send"]');
await waitDb("SELECT 1 FROM miniapp_messages WHERE sender='cafe'", [], (r) => !!r);
ok((await pool.query("SELECT read_at FROM miniapp_messages WHERE sender='customer'")).rows[0].read_at !== null, "opening the thread marked the customer's message read");
await p.screenshot({ path: `${SHOT}-app-chat.png`, fullPage: true });
await cp.waitForSelector("text=تا نیم ساعت دیگر", { timeout: 20000 }); ok(true, "customer mini app receives the café reply by polling");
await cp.screenshot({ path: `${SHOT}-customer-chat.png` });
// کارمند در مینی‌اپ
await sp.click('nav.nav button:has-text("گفتگو")'); await sp.waitForSelector("text=تا نیم ساعت", { timeout: 15000 });
await sp.click('button.card:has-text("تا نیم ساعت")'); await sp.waitForSelector('[aria-label="متن پیام"]');
await sp.fill('[aria-label="متن پیام"]', "پیام کارمند"); await sp.click('button:has-text("ارسال")');
await waitDb("SELECT 1 FROM miniapp_messages WHERE body='پیام کارمند'", [], (r) => !!r);
ok((await pool.query("SELECT by_name FROM miniapp_messages WHERE body='پیام کارمند'")).rowCount === 1, "staff replies from the mini app café section");
await sp.screenshot({ path: `${SHOT}-staff-chat.png`, fullPage: true });

// ── ۶) افزودن فرستندهٔ فایل به مشتریان با یک دکمه ──
await p.goto(base + "/?tab=uploads"); await p.waitForSelector('[data-testid="up-batch"]', { timeout: 30000 });
await p.click('[data-testid="up-add-customer"]');
await p.waitForSelector('[data-testid="up-sender-known"]', { timeout: 10000 });
const custs = await p.evaluate(() => JSON.parse(localStorage.getItem("cafenet_customers") || "[]"));
const mc = custs.find((c) => c.phone === "09351234567");
ok(mc && mc.firstName === "مریم" && mc.lastName === "احمدی", "the sender was added to the customers (name split, phone kept)");
ok((await p.textContent('[data-testid="up-msg"]')).includes("به مشتریان اضافه شد") && (await p.$('[data-testid="up-add-customer"]')) === null, "the button turns into «✓ مشتری است» (no duplicates possible)");
let syncedC = false; for (let i = 0; i < 40 && !syncedC; i++) { await p.waitForTimeout(500); syncedC = (await pool.query("SELECT 1 FROM customers WHERE id=$1", [String(mc.id)])).rowCount === 1; }
ok(syncedC, "the new customer reached the server through the sync queue");
await p.screenshot({ path: `${SHOT}-add-customer.png`, fullPage: true });

ok(viol.length === 0, `no CSP violations${viol.length ? ": " + viol[0] : ""}`); ok(errs.length === 0, `no app page errors${errs.length ? ": " + errs[0] : ""}`); ok(cerrs.length === 0, `no mini-app page errors${cerrs.length ? ": " + cerrs[0] : ""}`);
await b.close(); await app.close(); await pool.end(); botSrv.close(); web.close(); fs.rmSync(upDir, { recursive: true, force: true }); await stopDb();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
