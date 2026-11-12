// یکپارچگی مالی روی PostgreSQL واقعی: دفتر کل حساب، برگشت پرداخت، حسابرسی کامل، دفتر انبار + بازسازی، ارجاع‌ها، و تست استرس هم‌زمانی.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { verifyAuditChain } from "../src/lib/audit.js";

let ctx, O, owner;
const PW = "رمز-خیلی-قوی-۱۲۳";
before(async () => {
  ctx = await makeApp(await startDb());
  const c = client(ctx.app);
  const r = await c.post("/api/auth/register", { email: "fin@cafe.test", password: PW, firstName: "م", lastName: "ر", phone: "09121234567", shopName: "مالی" });
  assert.equal(r.status, 201); O = { c, token: r.data.accessToken, cafeId: r.data.user.branchId };
  owner = (m, u, body, o = {}) => O.c.call(m, u, { body, bearer: O.token, ...o });
});
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); });
const audits = async (action) => (await ctx.pool.query("SELECT * FROM audit_log WHERE cafe_id=$1 AND action=$2 ORDER BY id", [O.cafeId, action])).rows;
const row = async (sql, p = []) => (await ctx.pool.query(sql, [O.cafeId, ...p])).rows;

test("حساب: balance را کلاینت نمی‌نویسد؛ مانده = مجموع ردیف‌های دفتر کل (اولیه + فاکتور − پرداخت + تعدیل − برگشت وجه)", async () => {
  await owner("POST", "/api/customers", { id: "cu1", firstName: "سارا" });
  const acc = await owner("POST", "/api/accounts", { id: "ac1", customerId: "cu1", name: "سارا", balance: 50000 });
  assert.equal(acc.status, 201); assert.equal(acc.data.balance, 50000, "balance هنگام ساخت = ردیف «مانده اولیه»");
  assert.equal((await owner("PATCH", "/api/accounts/ac1", { balance: 99999999, name: "سارا الف" })).data.balance, 50000, "PATCH مانده را عوض نمی‌کند");
  let led = (await owner("GET", "/api/accounts/ac1/ledger")).data; assert.equal(led.entries.length, 1); assert.equal(led.entries[0].kind, "opening"); assert.equal(led.consistent, true);

  await owner("POST", "/api/invoices", { id: "li1", number: "1", customerId: "cu1", date: "2026-10-30", items: [{ description: "x", quantity: 1, unitPrice: 200000 }] });
  assert.equal((await owner("GET", "/api/accounts/ac1")).data.balance, 250000, "فاکتور بدهکار می‌کند (روی حساب موجودِ مشتری)");
  await owner("POST", "/api/payments", { id: "lp1", invoiceId: "li1", amount: 120000, date: "2026-10-30" });
  assert.equal((await owner("GET", "/api/accounts/ac1")).data.balance, 130000);
  await owner("POST", "/api/payments/lp1/void", { reason: "اشتباه در ثبت" });
  assert.equal((await owner("GET", "/api/accounts/ac1")).data.balance, 250000, "برگشت پرداخت مانده را برمی‌گرداند");
  await owner("PATCH", "/api/invoices/li1", { items: [{ description: "x", quantity: 1, unitPrice: 150000 }] });
  assert.equal((await owner("GET", "/api/accounts/ac1")).data.balance, 200000, "ویرایش فاکتور با ردیف تفاضلی");

  assert.equal((await owner("POST", "/api/accounts/ac1/adjust", { amount: -30000 })).status, 422, "تعدیل بدون دلیل ممنوع");
  const adj = await owner("POST", "/api/accounts/ac1/adjust", { amount: -30000, reason: "تخفیف مدیر" }, { headers: { "idempotency-key": "adj-1" } }); assert.equal(adj.status, 201); assert.equal(adj.data.balance, 170000);
  assert.equal((await owner("POST", "/api/accounts/ac1/adjust", { amount: -30000, reason: "تخفیف مدیر" }, { headers: { "idempotency-key": "adj-1" } })).data.balance, 170000, "تکرار با کلید، دوباره ثبت نمی‌شود");
  const rf = await owner("POST", "/api/accounts/ac1/adjust", { amount: 20000, kind: "refund", reason: "برگشت وجه" }); assert.equal(rf.data.balance, 190000);
  led = (await owner("GET", "/api/accounts/ac1/ledger")).data;
  assert.equal(led.balance, 190000); assert.equal(led.consistent, true);
  assert.equal(led.entries.reduce((s, e) => s + e.amount, 0), 190000);
  assert.deepEqual([...new Set(led.entries.map((e) => e.kind))].sort(), ["adjustment", "invoice", "opening", "payment", "refund", "reversal"]);

  await owner("POST", "/api/invoices/li1/void", { reason: "انصراف مشتری" });
  assert.equal((await owner("GET", "/api/accounts/ac1")).data.balance, 190000 - 150000, "ابطال فاکتور مطالبه را صفر می‌کند");
  assert.equal((await owner("POST", "/api/payments", { id: "late", invoiceId: "li1", amount: 5 })).json.error.code, "invoice_void");
  assert.equal((await owner("PATCH", "/api/invoices/li1", { discount: 1 })).status, 409, "فاکتور باطل‌شده ویرایش نمی‌شود");
});

