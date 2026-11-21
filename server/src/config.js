import net from "node:net";
// تنظیمات فقط از متغیرهای محیطی (.env.example). در حالت production اگر چیز خطرناکی تنظیم نشده باشد، سرور بالا نمی‌آید.
const env = process.env;
const bool = (v, d) => (v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => { const n = Number(v); return Number.isFinite(n) && v !== undefined && v !== "" ? n : d; };
const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

// ── Trust Proxy ───────────────────────────────────────────────────────────────────────────
// فقط به هاپ‌هایی اعتماد می‌کنیم که واقعاً پراکسی خودمان‌اند؛ هدر X-Forwarded-For را نمی‌توان کورکورانه باور کرد.
//   خالی        → تولید: ۱ هاپ (nginx داخل docker-compose)، توسعه/تست: خاموش
//   false / 0   → خاموش (IP همان اتصال TCP است)
//   true        → ۱ هاپ (دیگر «اعتماد به همه» نیست)
//   عدد N       → N پراکسی مورد اعتماد
//   فهرست IP/CIDR/preset (loopback, linklocal, uniquelocal) → فقط این آدرس‌ها پراکسی‌اند و IP کاربر از راست‌ترین آدرس نامعتبر خوانده می‌شود
const PRESETS = new Set(["loopback", "linklocal", "uniquelocal"]);
function validProxyEntry(x) {
  if (PRESETS.has(x)) return true;
  const [ip, bits, ...rest] = x.split("/");
  const kind = net.isIP(ip);
  if (!kind || rest.length) return false;
  if (bits === undefined) return true;
  return /^\d{1,3}$/.test(bits) && Number(bits) <= (kind === 4 ? 32 : 128);
}
export function parseTrustProxy(v, production) {
  const raw = String(v ?? "").trim();
  if (raw === "") return { value: production ? 1 : false, problem: null };
  if (/^(0|false|no|off)$/i.test(raw)) return { value: false, problem: null };
  if (/^(true|yes|on)$/i.test(raw)) return { value: 1, problem: null };
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n > 5) return { value: 1, problem: "TRUST_PROXY بیش از ۵ هاپ غیرعادی است؛ تعداد واقعی پراکسی‌ها یا فهرست CIDR را بنویسید" };
    return { value: n || false, problem: null };
  }
  const items = list(raw);
  const bad = items.filter((x) => !validProxyEntry(x));
  if (bad.length) return { value: 1, problem: `TRUST_PROXY نامعتبر است (${bad.join(" ")}) — مقدار مجاز: false، عدد هاپ، یا فهرست IP/CIDR با ویرگول` };
  return { value: items, problem: null };
}

// ── PostgreSQL SSL ────────────────────────────────────────────────────────────────────────
//   false/off (پیش‌فرض)  → بدون TLS؛ فقط وقتی پایگاه‌داده داخل شبکهٔ خصوصی docker است
//   true/require/verify-full → TLS با «تأیید گواهی و نام میزبان» (rejectUnauthorized: true) — با DB_SSL_CA یا CA سیستم
//   no-verify            → TLS بدون تأیید (فقط برای آزمایش؛ در تولید خطا می‌دهد مگر DB_SSL_ALLOW_INSECURE=true)
export function parseDbSsl(v) {
  const raw = String(v ?? "").trim().toLowerCase();
  if (raw === "" || /^(0|false|no|off|disable)$/.test(raw)) return "off";
  if (/^(1|true|yes|on|require|verify-full|verify-ca)$/.test(raw)) return "verify";
  if (/^(no-verify|insecure)$/.test(raw)) return "no-verify";
  return "invalid";
}
const PRIVATE_HOST = /^(?:(?:localhost|db|postgres|\[?::1\]?)|(?:127|10)\.[\d.]+|192\.168\.[\d.]+|172\.(?:1[6-9]|2\d|3[01])\.[\d.]+|169\.254\.[\d.]+|[^.]+|.+\.(?:local|internal|lan|svc|cluster\.local))$/i;
export function dbHost(url) { try { return new URL(url).hostname; } catch { return ""; } }

