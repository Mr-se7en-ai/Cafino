// لایهٔ نازک روی API دریافت فایل از مشتری (QR) + توابع خالصِ قابل‌آزمون.
import { apiRequest, getApiConfig } from "../services/api/client.js";
import { getAuthToken } from "../services/auth/session.js";

const J = (method, body) => ({ method, body: body ?? {} });
const qs = (o = {}) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); const s = p.toString(); return s ? `?${s}` : ""; };

export const uploads = {
  settings: () => apiRequest("/api/uploads/settings"),
  saveSettings: (patch) => apiRequest("/api/uploads/settings", J("PUT", patch)),
  rotateCode: () => apiRequest("/api/uploads/settings/rotate-code", J("POST")),
  list: (q) => apiRequest(`/api/uploads${qs(q)}`, { rawEnvelope: true }),   // {data, meta:{newCount,total}}
  setStatus: (id, status) => apiRequest(`/api/uploads/${encodeURIComponent(id)}`, J("PATCH", { status })),
  remove: (id) => apiRequest(`/api/uploads/${encodeURIComponent(id)}`, { method: "DELETE" }),
  patch: (id, body) => apiRequest(`/api/uploads/${encodeURIComponent(id)}`, J("PATCH", body)),     // {status?, name?, protected?}
  rename: (id, name) => uploads.patch(id, { name }),
  protect: (id, on) => uploads.patch(id, { protected: !!on }),
  link: (body) => apiRequest("/api/uploads/link", J("POST", body)),                               // {ids|batchId, orderRef, orderLabel, customerRef, customerLabel}
  bulkDelete: (ids) => apiRequest("/api/uploads/bulk-delete", J("POST", { ids })),
  bulkStatus: (ids, status) => apiRequest("/api/uploads/bulk-status", J("POST", { ids, status })),
  saveLogo: (data) => apiRequest("/api/uploads/shop-logo", J("PUT", { data })),
  removeLogo: () => apiRequest("/api/uploads/shop-logo", { method: "DELETE" }),
  summary: () => apiRequest("/api/uploads/summary"),
  blocked: () => apiRequest("/api/uploads/blocked"),
  sessions: (q) => apiRequest(`/api/uploads/sessions${qs(q)}`),
  createSession: (body) => apiRequest("/api/uploads/sessions", J("POST", body)),
  closeSession: (id) => apiRequest(`/api/uploads/sessions/${encodeURIComponent(id)}/close`, J("POST")),
};

export const SORTS = [["created", "تاریخ دریافت"], ["name", "نام فایل"], ["size", "حجم"], ["status", "وضعیت"]];
const EXT = (n) => { const m = /\.([A-Za-z0-9]{1,6})$/.exec(String(n || "")); return m ? m[1].toLowerCase() : ""; };
export const fileKind = (name) => { const e = EXT(name); return e === "pdf" ? "pdf" : ["jpg", "jpeg", "png", "webp"].includes(e) ? "image" : ["txt", "csv"].includes(e) ? "text" : "other"; };
export const MIME_OF = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", txt: "text/plain", csv: "text/csv" };

