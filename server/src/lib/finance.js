// منطق مالیِ فقط‌سرور: مبلغ فاکتور از اقلام، «پرداخت‌شده» از مجموع پرداخت‌ها، مانده/وضعیت مشتق، دفتر کل حساب مشتری، موجودی انبار.
// هیچ‌کدام از این مقادیر را کلاینت نمی‌نویسد؛ هر مسیر نوشتن یکی از همین توابع را (داخل تراکنش) صدا می‌زند.
import crypto from "node:crypto";
import { HttpError, invalid, notFound } from "./errors.js";

const int = (v) => Math.trunc(Number(v) || 0);

// ── فاکتور: اقلام → جمع جزء → تخفیف → مبلغ نهایی ──────────────────────────────────────────────────────────────────────
export function normalizeItems(items) {
  if (!Array.isArray(items)) throw invalid("«items» باید آرایه باشد");
  if (items.length > 500) throw invalid("تعداد اقلام فاکتور بیش از حد است");
  return items.map((it, i) => {
    if (!it || typeof it !== "object" || Array.isArray(it)) throw invalid(`قلم ${i + 1} نامعتبر است`);
    const quantity = Number(it.quantity ?? it.qty ?? 0), unitPrice = Number(it.unitPrice ?? it.price ?? 0);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1e9) throw invalid(`تعداد قلم ${i + 1} نامعتبر است`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1e13) throw invalid(`قیمت واحد قلم ${i + 1} نامعتبر است`);
    const total = Math.round(quantity * unitPrice);
    if (!Number.isSafeInteger(total)) throw invalid(`مبلغ قلم ${i + 1} بیش از حد بزرگ است`);
    return { ...it, quantity, unitPrice, total };          // total قلم همیشه حاصل‌ضرب سرور است، نه مقدار کلاینت
  });
}

// manualTotal فقط برای فاکتور بدون قلم (بازمانده/دستی) و فقط وقتی نقش مدیر باشد؛ بقیه‌جا مبلغ از اقلام می‌آید
export function computeTotals({ items, discount, manualTotal = null }) {
  const lines = normalizeItems(items);
  let subtotal = lines.reduce((s, l) => s + l.total, 0);
  if (!lines.length && manualTotal != null) subtotal = int(manualTotal);
  if (!Number.isSafeInteger(subtotal)) throw invalid("جمع فاکتور بیش از حد بزرگ است");
  const disc = Math.min(Math.max(0, int(discount)), subtotal);
  return { items: lines, subtotal, discount: disc, total: subtotal - disc };
}

