// E2E 1.85: «مدیریت فایل» دکمهٔ مستقل با رنگ جدا + «آنلاین شاپ» با ویجت و کاشی زنده. مرورگر واقعی + PostgreSQL واقعی.
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-v185.mjs   (نیاز به بیلد pwa/ و Chromium)
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
await pool.query("INSERT INTO telegram_users (telegram_id,first_name,chat_id) VALUES (424242,'علی',424242),(515151,'سارا',515151) ON CONFLICT DO NOTHING");
await pool.query("INSERT INTO miniapp_requests (cafe_id,telegram_id,customer_name,phone,service,note) VALUES ($1,424242,'علی رضایی','09123334455','پرینت رنگی A4','۲۰ برگ'),($1,515151,'سارا محمدی','09351112233','اسکن مدارک','۵ صفحه')", [cafeId]);
await pool.query("INSERT INTO miniapp_messages (cafe_id,telegram_id,sender,body) VALUES ($1,424242,'customer','سلام، آماده است؟')", [cafeId]);
await p.waitForTimeout(2500);   // ذخیرهٔ نشست پس از ورود
await p.goto(base + "/"); await p.waitForSelector('[data-testid="side-nav"]', { timeout: 30000 });
const topOf = async (sel) => (await (await p.$(sel)).boundingBox()).y;
const bgOf = (sel) => p.$eval(sel, (e) => getComputedStyle(e).backgroundImage);

// ── ۱) مدیریت فایل: دکمهٔ مستقل، رنگ جدا، بیرون از زیرمنوها ──
const up = await p.$('[data-testid="nav-uploads"]');
ok(up !== null, "«مدیریت فایل» button exists");
ok((await up.getAttribute("data-featured")) === "1", "it is a standalone (featured) button");
ok((await up.textContent()).includes("مدیریت فایل") && !(await up.textContent()).includes("دریافت فایل از مشتری"), "it is labelled «مدیریت فایل»");
ok((await p.$('[data-testid="side-nav"] [data-testid="nav-uploads"]')) === null, "it is not inside the grouped menu");
const unifiedSel = 'button[title="سیستم فروش یکپارچه"]';
ok((await bgOf(unifiedSel)) !== (await bgOf('[data-testid="nav-uploads"]')) && /gradient/.test(await bgOf('[data-testid="nav-uploads"]')), "its background differs from «فروش یکپارچه»");
ok((await topOf('[data-testid="nav-uploads"]')) > (await topOf(unifiedSel)) && (await topOf('[data-testid="nav-uploads"]')) < (await topOf('[data-testid="side-nav"]')), "it sits under «فروش یکپارچه» and above the menu");
ok((await p.$$('[data-testid="side-nav"] >> text=دریافت فایل از مشتری')).length === 0, "the old name is gone from the menu");
await p.click('[data-testid="nav-uploads"]'); await p.waitForSelector("text=مدیریت فایل", { timeout: 15000 });
ok((await p.textContent("body")).includes("QR"), "clicking it opens the file manager page");

// ── ۲) آنلاین شاپ: نام منو + صفحه ──
let shopBtn = await p.waitForSelector('[data-testid="nav-miniapp-orders"]', { state: "attached", timeout: 15000 });
if (!(await shopBtn.isVisible())) { await p.click('[data-testid="navgrp-btn-shop"]'); }
ok((await shopBtn.textContent()).includes("آنلاین شاپ") && !(await shopBtn.textContent()).includes("سفارش‌های مینی‌اپ"), "shop menu entry renamed to «آنلاین شاپ»");
await shopBtn.click(); await p.waitForSelector("text=🛒 آنلاین شاپ", { timeout: 15000 });
ok(true, "page title is «آنلاین شاپ»");

// ── ۳) داشبورد: ویجت زنده + کاشی‌های زنده ──
await p.click('[data-testid="nav-dashboard"]');
await p.waitForSelector('[data-widget="onlineShop"]', { timeout: 30000 });
const faceTxt = toEn(await p.textContent('[data-widget="onlineShop"]'));
ok(/آنلاین شاپ/.test(faceTxt) && /[1-9]/.test(faceTxt), "live tile face «آنلاین شاپ» shows the live count (" + faceTxt.replace(/\s+/g, " ").slice(0, 50) + ")");
await p.click('[data-widget="onlineShop"]'); await p.waitForSelector('[data-testid="online-shop-widget"]', { timeout: 30000 });
// شمارندهٔ پیام از نظرسنجی ۳۰ثانیه‌ای می‌آید؛ منتظرش می‌مانیم
await p.waitForFunction(() => (document.querySelector('[data-testid="online-shop-chat"]')?.textContent || "").includes("۱"), null, { timeout: 60000 });
const wTxt = await p.textContent('[data-testid="online-shop-widget"]');
ok(/آنلاین شاپ/.test(wTxt), "dashboard widget «آنلاین شاپ» is shown");
ok(toEn((await p.textContent('[data-testid="online-shop-new"]')).replace(/\D/g, (m) => m)).includes("2"), "widget counts the 2 new requests live");
ok(toEn(await p.textContent('[data-testid="online-shop-chat"]')).includes("1"), "widget counts the unread customer message");
ok(wTxt.includes("پرینت رنگی A4") || wTxt.includes("اسکن مدارک"), "widget lists the latest requests");
ok((await p.$('[data-testid="qa-onlineshop"]')) !== null && (await p.$('[data-testid="qa-filemanager"]')) !== null, "live quick tiles «آنلاین شاپ» and «مدیریت فایل» exist");
const tTxt = await p.textContent('[data-testid="qa-onlineshop"]');
ok(/آنلاین شاپ/.test(tTxt) && toEn(tTxt).match(/[3-9]/), "the live tile shows the count needing attention (" + toEn(tTxt).replace(/\s+/g, " ").slice(0, 40) + ")");
await p.click('[data-testid="qa-onlineshop"]'); await p.waitForSelector("text=🛒 آنلاین شاپ", { timeout: 15000 });
ok(true, "tile opens the online shop page");
await p.screenshot({ path: process.env.SHOT || "/tmp/v185.png" });

// ── ۴) موبایل: دکمهٔ مدیریت فایل با رنگ جدا ──
const mp = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await mp.goto(base + "/"); await mp.waitForSelector('input[type="email"]', { timeout: 30000 });
await mp.fill('input[type="email"]', email); await mp.fill('input[type="password"]', password); await mp.press('input[type="password"]', "Enter");
await mp.waitForTimeout(3000);
await mp.click(".m-bottom-nav button:last-child");
await mp.waitForSelector('[data-testid="mnav-uploads"]', { timeout: 15000 });
const mStyle = await mp.$eval('[data-testid="mnav-uploads"]', (e) => { const c = getComputedStyle(e); return { bg: c.backgroundImage, color: c.color, txt: e.textContent }; });
ok(/gradient/.test(mStyle.bg) && mStyle.txt.includes("مدیریت فایل"), "mobile menu shows «مدیریت فایل» with its own coloured background (" + mStyle.txt.trim() + ")");
ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
ok(viol.length === 0, "no CSP violations");
await b.close(); await app.close(); botSrv.close(); web.close(); await stopDb();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
