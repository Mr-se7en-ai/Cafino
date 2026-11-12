// ورود مهمان — محیط آزمایشی کاملاً جدا از داده‌های واقعی.
//  • پرچم مهمان در sessionStorage همان زبانه است (با بستن پنجره پایان می‌یابد؛ با یک‌بار دیگر باز کردن برنامه بقایای آن هم پاک می‌شود).
//  • در حالت مهمان همهٔ کلیدهای «cafenet_*» در localStorage با پیشوند جدا خوانده/نوشته می‌شوند و نام پایگاه‌های IndexedDB پسوند __guest می‌گیرد،
//    پس هیچ‌چیز از داده‌های واقعی دیده یا عوض نمی‌شود. نشانی سرور هم در این فضا خالی است، یعنی هیچ درخواست و همگام‌سازی‌ای به سرور نمی‌رود.
//  • این ماژول به هیچ ماژول دیگری وابسته نیست تا پیش از همه بارگذاری شود (index.jsx اول از همه آن را import می‌کند).
export const GUEST_FLAG = "cafenet_guest_mode";           // sessionStorage
export const GUEST_NS = "cafenet_guest__";               // پیشوند کلیدهای localStorage
export const GUEST_EMAIL = "guest@cafino.local";
export const GUEST_HEARTBEAT = "cafenet_guest_alive";    // localStorage (واقعی): زمان آخرین نشانهٔ حیات یک زبانهٔ مهمان
const IDB_SUFFIX = "__guest";
const STALE_MS = 30000;

export function isGuestMode() {
  try { return globalThis.sessionStorage?.getItem(GUEST_FLAG) === "1"; } catch { return false; }
}

let installed = false;
let raw = null;     // متدهای اصلی Storage (بدون نگاشت)

function rawStorage() {
  const proto = Storage.prototype;
  return raw ||= { get: proto.getItem, set: proto.setItem, remove: proto.removeItem, key: proto.key, clear: proto.clear, len: Object.getOwnPropertyDescriptor(proto, "length")?.get };
}

const realKeys = (ls) => { const r = rawStorage(), out = [], n = r.len.call(ls); for (let i = 0; i < n; i++) out.push(r.key.call(ls, i)); return out; };

export function installGuestIsolation() {
  if (installed || !isGuestMode() || typeof Storage === "undefined") return;
  installed = true;
  const ls = globalThis.localStorage, proto = Storage.prototype, r = rawStorage();
  const map = (k) => { const s = String(k); return s.startsWith("cafenet_") ? GUEST_NS + s : s; };
  // کلیدهایی که مهمان می‌بیند: کلیدهای غیر cafenet_ + کلیدهای فضای مهمان (بدون پیشوند)
  const visible = () => realKeys(ls).filter((k) => k.startsWith(GUEST_NS) || !k.startsWith("cafenet_")).map((k) => (k.startsWith(GUEST_NS) ? k.slice(GUEST_NS.length) : k));
  proto.getItem = function (k) { return this === ls ? r.get.call(this, map(k)) : r.get.call(this, k); };
  proto.setItem = function (k, v) { return this === ls ? r.set.call(this, map(k), v) : r.set.call(this, k, v); };
  proto.removeItem = function (k) { return this === ls ? r.remove.call(this, map(k)) : r.remove.call(this, k); };
  proto.key = function (i) { return this === ls ? (visible()[i] ?? null) : r.key.call(this, i); };
  proto.clear = function () { if (this !== ls) return r.clear.call(this); realKeys(ls).filter((k) => k.startsWith(GUEST_NS)).forEach((k) => r.remove.call(ls, k)); };
  if (r.len) Object.defineProperty(proto, "length", { configurable: true, get() { return this === ls ? visible().length : r.len.call(this); } });
  try {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...rest) { const n = String(name); return open.call(this, n.endsWith(IDB_SUFFIX) ? n : n + IDB_SUFFIX, ...rest); };
  } catch { /* بدون IndexedDB */ }
  const beat = () => { try { r.set.call(ls, GUEST_HEARTBEAT, String(Date.now())); } catch { /* ignore */ } };
  beat(); const hb = setInterval(beat, 8000); hb?.unref?.();
  globalThis.addEventListener?.("pagehide", () => { try { r.remove.call(ls, GUEST_HEARTBEAT); } catch { /* ignore */ } });
}

function purgeGuestStorage() {
  const ls = globalThis.localStorage, r = rawStorage();
  realKeys(ls).filter((k) => k.startsWith(GUEST_NS)).forEach((k) => r.remove.call(ls, k));
  try { r.remove.call(ls, GUEST_HEARTBEAT); } catch { /* ignore */ }
  try { globalThis.indexedDB?.databases?.().then((dbs) => (dbs || []).forEach((d) => d.name && d.name.endsWith(IDB_SUFFIX) && globalThis.indexedDB.deleteDatabase(d.name))).catch(() => {}); } catch { /* ignore */ }
}

// بقایای یک نشست مهمانِ بسته‌شده را پاک می‌کند (فقط وقتی هیچ زبانهٔ مهمان زنده‌ای نیست).
export function purgeStaleGuestData(now = Date.now()) {
  if (isGuestMode() || typeof Storage === "undefined") return false;
  try {
    const ls = globalThis.localStorage, r = rawStorage();
    const beat = Number(r.get.call(ls, GUEST_HEARTBEAT)) || 0;
    if (beat && now - beat < STALE_MS) return false;
    if (!realKeys(ls).some((k) => k.startsWith(GUEST_NS))) return false;
    purgeGuestStorage(); return true;
  } catch { return false; }
}

export function enterGuestMode() {
  try { globalThis.sessionStorage.setItem(GUEST_FLAG, "1"); } catch { return false; }
  globalThis.location.reload(); return true;
}

export function exitGuestMode() {
  purgeGuestStorage();
  try { globalThis.sessionStorage.removeItem(GUEST_FLAG); } catch { /* ignore */ }
  globalThis.location.reload();
}

// بازنشانی: داده‌های آزمایشی پاک و دوباره با نمونه پر می‌شوند (همچنان مهمان).
export function resetGuestData() {
  purgeGuestStorage();
  globalThis.location.reload();
}
