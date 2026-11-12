# توابع مشترک اسکریپت‌های استقرار (source می‌شود). دو حالت اجرا:
#   docker (پیش‌فرض):  دستورهای PostgreSQL داخل کانتینر db اجرا می‌شوند  → DB_EXEC="docker compose exec -T db"
#   host:               خود PostgreSQL روی همین سرور/راه دور است       → DB_EXEC=""  و متغیرهای PGHOST/PGPORT/PGUSER/PGPASSWORD
# همهٔ مسیرها نسبت به محل خود اسکریپت‌اند (مستقل از محل نصب).
CAFINO_DIR="${CAFINO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DB_NAME="${DB_NAME:-cafino}"; DB_USER="${DB_USER:-cafino}"
DB_EXEC="${DB_EXEC-docker compose exec -T db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cafino}"
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
# psql/pg_dump/pg_restore با/بدون کانتینر
dbx() { cmd="$1"; shift; if [ -n "$DB_EXEC" ]; then (cd "$CAFINO_DIR" && $DB_EXEC "$cmd" "$@"); else "$cmd" "$@"; fi; }
sha256_of() { sha256sum "$1" | cut -d' ' -f1; }
