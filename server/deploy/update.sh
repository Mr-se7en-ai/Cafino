#!/usr/bin/env bash
# به‌روزرسانی کافینو: پشتیبان ← دریافت سورس ← ساخت برنامه ← راه‌اندازی دوباره (مهاجرت‌ها خودکار) ← بررسی نهایی.
#   sudo bash /opt/cafino/server/deploy/update.sh                 (مخزن خصوصی:  sudo GITHUB_TOKEN=… bash …/update.sh)
# گزینه‌ها همان install.sh --update است (--no-pull، --skip-backup، --rebuild).
exec bash "$(dirname "$(readlink -f "$0")")/install.sh" --update "$@"
