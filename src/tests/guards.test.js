// تست‌های محافظ (regression) روی کل سورس: جلوی بازگشت باگ‌هایی که در بازبینی کد گزارش شده بود را می‌گیرد.
//  ۱) localStorage.setItem همیشه (کلید، مقدار) دارد — مثل باگ قدیمی saveUsers
//  ۲) شناسهٔ موجودیت‌ها از Date.now()/Math.random() ساخته نمی‌شود؛ باید createId()/uid() باشد
//  ۳) رمز عبور محلی PBKDF2 است و SHA-256 ساده فقط برای تأیید/ارتقای رمزهای قدیمی می‌ماند
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
function walk(d, out = []) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name === "tests" || f.name === ".build" || f.name === "node_modules") continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(js|jsx)$/.test(f.name)) out.push(p);
  }
  return out;
}
const FILES = walk(ROOT).map((p) => ({ p: path.relative(ROOT, p), s: fs.readFileSync(p, "utf8") }));

// تعداد آرگومان‌های سطح‌بالای یک فراخوانی که پرانتز بازش در idx است
function topLevelArgs(s, open) {
  let depth = 0, args = 1, str = null, i = open;
  for (; i < s.length; i++) {
    const c = s[i];
    if (str) { if (c === "\\") i++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { depth--; if (depth === 0) return args; }
    else if (c === "," && depth === 1) args++;
  }
  return -1;
}

test("هر setItem(...) دو آرگومان دارد (کلید و مقدار)", () => {
  const bad = [];
  for (const { p, s } of FILES) {
    for (const m of s.matchAll(/\.setItem\(/g)) {
      const n = topLevelArgs(s, m.index + m[0].length - 1);
      if (n !== 2) bad.push(`${p}:${s.slice(0, m.index).split("\n").length} (${n} آرگومان)`);
    }
  }
  assert.deepEqual(bad, []);
});

test("saveUsers با کلید cafenet_users می‌نویسد", () => {
  const f = FILES.find((x) => x.p.endsWith("services/auth/localAuth.js"));
  assert.ok(f, "localAuth.js پیدا نشد");
  assert.match(f.s, /USERS_KEY\s*=\s*["']cafenet_users["']/);
  assert.match(f.s, /function saveUsers\([^)]*\)\s*\{[^}]*setItem\(\s*USERS_KEY\s*,\s*JSON\.stringify/);
});

test("شناسهٔ موجودیت‌ها با Date.now()/Math.random() ساخته نمی‌شود", () => {
  // استثناهای آگاهانه: شناسهٔ عکس فایل‌ها (ph_…)، timestamp ها، ضربان قفل sync
  const ALLOW = [/ph_\$\{/, /exp:\s*Date\.now\(\)/, /\bts:\s*Date\.now\(\)/, /\bat:\s*Date\.now\(\)/, /Id:\s*tabId/];
  const bad = [];
  for (const { p, s } of FILES) {
    if (/(^|\/)(uid|ids|crypto)\.js$/.test(p)) continue;
    s.split("\n").forEach((line, i) => {
      if (!/\b[iI]d\s*[:=]/.test(line) || !/Date\.now\(\)|Math\.random\(\)/.test(line)) return;
      // فقط وقتی خودِ id از آن ساخته می‌شود، نه فیلد دیگری در همان خط
      const idPart = line.split(/\b[iI]d\s*[:=]/).slice(1).join("=").split(/[,;}]/)[0];
      if (!/Date\.now\(\)|Math\.random\(\)/.test(idPart)) return;
      if (ALLOW.some((r) => r.test(line))) return;
      bad.push(`${p}:${i + 1}: ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("ورود محلی PBKDF2 است و SHA-256 ساده فقط برای رمزهای قدیمی است", () => {
  const f = FILES.find((x) => x.p.endsWith("services/auth/localAuth.js"));
  assert.match(f.s, /PBKDF2/);
  assert.match(f.s, /600000|600_000/);
  // هش جدید هرگز sha256 ساده نیست
  assert.doesNotMatch(f.s, /async function hashPassword[\s\S]{0,400}sha256Hex\(/);
});

test("ثبت رویداد حساس همیشه با audit() است و logActivity برای آن‌ها استفاده نمی‌شود", () => {
  const SENSITIVE = /logActivity\(\s*["'`](ابطال|حذف مشتری|بازیابی از بکاپ|تغییر رمز|بخشودگی|تغییر موجودی|تغییر قیمت)/;
  const bad = FILES.filter((f) => SENSITIVE.test(f.s)).map((f) => f.p);
  assert.deepEqual(bad, []);
});

// v1.74: initializer های useState نباید اثر جانبی (نوشتن/پاک‌کردن storage) داشته باشند — در StrictMode دوبار اجرا می‌شوند
test("useState initializer: بدون removeItem/setItem/lsWrite و بدون takeSearchFocus", async () => {
  const fsm = await import("node:fs"); const pathm = await import("node:path");
  const files = []; const walk = (d) => { for (const n of fsm.readdirSync(d)) { const f = pathm.join(d, n); if (fsm.statSync(f).isDirectory()) { if (!/tests|\.build|node_modules/.test(n)) walk(f); } else if (/\.jsx$/.test(n)) files.push(f); } };
  walk(new URL("../", import.meta.url).pathname);
  const offenders = [];
  for (const f of files) {
    const src = fsm.readFileSync(f, "utf8");
    for (const m of src.matchAll(/useState\(\s*\(\)\s*=>[^;\n]*?(removeItem|setItem|lsWrite|takeSearchFocus)\s*\(/g)) offenders.push(pathm.basename(f) + ": " + m[1]);
  }
  assert.deepEqual(offenders, []);
});
