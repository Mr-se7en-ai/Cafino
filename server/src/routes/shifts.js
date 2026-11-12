// مدیریت شیفت صندوق: باز کردن (مسئول + موجودی آغازین)، گزارش زندهٔ شیفت، بستن با شمارش نقدی و اختلاف، گزارش عملکرد.
// ارقام از اسناد موجود محاسبه می‌شوند (پرداخت‌ها و هزینه‌ها بر پایهٔ زمان ثبت روی سرور)؛ هیچ سند مالی تغییر نمی‌کند.
//   مورد انتظار در صندوق = موجودی آغازین + دریافت‌های «نقدی» خالص (پرداخت − برگشت) − هزینه‌های «نقدی» (جدول هزینه‌ها + تراکنش‌های نوع هزینه)
//   محدودیت‌های شناخته‌شده (در پاسخ هم هست): ۱) رکورد آفلاینی که بعداً همگام شود به شیفتِ «زمان رسیدن به سرور» می‌رود؛ ۲) درآمد دستی ثبت‌شده فقط در تراکنش (بدون سند پرداخت) در نقدی حساب نمی‌شود.
import crypto from "node:crypto";
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { conflict, forbidden, invalid, notFound } from "../lib/errors.js";
import { toDate, toText } from "../lib/validate.js";

const BASIS = "expected = opening + net cash payments − cash expenses (expenses table + expense-type transactions), by server receipt time";
const money = (v, key) => { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw invalid(`«${key}» باید عدد صحیح غیرمنفی (ریال) باشد`); return v; };
const num = (x) => Number(x || 0);

export async function shiftTotals(c, cafeId, from, to) {
  // پشت‌سرهم (نه Promise.all): c ممکن است یک اتصال تراکنش باشد و pg اجرای هم‌زمان چند کوئری روی یک اتصال را منسوخ کرده است (pg@9 حذف می‌شود)
  const pay = await c.query("SELECT method, kind, COALESCE(SUM(amount),0)::bigint AS s, COUNT(*)::int AS n FROM payments WHERE cafe_id=$1 AND deleted_at IS NULL AND created_at >= $2 AND created_at < $3 GROUP BY method, kind", [cafeId, from, to]);
  const exp = await c.query("SELECT method, COALESCE(SUM(amount),0)::bigint AS s FROM expenses WHERE cafe_id=$1 AND deleted_at IS NULL AND created_at >= $2 AND created_at < $3 GROUP BY method", [cafeId, from, to]);
  const trx = await c.query("SELECT method, COALESCE(SUM(amount),0)::bigint AS s FROM transactions WHERE cafe_id=$1 AND deleted_at IS NULL AND type='expense' AND created_at >= $2 AND created_at < $3 GROUP BY method", [cafeId, from, to]);
  const inv = await c.query("SELECT COUNT(*)::int AS n, COALESCE(SUM(total_amount),0)::bigint AS s FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status <> 'void' AND created_at >= $2 AND created_at < $3", [cafeId, from, to]);
  const receipts = {}, refunds = {}, expenses = {};
  let paymentCount = 0, reversalCount = 0;
  for (const r of pay.rows) { if (r.kind === "payment") { receipts[r.method] = num(r.s); paymentCount += r.n; } else { refunds[r.method] = -num(r.s); reversalCount += r.n; } }   // مبلغ برگشت در جدول منفی است؛ اینجا مثبتِ «خروج» نشان داده می‌شود
  for (const r of [...exp.rows, ...trx.rows]) expenses[r.method] = (expenses[r.method] || 0) + num(r.s);
  const net = {}; for (const m of new Set([...Object.keys(receipts), ...Object.keys(refunds)])) net[m] = (receipts[m] || 0) - (refunds[m] || 0);
  return { receipts, refunds, net, expenses, paymentCount, reversalCount, invoices: { count: inv.rows[0].n, total: num(inv.rows[0].s) }, cashNet: (net.cash || 0), cashExpenses: expenses.cash || 0, basis: BASIS };
}
const expectedCash = (opening, t) => num(opening) + t.cashNet - t.cashExpenses;

const SEL = "SELECT s.*, (SELECT btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')) FROM users u WHERE u.id=s.opened_by) AS ob, (SELECT btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')) FROM users u WHERE u.id=s.closed_by) AS cb FROM cash_shifts s";
const pub = (s, live) => ({
  id: s.id, status: s.status, openedBy: s.opened_by, openedByName: s.ob || s.opened_by_name, openedAt: s.opened_at, openingCash: num(s.opening_cash),
  closedBy: s.closed_by, closedByName: s.cb || s.closed_by_name, closedAt: s.closed_at, expectedCash: s.expected_cash == null ? null : num(s.expected_cash),
  countedCash: s.counted_cash == null ? null : num(s.counted_cash), difference: s.difference == null ? null : num(s.difference), note: s.note, totals: s.totals, ...(live ? { live } : {}),
});

