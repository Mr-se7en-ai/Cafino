// سیاست مجوزهای رندرر: فقط «میکروفن» (دستیار صوتی) و «اعلان» و فقط برای صفحهٔ خود برنامه.
// دوربین (video)، موقعیت، حافظهٔ کلیپ‌بورد، USB/سریال/HID و … همه رد می‌شوند.
"use strict";
const ALLOWED = new Set(["media", "notifications"]);

function mediaTypesOf(details) {
  if (!details) return [];
  if (Array.isArray(details.mediaTypes)) return details.mediaTypes;       // درخواست getUserMedia
  if (details.mediaType) return [details.mediaType];                      // بررسی مجوز
  return [];
}
function createPermissionPolicy({ isOwnPage }) {
  const pageOk = (wc, details) => { try { return isOwnPage((details && (details.requestingUrl || details.embeddingOrigin)) || (wc && wc.getURL && wc.getURL()) || ""); } catch { return false; } };
  // درخواست: media فقط وقتی همهٔ انواع «audio» باشد (video یا screen رد)
  const request = (wc, permission, details) => {
    if (!ALLOWED.has(permission) || !pageOk(wc, details)) return false;
    if (permission === "media") { const t = mediaTypesOf(details); return t.length > 0 && t.every((x) => x === "audio"); }
    return true;
  };
  // بررسی: نوع «unknown» (پیش از درخواست) برای میکروفن لازم است؛ video رد
  const check = (wc, permission, _origin, details) => {
    if (!ALLOWED.has(permission) || !pageOk(wc, details)) return false;
    if (permission === "media") { const t = mediaTypesOf(details); return t.length === 0 || t.every((x) => x === "audio" || x === "unknown"); }
    return true;
  };
  return { request, check };
}
module.exports = { createPermissionPolicy, ALLOWED };
