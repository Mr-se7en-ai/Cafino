// محاسبات خالص (بدون React) برای صفحه‌های «تم نارنجی»؛ همه‌چیز از دادهٔ واقعی برنامه ساخته می‌شود.
import { dateToJalali, jalaliToIso, jalaliMonthDays } from "../../app/core/jalali.js";
import { JM } from "../../app/core/constants.js";

const iso10 = (s) => (typeof s === "string" ? s.slice(0, 10) : "");
export const addDaysIso = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const amt = (t) => Number(t && t.amount) || 0;
const validTx = (t) => !!t && (t.type === "income" || t.type === "expense") && /^\d{4}-\d{2}-\d{2}/.test(String(t.date || ""));

export function sumRange(txs, type, from, to) {
  let s = 0;
  for (const t of txs || []) if (validTx(t) && t.type === type) { const d = iso10(t.date); if (d >= from && d <= to) s += amt(t); }
  return s;
}
export function pctChange(cur, prev) {
  if (!prev) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

// کارت‌های بالای داشبورد: امروز در برابر دیروز
export function dayKpis(txs, today) {
  const y = addDaysIso(today, -1);
  const income = sumRange(txs, "income", today, today), expense = sumRange(txs, "expense", today, today);
  const pIncome = sumRange(txs, "income", y, y), pExpense = sumRange(txs, "expense", y, y);
  const net = income - expense, pNet = pIncome - pExpense;
  return { income, expense, net, trend: { income: pctChange(income, pIncome), expense: pctChange(expense, pExpense), net: pctChange(net, pNet) } };
}

// مشتری فعال = مشتری‌ای که در ۳۰ روز گذشته خرید کرده؛ اگر هیچ فروشی ثبت نشده باشد همهٔ مشتریان
export function activeCustomers(customers, sales, today, days = 30) {
  const from = addDaysIso(today, -days), ids = new Set();
  for (const s of sales || []) if (s && !s.cancelled && s.customerId != null && iso10(s.date) >= from) ids.add(String(s.customerId));
  const total = (customers || []).length;
  const count = (customers || []).filter((c) => ids.has(String(c.id))).length;
  const prevFrom = addDaysIso(today, -2 * days), prev = new Set();
  for (const s of sales || []) if (s && !s.cancelled && s.customerId != null) { const d = iso10(s.date); if (d >= prevFrom && d < from) prev.add(String(s.customerId)); }
  return { count, total, trend: pctChange(count, prev.size) };
}

export function jalaliMonthRanges(today, n) {
  let [jy, jm] = dateToJalali(today);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift({ jy, jm, label: JM[jm - 1], from: jalaliToIso(jy, jm, 1), to: jalaliToIso(jy, jm, jalaliMonthDays(jy, jm)) });
    jm -= 1; if (jm < 1) { jm = 12; jy -= 1; }
  }
  return out;
}

// سری درآمد برای نمودار خطی: هفته (۷ روز)، ماه (۳۰ روز)، سال (۱۲ ماه شمسی)
export function revenueSeries(txs, range, today) {
  if (range === "year") return jalaliMonthRanges(today, 12).map((m) => ({ label: m.label, value: sumRange(txs, "income", m.from, m.to) }));
  const n = range === "week" ? 7 : 30, pts = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDaysIso(today, -i), [, jm, jd] = dateToJalali(d);
    pts.push({ label: `${jd} ${JM[jm - 1]}`, iso: d, value: sumRange(txs, "income", d, d) });
  }
  return pts;
}

