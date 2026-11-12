// fetch و localStorage باید پیش از import کلاینت جایگزین شوند (کلاینت پیش‌فرض fetch را هنگام import می‌گیرد).
import test from "node:test";
import assert from "node:assert/strict";

const calls = [];
globalThis.localStorage = { getItem: () => JSON.stringify({ baseUrl: "http://x", cafeId: "c" }), setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: { echoed: true } }) }; };
const { finance } = await import("../finance/financeApi.js");

test("financeApi: بدنهٔ درخواست آبجکتِ یک‌بارJSON است (نه رشتهٔ دوباره‌JSON) و پوشش data یک‌بار برداشته می‌شود", async () => {
  const r = await finance.requestCorrection({ scope: ["invoices"], reason: "دلیل کافی" });
  assert.deepEqual(r, { echoed: true });
  assert.match(calls[0].url, /\/api\/integrity\/corrections$/); assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { scope: ["invoices"], reason: "دلیل کافی" });
  await finance.closeShift("sh 1", { countedCash: 5, note: "n" });
  assert.match(calls[1].url, /\/api\/shifts\/sh%201\/close$/); assert.deepEqual(JSON.parse(calls[1].init.body), { countedCash: 5, note: "n" });
  await finance.shifts({ limit: 20, status: "" }); assert.match(calls[2].url, /\/api\/shifts\?limit=20$/);
  await finance.savePermissions({ roles: {}, users: {}, limits: {}, version: 2 }); assert.equal(calls[3].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[3].init.body), { roles: {}, users: {}, limits: {}, version: 2 });
});
