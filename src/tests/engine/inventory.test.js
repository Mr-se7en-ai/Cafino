import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, item, stockOf, expenseTotal, incomeTotal } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const paper = (qty, extra = {}) => item({ desc: "پرینت", price: 2000, qty, stockId: 101, stockQty: qty, ...extra });

test("موجودی کافی: مقدار کسر می‌شود و هزینهٔ مستقیم (قیمت خرید × تعداد) ثبت می‌شود", () => {
  const r = E.createSale({ customerId: 1, items: [paper(10)], payments: [{ method: "cash", amount: 20000 }] });
  assert.equal(r.ok, true); assert.deepEqual(r.warnings, []);
  assert.equal(stockOf(101).qty, 90);
  assert.equal(r.sale.stockUsed.length, 1); assert.equal(r.sale.stockUsed[0].qty, 10);
  assert.equal(expenseTotal(), 10 * 500);
});

test("موجودی ناکافی: فقط همان مقدارِ موجود کسر می‌شود، هشدار می‌دهد و هرگز منفی نمی‌شود", () => {
  const r = E.createSale({ customerId: 1, items: [item({ desc: "تونر", price: 300000, qty: 5, stockId: 102, stockQty: 5 })], payments: [{ method: "cash", amount: 1500000 }] });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("کافی نبود")));       // shortage warning (+ a low-stock alert)
  assert.equal(stockOf(102).qty, 0);
  assert.equal(r.sale.stockUsed[0].qty, 3);
  assert.equal(expenseTotal(), 3 * 200000);
});

test("کالای ناموجود در انبار: فروش انجام می‌شود و چیزی کسر نمی‌شود", () => {
  const r = E.createSale({ customerId: 1, items: [item({ stockId: 99999, stockQty: 2 })], payments: [{ method: "cash", amount: 100000 }] });
  assert.equal(r.ok, true); assert.equal(r.sale.stockUsed.length, 0);
  assert.equal(stockOf(101).qty, 100);
});

test("لغو فروش: موجودی دقیقاً برمی‌گردد و هزینهٔ مستقیم حذف می‌شود", () => {
  const { sale } = E.createSale({ customerId: 1, items: [paper(25)], payments: [{ method: "cash", amount: 50000 }] });
  assert.equal(stockOf(101).qty, 75);
  E.cancelSale(sale.id, "x");
  assert.equal(stockOf(101).qty, 100); assert.equal(expenseTotal(), 0); assert.equal(incomeTotal(), 0);
});

test("لغوِ فروشِ با موجودی ناکافی فقط مقدار واقعاً کسرشده را برمی‌گرداند (نه بیشتر)", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item({ desc: "تونر", price: 300000, qty: 5, stockId: 102, stockQty: 5 })], payments: [] });
  assert.equal(stockOf(102).qty, 0);
  E.cancelSale(sale.id, "x");
  assert.equal(stockOf(102).qty, 3);
});

test("ویرایش مقدار مصرف: افزایش و کاهش، موجودی نهایی = اولیه − مصرف جدید (بدون دوباره‌کسری)", () => {
  const { sale } = E.createSale({ customerId: 1, items: [paper(10)], payments: [] });
  assert.equal(stockOf(101).qty, 90);
  let r = E.reviseSale(sale.id, { customerId: 1, items: [paper(30)], payments: [] }, "بیشتر");
  assert.equal(r.ok, true); assert.equal(stockOf(101).qty, 70); assert.equal(expenseTotal(), 30 * 500);
  r = E.reviseSale(sale.id, { customerId: 1, items: [paper(4)], payments: [] }, "کمتر");
  assert.equal(r.ok, true); assert.equal(stockOf(101).qty, 96); assert.equal(expenseTotal(), 4 * 500);
  E.cancelSale(sale.id, "x");
  assert.equal(stockOf(101).qty, 100);
});

test("ویرایش نامعتبر موجودی را تغییر نمی‌دهد", () => {
  const { sale } = E.createSale({ customerId: 1, items: [paper(10)], payments: [] });
  const r = E.reviseSale(sale.id, { customerId: 1, items: [], payments: [] }, "bad");
  assert.equal(r.ok, false); assert.equal(stockOf(101).qty, 90);
});

test("دو فروش پشت‌سرهم از یک کالا: مجموع کسر درست است", () => {
  E.createSale({ customerId: 1, items: [paper(40)], payments: [] });
  E.createSale({ customerId: 2, items: [paper(35)], payments: [] });
  assert.equal(stockOf(101).qty, 25);
});

test("خرابی وسط ثبت فروش: موجودی، درآمد و همه‌چیز به حالت قبل برمی‌گردد", () => {
  const setItem = globalThis.__storage.setItem.bind(globalThis.__storage);
  globalThis.__storage.setItem = (k, v) => { if (k === "cafenet_tx3") throw new Error("QuotaExceededError"); return setItem(k, v); };   // the LAST write of a sale fails
  try {
    const snap = JSON.stringify([...globalThis.__storage.m].filter(([k]) => k !== "cafenet_error_log"));
    const r = E.createSale({ customerId: 1, items: [paper(10)], payments: [{ method: "cash", amount: 20000 }] });
    assert.equal(r.ok, false);
    assert.equal(JSON.stringify([...globalThis.__storage.m].filter(([k]) => k !== "cafenet_error_log")), snap);
    assert.equal(stockOf(101).qty, 100);
  } finally { globalThis.__storage.setItem = setItem; }
});
