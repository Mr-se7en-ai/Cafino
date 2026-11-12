// App-wide singleton: the offline queue wired to the real API client, IndexedDB, browser connectivity events and
// cross-tab coordination. UI code only uses `queueOp`, `syncQueue` and `startAutoSync`.
import { createSyncEngine } from "./engine.js";
import { pickAdapter } from "./store.js";
import { describeOp } from "./ops.js";
import { apiRequest, isApiConnected } from "../services/api/client.js";
import { getAuthenticatedUser } from "../services/auth/session.js";
import { reportError } from "../diagnostics/index.js";

export { describeOp } from "./ops.js";
export * as mappers from "./mappers.js";

// The adapter is chosen asynchronously (IndexedDB probe); the engine gets a proxy that waits for it.
function createLazyAdapter() {
  let real = null, pending = null;
  const get = () => real ? Promise.resolve(real) : (pending ||= pickAdapter().then((a) => (real = a)));
  return {
    get kind() { return real?.kind || "pending"; },
    getAll: async () => (await get()).getAll(), put: async (o) => (await get()).put(o), putMany: async (o) => (await get()).putMany(o),
    delete: async (id) => (await get()).delete(id), clear: async () => (await get()).clear(),
  };
}

const LEASE_KEY = "cafenet_sync_lease";
const tabId = Math.random().toString(36).slice(2);
async function lock(fn) {
  try {
    if (globalThis.navigator?.locks?.request) return await navigator.locks.request("cafenet-sync-flush", { ifAvailable: true }, async (l) => (l ? fn() : null));
  } catch { /* fall back to the lease below */ }
  // Lease for browsers without Web Locks (also plain-http origins, where navigator.locks is unavailable).
  // Short lease + heartbeat: a tab that is closed mid-sync frees the lock within seconds, not minutes.
  const LEASE_MS = 12000;
  let beat = null;
  try {
    const now = Date.now(), cur = JSON.parse(localStorage.getItem(LEASE_KEY) || "null");
    if (cur && cur.exp > now && cur.id !== tabId) return null;
    localStorage.setItem(LEASE_KEY, JSON.stringify({ id: tabId, exp: now + LEASE_MS }));
    beat = setInterval(() => { try { localStorage.setItem(LEASE_KEY, JSON.stringify({ id: tabId, exp: Date.now() + LEASE_MS })); } catch { /* ignore */ } }, 4000);
  } catch { /* storage unavailable → just run */ }
  try { return await fn(); } finally {
    if (beat) clearInterval(beat);
    try { const cur = JSON.parse(localStorage.getItem(LEASE_KEY) || "null"); if (cur && cur.id === tabId) localStorage.removeItem(LEASE_KEY); } catch { /* ignore */ }
  }
}

const currentUserKey = () => { const u = getAuthenticatedUser(); return u ? String(u.id || u.email || "") : ""; };

// Which families of data are queued for the server. Finance (invoices / payments / manual transactions) can be switched
// off when the server does not expose those routes yet; customers / orders / inventory are always queued.
export const SYNC_CFG_KEY = "cafenet_sync_cfg";
export function getSyncConfig() { try { return { finance: true, ...(JSON.parse(localStorage.getItem(SYNC_CFG_KEY) || "{}") || {}) }; } catch { return { finance: true }; } }
export function setSyncConfig(patch) { try { localStorage.setItem(SYNC_CFG_KEY, JSON.stringify({ ...getSyncConfig(), ...patch })); } catch { /* ignore */ } }

export const syncQueue = createSyncEngine({
  adapter: createLazyAdapter(),
  send: (op) => {
    // shared cybercafé PCs: an operation recorded by user A must never be replayed under user B's token
    const me = currentUserKey();
    if (op.meta?.user && me && op.meta.user !== me) {
      const e = new Error("این عملیات با کاربر دیگری ثبت شده است؛ با همان حساب وارد شوید یا آن را حذف کنید.");
      e.status = 403; e.code = "other_user"; throw e;
    }
    return apiRequest(op.req.path, { method: op.req.method, ...(op.req.body === undefined ? {} : { body: op.req.body }), ...(op.idem ? { headers: { "Idempotency-Key": op.idem } } : {}) });
  },
  isOnline: () => globalThis.navigator?.onLine !== false,
  canSync: () => isApiConnected() && !!getAuthenticatedUser(),
  lock,
  log: (what, e) => { if (what === "persist-failed") reportError(e, "sync", { what }); },
});

try { if (typeof window !== "undefined") window.__cafenetSync = syncQueue; } catch { /* ignore */ }   // support / test hook

// Enqueues an operation only when a server is configured (local-only installs have nothing to sync).
export function queueOp(input) {
  if (!isApiConnected()) return null;
  try {
    const op = input.entityKey ? input : describeOp(input);
    return syncQueue.enqueue({ ...op, meta: { ...(op.meta || {}), user: currentUserKey() } });
  }
  catch (e) { reportError(e, "sync", { stage: "enqueue", resource: input?.resource }); return null; }
}

let started = false;
export function startAutoSync({ intervalMs = 30000 } = {}) {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  const onOnline = () => { syncQueue.notifyOnline(); };
  const onOffline = () => { syncQueue.notifyOffline(); };
  const onVisible = () => { if (document.visibilityState === "visible") syncQueue.flush(); };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(() => { if (syncQueue.stats().total) syncQueue.flush(); }, intervalMs);
  let channel = null;
  try {
    channel = new BroadcastChannel("cafenet-sync");
    channel.onmessage = () => { syncQueue.reloadFromStore(); };
    syncQueue.subscribe((ev) => { if (ev.type === "enqueued" || ev.type === "applied" || ev.type === "discarded") { try { channel.postMessage(ev.type); } catch { /* closed */ } } });
  } catch { /* BroadcastChannel unsupported */ }
  syncQueue.load().then(() => syncQueue.kick()).catch((e) => reportError(e, "sync", { stage: "load" }));
  return () => { started = false; window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); document.removeEventListener("visibilitychange", onVisible); clearInterval(timer); try { channel?.close(); } catch { /* ignore */ } };
}
