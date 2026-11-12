// Offline-first sync engine: durable outbox + ordered, idempotent delivery with backoff.
//
//   user action → local write (instant, works offline) → enqueue(op) → [IndexedDB outbox]
//        → flush() when online → send(op) with Idempotency-Key → server → op removed
//
// Guarantees
//  • at-least-once delivery, made effectively-once by the stable Idempotency-Key of every create;
//  • per-entity ordering and explicit cross-entity dependencies (invoice after its customer);
//  • retryable failures (network, timeout, 5xx, 429) back off exponentially and never lose the op;
//  • non-retryable failures (4xx) are parked as "failed" for review — they never block unrelated operations;
//  • 401 pauses the engine (ops stay queued) until the user signs in again.

import { classifyError } from "../diagnostics/errorLog.js";
import { newOpId } from "./ops.js";

const IDEMPOTENT_REPLAY_CODES = new Set(["idempotent_replay", "idempotency_replay", "already_processed"]);
const STALE_INFLIGHT_MS = 2 * 60 * 1000;

export function createSyncEngine({
  adapter,
  send,                                   // async (op) → response  — throws on failure (ApiError-like: status, code)
  isOnline = () => true,
  canSync = () => true,                   // false when no server is configured / user not signed in
  now = () => Date.now(),
  random = Math.random,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  lock = async (fn) => fn(),              // cross-tab mutual exclusion for flush()
  backoff = { base: 2000, max: 5 * 60 * 1000 },
  historyLimit = 30,
  log = () => {},
} = {}) {
  let ops = [];                           // in-memory mirror, ordered by seq
  let seqCounter = 0;
  let loaded = false;
  let loadPromise = null;
  let flushing = null;
  let wakeTimer = null;
  let paused = null;                      // null | "auth" | "manual"
  let reachable = true;
  let lastSyncAt = null;
  let lastError = null;
  const history = [];
  const listeners = new Set();
  let writeChain = Promise.resolve();
  let writeErrors = 0;
  const unpersisted = new Set();          // opIds enqueued in memory whose write is not committed yet
  const deleting = new Set();             // opIds removed in memory whose delete is not committed yet

  const emit = (event) => listeners.forEach((fn) => { try { fn(event, api); } catch { /* listener errors are not engine errors */ } });
  const nextSeq = () => { seqCounter += 1; return now() * 1000 + (seqCounter % 1000); };
  const persist = (fn) => { const p = writeChain.then(fn).catch((e) => { writeErrors += 1; log("persist-failed", e); }); writeChain = p; return p; };
  const sortOps = () => ops.sort((a, b) => a.seq - b.seq);

  async function reload() {
    await writeChain;                                   // never read a half-written store
    const stored = await adapter.getAll();
    const t = now();
    const inMemory = new Map(ops.map((o) => [o.opId, o]));
    const fromStore = stored.filter((o) => !deleting.has(o.opId)).map((o) => {
      const live = inMemory.get(o.opId);
      if (live && live.status === "inflight") return live;          // our own in-flight op is authoritative in memory
      return o.status === "inflight" && t - (o.inflightAt || 0) > STALE_INFLIGHT_MS ? { ...o, status: "pending" } : o;
    });
    const storedIds = new Set(fromStore.map((o) => o.opId));
    const fresh = ops.filter((o) => unpersisted.has(o.opId) && !storedIds.has(o.opId));   // enqueued while we were reading
    ops = [...fromStore, ...fresh];
    sortOps();
    loaded = true;
  }
  const dropFromMemory = (ids) => { const set = new Set(ids); ids.forEach((id) => deleting.add(id)); ops = ops.filter((o) => !set.has(o.opId)); };
  const deleteFromStore = (ids) => persist(async () => { for (const id of ids) await adapter.delete(id); ids.forEach((id) => deleting.delete(id)); });
  const ensureLoaded = () => loaded ? Promise.resolve() : (loadPromise ||= reload().finally(() => { loadPromise = null; }));

  // ── dependency / blocking ──
  function blockerOf(op, index) {
    const earlier = ops.slice(0, index);
    const same = earlier.find((o) => o.entityKey === op.entityKey);
    if (same) return same;
    for (const dep of op.dependsOn || []) { const b = earlier.find((o) => o.entityKey === dep); if (b) return b; }
    return null;
  }
  const isBlocked = (op, index) => !!blockerOf(op, index);

  // ── coalescing (only operations that were never attempted and are the latest for their entity) ──
  function coalesce(input) {
    if (input.action === "create") return null;
    const sameEntity = ops.filter((o) => o.entityKey === input.entityKey);
    const target = sameEntity[sameEntity.length - 1];
    if (!target || target.status !== "pending" || target.tries !== 0) return null;
    if (input.action === "update" && (target.action === "create" || target.action === "update")) {
      target.req = { ...target.req, body: { ...(target.req.body || {}), ...(input.req.body || {}) } };
      target.updatedAt = now();
      return { merged: target };
    }
    if (input.action === "remove" && target.action === "create") {
      // created and deleted before ever reaching the server → send nothing; also drop never-sent operations that depended on it
      const doomed = [target.opId, ...ops.filter((o) => (o.dependsOn || []).includes(input.entityKey) && o.tries === 0 && o.status === "pending").map((o) => o.opId)];
      return { dropped: doomed };
    }
    if (input.action === "remove" && target.action === "update") return { dropped: [target.opId], enqueue: true };
    return null;
  }

  function enqueue(input) {
    const t = now();
    // duplicate create guard: same Idempotency-Key already queued → return the existing op
    if (input.action === "create" && input.idem) {
      const dup = ops.find((o) => o.action === "create" && o.idem === input.idem);
      if (dup) return { op: dup, duplicate: true, persisted: persist(async () => {}) };
    }
    const result = coalesce(input);
    if (result?.merged) {
      unpersisted.add(result.merged.opId);
      const persisted = persist(() => adapter.put(result.merged)).then(() => unpersisted.delete(result.merged.opId));
      emit({ type: "change" }); kick();
      return { op: result.merged, merged: true, persisted };
    }
    if (result?.dropped) {
      dropFromMemory(result.dropped);
      const persisted = deleteFromStore(result.dropped);
      emit({ type: "change" });
      if (!result.enqueue) return { op: null, dropped: true, persisted };
    }
    const op = {
      opId: newOpId(), seq: nextSeq(), status: "pending", tries: 0, nextAt: 0, createdAt: t,
      resource: input.resource, action: input.action, entityId: input.entityId, entityKey: input.entityKey,
      req: input.req, idem: input.idem || undefined, dependsOn: input.dependsOn || [], label: input.label || "", meta: input.meta || {},
    };
    ops.push(op);
    sortOps();
    unpersisted.add(op.opId);
    const persisted = persist(() => adapter.put(op)).then(() => unpersisted.delete(op.opId));
    emit({ type: "enqueued", op }); emit({ type: "change" });
    kick();
    return { op, persisted };
  }

  // ── delivery ──
  function delayFor(tries, retryAfterMs) {
    const exp = Math.min(backoff.max, backoff.base * 2 ** Math.max(0, tries - 1));
    const jitter = 0.8 + random() * 0.4;
    return Math.max(Math.round(exp * jitter), retryAfterMs || 0);
  }

  async function deliver(op) {
    op.status = "inflight"; op.inflightAt = now();
    await persist(() => adapter.put(op));
    emit({ type: "change" });
    try {
      const response = await send(op);
      return { ok: true, response };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function settle(op, outcome) {
    const t = now();
    if (outcome.ok) {
      dropFromMemory([op.opId]);
      await deleteFromStore([op.opId]);
      history.unshift({ opId: op.opId, label: op.label || `${op.resource}.${op.action}`, entityKey: op.entityKey, at: t, tries: op.tries + 1 });
      history.length = Math.min(history.length, historyLimit);
      reachable = true; lastSyncAt = t; lastError = null;
      emit({ type: "applied", op, response: outcome.response });
      return "applied";
    }
    const error = outcome.error;
    const cls = classifyError(error);
    const status = Number(error?.status) || 0;
    const code = String(error?.code || "");
    // idempotent replay or deleting something already gone ⇒ the desired state is reached
    if ((status === 409 && IDEMPOTENT_REPLAY_CODES.has(code)) || (op.action === "remove" && status === 404)) {
      return settle(op, { ok: true, response: null });
    }
    const info = { at: t, status, code, kind: cls.kind, message: String(error?.message || "").slice(0, 300) };
    lastError = info;
    if (cls.kind === "offline" || cls.kind === "timeout") reachable = false;
    if (cls.kind === "auth") {
      paused = "auth"; op.status = "pending"; op.lastError = info;
      await persist(() => adapter.put(op));
      emit({ type: "paused", reason: "auth" });
      return "paused";
    }
    op.tries += 1; op.lastError = info;
    if (cls.retryable) {
      op.status = "pending"; op.nextAt = t + delayFor(op.tries, error?.retryAfterMs);
      await persist(() => adapter.put(op));
      emit({ type: "retry", op });
      return cls.kind === "offline" || cls.kind === "timeout" || cls.kind === "server" || cls.kind === "throttled" ? "stop" : "continue";
    }
    op.status = "failed";
    await persist(() => adapter.put(op));
    emit({ type: "failed", op });
    return "continue";
  }

  async function runFlush({ ignoreBackoff }) {
    await ensureLoaded();
    await reload();       // pick up operations queued by other tabs
    // We hold the flush lock and are not delivering anything yet, so an "inflight" row is an orphan of a tab/app that was
    // closed or crashed mid-request. Delivering it again is safe (same Idempotency-Key) and it must not wait for a timeout.
    for (const o of ops) if (o.status === "inflight") { o.status = "pending"; o.nextAt = 0; await persist(() => adapter.put(o)); }
    const summary = { applied: 0, failed: 0, remaining: 0, stopped: null };
    for (let guard = 0; guard < 10000; guard++) {
      if (!canSync()) { summary.stopped = "cannot-sync"; break; }
      if (!isOnline()) { summary.stopped = "offline"; break; }
      if (paused) { summary.stopped = paused; break; }
      const t = now();
      const idx = ops.findIndex((o, i) => o.status === "pending" && (ignoreBackoff || o.nextAt <= t) && !isBlocked(o, i));
      if (idx < 0) break;
      const op = ops[idx];
      const outcome = await deliver(op);
      const verdict = await settle(op, outcome);
      if (verdict === "applied") summary.applied += 1;
      if (op.status === "failed") summary.failed += 1;
      if (verdict === "stop") { summary.stopped = "retry-later"; break; }
      if (verdict === "paused") { summary.stopped = "auth"; break; }
    }
    summary.remaining = ops.length;
    emit({ type: "change" });
    if (!ops.some((o) => o.status === "pending" || o.status === "inflight")) emit({ type: "drained" });
    scheduleWake();
    return summary;
  }

  let lockRetry = null;
  function flush({ ignoreBackoff = false } = {}) {
    if (flushing) return flushing;
    flushing = (async () => {
      try {
        const out = await lock(() => runFlush({ ignoreBackoff }));
        if (!out && !lockRetry && ops.some((o) => o.status === "pending")) lockRetry = setTimer(() => { lockRetry = null; flush(); }, 3000);   // another tab is syncing: look again soon
        return out || { skipped: "locked" };
      } finally { flushing = null; emit({ type: "change" }); }
    })();
    emit({ type: "change" });
    return flushing;
  }

  function scheduleWake() {
    if (wakeTimer) { clearTimer(wakeTimer); wakeTimer = null; }
    const pending = ops.filter((o) => o.status === "pending");
    if (!pending.length || paused) return;
    const t = now();
    const next = Math.min(...pending.map((o) => o.nextAt || 0));
    const wait = Math.max(250, next - t);
    wakeTimer = setTimer(() => { wakeTimer = null; flush(); }, Math.min(wait, 60000));
  }

  let kickScheduled = false;
  function kick() {
    if (kickScheduled) return;
    kickScheduled = true;
    Promise.resolve().then(() => { kickScheduled = false; if (isOnline() && canSync() && !paused) flush(); else scheduleWake(); });
  }

  // ── management API ──
  const api = {
    enqueue, flush, kick,
    async load() { await ensureLoaded(); return api.list(); },
    async reloadFromStore() { await reload(); emit({ type: "change" }); },
    list() { return ops.map((o, i) => ({ ...o, blocked: o.status === "pending" && isBlocked(o, i), blockedBy: o.status === "pending" ? (blockerOf(o, i)?.opId || null) : null })); },
    history: () => history.slice(),
    stats() {
      const pending = ops.filter((o) => o.status === "pending").length;
      const failed = ops.filter((o) => o.status === "failed").length;
      const inflight = ops.filter((o) => o.status === "inflight").length;
      return { pending, failed, inflight, total: ops.length, paused, reachable, online: isOnline(), flushing: !!flushing, lastSyncAt, lastError, writeErrors, nextAt: pending.length ? Math.min(...ops.filter((o) => o.status === "pending").map((o) => o.nextAt || 0)) : null };
    },
    hasPending(resource, entityId, action) { return ops.some((o) => o.entityKey === `${resource}:${entityId}` && (!action || o.action === action)); },
    async retry(opId) {
      await ensureLoaded();
      const op = ops.find((o) => o.opId === opId); if (!op) return false;
      op.status = "pending"; op.nextAt = 0; op.tries = Math.min(op.tries, 1);
      await persist(() => adapter.put(op)); emit({ type: "change" }); kick(); return true;
    },
    async retryAllFailed() { await ensureLoaded(); const failed = ops.filter((o) => o.status === "failed"); for (const o of failed) { o.status = "pending"; o.nextAt = 0; } await persist(() => adapter.putMany(failed)); emit({ type: "change" }); kick(); return failed.length; },
    async discard(opId, { cascade = false } = {}) {
      await ensureLoaded();
      const target = ops.find((o) => o.opId === opId); if (!target) return 0;
      const doomed = new Set([opId]);
      if (cascade) ops.forEach((o) => { if (o.opId !== opId && (o.entityKey === target.entityKey || (o.dependsOn || []).includes(target.entityKey)) && o.seq > target.seq) doomed.add(o.opId); });
      dropFromMemory([...doomed]);
      await deleteFromStore([...doomed]);
      emit({ type: "discarded", opIds: [...doomed] }); emit({ type: "change" }); scheduleWake();
      return doomed.size;
    },
    pause(reason = "manual") { paused = reason; if (wakeTimer) { clearTimer(wakeTimer); wakeTimer = null; } emit({ type: "paused", reason }); emit({ type: "change" }); },
    resume() { if (!paused) return; paused = null; emit({ type: "resumed" }); emit({ type: "change" }); kick(); },
    notifyOnline() { reachable = true; emit({ type: "change" }); return flush({ ignoreBackoff: true }); },
    notifyOffline() { reachable = false; emit({ type: "change" }); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async idle() { await writeChain; if (flushing) await flushing; await writeChain; },
    async clearAll() { ops = []; unpersisted.clear(); await persist(() => adapter.clear()); emit({ type: "change" }); },
    exportJson() { return JSON.stringify({ exportedAt: new Date(now()).toISOString(), ops: ops.map((o) => ({ ...o })), history }, null, 2); },
  };
  return api;
}
