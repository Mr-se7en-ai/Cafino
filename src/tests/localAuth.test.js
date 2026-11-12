import test from "node:test";
import assert from "node:assert/strict";
import * as A from "../services/auth/localAuth.js";

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const IT = 1000;   // fast iterations for tests
const sha256 = async (t) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))).map((b) => b.toString(16).padStart(2, "0")).join("");

test("hash format is salted PBKDF2 and two hashes of the same password differ", async () => {
  const a = await A.hashPassword("Secret#123", IT), b = await A.hashPassword("Secret#123", IT);
  assert.match(a, /^pbkdf2-sha256\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/); assert.notEqual(a, b);
  assert.equal((await A.verifyPassword("Secret#123", a, { iterations: IT })).ok, true);
  assert.equal((await A.verifyPassword("secret#123", a, { iterations: IT })).ok, false);
});
test("default policy is 600k iterations", async () => { assert.equal(A.PBKDF2_ITERATIONS, 600000); const h = await A.hashPassword("x1234567"); assert.ok(h.startsWith("pbkdf2-sha256$600000$")); });
test("legacy SHA-256 hash verifies and is flagged for upgrade; weaker iteration count too", async () => {
  const legacy = await sha256("OldPass123");
  assert.deepEqual(await A.verifyPassword("OldPass123", legacy), { ok: true, upgrade: true });
  assert.equal((await A.verifyPassword("bad", legacy)).ok, false);
  const weak = await A.hashPassword("P@ssw0rd!", 2000);
  assert.deepEqual(await A.verifyPassword("P@ssw0rd!", weak, { iterations: 5000 }), { ok: true, upgrade: true });
});
test("malformed stored values never verify", async () => { for (const s of ["", null, undefined, "abc", "pbkdf2-sha256$x$y$z", "md5$1$a$b"]) assert.equal((await A.verifyPassword("x", s)).ok, false); });
test("password policy", () => { assert.ok(A.validateNewPassword("short")); assert.ok(A.validateNewPassword("aaaaaaaa")); assert.ok(A.validateNewPassword("12345678")); assert.equal(A.validateNewPassword("Kafe-Net-2026"), ""); assert.ok(A.validateNewPassword("User@Mail.com", "user@mail.com")); });

test("register → login; unknown email and wrong password give the same error", async () => {
  const st = mem();
  assert.equal((await A.registerUser({ email: "A@B.ir", password: "Kafe-Net-2026" }, { storage: st, iterations: IT })).ok, true);
  assert.equal((await A.registerUser({ email: "a@b.ir", password: "Kafe-Net-2026" }, { storage: st, iterations: IT })).code, "exists");
  assert.equal((await A.loginUser("a@b.ir", "Kafe-Net-2026", { storage: st, iterations: IT })).ok, true);
  const bad = await A.loginUser("a@b.ir", "nope-nope", { storage: st, iterations: IT }), unk = await A.loginUser("zz@b.ir", "nope-nope", { storage: st, iterations: IT });
  assert.equal(bad.error, unk.error);
});
test("legacy account logs in once and is silently upgraded", async () => {
  const st = mem({ [A.USERS_KEY]: JSON.stringify([{ email: "old@x.ir", passHash: await sha256("OldPass123"), firstName: "o" }]) });
  const r = await A.loginUser("old@x.ir", "OldPass123", { storage: st, iterations: IT });
  assert.equal(r.ok, true); assert.equal(r.upgraded, true);
  assert.match(A.getUsers(st)[0].passHash, /^pbkdf2-sha256\$/);
  assert.equal((await A.loginUser("old@x.ir", "OldPass123", { storage: st, iterations: IT })).upgraded, false);
});
test("brute force: 5 failures lock the account with growing delay, success clears it", async () => {
  const st = mem(); await A.registerUser({ email: "l@x.ir", password: "Kafe-Net-2026" }, { storage: st, iterations: IT });
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal((await A.loginUser("l@x.ir", "wrongwrong", { storage: st, iterations: IT, now: t0 })).code, "invalid");
  const locked = await A.loginUser("l@x.ir", "Kafe-Net-2026", { storage: st, iterations: IT, now: t0 + 1000 });
  assert.equal(locked.code, "locked"); assert.ok(locked.retryAfterSec > 0 && locked.retryAfterSec <= 30);
  assert.equal((await A.loginUser("l@x.ir", "Kafe-Net-2026", { storage: st, iterations: IT, now: t0 + 31_000 })).ok, true);
  assert.equal(A.lockRemainingSec("l@x.ir", { storage: st, now: t0 + 31_000 }), 0);
});
test("change password: needs current password, rejects weak, bumps epoch and revokes older sessions", async () => {
  const st = mem(); await A.registerUser({ email: "c@x.ir", password: "Kafe-Net-2026" }, { storage: st, iterations: IT });
  A.startSession("c@x.ir", { storage: st });
  assert.equal((await A.changeUserPassword("c@x.ir", "wrong-pass", "New-Pass-2027", { storage: st, iterations: IT })).code, "invalid");
  assert.equal((await A.changeUserPassword("c@x.ir", "Kafe-Net-2026", "short", { storage: st, iterations: IT })).code, "weak_password");
  assert.equal(A.getSessionEmail({ storage: st }), "c@x.ir");
  assert.equal((await A.changeUserPassword("c@x.ir", "Kafe-Net-2026", "New-Pass-2027", { storage: st, iterations: IT })).ok, true);
  assert.equal(A.getSessionEmail({ storage: st }), null, "old session revoked");
  assert.equal((await A.loginUser("c@x.ir", "New-Pass-2027", { storage: st, iterations: IT })).ok, true);
});
test("session: random id, absolute expiry, idle expiry, sliding touch", () => {
  const st = mem(); const t = 5_000_000;
  const a = A.startSession("s@x.ir", { storage: st, now: t }), b = A.startSession("s@x.ir", { storage: st, now: t });
  assert.notEqual(a.sid, b.sid); assert.ok(a.sid.length >= 30);
  assert.equal(A.getSessionEmail({ storage: st, now: t + 1000 }), "s@x.ir");
  A.touchSession({ storage: st, now: t + A.SESSION_IDLE_MS - 1000 });
  assert.equal(A.getSessionEmail({ storage: st, now: t + A.SESSION_IDLE_MS + 5000 }), "s@x.ir", "touch extended the idle window");
  A.startSession("s@x.ir", { storage: st, now: t });
  assert.equal(A.getSessionEmail({ storage: st, now: t + A.SESSION_IDLE_MS + 1 }), null, "idle expiry");
  A.startSession("s@x.ir", { storage: st, now: t });
  for (let k = 1; k <= 12; k++) { A.touchSession({ storage: st, now: t + k * 3600_000 - 10_000 }); }
  assert.equal(A.getSessionEmail({ storage: st, now: t + A.SESSION_ABSOLUTE_MS + 1 }), null, "absolute expiry despite activity");
  assert.equal(st.getItem(A.SESSION_KEY), null);
});
test("legacy string session is converted to a v2 session", () => {
  const st = mem({ [A.SESSION_KEY]: JSON.stringify("old@x.ir") });
  assert.equal(A.getSessionEmail({ storage: st }), "old@x.ir");
  assert.equal(JSON.parse(st.getItem(A.SESSION_KEY)).v, 2);
});
test("timingSafeEqual", () => { assert.equal(A.timingSafeEqual("abc", "abc"), true); assert.equal(A.timingSafeEqual("abc", "abd"), false); assert.equal(A.timingSafeEqual("abc", "abcd"), false); });
