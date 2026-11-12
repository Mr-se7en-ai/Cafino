// «پوسته» (Skin) رابط کاربری کافینو: سه ظاهر کامل که در تنظیمات ← ظاهر عوض می‌شوند.
//  • metro   — ظاهر قبلی (کاشی‌های مترو، آبی، لایهٔ اختیاری Fluent)
//  • orange  — «تم نارنجی»: پس‌زمینهٔ کرم/قهوه‌ای تیره، منوی کناری قهوه‌ای، دکمه و برجسته‌سازی نارنجی، کارت‌های گرد و نرم
//  • liquid  — «تم لیکوید گلس»: سطوح شیشه‌ای با محو، نور لبه و شکست نور (ماده‌ی شیشه از Glasswork، MIT) روی پس‌زمینهٔ رنگی
// هر سه پوسته از حالت روشن/تیره پشتیبانی می‌کنند. انتخاب در localStorage ذخیره می‌شود.
import { ORANGE_CSS } from "./orangeCss.js";
import { LIQUID_CSS } from "./liquid/liquidCss.js";
import { applyLiquidVars, clearLiquidVars, getLiquid } from "./liquid/liquidSettings.js";
import { startLiquidLens, stopLiquidLens } from "./liquid/liquidLens.js";

export const SKIN_KEY = "cafino_skin";
export const SKINS = Object.freeze([
  { key: "metro", label: "تم مترو", hint: "ظاهر قبلی برنامه: کاشی‌های مترو، رنگ آبی و طراحی Fluent", swatch: ["#0f172a", "#2563eb", "#7c3aed"] },
  { key: "orange", label: "تم نارنجی", hint: "کارت‌های گرد و نرم، منوی کناری قهوه‌ای و رنگ نارنجی؛ در حالت روشن و تیره", swatch: ["#2b1a12", "#f97316", "#fdf6ee"] },
  { key: "liquid", label: "تم لیکوید گلس", hint: "سطوح شیشه‌ای با محو، نور لبه و شکست نور روی پس‌زمینهٔ رنگی؛ شکست نور لبه‌ها در کروم/اج و نسخهٔ دسکتاپ", swatch: ["#7aa7ff", "#c4a1ff", "#7ee8d6"] },
]);
const EVT = "cafino:skin";
let cur = null;

export function normalizeSkin(v) { return v === "orange" || v === "liquid" ? v : "metro"; }
export function getSkin() {
  if (cur) return cur;
  try { cur = normalizeSkin(localStorage.getItem(SKIN_KEY)); } catch { cur = "metro"; }
  return cur;
}

// حالت شیشه‌ای قدیمیِ تم مترو حذف شده است؛ کلیدهای ذخیره‌شدهٔ آن پاک می‌شوند.
function purgeLegacyGlass() { try { localStorage.removeItem("cafenet_glass"); localStorage.removeItem("cafenet_glass_transparency"); } catch { /* ignore */ } }

const styleEls = { orange: null, liquid: null };
function setStyle(name, css, on) {
  if (on && !styleEls[name]) { const el = document.createElement("style"); el.id = `cafino-skin-${name}`; el.textContent = css; document.head.appendChild(el); styleEls[name] = el; }
  if (!on && styleEls[name]) { styleEls[name].remove(); styleEls[name] = null; }
}
export function applySkin(s = getSkin()) {
  cur = normalizeSkin(s);
  if (typeof document === "undefined") return cur;
  const b = document.body;
  if (!b || !b.classList) return cur;
  setStyle("orange", ORANGE_CSS, cur === "orange");
  b.classList.toggle("skin-orange", cur === "orange");
  setStyle("liquid", LIQUID_CSS, cur === "liquid");
  b.classList.toggle("skin-liquid", cur === "liquid");
  if (cur === "liquid") { applyLiquidVars(); startLiquidLens({ enabled: getLiquid().lens }); }
  else { clearLiquidVars(); stopLiquidLens(); }
  return cur;
}

export function setSkin(s) {
  const next = normalizeSkin(s);
  try { localStorage.setItem(SKIN_KEY, next); } catch { /* ignore */ }
  applySkin(next);
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: next })); } catch { /* ignore */ }
  return next;
}
export function onSkinChange(fn) {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
}
export function initSkin() { purgeLegacyGlass(); try { return applySkin(getSkin()); } catch { return "metro"; } }

