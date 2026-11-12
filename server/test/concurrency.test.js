// هم‌زمانی و تحمل خطا روی PostgreSQL واقعی — «پرداخت تکراری، مانده غلط یا سند ناقص نباید پیش بیاید».
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, stopDb, makeApp, client } from "./helpers.js";

let ctx, O, url;
const PW = "رمز-خیلی-قوی-۱۲۳";
const q = (s, p = []) => ctx.pool.query(s, p);
let seq = 0;
before(async () => {
  url = await startDb(); ctx = await makeApp(url, { env: { DB_POOL_MAX: "10" } });
  const c = client(ctx.app); const r = await c.post("/api/auth/register", { email: "k@cafe.test", password: PW, firstName: "م", lastName: "ر", phone: "09121234567", shopName: "هم‌زمان" });
  assert.equal(r.status, 201); O = { call: (m, u, b, h = {}) => c.call(m, u, { body: b, bearer: r.data.accessToken, headers: h }), cafeId: r.data.user.branchId };
});
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); });

const mkInvoice = async (total, { customer = true } = {}) => {
  const n = ++seq, cust = customer ? `cu${n}` : undefined;
  if (customer) { assert.equal((await O.call("POST", "/api/customers", { id: cust, firstName: `م${n}` })).status, 201); }
  const r = await O.call("POST", "/api/invoices", { id: `inv${n}`, number: String(n), customerId: cust, date: "2026-11-01", items: [{ description: "x", quantity: 1, unitPrice: total }] });
  assert.equal(r.status, 201, JSON.stringify(r.json)); return { id: `inv${n}`, cust };
};
const inv = async (id) => (await q("SELECT * FROM invoices WHERE cafe_id=$1 AND id=$2", [O.cafeId, id])).rows[0];
// ناوردایی‌های حسابداری برای کل کافی‌نت: بازرسی کامل باید «ok» باشد و حساب = مجموع دفتر
// «invoice.overpaid» برای فاکتوری که عمداً پس از پرداخت‌ها به مبلغ کمتر ویرایش شده، یافتهٔ مشروع (medium) است و در overpaidOk می‌آید
const overpaidOk = new Set();
const assertHealthy = async (label = "") => {
  const r = await O.call("GET", "/api/integrity"); assert.equal(r.status, 200);
  const bad = r.data.findings.filter((f) => f.severity !== "low" && !(f.code === "invoice.overpaid" && overpaidOk.has(f.id)));
  assert.deepEqual(bad, [], `${label} integrity drift`);
};
const sumPays = async (id) => Number((await q("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE cafe_id=$1 AND invoice_id=$2 AND deleted_at IS NULL", [O.cafeId, id])).rows[0].s);

test("۱۰۰ پرداخت هم‌زمان روی یک فاکتور: هیچ پرداخت گم یا دوبل نمی‌شود؛ پرداخت‌شده = مجموع پرداخت‌ها؛ مانده و وضعیت درست", async () => {
  const { id } = await mkInvoice(10000);
  const res = await Promise.all(Array.from({ length: 100 }, (_, i) => O.call("POST", "/api/payments", { id: `c1p${i}`, invoiceId: id, amount: 100, date: "2026-11-02", method: "cash" })));
  assert.deepEqual([...new Set(res.map((r) => r.status))], [201], JSON.stringify(res.find((r) => r.status !== 201)?.json));
  const i = await inv(id); assert.equal(Number(i.paid_amount), 10000); assert.equal(Number(i.remaining_amount), 0); assert.equal(i.status, "paid");
  assert.equal(await sumPays(id), 10000); assert.equal((await q("SELECT count(*)::int n FROM payments WHERE invoice_id=$1", [id])).rows[0].n, 100);
  const led = (await q("SELECT COALESCE(SUM(amount),0) s, count(*)::int n FROM ledger_entries WHERE cafe_id=$1 AND ref_type='payment' AND ref_id LIKE 'c1p%'", [O.cafeId])).rows[0]; assert.equal(Number(led.s), -10000); assert.equal(led.n, 100);
  await assertHealthy("100 payments");
});

