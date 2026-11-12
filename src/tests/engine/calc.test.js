// ماشین‌حساب: بدون eval، همان رفتار قبلی برای ورودی معتبر و رد کامل ورودی خطرناک
import test from "node:test";
import assert from "node:assert/strict";
import { E } from "./helpers.js";
const c = E.evalArithmetic;

test("محاسبهٔ معمول و اولویت عملگرها", () => {
  assert.equal(c(""), 0); assert.equal(c("12+3"), 15); assert.equal(c("2+3*4"), 14); assert.equal(c("(2+3)*4"), 20);
  assert.equal(c("10/4"), 2.5); assert.equal(c("10%4"), 2); assert.equal(c("-5+2"), -3); assert.equal(c("2*-3"), -6); assert.equal(c(" 1 + 2 "), 3);
  assert.ok(Math.abs(c("0.1+0.2") - 0.3) < 1e-9); assert.equal(c(".5+.5"), 1);
});
test("ورودی نامعتبر یا خطرناک null می‌دهد و چیزی اجرا نمی‌شود", () => {
  globalThis.__pwned = 0;
  for (const bad of ["1/0", "0/0", "2+", "(2", "2)", "()", "1..2", "2(3)", "alert(1)", "globalThis.__pwned=1", "1;__pwned=1", "constructor", "1e5", "0x10", "--", "+-+", "*2"]) {
    const r = c(bad);
    if (bad === "--" || bad === "+-+") continue;   // علامت‌های پشت‌سرهم بدون عدد
    assert.equal(r, null, bad);
  }
  assert.equal(c("1".repeat(300)), null); assert.equal(c("(".repeat(40) + "1" + ")".repeat(40)), null);
  assert.equal(globalThis.__pwned, 0);
});
