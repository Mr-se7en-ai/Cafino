// تولید deploy/csp.conf: Content-Security-Policy سخت‌گیر بدون 'unsafe-inline' و بدون 'unsafe-eval' برای اسکریپت‌ها.
// اسکریپت‌های درون‌خطی index.html با هش SHA-256 مجاز می‌شوند، پس بعد از هر بیلد دوباره اجرا کنید:
//   node deploy/make-csp.mjs ../dist/pwa            (PUSH_ORIGIN=https://push.example.com اگر سرویس اعلان جداست)
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
const dir = process.argv[2] || "../dist/pwa";
const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`);
const push = process.env.PUSH_ORIGIN ? ` ${process.env.PUSH_ORIGIN}` : "";
const csp = [
  "default-src 'self'", `script-src 'self' ${hashes.join(" ")}`, "style-src 'self' 'unsafe-inline'",   // استایل درون‌خطی React؛ اسکریپت اجرا نمی‌کند
  "img-src 'self' data: blob:", "font-src 'self' data:", `connect-src 'self'${push}`, "worker-src 'self'", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "csp.conf"), `add_header Content-Security-Policy "${csp}" always;\n`);
console.log(`CSP نوشته شد (${hashes.length} اسکریپت درون‌خطی)`);
