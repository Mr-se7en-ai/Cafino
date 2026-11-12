// انتقال یک‌بارهٔ دادهٔ موجود: ترتیب وابستگی، کلیدهای Idempotency هم‌ارز ارسال زنده، حذف عکس‌ها، تراکنش‌های خودکار دوبار شمرده نمی‌شوند
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { E, fresh } from "./helpers.js";

beforeEach(() => { fresh(); });
after(() => { E.syncQueue.pause(); });
const raw = () => ({
  customers: E.lsRead("cafenet_customers", []),
  inventory: E.lsRead("cafenet_inventory", []),
  sales: [], orders: [], transactions: [], obligations: [],
});

test("برنامهٔ انتقال: مشتری و کالا، فاکتور/پرداخت وابسته، سفارش، فقط تراکنش دستی", () => {
  const r = E.createSale({ customerId: 1, date: "2026-10-30", items: [{ desc: "پرینت", qty: 2, price: 100000 }], payments: [{ method: "cash", amount: 100000 }] });
  assert.ok(r.ok !== false);
  const sales = E.getSales();
  const ops = E.buildUploadOps({ ...raw(), sales, transactions: [
    { id: "t1", type: "income", amount: 500, date: "2026-10-30", category: "x" },
    { id: "auto", type: "income", amount: 100000, saleId: sales[0].id, date: "2026-10-30" }], orders: [{ id: "o1", customerId: 1, title: "سفارش", amount: 1, status: "new" }] });
  const by = (res) => ops.filter((o) => o.resource === res);
  assert.equal(by("customers").length, 2); assert.equal(by("inventory").length, 2);
  assert.equal(by("invoices").length, 1); assert.equal(by("payments").length, 1);
  assert.deepEqual(by("transactions").map((o) => o.entityId), ["t1"], "درآمد حاصل از فاکتور دوباره ارسال نمی‌شود");
  const inv = by("invoices")[0], pay = by("payments")[0];
  assert.equal(inv.idem, `invoice-${sales[0].invoiceId}`); assert.deepEqual(inv.dependsOn, ["customers:1"]);
  assert.deepEqual(pay.dependsOn, [`invoices:${sales[0].invoiceId}`]);
  assert.deepEqual(by("orders")[0].dependsOn, ["customers:1"]);
  const order = ops.map((o) => o.resource); assert.ok(order.indexOf("customers") < order.indexOf("invoices") && order.indexOf("invoices") < order.indexOf("payments"));
});

test("حذف عکس مرجع، ابطال‌شده بدون پرداخت، حالت بدون مالی فقط مشتری/کالا", () => {
  const ops = E.buildUploadOps({ customers: [{ id: 5, firstName: "x", photo: "idb:photo:abc" }, { id: 6, firstName: "y", photo: "data:image/png;base64,AA" }], inventory: [], sales: [{ id: "s", invoiceId: "i1", number: "1", customerId: 5, cancelled: true, lines: [], payments: [{ id: "p", method: "cash", amount: 1 }], total: 5, date: "2026-10-30" }] });
  assert.equal(ops.find((o) => o.entityId === "5").body.photo, undefined);
  assert.ok(ops.find((o) => o.entityId === "6").body.photo);
  assert.equal(ops.filter((o) => o.resource === "payments").length, 0); assert.equal(ops.find((o) => o.resource === "invoices").body.status, undefined, "وضعیت از کلاینت فرستاده نمی‌شود"); assert.ok(ops.some((o) => o.resource === "invoices" && o.action === "command" && o.meta.path === "/api/invoices/i1/void"));
  assert.deepEqual(Object.keys(E.countByResource(E.buildUploadOps({ customers: [{ id: 1 }], sales: [{ id: "s", invoiceId: "i", lines: [] }] }, { finance: false }))), ["customers"]);
});

test("اجرا: بدون سرور چیزی در صف نمی‌رود؛ با سرور همه در صف و ثبت آخرین انتقال", async () => {
  const none = await E.runInitialUpload(raw);
  assert.equal(none.queued, 0); assert.ok(none.total >= 4);
  E.saveApiConfig({ baseUrl: "http://srv.test", cafeId: "" }); E.setAuthenticatedUser({ id: "u", email: "a@b.c" });
  await E.syncQueue.clearAll(); E.syncQueue.pause("test");        // فقط صف را بررسی می‌کنیم، ارسال واقعی نمی‌خواهیم
  const r = await E.runInitialUpload(raw);
  assert.equal(r.queued, r.total); assert.equal(E.syncQueue.list().length, r.total);
  assert.ok(E.lastUpload().at);
  await E.runInitialUpload(raw);                                  // تکرار: همان کلیدهای idem → صف تکراری نمی‌سازد
  assert.equal(E.syncQueue.list().length, r.total, "اجرای دوباره صف را بزرگ‌تر نمی‌کند");
});
