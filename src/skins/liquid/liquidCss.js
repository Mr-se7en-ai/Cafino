// لایهٔ CSS «تم لیکوید گلس». فقط وقتی فعال است که کلاس skin-liquid روی <body> باشد.
// ماده‌ی شیشه از پروژهٔ Glasswork (MIT، Kubai087): سایه، تیرگی/روشنی و تونِ پس‌زمینه با blur/saturate/brightness،
// تینت نیمه‌شفاف، نور لبه (بالا-چپ و پایین-راست) و بِوِل نرم. شکست نور لبه با liquidLens.js (فیلتر SVG) اضافه می‌شود.
// کارت‌های برنامه با استایل inline و var(--bg-card) نوشته شده‌اند؛ همان انتخابگر را می‌گیریم.
export const LIQUID_CSS = `
body.skin-liquid{
  --lq-radius:22px;--lq-k:1;--lq-blur:14px;
  accent-color:#3b82f6;
  background:var(--bg-app);
}
/* پس‌زمینهٔ گرادیانی روی لایهٔ fixed جدا (به‌جای «attachment fixed» که هر فریم اسکرول کل صفحه را دوباره می‌کشید) */
body.skin-liquid::before{
  content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;transform:translateZ(0);
  background:
    radial-gradient(circle 21vmin at 78% 24%,var(--lq-o1) 0 52%,transparent 100%),
    radial-gradient(circle 17vmin at 14% 70%,var(--lq-o2) 0 52%,transparent 100%),
    radial-gradient(circle 13vmin at 52% 86%,var(--lq-o3) 0 52%,transparent 100%),
    radial-gradient(70vmax 70vmax at 8% 6%,var(--lq-w1),transparent 62%),
    radial-gradient(64vmax 64vmax at 94% 10%,var(--lq-w2),transparent 60%),
    radial-gradient(70vmax 70vmax at 86% 100%,var(--lq-w3),transparent 62%),
    radial-gradient(60vmax 60vmax at 0% 96%,var(--lq-w4),transparent 60%),
    var(--bg-app);
}
body.skin-liquid .fl-root{background:transparent!important}

/* ── کارت‌ها و پنل‌ها: شیشه ── */
body.skin-liquid [style*="var(--bg-card)"]{
  background:var(--lq-card-fallback)!important;
  background:color-mix(in srgb,rgb(var(--lq-tint)) calc(var(--lq-a-card) * var(--lq-k) * 100%),transparent)!important;
  border-color:var(--lq-edge)!important;
  box-shadow:
    inset 1.5px 1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-a)),
    inset -1.5px -1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-b)),
    inset 0 0 0 .5px rgb(255 255 255 / .28),
    0 0 0 .5px rgb(0 0 0 / var(--lq-hair)),
    0 6px 24px rgb(0 0 0 / var(--lq-shadow)),
    inset 0 6px 8px -6px rgb(255 255 255 / var(--lq-bevel-a)),
    inset 4px 0 8px -6px rgb(255 255 255 / .2),
    inset -4px 0 8px -6px rgb(255 255 255 / .1),
    inset 0 -6px 8px -6px rgb(0 0 0 / .06)!important;
}
/* گوشهٔ گردتر برای کارت‌های معمول (۱۰ تا ۱۶ پیکسل) */
body.skin-liquid :is([style*="border-radius: 10px"],[style*="border-radius: 12px"],[style*="border-radius: 14px"],[style*="border-radius: 16px"])[style*="var(--bg-card)"]{border-radius:var(--lq-radius)!important}
/* فقط «بالاترین» سطح شیشه محو می‌کند؛ کارت داخل کارت فقط رنگ نیمه‌شفاف دارد (هزینهٔ GPU و تیرگی دوباره نمی‌گیرد).
   عنصری که فرزند position:fixed دارد (پنجره/منو) محو نمی‌شود، چون backdrop-filter قاب position:fixed را عوض می‌کند. */
body.skin-liquid [style*="var(--bg-card)"]:not(:where([style*="var(--bg-card)"] *)):not(:has([style*="position: fixed"])){
  -webkit-backdrop-filter:blur(var(--lq-blur)) saturate(var(--lq-sat)) brightness(var(--lq-bri));
  backdrop-filter:blur(var(--lq-blur)) saturate(var(--lq-sat)) brightness(var(--lq-bri)) var(--glass-lens,);
  isolation:isolate;
}
body.skin-liquid [style*="var(--bg-card)"] [style*="var(--bg-card)"]{
  background:color-mix(in srgb,rgb(var(--lq-tint)) calc(var(--lq-a-nested) * var(--lq-k) * 100%),transparent)!important;
  box-shadow:inset 0 0 0 .5px rgb(255 255 255 / .2)!important;
}

/* ── سطوح «کروم» (منوی کناری، هدر، نوار پایین): شیشهٔ شفاف‌تر ── */
body.skin-liquid :is(aside.no-print,nav.no-print,.fl-header){
  background:var(--lq-chrome-fallback)!important;
  background:color-mix(in srgb,rgb(var(--lq-tint)) calc(var(--lq-a-chrome) * var(--lq-k) * 100%),transparent)!important;
  -webkit-backdrop-filter:blur(calc(var(--lq-blur) * .65)) saturate(var(--lq-sat)) brightness(var(--lq-bri));
  backdrop-filter:blur(calc(var(--lq-blur) * .65)) saturate(var(--lq-sat)) brightness(var(--lq-bri)) var(--glass-lens,);
  border:none!important;
  box-shadow:
    inset 1.5px 1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-a)),
    inset -1.5px -1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-b)),
    0 0 0 .5px rgb(0 0 0 / var(--lq-hair)),
    0 8px 30px rgb(0 0 0 / var(--lq-shadow))!important;
}
/* هدر و نوار پایین: محتوای زیرشان هنگام اسکرول نباید از پشت شیشه خوانا باشد؛ محوتر از منوی کناری */
body.skin-liquid :is(nav.no-print,.fl-header){-webkit-backdrop-filter:blur(calc(var(--lq-blur) * 1.5)) saturate(var(--lq-sat)) brightness(var(--lq-bri));backdrop-filter:blur(calc(var(--lq-blur) * 1.5)) saturate(var(--lq-sat)) brightness(var(--lq-bri)) var(--glass-lens,)}
body.skin-liquid aside.no-print{margin:10px 10px 10px 0;top:calc(var(--gb,0px) + 10px)!important;bottom:10px!important;right:0!important;border-radius:26px}
body.skin-liquid .sb-toggle{margin-right:10px;border-radius:50%!important}   /* منوی شناور: لبهٔ منو ۱۰px از کنار صفحه فاصله دارد */
body.skin-liquid aside.no-print button{border-radius:16px!important}
body.skin-liquid aside.no-print button.tab-active{background:linear-gradient(135deg,#4f8dff,#6366f1)!important;color:#fff!important;border-right-color:transparent!important;box-shadow:0 6px 18px rgba(79,141,255,.38),inset 0 1px 0 rgba(255,255,255,.45)}
body.skin-liquid aside.no-print button.tab-active *{color:#fff!important}
body.skin-liquid aside.no-print button:not(.tab-active):hover{background:rgb(255 255 255 / .16)!important}
body.skin-liquid .fl-header{margin:10px 10px 0;border-radius:24px}
body.skin-liquid .fl-header [style*="color: rgb(255, 255, 255)"]{color:var(--text-primary)!important}
body.skin-liquid .fl-header button{border-radius:14px!important}
@media (max-width:700px){
  body.skin-liquid .fl-header{margin:6px 6px 0;border-radius:20px}
  body.skin-liquid nav.no-print{left:8px!important;right:8px!important;bottom:8px!important;width:auto;border-radius:24px;height:62px!important}
}

/* ── دکمه‌ها (آبی اصلی): شیشهٔ رنگی با براق بالا ── */
body.skin-liquid button:is([style*="background: rgb(37, 99, 235)"],[style*="background-color: rgb(37, 99, 235)"],[style*="background: rgb(29, 78, 216)"]){
  background-image:linear-gradient(180deg,rgb(255 255 255 / .38),rgb(255 255 255 / 0) 58%)!important;
  border:1px solid rgb(255 255 255 / .38)!important;
  box-shadow:0 6px 16px rgb(37 99 235 / .34),inset 0 1px 0 rgb(255 255 255 / .55),inset 0 -2px 6px rgb(0 0 0 / .12)!important;
}
body.skin-liquid button:is([style*="background: rgb(124, 58, 237)"]){
  background-image:linear-gradient(180deg,rgb(255 255 255 / .34),rgb(255 255 255 / 0) 58%)!important;
  box-shadow:0 6px 16px rgb(124 58 237 / .32),inset 0 1px 0 rgb(255 255 255 / .5)!important;
}

/* ── فیلدها ── */
body.skin-liquid :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),select,textarea){
  background:var(--lq-field)!important;border:1px solid var(--lq-edge)!important;border-radius:14px!important;
  box-shadow:inset 0 1px 3px rgb(0 0 0 / .08),inset 0 0 0 .5px rgb(255 255 255 / .25);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
}
body.skin-liquid :is(input,select,textarea):focus{outline:none!important;border-color:#60a5fa!important;box-shadow:0 0 0 3px rgb(96 165 250 / .32),inset 0 1px 3px rgb(0 0 0 / .08)!important}
body.skin-liquid :is(button,[role=button],a,[tabindex]):focus-visible{outline:2px solid #60a5fa!important;outline-offset:2px!important}
body.skin-liquid ::selection{background:rgb(96 165 250 / .38)}
body.skin-liquid *{scrollbar-width:thin;scrollbar-color:rgb(120 140 190 / .5) transparent}

/* ── کاشی‌ها و ویجت‌های رنگی (مترو) ← شیشهٔ رنگی با تراشهٔ آیکن براق ──
   رنگ هر کاشی از متغیر --tc می‌آید (در کد کاشی‌ها گذاشته شده)؛ شیشه با همان رنگ تینت می‌شود، نه رنگ تخت. */
body.skin-liquid :is(.wtile,.dwt){
  --tcm:var(--tc,#3b82f6);
  border-radius:var(--lq-radius)!important;
  color:var(--lq-tile-ink)!important;
  background:
    linear-gradient(158deg,rgb(255 255 255 / .26),rgb(255 255 255 / 0) 40%),
    linear-gradient(145deg,color-mix(in srgb,var(--tcm) var(--lq-tile-a1),transparent),color-mix(in srgb,var(--tcm) var(--lq-tile-a2),transparent))!important;
  border:1px solid var(--lq-edge);
  box-shadow:
    inset 1.5px 1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-a)),
    inset -1.5px -1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-b)),
    inset 0 0 0 .5px rgb(255 255 255 / .3),
    0 8px 22px color-mix(in srgb,var(--tcm) 26%,transparent),
    inset 0 7px 9px -7px rgb(255 255 255 / var(--lq-bevel-a))!important;
}
body.skin-liquid :is(.wtile,.dwt):hover{filter:brightness(1.06) saturate(1.1)!important;box-shadow:
    inset 1.5px 1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-a)),inset 0 0 0 1px rgb(255 255 255 / .55),
    0 12px 28px color-mix(in srgb,var(--tcm) 36%,transparent)!important}
/* کاشی‌های بیرون از کارت (شبکهٔ ویجت‌ها) خودشان پس‌زمینه را محو می‌کنند؛ داخل کارت، کارت پدر محو می‌کند */
body.skin-liquid .dwt:not(:where([style*="var(--bg-card)"] *)){
  -webkit-backdrop-filter:blur(var(--lq-blur)) saturate(var(--lq-sat)) brightness(var(--lq-bri));
  backdrop-filter:blur(var(--lq-blur)) saturate(var(--lq-sat)) brightness(var(--lq-bri));
}
/* تراشهٔ آیکن: مثل آیکن اپلیکیشن شیشه‌ای */
body.skin-liquid .wt-ic{
  padding:8px;border-radius:16px;color:#fff;
  background:
    linear-gradient(160deg,rgb(255 255 255 / .55),rgb(255 255 255 / 0) 52%),
    linear-gradient(145deg,color-mix(in srgb,var(--tcm,#3b82f6) 96%,#fff),color-mix(in srgb,var(--tcm,#3b82f6) 62%,transparent));
  box-shadow:inset 0 1px 0 rgb(255 255 255 / .7),inset 0 -2px 5px rgb(0 0 0 / .14),0 5px 12px color-mix(in srgb,var(--tcm,#3b82f6) 42%,transparent);
}
body.skin-liquid .dwt .wt-ic{padding:5px;border-radius:12px}
body.skin-liquid .wtile .wt-ic svg,body.skin-liquid .dwt .wt-ic svg{filter:drop-shadow(0 1px 1px rgb(0 0 0 / .25))}
body.skin-liquid .wtile-add{border-radius:14px!important;color:var(--text-primary)!important;
  background:linear-gradient(145deg,color-mix(in srgb,var(--tc) 40%,transparent),color-mix(in srgb,var(--tc) 14%,transparent))!important;border:1px solid var(--lq-edge)!important}
/* دکمهٔ حذف کاشی در حالت ویرایش */
body.skin-liquid :is(.wtile,.dwt) button{backdrop-filter:blur(6px)}

/* کارت‌های آماری گزارش‌ها (KPI) و فیلد جستجو */
body.skin-liquid .ui-kpi{
  border-radius:var(--lq-radius)!important;border:1px solid var(--lq-edge)!important;
  background:
    linear-gradient(158deg,rgb(255 255 255 / .3),rgb(255 255 255 / 0) 46%),
    linear-gradient(145deg,color-mix(in srgb,var(--tc) var(--lq-tile-a1),transparent),color-mix(in srgb,var(--tc) var(--lq-tile-a2),transparent))!important;
  box-shadow:inset 1.5px 1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-a)),inset 0 0 0 .5px rgb(255 255 255 / .28),0 8px 20px color-mix(in srgb,var(--tc) 22%,transparent)!important;
}
body.skin-liquid .ui-kpi>div:first-child,body.skin-liquid .ui-kpi>div:last-child{color:color-mix(in srgb,var(--tc) var(--lq-kpi-pct),#0f172a)!important}
body.skin-liquid .cafind-field input{background:transparent!important;border:none!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
body.skin-liquid .cafind-field{background:var(--lq-field)!important;border-color:var(--lq-edge)!important;border-radius:20px!important}

/* ── بنر برند: شیشهٔ آبی ── */
body.skin-liquid [data-testid="brand-banner"]{
  color:var(--text-primary)!important;border-radius:var(--lq-radius)!important;
  background:
    linear-gradient(160deg,rgb(255 255 255 / .34),rgb(255 255 255 / 0) 50%),
    linear-gradient(135deg,rgb(30 64 175 / calc(var(--lq-k) * .42)),rgb(14 165 233 / calc(var(--lq-k) * .26)))!important;
  border:1px solid var(--lq-edge);
  box-shadow:inset 1.5px 1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-a)),inset -1.5px -1.5px 1px -1px rgb(255 255 255 / var(--lq-catch-b)),0 8px 26px rgb(37 99 235 / .22)!important;
  -webkit-backdrop-filter:blur(var(--lq-blur)) saturate(var(--lq-sat)) brightness(var(--lq-bri));backdrop-filter:blur(var(--lq-blur)) saturate(var(--lq-sat)) brightness(var(--lq-bri));
}
/* ردیف‌ها، تراشه‌ها و دکمه‌های داخل ویجت‌ها (زمینهٔ تیرهٔ --bg-app) ← شیشهٔ کم‌رنگ */
body.skin-liquid [style*="var(--bg-card)"] [style*="background: var(--bg-app)"]{
  background:color-mix(in srgb,rgb(var(--lq-tint)) calc(var(--lq-a-nested) * var(--lq-k) * 70%),transparent)!important;
  border-color:var(--lq-edge)!important;
  box-shadow:inset 0 0 0 .5px rgb(255 255 255 / .22),inset 0 1px 0 rgb(255 255 255 / .18);
}
body.skin-liquid [style*="var(--bg-card)"] button[style*="background: var(--bg-app)"]{border-radius:12px!important}
/* خط رنگی بالای ویجت‌ها: نازک و هم‌رنگ شیشه */
body.skin-liquid .reports-center{border-color:rgb(255 255 255 / .2)!important;background:rgb(255 255 255 / .05)!important;border-radius:26px!important}   /* قاب «مرکز گزارشات»: بدون blur تا کارت‌های داخلش شیشهٔ خودشان را داشته باشند */
body.skin-liquid .dw-card{border-top-width:2px!important;border-top-color:color-mix(in srgb,var(--tc,#3b82f6) 72%,transparent)!important}

/* ── بدون شفافیت / چاپ / مرورگر بدون backdrop-filter: سطح مات ── */
/* ── روانی انیمیشن (۱.۷۵.۱) ──
   روی شیشه هر فریم blur را دوباره محاسبه می‌کند؛ پس انیمیشن‌ها کوتاه‌تر و فقط opacity/transform‌اند و هاور دکمه‌ها
   فیلتر/تغییر سنگین ندارد. هنگام اسکرول و تغییر تب، شکست نور (فیلتر SVG) موقتاً خاموش می‌شود (کلاس lq-moving از liquidLens.js). */
body.skin-liquid :is(.ui-page-enter,.tab-active,.tab-active svg,.mobile-tab-indicator){animation:none!important}   /* انیمیشن روی کانتینر پر از blur هر فریم دوباره‌کشی می‌شود؛ اندازه‌گیری: پرش تب ~۴۰٪ کمتر */
body.skin-liquid .app-shell button:not(:disabled){transition:transform .1s ease-out,box-shadow .12s ease-out}
body.skin-liquid .app-shell button:not(:disabled):hover{filter:none;transform:none}
body.skin-liquid .app-shell button:not(:disabled):active{transform:scale(.97)}
body.skin-liquid :is(.wtile,.dwt){transition:transform .12s ease-out,box-shadow .14s ease-out}
body.skin-liquid :is(.wtile,.dwt):hover{filter:none!important}
body.skin-liquid.lq-moving :is(aside.no-print,.fl-header){-webkit-backdrop-filter:blur(calc(var(--lq-blur) * .65)) saturate(var(--lq-sat)) brightness(var(--lq-bri))!important;backdrop-filter:blur(calc(var(--lq-blur) * .65)) saturate(var(--lq-sat)) brightness(var(--lq-bri))!important}
body.skin-liquid.lq-moving :is(nav.no-print,.fl-header){-webkit-backdrop-filter:blur(calc(var(--lq-blur) * 1.5)) saturate(var(--lq-sat)) brightness(var(--lq-bri))!important;backdrop-filter:blur(calc(var(--lq-blur) * 1.5)) saturate(var(--lq-sat)) brightness(var(--lq-bri))!important}
@media (prefers-reduced-motion:reduce){body.skin-liquid :is(.ui-page-enter,.tab-active,.mobile-tab-indicator){animation:none!important}body.skin-liquid :is(.app-shell button,.wtile,.dwt){transition:none!important}}
@media (prefers-reduced-transparency:reduce){
  body.skin-liquid [style*="var(--bg-card)"],body.skin-liquid :is(aside.no-print,nav.no-print,.fl-header){background:var(--bg-card)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  body.skin-liquid [style*="var(--bg-card)"],body.skin-liquid :is(aside.no-print,nav.no-print,.fl-header){background:var(--bg-card)!important}
}
@media (forced-colors:active){
  body.skin-liquid [style*="var(--bg-card)"]{background:Canvas!important;border:1px solid CanvasText!important;backdrop-filter:none!important}
}
@media print{
  body.skin-liquid{background:#fff!important}
  body.skin-liquid [style*="var(--bg-card)"],body.skin-liquid :is(aside.no-print,nav.no-print,.fl-header){background:#fff!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;box-shadow:none!important}
  body.skin-liquid aside.no-print{display:none!important}
}
`;
