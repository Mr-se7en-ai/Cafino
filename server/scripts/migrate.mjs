import { loadConfig } from "../src/config.js";
import { createPool, migrate } from "../src/db.js";
const cfg = loadConfig();
if (!cfg.databaseUrl) { console.error("DATABASE_URL تنظیم نشده است"); process.exit(1); }
const pool = createPool(cfg);
try { const ran = await migrate(pool, console.log); console.log(ran.length ? `انجام شد (${ran.length} مهاجرت)` : "پایگاه‌داده به‌روز است"); } finally { await pool.end(); }
