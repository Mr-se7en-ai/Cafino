// طراحی Fluent (Microsoft Fluent Design) برای کافینو — بدون وابستگی به کتابخانهٔ خارجی.
// عناصر زبان طراحی: Acrylic (سطح شیشه‌ای با محو و بافت نویز)، Reveal (نور دنبال‌کنندهٔ اشاره‌گر روی دکمه‌ها و کاشی‌ها)،
// Depth (سایه‌های ارتفاعی)، Motion (منحنی‌های شتاب Fluent)، فوکوس دو‌خطی و فیلد متنی با خط تأکید پایین.
// همه‌چیز یک لایهٔ CSS است که با کلاس `fluent-ui` روی <body> فعال می‌شود؛ با خاموش‌کردنش ظاهر قبلی کامل برمی‌گردد.
import { getSkin } from "../skins/skin.js";
export const FLUENT_KEY = "cafenet_fluent";
export const FLUENT_DEFAULTS = Object.freeze({ on: true, acrylic: true, reveal: true });
const EVT = "cafino:fluent";

// یک تنظیم واحد: «طراحی Fluent» روشن/خاموش. اکریلیک و Reveal جزو همان طراحی‌اند و با آن روشن/خاموش می‌شوند
// (کلیدهای acrylic/reveal فقط برای سازگاری با دادهٔ قدیمی نگه داشته شده‌اند و همیشه با on برابرند).
export function normalizeFluent(v) {
  const o = v && typeof v === "object" ? v : {};
  const on = o.on !== false;
  return { on, acrylic: on, reveal: on };
}
export function getFluent() {
  try { return normalizeFluent(JSON.parse(localStorage.getItem(FLUENT_KEY) || "null")); } catch { return { ...FLUENT_DEFAULTS }; }
}

