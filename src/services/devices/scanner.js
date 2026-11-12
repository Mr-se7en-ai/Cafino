import { getBridge, call } from "./deviceManager.js";
const need = () => { const b = getBridge(); if (!b || !b.scanner) throw new Error("اسکن مستقیم فقط در نسخهٔ ویندوز کار می‌کند"); return b.scanner; };

export async function getScanners() { return call(need().getScanners, {}); }
// نتیجه: { scanner, files:[مسیر], count, dir, partialError? }
export async function scan({ scannerId, dpi = 200, color = "color", source = "flatbed", maxPages = 50 }) { return call(need().scan, { scannerId, dpi, color, source, maxPages }); }
export async function showFile(path) { return call(need().showFile, path); }
