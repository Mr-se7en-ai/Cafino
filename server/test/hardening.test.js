// سخت‌سازی مالی 003 روی PostgreSQL واقعی: ممنوعیت حذف فیزیکی، FK، تغییرناپذیری، نقش محدود API، حفظ داده هنگام مهاجرت.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { createPool, migrate } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let ctx, O, owner, url;
const PW = "رمز-خیلی-قوی-۱۲۳";
const mig = (n) => fs.readFileSync(fileURLToPath(new URL(`../migrations/${n}`, import.meta.url)), "utf8");
before(async () => {
  url = await startDb(); ctx = await makeApp(url);
  const c = client(ctx.app);
  const r = await c.post("/api/auth/register", { email: "h@cafe.test", password: PW, firstName: "م", lastName: "ر", phone: "09121234567", shopName: "سخت" });
  assert.equal(r.status, 201); O = { c, token: r.data.accessToken, cafeId: r.data.user.branchId };
  owner = (m, u, body, o = {}) => O.c.call(m, u, { body, bearer: O.token, ...o });
  await owner("POST", "/api/customers", { id: "hc1", firstName: "علی" });
  await owner("POST", "/api/accounts", { id: "hac1", customerId: "hc1", name: "علی", balance: 1000 });
  await owner("POST", "/api/invoices", { id: "hi1", number: "1", customerId: "hc1", date: "2026-11-01", items: [{ description: "x", quantity: 1, unitPrice: 50000 }] });
  assert.equal((await owner("POST", "/api/payments", { id: "hp1", invoiceId: "hi1", amount: 20000, date: "2026-11-01", method: "cash" })).status, 201);
  await owner("POST", "/api/expenses", { id: "he1", amount: 5000, date: "2026-11-01", category: "x" });
});
// نقش‌ها در سطح کل کلاستر هستند؛ نام یکتا برای هر اجرا تا روی PostgreSQL مشترک (TEST_DATABASE_URL) با باقیماندهٔ اجراهای قبلی/دیتابیس‌های دیگر برخورد نکند
const SFX = `${process.pid}_${Math.random().toString(36).slice(2, 7)}`, R_T1 = `cafino_t1_${SFX}`, R_RT = `cafino_rt_${SFX}`;
after(async () => {
  for (const r of [R_T1, R_RT]) { try { await ctx?.pool.query(`DROP OWNED BY ${r}`); await ctx?.pool.query(`DROP ROLE IF EXISTS ${r}`); } catch { /* نقش ساخته نشده بود */ } }
  await ctx?.app.close(); await ctx?.pool.end(); await stopDb();
});
const q = (sql, p = []) => ctx.pool.query(sql, p);
const rej = (p, re) => assert.rejects(p, (e) => { const ok = re.test(e.message) || re.test(String(e.code)); if (!ok) console.error("UNEXPECTED:", e.code, e.message); return ok; }, String(re));

test("003: DELETE و TRUNCATE روی همهٔ اسناد مالی ممنوع است (حتی برای مالک/ابرکاربر)", async () => {
  for (const t of ["payments", "ledger_entries", "invoices", "accounts", "expenses", "audit_log"]) {
    assert.ok((await q(`SELECT count(*)::int n FROM ${t}`)).rows[0].n > 0, `${t} باید ردیف داشته باشد`);
    await rej(q(`DELETE FROM ${t}`), /financial_no_delete/);
    await rej(q(`TRUNCATE ${t}`), /financial_no_delete|cannot truncate/);          // جدول‌های مرجع FK پیش از تریگر با خطای خود PostgreSQL رد می‌شوند
    await rej(q(`TRUNCATE ${t} CASCADE`), /financial_no_delete/);
  }
  for (const t of ["transactions", "obligations", "inventory_movements"]) { await rej(q(`TRUNCATE ${t}`), /financial_no_delete/); }
  // حذف کافی‌نت (که قبلاً زنجیره‌ای همه چیز را پاک می‌کرد) رد می‌شود
  await rej(q("DELETE FROM cafes WHERE id=$1", [O.cafeId]), /23001|23503|RESTRICT|foreign key/);
  assert.equal((await q("SELECT count(*)::int n FROM payments WHERE cafe_id=$1", [O.cafeId])).rows[0].n, 1);
});

