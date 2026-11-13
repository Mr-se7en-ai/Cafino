/* تنظیمات استقرار کافینو — این فایل را مدیر سیستم ویرایش می‌کند؛ در خود برنامه هیچ گزینه‌ای برای آن نمایش داده نمی‌شود.

   apiBaseUrl      نشانی سرور مرکزی. خالی = برنامه فقط محلی/آفلاین کار می‌کند. مثال: "https://api.example.com"
                   اگر برنامه و API پشت یک دامنه‌اند (docker-compose همین بسته): "same-origin"
   cafeId          شناسهٔ کافی‌نت روی سرور (اختیاری)
   brandLogoUrl    مسیر لوگوی کافینو (svg/png/webp)، مثلاً "brand/logo.svg"؛ فایل را کنار index.html در پوشهٔ brand بگذارید. خالی = نماد پیش‌فرض

   operatorLogos   لوگوی اپراتورهای شارژ و اینترنت (اختیاری؛ کاربر هم می‌تواند از «فروش شارژ و اینترنت ← لوگوی اپراتورها» بارگذاری کند و آن اولویت دارد).
                   کلیدها: mci, irancell, rightel, shatel, aptel, samantel, lotus, anarestan, azartel, other
                   مثال: { mci: "brand/operators/mci.png", irancell: "brand/operators/irancell.svg" } — فایل‌ها را در پوشهٔ brand/operators بگذارید.

   allowLocalAccounts  true = ثبت‌نام و ورود محلی بدون سرور مجاز است (مثلاً نسخهٔ آنلاین روی GitHub Pages یا یک رایانهٔ تک‌کاربره).
                   پیش‌فرض false است: هویت باید از سرور بیاید. حساب محلی فقط روی همان مرورگر ذخیره می‌شود و همگام نمی‌شود.

   اعلان وقتی برنامه بسته است (Web Push) — فقط با راه‌اندازی «سرویس اعلان» (پوشهٔ push-server) کار می‌کند:
   pushUrl         نشانی سرویس اعلان، مثلاً "https://push.example.com" (اگر خالی باشد از apiBaseUrl استفاده می‌شود)
   vapidPublicKey  کلید عمومی که سرویس اعلان هنگام اجرا چاپ می‌کند
   pushKey         کلید مشترک (اختیاری؛ باید با PUSH_SHARED_KEY سرویس یکی باشد)
   اگر pushUrl و apiBaseUrl هر دو خالی باشند، دکمهٔ اعلان پس‌زمینه فعال نمی‌شود و یادآورها فقط وقتی برنامه باز است هشدار می‌دهند. */
window.CAFINO_CONFIG = { apiBaseUrl: "", allowLocalAccounts: false, cafeId: "", pushUrl: "", vapidPublicKey: "", pushKey: "", brandLogoUrl: "", operatorLogos: {} };
