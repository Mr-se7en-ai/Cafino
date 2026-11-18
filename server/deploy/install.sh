#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────
# نصب یک‌دستوری کافینو روی Ubuntu 22.04 / 24.04  (سرور + پایگاه‌داده + برنامه + HTTPS خودکار + پشتیبان‌گیری)
#
#   sudo bash server/deploy/install.sh --domain cafino.example.ir --admin-email you@example.com
#
# بدون دامنه (فقط آزمایش، HTTP روی IP):   sudo bash server/deploy/install.sh --no-tls --admin-email you@example.com
# به‌روزرسانی نسخهٔ نصب‌شده:              sudo bash /opt/cafino/server/deploy/update.sh
# مخزن خصوصی بدون clone قبلی:             curl -fsSL -H "Authorization: token $T" https://raw.githubusercontent.com/Mr-se7en-ai/Cafino/main/server/deploy/install.sh \
#                                           | sudo GITHUB_TOKEN=$T bash -s -- --domain … --admin-email …
#
# ایمن برای اجرای دوباره: رازها و رمزهای موجود (.env) هرگز عوض نمی‌شوند، مدیر دوباره ساخته نمی‌شود، داده‌ها دست نمی‌خورند.
# راهنمای کامل: server/DEPLOY-UBUNTU-fa.md
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail
export LC_ALL="${LC_ALL:-C.UTF-8}" DEBIAN_FRONTEND=noninteractive

CAFINO_REPO="${CAFINO_REPO:-https://github.com/Mr-se7en-ai/Cafino.git}"
INSTALL_LOG="${INSTALL_LOG:-/var/log/cafino-install.log}"
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm-slim}"
DOCKER_INSTALL_URL="${DOCKER_INSTALL_URL:-https://get.docker.com}"
DIR="${CAFINO_DIR:-/opt/cafino}" BRANCH="${CAFINO_BRANCH:-main}"
DOMAIN="" EMAIL="" ADMIN_EMAIL="" ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" TG_BASE=""
NO_TLS=0 NO_FIREWALL=0 NO_PROXY=0 WITH_CLAMAV=0 ASSUME_YES=0 DRY_RUN=0 REBUILD=0 SKIP_DNS=0 RESET_ADMIN=0
UPDATE=0 NO_PULL=0 SKIP_BACKUP=0 SSH_PORT=""
SRC="" SRV="" ENV_FILE="" LOCAL_DIR="" PUBLIC_HOST="" SCHEME="https" GENERATED_PW=0 FAILS=0

