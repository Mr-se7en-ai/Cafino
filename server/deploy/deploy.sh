#!/bin/sh
# استقرار یک «بستهٔ انتشار» (ساخته‌شده توسط scripts/make-release.sh در CI) روی این سرور. فقط root (از ci-entry.sh با sudo یا دستی).
#   deploy.sh --bundle cafino-release-<شناسه>.tar.gz [--plan] [--approve-migrations] [--skip-backup] [--no-rollback]
#   deploy.sh --status      ← نسخهٔ فعال/قبلی و آخرین تاریخچه
#
# ترتیب (هر مرحله شکست بخورد، قبل از تغییر هر چیز زنده متوقف می‌شود؛ پس از تغییر، بازگشت خودکار):
#  ۱ قفل (دو استقرار هم‌زمان نه)  ۲ بازکردن امن بسته + بررسی MANIFEST  ۳ بارگذاری ایمیج API  ۴ مهاجرت‌های در انتظار (--plan فقط نشان می‌دهد)
#  ۵ پشتیبان کامل پیش از استقرار (اجباری؛ شکست = توقف)  ۶ اعمال فایل‌ها  ۷ جایگزینی کانتینر API (دیتابیس/آپلود/Caddy دست‌نخورده)
#  ۸ reload نگینکس + بررسی سلامت (نسخهٔ در حال سرویس باید همان نسخهٔ جدید باشد)  ۹ ثبت نتیجه و پاک‌سازی انتشارهای قدیمی
# کدهای خروج: 0 موفق | 1 شکست (بازگشت خودکار انجام شد) | 2 ورودی/بستهٔ نامعتبر | 3 مهاجرت در انتظار و تأیید داده نشده | 4 پشتیبان پیش از استقرار شکست خورد
# محدودیت صادقانه: جایگزینی کانتینر API چند ثانیه (معمولاً ۵ تا ۱۵) پاسخ‌های API را قطع می‌کند؛ فایل‌های برنامه اتمیک عوض می‌شوند و
# برنامهٔ نصب‌شده (PWA) در این مدت آفلاین کار می‌کند. «صفر-قطعی» واقعی نیازمند دو نمونهٔ API پشت load-balancer است که در این معماری نیست.
set -eu
umask 022
. "$(dirname "$0")/lib.sh"
BUNDLE=""; STATUS=0; PLAN=0; APPROVE=0; SKIPBK=0; NOROLL=0; KEEP_RELEASES="${KEEP_RELEASES:-3}"
while [ $# -gt 0 ]; do case "$1" in
  --bundle) BUNDLE="${2:-}"; shift;; --status) STATUS=1;; --plan) PLAN=1;; --approve-migrations) APPROVE=1;; --skip-backup) SKIPBK=1;; --no-rollback) NOROLL=1;;
  *) log "گزینهٔ ناشناخته: $1" >&2; exit 2;; esac; shift; done
[ "$(id -u)" = 0 ] || { log "با sudo اجرا کنید" >&2; exit 2; }
if [ "$STATUS" = 1 ]; then
  echo "current=$(state_get current) previous=$(state_get previous) tag=$(env_get CAFINO_API_TAG) env=$(env_get CAFINO_ENV)"
  tail -8 "$STATE_DIR_DEPLOY/history.log" 2>/dev/null || true; exit 0
fi
[ -f "$BUNDLE" ] || { log "فایل بسته پیدا نشد: $BUNDLE" >&2; exit 2; }
command -v rsync >/dev/null 2>&1 || die "rsync نصب نیست (apt install rsync)"
[ -f "$ENV_FILE" ] || die "$ENV_FILE نیست؛ ابتدا install.sh اجرا شود"
CAFINO_ENV_V="$(env_get CAFINO_ENV)"; CAFINO_ENV_V="${CAFINO_ENV_V:-production}"
if [ "$CAFINO_ENV_V" = staging ]; then BACKUP_DIR="${BACKUP_DIR_STAGING:-/var/backups/cafino-staging}"; fi
export BACKUP_DIR
[ "$SKIPBK" = 0 ] || [ "$CAFINO_ENV_V" = staging ] || die "--skip-backup فقط روی staging مجاز است"

