// سیاست شبکهٔ پردازش اصلی Electron: رندرر (صفحهٔ وب) هرگز آزادانه به شبکه دسترسی ندارد.
//   • cafenet:fetch   → فقط میزبان‌های مجاز (فهرست پیش‌فرض ارائه‌دهندگان شناخته‌شده + میزبان‌هایی که کاربر در پنجرهٔ تأیید سیستم‌عامل پذیرفته)
//   • SNMP پرینتر     → فقط IP خصوصی (۱۰/۸، ۱۷۲.۱۶/۱۲، ۱۹۲.۱۶۸/۱۶) از «پرینترهای شناخته‌شده» (نصب‌شده در ویندوز یا تأییدشده توسط کاربر)
// همهٔ وابستگی‌ها (fs، dns، پنجرهٔ تأیید) تزریق می‌شوند تا بدون Electron تست شوند.
"use strict";
const net = require("net");

// ── آدرس‌ها ───────────────────────────────────────────────────────────────────────────────
function v4(ip) { return net.isIPv4(ip) ? ip.split(".").map(Number) : null; }
// IPv4 خصوصی شبکهٔ محلی (loopback و link-local «عمداً» نیستند)
function isPrivateLan(ip) {
  const p = v4(ip); if (!p) return false;
  const [a, b] = p;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
// تجزیهٔ IPv4/IPv6 به بایت (آدرس‌های مبهم، zone-id و متن نامعتبر → null). از regex روی متن استفاده نمی‌کنیم تا
// شکل‌های جایگزین (::ffff:a9fe:a9fe، 0:0:0:0:0:ffff:169.254.169.254، 64:ff9b::، 2002::) نتوانند فیلتر را دور بزنند.
function parseIp(ip) {
  const s = String(ip || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (s.includes("%")) return null;
  if (net.isIPv4(s)) return { v: 4, b: s.split(".").map(Number) };
  if (!net.isIPv6(s)) return null;
  const dbl = s.indexOf("::");
  const part = (x) => (x ? x.split(":") : []);
  const expand = (arr) => { const out = []; for (const x of arr) { if (x.includes(".")) { const q = x.split(".").map(Number); out.push((q[0] << 8) | q[1], (q[2] << 8) | q[3]); } else out.push(parseInt(x, 16)); } return out; };
  let g;
  if (dbl >= 0) { const h = expand(part(s.slice(0, dbl))), tl = expand(part(s.slice(dbl + 2))); const fill = 8 - h.length - tl.length; if (fill < 0) return null; g = [...h, ...Array(fill).fill(0), ...tl]; }
  else { g = expand(part(s)); if (g.length !== 8) return null; }
  if (g.length !== 8 || g.some((x) => !Number.isInteger(x) || x < 0 || x > 0xffff)) return null;
  return { v: 6, g, b: g.flatMap((x) => [x >> 8, x & 255]) };
}
// IPv4 نهفته در IPv6 (mapped، compat، NAT64 و 6to4) → همان قواعد IPv4 اعمال شود
function embeddedV4(p) {
  if (p.v === 4) return p.b;
  const g = p.g;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return p.b.slice(12);
  if (g.slice(0, 6).every((x) => x === 0) && (g[6] > 0 || g[7] > 1)) return p.b.slice(12);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return p.b.slice(12);
  if (g[0] === 0x2002) return p.b.slice(2, 6);
  return null;
}
const v4Never = ([a, b, c]) => a === 0 || a === 127 || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113) || a >= 224;
const v4Internal = (b) => (b[0] === 10 || (b[0] === 172 && b[1] >= 16 && b[1] <= 31) || (b[0] === 192 && b[1] === 168) || b[0] === 127);
// هرگز مجاز نیست: لوپ‌بک، link-local (شامل metadata ابر 169.254.169.254)، CGNAT 100.64/10 (metadata علی‌بابا)، 0.0.0.0، محدوده‌های مستندات/تست،
// multicast/reserved، broadcast، IPv6 محلی/خصوصی/مستندات/Teredo — شکل‌های IPv4 نهفته در IPv6 هم با قواعد IPv4 سنجیده می‌شوند.
function isNeverAllowedIp(ip) {
  const p = parseIp(ip); if (!p) return true;
  const e = embeddedV4(p); if (e) return v4Never(e);
  if (p.v === 4) return v4Never(p.b);
  const g = p.g;
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true;        // :: و ::1
  return (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xfe00) === 0xfc00 || (g[0] >> 8) === 0xff
    || (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0x0db8)) || (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0);
}
// آدرسی که «داخلی» است (خصوصی یا لوپ‌بک) — فقط با تأیید صریح کاربر قابل‌استفاده
function isInternalIp(ip) {
  const p = parseIp(ip); if (!p) return false;
  const e = embeddedV4(p); if (e) return v4Internal(e);
  if (p.v === 4) return v4Internal(p.b);
  const g = p.g;
  return (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) || (g[0] & 0xfe00) === 0xfc00;
}

