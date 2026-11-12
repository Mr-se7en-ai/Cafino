import test from "node:test";
import assert from "node:assert/strict";
import { parseUtterance } from "../voice/parser.js";
import { createDialog } from "../voice/dialog.js";
import { extractAmount, normalizeText, extractDate } from "../voice/normalize.js";

import { jalali } from "./voiceFixtures.js";
const baseCtx = () => ({
  today: "2026-10-22", defaultUnit: "rial", jalali,
  categories: { expense: ["برق", "اینترنت (ISP)", "اجاره", "حقوق کارمند", "تعمیر و نگهداری", "خرید تجهیزات", "نوشیدنی و مواد مصرفی", "سایر هزینه"], income: ["پرینت", "مبلغ دلخواه"] },
  customers: [{ id: 1, firstName: "علی", lastName: "رضایی", phone: "09121111111" }, { id: 2, firstName: "سارا", lastName: "محمدی", phone: "09122222222", wallet: 500000 }, { id: 3, firstName: "علی", lastName: "کریمی", phone: "09123333333" }],
  inventory: [{ id: 1, name: "کاغذ A4 معمولی", qty: 8, unit: "بسته" }, { id: 3, name: "کارتریج مشکی", qty: 2, unit: "عدد" }],
  sales: [{ id: "s1", number: "1023", customerId: 1, customerName: "علی رضایی", total: 3000000, paid: 1000000, waived: 0 }],
});

test("numbers & money", () => {
  const amt = (t, u = "rial") => extractAmount(normalizeText(t), u).amount;
  assert.equal(amt("۵۰۰ هزار تومان"), 5_000_000);
  assert.equal(amt("پانصد هزار تومان"), 5_000_000);
  assert.equal(amt("دو میلیون و نیم تومان"), 25_000_000);
  assert.equal(amt("یک و نیم میلیون ریال"), 1_500_000);
  assert.equal(amt("500,000 ریال"), 500_000);
  assert.equal(amt("۲۰ هزار", "toman"), 200_000);
  assert.equal(amt("بیست هزار و پانصد تومان"), 205_000);
  assert.equal(amt("۳ میلیارد"), 3e9);
});

test("dates", () => {
  const c = baseCtx();
  assert.equal(extractDate(normalizeText("دیروز"), c).iso, "2026-10-21");
  assert.equal(extractDate(normalizeText("سه روز پیش"), c).iso, "2026-10-19");
  assert.equal(extractDate(normalizeText("۲۵ مهر"), c).iso, "2026-10-17");
});

const P = (t, c = baseCtx()) => parseUtterance(t, c);

test("create_customer (user example)", () => {
  const r = P("مشتری جدید علی رضایی ۰۹۱۲۱۲۳۴۵۶۷");
  assert.equal(r.intent, "create_customer");
  assert.equal(r.slots.firstName, "علی"); assert.equal(r.slots.lastName, "رضایی"); assert.equal(r.slots.phone, "09121234567");
});

test("create_expense (user example) → intent + typed slots", () => {
  const r = P("هزینه ۵۰۰ هزار تومان بابت کاغذ");
  assert.equal(r.intent, "create_expense");
  assert.equal(r.slots.amount, 5_000_000);          // rial internally (= 500,000 toman)
  assert.equal(r.slots.categoryKey, "paper");
  assert.equal(r.slots.description, "کاغذ");
  assert.equal(r.slots.date, "2026-10-22");
  assert.equal(r.slots.category, "نوشیدنی و مواد مصرفی");
  assert.deepEqual(r.missing, []);
});

test("expense: category by hint, date, method", () => {
  const r = P("قبض برق ۸۰۰ هزار تومان دیروز کارت به کارت");
  assert.equal(r.intent, "create_expense"); assert.equal(r.slots.category, "برق"); assert.equal(r.slots.date, "2026-10-21"); assert.equal(r.slots.method, "transfer");
});

test("expense without amount asks for it", () => {
  const r = P("هزینه کاغذ");
  assert.equal(r.intent, "create_expense"); assert.deepEqual(r.missing, ["amount"]);
});

