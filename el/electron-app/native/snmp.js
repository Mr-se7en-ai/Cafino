// خواندن کنتور واقعی پرینتر با SNMP v1/v2c (فقط GET یک OID) — بدون وابستگی.
// OID استاندارد کنتور عمر پرینتر: prtMarkerLifeCount = 1.3.6.1.2.1.43.10.2.1.4.1.1  (بسیاری از پرینترهای شبکه‌ای پاسخ می‌دهند؛ مدل‌های USB یا غیرفعال‌شده نه)
"use strict";
const dgram = require("dgram");
const net = require("net");

const OID_LIFE_COUNT = "1.3.6.1.2.1.43.10.2.1.4.1.1";

function encLen(n) { if (n < 128) return Buffer.from([n]); const b = []; while (n > 0) { b.unshift(n & 255); n >>= 8; } return Buffer.from([0x80 | b.length, ...b]); }
const tlv = (tag, content) => Buffer.concat([Buffer.from([tag]), encLen(content.length), content]);
function encInt(v) { const b = []; let n = v; do { b.unshift(n & 255); n = Math.floor(n / 256); } while (n > 0); if (b[0] & 0x80) b.unshift(0); return tlv(0x02, Buffer.from(b)); }
function encOid(oid) {
  const p = oid.split(".").map(Number);
  const out = [p[0] * 40 + p[1]];
  for (const n of p.slice(2)) { const parts = [n & 127]; let x = n >> 7; while (x > 0) { parts.unshift((x & 127) | 128); x >>= 7; } out.push(...parts); }
  return tlv(0x06, Buffer.from(out));
}
function buildGet({ community = "public", oid = OID_LIFE_COUNT, requestId = 1, version = 1 } = {}) {
  const vb = tlv(0x30, Buffer.concat([encOid(oid), Buffer.from([0x05, 0x00])]));
  const pdu = tlv(0xa0, Buffer.concat([encInt(requestId), encInt(0), encInt(0), tlv(0x30, vb)]));
  return tlv(0x30, Buffer.concat([encInt(version), tlv(0x04, Buffer.from(community)), pdu]));
}
function readTlv(buf, pos) {
  const tag = buf[pos]; let len = buf[pos + 1]; let off = pos + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[off + i]; off += n; }
  if (off + len > buf.length) throw new Error("پاسخ SNMP ناقص است");
  return { tag, start: off, end: off + len };
}
// خروجی: { requestId, errorStatus, value } ؛ value عدد صحیح برای Integer/Counter/Gauge
function parseResponse(buf) {
  const msg = readTlv(buf, 0); if (msg.tag !== 0x30) throw new Error("پاسخ SNMP معتبر نیست");
  let p = msg.start; const ver = readTlv(buf, p); p = ver.end; const com = readTlv(buf, p); p = com.end;
  const pdu = readTlv(buf, p); if (pdu.tag !== 0xa2) throw new Error("پاسخ SNMP از نوع GetResponse نیست");
  let q = pdu.start; const rid = readTlv(buf, q); q = rid.end; const err = readTlv(buf, q); q = err.end; const eidx = readTlv(buf, q); q = eidx.end;
  const num = (t) => { let n = 0; for (let i = t.start; i < t.end; i++) n = n * 256 + buf[i]; return n; };
  const errorStatus = num(err);
  const vbl = readTlv(buf, q); const vb = readTlv(buf, vbl.start); const oidT = readTlv(buf, vb.start); const val = readTlv(buf, oidT.end);
  if (![0x02, 0x41, 0x42, 0x43, 0x46].includes(val.tag)) return { requestId: num(rid), errorStatus: errorStatus || 5, value: null };
  return { requestId: num(rid), errorStatus, value: num(val) };
}
// فقط IP خصوصی شبکهٔ محلی (۱۰/۸، ۱۷۲.۱۶/۱۲، ۱۹۲.۱۶۸/۱۶). loopback و link-local (شامل metadata ابر) عمداً مجاز نیستند.
function isPrivateHost(h) {
  if (!net.isIPv4(h)) return false;
  const [a, b] = h.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function snmpGet(host, opts = {}) {
  const { community = "public", oid = OID_LIFE_COUNT, timeout = 2500, port = 161, socketFactory, _allowLoopbackForTests = false } = opts;   // گزینه‌ها فقط از کد پردازش اصلی می‌آیند، نه رندرر
  return new Promise((resolve, reject) => {
    if (!(isPrivateHost(host) || (_allowLoopbackForTests && host === "127.0.0.1"))) return reject(new Error("آدرس پرینتر باید IP شبکهٔ محلی باشد (مثل 192.168.1.50)"));
    if (!/^[\x21-\x7e]{1,32}$/.test(community)) return reject(new Error("Community نامعتبر است"));
    if (!/^\d+(\.\d+){5,20}$/.test(oid)) return reject(new Error("OID نامعتبر است"));
    const sock = socketFactory ? socketFactory() : dgram.createSocket("udp4");
    const rid = 1 + Math.floor(Math.random() * 0x7ffff);
    const done = (fn, v) => { clearTimeout(tm); try { sock.close(); } catch { /* ignore */ } fn(v); };
    const tm = setTimeout(() => done(reject, new Error("پرینتر به SNMP پاسخ نداد (SNMP روی دستگاه فعال نیست یا community اشتباه است)")), timeout);
    sock.on("error", (e) => done(reject, e));
    sock.on("message", (msg) => {
      try { const r = parseResponse(msg); if (r.requestId !== rid) return; if (r.errorStatus || r.value == null) return done(reject, new Error("پرینتر این کنتور را پشتیبانی نمی‌کند")); done(resolve, r.value); }
      catch (e) { done(reject, e); }
    });
    sock.send(buildGet({ community, oid, requestId: rid }), port, host, (e) => { if (e) done(reject, e); });
  });
}
module.exports = { OID_LIFE_COUNT, buildGet, parseResponse, snmpGet, isPrivateHost, encOid };
