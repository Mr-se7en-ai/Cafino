// تطبیق مالی (Reconciliation): همهٔ ناوردایی‌های حسابداری را فقط‌خواندنی با مجموعه‌پرس‌وجوهای SQL می‌سنجد و «یافته» (finding) برمی‌گرداند.
//   Paid = Σ(پرداخت + برگشت)   ·   Remaining = max(0, Total − Paid − Waived)   ·   Balance = Σ دفتر   ·   موجودی = اولیه + Σ حرکت‌ها
// شدت: critical (ناسازگاری پول)، high (سند ناقص/یتیم)، medium (مشتق ناهماهنگ/هشدار مالی)، low (اطلاعاتی). ok = بدون یافتهٔ medium یا بالاتر.
import crypto from "node:crypto";
import { postEntry, rebuildAccounts, rebuildInventory, rebuildInvoices } from "./finance.js";

export const SEVERITIES = ["critical", "high", "medium", "low"];
// دفتر کل با ارجاع «نرمال»: ردیف‌های اصلاحی (ref_type=reconcile، ref_id="نوع:شناسه") به سند اصلی نسبت داده می‌شوند تا اصلاح، یافته را ببندد
const NL = `(SELECT cafe_id, id, account_id, kind, amount, CASE WHEN ref_type='reconcile' THEN split_part(ref_id,':',1) ELSE ref_type END AS ref_type, CASE WHEN ref_type='reconcile' THEN substr(ref_id, position(':' in ref_id)+1) ELSE ref_id END AS ref_id FROM ledger_entries)`;
const CAP = 100;   // سقف نمونه برای هر نوع یافته (شمارش کل جدا می‌آید)

