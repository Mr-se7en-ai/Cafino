#!/bin/sh
# بررسی سلامت کامل برای cron/مانیتورینگ.  کد خروج: 0=OK  1=WARN  2=CRIT  (monitor.sh هر ۵ دقیقه آن را اجرا و هشدار می‌فرستد)
#   sh deploy/healthcheck.sh            ← خروجی خوانا
# بررسی‌ها: API/nginx (از بیرون و داخل)، دیتابیس و مهاجرت‌ها، وضعیت/ری‌استارت کانتینرها، CPU، RAM، دیسک (سرور/داکر/پشتیبان)،
#   حجم آپلودها، اعتبار گواهی SSL، دسترسی‌پذیری دامنهٔ عمومی، خطاهای اخیر سرویس‌ها، وضعیت پشتیبان (تازگی، خطا، رمزنگاری، تمرین بازیابی).
# متغیرها: HEALTH_URL  READY_URL  BACKUP_DIR  BACKUP_MAX_AGE_H=26  DISK_WARN_PCT=80  DISK_CRIT_PCT=92  MEM_WARN_PCT=90  LOAD_WARN_PER_CPU=2
#   SSL_WARN_DAYS=14  SSL_CRIT_DAYS=5  RESTORE_TEST_MAX_AGE_D=9  UPLOADS_WARN_MB=(پیش‌فرض: خاموش)  ERR_WARN_COUNT=20
set -u
. "$(dirname "$0")/lib.sh"
envv() { [ -f "$CAFINO_DIR/.env" ] && sed -n "s/^$1=//p" "$CAFINO_DIR/.env" | tail -1 | tr -d '"' || true; }
WEB_PORT_V="$(envv WEB_PORT)"; HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${WEB_PORT_V:-8080}/healthz}"
MAXAGE="${BACKUP_MAX_AGE_H:-26}"; DW="${DISK_WARN_PCT:-80}"; DC="${DISK_CRIT_PCT:-92}"
worst=0; say() { printf '%-5s %s\n' "$1" "$2"; case "$1" in WARN) [ $worst -ge 1 ] || worst=1;; CRIT) worst=2;; esac; }

# ۱) سرور از بیرون (از طریق nginx)
if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then say OK "healthz پاسخ می‌دهد"; else say CRIT "healthz در دسترس نیست ($HEALTH_URL)"; fi
# ۱ب) دامنهٔ عمومی (Caddy + HTTPS) و گواهی SSL
PUB="$(envv PUBLIC_BASE_URL)"; HOST="${PUB#https://}"; HOST="${HOST%%/*}"
case "$PUB" in
  https://*) if curl -fsS --max-time 10 "$PUB/healthz" >/dev/null 2>&1; then say OK "دامنهٔ عمومی از بیرون پاسخ می‌دهد ($HOST)"; else say CRIT "دامنهٔ عمومی پاسخ نمی‌دهد ($PUB/healthz) — DNS، Caddy یا فایروال"; fi
    if command -v openssl >/dev/null 2>&1; then
      end="$(printf '' | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')"
      if [ -n "$end" ]; then days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
        if [ "$days" -le "${SSL_CRIT_DAYS:-5}" ]; then say CRIT "گواهی SSL ${days} روز دیگر منقضی می‌شود (تمدید خودکار Caddy کار نکرده؛ لاگ: docker logs cafino-caddy)"
        elif [ "$days" -le "${SSL_WARN_DAYS:-14}" ]; then say WARN "گواهی SSL ${days} روز دیگر منقضی می‌شود"
        else say OK "گواهی SSL معتبر (${days} روز مانده)"; fi
      else say WARN "خواندن گواهی SSL ممکن نشد ($HOST:443)"; fi
    fi;;