// مانده و وضعیت فقط از اینجا می‌آیند: مانده = max(0, مبلغ − پرداخت‌شده − بخشودگی)
export function statusOf({ total, paid, waived, voided }) {
  if (voided) return { remaining: 0, status: "void" };
  const remaining = Math.max(0, total - paid - waived);
  return { remaining, status: remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid" };
}
export const deriveStatus = statusOf;

// پرداخت‌شده = مجموع پرداخت‌ها − برگشت‌ها؛ زیر قفل ردیف فاکتور تا پرداخت‌های هم‌زمان نتیجهٔ درست بدهند
export async function recomputeInvoice(c, cafeId, invoiceId) {
  const inv = await c.query("SELECT * FROM invoices WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [cafeId, invoiceId]);
  const row = inv.rows[0];
  if (!row) return null;
  const sum = await c.query("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE cafe_id=$1 AND invoice_id=$2 AND deleted_at IS NULL", [cafeId, invoiceId]);
  const paid = Number(sum.rows[0].s);
  const waived = Math.min(Math.max(0, Number(row.waived_amount)), Math.max(0, Number(row.total_amount)));
  const d = statusOf({ total: Number(row.total_amount), paid, waived, voided: row.status === "void" });
  const upd = await c.query("UPDATE invoices SET paid_amount=$3, waived_amount=$4, remaining_amount=$5, status=$6, updated_at=now() WHERE cafe_id=$1 AND id=$2 RETURNING *", [cafeId, invoiceId, paid, waived, d.remaining, d.status]);
  return upd.rows[0];
}

// ── ارجاع‌ها: به‌جای کلید خارجی ساده (که صف آفلاین را می‌شکند) در لحظهٔ نوشتن بررسی می‌شوند ────────────────────────────────────────
export async function assertExists(c, cfg, cafeId, table, id, label) {
  if (!id || cfg?.referenceChecks === "off") return null;
  const r = await c.query(`SELECT * FROM ${table} WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL`, [cafeId, id]);
  if (!r.rows[0]) throw new HttpError(422, "unknown_reference", `${label} «${id}» در این کافی‌نت وجود ندارد`);
  return r.rows[0];
}

// ── دفتر کل ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function ensureAccount(c, cafeId, customerId) {
  const f = await c.query("SELECT id FROM accounts WHERE cafe_id=$1 AND customer_id=$2 AND deleted_at IS NULL ORDER BY created_at, id LIMIT 1", [cafeId, customerId]);
  if (f.rows[0]) return f.rows[0].id;
  const cu = await c.query("SELECT first_name, last_name FROM customers WHERE cafe_id=$1 AND id=$2", [cafeId, customerId]);
  const name = [cu.rows[0]?.first_name, cu.rows[0]?.last_name].filter(Boolean).join(" ") || `مشتری ${customerId}`;
  const id = `acc_${customerId}`.slice(0, 128);
  await c.query("INSERT INTO accounts (cafe_id,id,customer_id,name) VALUES ($1,$2,$3,$4) ON CONFLICT (cafe_id,id) DO NOTHING", [cafeId, id, customerId, name]);
  return id;
}

// ثبت یک ردیف دفتر کل و به‌روزکردن مانده در همان تراکنش؛ ردیف با همان شناسه دوباره ثبت نمی‌شود (ایمن در برابر تکرار)
export async function postEntry(c, { cafeId, accountId, kind, amount, refType = "", refId = "", entryId, date = null, note = "", userId = null }) {
  amount = int(amount);
  if (!amount) return null;
  const id = entryId || `le_${crypto.randomUUID()}`;
  const ins = await c.query(
    "INSERT INTO ledger_entries (cafe_id,id,account_id,kind,amount,ref_type,ref_id,date,note,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (cafe_id,id) DO NOTHING RETURNING *",
    [cafeId, id, accountId, kind, amount, refType, String(refId), date, String(note).slice(0, 300), userId]);
  if (!ins.rows[0]) return null;
  await c.query("UPDATE accounts SET balance = balance + $3, updated_at = now() WHERE cafe_id=$1 AND id=$2", [cafeId, accountId, amount]);
  return ins.rows[0];
}

// مقدار مطلوب برای یک ارجاع (مثلاً «فاکتور X» روی حساب مشتری) را با ردیف‌های اصلاحیِ تفاضلی برقرار می‌کند.
// اگر مشتری فاکتور عوض شود، حساب قبلی با ردیف برعکس صفر می‌شود.
export async function syncRef(c, { cafeId, kind, refType, refId, targetAccountId, desired, date, note, userId }) {
  const cur = await c.query("SELECT account_id, SUM(amount)::bigint AS s FROM ledger_entries WHERE cafe_id=$1 AND ref_type=$2 AND ref_id=$3 AND kind=$4 GROUP BY account_id", [cafeId, refType, String(refId), kind]);
  const have = new Map(cur.rows.map((r) => [r.account_id, Number(r.s)]));
  const accounts = new Set([...have.keys(), ...(targetAccountId ? [targetAccountId] : [])]);
  for (const acc of [...accounts].sort()) {                          // ترتیب ثابت قفل حساب‌ها = بدون بن‌بست
    const want = acc === targetAccountId ? desired : 0;
    const delta = want - (have.get(acc) || 0);
    if (delta) await postEntry(c, { cafeId, accountId: acc, kind, amount: delta, refType, refId, date, note, userId });
  }
}

export async function syncInvoiceLedger(c, cafeId, inv, userId = null) {
  const gone = inv.deleted_at || inv.status === "void";
  const account = inv.customer_id ? await ensureAccount(c, cafeId, inv.customer_id) : null;
  const note = `فاکتور ${inv.number || inv.id}`;
  await syncRef(c, { cafeId, kind: "invoice", refType: "invoice", refId: inv.id, targetAccountId: account, desired: gone ? 0 : Number(inv.total_amount), date: inv.date, note, userId });
  await syncRef(c, { cafeId, kind: "adjustment", refType: "waiver", refId: inv.id, targetAccountId: account, desired: gone ? 0 : -Number(inv.waived_amount), date: inv.date, note: `بخشودگی ${note}`, userId });
}

// پرداخت/برگشت روی حساب مشتریِ فاکتور؛ شناسهٔ ردیف از شناسهٔ پرداخت ساخته می‌شود (تکرار = بی‌اثر)
export async function postPaymentEntry(c, cafeId, pay, userId = null) {
  const customerId = pay.customer_id;
  if (!customerId) return;
  const accountId = await ensureAccount(c, cafeId, customerId);
  const isRev = pay.kind === "reversal";
  await postEntry(c, { cafeId, accountId, kind: isRev ? "reversal" : "payment", amount: Number(pay.amount) * -1, refType: "payment", refId: pay.id, entryId: `${isRev ? "rev" : "pay"}-${pay.id}`, date: pay.date, note: isRev ? `برگشت پرداخت ${pay.reversal_of}` : `پرداخت فاکتور ${pay.invoice_id || ""}`, userId });
}

export const ledgerSum = async (c, cafeId, accountId) => Number((await c.query("SELECT COALESCE(SUM(amount),0) AS s FROM ledger_entries WHERE cafe_id=$1 AND account_id=$2", [cafeId, accountId])).rows[0].s);

// ── انبار ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function rebuildInventory(c, cafeId, { itemId = null, dryRun = false } = {}) {
  const rows = (await c.query(
    `SELECT i.id, i.name, i.qty::float8 AS stored, i.opening_qty::float8 AS opening,
            COALESCE((SELECT SUM(m.qty_delta) FROM inventory_movements m WHERE m.cafe_id=i.cafe_id AND m.item_id=i.id AND m.deleted_at IS NULL),0)::float8 AS moves
       FROM inventory i WHERE i.cafe_id=$1 AND i.deleted_at IS NULL ${itemId ? "AND i.id=$2" : ""} ORDER BY i.id FOR UPDATE OF i`, itemId ? [cafeId, itemId] : [cafeId])).rows;
  const diffs = [];
  for (const r of rows) {
    const computed = Math.round((r.opening + r.moves) * 1000) / 1000;
    if (Math.abs(computed - r.stored) > 0.0005) {
      diffs.push({ id: r.id, name: r.name, stored: r.stored, computed });
      if (!dryRun) await c.query("UPDATE inventory SET qty=$3, updated_at=now() WHERE cafe_id=$1 AND id=$2", [cafeId, r.id, computed]);
    }
  }
  return { checked: rows.length, fixed: dryRun ? 0 : diffs.length, drift: diffs };
}

