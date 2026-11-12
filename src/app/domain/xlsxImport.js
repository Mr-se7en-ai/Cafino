// ورودی Excel برنامه: اول بازرسی ظرف (رشتهٔ اصلی، ارزان)، بعد خواندن در Web Worker با مهلت؛ اگر Worker در این محیط ممکن نبود
// (نسخهٔ تک‌فایلی/file://) همان خواندنِ محدودشده در رشتهٔ اصلی انجام می‌شود.
import { inspectContainer, readSheetsSafe, XLSX_LIMITS } from "./xlsxSafe.js";
import { loadVendor, vendorUrl } from "../../vendor/loader.js";

export const XLSX_WORKER_TIMEOUT_MS = 20000;
function runWorker(url, buf, timeoutMs) {
  return new Promise((resolve, reject) => {
    let w; try { w = new Worker(url); } catch (e) { reject(Object.assign(new Error("worker_unavailable"), { unavailable: true })); return; }
    let started = false;
    const done = (fn, v) => { clearTimeout(tm); try { w.terminate(); } catch { /* ignore */ } fn(v); };
    const tm = setTimeout(() => done(reject, Object.assign(new Error("زمان خواندن فایل بیش از حد طول کشید؛ فایل رد شد."), { code: "xlsx_rejected" })), timeoutMs);
    w.onmessage = (e) => { started = true; const d = e.data || {}; if (d.ok) done(resolve, d); else done(reject, Object.assign(new Error(d.error || "خواندن فایل ممکن نشد."), { code: "xlsx_rejected" })); };
    w.onerror = () => done(reject, started ? new Error("خطا در خواندن فایل") : Object.assign(new Error("worker_unavailable"), { unavailable: true }));
    const copy = buf.slice(0); w.postMessage({ buf: copy.buffer }, [copy.buffer]);
  });
}
export async function importWorkbookSheets(arrayBuffer, { timeoutMs = XLSX_WORKER_TIMEOUT_MS } = {}) {
  const u8 = new Uint8Array(arrayBuffer);
  inspectContainer(u8, XLSX_LIMITS);
  const url = vendorUrl("xlsxworker");
  if (url && typeof Worker !== "undefined") {
    try { return (await runWorker(url, u8, timeoutMs)).sheets; }
    catch (e) { if (!(e && e.unavailable)) throw e; }
  }
  const XLSX = await loadVendor("xlsx");
  return readSheetsSafe(XLSX, u8, XLSX_LIMITS).sheets;
}
