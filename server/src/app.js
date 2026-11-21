import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { HttpError, forbidden, unauthorized } from "./lib/errors.js";
import { verifyAccess } from "./lib/security.js";
import { createMailer } from "./lib/mailer.js";
import { registerAuth } from "./routes/auth.js";
import { registerResources } from "./routes/resources.js";
import { registerIntegrity } from "./routes/integrity.js";
import { registerInbox } from "./routes/inbox.js";
import { registerAdmin } from "./routes/admin.js";
import { registerUsers } from "./routes/users.js";
import { registerReports } from "./routes/reports.js";
import { registerShifts } from "./routes/shifts.js";
import { registerBi } from "./routes/bi.js";
import fs from "node:fs";
import { createReportCache } from "./lib/reportCache.js";
import { registerNews } from "./routes/news.js";
import { registerPermissions } from "./routes/permissions.js";
import { registerUploads } from "./routes/uploads.js";
import { registerBots } from "./routes/bots.js";
import { registerSms } from "./routes/sms.js";
import { createBotService } from "./lib/bots.js";
import { registerMiniapp } from "./routes/miniapp.js";
import { createMiniappBot } from "./lib/miniappBot.js";
import { createCafeBots } from "./lib/miniappCafeBots.js";
import { registerMiniappCafeBots } from "./routes/miniappCafeBots.js";
import { createPermissionService } from "./lib/permissions.js";

const PG_ERRORS = {
  "23505": [409, "conflict", "رکورد تکراری است"], "23503": [422, "invalid_reference", "ارجاع به رکورد ناموجود"],
  "23514": [422, "validation_error", "مقدار ناسازگار با قواعد داده"], "22P02": [422, "validation_error", "قالب مقدار نامعتبر است"],
  "22003": [422, "validation_error", "عدد خارج از محدوده است"], "57014": [503, "timeout", "پایگاه‌داده دیر پاسخ داد؛ دوباره تلاش کنید"],
};

// عدد N = «به N هاپ اعتماد کن» (قراردادِ proxy-addr: IP کاربر = اولین آدرسی که پراکسی مورد اعتماد نیست).
// گزینهٔ عددی خود Fastify رفتار متفاوتی دارد، پس تابع صریح می‌دهیم. فهرست CIDR/preset مستقیم پاس داده می‌شود.
export const trustProxyOption = (v) => (typeof v === "number" ? (_addr, i) => i < v : v);

const SERVER_VERSION = (() => { try { return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version; } catch { return "unknown"; } })();