export function loadConfig(source = env) {
  const e = source;
  const production = (e.NODE_ENV || "development") === "production";
  const cfg = {
    production,
    port: int(e.PORT, 8080),
    host: e.HOST || "0.0.0.0",
    databaseUrl: e.DATABASE_URL || "",
    migrationDatabaseUrl: e.MIGRATION_DATABASE_URL || "",          // اتصال مالکِ جدول‌ها فقط برای مهاجرت (اختیاری؛ توصیهٔ تولید)
    appDbRole: e.APP_DB_ROLE || "",                                 // نقش محدود برنامه؛ پس از مهاجرت دسترسی‌هایش اعمال می‌شود
    dbPoolMax: int(e.DB_POOL_MAX, 10),
    dbSsl: parseDbSsl(e.DB_SSL),                                    // off | verify | no-verify | invalid
    dbSslCaFile: e.DB_SSL_CA_FILE || "",                            // مسیر گواهی CA (PEM) — برای پایگاه‌دادهٔ با CA خصوصی
    dbSslCa: String(e.DB_SSL_CA || "").replace(/\\n/g, "\n"),        // یا خود PEM (با \n)
    dbSslAllowInsecure: bool(e.DB_SSL_ALLOW_INSECURE, false),
    jwtSecret: e.JWT_SECRET || "",
    accessTtlSec: int(e.ACCESS_TTL_SEC, 60 * 60),                 // ۱ ساعت
    refreshTtlSec: int(e.REFRESH_TTL_SEC, 30 * 24 * 3600),         // ۳۰ روز (چرخشی)
    paymentVoidMinRole: ["staff", "manager"].includes(String(e.PAYMENT_VOID_MIN_ROLE || "").toLowerCase()) ? String(e.PAYMENT_VOID_MIN_ROLE).toLowerCase() : "",   // خالی = بر اساس پروفایل (production: manager، توسعه/تست: staff) | staff | manager
    dbStatementTimeoutMs: Math.max(1000, Number(e.DB_STATEMENT_TIMEOUT_MS ?? 15000) || 15000),   // سقف زمان هر پرس‌وجو
    dbLockTimeoutMs: Math.max(0, Number(e.DB_LOCK_TIMEOUT_MS ?? 10000) || 0),                      // سقف انتظار برای قفل (۰ = نامحدود)
    dbIdleTxTimeoutMs: Math.max(0, Number(e.DB_IDLE_TX_TIMEOUT_MS ?? 60000) || 0),                 // تراکنشِ باز و بیکار بعد از این مدت بسته می‌شود
    reportCacheTtlMs: Math.max(0, Math.min(3600000, Number(e.REPORT_CACHE_TTL_MS ?? 15000) || 0)),   // عمر حافظهٔ نهان گزارش‌ها (ms)؛ ۰ = خاموش. ابطال در هر نوشتنِ همان کافی‌نت انجام می‌شود
    overpaymentPolicy: ["credit", "reject", "allow"].includes(String(e.OVERPAYMENT_POLICY || "").toLowerCase()) ? String(e.OVERPAYMENT_POLICY).toLowerCase() : "credit",   // پرداخت بیش از مانده فاکتور: credit (مازاد = اعتبار مشتری جدا) | reject | allow (رفتار قدیم)
    permissionProfile: ["strict", "compat"].includes(String(e.PERMISSION_PROFILE || "").toLowerCase()) ? String(e.PERMISSION_PROFILE).toLowerCase() : "",   // خالی = production→strict، غیر آن→compat
    newsHosts: list(e.NEWS_FEED_HOSTS).length ? list(e.NEWS_FEED_HOSTS).map((h) => h.toLowerCase()) : ["onlinecofe.ir", "www.onlinecofe.ir"],   // میزبان‌های مجاز فید «اخبار کافی‌نت» (پراکسی /api/news)
    corsOrigins: list(e.CORS_ORIGINS),                              // مبدأهای مجاز برنامه (اگر برنامه و API هم‌مبدأ نیستند)
    cookieSameSite: (e.COOKIE_SAMESITE || (list(e.CORS_ORIGINS).length ? "none" : "lax")).toLowerCase(),
    cookieSecure: bool(e.COOKIE_SECURE, production),
    allowRegistration: bool(e.ALLOW_REGISTRATION, !production),     // در تولید پیش‌فرض بسته: کافی‌نت‌ها را پنل مرکزی می‌سازد
    trustProxy: null,                                               // پایین‌تر با parseTrustProxy پر می‌شود
    bodyLimit: int(e.BODY_LIMIT_BYTES, 1024 * 1024),
    rateLimitMax: int(e.RATE_LIMIT_MAX, 600),                       // درخواست در دقیقه برای هر IP
    authRateLimitMax: int(e.AUTH_RATE_LIMIT_MAX, 20),               // ورود/بازیابی در دقیقه برای هر IP
    captchaAfterFails: Math.max(0, int(e.CAPTCHA_AFTER_FAILS, 3)),   // کپچای ورود بعد از این تعداد شکست (برای همان IP یا همان ایمیل)؛ ۰ = خاموش
    captchaWindowMin: Math.max(1, int(e.CAPTCHA_WINDOW_MIN, 15)),    // پنجرهٔ شمارش شکست‌ها (دقیقه)
    smtpUrl: e.SMTP_URL || "",
    mailFrom: e.MAIL_FROM || "کافینو <no-reply@localhost>",
    logLevel: e.LOG_LEVEL || (production ? "info" : "warn"),
    idempotencyTtlHours: int(e.IDEMPOTENCY_TTL_HOURS, 72),
    // سیاست نشست آفلاین (ثانیه): کلاینت پس از قطع اینترنت تا این مدت اجازهٔ ادامهٔ کار با هویت ذخیره‌شده دارد
    offlineMaxAgeOwnerSec: int(e.OFFLINE_SESSION_MAX_AGE_OWNER_SEC, 24 * 3600),
    offlineMaxAgeStaffSec: int(e.OFFLINE_SESSION_MAX_AGE_STAFF_SEC, 8 * 3600),
    // دریافت فایل از مشتری (QR): پوشهٔ ذخیره (در Docker یک volume)، سقف فضای هر کافی‌نت، سقف تعداد فایل در روز، سقف درخواست آپلود از هر IP در ساعت
    uploadDir: e.UPLOAD_DIR || "./data/uploads",
    uploadQuotaMb: Math.max(10, int(e.UPLOAD_CAFE_QUOTA_MB, 2048)),
    uploadDailyFiles: Math.max(1, int(e.UPLOAD_DAILY_FILES_PER_CAFE, 300)),
    uploadIpPerHour: Math.max(1, int(e.UPLOAD_IP_PER_HOUR, 30)),
    // ضدویروس ClamAV (clamd): با CLAMAV_HOST یا CLAMAV_SOCKET فعال می‌شود. UPLOAD_AV_MODE: off | optional | required (پیش‌فرض required اگر clamd تنظیم شده باشد)
    clamavHost: e.CLAMAV_HOST || "",
    clamavPort: int(e.CLAMAV_PORT, 3310),
    clamavSocket: e.CLAMAV_SOCKET || "",
    clamavTimeoutMs: Math.max(2000, int(e.CLAMAV_TIMEOUT_MS, 90000)),
    uploadAvMode: ["off", "optional", "required"].includes(String(e.UPLOAD_AV_MODE || "").toLowerCase()) ? String(e.UPLOAD_AV_MODE).toLowerCase() : ((e.CLAMAV_HOST || e.CLAMAV_SOCKET) ? "required" : "off"),
    publicBaseUrl: String(e.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),     // مثلاً https://cafino.example.com — برای نشانی کامل QR؛ خالی = کلاینت از مبدأ خودش می‌سازد
    // ربات بله/تلگرام (گزارش): BOTS_ENABLED=false کل زمان‌بند را خاموش می‌کند. نشانی API قابل‌تغییر است (مثلاً پراکسی معکوس برای تلگرام در شبکه‌ای که فیلتر است).
    botsEnabled: bool(e.BOTS_ENABLED, true),
    botPollIntervalMs: Math.max(2000, int(e.BOT_POLL_INTERVAL_MS, 6000)),
    telegramApiBase: String(e.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, ""),
    baleApiBase: String(e.BALE_API_BASE || "https://tapi.bale.ai").replace(/\/+$/, ""),
    botTokenKey: e.BOT_TOKEN_KEY || "",                              // کلید رمزنگاری توکن ربات‌ها؛ خالی = مشتق از JWT_SECRET (با تغییر JWT_SECRET باید ربات‌ها دوباره متصل شوند)
    botTz: e.BOT_TZ || "Asia/Tehran",                                // منطقهٔ زمانی «گزارش روزانه» و «امروز/دیروز»
    miniappToken: String(e.MINIAPP_BOT_TOKEN || "").trim(),            // توکن «یک ربات مشترک برای همهٔ کافی‌نت‌ها» (فقط env؛ هرگز در پایگاه‌داده/لاگ نیست). خالی = مینی‌اپ خاموش
    miniappUrl: String(e.MINIAPP_URL || (e.PUBLIC_BASE_URL ? String(e.PUBLIC_BASE_URL).replace(/\/+$/, "") + "/m" : "")).replace(/\/+$/, ""),   // نشانی HTTPS مینی‌اپ (تلگرام فقط HTTPS می‌پذیرد)
    miniappAuthMaxAgeSec: Math.max(60, int(e.MINIAPP_AUTH_MAX_AGE_SEC, 86400)),   // حداکثر عمر initData (auth_date)
    miniappSessionTtlSec: Math.max(60, int(e.MINIAPP_SESSION_TTL_SEC, 3600)),
    miniappAuthRatePerMin: Math.max(5, int(e.MINIAPP_AUTH_RATE_PER_MIN, 30)),
    miniappPollIntervalMs: Math.max(1000, int(e.MINIAPP_POLL_INTERVAL_MS, 3000)),
    miniappCafeBotsPerTick: Math.min(100, Math.max(1, int(e.MINIAPP_CAFE_BOTS_PER_TICK, 10))),   // ربات‌های اختصاصی کافی‌نت‌ها (1.86): در هر دور حداکثر چند ربات پرسش شوند
    // پیامک (ملی پیامک — melipayamak.com). حساب «پلتفرم» فقط از env می‌آید (هرگز در پایگاه‌داده/لاگ نیست) و برای کد ورود و تأیید موبایل در ثبت‌نام است.
    // پیامک به مشتریان از حساب خود هر کافی‌نت (تنظیمات ← اتصال ← پیامک؛ رمزنگاری‌شده) ارسال می‌شود و به این env وابسته نیست.
    smsUsername: String(e.MELIPAYAMAK_USERNAME || "").trim(),
    smsPassword: String(e.MELIPAYAMAK_PASSWORD || ""),
    smsFrom: String(e.MELIPAYAMAK_FROM || "").trim(),                // شمارهٔ خط ارسال (برای متن ساده)
    smsOtpBodyId: String(e.MELIPAYAMAK_OTP_BODY_ID || "").trim(),    // کد الگوی (پترن) ارسال کد؛ اگر خالی باشد از متن ساده با MELIPAYAMAK_FROM استفاده می‌شود
    smsApiBase: String(e.MELIPAYAMAK_API_BASE || "https://rest.payamak-panel.com/api/SendSMS").replace(/\/+$/, ""),
    smsOtpTtlSec: Math.max(60, int(e.SMS_OTP_TTL_SEC, 300)),
    smsOtpResendSec: Math.max(10, int(e.SMS_OTP_RESEND_SEC, 60)),
    smsOtpMaxPerHour: Math.max(1, int(e.SMS_OTP_MAX_PER_HOUR, 5)),   // برای هر شماره
    smsOtpMaxPerIpHour: Math.max(1, int(e.SMS_OTP_MAX_PER_IP_HOUR, 20)),
    smsTimeoutMs: Math.max(2000, int(e.MELIPAYAMAK_TIMEOUT_MS, 12000)),
    smsLoginEnabled: bool(e.SMS_LOGIN_ENABLED, true),                // ورود با کد پیامکی (فقط وقتی حساب پلتفرم تنظیم شده)
    smsRegisterVerify: bool(e.SMS_REGISTER_VERIFY, true),            // تأیید موبایل با کد در ثبت‌نام (فقط وقتی حساب پلتفرم تنظیم شده)
    referenceChecks: /^(off|false|0)$/i.test(String(e.REFERENCE_CHECKS || "")) ? "off" : "strict",   // strict: ارجاع به مشتری/فاکتور ناموجود رد می‌شود (یتیم‌ساز نیست)
  };
  const problems = [];
  cfg.smsPlatformOn = Boolean(cfg.smsUsername && cfg.smsPassword && (cfg.smsOtpBodyId || cfg.smsFrom));
  if (!cfg.databaseUrl) problems.push("DATABASE_URL تنظیم نشده است");
  if (!cfg.jwtSecret) problems.push("JWT_SECRET تنظیم نشده است");
  else if (cfg.jwtSecret.length < 32) problems.push("JWT_SECRET باید دست‌کم ۳۲ نویسه باشد (مثلاً: openssl rand -hex 48)");
  if (production && /^(change|secret|password|test)/i.test(cfg.jwtSecret)) problems.push("JWT_SECRET پیش‌فرض/ضعیف است");
  if (cfg.cookieSameSite === "none" && !cfg.cookieSecure) problems.push("COOKIE_SAMESITE=none بدون COOKIE_SECURE=true مرورگر قبول نمی‌کند");
  if (production && cfg.corsOrigins.includes("*")) problems.push("CORS_ORIGINS=* با کوکی ناسازگار و ناامن است");
  const tp = parseTrustProxy(e.TRUST_PROXY, production);
  cfg.trustProxy = tp.value;
  if (tp.problem) problems.push(tp.problem);
  if (cfg.dbSsl === "invalid") problems.push("DB_SSL نامعتبر است — مقدار مجاز: false | true | require | verify-full | no-verify");
  if (cfg.dbSsl === "no-verify" && production && !cfg.dbSslAllowInsecure) problems.push("DB_SSL=no-verify گواهی سرور را تأیید نمی‌کند (قابل شنود/جعل). از DB_SSL=true همراه DB_SSL_CA_FILE استفاده کنید، یا اگر آگاهانه می‌پذیرید DB_SSL_ALLOW_INSECURE=true بگذارید");
  if (cfg.dbSslCaFile && cfg.dbSsl === "off") problems.push("DB_SSL_CA_FILE تنظیم شده ولی DB_SSL=false است؛ احتمالاً می‌خواستید DB_SSL=true بگذارید");
  if (cfg.miniappToken && !/^\d{3,16}:[A-Za-z0-9_:-]{16,100}$/.test(cfg.miniappToken)) problems.push("MINIAPP_BOT_TOKEN قالب توکن ربات را ندارد (مثلاً 123456789:AA…)");
  if (cfg.miniappToken && cfg.miniappUrl && production && !/^https:\/\//i.test(cfg.miniappUrl)) problems.push("MINIAPP_URL باید HTTPS باشد (تلگرام مینی‌اپ غیر HTTPS را باز نمی‌کند)");
  if (!/^https:\/\//i.test(cfg.smsApiBase) && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(cfg.smsApiBase)) problems.push("MELIPAYAMAK_API_BASE باید HTTPS باشد (رمز حساب پیامک در درخواست می‌رود)");
  if ((cfg.smsUsername || cfg.smsPassword) && !cfg.smsPlatformOn) problems.push("حساب ملی پیامک ناقص است: MELIPAYAMAK_USERNAME و MELIPAYAMAK_PASSWORD و یکی از MELIPAYAMAK_OTP_BODY_ID یا MELIPAYAMAK_FROM لازم است");
  for (const k of ["offlineMaxAgeOwnerSec", "offlineMaxAgeStaffSec"]) if (cfg[k] < 300 || cfg[k] > 30 * 24 * 3600) problems.push(`OFFLINE_SESSION_MAX_AGE_* باید بین ۵ دقیقه و ۳۰ روز باشد (${k})`);
  // هشدارها: خطا نیستند ولی مدیر باید ببیند
  cfg.warnings = [];
  if (production && cfg.dbSsl === "off" && cfg.databaseUrl && !PRIVATE_HOST.test(dbHost(cfg.databaseUrl))) cfg.warnings.push(`اتصال به پایگاه‌داده (${dbHost(cfg.databaseUrl)}) بدون TLS است و به‌نظر شبکهٔ عمومی می‌آید — DB_SSL=true و DB_SSL_CA_FILE را تنظیم کنید`);
  if (production && cfg.trustProxy === false) cfg.warnings.push("TRUST_PROXY خاموش است: پشت پراکسی، IP همهٔ کاربران همان IP پراکسی دیده می‌شود (محدودکنندهٔ نرخ و لاگ حسابرسی بی‌اثر می‌شوند)");
  if (cfg.miniappToken && !cfg.miniappUrl) cfg.warnings.push("MINIAPP_BOT_TOKEN تنظیم است ولی MINIAPP_URL/PUBLIC_BASE_URL خالی است؛ ربات مینی‌اپ شروع نمی‌شود");
  cfg.problems = problems;
  return cfg;
}
