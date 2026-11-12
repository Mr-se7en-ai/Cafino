import test from "node:test";
import assert from "node:assert/strict";
import * as A from "../services/auth/localAuth.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const IT = 1000;
const reg = async (st, email = "a@b.ir") => A.registerUser({ email, password: "Kafe-Net-2026" }, { storage: st, iterations: IT });

test("registration returns a one-time recovery code; only its hash is stored", async () => {
  const st = mem(); const r = await reg(st);
  assert.match(r.recoveryCode, /^[A-HJKMNP-Z2-9]{5}(-[A-HJKMNP-Z2-9]{5}){3}$/);
  const raw = st.getItem(A.USERS_KEY);
  assert.ok(!raw.includes(r.recoveryCode) && !raw.includes(r.recoveryCode.replace(/-/g, "")));
  assert.ok(A.getUsers(st)[0].recoveryHash.startsWith("pbkdf2-sha256$"));
});

test("forgot password: code + new password works, rotates the code, revokes sessions, old password stops working", async () => {
  const st = mem(); const { recoveryCode } = await reg(st);
  const s1 = A.startSession("a@b.ir", { storage: st });
  const r = await A.resetPasswordWithRecoveryCode("A@B.ir", recoveryCode.toLowerCase().replace(/-/g, " "), "Brand-New-Pass-9", { storage: st, iterations: IT });
  assert.equal(r.ok, true); assert.notEqual(r.recoveryCode, recoveryCode);
  assert.equal((await A.loginUser("a@b.ir", "Brand-New-Pass-9", { storage: st, iterations: IT })).ok, true);
  assert.equal((await A.loginUser("a@b.ir", "Kafe-Net-2026", { storage: st, iterations: IT })).ok, false);
  assert.equal(A.getSessionEmail({ storage: st }), null, "open session is revoked by the epoch bump");
  assert.equal((await A.resetPasswordWithRecoveryCode("a@b.ir", recoveryCode, "Another-Pass-77", { storage: st, iterations: IT })).ok, false, "old code is dead");
  assert.ok(s1.sid);
});

test("persian digits, spaces and lower case in the code are tolerated", () => {
  assert.equal(A.normalizeRecoveryCode(" abcde-۲۳۴۵۶ "), "ABCDE23456");
});

test("wrong code / unknown e-mail give the same generic error and are throttled", async () => {
  const st = mem(); await reg(st);
  const a = await A.resetPasswordWithRecoveryCode("a@b.ir", "AAAAA-AAAAA-AAAAA-AAAAA", "Brand-New-Pass-9", { storage: st, iterations: IT });
  const b = await A.resetPasswordWithRecoveryCode("zz@b.ir", "AAAAA-AAAAA-AAAAA-AAAAA", "Brand-New-Pass-9", { storage: st, iterations: IT });
  assert.equal(a.ok, false); assert.equal(a.error, b.error); assert.equal(a.code, "invalid");
  let last; for (let i = 0; i < 6; i++) last = await A.resetPasswordWithRecoveryCode("a@b.ir", "AAAAA-AAAAA-AAAAA-AAAAA", "Brand-New-Pass-9", { storage: st, iterations: IT });
  assert.equal(last.code, "locked");
});

test("weak new password is refused without consuming the code", async () => {
  const st = mem(); const { recoveryCode } = await reg(st);
  assert.equal((await A.resetPasswordWithRecoveryCode("a@b.ir", recoveryCode, "123", { storage: st, iterations: IT })).code, "weak_password");
  assert.equal((await A.resetPasswordWithRecoveryCode("a@b.ir", recoveryCode, "Brand-New-Pass-9", { storage: st, iterations: IT })).ok, true);
});

test("legacy account without recovery code cannot reset, but can issue one with its password", async () => {
  const st = mem(); await reg(st);
  const users = A.getUsers(st); delete users[0].recoveryHash; A.saveUsers(users, st);
  assert.equal(A.hasRecoveryCode("a@b.ir", { storage: st }), false);
  assert.equal((await A.resetPasswordWithRecoveryCode("a@b.ir", "AAAAA-AAAAA-AAAAA-AAAAA", "Brand-New-Pass-9", { storage: st, iterations: IT })).ok, false);
  assert.equal((await A.issueRecoveryCode("a@b.ir", "wrong", { storage: st, iterations: IT })).code, "invalid");
  const r = await A.issueRecoveryCode("a@b.ir", "Kafe-Net-2026", { storage: st, iterations: IT });
  assert.equal(r.ok, true); assert.equal(A.hasRecoveryCode("a@b.ir", { storage: st }), true);
  assert.equal((await A.resetPasswordWithRecoveryCode("a@b.ir", r.recoveryCode, "Brand-New-Pass-9", { storage: st, iterations: IT })).ok, true);
});