test("income", () => {
  const r = P("درآمد دو میلیون و نیم تومان پرینت");
  assert.equal(r.intent, "create_income"); assert.equal(r.slots.amount, 25_000_000); assert.equal(r.slots.category, "پرینت");
});

test("sale with customer, quantity and per-unit price", () => {
  const r = P("فروش ۲ برگ پرینت رنگی هر برگ ۱۵ هزار تومان به علی رضایی");
  assert.equal(r.intent, "create_sale"); assert.equal(r.slots.customerId, 1); assert.equal(r.slots.quantity, 2); assert.equal(r.slots.amount, 300_000); assert.equal(r.slots.description, "پرینت رنگی");
});

test("sale: ambiguous customer name → choices", () => {
  const r = P("فروش پرینت ۵ هزار تومان به علی");
  assert.equal(r.intent, "create_sale"); assert.ok(r.choices?.customerId?.length === 3);
});

test("receive payment by invoice number and by customer", () => {
  const a = P("دریافت وجه فاکتور شماره ۱۰۲۳");
  assert.equal(a.intent, "receive_payment"); assert.equal(a.slots.saleId, "s1"); assert.equal(a.slots.remaining, 2_000_000); assert.equal(a.slots.amount, 0);
  const b = P("علی رضایی ۱۰۰ هزار ریال پرداخت کرد");
  assert.equal(b.intent, "receive_payment"); assert.equal(b.slots.customerId, 1); assert.equal(b.slots.amount, 100_000);
  const c = P("دریافت وجه فاکتور ۹۹۹");
  assert.ok(c.errors.invoiceNo);
});

test("inventory in/out", () => {
  const a = P("۵ بسته کاغذ A4 وارد انبار شد");
  assert.equal(a.intent, "inventory_in"); assert.equal(a.slots.itemId, 1); assert.equal(a.slots.quantity, 5);
  const b = P("۲ عدد کارتریج مشکی از انبار خارج کن");
  assert.equal(b.intent, "inventory_out"); assert.equal(b.slots.quantity, 2);
  const c = P("۵ عدد کارتریج مشکی از انبار خارج کن"); assert.ok(c.errors.quantity);
  const d = P("۴ عدد ماوس وارد انبار کن"); assert.equal(d.slots.isNew, true); assert.equal(d.slots.itemName, "ماوس");
});

test("forms, navigation, questions", () => {
  assert.equal(P("سفارش جدید").intent, "create_order");
  assert.equal(P("ثبت فاکتور جدید").intent, "create_invoice");
  assert.equal(P("فروش شارژ").intent, "topup_sale");
  const n = P("باز کن صفحه مشتریان"); assert.equal(n.intent, "navigate"); assert.equal(n.slots.tab, "customers");
  assert.equal(P("برو به تنظیمات").slots.tab, "settings");
  assert.equal(P("فروش امروز چقدر بود؟").intent, "query");
  assert.equal(P("هزینه این ماه چقدر شد").intent, "query");
  assert.equal(P("آخری رو پاک کن").intent, "undo");
  assert.equal(P("راهنما").intent, "help");
  assert.equal(P("بلبل خوشخوان").intent, null);
});

// ───────── dialogue + business logic with fake deps ─────────
function harness(ctxOver = {}, cfg = {}) {
  const calls = [];
  let seq = 100;
  const deps = {
    format: { money: (n) => `${n}R`, date: (d) => d, num: (n) => String(n) },
    addTransaction: async (t) => { calls.push(["tx", t]); return { id: ++seq, notes: [] }; },
    removeTransaction: async (id) => { calls.push(["rmtx", id]); return { ok: true }; },
    addCustomer: async (c) => { calls.push(["cust", c]); return { id: ++seq }; },
    removeCustomer: async (id) => { calls.push(["rmcust", id]); return { ok: true }; },
    createSale: async (o) => { calls.push(["sale", o]); return { ok: true, sale: { id: "n1", number: 5 } }; },
    cancelSale: async (id) => { calls.push(["cancel", id]); return { ok: true }; },
    receiveSalePayment: async (id, amt, m) => { calls.push(["pay", id, amt, m]); return { ok: true, received: amt }; },
    receiveCustomerPayment: async (id, amt, m) => { calls.push(["cpay", id, amt, m]); return { ok: true, received: amt, unused: 0 }; },
    adjustInventory: async (o) => { calls.push(["inv", o]); return { ok: true, after: 13, before: 8, itemId: 1 }; },
    restoreInventory: async (r) => { calls.push(["rminv", r]); return { ok: true }; },
    navigate: (tab, action) => calls.push(["nav", tab, action]),
    answer: async (t) => `پاسخ: ${t}`,
  };
  const ctx = { ...baseCtx(), ...ctxOver };
  const d = createDialog({ getContext: () => ctx, deps, getConfig: () => cfg });
  return { d, calls, st: () => d.getState(), last: () => d.getState().messages.at(-1) };
}