c_red=$'\e[31m'; c_grn=$'\e[32m'; c_yel=$'\e[33m'; c_blu=$'\e[36m'; c_off=$'\e[0m'
[ -t 1 ] || { c_red=""; c_grn=""; c_yel=""; c_blu=""; c_off=""; }
log()  { printf '%s▸%s %s\n' "$c_blu" "$c_off" "$*"; }
ok()   { printf '%s✔%s %s\n' "$c_grn" "$c_off" "$*"; }
warn() { printf '%s⚠%s %s\n' "$c_yel" "$c_off" "$*" >&2; }
die()  { printf '%s✘ %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }
on_err() { printf '%s✘ نصب در خط %s متوقف شد. گزارش کامل: %s%s\n' "$c_red" "$1" "$INSTALL_LOG" "$c_off" >&2; }

usage() {
  cat <<'EOF'
نصب یک‌دستوری کافینو روی Ubuntu 22.04/24.04

استفاده:  sudo bash install.sh [گزینه‌ها]

  --domain دامنه            دامنه‌ای که به IP همین سرور اشاره می‌کند (برای HTTPS خودکار؛ الزامی مگر با --no-tls)
  --admin-email ایمیل       ایمیل مدیر پنل مرکزی (الزامی)
  --admin-password رمز      رمز مدیر (پیش‌فرض: ساخت خودکار و نمایش یک‌بار). بهتر است به‌جای آن ADMIN_PASSWORD را در محیط بگذارید
  --email ایمیل             ایمیل Let's Encrypt برای هشدار انقضای گواهی (اختیاری)
  --no-tls                  بدون HTTPS (HTTP روی پورت ۸۰؛ فقط آزمایش — مینی‌اپ تلگرام/بله به HTTPS نیاز دارد)
  --no-proxy                Caddy نصب نشود (پراکسی HTTPS را خودتان دارید؛ nginx بسته فقط روی 127.0.0.1:8080 می‌ماند)
  --no-firewall             فایروال ufw دست نخورد
  --ssh-port پورت           پورت SSH برای فایروال (پیش‌فرض: تشخیص خودکار، وگرنه 22)
  --with-clamav             ضدویروس ClamAV برای فایل‌های دریافتی (حدود ۱ گیگ RAM بیشتر)
  --telegram-api-base نشانی نشانی پراکسی معکوس Bot API تلگرام (برای سرورهای داخل ایران که api.telegram.org بسته است)
  --dir مسیر                مسیر نصب (پیش‌فرض /opt/cafino؛ وقتی از داخل مخزن اجرا شود همان مخزن به کار می‌رود)
  --branch شاخه             شاخهٔ دریافت سورس (پیش‌فرض main)
  --rebuild                 ساخت دوبارهٔ برنامه حتی اگر نسخه عوض نشده
  --skip-dns-check          بررسی اشاره‌کردن دامنه به این سرور انجام نشود
  --reset-admin             رمز مدیر (حتی اگر قبلاً ساخته شده) دوباره تنظیم شود
  --update                  به‌روزرسانی نصب موجود (پشتیبان ← دریافت سورس ← ساخت ← راه‌اندازی دوباره)؛ معادل update.sh
  --no-pull / --skip-backup فقط با --update: دریافت سورس / پشتیبان پیش از به‌روزرسانی را رد کن
  --dry-run                 فقط طرح کار را نشان بده، هیچ تغییری نده
  -y, --yes                 هیچ سؤالی نپرس (پیش‌فرض‌ها را بپذیر)
  -h, --help                همین راهنما

متغیرهای محیط: GITHUB_TOKEN (دریافت از مخزن خصوصی)، CAFINO_REPO، NODE_IMAGE، NPM_REGISTRY، DOCKER_INSTALL_URL
EOF
}

# ── ابزارهای کمکی ─────────────────────────────────────────────────────────────
can_ask() { [ "$ASSUME_YES" = 0 ] && [ -t 1 ] && { : </dev/tty; } 2>/dev/null; }
ask() {  # ask «پرسش» [پیش‌فرض]  → مقدار در stdout
  local q="$1" d="${2:-}" a=""
  if can_ask; then read -r -p "$q${d:+ [$d]}: " a </dev/tty || true; fi
  printf '%s' "${a:-$d}"
}
confirm() {  # confirm «پرسش» → 0=بله (بدون ترمینال/با --yes: بله)
  local a; can_ask || return 0
  read -r -p "$1 [y/N]: " a </dev/tty || true
  case "$a" in y|Y|yes|بله) return 0 ;; *) return 1 ;; esac
}
rand_hex() { openssl rand -hex "$1"; }
gen_password() {
  local pw
  while :; do
    pw="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-20)"
    [[ ${#pw} -ge 20 && $pw =~ [A-Z] && $pw =~ [a-z] && $pw =~ [0-9] ]] && break
  done
  printf '%s' "$pw"
}
valid_domain() { [[ "$1" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]]; }
valid_email()  { [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; }
dc() { (cd "$SRV" && docker compose "$@"); }

# مقدار یک کلید در .env (خالی اگر نبود)
get_env() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true; }
# مقدار کلید را می‌گذارد: خط فعال را عوض می‌کند، وگرنه خط کامنت‌شدهٔ نمونه را، وگرنه به انتها می‌افزاید
set_env() {
  local k="$1" v="$2" line found=0 tmp
  tmp="$(mktemp)"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$k="*) if [ "$found" = 0 ]; then printf '%s=%s\n' "$k" "$v"; found=1; fi ;;
      "# $k="*|"#$k="*) if [ "$found" = 0 ]; then printf '%s=%s\n' "$k" "$v"; found=1; else printf '%s\n' "$line"; fi ;;
      *) printf '%s\n' "$line" ;;
    esac
  done <"$ENV_FILE" >"$tmp"
  [ "$found" = 1 ] || printf '%s=%s\n' "$k" "$v" >>"$tmp"
  cat "$tmp" >"$ENV_FILE"; rm -f "$tmp"
}
# فقط اگر مقدار خالی یا نمونهٔ «change-me» بود می‌سازد؛ رازهای موجود هرگز عوض نمی‌شوند (رمز دیتابیس با volume ست شده است)
ensure_secret() {
  local cur; cur="$(get_env "$1")"
  case "$cur" in ""|change-me*) set_env "$1" "$("${@:2}")"; return 0 ;; esac
  return 1
}

# ── آرگومان‌ها ────────────────────────────────────────────────────────────────
parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --domain) DOMAIN="${2:-}"; shift 2 ;;            --domain=*) DOMAIN="${1#*=}"; shift ;;
      --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;  --admin-email=*) ADMIN_EMAIL="${1#*=}"; shift ;;
      --admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;  --admin-password=*) ADMIN_PASSWORD="${1#*=}"; shift ;;
      --email) EMAIL="${2:-}"; shift 2 ;;              --email=*) EMAIL="${1#*=}"; shift ;;
      --telegram-api-base) TG_BASE="${2:-}"; shift 2 ;; --telegram-api-base=*) TG_BASE="${1#*=}"; shift ;;
      --ssh-port) SSH_PORT="${2:-}"; shift 2 ;;        --ssh-port=*) SSH_PORT="${1#*=}"; shift ;;
      --dir) DIR="${2:-}"; shift 2 ;;                  --dir=*) DIR="${1#*=}"; shift ;;
      --branch) BRANCH="${2:-}"; shift 2 ;;            --branch=*) BRANCH="${1#*=}"; shift ;;
      --no-tls) NO_TLS=1; shift ;;     --no-proxy) NO_PROXY=1; shift ;;   --no-firewall) NO_FIREWALL=1; shift ;;
      --with-clamav) WITH_CLAMAV=1; shift ;;           --rebuild) REBUILD=1; shift ;;
      --skip-dns-check) SKIP_DNS=1; shift ;;           --reset-admin) RESET_ADMIN=1; shift ;;
      --update) UPDATE=1; shift ;;     --no-pull) NO_PULL=1; shift ;;     --skip-backup) SKIP_BACKUP=1; shift ;;
      --dry-run) DRY_RUN=1; shift ;;   -y|--yes) ASSUME_YES=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; die "گزینهٔ ناشناخته: $1" ;;
    esac
  done
  DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z')"
  case "$SSH_PORT" in ""|*[!0-9]*) [ -z "$SSH_PORT" ] || die "--ssh-port باید عدد باشد" ;; esac
  case "$BRANCH" in *[!A-Za-z0-9._/-]*|"") die "نام شاخه نامعتبر است" ;; esac
}

