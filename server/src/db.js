import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// تاریخ (date) به‌صورت رشتهٔ YYYY-MM-DD، bigint و numeric به‌صورت عدد برگردند (مبلغ‌ها عدد صحیح ایمن هستند).
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => { const n = Number(v); if (!Number.isSafeInteger(n)) throw new Error("bigint خارج از بازهٔ ایمن"); return n; });
pg.types.setTypeParser(1700, (v) => Number(v));

// گزینهٔ ssl کتابخانهٔ pg از تنظیمات. حالت verify همیشه rejectUnauthorized:true است (گواهی و نام میزبان بررسی می‌شود).
export function buildPgSsl(cfg) {
  if (!cfg.dbSsl || cfg.dbSsl === "off") return undefined;
  if (cfg.dbSsl === "no-verify") return { rejectUnauthorized: false };
  if (cfg.dbSsl !== "verify") throw new Error("DB_SSL نامعتبر");
  const ssl = { rejectUnauthorized: true };
  if (cfg.dbSslCaFile) {
    try { ssl.ca = fs.readFileSync(cfg.dbSslCaFile, "utf8"); }
    catch (e) { throw new Error(`خواندن DB_SSL_CA_FILE ممکن نیست (${cfg.dbSslCaFile}): ${e.code || e.message}`); }
  } else if (cfg.dbSslCa) ssl.ca = cfg.dbSslCa;
  return ssl;
}

export function createPool(cfg) {
  const pool = new pg.Pool({
    connectionString: cfg.databaseUrl, max: cfg.dbPoolMax, ssl: buildPgSsl(cfg),
    idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, application_name: "cafino-api",
    // سقف زمان‌ها در سمت پایگاه‌داده: پرس‌وجوی رها‌شده، انتظار قفل بی‌پایان، و تراکنشِ «باز و بیکار» (نشتِ اتصال) نمی‌گذارند Pool پر شود
    statement_timeout: cfg.dbStatementTimeoutMs ?? 15000, lock_timeout: cfg.dbLockTimeoutMs ?? 10000, idle_in_transaction_session_timeout: cfg.dbIdleTxTimeoutMs ?? 60000,
  });
  // اتصال بیکار که پایگاه‌داده آن را ببندد (ری‌استارت/فیل‌اور) رویداد error می‌دهد؛ بدون شنونده کل فرایند می‌افتاد. pg خودش اتصال خراب را از استخر برمی‌دارد.
  pool.on("error", (err) => { if (process.env.NODE_ENV !== "test") console.error("pg pool idle client error:", err.code || err.message); });
  return pool;
}

// اجرای چند دستور در یک تراکنش؛ با خطا همه برگردانده می‌شود.
// تراکنش؛ با retries>0 در برابر بن‌بست (40P01) و شکست سریال‌سازی (40001) خودکار و کامل از نو اجرا می‌شود.
// فقط برای کارهایی که همهٔ اثرشان داخل همین تراکنش دیتابیس است (بدون ایمیل/فراخوانی بیرونی) استفاده شود.
export async function tx(pool, fn, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      try { await c.query("ROLLBACK"); } catch { /* اتصال خراب */ }
      if ((e?.code === "40P01" || e?.code === "40001") && attempt < retries) { await new Promise((ok) => setTimeout(ok, 8 * 2 ** attempt + Math.random() * 25)); continue; }
      throw e;
    } finally { c.release(); }
  }
}

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

// مهاجرت‌ها به ترتیب نام اجرا می‌شوند، هرکدام یک بار؛ قفل مشورتی از اجرای هم‌زمان دو نمونه جلوگیری می‌کند.
export async function migrate(pool, log = () => {}, { appRole = "", upTo = "" } = {}) {   // upTo: فقط تا این پیشوند نام (مثلاً "004") — برای بنچمارک پیش/پس و تست‌ها
  const c = await pool.connect();
  try {
    await c.query("SET lock_timeout = 0");          // مهاجرت ممکن است پشت نمونهٔ دیگر منتظر قفل بماند یا ایندکس بزرگ بسازد؛ سقف lock_timeout عادی برایش مناسب نیست
    await c.query("SET statement_timeout = 0");
    await c.query("SELECT pg_advisory_lock(7461001)");
    await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && (!upTo || f.slice(0, upTo.length) <= upTo)).sort();
    const ran = [];
    for (const f of files) {
      if (done.has(f)) continue;
      await c.query("BEGIN");
      try {
        await c.query(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
        await c.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]);
        await c.query("COMMIT");
        ran.push(f); log(`migration applied: ${f}`);
      } catch (e) { await c.query("ROLLBACK"); throw new Error(`migration ${f} failed: ${e.message}`); }
    }
    // نقش محدود API (APP_DB_ROLE): دسترسی‌ها پس از هر مهاجرت دوباره اعمال می‌شود تا جدول‌های تازه هم پوشش داده شوند
    if (appRole) {
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRole)) throw new Error("APP_DB_ROLE نامعتبر است");
      await c.query("SELECT cafino_apply_app_grants($1)", [appRole]); log(`grants applied: ${appRole}`);
    }
    return ran;
  } finally {
    try { await c.query("SELECT pg_advisory_unlock(7461001)"); await c.query("RESET lock_timeout"); await c.query("RESET statement_timeout"); } catch { /* ignore */ }
    c.release();
  }
}
