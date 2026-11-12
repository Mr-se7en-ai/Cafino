// مرکز چاپ و اسکن — جاب‌ها (کامل/ناقص/ناموفق)، صورتحساب خودکار، کنتور و مغایرت، شمارش PDF
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, stockOf, incomeTotal, ledgerDebt } from "./helpers.js";

let E, P, S;
beforeEach(() => {
  E = fresh();
  P = E.saveDevice({ kind: "printer", name: "HP LaserJet", nativeName: "HP LaserJet Pro", priceBW: 50000, priceColor: 200000 }).device;
  S = E.saveDevice({ kind: "scanner", name: "Canon Scanner", priceScan: 80000 }).device;
});
const job = (o = {}) => E.recordJob({ kind: "print", deviceId: P.id, customerId: 1, requested: 17, unitPrice: 50000, payMethod: "cash", fileName: "a.pdf", ...o });

test("طبقه‌بندی: کامل / ناقص / ناموفق و اعتبارسنجی", () => {
  assert.deepEqual(E.classifyJob(20, 20), { requested: 20, done: 20, failed: 0, status: "done" });
  assert.deepEqual(E.classifyJob(20, 17), { requested: 20, done: 17, failed: 3, status: "partial" });
  assert.equal(E.classifyJob(20, 0).status, "failed");
  assert.equal(E.classifyJob(5, 6), null); assert.equal(E.classifyJob(0, 0), null); assert.equal(E.classifyJob("x", 1), null);
});

test("جاب کامل: فروش واقعی با فاکتور، درآمد و پرداخت ثبت می‌شود", () => {
  const r = job();
  assert.ok(r.ok && r.sale && r.job.invoiceNumber);
  assert.equal(r.job.status, "done"); assert.equal(r.job.amount, 17 * 50000);
  assert.equal(incomeTotal(), 17 * 50000);
  assert.equal(E.getSale(r.job.saleId).total, 17 * 50000);
  assert.equal(r.job.customerName, "علی رضایی");
});

test("جاب ناقص: فقط صفحات انجام‌شده صورتحساب می‌شود (۲۰ درخواست، ۱۷ چاپ)", () => {
  const r = job({ requested: 20, done: 17 });
  assert.equal(r.job.status, "partial"); assert.equal(r.job.failed, 3);
  assert.equal(r.job.amount, 17 * 50000); assert.equal(incomeTotal(), 17 * 50000);
});

test("جاب ناموفق: فروشی ثبت نمی‌شود ولی جاب در کارنامه می‌ماند", () => {
  const r = job({ requested: 5, done: 0 });
  assert.equal(r.job.status, "failed"); assert.equal(r.sale, null); assert.equal(r.job.amount, 0);
  assert.equal(incomeTotal(), 0); assert.equal(E.getJobs().length, 1);
});

test("نسیه برای مشتری: بدهی در حساب مشتری؛ بدون مشتری نسیه به نقدی تبدیل می‌شود", () => {
  const r = job({ payMethod: "credit" });
  assert.equal(ledgerDebt(1), 17 * 50000); assert.equal(r.job.unbilled, false);
  const w = job({ customerId: null, payMethod: "credit" });
  assert.equal(w.ok, true); assert.equal(ledgerDebt(2), 0);
});

test("اعتبارسنجی: دستگاه نامعتبر، نوع ناسازگار، تعداد بیش از حد", () => {
  assert.equal(E.recordJob({ kind: "scan", deviceId: P.id, requested: 1, unitPrice: 1 }).ok, false, "اسکن روی پرینتر");
  assert.equal(E.recordJob({ kind: "print", deviceId: S.id, requested: 1, unitPrice: 1 }).ok, false, "چاپ روی اسکنر");
  assert.equal(E.recordJob({ kind: "print", deviceId: "nope", requested: 1, unitPrice: 1 }).ok, false);
  assert.equal(E.recordJob({ kind: "print", requested: 3, done: 4, unitPrice: 1 }).ok, false);
  assert.equal(E.recordJob({ kind: "print", requested: 20000, unitPrice: 1 }).ok, false);
  assert.equal(E.recordJob({ kind: "xx", requested: 1 }).ok, false);
  assert.equal(E.getJobs().length, 0);
});

test("اسکن: شمارش صفحه و قیمت هر صفحه", () => {
  const r = E.recordJob({ kind: "scan", deviceId: S.id, customerId: 2, requested: 5, unitPrice: 80000, payMethod: "cash", source: "native" });
  assert.equal(r.job.amount, 400000); assert.equal(r.job.source, "native");
  assert.equal(E.summarize(E.getJobs(), { deviceId: S.id }).scan, 5);
});

test("مصرف انبار از دستورکار (کاغذ) فقط برای صفحات انجام‌شده کم می‌شود", () => {
  E.lsWrite("cafenet_recipes", [{ id: 1, service: "پرینت سیاه‌وسفید A4", components: [{ itemId: 101, qty: 1 }] }]);
  job({ requested: 20, done: 17 });
  assert.equal(stockOf(101).qty, 100 - 17);
});

