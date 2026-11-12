// تنظیمات «تم لیکوید گلس»: شفافیت، میزان محو و شکست نور لبه‌ها. در localStorage ذخیره می‌شود و روی <body> متغیر CSS می‌گذارد.
export const LIQUID_KEY = "cafino_liquid";
export const LIQUID_DEFAULTS = Object.freeze({ transparency: 40, blur: 14, lens: true });
const clamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, Math.round(n))) : d; };

export function normalizeLiquid(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    transparency: clamp(r.transparency, 0, 100, LIQUID_DEFAULTS.transparency),
    blur: clamp(r.blur, 4, 32, LIQUID_DEFAULTS.blur),
    lens: r.lens === undefined ? LIQUID_DEFAULTS.lens : !!r.lens,
  };
}
export function getLiquid() {
  try { return normalizeLiquid(JSON.parse(localStorage.getItem(LIQUID_KEY) || "null")); } catch { return { ...LIQUID_DEFAULTS }; }
}
// شفافیت ۰..۱۰۰٪ ← ضریب غلظت رنگ شیشه (۱٫۵ تا ۰٫۲). ۴۰٪ ≈ ۱٫۰ یعنی مقدار طراحی‌شده.
export const tintFactor = (transparency) => +(1.5 - (clamp(transparency, 0, 100, 40) / 100) * 1.3).toFixed(3);
export function liquidCssVars(s) {
  const v = normalizeLiquid(s);
  return { "--lq-k": String(tintFactor(v.transparency)), "--lq-blur": `${v.blur}px` };
}
export function applyLiquidVars(s = getLiquid()) {
  if (typeof document === "undefined" || !document.body || !document.body.style) return;
  for (const [k, val] of Object.entries(liquidCssVars(s))) document.body.style.setProperty(k, val);
}
export function clearLiquidVars() {
  if (typeof document === "undefined" || !document.body || !document.body.style) return;
  for (const k of Object.keys(liquidCssVars())) document.body.style.removeProperty(k);
}
export function saveLiquid(patch) {
  const next = normalizeLiquid({ ...getLiquid(), ...patch });
  try { localStorage.setItem(LIQUID_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  applyLiquidVars(next);
  try { window.dispatchEvent(new CustomEvent("cafino:liquid", { detail: next })); } catch { /* ignore */ }
  return next;
}
