// ابزارهای PDF/تصویر: هم Web Worker (خارج از رشتهٔ اصلی) و هم ماژول رشتهٔ اصلی (جایگزین وقتی Worker ممکن نیست، مثلاً نسخهٔ تک‌فایلی).
import { runOp } from "../uploads/pdf/pdfOps.js";
const isWorker = typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;
if (isWorker) {
  self.onmessage = async (e) => {
    const { id, op, args } = e.data || {};
    try {
      const res = await runOp(op, args, (p) => self.postMessage({ id, progress: p }));
      const transfer = [];
      if (res?.bytes?.buffer) transfer.push(res.bytes.buffer);
      for (const f of res?.files || []) if (f.bytes?.buffer) transfer.push(f.bytes.buffer);
      self.postMessage({ id, ok: true, result: res }, transfer);
    } catch (err) { self.postMessage({ id, ok: false, error: String((err && err.message) || err), code: err && err.code }); }
  };
} else {
  (globalThis.__cfVendor ||= {}).pdftools = { runOp };
}
