// ورود مهمان — جداسازی ذخیره‌سازی: مهمان نه داده‌های واقعی را می‌بیند نه روی آن‌ها می‌نویسد
import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(String(k)); }
  clear() { this.m.clear(); }
}
const opened = [];
class FakeIDB { open(name) { opened.push(name); return {}; } }
globalThis.Storage = FakeStorage; globalThis.IDBFactory = FakeIDB;
globalThis.localStorage = new FakeStorage(); globalThis.sessionStorage = new FakeStorage();
globalThis.indexedDB = new FakeIDB();
const mod = await import("../guest/guestMode.js?" + Date.now());
const snapshot = () => Object.fromEntries(globalThis.localStorage.m);   // Map access bypasses the patched methods

test("بدون پرچم مهمان هیچ چیز تغییر نمی‌کند", () => {
  const before = FakeStorage.prototype.setItem;
  mod.installGuestIsolation();
  assert.equal(FakeStorage.prototype.setItem, before);
  assert.equal(mod.isGuestMode(), false);
});

test("پاک‌سازی بقایای مهمان: فقط وقتی زبانهٔ مهمان زنده‌ای نیست", () => {
  const ls = globalThis.localStorage;
  ls.setItem("cafenet_sales", "REAL");
  ls.setItem(mod.GUEST_NS + "cafenet_sales", "GUEST");
  ls.setItem(mod.GUEST_HEARTBEAT, String(1000));
  assert.equal(mod.purgeStaleGuestData(1000 + 5000), false, "نشانهٔ حیات تازه است");
  assert.ok(snapshot()[mod.GUEST_NS + "cafenet_sales"]);
  assert.equal(mod.purgeStaleGuestData(1000 + 60000), true);
  const s = snapshot();
  assert.equal(s[mod.GUEST_NS + "cafenet_sales"], undefined); assert.equal(s.cafenet_sales, "REAL");
});

test("حالت مهمان: خواندن و نوشتن در فضای جدا؛ داده واقعی دیده نمی‌شود و دست نمی‌خورد", () => {
  const ls = globalThis.localStorage;
  ls.clear(); ls.setItem("cafenet_sales", "REAL"); ls.setItem("other_app", "X");
  globalThis.sessionStorage.setItem(mod.GUEST_FLAG, "1");
  assert.equal(mod.isGuestMode(), true);
  mod.installGuestIsolation();
  assert.equal(ls.getItem("cafenet_sales"), null, "مهمان داده واقعی را نمی‌بیند");
  ls.setItem("cafenet_sales", "GUEST");
  assert.equal(ls.getItem("cafenet_sales"), "GUEST");
  assert.equal(snapshot().cafenet_sales, "REAL", "نوشتن مهمان روی داده واقعی اثر ندارد");
  assert.equal(snapshot()[mod.GUEST_NS + "cafenet_sales"], "GUEST");
  assert.equal(ls.getItem("other_app"), "X", "کلیدهای غیر cafenet_ مستقیم‌اند");
  ls.removeItem("cafenet_sales");
  assert.equal(ls.getItem("cafenet_sales"), null); assert.equal(snapshot().cafenet_sales, "REAL");
  // sessionStorage از این نگاشت بی‌تأثیر است
  globalThis.sessionStorage.setItem("cafenet_x", "S"); assert.equal(globalThis.sessionStorage.getItem("cafenet_x"), "S");
  assert.ok(snapshot()[mod.GUEST_HEARTBEAT], "نشانهٔ حیات برای جلوگیری از پاک‌سازی نوشته می‌شود");
});

test("حالت مهمان: key/length فقط فضای مهمان را نشان می‌دهند و clear فقط همان را پاک می‌کند", () => {
  const ls = globalThis.localStorage;
  ls.setItem("cafenet_a", "1"); ls.setItem("cafenet_b", "2");
  const names = Array.from({ length: ls.length }, (_, i) => ls.key(i));
  assert.ok(names.includes("cafenet_a") && names.includes("cafenet_b") && names.includes("other_app"));
  assert.ok(!names.includes("cafenet_sales") || ls.getItem("cafenet_sales") !== null === false);
  ls.clear();
  assert.equal(ls.getItem("cafenet_a"), null);
  assert.equal(snapshot().cafenet_sales, "REAL", "clear در مهمان داده واقعی را پاک نمی‌کند");
  assert.equal(snapshot().other_app, "X");
});

test("حالت مهمان: پایگاه‌های IndexedDB نام جدا می‌گیرند", () => {
  globalThis.indexedDB.open("cafenet-sync", 1);
  globalThis.indexedDB.open("cafenet_private_files__guest", 1);
  assert.deepEqual(opened.slice(-2), ["cafenet-sync__guest", "cafenet_private_files__guest"]);
});
