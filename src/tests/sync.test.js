import test from "node:test";
import assert from "node:assert/strict";
import { createSyncEngine } from "../sync/engine.js";
import { createMemoryAdapter } from "../sync/store.js";
import { describeOp } from "../sync/ops.js";
import { ApiError } from "../services/api/client.js";

// ── test doubles ─────────────────────────────────────────────
function fakeServer() {
  const records = new Map();     // idempotency key → stored response
  const created = [];            // every record actually created
  const calls = [];
  const s = {
    mode: "ok",                  // ok | offline | lose-response | 500 | 422 | 401 | 409 | 409-replay
    created, calls, records,
    async handle(op) {
      const key = op.idem || op.opId;
      calls.push({ method: op.req.method, path: op.req.path, key, body: op.req.body });
      const forced = s.rule && s.rule(op); if (forced) throw new ApiError(forced, { error: { code: "forced", message: "forced " + forced } });
      if (s.mode === "offline") throw new ApiError(0, { error: { code: "network_error", message: "down" } });
      if (s.mode === "401") throw new ApiError(401, { error: { code: "unauthorized", message: "no" } });
      if (s.mode === "500") throw new ApiError(500, { error: { code: "boom", message: "boom" } });
      if (s.mode === "422") throw new ApiError(422, { error: { code: "invalid", message: "bad" } });
      if (s.mode === "409") throw new ApiError(409, { error: { code: "duplicate", message: "dup" } });
      if (s.mode === "409-replay") throw new ApiError(409, { error: { code: "idempotent_replay", message: "again" } });
      if (s.mode === "404") throw new ApiError(404, { error: { code: "not_found", message: "gone" } });
      if (op.req.method === "POST" && records.has(key)) return records.get(key);            // idempotent replay
      const res = { id: String(op.entityId), ok: true };
      if (op.req.method === "POST") { records.set(key, res); created.push(op.entityKey); }
      if (s.mode === "lose-response") { s.mode = "ok"; throw new ApiError(0, { error: { code: "network_error", message: "response lost" } }); }
      return res;
    },
  };
  return s;
}

function harness(over = {}) {
  const server = over.server || fakeServer();
  const clock = { t: 1_000_000 };
  const timers = [];
  const state = { online: true, signedIn: true };
  const adapter = over.adapter || createMemoryAdapter();
  const engine = createSyncEngine({
    adapter, send: (op) => server.handle(op), isOnline: () => state.online, canSync: () => state.signedIn,
    now: () => clock.t, random: () => 0.5, setTimer: (fn, ms) => { const h = { fn, ms }; timers.push(h); return h; }, clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    lock: over.lock,
  });
  return { server, clock, timers, state, adapter, engine };
}
const invoiceOp = (id, extra = {}) => describeOp({ resource: "invoices", action: "create", entityId: id, body: { id, totalAmount: 1000 }, ...extra });

test("offline: operation is stored, nothing is sent; on reconnect it is delivered once with its Idempotency-Key", async () => {
  const h = harness(); h.state.online = false;
  const { op, persisted } = h.engine.enqueue(invoiceOp("A1"));
  await persisted;
  assert.match(op.opId, /^op_[a-f0-9]{32}$/);
  assert.equal(op.idem, "invoices-A1");
  await h.engine.flush();
  assert.equal(h.server.calls.length, 0);
  assert.equal(h.engine.stats().pending, 1);
  assert.equal(h.adapter._size(), 1, "queued durably");
  h.state.online = true;
  const out = await h.engine.notifyOnline();
  assert.equal(out.applied, 1);
  assert.deepEqual(h.server.calls.map((c) => c.key), ["invoices-A1"]);
  assert.equal(h.engine.stats().total, 0);
  assert.equal(h.adapter._size(), 0);
});

test("response lost after the server processed the request: retry reuses the key, server creates the record exactly once", async () => {
  const h = harness(); h.server.mode = "lose-response";
  h.engine.enqueue(invoiceOp("A2")); await h.engine.idle();
  assert.equal(h.engine.stats().pending, 1, "still queued after the failed ack");
  assert.equal(h.server.created.length, 1, "server already has it");
  h.clock.t += 60_000;
  await h.engine.flush();
  assert.equal(h.server.created.length, 1, "no duplicate record");
  assert.equal(h.server.calls.length, 2);
  assert.equal(h.server.calls[0].key, h.server.calls[1].key);
  assert.equal(h.engine.stats().total, 0);
});

