# راهنمای کامل استقرار کافینو (Production + Staging + CI/CD)

> مخاطب: حامد — از «خرید سرور» تا «انتشار خودکار از GitHub». همهٔ دستورها برای **Ubuntu 22.04/24.04** و قابل کپی‌اند.
> نسخهٔ راهنما: همراه نسخهٔ 1.87.0 (زیرساخت‌محور؛ بدون تغییر در کد برنامه).

## ⚠️ وضعیت راستی‌آزمایی — صادقانه بخوانید

این زیرساخت **روی سرور واقعی اجرا نشده است** (هنوز سروری خریداری نشده). آنچه انجام و آنچه انجام نشده:

| موضوع | وضعیت |
|---|---|
| نحو و کیفیت همهٔ اسکریپت‌ها (`bash -n` + `shellcheck`) و workflowها (`actionlint`) | ✅ بررسی شد |
| منطق استقرار/بازگشت/پشتیبان/پایش با **Docker و PostgreSQL ساختگی** (مسیر موفق، شکست سلامت ← بازگشت خودکار، مهاجرت بدون تأیید، بستهٔ مخدوش، پشتیبان ناموفق، retention، رمزنگاری) | ✅ تست خودکار (`src/tests/deployFlow.test.js`) |
| اعتبار `docker compose config` برای production، staging و ادغام override | ✅ |
| تست‌های برنامه (کلاینت و سرور روی PostgreSQL) | ✅ (نتایج دقیق در گزارش نهایی) |
| اجرای واقعی Docker، ساخت ایمیج، Caddy/Let's Encrypt، UFW، Fail2ban، sshd، `harden.sh` بدون `--dry-run` | ❌ **فقط روی سرور واقعی ممکن است** |
| اجرای واقعی GitHub Actions (CI، deploy، desktop-release) و اتصال SSH از GitHub به سرور | ❌ فقط روی GitHub واقعی |
| ساخت و اجرای نصب‌کنندهٔ ویندوز (Electron) | ❌ فقط روی ویندوز؛ تست دود بستهٔ واقعی تا اولین اجرای سبز «اطلاعاتی» است |

پس **اولین استقرار را با احتیاط و مرحله‌به‌مرحله انجام دهید**؛ احتمال دارد در اولین اجرا مشکلات کوچک محیطی (نام بسته، دسترسی شبکه، تنظیم DNS) ظاهر شود. هرجا چیزی شکست خورد، بخش ۱۶ (عیب‌یابی) را ببینید.

