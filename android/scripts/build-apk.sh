#!/usr/bin/env bash
# استفاده:  bash scripts/build-apk.sh [debug|release]
# پیش‌نیاز: JDK 21، Android SDK (platform 35 + build-tools 35)، ANDROID_HOME تنظیم‌شده، دسترسی اینترنت به dl.google.com و Maven.
set -euo pipefail
MODE="${1:-debug}"
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci
[ -d android ] || npx cap add android
node scripts/prepare-web.mjs
npx cap sync android
node scripts/patch-android.mjs
cd android
if [ "$MODE" = "release" ]; then
  ./gradlew assembleRelease
  OUT=$(ls app/build/outputs/apk/release/*.apk | head -1)
else
  ./gradlew assembleDebug
  OUT=$(ls app/build/outputs/apk/debug/*.apk | head -1)
fi
mkdir -p ../out
cp "$OUT" "../out/cafino-$(node -p "require('../package.json').version")-$MODE.apk"
echo "APK: android-app/out/ ← $(ls ../out)"