test("صورتحساب‌نشده و صدور بعدی (billJob)", () => {
  const r = job({ charge: false });
  assert.equal(r.job.amount, 0); assert.equal(incomeTotal(), 0);
  const b = E.billJob(r.job.id, { payMethod: "cash" });
  assert.ok(b.ok); assert.equal(incomeTotal(), 17 * 50000);
  assert.equal(E.getJob(r.job.id).saleId, b.sale.id);
  assert.equal(E.billJob(r.job.id).ok, false, "دوبار صورتحساب نمی‌شود");
});

test("ابطال جاب: دلیل الزامی، فروش باطل، صفحات فیزیکی در کنتور می‌مانند", () => {
  const r = job();
  assert.equal(E.voidJob(r.job.id, "").ok, false);
  assert.ok(E.voidJob(r.job.id, "اشتباه در ثبت مشتری").ok);
  assert.equal(incomeTotal(), 0); assert.equal(E.getJob(r.job.id).voided, true); assert.equal(E.getJob(r.job.id).amount, 0);
  assert.equal(E.recordedPages(P.id, 0, Date.now() + 10), 17, "کاغذ مصرف شده و در کنتور شمرده می‌شود");
  assert.equal(E.voidJob(r.job.id, "دوباره").ok, false);
  assert.ok(E.getAuditEvents({ includeInfo: false }).some((e) => e.action === "invoice_void"), "در حسابرسی ثبت شد");
});

test("کنتور: مقایسه با صفحات ثبت‌شده → سالم / چاپ ثبت‌نشده / ثبت بیش از کنتور", () => {
  const t0 = 1_700_000_000_000;
  E.addMeterReading({ deviceId: P.id, value: 12450, ts: t0 });
  // دو جاب بین دو قرائت (با زمان‌های مصنوعی)
  const j1 = job({ requested: 100 }).job, j2 = job({ requested: 30 }).job;
  const jobs = E.getJobs().map((j) => (j.id === j1.id ? { ...j, ts: t0 + 1000 } : j.id === j2.id ? { ...j, ts: t0 + 2000 } : j));
  E.lsWrite(E.JOBS_KEY, jobs);
  const r0 = E.getMeterReadings(P.id)[0];
  const mk = (v) => ({ ts: t0 + 5000, value: v, id: "x" });
  assert.equal(E.reconcile(P.id, r0, mk(12450 + 130), jobs).status, "ok");
  const un = E.reconcile(P.id, r0, mk(12450 + 260), jobs);
  assert.equal(un.status, "unrecorded"); assert.equal(un.diff, 130); assert.equal(un.recorded, 130); assert.equal(un.actual, 260);
  assert.equal(E.reconcile(P.id, r0, mk(12450 + 60), jobs).status, "overrecorded");
  assert.equal(E.reconcile(P.id, r0, { ...mk(100), reset: true }, jobs), null, "پس از ریست کنتور مقایسه نمی‌کند");
});

test("ثبت کنتور: کمتر از قبلی رد می‌شود مگر «شروع دوباره»؛ تخمین کنتور فعلی", () => {
  assert.equal(E.addMeterReading({ deviceId: S.id, value: 1 }).ok, false, "کنتور برای اسکنر نیست");
  assert.ok(E.addMeterReading({ deviceId: P.id, value: 5000, ts: Date.now() - 5000 }).ok);
  const bad = E.addMeterReading({ deviceId: P.id, value: 100 });
  assert.equal(bad.ok, false); assert.equal(bad.needsReset, true);
  assert.ok(E.addMeterReading({ deviceId: P.id, value: 100, reset: true }).ok);
  job({ requested: 10 });
  assert.equal(E.estimatedMeter(P.id), 110);
  assert.equal(E.addMeterReading({ deviceId: P.id, value: -3 }).ok, false);
});

test("هشدار کنتور برای کنترل سلامت (meterIssues)", () => {
  const t0 = Date.now() - 100000;
  E.addMeterReading({ deviceId: P.id, value: 1000, ts: t0 });
  job({ requested: 10 });
  E.addMeterReading({ deviceId: P.id, value: 1100, ts: Date.now() + 1000 });
  const iss = E.meterIssues();
  assert.equal(iss.length, 1); assert.equal(iss[0].status, "unrecorded"); assert.equal(iss[0].diff, 90);
});

test("خلاصه‌ها: امروز/ماه/کل، گزارش روزانه و ماهانه و CSV", () => {
  job({ requested: 10 }); job({ requested: 5, done: 3 }); E.recordJob({ kind: "scan", deviceId: S.id, requested: 4, unitPrice: 80000 });
  const ov = E.deviceOverview(P.id);
  assert.equal(ov.today.done, 13); assert.equal(ov.month.done, 13); assert.equal(ov.total.failed, 2);
  assert.equal(ov.today.amount, 13 * 50000); assert.equal(ov.last.requested, 5);
  const d = E.periodReport(E.getJobs(), "daily"); assert.equal(d.length, 2);
  const m = E.periodReport(E.getJobs(), "monthly", { deviceId: P.id }); assert.equal(m.length, 1); assert.equal(m[0].done, 13);
  const csv = E.jobsToCsv(E.getJobs()); assert.ok(csv.startsWith("﻿") && csv.split("\r\n").length === 4 && csv.includes("ناقص"));
});

