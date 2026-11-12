// cafenet-standalone.html: نسخهٔ تک‌فایلی (فونت‌ها و chunk ها درون‌خطی) از همان خروجی بیلد — جایگزین اسکریپت دستی بیرون از مخزن.
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");
const R = (p) => path.join(ROOT, p), rd = (p) => fs.readFileSync(R(p), "utf8");
const safe = (x) => x.replace(/<\/(script)/gi, "<\\/$1");
let html = rd("index.html");
let n = 0;
html = html.replace(/url\('\.\/fonts\/([A-Za-z-]+\.woff2)'\)/g, (_, f) => { n++; return `url('data:font/woff2;base64,${fs.readFileSync(R("fonts/" + f)).toString("base64")}')`; });
if (n !== 4) throw new Error(`انتظار ۴ فونت درون‌خطی، ${n} یافت شد`);
const man = JSON.parse(rd("chunks/manifest.json"));
const chunks = Object.entries(man).filter(([k]) => k !== "xlsxworker").map(([k, v]) => `<script type="text/plain" id="cf-chunk-${k}">${safe(rd(v))}</script>\n`).join("");
const a = '<script src="config.js"></script>', b = '<script src="bundle.js" onerror="window.__cfBundleErr=1"></script>';
if (!html.includes(a) || !html.includes(b)) throw new Error("نشانگرهای config.js/bundle.js در index.html پیدا نشد");
html = html.replace(a, () => "<script>\n" + safe(rd("config.js")) + "\n</script>\n" + chunks).replace(b, () => "<script>" + safe(rd("bundle.js")) + "</script>");
fs.writeFileSync(R("cafenet-standalone.html"), html);
console.log("cafenet-standalone.html", (html.length / 1048576).toFixed(2), "MB");
