import test from "node:test";
import assert from "node:assert/strict";
import { createNewsProxy, isPublicIp, NewsProxyError } from "../src/lib/newsProxy.js";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>خبر</title><link>https://onlinecofe.ir/a</link></item></channel></rss>`;
const res = (body, { status = 200, ct = "application/rss+xml; charset=UTF-8", headers = {} } = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({ "content-type": ct, ...headers }), text: async () => body, body: null });
const pub = async () => [{ address: "93.184.216.34" }];
const mk = (over = {}) => createNewsProxy({ hosts: ["onlinecofe.ir"], lookup: pub, transport: async () => res(RSS), ...over });
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof NewsProxyError && e.code === code, code);

test("isPublicIp: private/loopback/metadata are rejected, public accepted", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.1.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "2001:db8::1", "not-an-ip"]) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(isPublicIp(ip), true, ip);
});
test("fetches an allowed https feed and caches it", async () => {
  let calls = 0; const p = mk({ transport: async () => { calls++; return res(RSS); } });
  const a = await p.get("https://onlinecofe.ir/news/feed/"); assert.match(a.text, /<item>/); assert.equal(a.cached, false); assert.equal(a.contentType, "application/rss+xml");
  const b = await p.get("https://onlinecofe.ir/news/feed/"); assert.equal(b.cached, true); assert.equal(calls, 1);
});
test("cache expires after ttl", async () => {
  let t = 1000, calls = 0; const p = mk({ now: () => t, ttlMs: 500, transport: async () => { calls++; return res(RSS); } });
  await p.get("https://onlinecofe.ir/f"); t += 400; await p.get("https://onlinecofe.ir/f"); assert.equal(calls, 1); t += 200; await p.get("https://onlinecofe.ir/f"); assert.equal(calls, 2);
});
test("concurrent requests share one upstream call", async () => {
  let calls = 0; const p = mk({ transport: async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return res(RSS); } });
  await Promise.all([p.get("https://onlinecofe.ir/x"), p.get("https://onlinecofe.ir/x"), p.get("https://onlinecofe.ir/x")]); assert.equal(calls, 1);
});
test("rejects non-https, credentials, odd ports, unlisted hosts, bad urls", async () => {
  const p = mk();
  await rejects(p.get("http://onlinecofe.ir/feed"), "bad_url");
  await rejects(p.get("https://user:pw@onlinecofe.ir/feed"), "bad_url");
  await rejects(p.get("https://onlinecofe.ir:8443/feed"), "bad_url");
  await rejects(p.get("not a url"), "bad_url");
  await rejects(p.get("https://evil.example/feed"), "host_not_allowed");
  await rejects(p.get("https://onlinecofe.ir.evil.example/feed"), "host_not_allowed");
  await rejects(p.get("https://127.0.0.1/feed"), "host_not_allowed");
});
test("allowed host resolving to a private address (DNS rebinding) is rejected", async () => {
  await rejects(mk({ lookup: async () => [{ address: "169.254.169.254" }] }).get("https://onlinecofe.ir/f"), "host_not_public");
  await rejects(mk({ lookup: async () => [{ address: "93.184.216.34" }, { address: "10.0.0.1" }] }).get("https://onlinecofe.ir/f"), "host_not_public");
});
test("redirects: followed inside the allowlist, refused outside, capped at 3", async () => {
  let n = 0; const ok = mk({ transport: async (u) => (n++ === 0 ? res("", { status: 301, headers: { location: "/news/feed/" } }) : res(RSS)) });
  assert.match((await ok.get("https://onlinecofe.ir/feed")).text, /<item>/);
  await rejects(mk({ transport: async () => res("", { status: 302, headers: { location: "https://evil.example/x" } }) }).get("https://onlinecofe.ir/f"), "host_not_allowed");
  await rejects(mk({ transport: async () => res("", { status: 302, headers: { location: "http://onlinecofe.ir/f" } }) }).get("https://onlinecofe.ir/f"), "bad_url");
  await rejects(mk({ transport: async () => res("", { status: 302, headers: { location: "/loop" } }) }).get("https://onlinecofe.ir/f"), "too_many_redirects");
});
test("upstream errors, binary content and oversize bodies are refused", async () => {
  await rejects(mk({ transport: async () => res("x", { status: 500 }) }).get("https://onlinecofe.ir/f"), "upstream_status");
  await rejects(mk({ transport: async () => res("x", { ct: "application/octet-stream" }) }).get("https://onlinecofe.ir/f"), "bad_content_type");
  await rejects(mk({ transport: async () => res("x", { ct: "image/png" }) }).get("https://onlinecofe.ir/f"), "bad_content_type");
  await rejects(mk({ maxBytes: 10, transport: async () => res("y".repeat(50)) }).get("https://onlinecofe.ir/f"), "too_large");
  await rejects(mk({ transport: async () => { throw new Error("ECONNRESET"); } }).get("https://onlinecofe.ir/f"), "fetch_failed");
});

