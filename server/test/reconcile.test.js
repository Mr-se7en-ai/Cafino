// تطبیق مالی (Reconciliation): هر ناهماهنگی ساخته‌شده با دستکاری مستقیم دیتابیس (با غیرفعال‌کردن تریگرها، مثل یک ابرکاربر) باید کشف شود؛
// بازسازی فقط سند اصلاحی می‌افزاید و ردیف قدیمی دفتر را هرگز عوض نمی‌کند؛ Dry-Run هیچ‌چیز را تغییر نمی‌دهد.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { startDb, stopDb, makeApp, client } from "./helpers.js";

let ctx, O, url;
const PW = "رمز-خیلی-قوی-۱۲۳";
const q = (s, p = []) => ctx.pool.query(s, p);
const ledgerSnap = async () => JSON.stringify((await q("SELECT id,account_id,kind,amount::text,ref_type,ref_id FROM ledger_entries WHERE cafe_id=$1 ORDER BY id", [O.cafeId])).rows);
const codes = async () => { const r = (await O.call("GET", "/api/integrity")).data; return { r, set: new Set(r.findings.map((f) => f.code)) }; };
const trg = async (table, name, on) => q(`ALTER TABLE ${table} ${on ? "ENABLE" : "DISABLE"} TRIGGER ${name}`);
const tamper = async (fn) => { await trg("ledger_entries", "ledger_immutable_trg", false); await trg("ledger_entries", "ledger_entries_no_delete_trg", false); await trg("payments", "payments_guard_trg", false);
  try { await fn(); } finally { await trg("ledger_entries", "ledger_immutable_trg", true); await trg("ledger_entries", "ledger_entries_no_delete_trg", true); await trg("payments", "payments_guard_trg", true); } };

before(async () => {
  url = await startDb(); ctx = await makeApp(url);
  const c = client(ctx.app); const r = await c.post("/api/auth/register", { email: "rc@cafe.test", password: PW, firstName: "م", lastName: "ر", phone: "09121234567", shopName: "تطبیق" }); assert.equal(r.status, 201);
  O = { call: (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }), cafeId: r.data.user.branchId };
  for (let i = 1; i <= 3; i++) { await O.call("POST", "/api/customers", { id: `c${i}`, firstName: `م${i}` }); await O.call("POST", "/api/invoices", { id: `i${i}`, number: `N${i}`, customerId: `c${i}`, date: "2026-11-01", items: [{ description: "x", quantity: 2, unitPrice: 5000 }] });
    await O.call("POST", "/api/payments", { id: `p${i}`, invoiceId: `i${i}`, amount: 4000, date: "2026-11-01", method: "cash" }); }
  await O.call("POST", "/api/inventory", { id: "it1", name: "چای", qty: 10 }); await O.call("POST", "/api/inventory-movements", { id: "m1", itemId: "it1", qtyDelta: -3, reason: "مصرف" });
  await O.call("POST", "/api/payments/p3/void", { reason: "اشتباه" });
  await O.call("POST", "/api/payments", { id: "p4", invoiceId: "i2", amount: 500, date: "2026-11-01" });
});
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); });

test("سیستم سالم: ok، بدون یافتهٔ medium و بالاتر؛ ساختار گزارش کامل", async () => {
  const { r } = await codes();
  assert.equal(r.ok, true, JSON.stringify(r.findings.filter((f) => f.severity !== "low")));
  assert.deepEqual(Object.keys(r.summary).sort(), ["critical", "high", "low", "medium", "total"]); assert.ok(r.checks.length >= 22); assert.ok(r.generatedAt);
  for (const k of ["paymentsWithoutInvoice", "paymentsWithoutCustomer", "invoicesWithoutCustomer", "ordersWithoutCustomer", "ordersWithoutInvoice", "paymentCustomerMismatch"]) assert.deepEqual(r.orphans[k], []);
});