export const CHECKS = [
  // ── پرداخت و برگشت ─────────────────────────────────────────────────────────────
  { code: "payment.orphan_invoice", sev: "high", entity: "payment", msg: "پرداخت به فاکتوری اشاره می‌کند که وجود ندارد",
    sql: `SELECT p.id, p.amount::bigint AS actual FROM payments p WHERE p.cafe_id=$1 AND p.deleted_at IS NULL AND p.invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.cafe_id=p.cafe_id AND i.id=p.invoice_id)` },
  { code: "payment.orphan_customer", sev: "high", entity: "payment", msg: "پرداخت به مشتری‌ای اشاره می‌کند که وجود ندارد",
    sql: `SELECT p.id FROM payments p WHERE p.cafe_id=$1 AND p.deleted_at IS NULL AND p.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers x WHERE x.cafe_id=p.cafe_id AND x.id=p.customer_id)` },
  { code: "payment.customer_mismatch", sev: "critical", entity: "payment", msg: "مشتریِ پرداخت با مشتریِ فاکتور یکی نیست",
    sql: `SELECT p.id FROM payments p JOIN invoices i ON i.cafe_id=p.cafe_id AND i.id=p.invoice_id WHERE p.cafe_id=$1 AND p.deleted_at IS NULL AND p.customer_id IS NOT NULL AND i.customer_id IS NOT NULL AND p.customer_id <> i.customer_id` },
  { code: "reversal.orphan", sev: "critical", entity: "payment", msg: "ردیف برگشت به پرداخت اصلی که وجود ندارد اشاره می‌کند",
    sql: `SELECT r.id FROM payments r WHERE r.cafe_id=$1 AND r.kind='reversal' AND NOT EXISTS (SELECT 1 FROM payments o WHERE o.cafe_id=r.cafe_id AND o.id=r.reversal_of AND o.kind='payment')` },
  { code: "reversal.amount_mismatch", sev: "critical", entity: "payment", msg: "مبلغ برگشت دقیقاً قرینهٔ پرداخت اصلی نیست",
    sql: `SELECT r.id, (-o.amount)::bigint AS expected, r.amount::bigint AS actual FROM payments r JOIN payments o ON o.cafe_id=r.cafe_id AND o.id=r.reversal_of WHERE r.cafe_id=$1 AND r.kind='reversal' AND r.amount <> -o.amount` },
  { code: "reversal.link_mismatch", sev: "high", entity: "payment", msg: "فاکتور/مشتری ردیف برگشت با پرداخت اصلی یکی نیست",
    sql: `SELECT r.id FROM payments r JOIN payments o ON o.cafe_id=r.cafe_id AND o.id=r.reversal_of WHERE r.cafe_id=$1 AND r.kind='reversal' AND (r.invoice_id IS DISTINCT FROM o.invoice_id OR r.customer_id IS DISTINCT FROM o.customer_id)` },
  { code: "payment.possible_duplicate", sev: "low", entity: "payment", msg: "پرداخت احتمالاً تکراری (همان فاکتور/مبلغ/روش/تاریخ، با فاصلهٔ کمتر از ۱۰ ثانیه)",
    sql: `SELECT b.id FROM payments a JOIN payments b ON b.cafe_id=a.cafe_id AND b.id > a.id AND b.invoice_id=a.invoice_id AND b.amount=a.amount AND b.method=a.method AND b.date=a.date AND b.kind='payment' AND abs(extract(epoch FROM b.created_at - a.created_at)) < 10 WHERE a.cafe_id=$1 AND a.kind='payment' AND a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.cafe_id=a.cafe_id AND r.reversal_of=b.id)` },
  // ── فاکتور ────────────────────────────────────────────────────────────────────
  { code: "invoice.orphan_customer", sev: "high", entity: "invoice", msg: "فاکتور به مشتری‌ای اشاره می‌کند که وجود ندارد",
    sql: `SELECT i.id FROM invoices i WHERE i.cafe_id=$1 AND i.deleted_at IS NULL AND i.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers x WHERE x.cafe_id=i.cafe_id AND x.id=i.customer_id)` },
  { code: "invoice.overpaid", sev: "medium", entity: "invoice", msg: "مجموع پرداخت‌ها از مبلغ فاکتور بیشتر است (مازاد باید اعتبار مشتریِ جدا باشد)",
    sql: `SELECT i.id, i.total_amount::bigint AS expected, i.paid_amount::bigint AS actual FROM invoices i WHERE i.cafe_id=$1 AND i.deleted_at IS NULL AND i.status <> 'void' AND i.paid_amount > i.total_amount` },
  { code: "invoice.duplicate_number", sev: "low", entity: "invoice", msg: "شمارهٔ فاکتور تکراری",
    sql: `SELECT i.id FROM invoices i WHERE i.cafe_id=$1 AND i.deleted_at IS NULL AND i.number <> '' AND EXISTS (SELECT 1 FROM invoices j WHERE j.cafe_id=i.cafe_id AND j.number=i.number AND j.id < i.id AND j.deleted_at IS NULL)` },
  { code: "order.orphan_invoice", sev: "medium", entity: "order", msg: "سفارش به فاکتوری اشاره می‌کند که وجود ندارد",
    sql: `SELECT o.id FROM orders o WHERE o.cafe_id=$1 AND o.deleted_at IS NULL AND o.invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.cafe_id=o.cafe_id AND i.id=o.invoice_id)` },
  { code: "order.orphan_customer", sev: "medium", entity: "order", msg: "سفارش به مشتری‌ای اشاره می‌کند که وجود ندارد",
    sql: `SELECT o.id FROM orders o WHERE o.cafe_id=$1 AND o.deleted_at IS NULL AND o.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers x WHERE x.cafe_id=o.cafe_id AND x.id=o.customer_id)` },
  // ── دفتر کل ────────────────────────────────────────────────────────────────────
  { code: "ledger.payment_missing", sev: "high", entity: "payment", msg: "پرداخت (دارای مشتری) ردیف دفتر کل ندارد",
    sql: `SELECT p.id, (-p.amount)::bigint AS expected, 0::bigint AS actual FROM payments p WHERE p.cafe_id=$1 AND p.deleted_at IS NULL AND p.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${NL} e WHERE e.cafe_id=p.cafe_id AND e.ref_type='payment' AND e.ref_id=p.id)` },
  { code: "ledger.payment_amount_mismatch", sev: "critical", entity: "payment", msg: "مبلغ دفتر کلِ پرداخت با خود پرداخت نمی‌خواند",
    sql: `SELECT p.id, (-p.amount)::bigint AS expected, e.s::bigint AS actual FROM payments p JOIN (SELECT cafe_id, ref_id, SUM(amount) s FROM ${NL} n WHERE cafe_id=$1 AND ref_type='payment' GROUP BY cafe_id, ref_id) e ON e.cafe_id=p.cafe_id AND e.ref_id=p.id WHERE p.cafe_id=$1 AND p.deleted_at IS NULL AND e.s <> -p.amount` },
  { code: "ledger.payment_duplicate", sev: "critical", entity: "payment", msg: "پرداخت بیش از یک ردیف دفتر کل دارد (ثبت تکراری)",
    sql: `SELECT e.ref_id AS id, count(*)::bigint AS actual FROM ledger_entries e WHERE e.cafe_id=$1 AND e.ref_type='payment' AND e.kind IN ('payment','reversal') GROUP BY e.ref_id HAVING count(*) > 1` },
  { code: "ledger.invoice_diff", sev: "critical", entity: "invoice", msg: "جمع دفتر کلِ فاکتور با مبلغ فاکتور نمی‌خواند",
    sql: `SELECT i.id, (CASE WHEN i.status='void' THEN 0 ELSE i.total_amount END)::bigint AS expected, COALESCE(e.s,0)::bigint AS actual FROM invoices i LEFT JOIN (SELECT ref_id, SUM(amount) s FROM ${NL} n WHERE cafe_id=$1 AND ref_type='invoice' GROUP BY ref_id) e ON e.ref_id=i.id WHERE i.cafe_id=$1 AND i.deleted_at IS NULL AND i.customer_id IS NOT NULL AND COALESCE(e.s,0) <> (CASE WHEN i.status='void' THEN 0 ELSE i.total_amount END)` },
  { code: "ledger.waiver_diff", sev: "high", entity: "invoice", msg: "جمع دفتر کلِ بخشودگی با بخشودگی فاکتور نمی‌خواند",
    sql: `SELECT i.id, (CASE WHEN i.status='void' THEN 0 ELSE -i.waived_amount END)::bigint AS expected, COALESCE(e.s,0)::bigint AS actual FROM invoices i LEFT JOIN (SELECT ref_id, SUM(amount) s FROM ${NL} n WHERE cafe_id=$1 AND ref_type='waiver' GROUP BY ref_id) e ON e.ref_id=i.id WHERE i.cafe_id=$1 AND i.deleted_at IS NULL AND i.customer_id IS NOT NULL AND COALESCE(e.s,0) <> (CASE WHEN i.status='void' THEN 0 ELSE -i.waived_amount END)` },
  { code: "ledger.orphan_ref", sev: "high", entity: "ledger", msg: "ردیف‌های دفتر کل به سندی اشاره می‌کنند که وجود ندارد (جمع خالص ناصفر)",
    sql: `SELECT e.ref_type || ':' || e.ref_id AS id, SUM(e.amount)::bigint AS actual FROM ${NL} e WHERE e.cafe_id=$1 AND ((e.ref_type='payment' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.cafe_id=e.cafe_id AND p.id=e.ref_id)) OR (e.ref_type IN ('invoice','waiver') AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.cafe_id=e.cafe_id AND i.id=e.ref_id))) GROUP BY e.ref_type, e.ref_id HAVING SUM(e.amount) <> 0` },
  // ── حساب مشتری ────────────────────────────────────────────────────────────────
  { code: "account.balance_mismatch", sev: "critical", entity: "account", msg: "مانده حساب با مجموع دفتر کل نمی‌خواند",
    sql: `SELECT a.id, COALESCE(e.s,0)::bigint AS expected, a.balance::bigint AS actual FROM accounts a LEFT JOIN (SELECT account_id, SUM(amount) s FROM ledger_entries WHERE cafe_id=$1 GROUP BY account_id) e ON e.account_id=a.id WHERE a.cafe_id=$1 AND a.deleted_at IS NULL AND a.balance <> COALESCE(e.s,0)` },
  { code: "account.customer_mismatch", sev: "critical", entity: "account", msg: "ردیف دفتر کل پرداخت روی حسابِ مشتریِ دیگری نشسته است",
    sql: `SELECT e.id FROM ledger_entries e JOIN payments p ON p.cafe_id=e.cafe_id AND p.id=e.ref_id JOIN accounts a ON a.cafe_id=e.cafe_id AND a.id=e.account_id WHERE e.cafe_id=$1 AND e.ref_type='payment' AND p.customer_id IS NOT NULL AND a.customer_id IS NOT NULL AND a.customer_id <> p.customer_id` },
  { code: "account.multiple_per_customer", sev: "medium", entity: "customer", msg: "مشتری بیش از یک حساب فعال دارد",
    sql: `SELECT customer_id AS id, count(*)::bigint AS actual FROM accounts WHERE cafe_id=$1 AND deleted_at IS NULL AND customer_id IS NOT NULL GROUP BY customer_id HAVING count(*) > 1` },
  { code: "account.credit", sev: "low", entity: "account", msg: "اعتبار مشتری (مانده منفی = بستانکار)",
    sql: `SELECT id, balance::bigint AS actual FROM accounts WHERE cafe_id=$1 AND deleted_at IS NULL AND balance < 0` },
  // ── انبار و تراکنش‌ها ───────────────────────────────────────────────────────────
  { code: "inventory.negative", sev: "low", entity: "inventory", msg: "موجودی منفی",
    sql: `SELECT id FROM inventory WHERE cafe_id=$1 AND deleted_at IS NULL AND qty < 0` },
  { code: "inventory.movement_orphan", sev: "medium", entity: "inventory", msg: "حرکت انبار برای کالای حذف‌شده/ناموجود",
    sql: `SELECT m.id FROM inventory_movements m WHERE m.cafe_id=$1 AND m.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.cafe_id=m.cafe_id AND i.id=m.item_id AND i.deleted_at IS NULL)` },
  { code: "transaction.invalid", sev: "medium", entity: "transaction", msg: "تراکنش با مبلغ غیرمثبت یا نوع نامعتبر",
    sql: `SELECT id, amount::bigint AS actual FROM transactions WHERE cafe_id=$1 AND deleted_at IS NULL AND (amount <= 0 OR type NOT IN ('income','expense'))` },
];

