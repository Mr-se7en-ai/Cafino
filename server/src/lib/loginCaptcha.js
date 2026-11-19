// کپچای داخلی ورود (بدون سرویس بیرونی؛ مناسب سرور داخل ایران) — فقط بعد از چند شکست پیاپی فعال می‌شود.
//
//  • «چه وقت لازم است؟» شمارندهٔ شکست در حافظه، هم برای IP و هم برای ایمیل (کلید = هش ایمیل، چه موجود چه ناموجود) تا پاسخ
//    «کپچا لازم است» وجود/نبود ایمیل را فاش نکند. با ورود موفق فقط شمارندهٔ ایمیل پاک می‌شود (نه IP)، تا مهاجم با یک حساب
//    معتبرِ خودش شمارندهٔ IP را صفر نکند. شمارنده‌ها با ری‌استارت سرور صفر می‌شوند (حافظهٔ تک‌نمونه؛ قفل حساب در پایگاه‌داده می‌ماند).
//  • «چالش» بدون ذخیره در پایگاه‌داده: توکن = exp.nonce.ah.sig که ah = HMAC(nonce+پاسخ) و sig = HMAC(کل توکن) با کلید مشتق از JWT_SECRET.
//    پاسخ از روی توکن بدون کلید سرور قابل‌استخراج نیست. هر توکن فقط «یک‌بار» قابل‌استفاده است (یک حدس)، حتی اگر پاسخ غلط باشد،
//    و بعد از ۵ دقیقه منقضی می‌شود. (حافظهٔ nonceهای مصرف‌شده تک‌نمونه است؛ حدس‌زدن هم با محدودیت نرخ درخواست کپچا و ورود مهار می‌شود.)
//  • فقط رقم لاتین ۵ رقمی: کاربر با صفحه‌کلید فارسی هم می‌تواند تایپ کند (ارقام فارسی/عربی هم پذیرفته می‌شود).
import crypto from "node:crypto";

const TTL_MS = 5 * 60 * 1000;
const DIGITS = 5;
const MAX_KEYS = 20000;

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest("hex");
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** ارقام فارسی/عربی → لاتین، حذف فاصله؛ فقط ۵ رقم معتبر است (وگرنه ""). */
export function normalizeAnswer(v) {
  const s = String(v ?? "").trim().replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\s+/g, "");
  return new RegExp(`^\\d{${DIGITS}}$`).test(s) ? s : "";
}

/** تصویر SVG با ارقام کج/جابه‌جا + خط و نقطهٔ مزاحم؛ پس‌زمینهٔ روشن ثابت تا در هر تم خوانا باشد. */
export function renderSvg(answer) {
  const r = (a, b) => a + crypto.randomInt(0, Math.round((b - a) * 100) + 1) / 100;
  const W = 150, H = 52, parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="8" fill="#f1f5f9"/>`];
  const palette = ["#1e3a8a", "#7c2d12", "#14532d", "#581c87", "#7f1d1d", "#134e4a"];
  for (let i = 0; i < 5; i++) parts.push(`<path d="M${r(0, 20)} ${r(4, 48)} C ${r(30, 60)} ${r(0, 52)}, ${r(80, 110)} ${r(0, 52)}, ${r(130, 150)} ${r(4, 48)}" stroke="${palette[crypto.randomInt(0, palette.length)]}" stroke-opacity=".45" stroke-width="${r(1, 1.8)}" fill="none"/>`);
  for (let i = 0; i < 28; i++) parts.push(`<circle cx="${r(2, W - 2)}" cy="${r(2, H - 2)}" r="${r(0.6, 1.5)}" fill="#475569" fill-opacity=".5"/>`);
  [...answer].forEach((ch, i) => {
    const x = 16 + i * 26 + r(-3, 3), y = 36 + r(-4, 4), rot = r(-22, 22), size = r(28, 36);
    parts.push(`<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${size}" fill="${palette[crypto.randomInt(0, palette.length)]}" text-anchor="middle" transform="rotate(${rot} ${x} ${y})">${ch}</text>`);
  });
  parts.push("</svg>");
  return parts.join("");
}

