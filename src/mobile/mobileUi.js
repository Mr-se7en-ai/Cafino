// لایهٔ «رابط موبایل» کافینو (شبیه اپ اندرویدی، Material 3):
//  ۱) ردیف دکمه‌ها هم‌تراز می‌شوند: ۲ تا ۴ دکمه → شبکهٔ دو‌ستونه با دکمه‌های هم‌اندازه؛ ۵ دکمه یا بیشتر → یک ردیف چیپ قابل اسکرول افقی.
//  ۲) دکمه‌های متنی بدون آیکن، از روی جدول BUTTON_ICON_RULES یک آیکن خطی هم‌سبک می‌گیرند (با CSS mask؛ بدون دست‌زدن به DOM مدیریت‌شدهٔ React).
//  ۳) فقط روی موبایل (کلاس body.m-ui) فعال است و روی هر سه تم کار می‌کند.
// توسعه: برای آیکن دکمه‌های تازه فقط یک سطر به BUTTON_ICON_RULES اضافه کنید؛ برای کنار گذاشتن یک ردیف/دکمه، صفت data-no-m را بگذارید.

// [الگو روی متن بدون ZWNJ/ایموجی، نام آیکن در components/Icon.jsx] — اولین تطبیق برنده است.
export const BUTTON_ICON_RULES = [
  [/اکسل|csv/i, "FileSpreadsheet"],
  [/pdf|پی‌?دی‌?اف/i, "FileText"],
  [/چاپ|پرینت/, "Printer"],
  [/خروجی|دانلود|ذخیره‌?\s*فایل/, "Download"],
  [/ورود\s*(از|فایل)|بارگذاری|آپلود|وارد\s*کردن|بازیابی/, "Upload"],
  [/پشتیبان/, "Save"],
  [/حذف|پاک\s*کردن/, "Trash2"],
  [/ابطال|لغو\s*سند/, "Ban"],
  [/ویرایش|تغییر\s*نام/, "Pencil"],
  [/انصراف|لغو|بستن|بیخیال/, "X"],
  [/بازگشت|برگشت/, "ArrowRight"],
  [/به‌?روز\s*رسانی|همگام|بارگیری\s*مجدد|تلاش\s*مجدد/, "RefreshCw"],
  [/جستجو|بیاب/, "Search"],
  [/ارسال/, "Send"],
  [/پیش‌?نمایش|مشاهده|جزئیات/, "Eye"],
  [/کپی/, "Copy"],
  [/فیلتر/, "Filter"],
  [/ذخیره/, "Save"],
  [/تأیید|تایید|ثبت\s*(نهایی)?$|اعمال/, "Check"],
  [/افزودن|اضافه|ایجاد|جدید|ثبت/, "Plus"],
];
const LEAD_SYMBOL = /^[\s‌]*[\p{Extended_Pictographic}☀-➿←-⇿+＋\-–—•✓✔✕✖×↵↻⚙]/u;
const norm = (t) => String(t || "").replace(/[‌‏‎]/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim();

/** نام آیکن مناسب برای متن یک دکمه، یا null (متن‌های خالی/بلند/دارای نماد آغازین آیکن نمی‌گیرند). */
export function iconForLabel(text) {
  const t = norm(text);
  if (!t || t.length > 26 || LEAD_SYMBOL.test(t)) return null;
  for (const [re, name] of BUTTON_ICON_RULES) if (re.test(t)) return name;
  return null;
}

const SCOPE = "body.m-ui";
// ردیفِ فقط-دکمهٔ چندخطی (flex-wrap) که بیرون از نوار ناوبری/پنجره‌ها/ماشین‌حساب و دستیار صوتی است
const ROW = `${SCOPE} div[style*="flex-wrap: wrap"]:has(> button):not(:has(> :not(button))):not(:has(> button[data-no-m])):not(nav *):not(aside *):not(.va-panel *):not([data-no-m]):not([data-no-m] *)`;

export const MOBILE_UI_CSS = `
/* ── ردیف ۲ تا ۴ دکمه: شبکهٔ دو‌ستونهٔ هم‌اندازه ── */
${ROW}{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;align-items:stretch}
${ROW} > button{width:auto!important;min-width:0!important;min-height:44px;justify-content:center;text-align:center;border-radius:12px!important;white-space:normal;line-height:1.5}
${ROW} > button:last-child:nth-child(odd){grid-column:1/-1}
/* ── ردیف ۵ دکمه یا بیشتر (فیلتر/دسته‌ها): یک ردیف چیپ قابل اسکرول افقی ── */
${ROW}:has(> button:nth-child(5)){display:flex!important;flex-wrap:nowrap!important;overflow-x:auto;overflow-y:hidden;gap:8px!important;padding:2px 2px 6px;margin-inline:-2px;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}
${ROW}:has(> button:nth-child(5))::-webkit-scrollbar{display:none}
${ROW}:has(> button:nth-child(5)) > button{flex:0 0 auto!important;min-height:38px;border-radius:19px!important;white-space:nowrap;scroll-snap-align:start;padding-inline:14px!important}
${ROW}:has(> button:nth-child(5)) > button:last-child:nth-child(odd){grid-column:auto}
/* ── آیکن دکمه‌ها (mask: رنگ آیکن = رنگ متن دکمه) ── */
${SCOPE} button[data-mi]{display:inline-flex;align-items:center;justify-content:center;gap:6px}
${SCOPE} button[data-mi]::before{content:"";flex:0 0 18px;width:18px;height:18px;background-color:currentColor;-webkit-mask:var(--mi) center/contain no-repeat;mask:var(--mi) center/contain no-repeat}
/* ── لمس راحت‌تر برای دکمه‌های آیکن‌دار ── */
${SCOPE} button[data-mi]{min-height:40px}
/* ── نوار پایین: قرص فعال Material 3 ── */
${SCOPE} nav.m-bottom-nav button{-webkit-tap-highlight-color:transparent;transition:color .18s ease}
${SCOPE} nav.m-bottom-nav .m-pill{transition:background-color .2s ease,transform .2s ease}
${SCOPE} nav.m-bottom-nav button:active .m-pill{transform:scale(.92)}
@media (prefers-reduced-motion:reduce){${SCOPE} nav.m-bottom-nav *{transition:none!important}}
`;

// ───────── اجرا (فقط مرورگر) ─────────
const svgCache = new Map();
async function svgDataUri(name) {
  if (svgCache.has(name)) return svgCache.get(name);
  const [{ default: React }, { createRoot }, { flushSync }, { ICONS }] = await Promise.all([import("react"), import("react-dom/client"), import("react-dom"), import("../components/Icon.jsx")]);
  const C = ICONS[name]; if (!C) { svgCache.set(name, null); return null; }
  const host = document.createElement("div"); const root = createRoot(host);
  flushSync(() => root.render(React.createElement(C, { size: 24, strokeWidth: 2 })));
  let svg = host.innerHTML; root.unmount();
  svg = svg.replace(/(<svg[^>]*?)\s*(class|style)="[^"]*"/g, "$1").replace("<svg", "<svg xmlns='http://www.w3.org/2000/svg'");
  const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  svgCache.set(name, uri); return uri;
}

let started = null;
/** فعال‌سازی لایهٔ موبایل: کلاس body، CSS، و برچسب‌گذاری دکمه‌ها. تابع توقف برمی‌گرداند. */
export function startMobileUi() {
  if (typeof document === "undefined") return () => {};
  if (started) return started;
  document.body.classList.add("m-ui");
  const style = document.createElement("style"); style.id = "cafino-mobile-ui"; style.textContent = MOBILE_UI_CSS; document.head.appendChild(style);
  const vars = document.createElement("style"); vars.id = "cafino-mobile-icons"; document.head.appendChild(vars);
  const known = new Set();
  const tag = async (btn) => {
    if (btn.dataset.mi !== undefined || btn.hasAttribute("data-no-m") || btn.querySelector("svg") || btn.closest("nav,aside,.va-panel")) return;
    const name = iconForLabel(btn.textContent); if (!name) return;
    if (!known.has(name)) { known.add(name); const uri = await svgDataUri(name); if (uri) vars.textContent += `${SCOPE} button[data-mi="${name}"]{--mi:${uri}}\n`; }
    btn.dataset.mi = name;
  };
  let queued = false;
  const scan = () => { queued = false; document.querySelectorAll("button:not([data-mi])").forEach((b) => { void tag(b); }); };
  const schedule = () => { if (!queued) { queued = true; (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(scan); } };
  const mo = new MutationObserver(schedule); mo.observe(document.body, { childList: true, subtree: true });
  schedule();
  started = () => { mo.disconnect(); style.remove(); vars.remove(); document.body.classList.remove("m-ui"); document.querySelectorAll("button[data-mi]").forEach((b) => b.removeAttribute("data-mi")); started = null; };
  return started;
}
