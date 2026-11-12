import test from "node:test";
import assert from "node:assert/strict";
import { runTransaction, afterCommit, inTransaction, recordBeforeWrite } from "../data/transaction.js";
import { writeJsonValue, removeStorageValue } from "../data/localRepository.js";

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

test("commit keeps every write and runs afterCommit once, in order", () => {
  const st = mem({ a: '"1"' }); const log = [];
  const r = runTransaction("t", () => { writeJsonValue("a", 2, { storage: st }); writeJsonValue("b", 3, { storage: st }); afterCommit(() => log.push("x")); afterCommit(() => log.push("y")); assert.equal(log.length, 0); return { ok: true }; });
  assert.equal(r.ok, true); assert.equal(st.getItem("a"), "2"); assert.equal(st.getItem("b"), "3"); assert.deepEqual(log, ["x", "y"]);
});

test("exception restores changed, created and removed keys and drops afterCommit work", () => {
  const st = mem({ a: '"old"', gone: '"keep"' }); let ran = false;
  const r = runTransaction("t", () => { writeJsonValue("a", "new", { storage: st }); writeJsonValue("fresh", 1, { storage: st }); removeStorageValue("gone", { storage: st }); afterCommit(() => { ran = true; }); throw new Error("boom"); });
  assert.equal(r.ok, false); assert.equal(r.rolledBack, true); assert.equal(r.error.message, "boom");
  assert.equal(st.getItem("a"), '"old"'); assert.equal(st.getItem("fresh"), null); assert.equal(st.getItem("gone"), '"keep"'); assert.equal(ran, false);
});

test("a business refusal {ok:false} also rolls back and returns the refusal", () => {
  const st = mem({ a: "1" });
  const r = runTransaction("t", () => { writeJsonValue("a", 9, { storage: st }); return { ok: false, error: "نه" }; });
  assert.equal(r.ok, true); assert.equal(r.rolledBack, true); assert.deepEqual(r.value, { ok: false, error: "نه" }); assert.equal(st.getItem("a"), "1");
});

test("a failing write (quota) in the middle undoes the earlier writes", () => {
  const st = mem({ a: "1", b: "1" });
  const real = st.setItem; st.setItem = (k, v) => { if (k === "c") throw new Error("QuotaExceeded"); return real(k, v); };
  const r = runTransaction("t", () => { writeJsonValue("a", 2, { storage: st }); writeJsonValue("b", 2, { storage: st }); const w = writeJsonValue("c", 2, { storage: st }); if (!w.ok) throw w.error; });
  assert.equal(r.ok, false); assert.equal(st.getItem("a"), "1"); assert.equal(st.getItem("b"), "1"); assert.equal(st.getItem("c"), null);
});

test("nested transactions join the outer one; outer failure undoes the inner writes", () => {
  const st = mem({ a: "1" });
  const r = runTransaction("outer", () => {
    runTransaction("inner", () => { writeJsonValue("a", 2, { storage: st }); });
    assert.equal(inTransaction(), true);
    throw new Error("late");
  });
  assert.equal(r.ok, false); assert.equal(st.getItem("a"), "1"); assert.equal(inTransaction(), false);
});

test("outside a transaction afterCommit runs immediately and recordBeforeWrite is a no-op", () => {
  let n = 0; afterCommit(() => { n++; }); recordBeforeWrite("x", mem()); assert.equal(n, 1);
});
