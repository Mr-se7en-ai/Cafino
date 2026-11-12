# راهنمای استقرار Production روی Ubuntu (22.04 / 24.04) — کافینو 1.75.0

> وضعیت راستی‌آزمایی (صادقانه): اسکریپت‌های `backup.sh`، `restore.sh`، `db-roles.sh`، `healthcheck.sh` و راه‌اندازی API با نقش محدود **روی PostgreSQL 16.15 واقعی اجرا و آزموده شده‌اند**. `docker-compose.yml` با `docker compose config` اعتبارسنجی شده، اما **کانتینرها در محیط توسعه اجرا نشدند** (daemon داکر نبود)، و **HTTPS/Caddy و ufw روی سرور واقعی آزموده نشده‌اند**. پیش از تحویل به مشتری، یک بار کل راهنما را روی یک VPS آزمایشی اجرا کنید.

## ۰) پیش‌نیازها
- Ubuntu 22.04/24.04، دست‌کم ۲ vCPU، ۲ گیگ RAM، ۲۰ گیگ دیسک (برای ≈۱۰۰ هزار فاکتور: دیتابیس چند صد مگابایت).
- یک دامنه که به IP سرور اشاره کند (برای HTTPS). Node.js روی میزبان لازم نیست (داخل ایمیج Docker است: `node:22`)، اما برای بیلد برنامه (`npm run build`) باید **Node ≥ 22.12** باشد (`.nvmrc` = 22).

## ۱) نصب Docker و ابزارها
```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg git ufw logrotate postgresql-client
curl -fsSL https://get.docker.com | sudo sh            # Docker Engine + compose plugin
sudo systemctl enable --now docker
```

## ۲) دریافت کد و ساخت خروجی تأییدشده
```bash
sudo mkdir -p /opt/cafino && sudo chown $USER /opt/cafino && cd /opt/cafino
# سورس 1.75.0 را اینجا باز کنید (zip → /opt/cafino)
npm ci && npm run build && npm run verify:dist       # dist/pwa ، dist/electron ، dist/manifest.json (هش SHA-256 همهٔ فایل‌ها)
```
اگر `verify:dist` خطا بدهد (فایل کم/اضافه/هش اشتباه/ناهماهنگی نسخه) **انتشار نکنید**.

## ۳) تنظیمات
```bash
cd server && cp .env.example .env && chmod 600 .env
# مقدارها: JWT_SECRET=$(openssl rand -hex 48)  POSTGRES_PASSWORD=$(openssl rand -hex 24)  APP_DB_PASSWORD=$(openssl rand -hex 24)
# با HTTPS:  COOKIE_SECURE=true  TRUST_PROXY=1   (و در deploy/trusted-proxies.conf:  set_real_ip_from 172.16.0.0/12;)
node deploy/make-csp.mjs ../dist/pwa
```
هیچ رازی در Frontend/`config.js` نباید باشد؛ فقط `.env` سرور (دسترسی 600).

## ۴) راه‌اندازی
```bash
docker compose up -d --build
docker compose ps                                      # db, api, web باید healthy باشند
docker compose exec api node scripts/create-admin.mjs admin@example.com 'رمز-طولانی-و-قوی'
curl -s http://127.0.0.1:8080/healthz                  # {"ok":true}
```
- معماری: `web (nginx)` ← فقط `127.0.0.1:8080` منتشر می‌شود؛ `api` و `db` روی شبکهٔ internal‌اند و هرگز publish نمی‌شوند.
- API با نقش **cafino_app** (بدون DELETE/TRUNCATE/DDL روی جدول‌های مالی) کار می‌کند و مهاجرت‌ها با نقش مالک (`MIGRATION_DATABASE_URL`) اجرا می‌شوند.
- **ارتقا از نسخهٔ قدیمی با پایگاه‌دادهٔ موجود:** نقش را یک‌بار بسازید: `APP_DB_PASSWORD=… sh deploy/db-roles.sh` (قبل از آن حتماً پشتیبان بگیرید). مهاجرت 005 روی جدول بزرگ برای لحظاتی نوشتن را قفل می‌کند؛ زمان آن به حجم داده بستگی دارد (اندازه‌گیری نشده)، پس در ساعت کم‌کاری انجام دهید.

## ۵) HTTPS (Caddy روی میزبان)
```bash
sudo apt-get install -y caddy && sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile   # دامنه را عوض کنید
sudo systemctl reload caddy
```
گواهی Let's Encrypt خودکار گرفته و تمدید می‌شود؛ HSTS در همان فایل است.

## ۶) فایروال
```bash
SSH_PORT=22 sudo sh deploy/ufw.sh                      # فقط 22/80/443
```
Docker از ufw عبور می‌کند؛ به همین دلیل compose فقط روی loopback منتشر می‌کند. بررسی: `sudo ss -tlnp | grep -E ':(5432|8080)'` ← 5432 نباید روی 0.0.0.0 باشد، 8080 فقط روی 127.0.0.1.