test("dialog: expense → confirm card → confirm executes business logic once", async () => {
  const h = harness();
  await h.d.submit("هزینه ۵۰۰ هزار تومان بابت کاغذ");
  assert.equal(h.st().phase, "confirm"); assert.equal(h.calls.length, 0);   // nothing is written before confirmation
  await h.d.submit("تأیید");
  assert.equal(h.st().phase, "idle");
  assert.deepEqual(h.calls[0], ["tx", { type: "expense", amount: 5_000_000, category: "نوشیدنی و مواد مصرفی", desc: "کاغذ", date: "2026-10-22", method: "cash" }]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.st().history.length, 1);
  await h.d.submit("آخری رو پاک کن");
  assert.deepEqual(h.calls[1], ["rmtx", 101]);
  assert.ok(h.st().history[0].undone);
});

test("dialog: missing slot is asked, then answered", async () => {
  const h = harness();
  await h.d.submit("هزینه برق");
  assert.equal(h.st().phase, "ask"); assert.equal(h.st().asking, "amount");
  await h.d.submit("۸۰۰ هزار تومان");
  assert.equal(h.st().phase, "confirm"); assert.equal(h.st().pending.slots.amount, 8_000_000); assert.equal(h.st().pending.slots.category, "برق");
  await h.d.submit("بله");
  assert.equal(h.calls[0][1].amount, 8_000_000);
});

test("dialog: correct a slot while confirming, cancel writes nothing", async () => {
  const h = harness();
  await h.d.submit("هزینه ۵۰۰ هزار تومان بابت کاغذ");
  await h.d.submit("مبلغ ۶۰۰ هزار تومان");
  assert.equal(h.st().pending.slots.amount, 6_000_000);
  await h.d.submit("تاریخ دیروز");
  assert.equal(h.st().pending.slots.date, "2026-10-21");
  await h.d.submit("لغو");
  assert.equal(h.st().phase, "idle"); assert.equal(h.calls.length, 0);
});

test("dialog: ambiguous customer → choice by number", async () => {
  const h = harness();
  await h.d.submit("فروش پرینت ۵ هزار تومان به علی");
  assert.equal(h.st().phase, "choice");
  await h.d.submit("دو");
  assert.equal(h.st().phase, "confirm"); assert.equal(h.st().pending.slots.customerId, 3);
  await h.d.submit("تایید");
  assert.equal(h.calls[0][0], "sale"); assert.equal(h.calls[0][1].customerId, 3); assert.equal(h.calls[0][1].payments[0].amount, 50_000);
});

test("dialog: walk-in cash sale; credit sale without customer asks for customer", async () => {
  const h = harness();
  await h.d.submit("فروش ۲ برگ پرینت ۱۰ هزار تومان");
  await h.d.submit("تایید");
  assert.equal(h.calls[0][1].walkIn, true); assert.equal(h.calls[0][1].items[0].qty, 2);
  const h2 = harness();
  await h2.d.submit("فروش پرینت ۵ هزار تومان نسیه");
  assert.equal(h2.st().asking, "customerId");
});

