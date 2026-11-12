// «مرکز چاپ و اسکن» — موتور دستگاه‌ها، جاب‌ها، کنتور و مغایرت.
//  • هر چاپ/اسکن یک «جاب» است: تعداد درخواستی، تعداد واقعاً انجام‌شده و خطا؛ وضعیت کامل / ناقص / ناموفق / لغو.
//  • فقط صفحات واقعاً انجام‌شده صورتحساب می‌شوند (فروش واقعی با createSale: فاکتور، درآمد، حساب مشتری، مصرف انبار).
//  • جاب همیشه ثبت می‌شود؛ اگر صورتحساب نشد (مثلاً کمبود موجودی) با پرچم «صورتحساب‌نشده» می‌ماند و بعداً قابل صدور است.
//  • کنتور دستگاه: قرائت‌های کنتور با صفحات ثبت‌شدهٔ برنامه مقایسه می‌شود (چاپ‌های ثبت‌نشده).
import { lsRead, lsWrite, createId, createSale, getSale, cancelSale, emitDataChange } from "../app/domain/sales.jsx";
import { getRecipes, recipeUsageList } from "../app/domain/recipes.jsx";
import { DEFAULT_PRINT_COSTS, INV_STORAGE_KEY } from "../app/core/constants.js";
import { isoToJKey } from "../app/domain/backup.js";
import { todayIso } from "../app/core/jalali.js";
import { logActivity } from "../app/core/activity.js";
import { audit } from "../audit/auditTrail.js";
import { loadVendor } from "../vendor/loader.js";

export const DEVICES_KEY = "cafenet_devices", JOBS_KEY = "cafenet_device_jobs", METERS_KEY = "cafenet_device_meters";
export const JOB_KINDS = { print: "پرینت", copy: "کپی", scan: "اسکن" };
export const JOB_STATUS = { done: "کامل", partial: "ناقص", failed: "ناموفق", cancelled: "لغوشده" };
export const MAX_PAGES = 10000, JOBS_CAP = 20000;
const SIZE_MULT = { A4: 1, A5: 0.6, A3: 2 };
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v, n = 120) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : NaN; };
const num0 = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// ───────── دستگاه‌ها ─────────
export const getDevices = () => arr(lsRead(DEVICES_KEY, [])).filter((d) => d && d.id);
export const getDeviceById = (id) => getDevices().find((d) => String(d.id) === String(id)) || null;
export const deviceKindFor = (jobKind) => (jobKind === "scan" ? "scanner" : "printer");

export function saveDevice(input) {
  const kind = input.kind === "scanner" ? "scanner" : "printer";
  const name = str(input.name, 60);
  if (!name) return { ok: false, error: "نام دستگاه را بنویسید" };
  const list = getDevices();
  const dup = list.find((d) => d.id !== input.id && d.kind === kind && d.name === name && !d.archived);
  if (dup) return { ok: false, error: "دستگاهی با همین نام وجود دارد" };
  const ip = str(input.ip, 45);
  if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return { ok: false, error: "آدرس IP پرینتر نامعتبر است (مثل 192.168.1.50)" };
  const base = { id: input.id || createId("dev"), kind, name, nativeName: str(input.nativeName, 200), ip, color: !!input.color,
    priceBW: num0(input.priceBW), priceColor: num0(input.priceColor), priceScan: num0(input.priceScan), archived: false, createdAt: Date.now() };
  const old = list.find((d) => d.id === base.id);
  const dev = old ? { ...old, ...base, createdAt: old.createdAt } : base;
  lsWrite(DEVICES_KEY, old ? list.map((d) => (d.id === dev.id ? dev : d)) : [...list, dev]);
  emitDataChange();
  return { ok: true, device: dev };
}
// دستگاهی که جاب دارد حذف نمی‌شود (کنتور و تاریخچه خراب می‌شود)؛ بایگانی می‌شود.
export function removeDevice(id) {
  const has = getJobs().some((j) => String(j.deviceId) === String(id)) || getMeterReadings(id).length > 0;
  const list = getDevices();
  if (has) lsWrite(DEVICES_KEY, list.map((d) => (String(d.id) === String(id) ? { ...d, archived: true } : d)));
  else lsWrite(DEVICES_KEY, list.filter((d) => String(d.id) !== String(id)));
  emitDataChange();
  return { ok: true, archived: has };
}
// همگام‌سازی فهرست دستگاه‌های ویندوز با دستگاه‌های ثبت‌شده؛ فقط موارد جدید اضافه می‌شود.
export function mergeNativeDevices(found, kind) {
  const list = getDevices(); let added = 0; const out = [...list];
  arr(found).forEach((f) => {
    const nativeName = str(f.name || f.id, 200); if (!nativeName) return;
    const ex = out.find((d) => d.kind === kind && (d.nativeName === nativeName || d.name === str(f.displayName || f.name, 60)));
    if (ex) { if (!ex.nativeName) ex.nativeName = nativeName; if (!ex.ip && f.ip) ex.ip = str(f.ip, 45); return; }
    out.push({ id: createId("dev"), kind, name: str(f.displayName || f.name, 60), nativeName, ip: str(f.ip, 45), color: !!f.color, priceBW: 0, priceColor: 0, priceScan: 0, archived: false, createdAt: Date.now() }); added++;
  });
  if (added || out.some((d, i) => d !== list[i])) { lsWrite(DEVICES_KEY, out); emitDataChange(); }
  return { added };
}

