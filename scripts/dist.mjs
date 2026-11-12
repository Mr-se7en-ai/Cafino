// خروجی یکپارچهٔ انتشار:  dist/{pwa/, electron/, manifest.json}
//   node scripts/dist.mjs build    → از خروجی build.sh، dist/ را می‌سازد و بلافاصله verify می‌کند (شکست = کد خروج ≠ ۰ و dist ناقص باقی نمی‌ماند)
//   node scripts/dist.mjs verify   → فایل‌ها را در برابر manifest.json بازبینی می‌کند (وجود، اندازه، SHA-256، اضافه‌ها، نسخه‌ها، برابریِ PWA و Electron)
// مستقل از محل نصب: همهٔ مسیرها نسبت به ریشهٔ مخزن‌اند.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { check as checkVersions, appVersion, NODE_RANGE } from "./version.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = process.env.CAFINO_DIST ? path.resolve(process.env.CAFINO_DIST) : path.join(ROOT, "dist");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const EL_SRC = ["el/electron-app", "electron-app/electron-app", "electron-app"].map((p) => path.join(ROOT, p)).find((p) => fs.existsSync(path.join(p, "main.js")) && fs.existsSync(path.join(p, "package.json")));
// فایل‌های مشترکِ PWA و Electron که باید «بایت‌به‌بایت یکی» باشند. index.html عمداً فرق دارد (PWA: manifest/آیکن/نوار نصب) و جدا بررسی می‌شود.
const SHARED = (list) => list.filter((f) => f === "bundle.js" || f.startsWith("chunks/") || f.startsWith("fonts/") || f.startsWith("brand/") || f === "LICENSE-glasswork.txt");

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".DS_Store") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base)); else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join("/"));
    else throw new Error(`فایل غیرعادی (لینک/سوکت) در خروجی انتشار مجاز نیست: ${p}`);
  }
  return out.sort();
}
function copyDir(src, dst, skip = () => false) {
  for (const f of walk(src)) { if (skip(f)) continue; fs.mkdirSync(path.dirname(path.join(dst, f)), { recursive: true }); fs.copyFileSync(path.join(src, f), path.join(dst, f)); }
}
const describe = (dir) => walk(dir).map((f) => { const b = fs.readFileSync(path.join(dir, f)); return { path: f, size: b.length, sha256: sha(b) }; });