esac
# ۲) آمادگی داخلی: دیتابیس، مهاجرت‌ها، Pool
if [ -n "${READY_URL:-}" ]; then r="$(curl -fsS --max-time 5 "$READY_URL" 2>/dev/null || true)"
else r="$(dc exec -T api node -e 'fetch("http://127.0.0.1:8080/readyz").then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))' 2>/dev/null || true)"; fi
case "$r" in *'"ok":true'*) say OK "readyz: دیتابیس و مهاجرت‌ها سالم  $(printf '%s' "$r" | sed -n 's/.*"migrations":\([0-9]*\).*/(مهاجرت‌ها: \1)/p')"
  w="$(printf '%s' "$r" | sed -n 's/.*"waiting":\([0-9]*\).*/\1/p')"; [ "${w:-0}" -lt 5 ] || say WARN "صف انتظار اتصال دیتابیس: $w (بار زیاد یا پرس‌وجوی کند)";;
  *) say CRIT "readyz ناموفق (دیتابیس یا API)";; esac
# ۳) کانتینرها: در حال اجرا/سالم و ری‌استارت‌های پی‌درپی
if command -v docker >/dev/null 2>&1 && [ -f "$CAFINO_DIR/docker-compose.yml" ]; then
  for svc in db api web; do
    cid="$(dc ps -q "$svc" 2>/dev/null | head -1)"
    if [ -z "$cid" ]; then say CRIT "سرویس $svc کانتینر ندارد"; continue; fi
    st="$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}/{{.RestartCount}}' "$cid" 2>/dev/null || echo '?/?/0')"
    case "$st" in running/healthy/*|running/-/*) say OK "سرویس $svc: $st";; *) say CRIT "سرویس $svc نامناسب است: $st";; esac
    rc="${st##*/}"; [ "${rc:-0}" -lt 3 ] 2>/dev/null || say WARN "سرویس $svc تا حالا $rc بار ری‌استارت شده"
  done
  if docker inspect cafino-caddy >/dev/null 2>&1; then
    [ "$(docker inspect -f '{{.State.Status}}' cafino-caddy 2>/dev/null)" = running ] && say OK "Caddy (HTTPS): در حال اجرا" || say CRIT "Caddy (HTTPS) در حال اجرا نیست"
  fi
  # ۳ب) خطاهای اخیر (نه‌فقط وضعیت): خطوط error/fatal ده دقیقهٔ اخیر API و nginx
  ne="$(dc logs --since 10m api 2>/dev/null | grep -ciE '"level":(50|60)|\bERROR\b|\bFATAL\b' || true)"
  [ "${ne:-0}" -lt "${ERR_WARN_COUNT:-20}" ] && say OK "خطاهای API در ۱۰ دقیقه: ${ne:-0}" || say WARN "خطاهای API در ۱۰ دقیقهٔ اخیر: $ne (docker compose logs api)"
  n5="$(dc logs --since 10m web 2>/dev/null | grep -cE '" 5[0-9][0-9] ' || true)"
  [ "${n5:-0}" -lt "${ERR_WARN_COUNT:-20}" ] && say OK "پاسخ‌های 5xx نگینکس در ۱۰ دقیقه: ${n5:-0}" || say WARN "پاسخ‌های 5xx نگینکس در ۱۰ دقیقه: $n5"
fi
# ۴) منابع سرور: CPU (میانگین بار)، RAM، دیسک
ncpu="$(nproc 2>/dev/null || echo 1)"; l1="$(cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo 0)"
if awk -v l="$l1" -v n="$ncpu" -v t="${LOAD_WARN_PER_CPU:-2}" 'BEGIN{exit !(l/n > t)}'; then say WARN "بار CPU بالاست: $l1 روی $ncpu هسته"; else say OK "بار CPU $l1 (هسته‌ها: $ncpu)"; fi
if [ -r /proc/meminfo ]; then mt="$(awk '/MemTotal/{print $2}' /proc/meminfo)"; ma="$(awk '/MemAvailable/{print $2}' /proc/meminfo)"
  mp=$(( (mt - ma) * 100 / mt )); [ "$mp" -lt "${MEM_WARN_PCT:-90}" ] && say OK "RAM ${mp}٪ مصرف" || say WARN "RAM ${mp}٪ مصرف شده"; fi
