// لایهٔ CSS «تم نارنجی». فقط وقتی فعال است که کلاس skin-orange روی <body> باشد.
// رنگ‌های اصلی برنامه (آبی) به نارنجی نگاشت می‌شوند؛ مقدارهای inline در DOM به شکل rgb(...) نوشته می‌شوند.
export const ORANGE_CSS = `
body.skin-orange{accent-color:#f97316;--sk-grad:linear-gradient(135deg,#ff9a3c,#e8590c);--sk-glow:0 8px 20px rgba(232,89,12,.30);--sk-shadow:0 1px 2px rgba(120,53,15,.05),0 8px 24px rgba(120,53,15,.07);--sk-radius:18px}
/* منوی کناری: همیشه قهوه‌ای تیره (مثل طرح)، با متغیرهای اختصاصی تا همهٔ متن‌ها خوانا بمانند */
body.skin-orange aside.no-print{--bg-card:#2a1810;--bg-app:#3a2418;--border:#3d2a1e;--text-primary:#fbeee2;--text-secondary:#e0c8b3;--text-muted:#b39580;--text-dim:#9a7d69;--accent-light:#ffb067;background:#2a1810!important;color:var(--text-primary)!important;border-left:none!important;box-shadow:none!important}
body.skin-orange aside.no-print button{border-radius:14px!important}
body.skin-orange aside.no-print button.tab-active{background:var(--sk-grad)!important;color:#fff!important;border-right-color:transparent!important;box-shadow:var(--sk-glow)}
body.skin-orange aside.no-print button.tab-active *{color:#fff!important}
body.skin-orange aside.no-print button:not(.tab-active):hover{background:rgba(255,255,255,.06)!important}
/* هدر بالا */
body.skin-orange .fl-header{box-shadow:0 6px 22px rgba(232,89,12,.22)}
/* کارت‌ها و پنل‌ها */
body.skin-orange :is([style*="border-radius: 10px"],[style*="border-radius: 12px"],[style*="border-radius: 14px"],[style*="border-radius: 16px"])[style*="var(--bg-card)"]{border-radius:var(--sk-radius)!important;box-shadow:var(--sk-shadow);border-color:var(--border)!important}
body.skin-orange .dwt{border-radius:var(--sk-radius)!important;box-shadow:var(--sk-shadow)}
/* کاشی‌های مرکز عملیات (داشبورد مدیریتی): گوشهٔ گرد؛ دکمه‌های «افزودن کاشی» کمی کوچک‌تر */
body.skin-orange .wtile{border-radius:var(--sk-radius)!important;box-shadow:var(--sk-shadow)}
body.skin-orange [data-testid="dash-tiles"] button[style*="border-radius: 3px"]:not([data-testid^="tile-x-"]){border-radius:12px!important}
body.skin-orange .dwt:hover{filter:brightness(1.05)}
/* فیلدها */
body.skin-orange :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),select,textarea){border-radius:12px!important}
body.skin-orange :is(input,select,textarea):focus{outline:none!important;border-color:#f97316!important;box-shadow:0 0 0 3px rgba(249,115,22,.22)!important}
body.skin-orange :is(button,[role=button],a,[tabindex]):focus-visible{outline:2px solid #f97316!important;outline-offset:2px!important}
body.skin-orange ::selection{background:rgba(249,115,22,.35)}
/* نگاشت آبی ← نارنجی (دکمه‌ها، تب‌ها، سوییچ‌ها) */
body.skin-orange [style*="background: rgb(37, 99, 235)"],body.skin-orange [style*="background-color: rgb(37, 99, 235)"],body.skin-orange [style*="background: rgb(29, 78, 216)"],body.skin-orange [style*="background: rgb(59, 130, 246)"]{background:var(--sk-grad)!important;border-color:transparent!important}
body.skin-orange [style*="background: rgba(37, 99, 235, 0.13)"],body.skin-orange [style*="background: rgba(37, 99, 235, 0.2)"],body.skin-orange [style*="background: rgba(37, 99, 235, 0.1)"]{background:rgba(249,115,22,.14)!important}
body.skin-orange :is([style^="color: rgb(37, 99, 235)"],[style*="; color: rgb(37, 99, 235)"],[style^="color: rgb(96, 165, 250)"],[style*="; color: rgb(96, 165, 250)"],[style^="color: rgb(147, 197, 253)"],[style*="; color: rgb(147, 197, 253)"],[style^="color: rgb(29, 78, 216)"],[style*="; color: rgb(29, 78, 216)"]){color:var(--accent-light)!important}
body.skin-orange [style*="border: 1px solid rgb(37, 99, 235)"],body.skin-orange [style*="border-color: rgb(37, 99, 235)"]{border-color:#f97316!important}
/* دکمهٔ «فروش یکپارچه» (بنفش) هم‌رنگ تم */
body.skin-orange aside.no-print button[style*="rgb(124, 58, 237)"]{background:var(--sk-grad)!important}
/* دکمهٔ «فروش یکپارچه» در موبایل (شناور) و هرجای دیگر: پس‌زمینهٔ نارنجی */
body.skin-orange button.no-print[style*="rgb(124, 58, 237)"],body.skin-orange button[data-testid="sale-fab"]{background:var(--sk-grad)!important;box-shadow:var(--sk-glow)!important}
/* دستیار صوتی: دکمه‌ها، سربرگ پنل، تأکیدها و کارت تأیید هم‌رنگ تم نارنجی (حالت «در حال شنیدن» قرمز می‌ماند) */
body.skin-orange :is([data-testid="va-fab"],[data-testid="va-nav-mic"],[data-testid="va-mic"])[style*="rgb(15, 118, 110)"]{background:var(--sk-grad)!important}
body.skin-orange [data-testid="va-nav-mic"][style*="rgb(15, 118, 110)"]{box-shadow:0 0 0 6px var(--bg-card),0 8px 18px rgba(232,89,12,.45)!important}
body.skin-orange [data-testid="va-fab"]{box-shadow:var(--sk-glow)!important}
body.skin-orange [style*="linear-gradient"][style*="rgb(15, 118, 110)"]{background:linear-gradient(135deg,#ff9a3c,#e8590c 60%,#c2410c)!important}
body.skin-orange :is([style*="background: rgb(15, 118, 110)"],[style*="background-color: rgb(15, 118, 110)"]){background:#e8590c!important}
body.skin-orange [style*="color: rgb(45, 212, 191)"]{color:#ffa05a!important}
body.skin-orange [style*="color: rgb(204, 251, 241)"]{color:#ffe3cc!important}
body.skin-orange [data-testid="va-card"]{border-color:#f97316!important}
body.skin-orange [data-testid^="va-tab-"][style*="rgb(20, 184, 166)"]{border-bottom-color:#f97316!important}
body.skin-orange [data-testid="va-nav-mic"]+span[style*="rgb(45, 212, 191)"]{color:#ffa05a!important}
/* بنرهای گرادیان آبی (بنر برند داشبورد و…) */
body.skin-orange [style*="rgb(30, 58, 138)"]{background:linear-gradient(135deg,#ea580c,#c2410c 60%,#f59e0b)!important}
body.skin-orange [style*="rgb(14, 165, 233)"][style*="linear-gradient"]{background:linear-gradient(135deg,#ea580c,#c2410c 60%,#f59e0b)!important}
/* هدر در دسکتاپ: روشن و ساده (مثل طرح)؛ در موبایل همان نوار نارنجی می‌ماند */
@media (min-width:700px){
  body.skin-orange .fl-header{background:var(--bg-app)!important;border-bottom:none!important;box-shadow:none!important}
  body.skin-orange .fl-header [style*="color: rgb(255, 255, 255)"]{color:var(--text-primary)!important}
  body.skin-orange .fl-header button[data-testid="global-search-btn"]{display:none!important}
  body.skin-orange .fl-header button:not([data-testid="oc-header-search"]){border-radius:14px!important}
}
/* ثبت سریع خدمات (صندوق): کارت‌های خدمت و فاکتور جاری */
body.skin-orange [data-testid="pos-item"]{border-radius:20px!important;padding:16px 14px!important;min-height:112px;box-shadow:var(--sk-shadow);transition:transform .15s,box-shadow .15s,border-color .15s}
body.skin-orange [data-testid="pos-item"]:hover{transform:translateY(-2px);border-color:#f97316!important;box-shadow:0 10px 26px rgba(232,89,12,.18)}
body.skin-orange [data-testid="pos-item"] span:nth-child(2){color:var(--accent-light)!important}
body.skin-orange [data-testid="pos-cart"]{border-radius:22px!important;box-shadow:var(--sk-shadow);border:1px solid var(--border)}
body.skin-orange [data-testid^="pos-tab-"]{border-radius:999px!important}
body.skin-orange [data-testid="pos-search"]{border-radius:16px!important}
body.skin-orange [data-testid="pos-submit"],body.skin-orange [data-testid="pos-pay"]{background:var(--sk-grad)!important;box-shadow:var(--sk-glow);border-radius:16px!important}
/* چیدمان صفحه‌های تم نارنجی در عرض‌های کوچک */
@media (max-width:1100px){
  body.skin-orange .oc-grid4{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  body.skin-orange :is(.oc-grid2,.oc-cust,.oc-inv){grid-template-columns:minmax(0,1fr)!important}
}
@media (max-width:700px){
  body.skin-orange :is(.oc-grid4,.oc-grid3){grid-template-columns:minmax(0,1fr)!important}
  body.skin-orange .oc-hide-sm{display:none!important}
}
/* پیمایش‌گر */
body.skin-orange *{scrollbar-width:thin;scrollbar-color:rgba(200,120,60,.45) transparent}
@media print{body.skin-orange aside.no-print{display:none!important}}
`;
