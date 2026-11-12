// Offline-first behaviour of the REAL app engines against a fake server (fetch is replaced; no network).
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { E, fresh, item, T } from "./helpers.js";

// ── fake server with Idempotency-Key semantics ───────────────────────────────
const server = { net: "up", db: {}, calls: [], idem: new Map(), rule: null, loseNext: 0 };
const resetServer = () => { server.net = "up"; server.db = { customers: [], orders: [], invoices: [], payments: [], transactions: [], inventory: [] }; server.calls = []; server.idem = new Map(); server.rule = null; server.loseNext = 0; };
const json = (status, data) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => data });
globalThis.__fetchImpl = async (url, init = {}) => {
  if (server.net === "down") throw new TypeError("Failed to fetch");
  const u = new URL(url); const parts = u.pathname.split("/").filter(Boolean);       // api, resource, id
  const res = parts[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()); const id = parts[2]; const m = init.method || "GET";
  const key = init.headers?.["Idempotency-Key"] || null; const body = init.body ? JSON.parse(init.body) : undefined;
  server.calls.push({ m, res, id, key, body });
  const forced = server.rule && server.rule({ m, res, id, body }); if (forced) return json(forced, { error: { code: "forced", message: "forced " + forced } });
  if (!server.db[res]) return json(404, { error: { code: "not_found", message: "no route" } });
  // مثل سرور واقعی: paid/remaining/status را سرور از پرداخت‌ها می‌سازد؛ ابطال با دستور؛ پرداخت حذف نمی‌شود، برگشت می‌خورد
  const recompute = (invId) => { const inv = server.db.invoices.find((x) => String(x.id) === String(invId)); if (!inv) return; const paid = server.db.payments.filter((p) => String(p.invoiceId) === String(invId)).reduce((s, p) => s + p.amount, 0); inv.paidAmount = paid; inv.remainingAmount = Math.max(0, (inv.totalAmount || 0) - paid - (inv.waivedAmount || 0)); if (inv.status !== "void") inv.status = inv.remainingAmount <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid"; };
  if (m === "POST" && parts[3] === "void") {
    const target = server.db[res].find((x) => String(x.id) === id); if (!target) return json(404, { error: { code: "not_found", message: "x" } });
    if (res === "invoices") { target.status = "void"; target.voidReason = body?.reason; return json(200, { data: target }); }
    if (res === "payments") { const rev = { id: "rev_" + id, invoiceId: target.invoiceId, amount: -target.amount, kind: "reversal", reversalOf: id }; server.db.payments.push(rev); recompute(target.invoiceId); return json(201, { data: rev }); }
  }
  if (m === "POST") {
    if (key && server.idem.has(key)) return json(200, { data: server.idem.get(key) });
    const row = { ...body, id: String(body?.id ?? Math.random()) };
    if (res === "invoices") { delete row.paidAmount; delete row.remainingAmount; delete row.status; }
    server.db[res].push(row); if (key) server.idem.set(key, row);
    if (res === "invoices") recompute(row.id); if (res === "payments") recompute(row.invoiceId);
    if (server.loseNext > 0) { server.loseNext--; throw new TypeError("connection reset after the server processed the request"); }
    return json(201, { data: row });
  }
  if (m === "PATCH") { const r = server.db[res].find((x) => String(x.id) === id); if (!r) return json(404, { error: { code: "not_found", message: "x" } }); Object.assign(r, body); if (res === "invoices") { delete body.status; recompute(r.id); } return json(200, { data: r }); }
  if (m === "DELETE") { const n = server.db[res].length; server.db[res] = server.db[res].filter((x) => String(x.id) !== id); return n === server.db[res].length ? json(404, { error: { code: "not_found", message: "x" } }) : json(204, null); }
  return json(200, { data: server.db[res] });
};

async function setup() {
  fresh(); resetServer();
  E.saveApiConfig({ baseUrl: "http://srv.test", cafeId: "" });
  E.setAuthenticatedUser({ id: "u1", email: "a@b.c" });
  E.setSyncConfig({ finance: true });
  await E.syncQueue.clearAll();
  E.syncQueue.resume?.();
}
const settle = async () => { await E.syncQueue.notifyOnline(); await E.syncQueue.idle(); };
const pendingOps = () => E.syncQueue.list().filter((o) => o.status !== "done");
beforeEach(setup);
after(() => { E.syncQueue.pause(); });

const cashSale = (extra = {}) => E.createSale({ customerId: 1, items: [item({ price: T(10000), qty: 2 })], payments: [{ method: "cash", amount: T(20000) }], ...extra });

test("Offline create: ثبت فاکتور بدون اینترنت → در صف محلی می‌ماند، داده محلی کامل است، چیزی به سرور نمی‌رود", async () => {
  server.net = "down";
  const r = cashSale(); assert.equal(r.ok, true);
  await E.syncQueue.flush(); await E.syncQueue.idle();
  const kinds = pendingOps().map((o) => o.entityKey.split(":")[0]).sort();
  assert.deepEqual(kinds, ["invoices", "orders", "payments"]);
  assert.equal(E.getSales().length, 1);                                   // local data is complete
  assert.equal(server.db.invoices.length + server.db.payments.length + server.db.orders.length, 0);
  assert.ok(pendingOps().every((o) => /^op_[a-f0-9]{32}$/.test(o.opId) && o.status === "pending"));   // unique op id each
  assert.equal(new Set(pendingOps().map((o) => o.opId)).size, 3);
});

test("Sync بعد از وصل شدن: همه یک‌بار می‌رسند، ترتیب فاکتور ← پرداخت رعایت می‌شود و صف خالی می‌شود", async () => {
  server.net = "down"; const r = cashSale(); await E.syncQueue.flush(); await E.syncQueue.idle();
  server.net = "up"; server.calls.length = 0; await settle();
  assert.equal(server.db.invoices.length, 1); assert.equal(server.db.payments.length, 1); assert.equal(server.db.orders.length, 1);
  assert.equal(server.db.invoices[0].totalAmount, r.sale.total); assert.equal(server.db.payments[0].invoiceId, String(r.sale.invoiceId));
  const posts = server.calls.filter((c) => c.m === "POST").map((c) => c.res);
  assert.ok(posts.indexOf("invoices") < posts.indexOf("payments"));
  assert.ok(server.calls.filter((c) => c.m === "POST").every((c) => c.key));         // every create has an Idempotency-Key
  assert.equal(E.syncQueue.stats().total, 0);
});

test("Offline update: پرداخت دوم و ویرایش مشتری بدون اینترنت → بعد از اتصال اعمال می‌شود", async () => {
  const r = E.createSale({ customerId: 1, items: [item({ price: T(10000), qty: 2 })], payments: [{ method: "cash", amount: T(5000) }] });
  await settle(); assert.equal(server.db.invoices[0].status, "partial");
  server.net = "down";
  assert.equal(E.receiveSalePayment(r.sale.id, T(15000), "cash").ok, true);
  E.queueOp({ resource: "customers", action: "update", entityId: 1, body: { phone: "09120000000" }, label: "ویرایش مشتری" });
  await E.syncQueue.flush(); await E.syncQueue.idle();
  assert.ok(pendingOps().length >= 1); assert.equal(server.db.payments.length, 1);
  server.net = "up"; server.db.customers.push({ id: "1", phone: "old" });
  await settle();
  assert.equal(server.db.payments.length, 2); assert.equal(server.db.customers[0].phone, "09120000000");
  assert.equal(E.syncQueue.stats().total, 0);
});

test("Offline delete: لغو فروش و حذف مشتری بدون اینترنت → حذف/ابطال بعد از اتصال", async () => {
  const r = cashSale(); await settle(); assert.equal(server.db.orders.length, 1);
  server.net = "down";
  assert.equal(E.cancelSale(r.sale.id, "اشتباه").ok, true);
  E.queueOp({ resource: "customers", action: "remove", entityId: 2, label: "حذف مشتری" }); server.db.customers.push({ id: "2" });
  await E.syncQueue.flush(); await E.syncQueue.idle();
  assert.equal(server.db.orders.length, 1);                                // not yet
  server.net = "up"; await settle();
  assert.equal(server.db.orders.length, 0); assert.equal(server.db.invoices[0].status, "void"); assert.equal(server.db.customers.length, 0);
});

test("حذف چیزی که هرگز به سرور نرسیده: ساخت و حذف همدیگر را خنثی می‌کنند و چیزی ارسال نمی‌شود", async () => {
  server.net = "down";
  E.queueOp({ resource: "customers", action: "create", entityId: 77, body: { id: "77" } });
  E.queueOp({ resource: "customers", action: "remove", entityId: 77 });
  await E.syncQueue.idle();
  assert.equal(pendingOps().length, 0);
});

test("Retry: خطای ۵۰۰ سرور → عملیات نگه داشته و دوباره تلاش می‌شود؛ هیچ داده‌ای گم نمی‌شود", async () => {
  server.rule = ({ m, res }) => (m === "POST" && res === "invoices" ? 500 : 0);
  cashSale(); await E.syncQueue.flush({ ignoreBackoff: true }); await E.syncQueue.idle();
  const inv = pendingOps().find((o) => o.resource === "invoices"); assert.ok(inv && inv.tries >= 1 && inv.status === "pending");
  assert.ok(pendingOps().some((o) => o.resource === "payments"));         // dependents wait
  server.rule = null; await settle();
  assert.equal(server.db.invoices.length, 1); assert.equal(server.db.payments.length, 1); assert.equal(E.syncQueue.stats().total, 0);
});

test("Duplicate request: پاسخ سرور گم شد، دوباره ارسال شد → فقط یک فاکتور (Idempotency-Key یکسان)", async () => {
  server.loseNext = 1; cashSale();
  await E.syncQueue.flush({ ignoreBackoff: true }); await E.syncQueue.idle(); await settle();
  assert.equal(server.db.invoices.length, 1); assert.equal(server.db.payments.length, 1);
  const keys = server.calls.filter((c) => c.m === "POST" && c.res === "invoices").map((c) => c.key);
  assert.ok(keys.length >= 2 && new Set(keys).size === 1);
});

test("Duplicate request: ثبت دوبارهٔ همان عملیات در صف تکرار نمی‌شود", async () => {
  server.net = "down";
  const a = E.queueOp({ resource: "customers", action: "create", entityId: 5, body: { id: "5" }, idem: "customer-5" });
  const b = E.queueOp({ resource: "customers", action: "create", entityId: 5, body: { id: "5" }, idem: "customer-5" });
  await E.syncQueue.idle(); assert.equal(pendingOps().length, 1); assert.equal(b?.duplicate ?? true, true); void a;
  server.net = "up"; await settle(); assert.equal(server.db.customers.length, 1);
});

test("Conflict: رد شدن یک پرداخت (۴۰۹/۴۲۲) آن را «خطادار» می‌کند ولی بقیه ادامه می‌یابند و بعد از رفع، دوباره‌ارسال می‌شود", async () => {
  server.rule = ({ m, res }) => (m === "POST" && res === "payments" ? 409 : 0);
  cashSale(); cashSale({ customerId: 2 }); await settle();
  assert.equal(server.db.invoices.length, 2);                              // unrelated work not blocked
  const st = E.syncQueue.stats(); assert.equal(st.failed, 2); assert.equal(E.syncState(st).key, "failed");
  server.rule = null; await E.syncQueue.retryAllFailed(); await settle();
  assert.equal(server.db.payments.length, 2); assert.equal(E.syncQueue.stats().total, 0);
});

test("401: صف متوقف می‌شود، داده‌ها می‌مانند و بعد از ورود مجدد ادامه می‌یابد", async () => {
  server.rule = () => 401; cashSale(); await E.syncQueue.flush({ ignoreBackoff: true }); await E.syncQueue.idle();
  assert.equal(E.syncQueue.stats().paused, "auth"); assert.equal(E.syncState(E.syncQueue.stats()).key, "auth");
  assert.ok(pendingOps().length >= 3);
  server.rule = null; E.syncQueue.resume(); await settle(); assert.equal(server.db.invoices.length, 1);
});

test("عملیات ناموفق محلی (Rollback) هیچ چیزی در صف نمی‌گذارد", async () => {
  const before = pendingOps().length;
  const r = E.runTransaction("x", () => { E.createSale({ customerId: 1, items: [item()], payments: [{ method: "cash", amount: T(10000) }] }); throw new Error("boom"); });
  assert.equal(r.ok, false); assert.equal(pendingOps().length, before); assert.equal(E.getSales().length, 0);
});

test("وضعیت نمایش‌داده‌شده: آنلاین / در حال همگام‌سازی / منتظر ارسال / خطادار / آفلاین", async () => {
  const base = { paused: null, reachable: true, online: true, flushing: false, inflight: 0, pending: 0, failed: 0, total: 0 };
  assert.equal(E.syncState(base).key, "ok");
  assert.match(E.syncState(base).text, /آنلاین/);
  assert.equal(E.syncState({ ...base, flushing: true, total: 2 }).key, "syncing");
  const p = E.syncState({ ...base, pending: 4, total: 4 }); assert.equal(p.key, "pending"); assert.match(p.text, /۴ عملیات منتظر ارسال/);
  const f = E.syncState({ ...base, failed: 2, total: 2 }); assert.equal(f.key, "failed"); assert.match(f.text, /۲ عملیات خطادار/);
  assert.equal(E.syncState({ ...base, online: false, pending: 3, total: 3 }).key, "offline");
});
