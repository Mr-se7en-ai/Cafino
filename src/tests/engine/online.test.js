// فروش آنلاین — کانال فروش داخل هسته مالی: فاکتور، حسابداری، انبار، گزارش، وضعیت پیگیری، برگشت
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, item, incomeTotal, expenseTotal, stockOf, ledgerDebt } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const txs = () => E.lsRead("cafenet_tx3", []);
const online = (o = {}) => ({ platform: "اینستاگرام", orderRef: "IG-77", carrier: "پست", trackingCode: "RR123", address: "تهران، خیابان آزادی", shippingCost: 30000, platformFee: 5000, ...o });
const sell = (extra = {}) => E.createSale({ customerId: 1, channel: "online", online: online(), items: [item({ desc: "کاغذ A4 بسته", price: 1000, qty: 50, stockId: 101, stockQty: 50 }), item({ desc: "هزینه ارسال", price: 40000, category: "ارسال" })], payments: [{ method: "transfer", amount: 90000 }], ...extra });

test("فروش آنلاین: کانال، اطلاعات پیگیری و آدرس روی فروش و فاکتور ثبت می‌شود", () => {
  const r = sell();
  assert.equal(r.ok, true);
  assert.equal(r.sale.channel, "online"); assert.equal(r.sale.source, "online");
  assert.equal(r.sale.online.platform, "اینستاگرام"); assert.equal(r.sale.online.status, "new");
  const inv = E.lsRead("cafenet_invoices", []).find((i) => String(i.id) === String(r.sale.invoiceId));
  assert.equal(inv.channel, "online"); assert.equal(inv.customerAddress, "تهران، خیابان آزادی"); assert.equal(inv.online.trackingCode, "RR123");
});

test("حسابداری: درآمد = مبلغ دریافتی؛ هزینه ارسال و کارمزد هزینهٔ مستقیم همین فروش‌اند و سود درست حساب می‌شود", () => {
  const r = sell();
  assert.equal(incomeTotal(), 90000);                       // 50×1000 + 40000 ارسال از مشتری
  const ship = txs().find((t) => t.category === "هزینه ارسال (فروش آنلاین)"), fee = txs().find((t) => t.category === "کارمزد فروش آنلاین");
  assert.equal(ship.amount, 30000); assert.equal(fee.amount, 5000);
  assert.equal(ship.saleId, r.sale.id);
  // هزینه = قیمت تمام‌شدهٔ کاغذ (50×500) + ارسال + کارمزد
  assert.equal(r.sale.costTotal, 25000 + 30000 + 5000);
  assert.equal(r.sale.profit.directCost, 60000); assert.equal(r.sale.profit.grossProfit, 90000 - 60000);
});

test("انبار: موجودی کالای فروش آنلاین کم می‌شود", () => {
  sell();
  assert.equal(stockOf(101).qty, 50);
});

test("فروش حضوری هیچ هزینهٔ آنلاینی ندارد و channel=store است", () => {
  const r = E.createSale({ customerId: 1, items: [item({ price: 50000 })], payments: [{ method: "cash", amount: 50000 }] });
  assert.equal(r.sale.channel, "store"); assert.equal(r.sale.online, null);
  assert.equal(txs().filter((t) => /آنلاین/.test(t.category)).length, 0);
});

test("online بدون channel نادیده گرفته می‌شود (ورودی ناقص هزینه نمی‌سازد)", () => {
  const r = E.createSale({ customerId: 1, online: online(), items: [item({ price: 50000 })], payments: [{ method: "cash", amount: 50000 }] });
  assert.equal(r.sale.channel, "store"); assert.equal(expenseTotal(), 0);
});

test("مقدارهای منفی/نامعتبر پاک‌سازی می‌شوند", () => {
  const n = E.normalizeOnline({ platform: "", shippingCost: -5, platformFee: "abc", status: "hack" });
  assert.deepEqual([n.platform, n.shippingCost, n.platformFee, n.status], ["سایر", 0, 0, "new"]);
});

