import test from "node:test";
import assert from "node:assert/strict";
import { storageUsage } from "../data/storageUsage.js";

const fake = (obj) => { const k = Object.keys(obj); return { get length() { return k.length; }, key: (i) => k[i] ?? null, getItem: (x) => obj[x] ?? null }; };

test("storageUsage: فقط کلیدهای cafenet_ شمرده می‌شوند و سطح هشدار درست است", () => {
  const s = fake({ cafenet_sales: "x".repeat(600), cafenet_customers: "y".repeat(100), other: "z".repeat(99999) });
  const u = storageUsage(s, { quota: 1000 });
  assert.equal(u.chars, "cafenet_sales".length + 600 + "cafenet_customers".length + 100);
  assert.equal(u.level, "warn"); assert.equal(u.top[0].key, "cafenet_sales");
  assert.equal(storageUsage(fake({ cafenet_a: "x".repeat(50) }), { quota: 1000 }).level, "ok");
  assert.equal(storageUsage(fake({ cafenet_a: "x".repeat(950) }), { quota: 1000 }).level, "critical");
});
test("storageUsage: خطای دسترسی به storage هرگز پرتاب نمی‌شود", () => {
  const bad = { get length() { throw new Error("denied"); } };
  assert.equal(storageUsage(bad).level, "unknown");
});