test("003: هیچ ON DELETE CASCADE روی جدول‌های مالی/کسب‌وکار نمانده؛ تیکت‌ها/توکن‌ها همچنان cascade", async () => {
  const r = await q(`SELECT conrelid::regclass::text t, confdeltype d FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('customers','inventory','inventory_movements','orders','invoices','payments','accounts','transactions','expenses','obligations','ledger_entries')`);
  assert.ok(r.rows.length >= 11); for (const x of r.rows) assert.notEqual(x.d, "c", `${x.t} هنوز cascade دارد`);
  const led = await q(`SELECT confdeltype d FROM pg_constraint WHERE conrelid='ledger_entries'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE '%accounts%'`);
  assert.equal(led.rows[0].d, "r", "ledger → accounts باید RESTRICT باشد");
  const tm = await q(`SELECT confdeltype d FROM pg_constraint WHERE conrelid='ticket_messages'::regclass AND contype='f'`); assert.ok(tm.rows.some((x) => x.d === "c"));
  // همهٔ FKها اعتبارسنجی‌شده‌اند
  assert.equal((await q("SELECT count(*)::int n FROM pg_constraint WHERE contype='f' AND NOT convalidated")).rows[0].n, 0);
});

test("003: ردیف پرداخت ثبت‌شده تغییر نمی‌کند؛ فقط یادداشت (data)؛ PATCH مبلغ/فاکتور/حساب را نادیده می‌گیرد", async () => {
  for (const set of ["account_id='zzz'", "amount=amount+1", "invoice_id='x'", "customer_id='x'", "created_at=now()", "deleted_at=now()"])
    await rej(q(`UPDATE payments SET ${set} WHERE cafe_id=$1 AND id='hp1'`, [O.cafeId]), /payments_(immutable|no_delete)/);
  await q(`UPDATE payments SET data = data || '{"note":"ok"}'::jsonb, updated_at=now() WHERE cafe_id=$1 AND id='hp1'`, [O.cafeId]);
  const p = await owner("PATCH", "/api/payments/hp1", { accountId: "hac1", note: "یادداشت", reason: "اصلاح یادداشت" });
  assert.equal((await owner("PATCH", "/api/payments/hp1", { amount: 1, reason: "تلاش" })).status, 422);
  assert.equal(p.status, 200); assert.equal(p.data.amount, 20000); assert.equal(p.data.invoiceId, "hi1"); assert.equal(p.data.accountId, null); assert.equal(p.data.note, "یادداشت");
  const m = await owner("PATCH", "/api/payments/hp1", { method: "card", reason: "اصلاح روش" }); assert.equal(m.data.method, "card", "رفتار موجود: مدیر با دلیل روش را اصلاح می‌کند (حسابرسی می‌شود)");
});

test("003: دفتر کل و گزارش حسابرسی فقط افزودنی‌اند", async () => {
  await rej(q("UPDATE ledger_entries SET amount=1 WHERE cafe_id=$1", [O.cafeId]), /ledger_immutable/);
  await rej(q("UPDATE audit_log SET action='x' WHERE cafe_id=$1", [O.cafeId]), /audit_log_immutable/);
  await rej(q("DELETE FROM audit_log WHERE cafe_id=$1", [O.cafeId]), /financial_no_delete/);
});

test("003: اصلاح همچنان ممکن است — برگشت پرداخت، ابطال فاکتور و تعدیل حساب (سند اصلاحی) بدون هیچ حذف/ویرایشی", async () => {
  assert.equal((await owner("POST", "/api/payments/hp1/void", { reason: "اشتباه" })).status, 201);
  assert.equal((await owner("POST", "/api/accounts/hac1/adjust", { amount: -500, reason: "تعدیل" })).status, 201);
  assert.equal((await owner("POST", "/api/invoices/hi1/void", { reason: "ابطال" })).status, 200);
  const l = await owner("GET", "/api/accounts/hac1/ledger"); assert.equal(l.data.consistent, true);
  assert.equal((await owner("GET", "/api/integrity")).data.ok, true);
});

test("003: نقش محدود API — DELETE/TRUNCATE/UPDATE دفتر/DDL ممنوع، عملیات عادی مجاز (SET ROLE)", async () => {
  await q(`DROP ROLE IF EXISTS ${R_T1}`); await q(`CREATE ROLE ${R_T1} NOLOGIN`);
  await q(`SELECT cafino_apply_app_grants('${R_T1}')`);
  const c = await ctx.pool.connect();
  try {
    await c.query(`SET ROLE ${R_T1}`);
    await c.query("SELECT count(*) FROM payments");
    for (const sql of ["DELETE FROM payments", "DELETE FROM ledger_entries", "DELETE FROM invoices", "DELETE FROM accounts", "DELETE FROM audit_log", "TRUNCATE payments", "TRUNCATE tickets",
      "UPDATE ledger_entries SET note='x'", "UPDATE audit_log SET action='x'", "CREATE TABLE zz(a int)", "DROP TABLE payments", "ALTER TABLE payments DISABLE TRIGGER ALL", "INSERT INTO schema_migrations(name) VALUES ('zz')", "UPDATE schema_migrations SET name='z'"])
      await rej(c.query(sql).catch((e) => { if (!/permission denied|must be owner/.test(e.message)) e.message = `[${sql}] ${e.message}`; throw e; }), /permission denied|42501|must be owner/);
    await c.query("DELETE FROM idempotency_keys");                         // داده‌های موقت قابل‌حذف‌اند
    await c.query("UPDATE payments SET data = data WHERE false");
  } finally { await c.query("RESET ROLE").catch(() => {}); c.release(); }
  // تابع برای نقش ناموجود خطا می‌دهد و فقط مالک اجرا می‌کند
  await rej(q("SELECT cafino_apply_app_grants('no_such_role_x')"), /وجود ندارد/);
});

