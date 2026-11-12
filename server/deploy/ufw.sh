#!/bin/sh
# فایروال Ubuntu: فقط SSH/HTTP/HTTPS باز. اجرا با sudo.  ⚠️ پیش از فعال‌سازی مطمئن شوید پورت SSH درست است تا قفل نشوید.
#   SSH_PORT=22 sudo sh deploy/ufw.sh
# توجه: Docker قواعد خودش را مستقیم در iptables می‌نویسد و از ufw عبور می‌کند؛ به همین دلیل compose فقط روی 127.0.0.1 منتشر می‌کند
# (PostgreSQL و API هیچ‌وقت publish نمی‌شوند) و پورت 80/443 را Caddy/nginx میزبان می‌گیرد، نه Docker.
set -eu
SSH_PORT="${SSH_PORT:-22}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw limit "${SSH_PORT}/tcp" comment 'ssh (rate-limited)'
ufw allow 80/tcp comment 'http (ACME + redirect)'
ufw allow 443/tcp comment 'https'
ufw --force enable
ufw status verbose