export async function buildApp(cfg, { pool, logger = true, smsClient } = {}) {
  const app = Fastify({
    logger: logger ? { level: cfg.logLevel, redact: { paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"], censor: "[حذف شد]" } } : false,
    trustProxy: trustProxyOption(cfg.trustProxy), bodyLimit: cfg.bodyLimit, requestTimeout: 30000, connectionTimeout: 30000, keepAliveTimeout: 65000,
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.decorate("cfg", cfg);
  app.decorate("pool", pool);
  app.decorate("mailer", createMailer(cfg, app.log));
  app.decorate("smsClient", smsClient || null);          // فقط تست: جایگزین کلاینت ملی پیامک
  app.removeContentTypeParser("text/plain");        // فقط JSON: فرم‌های بین‌سایتی (text/plain) هرگز پردازش نمی‌شوند → ۴۱۵

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: "cross-origin" }, hsts: cfg.production });
  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || cfg.corsOrigins.includes(origin)),
    credentials: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], maxAge: 600,
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Cafe-Id", "X-Organization-Id", "X-Branch-Id"],
    exposedHeaders: ["Idempotency-Replayed", "Retry-After"],
  });
  await app.register(rateLimit, { global: true, max: cfg.rateLimitMax, timeWindow: "1 minute", errorResponseBuilder: (_, ctx) => { const e = new HttpError(429, "rate_limited", "تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید"); e.retryAfter = Math.ceil(ctx.ttl / 1000); return e; } });

  // ── جلوگیری از CSRF: درخواست مرورگریِ تغییردهنده فقط از مبدأ مجاز (هم‌مبدأ یا CORS_ORIGINS). کلاینت بدون Origin (ابزار/سرور) با توکن کار می‌کند ──
  app.addHook("onRequest", async (req) => {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    let host = ""; try { host = new URL(origin).host; } catch { throw forbidden("مبدأ درخواست نامعتبر است", "bad_origin"); }
    if (cfg.corsOrigins.includes(origin) || host === req.headers.host) return;
    throw forbidden("مبدأ درخواست مجاز نیست", "bad_origin");
  });

  // ── احراز هویت ───────────────────────────────────────────────────────────────────────────────────────────────────
  async function tryAuthenticate(req) {
    if (req.user) return req.user;
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : req.cookies?.cafino_at;
    if (!token) return null;
    const p = await verifyAccess(cfg, token);
    if (!p?.sub) return null;
    const r = await pool.query("SELECT u.id,u.email,u.role,u.org_id,u.cafe_id,u.is_active,u.must_change_password,c.status AS cafe_status FROM users u LEFT JOIN cafes c ON c.id=u.cafe_id WHERE u.id=$1", [p.sub]);
    const u = r.rows[0];
    if (!u || !u.is_active) return null;
    req.user = { id: u.id, email: u.email, role: u.role, orgId: u.org_id, cafeId: u.cafe_id, cafeStatus: u.cafe_status, mustChange: u.must_change_password };
    return req.user;
  }
  app.decorate("tryAuthenticate", tryAuthenticate);
  app.decorate("authenticate", async (req) => { if (!(await tryAuthenticate(req))) throw unauthorized(); });
  app.decorate("requireCafe", ({ allowSuspended = false } = {}) => async (req) => {
    await app.authenticate(req);
    if (!req.user.cafeId) throw forbidden("این مسیر مخصوص کافی‌نت است");
    if (req.user.mustChange) throw forbidden("ابتدا رمز موقت را تغییر دهید", "password_change_required");
    if (!allowSuspended && req.user.cafeStatus === "suspended") throw forbidden("اشتراک این کافی‌نت تعلیق شده است", "cafe_suspended");
  });
  const perms = createPermissionService({ pool, cfg });
  app.decorate("perms", perms);
  // حافظهٔ نهان گزارش + ابطال: هر درخواست نوشتنیِ این کافی‌نت (بعد از commit، پیش از ارسال پاسخ) نسخهٔ گزارش‌ها را بالا می‌برد
  const reportCache = createReportCache({ ttlMs: cfg.reportCacheTtlMs ?? 15000 });
  app.decorate("reportCache", reportCache);
  app.addHook("onSend", async (req, reply, payload) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && req.user?.cafeId) reportCache.invalidate(req.user.cafeId);
    return payload;
  });
  app.decorate("requirePerm", (...keys) => perms.require(app, ...keys));         // ورود به کافی‌نت + داشتن (یکی از) مجوزها
  app.decorate("requireRole", (roles) => async (req) => { if (!roles.includes(req.user?.role)) throw forbidden(); });
  app.decorate("requireAdmin", async (req) => { await app.authenticate(req); if (req.user.role !== "platform_admin") throw forbidden("فقط مدیر پنل مرکزی"); });

  // ── خطاها: قالب ثابت { error: { code, message } }؛ جزئیات داخلی هرگز به کلاینت نمی‌رود ─────────────────────────────────────────
  app.setErrorHandler((err, req, reply) => {
    let status = 500, code = "internal_error", message = "خطای داخلی سرور", details;
    if (err instanceof HttpError) ({ status, code, message, details } = err);
    else if (err.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") { status = 415; code = "unsupported_media_type"; message = "فقط application/json پذیرفته می‌شود"; }
    else if (err.code === "FST_ERR_CTP_BODY_TOO_LARGE") { status = 413; code = "payload_too_large"; message = "حجم درخواست زیاد است"; }
    else if (err.statusCode === 400 || err.code?.startsWith?.("FST_ERR_CTP")) { status = 400; code = "bad_request"; message = "درخواست نامعتبر است (JSON نادرست)"; }
    else if (err.statusCode === 429) { status = 429; code = "rate_limited"; message = "تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید"; }
    else if (PG_ERRORS[err.code]) [status, code, message] = PG_ERRORS[err.code];
    if (status >= 500) req.log.error({ err, reqId: req.id }, "unhandled error"); else req.log.info({ code, status }, message);
    if (err.retryAfter) reply.header("Retry-After", String(err.retryAfter));
    return reply.code(status).send({ error: { code, message, ...(details ? { details } : {}), ...(status >= 500 ? { requestId: req.id } : {}) } });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: { code: "not_found", message: "مسیر ناشناخته" } }));

  app.get("/healthz", { config: { rateLimit: false } }, async () => ({ ok: true }));
  // آمادگی (فقط داخلی؛ nginx آن را بیرون نمی‌دهد): دیتابیس در دسترس، همهٔ مهاجرت‌ها اعمال شده، نسخه و وضعیت Pool — برای Docker healthcheck و مانیتورینگ
  app.get("/readyz", { config: { rateLimit: false } }, async (req, reply) => {
    try {
      const m = await pool.query("SELECT count(*)::int AS n, max(name) AS last FROM schema_migrations");
      return { ok: true, version: SERVER_VERSION, migrations: m.rows[0].n, lastMigration: m.rows[0].last, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }, reportCache: app.reportCache.stats() };
    } catch { return reply.code(503).send({ ok: false }); }
  });
  registerAuth(app);
  registerResources(app);
  registerIntegrity(app);
  registerInbox(app);
  registerUsers(app);
  registerReports(app);
  registerShifts(app);
  registerBi(app);
  registerNews(app);
  registerPermissions(app);
  await registerUploads(app);
  const bots = createBotService({ pool, cfg, log: app.log });
  app.decorate("bots", bots);
  app.addHook("onClose", async () => bots.stop());
  await registerBots(app, bots);
  const cafeBots = createCafeBots({ pool, cfg, log: app.log });      // ربات‌های اختصاصی کافی‌نت‌ها (1.86)
  app.decorate("miniappCafeBots", cafeBots);
  app.addHook("onClose", async () => cafeBots.stop());
  const miniBot = createMiniappBot({ pool, cfg, log: app.log, cafeBots });
  app.decorate("miniappBot", miniBot);
  app.addHook("onClose", async () => miniBot.stop());
  await registerMiniapp(app, miniBot);
  await registerMiniappCafeBots(app, miniBot, cafeBots);
  await registerSms(app, smsClient ? { client: smsClient } : {});
  registerAdmin(app);
  return app;
}