## ۷) پشتیبان‌گیری (Backup)
```bash
sudo mkdir -p /var/backups/cafino && sudo chmod 700 /var/backups/cafino
# cron روزانه ساعت ۳ (کاربر عضو گروه docker):
( crontab -l 2>/dev/null; echo '0 3 * * * /opt/cafino/server/deploy/backup.sh >> /var/log/cafino-backup.log 2>&1' ) | crontab -
sudo touch /var/log/cafino-backup.log /var/log/cafino-health.log && sudo chown $USER /var/log/cafino-*.log
```
- خروجی: `cafino-YYYY-MM-DD-HHMMSS.dump` (فرمت custom pg_dump) + `.sha256` + `LAST_OK`.
- بررسی خودکار هر پشتیبان: خواندنی‌بودن (`pg_restore --list`)، حداقل ۱۵ جدول، SHA-256؛ در غیر این صورت کد خروج ≠ ۰ و فایل ناقص نگه داشته نمی‌شود.
- نگهداری: ۱۴ روز (`KEEP_DAYS`)، هرگز کمتر از ۳ نسخه (`KEEP_MIN`).
- **بیرون از سرور** (ضروری): `OFFSITE_CMD='rclone copy "$1" remote:cafino-backups/'` و برای رمزنگاری `BACKUP_GPG_RECIPIENT=<کلید عمومی>` را در cron بگذارید.
- حالت بدون Docker (PostgreSQL روی میزبان/ابر): `DB_EXEC="" PGHOST=… PGUSER=… PGPASSWORD=… sh deploy/backup.sh`.

## ۸) بازیابی (Restore)
۱) **تمرین بازیابی** (تولید دست نمی‌خورد؛ ماهی یک‌بار انجام دهید):
```bash
sh deploy/restore.sh /var/backups/cafino/cafino-….dump       # روی پایگاه‌دادهٔ موقت cafino_restore_check
```
شمارش جدول‌ها، تطبیق «مانده حساب‌ها = جمع دفتر کل» و فعال‌بودن تریگرهای محافظ مالی را گزارش می‌دهد و پایگاه‌دادهٔ موقت را پاک می‌کند (`--keep` برای نگه‌داشتن).
۲) **بازیابی روی تولید** (فاجعه):
```bash
sh deploy/restore.sh /var/backups/cafino/cafino-….dump --into-production
```
تأیید تایپی می‌گیرد؛ SHA-256 را می‌سنجد؛ **پشتیبان اضطراری** از وضعیت فعلی می‌سازد (اگر ساخته نشود متوقف می‌شود)، `api` و `web` را می‌خواباند، بازیابی و راستی‌آزمایی می‌کند و دوباره بالا می‌آورد. روی سرور تازه (پایگاه‌دادهٔ خالی): ابتدا `docker compose up -d db`، سپس همین دستور.
۳) پس از بازیابی: ورود مدیر → «بررسی یکپارچگی مالی» (`GET /api/integrity`)؛ و `GET /api/audit/verify` برای زنجیرهٔ هش حسابرسی.
- مهاجرت‌های جدیدتر از پشتیبان هنگام بالا آمدن API خودکار اعمال می‌شوند؛ پشتیبان جدیدتر از نسخهٔ نرم‌افزار (مهاجرتِ ناشناس) باید با نسخهٔ جدیدتر نرم‌افزار بازیابی شود.

## ۹) مانیتورینگ و Health Check
```bash
( crontab -l; echo '*/5 * * * * /opt/cafino/server/deploy/healthcheck.sh >> /var/log/cafino-health.log 2>&1 || true' ) | crontab -
sh deploy/healthcheck.sh ; echo $?        # 0=OK 1=WARN 2=CRIT
```
می‌سنجد: `/healthz` از بیرون، `/readyz` داخلی (دیتابیس + تعداد مهاجرت‌ها + صف Pool)، سن آخرین پشتیبان (≤۲۶ ساعت)، فضای دیسک (هشدار ۸۰٪/بحرانی ۹۲٪)، اتصال‌های PostgreSQL، تراکنش‌های بیش از ۶۰ ثانیه. برای هشدار بیرونی خروجی را به Uptime-Kuma (push) یا `mail` بدهید.
- لاگ کندی PostgreSQL (≥ ۵۰۰ms)، انتظار قفل و فایل موقت بزرگ: `docker compose logs db | grep -E "duration|still waiting"`.
- تنظیمات سقف‌ها: `DB_STATEMENT_TIMEOUT_MS` / `DB_LOCK_TIMEOUT_MS` / `DB_IDLE_TX_TIMEOUT_MS` و `REPORT_CACHE_TTL_MS` (`.env.example`).

## ۱۰) چرخش لاگ
- لاگ کانتینرها: `json-file` با سقف ۱۰MB×۵ در `docker-compose.yml`.
- لاگ cron میزبان: `sudo cp deploy/logrotate-cafino /etc/logrotate.d/cafino` (هفتگی، ۸ نسخه، فشرده).

## ۱۱) به‌روزرسانی نسخه
1) `deploy/backup.sh` ؛ 2) سورس جدید + `npm run build && npm run verify:dist` ؛ 3) `node deploy/make-csp.mjs ../dist/pwa` ؛ 4) `docker compose up -d --build` (مهاجرت‌ها خودکار، با قفل مشورتی و `schema_migrations`) ؛ 5) `curl /readyz` ← نسخه و تعداد مهاجرت. بازگشت: `restore.sh … --into-production` با پشتیبان همان لحظه.

## ۱۲) فهرست بررسی نهایی
- [ ] `docker compose ps` همه healthy · [ ] `ss -tlnp` فقط 22/80/443 و 127.0.0.1:8080 · [ ] `.env` با 600 · [ ] HTTPS و `COOKIE_SECURE=true` · [ ] cron پشتیبان + `LAST_OK` تازه · [ ] یک تمرین بازیابی موفق · [ ] نسخهٔ بیرون از سرور · [ ] `healthcheck.sh` خروجی 0.