// فقط‌خواندنی. db می‌تواند pool یا کلاینت تراکنش باشد.
export async function reconcile(db, cafeId) {
  const findings = [], checks = [];
  for (const ck of CHECKS) {
    const rows = (await db.query(`${ck.sql} LIMIT ${CAP + 1}`, [cafeId])).rows;
    const n = rows.length > CAP ? (await db.query(`SELECT count(*)::int n FROM (${ck.sql}) q`, [cafeId])).rows[0].n : rows.length;
    checks.push({ code: ck.code, severity: ck.sev, count: n });
    for (const r of rows.slice(0, CAP)) findings.push({ code: ck.code, severity: ck.sev, entity: ck.entity, id: r.id, message: ck.msg, ...(r.expected !== undefined ? { expected: Number(r.expected) } : {}), ...(r.actual !== undefined ? { actual: Number(r.actual) } : {}) });
  }
  // مشتق‌های فاکتور/موجودی انبار از همان توابع بازسازی (حالت dry-run) تا تعریف «درست» یکی باشد
  const inv = await rebuildInvoices(db, cafeId, { dryRun: true }), inventory = await rebuildInventory(db, cafeId, { dryRun: true }), accounts = await rebuildAccounts(db, cafeId, { dryRun: true });
  for (const d of inv.drift) findings.push({ code: "invoice.derived_mismatch", severity: "medium", entity: "invoice", id: d.id, message: "مبلغ/پرداخت‌شده/مانده/وضعیت فاکتور با پرداخت‌ها و اقلام نمی‌خواند", expected: d.computed, actual: d.stored });
  for (const d of inventory.drift) findings.push({ code: "inventory.qty_mismatch", severity: "critical", entity: "inventory", id: d.id, message: "موجودی با «اولیه + مجموع حرکت‌ها» نمی‌خواند", expected: d.computed, actual: d.stored });
  checks.push({ code: "invoice.derived_mismatch", severity: "medium", count: inv.drift.length }, { code: "inventory.qty_mismatch", severity: "critical", count: inventory.drift.length });
  const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of checks) { summary[c.severity] += c.count; summary.total += c.count; }
  return { ok: summary.critical + summary.high + summary.medium === 0, generatedAt: new Date().toISOString(), summary, checks, findings, invoices: inv, accounts, inventory };
}