// ───────── لایهٔ CSS ─────────
// بافت نویز Acrylic (SVG کوچک درون‌خطی)
const NOISE = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .2 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export const FLUENT_CSS = `
body.fluent-ui{
  --fl-accent:#2f88ff;--fl-accent-2:#0f6cbd;--fl-focus:#fff;--fl-ease:cubic-bezier(.33,0,.67,1);--fl-decel:cubic-bezier(.1,.9,.2,1);
  --fl-reveal:rgba(255,255,255,.20);--fl-reveal-edge:rgba(255,255,255,.30);
  --fl-shadow4:0 0 2px rgba(0,0,0,.24),0 2px 4px rgba(0,0,0,.28);--fl-shadow8:0 0 2px rgba(0,0,0,.24),0 4px 8px rgba(0,0,0,.28);
  --fl-shadow16:0 0 2px rgba(0,0,0,.24),0 8px 16px rgba(0,0,0,.28);--fl-tint:rgba(30,41,59,.74);--fl-line:rgba(255,255,255,.08);
  --fl-mica-a:rgba(47,136,255,.16);--fl-mica-b:rgba(139,108,255,.12);
  accent-color:var(--fl-accent);
}
body.fluent-ui.fl-light{
  --fl-accent:#0f6cbd;--fl-accent-2:#115ea3;--fl-focus:#000;--fl-reveal:rgba(0,0,0,.07);--fl-reveal-edge:rgba(0,0,0,.14);
  --fl-shadow4:0 0 2px rgba(0,0,0,.12),0 2px 4px rgba(0,0,0,.14);--fl-shadow8:0 0 2px rgba(0,0,0,.12),0 4px 8px rgba(0,0,0,.14);
  --fl-shadow16:0 0 2px rgba(0,0,0,.12),0 8px 16px rgba(0,0,0,.14);--fl-tint:rgba(255,255,255,.72);--fl-line:rgba(0,0,0,.07);
  --fl-mica-a:rgba(15,108,189,.12);--fl-mica-b:rgba(139,108,255,.09);
}
/* Mica: پس‌زمینهٔ برنامه با لکه‌های نور ملایم */
body.fluent-ui .fl-root{background:radial-gradient(1100px 560px at 100% -8%,var(--fl-mica-a),transparent 62%),radial-gradient(900px 520px at -8% 108%,var(--fl-mica-b),transparent 58%),var(--bg-app)!important}
/* Acrylic: سطح کارت‌ها، منوی کناری، نوار پایین و پنجره‌های شناور */
/* عنصرهای دارای گرادیان (مثل دکمهٔ میکروفن دستیار که حلقه‌اش با var(--bg-card) ساخته شده) اکریلیک نمی‌شوند؛ وگرنه رنگ خودشان پوشانده می‌شود و آیکن سفید روی سطح روشن ناپدید می‌شود */
body.fluent-ui.fl-acrylic [style*="var(--bg-card)"]:not([style*="gradient"]):not([data-testid^="va-"]){
  background-color:var(--fl-tint)!important;background-image:${NOISE}!important;background-blend-mode:soft-light;
  border-color:var(--fl-line)!important;box-shadow:var(--fl-shadow4)}
/* محو پس‌زمینه یک «کادر شناور» (containing block) می‌سازد؛ پس فقط برای عنصرهایی که فرزند position:fixed ندارند (تا پنجره‌های شناور جابه‌جا نشوند) */
body.fluent-ui.fl-acrylic [style*="var(--bg-card)"]:not([style*="gradient"]):not([data-testid^="va-"]):not(:has([style*="position: fixed"])){-webkit-backdrop-filter:blur(22px) saturate(135%);backdrop-filter:blur(22px) saturate(135%)}
body.fluent-ui:not(.fl-acrylic) [style*="var(--bg-card)"]{box-shadow:var(--fl-shadow4);border-color:var(--fl-line)!important}
body.fluent-ui .fl-header{box-shadow:var(--fl-shadow8)}
body.fluent-ui.fl-acrylic .fl-header:not(:has([style*="position: fixed"])){-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%)}
body.fluent-ui aside.no-print{box-shadow:var(--fl-shadow16)}
/* فیلد متنی Fluent: لبهٔ نرم و خط تأکید پایین هنگام فوکوس */
body.fluent-ui input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),body.fluent-ui select,body.fluent-ui textarea{
  border-radius:4px!important;transition:border-color .15s var(--fl-ease),box-shadow .15s var(--fl-ease),background-color .15s var(--fl-ease)}
body.fluent-ui input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):hover,body.fluent-ui select:hover,body.fluent-ui textarea:hover{border-color:var(--fl-reveal-edge)!important}
body.fluent-ui input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):focus,body.fluent-ui select:focus,body.fluent-ui textarea:focus{
  outline:none!important;border-bottom-color:var(--fl-accent)!important;box-shadow:inset 0 -2px 0 var(--fl-accent)!important}
/* فوکوس صفحه‌کلید: حلقهٔ دوتایی Fluent */
body.fluent-ui :is(button,[role=button],a,[tabindex]):focus-visible{outline:2px solid var(--fl-focus)!important;outline-offset:2px!important;box-shadow:0 0 0 4px var(--fl-accent)!important}
/* Reveal: نور دنبال‌کنندهٔ اشاره‌گر */
body.fluent-ui.fl-reveal :is(button,[role=button],.dwt):not(:disabled){position:relative}
body.fluent-ui.fl-reveal :is(button,[role=button],.dwt):not(:disabled)::after{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .2s var(--fl-ease);
  background:radial-gradient(circle 90px at var(--fl-x,50%) var(--fl-y,50%),var(--fl-reveal),transparent 70%);
  box-shadow:inset 0 0 0 1px var(--fl-reveal-edge);-webkit-mask:none;z-index:2}
body.fluent-ui.fl-reveal :is(button,[role=button],.dwt):not(:disabled):hover::after{opacity:1}
/* حرکت */
body.fluent-ui .ui-page-enter{animation-timing-function:var(--fl-decel)!important;animation-duration:.3s!important}
@keyframes flTileIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
body.fluent-ui [data-widget]{animation:flTileIn .42s var(--fl-decel) backwards}
body.fluent-ui [data-widget]:nth-child(2){animation-delay:.04s}body.fluent-ui [data-widget]:nth-child(3){animation-delay:.08s}
body.fluent-ui [data-widget]:nth-child(4){animation-delay:.12s}body.fluent-ui [data-widget]:nth-child(5){animation-delay:.16s}
body.fluent-ui [data-widget]:nth-child(n+6){animation-delay:.2s}
body.fluent-ui .dwt{box-shadow:var(--fl-shadow4);transition:box-shadow .2s var(--fl-ease),filter .15s var(--fl-ease)}
body.fluent-ui .dwt:hover{box-shadow:var(--fl-shadow16);filter:brightness(1.06)}
body.fluent-ui button:not(:disabled){transition:transform .15s var(--fl-ease),filter .15s var(--fl-ease),box-shadow .15s var(--fl-ease),background-color .15s var(--fl-ease)}
/* نوار پیمایش باریک و روکشی */
body.fluent-ui *{scrollbar-width:thin;scrollbar-color:rgba(128,128,128,.45) transparent}
body.fluent-ui *::-webkit-scrollbar{width:10px;height:10px}
body.fluent-ui *::-webkit-scrollbar-thumb{background:rgba(128,128,128,.4);border-radius:6px;border:2px solid transparent;background-clip:content-box}
body.fluent-ui *::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.65);background-clip:content-box;border:2px solid transparent}
body.fluent-ui ::selection{background:color-mix(in srgb,var(--fl-accent) 45%,transparent)}
@media (prefers-reduced-transparency:reduce){body.fluent-ui [style*="var(--bg-card)"],body.fluent-ui .fl-header{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background-image:none!important}}
@media (prefers-reduced-motion:reduce){body.fluent-ui [data-widget]{animation:none!important}body.fluent-ui *::after{transition:none!important}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){body.fluent-ui [style*="var(--bg-card)"]{background-color:var(--bg-card)!important;background-image:none!important}}
@media print{body.fluent-ui [style*="var(--bg-card)"]{background-image:none!important;backdrop-filter:none!important;box-shadow:none!important}}
`;

