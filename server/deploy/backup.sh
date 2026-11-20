#!/bin/sh
# پشتیبان‌گیری کامل کافینو: دیتابیس + فایل‌های آپلود + تنظیمات (cron روزانه ۰۳:۰۰ توسط install.sh نصب می‌شود).
#   /bin/sh /opt/cafino/server/deploy/backup.sh >> /var/log/cafino-backup.log 2>&1
#
# خروجی در BACKUP_DIR (پیش‌فرض /var/backups/cafino، مجوز ۷۰۰):
#   cafino-<تاریخ>.dump[.gpg]          دیتابیس (pg_dump -Fc؛ پیش از ذخیره با pg_restore --list و شمارش جدول‌ها سنجیده می‌شود)
#   cafino-<تاریخ>.uploads.tar.gz[.gpg] فایل‌های دریافتی از مشتری (volume آپلود)
#   cafino-<تاریخ>.config.tar.gz.gpg    .env، پیکربندی Caddy/override، notify.env — «همیشه رمزنگاری‌شده»؛ بدون رمزنگاری ساخته نمی‌شود
#   *.sha256 و cafino-<تاریخ>.manifest  جمع کنترلی و شرح نسخه/مهاجرت‌ها (بدون راز)
#
# رمزنگاری: اگر /etc/cafino/backup.pass باشد (install.sh می‌سازد) → gpg متقارن AES256؛ یا BACKUP_GPG_RECIPIENT=کلید-عمومی.
#   با رمزنگاری فعال، روی دیسک فقط نسخهٔ .gpg می‌ماند (فایل ساده پس از سنجش حذف می‌شود). خود رمز هرگز داخل پشتیبان نیست
#   ← یک نسخه از آن را جای امن و جدا از سرور نگه دارید، وگرنه پشتیبان‌ها قابل بازیابی نیستند.
# بیرون از سرور: OFFSITE_CMD (مثلاً 'rclone copy "$1" remote:cafino-backups/') برای هر فایل صدا زده می‌شود؛
#   بدون رمزنگاری، ارسال بیرونی «رد می‌شود» (داده‌های کاربران نباید ساده بیرون بروند).
# نگهداری (روزانه+هفتگی+ماهانه): KEEP_DAYS=14  KEEP_WEEKS=8 (نسخهٔ یکشنبه‌ها)  KEEP_MONTHS=6 (نسخهٔ روز اول ماه)  KEEP_MIN=3 (هرگز کمتر از این)
# آپلودها: UPLOADS_BACKUP=daily|weekly|off  (پیش‌فرض daily؛ weekly = فقط یکشنبه‌ها) — UPLOADS_DIR برای مسیر روی میزبان (بدون docker)
# کد خروج ≠ ۰ یعنی بخشی از پشتیبان ساخته نشد؛ اعلان هم می‌رود (notify.sh) و LAST_OK به‌روز نمی‌شود.
set -u
umask 077
. "$(dirname "$0")/lib.sh"
KEEP_DAYS="${KEEP_DAYS:-14}"; KEEP_WEEKS="${KEEP_WEEKS:-8}"; KEEP_MONTHS="${KEEP_MONTHS:-6}"; KEEP_MIN="${KEEP_MIN:-3}"
UPLOADS_BACKUP="${UPLOADS_BACKUP:-daily}"; MIN_FREE_MB="${MIN_FREE_MB:-500}"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.lock"
command -v flock >/dev/null 2>&1 && { flock -n 9 || { log "پشتیبان دیگری در حال اجراست؛ این اجرا رد شد"; exit 0; }; }
stamp="$(date +%F-%H%M%S)"; base="$BACKUP_DIR/cafino-$stamp"
fail=0; ERRMSG=""
cleanup() { rm -f "$base".*.partial "$base".partial* 2>/dev/null || true; }
finish() {
  rc=$?; cleanup
  if [ "$rc" -ne 0 ] || [ "$fail" -ne 0 ]; then
    date +%s > "$BACKUP_DIR/LAST_ERROR" 2>/dev/null || true
    notify crit "پشتیبان‌گیری ناموفق بود: ${ERRMSG:-خطای نامشخص} (لاگ: /var/log/cafino-backup.log)"
    [ "$rc" -ne 0 ] || exit 1
  fi
}
trap finish EXIT
softfail() { fail=1; ERRMSG="${ERRMSG:+$ERRMSG؛ }$*"; log "ERROR: $*"; }