test("قفل پایگاه‌داده: ردیف دفتر کل و مبلغ/حذف پرداخت حتی با SQL مستقیم ممکن نیست", async () => {
  const bad = (sql, p = []) => assert.rejects(ctx.pool.query(sql, [O.cafeId, ...p]), /ledger_immutable|payments_immutable|payments_no_delete|payments_amount_sign|check|foreign key|duplicate key/i);
  await bad("UPDATE ledger_entries SET amount = 1 WHERE cafe_id=$1");
  await bad("UPDATE payments SET amount = amount + 1 WHERE cafe_id=$1 AND id='lp1'");
  await bad("UPDATE payments SET deleted_at = now() WHERE cafe_id=$1 AND id='lp1'");
  await bad("UPDATE payments SET invoice_id = 'zzz' WHERE cafe_id=$1 AND id='lp1'");
  await bad("INSERT INTO payments (cafe_id,id,amount,kind) VALUES ($1,'neg',-5,'payment')");
  await bad("INSERT INTO payments (cafe_id,id,amount,kind,reversal_of) VALUES ($1,'rv2',-120000,'reversal','lp1')");     // برگشت دوم برای همان پرداخت (یکتا)
  await bad("INSERT INTO payments (cafe_id,id,amount,kind,reversal_of) VALUES ($1,'rv3',-5,'reversal','nonexistent')");  // کلید خارجی هم‌مستأجر
});

test("حسابرسی: همهٔ نوشتن‌های مالی با قبل/بعد/کاربر/IP/دلیل ثبت می‌شوند و زنجیره سالم می‌ماند", async () => {
  assert.equal((await owner("PATCH", "/api/payments/lp1", { method: "pos", reason: "اصلاح روش پرداخت" })).status, 200);
  await owner("POST", "/api/expenses", { id: "e1", amount: 5000, date: "2026-10-30", category: "برق" });
  await owner("PATCH", "/api/expenses/e1", { amount: 7000, reason: "اصلاح مبلغ" });
  await owner("POST", "/api/transactions", { id: "t1", type: "income", amount: 9000, date: "2026-10-30" });
  await owner("DELETE", "/api/transactions/t1?reason=اشتباه%20ثبت");
  await owner("POST", "/api/inventory", { id: "au-item", name: "کاغذ", qty: 10 });
  await owner("POST", "/api/inventory-movements", { inventoryItemId: "au-item", quantity: -3, kind: "sale", note: "فروش" });
  await owner("POST", "/api/payments", { id: "ap1", invoiceId: "li1x", amount: 1 });   // یتیم؛ نباید audit بسازد
  const need = ["invoice.create", "invoice.update", "invoice.void", "payment.create", "payment.update", "payment.void", "expense.create", "expense.update", "transaction.create", "transaction.delete", "account.adjust", "inventory.movement", "inventory.create"];
  for (const a of need) assert.ok((await audits(a)).length >= 1, `audit ${a} وجود ندارد`);
  assert.equal((await audits("payment.delete")).length, 0, "payment.delete وجود ندارد");
  const pv = (await audits("payment.void"))[0]; assert.equal(pv.entity_id, "lp1"); assert.equal(pv.details.before.amount, 120000); assert.equal(pv.details.after.amount, -120000); assert.equal(pv.details.reason, "اشتباه در ثبت"); assert.ok(pv.user_id); assert.ok(pv.ip);
  const eu = (await audits("expense.update"))[0]; assert.equal(eu.details.before.amount, 5000); assert.equal(eu.details.after.amount, 7000); assert.equal(eu.details.reason, "اصلاح مبلغ");
  const td = (await audits("transaction.delete"))[0]; assert.equal(td.details.before.amount, 9000); assert.equal(td.details.reason, "اشتباه ثبت");
  const im = (await audits("inventory.movement"))[0]; assert.equal(im.details.qtyBefore, 10); assert.equal(im.details.qtyAfter, 7); assert.equal(im.details.delta, -3);
  const iu = (await audits("invoice.update")).at(-1); assert.ok(iu.details.before.totalAmount !== iu.details.after.totalAmount, "قبل/بعد مبلغ فاکتور");
  const aa = (await audits("account.adjust"))[0]; assert.equal(aa.details.reason, "تخفیف مدیر"); assert.equal(aa.details.after.balance - aa.details.before.balance, -30000);
  assert.equal((await verifyAuditChain(ctx.pool, O.cafeId)).ok, true);
});

