// اسکریپت نصب یک‌دستوری Ubuntu (server/deploy/install.sh): نحو، حالت dry-run، اعتبارسنجی ورودی، و ایمنی تکرار (رازها عوض نشوند).
// نصب واقعی نیاز به Ubuntu + Docker + دامنه دارد و اینجا اجرا نمی‌شود.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, copyFileSync, readFileSync as rf, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const INSTALL = join(root, "server/deploy/install.sh");
const UPDATE = join(root, "server/deploy/update.sh");
const has = (cmd) => spawnSync("bash", ["-c", `command -v ${cmd}`]).status === 0;
const sh = (args, opts = {}) => spawnSync("bash", args, { encoding: "utf8", input: "", ...opts });
const lib = (script) => sh(["-c", `set -e; CAFINO_INSTALL_SOURCE_ONLY=1 source "${INSTALL}"; set +e; ${script}`]);

test("install.sh/update.sh: نحو درست (bash -n)", () => {
  for (const f of [INSTALL, UPDATE]) assert.equal(sh(["-n", f]).status, 0, f);
});
test("--help کامل و بدون تغییر در سیستم", () => {
  const r = sh([INSTALL, "--help"]);
  assert.equal(r.status, 0);
  for (const k of ["--domain", "--admin-email", "--no-tls", "--dry-run", "--telegram-api-base", "--update"]) assert.ok(r.stdout.includes(k), k);
});
test("--dry-run: طرح را نشان می‌دهد و موفق برمی‌گردد", () => {
  const r = sh([INSTALL, "--dry-run", "--domain", "Cafino.Example.ir", "--admin-email", "me@example.com", "--with-clamav", "--telegram-api-base", "https://tg.example.ir"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cafino\.example\.ir/);       // دامنه کوچک‌حرف می‌شود
  assert.match(r.stdout, /ClamAV:\s+بله/);
});
test("بدون دامنه (و بدون --no-tls) یا با ایمیل/دامنهٔ نامعتبر متوقف می‌شود", () => {
  assert.notEqual(sh([INSTALL, "--dry-run", "-y", "--admin-email", "a@b.co"]).status, 0);
  assert.notEqual(sh([INSTALL, "--dry-run", "--no-tls", "--admin-email", "bad"]).status, 0);
  assert.notEqual(sh([INSTALL, "--dry-run", "--domain", "bad_domain", "--admin-email", "a@b.co"]).status, 0);
  assert.notEqual(sh([INSTALL, "--dry-run", "--no-tls", "--admin-email", "a@b.co", "--nope"]).status, 0);
  assert.equal(sh([INSTALL, "--dry-run", "--no-tls", "--admin-email", "a@b.co"]).status, 0);
});
test("رازهای موجود .env هرگز بازتولید نمی‌شوند؛ مقدار نمونهٔ change-me جایگزین می‌شود", () => {
  const d = mkdtempSync(join(tmpdir(), "cafino-env-"));
  copyFileSync(join(root, "server/.env.example"), join(d, "env"));
  const r = lib(`ENV_FILE="${d}/env"
    ensure_secret JWT_SECRET rand_hex 48; a=$(get_env JWT_SECRET)
    ensure_secret JWT_SECRET rand_hex 48 && echo REGEN; b=$(get_env JWT_SECRET)
    [ "$a" = "$b" ] && [ \${#a} -eq 96 ] && echo STABLE
    set_env PUBLIC_BASE_URL https://x.ir; set_env PUBLIC_BASE_URL https://y.ir
    grep -c '^PUBLIC_BASE_URL=https://y.ir$' "$ENV_FILE"`);
  assert.ok(r.stdout.includes("STABLE") && !r.stdout.includes("REGEN"), r.stdout + r.stderr);
  assert.equal(r.stdout.trim().split("\n").pop(), "1");   // set_env تکراری نمی‌سازد
  const env = rf(join(d, "env"), "utf8");
  assert.equal((env.match(/^PUBLIC_BASE_URL=/gm) || []).length, 1);
});
test("رمز تولیدی مدیر قوی است و اعتبارسنجی دامنه/ایمیل درست کار می‌کند", () => {
  const r = lib(`for i in 1 2 3 4 5; do gen_password; echo; done; valid_domain a.b.ir && echo D1; valid_domain a_b.ir || echo D0; valid_email x@y.co && echo E1`);
  const pws = r.stdout.split("\n").slice(0, 5);
  for (const p of pws) assert.match(p, /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z0-9]{20}$/);
  assert.ok(r.stdout.includes("D1") && r.stdout.includes("D0") && r.stdout.includes("E1"));
});
test("پیکربندی Caddy/override تولیدی: دامنه، HSTS، پراکسی مورد اعتماد؛ بدون TLS و بدون دامنه هم معتبر", () => {
  const d = mkdtempSync(join(tmpdir(), "cafino-loc-"));
  const r = lib(`SRV="${d}" LOCAL_DIR="${d}/local" DOMAIN=cafino.example.ir EMAIL=a@b.co NO_PROXY=0 NO_TLS=0; write_local_files >/dev/null; cat "$LOCAL_DIR/Caddyfile"`);
  assert.match(r.stdout, /^\{\n\temail a@b\.co\n\}\ncafino\.example\.ir \{/);
  assert.match(r.stdout, /Strict-Transport-Security/);
  assert.match(r.stdout, /reverse_proxy web:80/);
  const ov = rf(join(d, "docker-compose.override.yml"), "utf8");
  assert.match(ov, /caddy:2-alpine/); assert.match(ov, /"80:80", "443:443"/); assert.match(ov, /trusted-proxies\.conf:\/etc\/nginx\/trusted-proxies\.conf/);
  assert.match(rf(join(d, "local/trusted-proxies.conf"), "utf8"), /set_real_ip_from 172\.16\.0\.0\/12;/);
  const r2 = lib(`SRV="${d}" LOCAL_DIR="${d}/local" NO_PROXY=0 NO_TLS=1; write_local_files >/dev/null; cat "$LOCAL_DIR/Caddyfile"`);
  assert.match(r2.stdout, /auto_https off/);
  lib(`SRV="${d}" LOCAL_DIR="${d}/local" NO_PROXY=1; write_local_files >/dev/null`);
  assert.throws(() => rf(join(d, "docker-compose.override.yml")), /ENOENT/);   // --no-proxy: override حذف می‌شود
});
test("override تولیدی با docker compose config معتبر است (اگر docker CLI هست)", { skip: !has("docker") }, () => {
  const d = mkdtempSync(join(tmpdir(), "cafino-cfg-"));
  copyFileSync(join(root, "server/docker-compose.yml"), join(d, "docker-compose.yml"));
  writeFileSync(join(d, ".env"), "JWT_SECRET=x\nPOSTGRES_PASSWORD=aaaaaaaaaaaaaaaaaaaa\nAPP_DB_PASSWORD=bbbbbbbbbbbbbbbbbbbb\n");
  spawnSync("mkdir", ["-p", join(d, "deploy")]);
  for (const f of ["nginx.conf", "csp.conf", "trusted-proxies.conf", "config.js"]) { try { copyFileSync(join(root, "server/deploy", f), join(d, "deploy", f)); } catch { /* اختیاری */ } }
  lib(`SRV="${d}" LOCAL_DIR="${d}/deploy/local" DOMAIN=cafino.example.ir NO_PROXY=0 NO_TLS=0; write_local_files >/dev/null`);
  const r = spawnSync("docker", ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.override.yml", "config", "--quiet"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
test("nginx: مینی‌اپ /m به API وصل است (و پیشوند /manifest را نمی‌گیرد)", () => {
  const n = readFileSync(join(root, "server/deploy/nginx.conf"), "utf8");
  assert.match(n, /location = \/m \{[^}]*proxy_pass http:\/\/api:8080/);
  assert.match(n, /location \/m\/ \{[^}]*proxy_pass http:\/\/api:8080/s);
  assert.ok(!/location \/m \{/.test(n), "location /m (پیشوندی) نباید باشد");
});
test("حالت‌های خطرناک: دایرکتوری/فایل‌های محلی در .gitignore هستند و install.sh فایروال را reset نمی‌کند", () => {
  const g = readFileSync(join(root, ".gitignore"), "utf8");
  for (const k of ["server/.env", "server/deploy/local/", "server/docker-compose.override.yml"]) assert.ok(g.includes(k), k);
  assert.ok(!/ufw (--force )?reset/.test(readFileSync(INSTALL, "utf8")));
});
