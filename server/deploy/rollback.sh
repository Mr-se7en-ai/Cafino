#!/bin/sh
# بازگشت به یک انتشار قبلی (فقط root).
#   rollback.sh                      → به نسخهٔ «قبلی» (state: previous) برمی‌گردد
#   rollback.sh <شناسهٔ انتشار>        → به همان انتشار (فهرست: rollback.sh --list)
#   rollback.sh --list               → انتشارهای نگه‌داری‌شده و وضعیت فعلی
# گزینه‌ها: --yes (بدون تأیید تایپی)  --auto (فراخوانی خودکار از deploy.sh پس از استقرار ناموفق)
#           --force-code-only (حتی اگر دیتابیس مهاجرت‌های جدیدتر از آن نسخه دارد، فقط کد را برگردان)
#           --restore-db (دیتابیس را از «پشتیبان پیش از آخرین استقرار» برگردان — داده‌های بعد از آن پشتیبان از دست می‌رود!)
# چه چیزی برگردانده می‌شود: فایل‌های برنامه (PWA)، پیکربندی nginx/compose و ایمیج API همان انتشار. دیتابیس و آپلودها «دست‌نخورده» می‌مانند
# (مگر با --restore-db). مهاجرت‌ها فقط رو به جلو هستند: اگر آن انتشار مهاجرت جدیدی داشت، کد قدیمی روی ساختار جدید اجرا می‌شود
# (معمولاً سازگار است چون مهاجرت‌ها افزایشی‌اند)، وگرنه گزینهٔ --restore-db.
set -eu
umask 022
. "$(dirname "$0")/lib.sh"
[ "$(id -u)" = 0 ] || die "با sudo اجرا کنید"
TARGET=""; YES=0; AUTO=0; FORCE=0; RESTORE_DB=0; LIST=0
for a in "$@"; do case "$a" in --yes) YES=1;; --auto) AUTO=1; YES=1;; --force-code-only) FORCE=1;; --restore-db) RESTORE_DB=1;; --list) LIST=1;; -*) die "گزینهٔ ناشناخته: $a";; *) TARGET="$a";; esac; done
cur="$(state_get current)"; prev="$(state_get previous)"
if [ "$LIST" = 1 ]; then
  echo "فعلی: ${cur:-—}   قبلی: ${prev:-—}"; echo "انتشارهای نگه‌داری‌شده ($RELEASES_DIR):"
  for d in "$RELEASES_DIR"/*/; do [ -f "$d/RELEASE_ID" ] && printf '  %s  (tag: %s)\n' "$(cat "$d/RELEASE_ID")" "$(cat "$d/API_TAG" 2>/dev/null || cat "$d/RELEASE_ID")"; done 2>/dev/null
  exit 0
fi
[ -n "$TARGET" ] || TARGET="$prev"
[ -n "$TARGET" ] || die "نسخهٔ قبلی ثبت نشده؛ شناسه را بدهید (rollback.sh --list)"
case "$TARGET" in */*|*..*) die "شناسهٔ نامعتبر";; esac
REL="$RELEASES_DIR/$TARGET"; [ -f "$REL/RELEASE_ID" ] || die "انتشار $TARGET در $RELEASES_DIR نیست"
TAG="$(cat "$REL/API_TAG" 2>/dev/null || cat "$REL/RELEASE_ID")"
docker image inspect "cafino-api:$TAG" >/dev/null 2>&1 || die "ایمیج cafino-api:$TAG دیگر روی سرور نیست (پاک شده)؛ بازگشت ممکن نیست"
[ "$TARGET" != "$cur" ] || [ "$AUTO" = 1 ] || die "این انتشار همین حالا فعال است"

# سازگاری دیتابیس: مهاجرت‌های اعمال‌شده‌ای که آن انتشار نمی‌شناسد
extra=""
if [ -s "$REL/MIGRATIONS" ]; then
  db_migrations | sort > "${TMPDIR:-/tmp}/cafino-rb-db.$$"
  extra="$(sort "$REL/MIGRATIONS" | comm -13 - "${TMPDIR:-/tmp}/cafino-rb-db.$$" | tr '\n' ' ')"; rm -f "${TMPDIR:-/tmp}/cafino-rb-db.$$"
fi
if [ -n "$extra" ]; then
  log "هشدار: دیتابیس مهاجرت‌هایی دارد که انتشار $TARGET نمی‌شناسد: $extra"
  if [ "$RESTORE_DB" = 1 ]; then :
  elif [ "$FORCE" = 1 ] || [ "$AUTO" = 1 ]; then log "ادامه با کد قدیمی روی ساختار جدید (مهاجرت‌ها افزایشی‌اند؛ پس از بازگشت وضعیت را بررسی کنید)"
  else die "بازگشت فقط-کد ممکن است با ساختار جدید دیتابیس ناسازگار باشد. یا --force-code-only (ساختار جدید می‌ماند)، یا --restore-db (برگرداندن پشتیبان پیش از استقرار؛ داده‌های بعدش از دست می‌رود)"; fi
fi
if [ "$YES" != 1 ]; then printf 'بازگشت به «%s» (از %s). برای ادامه نام انتشار را تایپ کنید: ' "$TARGET" "${cur:-—}"; read -r ans; [ "$ans" = "$TARGET" ] || die "لغو شد"; fi

log "بازگشت به $TARGET …"
if [ "$RESTORE_DB" = 1 ]; then
  bk="$(state_get predeploy-backup)"; [ -f "$bk" ] || die "پشتیبان پیش از استقرار ($bk) پیدا نشد"
  log "بازیابی دیتابیس از $(basename "$bk") …"; sh "$(dirname "$0")/restore.sh" "$bk" --into-production --yes || die "بازیابی دیتابیس ناموفق"
fi
apply_release_files "$REL" || die "اعمال فایل‌های انتشار ناموفق"
env_set CAFINO_API_TAG "$TAG"
dc up -d --no-build --no-deps --wait --wait-timeout 180 api || log "هشدار: api هنوز healthy نشده؛ بررسی بعدی انجام می‌شود"
dc up -d --no-build --no-deps web >/dev/null 2>&1 || true
dc exec -T web nginx -t >/dev/null 2>&1 && dc exec -T web nginx -s reload >/dev/null 2>&1 || log "هشدار: reload نگینکس ناموفق"
if wait_ready "" "${READY_TRIES:-60}"; then
  history_add "rollback $cur -> $TARGET ok"
  if [ "$AUTO" = 1 ]; then :; else state_set previous "$cur"; fi
  state_set current "$TARGET"
  log "بازگشت کامل شد ✓ (نسخهٔ فعال: $TARGET)"
  notify warn "بازگشت به نسخهٔ $TARGET انجام شد${extra:+ (دیتابیس مهاجرت‌های جدیدتری دارد: $extra)}"
else
  history_add "rollback $cur -> $TARGET FAILED"
  notify crit "بازگشت به $TARGET ناموفق بود — سرور نیاز به بررسی دستی دارد (docker compose logs api)"
  die "پس از بازگشت هم سرویس سالم نشد: docker compose logs api؛ پشتیبان‌ها: $BACKUP_DIR"
fi
