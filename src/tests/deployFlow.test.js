// منطق استقرار/بازگشت (server/deploy/deploy.sh, rollback.sh, backup.sh, restore.sh, monitor.sh) با «Docker و PostgreSQL ساختگی».
// ⚠️ این تست فقط منطق اسکریپت‌ها را می‌سنجد (ترتیب مراحل، تأیید مهاجرت، پشتیبان اجباری، بازگشت خودکار، رد بستهٔ مخدوش).
// اجرای واقعی Docker/PostgreSQL/Caddy فقط روی یک سرور واقعی ممکن است و اینجا ادعایی دربارهٔ آن نمی‌شود.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, copyFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const has = (c) => spawnSync("bash", ["-c", `command -v ${c}`]).status === 0;
const SKIP = !(has("rsync") && has("gpg") && has("flock") && has("tar"));

const STUB_DOCKER = `#!/bin/sh
echo "docker $*" >> "$FAKE/docker.log"
tag() { sed -n 's/^CAFINO_API_TAG=//p' "$FAKE/srv/server/.env"; }
case "$1" in
  info|image|rmi) exit 0;;
  load) cat >/dev/null; exit 0;;
  run) case "$*" in *"--entrypoint cat"*) cat "$FAKE/migsql" 2>/dev/null;; *"--entrypoint ls"*) cat "$FAKE/basemigs";; esac; exit 0;;
  compose) shift
    case "$1" in
      ps) echo cid;;
      up) case " $* " in *" api "*) t="$(tag)"; [ -f "$FAKE/migs/$t" ] && { cat "$FAKE/dbmigs" "$FAKE/migs/$t" | sort -u > "$FAKE/dbmigs.n"; mv "$FAKE/dbmigs.n" "$FAKE/dbmigs"; };; esac; exit 0;;
      exec) case "$*" in *readyz*) t="$(tag)"; if grep -qx "$t" "$FAKE/bad" 2>/dev/null; then echo '{"ok":false}'; else echo "{\\"ok\\":true,\\"version\\":\\"$(cat "$FAKE/tagver/$t")\\",\\"migrations\\":$(wc -l < "$FAKE/dbmigs" | tr -d ' ')}"; fi;; esac; exit 0;;
    esac;;
esac
exit 0
`;
const STUBS = {
  docker: STUB_DOCKER,
  curl: "#!/bin/sh\nexit 0\n",
  psql: '#!/bin/sh\ncase "$*" in *schema_migrations*) cat "$FAKE/dbmigs";; esac\n',
  pg_dump: "#!/bin/sh\necho FAKEDUMP; head -c 400 /dev/urandom | base64\n",
  pg_restore: '#!/bin/sh\ncase "$1" in --list) cat >/dev/null; i=0; while [ $i -lt 20 ]; do echo "1; 1 2 TABLE DATA public t$i x"; i=$((i+1)); done;; *) cat >/dev/null;; esac\n',
};

