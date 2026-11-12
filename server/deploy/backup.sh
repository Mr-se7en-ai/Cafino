#!/bin/sh
# پشتیبان‌گیری پایگاه‌داده (cron روزانه:  0 3 * * *  /opt/cafino/server/deploy/backup.sh >> /var/log/cafino-backup.log 2>&1)
#  • فایل را اتمیک می‌نویسد (.partial → نام نهایی)، با pg_restore --list صحت ساختار را می‌سنجد، SHA-256 کنارش می‌گذارد.
#  • قدیمی‌ها را بعد از KEEP_DAYS (پیش‌فرض ۱۴) پاک می‌کند، ولی هرگز کمتر از KEEP_MIN (پیش‌فرض ۳) نسخهٔ سالم باقی نمی‌گذارد.
#  • OFFSITE_CMD (اختیاری): دستوری که نسخهٔ تازه را بیرون از سرور می‌برد؛ «$1» = مسیر فایل. مثال: 'rclone copy "$1" remote:cafino-backups/'
#  • رمزنگاری (اختیاری، توصیه‌شده برای بیرون‌بردن): BACKUP_GPG_RECIPIENT=کلید-عمومی → فایل .gpg هم ساخته می‌شود.
# کد خروج ≠ ۰ یعنی پشتیبانِ سالم ساخته نشد.
set -eu
umask 077
. "$(dirname "$0")/lib.sh"
KEEP_DAYS="${KEEP_DAYS:-14}"; KEEP_MIN="${KEEP_MIN:-3}"
mkdir -p "$BACKUP_DIR"
stamp="$(date +%F-%H%M%S)"; out="$BACKUP_DIR/cafino-$stamp.dump"; tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT
log "شروع پشتیبان → $out"
dbx pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner > "$tmp" || die "pg_dump شکست خورد"
[ -s "$tmp" ] || die "فایل پشتیبان خالی است"
dbx pg_restore --list < "$tmp" > "$tmp.list" || { rm -f "$tmp.list"; die "فایل پشتیبان قابل خواندن نیست (pg_restore --list)"; }
n_tables="$(grep -c ' TABLE DATA ' "$tmp.list" || true)"; rm -f "$tmp.list"
[ "$n_tables" -ge 15 ] || die "پشتیبان ناقص است: فقط $n_tables جدول (انتظار ≥ ۱۵)"
mv "$tmp" "$out"; trap - EXIT
printf '%s  %s\n' "$(sha256_of "$out")" "$(basename "$out")" > "$out.sha256"
if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then gpg --batch --yes --trust-model always -r "$BACKUP_GPG_RECIPIENT" -o "$out.gpg" -e "$out" || die "رمزنگاری gpg شکست خورد"; fi
date +%s > "$BACKUP_DIR/LAST_OK"
log "پشتیبان سالم: $(basename "$out") ($(wc -c < "$out") بایت، $n_tables جدول)"
if [ -n "${OFFSITE_CMD:-}" ]; then sh -c "$OFFSITE_CMD" _ "${BACKUP_GPG_RECIPIENT:+$out.gpg}${BACKUP_GPG_RECIPIENT:-$out}" || die "ارسال به بیرون از سرور شکست خورد (پشتیبان محلی سالم است)"; log "ارسال بیرونی انجام شد"; fi
# نگهداری: فقط نسخه‌های قدیمی‌تر از KEEP_DAYS، به شرط باقی ماندن KEEP_MIN نسخه
total="$(ls -1 "$BACKUP_DIR"/cafino-*.dump 2>/dev/null | wc -l)"
find "$BACKUP_DIR" -name 'cafino-*.dump' -mtime "+$KEEP_DAYS" | sort | while read -r f; do
  [ "$total" -gt "$KEEP_MIN" ] || break
  rm -f "$f" "$f.sha256" "$f.gpg"; total=$((total - 1)); log "حذف نسخهٔ قدیمی: $(basename "$f")"
done