function build() {
  const v = checkVersions(); if (!v.ok) throw new Error("نسخه‌ها هم‌خوان نیستند؛ ابتدا scripts/version.mjs set");
  if (!EL_SRC) throw new Error("پوشهٔ برنامهٔ Electron پیدا نشد");
  for (const f of ["bundle.js", "chunks/manifest.json", "pwa/sw.js", "pwa/index.html"]) if (!fs.existsSync(path.join(ROOT, f))) throw new Error(`${f} نیست؛ ابتدا build.sh`);
  const tmp = DIST + ".tmp-" + process.pid; fs.rmSync(tmp, { recursive: true, force: true });
  try {
    copyDir(path.join(ROOT, "pwa"), path.join(tmp, "pwa"));
    copyDir(EL_SRC, path.join(tmp, "electron"), (f) => /^(dist|release|out)\//.test(f));    // node_modules بالا کنار گذاشته می‌شود؛ در dist/electron با «npm ci» نصب می‌شود
    const pwa = describe(path.join(tmp, "pwa")), el = describe(path.join(tmp, "electron"));
    const manifest = {
      name: "cafino", version: v.version, node: NODE_RANGE, electron: JSON.parse(fs.readFileSync(path.join(EL_SRC, "package.json"), "utf8")).devDependencies?.electron,
      builtAt: new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000 || Date.now()).toISOString(),
      targets: { pwa: { dir: "pwa", files: pwa }, electron: { dir: "electron", files: el } },
    };
    fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
    const r = verify(tmp); if (!r.ok) throw new Error("راستی‌آزمایی dist شکست خورد:\n  " + r.bad.join("\n  "));
    fs.rmSync(DIST, { recursive: true, force: true }); fs.renameSync(tmp, DIST);
    console.log(`dist/ ساخته و تأیید شد: v${v.version} — pwa ${pwa.length} فایل، electron ${el.length} فایل، manifest.json`);
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
}

export function verify(dir = DIST) {
  const bad = [];
  const mf = path.join(dir, "manifest.json");
  if (!fs.existsSync(mf)) return { ok: false, bad: ["manifest.json نیست"] };
  const m = JSON.parse(fs.readFileSync(mf, "utf8"));
  const ver = appVersion();
  if (m.version !== ver) bad.push(`manifest.version ${m.version} ≠ APP_VERSION ${ver}`);
  if (m.node !== NODE_RANGE) bad.push(`manifest.node ${m.node} ≠ ${NODE_RANGE}`);
  for (const [name, t] of Object.entries(m.targets)) {
    const base = path.join(dir, t.dir), declared = new Map(t.files.map((f) => [f.path, f]));
    for (const f of t.files) {
      const p = path.join(base, f.path);
      let b; try { b = fs.readFileSync(p); } catch { bad.push(`${name}/${f.path}: وجود ندارد`); continue; }
      if (!b.length && !/\.(txt|md)$/.test(f.path)) bad.push(`${name}/${f.path}: خالی`);
      if (b.length !== f.size) bad.push(`${name}/${f.path}: اندازه ${b.length} ≠ ${f.size}`);
      else if (sha(b) !== f.sha256) bad.push(`${name}/${f.path}: SHA-256 نمی‌خواند (فایل تغییر کرده/خراب است)`);
    }
    for (const f of walk(base)) if (!declared.has(f)) bad.push(`${name}/${f}: در manifest نیست (فایل اضافه)`);
  }
  const P = new Map(m.targets.pwa.files.map((f) => [f.path, f])), E = new Map(m.targets.electron.files.filter((f) => f.path.startsWith("app/")).map((f) => [f.path.slice(4), f]));
  // PWA ⇔ Electron: فایل‌های مشترک دقیقاً یکی (هم مجموعه، هم هش)
  const sp = SHARED([...P.keys()]), se = SHARED([...E.keys()]);
  for (const f of sp) if (!E.has(f)) bad.push(`electron/app/${f}: در PWA هست ولی در Electron نیست`); else if (E.get(f).sha256 !== P.get(f).sha256) bad.push(`${f}: PWA و Electron یکی نیستند`);
  for (const f of se) if (!P.has(f)) bad.push(`pwa/${f}: در Electron هست ولی در PWA نیست`);
  // Service Worker: نسخه + همهٔ فایل‌های precache واقعاً در dist/pwa هستند
  const sw = fs.readFileSync(path.join(dir, "pwa/sw.js"), "utf8");
  if (!sw.includes(`const VERSION = "${ver}"`)) bad.push(`pwa/sw.js: VERSION ≠ ${ver}`);
  const list = [...(((sw.match(/const CORE = \[([\s\S]*?)\];/) || [])[1] || "") + "," + ((sw.match(/const CHUNKS = \[([^\]]*)\]/) || [])[1] || "")).matchAll(/"\.\/([^"]+)"/g)].map((x) => x[1]).filter(Boolean);
  if (!list.length) bad.push("pwa/sw.js: فهرست precache خالی/ناخوانا");
  for (const f of list) if (!P.has(f)) bad.push(`sw precache: ${f} در dist/pwa نیست`);
  // chunk ها: هر فایل vendor-*.js در dist/pwa/chunks و dist/electron/app/chunks هست و دقیقاً همان‌هاست که سرویس‌ورکر precache می‌کند
  const swChunks = [...((sw.match(/const CHUNKS = \[([^\]]*)\]/) || [])[1] || "").matchAll(/"\.\/([^"]+)"/g)].map((x) => x[1]);
  const actual = [...P.keys()].filter((f) => /^chunks\/vendor-.*\.js$/.test(f)).sort();
  if (JSON.stringify([...swChunks].sort()) !== JSON.stringify(actual)) bad.push(`chunk ها با فهرست سرویس‌ورکر نمی‌خوانند: sw=${swChunks.length} dist=${actual.length}`);
  for (const f of swChunks) if (!E.has(f)) bad.push(`chunk ${f} در dist/electron/app نیست`);
  // Electron: بسته‌ی قابل ساخت
  const ep = JSON.parse(fs.readFileSync(path.join(dir, "electron/package.json"), "utf8"));
  if (ep.version !== ver) bad.push(`electron/package.json: ${ep.version} ≠ ${ver}`);
  for (const f of ["main.js", "preload.js", "package-lock.json", "app/index.html", "app/bundle.js"]) if (!fs.existsSync(path.join(dir, "electron", f))) bad.push(`electron/${f} نیست`);
  // index.html هر دو به bundle.js و config.js اشاره می‌کنند و فایلشان هست
  for (const [name, base] of [["pwa", "pwa"], ["electron", "electron/app"]]) {
    const html = fs.readFileSync(path.join(dir, base, "index.html"), "utf8");
    for (const f of [...html.matchAll(/(?:src|href)="\.?\/?([^"#?:]+\.(?:js|css|webmanifest|png|svg|woff2))"/g)].map((x) => x[1])) if (!fs.existsSync(path.join(dir, base, f))) bad.push(`${name}/index.html به ${f} اشاره می‌کند ولی فایل نیست`);
  }
  return { ok: bad.length === 0, bad, version: m.version };
}

if (process.argv[1] === import.meta.filename) {
  const cmd = process.argv[2];
  try {
    if (cmd === "build") build();
    else if (cmd === "verify") { const r = verify(); if (!r.ok) { console.error("dist نامعتبر:\n  " + r.bad.join("\n  ")); process.exit(1); } console.log(`dist معتبر است: v${r.version}`); }
    else { console.error("استفاده: dist.mjs build | verify"); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