export function registerShifts(app) {
  const { pool } = app;
  const operate = { preHandler: [app.requirePerm("shift.operate", "shift.manage")] };
  const manage = { preHandler: [app.requirePerm("shift.manage")] };
  const userName = async (c, id) => { const u = (await c.query("SELECT btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')) AS n, email FROM users WHERE id=$1", [id])).rows[0]; return (u?.n || u?.email || "").slice(0, 120); };

  app.post("/api/shifts/open", operate, async (req, reply) => {
    const cafeId = req.user.cafeId, b = req.body || {};
    const opening = money(b.openingCash, "openingCash"), note = toText(b.note, { max: 300, key: "note" });
    const id = b.id ? String(b.id).slice(0, 100) : `sh_${crypto.randomUUID()}`;
    const row = await tx(pool, async (c) => {
      const open = (await c.query("SELECT id FROM cash_shifts WHERE cafe_id=$1 AND status='open'", [cafeId])).rows[0];
      if (open) throw conflict("یک شیفت باز وجود دارد؛ ابتدا آن را ببندید", "shift_already_open");
      const name = await userName(c, req.user.id);
      await c.query("INSERT INTO cash_shifts (cafe_id,id,opened_by,opened_by_name,opening_cash,note) VALUES ($1,$2,$3,$4,$5,$6)", [cafeId, id, req.user.id, name, opening, note]);
      await audit(c, { cafeId, userId: req.user.id, action: "shift.open", entity: "shift", entityId: id, details: { openingCash: opening }, ip: req.ip });
      return (await c.query(`${SEL} WHERE s.cafe_id=$1 AND s.id=$2`, [cafeId, id])).rows[0];
    }).catch((e) => { if (e.code === "23505" && /one_open/.test(e.constraint || "")) throw conflict("یک شیفت باز وجود دارد؛ ابتدا آن را ببندید", "shift_already_open"); throw e; });
    return reply.code(201).send({ data: pub(row) });
  });

  const withLive = async (c, cafeId, s) => {
    const to = s.closed_at || (await c.query("SELECT now() AS n")).rows[0].n;
    const t = await shiftTotals(c, cafeId, s.opened_at, to), exp = expectedCash(s.opening_cash, t);
    return { ...t, expectedCash: exp, ...(s.status === "closed" ? { driftSinceClose: exp - num(s.expected_cash) } : {}) };     // driftSinceClose ≠ 0 → سندی پس از بستن با زمان داخل شیفت ثبت/همگام شده
  };

  app.get("/api/shifts/current", operate, async (req) => {
    const cafeId = req.user.cafeId, s = (await pool.query(`${SEL} WHERE s.cafe_id=$1 AND s.status='open'`, [cafeId])).rows[0];
    return { data: s ? pub(s, await withLive(pool, cafeId, s)) : null };
  });

  app.get("/api/shifts/report", manage, async (req) => {
    const cafeId = req.user.cafeId, to = toDate(req.query.to, { key: "to" }) || new Date().toISOString().slice(0, 10), from = toDate(req.query.from, { key: "from" }) || new Date(Date.parse(to) - 29 * 86400e3).toISOString().slice(0, 10);
    const rows = (await pool.query(`${SEL} WHERE s.cafe_id=$1 AND s.status='closed' AND s.opened_at >= $2::date AND s.opened_at < ($3::date + 1) ORDER BY s.opened_at`, [cafeId, from, to])).rows;
    const by = new Map();
    for (const s of rows) {
      const k = s.opened_by, u = by.get(k) || { userId: k, name: s.ob || s.opened_by_name, shifts: 0, cashSales: 0, nonCashSales: 0, expenses: 0, shortage: 0, overage: 0, exact: 0, maxShortage: 0, minutes: 0 };
      const t = s.totals || {}, cash = t.cashNet || 0, nonCash = Object.entries(t.net || {}).filter(([m]) => m !== "cash").reduce((a, [, v]) => a + num(v), 0);
      u.shifts++; u.cashSales += cash; u.nonCashSales += nonCash; u.expenses += t.cashExpenses || 0; const d = num(s.difference);
      if (d < 0) { u.shortage += -d; u.maxShortage = Math.max(u.maxShortage, -d); } else if (d > 0) u.overage += d; else u.exact++;
      u.minutes += Math.round((new Date(s.closed_at) - new Date(s.opened_at)) / 60000); by.set(k, u);
    }
    const people = [...by.values()].map((u) => ({ ...u, avgDifferenceAbs: u.shifts ? Math.round((u.shortage + u.overage) / u.shifts) : 0, accuracyPct: u.shifts ? Math.round((u.exact / u.shifts) * 100) : 0 }));
    const total = people.reduce((a, u) => ({ shifts: a.shifts + u.shifts, cashSales: a.cashSales + u.cashSales, nonCashSales: a.nonCashSales + u.nonCashSales, shortage: a.shortage + u.shortage, overage: a.overage + u.overage }), { shifts: 0, cashSales: 0, nonCashSales: 0, shortage: 0, overage: 0 });
    return { data: { period: { from, to }, closedShifts: rows.length, people, total, note: "فقط شیفت‌های بسته‌شده؛ مبلغ‌ها بر پایهٔ عکس لحظهٔ بستن" } };
  });

  app.get("/api/shifts", manage, async (req) => {
    const cafeId = req.user.cafeId, limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200), params = [cafeId]; let w = "s.cafe_id=$1";
    if (req.query.status === "open" || req.query.status === "closed") { params.push(req.query.status); w += ` AND s.status=$${params.length}`; }
    return { data: (await pool.query(`${SEL} WHERE ${w} ORDER BY s.opened_at DESC LIMIT ${limit}`, params)).rows.map((s) => pub(s)) };
  });

  app.get("/api/shifts/:id", operate, async (req) => {
    const cafeId = req.user.cafeId, perms = await app.perms.forRequest(req);
    const s = (await pool.query(`${SEL} WHERE s.cafe_id=$1 AND s.id=$2`, [cafeId, String(req.params.id)])).rows[0];
    if (!s) throw notFound("شیفت پیدا نشد");
    if (s.opened_by !== req.user.id && !perms.has("shift.manage")) throw forbidden("فقط شیفت خودتان را می‌بینید");
    return { data: pub(s, await withLive(pool, cafeId, s)) };
  });

  app.post("/api/shifts/:id/close", operate, async (req) => {
    const cafeId = req.user.cafeId, b = req.body || {}, counted = money(b.countedCash, "countedCash"), note = toText(b.note, { max: 500, key: "note" }).trim();
    const perms = await app.perms.forRequest(req);
    const row = await tx(pool, async (c) => {
      const s = (await c.query("SELECT * FROM cash_shifts WHERE cafe_id=$1 AND id=$2 FOR UPDATE", [cafeId, String(req.params.id)])).rows[0];
      if (!s) throw notFound("شیفت پیدا نشد");
      if (s.status !== "open") throw conflict("این شیفت پیش‌تر بسته شده است", "shift_closed");
      if (s.opened_by !== req.user.id && !perms.has("shift.manage")) throw forbidden("فقط مسئول شیفت یا مدیر می‌تواند آن را ببندد");
      const closedAt = (await c.query("SELECT now() AS n")).rows[0].n;
      const t = await shiftTotals(c, cafeId, s.opened_at, closedAt), expected = expectedCash(s.opening_cash, t), diff = counted - expected;
      if (diff !== 0 && note.length < 3) throw invalid(`بین شمارش (${counted}) و مورد انتظار (${expected}) اختلاف ${diff} ریال هست؛ توضیح بنویسید`, { expectedCash: expected, difference: diff });
      const name = await userName(c, req.user.id);
      await c.query("UPDATE cash_shifts SET status='closed', closed_by=$3, closed_by_name=$4, closed_at=$5, expected_cash=$6, counted_cash=$7, difference=$8, totals=$9, note=CASE WHEN $10 <> '' THEN $10 ELSE note END, updated_at=now() WHERE cafe_id=$1 AND id=$2",
        [cafeId, s.id, req.user.id, name, closedAt, expected, counted, diff, JSON.stringify(t), note]);
      await audit(c, { cafeId, userId: req.user.id, action: "shift.close", entity: "shift", entityId: s.id, details: { expectedCash: expected, countedCash: counted, difference: diff, openedBy: s.opened_by }, ip: req.ip });
      return (await c.query(`${SEL} WHERE s.cafe_id=$1 AND s.id=$2`, [cafeId, s.id])).rows[0];
    });
    return { data: pub(row) };
  });
}