# اعتبارسنجی ورودی‌ها (بدون تغییر در سیستم)؛ در صورت نبودن مقدار، اگر ترمینال باشد می‌پرسد
validate_inputs() {
  if [ "$UPDATE" = 1 ]; then return 0; fi
  if [ "$NO_TLS" = 0 ] && [ "$NO_PROXY" = 0 ] && [ -z "$DOMAIN" ]; then DOMAIN="$(ask 'دامنهٔ سایت (مثلاً cafino.example.ir؛ باید به IP این سرور اشاره کند)')"; DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z')"; fi
  if [ "$NO_TLS" = 0 ] && [ "$NO_PROXY" = 0 ]; then
    [ -n "$DOMAIN" ] || die "دامنه لازم است (--domain cafino.example.ir) — یا برای آزمایش بدون HTTPS: --no-tls"
  fi
  [ -z "$DOMAIN" ] || valid_domain "$DOMAIN" || die "دامنه نامعتبر است: $DOMAIN (فقط حروف انگلیسی کوچک/عدد/خط‌تیره؛ دامنهٔ فارسی را punycode کنید)"
  [ -z "$EMAIL" ] || valid_email "$EMAIL" || die "ایمیل Let's Encrypt نامعتبر است"
  [ -n "$ADMIN_EMAIL" ] || ADMIN_EMAIL="$(ask 'ایمیل مدیر پنل مرکزی')"
  [ -n "$ADMIN_EMAIL" ] || die "ایمیل مدیر لازم است (--admin-email you@example.com)"
  valid_email "$ADMIN_EMAIL" || die "ایمیل مدیر نامعتبر است: $ADMIN_EMAIL"
  ADMIN_EMAIL="$(printf '%s' "$ADMIN_EMAIL" | tr 'A-Z' 'a-z')"
  if [ -n "$TG_BASE" ]; then [[ "$TG_BASE" =~ ^https?://[^[:space:]]+$ ]] || die "--telegram-api-base باید یک نشانی http(s) باشد"; fi
  if [ "$NO_TLS" = 1 ]; then SCHEME="http"; else SCHEME="https"; fi
}

# ── مسیر سورس ────────────────────────────────────────────────────────────────
locate_source() {
  local self="${BASH_SOURCE[0]:-}" here=""
  if [ -n "$self" ] && [ -f "$self" ]; then here="$(cd "$(dirname "$self")/../.." 2>/dev/null && pwd || true)"; fi
  if [ -n "$here" ] && [ -f "$here/package.json" ] && [ -f "$here/server/docker-compose.yml" ]; then SRC="$here"; else SRC="$DIR"; fi
  SRV="$SRC/server"; ENV_FILE="$SRV/.env"; LOCAL_DIR="$SRV/deploy/local"
}

git_auth() {  # git با توکن اختیاری؛ توکن در نشانی/پیکربندی ذخیره نمی‌شود
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    git -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)" "$@"
  else git "$@"; fi
}

fetch_source() {
  if [ -d "$SRC/.git" ]; then
    [ "$NO_PULL" = 1 ] && { log "دریافت سورس رد شد (--no-pull)"; return 0; }
    log "دریافت آخرین سورس ($BRANCH)…"
    git_auth -C "$SRC" fetch --depth 1 origin "$BRANCH" || die "دریافت سورس شکست خورد (برای مخزن خصوصی GITHUB_TOKEN لازم است)"
    # تنها تغییر محلیِ فایل‌های دنبال‌شده، csp.conf تولیدی است؛ با خیال راحت دور ریخته می‌شود و بعد از ساخت دوباره تولید می‌شود
    git -C "$SRC" reset --hard FETCH_HEAD >/dev/null
    ok "سورس: $(git -C "$SRC" rev-parse --short HEAD)"
  elif [ -f "$SRC/package.json" ] && [ -f "$SRV/docker-compose.yml" ]; then
    ok "سورس موجود است ($SRC)"
  else
    [ "$UPDATE" = 0 ] || die "نصب موجودی در $SRC پیدا نشد"
    log "دریافت سورس از $CAFINO_REPO (شاخه $BRANCH)…"
    mkdir -p "$(dirname "$SRC")"
    git_auth clone --depth 1 --branch "$BRANCH" "$CAFINO_REPO" "$SRC" \
      || die "clone شکست خورد. مخزن خصوصی است؟ GITHUB_TOKEN=… را بدهید (توکن فقط‌خواندنی)، یا سورس را خودتان در $SRC باز کنید و دوباره اجرا کنید."
    ok "سورس: $(git -C "$SRC" rev-parse --short HEAD)"
  fi
}

# ── پیش‌نیازها ───────────────────────────────────────────────────────────────
preflight() {
  [ "$(id -u)" = 0 ] || die "با دسترسی root اجرا کنید:  sudo bash $0 …"
  if [ -r /etc/os-release ]; then
    . /etc/os-release
    case "${ID:-}:${VERSION_ID:-}" in
      ubuntu:22.04|ubuntu:24.04) ok "سیستم‌عامل: Ubuntu $VERSION_ID" ;;
      *) warn "این اسکریپت برای Ubuntu 22.04/24.04 نوشته شده؛ سیستم شما ${PRETTY_NAME:-نامشخص} است."; confirm "ادامه می‌دهید؟" || die "لغو شد" ;;
    esac
  fi
  case "$(uname -m)" in x86_64|aarch64) ;; *) die "معماری $(uname -m) پشتیبانی نمی‌شود (x86_64 یا aarch64)" ;; esac
  local free_mb; free_mb="$(df -Pm / | awk 'NR==2{print $4}')"
  [ "${free_mb:-0}" -ge 8000 ] || die "فضای خالی دیسک کم است (${free_mb}MB؛ دست‌کم ۸ گیگابایت لازم است)"
  if [ "$UPDATE" = 0 ] && [ "$NO_PROXY" = 0 ]; then
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'cafino-caddy'; then
      local p
      for p in 80 443; do
        if ss -H -ltn "( sport = :$p )" 2>/dev/null | grep -q .; then
          die "پورت $p روی این سرور در حال استفاده است ($(ss -H -ltnp "( sport = :$p )" 2>/dev/null | grep -o 'users:(("[^"]*"' | head -1)). آن سرویس را متوقف کنید یا با --no-proxy اجرا کنید و پراکسی‌تان را به 127.0.0.1:8080 وصل کنید."
        fi
      done
    fi
  fi
}

