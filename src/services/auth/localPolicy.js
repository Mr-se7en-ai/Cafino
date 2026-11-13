// آیا حساب‌های محلی (ثبت‌نام/ورود/بازیابی بدون سرور) مجازند؟
// پیش‌فرض در نسخهٔ نهایی: خیر — هویت باید از سرور بیاید (نتیجهٔ بررسی امنیتی). مدیر استقرار می‌تواند در config.js بنویسد
//   allowLocalAccounts: true
// تا برنامه بدون سرور (مثلاً نسخهٔ آنلاین روی GitHub Pages، یا یک رایانهٔ تک‌کاربره) ثبت‌نام و ورود محلی داشته باشد.
// حساب محلی فقط روی همان مرورگر/دستگاه ذخیره می‌شود؛ با پاک‌شدن داده‌های مرورگر از بین می‌رود و همگام‌سازی ندارد.
export function localAccountsAllowed(env = {}) {
  const dev = env.dev !== undefined ? env.dev : !!(typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV);
  if (dev) return true;
  const cfg = env.config !== undefined ? env.config : (typeof globalThis !== "undefined" ? globalThis.CAFINO_CONFIG : null);
  return !!(cfg && typeof cfg === "object" && cfg.allowLocalAccounts === true);
}
export const LOCAL_ACCOUNTS_NOTICE = "نسخهٔ بدون سرور: حساب شما و همهٔ اطلاعات فقط روی همین مرورگر ذخیره می‌شود، بین دستگاه‌ها همگام نمی‌شود و با پاک‌کردن داده‌های مرورگر از بین می‌رود. از بخش «پشتیبان‌گیری» نسخهٔ پشتیبان بگیرید.";
