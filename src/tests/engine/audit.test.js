// Audit Trail — زنجیرهٔ هش، رویدادهای حساس، دلیل اجباری، تشخیص دستکاری
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });

test("sha256Sync با crypto نود یکی است (ASCII، فارسی، خالی، بلند)", () => {
  for (const s of ["", "abc", "کافینو — سامانه مدیریت", "x".repeat(1000), "a".repeat(55), "a".repeat(56), "a".repeat(64), "😀 emoji"]) {
    assert.equal(E.sha256Sync(s), createHash("sha256").update(s, "utf8").digest("hex"), s.slice(0, 10));
  }
});

test("رویداد حساس: همهٔ فیلدها ثبت می‌شود و زنجیره سالم است", () => {
  E.setDeviceLabel("POS-02");
  const ev = E.audit({ action: "invoice_void", entityId: "10235", entityLabel: "فاکتور ۱۰۲۳۵", amount: 2450000, reason: "اشتباه در ثبت مشتری", before: { total: 2450000 } });
  assert.equal(ev.severity, "sensitive");
  assert.equal(ev.device.label, "POS-02");
  assert.equal(ev.amount, 2450000);
  assert.equal(ev.reason, "اشتباه در ثبت مشتری");
  assert.equal(ev.entity.id, "10235");
  assert.deepEqual(ev.flags, []);
  assert.ok(ev.actor && "name" in ev.actor);
  assert.equal(E.verifyAuditChain().ok, true);
  const n = E.getAuditEvents()[0];
  assert.equal(n.device, "POS-02"); assert.equal(n.entityId, "10235");
});

test("بدون دلیل: ثبت می‌شود ولی پرچم no_reason می‌گیرد", () => {
  const ev = E.audit({ action: "stock_adjust", entityLabel: "کاغذ", reason: "" });
  assert.deepEqual(ev.flags, ["no_reason"]);
  assert.equal(E.auditStats().noReason, 1);
  assert.equal(E.getAuditEvents({ onlyNoReason: true }).length, 1);
  assert.equal(E.audit({ action: "password_change" }).flags.length, 0, "تغییر رمز دلیل اجباری ندارد");
});

test("زنجیره: ویرایش، حذف از وسط و حذف آخرین رویداد تشخیص داده می‌شود", () => {
  for (let i = 1; i <= 5; i++) E.audit({ action: "price_change", entityLabel: "کالا" + i, amount: i * 1000, reason: "تورم" });
  assert.equal(E.verifyAuditChain().checked, 5);
  const KEY = E.AUDIT_KEY, orig = localStorage.getItem(KEY);
  // ۱) تغییر مبلغ
  let s = JSON.parse(orig); s.events[2].amount = 1; localStorage.setItem(KEY, JSON.stringify(s));
  let v = E.verifyAuditChain(); assert.equal(v.ok, false); assert.equal(v.problem, "hash_mismatch"); assert.equal(v.atSeq, 3);
  // ۲) حذف از وسط
  s = JSON.parse(orig); s.events.splice(1, 1); localStorage.setItem(KEY, JSON.stringify(s));
  v = E.verifyAuditChain(); assert.equal(v.ok, false); assert.equal(v.problem, "seq_gap");
  // ۳) حذف آخرین
  s = JSON.parse(orig); s.events.pop(); localStorage.setItem(KEY, JSON.stringify(s));
  v = E.verifyAuditChain(); assert.equal(v.ok, false); assert.equal(v.problem, "truncated");
  // ۴) بازگردانی → سالم
  localStorage.setItem(KEY, orig);
  assert.equal(E.verifyAuditChain().ok, true);
});

test("خروجی JSON بیرونی قابل تأیید است و دستکاری در آن پیدا می‌شود", () => {
  E.audit({ action: "ledger_adjust", amount: 5, reason: "اصلاح" }); E.audit({ action: "backup_restore", reason: "خرابی" });
  const json = E.exportChainJson();
  assert.equal(E.verifyExportedChain(json).ok, true);
  const o = JSON.parse(json); o.events[0].reason = "چیز دیگر";
  assert.equal(E.verifyExportedChain(o).ok, false);
  assert.equal(E.verifyExportedChain("not json").ok, false);
});

test("رویداد عادی در لاگ سبک می‌رود و وارد زنجیره نمی‌شود؛ logActivity سازگار است", () => {
  E.logActivity("ثبت فروش", "فروش ۱");
  assert.equal(E.getChainEvents().length, 0);
  const all = E.getAuditEvents();
  assert.equal(all.length, 1); assert.equal(all[0].label, "ثبت فروش"); assert.equal(all[0].severity, "info");
  assert.equal(E.getAuditEvents({ includeInfo: false }).length, 0);
  for (let i = 0; i < 520; i++) E.logActivity("x" + i);
  assert.ok(E.getInfoLog().length <= E.ACTIVITY_MAX);
});

test("فیلتر و جستجو و CSV", () => {
  E.audit({ action: "invoice_void", entityLabel: "فاکتور ۱", reason: "اشتباه" });
  E.audit({ action: "backup_restore", reason: "خرابی دیسک" });
  assert.equal(E.getAuditEvents({ severity: "critical" }).length, 1);
  assert.equal(E.getAuditEvents({ q: "دیسک" }).length, 1);
  assert.equal(E.getAuditEvents({ action: "invoice_void" }).length, 1);
  const csv = E.eventsToCsv(E.getAuditEvents());
  assert.ok(csv.startsWith("﻿") && csv.includes("خرابی دیسک") && csv.split("\r\n").length === 3);
});

test("چرخش دفتر: بیش از سقف، قدیمی‌ها به base می‌روند و زنجیره سالم می‌ماند", () => {
  E.__setAuditMaxForTest(40);
  try {
    for (let i = 0; i < 45; i++) E.audit({ action: "currency_change", details: String(i) });
    const s = JSON.parse(localStorage.getItem(E.AUDIT_KEY));
    assert.equal(s.events.length, 40); assert.equal(s.base.seq, 5);
    assert.equal(E.verifyAuditChain().ok, true);
  } finally { E.__setAuditMaxForTest(E.AUDIT_MAX); }
});

test("catalog: همهٔ عملیات حساس درخواست‌شده تعریف شده‌اند", () => {
  for (const c of ["invoice_void", "payment_delete", "sale_revise", "stock_adjust", "backup_restore", "password_change", "permission_change", "price_change", "ledger_adjust"]) {
    assert.ok(E.AUDIT_ACTIONS[c], c);
    assert.notEqual(E.AUDIT_ACTIONS[c].severity, "info");
  }
  assert.equal(E.needsReason("invoice_void"), true);
});