ensure_swap() {  # روی سرورهای کوچک، ساخت برنامه/ایمیج بدون swap ممکن است با کمبود حافظه کشته شود
  local mem_mb swap_mb; mem_mb="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)"; swap_mb="$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo)"
  [ "${mem_mb:-0}" -ge 1400 ] || warn "حافظهٔ سرور ${mem_mb}MB است؛ دست‌کم ۲ گیگابایت RAM توصیه می‌شود."
  if [ "${mem_mb:-0}" -lt 3500 ] && [ "${swap_mb:-0}" -lt 1000 ] && [ ! -e /swapfile ]; then
    log "RAM کم و swap ندارد؛ ساخت فایل swap دو گیگابایتی…"
    if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
      chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
      grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
      ok "swap فعال شد"
    else warn "ساخت swap ممکن نشد؛ ادامه می‌دهم"; fi
  fi
}

check_dns() {
  [ "$NO_TLS" = 1 ] || [ "$NO_PROXY" = 1 ] || [ "$SKIP_DNS" = 1 ] || [ -n "$DOMAIN" ] || return 0
  [ "$NO_TLS" = 0 ] && [ "$NO_PROXY" = 0 ] && [ "$SKIP_DNS" = 0 ] || return 0
  local resolved mine
  resolved="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')"
  mine="$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null || curl -4 -fsS --max-time 6 https://ifconfig.me 2>/dev/null || true)"
  if [ -z "$resolved" ]; then
    die "دامنهٔ $DOMAIN هنوز به هیچ IP اشاره نمی‌کند. رکورد A را به ${mine:-IP این سرور} بزنید، چند دقیقه صبر کنید و دوباره اجرا کنید (یا --skip-dns-check)."
  fi
  if [ -n "$mine" ] && [ "$resolved" != "$mine" ]; then
    warn "دامنه به $resolved اشاره می‌کند ولی IP عمومی این سرور $mine است (اگر پشت Cloudflare/CDN هستید طبیعی است؛ برای گواهی خودکار باید «DNS only» باشد)."
    confirm "با این حال ادامه بدهم؟" || die "لغو شد"
  else ok "DNS: $DOMAIN ← $resolved"; fi
}

install_packages() {
  log "نصب بسته‌های پایه…"
  apt-get update -y >/dev/null
  apt-get install -y --no-install-recommends ca-certificates curl gnupg git ufw openssl logrotate cron iproute2 >/dev/null
  ok "بسته‌های پایه آماده است"
}

