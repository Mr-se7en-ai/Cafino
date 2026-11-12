// لایهٔ نازک روی API سرور برای «مرکز مالی سرور» (تطبیق مالی، شیفت صندوق، دسترسی‌ها، هوش کسب‌وکار).
// هیچ منطق مالی‌ای اینجا نیست: همهٔ محاسبه‌ها سمت سرور انجام می‌شود؛ این فایل فقط درخواست می‌فرستد
// و چند تابع خالصِ قابل‌آزمون (تبدیل ورودی پول، برچسب‌ها، خلاصهٔ اختلاف) دارد.
import { apiRequest } from "../services/api/client.js";

// apiRequest خودش body را JSON می‌کند و پوشش {data} را برمی‌دارد؛ اینجا نه دوباره stringify و نه دوباره unwrap.
const J = (method, body) => ({ method, body: body ?? {} });
const call = (path, options) => apiRequest(path, options);
const qs = (o = {}) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); const s = p.toString(); return s ? `?${s}` : ""; };

export const finance = {
  // تطبیق مالی
  integrity: () => call("/api/integrity"),
  corrections: (status) => call(`/api/integrity/corrections${qs({ status })}`),
  requestCorrection: ({ scope, reason }) => call("/api/integrity/corrections", J("POST", { scope, reason })),
  approveCorrection: (id, note) => call(`/api/integrity/corrections/${encodeURIComponent(id)}/approve`, J("POST", { note })),
  rejectCorrection: (id, note) => call(`/api/integrity/corrections/${encodeURIComponent(id)}/reject`, J("POST", { note })),
  // شیفت صندوق
  currentShift: () => call("/api/shifts/current"),
  openShift: ({ openingCash, note }) => call("/api/shifts/open", J("POST", { openingCash, note })),
  closeShift: (id, { countedCash, note }) => call(`/api/shifts/${encodeURIComponent(id)}/close`, J("POST", { countedCash, note })),
  shifts: (q) => call(`/api/shifts${qs(q)}`),
  shift: (id) => call(`/api/shifts/${encodeURIComponent(id)}`),
  shiftReport: (q) => call(`/api/shifts/report${qs(q)}`),
  // دسترسی‌ها
  permissions: () => call("/api/permissions"),
  savePermissions: (policy) => call("/api/permissions", J("PUT", policy)),
  // هوش کسب‌وکار
  bi: (q) => call(`/api/bi/overview${qs(q)}`),
};

export const SCOPES = [
  { key: "invoices", label: "فاکتورها (مبلغ/پرداخت‌شده/مانده/وضعیت)" },
  { key: "ledger", label: "اسناد دفتر کل (سند اصلاحیِ جدید)" },
  { key: "accounts", label: "مانده حساب‌ها" },
  { key: "inventory", label: "موجودی انبار" },
];
export const SEVERITY_LABEL = { critical: "بحرانی", high: "زیاد", medium: "متوسط", low: "کم" };
export const SEVERITY_COLOR = { critical: "#f87171", high: "#fb923c", medium: "#fbbf24", low: "#94a3b8" };
export const STATUS_LABEL = { pending: "در انتظار تأیید", approved: "تأییدشده", rejected: "ردشده", failed: "ناموفق" };

const P2L = "۰۱۲۳۴۵۶۷۸۹", A2L = "٠١٢٣٤٥٦٧٨٩";
/** رقم‌های فارسی/عربی را لاتین می‌کند و جداکنندهٔ هزارگان را برمی‌دارد. */
export function normalizeAmountText(s) {
  return String(s ?? "").replace(/[۰-۹]/g, (d) => P2L.indexOf(d)).replace(/[٠-٩]/g, (d) => A2L.indexOf(d)).replace(/[,،٬\s]/g, "");
}
/**
 * ورودی کاربر (به واحد نمایش: ریال یا تومان) → عدد صحیح ریال برای سرور.
 * نتیجه {ok:true, rial} یا {ok:false, error}. هرگز NaN/منفی/اعشار نمی‌فرستد.
 */
export function parseMoneyInput(text, unit = "rial") {
  const t = normalizeAmountText(text);
  if (t === "") return { ok: false, error: "مبلغ را وارد کنید" };
  if (!/^\d+$/.test(t)) return { ok: false, error: "مبلغ باید عدد صحیح غیرمنفی باشد" };
  const n = Number(t) * (unit === "toman" ? 10 : 1);
  if (!Number.isSafeInteger(n)) return { ok: false, error: "مبلغ بیش از حد بزرگ است" };
  return { ok: true, rial: n };
}

/** پیام خطای API را به متن قابل‌نمایش فارسی تبدیل می‌کند (جزئیات اعتبارسنجی هم اگر بود اضافه می‌شود). */
export function errorText(e) {
  const m = (e && (e.message || e.error)) || "خطای نامشخص";
  const d = e && e.details;
  if (d && typeof d === "object" && d.difference !== undefined) return `${m}`;
  return String(m);
}

/** خلاصهٔ گزارش تطبیق: تعداد یافته‌ها بر اساس شدت به‌ترتیب نمایش. */
export function summarizeFindings(report) {
  const s = (report && report.summary) || {};
  const order = ["critical", "high", "medium", "low"];
  return { ok: !!(report && report.ok), total: Number(s.total) || 0, rows: order.map((k) => ({ severity: k, label: SEVERITY_LABEL[k], count: Number(s[k]) || 0, color: SEVERITY_COLOR[k] })) };
}

/** چون سیاست دسترسی جایگزینیِ کامل است، فقط تفاوت‌های واقعیِ نقش‌ها را در سیاست نگه می‌داریم. */
export function buildPolicy(roles, users, limits, version) {
  const clean = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, { grant: [...new Set(v.grant || [])].sort(), deny: [...new Set(v.deny || [])].sort() }]).filter(([, v]) => v.grant.length || v.deny.length));
  return { roles: clean(roles), users: clean(users), limits: limits || {}, ...(version !== undefined ? { version } : {}) };
}
/** وضعیت یک مجوز برای یک نقش/کاربر: پیش‌فرض + grant/deny → «allow»|«deny». */
export function effectiveState(key, defaults, override) {
  const o = override || {};
  if ((o.deny || []).includes(key)) return "deny";
  if ((o.grant || []).includes(key)) return "allow";
  return (defaults || []).includes(key) ? "allow" : "deny";
}
/** تغییر یک مجوز نسبت به پیش‌فرض: فقط اگر با پیش‌فرض فرق کند در grant/deny ثبت می‌شود. */
export function setPermission(override, key, allow, defaults) {
  const grant = new Set(override?.grant || []), deny = new Set(override?.deny || []);
  grant.delete(key); deny.delete(key);
  const def = (defaults || []).includes(key);
  if (allow && !def) grant.add(key);
  if (!allow && def) deny.add(key);
  return { grant: [...grant].sort(), deny: [...deny].sort() };
}