for p in / "$BACKUP_DIR" /var/lib/docker; do [ -d "$p" ] || continue; u="$(df -P "$p" | awk 'NR==2{gsub("%","",$5);print $5}')"
  if [ "$u" -ge "$DC" ]; then say CRIT "دیسک $p ${u}٪ پر است"; elif [ "$u" -ge "$DW" ]; then say WARN "دیسک $p ${u}٪ پر است"; else say OK "دیسک $p ${u}٪"; fi; done
# ۴ب) حجم فایل‌های آپلود
if [ -n "${UPLOADS_WARN_MB:-}" ] && [ -f "$CAFINO_DIR/docker-compose.yml" ]; then
  um="$(dc exec -T api sh -c 'du -sm /data/uploads 2>/dev/null | cut -f1' 2>/dev/null || echo '')"
  if [ -n "$um" ]; then [ "$um" -lt "$UPLOADS_WARN_MB" ] && say OK "حجم آپلودها ${um}MB" || say WARN "حجم آپلودها ${um}MB (سقف هشدار ${UPLOADS_WARN_MB})"; fi
fi
# ۵) پشتیبان: تازگی، خطای آخر، رمزنگاری، تمرین بازیابی
if [ -f "$BACKUP_DIR/LAST_OK" ]; then age=$(( ( $(date +%s) - $(cat "$BACKUP_DIR/LAST_OK") ) / 3600 )); [ "$age" -le "$MAXAGE" ] && say OK "آخرین پشتیبان ${age} ساعت پیش" || say CRIT "آخرین پشتیبان ${age} ساعت پیش (بیش از ${MAXAGE})"
else say CRIT "هیچ پشتیبان موفقی ثبت نشده ($BACKUP_DIR/LAST_OK)"; fi
if [ -f "$BACKUP_DIR/LAST_ERROR" ] && { [ ! -f "$BACKUP_DIR/LAST_OK" ] || [ "$(cat "$BACKUP_DIR/LAST_ERROR")" -gt "$(cat "$BACKUP_DIR/LAST_OK")" ]; }; then say CRIT "آخرین اجرای پشتیبان‌گیری ناموفق بوده (/var/log/cafino-backup.log)"; fi
[ "$(enc_mode)" = none ] && say WARN "رمزنگاری پشتیبان فعال نیست (/etc/cafino/backup.pass)"
if [ -f "$BACKUP_DIR/LAST_RESTORE_TEST_OK" ]; then ta=$(( ( $(date +%s) - $(cat "$BACKUP_DIR/LAST_RESTORE_TEST_OK") ) / 86400 )); [ "$ta" -le "${RESTORE_TEST_MAX_AGE_D:-9}" ] && say OK "آخرین تمرین بازیابی ${ta} روز پیش" || say WARN "آخرین تمرین بازیابی ${ta} روز پیش"
else say WARN "هنوز تمرین بازیابی موفقی ثبت نشده (restore.sh --latest)"; fi
# ۶) اتصال‌های PostgreSQL نسبت به سقف + تراکنش‌های بسیار قدیمی
c="$(dbx psql -U "$DB_USER" -d "$DB_NAME" -qAt -c "SELECT count(*)||' '||current_setting('max_connections') FROM pg_stat_activity" 2>/dev/null || true)"
n="${c% *}"; m="${c#* }"
case "$n$m" in ""|*[!0-9]*) c="";; esac
if [ -n "$c" ]; then [ $((n*100/m)) -lt 80 ] && say OK "اتصال‌های دیتابیس $n/$m" || say WARN "اتصال‌های دیتابیس $n/$m نزدیک سقف است"
  o="$(dbx psql -U "$DB_USER" -d "$DB_NAME" -qAt -c "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND now()-xact_start > interval '60 seconds'" 2>/dev/null || echo 0)"; [ "${o:-0}" = 0 ] || say WARN "$o تراکنش بیش از ۶۰ ثانیه در حال اجراست"
else say WARN "شمارش اتصال‌های دیتابیس ممکن نشد"; fi
exit $worst
