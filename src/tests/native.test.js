// لایهٔ ویندوز (Electron main): چاپ/spooler، اسکن WIA، SNMP و پل IPC — با وابستگی‌های جعلی (روی لینوکس هم اجرا می‌شود)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import dgram from "node:dgram";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const root = new URL("../../el/electron-app/native/", import.meta.url).pathname;
const snmp = require(root + "snmp.js");
const { createPrinterService, PS_JOBS, PS_LIST } = require(root + "printer.js");
const { createScannerService, PS_SCAN } = require(root + "scanner.js");
const { registerDeviceIpc } = require(root + "bridge.js");
const np = require(root + "netPolicy.js");
const { createSecureStore, storageStatus } = require(root + "secureStore.js");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cafino-"));
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n");

// ───── SNMP ─────
function fakeResponse(requestId, value, { error = 0, tag = 0x41 } = {}) {
  const enc = snmp.encOid; // تکرار مسیر رمزگذاری برای ساخت پاسخ
  const tl = (t, c) => Buffer.concat([Buffer.from([t, c.length]), c]);
  const int = (v) => { const b = []; let n = v; do { b.unshift(n & 255); n = Math.floor(n / 256); } while (n > 0); if (b[0] & 0x80) b.unshift(0); return tl(0x02, Buffer.from(b)); };
  const vb = tl(0x30, Buffer.concat([enc(snmp.OID_LIFE_COUNT), tl(tag, Buffer.from((() => { const b = []; let n = value; do { b.unshift(n & 255); n = Math.floor(n / 256); } while (n > 0); if (b[0] & 0x80 && tag === 0x02) b.unshift(0); return b; })()))]));
  const pdu = tl(0xa2, Buffer.concat([int(requestId), int(error), int(0), tl(0x30, vb)]));
  return tl(0x30, Buffer.concat([int(1), tl(0x04, Buffer.from("public")), pdu]));
}
function readRequestId(msg) { // [30 len][02 01 ver][04 n community][a0 len][02 L id…]
  let p = 2; p += 2 + msg[p + 1]; p += 2 + msg[p + 1]; p += 2; const L = msg[p + 1]; let id = 0; for (let i = 0; i < L; i++) id = id * 256 + msg[p + 2 + i]; return id;
}
async function withFakePrinter(handler, fn) {
  const srv = dgram.createSocket("udp4");
  await new Promise((r) => srv.bind(0, "127.0.0.1", r));
  srv.on("message", (msg, rinfo) => { const reply = handler(msg); if (reply) srv.send(reply, rinfo.port, rinfo.address); });
  try { return await fn(srv.address().port); } finally { srv.close(); }
}
test("SNMP: کنتور از پرینتر جعلی روی UDP خوانده می‌شود (Counter32 بزرگ)", async () => {
  await withFakePrinter((m) => fakeResponse(readRequestId(m), 3000000000), async (port) => {
    assert.equal(await snmp.snmpGet("127.0.0.1", { port, timeout: 1500, _allowLoopbackForTests: true }), 3000000000);
  });
});
test("SNMP: بدون پاسخ → مهلت؛ خطای پرینتر → پیام؛ پاسخ با requestId دیگر نادیده", async () => {
  await withFakePrinter(() => null, async (port) => { await assert.rejects(snmp.snmpGet("127.0.0.1", { port, timeout: 300, _allowLoopbackForTests: true }), /پاسخ نداد/); });
  await withFakePrinter((m) => fakeResponse(readRequestId(m), 0, { error: 2 }), async (port) => { await assert.rejects(snmp.snmpGet("127.0.0.1", { port, timeout: 1000, _allowLoopbackForTests: true }), /پشتیبانی نمی‌کند/); });
  await withFakePrinter((m) => fakeResponse(readRequestId(m) + 1, 5), async (port) => { await assert.rejects(snmp.snmpGet("127.0.0.1", { port, timeout: 300, _allowLoopbackForTests: true }), /پاسخ نداد/); });
});
test("SNMP: فقط IP شبکهٔ محلی (بستن SSRF) و ورودی‌های نامعتبر", async () => {
  for (const h of ["8.8.8.8", "example.com", "172.32.0.1", "192.169.1.1", ""]) await assert.rejects(snmp.snmpGet(h), /IP شبکهٔ محلی/, h);
  for (const h of ["10.0.0.5", "192.168.1.50", "172.16.3.4", "172.31.255.1"]) assert.ok(snmp.isPrivateHost(h), h);
  // loopback و link-local (شامل metadata ابر ۱۶۹.۲۵۴.۱۶۹.۲۵۴) دیگر مجاز نیستند؛ گزینهٔ آزمایشی هم از رندرر قابل‌دسترس نیست
  for (const h of ["127.0.0.1", "127.1.2.3", "169.254.1.1", "169.254.169.254", "0.0.0.0", "224.0.0.1"]) { assert.ok(!snmp.isPrivateHost(h), h); await assert.rejects(snmp.snmpGet(h), /IP شبکهٔ محلی/, h); }
  await assert.rejects(snmp.snmpGet("192.168.1.5", { oid: "1.3; rm" }), /OID/);
  await assert.rejects(snmp.snmpGet("192.168.1.5", { community: "a b" }), /Community/);
});
test("SNMP: پکت درخواست ساختار BER درست دارد (OID کنتور)", () => {
  const b = snmp.buildGet({ requestId: 7 });
  assert.equal(b[0], 0x30); assert.ok(b.includes(Buffer.from("public")));
  assert.ok(b.includes(snmp.encOid(snmp.OID_LIFE_COUNT)));
  assert.equal(readRequestId(b), 7);
});

