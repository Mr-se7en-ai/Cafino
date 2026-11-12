// E2E «QR موقت + مدیریت فایل + ابزارهای PDF»: مرورگر واقعی، PostgreSQL واقعی، CSP سخت‌گیر استقرار، Web Worker واقعی.
// QR موقت سفارش ← مشتری موبایل فایل می‌فرستد ← نشان/اعلان/تازه‌سازی خودکار ← پیش‌نمایش PDF/تصویر/چاپ ← ابزارها ← حذف گروهی ← انقضا.
// اجرا:  PLAYWRIGHT_CORE=../../node_modules/playwright-core node test/e2e-uploads2.mjs   (نیاز به بیلد pwa/ و Chromium)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import os from "node:os";
import { startDb, stopDb, makeApp } from "./helpers.js";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "../../node_modules/playwright-core");
const { PDFDocument, StandardFonts } = require("../../node_modules/pdf-lib");
const jsQR = require("jsqr");

const ROOT = path.resolve(import.meta.dirname, "../..");
const PWA = path.join(ROOT, "pwa");
const FIX = path.join(ROOT, "src/tests/fixtures");
const BIG = process.env.BIG_JPG || "/tmp/e2e2/big.jpg";
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

// ── فایل‌های آزمون: PDF سه‌صفحه‌ای (صفحهٔ ۱ یک عکس ۴ مگابایتی)، عکس EXIF=6، متن
const pdfDoc = await PDFDocument.create(); const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
const big = await pdfDoc.embedJpg(fs.readFileSync(BIG)); const p1 = pdfDoc.addPage([595, 842]); p1.drawImage(big, { x: 20, y: 20, width: 555, height: 800 });
for (const n of [2, 3]) pdfDoc.addPage([595, 842]).drawText(`Page ${n}`, { x: 60, y: 700, size: 40, font });
const PDF = Buffer.from(await pdfDoc.save());
const ROT6 = fs.readFileSync(path.join(FIX, "rot6.jpg"));
const TXT = Buffer.from("سلام\nخط دوم", "utf8");

const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const errs = [], viol = [];
const watch = (page, tag) => { page.on("pageerror", (e) => errs.push(`${tag}: ${e.message}`)); page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(`${tag}: ${m.text().slice(0, 220)}`); }); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
await ctx.addInitScript(() => { window.__workers = []; const W = window.Worker; window.Worker = function (u, o) { window.__workers.push(String(u)); return new W(u, o); }; window.Worker.prototype = W.prototype; });
const p = await ctx.newPage(); watch(p, "cafe");
p.on("dialog", (d) => d.accept());
await p.goto(base + "/"); await p.waitForSelector('input[type="email"]', { timeout: 30000 });
await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', password); await p.press('input[type="password"]', "Enter");
await p.waitForSelector('[data-testid="sync-chip"]', { timeout: 30000 });
await p.evaluate(() => {
  localStorage.setItem("cafenet_customers", JSON.stringify([{ id: "c1", firstName: "علی", lastName: "احمدی", phone: "09121112233" }]));
  localStorage.setItem("cafenet_orders", JSON.stringify([{ id: "o1", title: "پایان‌نامه ارشد", customerId: "c1", customerName: "علی احمدی", status: "pending", amount: 100 }]));
});
await p.goto(base + "/?tab=uploads"); await p.waitForSelector('[data-testid="up-sessions"]', { timeout: 30000 });
await p.waitForTimeout(2500);   // نخستین نظرسنجی نشان (مبنا) انجام شود

