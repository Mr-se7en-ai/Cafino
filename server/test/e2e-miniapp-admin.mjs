// E2E «کارت مینی‌اپ تلگرام در برنامهٔ کافی‌نت» (1.80): مرورگر واقعی + PostgreSQL واقعی + Bot API جعلی (بدون شبکهٔ بیرونی). با تلگرام واقعی آزموده نشده است.
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-miniapp-admin.mjs   (نیاز به بیلد pwa/ و Chromium)
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
await p.waitForSelector('[data-testid="sync-chip"]', { timeout: 30000 });
await p.goto(base + "/?tab=uploads"); await p.waitForSelector('[data-testid="mini-card"]', { timeout: 30000 });
const code = (await pool.query("SELECT code FROM upload_settings LIMIT 1")).rows[0].code;
ok((await p.textContent('[data-testid="mini-state"]')).includes("فعال"), "card shows «فعال» when the server has the mini app configured");
const link = (await p.textContent('[data-testid="mini-link"]')).trim();
ok(link === `https://t.me/cafino_e2e_bot?start=c_${code}`, `deep link uses the shared bot + this cafe's permanent code: ${link}`);
ok((await p.$('[data-testid="mini-qr"] svg')) !== null, "QR is rendered");
await p.click("text=کپی لینک"); await p.waitForSelector("text=لینک کپی شد", { timeout: 5000 });
ok((await p.evaluate(() => navigator.clipboard.readText())) === link, "copy puts the link on the clipboard");
const html = await p.content(); ok(!html.includes(TOKEN) && !(await p.evaluate(() => JSON.stringify({ ...localStorage }))).includes(TOKEN), "bot token appears nowhere in the DOM/localStorage");
// سرور هنوز تعرفه‌ای ندارد → همگام‌سازی دستی
ok((await p.textContent('[data-testid="mini-card"]')).includes("هنوز همگام نشده"), "tariff shows «هنوز همگام نشده» initially");
await p.click('[data-testid="mini-sync"]'); await p.waitForSelector("text=تعرفه همگام شد", { timeout: 15000 });
const info = (await api("GET", "/api/miniapp/info", null, tok)).json.data;
const stored = (await pool.query("SELECT data FROM shop_public_tariff")).rows[0].data;
ok(Number.isInteger(info.tariff?.groups) && info.tariff.groups === stored.length && stored.length > 3 && stored.every((g) => g.cat && g.items.every((i) => i.name && Number.isInteger(i.price) && Object.keys(i).length === 2)), `manual sync pushed ${stored.length} groups with only name+price`);
ok((await p.textContent('[data-testid="mini-card"]')).includes(`${stored.length}`.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) + " گروه"), "card shows the real group count (not 0)");
ok(!(await p.textContent('[data-testid="mini-card"]')).includes("هنوز همگام نشده"), "card reflects the synced tariff");
// خاموش/روشن
await p.click('[data-testid="mini-toggle"]'); await p.waitForFunction(() => document.querySelector('[data-testid="mini-state"]')?.textContent.includes("خاموش"), null, { timeout: 15000 });
ok((await pool.query("SELECT miniapp_enabled FROM upload_settings LIMIT 1")).rows[0].miniapp_enabled === false, "toggle off persisted on the server");
ok((await p.textContent('[data-testid="mini-card"]')).length > 0 && (await (await fetch(`${base}/api/miniapp/info`, { headers: { authorization: `Bearer ${tok}` } })).json()).data.enabled === false, "info API agrees");
await p.click('[data-testid="mini-toggle"]'); await p.waitForFunction(() => document.querySelector('[data-testid="mini-state"]')?.textContent.includes("فعال"), null, { timeout: 15000 });
ok(true, "toggle back on");
await p.screenshot({ path: process.env.SHOT || "/tmp/miniapp-admin-1.80.png", fullPage: true });
// همگام‌سازی خودکار با تغییر تعرفه (۳ ثانیه تأخیر)
await pool.query("DELETE FROM shop_public_tariff");
await p.goto(base + "/?tab=tariff"); await p.waitForSelector('[data-testid="sync-chip"]', { timeout: 30000 });
let synced = false; for (let i = 0; i < 20 && !synced; i++) { await p.waitForTimeout(500); synced = (await pool.query("SELECT 1 FROM shop_public_tariff")).rowCount === 1; }
ok(synced, "opening the tariff page auto-syncs the tariff to the server (debounced)");
ok(viol.length === 0, `no CSP violations${viol.length ? ": " + viol[0] : ""}`); ok(errs.length === 0, `no page errors${errs.length ? ": " + errs[0] : ""}`);
await b.close(); await app.close(); await pool.end(); botSrv.close(); web.close(); fs.rmSync(upDir, { recursive: true, force: true }); await stopDb();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