test("003: کل API زیر نقش محدود کار می‌کند (ثبت، فاکتور، پرداخت، برگشت، تعدیل، بازسازی، حسابرسی) و حذف فیزیکی ندارد", async () => {
  await q(`DROP ROLE IF EXISTS ${R_RT}`); await q(`CREATE ROLE ${R_RT} LOGIN PASSWORD 'rt-pass'`);
  await q(`SELECT cafino_apply_app_grants('${R_RT}')`);
  const u = new URL(url); u.username = R_RT; u.password = "rt-pass";
  const cfg = loadConfig({ DATABASE_URL: u.toString(), JWT_SECRET: "y".repeat(48), NODE_ENV: "test", ALLOW_REGISTRATION: "true", AUTH_RATE_LIMIT_MAX: "1000", RATE_LIMIT_MAX: "100000" });
  const pool = createPool(cfg); const app = await buildApp(cfg, { pool, logger: false }); await app.ready();
  try {
    const c = client(app); const r = await c.post("/api/auth/register", { email: "rt@cafe.test", password: PW, firstName: "م", lastName: "ر", phone: "09121234568", shopName: "نقش" }); assert.equal(r.status, 201);
    const o = (m, p, b) => c.call(m, p, { body: b, bearer: r.data.accessToken });
    await o("POST", "/api/customers", { id: "rc1", firstName: "ب" }); await o("POST", "/api/accounts", { id: "rac", customerId: "rc1", name: "ب", balance: 0 });
    assert.equal((await o("POST", "/api/invoices", { id: "ri1", number: "1", customerId: "rc1", date: "2026-11-02", items: [{ description: "x", quantity: 2, unitPrice: 10000 }] })).status, 201);
    assert.equal((await o("POST", "/api/payments", { id: "rp1", invoiceId: "ri1", amount: 5000, date: "2026-11-02" })).status, 201);
    assert.equal((await o("POST", "/api/payments/rp1/void", { reason: "دلیل" })).status, 201);
    assert.equal((await o("POST", "/api/accounts/rac/adjust", { amount: 100, reason: "دلیل" })).status, 201);
    assert.equal((await o("POST", "/api/inventory", { id: "rit", name: "چای", qty: 10 })).status, 201);
    assert.equal((await o("POST", "/api/inventory-movements", { id: "rm1", itemId: "rit", qtyDelta: -2, reason: "مصرف" })).status, 201);
    assert.equal((await o("DELETE", "/api/invoices/ri1")).status < 500, true);
    assert.equal((await o("POST", "/api/integrity/rebuild", { reason: "تست" })).status, 200);
    assert.equal((await o("GET", "/api/integrity")).data.ok, true);
    assert.equal((await o("GET", "/api/audit")).status < 500, true);
  } finally { await app.close(); await pool.end(); }
});