// ───────────────────────── امنیت: آدرس‌های مبهم، DNS Pinning، rebinding و ریدایرکت ─────────────────────────
import fs from "node:fs";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { parseIp } from "../src/lib/ipClass.js";
import { pinnedHttpsTransport, pinnedLookup } from "../src/lib/newsProxy.js";
const fx = (n) => fs.readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)));

test("isPublicIp: ambiguous/embedded/transition/reserved forms are all rejected (fail-closed)", () => {
  const bad = [
    // IPv4
    "0.0.0.0", "0.1.2.3", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.0.1",
    "192.0.0.1", "192.0.2.5", "192.88.99.1", "192.168.0.1", "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.1.1.1", "240.0.0.1", "255.255.255.255",
    // IPv4 غیراستاندارد/مبهم (octal/hex/short/decimal) و متن نامعتبر
    "0177.0.0.1", "0x7f.0.0.1", "127.1", "2130706433", "1.2.3", "1.2.3.4.5", "256.1.1.1", "", " ", "abc", "1.2.3.4/8", "93.184.216.34%eth0", "fe80::1%eth0", "[::1", "::g",
    // IPv6 محلی/رزرو
    "::", "::1", "fe80::1", "febf::1", "fec0::1", "fc00::1", "fd12:3456::1", "ff02::1", "100::1", "2001:db8::1", "2001:0db8:85a3::8a2e:370:7334", "2001::1", "2001:10::1", "3fff::1", "4000::1", "64:ff9b:1::1",
    // mapped / compat / SIIT با IPv4 غیرعمومی (چند شکل نوشتاری)
    "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:0001", "0:0:0:0:0:ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:10.0.0.1", "::ffff:0a00:0001", "::ffff:c0a8:1", "::ffff:0.0.0.0", "::127.0.0.1", "::10.0.0.1", "::a9fe:a9fe",
    "::ffff:0:7f00:1", "::ffff:0:10.0.0.1",
    // NAT64 با IPv4 غیرعمومی
    "64:ff9b::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "64:ff9b::10.0.0.1", "64:ff9b::c0a8:0101", "64:ff9b::ac10:1",
    // 6to4 با IPv4 غیرعمومی (2002:AABB:CCDD::)
    "2002:7f00:1::", "2002:7f00:0001::1", "2002:a9fe:a9fe::", "2002:0a00:0001::", "2002:c0a8:0101::5", "2002:ac10:0001::", "2002:6440:0001::", "2002:0000:0000::",
  ];
  for (const ip of bad) assert.equal(isPublicIp(ip), false, `باید رد شود: ${JSON.stringify(ip)}`);
  const good = ["93.184.216.34", "8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "100.63.255.255", "100.128.0.1", "198.17.0.1", "198.20.0.1", "2606:4700::1111", "2a00:1450:4001::200e", "2001:4860:4860::8888", "[2606:4700::1111]",
    "::ffff:93.184.216.34", "64:ff9b::5db8:d822", "2002:5db8:d822::1"];
  for (const ip of good) assert.equal(isPublicIp(ip), true, `باید پذیرفته شود: ${ip}`);
});

test("parseIp: canonical bytes, rejects zone-ids and non-canonical v4", () => {
  assert.deepEqual(parseIp("1.2.3.4").b, [1, 2, 3, 4]);
  assert.deepEqual(parseIp("::ffff:1.2.3.4").b.slice(12), [1, 2, 3, 4]);
  assert.equal(parseIp("fe80::1%1"), null); assert.equal(parseIp("0x7f.1"), null); assert.equal(parseIp("1:2:3:4:5:6:7:8:9"), null);
});