export async function rebuildAccounts(c, cafeId, { dryRun = false } = {}) {
  const rows = (await c.query(
    `SELECT a.id, a.balance, COALESCE((SELECT SUM(e.amount) FROM ledger_entries e WHERE e.cafe_id=a.cafe_id AND e.account_id=a.id),0)::bigint AS s
       FROM accounts a WHERE a.cafe_id=$1 AND a.deleted_at IS NULL ORDER BY a.id FOR UPDATE OF a`, [cafeId])).rows;
  const diffs = [];
  for (const r of rows) if (Number(r.balance) !== Number(r.s)) {
    diffs.push({ id: r.id, stored: Number(r.balance), computed: Number(r.s) });
    if (!dryRun) await c.query("UPDATE accounts SET balance=$3, updated_at=now() WHERE cafe_id=$1 AND id=$2", [cafeId, r.id, Number(r.s)]);
  }
  return { checked: rows.length, fixed: dryRun ? 0 : diffs.length, drift: diffs };
}

// فاکتورها: پرداخت‌شده/مانده/وضعیت و مبلغ از اقلام را از نو می‌سازد، سپس دفتر کل را با فاکتورها و پرداخت‌ها هم‌تراز می‌کند
export async function rebuildInvoices(c, cafeId, { dryRun = false, userId = null } = {}) {
  const invs = (await c.query("SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL ORDER BY id", [cafeId])).rows;
  const diffs = [];
  for (const inv of invs) {
    const sums = (await c.query("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE cafe_id=$1 AND invoice_id=$2 AND deleted_at IS NULL", [cafeId, inv.id])).rows[0].s;
    const items = Array.isArray(inv.items) ? inv.items : [];
    let total = Number(inv.total_amount), subtotal = Number(inv.subtotal);
    if (items.length) { const t = computeTotals({ items, discount: Number(inv.discount) }); subtotal = t.subtotal; total = t.total; }
    const waived = Math.min(Number(inv.waived_amount), total);
    const d = statusOf({ total, paid: Number(sums), waived, voided: inv.status === "void" });
    if (Number(inv.paid_amount) !== Number(sums) || Number(inv.total_amount) !== total || Number(inv.subtotal) !== subtotal || Number(inv.remaining_amount) !== d.remaining || inv.status !== d.status) {
      diffs.push({ id: inv.id, stored: { total: Number(inv.total_amount), paid: Number(inv.paid_amount), status: inv.status }, computed: { total, paid: Number(sums), status: d.status } });
      if (!dryRun) await c.query("UPDATE invoices SET subtotal=$3,total_amount=$4,paid_amount=$5,waived_amount=$6,remaining_amount=$7,status=$8,updated_at=now() WHERE cafe_id=$1 AND id=$2", [cafeId, inv.id, subtotal, total, Number(sums), waived, d.remaining, d.status]);
    }
  }
  let ledgerPosted = 0;
  if (!dryRun) {
    for (const inv of (await c.query("SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL ORDER BY id", [cafeId])).rows) { const b = (await c.query("SELECT count(*)::int n FROM ledger_entries WHERE cafe_id=$1 AND ref_id=$2 AND ref_type IN ('invoice','waiver')", [cafeId, inv.id])).rows[0].n; await syncInvoiceLedger(c, cafeId, inv, userId); const a = (await c.query("SELECT count(*)::int n FROM ledger_entries WHERE cafe_id=$1 AND ref_id=$2 AND ref_type IN ('invoice','waiver')", [cafeId, inv.id])).rows[0].n; ledgerPosted += a - b; }
    for (const p of (await c.query("SELECT * FROM payments WHERE cafe_id=$1 AND deleted_at IS NULL ORDER BY created_at, id", [cafeId])).rows) {
      const before = (await c.query("SELECT 1 FROM ledger_entries WHERE cafe_id=$1 AND ref_type='payment' AND ref_id=$2", [cafeId, p.id])).rowCount;
      if (!before) { await postPaymentEntry(c, cafeId, p, userId); ledgerPosted++; }
    }
  }
  return { checked: invs.length, fixed: dryRun ? 0 : diffs.length, drift: diffs, ledgerPosted };
}

export { notFound };
