// قالب‌بندی فارسی (مینی‌اپ): ارقام فارسی، تومان (مبلغ‌ها در پایگاه‌داده ریال‌اند)، تاریخ شمسی
const nf = new Intl.NumberFormat("fa-IR");
export const faNum = (n) => nf.format(Number.isFinite(Number(n)) ? Number(n) : 0);
export const toToman = (rial) => Math.round(Number(rial || 0) / 10);
export const tomanText = (rial) => `${faNum(toToman(rial))} تومان`;
export function jalali(iso, now = Date.now()) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return "";
  const d = new Date(t), day = (x) => new Date(x).toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
  const time = d.toLocaleTimeString("fa-IR-u-ca-persian", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" });
  if (day(t) === day(now)) return `امروز ${time}`;
  if (day(t) === day(now - 86400000)) return `دیروز ${time}`;
  return d.toLocaleDateString("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tehran" });
}
export const initial = (s) => (String(s || "").trim()[0] || "ک");
export const telHref = (p) => { const d = String(p || "").replace(/[^\d+]/g, ""); return d ? `tel:${d}` : ""; };
// فقط تبدیل ارقام (بدون جداکنندهٔ هزارگان) — برای کد پیگیری و شماره‌ها
export const faDigits = (s) => String(s ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
