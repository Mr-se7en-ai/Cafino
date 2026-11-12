import { getBridge, call } from "./deviceManager.js";
const need = () => { const b = getBridge(); if (!b || !b.printer) throw new Error("چاپ مستقیم فقط در نسخهٔ ویندوز کار می‌کند"); return b.printer; };

export async function getPrinters() { return call(need().getPrinters, {}); }
// file: File | { name, bytes } ؛ pages = تعداد صفحهٔ فایل؛ نتیجه: { requested, done, failed, status, assumed, error? }
export async function printFile({ printer, file, pages, copies = 1, color = false, pageRange = "" }) {
  const bytes = file && file.bytes ? file.bytes : new Uint8Array(await file.arrayBuffer());
  return call(need().print, { printer, fileName: file.name, bytes, pages, copies, color, pageRange });
}
export async function readCounter(ip, community = "public") { return call(need().readCounter, { ip, community }); }
