// اخبار کافی‌نت — خواندن فید خبر (RSS/Atom/JSON Feed) و در صورت نبودن فید، استخراج سرتیتر از صفحهٔ HTML.
// منطق خالص + کش محلی؛ هیچ داده‌ای از کافی‌نت به بیرون نمی‌رود (فقط یک GET ساده به آدرس فید).
//
// مسیر دریافت (به ترتیب؛ اولین مسیری که خبر برگرداند برنده است):
//   ۱) نسخهٔ دسکتاپ (Electron): پردازش اصلی فید را می‌گیرد — بدون محدودیت CORS؛
//   ۲) سرور کافینو (اگر وصل و وارد شده باشید): /api/news — سرور فید را (با فهرست میزبان‌های مجاز) می‌گیرد و کش می‌کند؛
//   ۳) مستقیم از مرورگر — فقط در نسخهٔ تک‌فایلی (file://) و وقتی سایتِ خبر CORS را مجاز کرده؛ در وب با CSP کافینو غیرفعال است؛
//   ۴) «پراکسی دلخواه» که کاربر در تنظیمات ویجت می‌نویسد (قالب با {url}).
// اگر هیچ‌کدام نشد، آخرین خبرهای ذخیره‌شده (کش) با برچسب «قدیمی» نمایش داده می‌شود.
import { gregorianToJalali } from "../core/jalali.js";
import { JM } from "../core/constants.js";
import { toFA } from "../core/format.js";
import { lsRead, lsWrite } from "./sales.jsx";
import { apiRequest, isApiConnected } from "../../services/api/client.js";

export const NEWS_CFG_KEY = "cafenet_news_cfg";
export const NEWS_CACHE_KEY = "cafenet_news_cache";
export const NEWS_PAGE_URL = "https://onlinecofe.ir/news/";
// آدرس‌های رایج فید وردپرس (بدون تأیید قطعی؛ کاربر می‌تواند آدرس دقیق را در تنظیمات ویجت بنویسد)
export const NEWS_DEFAULT_SOURCES = ["https://onlinecofe.ir/news/feed/", "https://onlinecofe.ir/feed/", NEWS_PAGE_URL];
export const NEWS_DEFAULT_COUNT = 10;
export const NEWS_COUNTS = [5, 10, 15, 20];
export const NEWS_TTL_MS = 20 * 60 * 1000;
const MAX_TEXT = 3 * 1024 * 1024;

export function getNewsConfig() {
  const v = lsRead(NEWS_CFG_KEY, null) || {};
  const count = NEWS_COUNTS.includes(Number(v.count)) ? Number(v.count) : NEWS_DEFAULT_COUNT;
  return { count, feedUrl: typeof v.feedUrl === "string" ? v.feedUrl.trim() : "", proxy: typeof v.proxy === "string" ? v.proxy.trim() : "" };
}
export function saveNewsConfig(cfg) {
  const c = { ...getNewsConfig(), ...cfg };
  const count = NEWS_COUNTS.includes(Number(c.count)) ? Number(c.count) : NEWS_DEFAULT_COUNT;
  const feedUrl = /^https?:\/\//i.test(c.feedUrl || "") ? String(c.feedUrl).trim().slice(0, 500) : "";
  const proxy = /^https?:\/\/.*\{url\}/i.test(c.proxy || "") ? String(c.proxy).trim().slice(0, 500) : "";
  lsWrite(NEWS_CFG_KEY, { count, feedUrl, proxy });
  return { count, feedUrl, proxy };
}