## فهرست
1. [مشخصات سرور](#۱-مشخصات-سرور) · 2. [خرید و آماده‌سازی Ubuntu](#۲-خرید-و-آمادهسازی-ubuntu) · 3. [SSH از ویندوز](#۳-اتصال-ssh-از-ویندوز) · 4. [GitHub Secrets](#۴-github-secrets-و-environmentها) · 5. [نصب Docker](#۵-نصب-docker) · 6. [دامنه](#۶-دامنه) · 7. [DNS](#۷-dns) · 8. [SSL](#۸-ssl-https) · 9. [نصب و اجرای اولیه](#۹-نصب-و-اجرای-اولیه) · 10. [مهاجرت دیتابیس](#۱۰-مهاجرت-دیتابیس) · 11. [راه‌اندازی CI/CD](#۱۱-راهاندازی-cicd) · 12. [اولین انتشار](#۱۲-اولین-انتشار-release) · 13. [سلامت سرور](#۱۳-بررسی-سلامت-سرور-و-پایش) · 14. [پشتیبان و بازیابی](#۱۴-پشتیبانگیری-و-بازیابی) · 15. [بازگشت (Rollback)](#۱۵-بازگشت-به-نسخهٔ-قبلی-rollback) · 16. [عیب‌یابی](#۱۶-عیبیابی)

## نقشهٔ کلی (چه چیزی کجاست)

```
اینترنت ──80/443──▶ Caddy (HTTPS خودکار، تنها کانتینر با پورت عمومی)
                      │  شبکهٔ docker «cafino-edge»
          ┌───────────┴────────────┐
   cafino-prod-web (nginx)   cafino-staging-web (nginx)       ← هر محیط یک پروژهٔ compose جدا
          │                        │
        api (Fastify)            api            ← شبکهٔ داخلی، بدون پورت عمومی
          │                        │
        db (PostgreSQL 16)       db             ← volume اختصاصی؛ پورت 5432 هرگز بیرون نمی‌رود
```

| مسیر روی سرور | محتوا |
|---|---|
| `/opt/cafino` | Production (پروژهٔ compose: `server`؛ volume داده: `server_dbdata`، آپلودها: `server_uploads`) |
| `/opt/cafino-staging` | Staging (پروژهٔ `cafino-staging`، پورت داخلی 8081، **ربات‌ها خاموش**) |
| `<محیط>/server/.env` | رازها (مجوز ۶۰۰؛ هرگز در مخزن/چت) |
| `<محیط>/.releases/` , `.deploy-state/` | سه انتشار اخیر + وضعیت (نسخهٔ فعال/قبلی، تاریخچه) برای بازگشت |
| `/var/backups/cafino` | پشتیبان‌های رمزنگاری‌شده (staging: `/var/backups/cafino-staging`) |
| `/etc/cafino/backup.pass` | رمز رمزنگاری پشتیبان‌ها (**یک نسخه جدا از سرور نگه دارید**) |
| `/etc/cafino/notify.env` | توکن اعلان بله/تلگرام/وب‌هوک |
| `/usr/local/sbin/cafino-ci-entry` | دروازهٔ SSH کلید CI (فقط فرمان‌های مجاز) |

فایل‌های زیرساخت در مخزن: `server/docker-compose.yml`، `server/Dockerfile`، `server/deploy/{install,harden,deploy,rollback,backup,restore,healthcheck,monitor,notify,ci-entry}.sh`، `scripts/make-release.sh`، `scripts/audit-gate.mjs`، `.github/workflows/{ci,deploy,rollback,desktop-release}.yml`، `.github/actions/deploy-bundle/action.yml`.

---

## ۱) مشخصات سرور

| سناریو | حداقل | پیشنهادی |
|---|---|---|
| فقط Production (چند کافی‌نت کوچک) | 2 vCPU، 2 GB RAM، 25 GB SSD | 2 vCPU، 4 GB RAM، 40 GB SSD |
| Production + Staging روی **یک** سرور | 2 vCPU، 4 GB RAM، 40 GB SSD | 4 vCPU، 8 GB RAM، 80 GB SSD |
| با ضدویروس ClamAV (`--with-clamav`) | +1 GB RAM | |

- سیستم‌عامل: **Ubuntu 24.04 LTS** (یا 22.04)، معماری x86_64.
- IP عمومی ثابت + دسترسی root یا sudo اولیه، و **کنسول وب (VNC/Rescue)** در پنل ارائه‌دهنده (برای وقتی SSH قفل شد).
- دیسک: پشتیبان‌ها و ایمیج‌های قدیمی فضا می‌گیرند؛ `healthcheck.sh` از ۸۰٪ پر بودن هشدار می‌دهد.
- شبکه: دسترسی خروجی به Docker Hub، npm، GitHub و Let's Encrypt لازم است. **اگر سرور داخل ایران است** معمولاً Docker Hub/npm/تلگرام مسدودند: از آینه (mirror) داخلی استفاده کنید (`NODE_IMAGE`, `NPM_REGISTRY`, `DOCKER_INSTALL_URL` در `install.sh`) و برای تلگرام پراکسی معکوس (`--telegram-api-base`). بله (Bale) مستقیم کار می‌کند.
- **توصیه:** برای دسترسی بهتر از GitHub Actions و خارج از ایران، سروری در اروپا (آلمان/هلند/فنلاند) سادهٔ‌تر است؛ اما کاربران ایران تأخیر بیشتری می‌بینند. تصمیم با شما.

## ۲) خرید و آماده‌سازی Ubuntu

1. سرور (VPS) را با Ubuntu 24.04 بسازید. ارائه‌دهنده معمولاً IP و رمز root می‌دهد (یا کلید SSH).
2. اگر گزینهٔ «افزودن کلید SSH» دارد، همان لحظه کلید عمومی مدیر (بخش ۳) را اضافه کنید.
3. **بک‌آپ/Snapshot** پنل ارائه‌دهنده را فعال کنید (لایهٔ اضافه؛ جایگزین پشتیبان برنامه نیست).
4. اولین ورود و به‌روزرسانی:
```bash
ssh root@IP-SERVER
apt-get update && apt-get -y upgrade && apt-get -y install git curl ca-certificates
timedatectl set-timezone Asia/Tehran     # اختیاری
reboot      # اگر kernel به‌روز شد
```
5. سخت‌سازی (بعد از اینکه ورود با کلید را آزمودید) در بخش ۳ و ۹.

## ۳) اتصال SSH از ویندوز

OpenSSH در Windows 10/11 نصب است (PowerShell):

```powershell
# ساخت کلید مدیر (رمز عبور برای کلید بگذارید)
ssh-keygen -t ed25519 -C "hamed-admin" -f $env:USERPROFILE\.ssh\cafino_admin
type $env:USERPROFILE\.ssh\cafino_admin.pub        # این یک خط، «کلید عمومی» است
# اولین ورود با رمز root (اگر ارائه‌دهنده رمز داده):
ssh root@IP-SERVER
```

**سخت‌سازی بدون قفل‌شدن** — روی سرور (دستور `harden.sh` پس از clone در بخش ۹ هست). ترتیب امن:
1. کلید عمومی مدیر را با `--admin-user/--admin-key` نصب کنید (ورود با رمز هنوز باز است).
2. **در یک پنجرهٔ دیگر** ورود با کلید را بیازمایید: `ssh -i $env:USERPROFILE\.ssh\cafino_admin hamed@IP-SERVER` و `sudo -n true`.
3. فقط پس از موفقیت، `--disable-password-login` را اجرا کنید. اگر قفل شدید: کنسول وب ارائه‌دهنده ← فایل `/etc/ssh/sshd_config.d/00-cafino-hardening.conf` را حذف کنید و `systemctl reload ssh`.

> `harden.sh` پورت SSH را عوض نمی‌کند، `ufw reset` نمی‌زند و بدون وجود کلید معتبر ورود با رمز را نمی‌بندد.

## ۴) GitHub Secrets و Environmentها

**الف) کلید استقرار CI** (روی کامپیوتر خودتان؛ بدون رمز چون CI باید بتواند بخواند، اما روی سرور «محدود به فرمان‌های استقرار» است):
```powershell
ssh-keygen -t ed25519 -N '""' -C "cafino-ci" -f $env:USERPROFILE\.ssh\cafino_ci
type $env:USERPROFILE\.ssh\cafino_ci.pub      # → به harden.sh روی سرور (--ci-key)
type $env:USERPROFILE\.ssh\cafino_ci          # → کل متن (با BEGIN/END) برای Secret DEPLOY_SSH_KEY
```
**ب) اثر انگشت سرور** (روی خود سرور، از نشست SSH معتبرتان):
```bash
echo "IP-SERVER $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"      # این یک خط = DEPLOY_KNOWN_HOSTS
# اگر پورت SSH غیر 22 است:  [IP-SERVER]:PORT ssh-ed25519 AAAA…
```
**ج) در GitHub** (مخزن `Cafino` ← Settings):
1. *Environments* ← New: **`staging`** و **`production`**. برای production: «Required reviewers» = خودتان (تأیید دستی هر انتشار) و (اختیاری) «Deployment branches: main».
2. هر Environment ← *Environment secrets*:

| Secret | مقدار |
|---|---|
| `DEPLOY_HOST` | IP یا نام سرور |
| `DEPLOY_SSH_KEY` | متن کامل کلید خصوصی `cafino_ci` |
| `DEPLOY_KNOWN_HOSTS` | خط بند ب |

3. هر Environment ← *Environment variables*: `PUBLIC_URL` (مثلاً `https://cafino.example.ir` برای production و `https://staging.cafino.example.ir` برای staging)، و در صورت نیاز `DEPLOY_PORT` (پیش‌فرض 22) و `DEPLOY_USER` (پیش‌فرض `cafino-deploy`).
4. *Repository variables* (Settings ← Secrets and variables ← Actions ← Variables): `STAGING_ENABLED=true` (اگر staging دارید) — و **در آخر** `DEPLOY_ENABLED=true`. تا این متغیر نباشد، هیچ استقرار انجام نمی‌شود.
5. *Branch protection* برای `main`: Require pull request + Require status check «verify» (CI).
6. هیچ رمز/کلید دیگری (دیتابیس، JWT، توکن ربات) **به GitHub نمی‌رود**؛ آن‌ها فقط در `.env` روی سرور هستند.

نکتهٔ امنیتی (صادقانه): چون بستهٔ انتشار شامل اسکریپت‌های اجراشده با root است، کسی که به مخزن/CI دسترسی نوشتن داشته باشد در عمل می‌تواند روی سرور کد اجرا کند. کاهش ریسک: Branch protection، Required reviewers روی production، فعال‌سازی 2FA حساب GitHub و نگه‌داشتن کلید CI فقط در Environment secrets. دروازهٔ `cafino-ci-entry` فقط پنج فرمان مجاز را می‌پذیرد و خودش با بسته به‌روز نمی‌شود.

## ۵) نصب Docker

