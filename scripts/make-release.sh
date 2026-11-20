#!/usr/bin/env bash
# ساخت «بستهٔ انتشار» کافینو برای استقرار روی سرور (در CI پس از npm ci، تست و npm run build اجرا می‌شود).
#   bash scripts/make-release.sh [پوشهٔ خروجی=release-out]
# خروجی:  cafino-release-<نسخه>-<sha7>.tar.gz  +  .sha256  (+ RELEASE_ID.txt)
# محتوای بسته (همان چیزی که deploy.sh روی سرور می‌پذیرد):
#   RELEASE_ID  VERSION  GIT_SHA  MIGRATIONS (نام فایل‌های مهاجرت این نسخه)  MANIFEST.sha256
#   api-image.tar.gz  ایمیج Docker سرویس API (docker save، برچسب cafino-api:<RELEASE_ID>)
#   pwa/              خروجی تأییدشدهٔ dist/pwa (بدون تغییر پس از verify)
#   server/           docker-compose.yml، .env.example و deploy/ (اسکریپت‌ها، nginx.conf، csp.conf) — بدون local/ و بدون راز
# هیچ رازی داخل بسته نیست. بسته روی سرور فقط با deploy.sh (کاربر root، پس از بررسی MANIFEST) باز می‌شود.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-release-out}"
VERSION="$(node -p "require('./package.json').version")"
SHA="$(git rev-parse --short=7 HEAD 2>/dev/null || echo "${GITHUB_SHA:-0000000}" | cut -c1-7)"
ID="$VERSION-$SHA"
[[ "$ID" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?-[0-9a-f]{7}$ ]] || { echo "شناسهٔ انتشار نامعتبر: $ID" >&2; exit 1; }
node scripts/version.mjs check >/dev/null
for f in dist/pwa/index.html dist/manifest.json; do [ -f "$f" ] || { echo "$f نیست؛ ابتدا npm run build" >&2; exit 1; }; done
node scripts/dist.mjs verify >/dev/null                                 # dist پیش از بسته‌بندی دوباره راستی‌آزمایی می‌شود
( cd server && node deploy/make-csp.mjs ../dist/pwa >/dev/null )        # csp.conf هم‌خوان با هش اسکریپت‌های همین بیلد

rm -rf "$OUT"; STAGE="$OUT/stage"; mkdir -p "$STAGE/server/deploy"
cp -a dist/pwa "$STAGE/pwa"
cp server/docker-compose.yml server/.env.example "$STAGE/server/"
( cd server/deploy && git ls-files . 2>/dev/null | grep -v '^local/' | while read -r f; do mkdir -p "$STAGE/server/deploy/$(dirname "$f")"; cp -a "$f" "$STAGE/server/deploy/$f"; done )
cp server/deploy/csp.conf "$STAGE/server/deploy/csp.conf"               # نسخهٔ تازه تولیدشده (ممکن است هنوز commit نشده باشد)
( cd server/migrations && printf '%s\n' ./*.sql | sed 's|^\./||' | sort ) > "$STAGE/MIGRATIONS"
echo "$ID" > "$STAGE/RELEASE_ID"; echo "$VERSION" > "$STAGE/VERSION"; git rev-parse HEAD > "$STAGE/GIT_SHA" 2>/dev/null || echo "${GITHUB_SHA:-unknown}" > "$STAGE/GIT_SHA"

if [ "${SKIP_IMAGE:-0}" = 1 ]; then echo "(SKIP_IMAGE=1: ایمیج API ساخته نشد — فقط برای تست)" >&2; : > "$STAGE/api-image.tar.gz"
else
  docker build -q -t "cafino-api:$ID" server >/dev/null
  docker save "cafino-api:$ID" | gzip -9 > "$STAGE/api-image.tar.gz"
fi
( cd "$STAGE" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > ../MANIFEST.tmp && mv ../MANIFEST.tmp MANIFEST.sha256 )
ARCHIVE="$OUT/cafino-release-$ID.tar.gz"
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime='UTC 2020-01-01' -C "$STAGE" -czf "$ARCHIVE" .
( cd "$OUT" && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256" )
echo "$ID" > "$OUT/RELEASE_ID.txt"; rm -rf "$STAGE"
echo "بستهٔ انتشار: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