test("network failure backs off exponentially (with jitter bounds) and stops hammering the server", async () => {
  const h = harness(); h.server.mode = "offline";
  h.engine.enqueue(invoiceOp("B1")); h.engine.enqueue(invoiceOp("B2")); await h.engine.idle();
  assert.equal(h.server.calls.length, 1, "stops after the first network failure");
  const first = h.engine.list()[0]; assert.equal(first.tries, 1);
  assert.equal(first.nextAt - h.clock.t, 2000);
  h.clock.t = first.nextAt; await h.engine.flush();
  assert.equal(h.engine.list()[0].tries, 2);
  assert.equal(h.engine.list()[0].nextAt - h.clock.t, 4000);
  h.clock.t = h.engine.list()[0].nextAt; await h.engine.flush();
  assert.equal(h.engine.list()[0].nextAt - h.clock.t, 8000);
  assert.ok(h.timers.length >= 1, "a wake-up timer is scheduled");
  assert.equal(h.engine.stats().reachable, false);
});

test("401 pauses the queue (ops are kept) and resume() continues", async () => {
  const h = harness(); h.server.mode = "401";
  h.engine.enqueue(invoiceOp("C1")); await h.engine.idle();
  assert.equal(h.engine.stats().paused, "auth");
  assert.equal(h.engine.stats().pending, 1);
  h.server.mode = "ok"; await h.engine.flush();
  assert.equal(h.server.created.length, 0, "paused");
  h.engine.resume(); await h.engine.idle();
  assert.deepEqual(h.server.created, ["invoices:C1"]);
});

test("a rejected (422) operation is parked as failed, does not block unrelated ops, but blocks its dependents", async () => {
  const h = harness();
  const bad = describeOp({ resource: "customers", action: "create", entityId: "K1", body: { id: "K1" } });
  h.engine.enqueue(bad);
  h.engine.enqueue(describeOp({ resource: "customers", action: "create", entityId: "K2", body: { id: "K2" } }));
  h.engine.enqueue(invoiceOp("I1", { dependsOn: ["customers:K1"] }));
  h.engine.enqueue(invoiceOp("I2", { dependsOn: ["customers:K2"] }));
  h.server.rule = (op) => (op.entityKey === "customers:K1" ? 422 : 0);
  await h.engine.idle();                                           // K1 rejected, the rest flows
  const failed = h.engine.list().find((o) => o.status === "failed"); assert.equal(failed.entityId, "K1");
  await h.engine.flush();
  assert.deepEqual(h.server.created.sort(), ["customers:K2", "invoices:I2"].sort());
  const left = h.engine.list();
  assert.deepEqual(left.map((o) => o.entityKey).sort(), ["customers:K1", "invoices:I1"]);
  assert.equal(left.find((o) => o.entityKey === "invoices:I1").blocked, true);
  // user fixes/discards the broken customer → cascade removes the dependent invoice too
  const n = await h.engine.discard(failed.opId, { cascade: true });
  assert.equal(n, 2); assert.equal(h.engine.stats().total, 0);
});

test("dependency: invoice waits for its customer even when the customer fails transiently", async () => {
  const h = harness();
  h.engine.enqueue(describeOp({ resource: "customers", action: "create", entityId: "K9", body: {} }));
  h.engine.enqueue(invoiceOp("I9", { dependsOn: ["customers:K9"] }));
  h.server.mode = "500"; await h.engine.flush();
  assert.equal(h.server.calls.length, 1, "invoice not attempted before its customer");
  h.server.mode = "ok"; h.clock.t += 600_000; await h.engine.flush();
  assert.deepEqual(h.server.calls.slice(1).map((c) => c.path), ["/api/customers", "/api/invoices"]);
  assert.equal(h.engine.stats().total, 0);
});

test("coalescing: update merges into an unsent create; create+remove cancels out; an attempted create is never rewritten", async () => {
  const h = harness(); h.state.online = false;
  h.engine.enqueue(describeOp({ resource: "customers", action: "create", entityId: "M1", body: { id: "M1", firstName: "Ali" } }));
  h.engine.enqueue(describeOp({ resource: "customers", action: "update", entityId: "M1", body: { phone: "0912" } }));
  assert.equal(h.engine.list().length, 1);
  assert.deepEqual(h.engine.list()[0].req.body, { id: "M1", firstName: "Ali", phone: "0912" });
  h.engine.enqueue(describeOp({ resource: "customers", action: "remove", entityId: "M1" }));
  await h.engine.idle();
  assert.equal(h.engine.list().length, 0, "created and deleted offline → nothing to send");
  assert.equal(h.adapter._size(), 0);
  // attempted create (tries>0) must keep its body/key
  const h2 = harness(); h2.server.mode = "offline";
  h2.engine.enqueue(describeOp({ resource: "customers", action: "create", entityId: "M2", body: { id: "M2" } })); await h2.engine.idle();
  h2.engine.enqueue(describeOp({ resource: "customers", action: "update", entityId: "M2", body: { phone: "1" } }));
  assert.equal(h2.engine.list().length, 2);
  assert.deepEqual(h2.engine.list()[0].req.body, { id: "M2" });
});

