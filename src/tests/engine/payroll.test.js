// حقوق کارمندان — تعهد ماهانه ← پرداخت ← هزینهٔ حسابداری (و برگشت)
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const JY = 1405, JM = 7; // مهر ۱۴۰۵ (۳۰ روزه)
const txs = () => E.lsRead("cafenet_tx3", []);
const hire = (o = {}) => E.saveEmployee({ name: "رضا محمدی", role: "اپراتور", salary: 80000000, payDay: 5, ...o });

test("کارمند: نام و حقوق الزامی است و ارقام فارسی خوانده می‌شود", () => {
  assert.equal(E.saveEmployee({ name: "", salary: 1000 }).ok, false);
  assert.equal(E.saveEmployee({ name: "الف", salary: 0 }).ok, false);
  const r = E.saveEmployee({ name: "الف", salary: "۵۰٬۰۰۰٬۰۰۰", payDay: "۱۰" });
  assert.equal(r.ok, true); assert.equal(r.employee.salary, 50000000); assert.equal(r.employee.payDay, 10);
  assert.equal(E.getEmployees().length, 1);
});

test("ساخت لیست حقوق: فقط کارمندان فعال، یک ردیف برای هر ماه، تکراری ساخته نمی‌شود", () => {
  hire(); hire({ name: "سارا کریمی", salary: 90000000, payDay: 31 }); hire({ name: "قدیمی", active: false });
  const r1 = E.generatePayroll(JY, JM);
  assert.equal(r1.created, 2);
  const items = E.payrollItems(JY, JM);
  assert.equal(items.length, 2);
  assert.ok(items.every((o) => o.kind === "salary" && o.dir === "pay" && o.status === "pending" && o.ym === "1405-07"));
  const sara = items.find((o) => o.party === "سارا کریمی");
  assert.equal(sara.dueDate, E.monthDueDate(JY, JM, 30), "روز ۳۱ در ماه ۳۰ روزه به ۳۰ می‌رسد");
  assert.equal(E.generatePayroll(JY, JM).created, 0);
  assert.equal(E.getObligations().length, 2);
  // ماه بعد جدا ساخته می‌شود
  const [ny, nm] = E.shiftMonth(JY, JM, 1);
  assert.equal(E.generatePayroll(ny, nm).created, 2);
});

test("اضافه‌کار و کسورات مبلغ نهایی را می‌سازند؛ مبلغ غیرمجاز رد می‌شود", () => {
  hire(); E.generatePayroll(JY, JM);
  const id = E.payrollItems(JY, JM)[0].id;
  assert.equal(E.updatePayrollItem(id, { extra: 5000000, deduct: 10000000 }).amount, 75000000);
  assert.equal(E.updatePayrollItem(id, { deduct: "۹۰٬۰۰۰٬۰۰۰" }).ok, false);   // مبلغ ≤ ۰
  assert.equal(E.payrollItems(JY, JM)[0].amount, 75000000);
});

test("پرداخت حقوق: هزینهٔ «حقوق کارمند» با همان مبلغ ثبت می‌شود، درآمد دست نمی‌خورد، و برگشت آن را باطل می‌کند", () => {
  hire(); E.generatePayroll(JY, JM);
  const o = E.payrollItems(JY, JM)[0];
  E.updatePayrollItem(o.id, { extra: 2000000 });
  const before = txs().length;
  E.settleObligation(o.id);
  const t = txs().filter((x) => x.type === "expense" && x.category === "حقوق کارمند");
  assert.equal(txs().length, before + 1); assert.equal(t.length, 1); assert.equal(t[0].amount, 82000000);
  assert.equal(E.payrollItems(JY, JM)[0].status, "done");
  assert.equal(txs().filter((x) => x.type === "income").length, 0);
  assert.equal(E.updatePayrollItem(o.id, { extra: 1 }).ok, false, "پرداخت‌شده قابل ویرایش نیست");
  const s = E.payrollSummary(E.payrollItems(JY, JM));
  assert.equal(s.paid, 82000000); assert.equal(s.pending, 0);
  E.settleObligation(o.id, true);
  assert.equal(txs().filter((x) => x.category === "حقوق کارمند").length, 0);
  assert.equal(E.payrollItems(JY, JM)[0].status, "pending");
  assert.equal(E.payrollSummary(E.payrollItems(JY, JM)).pending, 82000000);
});

test("پشتیبان‌گیری (کامل و مالی) شامل کارمندان و حقوق است", async () => {
  hire(); E.generatePayroll(JY, JM);
  const full = await E.buildBackupPayload("full"), fin = await E.buildBackupPayload("financial");
  assert.equal(JSON.parse(full.data.cafenet_employees).length, 1);
  assert.equal(JSON.parse(fin.data.cafenet_employees).length, 1);
  assert.equal(JSON.parse(full.data.cafenet_obligations).length, 1);
});
