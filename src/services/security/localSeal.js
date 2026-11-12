// «مهر یکپارچگی» دادهٔ مالی محلی (فقط نسخهٔ دسکتاپ/Electron).
//
// مشکل: در حالت محلی، دادهٔ مالی در localStorage است و هر کسی که به پروفایل مرورگر/پوشهٔ برنامه دسترسی داشته باشد
// می‌تواند وقتی برنامه بسته است آن را مستقیم ویرایش کند. راه‌حل کامل «دیتابیس سرور» است (حالت سرور).
// این ماژول یک لایهٔ «آشکارسازی» اضافه می‌کند: هش SHA-256 دادهٔ مالی همیشه با رمزنگاری سیستم‌عامل (DPAPI/Keychain)
// در پردازش اصلی Electron ذخیره می‌شود. اگر موقع باز شدن برنامه هش با مهر نخواند، یعنی دادهٔ مالی «بیرون از برنامه» تغییر کرده
// (یا برنامه ناگهان بسته شده) و به مالک هشدار می‌دهیم.
// ⚠ محدودیت: کدی که با همان حساب کاربری ویندوز اجرا شود هم می‌تواند مهر را دوباره بزند؛ این «ضد دستکاری مطلق» نیست.

export const SEAL_KEYS = [
  "cafenet_sales", "cafenet_orders", "cafenet_ledger2", "cafenet_tx3", "cafenet_invoices", "cafenet_voided", "cafenet_customers",
  "cafenet_register_closings", "cafenet_payment_accounts", "cafenet_obligations", "cafenet_inventory",
];

export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const defaultRead = (k) => { try { return globalThis.localStorage.getItem(k); } catch { return null; } };
// طول هر مقدار هم وارد می‌شود تا «کلید=مقدار» و مرز مقدارها مبهم نباشد
export async function computeSealHash(read = defaultRead, keys = SEAL_KEYS) {
  return sha256Hex(keys.map((k) => { const v = read(k); return `${k}\u0000${v == null ? "-" : v.length}\u0000${v == null ? "" : v}`; }).join("\u0001"));
}

export function createSealer({ bridge, read = defaultRead, keys = SEAL_KEYS, intervalMs = 3000, onState = () => {}, timers = { setInterval: (f, ms) => globalThis.setInterval(f, ms), clearInterval: (i) => globalThis.clearInterval(i) }, listen = true } = {}) {
  let state = { status: "off" }; let lastHash = null; let iv = null; let busy = false;
  const set = (s) => { state = s; try { onState(state); } catch { /* ignore */ } };
  const usable = () => !!(bridge && bridge.seal && bridge.seal.verify && bridge.seal.set);

  async function sealNow() {
    const h = await computeSealHash(read, keys);
    if (h === lastHash) return false;
    const r = await bridge.seal.set(h); if (r && r.ok) lastHash = h; return !!(r && r.ok);
  }
  async function start() {
    if (!usable()) { set({ status: "off" }); return state; }
    try {
      const h = await computeSealHash(read, keys);
      const v = await bridge.seal.verify(h);
      if (v.status === "unavailable") { set({ status: "off", reason: "unavailable" }); return state; }
      if (v.status === "mismatch") { set({ status: "mismatch", sealedAt: v.sealedAt || null }); }   // مهر را بازنویسی نمی‌کنیم تا مالک ببیند و تأیید کند
      else { lastHash = v.status === "ok" ? h : null; if (v.status === "none") await sealNow(); set({ status: "ok", firstSeal: v.status === "none" }); }
    } catch { set({ status: "off", reason: "error" }); return state; }
    if (state.status === "ok") begin();
    return state;
  }
  function begin() {
    if (iv) return;
    const tick = async () => { if (busy || state.status !== "ok") return; busy = true; try { await sealNow(); } catch { /* ignore */ } finally { busy = false; } };
    iv = timers.setInterval(tick, intervalMs);
    if (listen && typeof document !== "undefined") {
      const flush = () => { if (document.visibilityState === "hidden") tick(); };
      document.addEventListener("visibilitychange", flush); if (typeof window !== "undefined") window.addEventListener("pagehide", tick);
    }
  }
  // مالک وضعیت فعلی را پذیرفت: مهر با داده‌های فعلی دوباره زده می‌شود
  async function accept() {
    if (!usable()) return false; lastHash = null;
    const ok = await sealNow(); if (ok) { set({ status: "ok", accepted: true }); begin(); } return ok;
  }
  const stop = () => { if (iv) timers.clearInterval(iv); iv = null; };
  return { start, accept, stop, state: () => state, sealNow };
}
