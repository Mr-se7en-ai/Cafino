// «دفتر کل» و «مغایرت‌گیری» (۱.۸۲) — منطق خالص و قابل‌آزمون.
// دفتر کل از تراکنش‌های واقعی برنامه ساخته می‌شود: هر وجه واقعی (درآمد/هزینهٔ غیرخودکار) روی حساب خودش
// (نقدی، کارتخوان، حساب بانکی، …) می‌نشیند؛ درآمد = بدهکار (ورود پول)، هزینه = بستانکار (خروج پول). مبالغ ریال هستند.
// مغایرت‌گیری: صورت‌حساب بانک (یا شمارش نقد) با دفتر همان حساب تطبیق داده می‌شود؛ ردیف‌های تطبیق‌خورده «مغایرت‌گیری‌شده» علامت می‌خورند.
import { isRealCashTx, txMethod } from "../app/core/constants.js";
import { gregorianToJalali, jalaliToGregorian } from "../app/core/jalali.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const pad = (n) => String(n).padStart(2, "0");
const toLatin = (s) => String(s ?? "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
export const dayDiff = (a, b) => Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 864e5);

/** تاریخ شمسی نمایشی (۱۴۰۵/۰۸/۲۴) از ISO میلادی. */
export function faDate(iso) {
  if (!isoOk(iso)) return "—";
  const [y, m, d] = iso.split("-").map(Number); const [jy, jm, jd] = gregorianToJalali(y, m, d);
  return `${jy}/${pad(jm)}/${pad(jd)}`.replace(/\d/g, (x) => "۰۱۲۳۴۵۶۷۸۹"[x]);
}

/** حساب‌های دفتر کل از روش‌های پرداخت (PAY_METHODS): فقط «وجه واقعی». کیف پول مشتری قابل مغایرت‌گیری نیست. */
export function glAccountsFrom(payMethods) {
  return (Array.isArray(payMethods) ? payMethods : []).filter((m) => m && m.real).map((m) => ({
    key: m.key, label: m.label, icon: m.icon || "•", kind: m.key === "wallet" ? "wallet" : m.channelType || (m.key === "cash" ? "cash" : m.key === "pos" ? "pos" : "other"), reconcilable: m.key !== "wallet",
  }));
}

/** تراکنش‌ها ← ردیف‌های دفتر کل. خودکارها (مصرف مواد) و تراکنش‌های ناقص حذف می‌شوند. */
export function buildLines(transactions) {
  const out = [];
  (Array.isArray(transactions) ? transactions : []).forEach((t, idx) => {
    if (!t || t.id == null || !isoOk(t.date)) return;
    if (t.type !== "income" && t.type !== "expense") return;
    if (!isRealCashTx(t)) return;
    const amount = Math.abs(num(t.amount)); if (!amount) return;
    out.push({ key: `tx:${t.id}`, id: t.id, date: t.date, account: txMethod(t), debit: t.type === "income" ? amount : 0, credit: t.type === "expense" ? amount : 0, net: t.type === "income" ? amount : -amount, category: t.category || "", desc: t.desc || "", ref: t.saleId != null ? String(t.saleId) : (t.invoiceId != null ? String(t.invoiceId) : ""), idx });
  });
  return out;
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.idx - b.idx);

/** دفتر یک حساب: مانده اول دوره = مانده دستی + جمع ردیف‌های قبل از from؛ ردیف‌ها با مانده جاری. */
export function ledgerFor(lines, account, { from = "", to = "", opening = 0, q = "" } = {}) {
  const mine = lines.filter((l) => l.account === account).sort(byDate);
  let open = num(opening);
  const inRange = [];
  for (const l of mine) {
    if (from && l.date < from) { open += l.net; continue; }
    if (to && l.date > to) continue;
    inRange.push(l);
  }
  let bal = open, debit = 0, credit = 0;
  const all = inRange.map((l) => { bal += l.net; debit += l.debit; credit += l.credit; return { ...l, balance: bal }; });
  const needle = toLatin(q).trim().toLowerCase();
  const rows = needle ? all.filter((r) => `${r.desc} ${r.category} ${r.ref} ${r.debit || r.credit}`.toLowerCase().includes(needle)) : all;
  return { account, opening: open, rows, debit, credit, closing: bal, count: all.length };
}

