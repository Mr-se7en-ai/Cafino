# کافینو برای اندروید (Capacitor) — راهنمای ساخت APK

> **وضعیت صادقانه:** در محیطی که این نسخه ساخته شد، دسترسی به `dl.google.com`، Maven Central/Google Maven و Gradle بسته بود
> (پاسخ 403) و Android SDK نصب نبود؛ بنابراین **فایل APK در آن‌جا ساخته نشد** و هیچ APK ادعایی تست نشده است.
> آنچه تحویل شده یک پروژهٔ Android Studio/Gradle کامل و هم‌گام‌شده با وب‌اپ ۱.۷۷.۰ است که با یک دستور APK می‌دهد.

## راه ۱ — ساخت روی GitHub Actions (بدون نصب چیزی روی سیستم خودتان)
۱. پروژه را در یک مخزن GitHub بگذارید (پوشهٔ `.github/workflows/android-apk.yml` همراه است).
۲. تب **Actions ← Android APK ← Run workflow** (mode = `debug`).
۳. پس از ~۵–۸ دقیقه، Artifact با نام **cafino-apk** را دانلود کنید؛ داخلش `cafino-<نسخه>-debug.apk` است.
   APK حالت debug با کلید دیباگ امضا می‌شود و برای نصب مستقیم روی گوشی (Sideload) کافی است.

## راه ۲ — ساخت روی سیستم خودتان
پیش‌نیاز: Node 22، JDK 21، Android SDK (platform 35 و build-tools 35) و `ANDROID_HOME`.
```bash
npm ci && npm run build        # ساخت وب‌اپ → dist/pwa
cd android
npm ci
python3 scripts/make-icons.py  # (اختیاری) آیکن‌ها از dist/pwa/icons — ازقبل ساخته شده‌اند
bash scripts/build-apk.sh debug      # خروجی: android/out/cafino-<نسخه>-debug.apk
```
یا پوشهٔ `android/android` را در Android Studio باز کنید (Build ← Build APK).

## APK امضاشدهٔ release
```bash
keytool -genkeypair -v -keystore cafino.jks -alias cafino -keyalg RSA -keysize 2048 -validity 10000
export CAFINO_KEYSTORE=$PWD/cafino.jks CAFINO_KEYSTORE_PASSWORD=... CAFINO_KEY_ALIAS=cafino CAFINO_KEY_PASSWORD=...
bash scripts/build-apk.sh release
```
فایل keystore را نگه دارید و هرگز در مخزن نگذارید؛ بدون آن به‌روزرسانی‌های بعدی روی همان نصب ممکن نیست.
در GitHub: چهار Secret `CAFINO_KEYSTORE_B64` (خروجی `base64 -w0 cafino.jks`)، `CAFINO_KEYSTORE_PASSWORD`، `CAFINO_KEY_ALIAS`، `CAFINO_KEY_PASSWORD`.

## ساختار
- `capacitor.config.json` — شناسهٔ `ir.cafino.app`، وب‌اپ از `www/` (کپی `dist/pwa`).
- `scripts/prepare-web.mjs` — کپی `dist/pwa` → `www/`. `scripts/patch-android.mjs` — نسخه، مجوزها، رنگ‌ها، امضا (idempotent).
- `android/` — پروژهٔ Gradle تولیدشده (minSdk 23، target/compile 35).
- با هر نسخهٔ جدید وب‌اپ: `npm run build` سپس `npm run sync` در پوشهٔ `android`.

## محدودیت‌های شناخته‌شده (آزموده‌نشده روی دستگاه)
- **دستیار صوتی:** وب‌اپ از Web Speech API مرورگر استفاده می‌کند که در WebView اندروید وجود ندارد؛ برای کار کردن میکروفن در APK باید افزونهٔ بومی تشخیص گفتار
  (مثلاً `@capacitor-community/speech-recognition`) اضافه و به `services/speechRecognition.js` وصل شود. این کار انجام نشده است.
- **چاپ/ذخیرهٔ فایل:** `window.print` و دانلود فایل در WebView محدودند؛ خروجی Excel/PDF روی اندروید باید با افزونه‌های Filesystem/Share تکمیل شود (انجام نشده).
- **اتصال به سرور:** فقط HTTPS مجاز است (`allowMixedContent:false`)؛ برای سرور HTTP داخل شبکهٔ محلی باید `usesCleartextTraffic` فعال شود.
- Service Worker در WebView ثبت نمی‌شود؛ چون همهٔ فایل‌ها داخل APK هستند، بدون اینترنت هم باز می‌شود.
- هیچ‌یک از موارد بالا روی گوشی واقعی یا شبیه‌ساز اجرا نشده است.
