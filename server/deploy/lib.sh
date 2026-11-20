# توابع مشترک اسکریپت‌های استقرار (source می‌شود). دو حالت اجرا:
#   docker (پیش‌فرض):  دستورهای PostgreSQL داخل کانتینر db اجرا می‌شوند  → DB_EXEC="docker compose exec -T db"
#   host:               خود PostgreSQL روی همین سرور/راه دور است       → DB_EXEC=""  و متغیرهای PGHOST/PGPORT/PGUSER/PGPASSWORD
# همهٔ مسیرها نسبت به محل خود اسکریپت‌اند (مستقل از محل نصب).
CAFINO_DIR="${CAFINO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DB_NAME="${DB_NAME:-cafino}"; DB_USER="${DB_USER:-cafino}"
DB_EXEC="${DB_EXEC-docker compose exec -T db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cafino}"
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
# psql/pg_dump/pg_restore با/بدون کانتینر
dbx() { cmd="$1"; shift; if [ -n "$DB_EXEC" ]; then (cd "$CAFINO_DIR" && $DB_EXEC "$cmd" "$@"); else "$cmd" "$@"; fi; }
sha256_of() { sha256sum "$1" | cut -d' ' -f1; }

# ── رمزنگاری پشتیبان و اعلان (مشترک backup/restore/monitor/deploy) ──
# رمز عبور رمزنگاری فقط روی سرور است (/etc/cafino/backup.pass با مجوز ۶۰۰) و هرگز داخل پشتیبان یا مخزن نمی‌رود.
BACKUP_PASS_FILE="${BACKUP_PASS_FILE:-/etc/cafino/backup.pass}"
NOTIFY_ENV="${NOTIFY_ENV:-/etc/cafino/notify.env}"
# enc_mode: gpg-pass | gpg-key | none
enc_mode() {
  if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then echo gpg-key
  elif [ -s "$BACKUP_PASS_FILE" ]; then echo gpg-pass
  else echo none; fi
}
# encrypt_file ورودی خروجی  (نیاز به gpg)
encrypt_file() {
  case "$(enc_mode)" in
    gpg-key)  gpg --batch --yes --trust-model always -r "$BACKUP_GPG_RECIPIENT" -o "$2" -e "$1" ;;
    gpg-pass) gpg --batch --yes --pinentry-mode loopback --passphrase-file "$BACKUP_PASS_FILE" --cipher-algo AES256 -o "$2" -c "$1" ;;
    *) return 1 ;;
  esac
}
# decrypt_file ورودی.gpg خروجی  (با کلید خصوصی در keyring یا رمز عبور سرور)
decrypt_file() {
  if [ -s "$BACKUP_PASS_FILE" ]; then
    gpg --batch --yes --pinentry-mode loopback --passphrase-file "$BACKUP_PASS_FILE" -o "$2" -d "$1" 2>/dev/null && return 0
  fi
  gpg --batch --yes -o "$2" -d "$1"
}
notify() { # notify سطح پیام...   (بی‌صدا شکست می‌خورد؛ نباید اجرای اصلی را بشکند)
  [ -x "$(dirname "$0")/notify.sh" ] || [ -f "$(dirname "$0")/notify.sh" ] || return 0
  sh "$(dirname "$0")/notify.sh" "$@" >/dev/null 2>&1 || true
}