test("کشف ناهماهنگی‌ها: هر دستکاری مستقیم، یافتهٔ مشخص با شدت درست می‌دهد", async () => {
  await tamper(async () => {
    await q("UPDATE ledger_entries SET amount = -3999 WHERE cafe_id=$1 AND id='pay-p1'", [O.cafeId]);                                              // مبلغ دفتر پرداخت با پرداخت نمی‌خواند
    await q("DELETE FROM ledger_entries WHERE cafe_id=$1 AND id='pay-p2'", [O.cafeId]);                                                           // پرداخت بدون دفتر
    await q("INSERT INTO ledger_entries(cafe_id,id,account_id,kind,amount,ref_type,ref_id) VALUES ($1,'dupx','acc_c2','payment',-500,'payment','p4')", [O.cafeId]);   // ثبت تکراری
    await q("INSERT INTO ledger_entries(cafe_id,id,account_id,kind,amount,ref_type,ref_id) VALUES ($1,'ghost','acc_c1','payment',-777,'payment','no-such')", [O.cafeId]);   // یتیم
    await q("UPDATE accounts SET balance = balance + 5 WHERE cafe_id=$1 AND id='acc_c3'", [O.cafeId]);                                              // مانده حساب
    await q("UPDATE payments SET amount = -3500 WHERE cafe_id=$1 AND reversal_of='p3'", [O.cafeId]);                                                // مبلغ برگشت
    await q("UPDATE inventory SET qty = 99 WHERE cafe_id=$1 AND id='it1'", [O.cafeId]);                                                              // موجودی
  });
  await q("UPDATE invoices SET paid_amount = 1, remaining_amount = 9999, status='unpaid' WHERE cafe_id=$1 AND id='i2'", [O.cafeId]);               // مشتق فاکتور
  await q("INSERT INTO payments(cafe_id,id,invoice_id,customer_id,amount,method,date) VALUES ($1,'dd1','i1','c1',100,'cash','2026-11-02'),($1,'dd2','i1','c1',100,'cash','2026-11-02')", [O.cafeId]);   // احتمال تکراری
  await q("INSERT INTO invoices(cafe_id,id,number,customer_id,total_amount,remaining_amount,status) VALUES ($1,'i9','N1','c1',10,10,'unpaid')", [O.cafeId]);   // شمارهٔ تکراری
  const { r, set } = await codes();
  const expect = { "ledger.payment_amount_mismatch": "critical", "ledger.payment_missing": "high", "ledger.payment_duplicate": "critical", "ledger.orphan_ref": "high", "account.balance_mismatch": "critical",
    "reversal.amount_mismatch": "critical", "inventory.qty_mismatch": "critical", "invoice.derived_mismatch": "medium", "payment.possible_duplicate": "low", "invoice.duplicate_number": "low" };
  for (const [code, sev] of Object.entries(expect)) { assert.ok(set.has(code), `کشف نشد: ${code}`); assert.equal(r.findings.find((f) => f.code === code).severity, sev, code); }
  assert.equal(r.ok, false); assert.ok(r.summary.critical >= 4);
  const f = r.findings.find((x) => x.code === "ledger.payment_amount_mismatch"); assert.deepEqual([f.id, f.expected, f.actual], ["p1", -4000, -3999]);
  assert.equal(r.findings.find((x) => x.code === "ledger.orphan_ref").id, "payment:no-such");
});

test("Dry-Run: همان طرح اصلاح را نشان می‌دهد ولی هیچ ردیفی تغییر نمی‌کند", async () => {
  const snap = async () => JSON.stringify([await ledgerSnap(), (await q("SELECT id,balance::text FROM accounts ORDER BY id")).rows, (await q("SELECT id,paid_amount::text,status FROM invoices ORDER BY id")).rows, (await q("SELECT id,qty::text FROM inventory")).rows, (await q("SELECT count(*)::int n FROM audit_log WHERE action='integrity.rebuild'")).rows]);
  const before = await snap();
  const d = await O.call("POST", "/api/integrity/rebuild", { dryRun: true }); assert.equal(d.status, 200); assert.equal(d.data.dryRun, true);
  assert.ok(d.data.ledger.plan.length >= 1); assert.equal(d.data.ledger.fixed, 0); assert.equal(d.data.invoices.fixed, 0); assert.equal(d.data.after.total, d.data.before.total);
  assert.equal(await snap(), before, "Dry-Run چیزی را عوض کرد");
});