free_mb="$(df -Pm "$BACKUP_DIR" | awk 'NR==2{print $4}')"
[ "${free_mb:-0}" -ge "$MIN_FREE_MB" ] || { ERRMSG="فضای خالی کم است (${free_mb}MB)"; die "فضای خالی $BACKUP_DIR کمتر از ${MIN_FREE_MB}MB است"; }
MODE="$(enc_mode)"
[ "$MODE" = none ] && log "هشدار: رمزنگاری پشتیبان فعال نیست (/etc/cafino/backup.pass یا BACKUP_GPG_RECIPIENT)"
[ "$MODE" = none ] || command -v gpg >/dev/null 2>&1 || { ERRMSG="gpg نصب نیست"; die "gpg نصب نیست (apt install gnupg)"; }

# seal فایل: (در صورت فعال بودن رمزنگاری) رمزنگاری + حذف فایل ساده + sha256 ؛ نام نهایی در $SEALED
seal() {
  SEALED="$1"
  if [ "$MODE" != none ]; then
    encrypt_file "$1" "$1.gpg" || { rm -f "$1.gpg"; return 1; }
    rm -f "$1"; SEALED="$1.gpg"
  fi
  printf '%s  %s\n' "$(sha256_of "$SEALED")" "$(basename "$SEALED")" > "$SEALED.sha256"
  MADE="$MADE $SEALED"
}
MADE=""

# ── ۱) دیتابیس ──
out="$base.dump"; tmp="$out.partial"
log "شروع پشتیبان دیتابیس → $(basename "$out")"
if dbx pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner > "$tmp" && [ -s "$tmp" ]; then
  if dbx pg_restore --list < "$tmp" > "$tmp.list" 2>/dev/null; then
    n_tables="$(grep -c ' TABLE DATA ' "$tmp.list" || true)"; rm -f "$tmp.list"
    if [ "$n_tables" -ge 15 ]; then
      mv "$tmp" "$out"
      size="$(wc -c < "$out")"
      seal "$out" && log "پشتیبان دیتابیس سالم: $(basename "$SEALED") ($size بایت، $n_tables جدول)" || softfail "رمزنگاری دیتابیس شکست خورد"
    else rm -f "$tmp"; softfail "پشتیبان دیتابیس ناقص است: فقط $n_tables جدول (انتظار ≥ ۱۵)"; fi
  else rm -f "$tmp" "$tmp.list"; softfail "فایل پشتیبان دیتابیس قابل خواندن نیست"; fi
else rm -f "$tmp"; softfail "pg_dump شکست خورد"; fi

# ── ۲) فایل‌های آپلود ──
do_uploads=1
case "$UPLOADS_BACKUP" in off) do_uploads=0;; weekly) [ "$(date +%u)" = 7 ] || do_uploads=0;; esac
if [ "$do_uploads" = 1 ]; then
  up="$base.uploads.tar.gz"; tmp="$up.partial"
  if [ -n "${UPLOADS_DIR:-}" ]; then tar -C "$UPLOADS_DIR" -czf "$tmp" . 2>/dev/null; rc=$?
  elif [ -n "$DB_EXEC" ]; then (cd "$CAFINO_DIR" && docker compose exec -T api tar -C /data/uploads -czf - .) > "$tmp" 2>/dev/null; rc=$?
  else rc=99; fi
  if [ "$rc" = 99 ]; then log "آپلودها: مسیر مشخص نیست (UPLOADS_DIR)؛ رد شد"; rm -f "$tmp"
  elif [ "$rc" = 0 ] && gzip -t "$tmp" 2>/dev/null; then
    mv "$tmp" "$up"; usize="$(wc -c < "$up")"
    seal "$up" && log "پشتیبان آپلودها سالم: $(basename "$SEALED") ($usize بایت)" || softfail "رمزنگاری آپلودها شکست خورد"
  else rm -f "$tmp"; softfail "پشتیبان آپلودها شکست خورد (کد $rc)"; fi