install_docker() {
  if docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then ok "Docker آماده است ($(docker --version | cut -d, -f1))"; return 0; fi
  log "نصب Docker…"
  if curl -fsSL --max-time 60 "$DOCKER_INSTALL_URL" -o /tmp/get-docker.sh && sh /tmp/get-docker.sh >/dev/null 2>&1; then :
  else
    warn "نصب با $DOCKER_INSTALL_URL ممکن نشد (دسترسی به اینترنت/فیلتر؟)؛ از مخزن Ubuntu تلاش می‌کنم…"
    apt-get install -y docker.io docker-compose-v2 >/dev/null 2>&1 || apt-get install -y docker.io docker-compose-plugin >/dev/null 2>&1 \
      || die "نصب Docker ناموفق بود. Docker را دستی نصب کنید (https://docs.docker.com/engine/install/ubuntu/) و اسکریپت را دوباره اجرا کنید."
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
  docker compose version >/dev/null 2>&1 || die "افزونهٔ docker compose نصب نشد"
  ok "Docker نصب شد"
}

# ── ساخت برنامه (در کانتینر Node؛ نیازی به نصب Node روی میزبان نیست) ──────────────
build_pwa() {
  local rev="no-git" stamp="$SRC/dist/.build-rev"
  [ -d "$SRC/.git" ] && rev="$(git -C "$SRC" rev-parse HEAD)"
  if [ "$REBUILD" = 0 ] && [ "$rev" != "no-git" ] && [ -f "$SRC/dist/pwa/index.html" ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$rev" ]; then
    ok "برنامه برای این نسخه قبلاً ساخته شده است"; return 0
  fi
  log "ساخت و راستی‌آزمایی برنامه (چند دقیقه؛ بار اول ایمیج Node دانلود می‌شود)…"
  docker run --rm -v "$SRC":/app -w /app -v cafino-npm-cache:/root/.npm ${NPM_REGISTRY:+-e "npm_config_registry=$NPM_REGISTRY"} "$NODE_IMAGE" bash -c \
    'set -e; npm ci --no-audit --no-fund && npm run build && npm run verify:dist && cd server && node deploy/make-csp.mjs ../dist/pwa' \
    || die "ساخت برنامه شکست خورد. اگر دسترسی به registry.npmjs.org/Docker Hub محدود است، NPM_REGISTRY=<آینه> یا NODE_IMAGE=<آینه> را بدهید."
  [ -f "$SRC/dist/pwa/index.html" ] || die "خروجی dist/pwa ساخته نشد"
  printf '%s' "$rev" >"$stamp"
  ok "برنامه ساخته و تأیید شد (SHA-256 همهٔ فایل‌ها)"
}

# ── پیکربندی ─────────────────────────────────────────────────────────────────
public_host() {
  if [ -n "$DOMAIN" ]; then printf '%s' "$DOMAIN"; return; fi
  hostname -I 2>/dev/null | awk '{print $1}'
}

write_env() {
  PUBLIC_HOST="$(public_host)"
  if [ ! -f "$ENV_FILE" ]; then
    if docker volume inspect server_dbdata >/dev/null 2>&1; then
      die "پایگاه‌دادهٔ قبلی (volume: server_dbdata) هست ولی $ENV_FILE نیست؛ رمز آن گم شده. فایل .env قبلی را برگردانید (یا اگر داده را نمی‌خواهید: docker volume rm server_dbdata — همهٔ داده‌ها پاک می‌شود)."
    fi
    (umask 077; cp "$SRV/.env.example" "$ENV_FILE")
    log "ساخت $ENV_FILE با رازهای تصادفی…"
  fi
  chmod 600 "$ENV_FILE"
  ensure_secret JWT_SECRET rand_hex 48 || true
  ensure_secret POSTGRES_PASSWORD rand_hex 24 || true
  ensure_secret APP_DB_PASSWORD rand_hex 24 || true
  ensure_secret BOT_TOKEN_KEY rand_hex 32 || true
  set_env NODE_ENV production
  set_env TRUST_PROXY 1
  set_env ALLOW_REGISTRATION false
  if [ "$NO_TLS" = 1 ]; then set_env COOKIE_SECURE false; else set_env COOKIE_SECURE true; fi
  if [ -n "$PUBLIC_HOST" ]; then set_env PUBLIC_BASE_URL "$SCHEME://$PUBLIC_HOST"; set_env MINIAPP_URL "$SCHEME://$PUBLIC_HOST/m"; fi
  [ -z "$TG_BASE" ] || set_env TELEGRAM_API_BASE "$TG_BASE"
  if [ "$WITH_CLAMAV" = 1 ]; then set_env CLAMAV_HOST clamav; set_env COMPOSE_PROFILES av; fi
  [ -n "$(get_env APP_DB_PASSWORD)" ] && [ "$(get_env APP_DB_PASSWORD)" != "$(get_env POSTGRES_PASSWORD)" ] || die "APP_DB_PASSWORD و POSTGRES_PASSWORD باید پر و متفاوت باشند"
  ok ".env آماده است (دسترسی 600)"
}

write_local_files() {
  mkdir -p "$LOCAL_DIR"
  if [ "$NO_PROXY" = 1 ]; then
    rm -f "$SRV/docker-compose.override.yml" "$LOCAL_DIR/Caddyfile" "$LOCAL_DIR/trusted-proxies.conf"
    ok "بدون Caddy: پراکسی HTTPS خودتان را به 127.0.0.1:8080 وصل کنید (و آدرسش را در deploy/trusted-proxies.conf بنویسید)"
    return 0
  fi
  # فقط پراکسی داخل شبکهٔ docker مورد اعتماد است (Caddy همین بسته)؛ هیچ X-Forwarded-For بیرونی پذیرفته نمی‌شود
  cat >"$LOCAL_DIR/trusted-proxies.conf" <<'EOF'
# ساخته‌شده توسط install.sh — پراکسی مورد اعتماد = Caddy داخل شبکهٔ docker همین بسته
set_real_ip_from 172.16.0.0/12;
set_real_ip_from 192.168.0.0/16;
EOF
  if [ "$NO_TLS" = 1 ]; then
    cat >"$LOCAL_DIR/Caddyfile" <<'EOF'
# بدون TLS (فقط آزمایش)
{
	auto_https off
}
:80 {
	encode zstd gzip
	reverse_proxy web:80
}
EOF
  else
    {
      if [ -n "$EMAIL" ]; then printf '{\n\temail %s\n}\n' "$EMAIL"; fi
      printf '%s {\n\tencode zstd gzip\n\theader Strict-Transport-Security "max-age=31536000; includeSubDomains"\n\treverse_proxy web:80\n}\n' "$DOMAIN"
    } >"$LOCAL_DIR/Caddyfile"
  fi
  cat >"$SRV/docker-compose.override.yml" <<'EOF'
# ساخته‌شدهٔ install.sh (خارج از git) — HTTPS خودکار با Caddy جلوی nginx بسته
services:
  web:
    volumes:
      - ./deploy/local/trusted-proxies.conf:/etc/nginx/trusted-proxies.conf:ro
  caddy:
    image: caddy:2-alpine
    container_name: cafino-caddy
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./deploy/local/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [web]
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
    networks: [internal]
volumes:
  caddy_data:
  caddy_config:
EOF
  ok "Caddy و پیکربندی پراکسی نوشته شد"
}

# ── راه‌اندازی ───────────────────────────────────────────────────────────────
wait_healthy() {
  log "منتظر آماده‌شدن سرویس‌ها (مهاجرت‌های پایگاه‌داده در اولین بار)…"
  for _ in $(seq 1 90); do
    if curl -fsS --max-time 3 http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
      if dc exec -T api node -e 'fetch("http://127.0.0.1:8080/readyz").then(r=>r.text()).then(t=>{process.stdout.write(t);process.exit(t.includes("\"ok\":true")?0:1)}).catch(()=>process.exit(1))' >/dev/null 2>&1; then ok "سرویس‌ها سالم‌اند"; return 0; fi
    fi
    sleep 2
  done
  dc ps || true; dc logs --tail=60 api db || true
  die "سرویس‌ها در ۳ دقیقه آماده نشدند (لاگ بالا). خطاهای رایج: پورت اشغال، کمبود حافظه."
}

start_stack() {
  log "راه‌اندازی سرویس‌ها (ساخت ایمیج API در اولین بار چند دقیقه طول می‌کشد)…"
  dc up -d --build
  wait_healthy
}

create_admin() {
  local marker="$LOCAL_DIR/admin-created" cred="/root/cafino-credentials.txt"
  if [ -f "$marker" ] && [ "$RESET_ADMIN" = 0 ]; then ok "مدیر پنل مرکزی قبلاً ساخته شده ($(cat "$marker")؛ برای بازنشانی رمز: --reset-admin)"; return 0; fi
  if [ -z "$ADMIN_PASSWORD" ]; then ADMIN_PASSWORD="$(gen_password)"; GENERATED_PW=1; fi
  log "ساخت مدیر پنل مرکزی ($ADMIN_EMAIL)…"
  local out
  out="$(ADMIN_PASSWORD="$ADMIN_PASSWORD" dc exec -T -e ADMIN_PASSWORD api node scripts/create-admin.mjs "$ADMIN_EMAIL" 2>&1)" \
    || die "ساخت مدیر شکست خورد: $out  (رمز باید دست‌کم ۸ نویسه باشد). بعداً:  cd $SRV && ADMIN_PASSWORD='…' docker compose exec -T -e ADMIN_PASSWORD api node scripts/create-admin.mjs $ADMIN_EMAIL"
  case "$out" in *"متعلق به کاربر کافی"*) die "ایمیل $ADMIN_EMAIL قبلاً برای یک کاربر کافی‌نت ثبت شده و مدیر ساخته نشد؛ ایمیل دیگری بدهید (--admin-email … --reset-admin)." ;; esac
  printf '%s\n' "$out"
  printf '%s' "$ADMIN_EMAIL" >"$marker"
  if [ "$GENERATED_PW" = 1 ]; then
    (umask 077; printf 'کافینو — %s\nایمیل: %s\nرمز:   %s\n(بعد از ورود و تغییر رمز این فایل را پاک کنید)\n' "$SCHEME://$PUBLIC_HOST" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" >"$cred")
  fi
}

setup_firewall() {
  [ "$NO_FIREWALL" = 0 ] || { warn "فایروال دست نخورد (--no-firewall)"; return 0; }
  local ports p; ports="$SSH_PORT"
  [ -n "$ports" ] || ports="$(ss -H -ltnp 2>/dev/null | awk '/"sshd"/ {n=split($4,a,":"); print a[n]}' | sort -u | tr '\n' ' ')"
  [ -n "${ports// /}" ] || ports="22"
  log "فایروال: باز می‌ماند SSH ($ports)، 80، 443؛ بقیه بسته…"
  for p in $ports; do ufw limit "$p/tcp" comment 'ssh' >/dev/null; done
  ufw allow 80/tcp comment 'http' >/dev/null; ufw allow 443/tcp comment 'https' >/dev/null
  ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
  ufw --force enable >/dev/null
  ok "ufw فعال است (PostgreSQL و API هرگز بیرون منتشر نمی‌شوند)"
}

setup_cron() {
  log "پشتیبان‌گیری روزانه و پایش سلامت…"
  mkdir -p /var/backups/cafino; chmod 700 /var/backups/cafino
  touch /var/log/cafino-backup.log /var/log/cafino-health.log
  cat >/etc/cron.d/cafino <<EOF
# ساخته‌شده توسط install.sh
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root /bin/sh $SRV/deploy/backup.sh >> /var/log/cafino-backup.log 2>&1
*/5 * * * * root /bin/sh $SRV/deploy/healthcheck.sh >> /var/log/cafino-health.log 2>&1 || true
EOF
  chmod 644 /etc/cron.d/cafino
  install -m 644 "$SRV/deploy/logrotate-cafino" /etc/logrotate.d/cafino 2>/dev/null || true
  if /bin/sh "$SRV/deploy/backup.sh" >>/var/log/cafino-backup.log 2>&1; then ok "نخستین پشتیبان گرفته شد (/var/backups/cafino)"; else warn "نخستین پشتیبان ناموفق بود؛ /var/log/cafino-backup.log را ببینید"; fi
}

# ── بررسی نهایی ──────────────────────────────────────────────────────────────
chk() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else printf '%s✘%s %s\n' "$c_red" "$c_off" "$d" >&2; FAILS=$((FAILS+1)); fi; }
retry() { local n="$1"; shift; local _; for _ in $(seq 1 "$n"); do "$@" && return 0; sleep 3; done; return 1; }

