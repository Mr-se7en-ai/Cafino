// منطق خالص کپچای ورود (سمت برنامه). سرور فقط بعد از چند شکست کپچا می‌خواهد (server/src/lib/loginCaptcha.js).
export const CAPTCHA_LENGTH = 5;
export const isCaptchaCode = (code) => code === "captcha_required" || code === "captcha_invalid";
/** ارقام فارسی/عربی → لاتین و حذف فاصله؛ ورودی کاربر با صفحه‌کلید فارسی هم کار می‌کند */
export function normalizeCaptchaAnswer(v) {
  return String(v ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(0, CAPTCHA_LENGTH);
}
/** فیلدهای کپچا برای بدنهٔ ورود؛ بدون چالش → {} (کاربر عادی هرگز کپچا نمی‌بیند) */
export const captchaPayload = (challenge, answer) => (challenge?.id ? { captchaId: challenge.id, captchaAnswer: normalizeCaptchaAnswer(answer) } : {});
/** آیا می‌توان فرم را ارسال کرد؟ (کپچا نمایش داده شده ولی پر نشده → خیر) */
export const captchaReady = (challenge, answer) => !challenge?.id || normalizeCaptchaAnswer(answer).length === CAPTCHA_LENGTH;