/** درخواست احراز‌شده با fetch (برای دانلود و ارسال FormData). ۴۰۱ → یک‌بار تازه‌سازی نشست و تلاش دوباره. */
export async function authFetch(path, init = {}, { fetchImpl = globalThis.fetch } = {}) {
  const run = () => {
    const { baseUrl } = getApiConfig(), token = getAuthToken();
    return fetchImpl(`${String(baseUrl).replace(/\/+$/, "")}${path}`, { ...init, headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "include" });
  };
  let res = await run();
  if (res.status === 401) { try { await uploads.settings(); } catch { /* نشست تازه نشد */ } res = await run(); }
  return res;
}
const failMsg = async (res) => { let m = ""; try { m = (await res.json())?.error?.message || ""; } catch { /* ignore */ } return m || (res.status === 410 ? "فایل از روی سرور حذف شده است" : `درخواست ناموفق (${res.status})`); };
/** بایت‌های فایل دریافتی (برای پیش‌نمایش و ابزارها). فایل «جدید» با این کار «دیده‌شده» می‌شود. */
export async function fetchUploadBytes(item, opts) {
  const res = await authFetch(`/api/uploads/${encodeURIComponent(item.id)}/download`, {}, opts);
  if (!res.ok) throw new Error(await failMsg(res));
  return new Uint8Array(await res.arrayBuffer());
}
/** ذخیرهٔ نتیجهٔ ابزار PDF به‌عنوان فایل جدید در همان ارسال/سفارش. */
export async function deriveUpload(fromItem, name, bytes, opts) {
  const fd = new FormData();
  fd.append("from", fromItem.id); fd.append("name", name);
  fd.append("file", new Blob([bytes], { type: MIME_OF[EXT(name)] || "application/octet-stream" }), name);
  const res = await authFetch("/api/uploads/derive", { method: "POST", body: fd }, opts);
  if (!res.ok) throw new Error(await failMsg(res));
  return (await res.json())?.data;
}
export function saveBlob(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement("a");
  a.href = url; a.download = name || "file"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
/** مدت باقی‌مانده تا انقضای QR موقت به فارسی. */
export function timeLeft(expiresAt, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now; if (!(ms > 0)) return "منقضی شد";
  const m = Math.ceil(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d >= 1 ? `${d} روز` : h >= 1 ? `${h} ساعت${m % 60 ? ` و ${m % 60} دقیقه` : ""}` : `${m} دقیقه`;
}
export const TTL_OPTIONS = [[30, "۳۰ دقیقه"], [60, "۱ ساعت"], [240, "۴ ساعت"], [1440, "۱ روز"], [4320, "۳ روز"], [10080, "۷ روز"]];

export const STATUS_LABEL = { new: "جدید", seen: "دیده‌شده", printed: "چاپ‌شده", done: "انجام‌شده" };
export const STATUS_COLOR = { new: "#f59e0b", seen: "#60a5fa", printed: "#a78bfa", done: "#34d399" };
export const STATUSES = ["new", "seen", "printed", "done"];

/** نشانی کامل صفحهٔ آپلود مشتری: PUBLIC_BASE_URL سرور اگر بود، وگرنه مبدأ API، وگرنه مبدأ مرورگر. بدون سرور → "". */
export function publicUploadUrl(settings, config = getApiConfig(), origin = globalThis.location?.origin || "") {
  if (!settings?.code) return "";
  if (settings.url) return settings.url;
  const base = String(config?.baseUrl || "").replace(/\/+$/, "") || (/^https?:\/\//.test(origin) ? origin : "");
  return base ? `${base}/u/${settings.code}` : "";
}

export function fmtSize(n) {
  n = Number(n) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} مگابایت`;
  return `${Math.max(1, Math.round(n / 1024))} کیلوبایت`;
}

/** فایل‌ها را به‌صورت «ارسال» (batch) گروه می‌کند؛ جدیدترین ارسال اول. وضعیت ارسال = «جدیدترین/فعال‌ترین» وضعیت اعضا. */
export function groupBatches(items) {
  const map = new Map();
  for (const it of items || []) {
    if (!map.has(it.batchId)) map.set(it.batchId, { batchId: it.batchId, batchCode: it.batchCode, senderName: it.senderName, senderPhone: it.senderPhone, note: it.note, createdAt: it.createdAt, orderLabel: it.orderLabel, customerLabel: it.customerLabel, files: [] });
    map.get(it.batchId).files.push(it);
  }
  return [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** دانلود امن: با هدر Authorization (دانلود ساده با لینک ممکن نیست چون توکن در کوکی/هدر است). Blob → ذخیره با نام اصلی. */
export async function downloadUpload(item, { fetchImpl = globalThis.fetch } = {}) {
  const res = await authFetch(`/api/uploads/${encodeURIComponent(item.id)}/download`, {}, { fetchImpl });
  if (!res.ok) throw new Error(await failMsg(res));
  saveBlob(await res.blob(), item.name);
}

/** HTML پوستر چاپی A4: لوگو، نام کافی‌نت، QR بزرگ، راهنمای سه‌مرحله‌ای و نشانی. همهٔ مقدارها قبلاً escape شده باید باشند. */
export function buildPosterHtml({ shopName, url, qrSvgText, wordmarkSvg, esc, fontCss = "", notice = "" }) {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>پوستر QR — ${esc(shopName)}</title><style>${fontCss}
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Vazirmatn,Tahoma,sans-serif;color:#2b1610;background:#fff}
.p{width:210mm;height:297mm;margin:0 auto;padding:16mm 14mm;display:flex;flex-direction:column;align-items:center;text-align:center;border-top:14mm solid #e8590c}
.logo{height:34mm;margin:6mm 0 4mm}.logo svg{height:100%;width:auto;color:#2b1610}
h1{font-size:30pt;margin:4mm 0 2mm;line-height:1.3}h2{font-size:17pt;margin:0 0 8mm;font-weight:500;color:#7a5a4a}
.qr{width:112mm;height:112mm;padding:5mm;border:3mm solid #e8590c;border-radius:10mm;background:#fff}.qr svg{width:100%;height:100%;display:block}
.steps{display:flex;gap:6mm;margin-top:10mm;direction:rtl}.st{width:50mm}.st b{display:flex;width:12mm;height:12mm;margin:0 auto 2mm;border-radius:50%;background:#e8590c;color:#fff;align-items:center;justify-content:center;font-size:16pt}.st span{font-size:13pt}
.url{margin-top:auto;font-size:11pt;color:#7a5a4a;direction:ltr;word-break:break-all}.note{margin-top:6mm;font-size:12pt;color:#7c2d12}
.btn{margin:10px;padding:10px 18px;font-size:14px;cursor:pointer}@media print{.no-print{display:none}}</style></head><body>
<div class="p"><div class="logo">${wordmarkSvg}</div><h1>فایلت را همین‌جا بفرست!</h1><h2>${esc(shopName)}</h2>
<div class="qr">${qrSvgText}</div>
<div class="steps"><div class="st"><b>۱</b><span>دوربین گوشی را روی QR بگیرید</span></div><div class="st"><b>۲</b><span>فایل یا عکس را انتخاب کنید</span></div><div class="st"><b>۳</b><span>کد پیگیری را به کارمند نشان دهید</span></div></div>
${notice ? `<div class="note">${esc(notice)}</div>` : ""}
<div class="url">${esc(url)}</div></div>
<div class="no-print" style="text-align:center"><button class="btn" onclick="window.print()">🖨️ چاپ پوستر</button></div></body></html>`;
}
