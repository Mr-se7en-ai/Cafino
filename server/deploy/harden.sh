#!/usr/bin/env bash
# سخت‌سازی امنیتی سرور Ubuntu LTS (۲۲٫۰۴/۲۴٫۰۴) + ساخت کاربر/کلید محدود برای استقرار خودکار از GitHub. فقط root. چندبار اجرا بی‌خطر است.
#   sudo bash harden.sh --ci-key "ssh-ed25519 AAAA… cafino-ci"                   ← کلید عمومی استقرار GitHub Actions
#   sudo bash harden.sh --admin-user hamed --admin-key "ssh-ed25519 AAAA… hamed"  ← کاربر مدیر با sudo و ورود با کلید
#   sudo bash harden.sh --disable-password-login                                  ← فقط وقتی کلید مدیر را «از ترمینال دیگر» آزموده‌اید
# گزینه‌ها: --staging-dir /opt/cafino-staging   --prod-dir /opt/cafino   --no-ufw   --no-fail2ban   --dry-run (فقط نمایش)
#
# ⚠️ قفل نشدن از سرور: ورود با رمز و root «فقط» با --disable-password-login بسته می‌شود و فقط اگر دست‌کم یک کلید SSH معتبر برای root یا
#    کاربر مدیر روی سرور باشد. پیش از بستن، یک ترمینال دیگر باز کنید و ورود با کلید را بیازمایید. این اسکریپت پورت SSH را عوض نمی‌کند.
# ⚠️ این اسکریپت «ufw reset» نمی‌زند؛ فقط قواعد لازم را می‌افزاید.
set -euo pipefail
ADMIN_USER=""; ADMIN_KEY=""; CI_KEY=""; DISABLE_PW=0; UFW=1; F2B=1; DRY=0
PROD_DIR="/opt/cafino"; STAGING_DIR="/opt/cafino-staging"; CI_USER="cafino-deploy"; CI_HOME="/var/lib/cafino-deploy"
while [ $# -gt 0 ]; do case "$1" in
  --admin-user) ADMIN_USER="${2:-}"; shift;; --admin-key) ADMIN_KEY="${2:-}"; shift;; --ci-key) CI_KEY="${2:-}"; shift;;
  --disable-password-login) DISABLE_PW=1;; --no-ufw) UFW=0;; --no-fail2ban) F2B=0;; --dry-run) DRY=1;;
  --prod-dir) PROD_DIR="${2:-}"; shift;; --staging-dir) STAGING_DIR="${2:-}"; shift;;
  -h|--help) sed -n '2,12p' "$0"; exit 0;; *) echo "گزینهٔ ناشناخته: $1" >&2; exit 2;; esac; shift; done
log() { printf '\033[1;34m▶\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }
run() { if [ "$DRY" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }
[ "$(id -u)" = 0 ] || die "با sudo اجرا کنید"
HERE="$(cd "$(dirname "$0")" && pwd)"
# کلید عمومی SSH باید یک خط ساده با نوع شناخته‌شده باشد (جلوگیری از تزریق گزینه/فرمان در authorized_keys)
valid_pubkey() { [[ "$1" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))\ [A-Za-z0-9+/=]+(\ [A-Za-z0-9@._-]+)?$ ]]; }
[ -z "$CI_KEY" ] || valid_pubkey "$CI_KEY" || die "--ci-key معتبر نیست (باید فقط «ssh-ed25519 AAAA… توضیح» باشد، بدون گزینه یا خط جدید)"
[ -z "$ADMIN_KEY" ] || valid_pubkey "$ADMIN_KEY" || die "--admin-key معتبر نیست"
[ -z "$ADMIN_USER" ] || [[ "$ADMIN_USER" =~ ^[a-z][a-z0-9_-]{0,30}$ ]] || die "نام کاربر مدیر نامعتبر"
[ -z "$ADMIN_USER" ] || [ -n "$ADMIN_KEY" ] || [ -d "/home/$ADMIN_USER" ] || die "برای کاربر تازه --admin-key هم بدهید"
[[ "$PROD_DIR$STAGING_DIR" =~ ^[A-Za-z0-9/_.-]+$ ]] || die "مسیر نامعتبر"

# ── ۱) بسته‌ها و به‌روزرسانی امنیتی خودکار ──
log "بسته‌های لازم و به‌روزرسانی‌های امنیتی خودکار…"
export DEBIAN_FRONTEND=noninteractive
run apt-get update -qq
run apt-get install -y -qq ufw fail2ban unattended-upgrades rsync gnupg curl openssl >/dev/null
if [ "$DRY" = 0 ]; then printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\nAPT::Periodic::AutocleanInterval "7";\n' > /etc/apt/apt.conf.d/20auto-upgrades; fi
ok "به‌روزرسانی امنیتی خودکار فعال شد (kernel/سرویس‌ها؛ ری‌استارت دستی لازم می‌شود)"

