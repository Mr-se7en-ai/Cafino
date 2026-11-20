#!/bin/sh
# ارسال اعلان به بله / تلگرام / وب‌هوک.  استفاده:  notify.sh <info|warn|crit> "متن پیام"
# تنظیمات از /etc/cafino/notify.env (مجوز ۶۰۰؛ رازها هرگز در مخزن یا لاگ نمی‌آیند). هیچ کانالی تنظیم نباشد، بی‌صدا خارج می‌شود.
#   بله:    NOTIFY_BALE_TOKEN + NOTIFY_BALE_CHAT          (از داخل ایران مستقیم کار می‌کند)
#   تلگرام: NOTIFY_TELEGRAM_TOKEN + NOTIFY_TELEGRAM_CHAT  (+ NOTIFY_TELEGRAM_API_BASE برای پراکسی)
#   وب‌هوک: NOTIFY_WEBHOOK_URL  (POST با متن ساده؛ سازگار با ntfy/Mattermost/…)
set -u
NOTIFY_ENV="${NOTIFY_ENV:-/etc/cafino/notify.env}"
# shellcheck disable=SC1090
[ -r "$NOTIFY_ENV" ] && . "$NOTIFY_ENV"
lvl="${1:-info}"; shift || true
msg="$*"; [ -n "$msg" ] || exit 0
host="${NOTIFY_HOST_LABEL:-$(hostname)}"
case "$lvl" in crit) icon="🔴";; warn) icon="🟠";; *) icon="🟢";; esac
text="$icon کافینو [$host] $msg"
sent=0
if [ -n "${NOTIFY_BALE_TOKEN:-}" ] && [ -n "${NOTIFY_BALE_CHAT:-}" ]; then
  curl -fsS --max-time 15 -o /dev/null "https://tapi.bale.ai/bot${NOTIFY_BALE_TOKEN}/sendMessage" --data-urlencode "chat_id=${NOTIFY_BALE_CHAT}" --data-urlencode "text=$text" && sent=1
fi
if [ -n "${NOTIFY_TELEGRAM_TOKEN:-}" ] && [ -n "${NOTIFY_TELEGRAM_CHAT:-}" ]; then
  curl -fsS --max-time 15 -o /dev/null "${NOTIFY_TELEGRAM_API_BASE:-https://api.telegram.org}/bot${NOTIFY_TELEGRAM_TOKEN}/sendMessage" --data-urlencode "chat_id=${NOTIFY_TELEGRAM_CHAT}" --data-urlencode "text=$text" && sent=1
fi
if [ -n "${NOTIFY_WEBHOOK_URL:-}" ]; then
  curl -fsS --max-time 15 -o /dev/null -H "Content-Type: text/plain; charset=utf-8" --data-binary "$text" "$NOTIFY_WEBHOOK_URL" && sent=1
fi
[ "$sent" = 1 ] || exit 0
