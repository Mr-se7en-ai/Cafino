import test from "node:test";
import assert from "node:assert/strict";
import { createPushService, LIMITS, PushError } from "../src/service.js";
import { createMemoryStore } from "../src/store.js";

const SUB = (n = 1) => ({ endpoint: `https://push.example.com/send/abc${n}`, keys: { p256dh: "BKEY" + n, auth: "AUTH" + n } });
function make(t0 = 1_000_000_000_000) {
  const clock = { t: t0 }, sent = [];
  let behaviour = async () => {};
  const svc = createPushService({ store: createMemoryStore(), now: () => clock.t, sender: async (sub, payload, opt) => { await behaviour(sub, payload, opt); sent.push({ sub, payload: JSON.parse(payload), opt }); } });
  return { svc, clock, sent, setBehaviour: (f) => { behaviour = f; } };
}
const MIN = 60000;

test("اشتراک نامعتبر رد می‌شود", () => {
  const { svc } = make();
  assert.throws(() => svc.subscribe({ endpoint: "http://insecure/x", keys: {} }), PushError);
  assert.throws(() => svc.subscribe({ endpoint: "https://x.example/a", keys: { p256dh: "a" } }), /کلید/);
  assert.throws(() => svc.subscribe(null), PushError);
});
test("یادآورها بدون اشتراک قبول نمی‌شوند", () => {
  const { svc } = make();
  assert.throws(() => svc.setReminders("https://nope.example/x", []), (e) => e.status === 404);
});
test("اعلان سر وقت می‌رود، فقط یک بار، با محتوای درست", async () => {
  const { svc, clock, sent } = make();
  svc.subscribe(SUB());
  svc.setReminders(SUB().endpoint, [{ id: "r1", title: "تماس با آقای رضایی", body: "بابت چک", fireAt: [clock.t + 5 * MIN] }]);
  assert.equal(await svc.tick(), 0);
  clock.t += 5 * MIN + 1000;
  assert.equal(await svc.tick(), 1);
  assert.equal(sent[0].payload.title, "⏰ تماس با آقای رضایی");
  assert.equal(sent[0].payload.body, "بابت چک");
  assert.equal(sent[0].payload.tag, "cafino-r1");
  assert.equal(await svc.tick(), 0, "دوباره نمی‌رود");
  clock.t += 10 * MIN;
  assert.equal(await svc.tick(), 0);
  assert.equal(sent.length, 1);
});
test("همگام‌سازی دوباره، اعلان رفته را تکرار نمی‌کند ولی زمان جدید را می‌پذیرد", async () => {
  const { svc, clock, sent } = make();
  svc.subscribe(SUB());
  const t1 = clock.t + MIN;
  svc.setReminders(SUB().endpoint, [{ id: "r1", title: "الف", fireAt: [t1] }]);
  clock.t += 2 * MIN; await svc.tick();
  svc.setReminders(SUB().endpoint, [{ id: "r1", title: "الف", fireAt: [t1, clock.t + 3 * MIN] }]);   // همان زمان + نوبت بعدی (تکرار)
  assert.equal(await svc.tick(), 0);
  clock.t += 4 * MIN;
  assert.equal(await svc.tick(), 1);
  assert.equal(sent.length, 2);
});
test("حذف یا انجام‌شدن یادآور در برنامه، آن را از زمان‌بندی برمی‌دارد", async () => {
  const { svc, clock, sent } = make();
  svc.subscribe(SUB());
  svc.setReminders(SUB().endpoint, [{ id: "r1", title: "الف", fireAt: [clock.t + MIN] }, { id: "r2", title: "ب", fireAt: [clock.t + MIN] }]);
  svc.setReminders(SUB().endpoint, [{ id: "r2", title: "ب", fireAt: [clock.t + MIN] }]);
  clock.t += 2 * MIN; await svc.tick();
  assert.deepEqual(sent.map((s) => s.payload.id), ["r2"]);
});
test("اعلان خیلی دیررسیده فرستاده نمی‌شود (مثلاً سرور مدتی خاموش بوده)", async () => {
  const { svc, clock, sent } = make();
  svc.subscribe(SUB());
  svc.setReminders(SUB().endpoint, [{ id: "r1", title: "قدیمی", fireAt: [clock.t - LIMITS.maxLateMs - MIN] }, { id: "r2", title: "تازه", fireAt: [clock.t - MIN] }]);
  await svc.tick();
  assert.deepEqual(sent.map((s) => s.payload.id), ["r2"]);
});
test("اشتراک منقضی (410/404) خودکار پاک می‌شود", async () => {
  const { svc, clock, sent, setBehaviour } = make();
  svc.subscribe(SUB(1)); svc.subscribe(SUB(2));
  svc.setReminders(SUB(1).endpoint, [{ id: "a", title: "الف", fireAt: [clock.t - MIN] }, { id: "b", title: "ب", fireAt: [clock.t - MIN] }]);
  svc.setReminders(SUB(2).endpoint, [{ id: "c", title: "ج", fireAt: [clock.t - MIN] }]);
  let calls = 0;
  setBehaviour(async (sub) => { calls++; if (sub.endpoint.endsWith("abc1")) { const e = new Error("gone"); e.statusCode = 410; throw e; } });
  await svc.tick();
  assert.equal(svc.stats().subscriptions, 1);
  assert.equal(calls, 2, "بعد از ۴۱۰ برای همان اشتراک دوباره تلاش نمی‌شود");
  assert.deepEqual(sent.map((s) => s.payload.id), ["c"]);
});
test("خطای موقت: تا ۳ بار تلاش و بعد رها", async () => {
  const { svc, clock, sent, setBehaviour } = make();
  svc.subscribe(SUB());
  svc.setReminders(SUB().endpoint, [{ id: "r1", title: "الف", fireAt: [clock.t - MIN] }]);
  let n = 0;
  setBehaviour(async () => { n++; const e = new Error("boom"); e.statusCode = 503; throw e; });
  for (let i = 0; i < 6; i++) await svc.tick();
  assert.equal(n, LIMITS.maxAttempts);
  assert.equal(sent.length, 0);
});
test("محدودیت‌ها: عنوان بلند بریده می‌شود، ورودی خراب نادیده گرفته می‌شود", () => {
  const { svc, clock } = make();
  svc.subscribe(SUB());
  const r = svc.setReminders(SUB().endpoint, [
    { id: "ok", title: "x".repeat(1000), fireAt: [clock.t + MIN] },
    { id: "", title: "بدون شناسه", fireAt: [clock.t] }, { id: "n", title: "", fireAt: [clock.t] }, { id: "f", title: "بدون زمان", fireAt: ["abc"] }, null, 5,
  ]);
  assert.equal(r.count, 1);
  assert.throws(() => svc.setReminders(SUB().endpoint, new Array(LIMITS.reminders + 1).fill({})), PushError);
});
test("اعلان آزمایشی و لغو اشتراک", async () => {
  const { svc, sent } = make();
  svc.subscribe(SUB());
  await svc.sendTest(SUB().endpoint);
  assert.equal(sent[0].payload.tag, "cafino-test");
  assert.equal(svc.unsubscribe(SUB().endpoint), true);
  assert.equal(svc.unsubscribe(SUB().endpoint), false);
  await assert.rejects(() => svc.sendTest(SUB().endpoint), PushError);
});