function mkEnv() {
  const d = mkdtempSync(join(tmpdir(), "cafino-dep-"));
  for (const p of ["bin", "srv/server/deploy", "srv/dist/pwa", "bk", "up", "tagver", "migs"]) mkdirSync(join(d, p), { recursive: true });
  for (const [n, c] of Object.entries(STUBS)) { writeFileSync(join(d, "bin", n), c); chmodSync(join(d, "bin", n), 0o755); }
  for (const f of readdirSync(join(root, "server/deploy"))) if (/\.(sh|conf|js)$/.test(f)) copyFileSync(join(root, "server/deploy", f), join(d, "srv/server/deploy", f));
  copyFileSync(join(root, "server/docker-compose.yml"), join(d, "srv/server/docker-compose.yml"));
  writeFileSync(join(d, "srv/server/.env"), "CAFINO_ENV=production\nWEB_PORT=8080\nCAFINO_API_TAG=local\nJWT_SECRET=topsecret-value\n");
  writeFileSync(join(d, "srv/dist/pwa/index.html"), "OLD-PWA");
  writeFileSync(join(d, "pass"), "test-passphrase\n"); chmodSync(join(d, "pass"), 0o600);
  writeFileSync(join(d, "basemigs"), "001_init.sql\n002_a.sql\n"); writeFileSync(join(d, "dbmigs"), "001_init.sql\n002_a.sql\n");
  writeFileSync(join(d, "tagver/local"), "1.0.0\n"); writeFileSync(join(d, "migsql"), "ALTER TABLE x ADD COLUMN y int;\n");
  return d;
}
function mkBundle(d, { id, ver, migs, pwa = "NEW-PWA", mutate }) {
  const b = join(d, "bundle-" + id); rmSync(b, { recursive: true, force: true });
  mkdirSync(join(b, "pwa"), { recursive: true }); mkdirSync(join(b, "server/deploy"), { recursive: true });
  writeFileSync(join(b, "RELEASE_ID"), id + "\n"); writeFileSync(join(b, "VERSION"), ver + "\n"); writeFileSync(join(b, "GIT_SHA"), "x\n");
  writeFileSync(join(b, "MIGRATIONS"), migs.join("\n") + "\n"); writeFileSync(join(b, "pwa/index.html"), pwa);
  copyFileSync(join(root, "server/docker-compose.yml"), join(b, "server/docker-compose.yml"));
  writeFileSync(join(b, "server/deploy/nginx.conf"), "# nginx " + id + "\n");
  spawnSync("bash", ["-c", `echo fakeimage | gzip > api-image.tar.gz`], { cwd: b });
  spawnSync("bash", ["-c", `find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256`], { cwd: b });
  if (mutate) mutate(b);
  const out = join(d, `release-${id}.tar.gz`); spawnSync("tar", ["-czf", out, "-C", b, "."]);
  writeFileSync(join(d, "tagver", id), ver + "\n"); writeFileSync(join(d, "migs", id), migs.join("\n") + "\n");
  return out;
}
const run = (d, script, args = [], extra = {}) => spawnSync("sh", [join(d, "srv/server/deploy", script), ...args], {
  encoding: "utf8",
  env: { PATH: `${join(d, "bin")}:${process.env.PATH}`, FAKE: d, DB_EXEC: "", BACKUP_DIR: join(d, "bk"), BACKUP_PASS_FILE: join(d, "pass"), NOTIFY_ENV: join(d, "none"), UPLOADS_DIR: join(d, "up"),
    CAFINO_DIR: join(d, "srv/server"), UPLOADS_BACKUP: "off", READY_TRIES: "2", READY_SLEEP: "0", STATE_DIR: join(d, "state"), ...extra },
});
const env = (d) => readFileSync(join(d, "srv/server/.env"), "utf8");
const state = (d, k) => readFileSync(join(d, "srv/.deploy-state", k), "utf8").trim();
const MIGS1 = ["001_init.sql", "002_a.sql"], MIGS2 = [...MIGS1, "003_new.sql"];

