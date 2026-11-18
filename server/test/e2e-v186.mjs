// E2E 1.86: «آنلاین شاپ» دکمهٔ مستقل زیر «مدیریت فایل»؛ حذف سه دکمهٔ فروش از منو؛ تنظیمات ← اتصال ← مینی‌اپ تلگرام/بله (ربات اختصاصی کافی‌نت). مرورگر واقعی + PostgreSQL واقعی.
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-v186.mjs   (نیاز به بیلد pwa/ و Chromium)
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
const TOKEN_MINI = "888888881:AAE2e_cafe_mini_telegram_token_0001", TOKEN_MINI_BALE = "888888882:AAE2e_cafe_mini_bale_token_000002";
const botSt = { tokens: { [TOKEN]: { id: 555555555, username: "cafino_e2e_bot", first_name: "کافینو" }, [TOKEN_BALE]: { id: 666666666, username: "cafino_e2e_bale", first_name: "کافینو بله" }, [TOKEN_MINI]: { id: 888888881, username: "cafino_cafe_mini_bot", first_name: "مینی‌اپ کافه" }, [TOKEN_MINI_BALE]: { id: 888888882, username: "cafino_cafe_mini_bale", first_name: "مینی‌اپ کافه بله" } }, q: {}, sent: [], uid: 10 };
const botSrv = http.createServer((req, res) => { let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
  const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url), b = body ? JSON.parse(body) : {}, rep = (o, c = 200) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (!m || !botSt.tokens[m[1]]) return rep({ ok: false, error_code: 401, description: "Unauthorized" }, 401);
  const [, tk, meth] = m;
  if (meth === "getMe") return rep({ ok: true, result: botSt.tokens[tk] }); if (["deleteWebhook", "setMyCommands", "setChatMenuButton"].includes(meth)) return rep({ ok: true, result: true });
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
await p.waitForTimeout(2500);   // ذخیرهٔ نشست پس از ورود
await p.goto(base + "/"); await p.waitForSelector('[data-testid="side-nav"]', { timeout: 30000 });
const topOf = async (sel) => (await (await p.$(sel)).boundingBox()).y;
const bgOf = (sel) => p.$eval(sel, (e) => getComputedStyle(e).backgroundImage);

// ── ۱) آنلاین شاپ: دکمهٔ مستقل زیر «مدیریت فایل»، رنگ جدا ──
const sh = await p.$('[data-testid="nav-miniapp-orders"]');
ok(sh !== null && (await sh.getAttribute("data-featured")) === "1", "«آنلاین شاپ» is a standalone (featured) button");
ok((await sh.textContent()).includes("آنلاین شاپ"), "it is labelled «آنلاین شاپ»");
ok((await p.$('[data-testid="side-nav"] [data-testid="nav-miniapp-orders"]')) === null, "it is not inside the grouped menu");
const unifiedSel = 'button[title="سیستم فروش یکپارچه"]';
const bgShop = await bgOf('[data-testid="nav-miniapp-orders"]'), bgUp = await bgOf('[data-testid="nav-uploads"]'), bgUni = await bgOf(unifiedSel);
ok(/gradient/.test(bgShop) && bgShop !== bgUp && bgShop !== bgUni, "its background differs from «مدیریت فایل» and «فروش یکپارچه» (" + bgShop.slice(0, 60) + ")");
const tU = await topOf(unifiedSel), tF = await topOf('[data-testid="nav-uploads"]'), tS = await topOf('[data-testid="nav-miniapp-orders"]'), tN = await topOf('[data-testid="side-nav"]');
ok(tU < tF && tF < tS && tS < tN, "order: فروش یکپارچه → مدیریت فایل → آنلاین شاپ → منوی گروهی");

// ── ۲) سه دکمهٔ فروش از منوی کناری حذف شد (حتی با باز بودن همهٔ گروه‌ها) ──
let navTxt = await p.textContent('[data-testid="side-nav"]');
if (!navTxt.includes("صندوق")) { await p.click('[data-testid="navgrp-btn-shop"]'); await p.waitForTimeout(500); navTxt = await p.textContent('[data-testid="side-nav"]'); }
for (const w of ["فروش حضوری", "فروش آنلاین", "فروش خدمات"]) ok(!navTxt.includes(w), `«${w}» is gone from the side menu`);
ok(navTxt.includes("صندوق") && navTxt.includes("فروش کپی و اسکن"), "the remaining shop entries (صندوق، کپی و اسکن…) are still there");
await p.click(unifiedSel); await p.waitForTimeout(1500);
ok((await p.textContent("body")).includes("فروش"), "«فروش یکپارچه» still opens the sale popup");
await p.click('[data-testid="sw-x"]'); await p.waitForTimeout(500);
await p.click('[data-testid="nav-miniapp-orders"]'); await p.waitForSelector("text=🛒 آنلاین شاپ", { timeout: 15000 });
ok(true, "clicking «آنلاین شاپ» opens its page");

// ── ۳) تنظیمات ← اتصال ← مینی‌اپ تلگرام ──
await p.click('[data-testid="nav-settings"]'); await p.waitForSelector('[data-testid="settings-tab-connections"]', { timeout: 30000 });
await p.click('[data-testid="settings-tab-connections"]'); await p.waitForSelector('[data-testid="connections-panel"]');
const tabs = await p.$$eval('[data-testid^="conn-tab-"]', (els) => els.map((e) => e.textContent.trim()));
ok(tabs.length === 5 && tabs.some((t) => t.includes("مینی‌اپ تلگرام")) && tabs.some((t) => t.includes("مینی‌اپ بله")), "connection sub-tabs include «مینی‌اپ تلگرام» and «مینی‌اپ بله» (" + tabs.join(" | ") + ")");
await p.click('[data-testid="conn-tab-mini-telegram"]'); await p.waitForSelector('[data-testid="mbot-card-telegram"]', { timeout: 15000 });
ok(/متصل نیست/.test(await p.textContent('[data-testid="mbot-status-telegram"]')), "telegram mini-app bot starts as «متصل نیست»");
const btn = p.locator('[data-testid="mbot-connect-telegram"]');
ok(await btn.isDisabled(), "connect is disabled until the token looks valid");
await p.fill('[data-testid="mbot-token-telegram"]', "bad-token"); ok(await btn.isDisabled(), "a malformed token keeps it disabled");
await p.fill('[data-testid="mbot-token-telegram"]', TOKEN_MINI); await btn.click();
await p.waitForSelector('[data-testid="mbot-ok-telegram"]', { timeout: 20000 });
ok(/فعال/.test(await p.textContent('[data-testid="mbot-status-telegram"]')), "connected: status «فعال»");
ok((await p.textContent('[data-testid="mbot-card-telegram"]')).includes("@cafino_cafe_mini_bot"), "bot @username is shown");
const link = await p.textContent('[data-testid="mbot-link-telegram"]');
ok(/^https:\/\/t\.me\/cafino_cafe_mini_bot\?start=c_/.test(link.trim()), "own bot link shown (" + link.trim() + ")");
ok((await p.$('[data-testid="mbot-qr-telegram"] svg')) !== null, "QR for the café's own bot is drawn");
ok(!(await p.content()).includes(TOKEN_MINI.split(":")[1]), "the token is never shown again after saving");
const row = (await pool.query("SELECT token_enc, enabled FROM miniapp_cafe_bots WHERE provider='telegram'")).rows[0];
ok(row && row.enabled && !row.token_enc.includes(TOKEN_MINI.split(":")[1]), "stored encrypted in the database");
// خاموش/روشن
await p.click('[data-testid="mbot-toggle-telegram"]'); await p.waitForFunction(() => /خاموش/.test(document.querySelector('[data-testid="mbot-status-telegram"]')?.textContent || ""), null, { timeout: 15000 });
ok(true, "toggle off → status «خاموش»");
await p.click('[data-testid="mbot-toggle-telegram"]'); await p.waitForFunction(() => /فعال/.test(document.querySelector('[data-testid="mbot-status-telegram"]')?.textContent || ""), null, { timeout: 15000 });
// ربات واقعاً کافی‌نت را می‌شناسد: /start → خوش‌آمد همان کافی‌نت
(botSt.q[TOKEN_MINI] ||= []).push({ update_id: ++botSt.uid, message: { text: "/start", chat: { id: 7001, type: "private" }, from: { id: 7001, is_bot: false, first_name: "علی" } } }); await app.miniappCafeBots.tick();
ok(botSt.sent.some((s) => s.tk === TOKEN_MINI && s.chat === "7001" && s.text.includes("کافی‌نت آزمایشی")), "the café's own bot answers /start with this café's welcome");
await p.screenshot({ path: process.env.SHOT || "/tmp/v186-mini-telegram.png" });
// بله
await p.click('[data-testid="conn-tab-mini-bale"]'); await p.waitForSelector('[data-testid="mbot-card-bale"]', { timeout: 15000 });
ok(/آزمایش نشده/.test(await p.textContent('[data-testid="mbot-card-bale"]')), "the Bale tab states honestly that Bale login is untested");
await p.fill('[data-testid="mbot-token-bale"]', TOKEN_MINI_BALE); await p.click('[data-testid="mbot-connect-bale"]');
await p.waitForSelector('[data-testid="mbot-ok-bale"]', { timeout: 20000 });
ok((await p.textContent('[data-testid="mbot-link-bale"]')).trim() === "https://ble.ir/cafino_cafe_mini_bale", "Bale bot link shown");
// حذف
p.once("dialog", (d) => d.accept()); await p.click('[data-testid="mbot-remove-bale"]');
await p.waitForFunction(() => /متصل نیست/.test(document.querySelector('[data-testid="mbot-status-bale"]')?.textContent || ""), null, { timeout: 15000 });
ok(true, "disconnect → back to «متصل نیست»");

// ── ۴) موبایل: دکمهٔ آنلاین شاپ با رنگ جدا ──
const mp = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await mp.goto(base + "/"); await mp.waitForSelector('input[type="email"]', { timeout: 30000 });
await mp.fill('input[type="email"]', email); await mp.fill('input[type="password"]', password); await mp.press('input[type="password"]', "Enter");
await mp.waitForTimeout(3000);
await mp.click(".m-bottom-nav button:last-child");
await mp.waitForSelector('[data-testid="mnav-miniapp-orders"]', { timeout: 15000 });
const mS = await mp.$eval('[data-testid="mnav-miniapp-orders"]', (e) => { const c = getComputedStyle(e); return { bg: c.backgroundImage, txt: e.textContent }; });
const mU = await mp.$eval('[data-testid="mnav-uploads"]', (e) => getComputedStyle(e).backgroundImage);
ok(/gradient/.test(mS.bg) && mS.bg !== mU && mS.txt.includes("آنلاین شاپ"), "mobile menu shows «آنلاین شاپ» with its own coloured background");
ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
ok(viol.length === 0, "no CSP violations");
await b.close(); await app.close(); botSrv.close(); web.close(); await stopDb();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