// ───────── جاب‌ها ─────────
export const getJobs = () => arr(lsRead(JOBS_KEY, [])).filter((j) => j && j.id);
export const getJob = (id) => getJobs().find((j) => String(j.id) === String(id)) || null;
export function classifyJob(requested, done) {
  const r = int(requested), d = int(done);
  if (!(r >= 1)) return null;
  if (!(d >= 0) || d > r) return null;
  return { requested: r, done: d, failed: r - d, status: d === r ? "done" : d > 0 ? "partial" : "failed" };
}
export const recipeKeysFor = (kind, color, size) => {
  const label = JOB_KINDS[kind] || "پرینت", col = color ? "رنگی" : "سیاه‌وسفید";
  return [`${label} ${col} ${size}`, `${label} ${size}`, `${label} ${col}`, label];
};
export const descFor = (kind, color, size, pages) => `${JOB_KINDS[kind]}${kind === "scan" ? "" : ` ${color ? "رنگی" : "سیاه‌وسفید"}`} ${size} — ${pages} برگ`;
// قیمت واحد پیشنهادی از خود دستگاه (اگر تنظیم شده باشد)
export function devicePrice(dev, kind, color) {
  if (!dev) return 0;
  return kind === "scan" ? num0(dev.priceScan) : color ? num0(dev.priceColor) : num0(dev.priceBW);
}
function jobCost(kind, color, size, pages, desc, recipeKeys) {
  const costs = { ...DEFAULT_PRINT_COSTS, ...(lsRead("cafenet_print_costs", null) || {}) };
  const mult = SIZE_MULT[size] || 1;
  const inv = arr(lsRead(INV_STORAGE_KEY, []));
  const usage = recipeUsageList({ recipeKeys, category: kind === "scan" ? "اسکن" : "پرینت و کپی", desc }, pages, getRecipes(), inv);
  const service = (Number(costs.servicePerPage) || 0) * mult * pages;
  if (usage.length) return service;
  return ((Number(costs.paperPerPage) || 0) + (color ? Number(costs.inkColorPerPage) || 0 : Number(costs.inkBWPerPage) || 0)) * mult * pages + service;
}
function billJobCore(job, { payMethod = "cash", customerId } = {}) {
  if (!(job.done > 0) || !(job.amount > 0)) return { ok: true, sale: null, skipped: true };
  const cid = customerId !== undefined ? customerId : job.customerId;
  const method = !cid && (payMethod === "credit" || payMethod === "wallet") ? "cash" : payMethod;
  const rk = recipeKeysFor(job.kind, job.color, job.size), desc = descFor(job.kind, job.color, job.size, job.done);
  const r = createSale({ customerId: cid || null, walkIn: !cid, skipOrder: true, date: job.date,
    items: [{ desc, qty: job.done, price: job.unitPrice, category: job.kind === "scan" ? "اسکن" : "پرینت و کپی", recipeKeys: rk, cost: jobCost(job.kind, job.color, job.size, job.done, desc, rk) }],
    payments: method === "credit" ? [] : [{ method, amount: job.amount }] });
  return r;
}
// input: { kind, deviceId?, customerId?, fileName?, requested, done?, color?, size?, unitPrice, payMethod?, source?, note?, charge?, nativeJobId?, assumed? }
export function recordJob(input = {}) {
  const kind = JOB_KINDS[input.kind] ? input.kind : null;
  if (!kind) return { ok: false, error: "نوع کار نامعتبر است" };
  const cls = classifyJob(input.requested, input.done === undefined || input.done === null || input.done === "" ? input.requested : input.done);
  if (!cls) return { ok: false, error: "تعداد صفحات نامعتبر است (انجام‌شده نمی‌تواند بیشتر از درخواستی باشد)" };
  if (cls.requested > MAX_PAGES) return { ok: false, error: `حداکثر ${MAX_PAGES} صفحه در یک جاب` };
  const dev = input.deviceId ? getDeviceById(input.deviceId) : null;
  if (input.deviceId && !dev) return { ok: false, error: "دستگاه پیدا نشد" };
  if (dev && dev.kind !== deviceKindFor(kind)) return { ok: false, error: kind === "scan" ? "برای اسکن باید یک اسکنر انتخاب شود" : "برای چاپ و کپی باید یک پرینتر انتخاب شود" };
  const color = kind !== "scan" && !!input.color, size = SIZE_MULT[input.size] ? input.size : "A4";
  const unitPrice = Math.max(0, Number(input.unitPrice) || 0);
  const charge = input.charge !== false;
  const cancelled = !!input.cancelled;
  const status = cancelled ? "cancelled" : cls.status;
  const customer = input.customerId ? arr(lsRead("cafenet_customers", [])).find((c) => String(c.id) === String(input.customerId)) : null;
  const job = {
    id: createId("job"), ts: Date.now(), date: input.date || todayIso(), kind, deviceId: dev ? dev.id : null, deviceName: dev ? dev.name : "",
    customerId: customer ? customer.id : null, customerName: customer ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim() : "",
    fileName: str(input.fileName, 120), requested: cls.requested, done: cls.done, failed: cls.failed, status, color, size, unitPrice,
    amount: charge ? cls.done * unitPrice : 0, source: input.source === "native" ? "native" : "manual", assumed: !!input.assumed, nativeJobId: str(input.nativeJobId, 80),
    note: str(input.note, 200), saleId: null, invoiceNumber: null, unbilled: false, billError: "", voided: false,
  };
  let sale = null, warning = "";
  if (input.saleRef && input.saleRef.id) {          // فروش را فرم دیگری قبلاً ثبت کرده (فرم سریع پرینت و اسکن) — دوباره صورتحساب نمی‌شود
    job.saleId = input.saleRef.id; job.invoiceNumber = input.saleRef.number || null; job.amount = Number(input.saleRef.amount) || job.amount;
  } else if (charge && job.amount > 0) {
    let r; try { r = billJobCore(job, { payMethod: input.payMethod || "cash" }); } catch (e) { r = { ok: false, error: "خطا در ثبت فروش" }; }
    if (r && r.ok && r.sale) { sale = r.sale; job.saleId = sale.id; job.invoiceNumber = sale.number; }
    else { job.unbilled = true; job.billError = (r && r.error) || "ثبت فروش انجام نشد"; warning = `جاب ثبت شد ولی صورتحساب نشد: ${job.billError}`; }
  }
  const jobs = [...getJobs(), job]; lsWrite(JOBS_KEY, jobs.length > JOBS_CAP ? jobs.slice(jobs.length - JOBS_CAP) : jobs);
  logActivity(`ثبت ${JOB_KINDS[kind]}`, `${job.deviceName || "بدون دستگاه"} — ${job.done}/${job.requested} برگ${job.customerName ? ` — ${job.customerName}` : ""}${status !== "done" ? ` — ${JOB_STATUS[status]}` : ""}`);
  emitDataChange();
  return { ok: true, job, sale, warning };
}
// صدور صورتحساب برای جابی که صورتحساب نشده بود
export function billJob(jobId, opts = {}) {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: "جاب پیدا نشد" };
  if (job.saleId) return { ok: false, error: "این جاب قبلاً صورتحساب شده است" };
  if (job.voided) return { ok: false, error: "جاب باطل شده است" };
  if (!(job.done > 0) || !(job.unitPrice > 0)) return { ok: false, error: "مبلغی برای صورتحساب وجود ندارد" };
  const amount = job.done * job.unitPrice;
  const r = billJobCore({ ...job, amount }, opts);
  if (!r.ok || !r.sale) return { ok: false, error: (r && r.error) || "ثبت فروش انجام نشد" };
  lsWrite(JOBS_KEY, getJobs().map((j) => (j.id === job.id ? { ...j, amount, saleId: r.sale.id, invoiceNumber: r.sale.number, unbilled: false, billError: "" } : j)));
  emitDataChange();
  return { ok: true, sale: r.sale };
}
// ابطال جاب: فروش مربوط باطل می‌شود (با دلیل و ثبت در حسابرسی)، ولی صفحات فیزیکی در کنتور شمرده می‌مانند.
export function voidJob(jobId, reason) {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: "جاب پیدا نشد" };
  if (job.voided) return { ok: false, error: "این جاب قبلاً باطل شده است" };
  const why = str(reason, 300);
  if (why.length < 3) return { ok: false, error: "دلیل ابطال الزامی است" };
  const hadSale = !!(job.saleId && getSale(job.saleId));
  if (hadSale) cancelSale(job.saleId, why); // خودِ ابطال فروش در حسابرسی ثبت می‌شود
  lsWrite(JOBS_KEY, getJobs().map((j) => (j.id === job.id ? { ...j, voided: true, amount: 0, voidReason: why, voidedAt: Date.now() } : j)));
  if (!hadSale) audit({ action: "invoice_void", label: `ابطال جاب ${JOB_KINDS[job.kind]}`, entityType: "جاب", entityId: job.invoiceNumber || job.id, entityLabel: `${JOB_KINDS[job.kind]} ${job.done} برگ — ${job.deviceName || "بدون دستگاه"}`, amount: job.amount, reason: why });
  emitDataChange();
  return { ok: true };
}