mkdir -p "$STATE_DIR_DEPLOY" "$RELEASES_DIR"; chmod 700 "$STATE_DIR_DEPLOY"
exec 8>"$STATE_DIR_DEPLOY/lock"
command -v flock >/dev/null 2>&1 && { flock -n 8 || { log "استقرار دیگری در حال اجراست" >&2; exit 2; }; }
INC="$RELEASES_DIR/.incoming-$$"
cleanup() { rm -rf "$INC"; }
trap cleanup EXIT
fail_notify() { notify crit "$*"; }

# ── ۲) بازکردن امن بسته (نامعتبر/خطرناک = رد) ──
log "بررسی بسته $(basename "$BUNDLE") …"
tar -tzf "$BUNDLE" > "$INC.list" 2>/dev/null || { rm -f "$INC.list"; log "آرشیو خراب است" >&2; exit 2; }
if grep -qE '^/|(^|/)\.\.(/|$)' "$INC.list"; then rm -f "$INC.list"; log "مسیر خطرناک در بسته (مسیر مطلق یا ..)" >&2; exit 2; fi
if tar -tvzf "$BUNDLE" | cut -c1 | grep -qvE '^[-d]$'; then rm -f "$INC.list"; log "بسته شامل لینک/فایل ویژه است؛ رد شد" >&2; exit 2; fi
rm -f "$INC.list"
mkdir -p "$INC"; tar --no-same-owner --no-same-permissions -xzf "$BUNDLE" -C "$INC" || { log "باز کردن بسته شکست خورد" >&2; exit 2; }
( cd "$INC" && sha256sum -c --quiet MANIFEST.sha256 ) || { log "MANIFEST با محتوای بسته نمی‌خواند — بسته خراب یا دست‌کاری شده" >&2; exit 2; }
( cd "$INC" && find . -type f ! -name MANIFEST.sha256 | sort > "$INC.a" && awk '{print $2}' MANIFEST.sha256 | sort > "$INC.b" )
extra_files="$(comm -23 "$INC.a" "$INC.b" | tr '\n' ' ')"; rm -f "$INC.a" "$INC.b"
[ -z "$extra_files" ] || { log "فایل‌های خارج از MANIFEST: $extra_files" >&2; exit 2; }
ID="$(cat "$INC/RELEASE_ID")"; VER="$(cat "$INC/VERSION")"
printf '%s' "$ID" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?-[0-9a-f]{7}$' || { log "شناسهٔ انتشار نامعتبر" >&2; exit 2; }
for f in pwa/index.html server/docker-compose.yml api-image.tar.gz MIGRATIONS; do [ -e "$INC/$f" ] || { log "$f در بسته نیست" >&2; exit 2; }; done
[ -s "$INC/api-image.tar.gz" ] || { log "ایمیج API در بسته خالی است" >&2; exit 2; }
log "انتشار $ID (نسخهٔ برنامه $VER) روی محیط $CAFINO_ENV_V"

cur="$(state_get current)"
if [ "$cur" = "$ID" ] && [ "$PLAN" = 0 ]; then log "این انتشار همین حالا فعال است؛ دوباره اعمال می‌شود"; fi
docker info >/dev/null 2>&1 || die "Docker در دسترس نیست"
dc ps -q db >/dev/null 2>&1 && [ -n "$(dc ps -q db)" ] || die "سرویس db بالا نیست؛ ابتدا install.sh (نصب اولیه) اجرا شود"
dpath=/var/lib/docker; [ -d "$dpath" ] || dpath=/
[ "$(df -Pm "$dpath" | awk 'NR==2{print $4}')" -ge 1500 ] 2>/dev/null || die "فضای خالی $dpath کمتر از ۱٫۵ گیگابایت است"

# ── ۳) ایمیج ──
log "بارگذاری ایمیج API …"
gunzip -c "$INC/api-image.tar.gz" | docker load >/dev/null || { log "docker load شکست خورد" >&2; exit 2; }
docker image inspect "cafino-api:$ID" >/dev/null 2>&1 || { log "ایمیج cafino-api:$ID پس از بارگذاری نیست" >&2; exit 2; }

