#!/bin/sh
# بازیابی پشتیبان. حالت‌ها:
#   restore.sh --latest                         → «تمرین بازیابی» جدیدترین پشتیبان دیتابیس روی پایگاه‌دادهٔ موقت (تولید دست نمی‌خورد) — cron هفتگی همین را اجرا می‌کند
#   restore.sh فایل.dump[.gpg]                  → تمرین بازیابی همان فایل
#   restore.sh فایل.dump[.gpg] --into-production → جایگزینی پایگاه‌دادهٔ زنده (API را متوقف می‌کند، پشتیبان اضطراری می‌گیرد، تأیید تایپی می‌خواهد)
#   restore.sh --uploads فایل.uploads.tar.gz[.gpg] → اضافه/بازنویسی فایل‌های آپلود در volume (چیزی حذف نمی‌شود)
#   restore.sh --config فایل.config.tar.gz.gpg [پوشه] → فقط استخراج تنظیمات در یک پوشه برای بررسی دستی (روی تنظیمات زنده نمی‌نویسد)
# فایل‌های .gpg با /etc/cafino/backup.pass (یا کلید خصوصی gpg) باز می‌شوند.
# گزینه‌ها: --keep (پایگاه‌دادهٔ تمرین را نگه دار)   --yes (تأیید تایپی را رد کن؛ فقط برای خودکارسازی)
set -eu
umask 077
. "$(dirname "$0")/lib.sh"
usage() { die "استفاده: restore.sh --latest | <فایل.dump[.gpg]> [--into-production] [--keep] [--yes] | --uploads <فایل> | --config <فایل> [پوشه]"; }
TMPFILES=""
trap 'for f in $TMPFILES; do rm -f "$f"; done' EXIT
# plain_of فایل → مسیر فایل ساده (در صورت .gpg ابتدا باز می‌شود؛ SHA-256 پیش از بازکردن بررسی می‌شود)
plain_of() {
  f="$1"
  if [ -f "$f.sha256" ]; then want="$(cut -d' ' -f1 "$f.sha256")"; got="$(sha256_of "$f")"; [ "$want" = "$got" ] || die "SHA-256 فایل با $f.sha256 نمی‌خواند — فایل خراب/دست‌کاری شده است"; log "SHA-256 تأیید شد ($(basename "$f"))" >&2
  else log "هشدار: فایل .sha256 کنار پشتیبان نیست" >&2; fi
  case "$f" in
    *.gpg) out="$BACKUP_DIR/.restore-$$-$(basename "${f%.gpg}")"; TMPFILES="$TMPFILES $out"; decrypt_file "$f" "$out" || die "بازکردن رمزنگاری ناموفق (رمز /etc/cafino/backup.pass یا کلید خصوصی را بررسی کنید)"; echo "$out";;
    *) echo "$f";;
  esac
}
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
case "${1:-}" in
  --uploads)
    [ -f "${2:-}" ] || usage; P="$(plain_of "$2")"; gzip -t "$P" || die "آرشیو آپلودها خراب است"
    [ -n "$DB_EXEC" ] || die "بازیابی آپلود فقط در حالت docker پشتیبانی می‌شود"
    (cd "$CAFINO_DIR" && docker compose exec -T api tar -C /data/uploads -xzf - ) < "$P" || die "استخراج آپلودها شکست خورد"
    log "آپلودها بازیابی شد ✓ (فایل‌های موجود حذف نشدند)"; exit 0;;
  --config)
    [ -f "${2:-}" ] || usage; dest="${3:-$BACKUP_DIR/config-restore-$(date +%F-%H%M%S)}"; P="$(plain_of "$2")"
    mkdir -p "$dest"; chmod 700 "$dest"; tar -xzf "$P" -C "$dest" || die "استخراج تنظیمات شکست خورد"
    log "تنظیمات در $dest استخراج شد. حاوی رازهاست؛ پس از استفاده امن حذفش کنید. چیزی روی سرور زنده تغییر نکرد."; exit 0;;
  --latest)
    FILE="$(ls -1 "$BACKUP_DIR"/cafino-*.dump "$BACKUP_DIR"/cafino-*.dump.gpg 2>/dev/null | sort | tail -1)"; [ -n "$FILE" ] || die "هیچ پشتیبانی در $BACKUP_DIR نیست"; shift;;
  *) FILE="${1:-}"; [ -f "$FILE" ] || usage; shift;;
