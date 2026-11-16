// دفتر کل و مغایرت‌گیری — روی تراکنش‌های واقعیِ موتور فروش
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, item, T } from "./helpers.js";

let E;
beforeEach(() => {
  E = fresh();
  E.createSale({ customerId: 1, date: "2026-10-01", items: [item({ price: T(100000) })], payments: [{ method: "cash", amount: T(100000), date: "2026-10-01" }] });
  E.createSale({ customerId: 2, date: "2026-10-05", items: [item({ price: T(250000) })], payments: [{ method: "pos", amount: T(250000), date: "2026-10-05" }] });
  E.createSale({ customerId: 1, date: "2026-10-09", items: [item({ price: T(40000) })], payments: [{ method: "cash", amount: T(40000), date: "2026-10-09" }] });
  E.lsWrite("cafenet_tx3", [...E.lsRead("cafenet_tx3", []), { id: "e1", type: "expense", category: "اجاره", amount: T(30000), desc: "اجارهٔ مغازه", date: "2026-10-07", method: "cash" }]);
});
const lines = () => E.buildLines(E.lsRead("cafenet_tx3", []));

test("دفتر نقدی: بدهکار=درآمد، بستانکار=هزینه، مانده جاری و جمع‌ها درست", () => {
  const l = E.ledgerFor(lines(), "cash", {});
  assert.equal(l.debit, T(140000)); assert.equal(l.credit, T(30000)); assert.equal(l.closing, T(110000)); assert.equal(l.opening, 0);
  assert.deepEqual(l.rows.map((r) => r.balance), [T(100000), T(70000), T(110000)]);                 // ۱۰۰ − ۳۰ + ۴۰
  assert.equal(E.ledgerFor(lines(), "pos", {}).closing, T(250000));
});
test("بازهٔ زمانی: ردیف‌های قبل از from به مانده اول دوره می‌روند؛ مانده دستی هم افزوده می‌شود", () => {
  const l = E.ledgerFor(lines(), "cash", { from: "2026-10-08", opening: T(5000) });
  assert.equal(l.opening, T(5000) + T(70000)); assert.equal(l.rows.length, 1); assert.equal(l.closing, T(115000));
  assert.equal(E.ledgerFor(lines(), "cash", { to: "2026-10-05" }).closing, T(100000));
  assert.equal(E.ledgerFor(lines(), "cash", { q: "اجاره" }).rows.length, 1);
});
test("هزینه‌های خودکار مصرف مواد در دفتر نمی‌آیند و مجموع حساب‌ها با صندوق می‌خواند", () => {
  const txs = [...E.lsRead("cafenet_tx3", []), { id: "auto1", type: "expense", category: "هزینه مستقیم خدمات", amount: T(9999), date: "2026-10-02", method: "cash" }, { id: "bad", type: "income", amount: 5, date: "نامعتبر", method: "cash" }];
  const ls = E.buildLines(txs); assert.ok(!ls.some((x) => x.id === "auto1" || x.id === "bad"));
  const sum = E.summarizeAll(ls, E.glAccountsFrom([{ key: "cash", label: "نقدی", real: true }, { key: "pos", label: "کارتخوان", real: true }, { key: "credit", label: "اعتباری", real: false }]), {});
  assert.equal(sum.length, 2); assert.equal(sum.reduce((s, x) => s + x.closing, 0), T(360000));
});
test("glAccountsFrom: فقط وجه واقعی؛ کیف پول قابل مغایرت‌گیری نیست", () => {
  const a = E.glAccountsFrom([{ key: "cash", real: true, label: "نقدی" }, { key: "wallet", real: true, label: "کیف پول" }, { key: "free", real: false }, { key: "pos_1", real: true, label: "ملت", channelType: "pos" }]);
  assert.deepEqual(a.map((x) => [x.key, x.kind, x.reconcilable]), [["cash", "cash", true], ["wallet", "wallet", false], ["pos_1", "pos", true]]);
});

