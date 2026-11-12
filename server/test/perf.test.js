// کارایی/درستی صفحه‌بندی کلیدی و حافظهٔ نهان گزارش (رفتار؛ نه زمان). زمان‌ها در bench/ اندازه‌گیری می‌شوند.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { createReportCache } from "../src/lib/reportCache.js";

let ctx, O, O2;
const PW = "رمز-خیلی-قوی-۱۲۳";
const reg = async (email, shop) => { const c = client(ctx.app); const r = await c.post("/api/auth/register", { email, password: PW, firstName: "م", lastName: "ر", phone: "09121234567", shopName: shop }); assert.equal(r.status, 201); return { call: (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }), cafeId: r.data.user.branchId }; };
before(async () => {
  ctx = await makeApp(await startDb(), { env: { REPORT_CACHE_TTL_MS: "60000" } });
  O = await reg("pf1@cafe.test", "الف"); O2 = await reg("pf2@cafe.test", "ب");
  // ۲۵۰ مشتری با «دقیقاً یک updated_at» (حالت بدِ ساخت دسته‌ای در یک تراکنش) + ۴۰ مشتری با زمان‌های متفاوت
  await ctx.pool.query(`INSERT INTO customers(cafe_id,id,first_name,updated_at) SELECT $1,'t'||lpad(g::text,4,'0'),'x',timestamptz '2026-01-01 10:00:00.123456+00' FROM generate_series(1,250) g`, [O.cafeId]);
  await ctx.pool.query(`INSERT INTO customers(cafe_id,id,first_name,updated_at) SELECT $1,'u'||lpad(g::text,4,'0'),'x',timestamptz '2026-02-01 10:00:00+00' + (g||' seconds')::interval + (g||' microseconds')::interval FROM generate_series(1,40) g`, [O.cafeId]);
  await ctx.pool.query(`INSERT INTO customers(cafe_id,id,first_name) SELECT $1,'other'||g,'y' FROM generate_series(1,30) g`, [O2.cafeId]);
});
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); });

