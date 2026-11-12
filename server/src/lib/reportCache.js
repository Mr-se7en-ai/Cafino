// حافظهٔ نهان گزارش‌های سنگین: در حافظهٔ همین فرایند، با ابطال دقیق در هر نوشتنِ همان کافی‌نت + TTL کوتاه.
//  • کلید شامل «نسخهٔ کافی‌نت» است؛ invalidate(cafeId) نسخه را بالا می‌برد، پس نتیجه‌ای که حین نوشتن در حال محاسبه بود هرگز به‌عنوان تازه خوانده نمی‌شود.
//  • درخواست‌های هم‌زمانِ یکسان یک محاسبه را به اشتراک می‌گذارند (single-flight) → هجوم داشبورد پایگاه را نمی‌کشد.
//  • چند نمونهٔ API پشت load-balancer: ابطال فقط در همان نمونه است؛ نمونه‌های دیگر حداکثر تا TTL کهنه‌اند (REPORT_CACHE_TTL_MS=0 → خاموش).
export function createReportCache({ ttlMs = 15000, max = 500, now = () => Date.now() } = {}) {
  const ver = new Map(), store = new Map(), flying = new Map();
  const stats = { hits: 0, misses: 0, shared: 0, invalidations: 0, evictions: 0 };
  const v = (cafeId) => ver.get(cafeId) || 0;
  const keyOf = (cafeId, key) => `${cafeId}|${v(cafeId)}|${key}`;
  function prune() {
    if (store.size <= max) return;
    const t = now();
    for (const [k, e] of store) if (e.exp <= t) store.delete(k);
    while (store.size > max) { store.delete(store.keys().next().value); stats.evictions++; }
  }
  return {
    enabled: ttlMs > 0,
    stats: () => ({ ...stats, size: store.size, inflight: flying.size }),
    /** compute باید مقدار JSON-پذیر برگرداند. نتیجهٔ { value, state: "hit"|"miss"|"shared"|"bypass" } */
    async get(cafeId, key, compute, { fresh = false } = {}) {
      if (ttlMs <= 0 || fresh) return { value: await compute(), state: "bypass" };
      const k = keyOf(cafeId, key), t = now(), e = store.get(k);
      if (e && e.exp > t) { stats.hits++; store.delete(k); store.set(k, e); return { value: e.value, state: "hit" }; }   // LRU: تازه‌ترین به انتها
      if (flying.has(k)) { stats.shared++; return { value: await flying.get(k), state: "shared" }; }
      stats.misses++;
      const p = (async () => compute())();
      flying.set(k, p);
      try {
        const value = await p;
        store.set(k, { value, exp: now() + ttlMs }); prune();
        return { value, state: "miss" };
      } finally { flying.delete(k); }
    },
    invalidate(cafeId) {
      ver.set(cafeId, v(cafeId) + 1); stats.invalidations++;
      const pre = `${cafeId}|`;
      for (const k of store.keys()) if (k.startsWith(pre)) store.delete(k);
      if (ver.size > 5000) for (const id of [...ver.keys()].slice(0, 1000)) if (id !== cafeId) ver.delete(id);   // محدودکردن حافظه؛ حذف نسخه امن است چون کلیدهای قدیمی هم همراهش حذف می‌شوند
    },
    clear() { store.clear(); },
  };
}
