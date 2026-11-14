// لایهٔ نازک روی API ربات‌های گزارش (بله/تلگرام) + توابع خالصِ قابل‌آزمون.
import { apiRequest } from "../services/api/client.js";

const J = (method, body) => ({ method, body: body ?? {} });
const p = (provider) => encodeURIComponent(provider);
export const bots = {
  list: () => apiRequest("/api/bots"),
  connect: (provider, token) => apiRequest(`/api/bots/${p(provider)}`, J("PUT", { token })),
  patch: (provider, body) => apiRequest(`/api/bots/${p(provider)}`, J("PATCH", body)),
  link: (provider) => apiRequest(`/api/bots/${p(provider)}/link`, J("POST")),
  unlink: (provider) => apiRequest(`/api/bots/${p(provider)}/unlink`, J("POST")),
  test: (provider) => apiRequest(`/api/bots/${p(provider)}/test`, J("POST")),
  send: (provider, range) => apiRequest(`/api/bots/${p(provider)}/send`, J("POST", { range })),
  remove: (provider) => apiRequest(`/api/bots/${p(provider)}`, { method: "DELETE" }),
};

export const RANGE_LABELS = [["today", "امروز"], ["yesterday", "دیروز"], ["week", "۷ روز اخیر"], ["month", "۳۰ روز اخیر"]];
export const HOWTO = {
  telegram: { tool: "BotFather", steps: ["در تلگرام @BotFather را باز کنید و /newbot را بفرستید.", "نام و نام‌کاربری (آخرش bot) را بدهید.", "توکنی که می‌دهد (مثل 123456789:AA…) را اینجا بچسبانید."], note: "تلگرام در ایران فیلتر است؛ اگر سرور کافینو داخل ایران است، مدیر سرور باید TELEGRAM_API_BASE را روی یک پراکسی تنظیم کند. سرور خارج از ایران بدون مشکل کار می‌کند." },
  bale: { tool: "بات‌فادر (@botfather)", steps: ["در بله «بات‌فادر» را باز کنید و ساخت ربات جدید را بزنید.", "نام و نام‌کاربری ربات را بدهید.", "توکن را اینجا بچسبانید."], note: "" },
};
/** وضعیت کلی یک کارت برای نشان بالای آن. */
export function statusOf(s) {
  if (!s?.connected) return { text: "متصل نیست", color: "#9ca3af" };
  if (!s.enabled) return { text: "غیرفعال", color: "#f87171" };
  if (s.lastError) return { text: "خطا", color: "#f87171" };
  if (!s.linked) return { text: "منتظر پیوند چت", color: "#fbbf24" };
  return { text: "فعال", color: "#34d399" };
}
/** ثانیه‌های باقی‌ماندهٔ کد پیوند (۰ = منقضی). */
export const secondsLeft = (iso, now = Date.now()) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : 0; };
export const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
export const isTokenShape = (t) => /^\d{3,16}:[A-Za-z0-9_:-]{16,100}$/.test(String(t || "").trim());
