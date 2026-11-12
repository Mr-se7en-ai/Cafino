// Durable storage for the offline operation queue. Async adapter interface:
//   getAll() → op[]   put(op)   putMany(ops)   delete(opId)   clear()
// IndexedDB is the production adapter (large payloads, transactional); localStorage is the fallback; memory is for tests.

export function createMemoryAdapter(initial = []) {
  const map = new Map(initial.map((o) => [o.opId, structuredCloneSafe(o)]));
  return {
    kind: "memory",
    async getAll() { return [...map.values()].map(structuredCloneSafe); },
    async put(op) { map.set(op.opId, structuredCloneSafe(op)); },
    async putMany(ops) { ops.forEach((o) => map.set(o.opId, structuredCloneSafe(o))); },
    async delete(opId) { map.delete(opId); },
    async clear() { map.clear(); },
    _size: () => map.size,
  };
}

function structuredCloneSafe(v) { return JSON.parse(JSON.stringify(v)); }

export function createLocalStorageAdapter({ storage = globalThis.localStorage, key = "cafenet_sync_queue" } = {}) {
  const read = () => { try { const v = JSON.parse(storage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = (rows) => { storage.setItem(key, JSON.stringify(rows)); };
  return {
    kind: "localStorage",
    async getAll() { return read(); },
    async put(op) { const rows = read().filter((o) => o.opId !== op.opId); rows.push(op); write(rows); },
    async putMany(ops) { const ids = new Set(ops.map((o) => o.opId)); write([...read().filter((o) => !ids.has(o.opId)), ...ops]); },
    async delete(opId) { write(read().filter((o) => o.opId !== opId)); },
    async clear() { try { storage.removeItem(key); } catch { /* ignore */ } },
  };
}

export function createIndexedDbAdapter({ dbName = "cafenet-sync", storeName = "ops", idb = globalThis.indexedDB } = {}) {
  let dbPromise = null;
  const open = () => dbPromise || (dbPromise = new Promise((resolve, reject) => {
    const req = idb.open(dbName, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "opId" }); };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
    req.onerror = () => { dbPromise = null; reject(req.error || new Error("indexedDB open failed")); };
    req.onblocked = () => { dbPromise = null; reject(new Error("indexedDB blocked")); };
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      let result;
      try { result = fn(store); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);   // resolved only after the commit → durable
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("indexedDB transaction aborted"));
    });
  };
  return {
    kind: "indexedDB",
    getAll: () => tx("readonly", (s) => s.getAll()).then((r) => r || []),
    put: (op) => tx("readwrite", (s) => { s.put(op); }),
    putMany: (ops) => tx("readwrite", (s) => { ops.forEach((o) => s.put(o)); }),
    delete: (opId) => tx("readwrite", (s) => { s.delete(opId); }),
    clear: () => tx("readwrite", (s) => { s.clear(); }),
  };
}

// Picks the best available adapter. IndexedDB is verified with a real open() so private-mode failures fall back safely.
export async function pickAdapter(globals = globalThis) {
  if (globals.indexedDB) {
    try { const a = createIndexedDbAdapter({ idb: globals.indexedDB }); await a.getAll(); return a; } catch { /* fall through */ }
  }
  try { if (globals.localStorage) return createLocalStorageAdapter({ storage: globals.localStorage }); } catch { /* fall through */ }
  return createMemoryAdapter();
}
