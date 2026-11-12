// راستی‌آزمایی خروجی انتشار (dist/): نمونهٔ سالم می‌گذرد و هر دست‌کاری/ناقصی گرفته می‌شود.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ready = ["bundle.js", "pwa/sw.js", "chunks/manifest.json"].every((f) => fs.existsSync(path.join(ROOT, f)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cafino-dist-"));
const run = (cmd, dist) => { try { return { code: 0, out: execFileSync("node", ["scripts/dist.mjs", cmd], { cwd: ROOT, env: { ...process.env, CAFINO_DIST: dist }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { code: e.status, out: String(e.stderr) + String(e.stdout) }; } };
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });
const opts = { skip: !ready && "نیازمند خروجی build.sh" };

test("dist: build سالم → verify موفق", opts, () => {
  const d = path.join(tmp, "ok"); const b = run("build", d); assert.equal(b.code, 0, b.out);
  assert.equal(run("verify", d).code, 0);
  const m = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8"));
  assert.ok(m.targets.pwa.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)) && m.targets.electron.files.length > 5);
  fs.cpSync(d, path.join(tmp, "good"), { recursive: true });
});

const tamper = (name, fn, expect) => test(`dist: ${name} → رد می‌شود`, opts, () => {
  const d = path.join(tmp, name.replace(/\W+/g, "_")); copy(path.join(tmp, "good"), d); fn(d);
  const r = run("verify", d); assert.notEqual(r.code, 0, "باید شکست بخورد"); assert.match(r.out, expect, r.out.slice(0, 400));
});
tamper("تغییر یک بایت در bundle PWA", (d) => { const p = path.join(d, "pwa/bundle.js"); const b = fs.readFileSync(p); b[1000] ^= 1; fs.writeFileSync(p, b); }, /SHA-256|یکی نیستند/);
tamper("حذف یک chunk", (d) => { const f = fs.readdirSync(path.join(d, "pwa/chunks")).find((x) => x.startsWith("vendor-xlsx.")); fs.rmSync(path.join(d, "pwa/chunks", f)); }, /وجود ندارد/);
tamper("فایل اضافه در PWA", (d) => fs.writeFileSync(path.join(d, "pwa/evil.js"), "x"), /فایل اضافه/);
tamper("اختلاف PWA و Electron (هر دو با manifest سازگار)", (d) => {
  const mp = path.join(d, "manifest.json"), m = JSON.parse(fs.readFileSync(mp, "utf8"));
  const p = path.join(d, "electron/app/bundle.js"); fs.appendFileSync(p, "\n//x"); const b = fs.readFileSync(p);
  const e = m.targets.electron.files.find((f) => f.path === "app/bundle.js"); e.size = b.length; e.sha256 = require_sha(b); fs.writeFileSync(mp, JSON.stringify(m));
}, /PWA و Electron یکی نیستند/);
tamper("نسخهٔ package.json الکترون متفاوت", (d) => { const p = path.join(d, "electron/package.json"); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/"version": "[^"]+"/, '"version": "0.0.1"')); }, /SHA-256|0\.0\.1/);
tamper("نسخهٔ manifest متفاوت", (d) => { const p = path.join(d, "manifest.json"); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/"version": "[^"]+"/, '"version": "9.9.9"')); }, /manifest\.version/);
tamper("حذف manifest", (d) => fs.rmSync(path.join(d, "manifest.json")), /manifest\.json نیست/);

import { createHash } from "node:crypto";
function require_sha(b) { return createHash("sha256").update(b).digest("hex"); }
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
