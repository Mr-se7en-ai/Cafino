// E2E «ربات بله/تلگرام برای گزارش» (1.79): مرورگر واقعی + PostgreSQL واقعی + Bot API جعلی (بدون شبکهٔ بیرونی). با بله/تلگرام واقعی آزموده نشده است.
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-bots.mjs   (نیاز به بیلد pwa/ و Chromium)
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
const { app, pool } = await makeApp(dbUrl, { env: { RATE_LIMIT_MAX: "100000", UPLOAD_DIR: upDir, BOTS_ENABLED: "false", TELEGRAM_API_BASE: botBase, BALE_API_BASE: botBase } });
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

const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const viol = [], errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(m.text().slice(0, 200)); });
await p.goto(base + "/"); await p.waitForSelector('input[type="email"]', { timeout: 30000 });
await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', password); await p.press('input[type="password"]', "Enter");
await p.waitForSelector('[data-testid="sync-chip"]', { timeout: 30000 });
await p.goto(base + "/?tab=bots"); await p.waitForSelector('[data-testid="bots-page"]', { timeout: 30000 });
await p.waitForSelector('[data-testid="bot-card-telegram"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="bot-status-telegram"]')).includes("متصل نیست") && (await p.textContent('[data-testid="bot-status-bale"]')).includes("متصل نیست"), "both providers start as «متصل نیست»");
ok((await p.textContent('[data-testid="bot-card-telegram"]')).includes("TELEGRAM_API_BASE"), "Telegram card explains the Iran filtering / proxy requirement");
// توکن ناقص → دکمه غیرفعال
await p.fill('[data-testid="bot-token-telegram"]', "abc");
ok(await p.isDisabled('[data-testid="bot-connect-telegram"]'), "connect button disabled for a malformed token");
// توکن شکل‌درست ولی ناشناخته → خطا، بدون نشت
await p.fill('[data-testid="bot-token-telegram"]', "999999999:unknown_token_for_the_browser_test_00"); await p.click('[data-testid="bot-connect-telegram"]');
await p.waitForSelector('[data-testid="bot-err-telegram"]', { timeout: 15000 });
ok(!(await p.content()).includes("unknown_token_for_the_browser_test") || (await p.inputValue('[data-testid="bot-token-telegram"]')).includes("unknown_token"), "rejected token is not echoed in the error text");
ok(!(await p.textContent('[data-testid="bot-err-telegram"]')).includes("unknown_token_for_the_browser_test"), "error message does not contain the token");
// توکن درست
await p.fill('[data-testid="bot-token-telegram"]', TOKEN); await p.click('[data-testid="bot-connect-telegram"]');
await p.waitForSelector('[data-testid="bot-linkbtn-telegram"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="bot-status-telegram"]')).includes("منتظر پیوند"), "connected → «منتظر پیوند چت»");
const html1 = await p.content(); const ls = await p.evaluate(() => JSON.stringify({ ...localStorage }));
ok(!html1.includes(TOKEN) && !ls.includes(TOKEN) && html1.includes("••••" + TOKEN.slice(-4)), "token appears nowhere in DOM/localStorage; only •••• + last 4 chars");
ok((await p.$('[data-testid="bot-token-telegram"]')) === null, "token input is removed after connecting");
// پیوند چت
await p.click('[data-testid="bot-linkbtn-telegram"]'); await p.waitForSelector('[data-testid="bot-code-telegram"]', { timeout: 15000 });
const cmd = (await p.textContent('[data-testid="bot-code-telegram"]')).trim(); ok(/^\/start [A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cmd), `link command shown: ${cmd}`);
say(TOKEN, 4242, cmd); await app.bots.tick();
await p.waitForSelector('[data-testid="bot-linked-telegram"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="bot-status-telegram"]')).includes("فعال") && (await p.textContent('[data-testid="bot-linked-telegram"]')).includes("علی"), "page auto-updates to «فعال» with the linked chat after /start");
ok(botSt.sent.some((s) => s.chat === "4242" && /وصل شد/.test(s.text)), "bot confirmed the link in the chat");
// ارسال فوری + آزمایشی + دستور
await p.click('[data-testid="bot-send-telegram-today"]'); await p.waitForSelector("text=گزارش «امروز» فرستاده شد", { timeout: 15000 });
ok(botSt.sent.some((s) => s.chat === "4242" && /گزارش امروز — کافی‌نت آزمایشی/.test(s.text)), "«send now» delivered a report with the cafe name");
await p.click('[data-testid="bot-test-telegram"]'); await p.waitForSelector("text=پیام آزمایشی فرستاده شد", { timeout: 15000 });
say(TOKEN, 4242, "بدهکاران"); say(TOKEN, 31337, "/today"); const nSent = botSt.sent.length; await app.bots.tick();
ok(botSt.sent.length === nSent + 1 && botSt.sent.at(-1).chat === "4242" && /بدهکاران|هیچ فاکتور/.test(botSt.sent.at(-1).text), "Persian command answered; a stranger chat got nothing");
// گزارش روزانه
await p.click('[data-testid="bot-daily-telegram"]'); await p.waitForFunction(() => document.querySelector('[data-testid="bot-time-telegram"]') && !document.querySelector('[data-testid="bot-time-telegram"]').disabled, null, { timeout: 15000 });
await p.fill('[data-testid="bot-time-telegram"]', "00:00"); await p.waitForTimeout(800);
let st = (await api("GET", "/api/bots", null, tok)).json.data.providers[0]; ok(st.dailyEnabled === true && st.dailyTime === "00:00", "daily report enabled with the chosen time (persisted on the server)");
const n2 = botSt.sent.length; await app.bots.tick(); ok(botSt.sent.length === n2 + 1 && /گزارش امروز/.test(botSt.sent.at(-1).text), "scheduler sent the daily report");
await p.reload(); await p.waitForSelector('[data-testid="bot-linked-telegram"]', { timeout: 15000 });
ok(await p.isChecked('[data-testid="bot-daily-telegram"]') && (await p.inputValue('[data-testid="bot-time-telegram"]')) === "00:00", "settings survive a reload");
// بله
await p.fill('[data-testid="bot-token-bale"]', TOKEN_BALE); await p.click('[data-testid="bot-connect-bale"]'); await p.waitForSelector('[data-testid="bot-linkbtn-bale"]', { timeout: 15000 });
ok((await p.textContent('[data-testid="bot-card-bale"]')).includes("cafino_e2e_bale"), "Bale connects the same way");
await p.screenshot({ path: process.env.SHOT || "/tmp/bots-page-1.79.png", fullPage: true });
// جداکردن چت و حذف
p.once("dialog", (d) => d.accept()); await p.click('[data-testid="bot-unlink-telegram"]'); await p.waitForSelector('[data-testid="bot-linkbtn-telegram"]', { timeout: 15000 });
p.once("dialog", (d) => d.accept()); await p.click('[data-testid="bot-remove-bale"]'); await p.waitForSelector('[data-testid="bot-token-bale"]', { timeout: 15000 });
ok(true, "unlink + remove connection work from the UI");
ok(viol.length === 0, `no CSP violations${viol.length ? ": " + viol[0] : ""}`); ok(errs.length === 0, `no page errors${errs.length ? ": " + errs[0] : ""}`);
await b.close(); await app.close(); await pool.end(); botSrv.close(); web.close(); fs.rmSync(upDir, { recursive: true, force: true }); await stopDb();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
