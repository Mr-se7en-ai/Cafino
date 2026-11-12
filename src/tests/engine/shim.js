// Minimal browser surface for running the app's data layer under node.
class MemStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(String(k)); }
  clear() { this.m.clear(); }
}
const ls = new MemStorage();
globalThis.localStorage = ls;
globalThis.sessionStorage = new MemStorage();
const target = new EventTarget();
globalThis.window = globalThis;
for (const f of ["addEventListener", "removeEventListener", "dispatchEvent"]) { if (typeof globalThis[f] !== "function") globalThis[f] = target[f].bind(target); }
globalThis.document = globalThis.document || { addEventListener() {}, removeEventListener() {}, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), visibilityState: "visible", documentElement: { style: {} }, head: { appendChild() {} }, body: { appendChild() {} } };
globalThis.__resetStorage = () => ls.clear();
globalThis.__storage = ls;

// fetch trampoline: the API client captures globalThis.fetch when it is created, so tests swap the target afterwards
globalThis.__fetchImpl = async () => { throw new TypeError("fetch not configured"); };
globalThis.fetch = (...a) => globalThis.__fetchImpl(...a);
