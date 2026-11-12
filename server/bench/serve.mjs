// سرور واقعی (HTTP) روی PostgreSQL با دیتاست بزرگ، برای بنچمارک بار با k6.
// node bench/serve.mjs --upto 004|"" --cache 0|15000 --scale 1 --port 3911 --creds /tmp/creds.json --samples /tmp/samples.jsonl
import fs from "node:fs";
import { startDb, stopDb } from "../test/helpers.js";
import { loadConfig } from "../src/config.js";
import { createPool, migrate } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { seed } from "./seed.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const upto = arg("upto", ""), cache = arg("cache", "15000"), scale = Number(arg("scale", "1")), port = Number(arg("port", "3911"));
const credsFile = arg("creds", "/tmp/bench-creds.json"), samplesFile = arg("samples", "/tmp/bench-samples.jsonl");

const url = await startDb();
const cfg = loadConfig({ DATABASE_URL: url, JWT_SECRET: "x".repeat(48), NODE_ENV: "test", ALLOW_REGISTRATION: "true", AUTH_RATE_LIMIT_MAX: "100000", RATE_LIMIT_MAX: "1000000", REPORT_CACHE_TTL_MS: cache });
const pool = createPool(cfg);
await migrate(pool, () => {}, { upTo: upto });
const app = await buildApp(cfg, { pool, logger: false }); await app.ready();
const PW = "رمز-خیلی-قوی-۱۲۳", email = "bench@cafe.test";
const reg = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email, password: PW, firstName: "ب", lastName: "ن", phone: "09121234567", shopName: "بنچ" } });
const cafeId = JSON.parse(reg.body).data.user.branchId;
const t0 = Date.now(); const info = await seed(pool, { scale, mainCafeId: cafeId });
fs.writeFileSync(credsFile, JSON.stringify({ email, password: PW, cafeId, counts: info.counts, seedMs: Date.now() - t0, upto: upto || "all", cache }));
await app.listen({ port, host: "127.0.0.1" });
console.log("READY", port, JSON.stringify(info.counts));

// نمونه‌برداری منابع هر ثانیه: CPU/RAM فرایند Node + مجموع فرایندهای postgres، وضعیت Pool و اتصال‌های PostgreSQL
const clk = 100; const PAGE = 4096;
// /proc/<pid>/stat: پس از «(comm) » فیلد اول = state(3) → ppid=idx1 … utime(14)=idx11 ، stime(15)=idx12 ، rss(24)=idx21 (در صفحه)
const procs = () => { const o = { node: { t: 0, rss: 0 }, pg: { t: 0, rss: 0 }, k6: { t: 0, rss: 0 } };
  for (const d of fs.readdirSync("/proc")) { if (!/^\d+$/.test(d)) continue; try { const st = fs.readFileSync(`/proc/${d}/stat`, "utf8"); const rp = st.lastIndexOf(")"); const comm = st.slice(st.indexOf("(") + 1, rp); const f = st.slice(rp + 2).split(" "); const t = +f[11] + +f[12], rss = +f[21] * PAGE;
    const k = d === String(process.pid) ? "node" : comm === "postgres" ? "pg" : comm === "k6" ? "k6" : null; if (k) { o[k].t += t; o[k].rss += rss; } } catch { /* ended */ } } return o; };
let prev = procs(), prevAt = Date.now();
const timer = setInterval(async () => {
  const cur = procs(), now = Date.now(), dt = (now - prevAt) / 1000, pct = (k) => +((cur[k].t - prev[k].t) / clk / dt * 100).toFixed(1);
  let conns = null; try { conns = (await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database()")).rows[0].n; } catch { /* busy */ }
  fs.appendFileSync(samplesFile, JSON.stringify({ at: now, nodeCpuPct: pct("node"), pgCpuPct: pct("pg"), k6CpuPct: pct("k6"), nodeRssMB: Math.round(cur.node.rss / 1048576), pgRssMB: Math.round(cur.pg.rss / 1048576), pgConns: conns, poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount }) + "\n");
  prev = cur; prevAt = now;
}, 1000);
const stop = async () => { clearInterval(timer); await app.close(); await pool.end(); await stopDb(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