// ── ساخت QR موقت برای سفارش
await p.click('[data-testid="up-session-new"]');
await p.selectOption('[data-testid="up-session-order"]', "o1"); await p.selectOption('[data-testid="up-session-ttl"]', "240");
await p.click('[data-testid="up-session-create"]');
await p.waitForSelector('[data-testid="up-session-qr"] svg', { timeout: 15000 });
ok((await p.textContent('[data-testid="up-session-modal"]')).includes("پایان‌نامه ارشد"), "temporary QR modal names the order");
ok(/(۴|4) ساعت/.test(await p.textContent('[data-testid="up-session-left"]')), "expiry countdown shown (4 hours)");
const svg = await p.$eval('[data-testid="up-session-qr"] svg', (e) => e.outerHTML.replace('width="100%" height="100%"', 'width="400" height="400"'));
const blank = await ctx.newPage(); await blank.goto("about:blank");
const px = await blank.evaluate(async (s) => { const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s); }); const c = document.createElement("canvas"); c.width = c.height = 400; const g = c.getContext("2d"); g.drawImage(img, 0, 0, 400, 400); return Array.from(g.getImageData(0, 0, 400, 400).data); }, svg);
await blank.close();
const sUrl = jsQR(Uint8ClampedArray.from(px), 400, 400)?.data;
ok(/\/u\/[a-z2-7]{16}$/.test(sUrl || ""), "session QR decodes to /u/<code>: " + sUrl);
const permCode = (await api("GET", "/api/uploads/settings", null, tok)).json.data.code;
ok(sUrl && !sUrl.endsWith(permCode), "session code differs from the permanent shop code");
await p.keyboard.press("Escape"); await p.waitForSelector('[data-testid="up-session-modal"]', { state: "detached", timeout: 5000 });
await p.waitForSelector('[data-testid="up-session-row"]', { timeout: 10000 }).catch(() => {});
ok((await p.$$('[data-testid="up-session-row"]')).length === 1, "active session listed");

