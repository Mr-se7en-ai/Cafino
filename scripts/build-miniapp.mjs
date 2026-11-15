// ساخت بستهٔ مینی‌اپ تلگرام → server/src/assets/miniapp/{app.js,app.css} (خروجی در مخزن می‌ماند تا Docker فقط server/src را کپی کند)
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "server/src/assets/miniapp");
await build({
  entryPoints: { app: path.join(root, "src/miniapp/main.jsx") }, outdir: out, bundle: true, minify: true, format: "iife", target: ["es2020"],
  jsx: "automatic", loader: { ".js": "jsx" }, define: { "process.env.NODE_ENV": '"production"' }, legalComments: "none", logLevel: "warning",
});
// app.css را esbuild همراه entry نمی‌سازد (CSS import نشده)؛ ورودی جدا
await build({ entryPoints: { app: path.join(root, "src/miniapp/app.css") }, outdir: out, bundle: false, minify: true, logLevel: "warning", allowOverwrite: true });
console.log("miniapp built →", path.relative(root, out));