// ── فهرست پیش‌فرض میزبان‌های fetch (فقط نام دقیق؛ wildcard ندارد) ───────────────────────────────
const DEFAULT_FETCH_HOSTS = [
  "api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com", "openrouter.ai", "api.groq.com",
  "api.deepseek.com", "api.mistral.ai", "api.together.xyz", "api.x.ai", "api.perplexity.ai",
  "onlinecofe.ir", "www.onlinecofe.ir",     // فید «اخبار کافی‌نت» (ویجت داشبورد؛ فقط GET)
];
const ALLOWED_HEADERS = new Set(["content-type", "accept", "authorization", "x-api-key", "api-key", "anthropic-version", "anthropic-beta", "anthropic-dangerous-direct-browser-access", "x-goog-api-key", "http-referer", "x-title", "openai-organization"]);
const MAX_BODY = 2 * 1024 * 1024;
const MAX_RESPONSE = 5 * 1024 * 1024;

// ── فهرست تأییدشده‌ها (JSON کنار دادهٔ برنامه؛ فقط پردازش اصلی می‌نویسد) ─────────────────────────
function createAllowStore({ fs, file }) {
  let data = { fetchHosts: [], printers: [] };
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); if (j && typeof j === "object") data = { fetchHosts: Array.isArray(j.fetchHosts) ? j.fetchHosts.map(String) : [], printers: Array.isArray(j.printers) ? j.printers.map(String) : [] }; } catch { /* اولین اجرا یا فایل خراب */ }
  const save = () => { try { fs.writeFileSync(file + ".tmp", JSON.stringify(data)); fs.renameSync(file + ".tmp", file); } catch { /* ignore */ } };
  return {
    hasHost: (h) => data.fetchHosts.includes(h), addHost: (h) => { if (!data.fetchHosts.includes(h)) { data.fetchHosts.push(h); save(); } },
    hasPrinter: (ip) => data.printers.includes(ip), addPrinter: (ip) => { if (!data.printers.includes(ip)) { data.printers.push(ip); save(); } },
    snapshot: () => JSON.parse(JSON.stringify(data)),
  };
}

// پنجرهٔ تأیید: هم‌زمان فقط یکی؛ پاسخ «رد» ۱۰ دقیقه به‌خاطر سپرده می‌شود تا رندرر نتواند پنجره‌ها را تکرار کند.
function createAsker(confirm, now = Date.now) {
  const denied = new Map(); let chain = Promise.resolve();
  return (key, message) => {
    const until = denied.get(key); if (until && until > now()) return Promise.resolve(false);
    const run = chain.then(async () => { const ok = await confirm(message); if (!ok) denied.set(key, now() + 10 * 60 * 1000); return !!ok; });
    chain = run.catch(() => {});
    return run;
  };
}

