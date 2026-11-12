// دادهٔ صفحه‌های تم نارنجی
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
let E;
beforeEach(() => { E = fresh(); });
const T = (id, type, amount, date, category = "پرینت", desc = "") => ({ id, type, amount, date, category, desc });
const TODAY = "2026-11-02";

test("Orange: کارت‌های امروز در برابر دیروز و روند", () => {
  const txs = [T(1, "income", 1000, TODAY), T(2, "income", 500, "2026-11-01"), T(3, "expense", 200, TODAY), T(4, "expense", 400, "2026-11-01")];
  const k = E.dayKpis(txs, TODAY);
  assert.equal(k.income, 1000); assert.equal(k.expense, 200); assert.equal(k.net, 800);
  assert.equal(k.trend.income, 100); assert.equal(k.trend.expense, -50);
  assert.equal(E.dayKpis([], TODAY).net, 0);
});

test("Orange: سری درآمد هفته/ماه/سال", () => {
  const txs = [T(1, "income", 100, TODAY), T(2, "income", 50, "2026-10-30")];
  assert.equal(E.revenueSeries(txs, "week", TODAY).length, 7);
  const m = E.revenueSeries(txs, "month", TODAY);
  assert.equal(m.length, 30); assert.equal(m[29].value, 100); assert.equal(m.reduce((s, p) => s + p.value, 0), 150);
  const y = E.revenueSeries(txs, "year", TODAY);
  assert.equal(y.length, 12); assert.equal(y.reduce((s, p) => s + p.value, 0), 150);
});

test("Orange: سهم دسته‌ها جمعش ۱۰۰ می‌شود و بقیه در «سایر» است", () => {
  const txs = [T(1, "income", 40, TODAY, "اینترنت"), T(2, "income", 30, TODAY, "پرینت"), T(3, "income", 10, TODAY, "تایپ"), T(4, "income", 10, TODAY, "اسکن"), T(5, "income", 5, TODAY, "الف"), T(6, "income", 5, TODAY, "ب"), T(7, "expense", 99, TODAY, "اینترنت")];
  const s = E.incomeShare(txs, TODAY);
  assert.equal(s.total, 100); assert.equal(s.slices.length, 5); assert.equal(s.slices.at(-1).label, "سایر");
  assert.equal(s.slices.reduce((a, b) => a + b.pct, 0), 100);
  assert.deepEqual(E.incomeShare([], TODAY), { total: 0, slices: [] });
});

test("Orange: انبار — کمترین درصد اول و شمارش اقلام رو به اتمام", () => {
  const r = E.stockLevels([{ id: 1, name: "A4", qty: 2, minQty: 5, unit: "بسته" }, { id: 2, name: "سی‌دی", qty: 90, minQty: 10 }, { id: 3, name: "بدون حداقل", qty: 1, minQty: 0 }]);
  assert.equal(r.rows.length, 2); assert.equal(r.rows[0].name, "A4"); assert.equal(r.rows[0].low, true);
  assert.equal(r.rows[1].pct, 100); assert.equal(r.lowCount, 1);
});

test("Orange: ماهانه ۷ ماه و دفتر کل با مانده تجمعی", () => {
  const txs = [T(1, "income", 100, "2026-10-01"), T(2, "expense", 30, "2026-10-05"), T(3, "income", 20, TODAY)];
  const m = E.monthlyIncomeExpense(txs, TODAY, 7);
  assert.equal(m.length, 7); assert.equal(m.reduce((s, x) => s + x.income, 0), 120); assert.equal(m.reduce((s, x) => s + x.expense, 0), 30);
  const l = E.ledgerRows(txs, "", "", 10);
  assert.equal(l.length, 3); assert.equal(l[0].date, TODAY); assert.equal(l[0].balance, 90); assert.equal(l[2].balance, 100);
  assert.equal(E.ledgerRows(txs, "2026-11-01", "2026-11-30").length, 1);
});

test("Orange: مراجعهٔ نسبی، آواتار و تراکنش نامعتبر", () => {
  assert.equal(E.relativeDay(TODAY, TODAY), "امروز"); assert.equal(E.relativeDay("2026-11-01", TODAY), "دیروز");
  assert.equal(E.relativeDay("2026-10-26", TODAY), "1 هفته پیش");
  assert.equal(E.relativeDay("", TODAY), "—");
  assert.equal(E.initialOf("  علی"), "ع"); assert.equal(E.initialOf(""), "؟");
  assert.equal(E.avatarColor("a"), E.avatarColor("a"));
  assert.equal(E.sumRange([{ type: "income", amount: 5, date: "bad" }, null], "income", "2000-01-01", "2100-01-01"), 0);
});
