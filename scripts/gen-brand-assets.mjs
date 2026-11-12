// brand/icon.svg و brand/logo.svg را به یک ماژول JS تبدیل می‌کند تا لوگو داخل بسته باشد (بدون درخواست شبکه، سازگار با CSP).
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const rd = (f) => fs.readFileSync(path.join(root, "brand", f), "utf8").trim();
const ink = "#2b1610";
const wordmark = rd("logo.svg").replaceAll(`fill="${ink}"`, 'fill="currentColor"');   // رنگ متن با رنگ اطراف عوض می‌شود (تم تیره/روشن)
const icon = rd("icon.svg");
const out = `// تولیدشده با scripts/gen-brand-assets.mjs از brand/ — دستی ویرایش نکنید.
export const ICON_SVG = ${JSON.stringify(icon)};
export const WORDMARK_SVG = ${JSON.stringify(wordmark)};
export const WORDMARK_RATIO = ${(6884 / 2530).toFixed(4)};
export const ICON_DATA_URI = "data:image/svg+xml;base64," + (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(ICON_SVG))) : Buffer.from(ICON_SVG).toString("base64"));
`;
fs.writeFileSync(path.join(root, "src/app/components/brandAssets.js"), out);
console.log("brandAssets.js ساخته شد");
