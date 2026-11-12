// Sales engine — runs the REAL createSale / receiveSalePayment / cancelSale / reviseSale against an in-memory localStorage.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, item, incomeTotal, expenseTotal, ledgerDebt, customer } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const invoiceOf = (sale) => E.lsRead("cafenet_invoices", []).find((i) => String(i.id) === String(sale.invoiceId));
const ordersOf = (sale) => E.lsRead("cafenet_orders", []).filter((o) => String(o.saleId) === String(sale.id));

test("فروش نقدی: کامل پرداخت، درآمد، فاکتور پرداخت‌شده، بدون بدهی", () => {
  const r = E.createSale({ customerId: 1, items: [item({ price: 100000, qty: 2 })], payments: [{ method: "cash", amount: 200000 }] });
  assert.equal(r.ok, true);
  assert.equal(r.sale.total, 200000); assert.equal(r.sale.paid, 200000); assert.equal(E.saleRemaining(r.sale), 0);
  assert.equal(incomeTotal(), 200000);
  assert.equal(invoiceOf(r.sale).status, "paid");
  assert.equal(ledgerDebt(1), 0);
  assert.equal(ordersOf(r.sale).length, 1);
  assert.equal(customer(1).serviceHistory.length, 1);
});

test("فروش اعتباری: هیچ درآمدی ثبت نمی‌شود و کل مبلغ بدهی مشتری است", () => {
  const r = E.createSale({ customerId: 2, items: [item({ price: 100000 })], payments: [] });
  assert.equal(r.ok, true);
  assert.equal(r.sale.paid, 0); assert.equal(E.saleRemaining(r.sale), 100000);
  assert.equal(incomeTotal(), 0);
  assert.equal(invoiceOf(r.sale).status, "unpaid");
  assert.equal(ledgerDebt(2), 100000);
});

test("فروش اعتباری به مشتری نقدی (بدون رکورد) رد می‌شود", () => {
  const r = E.createSale({ walkIn: true, items: [item({ price: 100000 })], payments: [] });
  assert.equal(r.ok, false);
  assert.equal(E.getSales().length, 0);
});

test("فروش نیمه‌پرداخت: درآمد = مبلغ پرداخت‌شده، بدهی = مانده", () => {
  const r = E.createSale({ customerId: 1, items: [item({ price: 100000, qty: 2 })], payments: [{ method: "cash", amount: 50000 }] });
  assert.equal(r.sale.paid, 50000); assert.equal(E.saleRemaining(r.sale), 150000);
  assert.equal(incomeTotal(), 50000);
  assert.equal(invoiceOf(r.sale).status, "partial");
  assert.equal(ledgerDebt(1), 150000);
});

test("پرداخت دوم و سوم: مانده، بدهی، فاکتور و درآمد با هم هماهنگ می‌مانند؛ پرداخت بیش از مانده بریده می‌شود", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item({ price: 100000, qty: 2 })], payments: [{ method: "cash", amount: 50000 }] });
  let r = E.receiveSalePayment(sale.id, 80000, "cash");
  assert.deepEqual([r.ok, r.received, r.remaining], [true, 80000, 70000]);
  assert.equal(ledgerDebt(1), 70000); assert.equal(incomeTotal(), 130000); assert.equal(invoiceOf(sale).status, "partial");
  r = E.receiveSalePayment(sale.id, 999999, "cash");                    // more than what is left
  assert.deepEqual([r.ok, r.received, r.remaining], [true, 70000, 0]);
  assert.equal(ledgerDebt(1), 0); assert.equal(incomeTotal(), 200000); assert.equal(invoiceOf(sale).status, "paid");
  assert.equal(E.getSale(sale.id).payments.filter((p) => p.method === "cash").length, 3);
  r = E.receiveSalePayment(sale.id, 10, "cash");                        // already settled
  assert.equal(r.ok, false);
  assert.equal(incomeTotal(), 200000);
});

test("پرداخت با مبلغ صفر یا منفی یا فروش ناموجود رد می‌شود", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: [] });
  assert.equal(E.receiveSalePayment(sale.id, 0, "cash").ok, false);
  assert.equal(E.receiveSalePayment(sale.id, -5, "cash").ok, false);
  assert.equal(E.receiveSalePayment(987654321, 5, "cash").ok, false);
  assert.equal(incomeTotal(), 0);
});

test("بخشودگی: از مانده کم می‌شود ولی درآمد نمی‌سازد", () => {
  const { sale } = E.createSale({ customerId: 2, items: [item({ price: 100000 })], payments: [] });
  const r = E.receiveSalePayment(sale.id, 30000, "free");
  assert.deepEqual([r.ok, r.waived, r.remaining], [true, true, 70000]);
  assert.equal(incomeTotal(), 0);
  assert.equal(invoiceOf(sale).waivedAmount, 30000);
  assert.equal(ledgerDebt(2), 70000);
  E.receiveSalePayment(sale.id, 70000, "cash");
  assert.equal(E.saleRemaining(E.getSale(sale.id)), 0); assert.equal(incomeTotal(), 70000); assert.equal(invoiceOf(sale).status, "paid");
});

test("پرداخت از کیف پول: موجودی کم می‌شود و بیش از موجودی کسر نمی‌شود", () => {
  E = fresh({ wallet: 40000 });
  const { sale } = E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: [] });
  const r = E.receiveSalePayment(sale.id, 100000, "wallet");
  assert.equal(r.received, 40000); assert.equal(customer(1).wallet, 0);
  assert.equal(E.receiveSalePayment(sale.id, 1000, "wallet").ok, false);  // wallet is empty now
});

