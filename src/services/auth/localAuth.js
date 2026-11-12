// Local (offline / demo) authentication.
//
// This is NOT the source of truth for identity: when an API server is configured the server authenticates (see session.js).
// Local accounts exist only for the single-machine demo / offline mode and are limited accordingly:
//   • passwords: PBKDF2-HMAC-SHA256, 600 000 iterations (OWASP 2023), 16-byte random salt per user, constant-time compare,
//     stored as  pbkdf2-sha256$<iterations>$<salt>$<hash>.  Legacy unsalted SHA-256 hashes still verify once and are upgraded on that login.
//   • Argon2id is not available in WebCrypto (it would need a WASM dependency); PBKDF2 is the strongest built-in KDF.
//   • sessions: random id + absolute expiry (12 h) + idle expiry (2 h) + per-user epoch (changing the password invalidates every open session)
//   • brute-force throttle: after 5 wrong passwords the account is locked with exponentially growing delay (30 s … 15 min)
// The session lives in localStorage, so anybody with access to the browser profile can read it — that is inherent to a client-only mode.

export const PBKDF2_ITERATIONS = 600000;
export const SESSION_ABSOLUTE_MS = 12 * 3600 * 1000;
export const SESSION_IDLE_MS = 2 * 3600 * 1000;
export const MIN_PASSWORD_LENGTH = 8;
export const USERS_KEY = "cafenet_users";
export const SESSION_KEY = "cafenet_session";
export const ATTEMPTS_KEY = "cafenet_auth_attempts";
const MAX_FREE_ATTEMPTS = 5;

const enc = new TextEncoder();
const store = (s) => s === undefined ? globalThis.localStorage : s;

// ── encoding helpers ─────────────────────────────────────────────────────────
const toB64 = (buf) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
const fromB64 = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const randomB64Url = (bytes) => toB64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ── recovery codes (local accounts only) ─────────────────────────────────────
// A local account has no mailbox, so "forgot password" works with a one-time recovery code shown at registration:
// 20 characters from an unambiguous alphabet (~100 bits), stored only as a PBKDF2 hash, rotated after every use.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
  return chars.match(/.{5}/g).join("-");
}
export function normalizeRecoveryCode(code) {
  const map = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
  return String(code || "").replace(/[۰-۹]/g, (d) => map[d]).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function timingSafeEqual(a, b) {
  const x = typeof a === "string" ? enc.encode(a) : a, y = typeof b === "string" ? enc.encode(b) : b;
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i % (x.length || 1)] ?? 0) ^ (y[i % (y.length || 1)] ?? 0);
  return diff === 0;
}

