// آیکن‌های برنامه را از brand/icon.svg می‌سازد (Chromium/Playwright): PWA، favicon، apple-touch، Electron (png+ico)، آیکن لانچر اندروید.
// اجرا: node scripts/make-brand-icons.mjs   (خروجی‌ها در مخزن نگه داشته می‌شوند؛ فقط با تغییر لوگو لازم است)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(import.meta.dirname, "..");
const icon = fs.readFileSync(path.join(root, "brand/icon.svg"), "utf8");
// نسخهٔ تمام‌صفحه (بدون گوشهٔ گرد) برای maskable/apple-touch: پس‌زمینه تا لبه، نماد داخل «ناحیهٔ امن» ۸۰٪
const m = icon.match(/^(.*?<\/defs>)(<rect[^>]*\/>)(.*)(<\/svg>)$/s);
if (!m) throw new Error("ساختار icon.svg ناشناخته است");
const full = (k) => `${m[1]}<rect width="512" height="512" fill="url(#ig)"/><g transform="translate(${(512 * (1 - k)) / 2} ${(512 * (1 - k)) / 2}) scale(${k})">${m[3]}</g></svg>`;
const rounded = icon, maskable = full(0.8), apple = full(0.9);
const out = (...p) => path.join(root, ...p);
const jobs = [
  [rounded, 192, out("pwa/icons/icon-192.png")], [rounded, 512, out("pwa/icons/icon-512.png")], [maskable, 512, out("pwa/icons/icon-maskable-512.png")],
  [apple, 180, out("pwa/icons/apple-touch-icon.png")], [rounded, 48, out("pwa/icons/favicon-48.png")],
  [rounded, 512, out("el/electron-app/app/icon.png")], [rounded, 256, out("el/electron-app/build/icon-256.png")],
  [rounded, 512, out("brand/icon-512.png")], [rounded, 192, out("brand/icon-192.png")], [apple, 180, out("brand/apple-touch-icon.png")],
];
// اندروید: لانچر قدیمی (گرد) + foreground آداپتیو (نماد روی شفاف؛ پس‌زمینه از رنگ ic_launcher_background)
const fgOnly = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${icon.match(/<defs>(.*?)<\/defs>/s)[1]}</defs><g transform="translate(${(512 * 0.34) / 2} ${(512 * 0.34) / 2}) scale(.66)">${m[3]}</g></svg>`;
const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, px] of Object.entries(dens)) {
  const dir = out("android/android/app/src/main/res", `mipmap-${d}`);
  if (!fs.existsSync(dir)) continue;
  jobs.push([rounded, px, path.join(dir, "ic_launcher.png")], [rounded, px, path.join(dir, "ic_launcher_round.png")], [fgOnly, (px * 108) / 48, path.join(dir, "ic_launcher_foreground.png")]);
}
const b = await chromium.launch();
const pg = await b.newPage();
for (const [svg, px, file] of jobs) {
  await pg.setViewportSize({ width: Math.round(px), height: Math.round(px) });
  await pg.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${svg.replace("<svg ", "<svg width=\"100%\" height=\"100%\" ")}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await pg.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: Math.round(px), height: Math.round(px) } });
}
await b.close();
console.log("آیکن‌ها ساخته شد:", jobs.length, "فایل");
