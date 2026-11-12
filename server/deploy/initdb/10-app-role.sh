#!/bin/sh
# فقط هنگام «اولین» ساخت پایگاه‌دادهٔ docker اجرا می‌شود (docker-entrypoint-initdb.d). برای پایگاه‌دادهٔ موجود: deploy/db-roles.sh
set -eu
[ -n "${APP_DB_PASSWORD:-}" ] || { echo "APP_DB_PASSWORD تنظیم نشده؛ نقش cafino_app ساخته نشد" >&2; exit 1; }
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v "pw=$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE cafino_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
SELECT format('ALTER ROLE cafino_app PASSWORD %L', :'pw') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO cafino_app', current_database()) \gexec
SQL
