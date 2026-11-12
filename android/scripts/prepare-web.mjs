// وب‌اپ ساخته‌شده (dist/pwa) را به www/ کپی می‌کند. service worker و manifest حذف نمی‌شوند ولی در WebView
// اندروید ثبت نمی‌شوند (capacitor:// / https://localhost)؛ برنامه بدون آن هم آفلاین کار می‌کند چون همه‌چیز داخل APK است.
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const src = path.resolve(root, "../dist/pwa");
const dst = path.join(root, "www");
if (!fs.existsSync(path.join(src, "index.html"))) { console.error("dist/pwa پیدا نشد. اول در ریشهٔ پروژه «npm run build» را اجرا کنید."); process.exit(1); }
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log("www/ آماده شد از", src);