// ───── چاپ ─────
function mkPrinter({ jobsSeq = [], printersJson, printFile, files = true } = {}) {
  const calls = []; let ji = 0; let t = 0;
  const exec = async (_cmd, args, opts) => {
    const script = args[args.length - 1]; calls.push({ script, env: opts.env });
    if (script === PS_LIST) return { stdout: JSON.stringify(printersJson || [{ Name: "HP LaserJet", DriverName: "HP", PortName: "IP_192.168.1.50", PrinterStatus: 0, Color: false }, { Name: "Canon", PortName: "USB001", PrinterStatus: 8 }]) };
    if (/Get-PrinterPort/.test(script)) return { stdout: JSON.stringify([{ Name: "IP_192.168.1.50", PrinterHostAddress: "192.168.1.50" }]) };
    if (script === PS_JOBS) { const j = jobsSeq[Math.min(ji++, jobsSeq.length - 1)]; return { stdout: j == null ? "" : JSON.stringify(j) }; }
    return { stdout: "" };
  };
  const dir = tmp(); const printed = [];
  const svc = createPrinterService({ exec, fs, tmpDir: dir, wait: async () => {}, now: () => (t += 1000), randomId: () => "abc123", printFile: printFile || (async (f, o) => { printed.push({ f, o, existed: fs.existsSync(f) }); }) });
  return { svc, calls, printed, dir };
}
const job = (status, printed, total = 10, name = "cafino-abc123.pdf") => ({ Id: 5, DocumentName: name, JobStatus: status, TotalPages: total, PagesPrinted: printed });

test("پرینترها: فهرست، IP از پورت، وضعیت", async () => {
  const { svc } = mkPrinter();
  const l = await svc.list();
  assert.equal(l.length, 2); assert.equal(l[0].ip, "192.168.1.50"); assert.equal(l[0].status, "ready"); assert.equal(l[1].status, "offline");
});
test("چاپ کامل: جاب در spooler دیده می‌شود و ناپدید می‌شود → کامل، نام پرینتر فقط در env", async () => {
  const { svc, calls, printed } = mkPrinter({ jobsSeq: [job("Spooling", 0), job("Printing", 4), job("Printing", 9), null] });
  const prog = []; const r = await svc.print({ printer: "HP LaserJet", fileName: "x.pdf", bytes: PDF, pages: 5, copies: 2, color: false }, (p) => prog.push(p));
  assert.deepEqual([r.requested, r.done, r.failed, r.status, r.assumed], [10, 10, 0, "done", false]);
  assert.equal(printed[0].o.printer, "HP LaserJet"); assert.equal(printed[0].o.copies, 2); assert.equal(printed[0].o.monochrome, true); assert.ok(printed[0].existed);
  assert.ok(prog.length >= 3 && prog[1].printed === 4);
  const jobCalls = calls.filter((c) => c.script === PS_JOBS);
  assert.ok(jobCalls.length >= 4 && jobCalls.every((c) => c.env.CAFINO_PRN === "HP LaserJet"));
  assert.ok(!calls.some((c) => c.script.includes("HP LaserJet")), "نام پرینتر هرگز در متن اسکریپت نیست");
});
test("چاپ ناقص: گیر کاغذ و حذف جاب → فقط صفحات چاپ‌شده", async () => {
  const { svc } = mkPrinter({ jobsSeq: [job("Printing", 3), job("Paper Jam, Printing", 7), job("Deleting", 7), null] });
  const r = await svc.print({ printer: "HP LaserJet", fileName: "x.pdf", bytes: PDF, pages: 10, copies: 1, color: true });
  assert.deepEqual([r.requested, r.done, r.failed, r.status], [10, 7, 3, "partial"]);
  assert.match(r.error, /Paper|Deleting/);
});
test("چاپ ناموفق: جاب بدون چاپ حذف شد → failed", async () => {
  const { svc } = mkPrinter({ jobsSeq: [job("Error", 0), job("Deleted", 0), null] });
  const r = await svc.print({ printer: "HP LaserJet", fileName: "x.pdf", bytes: PDF, pages: 4, copies: 1 });
  assert.deepEqual([r.done, r.failed, r.status], [0, 4, "failed"]);
});
test("جاب هرگز در spooler دیده نشد → کامل ولی «فرض‌شده» (assumed)", async () => {
  const { svc } = mkPrinter({ jobsSeq: [null] });
  const r = await svc.print({ printer: "HP LaserJet", fileName: "x.pdf", bytes: PDF, pages: 3, copies: 1 });
  assert.deepEqual([r.done, r.status, r.assumed], [3, "done", true]);
});
test("اعتبارسنجی چاپ: پرینتر ناشناس/آفلاین، پسوند، سرتیتر PDF، فایل خالی و حجم زیاد، خطای ارسال", async () => {
  const { svc, dir } = mkPrinter();
  const base = { printer: "HP LaserJet", fileName: "x.pdf", bytes: PDF, pages: 1, copies: 1 };
  await assert.rejects(svc.print({ ...base, printer: "Evil; calc" }), /پیدا نشد/);
  await assert.rejects(svc.print({ ...base, printer: "Canon" }), /آمادهٔ چاپ نیست/);
  await assert.rejects(svc.print({ ...base, fileName: "a.exe" }), /فقط فایل PDF/);
  await assert.rejects(svc.print({ ...base, fileName: "a.docx" }), /به PDF تبدیل/);
  await assert.rejects(svc.print({ ...base, bytes: Buffer.from("not a pdf") }), /PDF معتبر نیست/);
  await assert.rejects(svc.print({ ...base, bytes: Buffer.alloc(0) }), /خالی/);
  await assert.rejects(svc.print({ ...base, bytes: Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(61 * 1024 * 1024)]) }), /۶۰ مگابایت/);
  const bad = mkPrinter({ printFile: async () => { throw new Error("spooler down"); } });
  await assert.rejects(bad.svc.print(base), /ارسال به پرینتر ناموفق بود: spooler down/);
  assert.deepEqual(fs.readdirSync(bad.dir), [], "فایل موقت پس از خطا پاک می‌شود");
  assert.ok(dir);
});
test("فایل موقت با نام تصادفی داخل پوشهٔ مجاز ساخته می‌شود (مسیر رندرر نادیده)", async () => {
  const { svc, printed, dir } = mkPrinter({ jobsSeq: [null] });
  await svc.print({ printer: "HP LaserJet", fileName: "../../etc/passwd.pdf", bytes: PDF, pages: 1, copies: 1 });
  assert.equal(path.dirname(printed[0].f), dir); assert.match(path.basename(printed[0].f), /^cafino-abc123\.pdf$/);
});

