// لایهٔ رندرر برای دستگاه‌های ویندوز. برنامه فقط این API را می‌بیند: window.cafenetNative.{printer,scanner}.
// در مرورگر/PWA (بدون ویندوز) native=false است و «مرکز چاپ و اسکن» در حالت ثبت دستی کار می‌کند.
let injected = null;
export const setBridge = (b) => { injected = b; };               // برای تست
export const getBridge = () => injected || (typeof window !== "undefined" ? window.cafenetNative : null) || null;
const clean = (e) => { const m = String((e && e.message) || e || ""); return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "خطای نامشخص دستگاه"; };
export async function call(fn, ...args) { try { return await fn(...args); } catch (e) { throw new Error(clean(e)); } }

export async function capabilities() {
  const b = getBridge();
  if (!b || !b.printer) return { native: false, platform: "web", printer: false, scanner: false, snmp: false };
  try { const c = b.capabilities ? await b.capabilities() : {}; return { native: true, platform: c.platform || b.platform || "unknown", printer: !!c.printer, scanner: !!c.scanner, snmp: !!c.snmp }; }
  catch { return { native: true, platform: b.platform || "unknown", printer: false, scanner: false, snmp: false }; }
}