test("۱۰۰ پرداخت هم‌زمان که جمعشان از مبلغ بیشتر است: روی فاکتور حداکثر تا مانده؛ مازاد اعتبار مشتری جدا؛ مجموع کل = مجموع ارسالی", async () => {
  const { id, cust } = await mkInvoice(5000);
  const res = await Promise.all(Array.from({ length: 100 }, (_, i) => O.call("POST", "/api/payments", { id: `c2p${i}`, invoiceId: id, amount: 100, date: "2026-11-02" })));
  assert.deepEqual([...new Set(res.map((r) => r.status))], [201]);
  const i = await inv(id); assert.equal(Number(i.paid_amount), 5000, "روی فاکتور از مبلغ بیشتر نمی‌نشیند"); assert.equal(i.status, "paid"); assert.equal(Number(i.remaining_amount), 0);
  const all = Number((await q("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE customer_id=$1", [cust])).rows[0].s); assert.equal(all, 10000, "هیچ ریالی گم نشده: ۵۰۰۰ روی فاکتور + ۵۰۰۰ اعتبار");
  const credit = Number((await q("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE customer_id=$1 AND invoice_id IS NULL", [cust])).rows[0].s); assert.equal(credit, 5000);
  const acc = (await q("SELECT balance FROM accounts WHERE customer_id=$1", [cust])).rows[0]; assert.equal(Number(acc.balance), -5000, "مانده حساب = −اعتبار مشتری (فاکتور +۵۰۰۰، پرداخت‌ها −۱۰۰۰۰)");
  await assertHealthy("overpay");
});

test("ارسال تکراری: ۲۰ درخواست هم‌زمان با «همان id و همان Idempotency-Key» → فقط یک ردیف پرداخت و یک ردیف دفتر", async () => {
  const { id } = await mkInvoice(10000);
  const res = await Promise.all(Array.from({ length: 20 }, () => O.call("POST", "/api/payments", { id: "dup1", invoiceId: id, amount: 700, date: "2026-11-02" }, { "idempotency-key": "pay-dup1" })));
  assert.ok(res.every((r) => r.status === 201 || r.status === 200), JSON.stringify(res.map((r) => r.status)));
  assert.equal(new Set(res.map((r) => r.data?.id)).size, 1);
  assert.equal((await q("SELECT count(*)::int n FROM payments WHERE id='dup1'")).rows[0].n, 1); assert.equal((await q("SELECT count(*)::int n FROM ledger_entries WHERE ref_id='dup1'")).rows[0].n, 1);
  assert.equal(Number((await inv(id)).paid_amount), 700);
});

test("ارسال تکراری بدون Idempotency-Key (فقط همان id): ۳۰ درخواست هم‌زمان → یک ردیف، بدون خطای ۵۰۰", async () => {
  const { id } = await mkInvoice(10000);
  const res = await Promise.all(Array.from({ length: 30 }, () => O.call("POST", "/api/payments", { id: "dup2", invoiceId: id, amount: 900, date: "2026-11-02" })));
  const bad = res.filter((r) => ![200, 201].includes(r.status)); assert.equal(bad.length, 0, JSON.stringify(bad[0]?.json) + bad[0]?.status);
  assert.equal((await q("SELECT count(*)::int n FROM payments WHERE id='dup2'")).rows[0].n, 1); assert.equal(Number((await inv(id)).paid_amount), 900);
  await assertHealthy("dup2");
});

test("۱۰ دستگاه هم‌زمان همان دستهٔ ۲۰ عملیاتی (فاکتور+پرداخت) را همگام می‌کنند → هر سند دقیقاً یک بار", async () => {
  const cust = `dev-cust`; await O.call("POST", "/api/customers", { id: cust, firstName: "دستگاه" });
  const batch = []; for (let k = 0; k < 10; k++) { batch.push(["POST", "/api/invoices", { id: `dv-i${k}`, number: `D${k}`, customerId: cust, date: "2026-11-03", items: [{ description: "x", quantity: 1, unitPrice: 1000 }] }, `dv-inv-${k}`]); batch.push(["POST", "/api/payments", { id: `dv-p${k}`, invoiceId: `dv-i${k}`, amount: 400, date: "2026-11-03" }, `dv-pay-${k}`]); }
  const device = async () => { const out = []; for (const [m, u, b, key] of batch) out.push((await O.call(m, u, b, { "idempotency-key": key })).status); return out; };
  const all = await Promise.all(Array.from({ length: 10 }, device));
  for (const r of all) for (const s of r) assert.ok(s === 200 || s === 201, JSON.stringify(r));
  assert.equal((await q("SELECT count(*)::int n FROM invoices WHERE id LIKE 'dv-i%'")).rows[0].n, 10); assert.equal((await q("SELECT count(*)::int n FROM payments WHERE id LIKE 'dv-p%'")).rows[0].n, 10);
  assert.equal(Number((await q("SELECT balance FROM accounts WHERE customer_id=$1", [cust])).rows[0].balance), 10 * (1000 - 400));
  assert.equal((await q("SELECT count(*)::int n FROM ledger_entries WHERE ref_id LIKE 'dv-%'")).rows[0].n, 20);
  await assertHealthy("devices");
});

