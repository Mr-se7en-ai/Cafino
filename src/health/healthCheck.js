// «کنترل سلامت کسب‌وکار» — بررسی خودکار صحت و وضعیت داده‌های کافینو.
// خروجی: فهرست بررسی‌ها با وضعیت ok | warn | bad | info. همهٔ بررسی‌ها فقط‌خواندنی‌اند (هیچ داده‌ای تغییر نمی‌کند).
import { lsRead, getSales, saleRemaining } from "../app/domain/sales.jsx";
import { computeDebtors } from "../app/pages/dashboard.jsx";
import { daysSinceLastBackup } from "../app/domain/backup.js";
import { getObligations, oblStatus } from "../app/domain/obligations.jsx";
import { missingPayroll, getEmployees } from "../app/domain/payroll.js";
import { dueReminders } from "../app/domain/notes.js";
import { syncQueue } from "../sync/index.js";
import { syncState } from "../sync/SyncUI.jsx";
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { getAuthenticatedUser } from "../services/auth/session.js";
import { todayIso, dateToJalali } from "../app/core/jalali.js";
import { fmtM, toFA } from "../app/core/format.js";
import { verifyAuditChain, auditStats } from "../audit/auditTrail.js";
import { getJobs, meterIssues } from "../devices/printCenter.js";

export const DEBT_DAYS = 30, BACKUP_WARN_DAYS = 7, BACKUP_BAD_DAYS = 30, TOLERANCE = 5; // ریال
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => Number(v);
const bad = (v) => !Number.isFinite(num(v));
const dayDiff = (iso) => { const a = new Date(todayIso() + "T00:00:00"), b = new Date(String(iso).slice(0, 10) + "T00:00:00"); return Math.round((a - b) / 864e5); };
const ck = (id, group, title, status, detail, extra = {}) => ({ id, group, title, status, detail, ...extra });