test("دستگاه‌ها: نام تکراری، حذف=بایگانی اگر جاب دارد، ادغام دستگاه‌های ویندوز", () => {
  assert.equal(E.saveDevice({ kind: "printer", name: "HP LaserJet" }).ok, false);
  assert.equal(E.saveDevice({ kind: "printer", name: " " }).ok, false);
  job();
  assert.deepEqual(E.removeDevice(P.id), { ok: true, archived: true });
  assert.equal(E.getDeviceById(P.id).archived, true);
  const x = E.saveDevice({ kind: "printer", name: "Epson" }).device;
  assert.deepEqual(E.removeDevice(x.id), { ok: true, archived: false });
  const found = [{ name: "Canon iP2800", displayName: "Canon iP2800", isDefault: true }, { name: "Microsoft Print to PDF" }];
  assert.equal(E.mergeNativeDevices(found, "printer").added, 2);
  assert.equal(E.mergeNativeDevices(found, "printer").added, 0, "دوباره اضافه نمی‌شود");
});

const pdf = (n, extra = "") => {
  let o = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const kids = Array.from({ length: n }, (_, i) => `${3 + i} 0 R`).join(" ");
  o += `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`;
  for (let i = 0; i < n; i++) o += `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\n`;
  o += "9999 0 obj\n<< /Type /Outlines /Count 40 >>\nendobj\n" + extra + "%%EOF";
  return new TextEncoder().encode(o);
};
test("شمارش صفحات PDF: ساختار ساده، چندسطحی، فشرده و غیر PDF", () => {
  assert.equal(E.countPdfPages(pdf(17)), 17);
  assert.equal(E.countPdfPages(pdf(1)), 1);
  const noCount = new TextEncoder().encode("%PDF-1.4\n3 0 obj\n<< /Type /Page >>\nendobj\n4 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n");
  assert.equal(E.countPdfPages(noCount), 2);
  assert.equal(E.countPdfPages(new TextEncoder().encode("%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N 9 >>\nstream\nxxx\nendstream\nendobj\n")), null, "فشرده → دستی");
  assert.equal(E.countPdfPages(new TextEncoder().encode("hello world")), null);
  assert.equal(E.countPdfPages(new Uint8Array(0)), null);
});

test("saleRef: فروش از فرم دیگر قبلاً ثبت شده؛ جاب فقط به آن وصل می‌شود (صورتحساب دوباره نمی‌شود)", () => {
  const s = E.createSale({ walkIn: true, skipOrder: true, items: [{ desc: "پرینت", qty: 7, price: 50000, category: "پرینت و کپی" }], payments: [{ method: "cash", amount: 350000 }] });
  const before = incomeTotal();
  const r = E.recordJob({ kind: "print", deviceId: P.id, requested: 7, unitPrice: 50000, saleRef: { id: s.sale.id, number: s.sale.number, amount: 350000 } });
  assert.ok(r.ok); assert.equal(r.job.saleId, s.sale.id); assert.equal(r.job.invoiceNumber, s.sale.number); assert.equal(r.job.amount, 350000);
  assert.equal(incomeTotal(), before, "درآمد دوباره ثبت نشد"); assert.equal(E.getSales().length, 1);
});

test("IP پرینتر: معتبر ذخیره می‌شود، نامعتبر رد؛ ادغام دستگاه ویندوز IP پورت را می‌گیرد", () => {
  assert.equal(E.saveDevice({ id: P.id, kind: "printer", name: "HP LaserJet", ip: "192.168.1.50" }).device.ip, "192.168.1.50");
  assert.equal(E.saveDevice({ id: P.id, kind: "printer", name: "HP LaserJet", ip: "http://evil" }).ok, false);
  E.mergeNativeDevices([{ name: "Canon X", ip: "10.0.0.7" }], "printer");
  assert.equal(E.getDevices().find((d) => d.name === "Canon X").ip, "10.0.0.7");
});

test("کنترل سلامت: مغایرت کنتور و جاب صورتحساب‌نشده گزارش می‌شود", () => {
  const t0 = Date.now() - 100000;
  E.addMeterReading({ deviceId: P.id, value: 1000, ts: t0 }); job({ requested: 10 });
  E.addMeterReading({ deviceId: P.id, value: 1100, ts: Date.now() + 1000 });
  const h = E.runHealthCheck();
  const m = h.checks.find((c) => c.id === "meter"); assert.equal(m.status, "warn"); assert.equal(m.tab, "printscan:center");
  assert.equal(h.checks.find((c) => c.id === "audit").tab, "audit");
});