esac
PROD=0; KEEP=0; YES=0
for a in "$@"; do case "$a" in --into-production) PROD=1;; --keep) KEEP=1;; --yes) YES=1;; *) die "گزینهٔ ناشناخته: $a";; esac; done
SRC="$FILE"; FILE="$(plain_of "$SRC")"
dbx pg_restore --list < "$FILE" > /dev/null || die "فایل پشتیبان قابل خواندن نیست"
verify() {   # $1 = نام پایگاه‌داده
  db="$1"
  log "— گزارش $db —"
  for t in organizations cafes users customers invoices payments ledger_entries accounts inventory inventory_movements transactions expenses audit_log; do
    printf '  %-22s %s\n' "$t" "$(dbx psql -U "$DB_USER" -d "$db" -qAt -c "SELECT count(*) FROM $t")"
  done
  mig="$(dbx psql -U "$DB_USER" -d "$db" -qAt -c "SELECT count(*) || ' (آخرین: ' || max(name) || ')' FROM schema_migrations")"; printf '  %-22s %s\n' schema_migrations "$mig"
  bad="$(dbx psql -U "$DB_USER" -d "$db" -qAt -c "SELECT count(*) FROM accounts a WHERE a.balance <> COALESCE((SELECT sum(amount) FROM ledger_entries e WHERE e.cafe_id=a.cafe_id AND e.account_id=a.id),0)")"
  [ "$bad" = "0" ] && log "  تطبیق مالی: مانده همهٔ حساب‌ها = جمع دفتر کل ✓" || { log "  هشدار تطبیق: $bad حساب با دفتر کل نمی‌خواند (پس از بالا آمدن API از «بازسازی/Integrity» استفاده کنید)"; VERIFY_WARN=1; }
  trg="$(dbx psql -U "$DB_USER" -d "$db" -qAt -c "SELECT count(*) FROM pg_trigger WHERE tgname IN ('ledger_immutable_trg','payments_guard_trg') AND tgenabled <> 'D'")"
  [ "$trg" = "2" ] && log "  تریگرهای محافظ مالی فعال‌اند ✓" || { log "  خطا: تریگرهای محافظ مالی کامل نیستند ($trg/2)"; VERIFY_FAIL=1; }
}
# shellcheck disable=SC2034
VERIFY_WARN=0; VERIFY_FAIL=0
if [ "$PROD" = 0 ]; then
  SCR="${DB_NAME}_restore_check"
  dbx psql -U "$DB_USER" -d postgres -qAt -c "DROP DATABASE IF EXISTS $SCR" >/dev/null
  dbx psql -U "$DB_USER" -d postgres -qAt -c "CREATE DATABASE $SCR" >/dev/null
  log "بازیابی در پایگاه‌دادهٔ موقت $SCR ..."
  dbx pg_restore -U "$DB_USER" -d "$SCR" --no-owner --exit-on-error < "$FILE" || { dbx psql -U "$DB_USER" -d postgres -qAt -c "DROP DATABASE IF EXISTS $SCR" >/dev/null; notify crit "تمرین بازیابی: pg_restore شکست خورد ($(basename "$SRC"))"; die "pg_restore شکست خورد"; }
  verify "$SCR"
  [ "$KEEP" = 1 ] || dbx psql -U "$DB_USER" -d postgres -qAt -c "DROP DATABASE IF EXISTS $SCR" >/dev/null
  [ "$VERIFY_FAIL" = 0 ] || { notify crit "تمرین بازیابی پشتیبان ناموفق بود ($(basename "$SRC"))"; die "راستی‌آزمایی بازیابی ناموفق"; }
  date +%s > "$BACKUP_DIR/LAST_RESTORE_TEST_OK"
  log "تمرین بازیابی موفق ✓ ($(basename "$SRC"))"; exit 0
fi
# ── بازیابی روی تولید ──
if [ "$YES" != 1 ]; then printf 'این کار پایگاه‌دادهٔ «%s» را کاملاً جایگزین می‌کند. برای ادامه نام آن را تایپ کنید: ' "$DB_NAME"; read -r ans; [ "$ans" = "$DB_NAME" ] || die "لغو شد"; fi
if [ "$(dbx psql -U "$DB_USER" -d "$DB_NAME" -qAt -c "SELECT to_regclass('public.payments') IS NOT NULL")" = "t" ]; then
  log "پشتیبان اضطراری از وضعیت فعلی..."; BACKUP_DIR="$BACKUP_DIR" sh "$(dirname "$0")/backup.sh" || die "پشتیبان اضطراری ساخته نشد؛ بازیابی متوقف شد"
else log "پایگاه‌دادهٔ مقصد خالی است (سرور تازه / بازیابی فاجعه) — پشتیبان اضطراری لازم نیست"; fi
[ -n "$DB_EXEC" ] && (cd "$CAFINO_DIR" && docker compose stop api web) || true
dbx pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --exit-on-error < "$FILE" || die "pg_restore شکست خورد — پشتیبان اضطراری در $BACKUP_DIR است"
verify "$DB_NAME"
[ -n "$DB_EXEC" ] && (cd "$CAFINO_DIR" && docker compose up -d api web) || true
[ "$VERIFY_FAIL" = 0 ] || die "راستی‌آزمایی ناموفق"
log "بازیابی روی تولید انجام شد ✓ (API با همان مهاجرت‌ها بالا می‌آید؛ مهاجرت‌های جدیدتر از پشتیبان خودکار اعمال می‌شوند)"