# ── ۴) مهاجرت‌های در انتظار ──
db_migrations | sort > "$INC.db"
sort "$INC/MIGRATIONS" | comm -23 - "$INC.db" > "$INC.pending"; rm -f "$INC.db"
PENDING="$(tr '\n' ' ' < "$INC.pending")"; rm -f "$INC.pending"
if [ -n "$PENDING" ]; then
  log "مهاجرت‌های در انتظار (هنگام بالا آمدن API اجرا می‌شوند): $PENDING"
  for m in $PENDING; do
    if docker run --rm --entrypoint cat "cafino-api:$ID" "/app/migrations/$m" 2>/dev/null | grep -qiE 'drop[[:space:]]+(table|column|schema)|truncate|delete[[:space:]]+from|alter[[:space:]]+column[^;]*type'; then log "  ⚠ $m شامل عملیات مخرب/تغییر نوع است — محتوا را پیش از تأیید بخوانید"; fi
  done
else log "مهاجرت جدیدی در انتظار نیست"; fi
if [ "$PLAN" = 1 ]; then
  echo "PLAN release=$ID version=$VER current=${cur:-none} pending_migrations=${PENDING:-none}"
  exit 0
fi
if [ -n "$PENDING" ] && [ "$APPROVE" != 1 ]; then
  log "توقف: مهاجرت ساختار دیتابیس بدون تأیید صریح انجام نمی‌شود. با --approve-migrations (در GitHub: ورودی approve_migrations) دوباره اجرا کنید." >&2
  fail_notify "استقرار $ID متوقف شد: مهاجرت دیتابیس در انتظار تأیید است ($PENDING)"
  exit 3
fi

# ── ۵) پشتیبان پیش از استقرار (اجباری) ──
if [ "$SKIPBK" = 1 ]; then log "پشتیبان پیش از استقرار رد شد (--skip-backup، staging)"; state_set predeploy-backup ""
else
  log "پشتیبان کامل پیش از استقرار …"
  if sh "$(dirname "$0")/backup.sh"; then
    bk="$(ls -1t "$BACKUP_DIR"/cafino-*.dump "$BACKUP_DIR"/cafino-*.dump.gpg 2>/dev/null | head -1)"; state_set predeploy-backup "$bk"; log "پشتیبان: $(basename "$bk")"
  else fail_notify "استقرار $ID متوقف شد: پشتیبان پیش از استقرار ناموفق بود (چیزی تغییر نکرد)"; exit 4; fi
fi

# ── اولین استقرار CI: وضعیت فعلی (ساخته‌شده توسط install.sh) به‌عنوان نقطهٔ بازگشت ثبت می‌شود ──
if [ -z "$cur" ]; then
  BASE="baseline-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$RELEASES_DIR/$BASE/server" "$RELEASES_DIR/$BASE/pwa"
  [ -d "$SRC_DIR/dist/pwa" ] && rsync -a "$SRC_DIR/dist/pwa/" "$RELEASES_DIR/$BASE/pwa/"
  rsync -a --exclude='local/' --exclude='.env' --exclude='docker-compose.override.yml' --exclude='certs/' "$CAFINO_DIR/" "$RELEASES_DIR/$BASE/server/"
  echo "$BASE" > "$RELEASES_DIR/$BASE/RELEASE_ID"; echo "$(env_get CAFINO_API_TAG)" | sed 's/^$/local/' > "$RELEASES_DIR/$BASE/API_TAG"
  docker run --rm --entrypoint ls "cafino-api:$(cat "$RELEASES_DIR/$BASE/API_TAG")" /app/migrations 2>/dev/null | sort > "$RELEASES_DIR/$BASE/MIGRATIONS" || : > "$RELEASES_DIR/$BASE/MIGRATIONS"
  cur="$BASE"; state_set current "$BASE"; history_add "baseline $BASE (وضعیت پیش از اولین استقرار CI)"
