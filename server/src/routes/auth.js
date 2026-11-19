import crypto from "node:crypto";
// احراز هویت: ورود/ثبت‌نام/نشست (کوکی HttpOnly + توکن حافظه‌ای)، چرخش refresh، بازیابی و تغییر رمز.
import { audit } from "../lib/audit.js";
import { tx } from "../db.js";
import { HttpError, badRequest, conflict, invalid, unauthorized } from "../lib/errors.js";
import { DUMMY_HASH, hashPassword, passwordProblem, randomCode, randomToken, safeEqual, sha256, signAccess, validEmail, verifyPassword } from "../lib/security.js";
import { toText } from "../lib/validate.js";
import { createLoginGuard } from "../lib/loginCaptcha.js";

const MAX_FAILS = 8, LOCK_MIN = 15;
export const ROLE_PERMISSIONS = {
  owner: ["*"], manager: ["sales.*", "customers.*", "inventory.*", "reports.read", "settings.write", "users.manage", "invoices.void"],
  staff: ["sales.create", "customers.read", "customers.write", "inventory.read", "orders.*"], platform_admin: ["admin.*"],
};

export function publicUser(u) {
  return {
    id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, phone: u.phone, role: u.role,
    isOwner: u.role === "owner", organizationId: u.org_id, branchId: u.cafe_id, cafeId: u.cafe_id,
    permissions: ROLE_PERMISSIONS[u.role] || [], mustChangePassword: u.must_change_password,
  };
}

// سیاست کار آفلاین که سرور به کلاینت می‌دهد: مدیر/مالک مدت بیشتری از کارمند؛ عملیات حساس مالی هرگز آفلاین نیست.
export function offlinePolicyFor(u, cfg) {
  const owner = u.role === "owner" || u.role === "platform_admin";
  return { maxAgeSec: owner ? cfg.offlineMaxAgeOwnerSec : cfg.offlineMaxAgeStaffSec, sensitiveOps: "online-only" };
}

