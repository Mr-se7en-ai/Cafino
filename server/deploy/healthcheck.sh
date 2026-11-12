#!/bin/sh
# بررسی سلامت برای cron/مانیتورینگ (Nagios/Uptime-Kuma «push» یا هشدار ایمیلی با MAILTO).  کد خروج: 0=OK  1=WARN  2=CRIT
#   */5 * * * *  /opt/cafino/server/deploy/healthcheck.sh || echo "کافینو مشکل دارد" | mail -s cafino admin@example.com
# متغیرها: HEALTH_URL (پیش‌فرض http://127.0.0.1:8080/healthz)  READY_URL (پیش‌فرض: داخل کانتینر api)  BACKUP_DIR  BACKUP_MAX_AGE_H=26  DISK_WARN_PCT=80  DISK_CRIT_PCT=92
set -u
. "$(dirname "$0")/lib.sh"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/healthz}"; MAXAGE="${BACKUP_MAX_AGE_H:-26}"; DW="${DISK_WARN_PCT:-80}"; DC="${DISK_CRIT_PCT:-92}"
worst=0; say() { printf '%-5s %s\n' "$1" "$2"; case "$1" in WARN) [ $worst -ge 1 ] || worst=1;; CRIT) worst=2;; esac; }
# ۱) سرور از بیرون (از طریق nginx)
if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then say OK "healthz پاسخ می‌دهد"; else say CRIT "healthz در دسترس نیست ($HEALTH_URL)"; fi
# ۲) آمادگی داخلی: دیتابیس، مهاجرت‌ها، Pool
if [ -n "${READY_URL:-}" ]; then r="$(curl -fsS --max-time 5 "$READY_URL" 2>/dev/null || true)"
else r="$(cd "$CAFINO_DIR" 2>/dev/null && docker compose exec -T api node -e 'fetch("http://127.0.0.1:8080/readyz").then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))' 2>/dev/null || true)"; fi
case "$r" in *'"ok":true'*) say OK "readyz: دیتابیس و مهاجرت‌ها سالم  $(printf '%s' "$r" | sed -n 's/.*"migrations":\([0-9]*\).*/(مهاجرت‌ها: \1)/p')"
  w="$(printf '%s' "$r" | sed -n 's/.*"waiting":\([0-9]*\).*/\1/p')"; [ "${w:-0}" -lt 5 ] || say WARN "صف انتظار اتصال دیتابیس: $w (بار زیاد یا پرس‌وجوی کند)";;
  *) say CRIT "readyz ناموفق (دیتابیس یا API)";; esac
# ۳) آخرین پشتیبان موفق
if [ -f "$BACKUP_DIR/LAST_OK" ]; then age=$(( ( $(date +%s) - $(cat "$BACKUP_DIR/LAST_OK") ) / 3600 )); [ "$age" -le "$MAXAGE" ] && say OK "آخرین پشتیبان ${age} ساعت پیش" || say CRIT "آخرین پشتیبان ${age} ساعت پیش (بیش از ${MAXAGE})"
else say CRIT "هیچ پشتیبان موفقی ثبت نشده ($BACKUP_DIR/LAST_OK)"; fi
# ۴) فضای دیسک (محل پشتیبان و داکر)
for p in "$BACKUP_DIR" /var/lib/docker; do [ -d "$p" ] || continue; u="$(df -P "$p" | awk 'NR==2{gsub("%","",$5);print $5}')"
  if [ "$u" -ge "$DC" ]; then say CRIT "دیسک $p ${u}٪ پر است"; elif [ "$u" -ge "$DW" ]; then say WARN "دیسک $p ${u}٪ پر است"; else say OK "دیسک $p ${u}٪"; fi; done
# ۵) اتصال‌های PostgreSQL نسبت به سقف + تراکنش‌های بسیار قدیمی
c="$(dbx psql -U "$DB_USER" -d "$DB_NAME" -qAt -c "SELECT count(*)||' '||current_setting('max_connections') FROM pg_stat_activity" 2>/dev/null || true)"
if [ -n "$c" ]; then n="${c% *}"; m="${c#* }"; [ $((n*100/m)) -lt 80 ] && say OK "اتصال‌های دیتابیس $n/$m" || say WARN "اتصال‌های دیتابیس $n/$m نزدیک سقف است"
  o="$(dbx psql -U "$DB_USER" -d "$DB_NAME" -qAt -c "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND now()-xact_start > interval '60 seconds'" 2>/dev/null || echo 0)"; [ "${o:-0}" = 0 ] || say WARN "$o تراکنش بیش از ۶۰ ثانیه در حال اجراست"
else say WARN "شمارش اتصال‌های دیتابیس ممکن نشد"; fi
exit $worst
