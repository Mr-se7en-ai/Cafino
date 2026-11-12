// اندازه‌گیری واقعی: EXPLAIN (ANALYZE, BUFFERS) برای پرس‌وجوهای پرتکرار/سنگین
// node bench/explain.mjs [--upto 004|005] [--scale 1] [--json out.json]
import fs from "node:fs";
import { startDb, stopDb } from "../test/helpers.js";
import { createPool, migrate } from "../src/db.js";
import { CHECKS } from "../src/lib/reconcile.js";
import { seed } from "./seed.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const upto = arg("upto", ""), scale = Number(arg("scale", "1")), jsonOut = arg("json", ""), reps = Number(arg("reps", "3"));

const url = await startDb();
const pool = createPool({ databaseUrl: url, dbPoolMax: 4 });
await migrate(pool, () => {}, { upTo: upto });
const t0 = Date.now(); const info = await seed(pool, { scale }); const seedMs = Date.now() - t0;
console.error(`seed ${seedMs}ms`, info.counts);
const cafe = info.main;

const cursorTs = (await pool.query("SELECT updated_at FROM invoices WHERE cafe_id=$1 AND id=$2", [cafe, "i50000"])).rows[0].updated_at;
const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
const Q = [
  ["list.customers (page1, count+rows)", [`SELECT count(*)::int FROM customers WHERE cafe_id=$1 AND deleted_at IS NULL`, `SELECT * FROM customers WHERE cafe_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT 100 OFFSET 0`], [cafe]],
  ["list.invoices (page1, count+rows)", [`SELECT count(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL`, `SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT 100 OFFSET 0`], [cafe]],
  ["list.invoices (offset 50000)", [`SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT 100 OFFSET 50000`], [cafe]],
  ["list.invoices filter customerId", [`SELECT count(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND "customer_id"::text = $2`, `SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND "customer_id"::text = $2 ORDER BY updated_at DESC, id LIMIT 100`], [cafe, "c777"]],
  ["list.invoices filter status=unpaid", [`SELECT count(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND "status"::text = $2`, `SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND "status"::text = $2 ORDER BY updated_at DESC, id LIMIT 100`], [cafe, "unpaid"]],
  ["list.invoices from/to (30d)", [`SELECT count(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND date >= $2 AND date <= $3`, `SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND date >= $2 AND date <= $3 ORDER BY updated_at DESC, id LIMIT 100`], [cafe, from, to]],
  ["list.customers search q=نام77", [`SELECT count(*)::int FROM customers WHERE cafe_id=$1 AND deleted_at IS NULL AND ("first_name" ILIKE $2 OR "last_name" ILIKE $2 OR "phone" ILIKE $2)`, `SELECT * FROM customers WHERE cafe_id=$1 AND deleted_at IS NULL AND ("first_name" ILIKE $2 OR "last_name" ILIKE $2 OR "phone" ILIKE $2) ORDER BY updated_at DESC, id LIMIT 100`], [cafe, "%نام77%"]],
  ["sync.invoices updatedSince=7d", [`SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND updated_at > now() - interval '7 days' ORDER BY updated_at DESC, id LIMIT 500`], [cafe]],
  ["sync.payments updatedSince=7d", [`SELECT * FROM payments WHERE cafe_id=$1 AND deleted_at IS NULL AND updated_at > now() - interval '7 days' ORDER BY updated_at DESC, id LIMIT 500`], [cafe]],
  ["sync.invoices updatedSince+includeDeleted", [`SELECT * FROM invoices WHERE cafe_id=$1 AND updated_at > now() - interval '7 days' ORDER BY updated_at DESC, id LIMIT 500`], [cafe]],
  ["list.invoices keyset (after 50000th)", [`SELECT * FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND updated_at <= $2 AND (updated_at < $2 OR id > $3) ORDER BY updated_at DESC, id LIMIT 100`], [cafe, cursorTs, "i50000"]],
  ["list.payments by invoice", [`SELECT * FROM payments WHERE cafe_id=$1 AND deleted_at IS NULL AND invoice_id=$2 ORDER BY updated_at DESC, id LIMIT 100`], [cafe, "i4242"]],
  ["ledger account page", [`SELECT id,kind,amount FROM ledger_entries WHERE cafe_id=$1 AND account_id=$2 ORDER BY created_at, id LIMIT 100 OFFSET 0`], [cafe, "a77"]],
  ["report.revenue 30d", [`SELECT COALESCE(SUM(total_amount),0), COUNT(*)::int, COALESCE(SUM(discount),0) FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND date BETWEEN $2 AND $3`], [cafe, from, to]],
  ["report.revenue 365d", [`SELECT COALESCE(SUM(total_amount),0), COUNT(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND date BETWEEN $2 AND $3`], [cafe, new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10), to]],
  ["report.collected 30d", [`SELECT COALESCE(SUM(amount),0) FROM payments WHERE cafe_id=$1 AND deleted_at IS NULL AND method <> 'free' AND date BETWEEN $2 AND $3`], [cafe, from, to]],
  ["report.transactions 30d", [`SELECT COALESCE(SUM(amount) FILTER (WHERE type='income'),0), COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) FROM transactions WHERE cafe_id=$1 AND deleted_at IS NULL AND date BETWEEN $2 AND $3`], [cafe, from, to]],
  ["report.expenses 30d", [`SELECT COALESCE(SUM(amount),0) FROM expenses WHERE cafe_id=$1 AND deleted_at IS NULL AND date BETWEEN $2 AND $3`], [cafe, from, to]],
  ["report.receivable (open)", [`SELECT COALESCE(SUM(remaining_amount),0), COUNT(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status IN ('unpaid','partial')`], [cafe]],
  ["report.topCustomers 30d", [`SELECT customer_id, MAX(customer_name), SUM(total_amount) t, COUNT(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND date BETWEEN $2 AND $3 AND customer_id IS NOT NULL GROUP BY customer_id ORDER BY t DESC LIMIT 10`], [cafe, from, to]],
  ["report.daily 30d", [`SELECT date::text, SUM(total_amount), COUNT(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND date BETWEEN $2 AND $3 GROUP BY date ORDER BY date`], [cafe, from, to]],
  ["report.lowStock", [`SELECT id,name,qty,min_qty FROM inventory WHERE cafe_id=$1 AND deleted_at IS NULL AND qty <= min_qty ORDER BY qty LIMIT 50`], [cafe]],
  ["report.dupInvoiceNumbers", [`SELECT number, COUNT(*)::int FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND number <> '' GROUP BY number HAVING COUNT(*) > 1 LIMIT 50`], [cafe]],
  ["inventory.movements per item", [`SELECT id, qty_delta FROM inventory_movements WHERE cafe_id=$1 AND item_id=$2 AND deleted_at IS NULL ORDER BY created_at, id`], [cafe, "s42"]],
  ["orders status=new", [`SELECT * FROM orders WHERE cafe_id=$1 AND deleted_at IS NULL AND status='new' ORDER BY updated_at DESC, id LIMIT 100`], [cafe]],
];
for (const c of CHECKS) Q.push([`reconcile.${c.code}`, [c.sql], [cafe]]);

