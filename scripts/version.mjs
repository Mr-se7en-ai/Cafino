// یک منبع حقیقت برای نسخه: src/app/core/version.js (APP_VERSION). همهٔ جاهای دیگر باید همان باشند.
//   node scripts/version.mjs check          → خطا اگر نسخه یا الزام Node جایی ناهماهنگ باشد
//   node scripts/version.mjs set 1.75.0     → همهٔ فایل‌ها را یک‌جا به‌روز می‌کند (package.json و lock ها، sw.js)
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");
const R = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(R(p), "utf8");
const readJson = (p) => JSON.parse(read(p));
export const NODE_RANGE = ">=22.12.0";              // الزام یکسان Node برای همهٔ اجزا (برنامه، API، Electron، push-server)؛ ایمیج Docker هم node:22
const PKGS = ["package.json", "server/package.json", "el/electron-app/package.json", "push-server/package.json"];
const LOCKS = ["package-lock.json", "server/package-lock.json", "el/electron-app/package-lock.json", "push-server/package-lock.json"];

export function appVersion() { const m = read("src/app/core/version.js").match(/APP_VERSION\s*=\s*"([^"]+)"/); if (!m) throw new Error("APP_VERSION پیدا نشد"); return m[1]; }
export function check({ quiet = false } = {}) {
  const v = appVersion(), bad = [];
  for (const p of PKGS) { if (!fs.existsSync(R(p))) continue; const j = readJson(p); if (j.version !== v) bad.push(`${p}: version ${j.version} ≠ ${v}`); if (j.engines?.node !== NODE_RANGE) bad.push(`${p}: engines.node «${j.engines?.node}» ≠ «${NODE_RANGE}»`); }
  for (const p of LOCKS) { if (!fs.existsSync(R(p))) continue; const j = readJson(p); if (j.version !== v) bad.push(`${p}: version ${j.version} ≠ ${v}`); if (j.packages?.[""] && j.packages[""].version !== v) bad.push(`${p}: packages[""].version ${j.packages[""].version} ≠ ${v}`); }
  const sw = read("pwa/sw.js").match(/const VERSION = "([^"]*)";/)?.[1]; if (sw !== v) bad.push(`pwa/sw.js: VERSION ${sw} ≠ ${v}`);
  const df = read("server/Dockerfile"); if (!/FROM node:22\b/.test(df)) bad.push("server/Dockerfile: ایمیج پایه node:22 نیست");
  if (fs.existsSync(R(".nvmrc")) && !/^22/.test(read(".nvmrc").trim())) bad.push(".nvmrc با Node 22 هم‌خوان نیست");
  if (bad.length) { if (!quiet) console.error("ناهماهنگی نسخه/Node:\n  " + bad.join("\n  ")); return { ok: false, version: v, bad }; }
  if (!quiet) console.log(`نسخه و الزام Node همه‌جا یکی است: ${v} / node ${NODE_RANGE}`);
  return { ok: true, version: v, bad };
}
function set(v) {
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error("نسخه باید x.y.z باشد");
  fs.writeFileSync(R("src/app/core/version.js"), read("src/app/core/version.js").replace(/(APP_VERSION\s*=\s*")[^"]+(")/, `$1${v}$2`));
  fs.writeFileSync(R("pwa/sw.js"), read("pwa/sw.js").replace(/const VERSION = "[^"]*";/, `const VERSION = "${v}";`));
  const upd = (p, fn) => { if (!fs.existsSync(R(p))) return; const j = readJson(p); fn(j); fs.writeFileSync(R(p), JSON.stringify(j, null, 2) + "\n"); };
  for (const p of PKGS) upd(p, (j) => { j.version = v; j.engines = { ...(j.engines || {}), node: NODE_RANGE }; });
  for (const p of LOCKS) upd(p, (j) => { j.version = v; if (j.packages?.[""]) j.packages[""].version = v; if (j.packages?.[""]?.engines) j.packages[""].engines.node = NODE_RANGE; });
  console.log("نسخه روی", v, "تنظیم شد"); check();
}
if (process.argv[1] === import.meta.filename) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "set") set(arg); else if (cmd === "check") process.exit(check().ok ? 0 : 1); else { console.error("استفاده: version.mjs check | set x.y.z"); process.exit(2); }
}