/** خلاصهٔ همهٔ حساب‌ها (برای نمای «همه حساب‌ها»). */
export function summarizeAll(lines, accounts, { from = "", to = "", openings = {} } = {}) {
  return accounts.map((a) => { const l = ledgerFor(lines, a.key, { from, to, opening: openings[a.key] || 0 }); return { account: a, opening: l.opening, debit: l.debit, credit: l.credit, closing: l.closing, count: l.count }; });
}

/** تبدیل مبلغ واردشده (تومان/ریال) به ریال داخلی. */
export const toRial = (n, unit) => (unit === "toman" ? num(n) * 10 : num(n));

// ── صورت‌حساب ──
const cleanNum = (t) => { const s = toLatin(t).replace(/[,٬،\s]/g, "").replace(/[−–—]/g, "-"); if (!/^[-+]?\(?\d+(\.\d+)?\)?$/.test(s)) return null; const neg = /^\(.*\)$/.test(s.replace(/^[-+]/, "")) || s.startsWith("("); const v = Number(s.replace(/[()+]/g, "").replace(/^-/, "")); const n = (s.startsWith("-") || neg) ? -v : v; return Number.isFinite(n) ? n : null; };
/** مبلغ تایپ‌شده در یک فیلد (ارقام فارسی/ویرگول، علامت) ← ریال؛ خالی/نامعتبر = null. */
export function parseAmountInput(text, unit = "rial") { const t = String(text ?? "").trim(); if (!t) return null; const v = cleanNum(t); return v === null ? null : toRial(v, unit); }
function parseDate(tok) {
  const m = toLatin(tok).match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); if (!m) return null;
  let y = +m[1], mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y >= 1300 && y < 1500) { try { [y, mo, d] = jalaliToGregorian(y, mo, d); } catch { return null; } } else if (!(y >= 1900 && y <= 2200)) return null;
  const iso = `${y}-${pad(mo)}-${pad(d)}`; return isoOk(iso) ? iso : null;
}
/** متن چسبانده‌شده از صورت‌حساب ← ردیف‌ها. مثبت = واریز (ورود پول)، منفی = برداشت.
 *  قالب ۱: «تاریخ ⇥ مبلغ ⇥ شرح» (مبلغ علامت‌دار)؛ قالب ۲: «تاریخ ⇥ شرح ⇥ برداشت ⇥ واریز» (جداکنندهٔ تب، ; یا |)؛ بدون جداکننده: «تاریخ مبلغ شرح…». */
export function parseStatement(text, { unit = "rial" } = {}) {
  const rows = [], errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim(); if (!line) return;
    const date = parseDate(line);
    if (!date) { errors.push({ line: i + 1, raw: line, reason: "تاریخ معتبر پیدا نشد" }); return; }
    const rest = toLatin(line).replace(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/, " ").trim();
    let cells = rest.split(/\t|;|\|/).map((c) => c.trim());
    let amount = null, desc = "";
    if (cells.length >= 2) {
      const nums = cells.map(cleanNum); const lastTwo = cells.slice(-2).map((c, j) => (c === "" ? 0 : nums[cells.length - 2 + j]));
      if (cells.length >= 3 && lastTwo.every((v) => v !== null && v >= 0)) { amount = lastTwo[1] - lastTwo[0]; desc = cells.slice(0, -2).join(" ").trim(); }
      else { const k = nums.findIndex((v) => v !== null); if (k >= 0) { amount = nums[k]; desc = cells.filter((_, j) => j !== k).join(" ").trim(); } }
    } else {
      const toks = rest.split(/\s+/); const k = toks.findIndex((t) => cleanNum(t) !== null);
      if (k >= 0) { amount = cleanNum(toks[k]); desc = toks.filter((_, j) => j !== k).join(" ").trim(); }
    }
    if (amount === null || amount === 0) { errors.push({ line: i + 1, raw: line, reason: amount === 0 ? "مبلغ صفر" : "مبلغ پیدا نشد" }); return; }
    rows.push({ id: `s${rows.length + 1}`, line: i + 1, date, amount: toRial(amount, unit), desc });
  });
  return { rows, errors };
}

