import nodemailer from "nodemailer";

// بدون SMTP_URL ایمیل فقط در لاگ چاپ می‌شود (برای توسعه). در تولید حتماً SMTP_URL را تنظیم کنید، وگرنه «فراموشی رمز» کار نمی‌کند.
export function createMailer(cfg, log) {
  if (!cfg.smtpUrl) {
    if (cfg.production) log.warn("SMTP_URL تنظیم نشده است؛ ایمیل‌ها (بازیابی رمز) ارسال نمی‌شوند");
    return { configured: false, async send(m) { if (!cfg.production) log.warn({ to: m.to, subject: m.subject, text: m.text }, "ایمیل (حالت توسعه، ارسال نشد)"); } };
  }
  const transport = nodemailer.createTransport(cfg.smtpUrl);
  return { configured: true, send: (m) => transport.sendMail({ from: cfg.mailFrom, ...m }) };
}