test("حرکت‌های هم‌زمان انبار: ۵۰ خروج هم‌زمان از موجودی ۱۰۰ → موجودی ۵۰؛ qty = opening + مجموع حرکت‌ها", async () => {
  assert.equal((await O.call("POST", "/api/inventory", { id: "it1", name: "چای", qty: 100 })).status, 201);
  const res = await Promise.all(Array.from({ length: 50 }, (_, i) => O.call("POST", "/api/inventory-movements", { id: `mv${i}`, itemId: "it1", qtyDelta: -1, reason: "مصرف" })));
  assert.deepEqual([...new Set(res.map((r) => r.status))], [201], JSON.stringify(res.find((r) => r.status !== 201)?.json));
  const it = (await q("SELECT qty::float8 q, opening_qty::float8 o FROM inventory WHERE id='it1'")).rows[0]; assert.equal(it.q, 50); assert.equal(it.o, 100);
  assert.equal(Number((await q("SELECT SUM(qty_delta) s FROM inventory_movements WHERE item_id='it1'")).rows[0].s), -50);
  await assertHealthy("inventory");
});

test("برگشت هم‌زمان یک پرداخت (۲۰ درخواست، شناسه‌های مختلف) → فقط یک برگشت؛ پرداخت‌شده درست", async () => {
  const { id } = await mkInvoice(10000);
  await O.call("POST", "/api/payments", { id: "rv1", invoiceId: id, amount: 3000, date: "2026-11-02" });
  await O.call("POST", "/api/payments", { id: "rv2", invoiceId: id, amount: 2000, date: "2026-11-02" });
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => O.call("POST", "/api/payments/rv1/void", { id: `rvx${i}`, reason: "اشتباه" })));
  assert.ok(res.every((r) => r.status === 201 || r.status === 200), JSON.stringify(res.map((r) => r.status)));
  assert.equal((await q("SELECT count(*)::int n FROM payments WHERE reversal_of='rv1'")).rows[0].n, 1);
  const i = await inv(id); assert.equal(Number(i.paid_amount), 2000); assert.equal(i.status, "partial"); assert.equal(Number(i.remaining_amount), 8000);
  assert.equal((await q("SELECT count(*)::int n FROM ledger_entries WHERE kind='reversal' AND ref_id IN (SELECT id FROM payments WHERE reversal_of='rv1')")).rows[0].n, 1);
  await assertHealthy("void race");
});

test("پرداخت هم‌زمان با تغییر فاکتور (ویرایش اقلام/بخشودگی/ابطال) → ناوردایی‌ها برقرار؛ پرداخت روی فاکتور باطل ثبت نمی‌شود", async () => {
  const { id } = await mkInvoice(10000);
  const pays = Array.from({ length: 20 }, (_, i) => O.call("POST", "/api/payments", { id: `ch${i}`, invoiceId: id, amount: 300, date: "2026-11-02" }));
  const edits = [4000, 8000, 6000, 9000].map((p, k) => O.call("PATCH", `/api/invoices/${id}`, { items: [{ description: "x", quantity: 1, unitPrice: p }], reason: `ویرایش ${k}` }));
  const res = await Promise.all([...pays, ...edits]);
  for (const r of res) assert.ok(r.status < 500, `5xx: ${JSON.stringify(r.json)}`);
  const i = await inv(id); const paid = await sumPays(id); overpaidOk.add(id);        // ویرایش به مبلغ کمتر پس از پرداخت‌ها ⇒ «پرداخت بیش از مبلغ» مشروع و گزارش‌شده
  assert.equal(Number(i.paid_amount), paid); assert.equal(Number(i.remaining_amount), Math.max(0, Number(i.total_amount) - paid - Number(i.waived_amount)));
  await assertHealthy("invoice edit race");
  // ابطال هم‌زمان با پرداخت
  const v = await mkInvoice(5000);
  const r2 = await Promise.all([O.call("POST", `/api/invoices/${v.id}/void`, { reason: "ابطال" }), ...Array.from({ length: 10 }, (_, k) => O.call("POST", "/api/payments", { id: `vp${v.id}${k}`, invoiceId: v.id, amount: 100, date: "2026-11-02" }))]);
  for (const r of r2) assert.ok(r.status < 500, JSON.stringify(r.json));
  const vi = await inv(v.id); assert.equal(vi.status, "void"); assert.equal(Number(vi.paid_amount), await sumPays(v.id));
  await assertHealthy("void race 2");
});

