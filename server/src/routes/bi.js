// هوش کسب‌وکار (فقط‌خواندنی، از داده‌های واقعی همین کافی‌نت): روند ماهانه، رشد، مشتریان غیرفعال، برترین مشتریان و پیش‌بینی ساده.
// «هزینه» = هزینه‌های ثبت‌شده (جدول هزینه‌ها + تراکنش‌های نوع هزینه)، «سود» = فروش − هزینه‌های ثبت‌شده. بهای تمام‌شدهٔ کالا (COGS) لحاظ نمی‌شود چون حرکت انبار فروش را با ارزش ثبت نمی‌کند.
import { toDate } from "../lib/validate.js";
import { invalid } from "../lib/errors.js";

/** پیش‌بینی خطی (کمترین مربعات) برای ماه‌های بعد. با کمتر از minPoints نقطه «پیش‌بینی نمی‌دهد» (به‌جای حدس‌زدن). */
export function linearForecast(values, horizon = 3, { minPoints = 4 } = {}) {
  const n = values.length;
  if (n < minPoints) return { available: false, reason: `برای پیش‌بینی دست‌کم ${minPoints} ماه کامل داده لازم است (موجود: ${n})` };
  const xs = values.map((_, i) => i), mx = xs.reduce((a, b) => a + b, 0) / n, my = values.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), sxy = xs.reduce((a, x, i) => a + (x - mx) * (values[i] - my), 0);
  const slope = sxx ? sxy / sxx : 0, intercept = my - slope * mx;
  const fit = xs.map((x) => intercept + slope * x), sst = values.reduce((a, v) => a + (v - my) ** 2, 0), sse = values.reduce((a, v, i) => a + (v - fit[i]) ** 2, 0);
  const r2 = sst ? 1 - sse / sst : 1, se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  const predictions = Array.from({ length: horizon }, (_, k) => { const x = n + k, v = Math.max(0, intercept + slope * x), band = 1.96 * se * Math.sqrt(1 + 1 / n + (x - mx) ** 2 / (sxx || 1)); return { step: k + 1, value: Math.round(v), low: Math.max(0, Math.round(v - band)), high: Math.round(v + band) }; });
  return { available: true, method: "linear-least-squares", points: n, slopePerMonth: Math.round(slope), r2: Math.round(r2 * 1000) / 1000, predictions, caveat: "برآورد آماری ساده از روند گذشته؛ فصل‌گرایی، تعطیلات و تغییر قیمت را در نظر نمی‌گیرد. بازهٔ پایین/بالا ≈ ۹۵٪ (تقریبی)" };
}

const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const addMonths = (d, k) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));