test("انبار: موجودی = موجودی اولیه + حرکت‌ها؛ خرابی qty شناسایی و با Rebuild Inventory اصلاح می‌شود", async () => {
  await owner("POST", "/api/inventory", { id: "ink", name: "جوهر", qty: 100 });
  for (const q of [-10, -25, 5]) await owner("POST", "/api/inventory-movements", { inventoryItemId: "ink", quantity: q, kind: "adjustment" });
  let led = (await owner("GET", "/api/inventory/ink/ledger")).data; assert.equal(led.openingQty, 100); assert.equal(led.qty, 70); assert.equal(led.computedQty, 70); assert.equal(led.consistent, true); assert.equal(led.movements.length, 3);
  assert.equal((await owner("GET", "/api/inventory/ink")).data.openingQty, 100);
  assert.equal((await owner("PATCH", "/api/inventory/ink", { openingQty: 5, qty: 1 })).data.openingQty, 100, "موجودی اولیه را کلاینت عوض نمی‌کند");
  await ctx.pool.query("UPDATE inventory SET qty = 9999 WHERE cafe_id=$1 AND id='ink'", [O.cafeId]);       // خرابی
  const chk = (await owner("GET", "/api/integrity")).data; assert.equal(chk.ok, false); assert.equal(chk.inventory.drift.find((d) => d.id === "ink").computed, 70);
  const dry = (await owner("POST", "/api/inventory/rebuild", { dryRun: true })).data; assert.equal(dry.fixed, 0); assert.equal((await owner("GET", "/api/inventory/ink")).data.qty, 9999, "dryRun چیزی نمی‌نویسد");
  const rb = (await owner("POST", "/api/inventory/rebuild", { reason: "خرابی دستی" })).data; assert.equal(rb.fixed, 1); assert.equal(rb.drift[0].stored, 9999);
  assert.equal((await owner("GET", "/api/inventory/ink")).data.qty, 70);
  assert.equal((await audits("inventory.rebuild")).length, 1);
  assert.equal((await owner("POST", "/api/inventory-movements", { inventoryItemId: "ghost", quantity: 1 })).status, 404);
  await assert.rejects(ctx.pool.query("INSERT INTO inventory_movements (cafe_id,id,item_id,qty_delta) VALUES ($1,'orph','nope',1)", [O.cafeId]), /foreign key|inv_mov_item_fk/i, "کلید خارجی هم‌مستأجر");
});