test("لغو فروش: درآمد، بدهی، فاکتور، سفارش و سابقه حذف و در بایگانی ابطال ثبت می‌شود", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item({ price: 100000, qty: 2 })], payments: [{ method: "cash", amount: 50000 }] });
  const r = E.cancelSale(sale.id, "اشتباه");
  assert.equal(r.ok, true);
  assert.equal(E.getSales().length, 0); assert.equal(incomeTotal(), 0); assert.equal(ledgerDebt(1), 0);
  assert.equal(E.lsRead("cafenet_invoices", []).length, 0); assert.equal(E.lsRead("cafenet_orders", []).length, 0);
  assert.equal((customer(1).serviceHistory || []).length, 0);
  assert.equal(E.getVoided().length, 1); assert.equal(E.getVoided()[0].kind, "sale");
});

test("لغو دوباره یا لغوِ فروش ناموجود خطا می‌دهد و چیزی تغییر نمی‌کند", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item()], payments: [{ method: "cash", amount: 100000 }] });
  E.cancelSale(sale.id, "x");
  const before = JSON.stringify([...globalThis.__storage.m]);
  const r = E.cancelSale(sale.id, "x");
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify([...globalThis.__storage.m]), before);
});

test("لغو فروش پرداخت‌شده با کیف پول، موجودی کیف پول را برمی‌گرداند", () => {
  E = fresh({ wallet: 100000 });
  const { sale } = E.createSale({ customerId: 1, items: [item({ price: 60000 })], payments: [{ method: "wallet", amount: 60000 }] });
  assert.equal(customer(1).wallet, 40000);
  E.cancelSale(sale.id, "x");
  assert.equal(customer(1).wallet, 100000);
});

test("ویرایش فروش: شمارهٔ فاکتور و شناسه‌ها ثابت، مبالغ و بدهی بازمحاسبه، سابقهٔ ویرایش ثبت", () => {
  const { sale } = E.createSale({ customerId: 2, items: [item({ price: 100000 })], payments: [] });
  const r = E.reviseSale(sale.id, { customerId: 2, items: [item({ price: 50000, qty: 3 })], payments: [{ method: "cash", amount: 20000 }] }, "اصلاح");
  assert.equal(r.ok, true);
  assert.equal(r.sale.number, sale.number); assert.equal(r.sale.id, sale.id); assert.equal(r.sale.invoiceId, sale.invoiceId);
  assert.equal(r.sale.total, 150000); assert.equal(r.sale.paid, 20000);
  assert.equal(E.getSales().length, 1); assert.equal(E.lsRead("cafenet_invoices", []).length, 1);
  assert.equal(incomeTotal(), 20000); assert.equal(ledgerDebt(2), 130000);
  assert.equal(E.getSale(sale.id).revisions.length, 1); assert.equal(E.getSale(sale.id).revisions[0].prevTotal, 100000);
});

test("ویرایش نامعتبر (بدون ردیف) هیچ چیز را تغییر نمی‌دهد", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: [{ method: "cash", amount: 100000 }] });
  const before = JSON.stringify([...globalThis.__storage.m].filter(([k]) => k !== "cafenet_activity_log"));
  const r = E.reviseSale(sale.id, { customerId: 1, items: [], payments: [] }, "bad");
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify([...globalThis.__storage.m].filter(([k]) => k !== "cafenet_activity_log")), before);
});

test("مبلغ صفر، بدون ردیف و بدون مشتری رد می‌شوند", () => {
  assert.equal(E.createSale({ customerId: 1, items: [item({ price: 0 })], payments: [] }).ok, false);
  assert.equal(E.createSale({ customerId: 1, items: [], payments: [] }).ok, false);
  assert.equal(E.createSale({ items: [item()], payments: [] }).ok, false);
  assert.equal(E.getSales().length, 0);
});

test("تخفیف از جمع کم می‌شود و تخفیف بیشتر از جمع، فروش را خراب نمی‌کند", () => {
  const ok = E.createSale({ customerId: 1, items: [item({ price: 100000 })], discount: 10000, payments: [{ method: "cash", amount: 90000 }] });
  assert.equal(ok.sale.total, 90000); assert.equal(E.saleRemaining(ok.sale), 0);
  const bad = E.createSale({ customerId: 1, items: [item({ price: 100000 })], discount: 500000, payments: [] });
  assert.ok(bad.ok === false || bad.sale.total >= 0);
});

test("مجموع درآمد همیشه با جمع پرداخت‌های واقعی برابر است (بدون شمارش مضاعف)", () => {
  const a = E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: [{ method: "cash", amount: 30000 }, { method: "pos", amount: 20000 }] });
  E.receiveSalePayment(a.sale.id, 10000, "transfer");
  const b = E.createSale({ customerId: 2, items: [item({ price: 70000 })], payments: [{ method: "cash", amount: 70000 }] });
  const real = E.getSales().flatMap((s) => s.payments).filter((p) => p.method !== "free").reduce((s, p) => s + p.amount, 0);
  assert.equal(real, 130000); assert.equal(incomeTotal(), real);
  assert.equal(b.sale.paid, 70000);
});

test("شناسه‌ها یکتا هستند، حتی در صدها فروش پشت‌سرهم در یک میلی‌ثانیه", () => {
  const ids = new Set();
  for (let i = 0; i < 300; i++) ids.add(E.uid());
  assert.equal(ids.size, 300);
});