`install.sh` Docker را خودش نصب می‌کند (بخش ۹). نصب دستی (اگر خواستید):
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker run --rm hello-world && docker compose version
```
اگر `get.docker.com` در دسترس نیست: بسته‌های `docker.io` و `docker-compose-v2` از مخزن Ubuntu را نصب کنید (`apt-get install -y docker.io docker-compose-v2 rsync`).

## ۶) دامنه

- یک دامنه (یا زیردامنه) بخرید، مثلاً `cafino.example.ir`؛ برای staging یک زیردامنه: `staging.cafino.example.ir`.
- برای HTTPS و مینی‌اپ تلگرام/بله، دامنه الزامی است. بدون دامنه فقط آزمایش با `--no-tls` (HTTP) ممکن است.

## ۷) DNS

در پنل DNS دامنه:

| نوع | نام | مقدار | توضیح |
|---|---|---|---|
| A | `cafino` (یا `@`) | IP سرور | Production |
| A | `staging.cafino` | IP سرور | Staging (اختیاری) |
| AAAA | همان‌ها | IPv6 سرور | فقط اگر IPv6 دارید و فایروال را برایش تنظیم کرده‌اید |

- اگر از Cloudflare استفاده می‌کنید رکورد را **DNS only (ابر خاکستری)** بگذارید تا Let's Encrypt بتواند گواهی بگیرد (یا بعداً حالت proxied را با دقت تنظیم کنید).
- انتشار DNS تا چند ساعت طول می‌کشد. بررسی: `dig +short cafino.example.ir` باید IP سرور را بدهد. `install.sh` هم پیش از ادامه این را می‌سنجد.

## ۸) SSL (HTTPS)

- **Caddy** (کانتینر `cafino-caddy`) گواهی Let's Encrypt را **خودکار می‌گیرد و تمدید می‌کند**؛ کاری لازم نیست. فقط پورت‌های 80 و 443 باید باز و دامنه به سرور اشاره کند.
- هدرهای امنیتی (HSTS، CSP، …) و ترتیب پراکسی در `server/deploy/nginx.conf` و Caddyfile تولیدشده (`server/deploy/local/Caddyfile` و `sites.d/*.caddy`) هستند.
- پایش گواهی: `healthcheck.sh` هر ۵ دقیقه روزهای باقی‌ماندهٔ گواهی را می‌سنجد: ≤۱۴ روز هشدار، ≤۵ روز بحرانی (به بله/تلگرام اعلان می‌رود).
- مشکل گواهی: `docker logs cafino-caddy --tail 100` (معمولاً DNS غلط، پورت 80 بسته، یا سقف نرخ Let's Encrypt).
- Staging با همان Caddy و گواهی جدا برای زیردامنهٔ خودش کار می‌کند (قطعهٔ `sites.d/staging.caddy` با هدر noindex).

## ۹) نصب و اجرای اولیه

روی سرور (به‌عنوان root یا با sudo):

```bash
# ۱) سورس (مخزن خصوصی است: توکن «فقط‌خواندنی» GitHub، فقط برای همین یک‌بار)
apt-get update && apt-get install -y git
TOKEN=github_pat_xxx
git -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)" \
  clone --depth 1 https://github.com/Mr-se7en-ai/Cafino.git /opt/cafino
unset TOKEN     # بعد از نصب توکن را در GitHub باطل کنید

# ۲) طرح کار را ببینید (هیچ تغییری نمی‌دهد)
bash /opt/cafino/server/deploy/install.sh --dry-run --domain cafino.example.ir --admin-email you@example.com

# ۳) نصب Production
bash /opt/cafino/server/deploy/install.sh --domain cafino.example.ir --admin-email you@example.com
```
`install.sh`: بررسی سیستم و DNS ← بستهٔ پایه + Docker ← ساخت برنامه در کانتینر Node ← `.env` با رازهای تصادفی ← Caddy ← `docker compose up` ← ساخت مدیر ← فایروال ← cron پشتیبان/پایش ← پشتیبان اول ← بررسی نهایی. رمز مدیر و **رمز رمزنگاری پشتیبان‌ها** فقط یک‌بار نمایش داده می‌شوند (و در `/root/cafino-credentials.txt` با مجوز ۶۰۰ می‌مانند). **همین حالا رمز پشتیبان را در مدیر رمز عبور ذخیره کنید.** اجرای دوباره بی‌خطر است (رازها، مدیر و داده تغییر نمی‌کنند).

```bash
# ۴) سخت‌سازی SSH/فایروال/Fail2ban + کاربر محدود CI  (پس از آزمودن ورود با کلید)
bash /opt/cafino/server/deploy/harden.sh --dry-run --admin-user hamed --admin-key "ssh-ed25519 AAAA… hamed-admin" --ci-key "ssh-ed25519 AAAA… cafino-ci"
bash /opt/cafino/server/deploy/harden.sh           --admin-user hamed --admin-key "ssh-ed25519 AAAA… hamed-admin" --ci-key "ssh-ed25519 AAAA… cafino-ci"
# پس از آزمودن ورود کلیدی hamed از یک ترمینال دیگر:
bash /opt/cafino/server/deploy/harden.sh --admin-user hamed --disable-password-login

# ۵) (اختیاری) Staging — پس از نصب Production؛ از همان Caddy استفاده می‌کند، داده و ربات‌ها کاملاً جدا
bash /opt/cafino/server/deploy/install.sh --env staging --domain staging.cafino.example.ir --admin-email you@example.com
```

**قوانین Staging:** دیتابیس و آپلودها جدا و **خالی** هستند؛ داده‌های واقعی کاربران را بدون اجازهٔ صریح به staging نبرید (و اگر برید، ابتدا اطلاعات شخصی را ناشناس کنید). توکن ربات واقعی هرگز در staging نگذارید: install آن را خاموش می‌کند (`BOTS_ENABLED=false`، `MINIAPP_BOT_TOKEN` خالی)، چون یک توکن را دو سرور نمی‌توانند هم‌زمان poll کنند. ربات جدا برای تست بسازید.

بعد از نصب: `https://cafino.example.ir` ← ورود مدیر مرکزی. SMTP (بازیابی رمز) و `OFFSITE_CMD` (پشتیبان بیرون سرور) را تنظیم کنید (بخش ۱۴).

**به‌روزرسانی دستی (بدون CI):** `bash /opt/cafino/server/deploy/update.sh` — پشتیبان ← دریافت سورس ← ساخت ← راه‌اندازی دوباره. برای مخزن خصوصی `GITHUB_TOKEN=…` لازم است. اگر CI راه‌اندازی شد، از یک روش استفاده کنید (CI پیشنهادی است)؛ `update.sh` برچسب ایمیج را به `local` برمی‌گرداند و تاریخچهٔ CI را قطع نمی‌کند اما rollback خودکار CI شامل آن نمی‌شود.

## ۱۰) مهاجرت دیتابیس

- مهاجرت‌ها فایل‌های SQL شمارهٔ‌دار در `server/migrations/` هستند (فقط **رو به جلو**، هر کدام یک‌بار؛ ثبت در جدول `schema_migrations`). API هنگام بالا آمدن آن‌ها را زیر قفل `pg_advisory_lock` (جلوگیری از اجرای هم‌زمان) و با نقش `cafino` (مالک) اعمال می‌کند؛ API در زمان اجرا با نقش محدود `cafino_app` کار می‌کند.
- دیتابیس هرگز «از نو ساخته» نمی‌شود: volume `server_dbdata` بین انتشارها حفظ می‌شود و `deploy.sh` فقط کانتینر `api`/`web` را عوض می‌کند (`--no-deps`)، نه `db`.
- **کنترل‌شده:** پیش از هر استقرار، `deploy.sh` مهاجرت‌های در انتظار را حساب می‌کند. اگر مهاجرتی هست:
  - بدون تأیید صریح **متوقف می‌شود** (کد خروج ۳) و هیچ چیز تغییر نمی‌کند.
  - عبارت‌های مخرب (`DROP`، `TRUNCATE`، `DELETE FROM`، تغییر نوع ستون) در گزارش با ⚠ مشخص می‌شوند.
  - پس از تأیید، **پشتیبان کامل اجباری** گرفته می‌شود و اگر شکست بخورد استقرار انجام نمی‌شود (کد ۴).
- تأیید در GitHub: Actions ← Deploy ← Run workflow ← `approve_migrations = true` (پس از خواندن فایل‌های مهاجرت در PR).
- بررسی دستی روی سرور:
```bash
cd /opt/cafino/server
docker compose exec -T db psql -U cafino -d cafino -c "select name, applied_at from schema_migrations order by name"
docker compose exec -T api node -e 'fetch("http://127.0.0.1:8080/readyz").then(r=>r.text()).then(console.log)'   # {"ok":true,"version":…,"migrations":N,…}
```
- تغییر ساختار مخرب یا حجیم را همیشه با پشتیبان تازه و در ساعت کم‌ترافیک انجام دهید. بازگشت ساختار فقط با بازیابی پشتیبان ممکن است (بخش ۱۵).

## ۱۱) راه‌اندازی CI/CD

**جریان:** Pull Request ← CI (تست و بررسی) ← شما ادغام می‌کنید ← CI روی `main` ← بستهٔ انتشار ← **Staging خودکار** ← **تأیید دستی شما در GitHub** ← Production.

| مرحله (CI، `ci.yml`) | شکست = توقف |
|---|---|
| `npm ci` (نصب دقیق از lock) | ✅ |
| بررسی هماهنگی نسخه و Node (`version:check`) | ✅ |
| `eslint` ← تست کلاینت (`npm test`، شامل تست زیرساخت) ← تست سرور روی PostgreSQL واقعی | ✅ |
| دروازهٔ امنیتی وابستگی‌ها (`audit-gate.mjs`): high/critical بدون استثنا = شکست | ✅ |
| `npm run build` ← `verify:dist` (هش همهٔ فایل‌ها، هماهنگی PWA/Electron) | ✅ |
| shellcheck اسکریپت‌ها + اعتبار compose (prod و staging) | ✅ |
| (فقط push به main) ساخت ایمیج API + «بستهٔ انتشار» با MANIFEST/SHA-256 ← Artifact `cafino-release` | ✅ |

| مرحله (`deploy.yml`) | رفتار |
|---|---|
| `gate` | فقط اگر `DEPLOY_ENABLED=true`، CI از نوع push روی main و موفق باشد؛ شناسهٔ اجرا بررسی می‌شود (Artifact دلخواه پذیرفته نمی‌شود) |
| `staging` | خودکار (اگر `STAGING_ENABLED=true`)؛ مهاجرت‌ها در staging خودکار تأیید می‌شوند |
| `production` | **تأیید دستی Environment**؛ هم‌زمانی کنترل‌شده (`concurrency`)؛ مهاجرت فقط با `approve_migrations` |
| داخل هر استقرار | SSH با کلید محدود و اثر انگشت تأییدشده ← plan ← پشتیبان ← سوییچ ← health درونی ← health بیرونی ← ثبت نتیجه (Summary و اعلان) |

**چه چیزی هنگام استقرار روی سرور رخ می‌دهد (`deploy.sh`):** قفل ← بازکردن امن بسته (رد مسیر مطلق/`..`/لینک؛ تطبیق MANIFEST؛ رد فایل اضافه) ← بارگذاری ایمیج ← مهاجرت‌های در انتظار ← **پشتیبان اجباری** ← ثبت نقطهٔ بازگشت ← اعمال فایل‌ها (`rsync --checksum`) ← جایگزینی `api` و `web` (نه `db`، نه Caddy) ← reload نگینکس ← بررسی اینکه «نسخهٔ در حال سرویس همان نسخهٔ جدید است و تعداد مهاجرت‌ها درست» ← ثبت. هر شکستی پس از تغییر ← **بازگشت خودکار** به نسخهٔ قبلی.

**محدودیت صادقانه (قطعی):** جایگزینی کانتینر API چند ثانیه (معمولاً ۵ تا ۱۵) پاسخ‌های API را قطع می‌کند. فایل‌های برنامه اتمیک عوض می‌شوند و PWA نصب‌شده در این مدت آفلاین کار می‌کند، اما «صفر-قطعی» واقعی نیازمند دو نمونهٔ API پشت load-balancer است که در این معماری یک‌سرور نیست. ساعت کم‌ترافیک را برای انتشار انتخاب کنید.

**روش دستی/اضطراری:** Actions ← Deploy ← Run workflow (انتخاب `target`، `run_id` اختیاری، `approve_migrations`). مستقیم روی سرور: `sudo /opt/cafino/server/deploy/deploy.sh --bundle /path/cafino-release-….tar.gz [--plan] [--approve-migrations]`.

**ویندوز (Electron):** `desktop-release.yml` با تگ `v1.87.0` (برابر نسخهٔ برنامه) ← تست ← نصب‌کنندهٔ NSIS x64 ← GitHub Release (نسخه‌های قبلی حفظ می‌شوند). بدون گواهی امضای کد (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`) نصب‌کننده «امضانشده» است و SmartScreen هشدار می‌دهد. سازگاری: نسخهٔ تگ = برنامه = Electron = API (با `version:check`).

## ۱۲) اولین انتشار (Release)

۱) پیش‌نیاز: بخش‌های ۴ و ۹ کامل؛ Production و (اختیاری) Staging نصب و سالم (`healthcheck.sh` خروجی 0).
۲) این PR را ادغام کنید ← CI روی `main` اجرا می‌شود و `cafino-release` ساخته می‌شود.
۳) **نخست آزمایش بدون اثر:** Actions ← Deploy ← Run workflow ← `target=staging`. (با `DEPLOY_ENABLED=true`.) خروجی Summary شامل «مهاجرت‌های در انتظار» است.
۴) روی سرور بررسی کنید: `sudo /opt/cafino-staging/server/deploy/healthcheck.sh; echo $?` و `https://staging.…/healthz`.
۵) Production: Actions ← Deploy ← `target=production` ← تأیید Environment. در **اولین** استقرار CI، وضعیت نصب‌شدهٔ فعلی به‌عنوان `baseline-…` ثبت می‌شود تا بازگشت ممکن باشد.
۶) پس از هر انتشار موفق: وضعیت `deploy.sh --status`: `sudo /opt/cafino/server/deploy/deploy.sh --status`.

## ۱۳) بررسی سلامت سرور و پایش

```bash
sudo sh /opt/cafino/server/deploy/healthcheck.sh ; echo "کد=$?"      # 0=سالم 1=هشدار 2=بحرانی
sudo cat /var/lib/cafino/last-health.txt                               # آخرین گزارش پایش خودکار
sudo docker compose -f /opt/cafino/server/docker-compose.yml ps
```
`healthcheck.sh` می‌سنجد: `/healthz` (داخلی و از دامنهٔ عمومی)، `/readyz` (دیتابیس، مهاجرت‌ها، صف Pool)، وضعیت و تعداد ری‌استارت کانتینرها (db/api/web/caddy)، خطاهای ۱۰ دقیقهٔ اخیر API و 5xx نگینکس، **CPU** (میانگین بار)، **RAM**، **دیسک** (سرور، پشتیبان، Docker)، حجم آپلودها (اگر `UPLOADS_WARN_MB` تنظیم شود)، **اعتبار SSL**، اتصال‌ها و تراکنش‌های طولانی PostgreSQL، **تازگی و خطای پشتیبان**، فعال‌بودن رمزنگاری و **تمرین بازیابی**.

**اعلان خودکار:** `monitor.sh` هر ۵ دقیقه (cron) `healthcheck.sh` را اجرا می‌کند و فقط هنگام **تغییر وضعیت** (و یادآوری هر ۶ ساعت) پیام می‌فرستد؛ رفع مشکل هم اعلام می‌شود.
```bash
sudo nano /etc/cafino/notify.env        # NOTIFY_BALE_TOKEN + NOTIFY_BALE_CHAT   (بله: مستقیم در ایران)
sudo sh /opt/cafino/server/deploy/notify.sh info "آزمایش اعلان"   # باید پیام برسد
```
شکست پشتیبان‌گیری و تمرین بازیابی هم **مستقیماً** اعلان می‌شوند.

> **پایشگر مستقل از سرور (ضروری):** `monitor.sh` روی خود سرور است؛ اگر کل سرور خاموش شود، چیزی نمی‌فرستد. یک سرویس بیرونی رایگان (UptimeRobot / Uptime-Kuma روی سرور دیگر) را روی `https://cafino.example.ir/healthz` تنظیم کنید و اعلانش را به همان بله/ایمیل بفرستید.

## ۱۴) پشتیبان‌گیری و بازیابی

**چه چیزی و کی (cron خودکار، `install.sh`):**

| مورد | زمان | شامل |
|---|---|---|
| پشتیبان کامل | هر روز 03:00 | دیتابیس (`pg_dump -Fc`)، **فایل‌های آپلود**، **تنظیمات** (`.env`، Caddy، `notify.env`، وضعیت استقرار) |
| تمرین بازیابی | یکشنبه 04:30 | آخرین پشتیبان روی پایگاه‌دادهٔ موقت + بررسی یکپارچگی مالی؛ شکست = اعلان |
| پشتیبان پیش از هر استقرار | هر `deploy.sh` | همان پشتیبان کامل (اجباری) |

- **رمزنگاری:** با `/etc/cafino/backup.pass` (gpg AES-256) — روی دیسک فقط `.gpg` می‌ماند؛ تنظیمات «همیشه» رمزنگاری‌شده است (بدون رمزنگاری ذخیره نمی‌شود). رازی (رمز دیتابیس، JWT، توکن) به‌صورت متن ساده در هیچ پشتیبانی نیست. یا کلید عمومی: `BACKUP_GPG_RECIPIENT=…`.
- **نگهداری:** ۱۴ روز روزانه + ۸ هفته (نسخهٔ یکشنبه) + ۶ ماه (نسخهٔ روز اول ماه)، هرگز کمتر از ۳ نسخه (`KEEP_DAYS/KEEP_WEEKS/KEEP_MONTHS/KEEP_MIN`).
- **بیرون از سرور (ضروری):** پشتیبان فقط روی همان سرور، با از دست رفتن سرور از بین می‌رود. یک مقصد (Storage ابری/سرور دیگر/rclone) بگیرید و در `/etc/cron.d/cafino` قبل از `/bin/sh` در خط پشتیبان بنویسید:
  `OFFSITE_CMD='rclone copy "$1" remote:cafino-backups/'`. بدون رمزنگاری، ارسال بیرونی عمداً **رد** می‌شود.
- **خطاها:** `/var/log/cafino-backup.log`؛ کد خروج ≠۰، اعلان بحرانی، و `LAST_OK` به‌روز نمی‌شود (پایش آن را بحرانی می‌کند).
- آپلودهای حجیم: `UPLOADS_BACKUP=weekly` (فقط یکشنبه‌ها) یا `off` (اگر جداگانه rsync می‌کنید).

**بازیابی:**
```bash
cd /opt/cafino/server/deploy
sh restore.sh --latest                                    # تمرین روی پایگاه‌دادهٔ موقت (تولید دست نمی‌خورد)
sh restore.sh /var/backups/cafino/cafino-….dump.gpg       # تمرین یک پشتیبان مشخص
sh restore.sh /var/backups/cafino/cafino-….dump.gpg --into-production     # ⚠️ جایگزینی دیتابیس زنده (تأیید تایپی؛ پشتیبان اضطراری؛ API متوقف می‌شود)
sh restore.sh --uploads /var/backups/cafino/cafino-….uploads.tar.gz.gpg   # فایل‌های آپلود (چیزی حذف نمی‌شود)
sh restore.sh --config  /var/backups/cafino/cafino-….config.tar.gz.gpg /root/cfg-restore   # فقط استخراج برای بررسی دستی
```
SHA-256 پیش از باز کردن سنجیده می‌شود. پس از بازیابی روی production: ورود مدیر ← «بررسی یکپارچگی مالی» و `GET /api/audit/verify`.

**بازیابی فاجعه روی سرور تازه** (سرور قبلی از بین رفت): ۱) سرور جدید + بخش‌های ۲، ۳، ۹؛ ۲) **قبل از install** فایل `/etc/cafino/backup.pass` را با رمز ذخیره‌شده‌تان بسازید (`chmod 600`)؛ ۳) پشتیبان‌ها را از مقصد بیرونی بیاورید؛ ۴) `--config` را استخراج و `.env` قبلی (به‌خصوص `POSTGRES_PASSWORD`/`APP_DB_PASSWORD`/`JWT_SECRET`/`BOT_TOKEN_KEY`) را در `/opt/cafino/server/.env` بگذارید؛ ۵) `install.sh` و سپس `restore.sh … --into-production` و `--uploads`.
**`BOT_TOKEN_KEY` و `JWT_SECRET` را حتماً جدا هم نگه دارید:** بدون `BOT_TOKEN_KEY` توکن ربات‌های ذخیره‌شده قابل رمزگشایی نیستند.

## ۱۵) بازگشت به نسخهٔ قبلی (Rollback)

**خودکار:** اگر پس از استقرار، سرویس سالم نشود یا نسخه/مهاجرت‌ها مطابق انتظار نباشد، `deploy.sh` خودش به نسخهٔ قبلی برمی‌گردد (فایل‌ها + ایمیج API) و اعلان می‌فرستد.

**دستی:**
```bash
sudo /opt/cafino/server/deploy/rollback.sh --list           # انتشارهای نگه‌داری‌شده (۳ نسخهٔ اخیر + baseline)
sudo /opt/cafino/server/deploy/rollback.sh                  # به نسخهٔ «قبلی»؛ نام انتشار را تایپ می‌کنید
sudo /opt/cafino/server/deploy/rollback.sh 1.87.0-abcdef1   # به نسخهٔ مشخص
```
یا از GitHub: Actions ← **Rollback** ← Run workflow.

**دیتابیس چه می‌شود؟** مهاجرت‌ها فقط رو به جلو هستند و بازگشت کد، ساختار دیتابیس را برنمی‌گرداند:
- اگر نسخهٔ هدف همهٔ مهاجرت‌های اعمال‌شده را می‌شناسد ← بازگشت کامل و امن؛ دیتابیس و آپلودها دست‌نخورده.
- اگر دیتابیس مهاجرت‌های **جدیدتر** دارد: `rollback.sh` پیش‌فرض **رد می‌کند** و دو راه می‌دهد:
  - `--force-code-only`: کد قدیمی روی ساختار جدید (معمولاً کار می‌کند چون مهاجرت‌ها افزایشی‌اند؛ پس از آن وضعیت را بررسی کنید).
  - `--restore-db`: دیتابیس را به «پشتیبان پیش از آخرین استقرار» برمی‌گرداند. ⚠️ **داده‌های ثبت‌شده بعد از آن پشتیبان از دست می‌رود**؛ تأیید تایپی می‌خواهد.
- هرگز `docker compose down -v` اجرا نکنید (volume دیتابیس را پاک می‌کند). هیچ اسکریپت این مجموعه این کار را نمی‌کند (تست خودکار نگهبان آن است).

## ۱۶) عیب‌یابی

| نشانه | بررسی/راه‌حل |
|---|---|
| `install.sh`: «DNS به این سرور اشاره نمی‌کند» | رکورد A را بررسی کنید (`dig +short دامنه`)؛ Cloudflare = DNS only؛ یا موقتاً `--skip-dns-check` |
| گواهی SSL نمی‌آید | پورت 80/443 باز؟ `docker logs cafino-caddy --tail 100`؛ سقف نرخ Let's Encrypt؛ DNS |
| Docker Hub/npm/GitHub از ایران باز نمی‌شود | آینه‌ها (`NODE_IMAGE`, `NPM_REGISTRY`, `DOCKER_INSTALL_URL`)؛ clone با zip؛ سرور خارج از ایران |
| Actions: `Permission denied (publickey)` | کلید عمومی CI در `--ci-key` درست نصب شد؟ `cat /var/lib/cafino-deploy/.ssh/authorized_keys`؛ Secret کامل (با BEGIN/END و خط جدید پایانی) |
| Actions: `Host key verification failed` | `DEPLOY_KNOWN_HOSTS` با IP/پورت واقعی همخوان نیست (بند ۴-ب)؛ اگر سرور بازسازی شد کلید میزبان عوض شده |
| Actions: «فرمان نامعتبر/محیط نامعتبر» | نام محیط فقط `production|staging`؛ `ls /opt/cafino/server/deploy/deploy.sh`؛ `/etc/cafino/ci.env` |
| استقرار کد ۳ | مهاجرت در انتظار تأیید است (بخش ۱۰)؛ چیزی تغییر نکرده |
| استقرار کد ۴ | پشتیبان پیش از استقرار شکست خورد: `tail -50 /var/log/cafino-backup.log`؛ فضای دیسک؟ `gpg` نصب است؟ |
| استقرار کد ۱ + «بازگشت خودکار» | `docker compose logs api --tail 100`؛ `cat /opt/cafino/.deploy-state/history.log` |
| `api` هرگز healthy نمی‌شود | `docker compose logs api`؛ `.env` کامل؟ مهاجرت شکست خورده؟ اتصال `db` |
| 502 چند ثانیه بعد از استقرار | طبیعی (جایگزینی API)؛ بیش از ۳۰ ثانیه: `docker compose exec web nginx -s reload` |
| پشتیبان: «gpg نصب نیست» | `apt-get install -y gnupg` |
| پشتیبان: «ارسال بیرونی رد شد» | رمزنگاری فعال نیست؛ `/etc/cafino/backup.pass` را بسازید یا `install.sh` را دوباره اجرا کنید |
| `restore.sh`: «SHA-256 نمی‌خواند» | فایل در انتقال خراب شده؛ نسخهٔ دیگر یا کپی دوباره از مقصد بیرونی |
| دیسک پر می‌شود | `docker system df`؛ `docker image prune -f` (فقط ایمیج‌های بی‌استفاده)؛ KEEP_* پشتیبان را کم کنید. **هرگز `--volumes`** |
| اعلان نمی‌رسد | `sh deploy/notify.sh info test`؛ `notify.env`؛ تلگرام از ایران = پراکسی؛ بله را امتحان کنید |
| Fail2ban خودم را بست | کنسول وب ارائه‌دهنده ← `fail2ban-client unban IP`؛ `ufw allow from IP-شما to any port 22` |
| Electron: SmartScreen هشدار | نصب‌کننده امضانشده است؛ گواهی امضای کد تهیه و `WIN_CSC_*` را بگذارید |
| تست دود Electron در Actions شکست | اطلاعاتی است (مانع Release نیست)؛ لاگ را ببینید؛ پس از اصلاح `ELECTRON_SMOKE_REQUIRED=true` |

**دستورهای مفید:**
```bash
cd /opt/cafino/server
docker compose ps ; docker compose logs -f --tail 100 api
docker stats --no-stream
sudo ufw status verbose ; sudo fail2ban-client status sshd ; sudo ss -ltnp      # 5432 و 8080 نباید روی 0.0.0.0 باشند
sudo cat /opt/cafino/.deploy-state/history.log
```

---

## پیوست: مرور امنیتی (خلاصه)

- فقط 22 (محدودشده)، 80، 443 از اینترنت؛ PostgreSQL و API هرگز publish نمی‌شوند؛ nginx فقط روی `127.0.0.1`.
- کانتینرها: کاربر غیر root، `no-new-privileges`، `cap_drop: ALL` و فایل‌سیستم فقط‌خواندنی برای API؛ ایمیج‌های رسمی با برچسب ثابت (`postgres:16-alpine`، `caddy:2-alpine`، `node:22`).
- رازها فقط در `.env` (۶۰۰) روی سرور؛ پشتیبان‌ها رمزنگاری‌شده؛ GitHub فقط کلید «محدود به فرمان» CI را دارد.
- محدودیت نرخ، CORS/CSP، کپچای ورود، trusted proxy و مسیر آپلود از قبل در کد برنامه/nginx هستند؛ اسکریپت‌های جدید چیزی را ضعیف نمی‌کنند.
- به‌روزرسانی امنیتی خودکار Ubuntu (`unattended-upgrades`)؛ Fail2ban برای SSH؛ ورود با رمز و root قابل‌بستن با کلید.

## پیوست: موارد باز/مرزی (در گزارش نهایی هم آمده)
1. ایمیج‌ها با **برچسب** پین شده‌اند، نه digest؛ برای پین کامل digest را بعد از اولین pull واقعی ثبت کنید.
2. xlsx (۰٫۱۸٫۵) آسیب‌پذیری high بدون وصلهٔ رسمی دارد؛ با فهرست استثنای دارای دلیل و انقضا (`.github/audit-allowlist.json`، تا ۲۰۲۷-۰۳-۰۱) کنترل می‌شود، نه نادیده.
3. «صفر-قطعی» ممکن نیست (چند ثانیه قطع API)؛ بخش ۱۱.
4. Actions با برچسب major (`@v4`) استفاده شده‌اند؛ Dependabot ماهانه به‌روز می‌کند. برای سخت‌ترین حالت، به SHA کامل پین کنید.
5. دیتابیس مدیریت‌شده/replica و دسترس‌پذیری بالا در این معماری نیست.