fi
# نسخهٔ اسکریپت‌های «سالم قبلی» برای بازگشت (اگر اسکریپت‌های تازه خراب بودند)
rm -rf "$STATE_DIR_DEPLOY/prev-scripts"; mkdir -p "$STATE_DIR_DEPLOY/prev-scripts"; cp "$CAFINO_DIR"/deploy/*.sh "$STATE_DIR_DEPLOY/prev-scripts/"
state_set rollback-tag "$(env_get CAFINO_API_TAG)"

# ── ۶ و ۷) اعمال ──
REL="$RELEASES_DIR/$ID"; rm -rf "$REL"; mv "$INC" "$REL"; echo "$ID" > "$REL/API_TAG"; INC="$RELEASES_DIR/.gone-$$"
history_add "deploy $cur -> $ID begin"
rollback_now() {
  [ "$NOROLL" = 0 ] || { log "بازگشت خودکار خاموش است (--no-rollback)"; return 1; }
  log "بازگشت خودکار به $cur …"
  CAFINO_DIR="$CAFINO_DIR" sh "$STATE_DIR_DEPLOY/prev-scripts/rollback.sh" "$cur" --auto || return 1
}
if ! apply_release_files "$REL"; then history_add "deploy $ID FAILED apply"; rollback_now || true; fail_notify "استقرار $ID ناموفق بود (اعمال فایل‌ها)؛ وضعیت را بررسی کنید"; exit 1; fi
env_set CAFINO_API_TAG "$ID"
log "جایگزینی کانتینر API …"
dc up -d --no-build --no-deps --wait --wait-timeout 180 api || log "هشدار: compose --wait موفق نبود؛ سلامت بررسی می‌شود"
dc up -d --no-build --no-deps web >/dev/null 2>&1 || true
if dc exec -T web nginx -t >/dev/null 2>&1; then dc exec -T web nginx -s reload >/dev/null 2>&1 || true
else log "پیکربندی نگینکس نامعتبر است"; fi

# ── ۸) سلامت ──
EXPECT_MIG="$(wc -l < "$REL/MIGRATIONS" | tr -d ' ')"
if wait_ready "$VER" "${READY_TRIES:-60}" && printf '%s' "$READY_JSON" | grep -q "\"migrations\":${EXPECT_MIG}[,}]"; then
  :
else
  log "سلامت پس از استقرار تأیید نشد (نسخه/مهاجرت‌ها/healthz). پاسخ آخر: $READY_JSON" >&2
  history_add "deploy $cur -> $ID FAILED health"
  if rollback_now; then fail_notify "استقرار $ID ناموفق بود و به $cur بازگشت داده شد${PENDING:+. توجه: مهاجرت‌ها ($PENDING) اعمال شده‌اند؛ پشتیبان پیش از استقرار: $(state_get predeploy-backup)}"
  else fail_notify "استقرار $ID ناموفق بود و بازگشت خودکار هم موفق نبود — بررسی دستی لازم است"; fi
  exit 1
fi

# ── ۹) ثبت و پاک‌سازی ──
state_set previous "$cur"; state_set current "$ID"
history_add "deploy $cur -> $ID ok version=$VER migrations=${PENDING:-none}"
# فقط KEEP_RELEASES انتشار اخیر (و baseline) نگه داشته می‌شود؛ ایمیج‌های بقیه پاک می‌شود (برچسب local و برچسب‌های فعال هرگز)
keep=" $ID $cur $(ls -1t "$RELEASES_DIR" | head -n "$KEEP_RELEASES" | tr '\n' ' ')"
ls -1 "$RELEASES_DIR" | while read -r d; do
  case "$keep" in *" $d "*) continue;; esac
  t="$(cat "$RELEASES_DIR/$d/API_TAG" 2>/dev/null || echo "$d")"; rm -rf "${RELEASES_DIR:?}/$d"
  [ "$t" = local ] || docker rmi "cafino-api:$t" >/dev/null 2>&1 || true
done
log "استقرار کامل شد ✓  نسخهٔ $VER ($ID) فعال است"
notify info "نسخهٔ $VER ($ID) روی $CAFINO_ENV_V مستقر شد ✓${PENDING:+ (مهاجرت‌ها: $PENDING)}"
