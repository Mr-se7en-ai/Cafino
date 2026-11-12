// پراکسی امن فید خبر: مرورگرِ برنامه به‌خاطر CORS معمولاً نمی‌تواند فید سایت‌های دیگر را بخواند؛ سرور می‌خواند و کش می‌کند.
// ایمنی (SSRF / DNS-rebinding):
//   • فقط https، فقط میزبان‌های فهرست NEWS_FEED_HOSTS (نام دقیق)، پورت ۴۴۳، بدون نام‌کاربری/رمز؛
//   • نام میزبان «یک‌بار» resolve می‌شود، همهٔ آدرس‌ها باید عمومی باشند (lib/ipClass.js) و اتصال TCP «فقط به همان IPهای تأییدشده» برقرار می‌شود
//     (DNS Pinning: تابع lookup اتصال به آدرس‌های تأییدشده ثابت است؛ دومین resolve وجود ندارد ⇒ بین «بررسی» و «اتصال» TOCTOU نیست).
//     TLS با SNI و اعتبارسنجی گواهی برای «نام میزبان» انجام می‌شود (نه IP)؛
//   • ریدایرکت فقط تا ۳ بار، دستی، و هر گام از اول (https/میزبان مجاز/IP عمومی/Pin جدید) بررسی می‌شود؛
//   • سقف حجم ۳ مگابایت (بدون فشرده‌سازی)، فقط نوع محتوای متنی/XML/JSON/HTML، مهلت کل ۹ ثانیه، سقف هم‌زمانی؛
//   • fetch معمولی بدون Pin در این سرویس وجود ندارد: transport پیش‌فرض https.request با lookup ثابت است.
import dns from "node:dns/promises";
import https from "node:https";
import { Readable } from "node:stream";
import { isIp, isPublicIp } from "./ipClass.js";

export { isPublicIp };
export const DEFAULT_NEWS_HOSTS = ["onlinecofe.ir", "www.onlinecofe.ir"];

export class NewsProxyError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const TEXTUAL = /^(text\/|application\/(rss\+xml|atom\+xml|xml|json|feed\+json|xhtml\+xml))/i;

// آدرس‌های تأییدشده → تابع lookup سازگار با net.connect (هم حالت all:true هم تکی)
export function pinnedLookup(addrs) {
  const list = addrs.map((a) => ({ address: a, family: a.includes(":") ? 6 : 4 }));
  return (_host, opts, cb) => {
    if (typeof opts === "function") { cb = opts; opts = {}; }
    if (opts && opts.all) return process.nextTick(cb, null, list.map((x) => ({ ...x })));
    const pick = (opts && opts.family && list.find((x) => x.family === opts.family)) || list[0];
    process.nextTick(cb, null, pick.address, pick.family);
  };
}

// transport پیش‌فرض: https.request با اتصال Pin‌شده. خروجی شبیه Response (status/headers/body) است؛ بدنه دنبال نمی‌شود.
export function pinnedHttpsTransport(url, { headers, signal, addrs, port = 443, tls = {} }) {   // port/tls فقط برای تست‌های داخلی؛ createNewsProxy هرگز آن‌ها را نمی‌دهد
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: "https:", hostname: u.hostname, port, path: u.pathname + u.search, method: "GET", headers,
      servername: isIp(u.hostname) ? undefined : u.hostname,      // SNI + اعتبارسنجی گواهی برای نام میزبان
      lookup: pinnedLookup(addrs), agent: false, signal, rejectUnauthorized: true, minVersion: "TLSv1.2", ...tls,
    }, (res) => {
      const h = new Headers();
      for (const [k, v] of Object.entries(res.headers)) { try { h.set(k, Array.isArray(v) ? v.join(", ") : String(v)); } catch { /* هدر نامعتبر نادیده */ } }
      const nullBody = [101, 204, 205, 304].includes(res.statusCode) || (res.statusCode >= 100 && res.statusCode < 200);
      if (nullBody) { res.resume(); return resolve(new Response(null, { status: res.statusCode === 101 ? 200 : res.statusCode, headers: h })); }
      resolve(new Response(Readable.toWeb(res), { status: res.statusCode, headers: h }));
    });
    req.on("error", reject);
    req.end();
  });
}