test("duplicate create with the same idempotency key is ignored", async () => {
  const h = harness(); h.state.online = false;
  const a = h.engine.enqueue(invoiceOp("D1")); const b = h.engine.enqueue(invoiceOp("D1"));
  assert.equal(b.duplicate, true); assert.equal(b.op.opId, a.op.opId); assert.equal(h.engine.list().length, 1);
});

test("queue survives a restart: a new engine over the same store delivers; stale in-flight ops are recovered", async () => {
  const adapter = createMemoryAdapter();
  const h1 = harness({ adapter }); h1.state.online = false;
  h1.engine.enqueue(invoiceOp("R1")); await h1.engine.idle();
  // simulate crash while in flight 10 minutes ago
  const rows = await adapter.getAll(); await adapter.put({ ...rows[0], status: "inflight", inflightAt: 1 });
  const h2 = harness({ adapter }); h2.clock.t = 100_000_000;
  await h2.engine.flush();
  assert.deepEqual(h2.server.created, ["invoices:R1"]);
  assert.equal(adapter._size(), 0);
});

test("409 idempotent replay and 404-on-delete count as success; other 409 is a reviewable failure", async () => {
  const h = harness();
  h.engine.enqueue(invoiceOp("E1")); h.server.mode = "409-replay"; await h.engine.flush(); assert.equal(h.engine.stats().total, 0);
  h.engine.enqueue(describeOp({ resource: "customers", action: "remove", entityId: "E2" })); h.server.mode = "404"; await h.engine.flush(); assert.equal(h.engine.stats().total, 0);
  h.engine.enqueue(invoiceOp("E3")); h.server.mode = "409"; await h.engine.flush();
  assert.equal(h.engine.list()[0].status, "failed");
  assert.equal(h.engine.list()[0].lastError.kind, "conflict");
  h.server.mode = "ok"; assert.equal(await h.engine.retryAllFailed(), 1); await h.engine.idle();
  assert.equal(h.engine.stats().total, 0);
});

test("two tabs sharing one store never send the same operation twice (mutual exclusion + reload)", async () => {
  const adapter = createMemoryAdapter(); const server = fakeServer();
  let busy = false;
  const lock = async (fn) => { if (busy) return null; busy = true; try { return await fn(); } finally { busy = false; } };
  const a = harness({ adapter, server, lock }), b = harness({ adapter, server, lock });
  a.engine.enqueue(invoiceOp("T1")); await a.engine.idle();
  await Promise.all([a.engine.flush(), b.engine.flush()]);
  assert.equal(server.calls.filter((c) => c.key === "invoices-T1").length, 1);
  assert.equal(adapter._size(), 0);
});

test("Retry-After from the server is honoured", async () => {
  const h = harness();
  h.server.handle = async () => { const e = new ApiError(429, { error: { code: "rate_limited", message: "slow" } }); e.retryAfterMs = 30_000; throw e; };
  h.engine.enqueue(invoiceOp("F1")); await h.engine.idle();
  assert.ok(h.engine.list()[0].nextAt - h.clock.t >= 30_000);
});

test("an orphaned in-flight row (tab closed mid-request seconds ago) is delivered at once — with the same Idempotency-Key", async () => {
  const adapter = createMemoryAdapter();
  const h1 = harness({ adapter }); h1.state.online = false;
  h1.engine.enqueue(invoiceOp("O1")); await h1.engine.idle();
  const rows = await adapter.getAll(); await adapter.put({ ...rows[0], status: "inflight", inflightAt: 1_000_000 });
  const h2 = harness({ adapter });                       // same clock: the row is only moments old
  await h2.engine.flush();
  assert.deepEqual(h2.server.created, ["invoices:O1"]);
  assert.equal(h2.server.calls[0].key, "invoices-O1");
  assert.equal(adapter._size(), 0);
});
