// تنظیمات اختصاصی کافینو روی پروژهٔ تولیدشدهٔ Capacitor (idempotent؛ بعد از هر «cap sync» اجرا می‌شود):
// نسخه (versionName/versionCode از package.json)، مجوز میکروفن، بدون backup خودکار، رنگ پس‌زمینه/استاتوس‌بار،
// امضای release از متغیرهای محیطی (CAFINO_KEYSTORE, CAFINO_KEYSTORE_PASSWORD, CAFINO_KEY_ALIAS, CAFINO_KEY_PASSWORD).
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const A = (p) => path.join(root, "android", p);
const rd = (p) => fs.readFileSync(A(p), "utf8");
const wr = (p, s) => fs.writeFileSync(A(p), s);
const ver = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const [ma, mi, pa] = ver.split(".").map(Number);
const versionCode = ma * 10000 + mi * 100 + pa;

// build.gradle
let g = rd("app/build.gradle");
g = g.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${ver}"`);
if (!g.includes("CAFINO_KEYSTORE")) {
  g = g.replace("    buildTypes {", `    signingConfigs {
        release {
            if (System.getenv("CAFINO_KEYSTORE")) {
                storeFile file(System.getenv("CAFINO_KEYSTORE"))
                storePassword System.getenv("CAFINO_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CAFINO_KEY_ALIAS")
                keyPassword System.getenv("CAFINO_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`).replace("        release {\n            minifyEnabled false", "        release {\n            if (System.getenv(\"CAFINO_KEYSTORE\")) { signingConfig signingConfigs.release }\n            minifyEnabled false");
}
wr("app/build.gradle", g);

// AndroidManifest.xml
let m = rd("app/src/main/AndroidManifest.xml");
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"');
if (!m.includes("RECORD_AUDIO")) m = m.replace('<uses-permission android:name="android.permission.INTERNET" />', `<uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />`);
wr("app/src/main/AndroidManifest.xml", m);

// رنگ‌ها
const colors = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <color name="colorPrimary">#0F172A</color>
    <color name="colorPrimaryDark">#0F172A</color>
    <color name="colorAccent">#14B8A6</color>
</resources>
`;
wr("app/src/main/res/values/colors.xml", colors);
wr("app/src/main/res/values/ic_launcher_background.xml", `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#E8590C</color>
</resources>`);
let st = rd("app/src/main/res/values/styles.xml");
if (!st.includes("statusBarColor")) st = st.replace('<item name="android:background">@null</item>', '<item name="android:background">@null</item>\n        <item name="android:statusBarColor">#0F172A</item>\n        <item name="android:navigationBarColor">#0F172A</item>\n        <item name="android:windowBackground">#0F172A</item>');
wr("app/src/main/res/values/styles.xml", st);
console.log(`android پچ شد: v${ver} (versionCode ${versionCode})`);