test("deploy --plan: چیزی تغییر نمی‌کند و مهاجرت‌های در انتظار گزارش می‌شود", { skip: SKIP }, () => {
  const d = mkEnv(); const b = mkBundle(d, { id: "1.1.0-aaaaaaa", ver: "1.1.0", migs: MIGS2 });
  const r = run(d, "deploy.sh", ["--bundle", b, "--plan"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /PLAN release=1\.1\.0-aaaaaaa .*pending_migrations=003_new\.sql/);
  assert.match(env(d), /CAFINO_API_TAG=local/); assert.equal(readFileSync(join(d, "srv/dist/pwa/index.html"), "utf8"), "OLD-PWA");
  assert.ok(!existsSync(join(d, "srv/.deploy-state/current")));
});
test("مهاجرت در انتظار بدون تأیید → کد ۳، پشتیبان نمی‌گیرد و چیزی عوض نمی‌شود", { skip: SKIP }, () => {
  const d = mkEnv(); const b = mkBundle(d, { id: "1.1.0-aaaaaaa", ver: "1.1.0", migs: MIGS2 });
  const r = run(d, "deploy.sh", ["--bundle", b]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(env(d), /CAFINO_API_TAG=local/); assert.equal(readFileSync(join(d, "srv/dist/pwa/index.html"), "utf8"), "OLD-PWA");
  assert.equal(readdirSync(join(d, "bk")).filter((f) => f.startsWith("cafino-")).length, 0, "قبل از تأیید نباید پشتیبان/تغییری باشد");
});
test("استقرار موفق: پشتیبان رمزنگاری‌شده، سوییچ برچسب ایمیج، فایل‌ها، رازهای .env دست‌نخورده، state و baseline", { skip: SKIP }, () => {
  const d = mkEnv(); const b = mkBundle(d, { id: "1.1.0-aaaaaaa", ver: "1.1.0", migs: MIGS2 });
  const r = run(d, "deploy.sh", ["--bundle", b, "--approve-migrations"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(env(d), /CAFINO_API_TAG=1\.1\.0-aaaaaaa/); assert.match(env(d), /JWT_SECRET=topsecret-value/);
  assert.equal(readFileSync(join(d, "srv/dist/pwa/index.html"), "utf8"), "NEW-PWA");
  assert.match(readFileSync(join(d, "srv/server/deploy/nginx.conf"), "utf8"), /# nginx 1\.1\.0-aaaaaaa/);
  assert.equal(state(d, "current"), "1.1.0-aaaaaaa"); assert.match(state(d, "previous"), /^baseline-/);
  const bk = readdirSync(join(d, "bk")); assert.ok(bk.some((f) => /\.dump\.gpg$/.test(f)), "پشتیبان دیتابیس رمزنگاری‌شده"); assert.ok(!bk.some((f) => /\.dump$/.test(f)), "نسخهٔ ساده نباید بماند");
  assert.ok(bk.some((f) => /config\.tar\.gz\.gpg$/.test(f)));
  for (const f of bk) if (f.endsWith(".gpg") || f.endsWith(".dump")) assert.ok(!readFileSync(join(d, "bk", f)).includes("topsecret-value"), "راز در متن ساده");
  const log = readFileSync(join(d, "docker.log"), "utf8");
  assert.match(log, /compose up -d --no-build --no-deps --wait .* api/); assert.ok(!/compose down|-v\b|volume rm/.test(log), "هرگز down -v");
  assert.ok(!/compose up[^\n]* db/.test(log), "دیتابیس نباید دست بخورد");
});
test("سلامت پس از استقرار ناموفق → بازگشت خودکار به نسخهٔ قبل (کد ۱)", { skip: SKIP }, () => {
  const d = mkEnv(); const ok = mkBundle(d, { id: "1.1.0-aaaaaaa", ver: "1.1.0", migs: MIGS2, pwa: "PWA-110" });
  assert.equal(run(d, "deploy.sh", ["--bundle", ok, "--approve-migrations"]).status, 0);
  const bad = mkBundle(d, { id: "1.2.0-bbbbbbb", ver: "1.2.0", migs: MIGS2, pwa: "PWA-120" });
  writeFileSync(join(d, "bad"), "1.2.0-bbbbbbb\n");
  const r = run(d, "deploy.sh", ["--bundle", bad]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(env(d), /CAFINO_API_TAG=1\.1\.0-aaaaaaa/);
  assert.equal(readFileSync(join(d, "srv/dist/pwa/index.html"), "utf8"), "PWA-110");
  assert.equal(state(d, "current"), "1.1.0-aaaaaaa");
  assert.match(readFileSync(join(d, "srv/.deploy-state/history.log"), "utf8"), /FAILED health/);
});
test("rollback.sh دستی: به نسخهٔ قبلی؛ و اگر دیتابیس مهاجرت جدیدتری دارد بدون --force-code-only رد می‌شود", { skip: SKIP }, () => {
  const d = mkEnv();
  assert.equal(run(d, "deploy.sh", ["--bundle", mkBundle(d, { id: "1.1.0-aaaaaaa", ver: "1.1.0", migs: MIGS1, pwa: "PWA-110" })]).status, 0);
  assert.equal(run(d, "deploy.sh", ["--bundle", mkBundle(d, { id: "1.2.0-bbbbbbb", ver: "1.2.0", migs: MIGS2, pwa: "PWA-120" }), "--approve-migrations"]).status, 0);
  assert.equal(state(d, "current"), "1.2.0-bbbbbbb");
  const refused = run(d, "rollback.sh", ["--yes"]);
  assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /003_new\.sql/);
  assert.equal(state(d, "current"), "1.2.0-bbbbbbb");
  const r = run(d, "rollback.sh", ["--yes", "--force-code-only"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(env(d), /CAFINO_API_TAG=1\.1\.0-aaaaaaa/); assert.equal(readFileSync(join(d, "srv/dist/pwa/index.html"), "utf8"), "PWA-110");
  assert.equal(state(d, "current"), "1.1.0-aaaaaaa");
});
test("بستهٔ مخدوش/خطرناک رد می‌شود (MANIFEST، لینک نمادین، مسیر ..، فایل اضافه) و چیزی تغییر نمی‌کند", { skip: SKIP }, () => {
  const d = mkEnv();
  const tampered = mkBundle(d, { id: "1.3.0-ccccccc", ver: "1.3.0", migs: MIGS1, mutate: (b) => writeFileSync(join(b, "pwa/index.html"), "EVIL") });
  assert.equal(run(d, "deploy.sh", ["--bundle", tampered]).status, 2);
  const extra = mkBundle(d, { id: "1.3.1-ddddddd", ver: "1.3.1", migs: MIGS1, mutate: (b) => writeFileSync(join(b, "pwa/extra.js"), "x") });
  assert.equal(run(d, "deploy.sh", ["--bundle", extra]).status, 2);
  const sym = mkBundle(d, { id: "1.3.2-eeeeeee", ver: "1.3.2", migs: MIGS1, mutate: (b) => spawnSync("ln", ["-s", "/etc/passwd", join(b, "pwa/link")]) });
  assert.equal(run(d, "deploy.sh", ["--bundle", sym]).status, 2);
  const t = join(d, "t"); mkdirSync(join(t, "a"), { recursive: true }); writeFileSync(join(t, "a/f"), "x");
  spawnSync("tar", ["-czf", join(d, "trav.tar.gz"), "--transform", "s|^a|../../evil|", "-C", t, "a"]);
  assert.equal(run(d, "deploy.sh", ["--bundle", join(d, "trav.tar.gz")]).status, 2);
  assert.equal(readFileSync(join(d, "srv/dist/pwa/index.html"), "utf8"), "OLD-PWA"); assert.match(env(d), /CAFINO_API_TAG=local/);
});
test("--skip-backup روی production ممنوع است", { skip: SKIP }, () => {
  const d = mkEnv(); const b = mkBundle(d, { id: "1.1.0-aaaaaaa", ver: "1.1.0", migs: MIGS1 });
  const r = run(d, "deploy.sh", ["--bundle", b, "--skip-backup"]);
  assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /فقط روی staging/);
});
test("پشتیبان‌گیری ناموفق → استقرار متوقف (کد ۴) و چیزی تغییر نمی‌کند", { skip: SKIP }, () => {
  const d = mkEnv(); const b = mkBundle(d, { id: "1.1.0-aaaaaaa", ver: "1.1.0", migs: MIGS1 });
  writeFileSync(join(d, "bin/pg_dump"), "#!/bin/sh\nexit 1\n"); chmodSync(join(d, "bin/pg_dump"), 0o755);
  const r = run(d, "deploy.sh", ["--bundle", b]);
  assert.equal(r.status, 4, r.stdout + r.stderr);
  assert.match(env(d), /CAFINO_API_TAG=local/); assert.equal(readFileSync(join(d, "srv/dist/pwa/index.html"), "utf8"), "OLD-PWA");
});
test("backup/restore: رمزنگاری، sha256، نگهداری روزانه/هفتگی، بازیابی config و تمرین بازیابی (psql ساختگی)", { skip: SKIP }, () => {
  const d = mkEnv(); writeFileSync(join(d, "up/a.txt"), "x");
  const b = run(d, "backup.sh", [], { UPLOADS_BACKUP: "daily" });
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const files = readdirSync(join(d, "bk")); const dump = files.find((f) => f.endsWith(".dump.gpg"));
  assert.ok(dump && files.some((f) => f.endsWith(".uploads.tar.gz.gpg")) && files.some((f) => f.endsWith(".manifest")) && existsSync(join(d, "bk/LAST_OK")));
  assert.match(readFileSync(join(d, "bk", files.find((f) => f.endsWith(".manifest"))), "utf8"), /encryption=gpg-pass/);
  const c = run(d, "restore.sh", ["--config", join(d, "bk", files.find((f) => f.endsWith(".config.tar.gz.gpg"))), join(d, "cfg")]);
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.match(readFileSync(spawnSync("find", [join(d, "cfg"), "-name", ".env"], { encoding: "utf8" }).stdout.trim(), "utf8"), /JWT_SECRET=topsecret-value/);
  writeFileSync(join(d, "bk", dump), "corrupted");   // sha256 باید خرابی را بگیرد
  const bad = run(d, "restore.sh", ["--latest"]); assert.notEqual(bad.status, 0); assert.match(bad.stdout + bad.stderr, /SHA-256/);
  // نگهداری: قدیمی‌های غیرهفتگی/غیرماهانه پاک می‌شوند، یکشنبه‌ها و روز اول ماه می‌مانند
  for (const s of ["2026-01-07", "2026-01-04", "2026-01-01"]) writeFileSync(join(d, "bk", `cafino-${s}-030000.dump.gpg`), "x");
  run(d, "backup.sh", [], { KEEP_MIN: "1", KEEP_DAYS: "14", KEEP_WEEKS: "2000", KEEP_MONTHS: "2000" });
  const left = readdirSync(join(d, "bk")).filter((f) => f.endsWith(".dump.gpg"));
  assert.ok(!left.some((f) => f.includes("2026-01-07")), "چهارشنبه قدیمی باید پاک شود"); assert.ok(left.some((f) => f.includes("2026-01-04")), "یکشنبه می‌ماند"); assert.ok(left.some((f) => f.includes("2026-01-01")), "روز اول ماه می‌ماند");
});
test("backup: بدون رمزنگاری، OFFSITE رد و تنظیمات ذخیره نمی‌شود", { skip: SKIP }, () => {
  const d = mkEnv();
  const r = run(d, "backup.sh", [], { BACKUP_PASS_FILE: join(d, "nope"), OFFSITE_CMD: "echo offsite" });
  assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /بدون رمزنگاری/);
  assert.ok(!readdirSync(join(d, "bk")).some((f) => f.includes("config")), "config ساده نباید نوشته شود");
});
test("monitor.sh فقط هنگام تغییر وضعیت اعلان می‌دهد (بدون هشدار تکراری)", { skip: SKIP }, () => {
  const d = mkEnv(); const hook = join(d, "notified"); writeFileSync(join(d, "none"), `NOTIFY_WEBHOOK_URL=http://x/hook\n`);
  writeFileSync(join(d, "bin/curl"), `#!/bin/sh\ncase "$*" in *hook*) echo hit >> "${hook}";; *) exit 22;; esac\n`); chmodSync(join(d, "bin/curl"), 0o755);
  run(d, "monitor.sh", [], { BACKUP_DIR: join(d, "bk-none") }); const n1 = existsSync(hook) ? readFileSync(hook, "utf8").split("\n").length : 0;
  run(d, "monitor.sh", [], { BACKUP_DIR: join(d, "bk-none") }); const n2 = existsSync(hook) ? readFileSync(hook, "utf8").split("\n").length : 0;
  assert.ok(n1 >= 2, "اولین مشکل باید اعلان شود"); assert.equal(n2, n1, "اعلان تکراری نباید بیاید");
});