const plan = async (sql, params) => {
  const r = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
  const p = r.rows[0]["QUERY PLAN"][0];
  const seq = []; const walk = (n) => { if (n["Node Type"] === "Seq Scan") seq.push(`${n["Relation Name"]}(${n["Actual Rows"]}r×${n["Actual Loops"]})`); (n.Plans || []).forEach(walk); }; walk(p.Plan);
  const sort = JSON.stringify(p.Plan).includes('"Sort Method":"external') ;
  return { ms: p["Execution Time"], seq, sort, hit: p.Plan["Shared Hit Blocks"], read: p.Plan["Shared Read Blocks"] };
};
const results = [];
for (const [name, sqls, params] of Q) {
  let best = null, seq = [], sortExt = false;
  for (let k = 0; k < reps; k++) {
    let tot = 0; seq = []; sortExt = false;
    for (const s of sqls) { const r = await plan(s, params.slice(0, (s.match(/\$\d+/g) || []).reduce((m, x) => Math.max(m, +x.slice(1)), 0))); tot += r.ms; seq.push(...r.seq); sortExt ||= r.sort; }
    if (best === null || tot < best) best = tot;
  }
  results.push({ name, ms: +best.toFixed(2), seqScans: [...new Set(seq)], externalSort: sortExt });
}
const sizes = (await pool.query(`SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) sz FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace AND relname IN ('customers','invoices','payments','ledger_entries','inventory_movements','transactions','orders') ORDER BY pg_total_relation_size(oid) DESC`)).rows;
const rep = { upto: upto || "all", scale, seedMs, counts: info.counts, tableSizes: sizes, results };
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rep, null, 1));
for (const r of results) console.log(String(r.ms).padStart(9), "ms ", r.name.padEnd(48), r.seqScans.length ? "SEQ: " + r.seqScans.join(",") : "", r.externalSort ? "[disk sort]" : "");
await pool.end(); await stopDb();
