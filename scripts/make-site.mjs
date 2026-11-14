// ساخت پوشهٔ «سایت آنلاین» (GitHub Pages) از dist/pwa:  node scripts/make-site.mjs [مقصد=dist/site]
// فقط config.js را برای حالت بدون سرور تنظیم می‌کند (allowLocalAccounts: true) و فایل‌های لازم Pages را می‌افزاید.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "dist", "pwa"), out = path.resolve(process.argv[2] || path.join(root, "dist", "site"));
if (!fs.existsSync(path.join(src, "index.html"))) throw new Error("dist/pwa پیدا نشد؛ ابتدا npm run build و node scripts/dist.mjs");
fs.rmSync(out, { recursive: true, force: true }); fs.cpSync(src, out, { recursive: true });
const cfgPath = path.join(out, "config.js"); let cfg = fs.readFileSync(cfgPath, "utf8");
if (!/allowLocalAccounts:\s*false/.test(cfg)) throw new Error("کلید allowLocalAccounts در config.js پیدا نشد");
cfg = cfg.replace(/allowLocalAccounts:\s*false/, "allowLocalAccounts: true"); fs.writeFileSync(cfgPath, cfg);
fs.writeFileSync(path.join(out, ".nojekyll"), "");
fs.writeFileSync(path.join(out, "404.html"), '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>کافینو</title><meta http-equiv="refresh" content="0;url=./"><p style="font-family:sans-serif;text-align:center;margin-top:20vh"><a href="./">رفتن به کافینو</a></p></html>\n');

// Netlify: انتشار بدون build (فقط publish) + هدرهای امنیتی/کش + بازگشت SPA. هدر CSP همان deploy/csp.conf سرور است (در E2E آزموده شده).
const cspConf = fs.readFileSync(path.join(root, "server/deploy/csp.conf"), "utf8").match(/"([^"]+)"/);
if (cspConf) {
  fs.writeFileSync(path.join(out, "_headers"), `/*\n  Content-Security-Policy: ${cspConf[1]}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), geolocation=(), payment=()\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/config.js\n  Cache-Control: no-cache\n/bundle.js\n  Cache-Control: no-cache\n/manifest.webmanifest\n  Cache-Control: no-cache\n/chunks/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
}
fs.writeFileSync(path.join(out, "_redirects"), "/*  /index.html  200\n");
fs.writeFileSync(path.join(out, "netlify.toml"), '# خروجی ازپیش‌ساخته (npm run site) — بدون مرحلهٔ build؛ فقط انتشار.\n[build]\n  publish = "."\n  command = "echo prebuilt"\n');
const ver = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
fs.writeFileSync(path.join(out, "README.md"), `# کافینو | CAFINO — نسخهٔ آنلاین (v${ver})\n\nسامانه مدیریت هوشمند کافی‌نت. این مخزن فقط **خروجی ساخته‌شدهٔ برنامه** (PWA) را برای GitHub Pages نگه می‌دارد؛ سورس برنامه در مخزن جدا و خصوصی است.\n\n- بدون سرور: ثبت‌نام/ورود محلی (فقط روی همان مرورگر)، ورود مهمان، فروش، فاکتور، گزارش و کار آفلاین.\n- ویژگی‌های وابسته به سرور (QR دریافت فایل، همگام‌سازی، اطلاعیه و تیکت) تا وقتی \`apiBaseUrl\` در \`config.js\` تنظیم نشود غیرفعال‌اند.\n\nاین فایل‌ها خودکار تولید می‌شوند (\`node scripts/make-site.mjs\`)؛ مستقیم ویرایششان نکنید.\n`);
console.log(`site → ${out} (v${ver}, ${fs.readdirSync(out).length} entries)`);