// ── fetch ─────────────────────────────────────────────────────────────────────────────────
function validateFetchInput(url, opts) {
  let u;
  try { u = new URL(String(url || "")); } catch { throw new Error("آدرس نامعتبر است."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("فقط آدرس http/https مجاز است.");
  if (u.username || u.password) throw new Error("آدرس نباید نام‌کاربری/رمز داشته باشد.");
  const method = String((opts && opts.method) || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") throw new Error("روش نامعتبر است.");
  const headers = {};
  for (const [k, v] of Object.entries((opts && opts.headers) || {})) {
    const name = String(k).toLowerCase();
    if (!ALLOWED_HEADERS.has(name)) continue;                      // cookie، host، origin و … هرگز از رندرر نمی‌گذرد
    const val = String(v); if (/[\r\n]/.test(val) || val.length > 4096) throw new Error("هدر نامعتبر است.");
    headers[name] = val;
  }
  let body;
  if (opts && opts.body != null) {
    if (typeof opts.body !== "string") throw new Error("بدنهٔ درخواست باید متن باشد.");
    if (Buffer.byteLength(opts.body) > MAX_BODY) throw new Error("بدنهٔ درخواست بیش از حد بزرگ است.");
    if (method === "GET") throw new Error("GET بدنه ندارد.");
    body = opts.body;
  }
  return { url: u, method, headers, body };
}

function createFetchGuard({ store, confirm, lookup, now, extraHosts = [] }) {
  const ask = createAsker(confirm, now);
  const builtin = new Set([...DEFAULT_FETCH_HOSTS, ...extraHosts.map((h) => String(h).toLowerCase())]);
  const resolveAll = async (hostname) => {
    if (net.isIP(hostname)) return [hostname];
    const r = await lookup(hostname, { all: true });
    return r.map((x) => x.address);
  };
  // برمی‌گرداند: درخواست اعتبارسنجی‌شده؛ در غیر این صورت خطا
  async function authorize(url, opts) {
    const req = validateFetchInput(url, opts);
    const host = req.url.host.toLowerCase();                       // شامل پورت غیرپیش‌فرض
    const hostname = req.url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const addrs = await resolveAll(hostname);
    if (!addrs.length) throw new Error("نام میزبان پیدا نشد.");
    req.addrs = addrs;                                             // IPهای تأییدشده؛ اتصال فقط به همین‌ها (Pin) — بازیابی دوبارهٔ DNS ممنوع (ضد DNS rebinding)
    if (addrs.some((a) => isNeverAllowedIp(a) && !isInternalIp(a))) throw new Error("این مقصد (لوپ‌بک/link-local/رزرو) مجاز نیست.");
    const internal = addrs.some((a) => isInternalIp(a));
    const known = builtin.has(host) || store.hasHost(host);
    if (!internal) {
      if (req.url.protocol !== "https:" && !store.hasHost(host)) throw new Error("برای میزبان‌های اینترنتی فقط https مجاز است.");
      if (known) return req;
    } else if (builtin.has(host)) {
      throw new Error("میزبان پیش‌فرض به آدرس داخلی اشاره می‌کند؛ مجاز نیست.");     // تغییر DNS / rebinding
    } else if (store.hasHost(host)) return req;
    const kind = internal ? "یک دستگاه/سرور در شبکهٔ داخلی (محلی)" : "یک سرویس اینترنتی";
    const ok = await ask("fetch:" + host, `برنامه می‌خواهد داده‌ها (مثلاً پرسش‌های دستیار) را به «${host}» بفرستد.\n\nاین آدرس ${kind} است. فقط اگر خودتان آن را در تنظیمات هوش مصنوعی وارد کرده‌اید اجازه دهید.`);
    if (!ok) throw new Error("ارسال به این آدرس مجاز نشد. (در تنظیمات هوش مصنوعی آدرس را بررسی کنید.)");
    store.addHost(host);
    return req;
  }
  return { authorize };
}

// انتقال پیش‌فرض: اتصال با http/https خود Node به «IP تأییدشده» (lookup ثابت). نام میزبان همچنان در Host و SNI می‌ماند و گواهی TLS
// با نام میزبان اعتبارسنجی می‌شود؛ پس هیچ DNS دومی بین اعتبارسنجی و اتصال وجود ندارد (ضد DNS rebinding / TOCTOU).
function pinnedTransport(req, { timeoutMs = 60000 } = {}) {
  const lib = req.url.protocol === "https:" ? require("https") : require("http");
  const addrs = (req.addrs || []).slice();
  if (!addrs.length) return Promise.reject(new Error("آدرس تأییدشده برای اتصال موجود نیست."));
  const lookup = (hostname, o, cb) => {
    if (typeof o === "function") { cb = o; o = {}; }
    const list = addrs.map((a) => ({ address: a, family: a.includes(":") ? 6 : 4 }));
    if (o && o.all) cb(null, list); else cb(null, list[0].address, list[0].family);
  };
  return new Promise((resolve, reject) => {
    const r = lib.request(req.url, { method: req.method, headers: req.headers, lookup, agent: false, timeout: timeoutMs }, (res) => {
      const headers = {}; for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
      resolve({ status: res.statusCode || 0, headers, body: res, destroy: () => res.destroy() });
    });
    r.on("timeout", () => r.destroy(Object.assign(new Error("timeout"), { name: "AbortError" })));
    r.on("error", reject);
    if (req.body != null) r.write(req.body);
    r.end();
  });
}
// سازگاری با fetchImpl تزریق‌شده (تست‌ها): پاسخ fetch را به همان شکل انتقال درمی‌آورد
async function fetchTransport(fetchImpl, req, timeoutMs) {
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(req.url.toString(), { method: req.method, headers: req.headers, body: req.body, signal: ac.signal, redirect: "manual" });
    const headers = {}; if (res.headers && res.headers.forEach) res.headers.forEach((v, k) => { headers[k] = v; });
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    const body = reader ? (async function* () { for (;;) { const { done, value } = await reader.read(); if (done) return; yield Buffer.from(value); } })()
      : (async function* () { yield Buffer.from(await res.text()); })();
    return { status: res.status, headers, body, destroy: () => { try { reader && reader.cancel(); } catch { /* ignore */ } }, clear: () => clearTimeout(tm) };
  } catch (e) { clearTimeout(tm); throw e; }
}
const CRED_HEADERS = ["authorization", "x-api-key", "api-key", "x-goog-api-key"];
const MAX_REDIRECTS = 3;

// پاسخ با سقف حجم؛ ریدایرکت فقط برای GET، حداکثر ۳ بار، و «هر مرحله» دوباره با authorize (میزبان مجاز + IP عمومی/تأییدشده) سنجیده می‌شود.
// هدرهای اعتبار هنگام رفتن به میزبان دیگر حذف می‌شوند. https → http (تنزل) رد می‌شود.
async function guardedFetch(req, { fetchImpl, transport, authorize, timeoutMs = 60000 } = {}) {
  const send = transport || (fetchImpl ? (r) => fetchTransport(fetchImpl, r, timeoutMs) : (r) => pinnedTransport(r, { timeoutMs }));
  let cur = req; let hops = 0;
  try {
    for (;;) {
      const res = await send(cur);
      if (res.status >= 300 && res.status < 400) {
        if (res.destroy) res.destroy(); if (res.clear) res.clear();
        const loc = res.headers && (res.headers.location || res.headers.Location);
        if (!authorize || !loc || cur.method !== "GET" || ![301, 302, 303, 307, 308].includes(res.status)) throw new Error("تغییر مسیر (redirect) مجاز نیست.");
        if (++hops > MAX_REDIRECTS) throw new Error("تعداد تغییر مسیرها (redirect) بیش از حد است.");
        let next; try { next = new URL(loc, cur.url); } catch { throw new Error("تغییر مسیر (redirect) نامعتبر است."); }
        if (cur.url.protocol === "https:" && next.protocol !== "https:") throw new Error("تغییر مسیر از https به http (redirect) مجاز نیست.");
        const sameHost = next.host.toLowerCase() === cur.url.host.toLowerCase();
        const headers = { ...cur.headers }; if (!sameHost) for (const h of CRED_HEADERS) delete headers[h];
        cur = await authorize(next.toString(), { method: "GET", headers });
        continue;
      }
      let size = 0; const chunks = [];
      try {
        for await (const c of res.body) { size += c.length; if (size > MAX_RESPONSE) { if (res.destroy) res.destroy(); throw new Error("پاسخ بیش از حد بزرگ است."); } chunks.push(c); }
      } finally { if (res.clear) res.clear(); }
      return { ok: res.status >= 200 && res.status < 300, status: res.status, text: Buffer.concat(chunks).toString("utf8") };
    }
  } catch (err) {
    if (err && err.name === "AbortError") throw new Error("پاسخی دریافت نشد (۶۰ ثانیه).");
    if (err && /redirect|بیش از حد|تغییر مسیر|مجاز|نامعتبر|IP|آدرس|میزبان/.test(err.message || "")) throw err;
    throw new Error("ارتباط با سرور برقرار نشد: " + (err && err.message));
  }
}

// ── SNMP پرینتر ───────────────────────────────────────────────────────────────────────────
// قواعد: IP خصوصی LAN (نه loopback/link-local)، نه آدرس شبکه/broadcast، «پرینتر شناخته‌شده» (ویندوز یا تأیید کاربر)،
// و سقف نرخ تا رندرر نتواند شبکه را اسکن کند: ≤ ۶ درخواست/دقیقه برای هر IP و ≤ ۱۰ IP متفاوت در ۱۰ دقیقه.
function createPrinterGuard({ store, confirm, listPrinters, now = Date.now }) {
  const ask = createAsker(confirm, now);
  const hits = new Map();           // ip -> [timestamps]
  const rate = (ip) => {
    const t = now();
    const arr = (hits.get(ip) || []).filter((x) => t - x < 60000); arr.push(t); hits.set(ip, arr);
    if (arr.length > 6) throw new Error("درخواست‌های SNMP بیش از حد است؛ کمی صبر کنید.");
    const distinct = [...hits.entries()].filter(([, a]) => a.some((x) => t - x < 600000)).length;
    if (distinct > 10) throw new Error("تعداد IP های مختلف در بازهٔ کوتاه بیش از حد است.");
  };
  async function authorize(ipRaw) {
    const ip = String(ipRaw || "").trim();
    const last = Number(ip.split(".")[3]);
    if (!isPrivateLan(ip) || last === 0 || last === 255) throw new Error("آدرس پرینتر باید IP شبکهٔ محلی باشد (مثل 192.168.1.50)");
    rate(ip);
    if (store.hasPrinter(ip)) return ip;
    let installed = [];
    try { installed = (await listPrinters()).map((p) => p && p.ip).filter(Boolean); } catch { /* ignore */ }
    if (installed.includes(ip)) return ip;
    const ok = await ask("printer:" + ip, `برنامه می‌خواهد کنتور پرینتر «${ip}» را از طریق شبکه بخواند.\n\nاین پرینتر در فهرست پرینترهای ویندوز نیست. فقط اگر مطمئنید این آدرس پرینتر کافی‌نت شماست اجازه دهید.`);
    if (!ok) throw new Error("خواندن کنتور از این آدرس مجاز نشد (پرینتر ناشناخته).");
    store.addPrinter(ip);
    return ip;
  }
  return { authorize };
}

module.exports = {
  DEFAULT_FETCH_HOSTS, ALLOWED_HEADERS, MAX_BODY, MAX_RESPONSE,
  isPrivateLan, isNeverAllowedIp, isInternalIp, validateFetchInput,
  createAllowStore, createAsker, createFetchGuard, createPrinterGuard, guardedFetch, pinnedTransport, parseIp,
};
