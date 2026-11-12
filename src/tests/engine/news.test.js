// ویجت «اخبار کافی‌نت» — منطق واقعی: تجزیهٔ RSS/Atom/JSON/HTML، مرتب‌سازی، سقف ۱۰ خبر، زمان تهران، کش و مسیرهای دریافت
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const NOW = Date.parse("2026-11-06T09:00:00Z");

const rssItem = (i, extra = "") => `<item><title><![CDATA[خبر شمارهٔ ${i} &amp; کافی‌نت]]></title><link>https://onlinecofe.ir/news/${i}/</link><pubDate>${new Date(Date.UTC(2026, 10, 5, 12, 0) - i * 3600e3).toUTCString()}</pubDate>${extra}</item>`;
const rss = (n) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>x</title><link>https://onlinecofe.ir</link>${Array.from({ length: n }, (_, i) => rssItem(i + 1)).join("")}</channel></rss>`;

test("RSS: CDATA و موجودیت‌ها، لینک، تاریخ؛ مرتب از جدید به قدیم", () => {
  const items = E.normalizeItems(E.parseFeed(rss(3), "https://onlinecofe.ir/feed/"), 10);
  assert.equal(items.length, 3);
  assert.equal(items[0].title, "خبر شمارهٔ 1 & کافی‌نت");
  assert.equal(items[0].link, "https://onlinecofe.ir/news/1/");
  assert.ok(items[0].ts > items[1].ts && items[1].ts > items[2].ts);
  assert.equal(items[0].hasTime, true);
});
test("پیش‌فرض ۱۰ خبر؛ تنظیم تعداد و حذف تکراری‌ها", () => {
  assert.equal(E.NEWS_DEFAULT_COUNT, 10);
  assert.equal(E.normalizeItems(E.parseFeed(rss(25))).length, 10);
  assert.equal(E.normalizeItems(E.parseFeed(rss(25)), 5).length, 5);
  const dup = rss(3).replace("</channel>", rssItem(1) + "</channel>");
  assert.equal(E.normalizeItems(E.parseFeed(dup), 20).length, 3, "همان لینک دوباره نمی‌آید");
});
test("RSS قدیمی: dc:date و عنوان با تگ HTML و لینک نسبی", () => {
  const x = `<rss><channel><item><title>&lt;b&gt;تعرفهٔ جدید&lt;/b&gt; اینترنت</title><link>/news/9</link><dc:date>2026-11-05T08:30:00+03:30</dc:date></item></channel></rss>`;
  const [a] = E.parseFeed(x, "https://onlinecofe.ir/feed/");
  assert.equal(a.title, "تعرفهٔ جدید اینترنت"); assert.equal(a.link, "https://onlinecofe.ir/news/9"); assert.equal(a.ts, Date.parse("2026-11-05T08:30:00+03:30"));
});
test("Atom: لینک alternate و published/updated", () => {
  const x = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>خبر اتم</title><link rel="self" href="https://x.ir/self"/><link rel="alternate" href="https://x.ir/a"/><updated>2026-11-05T10:00:00Z</updated></entry><entry><title type="html">دوم</title><link href="https://x.ir/b"/><published>2026-11-05T11:00:00Z</published></entry></feed>`;
  const items = E.normalizeItems(E.parseFeed(x, "https://x.ir/"), 10);
  assert.deepEqual(items.map((i) => i.link), ["https://x.ir/b", "https://x.ir/a"]);
});
test("JSON Feed و HTML فالبک (عنوان لینک‌دار + time)", () => {
  const j = JSON.stringify({ version: "https://jsonfeed.org/version/1.1", items: [{ title: "خبر جی‌سون", url: "https://x.ir/j", date_published: "2026-11-05T10:00:00Z" }] });
  assert.equal(E.parseFeed(j, "https://x.ir/")[0].title, "خبر جی‌سون");
  const h = `<html><body><nav><a href="/">خانه</a></nav><article><h2><a href="/news/1/">افزایش قیمت پهنای باند کافی‌نت‌ها</a></h2><time datetime="2026-11-05T09:15:00+03:30"></time></article><article><h3><a href="https://other.com/x">لینک بیرونی طولانی خبر</a></h3></article></body></html>`;
  const hi = E.parseFeed(h, "https://onlinecofe.ir/news/");
  assert.equal(hi.length, 1, "لینک بیرونی و منوی کوتاه حذف می‌شود");
  assert.equal(hi[0].link, "https://onlinecofe.ir/news/1/"); assert.equal(hi[0].ts, Date.parse("2026-11-05T09:15:00+03:30"));
});
test("ورودی خراب/خالی/خطرناک: خروجی خالی و بدون پرتاب خطا؛ لینک javascript: حذف", () => {
  for (const bad of ["", "   ", "<html></html>", "{", "null", "<rss><channel><item><title></title></item></channel></rss>", null, undefined]) assert.deepEqual(E.parseFeed(bad, "https://x.ir/"), []);
  const [i] = E.parseFeed(`<rss><channel><item><title>عنوان خطرناک</title><link>javascript:alert(1)</link></item></channel></rss>`, "https://x.ir/");
  assert.equal(i.link, "", "فقط http/https");
});
test("زمان و تاریخ به وقت تهران و شمسی", () => {
  const t = Date.parse("2026-11-05T09:50:00Z");           // ۱۳:۲۰ تهران (UTC+3:30) — ۱۴ آبان ۱۴۰۵
  const f = E.formatNewsTime(t, true);
  assert.equal(f.time, "۱۳:۲۰"); assert.equal(f.date, "۱۴ آبان ۱۴۰۵"); assert.equal(f.text, "۱۳:۲۰ · ۱۴ آبان ۱۴۰۵");
  assert.equal(E.formatNewsTime(t, false).text, "۱۴ آبان ۱۴۰۵", "بدون ساعت در منبع ← فقط تاریخ");
  assert.equal(E.formatNewsTime(NaN).text, "");
  assert.equal(E.formatNewsTime(Date.parse("2026-03-20T21:00:00Z"), true).date, "۱ فروردین ۱۴۰۵", "مرز سال (۰۰:۳۰ تهران) درست است");
});
test("تنظیمات ویجت: پیش‌فرض، اعتبارسنجی تعداد/آدرس/پراکسی", () => {
  assert.deepEqual(E.getNewsConfig(), { count: 10, feedUrl: "", proxy: "" });
  assert.equal(E.saveNewsConfig({ count: 7 }).count, 10, "تعداد نامجاز ← پیش‌فرض");
  assert.equal(E.saveNewsConfig({ count: 15, feedUrl: "javascript:x", proxy: "https://p.ir/?u=" }).feedUrl, "");
  const c = E.saveNewsConfig({ count: 15, feedUrl: "https://x.ir/feed", proxy: "https://p.ir/?url={url}" });
  assert.deepEqual(E.getNewsConfig(), c); assert.equal(c.count, 15);
});
test("loadNews: اولین مسیرِ موفق؛ کش تازه دوباره نمی‌گیرد؛ force می‌گیرد", async () => {
  let n = 0; const tr = [["desktop", async () => { n++; return rss(12); }]];
  const a = await E.loadNews({ now: NOW, transports: tr });
  assert.equal(a.items.length, 10); assert.equal(a.via, "desktop"); assert.equal(a.stale, false); assert.equal(n, 1);
  const b = await E.loadNews({ now: NOW + 60e3, transports: tr }); assert.equal(b.fromCache, true); assert.equal(n, 1);
  await E.loadNews({ now: NOW + 60e3, transports: tr, force: true }); assert.equal(n, 2);
  await E.loadNews({ now: NOW + 60e3 + E.NEWS_TTL_MS + 1, transports: tr }); assert.equal(n, 3, "کش منقضی");
  assert.equal(E.getCachedNews(3).length, 3);
});
test("loadNews: مسیرها به‌ترتیب؛ خطا/متن خالی/بدون خبر ← مسیر بعدی؛ آدرس بعدی فید", async () => {
  const calls = [];
  const tr = [["server", async (u) => { calls.push("server:" + u); throw new Error("CORS"); }], ["direct", async (u) => { calls.push("direct:" + u); return u.includes("/news/feed/") ? "<html>نه فید</html>" : u === E.NEWS_DEFAULT_SOURCES[1] ? rss(2) : ""; }]];
  const r = await E.loadNews({ now: NOW, transports: tr });
  assert.equal(r.items.length, 2); assert.equal(r.source, E.NEWS_DEFAULT_SOURCES[1]); assert.equal(r.via, "direct");
  assert.equal(calls[0], "server:" + E.NEWS_DEFAULT_SOURCES[0]);
});
test("آدرس فید سفارشی فقط همان را می‌خواند و کش جدا دارد", async () => {
  const seen = []; const tr = [["direct", async (u) => { seen.push(u); return rss(2); }]];
  await E.loadNews({ now: NOW, transports: tr });
  await E.loadNews({ now: NOW + 1, transports: tr, cfg: { count: 10, feedUrl: "https://x.ir/f", proxy: "" } });
  assert.deepEqual(seen, [E.NEWS_DEFAULT_SOURCES[0], "https://x.ir/f"], "کش پیش‌فرض برای فید سفارشی استفاده نمی‌شود");
});
test("اتصال قطع: آخرین کش با برچسب قدیمی؛ بدون کش: خطا و فهرست خالی", async () => {
  const none = await E.loadNews({ now: NOW, transports: [["direct", async () => { throw new Error("offline"); }]] });
  assert.deepEqual([none.items.length, none.error !== ""], [0, true]);
  await E.loadNews({ now: NOW, transports: [["direct", async () => rss(4)]] });
  const old = await E.loadNews({ now: NOW + E.NEWS_TTL_MS * 3, transports: [["direct", async () => { throw new Error("offline"); }]] });
  assert.equal(old.items.length, 4); assert.equal(old.stale, true); assert.match(old.error, /offline/);
});
test("مسیرهای پیش‌فرض: دسکتاپ ← سرور ← مستقیم ← پراکسی؛ سرور فقط وقتی وصل است", async () => {
  const env = { allowDirect: true, window: { cafenetNative: { fetch: async () => ({ ok: true, text: "<rss/>" }) } }, fetchImpl: async () => ({ ok: true, text: async () => "x" }), isApiConnected: () => false, apiRequest: async () => ({}) };
  assert.deepEqual(E.defaultTransports({ proxy: "https://p.ir/?url={url}" }, env).map((t) => t[0]), ["desktop", "server", "direct", "proxy"]);
  assert.deepEqual(E.defaultTransports({ proxy: "" }, { ...env, window: {} }).map((t) => t[0]), ["server", "direct"]);
  assert.deepEqual(E.defaultTransports({ proxy: "" }, { ...env, window: {}, allowDirect: undefined, location: { protocol: "https:", hostname: "cafe.example.ir" } }).map((t) => t[0]), ["server"], "وب با CSP: فقط سرور");
  assert.deepEqual(E.defaultTransports({ proxy: "" }, { ...env, window: {}, allowDirect: undefined, location: { protocol: "http:", hostname: "localhost" } }).map((t) => t[0]), ["server"], "localhost هم زیر CSP است");
  assert.deepEqual(E.defaultTransports({ proxy: "" }, { ...env, window: {}, allowDirect: undefined, location: { protocol: "file:", hostname: "" } }).map((t) => t[0]), ["server", "direct"], "تک‌فایلی");
  const asked = []; const t2 = E.defaultTransports({ proxy: "" }, { ...env, window: {}, isApiConnected: () => true, apiRequest: async (p) => { asked.push(p); return { data: { text: "<rss>ok</rss>" } }; } });
  assert.equal(await t2[0][1]("https://onlinecofe.ir/feed/"), "<rss>ok</rss>"); assert.match(asked[0], /^\/api\/news\?url=https%3A%2F%2Fonlinecofe\.ir%2Ffeed%2F$/);
  assert.equal(await E.defaultTransports({}, env)[1][1]("https://x"), "", "سرور وصل نیست ← رد می‌شود");
  const prox = []; const t3 = E.defaultTransports({ proxy: "https://p.ir/?url={url}" }, { ...env, window: {}, fetchImpl: async (u) => { prox.push(u); return { ok: true, text: async () => "T" }; } });
  assert.equal(await t3[2][1]("https://onlinecofe.ir/feed/"), "T"); assert.equal(prox[0], "https://p.ir/?url=https%3A%2F%2Fonlinecofe.ir%2Ffeed%2F");
});
