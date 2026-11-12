// All-or-nothing unit of work for the local-first data layer.
//
//   runTransaction("sale.create", () => { …several lsWrite() calls… })
//
// • Copy-on-write undo log: the first write to a key inside a transaction remembers the key's previous raw value.
// • Any exception, any failed write (quota, serialisation) or a result that says {ok:false} restores every touched key,
//   so a sale can never be left half-saved (invoice without payment, payment without ledger entry, …).
// • Side effects that must only happen for a COMMITTED change (sync-queue operations, UI refresh events) are registered with
//   afterCommit(); on rollback they are dropped.
// • Nested transactions join the outer one (the outermost call owns commit/rollback).

let current = null;                       // { depth, undo: Map<storage, Map<key, string|null>>, after: Function[] }

export const inTransaction = () => current !== null;

function storageOf(storage) { return storage === undefined ? globalThis.localStorage : storage; }

// Called by the repository right BEFORE it mutates a key.
export function recordBeforeWrite(key, storage) {
  if (!current) return;
  const store = storageOf(storage);
  if (!store) return;
  let perStore = current.undo.get(store);
  if (!perStore) { perStore = new Map(); current.undo.set(store, perStore); }
  if (perStore.has(key)) return;
  let raw = null;
  try { raw = store.getItem(key); } catch { raw = null; }
  perStore.set(key, raw);
}

// Runs `fn` after the outermost transaction commits (immediately when there is no transaction).
export function afterCommit(fn) {
  if (current) current.after.push(fn);
  else { try { fn(); } catch { /* side effects must not break the caller */ } }
}

function restore(undo) {
  const failed = [];
  for (const [store, keys] of undo) {
    for (const [key, raw] of keys) {
      try { if (raw === null) store.removeItem(key); else store.setItem(key, raw); } catch { failed.push(key); }
    }
  }
  return failed;
}

// → { ok: true, value } | { ok: false, error, rolledBack: true, restoreFailed: string[] }
export function runTransaction(name, fn, { rollbackIf = (v) => v && v.ok === false, onRollback } = {}) {
  if (current) {                         // nested: join the outer transaction
    current.depth += 1;
    try { return { ok: true, value: fn() }; }
    catch (error) { return { ok: false, error, rolledBack: false }; }
    finally { current.depth -= 1; }
  }
  const tx = current = { name, depth: 1, undo: new Map(), after: [] };
  let value, error = null, failed = false;
  try { value = fn(); } catch (e) { failed = true; error = e; }
  current = null;
  if (!failed && rollbackIf(value)) { failed = true; }
  if (failed) {
    const restoreFailed = restore(tx.undo);
    try { onRollback?.(); } catch { /* ignore */ }
    return error ? { ok: false, error, rolledBack: true, restoreFailed, value } : { ok: true, value, rolledBack: true, restoreFailed };
  }
  tx.after.forEach((f) => { try { f(); } catch { /* ignore */ } });
  return { ok: true, value };
}