// متغیرهای رنگی پوسته‌ی نارنجی (جایگزین themeVars برای حالت روشن/تیره)
export function orangeThemeVars(theme) {
  return theme === "light" ? {
    "--bg-app": "#fdf6ee", "--bg-card": "#ffffff", "--border": "#f0e1d3",
    "--text-primary": "#2b1a12", "--text-secondary": "#6b5242", "--text-muted": "#85705f", "--text-dim": "#b3a090",
    "--accent-light": "#d9560f", "--text-light": "#4a3528",
    "--header-grad-1": "#fa8a2b", "--header-grad-2": "#e8590c", "--header-border": "#e8590c33",
  } : {
    "--bg-app": "#1a120d", "--bg-card": "#251a13", "--border": "#3a2a1f",
    "--text-primary": "#f6eadf", "--text-secondary": "#cdb7a5", "--text-muted": "#a08a79", "--text-dim": "#6f5b4d",
    "--accent-light": "#ffa05a", "--text-light": "#e3cfbf",
    "--header-grad-1": "#c2540f", "--header-grad-2": "#7c2d12", "--header-border": "#fb923c33",
  };
}

// متغیرهای رنگی «تم لیکوید گلس»: رنگ‌های متنی/کارت به‌علاوهٔ پارامترهای ماده‌ی شیشه و رنگ‌های پس‌زمینه (والپیپر)
export function liquidThemeVars(theme) {
  const common = { "--lq-sat": "1.7", "--lq-catch-a": "1", "--lq-catch-b": ".55" };
  return theme === "light" ? {
    ...common,
    "--bg-app": "#dde7fb", "--bg-card": "#f2f6ff", "--border": "rgba(110,130,185,.28)",
    "--text-primary": "#0b1226", "--text-secondary": "#2d3b57", "--text-muted": "#4b5b78", "--text-dim": "#74829c",
    "--accent-light": "#1d4ed8", "--text-light": "#1e293b",
    "--header-grad-1": "#6ea0ff", "--header-grad-2": "#8b8bff", "--header-border": "rgba(255,255,255,.4)",
    "--lq-tint": "255 255 255", "--lq-a-card": ".46", "--lq-a-nested": ".30", "--lq-a-chrome": ".52", "--lq-tile-a1": "34%", "--lq-tile-a2": "13%", "--lq-tile-ink": "#0f172a", "--lq-kpi-pct": "52%",
    "--lq-bri": "1.06", "--lq-edge": "rgba(255,255,255,.62)", "--lq-hair": ".10", "--lq-shadow": ".10", "--lq-bevel-a": ".5",
    "--lq-field": "rgba(255,255,255,.62)", "--lq-card-fallback": "rgba(242,246,255,.86)", "--lq-chrome-fallback": "rgba(242,246,255,.80)",
    "--lq-w1": "#9ec2ff", "--lq-w2": "#d2b8ff", "--lq-w3": "#8fe9d8", "--lq-w4": "#ffc2d8",
    "--lq-o1": "#ffd27a", "--lq-o2": "#7aa9ff", "--lq-o3": "#ff9fc4",
  } : {
    ...common,
    "--bg-app": "#080d1c", "--bg-card": "#151c30", "--border": "rgba(255,255,255,.14)",
    "--text-primary": "#f3f6ff", "--text-secondary": "#c6d0e8", "--text-muted": "#9eabc8", "--text-dim": "#6f7e9f",
    "--accent-light": "#8ab8ff", "--text-light": "#dde6fa",
    "--header-grad-1": "#2a3a78", "--header-grad-2": "#4a2f86", "--header-border": "rgba(255,255,255,.14)",
    "--lq-tint": "22 28 46", "--lq-a-card": ".52", "--lq-a-nested": ".36", "--lq-a-chrome": ".58", "--lq-tile-a1": "58%", "--lq-tile-a2": "22%", "--lq-tile-ink": "#ffffff", "--lq-kpi-pct": "100%",
    "--lq-bri": ".86", "--lq-edge": "rgba(255,255,255,.16)", "--lq-hair": ".30", "--lq-shadow": ".30", "--lq-bevel-a": ".16",
    "--lq-field": "rgba(255,255,255,.08)", "--lq-card-fallback": "rgba(21,28,48,.90)", "--lq-chrome-fallback": "rgba(21,28,48,.86)",
    "--lq-w1": "#1e40af", "--lq-w2": "#6d28d9", "--lq-w3": "#0f766e", "--lq-w4": "#9d174d",
    "--lq-o1": "#7c3aed", "--lq-o2": "#2563eb", "--lq-o3": "#db2777",
  };
}