test("قطع در میانهٔ تراکنش: خطای دیتابیس پس از ثبت پرداخت → همه‌چیز Rollback (نه پرداخت، نه دفتر، نه فاکتور نیمه‌کاره)؛ تلاش مجدد پس از وصل شدن فقط یک بار ثبت می‌کند", async () => {
  const { id } = await mkInvoice(10000);
  await q(`CREATE OR REPLACE FUNCTION test_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.ref_id = 'boom1' THEN RAISE EXCEPTION 'simulated connection loss'; END IF; RETURN NEW; END $$`);
  await q("CREATE TRIGGER test_boom_trg BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION test_boom()");
  const before = { inv: await inv(id), pays: (await q("SELECT count(*)::int n FROM payments")).rows[0].n, led: (await q("SELECT count(*)::int n FROM ledger_entries")).rows[0].n };
  const bad = await O.call("POST", "/api/payments", { id: "boom1", invoiceId: id, amount: 1000, date: "2026-11-02" }, { "idempotency-key": "pay-boom1" });
  assert.equal(bad.status, 500);
  const after1 = { inv: await inv(id), pays: (await q("SELECT count(*)::int n FROM payments")).rows[0].n, led: (await q("SELECT count(*)::int n FROM ledger_entries")).rows[0].n };
  assert.deepEqual(after1.pays, before.pays); assert.deepEqual(after1.led, before.led); assert.equal(Number(after1.inv.paid_amount), Number(before.inv.paid_amount)); assert.equal(after1.inv.status, before.inv.status);
  assert.equal((await q("SELECT count(*)::int n FROM idempotency_keys WHERE key='pay-boom1'")).rows[0].n, 0, "کلید Idempotency برای عملیات ناموفق ثبت نمی‌شود");
  await q("DROP TRIGGER test_boom_trg ON ledger_entries");
  // «اینترنت وصل شد»: صف آفلاین همان درخواست را دوباره می‌فرستد (چندبار) → یک پرداخت
  const retry = await Promise.all(Array.from({ length: 5 }, () => O.call("POST", "/api/payments", { id: "boom1", invoiceId: id, amount: 1000, date: "2026-11-02" }, { "idempotency-key": "pay-boom1" })));
  assert.ok(retry.every((r) => r.status === 201 || r.status === 200)); assert.equal((await q("SELECT count(*)::int n FROM payments WHERE id='boom1'")).rows[0].n, 1);
  assert.equal(Number((await inv(id)).paid_amount), 1000);
  await assertHealthy("rollback");
});

test("قطع اتصال کلاینت وسط درخواست (abort روی سرور واقعی) و همگام‌سازی مجدد → بدون تکرار و بدون سند ناقص", async () => {
  const { id } = await mkInvoice(10000);
  await ctx.app.listen({ port: 0, host: "127.0.0.1" }); const base = `http://127.0.0.1:${ctx.app.server.address().port}`;
  const tok = (await client(ctx.app).post("/api/auth/login", { email: "k@cafe.test", password: PW })).data.accessToken;
  const send = (signal) => fetch(`${base}/api/payments`, { method: "POST", signal, headers: { "content-type": "application/json", authorization: `Bearer ${tok}`, "idempotency-key": "pay-abort" }, body: JSON.stringify({ id: "ab1", invoiceId: id, amount: 2500, date: "2026-11-02" }) });
  const ac = new AbortController(); const p = send(ac.signal).catch((e) => e.name); setTimeout(() => ac.abort(), 1); await p;   // اتصال وسط راه قطع می‌شود (سرور ممکن است کار را تمام کرده باشد یا نه)
  await new Promise((r) => setTimeout(r, 300));
  const again = await Promise.all([send(), send(), send()]); for (const r of again) assert.ok(r.status === 201 || r.status === 200, String(r.status));
  assert.equal((await q("SELECT count(*)::int n FROM payments WHERE id='ab1'")).rows[0].n, 1); assert.equal(Number((await inv(id)).paid_amount), 2500);
  assert.equal((await q("SELECT count(*)::int n FROM ledger_entries WHERE ref_id='ab1'")).rows[0].n, 1);
  await assertHealthy("abort");
});

