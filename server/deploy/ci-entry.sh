#!/bin/sh
# «فرمان اجباری» کلید SSH مخصوص CI (GitHub Actions). harden.sh این فایل را در /usr/local/sbin/cafino-ci-entry (مالک root) نصب می‌کند و
# در authorized_keys کاربر cafino-deploy با  restrict,command="…"  می‌بندد؛ یعنی صاحب کلید «فقط» همین فرمان‌ها را می‌تواند اجرا کند، نه شل.
#   deploy  <production|staging> <sha256-بسته> [approve-migrations]   ← بسته (tar.gz) از stdin
#   plan    <production|staging> <sha256-بسته>                         ← فقط مهاجرت‌های در انتظار را گزارش می‌کند
#   rollback <production|staging>                                       ← بازگشت به نسخهٔ قبلی
#   status  <production|staging>                                        ← نسخهٔ فعال/قبلی و آخرین تاریخچه
#   health  <production|staging>                                        ← healthcheck.sh (کد خروج: 0/1/2)
# مسیر هر محیط از /etc/cafino/ci.env خوانده می‌شود (CI_PRODUCTION_DIR, CI_STAGING_DIR).
set -eu
umask 077
CI_PRODUCTION_DIR="${CI_PRODUCTION_DIR:-/opt/cafino}"; CI_STAGING_DIR="${CI_STAGING_DIR:-/opt/cafino-staging}"
CI_ENV_FILE="${CI_ENV_FILE:-/etc/cafino/ci.env}"
# shellcheck disable=SC1090
[ -r "$CI_ENV_FILE" ] && . "$CI_ENV_FILE"
SPOOL="${CI_SPOOL:-/var/lib/cafino-deploy/incoming}"; MAX_BYTES="${CI_MAX_BYTES:-629145600}"   # سقف ۶۰۰ مگابایت
CMD="${SSH_ORIGINAL_COMMAND:-}"
# فقط حروف/ارقام/خط تیره/نقطه و فاصله — هر نویسهٔ دیگر (; | $ ` & > < ' " \ خط جدید) = رد
case "$CMD" in *[!A-Za-z0-9._\ -]*|"") echo "فرمان نامعتبر" >&2; exit 2;; esac
# shellcheck disable=SC2086
set -- $CMD
ACTION="${1:-}"; ENVN="${2:-}"; ARG3="${3:-}"; ARG4="${4:-}"
case "$ENVN" in production) DIR="$CI_PRODUCTION_DIR";; staging) DIR="$CI_STAGING_DIR";; *) echo "محیط نامعتبر" >&2; exit 2;; esac
D="$DIR/server/deploy"
[ -d "$D" ] || { echo "نصب $ENVN در $DIR پیدا نشد (install.sh)" >&2; exit 2; }
sdo() { sudo -n "$@"; }
case "$ACTION" in
  deploy|plan)
    printf '%s' "$ARG3" | grep -qE '^[0-9a-f]{64}$' || { echo "sha256 نامعتبر" >&2; exit 2; }
    OPT=""
    if [ "$ACTION" = plan ]; then OPT="--plan"
    elif [ -n "$ARG4" ]; then [ "$ARG4" = approve-migrations ] || { echo "گزینهٔ نامعتبر" >&2; exit 2; }; OPT="--approve-migrations"; fi
    mkdir -p "$SPOOL"; F="$SPOOL/bundle-$$.tar.gz"; trap 'rm -f "$F"' EXIT
    head -c "$MAX_BYTES" > "$F"
    [ "$(sha256sum "$F" | cut -d' ' -f1)" = "$ARG3" ] || { echo "sha256 بستهٔ دریافتی با مقدار اعلام‌شده نمی‌خواند" >&2; exit 2; }
    if [ -n "$OPT" ]; then sdo "$D/deploy.sh" --bundle "$F" "$OPT"; else sdo "$D/deploy.sh" --bundle "$F"; fi
    ;;
  rollback) sdo "$D/rollback.sh" --yes;;
  status)   sdo "$D/deploy.sh" --status;;
  health)   sdo "$D/healthcheck.sh";;
  *) echo "فرمان ناشناخته" >&2; exit 2;;
esac