export function registerAuth(app) {
  const { pool, cfg } = app;
  // grants = مجوزهای مؤثر (lib/permissions.js) برای تصمیم UI؛ اعمال واقعی همیشه سمت سرور است
  const withPolicy = async (u) => ({ ...publicUser(u), grants: u.cafe_id ? (await app.perms.forUser({ id: u.id, role: u.role, cafeId: u.cafe_id })).list : [], offlinePolicy: offlinePolicyFor(u, cfg) });
  const cookieBase = { httpOnly: true, secure: cfg.cookieSecure, sameSite: cfg.cookieSameSite, path: "/" };

  async function issueSession(c, user, req, reply, familyId) {
    const access = await signAccess(cfg, user);
    const refresh = randomToken(48);
    await c.query("INSERT INTO refresh_tokens(user_id,family_id,token_hash,expires_at,user_agent,ip) VALUES ($1,$2,$3,now() + ($4 || ' seconds')::interval,$5,$6)",
      [user.id, familyId || crypto.randomUUID(), sha256(refresh), String(cfg.refreshTtlSec), String(req.headers["user-agent"] || "").slice(0, 200), String(req.ip).slice(0, 64)]);
    reply.setCookie("cafino_at", access, { ...cookieBase, maxAge: cfg.accessTtlSec });
    reply.setCookie("cafino_rt", refresh, { ...cookieBase, path: "/api/auth", maxAge: cfg.refreshTtlSec });
    return { accessToken: access, expiresIn: cfg.accessTtlSec, user: await withPolicy(user) };
  }
  const clearCookies = (reply) => { reply.clearCookie("cafino_at", cookieBase); reply.clearCookie("cafino_rt", { ...cookieBase, path: "/api/auth" }); };
  const rate = (max) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });
  const guard = createLoginGuard(cfg);   // کپچای ورود (فقط بعد از چند شکست)

  // ── ثبت‌نام (در تولید پیش‌فرض بسته؛ کافی‌نت‌ها را پنل مرکزی می‌سازد) ───────────────────────────────────────────────────────
  app.post("/api/auth/register", rate(cfg.authRateLimitMax), async (req, reply) => {
    if (!cfg.allowRegistration) throw new HttpError(403, "registration_closed", "ثبت‌نام عمومی بسته است؛ با مدیر سیستم تماس بگیرید");
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) throw invalid("ایمیل نامعتبر است");
    const pp = passwordProblem(b.password, email); if (pp) throw invalid(pp);
    const hash = await hashPassword(b.password);
    const result = await tx(pool, async (c) => {
      const dup = await c.query("SELECT 1 FROM users WHERE email=$1", [email]);
      if (dup.rows[0]) throw conflict("این ایمیل قبلاً ثبت شده است", "email_taken");
      const shopName = toText(b.shopName, { max: 120, key: "shopName" }) || "کافی‌نت من";
      const org = (await c.query("INSERT INTO organizations(name) VALUES ($1) RETURNING id", [shopName])).rows[0];
      const cafe = (await c.query("INSERT INTO cafes(org_id,name) VALUES ($1,$2) RETURNING id", [org.id, shopName])).rows[0];
      const user = (await c.query(
        "INSERT INTO users(org_id,cafe_id,email,password_hash,first_name,last_name,phone,role) VALUES ($1,$2,$3,$4,$5,$6,$7,'owner') RETURNING *",
        [org.id, cafe.id, email, hash, toText(b.firstName, { max: 100, key: "firstName" }), toText(b.lastName, { max: 100, key: "lastName" }), toText(b.phone, { max: 30, key: "phone" })])).rows[0];
      await audit(c, { cafeId: cafe.id, userId: user.id, action: "auth.register", entity: "user", entityId: user.id, ip: req.ip });
      return issueSession(c, user, req, reply);
    });
    return reply.code(201).send({ data: result });
  });

  // ── کپچای ورود: چالش بدون وضعیت (توکن امضاشده)، هر توکن یک‌بارمصرف و ۵ دقیقه‌ای ─────────────────────────────────────────────
  app.get("/api/auth/captcha", rate(30), async (req, reply) => {
    if (!guard.enabled) return reply.code(404).send({ error: { code: "not_found", message: "کپچا فعال نیست" } });
    reply.header("Cache-Control", "no-store");
    return { data: guard.challenge() };
  });

  // ── ورود: قفل موقت پس از چند اشتباه، زمان پاسخ برای ایمیل ناموجود هم یکسان ────────────────────────────────────────────────────
  app.post("/api/auth/login", rate(cfg.authRateLimitMax), async (req, reply) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!validEmail(email) || !password || password.length > 128) throw unauthorized("ایمیل یا رمز عبور درست نیست");
    // کپچا فقط بعد از چند شکست (برای همان IP یا همان ایمیل — یکسان برای ایمیل موجود/ناموجود)؛ قبل از بررسی رمز تا ابزار حدس رمز نشود.
    // پاسخ غلط کپچا «شکست رمز» حساب نمی‌شود، پس کسی نمی‌تواند با ارسال کپچای غلط حساب دیگری را قفل کند.
    if (guard.required(req.ip, email)) {
      const v = guard.verify(req.body?.captchaId, req.body?.captchaAnswer);
      if (!v.ok) throw new HttpError(403, v.reason === "missing" ? "captcha_required" : "captcha_invalid", v.reason === "missing" ? "برای ادامه، کد تصویر را وارد کنید" : v.reason === "expired" ? "کد تصویر منقضی شده است؛ کد جدید را وارد کنید" : "کد تصویر درست نیست؛ کد جدید را وارد کنید");
    }
    const u = (await pool.query("SELECT u.*, c.status AS cafe_status FROM users u LEFT JOIN cafes c ON c.id = u.cafe_id WHERE u.email=$1", [email])).rows[0];
    const locked = u?.locked_until && new Date(u.locked_until) > new Date();
    const ok = await verifyPassword(password, u?.password_hash || DUMMY_HASH);
    if (!u || locked || !ok || !u.is_active) {
      guard.fail(req.ip, email);
      if (u && !locked && !ok) {
        const r = await pool.query("UPDATE users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END WHERE id=$1 RETURNING failed_logins", [u.id, MAX_FAILS, String(LOCK_MIN)]);
        if (r.rows[0].failed_logins === MAX_FAILS) await tx(pool, (c) => audit(c, { cafeId: u.cafe_id, userId: u.id, action: "auth.locked", entity: "user", entityId: u.id, ip: req.ip }));
      }
      if (locked) throw new HttpError(429, "account_locked", "حساب برای چند دقیقه قفل شده است؛ بعداً دوباره تلاش کنید");
      throw unauthorized("ایمیل یا رمز عبور درست نیست");
    }
    if (u.cafe_status === "suspended") throw new HttpError(403, "cafe_suspended", "اشتراک این کافی‌نت تعلیق شده است");
    guard.success(email);
    const result = await tx(pool, async (c) => {
      await c.query("UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=now() WHERE id=$1", [u.id]);
      await audit(c, { cafeId: u.cafe_id, userId: u.id, action: "auth.login", entity: "user", entityId: u.id, ip: req.ip });
      return issueSession(c, u, req, reply);
    });
    return { data: result };
  });

  // ── چرخش refresh: هر توکن یک‌بارمصرف است؛ استفادهٔ دوبارهٔ توکن باطل‌شده یعنی سرقت → کل خانواده باطل ───────────────────────────
  async function rotate(req, reply) {
    const token = req.cookies?.cafino_rt || (typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "");
    if (!token) throw unauthorized("نشست پیدا نشد");
    return tx(pool, async (c) => {
      const row = (await c.query("SELECT * FROM refresh_tokens WHERE token_hash=$1 FOR UPDATE", [sha256(token)])).rows[0];
      if (!row) throw unauthorized("نشست نامعتبر است");
      if (row.revoked_at) {
        await c.query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id=$1", [row.family_id]);
        await c.query("COMMIT"); await c.query("BEGIN");
        throw unauthorized("نشست نامعتبر شد؛ دوباره وارد شوید");
      }
      if (new Date(row.expires_at) < new Date()) throw unauthorized("نشست منقضی شده است");
      const u = (await c.query("SELECT u.*, c.status AS cafe_status FROM users u LEFT JOIN cafes c ON c.id = u.cafe_id WHERE u.id=$1", [row.user_id])).rows[0];
      if (!u || !u.is_active) throw unauthorized("حساب غیرفعال است");
      if (u.cafe_status === "suspended") throw new HttpError(403, "cafe_suspended", "اشتراک این کافی‌نت تعلیق شده است");
      await c.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id=$1", [row.id]);
      return issueSession(c, u, req, reply, row.family_id);
    });
  }
  app.post("/api/auth/refresh", rate(cfg.authRateLimitMax * 3), async (req, reply) => ({ data: await rotate(req, reply) }));

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies?.cafino_rt;
    if (token) await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash=$1) AND revoked_at IS NULL", [sha256(token)]);
    clearCookies(reply);
    return reply.code(204).send();
  });

  // me: اگر توکن دسترسی منقضی شده ولی refresh معتبر است (بازکردن دوبارهٔ برنامه)، همین‌جا نشست تازه صادر می‌شود
  app.get("/api/auth/me", async (req, reply) => {
    let user = await app.tryAuthenticate(req);
    let session = null;
    if (!user && req.cookies?.cafino_rt) {
      session = await rotate(req, reply);
      return { data: { ...session.user, accessToken: session.accessToken } };
    }
    if (!user) throw unauthorized();
    const u = (await pool.query("SELECT * FROM users WHERE id=$1", [user.id])).rows[0];
    return { data: await withPolicy(u) };
  });

  app.post("/api/auth/password", { preHandler: app.authenticate }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body || {};
    const u = (await pool.query("SELECT * FROM users WHERE id=$1", [req.user.id])).rows[0];
    if (!(await verifyPassword(String(currentPassword || ""), u.password_hash))) throw new HttpError(403, "wrong_password", "رمز فعلی درست نیست");
    const pp = passwordProblem(newPassword, u.email); if (pp) throw invalid(pp);
    const hash = await hashPassword(newPassword);
    const result = await tx(pool, async (c) => {
      await c.query("UPDATE users SET password_hash=$2, must_change_password=false, failed_logins=0 WHERE id=$1", [u.id, hash]);
      await c.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id=$1 AND revoked_at IS NULL", [u.id]);     // همهٔ دستگاه‌های دیگر خارج می‌شوند
      await audit(c, { cafeId: u.cafe_id, userId: u.id, action: "auth.password_change", entity: "user", entityId: u.id, ip: req.ip });
      return issueSession(c, { ...u, must_change_password: false }, req, reply);
    });
    return { data: result };
  });

  // ── فراموشی رمز: همیشه ۲۰۲ (وجود ایمیل لو نمی‌رود)؛ کد ۸رقمی ۱۵ دقیقه‌ای، حداکثر ۵ تلاش ──────────────────────────────────────────
  app.post("/api/auth/forgot-password", rate(5), async (req, reply) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (validEmail(email)) {
      const u = (await pool.query("SELECT id, email, is_active FROM users WHERE email=$1", [email])).rows[0];
      if (u?.is_active) {
        const code = randomCode(8);
        await pool.query("UPDATE password_resets SET used_at = now() WHERE user_id=$1 AND used_at IS NULL", [u.id]);
        await pool.query("INSERT INTO password_resets(user_id,code_hash,expires_at) VALUES ($1,$2,now() + interval '15 minutes')", [u.id, sha256(`${u.id}:${code}`)]);
        app.mailer.send({ to: u.email, subject: "کد بازیابی رمز عبور کافینو", text: `کد بازیابی شما: ${code}\nاین کد ۱۵ دقیقه معتبر است. اگر شما درخواست نکرده‌اید این پیام را نادیده بگیرید.` }).catch((e) => req.log.error({ err: e }, "mail failed"));
      }
    }
    return reply.code(202).send({ data: { ok: true } });
  });

  app.post("/api/auth/reset-password", rate(10), async (req, reply) => {
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase();
    const code = String(b.code || b.token || "").trim();
    const newPassword = b.newPassword || b.password;
    const fail = () => new HttpError(400, "invalid_code", "کد نامعتبر یا منقضی شده است");
    if (!validEmail(email) || !/^\d{8}$/.test(code)) throw fail();
    const pp = passwordProblem(newPassword, email); if (pp) throw invalid(pp);
    const hash = await hashPassword(newPassword);
    await tx(pool, async (c) => {
      const u = (await c.query("SELECT * FROM users WHERE email=$1 AND is_active", [email])).rows[0];
      if (!u) throw fail();
      const r = (await c.query("SELECT * FROM password_resets WHERE user_id=$1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [u.id])).rows[0];
      if (!r || r.attempts >= 5) throw fail();
      if (!safeEqual(r.code_hash, sha256(`${u.id}:${code}`))) {
        await c.query("UPDATE password_resets SET attempts = attempts + 1 WHERE id=$1", [r.id]);
        await c.query("COMMIT"); await c.query("BEGIN");
        throw fail();
      }
      await c.query("UPDATE password_resets SET used_at = now() WHERE id=$1", [r.id]);
      await c.query("UPDATE users SET password_hash=$2, must_change_password=false, failed_logins=0, locked_until=NULL WHERE id=$1", [u.id, hash]);
      await c.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id=$1 AND revoked_at IS NULL", [u.id]);
      await audit(c, { cafeId: u.cafe_id, userId: u.id, action: "auth.password_reset", entity: "user", entityId: u.id, ip: req.ip });
    });
    return reply.code(204).send();
  });
  void badRequest;
}
