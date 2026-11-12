// نمایشگر زوم تصویر: ریاضی جابه‌جایی و زوم حول نقطه
import test from "node:test";
import assert from "node:assert/strict";
import * as Z from "../../app/components/zoomMath.js";

const CW = 400, CH = 300, NW = 1000, NH = 2000;                // تصویر بلند در کادر افقی
test("fitSize و حدود مقیاس", () => {
  const f = Z.fitSize(CW, CH, NW, NH); assert.equal(f.h, 300); assert.equal(f.w, 150);
  assert.equal(Z.clampScale(0.2), 1); assert.equal(Z.clampScale(50), 8); assert.equal(Z.clampScale(NaN), 1); assert.equal(Z.clampScale(3), 3);
});
test("clampPan: در s=1 جابه‌جایی صفر؛ با زوم فقط به‌اندازهٔ اضافهٔ تصویر", () => {
  assert.deepEqual(Z.clampPan({ s: 1, tx: 99, ty: -99 }, CW, CH, NW, NH), { s: 1, tx: 0, ty: 0 });
  const c = Z.clampPan({ s: 4, tx: 9999, ty: -9999 }, CW, CH, NW, NH);      // عرض تصویر ۶۰۰ > ۴۰۰ → حداکثر ۱۰۰؛ ارتفاع ۱۲۰۰ → ۴۵۰
  assert.equal(c.tx, 100); assert.equal(c.ty, -450);
});
test("zoomAt: نقطهٔ زیر انگشت/ماوس ثابت می‌ماند (در حد clamp)", () => {
  const v0 = { s: 1, tx: 0, ty: 0 }, px = 40, py = -60;
  const v1 = Z.zoomAt(v0, 3, px, py, CW, CH, 400, 300);                     // تصویر هم‌نسبت کادر → clamp آزاد
  const c0 = { x: (px - v0.tx) / v0.s, y: (py - v0.ty) / v0.s }, c1 = { x: (px - v1.tx) / v1.s, y: (py - v1.ty) / v1.s };
  assert.ok(Math.abs(c0.x - c1.x) < 1e-9 && Math.abs(c0.y - c1.y) < 1e-9);
  assert.equal(Z.zoomAt(v0, 100, 0, 0, CW, CH, NW, NH).s, 8, "سقف زوم");
  assert.equal(Z.zoomAt({ s: 2, tx: 0, ty: 0 }, 0.1, 0, 0, CW, CH, NW, NH).s, 1, "کف زوم");
});
test("fitWidth: عرض تصویر = عرض کادر و بالای برگه دیده می‌شود", () => {
  const v = Z.fitWidth(CW, CH, NW, NH); const f = Z.fitSize(CW, CH, NW, NH);
  assert.ok(Math.abs(f.w * v.s - CW) < 1e-9);
  assert.equal(v.tx, 0); assert.ok(v.ty > 0, "تصویر پایین‌تر آمده تا لبهٔ بالا دیده شود");
  assert.equal(v.ty, (f.h * v.s - CH) / 2);
  const wideImg = Z.fitWidth(CW, CH, 2000, 500); assert.equal(wideImg.s, 1, "تصویر پهن از قبل عرض‌کامل است");
});
