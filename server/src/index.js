import { loadConfig } from "./config.js";
import { createPool, migrate } from "./db.js";
import { buildApp } from "./app.js";
import { sweepExpired } from "./lib/uploads.js";

const cfg = loadConfig();
if (cfg.problems.length) {
  console.error("❌ تنظیمات نادرست:\n - " + cfg.problems.join("\n - "));
  process.exit(1);
}
const pool = createPool(cfg);
const app = await buildApp(cfg, { pool });
for (const w of cfg.warnings || []) app.log.warn(`⚠️ ${w}`);
app.log.info({ trustProxy: cfg.trustProxy, dbSsl: cfg.dbSsl }, "امنیت شبکه");
if (process.env.AUTO_MIGRATE !== "false") {
  // با MIGRATION_DATABASE_URL مهاجرت با نقش مالک اجرا می‌شود و برنامه با نقش محدود (بدون DELETE/TRUNCATE/DDL روی جدول‌های مالی) کار می‌کند
  const mp = cfg.migrationDatabaseUrl ? createPool({ ...cfg, databaseUrl: cfg.migrationDatabaseUrl, dbPoolMax: 1 }) : pool;
  try { await migrate(mp, (m) => app.log.info(m), { appRole: cfg.appDbRole }); } finally { if (mp !== pool) await mp.end(); }
}

// پاکسازی دوره‌ای دادهٔ موقت (کلیدهای Idempotency، توکن‌های منقضی، کدهای بازیابی)
const cleanup = setInterval(() => {
  pool.query("DELETE FROM idempotency_keys WHERE created_at < now() - ($1 || ' hours')::interval", [String(cfg.idempotencyTtlHours)])
    .then(() => pool.query("DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'"))
    .then(() => pool.query("DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'"))
    .catch((e) => app.log.error({ err: e }, "cleanup failed"));
}, 3600 * 1000);
cleanup.unref();
// حذف فایل‌های دریافتی منقضی (retention_days هر کافی‌نت) — هر ساعت و یک‌بار پس از راه‌اندازی
const sweep = () => sweepExpired(pool, cfg, (m) => app.log.warn(m)).then((n) => { if (n) app.log.info(`${n} فایل دریافتی منقضی پاک شد`); }).catch((e) => app.log.error({ err: e }, "upload sweep failed"));
setTimeout(sweep, 30_000).unref(); setInterval(sweep, 3600 * 1000).unref();

const shutdown = async (sig) => {
  app.log.info(`${sig}: خاموشی تمیز`);
  try { await app.close(); await pool.end(); } finally { process.exit(0); }
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => { app.log.error({ err: e }, "unhandledRejection"); });

await app.listen({ port: cfg.port, host: cfg.host });
app.miniappBot.start();
app.miniappCafeBots.start();   // ربات‌های مینی‌اپ اختصاصی کافی‌نت‌ها (بدون ردیف، کاری نمی‌کند)
   // ربات مشترک مینی‌اپ تلگرام (بدون MINIAPP_BOT_TOKEN خاموش است)
app.bots.start();   // گزارش‌های زمان‌بندی‌شده و فرمان‌های ربات بله/تلگرام (BOTS_ENABLED=false → خاموش)