export function registerBi(app) {
  const { pool } = app;
  app.get("/api/bi/overview", { preHandler: [app.requirePerm("report.bi")] }, async (req) => {
    const cafeId = req.user.cafeId, months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 3), 36), inactiveDays = Math.min(Math.max(parseInt(req.query.inactiveDays, 10) || 60, 7), 730);
    if (req.query.asOf !== undefined && !toDate(req.query.asOf, { key: "asOf" })) throw invalid("asOf نامعتبر");
    const asOf = toDate(req.query.asOf, { key: "asOf" }) || new Date().toISOString().slice(0, 10);
    const cur = new Date(`${asOf}T00:00:00Z`), start = addMonths(cur, -(months - 1)), end = addMonths(cur, 1);
    const [rev, pay, exp, trx, newc] = await Promise.all([
      pool.query("SELECT to_char(date,'YYYY-MM') AS m, COALESCE(SUM(total_amount),0)::bigint AS s, COUNT(*)::int AS n FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND date >= $2 AND date < $3 GROUP BY 1", [cafeId, start, end]),
      pool.query("SELECT to_char(date,'YYYY-MM') AS m, COALESCE(SUM(amount),0)::bigint AS s FROM payments WHERE cafe_id=$1 AND deleted_at IS NULL AND date >= $2 AND date < $3 GROUP BY 1", [cafeId, start, end]),
      pool.query("SELECT to_char(date,'YYYY-MM') AS m, COALESCE(SUM(amount),0)::bigint AS s FROM expenses WHERE cafe_id=$1 AND deleted_at IS NULL AND date >= $2 AND date < $3 GROUP BY 1", [cafeId, start, end]),
      pool.query("SELECT to_char(date,'YYYY-MM') AS m, COALESCE(SUM(amount),0)::bigint AS s FROM transactions WHERE cafe_id=$1 AND deleted_at IS NULL AND type='expense' AND date >= $2 AND date < $3 GROUP BY 1", [cafeId, start, end]),
      pool.query("SELECT to_char(created_at,'YYYY-MM') AS m, COUNT(*)::int AS n FROM customers WHERE cafe_id=$1 AND deleted_at IS NULL AND created_at >= $2 AND created_at < $3 GROUP BY 1", [cafeId, start, end]),
    ]);
    const map = (r, k = "s") => new Map(r.rows.map((x) => [x.m, Number(x[k])]));
    const R = map(rev), N = map(rev, "n"), P = map(pay), E = map(exp), T = map(trx), C = map(newc, "n");
    const series = Array.from({ length: months }, (_, i) => {
      const m = ym(addMonths(start, i)), revenue = R.get(m) || 0, expenses = (E.get(m) || 0) + (T.get(m) || 0), inv = N.get(m) || 0;
      return { month: m, revenue, invoices: inv, avgInvoice: inv ? Math.round(revenue / inv) : 0, collected: P.get(m) || 0, expenses, profit: revenue - expenses, newCustomers: C.get(m) || 0, partial: m === ym(cur) };
    });
    const complete = series.filter((s) => !s.partial), last = complete[complete.length - 1], prev = complete[complete.length - 2];
    const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
    const firstWithData = complete.findIndex((s) => s.revenue > 0);
    const history = firstWithData < 0 ? [] : complete.slice(firstWithData).map((s) => s.revenue);       // ماه‌های صفرِ قبل از شروع به کار حساب نمی‌شوند
    const [inactive, top] = await Promise.all([
      pool.query(`SELECT c.id, btrim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')) AS name, c.phone, x.last_date::text AS last_date, ($2::date - x.last_date)::int AS days_since, x.total::bigint AS total, x.n::int AS n
                    FROM customers c JOIN (SELECT customer_id, MAX(date) AS last_date, SUM(total_amount) AS total, COUNT(*) AS n FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND customer_id IS NOT NULL GROUP BY customer_id) x ON x.customer_id = c.id
                   WHERE c.cafe_id=$1 AND c.deleted_at IS NULL AND x.last_date < ($2::date - $3::int) ORDER BY x.total DESC LIMIT 50`, [cafeId, asOf, inactiveDays]),
      pool.query("SELECT customer_id AS id, MAX(customer_name) AS name, SUM(total_amount)::bigint AS total, COUNT(*)::int AS n FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND customer_id IS NOT NULL AND date >= ($2::date - 90) AND date <= $2 GROUP BY customer_id ORDER BY total DESC LIMIT 10", [cafeId, asOf]),
    ]);
    return { data: {
      asOf, months, definitions: { revenue: "جمع مبلغ فاکتورهای غیرباطل (بر پایهٔ تاریخ فاکتور)", expenses: "هزینه‌های ثبت‌شده (جدول هزینه‌ها + تراکنش‌های نوع هزینه)", profit: "فروش − هزینه‌های ثبت‌شده (بدون بهای تمام‌شدهٔ کالا)", months: "ماه میلادی (YYYY-MM)؛ ماه جاری ناقص است و در رشد/پیش‌بینی نمی‌آید" },
      series,
      growth: last && prev ? { month: last.month, revenuePct: pct(last.revenue, prev.revenue), profitPct: pct(last.profit, prev.profit), invoicesPct: pct(last.invoices, prev.invoices) } : null,
      inactiveCustomers: { days: inactiveDays, count: inactive.rowCount, items: inactive.rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, lastInvoiceDate: r.last_date, daysSince: r.days_since, totalSpent: Number(r.total), invoices: r.n })) },
      topCustomers90d: top.rows.map((r) => ({ id: r.id, name: r.name, total: Number(r.total), invoices: r.n })),
      forecast: { metric: "revenue", basis: "ماه‌های کامل از اولین ماه دارای فروش", ...linearForecast(history, 3) },
    } };
  });
}
