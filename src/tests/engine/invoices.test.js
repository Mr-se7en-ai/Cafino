import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, item, stockOf } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const cash = (n) => [{ method: "cash", amount: n }];
const invoices = () => E.lsRead("cafenet_invoices", []);

test("شمارهٔ فاکتور پشت‌سرهم و یکتاست", () => {
  const nums = [1, 2, 3, 4, 5].map(() => E.createSale({ customerId: 1, items: [item()], payments: cash(100000) }).sale.number);
  assert.deepEqual(nums, ["0001", "0002", "0003", "0004", "0005"]);
  assert.equal(new Set(invoices().map((i) => i.number)).size, 5);
});

test("شمارهٔ تکراری پذیرفته نمی‌شود: به‌جای آن شمارهٔ بعدی داده می‌شود", () => {
  E.createSale({ customerId: 1, items: [item()], payments: cash(100000) });
  const dup = E.createSale({ customerId: 1, items: [item()], payments: cash(100000), number: "0001" });
  assert.equal(dup.sale.number, "0002");
  assert.equal(new Set(invoices().map((i) => i.number)).size, 2);
});

test("شمارهٔ فاکتور ابطال‌شده دوباره صادر نمی‌شود", () => {
  const a = E.createSale({ customerId: 1, items: [item()], payments: cash(100000) });
  const b = E.createSale({ customerId: 1, items: [item()], payments: cash(100000) });
  E.cancelSale(b.sale.id, "x");
  const c = E.createSale({ customerId: 1, items: [item()], payments: cash(100000) });
  assert.equal(a.sale.number, "0001"); assert.equal(b.sale.number, "0002"); assert.equal(c.sale.number, "0003");
});

test("ویرایش فاکتور: شمارهٔ فاکتور و شناسه تغییر نمی‌کند، تاریخچهٔ ویرایش‌ها انباشته می‌شود", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: cash(100000) });
  E.reviseSale(sale.id, { customerId: 1, items: [item({ price: 120000 })], payments: cash(100000) }, "اول");
  E.reviseSale(sale.id, { customerId: 1, items: [item({ price: 90000 })], payments: cash(90000) }, "دوم");
  const inv = invoices();
  assert.equal(inv.length, 1); assert.equal(inv[0].number, "0001"); assert.equal(String(inv[0].id), String(sale.invoiceId));
  assert.equal(inv[0].revisions.length, 2); assert.deepEqual(inv[0].revisions.map((r) => r.reason), ["اول", "دوم"]);
  assert.equal(inv[0].totalAmount, 90000); assert.equal(inv[0].status, "paid");
});

test("ابطال فاکتور (لغو فروش): از دفاتر خارج، در بایگانی با دلیل ثبت و شماره مصرف‌شده می‌ماند", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item()], payments: cash(100000) });
  E.cancelSale(sale.id, "درخواست مشتری");
  assert.equal(invoices().length, 0);
  const v = E.getVoided()[0];
  assert.equal(v.reason, "درخواست مشتری"); assert.equal(String(v.number), "0001");
  assert.equal(E.nextInvNum(invoices()), "0002");
});

test("صدور مجدد: فاکتور باطل‌شده با مبلغ درست دوباره صادر می‌شود، فقط یک فاکتور فعال می‌ماند و درآمد دوبار شمرده نمی‌شود", () => {
  const first = E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: cash(100000) });
  E.cancelSale(first.sale.id, "مبلغ اشتباه");
  const again = E.createSale({ customerId: 1, items: [item({ price: 80000 })], payments: cash(80000) });
  assert.equal(invoices().length, 1); assert.equal(again.sale.number, "0002");
  assert.equal(E.lsRead("cafenet_tx3", []).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0), 80000);
});

test("ابطال فاکتور دستی: موجودی برمی‌گردد؛ بازگردانی دوباره کسر می‌کند و دوبار بازگردانی ممکن نیست", () => {
  const iv = { id: 777, number: "0099", customerName: "x", totalAmount: 5000, stockUsed: [{ itemId: 101, qty: 10 }] };
  E.lsWrite("cafenet_inventory", E.lsRead("cafenet_inventory", []).map((s) => (s.id === 101 ? { ...s, qty: 90 } : s)));
  E.voidInvoice(iv, "تست");
  assert.equal(stockOf(101).qty, 100);
  const rec = E.getVoided()[0];
  assert.equal(E.restoreVoided(rec.id).ok, true);
  assert.equal(stockOf(101).qty, 90); assert.equal(invoices().some((i) => i.id === 777), true);
  assert.equal(E.restoreVoided(rec.id).ok, false);
  assert.equal(stockOf(101).qty, 90);
});

test("بازگردانی فاکتور ابطال‌شده وقتی موجودی کافی نیست رد می‌شود و چیزی تغییر نمی‌کند", () => {
  const iv = { id: 778, number: "0100", customerName: "x", totalAmount: 5000, stockUsed: [{ itemId: 102, qty: 2 }] };
  E.voidInvoice(iv, "تست");                              // toner 3 → 5
  E.lsWrite("cafenet_inventory", E.lsRead("cafenet_inventory", []).map((s) => (s.id === 102 ? { ...s, qty: 1 } : s)));
  const r = E.restoreVoided(E.getVoided()[0].id);
  assert.equal(r.ok, false); assert.equal(stockOf(102).qty, 1); assert.equal(invoices().some((i) => i.id === 778), false);
});

test("پرداخت‌ها در فاکتور منعکس می‌شود: وضعیت unpaid → partial → paid", () => {
  const { sale } = E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: [] });
  const st = () => invoices().find((i) => String(i.id) === String(sale.invoiceId));
  assert.equal(st().status, "unpaid");
  E.receiveSalePayment(sale.id, 40000, "cash"); assert.equal(st().status, "partial"); assert.equal(st().paidAmount, 40000);
  E.receiveSalePayment(sale.id, 60000, "pos");  assert.equal(st().status, "paid"); assert.equal(st().remainingAmount, 0);
  assert.deepEqual([...new Set(st().paymentMethods)].sort(), ["cash", "pos"]);
});
