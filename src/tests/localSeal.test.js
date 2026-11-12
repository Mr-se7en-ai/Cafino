import test from "node:test";
import assert from "node:assert/strict";
import { createSealer, computeSealHash, SEAL_KEYS } from "../services/security/localSeal.js";

const fakeBridge = () => {
  let sealed = null; const log = [];
  return { log, get sealed() { return sealed; }, set sealed(v) { sealed = v; }, seal: {
    verify: async (h) => { log.push("verify"); return sealed === null ? { status: "none" } : { status: sealed === h ? "ok" : "mismatch" }; },
    set: async (h) => { log.push("set"); sealed = h; return { ok: true }; },
  } };
};
const mkStore = (init = {}) => { const m = { ...init }; return { m, read: (k) => (k in m ? m[k] : null) }; };
const noTimers = { setInterval: () => 1, clearInterval: () => {} };

test("هش دادهٔ مالی: ثابت، وابسته به مقدار و مرز مقدارها (ab|c ≠ a|bc)", async () => {
  const a = await computeSealHash(mkStore({ cafenet_sales: "[1]" }).read), b = await computeSealHash(mkStore({ cafenet_sales: "[1]" }).read);
  assert.equal(a, b); assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await computeSealHash(mkStore({ cafenet_sales: "[2]" }).read));
  assert.notEqual(await computeSealHash(mkStore({ cafenet_sales: "ab", cafenet_orders: "c" }).read), await computeSealHash(mkStore({ cafenet_sales: "a", cafenet_orders: "bc" }).read));
  assert.notEqual(await computeSealHash(mkStore({}).read), await computeSealHash(mkStore({ cafenet_sales: "" }).read), "نبودن با خالی‌بودن فرق دارد");
  assert.ok(SEAL_KEYS.includes("cafenet_ledger2") && SEAL_KEYS.includes("cafenet_tx3") && !SEAL_KEYS.includes("cafenet_theme"));
});
test("اولین اجرا مهر می‌زند؛ تغییر در برنامه دوباره مهر می‌شود؛ بازشدن بعدی ok", async () => {
  const br = fakeBridge(), st = mkStore({ cafenet_sales: "[1]" }); const states = [];
  const s1 = createSealer({ bridge: br, read: st.read, timers: noTimers, listen: false, onState: (x) => states.push(x.status) });
  assert.equal((await s1.start()).status, "ok"); assert.ok(br.sealed);
  st.m.cafenet_sales = "[1,2]"; assert.equal(await s1.sealNow(), true);       // تیک زمان‌بندی (تغییر مجاز داخل برنامه)
  const s2 = createSealer({ bridge: br, read: st.read, timers: noTimers, listen: false });
  assert.equal((await s2.start()).status, "ok"); assert.equal(s2.state().firstSeal, false);
});
test("ویرایش بیرونی دادهٔ مالی وقتی برنامه بسته بود → mismatch؛ مهر بازنویسی نمی‌شود تا مالک بپذیرد", async () => {
  const br = fakeBridge(), st = mkStore({ cafenet_sales: "[1]", cafenet_tx3: "[]" });
  await createSealer({ bridge: br, read: st.read, timers: noTimers, listen: false }).start();
  const before = br.sealed;
  st.m.cafenet_tx3 = '[{"amount":1}]';                                          // ویرایش دستی خارج از برنامه
  const s = createSealer({ bridge: br, read: st.read, timers: noTimers, listen: false });
  assert.equal((await s.start()).status, "mismatch");
  assert.equal(br.sealed, before, "تا پذیرش، مهر عوض نمی‌شود");
  assert.equal(await s.accept(), true); assert.equal(s.state().status, "ok"); assert.notEqual(br.sealed, before);
});
test("بدون پل/بدون ذخیرهٔ امن (وب، لینوکس بدون libsecret) → خاموش و بی‌خطر", async () => {
  assert.equal((await createSealer({ bridge: null, timers: noTimers, listen: false }).start()).status, "off");
  const br = { seal: { verify: async () => ({ status: "unavailable" }), set: async () => ({ ok: false }) } };
  const s = createSealer({ bridge: br, read: () => null, timers: noTimers, listen: false });
  assert.equal((await s.start()).status, "off");
  const bad = { seal: { verify: async () => { throw new Error("x"); }, set: async () => ({}) } };
  assert.equal((await createSealer({ bridge: bad, read: () => null, timers: noTimers, listen: false }).start()).status, "off");
});