test("ویرایش فاکتور آنلاین: کانال و پیگیری حفظ می‌شود و هزینه‌ها دوبار ثبت نمی‌شوند", () => {
  const r = sell();
  const rv = E.reviseSale(r.sale.id, { customerId: 1, items: [item({ desc: "کاغذ A4 بسته", price: 1000, qty: 50, stockId: 101, stockQty: 50 })], payments: [{ method: "transfer", amount: 50000 }], online: online({ platformFee: 7000 }), channel: "online" }, "اصلاح");
  assert.equal(rv.ok, true); assert.equal(rv.sale.channel, "online");
  assert.equal(txs().filter((t) => t.category === "کارمزد فروش آنلاین").length, 1);
  assert.equal(txs().find((t) => t.category === "کارمزد فروش آنلاین").amount, 7000);
  assert.equal(txs().filter((t) => t.category === "هزینه ارسال (فروش آنلاین)").length, 1);
  const rv2 = E.reviseSale(r.sale.id, { customerId: 1, items: [item({ desc: "کاغذ A4 بسته", price: 1000, qty: 50, stockId: 101, stockQty: 50 })], payments: [{ method: "transfer", amount: 50000 }] }, "بدون ورودی کانال");
  assert.equal(rv2.sale.channel, "online", "اگر ورودی کانال نیامد، کانال قبلی حفظ می‌شود");
});

test("وضعیت پیگیری: ارسال شد → وضعیت سفارش هم‌گام می‌شود و کد رهگیری ذخیره می‌شود", () => {
  const r = sell();
  const u = E.updateOnlineSale(r.sale.id, { status: "shipped", trackingCode: "NEW-999" });
  assert.equal(u.ok, true);
  const s = E.getSale(r.sale.id);
  assert.equal(s.online.status, "shipped"); assert.equal(s.online.trackingCode, "NEW-999");
  assert.equal(E.lsRead("cafenet_orders", []).find((o) => String(o.saleId) === String(s.id)).status, "completed");
  assert.equal(E.lsRead("cafenet_invoices", []).find((i) => String(i.saleId) === String(s.id)).online.status, "shipped");
});

test("برگشت خورده: فروش ابطال، موجودی و حساب‌ها کامل برمی‌گردد", () => {
  const r = sell({ payments: [{ method: "transfer", amount: 40000 }] });
  assert.equal(ledgerDebt(1), 50000);
  const u = E.updateOnlineSale(r.sale.id, { status: "returned" }, "مشتری پس فرستاد");
  assert.equal(u.ok, true); assert.equal(u.returned, true);
  assert.equal(E.getSale(r.sale.id), null);
  assert.equal(stockOf(101).qty, 100);
  assert.equal(incomeTotal(), 0); assert.equal(expenseTotal(), 0); assert.equal(ledgerDebt(1), 0);
});

test("updateOnlineSale روی فروش حضوری خطا می‌دهد", () => {
  const r = E.createSale({ customerId: 1, items: [item({ price: 50000 })], payments: [{ method: "cash", amount: 50000 }] });
  assert.equal(E.updateOnlineSale(r.sale.id, { status: "shipped" }).ok, false);
});

test("گزارش: سهم آنلاین، تفکیک پلتفرم/وضعیت، هزینه ارسال و سود", () => {
  sell();
  sell({ online: online({ platform: "تلگرام", shippingCost: 0, platformFee: 0 }) });
  E.createSale({ customerId: 2, items: [item({ price: 100000 })], payments: [{ method: "cash", amount: 100000 }] });
  const st = E.onlineStats(E.getSales(), txs());
  assert.equal(st.count, 2); assert.equal(st.storeCount, 1);
  assert.equal(st.revenue, 180000); assert.equal(st.share.toFixed(3), (180000 / 280000).toFixed(3));
  assert.equal(st.ship, 30000); assert.equal(st.fee, 5000);
  assert.equal(st.byPlatform.length, 2); assert.equal(st.byStatus.new, 2);
  E.updateOnlineSale(E.getSales().find((s) => s.online?.platform === "تلگرام").id, { status: "delivered" });
  assert.equal(E.onlineStats(E.getSales(), txs()).byStatus.delivered, 1);
});
