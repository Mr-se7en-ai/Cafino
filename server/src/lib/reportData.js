// محاسبهٔ گزارش تجمیعی یک بازه (در خود پایگاه‌داده). هم مسیر /api/reports/summary و هم ربات‌های گزارش (بله/تلگرام) از همین استفاده می‌کنند.
export async function summaryOf(pool, cafeId, from, to) {
  const one = async (sql, p = []) => (await pool.query(sql, [cafeId, from, to, ...p])).rows;
  const [inv] = await one("SELECT COALESCE(SUM(total_amount),0) AS revenue, COUNT(*)::int AS count, COALESCE(SUM(discount),0) AS discount FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND date BETWEEN $2 AND $3");
  const [pay] = await one("SELECT COALESCE(SUM(amount),0) AS collected FROM payments WHERE cafe_id=$1 AND deleted_at IS NULL AND method <> 'free' AND date BETWEEN $2 AND $3");
  const [tr] = await one("SELECT COALESCE(SUM(amount) FILTER (WHERE type='income'),0) AS income, COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) AS expense FROM transactions WHERE cafe_id=$1 AND deleted_at IS NULL AND date BETWEEN $2 AND $3");
  const [ex] = await one("SELECT COALESCE(SUM(amount),0) AS expense FROM expenses WHERE cafe_id=$1 AND deleted_at IS NULL AND date BETWEEN $2 AND $3");
  const [rec] = await pool.query("SELECT COALESCE(SUM(remaining_amount),0) AS receivable, COUNT(*)::int AS open FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status IN ('unpaid','partial')", [cafeId]).then((r) => r.rows);
  const top = await one("SELECT customer_id, MAX(customer_name) AS name, SUM(total_amount) AS total, COUNT(*)::int AS invoices FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND date BETWEEN $2 AND $3 AND customer_id IS NOT NULL GROUP BY customer_id ORDER BY total DESC LIMIT 10");
  const daily = await one("SELECT date::text AS date, SUM(total_amount) AS revenue, COUNT(*)::int AS invoices FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND date BETWEEN $2 AND $3 GROUP BY date ORDER BY date");
  const low = (await pool.query("SELECT id, name, qty, min_qty FROM inventory WHERE cafe_id=$1 AND deleted_at IS NULL AND qty <= min_qty ORDER BY qty LIMIT 50", [cafeId])).rows;
  const dupNumbers = (await pool.query("SELECT number, COUNT(*)::int AS n FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND number <> '' GROUP BY number HAVING COUNT(*) > 1 LIMIT 50", [cafeId])).rows;
  const n = (v) => Number(v);
  const expense = n(tr.expense) + n(ex.expense);
  return {
    period: { from, to },
    revenue: n(inv.revenue), invoiceCount: inv.count, discount: n(inv.discount), collected: n(pay.collected),
    income: n(tr.income), expense, netCash: n(pay.collected) + n(tr.income) - expense,
    receivable: n(rec.receivable), openInvoices: rec.open,
    topCustomers: top.map((x) => ({ customerId: x.customer_id, name: x.name, total: n(x.total), invoices: x.invoices })),
    daily: daily.map((x) => ({ date: x.date, revenue: n(x.revenue), invoices: x.invoices })),
    lowStock: low.map((x) => ({ id: x.id, name: x.name, qty: n(x.qty), minQty: n(x.min_qty) })),
    duplicateInvoiceNumbers: dupNumbers,
  };
}