// ───── اسکن ─────
function mkScanner(responses) {
  const dir = tmp(); const calls = [];
  const exec = async (_c, args, opts) => { const script = args[args.length - 1]; calls.push({ script, env: opts.env }); const r = responses(script, opts.env, dir); return { stdout: r }; };
  return { svc: createScannerService({ exec, fs, scansDir: dir, now: () => new Date(2026, 9, 30, 12), randomId: () => "xyz" }), calls, dir };
}
test("اسکنرها: فهرست WIA (یک یا چند دستگاه)", async () => {
  const one = mkScanner(() => JSON.stringify({ id: "{S1}", name: "Canon LiDE" }));
  assert.deepEqual((await one.svc.list()).map((s) => s.name), ["Canon LiDE"]);
  const two = mkScanner(() => JSON.stringify([{ id: "{S1}", name: "A" }, { id: "{S2}", name: "B" }]));
  assert.equal((await two.svc.list()).length, 2);
  assert.deepEqual(await mkScanner(() => "").svc.list(), []);
});
test("اسکن: پارامترها فقط از env، شمارش صفحات، مسیر خروجی داخل پوشهٔ اسکن‌ها", async () => {
  const s = mkScanner((script, env, dir) => script === PS_SCAN ? JSON.stringify({ files: [path.join(dir, "2026-10-30", "scan-1.png"), path.join(dir, "2026-10-30", "scan-2.png")], error: "" }) : JSON.stringify([{ id: "{S1}", name: "Canon" }]));
  const r = await s.svc.scan({ scannerId: "{S1}", dpi: 300, color: "bw", source: "feeder", maxPages: 10 });
  assert.equal(r.count, 2); assert.equal(r.scanner, "Canon");
  const call = s.calls.find((c) => c.script === PS_SCAN);
  assert.deepEqual([call.env.CAFINO_DPI, call.env.CAFINO_INTENT, call.env.CAFINO_SOURCE, call.env.CAFINO_MAX, call.env.CAFINO_SCANNER], ["300", "4", "feeder", "10", "{S1}"]);
  assert.ok(s.svc.insideScans(r.files[0]));
  assert.equal(s.svc.insideScans("/etc/passwd"), false); assert.equal(s.svc.insideScans(path.join(s.dir, "..", "x")), false); assert.equal(s.svc.insideScans(s.dir), false);
});
test("اسکن: فلت‌بد یک صفحه؛ DPI نامعتبر به ۲۰۰؛ فایل خارج از پوشه نادیده؛ خطاها", async () => {
  const s = mkScanner((script, env, dir) => script === PS_SCAN ? JSON.stringify({ files: [path.join(dir, "2026-10-30", "a.png"), "/tmp/evil.png"], error: "" }) : JSON.stringify({ id: "{S1}", name: "C" }));
  const r = await s.svc.scan({ scannerId: "{S1}", dpi: 9999, color: "zzz", source: "flatbed" });
  assert.equal(r.count, 1);
  const c = s.calls.find((x) => x.script === PS_SCAN); assert.equal(c.env.CAFINO_DPI, "200"); assert.equal(c.env.CAFINO_MAX, "1"); assert.equal(c.env.CAFINO_INTENT, "1");
  await assert.rejects(s.svc.scan({ scannerId: "{NOPE}" }), /اسکنر پیدا نشد/);
  const bad = mkScanner((script) => script === PS_SCAN ? JSON.stringify({ files: [], error: "0x80210015 no device" }) : JSON.stringify({ id: "{S1}", name: "C" }));
  await assert.rejects(bad.svc.scan({ scannerId: "{S1}" }), /اسکن انجام نشد/);
});