// ── متن/XML ────────────────────────────────────────────────────────────
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", zwnj: "‌" };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; } catch { return m; } }
    const v = ENT[e.toLowerCase()]; return v === undefined ? m : v;
  });
}
const cleanText = (s) => decodeEntities(String(s == null ? "" : s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, x) => x)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function tagText(block, name) {
  const m = block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, "i"));
  return m ? m[1] : null;
}
function blocks(xml, name) {
  const out = []; const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi"); let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function absUrl(href, base) { try { const u = new URL(decodeEntities(String(href).trim()), base || undefined); return /^https?:$/.test(u.protocol) ? u.toString() : ""; } catch { return ""; } }
function parseDate(s) {
  if (!s) return { ts: null, hasTime: false };
  const raw = cleanText(s); if (!raw) return { ts: null, hasTime: false };
  const t = Date.parse(raw);
  return Number.isFinite(t) ? { ts: t, hasTime: !/^\d{4}-\d{2}-\d{2}$/.test(raw) } : { ts: null, hasTime: false };
}

function parseRssAtom(xml, base) {
  const items = [];
  for (const b of [...blocks(xml, "item"), ...blocks(xml, "entry")]) {
    const title = cleanText(tagText(b, "title") || "");
    let link = "";
    const atomLinks = [...b.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
    const alt = atomLinks.find((a) => /href=/i.test(a) && (!/rel=/i.test(a) || /rel=["']alternate["']/i.test(a)));
    if (alt) link = absUrl((alt.match(/href=["']([^"']+)["']/i) || [])[1] || "", base);
    if (!link) link = absUrl(cleanText(tagText(b, "link") || ""), base);
    if (!link) { const g = cleanText(tagText(b, "guid") || ""); if (/^https?:\/\//i.test(g)) link = absUrl(g, base); }
    const d = parseDate(tagText(b, "pubDate") || tagText(b, "dc:date") || tagText(b, "published") || tagText(b, "updated") || tagText(b, "date"));
    if (title) items.push({ title, link, ts: d.ts, hasTime: d.hasTime });
  }
  return items;
}
function parseJsonFeed(text, base) {
  let j; try { j = JSON.parse(text); } catch { return []; }
  const arr = Array.isArray(j && j.items) ? j.items : [];
  return arr.map((x) => { const d = parseDate(x.date_published || x.date_modified); return { title: cleanText(x.title || ""), link: absUrl(x.url || x.external_url || "", base), ts: d.ts, hasTime: d.hasTime }; }).filter((x) => x.title);
}
// فالبک: صفحهٔ HTML فهرست خبر — عنوان‌های لینک‌دار (h1–h4) به‌همراه <time datetime> یا meta انتشار
function parseHtmlNews(html, base) {
  const host = (() => { try { return new URL(base).hostname; } catch { return ""; } })();
  const parts = blocks(html, "article"); const scopes = parts.length ? parts : [html];
  const items = [];
  for (const s of scopes) {
    const re = /<h[1-4][^>]*>\s*<a\b[^>]*?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi; let m;
    while ((m = re.exec(s))) {
      const link = absUrl(m[2], base); const title = cleanText(m[3]);
      if (!link || title.length < 8) continue;
      try { if (host && new URL(link).hostname !== host) continue; } catch { continue; }
      if (parts.length === 0) {
        const near = s.slice(m.index, m.index + 1500);
        const t = near.match(/<time\b[^>]*datetime=(["'])(.*?)\1/i);
        const d = parseDate(t ? t[2] : null); items.push({ title, link, ts: d.ts, hasTime: d.hasTime });
      } else {
        const t = s.match(/<time\b[^>]*datetime=(["'])(.*?)\1/i) || s.match(/property=["']article:published_time["'][^>]*content=(["'])(.*?)\1/i);
        const d = parseDate(t ? t[2] : null); items.push({ title, link, ts: d.ts, hasTime: d.hasTime });
      }
    }
  }
  return items;
}

export function parseFeed(text, baseUrl = "") {
  const s = String(text || "").slice(0, MAX_TEXT).replace(/^﻿/, "").trim();
  if (!s) return [];
  if (s[0] === "{") return parseJsonFeed(s, baseUrl);
  if (/<(rss|feed|rdf:RDF)\b/i.test(s.slice(0, 2000)) || /<item\b|<entry\b/i.test(s)) { const r = parseRssAtom(s, baseUrl); if (r.length) return r; }
  return parseHtmlNews(s, baseUrl);
}

// حذف تکراری (لینک یا عنوان)، مرتب‌سازی از جدید به قدیم (بی‌تاریخ‌ها پس از دارای تاریخ، با همان ترتیب منبع)، سقف تعداد
export function normalizeItems(items, max = NEWS_DEFAULT_COUNT) {
  const seen = new Set(); const out = [];
  (items || []).forEach((it, i) => {
    const key = (it.link || it.title).toLowerCase(); if (seen.has(key) || !it.title) return;
    seen.add(key); out.push({ title: it.title, link: it.link || "", ts: Number.isFinite(it.ts) ? it.ts : null, hasTime: !!it.hasTime, _i: i });
  });
  out.sort((a, b) => (a.ts == null) - (b.ts == null) || (a.ts != null && b.ts != null ? b.ts - a.ts : 0) || a._i - b._i);
  return out.slice(0, Math.max(1, max)).map(({ _i, ...r }) => r);
}

// تاریخ و ساعت به وقت تهران: «۱۵ آبان ۱۴۰۵» و «۱۳:۲۰»
export function formatNewsTime(ts, hasTime = true) {
  if (!Number.isFinite(ts)) return { date: "", time: "", text: "" };
  let p;
  try {
    p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  } catch { const d = new Date(ts); p = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() }; }
  const [jy, jm, jd] = gregorianToJalali(Number(p.year), Number(p.month), Number(p.day));
  const date = `${toFA(jd)} ${JM[jm - 1]} ${toFA(jy)}`;
  const time = hasTime ? toFA(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`) : "";
  return { date, time, text: time ? `${time} · ${date}` : date };
}

// آخرین خبرهای ذخیره‌شده (هم‌زمان؛ برای حالت کاشی داشبورد)
export function getCachedNews(max = NEWS_DEFAULT_COUNT) { const c = lsRead(NEWS_CACHE_KEY, null); return c && Array.isArray(c.items) ? normalizeItems(c.items, max) : []; }

// ── دریافت ─────────────────────────────────────────────────────────────
async function withTimeout(fn, ms = 9000) {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const tm = setTimeout(() => ac && ac.abort(), ms);
  try { return await fn(ac ? ac.signal : undefined); } finally { clearTimeout(tm); }
}
const textOf = async (res) => { if (!res || !res.ok) return ""; const t = await res.text(); return t.length > MAX_TEXT ? "" : t; };

// هر مسیر: (url) → متن یا "" ؛ خطا = رد شدن به مسیر بعدی
export function defaultTransports(cfg, env = {}) {
  const win = env.window !== undefined ? env.window : (typeof window !== "undefined" ? window : undefined);
  const fetchImpl = env.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  const list = [];
  const native = win && win.cafenetNative && win.cafenetNative.fetch;
  if (native) list.push(["desktop", async (url) => { const r = await native(url, { method: "GET", headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8" } }); return r && r.ok && typeof r.text === "string" ? r.text.slice(0, MAX_TEXT) : ""; }]);
  const connected = env.isApiConnected || isApiConnected; const request = env.apiRequest || apiRequest;
  list.push(["server", async (url) => { if (!connected()) return ""; const r = await request(`/api/news?url=${encodeURIComponent(url)}`); const d = (r && r.data) || r; return d && typeof d.text === "string" ? d.text : ""; }]);
  // اتصال مستقیم مرورگر به سایت دیگر زیر CSP سخت‌گیر کافینو (connect-src 'self') ممنوع است و بدون CORS هم شکست می‌خورد؛
  // پس فقط در نسخهٔ تک‌فایلی (file://) آزمایش می‌شود تا در نسخهٔ وب خطای CSP و درخواست بیهوده نداشته باشیم.
  const loc = env.location !== undefined ? env.location : (typeof location !== "undefined" ? location : null);
  const allowDirect = env.allowDirect !== undefined ? env.allowDirect : !!(loc && loc.protocol === "file:");
  if (fetchImpl && allowDirect) list.push(["direct", (url) => withTimeout(async (signal) => textOf(await fetchImpl(url, { signal, credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5" } })))]);
  if (fetchImpl && cfg.proxy) list.push(["proxy", (url) => withTimeout(async (signal) => textOf(await fetchImpl(cfg.proxy.replace("{url}", encodeURIComponent(url)), { signal, credentials: "omit", referrerPolicy: "no-referrer" })))]);
  return list;
}

const readCache = () => { const c = lsRead(NEWS_CACHE_KEY, null); return c && Array.isArray(c.items) ? c : null; };

// خروجی: {items, at, source, stale, error, fromCache}. force=true کش تازه را هم نادیده می‌گیرد.
export async function loadNews({ force = false, now = Date.now(), cfg = getNewsConfig(), transports, max } = {}) {
  const limit = max || cfg.count;
  const cache = readCache();
  const sourcesKey = cfg.feedUrl || "default";
  if (!force && cache && cache.key === sourcesKey && now - cache.at < NEWS_TTL_MS && cache.items.length) {
    return { items: normalizeItems(cache.items, limit), at: cache.at, source: cache.source, stale: false, fromCache: true, error: "" };
  }
  const tr = transports || defaultTransports(cfg);
  const urls = cfg.feedUrl ? [cfg.feedUrl] : NEWS_DEFAULT_SOURCES;
  let lastErr = "";
  for (const url of urls) {
    for (const [name, fn] of tr) {
      try {
        const text = await fn(url);
        if (!text) continue;
        const items = normalizeItems(parseFeed(text, url), 20);
        if (items.length) {
          lsWrite(NEWS_CACHE_KEY, { at: now, key: sourcesKey, source: url, items });
          return { items: items.slice(0, limit), at: now, source: url, via: name, stale: false, fromCache: false, error: "" };
        }
      } catch (e) { lastErr = String((e && e.message) || e).slice(0, 160); }
    }
  }
  if (cache && cache.items.length) return { items: normalizeItems(cache.items, limit), at: cache.at, source: cache.source, stale: true, fromCache: true, error: lastErr || "دریافت خبر ممکن نشد" };
  return { items: [], at: 0, source: "", stale: false, fromCache: false, error: lastErr || "دریافت خبر ممکن نشد" };
}
