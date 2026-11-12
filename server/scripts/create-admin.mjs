// ساخت (یا بازنشانی رمز) مدیر پنل مرکزی:  node scripts/create-admin.mjs admin@example.com 'رمز-قوی-و-طولانی'
import { loadConfig } from "../src/config.js";
import { createPool, migrate } from "../src/db.js";
import { hashPassword, passwordProblem, validEmail } from "../src/lib/security.js";
const [email, password] = [String(process.argv[2] || "").toLowerCase(), process.argv[3] || process.env.ADMIN_PASSWORD || ""];
if (!validEmail(email)) { console.error("استفاده: node scripts/create-admin.mjs <email> <password>"); process.exit(1); }
const pp = passwordProblem(password, email); if (pp) { console.error(pp); process.exit(1); }
const cfg = loadConfig(); const pool = createPool(cfg);
try {
  await migrate(pool);
  const hash = await hashPassword(password);
  const r = await pool.query(
    "INSERT INTO users(email,password_hash,role,first_name) VALUES ($1,$2,'platform_admin','مدیر') ON CONFLICT (email) DO UPDATE SET password_hash=$2, is_active=true, failed_logins=0, locked_until=NULL WHERE users.role='platform_admin' RETURNING id", [email, hash]);
  console.log(r.rows[0] ? `مدیر پنل مرکزی آماده است: ${email}` : "این ایمیل متعلق به کاربر کافی‌نت است و تغییر نکرد");
} finally { await pool.end(); }