// ── password hashing ─────────────────────────────────────────────────────────
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${toB64(salt)}$${toB64(await pbkdf2(password, salt, iterations))}`;
}
export const isLegacyHash = (stored) => typeof stored === "string" && /^[0-9a-f]{64}$/i.test(stored);

// → { ok, upgrade } ; `upgrade` = the stored hash is legacy / weaker than the current policy and should be replaced after a successful login
export async function verifyPassword(password, stored, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (typeof stored !== "string" || !stored) return { ok: false, upgrade: false };
  if (isLegacyHash(stored)) {
    const digest = toHex(await crypto.subtle.digest("SHA-256", enc.encode(password)));
    return { ok: timingSafeEqual(digest, stored.toLowerCase()), upgrade: true };
  }
  const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
  const iter = Number(iterStr);
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iter) || iter < 1000 || !saltB64 || !hashB64) return { ok: false, upgrade: false };
  const got = new Uint8Array(await pbkdf2(password, fromB64(saltB64), iter));
  return { ok: timingSafeEqual(got, fromB64(hashB64)), upgrade: iter < iterations };
}

export function validateNewPassword(password, email = "") {
  const p = String(password || "");
  if (p.length < MIN_PASSWORD_LENGTH) return `رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد`;
  if (email && p.toLowerCase() === String(email).toLowerCase()) return "رمز عبور نباید با ایمیل یکی باشد";
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|12345678|password|qwertyui)/i.test(p)) return "رمز عبور خیلی ساده است";
  return "";
}

// ── users ────────────────────────────────────────────────────────────────────
export function getUsers(storage) { try { const v = JSON.parse(store(storage).getItem(USERS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveUsers(users, storage) { store(storage).setItem(USERS_KEY, JSON.stringify(users)); }
const norm = (email) => String(email || "").trim().toLowerCase();

export async function registerUser({ email, password, firstName = "", lastName = "", phone = "" }, { storage, iterations } = {}) {
  const key = norm(email);
  const problem = validateNewPassword(password, key);
  if (problem) return { ok: false, code: "weak_password", error: problem };
  const users = getUsers(storage);
  if (users.some((u) => u.email === key)) return { ok: false, code: "exists", error: "این ایمیل قبلاً ثبت‌نام شده — وارد شوید" };
  const passHash = await hashPassword(password, iterations);
  const recoveryCode = generateRecoveryCode();
  const recoveryHash = await hashPassword(normalizeRecoveryCode(recoveryCode), iterations);
  saveUsers([...users, { email: key, passHash, recoveryHash, authEpoch: 1, firstName: String(firstName).trim(), lastName: String(lastName).trim(), phone: String(phone).trim(), createdAt: Date.now() }], storage);
  return { ok: true, email: key, recoveryCode };
}

// ── brute-force throttle ─────────────────────────────────────────────────────
function readAttempts(storage) { try { return JSON.parse(store(storage).getItem(ATTEMPTS_KEY) || "{}") || {}; } catch { return {}; } }
function writeAttempts(a, storage) { try { store(storage).setItem(ATTEMPTS_KEY, JSON.stringify(a)); } catch { /* ignore */ } }
export function lockRemainingSec(email, { storage, now = Date.now() } = {}) {
  const rec = readAttempts(storage)[norm(email)];
  return rec && rec.lockUntil > now ? Math.ceil((rec.lockUntil - now) / 1000) : 0;
}
function recordFailure(email, storage, now) {
  const all = readAttempts(storage), k = norm(email), rec = all[k] || { n: 0, lockUntil: 0 };
  rec.n += 1;
  if (rec.n >= MAX_FREE_ATTEMPTS) rec.lockUntil = now + Math.min(15 * 60, 30 * 2 ** (rec.n - MAX_FREE_ATTEMPTS)) * 1000;
  all[k] = rec; writeAttempts(all, storage);
}
function clearFailures(email, storage) { const all = readAttempts(storage); delete all[norm(email)]; writeAttempts(all, storage); }

let dummyHash = null;     // verifying against a dummy hash for unknown emails keeps timing equal (no account enumeration by speed)

export async function loginUser(email, password, { storage, now = Date.now(), iterations } = {}) {
  const key = norm(email);
  const wait = lockRemainingSec(key, { storage, now });
  if (wait) return { ok: false, code: "locked", retryAfterSec: wait, error: `به‌دلیل تلاش‌های ناموفق، ورود تا ${wait} ثانیه دیگر مسدود است` };
  const users = getUsers(storage);
  const user = users.find((u) => u.email === key);
  let result = { ok: false, upgrade: false };
  if (user) result = await verifyPassword(password, user.passHash, { iterations });
  else { dummyHash ||= await hashPassword("dummy-password", iterations); await verifyPassword(password, dummyHash, { iterations }); }
  if (!result.ok) { recordFailure(key, storage, now); return { ok: false, code: "invalid", error: "ایمیل یا رمز عبور اشتباه است" }; }
  clearFailures(key, storage);
  if (result.upgrade) {                                           // legacy SHA-256 (or fewer iterations) → re-hash with the current policy
    const passHash = await hashPassword(password, iterations);
    saveUsers(users.map((u) => (u.email === key ? { ...u, passHash, authEpoch: u.authEpoch || 1 } : u)), storage);
  }
  return { ok: true, email: key, upgraded: !!result.upgrade };
}

export async function changeUserPassword(email, current, next, { storage, iterations } = {}) {
  const key = norm(email);
  const problem = validateNewPassword(next, key);
  if (problem) return { ok: false, code: "weak_password", error: problem };
  const wait = lockRemainingSec(key, { storage });
  if (wait) return { ok: false, code: "locked", retryAfterSec: wait, error: `به‌دلیل تلاش‌های ناموفق، تغییر رمز تا ${wait} ثانیه دیگر مسدود است` };
  const users = getUsers(storage), idx = users.findIndex((u) => u.email === key);
  const r = idx >= 0 ? await verifyPassword(current, users[idx].passHash, { iterations }) : { ok: false };
  if (!r.ok) { recordFailure(key, storage, Date.now()); return { ok: false, code: "invalid", error: "رمز عبور فعلی اشتباه است" }; }
  clearFailures(key, storage);
  const passHash = await hashPassword(next, iterations);
  const updated = [...users]; updated[idx] = { ...users[idx], passHash, authEpoch: (users[idx].authEpoch || 1) + 1 };   // epoch bump kills every other open session
  saveUsers(updated, storage);
  return { ok: true };
}

// Signed-in user (or an account created before recovery codes existed) asks for a fresh code; the current password is required.
export async function issueRecoveryCode(email, password, { storage, iterations } = {}) {
  const key = norm(email);
  const wait = lockRemainingSec(key, { storage });
  if (wait) return { ok: false, code: "locked", retryAfterSec: wait, error: `به‌دلیل تلاش‌های ناموفق، این کار تا ${wait} ثانیه دیگر مسدود است` };
  const users = getUsers(storage), idx = users.findIndex((u) => u.email === key);
  const r = idx >= 0 ? await verifyPassword(password, users[idx].passHash, { iterations }) : { ok: false };
  if (!r.ok) { recordFailure(key, storage, Date.now()); return { ok: false, code: "invalid", error: "رمز عبور فعلی اشتباه است" }; }
  clearFailures(key, storage);
  const recoveryCode = generateRecoveryCode();
  const updated = [...users]; updated[idx] = { ...users[idx], recoveryHash: await hashPassword(normalizeRecoveryCode(recoveryCode), iterations) };
  saveUsers(updated, storage);
  return { ok: true, recoveryCode };
}

export function hasRecoveryCode(email, { storage } = {}) { return !!getUsers(storage).find((u) => u.email === norm(email))?.recoveryHash; }

let dummyRecovery = null;
// «Forgot password»: e-mail + recovery code + new password. One generic error for every failure (no account enumeration),
// shares the brute-force throttle (key "recovery:<email>"), kills every open session (epoch bump) and rotates the code.
export async function resetPasswordWithRecoveryCode(email, code, newPassword, { storage, now = Date.now(), iterations } = {}) {
  const key = norm(email), tkey = "recovery:" + key;
  const wait = lockRemainingSec(tkey, { storage, now });
  if (wait) return { ok: false, code: "locked", retryAfterSec: wait, error: `به‌دلیل تلاش‌های ناموفق، بازیابی تا ${wait} ثانیه دیگر مسدود است` };
  const problem = validateNewPassword(newPassword, key);
  if (problem) return { ok: false, code: "weak_password", error: problem };
  const users = getUsers(storage), idx = users.findIndex((u) => u.email === key);
  const normalized = normalizeRecoveryCode(code);
  let ok = false;
  if (idx >= 0 && users[idx].recoveryHash && normalized.length === 20) ok = (await verifyPassword(normalized, users[idx].recoveryHash, { iterations })).ok;
  else { dummyRecovery ||= await hashPassword("dummy-recovery", iterations); await verifyPassword(normalized, dummyRecovery, { iterations }); }
  if (!ok) { recordFailure(tkey, storage, now); return { ok: false, code: "invalid", error: "ایمیل یا کد بازیابی اشتباه است" }; }
  clearFailures(tkey, storage); clearFailures(key, storage);
  const recoveryCode = generateRecoveryCode();
  const updated = [...users];
  updated[idx] = { ...users[idx], passHash: await hashPassword(newPassword, iterations), recoveryHash: await hashPassword(normalizeRecoveryCode(recoveryCode), iterations), authEpoch: (users[idx].authEpoch || 1) + 1 };
  saveUsers(updated, storage);
  return { ok: true, email: key, recoveryCode };
}

// ── sessions ─────────────────────────────────────────────────────────────────
const readRaw = (storage) => { try { return JSON.parse(store(storage).getItem(SESSION_KEY) || "null"); } catch { return null; } };
const userEpoch = (email, storage) => (getUsers(storage).find((u) => u.email === email)?.authEpoch || 1);

export function startSession(email, { storage, now = Date.now() } = {}) {
  const key = norm(email);
  const s = { v: 2, email: key, sid: randomB64Url(24), epoch: userEpoch(key, storage), createdAt: now, lastSeen: now, expiresAt: now + SESSION_ABSOLUTE_MS };
  store(storage).setItem(SESSION_KEY, JSON.stringify(s));
  return s;
}
export function endSession(storage) { try { store(storage).removeItem(SESSION_KEY); } catch { /* ignore */ } }

// → the signed-in email or null. A legacy plain-string session (≤1.49.x) is converted once into a v2 session with a fresh expiry.
export function getSessionEmail({ storage, now = Date.now() } = {}) {
  const raw = readRaw(storage);
  if (!raw) return null;
  if (typeof raw === "string") return raw ? startSession(raw, { storage, now }).email : null;
  if (raw.v !== 2 || !raw.email) { endSession(storage); return null; }
  const expired = now >= raw.expiresAt || now - raw.lastSeen >= SESSION_IDLE_MS;
  const revoked = raw.epoch !== userEpoch(raw.email, storage) && getUsers(storage).some((u) => u.email === raw.email);
  if (expired || revoked) { endSession(storage); return null; }
  return raw.email;
}
// Sliding idle window; writes at most once a minute.
export function touchSession({ storage, now = Date.now() } = {}) {
  const raw = readRaw(storage);
  if (!raw || typeof raw !== "object" || now - raw.lastSeen < 60000) return;
  try { store(storage).setItem(SESSION_KEY, JSON.stringify({ ...raw, lastSeen: now })); } catch { /* ignore */ }
}
export function sessionInfo({ storage } = {}) { const r = readRaw(storage); return r && typeof r === "object" ? { sid: r.sid, expiresAt: r.expiresAt, lastSeen: r.lastSeen } : null; }
