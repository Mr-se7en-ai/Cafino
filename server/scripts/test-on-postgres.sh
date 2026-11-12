#!/usr/bin/env bash
# اجرای مجموعهٔ تست روی یک PostgreSQL واقعی (نه embedded): برای هر فایل تست یک دیتابیس تازه ساخته می‌شود،
# چون تست‌ها دیتابیس خالی فرض می‌کنند. نیاز: کاربر با دسترسی CREATEDB.
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=cafino PGPASSWORD=... bash scripts/test-on-postgres.sh
set -uo pipefail
cd "$(dirname "$0")/.."
: "${PGHOST:=127.0.0.1}" "${PGPORT:=5432}" "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER
auth=""; [ -n "${PGPASSWORD:-}" ] && auth=":${PGPASSWORD}"
tot=0; bad=0
for f in test/*.test.js; do
  db="cftest_$(basename "$f" .test.js | tr 'A-Z' 'a-z')_$$"
  psql -d postgres -qAtc "CREATE DATABASE \"$db\"" >/dev/null || { echo "ساخت دیتابیس ناموفق"; exit 2; }
  out=$(TEST_DATABASE_URL="postgres://${PGUSER}${auth}@${PGHOST}:${PGPORT}/${db}" node --test --test-concurrency=1 "$f" 2>&1)
  p=$(grep -E '^# pass' <<<"$out" | awk '{print $3}'); fl=$(grep -E '^# fail' <<<"$out" | awk '{print $3}')
  echo "$(basename "$f"): pass=${p:-0} fail=${fl:-?}"; tot=$((tot + ${p:-0})); [ "${fl:-1}" != "0" ] && { bad=$((bad + 1)); grep -E '^not ok' <<<"$out" | head -5; }
  psql -d postgres -qAtc "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null 2>&1
done
echo "جمع: pass=$tot، فایل‌های دارای شکست=$bad"; [ "$bad" = 0 ]