smoke() {
  PUBLIC_HOST="${PUBLIC_HOST:-$(public_host)}"
  log "بررسی نهایی…"
  FAILS=0
  local svc; for svc in db api web; do chk "سرویس $svc در حال اجراست" bash -c "cd '$SRV' && docker compose ps --status running --services | grep -qx $svc"; done
  chk "healthz (داخلی)" curl -fsS --max-time 5 http://127.0.0.1:8080/healthz
  chk "صفحهٔ برنامه" bash -c "curl -fsS --max-time 8 http://127.0.0.1:8080/ | grep -qi '<div id=\"root\"\\|<title'"
  chk "مینی‌اپ (/m/) از API می‌آید و CSP اختصاصی دارد" bash -c "curl -fsS --max-time 8 -D - -o /dev/null http://127.0.0.1:8080/m/ | tr 'A-Z' 'a-z' | grep -q 'frame-ancestors'"
  if [ "$NO_PROXY" = 0 ]; then
    if [ "$NO_TLS" = 1 ]; then chk "دسترسی از بیرون (http)" curl -fsS --max-time 8 http://127.0.0.1/healthz
    else
      if retry 20 curl -fsS --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/healthz" >/dev/null 2>&1; then ok "HTTPS با گواهی معتبر روی $DOMAIN"
      else
        printf '%s✘%s HTTPS/گواهی روی %s آماده نشد\n' "$c_red" "$c_off" "$DOMAIN" >&2; FAILS=$((FAILS+1))
        warn "علت‌های رایج: رکورد DNS هنوز منتشر نشده، پورت 80/443 در فایروال ابری/مزدوج بسته است، یا Let's Encrypt از این سرور قابل‌دسترس نیست. لاگ: docker compose -f $SRV/docker-compose.yml logs caddy"
      fi
    fi
  fi
}

