// ورود و تأیید با کد پیامکی (ملی پیامک، حساب «پلتفرم» از env):
//   GET  /api/auth/sms/config   — کلاینت می‌فهمد گزینهٔ پیامک فعال است یا نه
//   POST /api/auth/sms/send     — ارسال کد (login | register)؛ کپچا همیشه لازم است (هر پیامک پول است)
//   POST /api/auth/sms/login    — ورود با شمارهٔ تأییدشده + کد
//   POST /api/auth/phone/send   — (واردشده) ارسال کد برای تأیید شمارهٔ خود
//   POST /api/auth/phone/verify — تأیید شماره (بعد از آن ورود با پیامک ممکن می‌شود)
// امنیت: کد ۶رقمی فقط به‌صورت HMAC ذخیره می‌شود، ۵ دقیقه اعتبار، حداکثر ۵ حدس برای هر کد، یک‌بارمصرف (اتمیک)،
// سقف ارسال برای هر شماره/IP در ساعت، فاصلهٔ بین دو ارسال، پاسخ یکسان برای شمارهٔ ثبت‌شده و ناشناخته (جلوگیری از شمارش حساب‌ها).
import crypto from "node:crypto";
import { audit } from "../lib/audit.js";
import { tx } from "../db.js";
import { HttpError, conflict, invalid, unauthorized } from "../lib/errors.js";
import { randomCode, safeEqual } from "../lib/security.js";
import { createMeliClient, maskMobile, normalizeMobile, toLatinDigits, SmsError } from "../lib/sms.js";

const MAX_ATTEMPTS = 5;

export function createOtpService({ pool, cfg, log, client = createMeliClient(cfg) }) {
  const key = crypto.hkdfSync("sha256", Buffer.from(cfg.jwtSecret || "", "utf8"), Buffer.from("cafino-sms-otp-v1"), Buffer.from("hmac"), 32);
  const mac = (phone, purpose, code) => crypto.createHmac("sha256", Buffer.from(key)).update(`${phone}:${purpose}:${code}`).digest("hex");
  const DUMMY = mac("09000000000", "login", "000000");
  const platformOn = () => cfg.smsPlatformOn;

  async function deliver(phone, code) {
    const auth = { username: cfg.smsUsername, password: cfg.smsPassword };
    if (cfg.smsOtpBodyId) return client.sendPattern({ ...auth, bodyId: cfg.smsOtpBodyId, to: phone, args: [code] });
    const min = Math.round(cfg.smsOtpTtlSec / 60);
    return client.send({ ...auth, from: cfg.smsFrom, to: phone, text: `کد تأیید کافینو: ${code}\nاین کد تا ${min} دقیقه معتبر است. آن را به کسی نگویید.` });
  }

  /** @returns {{expiresIn:number, resendIn:number}} ؛ برای login با شمارهٔ ناشناخته (userId=null) ردیف ساخته می‌شود ولی پیامکی نمی‌رود */
  async function issue({ purpose, phone, userId = null, ip = "", send = true }) {
    const recent = await pool.query(
      `SELECT count(*) FILTER (WHERE phone = $1)::int AS by_phone,
              count(*) FILTER (WHERE ip = $2)::int AS by_ip,
              max(created_at) FILTER (WHERE phone = $1 AND purpose = $3) AS last_at
         FROM sms_otps WHERE created_at > now() - interval '1 hour' AND (phone = $1 OR ip = $2)`, [phone, ip, purpose]);
    const r = recent.rows[0];
    if (r.last_at) {
      const wait = Math.ceil(cfg.smsOtpResendSec - (Date.now() - new Date(r.last_at).getTime()) / 1000);
      if (wait > 0) { const e = new HttpError(429, "sms_wait", `برای ارسال دوبارهٔ کد ${wait} ثانیه صبر کنید`); e.retryAfter = wait; throw e; }
    }
    if (r.by_phone >= cfg.smsOtpMaxPerHour || (ip && r.by_ip >= cfg.smsOtpMaxPerIpHour)) { const e = new HttpError(429, "sms_limit", "تعداد درخواست کد زیاد است؛ بعداً دوباره تلاش کنید"); e.retryAfter = 600; throw e; }
    const code = randomCode(6);
    await pool.query("UPDATE sms_otps SET used_at = now() WHERE phone=$1 AND purpose=$2 AND used_at IS NULL", [phone, purpose]);
    const ins = await pool.query("INSERT INTO sms_otps(purpose,phone,user_id,code_hash,expires_at,ip) VALUES ($1,$2,$3,$4,now() + ($5 || ' seconds')::interval,$6) RETURNING id",
      [purpose, phone, userId, mac(phone, purpose, code), String(cfg.smsOtpTtlSec), String(ip).slice(0, 64)]);
    if (send) {
      try { await deliver(phone, code); }
      catch (e) {
        await pool.query("UPDATE sms_otps SET used_at = now() WHERE id=$1", [ins.rows[0].id]);
        log?.error?.({ code: e?.code, phone: maskMobile(phone) }, "sms otp delivery failed");
        if (e instanceof SmsError && e.fatal) throw new HttpError(503, "sms_unavailable", "سرویس پیامک موقتاً در دسترس نیست؛ با مدیر سیستم تماس بگیرید");
        throw new HttpError(502, "sms_send_failed", "ارسال پیامک ناموفق بود؛ چند لحظه بعد دوباره تلاش کنید");
      }
    }
    return { expiresIn: cfg.smsOtpTtlSec, resendIn: cfg.smsOtpResendSec };
  }

  /** اتمیک: شمارندهٔ حدس را می‌افزاید، مقایسه می‌کند و در صورت درستی کد را مصرف می‌کند. @returns {{ok:boolean,userId?:string|null}} */
  async function consume({ purpose, phone, code }) {
    const c = toLatinDigits(code).trim();
    const row = (await pool.query(
      `UPDATE sms_otps SET attempts = attempts + 1
        WHERE id = (SELECT id FROM sms_otps WHERE phone=$1 AND purpose=$2 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1)
          AND attempts < $3 RETURNING id, code_hash, user_id`, [phone, purpose, MAX_ATTEMPTS])).rows[0];
    const good = /^\d{6}$/.test(c) && safeEqual(row?.code_hash || DUMMY, mac(phone, purpose, c)) && Boolean(row);
    if (!good) return { ok: false };
    const used = await pool.query("UPDATE sms_otps SET used_at = now() WHERE id=$1 AND used_at IS NULL RETURNING id", [row.id]);
    return used.rows[0] ? { ok: true, userId: row.user_id } : { ok: false };
  }
  return { platformOn, issue, consume, mac };
}

