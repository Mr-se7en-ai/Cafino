// PostgreSQL واقعی برای تست: اگر TEST_DATABASE_URL باشد از همان استفاده می‌شود، وگرنه embedded-postgres بالا می‌آید.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig } from "../src/config.js";
import { createPool, migrate } from "../src/db.js";
import { buildApp } from "../src/app.js";

let stop = async () => {};
// پورت تصادفیِ واقعاً آزاد (برخورد با خوشهٔ یتیمِ اجرای قبلی یا سرویس دیگر، پیش‌تر before-hook را از کار می‌انداخت)
async function freePort() {
  const net = await import("node:net");
  for (let i = 0; i < 50; i++) {
    const port = 54000 + Math.floor(Math.random() * 900);
    const ok = await new Promise((res) => { const s = net.createServer(); s.once("error", () => res(false)); s.listen(port, "127.0.0.1", () => s.close(() => res(true))); });
    if (ok) return port;
  }
  throw new Error("پورت آزاد برای PostgreSQL آزمایشی پیدا نشد");
}
export async function startDb() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cafino-pg-"));
  const port = await freePort();
  // postgres با کاربر root اجرا نمی‌شود؛ در محیط‌هایی که تست‌ها با root اجرا می‌شوند پوشه را به کاربر postgres می‌دهیم
  let user; try { if (process.getuid?.() === 0) { execFileSync("chown", ["-R", "postgres", dir]); fs.chmodSync(dir, 0o755); user = true; } } catch { /* ignore */ }
  void user;
  const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, "data"), user: "cafino", password: "cafino", port, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase("cafino_test");
  stop = async () => { try { await pg.stop(); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
  return `postgres://cafino:cafino@localhost:${port}/cafino_test`;
}
export const stopDb = () => stop();

export async function makeApp(databaseUrl, overrides = {}) {
  const cfg = { ...loadConfig({ DATABASE_URL: databaseUrl, JWT_SECRET: "x".repeat(48), NODE_ENV: "test", ALLOW_REGISTRATION: "true", AUTH_RATE_LIMIT_MAX: "1000", CAPTCHA_AFTER_FAILS: "0", RATE_LIMIT_MAX: "100000", ...overrides.env }), ...overrides.cfg };
  const pool = createPool(cfg);
  await migrate(pool);
  const app = await buildApp(cfg, { pool, logger: false });
  await app.ready();
  return { app, pool, cfg };
}

// نشست‌دار: کوکی‌ها را نگه می‌دارد (مثل مرورگر) و Bearer را هم پشتیبانی می‌کند
export function client(app, { origin } = {}) {
  const jar = new Map();
  const call = async (method, url, { body, headers = {}, bearer, raw } = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await app.inject({ method, url, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(origin ? { origin } : {}), ...headers }, payload: body === undefined ? undefined : (raw ? body : JSON.stringify(body)) });
    for (const c of [].concat(res.headers["set-cookie"] || [])) { const [kv] = c.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c) || v === "") jar.delete(k); else jar.set(k, v); }
    let json = null; try { json = res.body ? JSON.parse(res.body) : null; } catch { /* ignore */ }
    return { status: res.statusCode, json, data: json?.data, headers: res.headers, jar };
  };
  return { call, jar, get: (u, o) => call("GET", u, o), post: (u, body, o) => call("POST", u, { ...o, body }), patch: (u, body, o) => call("PATCH", u, { ...o, body }), del: (u, o) => call("DELETE", u, o) };
}
