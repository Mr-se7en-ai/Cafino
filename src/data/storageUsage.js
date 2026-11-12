// مصرف حافظهٔ محلی (localStorage): سقف مرورگرها معمولاً ≈۵ میلیون نویسه است و داده‌های عملیاتی در حالت بدون‌سرور همین‌جا نگه‌داری می‌شوند.
// نوشتنِ ناموفق (quota) توسط data/transaction.js برگردانده می‌شود، اما بهتر است کاربر پیش از رسیدن به سقف هشدار بگیرد.
export const LOCAL_QUOTA_CHARS = 5 * 1024 * 1024;       // تقریب محافظه‌کارانه؛ مرورگرها متفاوتند

export function storageUsage(storage = globalThis.localStorage, { quota = LOCAL_QUOTA_CHARS, prefix = "cafenet_", top = 5 } = {}) {
  let total = 0; const items = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i); if (k == null || !k.startsWith(prefix)) continue;
      const v = storage.getItem(k); const n = (k.length + (v ? v.length : 0));
      total += n; items.push({ key: k, chars: n });
    }
  } catch { return { ok: false, chars: 0, quota, ratio: 0, level: "unknown", top: [] }; }
  items.sort((a, b) => b.chars - a.chars);
  const ratio = quota > 0 ? total / quota : 0;
  return { ok: true, chars: total, quota, ratio, level: ratio >= 0.9 ? "critical" : ratio >= 0.7 ? "warn" : "ok", top: items.slice(0, top) };
}
