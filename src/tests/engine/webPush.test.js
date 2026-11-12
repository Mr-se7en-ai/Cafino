// Web Push — سمت برنامه (با مرورگر و سرور ساختگی)
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E, calls, subscribed, unsub;
const at = (iso, hhmm = "09:00") => new Date(`${iso}T${hhmm}:00`).getTime();
function fakeBrowser({ permission = "granted" } = {}) {
  subscribed = null; unsub = 0;
  const pushManager = {
    getSubscription: async () => subscribed,
    subscribe: async (o) => { subscribed = { endpoint: "https://fcm.example.com/send/E1", toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "P", auth: "A" } }; }, unsubscribe: async () => { unsub++; subscribed = null; return true; }, key: o.applicationServerKey }; return subscribed; },
  };
  const reg = { pushManager };
  Object.defineProperty(globalThis, "navigator", { value: { serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg) } }, configurable: true });
  globalThis.PushManager = function () {};
  globalThis.Notification = { permission, requestPermission: async () => permission };
  globalThis.isSecureContext = true;
  calls = [];
  globalThis.__fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, body, headers: init.headers });
    if (url.endsWith("/api/push/public-key")) return { ok: true, status: 200, json: async () => ({ publicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
}
beforeEach(() => { E = fresh(); globalThis.CAFINO_CONFIG = { apiBaseUrl: "https://api.cafe.ir", cafeId: "c1" }; fakeBrowser(); });
afterEach(() => { delete globalThis.CAFINO_CONFIG; globalThis.sessionStorage.clear(); });

test("در دسترس‌بودن: بدون سرویس / مهمان / مرورگر ناسازگار", () => {
  assert.equal(E.pushUnavailableReason(), null);
  globalThis.CAFINO_CONFIG = {};
  assert.equal(E.pushUnavailableReason(), "no-service");
  globalThis.CAFINO_CONFIG = { pushUrl: "https://push.cafe.ir" };
  assert.equal(E.pushUnavailableReason(), null, "pushUrl جدا هم کافی است");
  delete globalThis.PushManager;
  assert.equal(E.pushUnavailableReason(), "unsupported");
  globalThis.PushManager = function () {};
  globalThis.sessionStorage.setItem("cafenet_guest_mode", "1");
  assert.equal(E.pushUnavailableReason(), "guest");
});

test("برنامهٔ زمانی: فقط یادآورهای باز، تکراری‌ها با چند نوبت آینده، تعویق‌خورده با زمان تعویق", () => {
  const now = at("2026-04-10", "08:00");
  const once = E.saveReminder({ title: "یک‌بار", date: "2026-04-12", time: "10:00" }).reminder;
  const daily = E.saveReminder({ title: "روزانه", date: "2026-04-10", time: "09:00", repeat: "daily" }).reminder;
  const done = E.saveReminder({ title: "انجام‌شده", date: "2026-04-11", time: "10:00" }).reminder; E.completeReminder(done.id, now);
  const snoozed = E.saveReminder({ title: "تعویق", date: "2026-04-09", time: "10:00" }).reminder; E.snoozeReminder(snoozed.id, 30, now);
  const s = E.buildSchedule(E.getReminders(), now);
  assert.equal(s.length, 3);
  const by = Object.fromEntries(s.map((x) => [x.title, x]));
  assert.deepEqual(by["یک‌بار"].fireAt, [at("2026-04-12", "10:00")]);
  assert.equal(by["روزانه"].fireAt.length, 8); assert.equal(by["روزانه"].fireAt[1], at("2026-04-11", "09:00"));
  assert.deepEqual(by["تعویق"].fireAt, [now + 30 * 60000]);
  assert.ok(!by["انجام‌شده"]);
});

test("فعال‌سازی: مجوز → اشتراک مرورگر → ثبت روی سرویس → ارسال برنامه", async () => {
  E.saveReminder({ title: "پیگیری چک", date: "2099-01-01", time: "10:00", note: "بابت فاکتور" });
  const r = await E.enablePush();
  assert.equal(r.ok, true);
  const urls = calls.map((c) => c.url.replace("https://api.cafe.ir", ""));
  assert.deepEqual(urls, ["/api/push/public-key", "/api/push/subscribe", "/api/push/reminders"]);
  assert.equal(calls[1].body.subscription.endpoint, "https://fcm.example.com/send/E1");
  assert.equal(calls[1].body.cafeId, "c1");
  assert.equal(calls[2].body.reminders[0].title, "پیگیری چک"); assert.equal(calls[2].body.reminders[0].body, "بابت فاکتور");
  assert.ok(subscribed.key instanceof Uint8Array && subscribed.key.length === 65, "کلید VAPID درست دیکد شد");
  const st = E.pushState();
  assert.equal(st.enabled, true); assert.equal(st.count, 1); assert.ok(st.lastSyncAt);
});
test("کلید عمومی از config.js و کلید مشترک هدر", async () => {
  globalThis.CAFINO_CONFIG = { pushUrl: "https://push.cafe.ir/", vapidPublicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", pushKey: "k1" };
  await E.enablePush();
  assert.ok(!calls.some((c) => c.url.endsWith("public-key")));
  assert.ok(calls.every((c) => c.url.startsWith("https://push.cafe.ir/api/push/") && c.headers["x-push-key"] === "k1"));
});
test("مجوز رد شود → فعال نمی‌شود و درخواستی به سرور نمی‌رود", async () => {
  fakeBrowser({ permission: "denied" });
  const r = await E.enablePush();
  assert.deepEqual([r.ok, r.reason], [false, "denied"]);
  assert.equal(calls.length, 0); assert.equal(E.pushState().enabled, undefined);
});
test("خرابی سرویس هنگام فعال‌سازی → فعال نمی‌شود (وضعیت دروغ نمی‌ماند)", async () => {
  globalThis.__fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({ error: "down" }) });
  const r = await E.enablePush();
  assert.deepEqual([r.ok, r.reason], [false, "service"]);
  assert.notEqual(E.pushState().enabled, true);
});
test("همگام‌سازی بعدی فقط برنامه را می‌فرستد؛ اگر سرور اشتراک را فراموش کرده باشد دوباره ثبت می‌کند", async () => {
  await E.enablePush(); calls.length = 0;
  E.saveReminder({ title: "جدید", date: "2099-01-01", time: "10:00" });
  await E.syncPush();
  assert.deepEqual(calls.map((c) => c.url.split("/api/push/")[1]), ["reminders"]);
  calls.length = 0;
  let first = true;
  globalThis.__fetchImpl = async (url, init = {}) => { calls.push({ url }); if (url.endsWith("/reminders") && first) { first = false; return { ok: false, status: 404, json: async () => ({ error: "x" }) }; } return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const r = await E.syncPush();
  assert.equal(r.ok, true);
  assert.deepEqual(calls.map((c) => c.url.split("/api/push/")[1]), ["reminders", "subscribe", "reminders"]);
});
test("خطای شبکه در همگام‌سازی ثبت می‌شود و برنامه نمی‌شکند", async () => {
  await E.enablePush();
  globalThis.__fetchImpl = async () => { throw new TypeError("Failed to fetch"); };
  const r = await E.syncPush();
  assert.equal(r.ok, false);
  assert.match(E.pushState().lastError, /Failed to fetch/);
  assert.equal(E.pushState().enabled, true, "فعال می‌ماند و بعداً دوباره تلاش می‌شود");
});
test("غیرفعال‌سازی: لغو اشتراک روی سرور و مرورگر و پاک‌شدن وضعیت", async () => {
  await E.enablePush(); calls.length = 0;
  await E.disablePush();
  assert.deepEqual(calls.map((c) => c.url.split("/api/push/")[1]), ["unsubscribe"]);
  assert.equal(unsub, 1); assert.equal(E.pushState().enabled, undefined);
  assert.deepEqual(await E.syncPush(), { ok: false, skipped: true });
});