test("ارجاع‌ها: یتیم‌ها رد می‌شوند؛ اگر با SQL مستقیم ساخته شوند، /integrity گزارش می‌دهد و rebuild مقادیر مشتق را درست می‌کند", async () => {
  assert.equal((await owner("POST", "/api/invoices", { id: "bad-c", customerId: "no-such", items: [{ description: "x", quantity: 1, unitPrice: 1 }] })).json.error.code, "unknown_reference");
  assert.equal((await owner("POST", "/api/accounts", { id: "bad-a", customerId: "no-such" })).status, 422);
  // تزریق مستقیم (مثلاً از اسکریپت/نسخهٔ قدیمی)
  await ctx.pool.query("INSERT INTO payments (cafe_id,id,invoice_id,customer_id,amount) VALUES ($1,'orph-p','ghost','ghost-c',10)", [O.cafeId]);
  await ctx.pool.query("INSERT INTO orders (cafe_id,id,customer_id,invoice_id,title) VALUES ($1,'orph-o','ghost-c','ghost','x')", [O.cafeId]);
  await owner("POST", "/api/customers", { id: "cu2", firstName: "ب" });
  await owner("POST", "/api/invoices", { id: "dr1", customerId: "cu2", items: [{ description: "x", quantity: 2, unitPrice: 1000 }] });
  await owner("POST", "/api/payments", { id: "drp", invoiceId: "dr1", amount: 500 });
  await ctx.pool.query("UPDATE invoices SET paid_amount=2000, remaining_amount=0, status='paid', total_amount=5 WHERE cafe_id=$1 AND id='dr1'", [O.cafeId]);   // دست‌کاری مستقیم
  await ctx.pool.query("UPDATE accounts SET balance = 1 WHERE cafe_id=$1 AND customer_id='cu2'", [O.cafeId]);
  const chk = (await owner("GET", "/api/integrity")).data;
  assert.ok(chk.orphans.paymentsWithoutInvoice.includes("orph-p")); assert.ok(chk.orphans.paymentsWithoutCustomer.includes("orph-p")); assert.ok(chk.orphans.ordersWithoutCustomer.includes("orph-o")); assert.ok(chk.orphans.ordersWithoutInvoice.includes("orph-o"));
  assert.ok(chk.invoices.drift.some((d) => d.id === "dr1")); assert.ok(chk.accounts.drift.length >= 1);
  const rb = (await owner("POST", "/api/integrity/rebuild", { scope: ["invoices", "accounts"], reason: "تست" })).data;
  assert.ok(rb.invoices.fixed >= 1);
  const g = (await owner("GET", "/api/invoices/dr1")).data; assert.equal(g.totalAmount, 2000); assert.equal(g.paidAmount, 500); assert.equal(g.status, "partial");
  const chk2 = (await owner("GET", "/api/integrity")).data; assert.equal(chk2.invoices.drift.length, 0); assert.equal(chk2.accounts.drift.length, 0);
  assert.equal((await owner("POST", "/api/integrity/rebuild", { scope: ["x"] })).status, 422);
  assert.equal((await audits("integrity.rebuild")).length, 1);
});