test("dialog: receive payment executes against the sale; over-amount is blocked", async () => {
  const h = harness();
  await h.d.submit("دریافت وجه فاکتور شماره ۱۰۲۳");
  await h.d.submit("تایید");
  assert.deepEqual(h.calls[0], ["pay", "s1", 2_000_000, "cash"]);
  const h2 = harness();
  await h2.d.submit("دریافت وجه فاکتور شماره ۱۰۲۳ مبلغ ۵ میلیون تومان");
  await h2.d.submit("تایید");
  assert.equal(h2.calls.length, 0);   // error: amount > remaining, nothing written
});

test("dialog: duplicate phone is blocked", async () => {
  const h = harness();
  await h.d.submit("مشتری جدید رضا احمدی ۰۹۱۲۱۱۱۱۱۱۱");
  await h.d.submit("تایید");
  assert.equal(h.calls.length, 0);
});

test("dialog: reads/forms run without confirmation; questions go to the report engine", async () => {
  const h = harness();
  await h.d.submit("برو به گزارش‌ها");
  assert.deepEqual(h.calls[0], ["nav", "report", null]);
  await h.d.submit("فروش امروز چقدر بود؟");
  assert.match(h.last().text, /^پاسخ:/);
  await h.d.submit("بلبل خوشخوان");   // fallback → report engine
  assert.match(h.last().text, /^پاسخ:/);
});

test("dialog: autoRun executes confident writes immediately; low-confidence/guesses still ask", async () => {
  const h = harness({}, { autoRun: true });
  await h.d.submit("درآمد دو میلیون تومان پرینت");
  assert.equal(h.calls.length, 1);
  const h2 = harness({}, { autoRun: true });
  await h2.d.submit("هزینه ۵۰۰ هزار تومان بابت چیزی");     // category had to be guessed
  assert.equal(h2.calls.length, 0); assert.equal(h2.st().phase, "confirm");
});

test("dialog: switching command while confirming; inventory & customer execution", async () => {
  const h = harness();
  await h.d.submit("هزینه ۵۰۰ هزار تومان بابت کاغذ");
  await h.d.submit("۵ بسته کاغذ A4 وارد انبار شد");
  assert.equal(h.st().pending.intent, "inventory_in");
  await h.d.submit("تایید");
  assert.equal(h.calls[0][0], "inv"); assert.equal(h.calls[0][1].delta, 5);
  await h.d.submit("مشتری جدید رضا احمدی ۰۹۱۲۱۲۳۴۵۶۷");
  await h.d.submit("تایید");
  assert.deepEqual(h.calls[1][1], { firstName: "رضا", lastName: "احمدی", phone: "09121234567", note: "" });
});

// ───────── spoken-language corpus: every sentence must resolve to exactly one intent ─────────
const CORPUS = [
["خرج کردم ۲ میلیون تومن برای اجاره","create_expense"],
["پرداخت قبض برق ۸۰۰ هزار تومان","create_expense"],
["حقوق کارمند ۱۵ میلیون تومان","create_expense"],
["۳۰۰ هزار تومان چای و قهوه خریدم","create_expense"],
["خرید ۲ بسته کاغذ ۴۰۰ هزار تومان","create_expense"],
["هزینه سیصد هزار تومان تعمیر پرینتر","create_expense"],
["ثبت هزینه ۵۰ هزار تومان نقدی","create_expense"],
["درآمد ۲ میلیون تومان","create_income"],
["۲۵۰ هزار تومان پرینت درآمد ثبت کن","create_income"],
["واریزی ۵۰۰ هزار تومان کارت به کارت","create_income"],
["ثبت مشتری سارا محمدی","create_customer"],
["مشتری جدید حسین کریمی شماره ۰۹۱۲ ۳۴۵ ۶۷۸۹","create_customer"],
["افزودن مشتری جدید به نام مریم","create_customer"],
["فروختم ۳ تا پرینت ۱۵ هزار تومان","create_sale"],
["ثبت فروش اسکن ۲۰ هزار تومان","create_sale"],
["فروش ۱ عدد فلش ۲۵۰ هزار تومان به سارا محمدی","create_sale"],
["علی رضایی ۱ میلیون ریال پرداخت کرد","receive_payment"],
["از علی رضایی ۵۰۰ هزار ریال دریافت کن","receive_payment"],
["تسویه حساب علی رضایی","receive_payment"],
["دریافت وجه فاکتور ۱۰۲۳","receive_payment"],
["۱۰ بسته کاغذ A4 به انبار اضافه کن","inventory_in"],
["موجودی کارتریج مشکی ۳ عدد افزایش بده","inventory_in"],
["۱ عدد کارتریج مشکی مصرف شد","inventory_out"],
["۲ بسته کاغذ A4 از انبار کم کن","inventory_out"],
["سفارش جدید ثبت کن","create_order"],
["یک فاکتور جدید بزن","create_invoice"],
["فروش شارژ ایرانسل","topup_sale"],
["برو به انبار","navigate"],
["صفحه گزارش ها را باز کن","navigate"],
["تنظیمات","navigate"],
["امروز چقدر فروش داشتیم؟","query"],
["چه کسانی بدهکارن؟","query"],
["سود این ماه چقدره","query"],
["آخرین ثبت رو برگردون","undo"],
["اشتباه شد","undo"],
["چه کارهایی می‌تونی بکنی","help"],
];
test("spoken corpus (colloquial verbs, digits/words, units)", () => {
  const bad = CORPUS.filter(([t, exp]) => { const r = P(t); return r.intent !== exp || r.ambiguous; }).map(([t]) => t);
  assert.deepEqual(bad, []);
});

