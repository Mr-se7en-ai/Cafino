import test from "node:test";
import assert from "node:assert/strict";
import { rememberVerifiedUser, loadOfflineUser, forgetOfflineUser, decideAfterMeFailure, OFFLINE_MAX_AGE_MS, OFFLINE_OWNER_MAX_AGE_MS, OFFLINE_STAFF_MAX_AGE_MS, policyMaxAgeMs, setOfflineActive, isOfflineNow } from "../services/auth/offlineSession.js";
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const user = { id: "u1", email: "a@b.c", firstName: "علی", permissions: ["sales"], accessToken: "SECRET", password: "x" };

test("فقط پروفایل ذخیره می‌شود، نه توکن یا رمز", () => {
  const st = mem(); assert.equal(rememberVerifiedUser(user, { storage: st }), true);
  const raw = [...st.m.values()].join(""); assert.ok(!raw.includes("SECRET") && !raw.includes("password"));
  assert.equal(loadOfflineUser({ storage: st }).email, "a@b.c");
});
test("قطع اینترنت/تایم‌اوت/خطای سرور → ادامه به‌صورت آفلاین؛ ۴۰۱ → خروج", () => {
  const st = mem(); rememberVerifiedUser(user, { storage: st });
  for (const status of [0, 408, 500, 502, 503]) assert.equal(decideAfterMeFailure({ status }, { storage: st }).action, "offline");
  for (const status of [401, 403]) assert.equal(decideAfterMeFailure({ status }, { storage: st }).action, "signout");
});
test("بدون هویت ذخیره‌شده، یا پس از ۸ ساعت (کارمند)، یا بعد از خروج → ورود لازم است", () => {
  const st = mem(); assert.equal(decideAfterMeFailure({ status: 0 }, { storage: st }).action, "signout");
  const t0 = 1_000_000_000_000; rememberVerifiedUser(user, { storage: st, now: t0 });
  assert.equal(decideAfterMeFailure({ status: 0 }, { storage: st, now: t0 + OFFLINE_MAX_AGE_MS - 1000 }).action, "offline");
  assert.equal(decideAfterMeFailure({ status: 0 }, { storage: st, now: t0 + OFFLINE_MAX_AGE_MS + 1000 }).action, "signout");
  forgetOfflineUser({ storage: st }); assert.equal(loadOfflineUser({ storage: st, now: t0 }), null);
});
test("رکورد خراب یا زمان آینده نادیده گرفته می‌شود", () => {
  const st = mem(); st.setItem("cafenet_offline_user", "{bad"); assert.equal(loadOfflineUser({ storage: st }), null);
  rememberVerifiedUser(user, { storage: st, now: Date.now() + 3600_000 }); assert.equal(loadOfflineUser({ storage: st }), null);
});

test("سیاست آفلاین: مالک ۲۴ ساعت، کارمند ۸ ساعت؛ سرور می‌تواند کوتاه/بلند کند؛ رکورد دستکاری‌شده از سقف ۳۰ روز رد نمی‌شود", () => {
  const t0 = 1_700_000_000_000; const H = 3600_000;
  const owner = { id: "o", email: "o@x.y", role: "owner", isOwner: true }, staff = { id: "s", email: "s@x.y", role: "staff" }, mgr = { id: "m", email: "m@x.y", role: "manager" };
  const chk = (u, hours) => { const st = mem(); rememberVerifiedUser(u, { storage: st, now: t0 }); return [loadOfflineUser({ storage: st, now: t0 + hours * H }) !== null]; };
  assert.deepEqual(chk(owner, 23.9), [true]); assert.deepEqual(chk(owner, 24.1), [false]);
  assert.deepEqual(chk(staff, 7.9), [true]); assert.deepEqual(chk(staff, 8.1), [false]);
  assert.deepEqual(chk(mgr, 8.1), [false], "مدیر مثل کارمند سخت‌گیر است");
  assert.equal(OFFLINE_OWNER_MAX_AGE_MS, 24 * H); assert.equal(OFFLINE_STAFF_MAX_AGE_MS, 8 * H); assert.equal(OFFLINE_MAX_AGE_MS, 8 * H);
  // سیاست سرور (ثانیه) برتر از پیش‌فرض نقش؛ حداقل ۵ دقیقه
  assert.equal(policyMaxAgeMs({ ...staff, offlinePolicy: { maxAgeSec: 600 } }), 600_000);
  assert.equal(policyMaxAgeMs({ ...staff, offlinePolicy: { maxAgeSec: 1 } }), 300_000);
  assert.equal(policyMaxAgeMs({ ...owner, offlinePolicy: { maxAgeSec: 99999999999 } }), 30 * 24 * H);
  assert.equal(policyMaxAgeMs({ ...owner, offlinePolicy: { maxAgeSec: "x" } }), 24 * H);
  const st = mem(); rememberVerifiedUser({ ...staff, offlinePolicy: { maxAgeSec: 1800 } }, { storage: st, now: t0 });
  assert.ok(loadOfflineUser({ storage: st, now: t0 + 0.4 * H })); assert.equal(loadOfflineUser({ storage: st, now: t0 + 0.6 * H }), null);
  assert.equal(loadOfflineUser({ storage: st, now: t0 + 0.4 * H }).expiresAt, t0 + 1800_000);
  // رکوردی که دستی maxAgeMs بزرگ گرفته باشد از ۳۰ روز فراتر نمی‌رود
  const raw = JSON.parse(st.getItem("cafenet_offline_user")); raw.maxAgeMs = 1e15; st.setItem("cafenet_offline_user", JSON.stringify(raw));
  assert.equal(loadOfflineUser({ storage: st, now: t0 + 31 * 24 * H }), null);
});
test("پرچم آفلاین: با هویت آفلاین یا navigator.onLine=false فعال؛ با خروج پاک می‌شود", () => {
  setOfflineActive(false); assert.equal(isOfflineNow(), false);
  setOfflineActive(true); assert.equal(isOfflineNow(), true);
  forgetOfflineUser({ storage: mem() }); assert.equal(isOfflineNow(), false);
});
