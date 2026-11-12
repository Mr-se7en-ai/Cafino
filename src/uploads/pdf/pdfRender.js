// نمایش و رندر PDF با pdf.js (Worker جدا). همهٔ خروجی‌ها کانواس/JPEG است؛ پردازش سنگین در Worker خود pdf.js انجام می‌شود.
import { loadVendor } from "../../vendor/loader.js";
import { makeVendorWorker } from "./pdfClient.js";

let libP = null;
async function lib() {
  if (!libP) libP = loadVendor("pdfjs").then((pdfjs) => {
    const w = makeVendorWorker("pdfjsworker");
    if (!w) throw new Error("پردازشگر نمایش PDF در این نسخه/مرورگر در دسترس نیست");
    pdfjs.GlobalWorkerOptions.workerPort = w;
    return pdfjs;
  }).catch((e) => { libP = null; throw e; });
  return libP;
}

/** PDF را باز می‌کند. خروجی: {numPages, renderPage(n, canvas, {width|scale}), pageSize(n), destroy()} */
export async function openPdf(bytes) {
  const pdfjs = await lib();
  let doc;
  try { doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useWorkerFetch: false, disableFontFace: false }).promise; }
  catch (e) { throw new Error(e?.name === "PasswordException" ? "این PDF رمزدار است" : "PDF خوانده نشد (خراب یا پشتیبانی‌نشده)"); }
  const cache = new Map();
  const page = async (n) => { if (!cache.has(n)) cache.set(n, await doc.getPage(n)); return cache.get(n); };
  return {
    numPages: doc.numPages,
    async pageSize(n) { const v = (await page(n)).getViewport({ scale: 1 }); return { width: v.width, height: v.height }; },
    /** روی canvas می‌کشد. width = عرض دلخواه به پیکسل CSS؛ dpr برای وضوح. */
    async renderPage(n, canvas, { width, scale, dpr = Math.min(2, globalThis.devicePixelRatio || 1) } = {}) {
      const p = await page(n), base = p.getViewport({ scale: 1 });
      const s = (scale ?? (width ? width / base.width : 1)) * dpr, vp = p.getViewport({ scale: s });
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      if (width || scale) { canvas.style.width = `${Math.round(vp.width / dpr)}px`; canvas.style.height = `${Math.round(vp.height / dpr)}px`; }
      const task = p.render({ canvasContext: canvas.getContext("2d"), viewport: vp, background: "#fff" });
      await task.promise;
      return { width: base.width, height: base.height };
    },
    destroy() { try { doc.destroy(); } catch { /* ignore */ } },
  };
}

/** همهٔ صفحه‌ها → JPEG (برای فشرده‌سازی قوی و پیش‌نمایش چاپ). dpi پایه ۷۲pt. */
export async function pdfToJpegPages(bytes, { dpi = 110, quality = 0.62, onProgress, signal } = {}) {
  const pdf = await openPdf(bytes), out = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      if (signal?.aborted) throw new Error("لغو شد");
      const { width, height } = await pdf.pageSize(n);
      const canvas = document.createElement("canvas");
      await pdf.renderPage(n, canvas, { scale: dpi / 72, dpr: 1 });
      const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("رمزگذاری تصویر ناموفق بود"))), "image/jpeg", quality));
      out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), wPt: width, hPt: height });
      canvas.width = canvas.height = 0;
      onProgress?.(n / pdf.numPages);
    }
  } finally { pdf.destroy(); }
  return out;
}
