#!/bin/sh
# بازیابی پشتیبان.  دو حالت:
#   restore.sh فایل.dump                       → «تمرین بازیابی» روی یک پایگاه‌دادهٔ موقت (cafino_restore_check)؛ تولید دست نمی‌خورد. گزارش اعداد و تطبیق مالی را چاپ می‌کند.
#   restore.sh فایل.dump --into-production     → جایگزینی پایگاه‌دادهٔ زنده (API را متوقف می‌کند، پیش از آن یک پشتیبانِ اضطراری می‌گیرد، تأیید تایپی می‌خواهد).
# گزینه‌ها: --keep (پایگاه‌دادهٔ تمرین را نگه دار)   --yes (تأیید تایپی را رد کن؛ فقط برای خودکارسازی)
set -eu
umask 077
. "$(dirname "$0")/lib.sh"
FILE="${1:-}"; [ -f "$FILE" ] || die "استفاده: restore.sh <فایل.dump> [--into-production] [--keep] [--yes]"; shift
PROD=0; KEEP=0; YES=0
for a in "$@"; do case "$a" in --into-production) PROD=1;; --keep) KEEP=1;; --yes) YES=1;; *) die "گزینهٔ ناشناخته: $a";; esac; done
if [ -f "$FILE.sha256" ]; then want="$(cut -d' ' -f1 "$FILE.sha256")"; got="$(sha256_of "$FILE")"; [ "$want" = "$got" ] || die "SHA-256 فایل با $FILE.sha256 نمی‌خواند — فایل خراب/دست‌کاری شده است"; log "SHA-256 تأیید شد"; else log "هشدار: فایل .sha256 کنار پشتیبان نیست"; fi
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
VERIFY_WARN=0; VERIFY_FAIL=0
if [ "$PROD" = 0 ]; then
  SCR="${DB_NAME}_restore_check"
  dbx psql -U "$DB_USER" -d postgres -qAt -c "DROP DATABASE IF EXISTS $SCR" >/dev/null
  dbx psql -U "$DB_USER" -d postgres -qAt -c "CREATE DATABASE $SCR" >/dev/null
  log "بازیابی در پایگاه‌دادهٔ موقت $SCR ..."
  dbx pg_restore -U "$DB_USER" -d "$SCR" --no-owner --exit-on-error < "$FILE" || { dbx psql -U "$DB_USER" -d postgres -qAt -c "DROP DATABASE IF EXISTS $SCR" >/dev/null; die "pg_restore شکست خورد"; }
  verify "$SCR"
  [ "$KEEP" = 1 ] || dbx psql -U "$DB_USER" -d postgres -qAt -c "DROP DATABASE IF EXISTS $SCR" >/dev/null
  [ "$VERIFY_FAIL" = 0 ] || die "راستی‌آزمایی بازیابی ناموفق"
  log "تمرین بازیابی موفق ✓"; exit 0
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
