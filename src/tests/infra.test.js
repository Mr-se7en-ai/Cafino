// زیرساخت/استقرار: ایمنی ورودی ci-entry و harden، سازگاری فایل‌ها و جلوگیری از خطاهای خطرناک (down -v، ufw reset، رازهای واقعی در مخزن).
// ⚠️ فقط منطق و ساختار را می‌سنجد؛ اجرای واقعی روی سرور Ubuntu/Docker/GitHub Actions اینجا انجام نمی‌شود.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const R = (p) => readFileSync(join(root, p), "utf8");
const DEPLOY = join(root, "server/deploy");
const shScripts = readdirSync(DEPLOY).filter((f) => f.endsWith(".sh"));

test("همهٔ اسکریپت‌های server/deploy و scripts/make-release.sh نحو درست دارند", () => {
  for (const f of shScripts) assert.equal(spawnSync(f === "install.sh" || f === "harden.sh" ? "bash" : "sh", ["-n", join(DEPLOY, f)]).status, 0, f);
  assert.equal(spawnSync("bash", ["-n", join(root, "scripts/make-release.sh")]).status, 0);
});
test("شلچک: بدون هشدار (اگر shellcheck نصب است)", { skip: spawnSync("bash", ["-c", "command -v shellcheck"]).status !== 0 }, () => {
  for (const f of shScripts) {
    const shell = f === "install.sh" || f === "harden.sh" ? "bash" : "sh";
    const r = spawnSync("shellcheck", ["-S", "warning", "-s", shell, join(DEPLOY, f)], { encoding: "utf8" });
    assert.equal(r.status, 0, f + "\n" + r.stdout);
  }
  const m = spawnSync("shellcheck", ["-S", "warning", join(root, "scripts/make-release.sh")], { encoding: "utf8" }); assert.equal(m.status, 0, m.stdout);
});
test("اسکریپت‌های استقرار هرگز down -v، volume rm، ufw reset یا prune حجم‌ها را نمی‌زنند (ufw.sh قدیمی مستثنی است و مستندش هشدار می‌دهد)", () => {
  for (const f of shScripts.filter((x) => x !== "ufw.sh")) {
    const t = R("server/deploy/" + f).split("\n").filter((l) => !l.trim().startsWith("#") && !/^\s*(die|warn|log|ok|echo|printf)\b/.test(l)).join("\n");   // پیام‌های راهنما برای کاربر مستثنی‌اند
    assert.ok(!/compose\s+down\b[^\n]*(-v|--volumes)/.test(t), f + ": down -v");
    assert.ok(!/volume\s+(rm|prune)|system\s+prune[^\n]*--volumes/.test(t), f + ": حذف volume");
    assert.ok(!/ufw\s+(--force\s+)?reset/.test(t), f + ": ufw reset");
    assert.ok(!/DROP\s+DATABASE\s+(?!IF EXISTS\s+\$SCR)/i.test(t.replace(/DROP DATABASE IF EXISTS \$SCR/g, "")), f + ": DROP DATABASE");
  }
});
test("رازهای واقعی در فایل‌های زیرساخت/workflow/مستند نیست (کلید خصوصی، توکن GitHub/بله/تلگرام، گذرواژه‌های ثابت)", () => {
  const files = [...shScripts.map((f) => "server/deploy/" + f), "server/docker-compose.yml", "server/.env.example", "scripts/make-release.sh", ...readdirSync(join(root, ".github/workflows")).map((f) => ".github/workflows/" + f), "DEPLOYMENT_FA.md"].filter((f) => existsSync(join(root, f)));
  for (const f of files) {
    const t = R(f);
    assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t), f + ": کلید خصوصی");
    assert.ok(!/gh[pousr]_[A-Za-z0-9]{30,}/.test(t), f + ": توکن GitHub");
    assert.ok(!/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/.test(t), f + ": توکن ربات");
    assert.ok(!/AKIA[0-9A-Z]{16}/.test(t), f + ": کلید AWS");
  }
});
test("compose: API با برچسب قابل‌تغییر، nginx پس از سلامت API، هیچ پورت دیتابیس/API منتشر نمی‌شود، کاربر غیر root، فایل‌سیستم فقط‌خواندنی", () => {
  const c = R("server/docker-compose.yml");
  assert.match(c, /image: cafino-api:\$\{CAFINO_API_TAG:-local\}/);
  assert.match(c, /web:[\s\S]*depends_on: \{ api: \{ condition: service_healthy \} \}/);
  assert.ok(!/\n\s+- "?\d+:5432|5432:5432|"?8080:8080/.test(c), "پورت دیتابیس/API منتشر شده");
  assert.match(c, /read_only: true/); assert.match(c, /cap_drop: \[ALL\]/); assert.match(R("server/Dockerfile"), /USER cafino/);
  assert.match(c, /image: postgres:16-alpine/); assert.match(c, /dbdata:\/var\/lib\/postgresql\/data/);
});
test("ci-entry: فرمان‌های تزریقی/ناشناخته/محیط نامعتبر رد می‌شوند و فرمان معتبر به deploy.sh می‌رسد", () => {
  const d = mkdtempSync(join(tmpdir(), "cafino-ci-"));
  mkdirSync(join(d, "prod/server/deploy"), { recursive: true }); mkdirSync(join(d, "bin"));
  writeFileSync(join(d, "bin/sudo"), '#!/bin/sh\n[ "$1" = "-n" ] && shift\necho "SUDO $*" >> "$LOGF"; exit 0\n'); chmodSync(join(d, "bin/sudo"), 0o755);
  const base = { PATH: `${join(d, "bin")}:${process.env.PATH}`, LOGF: join(d, "log"), CI_PRODUCTION_DIR: join(d, "prod"), CI_STAGING_DIR: join(d, "none"), CI_SPOOL: join(d, "spool"), CI_ENV_FILE: "/nonexistent" };
  const call = (cmd, input = "") => spawnSync("sh", [join(DEPLOY, "ci-entry.sh")], { encoding: "utf8", input, env: { ...base, SSH_ORIGINAL_COMMAND: cmd } });
  const sha = (s) => spawnSync("sha256sum", { input: s, encoding: "utf8" }).stdout.split(" ")[0];
  for (const bad of ["", "bash", "deploy production; rm -rf /", "deploy production $(id)", "deploy production `id`", "deploy production a|b", "deploy\nproduction", "deploy prod x", "status ../../etc", "rm -rf /", "deploy production " + "a".repeat(64) + " --evil"]) {
    const r = call(bad); assert.notEqual(r.status, 0, JSON.stringify(bad));
  }
  assert.ok(!existsSync(join(d, "log")), "هیچ فرمان نامعتبری نباید به sudo برسد");
  assert.notEqual(call("deploy staging " + "a".repeat(64), "x").status, 0, "staging نصب‌نشده");
  const bundle = "fake-bundle-bytes";
  assert.notEqual(call("deploy production " + "0".repeat(64), bundle).status, 0, "sha256 نادرست");
  assert.ok(!existsSync(join(d, "log")));
  const okr = call("deploy production " + sha(bundle) + " approve-migrations", bundle);
  assert.equal(okr.status, 0, okr.stderr);
  assert.match(readFileSync(join(d, "log"), "utf8"), /SUDO .*prod\/server\/deploy\/deploy\.sh --bundle .*bundle-\d+\.tar\.gz --approve-migrations/);
  assert.equal(readdirSync(join(d, "spool")).length, 0, "فایل موقت باید پاک شود");
  assert.equal(call("plan production " + sha(bundle), bundle).status, 0); assert.match(readFileSync(join(d, "log"), "utf8"), /--plan/);
  assert.equal(call("rollback production").status, 0); assert.match(readFileSync(join(d, "log"), "utf8"), /rollback\.sh --yes/);
});
test("harden.sh --dry-run: چیزی تغییر نمی‌دهد؛ کلید/نام نامعتبر و بستن رمز بدون کلید رد می‌شود", () => {
  const K = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFA cafino-ci";
  const h = (...a) => spawnSync("bash", [join(DEPLOY, "harden.sh"), "--dry-run", ...a], { encoding: "utf8" });
  const ok = h("--ci-key", K, "--admin-user", "hamed", "--admin-key", K, "--disable-password-login");
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /PasswordAuthentication no/); assert.match(ok.stdout, /ufw limit 22\/tcp/); assert.ok(!/ufw reset/.test(ok.stdout));
  for (const bad of [["--ci-key", 'command="rm -rf /" ' + K], ["--ci-key", K + "\nssh-rsa AAAA"], ["--ci-key", "from=1.1.1.1 " + K], ["--admin-user", "Root;x", "--admin-key", K]]) assert.notEqual(h(...bad).status, 0, JSON.stringify(bad));
  const lock = h("--disable-password-login"); if (!existsSync("/root/.ssh/authorized_keys")) { assert.notEqual(lock.status, 0); assert.match(lock.stderr, /قفل/); }
});
test("نسخه‌ها: package.json، server، و make-release همخوان؛ .env.example شامل متغیرهای استقرار", () => {
  assert.equal(JSON.parse(R("package.json")).version, JSON.parse(R("server/package.json")).version);
  const e = R("server/.env.example"); for (const k of ["CAFINO_API_TAG", "CAFINO_ENV", "COMPOSE_PROJECT_NAME"]) assert.ok(e.includes(k), k + " در .env.example نیست");
});
test("workflowها: CI بدون Secret، استقرار فقط با DEPLOY_ENABLED و تأیید production، SSH با کلید سرور تأییدشده، هم‌زمانی کنترل‌شده", () => {
  const ci = R(".github/workflows/ci.yml"), dep = R(".github/workflows/deploy.yml"), act = R(".github/actions/deploy-bundle/action.yml"), rb = R(".github/workflows/rollback.yml"), dk = R(".github/workflows/desktop-release.yml");
  assert.ok(!/secrets\./.test(ci), "CI نباید Secret بخواند (PR از fork ایمن بماند)");
  for (const k of ["npm ci", "version:check", "npm test", "audit-gate", "npm run build", "verify:dist", "make-release.sh", "test-on-postgres"]) assert.ok(ci.includes(k), "ci.yml: " + k);
  assert.match(ci, /pull_request:[\s\S]*push:\s*\n\s*branches: \[main\]/);
  assert.match(dep, /DEPLOY_ENABLED/); assert.match(dep, /environment: production/); assert.match(dep, /environment: staging/);
  assert.match(dep, /group: deploy-production, cancel-in-progress: false/); assert.match(dep, /needs: \[gate, staging\]/);
  assert.match(dep, /grep -qP '\^main\\tpush\\tsuccess\\t\.github\/workflows\/ci\\\.yml'/, "فقط Artifact یک CI موفق main");
  for (const t of [act, rb]) { assert.match(t, /StrictHostKeyChecking=yes/); assert.ok(!/ssh-keyscan/.test(t), "ssh-keyscan ممنوع (اثر انگشت باید از قبل تأیید شده باشد)"); assert.ok(!/StrictHostKeyChecking=no/.test(t)); }
  assert.match(act, /approve-migrations/); assert.match(act, /exit 3/); assert.match(act, /BatchMode=yes/);
  for (const t of [ci, dep, act, rb, dk]) { assert.ok(!/docker compose down|\bdown -v\b/.test(t)); assert.ok(!/(echo|printf)[^\n]*\$\{\{\s*secrets\./.test(t), "Secret نباید echo شود"); }
  assert.match(dk, /windows-2022/); assert.match(dk, /--win nsis --x64/); assert.match(dk, /contents: write/); assert.equal((dk.match(/contents: write/g) || []).length, 1, "فقط job انتشار اجازهٔ نوشتن دارد");
  assert.match(dk, /gh release (create|upload)/); assert.ok(!/--clobber[^\n]*delete|gh release delete/.test(dk), "نسخه‌های قدیمی Release نباید پاک شوند");
});
test("DEPLOYMENT_FA.md: ۱۶ بخش به ترتیب، و هر اسکریپت/workflow که نام می‌برد واقعاً وجود دارد", () => {
  const t = R("DEPLOYMENT_FA.md");
  const heads = [...t.matchAll(/^## ([۰-۹]+)\) (.+)$/gm)].map((m) => m[2]);
  assert.equal(heads.length, 16, heads.join(" | "));
  const want = ["مشخصات سرور", "خرید و آماده‌سازی", "SSH", "GitHub Secrets", "Docker", "دامنه", "DNS", "SSL", "نصب و اجرای اولیه", "مهاجرت", "CI/CD", "اولین انتشار", "سلامت", "پشتیبان", "بازگشت", "عیب‌یابی"];
  want.forEach((w, i) => assert.ok(heads[i].includes(w), `بخش ${i + 1} «${heads[i]}» باید «${w}» باشد`));
  for (const f of new Set([...t.matchAll(/(?:server\/deploy|scripts|\.github\/workflows|\.github\/actions\/deploy-bundle)\/[A-Za-z0-9_.-]+\.(?:sh|mjs|yml)/g)].map((m) => m[0]))) assert.ok(existsSync(join(root, f)), `${f} در مستند هست ولی در مخزن نیست`);
  for (const w of ["دسترس", "صفر-قطعی", "xlsx", "نشده است"]) assert.ok(t.includes(w), "بخش صداقت/محدودیت: " + w);
  assert.ok(/اجرا نشده است/.test(t), "باید صریحاً بگوید روی سرور واقعی اجرا نشده");
});