// ── مشتری (موبایل، بدون ورود) فایل می‌فرستد
const cctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
const c = await cctx.newPage(); watch(c, "customer");
await c.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`)); });
await c.goto(sUrl); await c.waitForSelector("#form:not(.hide)", { timeout: 15000 });
ok((await c.textContent("#sub")).includes("پایان‌نامه ارشد") || (await c.textContent("#mainCard")).includes("پایان‌نامه ارشد"), "customer page shows the session label");
await c.setInputFiles("#pick", [{ name: "مقاله.pdf", mimeType: "application/pdf", buffer: PDF }, { name: "photo.jpg", mimeType: "image/jpeg", buffer: ROT6 }, { name: "notes.txt", mimeType: "text/plain", buffer: TXT }]);
ok((await c.$$("#list li")).length === 3, "three files listed with name/size");
await c.fill("#name", "علی احمدی");
await c.click("#send"); await c.waitForSelector("#done:not(.hide)", { timeout: 40000 });
const code = (await c.textContent("#receipt")).trim();
ok(/^[۰-۹]{5}$/.test(code), "tracking code issued: " + code);
ok((await c.evaluate(() => window.__csp)).length === 0, "customer page: no CSP violations");
await c.waitForSelector("#trk:not(.hide)", { timeout: 10000 }).catch(() => {});
ok(/جدید|دریافت/.test((await c.textContent("#trkList")) || ""), "customer sees upload status card: " + ((await c.textContent("#trkList")) || "").replace(/\s+/g, " ").slice(0, 80));
const rows = (await pool.query("SELECT id, original_name, order_ref, order_label, customer_label, session_id, scan_status, status FROM customer_uploads ORDER BY original_name")).rows;
ok(rows.length === 3 && rows.every((r) => r.order_ref === "o1" && r.order_label === "پایان‌نامه ارشد" && r.session_id), "files auto-linked to the order via the session");
// جداسازی: توکن وضعیت دیگران / کد کافی دیگر
const lsKey = await c.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("cafino-up:")));
const stTok = JSON.parse(await c.evaluate((k) => localStorage.getItem(k), lsKey))?.[0]?.t;
const sCode = sUrl.split("/u/")[1];
const good = await fetch(`${base}/api/public/upload/${sCode}/status/${stTok}`);
ok(good.status === 200, "customer's own status token works");
ok((await fetch(`${base}/api/public/upload/${sCode}/status/${"0".repeat(8)}-0000-0000-0000-000000000000.${"a".repeat(32)}`)).status === 404, "a guessed token cannot see anyone's files");
ok((await fetch(`${base}/api/public/upload/${otherCode}/status/${stTok}`)).status === 404, "status token is useless against another cafe's code");

// ── کافی‌نت: نشان + اعلان + تازه‌سازی خودکار (بدون کلیک بازخوانی)
await p.waitForSelector('[data-testid="uploads-toast"]', { timeout: 35000 });
ok(true, "in-app toast announced the new upload (20s poll)");
ok((await p.$$('[data-testid="uploads-badge"]')).length >= 1, "menu badge shows new-file count");
await p.waitForSelector('[data-testid="up-batch"]', { timeout: 30000 });
ok(toEn(await p.textContent('[data-testid="up-code"]')).includes(toEn(code)), "page auto-refreshed: batch appeared without clicking reload");
ok((await p.textContent('[data-testid="up-batch"]')).includes("پایان‌نامه ارشد"), "order link shown on the files");
await p.screenshot({ path: "/tmp/e2e-uploads2-files.png", fullPage: true });

// ── پیش‌نمایش PDF
const row = (name) => p.locator('[data-testid="up-file"]', { hasText: name });
await row("مقاله.pdf").locator('[data-testid="up-preview-btn"]').click();
await p.waitForFunction(() => document.querySelectorAll('[data-testid="up-pdf-canvas"]').length === 3, null, { timeout: 30000 });
await p.waitForTimeout(2500);
const ink = await p.$$eval('[data-testid="up-pdf-canvas"]', (cs) => cs.map((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 37) if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) n++; return n; }));
ok(ink.length === 3 && ink.every((n) => n > 0), "PDF preview rendered all 3 pages with real content: " + ink.join(","));
await p.screenshot({ path: "/tmp/e2e-uploads2-pdf-preview.png" });
ok((await p.evaluate(() => window.__workers)).some((u) => /vendor-pdfjsworker/.test(u)), "pdf.js ran in its own Web Worker");
// ── پیش‌نمایش چاپ
await p.click('[data-testid="up-prev-tab-print"]'); await p.waitForSelector('[data-testid="up-print-sheet"]', { timeout: 20000 });
await p.fill('[data-testid="up-print-copies"]', "2");
ok(toEn(await p.textContent('[data-testid="up-print-sheets"]')).includes("6"), "print preview counts 3 pages × 2 copies = 6 sheets");
ok((await p.$$('[data-testid="up-print-sheet"]')).length === 3, "print preview draws a paper sheet per page");
await p.waitForFunction(() => { const cs = [...document.querySelectorAll('[data-testid="up-print-sheet"] canvas')]; return cs.length === 3 && cs.every((c) => { if (!c.width) return false; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) return true; return false; }); }, null, { timeout: 30000 }).then(() => ok(true, "print preview sheets show the real page content"), () => ok(false, "print preview sheets show the real page content"));
await p.screenshot({ path: "/tmp/e2e-uploads2-print-preview.png" });
const [pop] = await Promise.all([ctx.waitForEvent("page", { timeout: 60000 }), p.click('[data-testid="up-print-go"]')]);
await pop.waitForFunction(() => document.querySelectorAll("section").length > 0, null, { timeout: 60000 }).catch(() => {}); await pop.waitForTimeout(500);
const html = await pop.content();
ok((html.match(/<section/g) || []).length === 6 && html.includes("data:image/jpeg;base64"), "print window has 6 sheets of rendered pages (" + (html.match(/<section/g) || []).length + " sections, " + html.length + " chars)");
await pop.close();
await p.waitForSelector('[data-testid="up-print-mark"]'); await p.click('[data-testid="up-print-mark"]'); await p.waitForTimeout(800);
ok((await pool.query("SELECT status FROM customer_uploads WHERE original_name='مقاله.pdf'")).rows[0].status === "printed", "marked as printed after printing");
await p.keyboard.press("Escape");
// ── پیش‌نمایش تصویر و متن
await row("photo.jpg").locator('[data-testid="up-preview-btn"]').click();
await p.waitForSelector('[data-testid="up-preview-img"]');
ok(await p.$eval('[data-testid="up-preview-img"]', (i) => new Promise((r) => (i.complete ? r(i.naturalWidth > 0) : (i.onload = () => r(true), i.onerror = () => r(false))))), "image preview loads");
await p.keyboard.press("Escape");
await row("notes.txt").locator('[data-testid="up-preview-btn"]').click();
await p.waitForSelector('[data-testid="up-preview-text"]');
ok((await p.textContent('[data-testid="up-preview-text"]')).includes("خط دوم"), "text preview shows content");
await p.keyboard.press("Escape");

// ── تغییر نام (پسوند حفظ می‌شود)، نگه‌داری ویژه، مرتب‌سازی، جستجو
await row("photo.jpg").locator('[data-testid="up-rename"]').click();
await p.fill('[data-testid="up-rename-input"]', "عکس جدید.png"); await p.click('[data-testid="up-rename-ok"]'); await p.waitForSelector('[data-testid="up-error"]', { timeout: 8000 }).catch(() => {});
ok((await p.textContent('[data-testid="up-files"]')).includes("پسوند فایل را نمی"), "changing the file extension on rename is refused with a clear message");
await p.fill('[data-testid="up-rename-input"]', "عکس جدید"); await p.click('[data-testid="up-rename-ok"]'); await p.waitForTimeout(900);
ok((await pool.query("SELECT original_name FROM customer_uploads WHERE id=$1", [rows.find((r) => r.original_name === "photo.jpg").id])).rows[0].original_name === "عکس جدید.jpg", "rename kept the .jpg extension");
await row("مقاله.pdf").locator('[data-testid="up-protect"]').click(); await p.waitForTimeout(900);
ok((await pool.query("SELECT protected FROM customer_uploads WHERE original_name='مقاله.pdf'")).rows[0].protected === true, "file marked 'special retention'");
await p.selectOption('[data-testid="up-sort"]', "size"); await p.waitForSelector('[data-testid="up-flat"]');
await p.waitForTimeout(600);
ok((await p.locator('[data-testid="up-file"]').first().textContent()).includes("مقاله.pdf"), "sort by size (desc) puts the biggest file first, flat list");
await p.click('[data-testid="up-sort-dir"]'); await p.waitForTimeout(700);
ok((await p.locator('[data-testid="up-file"]').last().textContent()).includes("مقاله.pdf"), "ascending direction flips the order");
await p.fill('[data-testid="up-search"]', "عکس جدید"); await p.waitForTimeout(800);
ok((await p.$$('[data-testid="up-file"]')).length === 1, "search by file name");
await p.fill('[data-testid="up-search"]', "پایان‌نامه"); await p.waitForTimeout(800);
ok((await p.$$('[data-testid="up-file"]')).length === 3, "search by linked order title");
await p.fill('[data-testid="up-search"]', ""); await p.selectOption('[data-testid="up-sort"]', "created"); await p.waitForTimeout(600);
// ── اتصال و رفع اتصال
await row("notes.txt").locator('[data-testid="up-link-btn"]').click();
await p.click('text=رفع اتصال'); await p.waitForTimeout(900);
ok((await pool.query("SELECT order_ref FROM customer_uploads WHERE original_name='notes.txt'")).rows[0].order_ref === "", "unlink works");
await p.selectOption('[data-testid="up-scope"]', "unlinked"); await p.waitForTimeout(800);
ok((await p.$$('[data-testid="up-file"]')).length === 1, "'unlinked' filter shows only the detached file");
await row("notes.txt").locator('[data-testid="up-link-btn"]').click();
await p.selectOption('[data-testid="up-link-order"]', "o1"); await p.click('[data-testid="up-link-save"]'); await p.waitForTimeout(900);
ok((await pool.query("SELECT order_ref, customer_label FROM customer_uploads WHERE original_name='notes.txt'")).rows[0].customer_label === "علی احمدی", "re-link to order also takes the customer from the order");
await p.selectOption('[data-testid="up-scope"]', ""); await p.waitForTimeout(700);

// ── ابزارهای PDF (Worker واقعی)
const pdfRow = row("مقاله.pdf");
const openTools = async (names) => { for (const n of names) await row(n).locator('[data-testid="up-sel"]').check(); await p.click('[data-testid="up-bulk-tools"]'); await p.waitForSelector('[data-testid="up-tools"]'); await p.waitForFunction(() => !document.querySelector('[data-testid="up-tools-loading"]'), null, { timeout: 30000 }); };
const closeTools = async () => { await p.keyboard.press("Escape"); await p.waitForSelector('[data-testid="up-tools"]', { state: "detached" }); await p.click('[data-testid="up-bulk-bar"], body', { position: { x: 5, y: 5 } }).catch(() => {}); };
const derived = async (n) => (await pool.query("SELECT id, original_name, size, derived_from, status, order_ref, scan_status FROM customer_uploads WHERE derived_from IS NOT NULL ORDER BY created_at DESC LIMIT $1", [n])).rows;
const pagesOf = async (id) => (await PDFDocument.load(await getBytes(`/api/uploads/${id}/download`, tok))).getPageCount();

// استخراج 1-2
await openTools(["مقاله.pdf"]);
await p.click('[data-testid="up-tool-extract"]'); await p.waitForSelector('[data-testid="up-pdf-page"]', { timeout: 20000 });
await p.fill('[data-testid="up-extract-range"]', "1-2"); await p.click('[data-testid="up-extract-apply"]');
ok(toEn(await p.textContent('[data-testid="up-extract-count"]')).startsWith("2"), "range 1-2 selects two pages");
await p.click('[data-testid="up-tool-run"]'); await p.waitForSelector('[data-testid="up-tool-result"]', { timeout: 60000 });
await p.click('[data-testid="up-tool-save"]'); await p.waitForFunction(() => /ذخیره شد/.test(document.querySelector('[data-testid="up-tool-results"]')?.textContent || ""), null, { timeout: 30000 });
let d = (await derived(1))[0];
ok(d && d.order_ref === "o1" && d.status === "seen" && (await pagesOf(d.id)) === 2, "extract-pages result saved into the same order, 2 pages");
ok(d.scan_status === "clean" || d.scan_status === "skipped", "derived file went through the scan pipeline (" + d.scan_status + ")");
// چرخاندن صفحهٔ ۱
await p.click('[data-testid="up-tool-rotate"]'); await p.waitForSelector('[data-testid="up-rot-1"]', { timeout: 20000 });
await p.click('[data-testid="up-rot-1"]'); await p.click('[data-testid="up-tool-run"]'); await p.waitForSelector('[data-testid="up-tool-result"]', { timeout: 60000 });
await p.click('[data-testid="up-tool-save"]'); await p.waitForFunction(() => /ذخیره شد/.test(document.querySelector('[data-testid="up-tool-results"]')?.textContent || ""), null, { timeout: 30000 });
d = (await derived(1))[0];
const rotDoc = await PDFDocument.load(await getBytes(`/api/uploads/${d.id}/download`, tok));
ok(rotDoc.getPageCount() === 3 && rotDoc.getPage(0).getRotation().angle === 90 && rotDoc.getPage(1).getRotation().angle === 0, "rotate: only page 1 turned 90°");
// جداسازی تک‌تک
await p.click('[data-testid="up-tool-split"]'); await p.selectOption('[data-testid="up-split-mode"]', "each");
await p.click('[data-testid="up-tool-run"]'); await p.waitForFunction(() => document.querySelectorAll('[data-testid="up-tool-result"]').length === 3, null, { timeout: 60000 });
ok(true, "split 3-page PDF into 3 single-page files");
// فشرده‌سازی سبک و قوی
await p.click('[data-testid="up-tool-compress"]');
await p.click('[data-testid="up-tool-run"]'); await p.waitForSelector('[data-testid="up-tool-info"]', { timeout: 60000 });
const lightInfo = await p.textContent('[data-testid="up-tool-info"]');
await p.selectOption('[data-testid="up-compress-mode"]', "strong"); await p.click('[data-testid="up-tool-run"]');
await p.waitForFunction(() => /کمتر|کم نکرد/.test(document.querySelector('[data-testid="up-tool-info"]')?.textContent || "") && document.querySelector('[data-testid="up-tool-run"]')?.textContent === "اجرا", null, { timeout: 120000 });
const strongInfo = await p.textContent('[data-testid="up-tool-info"]');
const before = (await pool.query("SELECT size FROM customer_uploads WHERE original_name='مقاله.pdf'")).rows[0].size;
await p.click('[data-testid="up-tool-save"]'); await p.waitForFunction(() => /ذخیره شد/.test(document.querySelector('[data-testid="up-tool-results"]')?.textContent || ""), null, { timeout: 30000 });
d = (await derived(1))[0];
console.log("INFO light:", lightInfo.trim(), "| strong:", strongInfo.trim(), `| ${before} -> ${d.size}`);
ok(d.size < before * 0.6 && (await pagesOf(d.id)) === 3, `strong compression shrank a 3-page scan-like PDF ${before} → ${d.size} bytes, still 3 pages`);
ok((await p.evaluate(() => window.__workers)).some((u) => /vendor-pdftools/.test(u)), "PDF operations ran in a Web Worker (vendor-pdftools)");
await closeTools();
// تصویر → PDF (اصلاح EXIF) و تبدیل فرمت
await p.waitForTimeout(600);
await openTools(["عکس جدید.jpg"]);
await p.click('[data-testid="up-tool-img2pdf"]'); await p.click('[data-testid="up-tool-run"]'); await p.waitForSelector('[data-testid="up-tool-result"]', { timeout: 60000 });
await p.click('[data-testid="up-tool-save"]'); await p.waitForFunction(() => /ذخیره شد/.test(document.querySelector('[data-testid="up-tool-results"]')?.textContent || ""), null, { timeout: 30000 });
d = (await derived(1))[0]; const ip = await PDFDocument.load(await getBytes(`/api/uploads/${d.id}/download`, tok));
ok(ip.getPageCount() === 1 && ip.getPage(0).getWidth() < ip.getPage(0).getHeight(), "image→PDF: phone photo (EXIF 6) lands upright on a portrait A4 page");
await p.click('[data-testid="up-tool-convert"]'); await p.selectOption('[data-testid="up-convert-to"]', "png"); await p.click('[data-testid="up-tool-run"]'); await p.waitForSelector('[data-testid="up-tool-result"]', { timeout: 60000 });
ok(/\.png$/.test(await p.textContent('[data-testid="up-tool-result"]').then((t) => t.match(/\S+\.png/)?.[0] || "")), "image convert produced a .png");
await closeTools();
// ادغام: مقالهٔ اصلی + نتیجهٔ فشرده
await p.waitForTimeout(600); await p.fill('[data-testid="up-search"]', "pdf"); await p.waitForTimeout(900);
const pdfCount = (await p.$$('[data-testid="up-file"]')).length;
for (const el of await p.$$('[data-testid="up-sel"]')) { if ((await p.$$('[data-testid="up-sel"]:checked')).length < 2) await el.check(); }
await p.click('[data-testid="up-bulk-tools"]'); await p.waitForSelector('[data-testid="up-tool-merge"]'); await p.waitForFunction(() => !document.querySelector('[data-testid="up-tools-loading"]'), null, { timeout: 30000 });
await p.click('[data-testid="up-tool-merge"]'); await p.click('[data-testid="up-tool-run"]'); await p.waitForSelector('[data-testid="up-tool-result"]', { timeout: 60000 });
ok(/صفحه/.test(await p.textContent('[data-testid="up-tool-result"]')), `merge of 2 selected PDFs (from ${pdfCount} PDFs listed) produced a PDF`);
await closeTools(); await p.fill('[data-testid="up-search"]', ""); await p.waitForTimeout(700);

// ── حذف گروهی (فایل ویژه مستثنا)
await p.click('[data-testid="up-sel-all"]'); await p.waitForSelector('[data-testid="up-bulk-delete"]');
const totalBefore = (await pool.query("SELECT count(*)::int n FROM customer_uploads WHERE deleted_at IS NULL")).rows[0].n;
await p.click('[data-testid="up-bulk-delete"]'); await p.waitForSelector('[data-testid="up-msg"]', { timeout: 15000 });
const left = (await pool.query("SELECT original_name FROM customer_uploads WHERE deleted_at IS NULL")).rows;
ok(left.length === 1 && left[0].original_name === "مقاله.pdf", `bulk delete removed ${totalBefore - 1} files; the protected file survived`);
ok((await p.textContent('[data-testid="up-msg"]')).includes("ویژه"), "UI tells the protected file was skipped");
await p.screenshot({ path: "/tmp/e2e-uploads2-after-bulk.png", fullPage: true });

// ── بسته‌شدن و انقضای QR
await p.click('[data-testid="up-session-files"]'); await p.waitForTimeout(600); await p.click('[data-testid="up-session-files"]');
await p.click('text=نمایش QR'); await p.waitForSelector('[data-testid="up-session-close"]'); await p.click('[data-testid="up-session-close"]');
await p.waitForSelector('[data-testid="up-session-modal"]', { state: "detached", timeout: 10000 });
await c.reload(); await c.waitForSelector("#closed:not(.hide)", { timeout: 15000 });
ok(/بسته|منقضی|معتبر/.test(await c.textContent("#closed")), "closed session link stops accepting files: " + (await c.textContent("#closed")).trim().slice(0, 60));
const s2 = (await api("POST", "/api/uploads/sessions", { label: "منقضی", ttlMinutes: 5 }, tok)).json.data;
await pool.query("UPDATE upload_sessions SET expires_at = now() - interval '1 minute' WHERE id=$1", [s2.id]);
const r410 = await fetch(`${base}/api/public/upload/${s2.code}`); ok(r410.status === 404 || r410.status === 410, "expired session link is rejected by the API (" + r410.status + ")");
await p.waitForTimeout(300);

// ── موبایل: بدون سرریز افقی (صفحه، پیش‌نمایش، ابزارها)
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(600);
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok((await overflow()) <= 1, "mobile 390px: uploads page has no horizontal overflow (" + (await overflow()) + ")");
await p.screenshot({ path: "/tmp/e2e-uploads2-mobile.png", fullPage: true });
await row("مقاله.pdf").locator('[data-testid="up-preview-btn"]').click(); await p.waitForSelector('[data-testid="up-pdf-canvas"]', { timeout: 20000 });
const mw = await p.$eval('[data-testid="up-preview"]', (e) => e.getBoundingClientRect().width);
ok(mw <= 390 && (await overflow()) <= 1, "mobile: preview dialog fits the screen (" + Math.round(mw) + "px)");
await p.screenshot({ path: "/tmp/e2e-uploads2-mobile-preview.png" });
await p.click('[data-testid="up-prev-tab-print"]'); await p.waitForSelector('[data-testid="up-print-sheet"]');
ok((await overflow()) <= 1, "mobile: print preview has no horizontal overflow");
await p.screenshot({ path: "/tmp/e2e-uploads2-mobile-print.png" });
await p.keyboard.press("Escape");

ok(errs.length === 0, "no page errors " + errs.join(" | ").slice(0, 400));
ok(viol.length === 0, "no CSP violations in the app (workers, blobs, canvas) " + viol.join(" | ").slice(0, 400));
await b.close(); web.close(); await app.close(); await pool.end(); await stopDb(); fs.rmSync(upDir, { recursive: true, force: true });
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
