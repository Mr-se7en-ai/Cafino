// لوگوی اپراتورهای شارژ و اینترنت.
// لوگوی رسمی اپراتورها علامت تجاری خودشان است و همراه برنامه نیست؛ کاربر فایل رسمی هر اپراتور را بارگذاری می‌کند
// (یا مدیر سرور در config.js با operatorLogos آدرس می‌دهد). تا آن زمان یک نشان ساده با حرف اول نام نمایش داده می‌شود.
import { lsRead, lsWrite } from "./sales.jsx";

export const OPERATOR_LOGOS_KEY = "cafenet_operator_logos";
export const OPERATOR_LOGO_EVENT = "cafenet-operator-logos";
export const OPERATOR_LOGO_MAX_INPUT = 600 * 1024;     // حجم فایل انتخابی
export const OPERATOR_LOGO_MAX_STORED = 160 * 1024;    // حجم ذخیره‌شده (data:)
export const OPERATOR_LOGO_PX = 192;                   // بزرگ‌ترین ضلع پس از کوچک‌سازی

// key: شناسهٔ ثابت · name: نام نمایشی (همان مقدار فیلد operator در کاتالوگ) · alias: نام‌های دیگر برای تشخیص · color: رنگ نشان جایگزین (انتخاب خودمان؛ لوگو نیست)
export const OPERATORS = Object.freeze([
  { key: "mci", name: "همراه اول", alias: ["همراه اول", "همراه‌اول", "mci", "hamrah", "mobile communication"], color: "#0891b2" },
  { key: "irancell", name: "ایرانسل", alias: ["ایرانسل", "irancell", "mtn"], color: "#d97706" },
  { key: "rightel", name: "رایتل", alias: ["رایتل", "rightel"], color: "#7c3aed" },
  { key: "shatel", name: "شاتل موبایل", alias: ["شاتل موبایل", "شاتل", "shatel"], color: "#16a34a" },
  { key: "aptel", name: "آپتل", alias: ["آپتل", "اپتل", "aptel"], color: "#2563eb" },
  { key: "samantel", name: "سامانتل", alias: ["سامانتل", "سامان تل", "samantel"], color: "#db2777" },
  { key: "lotus", name: "لوتوس‌تل", alias: ["لوتوس تل", "لوتوس‌تل", "لوتوس", "lotus"], color: "#0d9488" },
  { key: "anarestan", name: "انارستان", alias: ["انارستان", "anarestan"], color: "#dc2626" },
  { key: "azartel", name: "آذرتل", alias: ["آذرتل", "آذر تل", "azartel"], color: "#4f46e5" },
  { key: "other", name: "سایر", alias: ["سایر", "other"], color: "#64748b" },
]);
export const OPERATOR_NAMES = OPERATORS.map((o) => o.name);

const norm = (s) => String(s == null ? "" : s).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[‌‏‎ \s]+/g, " ").trim().toLowerCase();
const INDEX = new Map(); OPERATORS.forEach((o) => o.alias.concat(o.name).forEach((a) => INDEX.set(norm(a), o.key)));

/** نام اپراتور (هر املایی) → شناسهٔ ثابت؛ ناشناخته = "other" */
export function operatorKey(name) {
  const n = norm(name); if (!n) return "other";
  if (INDEX.has(n)) return INDEX.get(n);
  for (const [a, k] of INDEX) if (a.length > 2 && n.includes(a) && k !== "other") return k;
  return "other";
}
export const operatorInfo = (name) => OPERATORS.find((o) => o.key === operatorKey(name)) || OPERATORS[OPERATORS.length - 1];

const SAFE_DATA = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const SAFE_URL = /^(?:(?!.*\/\/)(?:\.\.?\/)?[A-Za-z0-9_\-][A-Za-z0-9_\-./]*\.(?:png|jpe?g|webp|svg)|https:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|svg))(?:\?[^\s"'<>]*)?$/i;

export function getStoredOperatorLogos() {
  const m = lsRead(OPERATOR_LOGOS_KEY, {}); const out = {};
  if (m && typeof m === "object") for (const o of OPERATORS) if (typeof m[o.key] === "string" && SAFE_DATA.test(m[o.key])) out[o.key] = m[o.key];
  return out;
}
export function getConfigOperatorLogos() {
  try {
    const c = typeof window !== "undefined" && window.CAFINO_CONFIG && window.CAFINO_CONFIG.operatorLogos; const out = {};
    if (c && typeof c === "object") for (const o of OPERATORS) { const u = typeof c[o.key] === "string" ? c[o.key].trim() : ""; if (u && SAFE_URL.test(u)) out[o.key] = u; }
    return out;
  } catch { return {}; }
}
/** منبع نهایی لوگو: بارگذاری کاربر ← config.js ← بدون لوگو ("") */
export function operatorLogoSrc(name, stored = getStoredOperatorLogos(), cfg = getConfigOperatorLogos()) {
  const k = operatorKey(name); return stored[k] || cfg[k] || "";
}
export function operatorLogoSource(key) { // "user" | "config" | "none"
  if (getStoredOperatorLogos()[key]) return "user"; return getConfigOperatorLogos()[key] ? "config" : "none";
}
const emit = () => { try { window.dispatchEvent(new Event(OPERATOR_LOGO_EVENT)); } catch { /* بدون DOM */ } };
export function setOperatorLogo(key, dataUrl) {
  if (!OPERATORS.some((o) => o.key === key)) throw new Error("اپراتور ناشناخته");
  if (!SAFE_DATA.test(String(dataUrl))) throw new Error("فرمت تصویر پذیرفته نمی‌شود (PNG، JPG، WebP یا SVG)");
  if (dataUrl.length > OPERATOR_LOGO_MAX_STORED * 1.4) throw new Error("حجم لوگو زیاد است");
  const m = getStoredOperatorLogos(); m[key] = dataUrl; lsWrite(OPERATOR_LOGOS_KEY, m); emit();
}
export function removeOperatorLogo(key) { const m = getStoredOperatorLogos(); delete m[key]; lsWrite(OPERATOR_LOGOS_KEY, m); emit(); }

/** فایل تصویر → data: امن و کوچک (رستر: بوم با حفظ شفافیت؛ SVG بدون تغییر ولی با سقف حجم) */
export async function fileToLogoDataUrl(file) {
  if (!file) throw new Error("فایلی انتخاب نشد");
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type) && !/\.(png|jpe?g|webp|svg)$/i.test(file.name || "")) throw new Error("فقط PNG، JPG، WebP یا SVG پذیرفته می‌شود");
  if (file.size > OPERATOR_LOGO_MAX_INPUT) throw new Error("حجم فایل بیشتر از ۶۰۰ کیلوبایت است");
  const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("خواندن فایل ممکن نشد")); r.readAsDataURL(file); });
  let url = String(raw);
  const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name || "");
  if (isSvg) {
    url = url.replace(/^data:[^;,]*/, "data:image/svg+xml");
    if (url.length > OPERATOR_LOGO_MAX_STORED * 1.4) throw new Error("حجم SVG زیاد است");
    return url;
  }
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("تصویر قابل خواندن نیست")); i.src = url; });
  const k = Math.min(1, OPERATOR_LOGO_PX / Math.max(img.width, img.height, 1));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const out = c.toDataURL("image/png");
  if (out.length > OPERATOR_LOGO_MAX_STORED * 1.4) throw new Error("حجم لوگو پس از کوچک‌سازی هم زیاد است");
  return out;
}
