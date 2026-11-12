#!/bin/sh
# ساخت/به‌روزرسانی نقش محدود API (cafino_app). امن برای اجرای مکرر.
#   APP_DB_PASSWORD='رمز-قوی' sh deploy/db-roles.sh
# سپس در .env: DATABASE_URL با کاربر cafino_app، MIGRATION_DATABASE_URL با کاربر مالک (cafino)، APP_DB_ROLE=cafino_app
# (docker-compose همین بسته این‌ها را از APP_DB_PASSWORD می‌سازد.) دسترسی‌های جدول‌ها را خود API پس از هر مهاجرت اعمال می‌کند (cafino_apply_app_grants).
set -eu
. "$(dirname "$0")/lib.sh"
[ -n "${APP_DB_PASSWORD:-}" ] || die "APP_DB_PASSWORD را تنظیم کنید"
[ "${#APP_DB_PASSWORD}" -ge 16 ] || die "APP_DB_PASSWORD دست‌کم ۱۶ نویسه باشد"
ROLE="${APP_DB_ROLE:-cafino_app}"
case "$ROLE" in *[!a-z0-9_]*|"") die "APP_DB_ROLE نامعتبر است";; esac
# رمز از طریق stdin (نه آرگومان) تا در لیست پردازش‌ها دیده نشود
printf '%s\n' "SELECT format('DO \$do\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=%L) THEN CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; END IF; END \$do\$;', '$ROLE', '$ROLE') \\gexec" \
  | dbx psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q
printf '%s\n' "SELECT format('ALTER ROLE %I PASSWORD %L', '$ROLE', :'pw') \\gexec" "SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), '$ROLE') \\gexec" \
  | dbx psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -v "pw=$APP_DB_PASSWORD"
log "نقش $ROLE آماده است (بدون DDL/DELETE روی جدول‌های مالی؛ دسترسی جدول‌ها هنگام مهاجرت API اعمال می‌شود)"
