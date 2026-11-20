#!/bin/sh
# پایش مستقل (cron هر ۵ دقیقه، توسط install.sh نصب می‌شود): healthcheck.sh را اجرا می‌کند و «فقط هنگام تغییر وضعیت» اعلان می‌فرستد
# (بله/تلگرام/وب‌هوک از /etc/cafino/notify.env) — هشدار تکراری ندارد؛ هر ۶ ساعت تا رفع مشکل یادآوری می‌شود و رفع مشکل هم اعلام می‌شود.
# این اسکریپت به خود سرور وابسته است؛ برای دیدن «خاموشی کل سرور» حتماً یک پایشگر بیرونی (UptimeRobot/Uptime-Kuma) روی https://دامنه/healthz بگذارید.
set -u
. "$(dirname "$0")/lib.sh"
STATE_DIR="${STATE_DIR:-/var/lib/cafino}"; mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
REMIND_H="${REMIND_H:-6}"
out="$(sh "$(dirname "$0")/healthcheck.sh" 2>&1)"; rc=$?
printf '%s\n' "$out" > "$STATE_DIR/last-health.txt"
prev="$(cat "$STATE_DIR/status" 2>/dev/null || echo 0)"; last_alert="$(cat "$STATE_DIR/last-alert" 2>/dev/null || echo 0)"; now="$(date +%s)"
bad="$(printf '%s\n' "$out" | grep -E '^(WARN|CRIT)' | head -8)"
if [ "$rc" -ne 0 ]; then
  lvl=warn; [ "$rc" -ge 2 ] && lvl=crit
  if [ "$rc" != "$prev" ] || [ $(( now - last_alert )) -ge $(( REMIND_H * 3600 )) ]; then
    notify "$lvl" "مشکل در سرور:
$bad"
    echo "$now" > "$STATE_DIR/last-alert"
  fi
elif [ "$prev" != 0 ]; then
  notify info "مشکل برطرف شد؛ همهٔ بررسی‌ها سالم است ✓"; rm -f "$STATE_DIR/last-alert"
fi
echo "$rc" > "$STATE_DIR/status"
log "monitor: کد=$rc"
exit 0