print_summary() {
  local url="$SCHEME://$PUBLIC_HOST"
  printf '\n%s════════════════ کافینو نصب شد ════════════════%s\n' "$c_grn" "$c_off"
  printf '  نشانی:           %s\n' "$url"
  printf '  مینی‌اپ:         %s/m/\n' "$url"
  printf '  مدیر پنل مرکزی:  %s\n' "$ADMIN_EMAIL"
  if [ "$GENERATED_PW" = 1 ]; then printf '  رمز (فقط همین‌بار): %s\n  (در /root/cafino-credentials.txt هم ذخیره شد؛ بعد از ورود رمز را عوض و فایل را پاک کنید)\n' "$ADMIN_PASSWORD"; fi
  cat <<EOF

  کارهای بعدی:
   ۱) با نشانی بالا وارد شوید و کافی‌نت‌ها را از پنل مرکزی بسازید.
   ۲) مینی‌اپ تلگرام/بله: برنامه ← تنظیمات ← اتصال ← «مینی‌اپ تلگرام / بله» (توکن ربات هر کافی‌نت).
      $( [ -n "$TG_BASE" ] && echo "پراکسی تلگرام تنظیم شده است ($TG_BASE)." || echo "اگر سرور داخل ایران است و api.telegram.org بسته است: با --telegram-api-base <پراکسی> دوباره اجرا کنید." )
   ۳) ایمیل بازیابی رمز: SMTP_URL و MAIL_FROM را در $ENV_FILE بنویسید، سپس:  cd $SRV && docker compose up -d
   ۴) پشتیبان بیرون از سرور (ضروری): در /etc/cron.d/cafino، در خط پشتیبان قبل از /bin/sh بنویسید  OFFSITE_CMD='rclone copy "\$1" remote:cafino-backups/'  (راهنما: server/DEPLOY-UBUNTU-fa.md).
   ۵) به‌روزرسانی نسخهٔ بعد:  sudo bash $SRV/deploy/update.sh
  گزارش نصب: $INSTALL_LOG      دسترسی راه دور: ssh به سرور ← cd $SRV && docker compose ps
