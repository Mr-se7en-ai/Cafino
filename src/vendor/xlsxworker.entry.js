// Web Worker: خواندن Excel خارج از رشتهٔ اصلی (قفل‌شدن/ReDoS فقط worker را درگیر می‌کند و با terminate قطع می‌شود؛ pollution هم در global همین worker می‌ماند)
import * as XLSX from "xlsx";
import { readSheetsSafe } from "../app/domain/xlsxSafe.js";
self.onmessage = (e) => {
  try { self.postMessage({ ok: true, ...readSheetsSafe(XLSX, new Uint8Array(e.data.buf)) }); }
  catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err), rejected: !!(err && err.code === "xlsx_rejected") }); }
};