test("cursor: همهٔ ردیف‌ها دقیقاً یک بار، بدون جاافتادن حتی با updated_at یکسان، به‌ترتیب فهرست", async () => {
  const seen = []; let cursor = "", pages = 0, last;
  for (;;) {
    const r = await O.call("GET", `/api/customers?limit=37&count=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    assert.equal(r.status, 200); pages++;
    assert.equal(r.json.meta.total, null); assert.equal(typeof r.json.meta.hasMore, "boolean");
    seen.push(...r.json.data.map((x) => x.id)); last = r.json.meta;
    if (!last.hasMore) { assert.equal(last.nextCursor, null); break; }
    cursor = last.nextCursor; assert.ok(cursor);
  }
  assert.equal(pages, Math.ceil(290 / 37)); assert.equal(seen.length, 290); assert.equal(new Set(seen).size, 290);
  // ترتیب با فهرست OFFSET یکی است
  const all = (await O.call("GET", "/api/customers?limit=500")).json; assert.equal(all.meta.total, 290); assert.deepEqual(seen, all.data.map((x) => x.id));
  assert.ok(seen.every((id) => !id.startsWith("other")), "ایزوله‌سازی tenant");
});

test("cursor: ردیفِ تازه‌نوشته وسط پیمایش، ردیف‌های قدیمی را جا نمی‌اندازد/تکرار نمی‌کند", async () => {
  const orig = (await O.call("GET", "/api/customers?limit=500")).data.map((x) => x.id);
  const p1 = (await O.call("GET", "/api/customers?limit=100&count=false")).json;
  await O.call("POST", "/api/customers", { id: "late1", firstName: "دیرهنگام" });         // به ابتدای فهرست می‌رود (updated_at تازه‌تر)
  const p2 = (await O.call("GET", `/api/customers?limit=100&count=false&cursor=${encodeURIComponent(p1.meta.nextCursor)}`)).json;
  const ids1 = new Set(p1.data.map((x) => x.id));
  assert.ok(p2.data.every((x) => !ids1.has(x.id)), "تکرار نداشته باشد");
  assert.deepEqual(p2.data.map((x) => x.id), orig.slice(100, 200), "صفحهٔ بعد دقیقاً ادامهٔ فهرستِ قبل از نوشتن است");
  await ctx.pool.query("DELETE FROM customers WHERE cafe_id=$1 AND id='late1'", [O.cafeId]);
});

test("cursor نامعتبر/دست‌کاری‌شده → 400؛ SQL تزریق نمی‌شود", async () => {
  for (const bad of ["x", "%%%", Buffer.from("[1,2]").toString("base64url"), Buffer.from(JSON.stringify(["2026-01-01'; DROP TABLE customers;--", "a"])).toString("base64url"), Buffer.from(JSON.stringify(["2026-01-01 10:00:00+00", "a".repeat(300)])).toString("base64url")]) {
    const r = await O.call("GET", `/api/customers?cursor=${encodeURIComponent(bad)}`); assert.equal(r.status, 400, bad.slice(0, 30));
  }
  assert.equal((await O.call("GET", "/api/customers?limit=1")).status, 200);
});

test("سازگاری قدیمی: بدون cursor همان offset/limit/total؛ count=false فقط total را حذف می‌کند", async () => {
  const r = (await O.call("GET", "/api/customers?limit=10&offset=5")).json;
  assert.equal(r.meta.total, 290); assert.equal(r.meta.offset, 5); assert.equal(r.meta.limit, 10); assert.equal(r.data.length, 10);
  const r2 = (await O.call("GET", "/api/customers?limit=10&offset=5&count=false")).json; assert.equal(r2.meta.total, null); assert.deepEqual(r2.data.map((x) => x.id), r.data.map((x) => x.id));
});

test("ایندکس‌های 005 ساخته شده و روی فهرست استفاده می‌شوند (بدون Sort)", async () => {
  const idx = (await ctx.pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE '%\\_upd\\_idx'")).rows.map((r) => r.indexname);
  for (const n of ["customers", "invoices", "payments", "orders", "inventory", "transactions", "expenses", "accounts"]) assert.ok(idx.includes(`${n}_upd_idx`), n);
  await ctx.pool.query("ANALYZE customers");
  await ctx.pool.query("SET enable_seqscan = off");           // جدول تست کوچک است؛ فقط «قابل‌استفاده‌بودن» ایندکس را می‌سنجیم
  try {
    const p = (await ctx.pool.query("EXPLAIN (FORMAT JSON) SELECT * FROM customers WHERE cafe_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT 100", [O.cafeId])).rows[0]["QUERY PLAN"][0].Plan;
    assert.ok(!JSON.stringify(p).includes('"Node Type":"Sort"'), JSON.stringify(p).slice(0, 300));
  } finally { await ctx.pool.query("RESET enable_seqscan"); }
});

test("گزارش: HIT پس از MISS؛ هر نوشتنِ همان کافی‌نت ابطال می‌کند؛ کافی‌نت دیگر دست‌نخورده می‌ماند", async () => {
  const get = async (o, extra = "") => { const r = await o.call("GET", `/api/reports/summary?from=2026-01-01&to=2026-12-31${extra}`); assert.equal(r.status, 200); return r; };
  assert.equal((await get(O)).headers["x-report-cache"], "miss");
  assert.equal((await get(O)).headers["x-report-cache"], "hit");
  assert.equal((await get(O2)).headers["x-report-cache"], "miss");
  assert.equal((await get(O, "&fresh=true")).headers["x-report-cache"], "bypass");
  const before = (await get(O)).data.revenue;
  const w = await O.call("POST", "/api/invoices", { id: "pf-i1", number: "PF1", date: "2026-03-01", subtotal: 12345, totalAmount: 12345, status: "unpaid" }); assert.ok(w.status < 300, JSON.stringify(w.json));
  const after1 = await get(O); assert.equal(after1.headers["x-report-cache"], "miss", "نوشتن باید ابطال کند");
  assert.equal(after1.data.revenue, before + 12345, "عدد جدید فوراً دیده شود");
  assert.equal((await get(O2)).headers["x-report-cache"], "hit", "نوشتن کافی‌نت الف گزارش ب را باطل نکند");
  await O.call("POST", "/api/invoices/pf-i1/void", { reason: "تست" });
  const r3 = await get(O); assert.equal(r3.headers["x-report-cache"], "miss"); assert.equal(r3.data.revenue, before);
});

test("reportCache: single-flight، TTL، ابطال حین محاسبه، سقف اندازه", async () => {
  let t = 0; const c = createReportCache({ ttlMs: 100, max: 3, now: () => t });
  let calls = 0; const slow = () => new Promise((r) => setTimeout(() => r(++calls), 20));
  const [a, b, d] = await Promise.all([c.get("c1", "k", slow), c.get("c1", "k", slow), c.get("c1", "k", slow)]);
  assert.equal(calls, 1); assert.deepEqual([a.state, b.state, d.state].sort(), ["miss", "shared", "shared"]); assert.equal(a.value, 1);
  assert.equal((await c.get("c1", "k", slow)).state, "hit"); t = 101; assert.equal((await c.get("c1", "k", slow)).state, "miss"); assert.equal(calls, 2);
  // ابطال حین محاسبه: نتیجهٔ قدیمی هرگز به‌عنوان نتیجهٔ تازه نمی‌ماند
  let gate; const held = new Promise((r) => (gate = r));
  const p = c.get("c2", "k", async () => { await held; return "old"; });
  c.invalidate("c2"); gate(); assert.equal((await p).value, "old");
  assert.equal((await c.get("c2", "k", async () => "new")).value, "new");
  for (let i = 0; i < 10; i++) await c.get("c3", `k${i}`, async () => i);
  assert.ok(c.stats().size <= 3);
  assert.equal(createReportCache({ ttlMs: 0 }).enabled, false); assert.equal((await createReportCache({ ttlMs: 0 }).get("x", "k", async () => 5)).state, "bypass");
});