test("بازسازی واقعی: فقط سند اصلاحی می‌افزاید (ردیف‌های قدیمی دفتر بدون تغییر)، مشتق‌ها را درست می‌کند، حسابرسی با قبل/بعد ثبت می‌شود، اجرای دوم بی‌اثر", async () => {
  const oldRows = (await q("SELECT id,account_id,kind,amount::text,ref_type,ref_id,created_at FROM ledger_entries WHERE cafe_id=$1", [O.cafeId])).rows;
  const rb = await O.call("POST", "/api/integrity/rebuild", { reason: "تست تطبیق" }); assert.equal(rb.status, 200, JSON.stringify(rb.json));
  assert.ok(rb.data.before.total > rb.data.after.total);
  // هر ردیف قدیمی دقیقاً همان است که بود
  const now = new Map((await q("SELECT id,account_id,kind,amount::text,ref_type,ref_id,created_at FROM ledger_entries WHERE cafe_id=$1", [O.cafeId])).rows.map((r) => [r.id, r]));
  for (const o of oldRows) assert.deepEqual(now.get(o.id), o, `ردیف قدیمی ${o.id} تغییر کرد`);
  assert.ok(now.size > oldRows.length, "باید سند اصلاحی افزوده شده باشد");
  const added = [...now.values()].filter((r) => !oldRows.some((o) => o.id === r.id)); assert.ok(added.some((r) => r.ref_type === "reconcile" && r.kind === "adjustment"));
  const { r, set } = await codes();
  assert.ok(!r.findings.some((f) => f.code === "ledger.payment_amount_mismatch" && f.id === "p1"), "p1 باید با سند اصلاحی درست شده باشد"); assert.ok(r.findings.some((f) => f.code === "ledger.payment_amount_mismatch" && f.id === "p4"), "p4 (ثبت تکراری) خودکار اصلاح نمی‌شود و انسان باید تصمیم بگیرد");
  for (const code of ["ledger.orphan_ref", "account.balance_mismatch", "inventory.qty_mismatch", "invoice.derived_mismatch", "ledger.payment_missing"]) assert.ok(!set.has(code), `هنوز هست: ${code}`);
  // موارد غیرقابل‌اصلاحِ خودکار (تکراری‌بودنِ ثبت، مبلغ برگشت) باقی می‌مانند و گزارش می‌شوند — انسان تصمیم می‌گیرد
  assert.ok(set.has("ledger.payment_duplicate") && set.has("reversal.amount_mismatch"));
  const au = (await q("SELECT details FROM audit_log WHERE cafe_id=$1 AND action='integrity.rebuild' ORDER BY id DESC LIMIT 1", [O.cafeId])).rows[0].details; assert.equal(au.reason, "تست تطبیق"); assert.ok(au.before.total > au.after.total);
  const again = await O.call("POST", "/api/integrity/rebuild", {}); assert.equal(again.data.ledger.fixed, 0); assert.equal(again.data.invoices.fixed, 0); assert.equal(again.data.accounts.fixed, 0);
});

test("قفل تراکنشی: بازسازی هم‌زمان دوم 409 می‌گیرد (دو بازسازی هم‌زمان ممکن نیست)", async () => {
  const hold = new pg.Client({ connectionString: url }); await hold.connect();
  try {
    await hold.query("BEGIN"); await hold.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`rebuild:${O.cafeId}`]);
    const r = await O.call("POST", "/api/integrity/rebuild", { dryRun: true }); assert.equal(r.status, 409); assert.equal(r.json.error.code, "rebuild_in_progress");
  } finally { await hold.query("ROLLBACK"); await hold.end(); }
  assert.equal((await O.call("POST", "/api/integrity/rebuild", { dryRun: true })).status, 200);
});

test("ورودی نامعتبر و دسترسی: scope ناشناخته 422؛ کارمند 403", async () => {
  assert.equal((await O.call("POST", "/api/integrity/rebuild", { scope: ["hack"] })).status, 422);
  assert.equal((await O.call("POST", "/api/integrity/rebuild", { scope: [] })).status, 422);
  const inv = await O.call("POST", "/api/users/invite", { email: "st@x.test", role: "staff", firstName: "ک", lastName: "ا" }); assert.equal(inv.status, 201);
  const sc = client(ctx.app); const lg = await sc.post("/api/auth/login", { email: "st@x.test", password: inv.data.temporaryPassword });
  assert.equal((await sc.call("GET", "/api/integrity", { bearer: lg.data.accessToken })).status, 403);
  assert.equal((await sc.call("POST", "/api/integrity/rebuild", { bearer: lg.data.accessToken, body: {} })).status, 403);
});