// سهم دسته‌های درآمد در ۳۰ روز گذشته (بیشینه maxSlices دستهٔ اصلی + «سایر»)
export function incomeShare(txs, today, days = 30, maxSlices = 4) {
  const from = addDaysIso(today, -days + 1), by = new Map();
  for (const t of txs || []) if (validTx(t) && t.type === "income") { const d = iso10(t.date); if (d >= from && d <= today) { const k = String(t.category || "سایر").trim() || "سایر"; by.set(k, (by.get(k) || 0) + amt(t)); } }
  const all = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const total = all.reduce((s, [, v]) => s + v, 0);
  if (!total) return { total: 0, slices: [] };
  const top = all.slice(0, maxSlices), rest = all.slice(maxSlices).reduce((s, [, v]) => s + v, 0);
  const slices = top.map(([label, value]) => ({ label, value }));
  if (rest > 0) slices.push({ label: "سایر", value: rest });
  // درصدها طوری گرد می‌شوند که جمعشان دقیقاً ۱۰۰ شود
  const raw = slices.map((s) => (s.value / total) * 100), pct = raw.map(Math.floor);
  let left = 100 - pct.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { pct[i]++; left--; } });
  return { total, slices: slices.map((s, i) => ({ ...s, pct: pct[i] })) };
}

const txOrder = (a, b) => (iso10(b.date) < iso10(a.date) ? -1 : iso10(b.date) > iso10(a.date) ? 1 : (Number(b.id) || 0) - (Number(a.id) || 0));
export function recentTx(txs, n = 5) { return (txs || []).filter(validTx).slice().sort(txOrder).slice(0, n); }

// موجودی انبار: درصد پر بودن نسبت به «سه برابر حداقل موجودی»؛ کمتر از ۴۰٪ هشدار قرمز
export function stockLevels(items, n = 4) {
  const rows = (items || []).filter((it) => it && Number(it.minQty) > 0).map((it) => {
    const qty = Number(it.qty) || 0, min = Number(it.minQty) || 0;
    const pct = Math.max(0, Math.min(100, Math.round((qty / (min * 3)) * 100)));
    return { id: it.id, name: it.name, qty, min, unit: it.unit || "", pct, low: pct < 40, out: qty <= min };
  }).sort((a, b) => a.pct - b.pct);
  return { rows: rows.slice(0, n), lowCount: rows.filter((r) => r.out).length };
}

// درآمد و هزینهٔ ماهانه (N ماه شمسی تا ماه جاری)
export function monthlyIncomeExpense(txs, today, n = 7) {
  return jalaliMonthRanges(today, n).map((m) => ({ label: m.label, income: sumRange(txs, "income", m.from, m.to), expense: sumRange(txs, "expense", m.from, m.to) }));
}

// دفتر کل ساده از تراکنش‌ها: درآمد = بستانکار، هزینه = بدهکار؛ «مانده» تجمعی از قدیمی‌ترین رکورد
export function ledgerRows(txs, from, to, limit = 20) {
  const all = (txs || []).filter(validTx).slice().sort((a, b) => -txOrder(a, b));
  let bal = 0; const rows = [];
  for (const t of all) { bal += t.type === "income" ? amt(t) : -amt(t); rows.push({ id: t.id, date: iso10(t.date), desc: t.desc || t.category || "", debit: t.type === "expense" ? amt(t) : 0, credit: t.type === "income" ? amt(t) : 0, balance: bal }); }
  return rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to)).reverse().slice(0, limit);
}

export function rangeTotals(txs, from, to) {
  const income = sumRange(txs, "income", from, to), expense = sumRange(txs, "expense", from, to);
  return { income, expense, net: income - expense };
}

// نام کوتاه برای آواتار: حرف اول نام
export function initialOf(name) { const s = String(name || "").trim(); return s ? Array.from(s)[0] : "؟"; }
const AV = ["#e8590c", "#1fa7c4", "#7c5cd6", "#2f9e57", "#d6336c", "#f08c00", "#3b7ddd", "#9c36b5"];
export function avatarColor(key) { const s = String(key == null ? "" : key); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AV[h % AV.length]; }

// «آخرین مراجعه» به‌صورت متن نسبی
export function relativeDay(iso, today) {
  if (!iso) return "—";
  const d = Math.round((new Date(today + "T00:00:00Z") - new Date(iso + "T00:00:00Z")) / 86400000);
  if (d <= 0) return "امروز";
  if (d === 1) return "دیروز";
  if (d < 7) return `${d} روز پیش`;
  if (d < 30) return `${Math.floor(d / 7)} هفته پیش`;
  if (d < 365) return `${Math.floor(d / 30)} ماه پیش`;
  return `${Math.floor(d / 365)} سال پیش`;
}
