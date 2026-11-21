// منطق خالص پیامک (قابل‌آزمون با node:test؛ بدون React). هم‌قرارداد با server/src/lib/sms.js.
export const OTP_LENGTH = 6;
export const MAX_TEXT = 500;
export const MAX_RECIPIENTS = 300;

const toLatin = (v) => String(v ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
export const toLatinDigits = toLatin;

/** فارسی/عربی/+98/0098/98/9xxxxxxxxx → 09xxxxxxxxx؛ نامعتبر → "" */
export function normalizeMobile(value) {
  let d = toLatin(value).replace(/[\s\-().‎‏]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  d = d.replace(/\D/g, "");
  if (d.startsWith("0098")) d = d.slice(4);
  else if (d.startsWith("98") && d.length === 12) d = d.slice(2);
  if (/^9\d{9}$/.test(d)) d = `0${d}`;
  return /^09\d{9}$/.test(d) ? d : "";
}
export const isMobile = (v) => normalizeMobile(v) !== "";

/** فقط ارقام (فارسی/عربی پذیرفته)، حداکثر ۶ رقم */
export const normalizeCode = (v) => toLatin(v).replace(/\D/g, "").slice(0, OTP_LENGTH);
export const codeReady = (v) => normalizeCode(v).length === OTP_LENGTH;

/** تعداد بخش‌های پیامک (فارسی ۷۰/۶۷، لاتین ۱۶۰/۱۵۳) */
export function smsParts(text) {
  const t = String(text ?? ""); if (!t) return 0;
  const uni = /[^\x00-\x7f]/.test(t), one = uni ? 70 : 160, multi = uni ? 67 : 153, n = [...t].length;
  return n <= one ? 1 : Math.ceil(n / multi);
}

/** جایگزینی {نام} با نام مشتری (خالی → «مشتری گرامی») */
export function renderTemplate(template, name) {
  return String(template ?? "").replace(/\{(?:نام|name)\}/g, String(name || "").trim() || "مشتری گرامی").trim();
}

export const customerName = (c) => `${c?.firstName || ""} ${c?.lastName || ""}`.trim();

/** از فهرست مشتریان، گیرندهٔ قابل‌ارسال می‌سازد؛ مشتری بدون شمارهٔ معتبر جدا می‌شود */
export function buildRecipients(customers, selectedIds) {
  const want = selectedIds ? new Set(selectedIds.map(String)) : null;
  const ok = [], noPhone = [], seen = new Set();
  for (const c of customers || []) {
    if (want && !want.has(String(c.id))) continue;
    const phone = normalizeMobile(c.phone);
    if (!phone) { noPhone.push(c); continue; }
    if (seen.has(phone)) continue;
    seen.add(phone);
    ok.push({ ref: String(c.id), name: customerName(c), phone });
  }
  return { recipients: ok, noPhone };
}

/** پیش‌نمایش و هشدارهای متن قبل از ارسال */
export function messageStats(template, recipientCount) {
  const text = String(template ?? "").trim();
  const len = [...text].length, parts = smsParts(text.replace(/\{(?:نام|name)\}/g, "مشتری گرامی"));
  return { len, parts, totalParts: parts * recipientCount, tooLong: len > MAX_TEXT, empty: len === 0, hasLink: /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ir|net|org)\b)/i.test(text) };
}

export const TEMPLATES = [
  ["سلام {نام}، سفارش شما آماده تحویل است. کافینو", "آمادهٔ تحویل"],
  ["سلام {نام}، یادآوری: مانده حساب شما در کافی‌نت تسویه نشده است. لطفاً در اولین فرصت مراجعه کنید.", "یادآوری بدهی"],
  ["سلام {نام}، کافی‌نت امروز تا ساعت ۲۰ باز است. منتظر شما هستیم.", "اطلاع‌رسانی ساعت کاری"],
];

/** ثانیه‌ها به «۰۱:۳۰» */
export const mmss = (sec) => `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, "0")}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;

/** پیام خطای نمایشی برای کدهای رایج API */
export function smsErrorText(e) {
  const code = e?.code || "";
  const map = { sms_wait: "برای ارسال دوبارهٔ کد کمی صبر کنید", sms_limit: "تعداد درخواست کد زیاد است؛ بعداً دوباره تلاش کنید", captcha_required: "کد تصویر را وارد کنید", captcha_invalid: "کد تصویر درست نیست", phone_taken: "این شماره قبلاً برای حساب دیگری ثبت شده است", sms_disabled: "ورود با پیامک فعال نیست" };
  return map[code] || e?.message || "خطایی رخ داد؛ دوباره تلاش کنید";
}
