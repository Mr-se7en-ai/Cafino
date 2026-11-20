// دروازهٔ امنیتی وابستگی‌ها برای CI: آسیب‌پذیری‌های «تولیدی» (--omit=dev) در سطح high و بالاتر باعث شکست می‌شوند، مگر اینکه در
// .github/audit-allowlist.json با دلیل و تاریخ انقضا استثنا شده باشند. استثنای منقضی‌شده یا بی‌استفاده هم خطا/هشدار است.
//   node scripts/audit-gate.mjs [پوشه‌ها…=. server el/electron-app]   (متغیر AUDIT_LEVEL=high|moderate|critical)
// ⚠️ npm audit به شبکه (registry) نیاز دارد؛ اگر در دسترس نبود، دروازه «شکست» می‌خورد (سکوت = ناامن).
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const ROOT = path.resolve(import.meta.dirname, "..");

/** audit: خروجی JSON «npm audit»؛ allow: آرایهٔ {id,package,reason,expires}. */
export function evaluate(audit, allow = [], { level = "high", now = new Date() } = {}) {
  const min = RANK[level] ?? 3, blocked = [], allowed = [], expired = [], used = new Set();
  const byId = new Map(allow.map((a) => [a.id, a]));
  for (const [name, v] of Object.entries(audit?.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via !== "object") continue;                                   // «via: نام بستهٔ دیگر» = وابستگی انتقالی؛ مورد اصلی جداگانه می‌آید
      if ((RANK[via.severity] ?? 0) < min) continue;
      const id = String(via.url ?? "").split("/").pop();
      const rule = byId.get(id);
      const item = { package: name, id, severity: via.severity, title: via.title };
      if (!rule) { blocked.push(item); continue; }
      used.add(id);
      if (new Date(rule.expires) < now) expired.push({ ...item, expires: rule.expires });
      else allowed.push({ ...item, reason: rule.reason, expires: rule.expires });
    }
  }
  const unused = allow.filter((a) => !used.has(a.id)).map((a) => a.id);
  return { ok: blocked.length === 0 && expired.length === 0, blocked, expired, allowed, unused };
}

function main() {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : [".", "server", "el/electron-app"];
  const level = process.env.AUDIT_LEVEL || "high";
  const allow = JSON.parse(readFileSync(path.join(ROOT, ".github/audit-allowlist.json"), "utf8")).allow;
  let bad = 0;
  for (const d of dirs) {
    const cwd = path.join(ROOT, d); if (!existsSync(path.join(cwd, "package-lock.json"))) continue;
    const r = spawnSync("npm", ["audit", "--omit=dev", "--json"], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    let j; try { j = JSON.parse(r.stdout); } catch { console.error(`✗ ${d}: خروجی npm audit خوانده نشد (شبکه/registry؟)\n${(r.stderr || "").slice(0, 400)}`); bad++; continue; }
    if (j.error) { console.error(`✗ ${d}: npm audit خطا داد: ${j.error.summary || j.error.code}`); bad++; continue; }
    const res = evaluate(j, allow, { level });
    console.log(`${res.ok ? "✓" : "✗"} ${d}: مسدودکننده=${res.blocked.length} استثنای‌مجاز=${res.allowed.length} منقضی=${res.expired.length}`);
    for (const x of res.blocked) console.log(`   ✗ ${x.package} ${x.id} [${x.severity}] ${x.title}`);
    for (const x of res.expired) console.log(`   ✗ استثنای منقضی‌شده (${x.expires}): ${x.package} ${x.id} — بازبینی کنید`);
    for (const x of res.allowed) console.log(`   ~ مجاز تا ${x.expires}: ${x.package} ${x.id} (${x.title})`);
    if (!res.ok) bad++;
  }
  if (bad) { console.error(`\nدروازهٔ امنیتی وابستگی‌ها ناموفق در ${bad} پوشه`); process.exit(1); }
  console.log("\nدروازهٔ امنیتی وابستگی‌ها: موفق");
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main();