test("parseStatement: تاریخ شمسی/میلادی، ارقام فارسی، علامت، ستون برداشت/واریز، تومان، خطاها", () => {
  const p = E.parseStatement([
    "۱۴۰۵/۰۷/۰۹\t۱,۰۰۰,۰۰۰\tواریز پوز",
    "2026-10-07 -300000 اجاره",
    "1405/07/10;خرید کاغذ;250000;",              // برداشت پر، واریز خالی
    "1405/07/11;پایانه;;75000",                   // واریز
    "بدون تاریخ 5000", "1405/07/12 abc",
  ].join("\n"), { unit: "rial" });
  assert.deepEqual(p.rows.map((r) => [r.date, r.amount, r.desc]), [["2026-10-01", 1000000, "واریز پوز"], ["2026-10-07", -300000, "اجاره"], ["2026-10-02", -250000, "خرید کاغذ"], ["2026-10-03", 75000, "پایانه"]]);
  assert.equal(p.errors.length, 2);
  assert.equal(E.parseStatement("2026-10-01 100 x", { unit: "toman" }).rows[0].amount, 1000);
  assert.deepEqual(E.parseStatement("", {}), { rows: [], errors: [] });
});
test("autoMatch: هم‌مبلغ با پنجرهٔ روز، نزدیک‌ترین تاریخ، هر ردیف فقط یک‌بار", () => {
  const ls = E.ledgerFor(lines(), "cash", {}).rows;     // +100000(10-01) −30000(10-07) +40000(10-09)
  const st = [{ id: "s1", line: 1, date: "2026-10-02", amount: T(100000) }, { id: "s2", line: 2, date: "2026-10-07", amount: -T(30000) }, { id: "s3", line: 3, date: "2026-10-20", amount: T(40000) }, { id: "s4", line: 4, date: "2026-10-09", amount: T(777) }];
  const r = E.autoMatch(ls, st, { dayWindow: 2 });
  assert.deepEqual(r.pairs.map((p) => [p.stmtId, p.lineKey, p.dayDiff]), [["s1", ls[0].key, 1], ["s2", ls[1].key, 0]]);
  assert.deepEqual(r.unmatchedStmt.map((x) => x.id).sort(), ["s3", "s4"]); assert.deepEqual(r.unmatchedBook.map((x) => x.key), [ls[2].key]);
  const dup = E.autoMatch(ls, [{ id: "a", line: 1, date: "2026-10-01", amount: T(100000) }, { id: "b", line: 2, date: "2026-10-01", amount: T(100000) }], {});
  assert.equal(dup.pairs.length, 1);                                  // یک ردیف دفتر دو بار تطبیق نمی‌خورد
  assert.equal(E.autoMatch(ls, st, { skip: new Set([ls[0].key]) }).pairs.length, 1);   // قبلاً مغایرت‌گیری‌شده‌ها کنار می‌روند
});
test("reconSummary: اختلاف توضیح‌داده‌شده با ردیف‌های تطبیق‌نخورده؛ شمارش نقد بدون صورت‌حساب", () => {
  const ls = E.ledgerFor(lines(), "cash", {});
  // بانک: ۱۰۰ و ۴۰ را دارد ولی هزینهٔ −۳۰ را نه، و یک کارمزد −۲ دارد که در دفتر نیست
  const stm = [{ id: "s1", line: 1, date: "2026-10-01", amount: T(100000) }, { id: "s2", line: 2, date: "2026-10-09", amount: T(40000) }, { id: "s3", line: 3, date: "2026-10-09", amount: -T(2000) }];
  const m = E.autoMatch(ls.rows, stm, {});
  const stmtClosing = T(138000);
  const r = E.reconSummary({ bookClosing: ls.closing, stmtClosing, unmatchedBook: m.unmatchedBook, unmatchedStmt: m.unmatchedStmt });
  assert.equal(r.diff, T(28000)); assert.equal(r.unmatchedBookNet, -T(30000)); assert.equal(r.unmatchedStmtNet, -T(2000)); assert.equal(r.unexplained, 0); assert.equal(r.balanced, true);
  assert.equal(E.reconSummary({ bookClosing: ls.closing, stmtClosing: T(111000), unmatchedBook: [], unmatchedStmt: [] }).unexplained, T(1000));
  assert.equal(E.reconSummary({ bookClosing: 5, stmtClosing: "", unmatchedBook: [], unmatchedStmt: [] }).balanced, null);
});
test("ذخیرهٔ مغایرت‌گیری: علامت‌گذاری، تشخیص تغییر بعدی تراکنش، رفع علامت، سقف جلسه‌ها، نرمال‌سازی داده خراب", () => {
  const ls = lines().filter((l) => l.account === "cash");
  let st = E.markReconciled(E.emptyRecon(), ls.slice(0, 2), { at: 1, by: "ali", session: "S1" });
  assert.equal(E.reconState(st, ls[0]), "ok"); assert.equal(E.reconState(st, ls[2]), "none");
  assert.equal(E.reconState(st, { ...ls[0], net: ls[0].net + 1 }), "changed"); assert.equal(E.reconState(st, { ...ls[0], date: "2026-10-02" }), "changed");
  st = E.unmark(st, ls[0].key); assert.equal(E.reconState(st, ls[0]), "none");
  for (let i = 0; i < 5; i++) st = E.addSession(st, { id: "s" + i }, 3); assert.deepEqual(st.sessions.map((x) => x.id), ["s4", "s3", "s2"]);
  assert.deepEqual(E.normRecon("خراب"), E.emptyRecon()); assert.deepEqual(E.normRecon({ matches: [], sessions: 5 }), E.emptyRecon());
});
test("CSV: BOM، نقل‌قول و ویرگول", () => {
  const c = E.toCsv([["الف,ب", 'گفت "سلام"', 3]], ["x", "y", "z"]);
  assert.ok(c.startsWith("﻿")); assert.match(c, /"الف,ب","گفت ""سلام""",3/);
  assert.equal(E.faDate("2026-10-01"), "۱۴۰۵/۰۷/۰۹"); assert.equal(E.faDate("x"), "—");
});