else log "آپلودها در این اجرا پشتیبان‌گیری نمی‌شوند (UPLOADS_BACKUP=$UPLOADS_BACKUP)"; fi

# ── ۳) تنظیمات (فقط رمزنگاری‌شده) ──
if [ "$MODE" = none ]; then log "تنظیمات (.env و ...) بدون رمزنگاری ذخیره نمی‌شوند؛ رد شد"
else
  files=""
  for f in "$CAFINO_DIR/.env" "$CAFINO_DIR/docker-compose.override.yml" "$CAFINO_DIR/deploy/local" "$CAFINO_DIR/../.deploy-state" "$NOTIFY_ENV" /etc/cron.d/cafino; do [ -e "$f" ] && files="$files $f"; done
  if [ -n "$files" ]; then
    cf="$base.config.tar.gz"
    # shellcheck disable=SC2086
    if tar -czf "$cf.partial" $files 2>/dev/null && mv "$cf.partial" "$cf"; then seal "$cf" && log "پشتیبان تنظیمات (رمزنگاری‌شده): $(basename "$SEALED")" || softfail "رمزنگاری تنظیمات شکست خورد"
    else rm -f "$cf.partial"; softfail "ساخت آرشیو تنظیمات شکست خورد"; fi
  fi
fi

# ── ۴) شرح نسخه (بدون راز) ──
ver="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$CAFINO_DIR/../package.json" 2>/dev/null | head -1)"
mig="$(dbx psql -U "$DB_USER" -d "$DB_NAME" -qAt -c "SELECT count(*)||' / '||max(name) FROM schema_migrations" 2>/dev/null || echo '?')"
{ echo "stamp=$stamp"; echo "app_version=${ver:-?}"; echo "migrations=$mig"; echo "encryption=$MODE"; for m in $MADE; do echo "file=$(basename "$m")"; done; } > "$base.manifest"

# ── ۵) انتقال به بیرون از سرور ──
if [ -n "${OFFSITE_CMD:-}" ] && [ -n "$MADE" ]; then
  if [ "$MODE" = none ]; then softfail "ارسال بیرونی رد شد: بدون رمزنگاری داده‌های کاربران نباید از سرور خارج شوند"
  else
    for m in $MADE "$base.manifest"; do
      sh -c "$OFFSITE_CMD" _ "$m" || { softfail "ارسال بیرونی $(basename "$m") شکست خورد (نسخهٔ محلی سالم است)"; break; }
    done
    [ "$fail" = 0 ] && log "ارسال بیرونی انجام شد"
  fi
fi

# ── ۶) نگهداری: روزانه + هفتگی (یکشنبه) + ماهانه (روز اول)، هرگز کمتر از KEEP_MIN ──
retain() {
  now="$(date +%s)"; n=0
  ls -1 "$BACKUP_DIR"/cafino-*.dump "$BACKUP_DIR"/cafino-*.dump.gpg 2>/dev/null | sed -e 's|.*/cafino-||' -e 's|\.dump.*||' | sort -ru | while read -r st; do
    n=$((n + 1)); d="${st%-*}"
    [ "$n" -le "$KEEP_MIN" ] && continue
    ep="$(date -d "$d" +%s 2>/dev/null)" || continue
    age=$(( (now - ep) / 86400 ))
    [ "$age" -le "$KEEP_DAYS" ] && continue
    [ "$(date -d "$d" +%u)" = 7 ] && [ "$age" -le $((KEEP_WEEKS * 7)) ] && continue
    [ "$(date -d "$d" +%d)" = 01 ] && [ "$age" -le $((KEEP_MONTHS * 31)) ] && continue
    rm -f "$BACKUP_DIR/cafino-$st".* && log "حذف نسخهٔ قدیمی: cafino-$st"
  done
}
retain

if [ "$fail" = 0 ]; then date +%s > "$BACKUP_DIR/LAST_OK"; rm -f "$BACKUP_DIR/LAST_ERROR"; log "پشتیبان کامل شد ✓ ($BACKUP_DIR)"; fi
