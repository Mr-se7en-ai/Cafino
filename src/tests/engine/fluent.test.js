// طراحی Fluent — تنظیمات و نرمال‌سازی
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });

test("Fluent: تنظیمات پیش‌فرض، نرمال‌سازی و ذخیرهٔ ناقص", () => {
  assert.deepEqual(E.normalizeFluent(null), { on: true, acrylic: true, reveal: true });
  // یک تنظیم واحد: acrylic و reveal همیشه با on برابرند (دادهٔ قدیمی با کلیدهای جداگانه هم یکدست می‌شود)
  assert.deepEqual(E.normalizeFluent({ on: false, reveal: false }), { on: false, acrylic: false, reveal: false });
  assert.deepEqual(E.normalizeFluent({ on: true, acrylic: false, reveal: false }), { on: true, acrylic: true, reveal: true });
  assert.deepEqual(E.getFluent(), { on: true, acrylic: true, reveal: true });
  globalThis.localStorage.setItem("cafenet_fluent", "garbage{");
  assert.deepEqual(E.getFluent(), { on: true, acrylic: true, reveal: true });
});