/** تطبیق خودکار: هر ردیف صورت‌حساب با ردیف دفتر هم‌مبلغ (ورود/خروج یکسان) و حداکثر dayWindow روز اختلاف؛ نزدیک‌ترین تاریخ اول. */
export function autoMatch(lines, stmt, { dayWindow = 2, skip = new Set() } = {}) {
  const free = lines.filter((l) => !skip.has(l.key)); const used = new Set(); const pairs = [];
  [...stmt].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.line - b.line)).forEach((s) => {
    let best = null;
    for (const l of free) {
      if (used.has(l.key) || l.net !== s.amount) continue;
      const dd = Math.abs(dayDiff(l.date, s.date)); if (dd > dayWindow) continue;
      if (!best || dd < best.dd || (dd === best.dd && l.idx < best.l.idx)) best = { l, dd };
    }
    if (best) { used.add(best.l.key); pairs.push({ lineKey: best.l.key, stmtId: s.id, dayDiff: best.dd, mode: "auto" }); }
  });
  const matchedS = new Set(pairs.map((p) => p.stmtId));
  return { pairs, unmatchedBook: free.filter((l) => !used.has(l.key)), unmatchedStmt: stmt.filter((s) => !matchedS.has(s.id)) };
}

/** جمع‌بندی مغایرت‌گیری. unexplained = (مانده بانک − مانده دفتر) − (خالصِ تطبیق‌نخوردهٔ بانک − خالصِ تطبیق‌نخوردهٔ دفتر)؛ صفر یعنی همهٔ اختلاف توضیح داده شده. */
export function reconSummary({ bookClosing, stmtClosing, unmatchedBook, unmatchedStmt }) {
  const hasStmt = stmtClosing !== null && stmtClosing !== undefined && stmtClosing !== "";
  const diff = hasStmt ? num(stmtClosing) - num(bookClosing) : null;
  const ub = unmatchedBook.reduce((s, l) => s + l.net, 0), us = unmatchedStmt.reduce((s, r) => s + r.amount, 0);
  const unexplained = hasStmt ? diff - (us - ub) : null;
  return { bookClosing: num(bookClosing), stmtClosing: hasStmt ? num(stmtClosing) : null, diff, unmatchedBookNet: ub, unmatchedStmtNet: us, unexplained, balanced: hasStmt ? unexplained === 0 : null };
}

// ── ذخیرهٔ مغایرت‌گیری ──
export const GL_RECON_KEY = "cafenet_gl_recon";
export const emptyRecon = () => ({ v: 1, matches: {}, sessions: [], openings: {} });
export function normRecon(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { v: 1, matches: r.matches && typeof r.matches === "object" && !Array.isArray(r.matches) ? r.matches : {}, sessions: Array.isArray(r.sessions) ? r.sessions : [], openings: r.openings && typeof r.openings === "object" && !Array.isArray(r.openings) ? r.openings : {} };
}
/** علامت‌گذاری ردیف‌ها؛ مبلغ و تاریخ لحظهٔ مغایرت ثبت می‌شود تا تغییر بعدیِ تراکنش قابل‌تشخیص باشد. */
export function markReconciled(store, lines, meta) {
  const s = normRecon(store), matches = { ...s.matches };
  lines.forEach((l) => { matches[l.key] = { at: meta.at, by: meta.by || "", session: meta.session, mode: meta.modes?.[l.key] || "auto", a: l.net, d: l.date }; });
  return { ...s, matches };
}
export function unmark(store, key) { const s = normRecon(store), matches = { ...s.matches }; delete matches[key]; return { ...s, matches }; }
export function addSession(store, session, cap = 300) { const s = normRecon(store); return { ...s, sessions: [session, ...s.sessions].slice(0, cap) }; }
/** وضعیت یک ردیف: none | ok | changed (پس از مغایرت‌گیری مبلغ/تاریخ تراکنش عوض شده). */
export function reconState(store, line) { const m = normRecon(store).matches[line.key]; if (!m) return "none"; return m.a === line.net && m.d === line.date ? "ok" : "changed"; }

/** خروجی CSV (با BOM برای Excel). */
export function toCsv(rows, header) {
  const q = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [header, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
}