test("pinning: the transport receives exactly the validated addresses (single resolution, no second lookup)", async () => {
  let lookups = 0, seen = null;
  const p = createNewsProxy({ hosts: ["onlinecofe.ir"], lookup: async () => { lookups++; return [{ address: "93.184.216.34" }, { address: "2606:4700::1111" }]; }, transport: async (u, o) => { seen = o; return res(RSS); } });
  await p.get("https://onlinecofe.ir/feed");
  assert.deepEqual(seen.addrs, ["93.184.216.34", "2606:4700::1111"]); assert.equal(lookups, 1);
  assert.equal(seen.headers["accept-encoding"], "identity");
});

test("DNS rebinding: public at first resolution, private at the next hop → refused; the pinned list never mixes hops", async () => {
  let n = 0; const addrsSeen = [];
  const lookup = async () => (n++ === 0 ? [{ address: "93.184.216.34" }] : [{ address: "169.254.169.254" }]);
  const p = createNewsProxy({ hosts: ["onlinecofe.ir"], lookup, transport: async (u, o) => { addrsSeen.push(o.addrs); return res("", { status: 302, headers: { location: "/next" } }); } });
  await rejects(p.get("https://onlinecofe.ir/f"), "host_not_public");
  assert.equal(addrsSeen.length, 1); assert.deepEqual(addrsSeen[0], ["93.184.216.34"]);
});

test("redirect hops are re-resolved and re-pinned; a redirect to an IP literal / metadata host / other scheme is refused", async () => {
  const pins = []; let calls = 0;
  const lookup = async () => [{ address: calls < 1 ? "93.184.216.34" : "8.8.8.8" }];
  const ok = createNewsProxy({ hosts: ["onlinecofe.ir", "www.onlinecofe.ir"], lookup, transport: async (u, o) => { pins.push([u, o.addrs[0]]); return calls++ === 0 ? res("", { status: 301, headers: { location: "https://www.onlinecofe.ir/feed" } }) : res(RSS); } });
  assert.match((await ok.get("https://onlinecofe.ir/feed")).text, /<item>/);
  assert.deepEqual(pins, [["https://onlinecofe.ir/feed", "93.184.216.34"], ["https://www.onlinecofe.ir/feed", "8.8.8.8"]]);
  for (const loc of ["https://169.254.169.254/latest/meta-data/", "https://127.0.0.1/", "https://[::1]/", "https://[::ffff:a9fe:a9fe]/", "https://2130706433/", "ftp://onlinecofe.ir/x", "https://user@onlinecofe.ir/x", "https://onlinecofe.ir:444/x", "http://onlinecofe.ir/x"]) {
    await assert.rejects(mk({ transport: async () => res("", { status: 302, headers: { location: loc } }) }).get("https://onlinecofe.ir/f"), (e) => e instanceof NewsProxyError, loc);
  }
  await rejects(mk({ transport: async () => res("", { status: 302 }) }).get("https://onlinecofe.ir/f"), "bad_redirect");
});

test("DNS failure, empty answer and mixed public/private answers are refused", async () => {
  await rejects(mk({ lookup: async () => { throw new Error("ENOTFOUND"); } }).get("https://onlinecofe.ir/f"), "dns_failed");
  await rejects(mk({ lookup: async () => [] }).get("https://onlinecofe.ir/f"), "dns_failed");
  for (const bad of ["::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "fe80::1", "0177.0.0.1"])
    await rejects(mk({ lookup: async () => [{ address: "93.184.216.34" }, { address: bad }] }).get("https://onlinecofe.ir/f"), "host_not_public");
});

test("limits: content-encoding, content-length, streaming size, total timeout, concurrency", async () => {
  await rejects(mk({ transport: async () => res("x", { headers: { "content-encoding": "gzip" } }) }).get("https://onlinecofe.ir/f"), "bad_encoding");
  await rejects(mk({ maxBytes: 100, transport: async () => res("x", { headers: { "content-length": "5000" } }) }).get("https://onlinecofe.ir/f"), "too_large");
  // بدنهٔ جریانی که هرگز تمام نمی‌شود → سقف حجم
  const endless = () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024)); } }), { status: 200, headers: { "content-type": "application/rss+xml" } });
  await rejects(mk({ maxBytes: 4096, transport: async () => endless() }).get("https://onlinecofe.ir/f"), "too_large");
  // بدنه‌ای که کند می‌رسد → مهلت کل
  const slow = (_u, { signal }) => new Response(new ReadableStream({ start(c) { signal.addEventListener("abort", () => c.error(new Error("aborted"))); } }), { status: 200, headers: { "content-type": "application/rss+xml" } });
  const t0 = Date.now(); await rejects(mk({ timeoutMs: 150, transport: slow }).get("https://onlinecofe.ir/f"), "timeout"); assert.ok(Date.now() - t0 < 2000);
  // سقف هم‌زمانی: نشانی‌های متفاوت (ادغام نمی‌شوند) بیش از maxConcurrent → 429
  let release; const gate = new Promise((r) => { release = r; });
  const p = mk({ maxConcurrent: 2, transport: async () => { await gate; return res(RSS); } });
  const all = [p.get("https://onlinecofe.ir/a"), p.get("https://onlinecofe.ir/b")];
  await new Promise((r) => setTimeout(r, 20));
  await rejects(p.get("https://onlinecofe.ir/c"), "busy"); release(); await Promise.all(all);
});

