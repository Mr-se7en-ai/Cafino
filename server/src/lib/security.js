import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// ── رمز عبور: scrypt (داخلی Node، بدون وابستگی بومی). قالب: scrypt$N$r$p$salt$hash ─────────────────────────────────────────
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 32;
const scrypt = (pw, salt, n, r, p) => new Promise((res, rej) => crypto.scrypt(pw, salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password).normalize("NFKC"), salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [alg, n, r, p, salt, hash] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const key = await scrypt(String(password).normalize("NFKC"), Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
    const want = Buffer.from(hash, "base64");
    return want.length === key.length && crypto.timingSafeEqual(want, key);
  } catch { return false; }
}
// برای کاربر ناموجود هم یک هش را محاسبه می‌کنیم تا زمان پاسخ وجود ایمیل را لو ندهد
export const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const randomCode = (digits = 8) => String(crypto.randomInt(0, 10 ** digits)).padStart(digits, "0");
export const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ── JWT دسترسی (HS256) ───────────────────────────────────────────────────────────────────────────────────────────────────
const ISS = "cafino-api", AUD = "cafino-app";
export async function signAccess(cfg, user) {
  return new SignJWT({ cid: user.cafe_id || null, oid: user.org_id || null, role: user.role })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuer(ISS).setAudience(AUD)
    .setIssuedAt().setExpirationTime(`${cfg.accessTtlSec}s`).sign(new TextEncoder().encode(cfg.jwtSecret));
}
export async function verifyAccess(cfg, token) {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(cfg.jwtSecret), { issuer: ISS, audience: AUD, algorithms: ["HS256"] });
    return payload;
  } catch { return null; }
}

// ── جلوگیری از کلید/شناسهٔ خطرناک ───────────────────────────────────────────────────────────────────────────────────────
export const validEmail = (s) => typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export function passwordProblem(pw, email = "") {
  if (typeof pw !== "string" || pw.length < 8) return "رمز عبور باید دست‌کم ۸ نویسه باشد";
  if (pw.length > 128) return "رمز عبور بیش از حد طولانی است";
  if (email && pw.toLowerCase() === String(email).toLowerCase()) return "رمز عبور نباید با ایمیل یکی باشد";
  if (/^(.)\1+$/.test(pw) || /^(12345678|password|qwertyui|11111111)/i.test(pw)) return "رمز عبور بیش از حد ساده است";
  return "";
}