// ───────── اعمال روی صفحه ─────────
let styleEl = null, revealOff = null;

function startReveal() {
  if (revealOff || typeof document === "undefined") return;
  let raf = 0, last = null;
  const onMove = (e) => {
    const t = e.target && e.target.closest ? e.target.closest("button,[role=button],.dwt") : null;
    if (!t || t.disabled) return;
    last = { t, x: e.clientX, y: e.clientY };
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0; if (!last) return;
      const r = last.t.getBoundingClientRect();
      last.t.style.setProperty("--fl-x", `${last.x - r.left}px`);
      last.t.style.setProperty("--fl-y", `${last.y - r.top}px`);
    });
  };
  document.addEventListener("pointermove", onMove, { passive: true });
  revealOff = () => { document.removeEventListener("pointermove", onMove); if (raf) cancelAnimationFrame(raf); revealOff = null; };
}

// تم روشن/تیره را App به‌صورت صریح اعلام می‌کند (syncFluentTheme)
let curTheme = (() => { try { return localStorage.getItem("cafenet_theme") || "dark"; } catch { return "dark"; } })();
const syncLight = () => { if (typeof document !== "undefined") document.body.classList.toggle("fl-light", curTheme === "light"); };
export function syncFluentTheme(theme) { curTheme = theme === "light" ? "light" : "dark"; syncLight(); }

export function applyFluent(s = getFluent()) {
  if (typeof document === "undefined") return s;
  const b = document.body;
  // در «تم نارنجی» و «لیکوید گلس» لایهٔ Fluent اعمال نمی‌شود؛ تنظیمش حفظ می‌شود و با بازگشت به تم مترو دوباره فعال می‌شود
  if (!s.on || getSkin() !== "metro") {
    b.classList.remove("fluent-ui", "fl-acrylic", "fl-reveal", "fl-light");
    if (styleEl) { styleEl.remove(); styleEl = null; }
    if (revealOff) revealOff();
    return s;
  }
  if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "cafino-fluent"; styleEl.textContent = FLUENT_CSS; document.head.appendChild(styleEl); }
  b.classList.add("fluent-ui");
  b.classList.toggle("fl-acrylic", s.acrylic);
  b.classList.toggle("fl-reveal", s.reveal);
  if (s.reveal) startReveal(); else if (revealOff) revealOff();
  syncLight();
  return s;
}

export function setFluent(patch) {
  const next = normalizeFluent({ ...getFluent(), ...patch });
  try { localStorage.setItem(FLUENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  applyFluent(next);
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: next })); } catch { /* ignore */ }
  return next;
}
export const onFluentChange = (fn) => { window.addEventListener(EVT, fn); return () => window.removeEventListener(EVT, fn); };
export function initFluent() {
  try {
    window.addEventListener("cafino:skin", () => applyFluent(getFluent()));
    return applyFluent(getFluent());
  } catch { return null; }
}