export function runHealthCheck(ctx = {}) {
  const checks = [];
  const sales = arr(getSales()), live = sales.filter((s) => !s.cancelled);
  const invoices = arr(lsRead("cafenet_invoices", [])), txs = arr(lsRead("cafenet_tx3", []));
  const ledger = arr(lsRead("cafenet_ledger2", [])), inv = arr(lsRead("cafenet_inventory", []));
  const customers = arr(lsRead("cafenet_customers", []));

  // ── ۱) حساب‌ها متعادل‌اند؟ ──
  const issues = [];
  for (const s of live) {
    const tol = TOLERANCE * Math.max(1, arr(s.payments).length);
    if (bad(s.total) || bad(s.paid ?? 0) || bad(s.waived ?? 0) || num(s.total) < 0 || num(s.paid || 0) < 0 || num(s.waived || 0) < 0) { issues.push(`فروش ${s.number}: مبلغ نامعتبر`); continue; }
    if (num(s.paid || 0) + num(s.waived || 0) > num(s.total) + tol) issues.push(`فروش ${s.number}: پرداخت و بخشودگی بیش از جمع فاکتور`);
    const incomeSum = txs.filter((t) => t.type === "income" && String(t.saleId) === String(s.id)).reduce((a, t) => a + (num(t.amount) || 0), 0);
    if (Math.abs(incomeSum - num(s.paid || 0)) > tol) issues.push(`فروش ${s.number}: درآمد ثبت‌شده (${fmtM(incomeSum)}) با دریافتی (${fmtM(s.paid || 0)}) نمی‌خواند`);
    const iv = invoices.find((x) => String(x.saleId) === String(s.id) || (s.invoiceId != null && String(x.id) === String(s.invoiceId)));
    if (!iv && s.status !== "draft") issues.push(`فروش ${s.number}: فاکتور مربوطه پیدا نشد`);
    else if (iv && iv.remainingAmount != null && Math.abs(num(iv.remainingAmount) - saleRemaining(s)) > tol) issues.push(`فاکتور ${iv.number}: مانده با فروش نمی‌خواند`);
    if (s.ledgerAccId && s.ledgerEntryId) {
      const acc = ledger.find((a) => String(a.id) === String(s.ledgerAccId)), en = acc && arr(acc.entries).find((e) => String(e.id) === String(s.ledgerEntryId));
      const rem = saleRemaining(s);
      if (rem > 0 && !en) issues.push(`فروش ${s.number}: بدهی در دفتر حساب مشتری ثبت نشده`);
      else if (en && Math.abs(num(en.amount) - rem) > tol) issues.push(`فروش ${s.number}: بدهی دفتر حساب (${fmtM(en.amount)}) با مانده (${fmtM(rem)}) نمی‌خواند`);
    }
  }
  const badTx = txs.filter((t) => bad(t.amount) || num(t.amount) < 0 || !["income", "expense"].includes(t.type)).length;
  if (badTx) issues.push(`${toFA(badTx)} تراکنش با مبلغ یا نوع نامعتبر`);
  const dupTx = txs.length - new Set(txs.map((t) => String(t.id))).size;
  if (dupTx > 0) issues.push(`${toFA(dupTx)} تراکنش با شناسهٔ تکراری`);
  const badLedger = ledger.reduce((n, a) => n + arr(a.entries).filter((e) => bad(e.amount) || num(e.amount) < 0).length, 0);
  if (badLedger) issues.push(`${toFA(badLedger)} سند حساب مشتری با مبلغ نامعتبر`);
  checks.push(ck("accounts", "حسابداری", "حساب‌ها متعادل هستند", issues.length ? "bad" : "ok", issues.length ? `${toFA(issues.length)} مغایرت یافت شد` : `${toFA(live.length)} فروش، ${toFA(txs.length)} تراکنش و ${toFA(ledger.length)} حساب مشتری بررسی شد`, { items: issues.slice(0, 8), tab: "ledger" }));

  // ── ۲) شماره فاکتور تکراری / مشتری بی‌مرجع ──
  const nums = invoices.filter((i) => i.status !== "draft" && i.number != null).map((i) => String(i.number));
  const dupNums = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
  const cids = new Set(customers.map((c) => String(c.id)));
  const orphan = live.filter((s) => s.customerId != null && s.customerId !== "" && !cids.has(String(s.customerId))).length;
  const refIssues = [dupNums.length && `شمارهٔ فاکتور تکراری: ${dupNums.slice(0, 5).map(toFA).join("، ")}`, orphan && `${toFA(orphan)} فروش به مشتریِ حذف‌شده اشاره می‌کند`].filter(Boolean);
  checks.push(ck("refs", "حسابداری", "شماره فاکتورها و ارجاع به مشتری درست است", refIssues.length ? "warn" : "ok", refIssues.length ? refIssues.join(" · ") : "شماره‌ها یکتا و ارجاع‌ها سالم است", { items: refIssues, tab: "invoice" }));

  // ── ۳) موجودی ──
  const invBad = inv.filter((i) => bad(i.qty) || num(i.qty) < 0 || (i.minQty != null && (bad(i.minQty) || num(i.minQty) < 0)));
  checks.push(ck("stock", "انبار", "موجودی بدون مغایرت", invBad.length ? "bad" : "ok", invBad.length ? `${toFA(invBad.length)} کالا با مقدار منفی یا نامعتبر: ${invBad.slice(0, 3).map((i) => i.name).join("، ")}` : `${toFA(inv.length)} کالا بررسی شد (مقدار منفی یا نامعتبر نیست)`, { tab: "inventory" }));
  const low = inv.filter((i) => !bad(i.qty) && num(i.qty) <= num(i.minQty || 0) && (num(i.minQty || 0) > 0 || num(i.qty) <= 0));
  checks.push(ck("lowstock", "انبار", low.length ? `${toFA(low.length)} کالا زیر حداقل موجودی` : "هیچ کالایی زیر حداقل موجودی نیست", low.length ? "warn" : "ok", low.length ? low.slice(0, 4).map((i) => `${i.name} (${toFA(i.qty)})`).join("، ") : "", { count: low.length, tab: "inventory" }));

  // ── ۴) فاکتور پرداخت‌نشده ──
  const unpaid = live.filter((s) => saleRemaining(s) > 0);
  const manualUnpaid = invoices.filter((i) => !i.saleId && i.status !== "draft" && num(i.remainingAmount) > 0).length;
  const unpaidAmt = unpaid.reduce((a, s) => a + saleRemaining(s), 0);
  const cnt = unpaid.length + manualUnpaid;
  checks.push(ck("unpaid", "فروش", `فاکتورهای پرداخت‌نشده: ${toFA(cnt)}`, cnt ? "info" : "ok", cnt ? `جمع مانده ${fmtM(unpaidAmt)}` : "همهٔ فاکتورها تسویه شده", { count: cnt, tab: "invoice" }));

  // ── ۵) بدهی بالای ۳۰ روز ──
  const old = computeDebtors().filter((d) => d.oldest && dayDiff(d.oldest) > DEBT_DAYS);
  checks.push(ck("olddebt", "فروش", old.length ? `${toFA(old.length)} مشتری بدهی بیش از ${toFA(DEBT_DAYS)} روز دارند` : `بدهی بیش از ${toFA(DEBT_DAYS)} روز وجود ندارد`, old.length ? "warn" : "ok", old.length ? old.slice(0, 3).map((d) => `${d.name}: ${fmtM(d.amount)}`).join(" · ") : "", { count: old.length, tab: "ledger", items: old.slice(0, 8).map((d) => `${d.name} — ${fmtM(d.amount)} — ${toFA(dayDiff(d.oldest))} روز`) }));

  // ── ۶) تراکنش معلق: پیش‌نویس فاکتور + عملیات در صف همگام‌سازی ──
  const drafts = invoices.filter((i) => i.status === "draft").length;
  let stats = ctx.syncStats; const connected = ctx.apiConnected ?? (() => { try { return isApiConnected() && !!getAuthenticatedUser(); } catch { return false; } })();
  if (!stats && connected) { try { stats = syncQueue.stats(); } catch { stats = null; } }
  const queued = stats ? (stats.pending || 0) + (stats.inflight || 0) + (stats.failed || 0) : 0;
  checks.push(ck("pending", "فروش", `تراکنش معلق: ${toFA(drafts + queued)}`, drafts + queued ? "info" : "ok", drafts + queued ? [drafts && `${toFA(drafts)} پیش‌نویس فاکتور ناتمام`, queued && `${toFA(queued)} عملیات در صف ارسال`].filter(Boolean).join(" · ") : "پیش‌نویس یا عملیات نیمه‌کاره‌ای نیست", { count: drafts + queued, tab: "invoice" }));

  // ── ۷) همگام‌سازی ──
  if (!connected) checks.push(ck("sync", "سیستم", "همگام‌سازی: حالت محلی", "info", "به سرور وصل نیستید؛ داده‌ها فقط روی همین دستگاه است (بکاپ فراموش نشود)", { tab: "settings:server" }));
  else if (!stats) checks.push(ck("sync", "سیستم", "همگام‌سازی: وضعیت نامشخص", "warn", "خواندن وضعیت صف ممکن نشد", { tab: "settings:sync" }));
  else { const st = syncState({ online: true, reachable: true, ...stats }); const okS = st.key === "ok" || st.key === "syncing"; checks.push(ck("sync", "سیستم", okS ? "همگام‌سازی سالم است" : `همگام‌سازی: ${st.text}`, st.key === "failed" || st.key === "auth" ? "bad" : okS ? "ok" : "warn", st.text, { tab: "settings:sync" })); }

  // ── ۸) بکاپ ──
  const bd = ctx.backupDays ?? daysSinceLastBackup();
  if ((ctx.guest ?? (() => { try { return isGuestMode(); } catch { return false; } })())) checks.push(ck("backup", "سیستم", "حالت مهمان: بکاپ لازم نیست", "info", "داده‌های آزمایشی دائمی نیستند", {}));
  else checks.push(ck("backup", "سیستم", !Number.isFinite(bd) ? "هنوز بکاپ نگرفته‌اید" : bd > BACKUP_WARN_DAYS ? `آخرین بکاپ ${toFA(Math.floor(bd))} روز پیش` : "بکاپ سالم است", !Number.isFinite(bd) || bd > BACKUP_BAD_DAYS ? "bad" : bd > BACKUP_WARN_DAYS ? "warn" : "ok", Number.isFinite(bd) ? (bd < 1 ? "کمتر از یک روز پیش" : `${toFA(Math.floor(bd))} روز پیش`) : "از «پشتیبان‌گیری» یک بکاپ بگیرید", { tab: "settings:backup" }));

  // ── ۹) تعهدات، حقوق، یادآورها ──
  const overdue = arr(getObligations()).filter((o) => oblStatus(o) === "overdue");
  checks.push(ck("obl", "تعهدات", overdue.length ? `${toFA(overdue.length)} تعهد سررسیدگذشته` : "تعهد سررسیدگذشته‌ای نیست", overdue.length ? "warn" : "ok", overdue.slice(0, 3).map((o) => o.title).join("، "), { count: overdue.length, tab: "obligations" }));
  try {
    if (getEmployees().length) { const [jy, jm] = dateToJalali(todayIso()); const miss = missingPayroll(jy, jm); checks.push(ck("payroll", "تعهدات", miss.length ? `حقوق این ماه برای ${toFA(miss.length)} نفر صادر نشده` : "حقوق این ماه صادر شده", miss.length ? "warn" : "ok", miss.slice(0, 3).map((e) => e.name || e.firstName || "").join("، "), { tab: "obligations" })); }
  } catch { /* ignore */ }
  const dr = dueReminders();
  if (dr.length) checks.push(ck("reminders", "سیستم", `${toFA(dr.length)} یادآور سررسید شده`, "warn", dr.slice(0, 3).map((r) => r.title).join("، "), { count: dr.length, tab: "notes" }));

  // ── ۱۰) حسابرسی ──
  const ch = verifyAuditChain(), as = auditStats();
  checks.push(ck("audit", "امنیت", ch.ok ? "دفتر حسابرسی سالم است" : "دفتر حسابرسی دستکاری شده است", ch.ok ? "ok" : "bad", ch.message, { tab: "audit" }));
  if (as.noReason30) checks.push(ck("noreason", "امنیت", `${toFA(as.noReason30)} عملیات حساس بدون دلیل ثبت شده`, "warn", "در ۳۰ روز اخیر", { count: as.noReason30, tab: "audit" }));

  // ── ۱۰-ب) کنتور چاپ و جاب‌های صورتحساب‌نشده ──
  try {
    const jobs = getJobs(), mi = meterIssues(jobs), unb = jobs.filter((j) => j.unbilled && !j.saleId && !j.voided);
    if (mi.length) checks.push(ck("meter", "چاپ و اسکن", `${toFA(mi.length)} پرینتر با کنتور واقعی مغایرت دارد`, "warn", mi.slice(0, 3).map((m) => `${m.device.name}: ${m.diff > 0 ? "+" : ""}${toFA(m.diff)} صفحه`).join("، "), { count: mi.length, tab: "printscan:center" }));
    else if (jobs.length) checks.push(ck("meter", "چاپ و اسکن", "کنتور پرینترها با ثبت‌های برنامه می‌خواند", "ok", "", { tab: "printscan:center" }));
    if (unb.length) checks.push(ck("unbilled", "چاپ و اسکن", `${toFA(unb.length)} کار چاپ/اسکن صورتحساب نشده`, "warn", unb.slice(0, 3).map((j) => j.customerName || j.deviceName || "").filter(Boolean).join("، "), { count: unb.length, tab: "printscan:center" }));
  } catch { /* ignore */ }

  // ── ۱۱) حجم ذخیره‌سازی مرورگر ──
  try {
    let bytes = 0; const ls = globalThis.localStorage; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); bytes += (k.length + (ls.getItem(k) || "").length) * 2; }
    const mb = bytes / 1048576;
    checks.push(ck("storage", "سیستم", mb > 4 ? "حافظهٔ مرورگر رو به پر شدن است" : "حافظهٔ مرورگر کافی است", mb > 4.2 ? "bad" : mb > 3.5 ? "warn" : "ok", `${toFA(mb.toFixed(1))} مگابایت از حدود ۵ مگابایت`, { tab: "settings:backup" }));
  } catch { /* ignore */ }

  const summary = { ok: 0, warn: 0, bad: 0, info: 0 }; checks.forEach((c) => { summary[c.status]++; });
  const score = Math.max(0, 100 - summary.bad * 20 - summary.warn * 7);
  return { at: Date.now(), checks, summary, score, level: summary.bad ? "bad" : summary.warn ? "warn" : "ok" };
}