// ───── پل IPC ─────
function mkIpc(platform) {
  const handlers = {}; const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
  const dir = tmp();
  const app = { getPath: (k) => path.join(dir, k) };
  const shown = []; const shell = { showItemInFolder: (p) => shown.push(p) };
  const execFile = (cmd, args, opts, cb) => cb(null, { stdout: "[]" });
  registerDeviceIpc({ ipcMain, shell, app, execFile, fs, path, printFile: async () => {}, electronPrinters: async () => [], platform });
  return { handlers, shown, dir };
}
test("پل IPC: روی غیرویندوز چاپ/اسکن رد می‌شود ولی caps و SNMP کار می‌کنند؛ مسیر showScan فقط داخل پوشهٔ اسکن‌ها", async () => {
  const lin = mkIpc("linux");
  assert.deepEqual(Object.keys(lin.handlers).sort(), ["cafino:caps", "cafino:print", "cafino:printerCounter", "cafino:printers", "cafino:scan", "cafino:scanners", "cafino:showScan"]);
  assert.equal((await lin.handlers["cafino:caps"]()).printer, false);
  await assert.rejects(lin.handlers["cafino:print"]({}, {}), /فقط در نسخهٔ ویندوز/);
  await assert.rejects(lin.handlers["cafino:scanners"]({}, {}), /فقط در نسخهٔ ویندوز/);
  await assert.rejects(lin.handlers["cafino:printerCounter"]({}, { ip: "8.8.8.8" }), /IP شبکهٔ محلی/);
  await assert.rejects(lin.handlers["cafino:showScan"]({}, "/etc/passwd"), /مسیر مجاز نیست/);
  const win = mkIpc("win32");
  assert.equal((await win.handlers["cafino:caps"]()).printer, true);
  assert.deepEqual(await win.handlers["cafino:printers"]({}, {}), []);
  const ok = path.join(win.dir, "documents", "CAFINO-Scans", "2026-10-30", "a.png");
  assert.equal(await win.handlers["cafino:showScan"]({}, ok), true); assert.deepEqual(win.shown, [ok]);
});
test("main.js و preload.js: فقط توابع مشخص به رندرر می‌رسند و بسته‌بندی native را شامل می‌شود", () => {
  const pre = fs.readFileSync(new URL("../../el/electron-app/preload.js", import.meta.url), "utf8");
  for (const k of ["getPrinters", "print:", "readCounter", "getScanners", "scan:", "capabilities"]) assert.ok(pre.includes(k), k);
  assert.ok(!/require\(["'](fs|child_process)["']\)/.test(pre));
  const pkg = JSON.parse(fs.readFileSync(new URL("../../el/electron-app/package.json", import.meta.url), "utf8"));
  assert.ok(pkg.build.files.includes("native/**/*")); assert.ok(pkg.dependencies["pdf-to-printer"]); assert.ok(pkg.build.asarUnpack.some((x) => x.includes("pdf-to-printer")));
});

// ───── سیاست شبکه: cafenet:fetch ─────
const mkFetchGuard = ({ hosts = [], answers = {}, confirmWith = false } = {}) => {
  const asked = []; const mem = { fetchHosts: [...hosts], printers: [] };
  const store = { hasHost: (h) => mem.fetchHosts.includes(h), addHost: (h) => mem.fetchHosts.push(h), hasPrinter: (i) => mem.printers.includes(i), addPrinter: (i) => mem.printers.push(i) };
  const lookup = async (h) => (answers[h] || [{ address: "93.184.216.34" }]);
  const g = np.createFetchGuard({ store, confirm: async (m) => { asked.push(m); return confirmWith; }, lookup });
  return { g, asked, mem };
};
test("fetch: میزبان پیش‌فرض مجاز؛ ناشناخته بدون تأیید کاربر رد (و پنجرهٔ تأیید نشان داده می‌شود)", async () => {
  const { g, asked } = mkFetchGuard();
  const ok = await g.authorize("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer k" }, body: "{}" });
  assert.equal(ok.url.host, "api.openai.com"); assert.equal(ok.headers.authorization, "Bearer k"); assert.equal(asked.length, 0);
  await assert.rejects(g.authorize("https://evil.example.com/x"), /مجاز نشد/); assert.equal(asked.length, 1);
  await assert.rejects(g.authorize("https://evil.example.com/x"), /مجاز نشد/); assert.equal(asked.length, 1, "پس از رد، ۱۰ دقیقه دوباره نپرس");
});
test("fetch: تأیید کاربر ماندگار می‌شود؛ ساب‌دامین یا پورت دیگر میزبان دیگری است (بدون wildcard)", async () => {
  const { g, asked, mem } = mkFetchGuard({ confirmWith: true });
  await g.authorize("https://n8n.myshop.ir/webhook/x", { method: "POST", body: "{}" });
  assert.deepEqual(mem.fetchHosts, ["n8n.myshop.ir"]); assert.equal(asked.length, 1);
  await g.authorize("https://n8n.myshop.ir/other"); assert.equal(asked.length, 1);
  await g.authorize("https://api.n8n.myshop.ir/x"); assert.equal(asked.length, 2);
  await g.authorize("https://api.openai.com:8443/x"); assert.equal(asked.length, 3);
});
test("fetch: لوپ‌بک/metadata/خصوصی — metadata هرگز؛ Ollama محلی فقط با تأیید؛ http فقط برای داخلی؛ DNS بازنویسی‌شدهٔ میزبان پیش‌فرض رد", async () => {
  const meta = mkFetchGuard({ confirmWith: true, answers: { "metadata.attacker.com": [{ address: "169.254.169.254" }] } });
  await assert.rejects(meta.g.authorize("http://169.254.169.254/latest/meta-data/"), /مجاز نیست/);
  await assert.rejects(meta.g.authorize("https://metadata.attacker.com/"), /مجاز نیست/); assert.equal(meta.asked.length, 0);
  await assert.rejects(meta.g.authorize("http://0.0.0.0:8080/"), /مجاز نیست/);
  await assert.rejects(meta.g.authorize("http://[fe80::1]/"), /مجاز نیست/);
  const local = mkFetchGuard({ confirmWith: false, answers: { localhost: [{ address: "127.0.0.1" }] } });
  await assert.rejects(local.g.authorize("http://localhost:11434/v1/chat/completions", { method: "POST", body: "{}" }), /مجاز نشد/);   // localhost → ::1/127.* → فقط با تأیید
  const lookupLocal = mkFetchGuard({ confirmWith: true, answers: { "ollama.lan": [{ address: "192.168.1.20" }] } });
  const r = await lookupLocal.g.authorize("http://ollama.lan:11434/v1/chat/completions", { method: "POST", body: "{}" }); assert.equal(r.url.protocol, "http:");
  assert.match(lookupLocal.asked[0], /شبکهٔ داخلی/);
  const web = mkFetchGuard({ confirmWith: true }); await assert.rejects(web.g.authorize("http://plain.example.com/x"), /https/);
  const rebind = mkFetchGuard({ confirmWith: true, answers: { "api.openai.com": [{ address: "10.0.0.8" }] } });
  await assert.rejects(rebind.g.authorize("https://api.openai.com/v1/x"), /داخلی/);
});
test("fetch: اعتبارسنجی ورودی — روش، هدرهای غیرمجاز حذف، بدنه، نام‌کاربری در URL، CRLF", async () => {
  const { g } = mkFetchGuard();
  const r = await g.authorize("https://api.openai.com/v1/x", { method: "post", headers: { Cookie: "a=b", Host: "evil", Origin: "x", "X-Api-Key": "k", "Content-Type": "application/json" }, body: "{}" });
  assert.deepEqual(Object.keys(r.headers).sort(), ["content-type", "x-api-key"]); assert.equal(r.method, "POST");
  for (const [u, o, re] of [["https://api.openai.com/x", { method: "DELETE" }, /روش/], ["https://u:p@api.openai.com/x", {}, /نام‌کاربری/], ["file:///etc/passwd", {}, /http/], ["ftp://x.com/", {}, /http/], ["notaurl", {}, /آدرس/],
    ["https://api.openai.com/x", { method: "POST", body: { a: 1 } }, /متن/], ["https://api.openai.com/x", { headers: { Authorization: "a\r\nX: y" } }, /هدر/], ["https://api.openai.com/x", { method: "POST", body: "x".repeat(np.MAX_BODY + 1) }, /بزرگ/]])
    await assert.rejects(g.authorize(u, o), re, u);
});
test("guardedFetch: ریدایرکت رد؛ سقف حجم پاسخ؛ موفق", async () => {
  const req = { url: new URL("https://api.openai.com/x"), method: "GET", headers: {} };
  const resp = (status, bytes) => ({ status, ok: status < 300, body: { getReader() { let sent = false; return { read: async () => (sent ? { done: true } : (sent = true, { done: false, value: new Uint8Array(bytes) })), cancel: async () => {} }; } } });
  await assert.rejects(np.guardedFetch(req, { fetchImpl: async () => resp(302, 1) }), /redirect/);
  await assert.rejects(np.guardedFetch(req, { fetchImpl: async () => resp(200, np.MAX_RESPONSE + 1) }), /بزرگ/);
  const seen = []; const r = await np.guardedFetch(req, { fetchImpl: async (u, o) => { seen.push(o.redirect); return resp(200, 5); } });
  assert.equal(r.ok, true); assert.equal(r.text.length, 5); assert.deepEqual(seen, ["manual"]);
});

// ───── سیاست شبکه: SNMP پرینتر ─────
test("پرینتر: فقط IP خصوصی LAN و فقط پرینتر شناخته‌شده؛ ناشناخته بدون تأیید رد؛ نرخ محدود (ضد اسکن)", async () => {
  const mem = { printers: [] }; const asked = [];
  const store = { hasPrinter: (i) => mem.printers.includes(i), addPrinter: (i) => mem.printers.push(i) };
  let t = 1_000_000; let answer = false;
  const g = np.createPrinterGuard({ store, confirm: async (m) => { asked.push(m); return answer; }, listPrinters: async () => [{ name: "HP", ip: "192.168.1.50" }, { name: "USB", ip: "" }], now: () => t });
  assert.equal(await g.authorize("192.168.1.50"), "192.168.1.50"); assert.equal(asked.length, 0, "نصب‌شده در ویندوز = شناخته‌شده");
  for (const bad of ["8.8.8.8", "127.0.0.1", "169.254.169.254", "192.168.1.0", "192.168.1.255", "example.com", "", "10.0.0.1/8"]) await assert.rejects(g.authorize(bad), /IP شبکهٔ محلی/, bad);
  await assert.rejects(g.authorize("192.168.1.77"), /مجاز نشد/); assert.equal(asked.length, 1);
  answer = true; t += 11 * 60 * 1000;
  assert.equal(await g.authorize("192.168.1.77"), "192.168.1.77"); assert.deepEqual(mem.printers, ["192.168.1.77"]);
  assert.equal(await g.authorize("192.168.1.77"), "192.168.1.77"); assert.equal(asked.length, 2, "تأییدشده ذخیره می‌شود");
  for (let i = 0; i < 6; i++) await g.authorize("192.168.1.50");
  await assert.rejects(g.authorize("192.168.1.50"), /بیش از حد/);          // ۷‌امین درخواست در یک دقیقه
  t += 61000; assert.equal(await g.authorize("192.168.1.50"), "192.168.1.50");
  // اسکن زیرشبکه: بیش از ۱۰ IP متفاوت در ۱۰ دقیقه
  answer = true; let n = 0; await assert.rejects((async () => { for (let i = 1; i < 30; i++) { n++; await g.authorize("10.1.1." + i); } })(), /مختلف/); assert.ok(n <= 12, "بعد از ۱۰ IP متوقف می‌شود: " + n);
});
test("پل IPC: فرستندهٔ غیرمعتبر رد می‌شود؛ printerCounter با guard؛ رازها فقط نام‌های ثابت", async () => {
  const handlers = {}; const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
  const dir = tmp(); const app = { getPath: (k) => path.join(dir, k) };
  const calls = [];
  const store = createSecureStore({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from("ENC:" + s), decryptString: (b) => { const x = b.toString(); if (!x.startsWith("ENC:")) throw new Error("bad"); return x.slice(4); } }, fs, path, dir: path.join(dir, "secure") });
  registerDeviceIpc({ ipcMain, shell: {}, app, execFile: (c, a, o, cb) => cb(null, { stdout: "[]" }), fs, path, printFile: async () => {}, electronPrinters: async () => [], platform: "linux",
    trustSender: (e) => e && e.ok === true, printerGuard: { authorize: async (ip) => { calls.push(ip); if (ip !== "192.168.1.50") throw new Error("پرینتر ناشناخته"); return ip; } }, secureStore: store, snmpOptions: { timeout: 200 } });
  for (const ch of Object.keys(handlers)) await assert.rejects(handlers[ch]({ ok: false }, {}), /نامعتبر/, ch);
  await assert.rejects(handlers["cafino:printerCounter"]({ ok: true }, { ip: "10.9.9.9" }), /ناشناخته/);
  assert.deepEqual(calls, ["10.9.9.9"]);
  await assert.rejects(handlers["cafino:secretSet"]({ ok: true }, { name: "../../etc/passwd", value: "x" }), /مجاز نیست/);
  await handlers["cafino:secretSet"]({ ok: true }, { name: "ai_agent_key", value: "sk-123" });
  assert.equal(await handlers["cafino:secretGet"]({ ok: true }, { name: "ai_agent_key" }), "sk-123");
  const onDisk = fs.readFileSync(path.join(dir, "secure", "secret-ai_agent_key.bin"), "utf8"); assert.ok(!onDisk.includes("sk-123") || onDisk.startsWith("ENC:"));
  await handlers["cafino:secretDelete"]({ ok: true }, { name: "ai_agent_key" });
  assert.equal(await handlers["cafino:secretGet"]({ ok: true }, { name: "ai_agent_key" }), "");
});
test("ذخیرهٔ امن: مهر یکپارچگی — بدون مهر none؛ هش یکسان ok؛ هش تغییرکرده mismatch؛ فایل خراب mismatch؛ بدون safeStorage unavailable", () => {
  const dir = tmp(); const ss = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from("ENC:" + s), decryptString: (b) => { const x = b.toString(); if (!x.startsWith("ENC:")) throw new Error("bad"); return x.slice(4); } };
  const st = createSecureStore({ safeStorage: ss, fs, path, dir });
  const h1 = "a".repeat(64), h2 = "b".repeat(64);
  assert.equal(st.seal.verify(h1).status, "none");
  assert.equal(st.seal.set(h1).ok, true); assert.equal(st.seal.verify(h1).status, "ok"); assert.equal(st.seal.verify(h2).status, "mismatch");
  fs.writeFileSync(path.join(dir, "integrity-seal.bin"), "garbage"); assert.equal(st.seal.verify(h1).status, "mismatch");
  assert.throws(() => st.seal.set("zz"), /هش/);
  const off = createSecureStore({ safeStorage: { isEncryptionAvailable: () => false }, fs, path, dir });
  assert.equal(off.seal.verify(h1).status, "unavailable"); assert.equal(off.secrets.get("ai_agent_key"), ""); assert.throws(() => off.secrets.set("ai_agent_key", "x"), /در دسترس نیست/);
});
test("main.js: fetch از policy می‌گذرد (نه fetch آزاد)؛ devTools در نسخهٔ نصبی بسته؛ preload رازها/مهر را از نام‌های ثابت می‌دهد", () => {
  const main = fs.readFileSync(new URL("../../el/electron-app/main.js", import.meta.url), "utf8");
  assert.ok(main.includes("policy.fetchGuard.authorize") && main.includes("guardedFetch"));
  assert.ok(!/await fetch\(/.test(main), "fetch آزاد در main.js نباشد");
  assert.ok(main.includes("devTools: !isPackaged()") && main.includes("senderFrame === e.sender.mainFrame"));
  assert.ok(main.includes("trustSender: senderIsApp") && main.includes("printerGuard"));
  const pre = fs.readFileSync(new URL("../../el/electron-app/preload.js", import.meta.url), "utf8");
  for (const k of ["cafino:secretSet", "cafino:sealVerify"]) assert.ok(pre.includes(k), k);
  const pkg = JSON.parse(fs.readFileSync(new URL("../../el/electron-app/package.json", import.meta.url), "utf8"));
  assert.ok(pkg.build.files.includes("native/**/*"));
});

// ───── سیاست شبکه: IP، Pin، ریدایرکت، مجوزها (v1.74) ─────
test("IP: شکل‌های جایگزین metadata/لوپ‌بک/CGNAT در IPv4 و IPv6 رد می‌شوند؛ آدرس عمومی و LAN درست طبقه‌بندی می‌شود", () => {
  const T = (ip, never, internal) => { assert.equal(np.isNeverAllowedIp(ip), never, "never " + ip); assert.equal(np.isInternalIp(ip), internal, "internal " + ip); };
  for (const ip of ["169.254.169.254", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "2002:a9fe:a9fe::1", "100.100.100.200", "fe80::1", "fec0::1", "ff02::1", "::", "2001:db8::1", "192.0.2.5", "224.0.0.1", "1.2.3.4%eth0", "abc", ""]) T(ip, true, false);
  for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "fd00::1"]) T(ip, true, true);
  for (const ip of ["10.0.0.5", "::ffff:10.0.0.5", "192.168.1.20", "172.16.0.9", "::10.0.0.1"]) T(ip, false, true);
  for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700::1111"]) T(ip, false, false);
});
test("DNS rebinding: authorize آدرس‌ها را ثبت می‌کند و اتصال فقط به همان IP می‌رود (نام میزبان در Host می‌ماند)", async () => {
  const http = require("node:http");
  const seen = [];
  const srv = http.createServer((q, s) => { seen.push(q.headers.host); s.end("pinned-ok"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    // نام میزبانی که در DNS واقعی وجود ندارد: اگر اتصال دوباره DNS می‌پرسید، شکست می‌خورد
    const req = { url: new URL(`http://pinned.invalid:${port}/x`), method: "GET", headers: {}, addrs: ["127.0.0.1"] };
    const r = await np.guardedFetch(req);
    assert.equal(r.text, "pinned-ok"); assert.equal(seen[0], `pinned.invalid:${port}`);
    await assert.rejects(np.guardedFetch({ ...req, addrs: [] }), /آدرس تأییدشده/);
    // authorize: DNS اول عمومی → req.addrs همان؛ اتصال دوم DNS نمی‌خواهد
    let calls = 0; const lookup = async () => { calls++; return [{ address: calls === 1 ? "93.184.216.34" : "127.0.0.1" }]; };
    const g = np.createFetchGuard({ store: { hasHost: () => false, addHost() {} }, confirm: async () => false, lookup });
    const a = await g.authorize("https://api.openai.com/v1/x");
    assert.deepEqual(a.addrs, ["93.184.216.34"]); assert.equal(calls, 1);
  } finally { srv.close(); }
});
test("guardedFetch: ریدایرکت فقط GET، ≤۳ بار، هر مرحله دوباره authorize؛ هدر اعتبار هنگام تغییر میزبان حذف؛ https→http رد", async () => {
  const mk = (status, location, body = "") => ({ status, headers: location ? { location } : {}, body: (async function* () { yield Buffer.from(body); })(), destroy() {} });
  const authorize = async (u, o) => ({ url: new URL(u), method: "GET", headers: o.headers || {}, addrs: ["93.184.216.34"] });
  const base = { url: new URL("https://api.openai.com/a"), method: "GET", headers: { authorization: "Bearer k", accept: "x" }, addrs: ["93.184.216.34"] };
  // موفق: دو ریدایرکت، بدون authorize رد
  const sent = []; const t1 = async (r) => { sent.push(r); return sent.length === 1 ? mk(301, "/b") : sent.length === 2 ? mk(302, "https://other.example/c") : mk(200, null, "done"); };
  const ok = await np.guardedFetch(base, { transport: t1, authorize });
  assert.equal(ok.text, "done"); assert.equal(sent[1].url.pathname, "/b"); assert.equal(sent[1].headers.authorization, "Bearer k", "همان میزبان: هدر می‌ماند");
  assert.equal(sent[2].headers.authorization, undefined, "میزبان دیگر: هدر اعتبار حذف"); assert.equal(sent[2].headers.accept, "x");
  await assert.rejects(np.guardedFetch(base, { transport: async () => mk(302, "/b") }), /redirect/, "بدون authorize");
  await assert.rejects(np.guardedFetch(base, { transport: async () => mk(302, "/loop"), authorize }), /بیش از حد/, "حلقه");
  await assert.rejects(np.guardedFetch(base, { transport: async () => mk(302, "http://plain.example/x"), authorize }), /https به http/);
  await assert.rejects(np.guardedFetch({ ...base, method: "POST", body: "{}" }, { transport: async () => mk(307, "/b"), authorize }), /redirect/, "POST دنبال نمی‌شود");
  const deny = async () => { throw new Error("این مقصد (لوپ‌بک/link-local/رزرو) مجاز نیست."); };
  await assert.rejects(np.guardedFetch(base, { transport: async () => mk(302, "http://169.254.169.254/"), authorize: deny }), /مجاز نیست/, "ریدایرکت به metadata");
});
test("مجوزهای Electron: فقط میکروفن/اعلان برای صفحهٔ برنامه؛ دوربین، صفحه، موقعیت، صفحهٔ بیرونی رد", () => {
  const { createPermissionPolicy } = require(root + "permissions.js");
  const own = "file:///app/index.html";
  const p = createPermissionPolicy({ isOwnPage: (u) => u === own });
  const wc = { getURL: () => own };
  assert.equal(p.request(wc, "media", { requestingUrl: own, mediaTypes: ["audio"] }), true);
  assert.equal(p.request(wc, "media", { requestingUrl: own, mediaTypes: ["audio", "video"] }), false, "دوربین");
  assert.equal(p.request(wc, "media", { requestingUrl: own, mediaTypes: ["video"] }), false);
  assert.equal(p.request(wc, "media", { requestingUrl: own }), false, "نوع نامشخص در درخواست");
  assert.equal(p.request(wc, "media", { requestingUrl: "https://evil.example/", mediaTypes: ["audio"] }), false, "صفحهٔ بیرونی");
  for (const perm of ["geolocation", "clipboard-read", "display-capture", "midi", "openExternal", "fullscreen"]) assert.equal(p.request(wc, perm, { requestingUrl: own }), false, perm);
  assert.equal(p.request(wc, "notifications", { requestingUrl: own }), true);
  assert.equal(p.check(wc, "media", "file:///", { requestingUrl: own, mediaType: "audio" }), true);
  assert.equal(p.check(wc, "media", "file:///", { requestingUrl: own, mediaType: "video" }), false);
  assert.equal(p.check({ getURL: () => "https://evil.example/" }, "media", "https://evil.example", { mediaType: "audio" }), false);
  assert.equal(p.check(wc, "geolocation", "file:///", {}), false);
});

test("ذخیرهٔ امن لینوکس: basic_text یا نبودن libsecret «در دسترس نیست» با هشدار و راه‌حل؛ gnome_libsecret/kwallet پذیرفته؛ ویندوز/مک بدون backend", () => {
  const mk = (enc, backend) => ({ isEncryptionAvailable: () => enc, getSelectedStorageBackend: () => backend, encryptString: (s) => Buffer.from("ENC:" + s), decryptString: (b) => b.toString().slice(4) });
  const weak = storageStatus(mk(true, "basic_text"), "linux"); assert.equal(weak.available, false); assert.equal(weak.level, "weak"); assert.match(weak.warning, /libsecret/); assert.match(weak.warning, /apt install/);
  assert.equal(storageStatus(mk(false, "not_available"), "linux").level, "unavailable");
  for (const b of ["gnome_libsecret", "kwallet5", "kwallet6"]) { const r = storageStatus(mk(true, b), "linux"); assert.equal(r.available, true, b); assert.equal(r.level, "ok"); assert.equal(r.warning, ""); }
  assert.equal(storageStatus({ isEncryptionAvailable: () => true }, "win32").backend, "dpapi");
  assert.equal(storageStatus({ isEncryptionAvailable: () => true }, "darwin").available, true);
  // رازها روی basic_text ذخیره نمی‌شوند (به‌جای ذخیرهٔ ضعیف)
  const dir = tmp(); const st = createSecureStore({ safeStorage: mk(true, "basic_text"), fs, path, dir, platform: "linux" });
  assert.throws(() => st.secrets.set("ai_agent_key", "sk-1"), /در دسترس نیست/); assert.equal(st.seal.set("a".repeat(64)).ok, false); assert.equal(st.status().level, "weak");
  const good = createSecureStore({ safeStorage: mk(true, "gnome_libsecret"), fs, path, dir, platform: "linux" }); assert.equal(good.secrets.set("ai_agent_key", "sk-1"), true); assert.equal(good.secrets.get("ai_agent_key"), "sk-1");
});