# ── ۲) کاربر مدیر ──
if [ -n "$ADMIN_USER" ]; then
  log "کاربر مدیر «$ADMIN_USER»…"
  id "$ADMIN_USER" >/dev/null 2>&1 || run adduser --disabled-password --gecos "" "$ADMIN_USER"
  run usermod -aG sudo "$ADMIN_USER"
  if [ -n "$ADMIN_KEY" ]; then
    run install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
    if [ "$DRY" = 0 ]; then grep -qxF "$ADMIN_KEY" "/home/$ADMIN_USER/.ssh/authorized_keys" 2>/dev/null || echo "$ADMIN_KEY" >> "/home/$ADMIN_USER/.ssh/authorized_keys"
      chown "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh/authorized_keys"; chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys"; fi
  fi
  # sudo بدون رمز برای مدیر با ورود کلیدی (حساب رمز ندارد)
  if [ "$DRY" = 0 ]; then echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-cafino-admin; chmod 440 /etc/sudoers.d/90-cafino-admin; visudo -cf /etc/sudoers.d/90-cafino-admin >/dev/null || { rm -f /etc/sudoers.d/90-cafino-admin; die "sudoers نامعتبر"; }; fi
  ok "کاربر مدیر آماده است (ssh $ADMIN_USER@آدرس-سرور)"
fi

# ── ۳) کاربر و کلید «فقط-استقرار» برای GitHub Actions ──
if [ -n "$CI_KEY" ]; then
  log "کاربر $CI_USER با کلید محدود (فقط فرمان‌های deploy/plan/rollback/status/health)…"
  id "$CI_USER" >/dev/null 2>&1 || run adduser --system --group --home "$CI_HOME" --shell /bin/sh "$CI_USER"
  run install -d -m 750 -o root -g "$CI_USER" "$CI_HOME/.ssh"
  run install -d -m 700 -o "$CI_USER" -g "$CI_USER" "$CI_HOME/incoming"
  run install -m 755 -o root -g root "$HERE/ci-entry.sh" /usr/local/sbin/cafino-ci-entry       # نسخهٔ خارج از درخت قابل‌به‌روزرسانی با بسته: دروازهٔ امنیتی
  run install -d -m 750 /etc/cafino
  if [ "$DRY" = 0 ]; then
    printf 'CI_PRODUCTION_DIR=%s\nCI_STAGING_DIR=%s\n' "$PROD_DIR" "$STAGING_DIR" > /etc/cafino/ci.env; chmod 644 /etc/cafino/ci.env
    # authorized_keys مالک root است (کاربر استقرار نمی‌تواند آن را عوض کند)
    printf 'restrict,command="/usr/local/sbin/cafino-ci-entry" %s\n' "$CI_KEY" > "$CI_HOME/.ssh/authorized_keys"
    chown root:"$CI_USER" "$CI_HOME/.ssh/authorized_keys"; chmod 640 "$CI_HOME/.ssh/authorized_keys"
    # sudo فقط برای اسکریپت‌های استقرار (مالک root)، بدون رمز، فقط برای همین کاربر
    : > /etc/sudoers.d/cafino-deploy.tmp
    for d in "$PROD_DIR" "$STAGING_DIR"; do for s in deploy.sh rollback.sh healthcheck.sh; do echo "$CI_USER ALL=(root) NOPASSWD: $d/server/deploy/$s" >> /etc/sudoers.d/cafino-deploy.tmp; done; done
    chmod 440 /etc/sudoers.d/cafino-deploy.tmp
    visudo -cf /etc/sudoers.d/cafino-deploy.tmp >/dev/null || { rm -f /etc/sudoers.d/cafino-deploy.tmp; die "sudoers نامعتبر"; }
    mv /etc/sudoers.d/cafino-deploy.tmp /etc/sudoers.d/cafino-deploy
  fi
  ok "کلید استقرار نصب شد. اثر انگشت: $(printf '%s\n' "$CI_KEY" | ssh-keygen -lf - 2>/dev/null | cut -d' ' -f2)"
fi

# ── ۴) SSH ──
log "سخت‌سازی SSH…"
SSHD_CONF=/etc/ssh/sshd_config.d/00-cafino-hardening.conf     # «00»: بر فایل‌های cloud-init (مثلاً 50-cloud-init.conf) مقدم است
has_key_login() {
  [ "$DRY" = 1 ] && [ -n "$ADMIN_KEY" ] && return 0
  [ -s /root/.ssh/authorized_keys ] && return 0
  for u in $(getent group sudo | cut -d: -f4 | tr ',' ' '); do [ -s "/home/$u/.ssh/authorized_keys" ] && return 0; done
  return 1
}
PW_LINE="# PasswordAuthentication: بدون تغییر (برای بستن: --disable-password-login)"; ROOT_LINE="PermitRootLogin prohibit-password"
if [ "$DISABLE_PW" = 1 ]; then
  has_key_login || die "هیچ کلید SSH معتبری (برای root یا کاربر دارای sudo) پیدا نشد؛ بستن ورود با رمز شما را بیرون قفل می‌کند. ابتدا --admin-user/--admin-key بدهید."
  PW_LINE="PasswordAuthentication no"
  if [ -n "$ADMIN_USER" ] && [ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]; then ROOT_LINE="PermitRootLogin no"; fi