// ───────── خلاصه‌ها و گزارش ─────────
const emptyAgg = () => ({ jobs: 0, requested: 0, done: 0, failed: 0, amount: 0, print: 0, copy: 0, scan: 0 });
function addAgg(a, j) { a.jobs++; a.requested += j.requested; a.done += j.done; a.failed += j.failed; a.amount += j.voided ? 0 : j.amount; a[j.kind] += j.done; }
export function summarize(jobs, { deviceId = null, from = "", to = "", monthKey = "" } = {}) {
  const a = emptyAgg();
  arr(jobs).filter((j) => j.status !== "cancelled" || j.done > 0).forEach((j) => {
    if (deviceId && String(j.deviceId) !== String(deviceId)) return;
    if (from && j.date < from) return; if (to && j.date > to) return;
    if (monthKey && isoToJKey(j.date, "monthly") !== monthKey) return;
    addAgg(a, j);
  });
  return a;
}
export function deviceOverview(deviceId, jobs = getJobs()) {
  const today = todayIso(), mk = isoToJKey(today, "monthly");
  const mine = arr(jobs).filter((j) => String(j.deviceId) === String(deviceId));
  const last = mine.length ? mine.reduce((m, j) => (j.ts >= m.ts ? j : m), mine[0]) : null;
  return { today: summarize(mine, { from: today, to: today }), month: summarize(mine, { monthKey: mk }), total: summarize(mine), last };
}
// گزارش روزانه یا ماهانه: ردیف به ازای هر روز/ماه و دستگاه
export function periodReport(jobs, mode = "daily", { deviceId = null, limit = 62 } = {}) {
  const map = new Map();
  arr(jobs).forEach((j) => {
    if (deviceId && String(j.deviceId) !== String(deviceId)) return;
    const key = isoToJKey(j.date, mode === "monthly" ? "monthly" : "daily"), k2 = `${key}|${j.deviceId || ""}`;
    if (!map.has(k2)) map.set(k2, { key, deviceId: j.deviceId || null, deviceName: j.deviceName || "بدون دستگاه", date: j.date, ...emptyAgg() });
    addAgg(map.get(k2), j);
  });
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.deviceName.localeCompare(b.deviceName))).slice(0, limit);
}
export function jobsToCsv(list) {
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["تاریخ", "ساعت", "نوع", "دستگاه", "مشتری", "فایل", "درخواستی", "انجام‌شده", "خطا", "وضعیت", "رنگی", "اندازه", "قیمت واحد (ریال)", "مبلغ (ریال)", "فاکتور", "منبع"];
  return "﻿" + [head.map(q).join(","), ...arr(list).map((j) => [j.date, new Date(j.ts).toTimeString().slice(0, 5), JOB_KINDS[j.kind], j.deviceName, j.customerName, j.fileName, j.requested, j.done, j.failed, JOB_STATUS[j.status] + (j.voided ? " (باطل)" : ""), j.color ? "رنگی" : "", j.size, j.unitPrice, j.amount, j.invoiceNumber || "", j.source === "native" ? "خودکار" : "دستی"].map(q).join(","))].join("\r\n");
}