test("همگام‌سازی مجدد پس از اتصال: بازپخش کل دستهٔ عملیات (با همان Idempotency-Key) وضعیت را تغییر نمی‌دهد", async () => {
  const cust = "rs-c"; await O.call("POST", "/api/customers", { id: cust, firstName: "ر" });
  const ops = [["POST", "/api/invoices", { id: "rs-i", number: "RS", customerId: cust, date: "2026-11-04", items: [{ description: "x", quantity: 2, unitPrice: 5000 }] }, "rs1"], ["POST", "/api/payments", { id: "rs-p", invoiceId: "rs-i", amount: 4000, date: "2026-11-04" }, "rs2"], ["POST", "/api/payments/rs-p/void", { id: "rs-v", reason: "اشتباه" }, "rs3"], ["POST", "/api/payments", { id: "rs-p2", invoiceId: "rs-i", amount: 10000, date: "2026-11-04" }, "rs4"]];
  const snap = async () => JSON.stringify([(await q("SELECT id,amount,kind,invoice_id FROM payments WHERE id LIKE 'rs-%' OR reversal_of LIKE 'rs-%' ORDER BY id")).rows, (await q("SELECT id,amount,kind FROM ledger_entries WHERE ref_id LIKE 'rs-%' OR ref_id LIKE 'rs-p%' ORDER BY id")).rows, (await q("SELECT paid_amount,status FROM invoices WHERE id='rs-i'")).rows, (await q("SELECT balance FROM accounts WHERE customer_id=$1", [cust])).rows]);
  for (const [m, u, b, k] of ops) assert.ok([200, 201].includes((await O.call(m, u, b, { "idempotency-key": k })).status));
  const s1 = await snap();
  for (let round = 0; round < 3; round++) for (const [m, u, b, k] of ops) assert.ok([200, 201].includes((await O.call(m, u, b, { "idempotency-key": k })).status), `${u} replay`);
  assert.equal(await snap(), s1, "بازپخش نباید چیزی را عوض کند");
  await assertHealthy("replay");
});

test("سیاست reject و allow: reject پرداخت اضافه را رد می‌کند؛ allow رفتار قدیم (پرداخت‌شده > مبلغ)", async () => {
  for (const [policy, expect] of [["reject", 422], ["allow", 201]]) {
    const c2 = await makeApp(url, { env: { OVERPAYMENT_POLICY: policy } });
    try {
      const cl = client(c2.app); const r = await cl.post("/api/auth/register", { email: `op-${policy}@cafe.test`, password: PW, firstName: "م", lastName: "ر", phone: "09121234567", shopName: policy });
      const o = (m, u, b) => cl.call(m, u, { body: b, bearer: r.data.accessToken });
      await o("POST", "/api/customers", { id: "oc", firstName: "x" }); await o("POST", "/api/invoices", { id: "oi", number: "1", customerId: "oc", date: "2026-11-01", items: [{ description: "x", quantity: 1, unitPrice: 1000 }] });
      const p = await o("POST", "/api/payments", { id: "op1", invoiceId: "oi", amount: 1500, date: "2026-11-01" }); assert.equal(p.status, expect, JSON.stringify(p.json));
      if (policy === "reject") assert.equal(p.json.error.code, "overpayment");
      if (policy === "allow") assert.equal(Number((await o("GET", "/api/invoices/oi")).data.paidAmount), 1500);
    } finally { await c2.app.close(); await c2.pool.end(); }
  }
  // مشتریِ بدون فاکتورِ مشتری‌دار: مازاد جای ثبت ندارد → رد
  const { id } = await mkInvoice(1000, { customer: false });
  const r = await O.call("POST", "/api/payments", { id: "nocust", invoiceId: id, amount: 1500, date: "2026-11-01" }); assert.equal(r.status, 422); assert.equal(r.json.error.code, "overpayment_no_customer");
  // برگشت پرداخت دارای مازاد، اعتبار را هم برمی‌گرداند
  const w = await mkInvoice(1000);
  assert.equal((await O.call("POST", "/api/payments", { id: "cv1", invoiceId: w.id, amount: 1800, date: "2026-11-01" })).status, 201);
  assert.equal((await O.call("POST", "/api/payments/cv1/void", { reason: "اشتباه" })).status, 201);
  assert.equal(Number((await q("SELECT balance FROM accounts WHERE customer_id=$1", [w.cust])).rows[0].balance), 1000, "فاکتور دوباره کامل بدهکار است و اعتبار هم برگشته"); assert.equal(Number((await inv(w.id)).paid_amount), 0);
  await assertHealthy("credit void");
});