fi
if [ "$DRY" = 0 ]; then
  mkdir -p /etc/ssh/sshd_config.d
  cat > "$SSHD_CONF" <<CONF
# ساخته‌شدهٔ harden.sh
$PW_LINE
$ROOT_LINE
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
CONF
  if sshd -t 2>/dev/null; then systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true; ok "SSH سخت‌سازی شد ($SSHD_CONF)"
  else rm -f "$SSHD_CONF"; die "پیکربندی SSH نامعتبر بود؛ تغییر برگردانده شد"; fi
else echo "  [dry-run] نوشتن $SSHD_CONF:  $PW_LINE | $ROOT_LINE"; fi
[ "$DISABLE_PW" = 1 ] && warn "ورود با رمز بسته شد؛ همین حالا از یک ترمینال دیگر ورود با کلید را بیازمایید، سپس این پنجره را ببندید."

# ── ۵) فایروال (بدون reset) ──
if [ "$UFW" = 1 ]; then
  log "فایروال UFW: فقط SSH/HTTP/HTTPS ورودی…"
  SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}' || true)"; SSH_PORT="${SSH_PORT:-22}"
  run ufw default deny incoming; run ufw default allow outgoing
  run ufw limit "${SSH_PORT}/tcp" comment 'ssh (rate-limited)'
  run ufw allow 80/tcp comment 'http (ACME + redirect)'; run ufw allow 443/tcp comment 'https'
  run ufw --force enable
  ok "UFW فعال (SSH:$SSH_PORT, 80, 443). یادآوری: پورت‌های publish‌شدهٔ Docker از UFW عبور می‌کنند؛ compose کافینو فقط 80/443 (Caddy) و 127.0.0.1 را منتشر می‌کند و PostgreSQL/API هرگز منتشر نمی‌شوند."
fi

# ── ۶) Fail2ban ──
if [ "$F2B" = 1 ]; then
  log "Fail2ban برای SSH…"
  if [ "$DRY" = 0 ]; then
    cat > /etc/fail2ban/jail.d/cafino.local <<'CONF'
# ساخته‌شدهٔ harden.sh
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 4
backend  = systemd
[sshd]
enabled = true
CONF
    systemctl enable --now fail2ban >/dev/null 2>&1 || true; systemctl restart fail2ban >/dev/null 2>&1 || true
  else echo "  [dry-run] نوشتن /etc/fail2ban/jail.d/cafino.local"; fi
  ok "Fail2ban فعال (۴ تلاش ناموفق در ۱۰ دقیقه = ۱ ساعت مسدود)"
fi

# ── ۷) مجوز فایل‌های حساس و sysctl ──
log "مجوز فایل‌های حساس…"
for d in "$PROD_DIR" "$STAGING_DIR"; do
  [ -d "$d" ] || continue
  run chown root:root "$d"; [ -f "$d/server/.env" ] && run chmod 600 "$d/server/.env"
  [ -d "$d/server/deploy/local" ] && run chmod -R go-rwx "$d/server/deploy/local"
  [ -d "$d/.deploy-state" ] && run chmod 700 "$d/.deploy-state"
done
for b in /var/backups/cafino /var/backups/cafino-staging /etc/cafino; do [ -d "$b" ] && run chmod 700 "$b"; done
[ -f /etc/cafino/backup.pass ] && run chmod 600 /etc/cafino/backup.pass
[ -f /root/cafino-credentials.txt ] && run chmod 600 /root/cafino-credentials.txt
if [ "$DRY" = 0 ]; then printf 'net.ipv4.tcp_syncookies=1\nnet.ipv4.conf.all.accept_redirects=0\nnet.ipv4.conf.all.send_redirects=0\nnet.ipv4.conf.all.rp_filter=1\nkernel.kptr_restrict=2\n' > /etc/sysctl.d/90-cafino.conf; sysctl --system >/dev/null 2>&1 || true; fi
ok "تمام شد."
cat <<MSG

بررسی نهایی (از ترمینال دیگر):
  • ورود SSH با کلید کار می‌کند؟     ssh ${ADMIN_USER:-root}@آدرس-سرور
  • وضعیت فایروال:                    sudo ufw status verbose
  • وضعیت Fail2ban:                   sudo fail2ban-client status sshd
  • پورت‌های باز از بیرون (نباید 5432/8080 باشد):   sudo ss -ltnp
MSG