// ───────── کنتور و مغایرت ─────────
export const getMeterReadings = (deviceId) => arr(lsRead(METERS_KEY, [])).filter((m) => m && String(m.deviceId) === String(deviceId)).sort((a, b) => a.ts - b.ts);
export function addMeterReading({ deviceId, value, ts, note, reset } = {}) {
  const dev = getDeviceById(deviceId);
  if (!dev || dev.kind !== "printer") return { ok: false, error: "کنتور فقط برای پرینتر ثبت می‌شود" };
  const v = int(value);
  if (!(v >= 0) || v > 1e9) return { ok: false, error: "عدد کنتور نامعتبر است" };
  const rs = getMeterReadings(deviceId), last = rs[rs.length - 1];
  const when = Number.isFinite(Number(ts)) && ts ? Number(ts) : Date.now();
  if (last && when < last.ts) return { ok: false, error: "تاریخ قرائت قبل از قرائت قبلی است" };
  if (last && v < last.value && !reset) return { ok: false, error: `کنتور (${v}) کمتر از قرائت قبلی (${last.value}) است. اگر کنتور دستگاه صفر یا تعویض شده «شروع دوباره» را بزنید`, needsReset: true };
  const rec = { id: createId("mtr"), deviceId: dev.id, value: v, ts: when, date: todayIso(), note: str(note, 120), reset: !!(reset && last && v < last.value) };
  lsWrite(METERS_KEY, [...arr(lsRead(METERS_KEY, [])), rec]);
  logActivity("ثبت کنتور پرینتر", `${dev.name} — ${v}`);
  emitDataChange();
  return { ok: true, reading: rec };
}
// صفحات فیزیکی که برنامه برای این پرینتر ثبت کرده (چاپ و کپی؛ شامل جاب‌های باطل چون کاغذ مصرف شده)
export function recordedPages(deviceId, afterTs, uptoTs, jobs = getJobs()) {
  return arr(jobs).filter((j) => String(j.deviceId) === String(deviceId) && j.kind !== "scan" && j.ts > afterTs && j.ts <= uptoTs).reduce((s, j) => s + j.done, 0);
}
export function reconcile(deviceId, fromReading, toReading, jobs = getJobs()) {
  if (!fromReading || !toReading || toReading.ts <= fromReading.ts) return null;
  if (toReading.reset) return null; // پس از صفر شدن کنتور مقایسه معنا ندارد
  const actual = toReading.value - fromReading.value, recorded = recordedPages(deviceId, fromReading.ts, toReading.ts, jobs);
  const diff = actual - recorded, tol = Math.max(2, Math.round(actual * 0.01));
  const status = Math.abs(diff) <= tol ? "ok" : diff > 0 ? "unrecorded" : "overrecorded";
  return { from: fromReading, to: toReading, actual, recorded, diff, tolerance: tol, status };
}
// مقایسهٔ دو قرائت آخر (برای کارت دستگاه و کنترل سلامت)
export function reconcileLatest(deviceId, jobs = getJobs()) {
  const rs = getMeterReadings(deviceId); if (rs.length < 2) return null;
  return reconcile(deviceId, rs[rs.length - 2], rs[rs.length - 1], jobs);
}
// مقایسهٔ ماهانه: اولین قرائت ماه (یا آخرین قرائت ماه قبل) تا آخرین قرائت ماه
export function reconcileMonth(deviceId, monthKey, jobs = getJobs()) {
  const rs = getMeterReadings(deviceId);
  const inMonth = rs.filter((r) => isoToJKey(todayIsoOf(r.ts), "monthly") === monthKey);
  if (!inMonth.length) return null;
  const before = rs.filter((r) => r.ts < inMonth[0].ts).pop();
  return reconcile(deviceId, before || inMonth[0], inMonth[inMonth.length - 1], jobs);
}
const todayIsoOf = (ts) => { const d = new Date(ts); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
// کنتور تخمینی فعلی = آخرین قرائت + صفحات ثبت‌شده پس از آن
export function estimatedMeter(deviceId, jobs = getJobs()) {
  const rs = getMeterReadings(deviceId), last = rs[rs.length - 1];
  if (!last) return null;
  return last.value + recordedPages(deviceId, last.ts - 1, Date.now() + 1, jobs);
}
// برای کنترل سلامت: پرینترهایی که مغایرت کنتور دارند
export function meterIssues(jobs = getJobs()) {
  const out = [];
  getDevices().filter((d) => d.kind === "printer" && !d.archived).forEach((d) => { const r = reconcileLatest(d.id, jobs); if (r && r.status !== "ok") out.push({ device: d, ...r }); });
  return out;
}

// ───────── شمارش صفحات PDF (بدون کتابخانه) ─────────
// روش: خواندن ساختار شیء‌ها. اگر PDF فشرده (object stream) باشد شمارش ممکن نیست و null برمی‌گردد → اپراتور دستی وارد می‌کند.
export function countPdfPages(bytes) {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 8 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "%PDF") return null;
    let s = ""; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    let rootCount = 0, maxCount = 0, leaf = 0;
    const re = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g; let m;
    while ((m = re.exec(s))) {
      const body = m[3];
      if (/\/Type\s*\/Pages\b/.test(body)) { const c = /\/Count\s+(\d+)/.exec(body); if (c) { const n = Number(c[1]); if (n > maxCount) maxCount = n; if (!/\/Parent\b/.test(body)) rootCount = n; } }
      else if (/\/Type\s*\/Page\b(?!s)/.test(body)) leaf++;
    }
    const pages = rootCount || maxCount || leaf;
    return pages > 0 && pages <= MAX_PAGES ? pages : null;
  } catch { return null; }
}

// شمارش دقیق‌تر با pdf-lib (بارگذاری تنبل؛ از object stream هم عبور می‌کند). اگر کتابخانه یا فایل مشکل داشت به شمارش ساده برمی‌گردد.
export async function countPdfPagesAsync(bytes, loader) {
  try {
    const lib = await (loader || (() => loadVendor("pdfinfo")))();
    const doc = await lib.PDFDocument.load(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    const n = doc.getPageCount();
    if (n >= 1 && n <= MAX_PAGES) return { pages: n, method: "pdf-lib" };
  } catch { /* fall through */ }
  const n = countPdfPages(bytes);
  return n ? { pages: n, method: "scan" } : { pages: null, method: "none" };
}