// سندهای اصلاحی برای ردیف‌های یتیم و ناهماهنگی مبلغ پرداخت↔دفتر: ردیف قدیمی هرگز ویرایش/حذف نمی‌شود؛ ردیف «تعدیل» جدید با ref=reconcile ثبت می‌شود.
export async function repairLedgerDocuments(c, cafeId, { dryRun = false, userId = null } = {}) {
  const plan = [];
  const orphans = (await c.query(`SELECT e.account_id, e.ref_type, e.ref_id, SUM(e.amount)::bigint s FROM ${NL} e WHERE e.cafe_id=$1 AND e.ref_type IN ('payment','invoice','waiver')
      AND ((e.ref_type='payment' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.cafe_id=e.cafe_id AND p.id=e.ref_id)) OR (e.ref_type IN ('invoice','waiver') AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.cafe_id=e.cafe_id AND i.id=e.ref_id)))
      GROUP BY e.account_id, e.ref_type, e.ref_id HAVING SUM(e.amount) <> 0`, [cafeId])).rows;
  for (const o of orphans) plan.push({ account: o.account_id, amount: -Number(o.s), note: `اصلاح: سند یتیم ${o.ref_type} ${o.ref_id}`, refId: `${o.ref_type}:${o.ref_id}`, why: "orphan" });
  const mism = (await c.query(`SELECT p.id, p.amount::bigint amt, e.account_id, e.s::bigint s FROM payments p JOIN (SELECT ref_id, account_id, SUM(amount) s FROM ${NL} n WHERE cafe_id=$1 AND ref_type='payment' GROUP BY ref_id, account_id) e ON e.ref_id=p.id WHERE p.cafe_id=$1 AND p.deleted_at IS NULL AND e.s <> -p.amount
      AND (SELECT count(*) FROM ledger_entries x WHERE x.cafe_id=p.cafe_id AND x.ref_type='payment' AND x.ref_id=p.id) = 1`, [cafeId])).rows;
  for (const m of mism) plan.push({ account: m.account_id, amount: -Number(m.amt) - Number(m.s), note: `اصلاح: مبلغ دفتر پرداخت ${m.id}`, refId: `payment:${m.id}`, why: "payment_amount" });
  if (!dryRun) for (const p of plan) await postEntry(c, { cafeId, accountId: p.account, kind: "adjustment", amount: p.amount, refType: "reconcile", refId: p.refId, entryId: `rc-${crypto.randomUUID()}`, note: p.note, userId });
  return { checked: plan.length, fixed: dryRun ? 0 : plan.length, plan: plan.slice(0, 100) };
}
