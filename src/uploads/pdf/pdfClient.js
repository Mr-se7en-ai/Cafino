// اجرای ابزارهای PDF/تصویر خارج از رشتهٔ اصلی: برای هر کار یک Web Worker (vendor-pdftools) ساخته و پس از پایان terminate می‌شود.
// اگر Worker ساخته نشد (مثلاً مرورگر قدیمی) همان کد در رشتهٔ اصلی اجرا می‌شود؛ نتیجه یکسان است، فقط ممکن است رابط لحظه‌ای کند شود.
import { loadVendor, vendorUrl } from "../../vendor/loader.js";

let seq = 0;
/** ساخت Worker از chunk: نشانی فایل (نصب عادی/PWA/Electron) یا متن جاسازی‌شده (نسخهٔ تک‌فایلی) از راه Blob. null اگر ممکن نباشد. */
export function makeVendorWorker(name) {
  try {
    if (typeof Worker === "undefined") return null;
    const url = vendorUrl(name);
    if (url) return new Worker(url);
    const el = typeof document !== "undefined" && document.getElementById("cf-chunk-" + name);
    if (el) return new Worker(URL.createObjectURL(new Blob([el.textContent], { type: "text/javascript" })));
  } catch { /* ادامه با جایگزین */ }
  return null;
}

/** op: نام عملیات در pdfOps؛ args: ورودی‌ها (Uint8Array ها کپی می‌شوند تا نسخهٔ اصلی در رابط معتبر بماند). */
export function runPdfOp(op, args, { onProgress, timeoutMs = 180000, forceMain = false } = {}) {
  const id = ++seq;
  const w = forceMain ? null : makeVendorWorker("pdftools");
  if (!w) {
    return loadVendor("pdftools").then((m) => m.runOp(op, args, onProgress));
  }
  return new Promise((resolve, reject) => {
    const done = (fn, v) => { clearTimeout(t); try { w.terminate(); } catch { /* ignore */ } fn(v); };
    const t = setTimeout(() => done(reject, new Error("پردازش بیش از حد طول کشید و متوقف شد")), timeoutMs);
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.id !== id) return;
      if (m.progress !== undefined) { onProgress?.(m.progress); return; }
      if (m.ok) done(resolve, m.result); else { const er = new Error(m.error || "پردازش ناموفق بود"); er.code = m.code; done(reject, er); }
    };
    w.onerror = (e) => done(reject, new Error(e?.message ? `خطای پردازش: ${e.message}` : "پردازشگر PDF بارگذاری نشد"));
    // کپی قابل‌انتقال از بافرها
    const transfer = [];
    const copy = (v) => {
      if (v instanceof Uint8Array) { const c = v.slice(); transfer.push(c.buffer); return c; }
      if (Array.isArray(v)) return v.map(copy);
      if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = copy(x); return o; }
      return v;
    };
    w.postMessage({ id, op, args: copy(args) }, transfer);
  });
}