# ── ابزارهای استقرار (deploy.sh / rollback.sh) ──
ENV_FILE="${ENV_FILE:-$CAFINO_DIR/.env}"
SRC_DIR="${SRC_DIR:-$(dirname "$CAFINO_DIR")}"
STATE_DIR_DEPLOY="${STATE_DIR_DEPLOY:-$SRC_DIR/.deploy-state}"
RELEASES_DIR="${RELEASES_DIR:-$SRC_DIR/.releases}"
dc() { (cd "$CAFINO_DIR" && docker compose "$@"); }
env_get() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 || true; }
# env_set کلید مقدار — «درجا» می‌نویسد (inode عوض نشود) و فقط خط فعال را تغییر می‌دهد؛ مقدار رمزها هرگز چاپ نمی‌شود
env_set() {
  k="$1"; v="$2"; tmp="$(mktemp)"
  if grep -q "^$k=" "$ENV_FILE" 2>/dev/null; then awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k && !d {print k"="v; d=1; next} {print}' "$ENV_FILE" > "$tmp"
  else { cat "$ENV_FILE" 2>/dev/null; printf '%s=%s\n' "$k" "$v"; } > "$tmp"; fi
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
# wait_ready [نسخهٔ مورد انتظار] [تعداد تلاش ۲ثانیه‌ای] → 0 وقتی API آماده (و در صورت درخواست، همان نسخه) و nginx پاسخ‌گو است؛ پاسخ در READY_JSON
# shellcheck disable=SC2034  # READY_JSON را فراخوان می‌خواند
wait_ready() {
  want="${1:-}"; n="${2:-45}"; i=0; wp="$(env_get WEB_PORT)"; wp="${wp:-8080}"; r=""
  while [ "$i" -lt "$n" ]; do
    r="$(dc exec -T api node -e 'fetch("http://127.0.0.1:8080/readyz").then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))' 2>/dev/null || true)"
    case "$r" in *'"ok":true'*)
      if [ -z "$want" ] || printf '%s' "$r" | grep -q "\"version\":\"$want\""; then
        if curl -fsS --max-time 4 "http://127.0.0.1:$wp/healthz" >/dev/null 2>&1; then READY_JSON="$r"; return 0; fi
      fi;;
    esac
    i=$((i + 1)); sleep "${READY_SLEEP:-2}"
  done
  READY_JSON="$r"; return 1
}
# اعمال فایل‌های یک انتشار (پوشهٔ $1 با pwa/ و server/): برنامه با --delay-updates (پوشه روی nginx mount است، inode ثابت می‌ماند)،
# اسکریپت‌ها با rename عادی (اسکریپت در حال اجرا خراب نشود)، فایل‌های mount تکی (nginx.conf, csp.conf, …) «درجا» تا nginx همان inode را ببیند.
# هرگز: .env، deploy/local، docker-compose.override.yml، certs.
# --checksum ضروری است: mtime فایل‌های بسته ثابت (۲۰۲۰) است و rsync بدون آن فایل هم‌اندازه را «بدون تغییر» می‌پندارد
apply_release_files() {
  rel="$1"
  mkdir -p "$SRC_DIR/dist/pwa"
  rsync -a --checksum --delete --delay-updates "$rel/pwa/" "$SRC_DIR/dist/pwa/" || return 1
  rsync -a --checksum --include='*/' --include='*.sh' --exclude='*' "$rel/server/" "$CAFINO_DIR/" || return 1
  rsync -a --checksum --inplace --exclude='*.sh' --exclude='local/' --exclude='.env' --exclude='docker-compose.override.yml' --exclude='certs/' "$rel/server/" "$CAFINO_DIR/" || return 1
  rm -f "$SRC_DIR/dist/.build-rev"   # update.sh دفعهٔ بعد خودش دوباره بسازد
}
state_get() { [ -f "$STATE_DIR_DEPLOY/$1" ] && cat "$STATE_DIR_DEPLOY/$1" || true; }
state_set() { mkdir -p "$STATE_DIR_DEPLOY"; printf '%s\n' "$2" > "$STATE_DIR_DEPLOY/$1"; }
history_add() { mkdir -p "$STATE_DIR_DEPLOY"; printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$STATE_DIR_DEPLOY/history.log"; }
# مجموعهٔ مهاجرت‌های اعمال‌شده روی دیتابیس (یک نام در هر خط)؛ اگر جدول هنوز نیست خالی
db_migrations() { dbx psql -U "$DB_USER" -d "$DB_NAME" -qAt -c "SELECT name FROM schema_migrations ORDER BY name" 2>/dev/null || true; }