export function createLoginGuard(cfg, { now = () => Date.now() } = {}) {
  const key = crypto.createHash("sha256").update(`captcha:${cfg.jwtSecret}`).digest();
  const after = Math.max(0, Number(cfg.captchaAfterFails ?? 3));      // ۰ = کپچا خاموش
  const windowMs = Math.max(1, Number(cfg.captchaWindowMin ?? 15)) * 60 * 1000;
  const fails = new Map();   // کلید → {n, at}
  const used = new Map();    // nonce → exp

  const prune = (map, expiresOf) => {
    const t = now();
    for (const [k, v] of map) if (expiresOf(v) <= t) map.delete(k);
    while (map.size > MAX_KEYS) map.delete(map.keys().next().value);     // سقف حافظه (قدیمی‌ترین‌ها)
  };
  const kIp = (ip) => `ip:${String(ip || "")}`;
  const kEm = (email) => `em:${crypto.createHash("sha256").update(String(email || "").toLowerCase()).digest("hex").slice(0, 32)}`;
  const count = (k) => { const v = fails.get(k); if (!v) return 0; if (now() - v.at > windowMs) { fails.delete(k); return 0; } return v.n; };
  const bump = (k) => { const n = count(k) + 1; fails.delete(k); fails.set(k, { n, at: now() }); };

  return {
    enabled: after > 0,
    /** آیا برای این تلاش ورود کپچا لازم است؟ (برای ایمیل موجود و ناموجود یکسان) */
    required(ip, email) { return after > 0 && (count(kIp(ip)) >= after || count(kEm(email)) >= after); },
    fail(ip, email) { if (after <= 0) return; bump(kIp(ip)); bump(kEm(email)); if (fails.size > MAX_KEYS) prune(fails, (v) => v.at + windowMs); },
    success(email) { fails.delete(kEm(email)); },
    stats() { return { fails: fails.size, used: used.size }; },   // برای تست/پایش

    /** چالش تازه: {id, image(data-URI svg), expiresIn(sec)} */
    challenge() {
      const answer = String(crypto.randomInt(0, 10 ** DIGITS)).padStart(DIGITS, "0");
      const nonce = crypto.randomBytes(12).toString("hex");
      const body = `${now() + TTL_MS}.${nonce}.${hmac(key, `a:${nonce}:${answer}`)}`;
      const id = `${body}.${hmac(key, `t:${body}`)}`;
      if (used.size > 5000) prune(used, (v) => v);
      return { id, image: `data:image/svg+xml;base64,${Buffer.from(renderSvg(answer)).toString("base64")}`, expiresIn: TTL_MS / 1000 };
    },
    /** بررسی پاسخ؛ هر توکن فقط یک بار (حتی با پاسخ غلط). reason: missing | invalid | expired */
    verify(id, answer) {
      const parts = String(id || "").split(".");
      const ans = normalizeAnswer(answer);
      if (parts.length !== 4 || !parts[0] || !ans) return { ok: false, reason: String(id || "") && String(answer ?? "").trim() ? "invalid" : "missing" };
      const [exp, nonce, ah, sig] = parts;
      if (!eq(sig, hmac(key, `t:${exp}.${nonce}.${ah}`))) return { ok: false, reason: "invalid" };
      if (Number(exp) < now()) return { ok: false, reason: "expired" };
      if (used.has(nonce)) return { ok: false, reason: "invalid" };
      used.set(nonce, Number(exp));
      return eq(ah, hmac(key, `a:${nonce}:${ans}`)) ? { ok: true } : { ok: false, reason: "invalid" };
    },
  };
}

/** فقط برای تست: پاسخ یک چالش را با آزمودن همهٔ حالت‌ها (۱۰۰ هزار HMAC) پیدا می‌کند؛ نیازمند کلید سرور (JWT_SECRET). */
export function solveForTest(cfg, id) {
  const key = crypto.createHash("sha256").update(`captcha:${cfg.jwtSecret}`).digest();
  const [, nonce, ah] = String(id).split(".");
  for (let i = 0; i < 10 ** DIGITS; i++) { const a = String(i).padStart(DIGITS, "0"); if (hmac(key, `a:${nonce}:${a}`) === ah) return a; }
  return "";
}