test("real pinned HTTPS transport: connects only to the pinned IP, sends SNI + validates the certificate for the hostname", async () => {
  let sni = null, hostHdr = null;
  const srv = https.createServer({ key: fx("feed.key"), cert: fx("feed.crt"), SNICallback: (name, cb) => { sni = name; cb(null, undefined); } }, (req, rs) => { hostHdr = req.headers.host; rs.writeHead(200, { "content-type": "application/rss+xml" }); rs.end(RSS); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const port = srv.address().port;
  try {
    // «onlinecofe.ir» در DNS به 127.0.0.1 اشاره نمی‌کند؛ اتصال فقط به‌خاطر Pin به آنجا می‌رود (یعنی resolve دوباره‌ای انجام نمی‌شود)
    const r = await pinnedHttpsTransport("https://onlinecofe.ir/feed", { addrs: ["127.0.0.1"], port, tls: { ca: fx("feed.crt") }, headers: { host: "onlinecofe.ir", accept: "*/*" }, signal: AbortSignal.timeout(5000) });
    assert.equal(r.status, 200); assert.match(await r.text(), /<item>/); assert.equal(sni, "onlinecofe.ir"); assert.equal(hostHdr, "onlinecofe.ir");
    // گواهی نامعتبر (CA ناشناخته) → رد
    await assert.rejects(pinnedHttpsTransport("https://onlinecofe.ir/feed", { addrs: ["127.0.0.1"], port, headers: {}, signal: AbortSignal.timeout(5000) }));
    // گواهی برای نام دیگر → رد
    await assert.rejects(pinnedHttpsTransport("https://other.example/feed", { addrs: ["127.0.0.1"], port, tls: { ca: fx("feed.crt") }, headers: {}, signal: AbortSignal.timeout(5000) }));
  } finally { await new Promise((r) => srv.close(r)); }
});

test("real pinned transport: redirect is returned (not followed) so the proxy can re-validate it", async () => {
  const srv = https.createServer({ key: fx("feed.key"), cert: fx("feed.crt") }, (req, rs) => { rs.writeHead(302, { location: "https://169.254.169.254/x" }); rs.end(); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const port = srv.address().port;
  try {
    const r = await pinnedHttpsTransport("https://onlinecofe.ir/f", { addrs: ["127.0.0.1"], port, tls: { ca: fx("feed.crt") }, headers: {}, signal: AbortSignal.timeout(5000) });
    assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "https://169.254.169.254/x");
  } finally { await new Promise((r) => srv.close(r)); }
});

test("pinnedLookup supports both callback shapes and keeps the verified order", async () => {
  const lk = pinnedLookup(["93.184.216.34", "2606:4700::1111"]);
  await new Promise((r) => lk("x", { all: true }, (e, l) => { assert.deepEqual(l.map((x) => x.address), ["93.184.216.34", "2606:4700::1111"]); r(); }));
  await new Promise((r) => lk("x", {}, (e, a, f) => { assert.equal(a, "93.184.216.34"); assert.equal(f, 4); r(); }));
  await new Promise((r) => lk("x", { family: 6 }, (e, a, f) => { assert.equal(a, "2606:4700::1111"); assert.equal(f, 6); r(); }));
});
