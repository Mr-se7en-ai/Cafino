// 1.87 — کپچای ورود (سمت برنامه): کاربر عادی چیزی نمی‌بیند؛ منطق ارسال/نرمال‌سازی؛ سیم‌کشی AuthScreen و مسیر API مطابق سرور.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAPTCHA_LENGTH, captchaPayload, captchaReady, isCaptchaCode, normalizeCaptchaAnswer } from "../app/app/loginCaptcha.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("بدون چالش: هیچ فیلد کپچایی ارسال نمی‌شود و فرم همیشه آمادهٔ ارسال است (کاربر عادی)", () => {
  assert.deepEqual(captchaPayload(null, "12345"), {}); assert.deepEqual(captchaPayload({}, "12345"), {});
  assert.equal(captchaReady(null, ""), true);
});
test("با چالش: فیلدها ارسال می‌شود و تا ۵ رقم کامل نشده فرم آماده نیست", () => {
  const ch = { id: "t.o.k.en", image: "data:image/svg+xml;base64,AA==" };
  assert.deepEqual(captchaPayload(ch, " ۱۲۳۴۵ "), { captchaId: "t.o.k.en", captchaAnswer: "12345" });
  assert.equal(captchaReady(ch, "1234"), false); assert.equal(captchaReady(ch, ""), false); assert.equal(captchaReady(ch, "۱۲۳۴۵"), true);
});
test("نرمال‌سازی: ارقام فارسی/عربی، حذف غیررقم، سقف طول", () => {
  assert.equal(normalizeCaptchaAnswer("۰۱۲۳۴"), "01234"); assert.equal(normalizeCaptchaAnswer("٥٦٧٨٩"), "56789");
  assert.equal(normalizeCaptchaAnswer("1a2 b3-4_5"), "12345"); assert.equal(normalizeCaptchaAnswer("123456789"), "123456".slice(0, CAPTCHA_LENGTH)); assert.equal(normalizeCaptchaAnswer(null), "");
});
test("کدهای خطای سرور شناسایی می‌شوند (و بقیه خطاها نه)", () => {
  assert.equal(isCaptchaCode("captcha_required"), true); assert.equal(isCaptchaCode("captcha_invalid"), true);
  for (const c of ["unauthorized", "account_locked", "rate_limited", "", undefined]) assert.equal(isCaptchaCode(c), false);
});
test("AuthScreen: کپچا فقط در حالت سرور+ورود؛ با خطای captcha_* یا بعد از تلاشِ همراه با کپچا چالش تازه می‌گیرد", () => {
  const a = read("../app/app/AuthScreen.jsx");
  assert.match(a, /remoteAuth&&mode==="login"&&captcha&&<LoginCaptcha/);
  assert.match(a, /\.\.\.captchaPayload\(captcha,captchaAnswer\)/);
  assert.match(a, /isCaptchaCode\(error\?\.code\)\|\|captcha\)\)await loadCaptcha\(\)/);
  assert.match(a, /remoteAuth&&mode==="login"&&!captchaReady\(captcha,captchaAnswer\)/);
  // ثبت‌نام کپچا نمی‌فرستد
  assert.ok(!/register\(\{[^}]*captcha/.test(a));
});
test("مسیر API کلاینت با سرور یکی است و کادر کپچا تصویر را فقط با <img> (نه HTML خام) نشان می‌دهد", () => {
  assert.match(read("../services/api/client.js"), /captcha: \(\) => client\.request\("\/api\/auth\/captcha"\)/);
  assert.match(read("../../server/src/routes/auth.js"), /app\.get\("\/api\/auth\/captcha"/);
  const c = read("../app/app/LoginCaptcha.jsx");
  assert.ok(c.includes("<img ") && !c.includes("dangerouslySetInnerHTML"));
});