test("استرس هم‌زمانی: ۱۰۰ پرداخت هم‌زمان از ۱۰ کلاینت روی یک فاکتور؛ SUM(payments) == paid_amount == مانده حساب", async () => {
  await owner("POST", "/api/customers", { id: "st-c", firstName: "استرس" });
  const TOTAL = 10_000_000, N = 100, AMT = 50_000;                                            // مجموع ۵٬۰۰۰٬۰۰۰ از ۱۰٬۰۰۰٬۰۰۰
  await owner("POST", "/api/invoices", { id: "st-inv", number: "ST1", customerId: "st-c", date: "2026-10-30", items: [{ description: "بزرگ", quantity: 1, unitPrice: TOTAL }] });
  const clients = [];
  for (let i = 0; i < 10; i++) { const c = client(ctx.app); const r = await c.post("/api/auth/login", { email: "fin@cafe.test", password: PW }); assert.equal(r.status, 200); clients.push({ c, token: r.data.accessToken }); }
  const jobs = Array.from({ length: N }, (_, i) => { const cl = clients[i % 10]; return cl.c.call("POST", "/api/payments", { body: { id: `st-p${i}`, invoiceId: "st-inv", amount: AMT, method: i % 2 ? "cash" : "card", date: "2026-10-30" }, bearer: cl.token, headers: { "idempotency-key": `payment-st-p${i}` } }); });
  // ارسال تکراری هم‌زمان (صف آفلاین دو بار می‌فرستد) نباید دوبار حساب شود
  for (let i = 0; i < 20; i++) { const cl = clients[(i + 3) % 10]; jobs.push(cl.c.call("POST", "/api/payments", { body: { id: `st-p${i}`, invoiceId: "st-inv", amount: AMT, method: i % 2 ? "cash" : "card", date: "2026-10-30" }, bearer: cl.token, headers: { "idempotency-key": `payment-st-p${i}` } })); }
  const res = await Promise.all(jobs);
  assert.ok(res.every((r) => r.status === 201 || r.status === 200), JSON.stringify(res.filter((r) => ![200, 201].includes(r.status)).map((r) => r.json)));
  const sum = Number((await row("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE cafe_id=$1 AND invoice_id='st-inv' AND deleted_at IS NULL"))[0].s);
  const inv = (await row("SELECT * FROM invoices WHERE cafe_id=$1 AND id='st-inv'"))[0];
  assert.equal(sum, N * AMT); assert.equal(Number(inv.paid_amount), sum, "SUM(payments) == invoice.paid_amount"); assert.equal(Number(inv.remaining_amount), TOTAL - sum); assert.equal(inv.status, "partial");
  assert.equal((await row("SELECT count(*)::int n FROM payments WHERE cafe_id=$1 AND invoice_id='st-inv'"))[0].n, N, "هیچ پرداخت تکراری‌ای ساخته نشد");
  const acc = (await row("SELECT balance FROM accounts WHERE cafe_id=$1 AND customer_id='st-c'"))[0];
  assert.equal(Number(acc.balance), TOTAL - sum, "مانده حساب = فاکتور − پرداخت‌ها");
  assert.equal(Number((await row("SELECT SUM(amount) s FROM ledger_entries e JOIN accounts a ON a.cafe_id=e.cafe_id AND a.id=e.account_id WHERE e.cafe_id=$1 AND a.customer_id='st-c'"))[0].s), TOTAL - sum);

  // مرحلهٔ دوم: برگشت نیمی از پرداخت‌ها هم‌زمان با پرداخت‌های تازه
  const mixed = [];
  for (let i = 0; i < 50; i++) { const cl = clients[i % 10]; mixed.push(cl.c.call("POST", `/api/payments/st-p${i}/void`, { body: { reason: "تست استرس" }, bearer: cl.token })); }
  for (let i = 0; i < 50; i++) { const cl = clients[(i + 5) % 10]; mixed.push(cl.c.call("POST", "/api/payments", { body: { id: `st-q${i}`, invoiceId: "st-inv", amount: 10_000, date: "2026-10-30" }, bearer: cl.token })); }
  const r2 = await Promise.all(mixed);
  assert.ok(r2.every((r) => [200, 201].includes(r.status)), JSON.stringify(r2.filter((r) => ![200, 201].includes(r.status)).map((r) => r.json)));
  const sum2 = Number((await row("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE cafe_id=$1 AND invoice_id='st-inv' AND deleted_at IS NULL"))[0].s);
  const inv2 = (await row("SELECT * FROM invoices WHERE cafe_id=$1 AND id='st-inv'"))[0];
  assert.equal(sum2, 50 * AMT + 50 * 10_000); assert.equal(Number(inv2.paid_amount), sum2); assert.equal(Number(inv2.remaining_amount), TOTAL - sum2);
  assert.equal(Number((await row("SELECT balance FROM accounts WHERE cafe_id=$1 AND customer_id='st-c'"))[0].balance), TOTAL - sum2);
  const chk = (await owner("GET", "/api/integrity")).data; assert.equal(chk.invoices.drift.filter((d) => d.id === "st-inv").length, 0); assert.equal(chk.accounts.drift.length, 0);
  assert.equal((await verifyAuditChain(ctx.pool, O.cafeId)).ok, true, "زنجیرهٔ حسابرسی زیر بار هم سالم است");
});