export function registerSmsAuth(app, { guard, issueSession, rate }) {
  const { pool, cfg } = app;
  const otp = createOtpService({ pool, cfg, log: app.log, client: app.smsClient || undefined });
  app.decorate("smsOtp", otp);
  const loginOn = () => cfg.smsPlatformOn && cfg.smsLoginEnabled;
  const registerOn = () => cfg.smsPlatformOn && cfg.smsRegisterVerify && cfg.allowRegistration;
  const off = () => new HttpError(404, "sms_disabled", "ورود با پیامک فعال نیست");
  const phoneOf = (v) => { const p = normalizeMobile(v); if (!p) throw invalid("شمارهٔ موبایل معتبر نیست (مثلاً ۰۹۱۲۳۴۵۶۷۸۹)"); return p; };
  const captchaGate = (b) => {
    const v = guard.verify(b?.captchaId, b?.captchaAnswer);
    if (!v.ok) throw new HttpError(403, v.reason === "missing" ? "captcha_required" : "captcha_invalid", v.reason === "missing" ? "برای ارسال کد، کد تصویر را وارد کنید" : v.reason === "expired" ? "کد تصویر منقضی شده است؛ کد جدید را وارد کنید" : "کد تصویر درست نیست؛ کد جدید را وارد کنید");
  };

  app.get("/api/auth/sms/config", rate(60), async () => ({ data: { login: loginOn(), register: registerOn(), codeLength: 6, expiresIn: cfg.smsOtpTtlSec, resendIn: cfg.smsOtpResendSec } }));

  app.post("/api/auth/sms/send", rate(10), async (req, reply) => {
    const b = req.body || {};
    const purpose = b.purpose === "register" ? "register" : "login";
    if (purpose === "login" ? !loginOn() : !registerOn()) throw off();
    const phone = phoneOf(b.phone);
    captchaGate(b);
    let userId = null, send = true;
    if (purpose === "login") {
      const u = (await pool.query("SELECT id, is_active FROM users WHERE phone_norm=$1", [phone])).rows[0];
      userId = u?.is_active ? u.id : null; send = Boolean(userId);          // شمارهٔ ناشناخته: همان پاسخ، ولی پیامکی نمی‌رود
    } else if ((await pool.query("SELECT 1 FROM users WHERE phone_norm=$1", [phone])).rows[0]) {
      throw conflict("این شماره قبلاً برای حساب دیگری ثبت شده است", "phone_taken");
    }
    const r = await otp.issue({ purpose, phone, userId, ip: req.ip, send });
    return reply.code(202).send({ data: { ok: true, ...r } });
  });

  app.post("/api/auth/sms/login", rate(cfg.authRateLimitMax), async (req, reply) => {
    if (!loginOn()) throw off();
    const phone = phoneOf(req.body?.phone);
    const bad = () => unauthorized("کد نادرست یا منقضی شده است");
    const r = await otp.consume({ purpose: "login", phone, code: req.body?.code });
    const u = r.ok ? (await pool.query("SELECT u.*, c.status AS cafe_status FROM users u LEFT JOIN cafes c ON c.id = u.cafe_id WHERE u.phone_norm=$1", [phone])).rows[0] : null;
    if (!r.ok || !u || u.id !== r.userId || !u.is_active) throw bad();
    if (u.locked_until && new Date(u.locked_until) > new Date()) throw new HttpError(429, "account_locked", "حساب برای چند دقیقه قفل شده است؛ بعداً دوباره تلاش کنید");
    if (u.cafe_status === "suspended") throw new HttpError(403, "cafe_suspended", "اشتراک این کافی‌نت تعلیق شده است");
    const result = await tx(pool, async (c) => {
      await c.query("UPDATE users SET last_login_at=now() WHERE id=$1", [u.id]);      // failed_logins عمداً صفر نمی‌شود (حملهٔ رمز همچنان قفل می‌کند)
      await audit(c, { cafeId: u.cafe_id, userId: u.id, action: "auth.login_sms", entity: "user", entityId: u.id, ip: req.ip });
      return issueSession(c, u, req, reply);
    });
    return { data: result };
  });

  // ── تأیید شمارهٔ موبایل حساب (واردشده) ───────────────────────────────────────────────────────────────────────────────
  app.post("/api/auth/phone/send", { preHandler: app.authenticate, ...rate(5) }, async (req, reply) => {
    if (!cfg.smsPlatformOn) throw off();
    const phone = phoneOf(req.body?.phone);
    const other = (await pool.query("SELECT id FROM users WHERE phone_norm=$1 AND id <> $2", [phone, req.user.id])).rows[0];
    if (other) throw conflict("این شماره قبلاً برای حساب دیگری تأیید شده است", "phone_taken");
    const r = await otp.issue({ purpose: "verify", phone, userId: req.user.id, ip: req.ip });
    return reply.code(202).send({ data: { ok: true, ...r } });
  });
  app.post("/api/auth/phone/verify", { preHandler: app.authenticate, ...rate(10) }, async (req) => {
    if (!cfg.smsPlatformOn) throw off();
    const phone = phoneOf(req.body?.phone);
    const r = await otp.consume({ purpose: "verify", phone, code: req.body?.code });
    if (!r.ok || r.userId !== req.user.id) throw new HttpError(400, "invalid_code", "کد نادرست یا منقضی شده است");
    await tx(pool, async (c) => {
      try { await c.query("UPDATE users SET phone=$2, phone_norm=$2, phone_verified_at=now() WHERE id=$1", [req.user.id, phone]); }
      catch (e) { if (e.code === "23505") throw conflict("این شماره قبلاً برای حساب دیگری تأیید شده است", "phone_taken"); throw e; }
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "auth.phone_verified", entity: "user", entityId: req.user.id, details: { phone: maskMobile(phone) }, ip: req.ip });
    });
    return { data: { ok: true, phone } };
  });
}
