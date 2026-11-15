# تغییرات ۱.۸۰.۰ — مینی‌اپ تلگرام مشتریان

## جدید
- **مینی‌اپ تلگرام برای مشتری** با **یک ربات مشترک برای همهٔ کافی‌نت‌ها** (جدا برای هر کافی‌نت نیست): خانه (مانده حساب، سفارش این ماه، آخرین وضعیت)، خدمات و قیمت‌ها با جست‌وجو (تومان)، سفارش‌ها (در جریان/تمام‌شده با مراحل)، پشتیبانی (نشانی، تماس، ارسال فایل)، حساب (حذف شماره/قطع اتصال). فارسی، راست‌به‌چپ، تم روشن/تیره از تلگرام، هدف لمسی ≥ ۴۴px.
- **کارت «مینی‌اپ تلگرام مشتریان»** در برنامه (دریافت فایل از مشتری): لینک + QR مخصوص کافی‌نت، کپی/ذخیرهٔ QR، خاموش/روشن، تعداد مشتریان متصل، همگام‌سازی تعرفه.
- **همگام‌سازی خودکار تعرفه** (فقط نام و قیمت) با هر تغییر صفحهٔ «تعرفه».
- «درباره من» و تاریخچهٔ تغییرات به‌روز شد.

## سرور
- مهاجرت `011_telegram_miniapp.sql` (`telegram_users`، `telegram_links`، `shop_public_tariff`، `miniapp_bot_state`، ستون `upload_settings.miniapp_enabled`).
- ربات مشترک (`lib/miniappBot.js`): پیکربندی خودکار، `/start c_<کد>`، دکمهٔ web_app، دریافت شماره با `request_contact` (فقط `contact.user_id == from.id`)، getUpdates با اجارهٔ DB.
- `lib/miniapp.js`: اعتبارسنجی `initData` (HMAC)، نشست JWT جدا، یکسان‌سازی شمارهٔ ایران، پاک‌سازی تعرفه.
- مسیرها: `GET /m`، `/m/assets/*`، `POST /api/miniapp/auth`، `GET me|home|orders|services|shop`، `DELETE link|me`، و سمت کافی‌نت `GET info`، `PATCH settings`، `PUT tariff` (مجوز `upload.manage`).
- متغیرها: `MINIAPP_BOT_TOKEN`، `MINIAPP_URL`، `MINIAPP_AUTH_MAX_AGE_SEC`، `MINIAPP_SESSION_TTL_SEC`، `MINIAPP_AUTH_RATE_PER_MIN`، `MINIAPP_POLL_INTERVAL_MS`. راهنما: `server/MINIAPP-fa.md`.
- `scripts/build-miniapp.mjs` بستهٔ کلاینت را در `server/src/assets/miniapp/` می‌سازد.

## امنیت
هویت فقط از امضای تلگرام؛ شمارهٔ تأییدشدهٔ تلگرام؛ نشست جدا؛ CSP اختصاصی `/m`؛ جداسازی کافی‌نت‌ها؛ توکن ربات فقط در env.

## تست
مرجع: `REPORT-1.80.0-fa.md`.