export function createNewsProxy({ hosts = DEFAULT_NEWS_HOSTS, transport = pinnedHttpsTransport, lookup = (h) => dns.lookup(h, { all: true, verbatim: true }), now = Date.now, ttlMs = 10 * 60 * 1000, maxBytes = 3 * 1024 * 1024, timeoutMs = 9000, maxCache = 50, maxConcurrent = 4 } = {}) {
  const allowed = new Set(hosts.map((h) => String(h).toLowerCase()));
  const cache = new Map(); const inflight = new Map(); let active = 0;

  // اعتبارسنجی آدرس + resolve یک‌باره؛ خروجی: URL و IPهای تأییدشده برای Pin
  async function check(raw) {
    let u; try { u = new URL(String(raw || "")); } catch { throw new NewsProxyError(400, "bad_url", "آدرس نامعتبر است"); }
    if (u.protocol !== "https:") throw new NewsProxyError(400, "bad_url", "فقط https مجاز است");
    if (u.username || u.password) throw new NewsProxyError(400, "bad_url", "آدرس نباید نام‌کاربری/رمز داشته باشد");
    if (u.port && u.port !== "443") throw new NewsProxyError(400, "bad_url", "پورت غیرمجاز");
    const host = u.hostname.toLowerCase();
    if (!allowed.has(host)) throw new NewsProxyError(403, "host_not_allowed", "این میزبان در فهرست مجاز خبر نیست (NEWS_FEED_HOSTS)");
    let found; try { found = await lookup(host); } catch { throw new NewsProxyError(502, "dns_failed", "نام میزبان پیدا نشد"); }
    const addrs = [...new Set((found || []).map((x) => (typeof x === "string" ? x : x.address)))];
    if (!addrs.length) throw new NewsProxyError(502, "dns_failed", "نام میزبان پیدا نشد");
    if (!addrs.every(isPublicIp)) throw new NewsProxyError(403, "host_not_public", "میزبان به آدرس غیرعمومی اشاره می‌کند");
    return { u, addrs };
  }

  async function readBody(res, signal) {
    const len = Number(res.headers.get("content-length")); if (Number.isFinite(len) && len > maxBytes) { try { await res.body?.cancel(); } catch { /* ignore */ } throw new NewsProxyError(502, "too_large", "پاسخ منبع خبر بسیار بزرگ است"); }
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) { const t = await res.text(); if (Buffer.byteLength(t) > maxBytes) throw new NewsProxyError(502, "too_large", "پاسخ منبع خبر بسیار بزرگ است"); return t; }
    const chunks = []; let size = 0;
    for (;;) {
      if (signal.aborted) { try { await reader.cancel(); } catch { /* ignore */ } throw new NewsProxyError(504, "timeout", "مهلت دریافت فید تمام شد"); }
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } throw new NewsProxyError(502, "too_large", "پاسخ منبع خبر بسیار بزرگ است"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  async function fetchOnce(raw) {
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), timeoutMs);   // مهلت «کل» (همهٔ ریدایرکت‌ها و خواندن بدنه)
    try {
      let { u, addrs } = await check(raw);
      for (let hop = 0; hop <= 3; hop++) {
        let res;
        try { res = await transport(u.toString(), { signal: ac.signal, addrs, headers: { host: u.host, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8", "accept-encoding": "identity", "user-agent": "CafinoNewsWidget/1.0" } }); }
        catch { throw ac.signal.aborted ? new NewsProxyError(504, "timeout", "مهلت دریافت فید تمام شد") : new NewsProxyError(502, "fetch_failed", "دریافت فید ممکن نشد"); }
        if (res.status >= 300 && res.status < 400) {
          try { await res.body?.cancel(); } catch { /* ignore */ }
          const loc = res.headers.get("location"); if (!loc) throw new NewsProxyError(502, "bad_redirect", "ریدایرکت نامعتبر");
          let next; try { next = new URL(loc, u).toString(); } catch { throw new NewsProxyError(502, "bad_redirect", "ریدایرکت نامعتبر"); }
          ({ u, addrs } = await check(next)); continue;                       // هر گام: اعتبارسنجی کامل + Pin تازه
        }
        if (!res.ok) { try { await res.body?.cancel(); } catch { /* ignore */ } throw new NewsProxyError(502, "upstream_status", `پاسخ ناموفق از منبع خبر (${res.status})`); }
        const enc = (res.headers.get("content-encoding") || "identity").toLowerCase();
        if (enc !== "identity") { try { await res.body?.cancel(); } catch { /* ignore */ } throw new NewsProxyError(502, "bad_encoding", "رمزگذاری محتوا پشتیبانی نمی‌شود"); }
        const ct = res.headers.get("content-type") || "";
        if (!TEXTUAL.test(ct)) { try { await res.body?.cancel(); } catch { /* ignore */ } throw new NewsProxyError(502, "bad_content_type", "نوع محتوای منبع خبر پشتیبانی نمی‌شود"); }
        let text;
        try { text = await readBody(res, ac.signal); }
        catch (e) { if (e instanceof NewsProxyError) throw e; throw ac.signal.aborted ? new NewsProxyError(504, "timeout", "مهلت دریافت فید تمام شد") : new NewsProxyError(502, "fetch_failed", "دریافت فید ممکن نشد"); }
        return { text, contentType: ct.split(";")[0].trim().toLowerCase(), fetchedAt: now() };
      }
      throw new NewsProxyError(502, "too_many_redirects", "ریدایرکت‌های بیش از حد");
    } finally { clearTimeout(tm); ac.abort(); }
  }

  return {
    async get(raw) {
      const { u } = await check0(raw);
      const key = u.toString();
      const hit = cache.get(key); if (hit && now() - hit.fetchedAt < ttlMs) return { ...hit, cached: true };
      if (inflight.has(key)) return inflight.get(key);
      if (active >= maxConcurrent) throw new NewsProxyError(429, "busy", "درخواست‌های هم‌زمان زیاد است؛ کمی بعد دوباره تلاش کنید");
      active++;
      const p = (async () => {
        const r = await fetchOnce(key);
        if (cache.size >= maxCache) cache.delete(cache.keys().next().value);
        cache.set(key, r); return { ...r, cached: false };
      })().finally(() => { active--; inflight.delete(key); });
      inflight.set(key, p); return p;
    },
    _cache: cache,
  };

  // بررسی ارزان (بدون DNS) پیش از کش/ادغام: فقط نحو و فهرست مجاز؛ DNS و IP در fetchOnce
  async function check0(raw) {
    let u; try { u = new URL(String(raw || "")); } catch { throw new NewsProxyError(400, "bad_url", "آدرس نامعتبر است"); }
    if (u.protocol !== "https:") throw new NewsProxyError(400, "bad_url", "فقط https مجاز است");
    if (u.username || u.password) throw new NewsProxyError(400, "bad_url", "آدرس نباید نام‌کاربری/رمز داشته باشد");
    if (u.port && u.port !== "443") throw new NewsProxyError(400, "bad_url", "پورت غیرمجاز");
    if (!allowed.has(u.hostname.toLowerCase())) throw new NewsProxyError(403, "host_not_allowed", "این میزبان در فهرست مجاز خبر نیست (NEWS_FEED_HOSTS)");
    return { u };
  }
}
