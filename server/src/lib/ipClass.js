// طبقه‌بندی آدرس IP برای ایمنی شبکه (ضد SSRF). متن آدرس با regex مقایسه نمی‌شود؛ ابتدا به بایت تجزیه می‌شود تا
// شکل‌های جایگزین (::ffff:a9fe:a9fe، 0:0:0:0:0:ffff:169.254.169.254، 64:ff9b::7f00:1، 2002:7f00:1::، zone-id، IPv4 غیراستاندارد) فیلتر را دور نزنند.
// اصل: «هرچه صریحاً عمومی نیست، عمومی نیست» (fail-closed).
import net from "node:net";

// آدرس → { v:4, b:[4 بایت] } | { v:6, g:[8 گروه ۱۶بیتی], b:[16 بایت] } | null (نامعتبر/مبهم)
export function parseIp(ip) {
  const s = String(ip ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!s || s.includes("%")) return null;                                   // zone-id مجاز نیست
  if (net.isIPv4(s)) return { v: 4, b: s.split(".").map(Number) };            // net.isIPv4 فقط شکل چهارتایی استاندارد را می‌پذیرد (نه 0x7f.1 یا 0177.0.0.1)
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

// IPv4 نهفته در IPv6: mapped (::ffff:0:0/96)، compat (::/96)، NAT64 (64:ff9b::/96)، 6to4 (2002::/16) — وگرنه null
export function embeddedV4(p) {
  if (p.v === 4) return p.b;
  const g = p.g;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return p.b.slice(12);
  if (g.slice(0, 6).every((x) => x === 0) && (g[6] > 0 || g[7] > 1)) return p.b.slice(12);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return p.b.slice(12);
  if (g[0] === 0x2002) return p.b.slice(2, 6);
  return null;
}

// IPv4 عمومی (قابل‌مسیریابی در اینترنت)؟
export function isPublicV4([a, b, c]) {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;           // this-network، خصوصی، لوپ‌بک، multicast/reserved/broadcast
  if (a === 100 && b >= 64 && b <= 127) return false;                         // CGNAT (و metadata علی‌بابا)
  if (a === 169 && b === 254) return false;                                   // link-local + metadata ابر
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;            // IETF/مستندات
  if (a === 192 && b === 88 && c === 99) return false;                        // 6to4 relay (منسوخ)
  if (a === 198 && (b === 18 || b === 19)) return false;                      // بنچمارک
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

// آدرس عمومی؟ (نامعتبر/مبهم/رزرو → false)
export function isPublicIp(ip) {
  const p = parseIp(ip); if (!p) return false;
  if (p.v === 4) return isPublicV4(p.b);
  const e = embeddedV4(p); if (e) return isPublicV4(e);
  const g = p.g;
  if ((g[0] & 0xe000) !== 0x2000) return false;                               // فقط global unicast 2000::/3 (حذف ::، ::1، fe80، fc00، ff00، 64:ff9b:1::، 100:: …)
  if (g[0] === 0x2001 && (g[1] < 0x200 || g[1] === 0x0db8)) return false;    // 2001::/23 (Teredo، ORCHID، …) و 2001:db8::/32
  if ((g[0] === 0x3fff && (g[1] & 0xf000) === 0)) return false;               // 3fff::/20 مستندات
  return true;
}

export const isIp = (s) => net.isIP(String(s ?? "").replace(/^\[|\]$/g, "")) !== 0;