EOF
}

print_plan() {
  cat <<EOF
طرح کار (--dry-run؛ هیچ تغییری داده نمی‌شود)
  حالت:            $([ "$UPDATE" = 1 ] && echo "به‌روزرسانی" || echo "نصب")
  مسیر سورس:       $SRC  (شاخه $BRANCH)
  دامنه/نشانی:     ${DOMAIN:-$(public_host)}  ($SCHEME)
  مدیر:            ${ADMIN_EMAIL:-—}
  Caddy/HTTPS:     $([ "$NO_PROXY" = 1 ] && echo "نصب نمی‌شود" || ([ "$NO_TLS" = 1 ] && echo "HTTP بدون TLS" || echo "HTTPS خودکار (Let's Encrypt)"))
  فایروال ufw:     $([ "$NO_FIREWALL" = 1 ] && echo "دست نمی‌خورد" || echo "SSH + 80 + 443")
  ClamAV:          $([ "$WITH_CLAMAV" = 1 ] && echo "بله" || echo "خیر")
  پراکسی تلگرام:   ${TG_BASE:-—}
مراحل: بررسی سیستم ← بسته‌های پایه ← Docker ← دریافت سورس ← ساخت برنامه (در کانتینر Node) ← .env با رازهای تصادفی
       ← Caddy و پیکربندی ← docker compose up ← ساخت مدیر ← فایروال ← cron پشتیبان/پایش ← بررسی نهایی
EOF
}

main() {
  parse_args "$@"
  locate_source
  validate_inputs
  if [ "$DRY_RUN" = 1 ]; then print_plan; return 0; fi
  : >>"$INSTALL_LOG" 2>/dev/null || INSTALL_LOG=/tmp/cafino-install.log
  chmod 600 "$INSTALL_LOG" 2>/dev/null || true
  exec > >(tee -a "$INSTALL_LOG") 2>&1
  trap 'on_err $LINENO' ERR
  printf '=== %s  install.sh %s ===\n' "$(date '+%F %T')" "$([ "$UPDATE" = 1 ] && echo update || echo install)"

  if [ "$UPDATE" = 1 ]; then
    preflight
    [ -f "$ENV_FILE" ] || die "نصب موجودی پیدا نشد ($ENV_FILE). ابتدا install.sh را اجرا کنید."
    PUBLIC_HOST="$(get_env PUBLIC_BASE_URL)"; PUBLIC_HOST="${PUBLIC_HOST#*://}"
    DOMAIN="$(grep -m1 -E '^[a-z0-9.-]+ \{' "$LOCAL_DIR/Caddyfile" 2>/dev/null | cut -d' ' -f1 || true)"
    [ "$(get_env COOKIE_SECURE)" = false ] && { NO_TLS=1; SCHEME=http; }
    [ -f "$SRV/docker-compose.override.yml" ] || NO_PROXY=1
    if [ "$SKIP_BACKUP" = 0 ]; then log "پشتیبان پیش از به‌روزرسانی…"; /bin/sh "$SRV/deploy/backup.sh" || die "پشتیبان ناموفق بود؛ به‌روزرسانی انجام نشد (داده‌ها دست‌نخورده‌اند). با --skip-backup رد می‌شود (توصیه نمی‌شود)."; fi
    fetch_source
    ensure_swap
    build_pwa
    start_stack
    smoke
    [ "$FAILS" = 0 ] && ok "به‌روزرسانی کامل شد" || die "به‌روزرسانی انجام شد ولی $FAILS بررسی ناموفق بود (بالا را ببینید)"
    return 0
  fi

  preflight
  check_dns
  ensure_swap
  install_packages
  install_docker
  fetch_source
  build_pwa
  write_env
  write_local_files
  start_stack
  create_admin
  setup_firewall
  setup_cron
  smoke
  print_summary
  [ "$FAILS" = 0 ] || { warn "$FAILS بررسی نهایی ناموفق بود؛ پیام‌های بالا را ببینید. (نصب انجام شده؛ پس از رفع علت می‌توانید دوباره اجرا کنید.)"; exit 2; }
}

[ "${CAFINO_INSTALL_SOURCE_ONLY:-0}" = 1 ] || main "$@"