test("003: مهاجرت روی پایگاه‌دادهٔ موجود (001+002) هیچ دادهٔ مالی را کم/زیاد/عوض نمی‌کند و دوباره‌اجرایی نیست (idempotent)", async () => {
  const adm = new pg.Client({ connectionString: url }); adm.on("error", () => {}); await adm.connect();
  await adm.query("DROP DATABASE IF EXISTS cafino_mig"); await adm.query("CREATE DATABASE cafino_mig");
  const u = new URL(url); u.pathname = "/cafino_mig";
  const pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
  pool.on("error", () => {});   // DROP DATABASE … WITH (FORCE) در پایان اتصال‌های بیکار را می‌بندد؛ آن خطا نباید به uncaughtException تبدیل شود (ناپایداریِ تصادفیِ دیده‌شده)
  try {
    await pool.query(mig("001_init.sql")); await pool.query(mig("002_financial_integrity.sql"));
    await pool.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    await pool.query("INSERT INTO schema_migrations(name) VALUES ('001_init.sql'),('002_financial_integrity.sql')");
    const org = (await pool.query("INSERT INTO organizations(name) VALUES ('o') RETURNING id")).rows[0].id;
    const cafe = (await pool.query("INSERT INTO cafes(org_id,name) VALUES ($1,'c') RETURNING id", [org])).rows[0].id;
    await pool.query("INSERT INTO accounts(cafe_id,id,name,balance) VALUES ($1,'a1','x',700)", [cafe]);
    await pool.query("INSERT INTO invoices(cafe_id,id,total_amount,paid_amount,remaining_amount,status) VALUES ($1,'i1',1000,300,700,'partial')", [cafe]);
    await pool.query("INSERT INTO payments(cafe_id,id,invoice_id,amount,method,date,account_id) VALUES ($1,'p1','i1',300,'cash','2026-11-01','a1'),($1,'p2','i1',100,'card','2026-11-02','a1')", [cafe]);
    await pool.query("INSERT INTO payments(cafe_id,id,invoice_id,amount,kind,reversal_of) VALUES ($1,'p3','i1',-100,'reversal','p2')", [cafe]);
    await pool.query("INSERT INTO ledger_entries(cafe_id,id,account_id,kind,amount) VALUES ($1,'l1','a1','invoice',1000),($1,'l2','a1','payment',-300),($1,'l3','a1','payment',-100),($1,'l4','a1','reversal',100)", [cafe]);
    const snap = async () => JSON.stringify([
      (await pool.query("SELECT cafe_id,id,account_id,kind,amount,ref_type,ref_id,date,note FROM ledger_entries ORDER BY id")).rows,
      (await pool.query("SELECT cafe_id,id,invoice_id,customer_id,amount,method,date,account_id,kind,reversal_of,void_reason,created_at,updated_at,deleted_at,data FROM payments ORDER BY id")).rows,
      (await pool.query("SELECT cafe_id,id,total_amount,paid_amount,remaining_amount,status FROM invoices ORDER BY id")).rows,
      (await pool.query("SELECT cafe_id,id,balance FROM accounts ORDER BY id")).rows]);
    const before = await snap();
    assert.deepEqual(await migrate(pool), ["003_financial_hardening.sql", "004_permissions.sql", "005_performance_indexes.sql", "006_shifts_corrections.sql", "007_customer_uploads.sql", "008_upload_sessions.sql", "009_upload_shop_profile.sql", "010_report_bots.sql", "011_telegram_miniapp.sql", "012_miniapp_cafe_side.sql", "013_miniapp_cart_chat_pay.sql", "014_miniapp_cafe_bots.sql", "015_sms.sql"]);
    assert.equal(await snap(), before, "داده باید بایت‌به‌بایت یکسان بماند");
    assert.deepEqual(await migrate(pool), []);
    await rej(pool.query("DELETE FROM ledger_entries"), /financial_no_delete/);
    await rej(pool.query("DELETE FROM cafes"), /23001|23503|RESTRICT|foreign key/);
    // مهاجرت‌های قبلی تغییر نکرده‌اند (checksum ثابت برای ثبت در گزارش)
    assert.ok(mig("001_init.sql").length > 1000 && mig("002_financial_integrity.sql").length > 1000);
  } finally { await pool.end(); await adm.query("DROP DATABASE IF EXISTS cafino_mig WITH (FORCE)").catch(() => {}); await adm.end(); }
});

// مهاجرت‌های منتشرشده هرگز ویرایش نمی‌شوند (فقط مهاجرت جدید): هش SHA-256 قفل است. 001/002 با بستهٔ تحویل‌شدهٔ 1.74 بایت‌به‌بایت یکسان‌اند.
test("مهاجرت‌های منتشرشده (001–004) تغییر نکرده‌اند: هش SHA-256 قفل است", async () => {
  const crypto = await import("node:crypto");
  const PINNED = {
    "001_init.sql": "36ab4505a1a555ce35055d2cd80df5301aee049591daef3cdd63486357221302",
    "002_financial_integrity.sql": "df7999ea741e7e0694d746d0fdd904326552475f21bf5cceeef98762211db7b9",
    "003_financial_hardening.sql": "9b15dbe911591aeff896a8e87d6205f7997c83eadc77d238f355c9bdd16faf7f",
    "004_permissions.sql": "cfd49bd84bb909dd1186a5893bf2ab0422b4dc8d70be88ffa02972b30fee3a97"
  };
  for (const [f, hash] of Object.entries(PINNED)) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n")).digest("hex"), hash, `${f} ویرایش شده؛ به‌جای آن مهاجرت جدید بنویسید`);
});