test("corpus slot spot-checks", () => {
  assert.equal(P("حقوق کارمند ۱۵ میلیون تومان").slots.amount, 150_000_000);
  assert.equal(P("حقوق کارمند ۱۵ میلیون تومان").slots.category, "حقوق کارمند");
  assert.equal(P("مشتری جدید حسین کریمی شماره ۰۹۱۲ ۳۴۵ ۶۷۸۹").slots.phone, "09123456789");
  assert.equal(P("۳۰۰ هزار تومان چای و قهوه خریدم").slots.category, "نوشیدنی و مواد مصرفی");
  assert.equal(P("فروش ۱ عدد فلش ۲۵۰ هزار تومان به سارا محمدی").slots.customerId, 2);
  assert.equal(P("پرداخت قبض برق ۸۰۰ هزار تومان").slots.category, "برق");
});

test("«سفارش جدید» really registers: confirm card → createSale (with order, unpaid for a named customer) → undo cancels it", async () => {
  const h = harness();
  await h.d.submit("سفارش جدید برای علی رضایی تایپ پایان نامه ۵۰۰ هزار تومان");
  assert.equal(h.st().pending.intent, "create_order");
  assert.equal(h.calls.length, 0, "nothing is written before confirmation");
  assert.equal(h.st().pending.slots.method, "credit");
  await h.d.submit("تایید");
  const sale = h.calls.find((c) => c[0] === "sale");
  assert.ok(sale, "createSale was called");
  assert.equal(sale[1].skipOrder, false);
  assert.equal(sale[1].status, "new");
  assert.deepEqual(sale[1].payments, []);
  assert.equal(sale[1].items[0].qty * sale[1].items[0].price, 5000000);
  assert.match(h.last().text, /سفارش/);
  assert.ok(h.st().history.length >= 1);
});

test("«فاکتور بزن» registers an invoice only (no order) and honours a spoken payment method", async () => {
  const h = harness();
  await h.d.submit("فاکتور بزن ۲ برگ پرینت رنگی ۱۰ هزار تومان نقدی");
  assert.equal(h.st().pending.intent, "create_invoice");
  await h.d.submit("تایید");
  const sale = h.calls.find((c) => c[0] === "sale");
  assert.equal(sale[1].skipOrder, true);
  assert.deepEqual(sale[1].payments.map((p) => p.method), ["cash"]);
});

test("a bare «سفارش جدید» asks what the order is instead of silently opening a form", async () => {
  const h = harness();
  await h.d.submit("سفارش جدید");
  assert.equal(h.st().pending.intent, "create_order");
  assert.ok(h.st().pending.missing.includes("description") || h.st().pending.missing.includes("amount"));
  assert.equal(h.calls.length, 0);
});
