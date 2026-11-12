// ورود مهمان — داده‌های نمونه با موتورهای واقعی ساخته می‌شوند و هم‌خوان‌اند
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, stockOf } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); globalThis.sessionStorage.setItem("cafenet_guest_mode", "1"); globalThis.__resetStorage(); });
afterEach(() => { globalThis.sessionStorage.clear(); });

test("بدون پرچم مهمان هیچ دادهٔ نمونه‌ای ساخته نمی‌شود (داده‌های واقعی امن‌اند)", () => {
  globalThis.sessionStorage.clear();
  assert.equal(E.seedGuestData(), false);
  assert.equal(E.getSales().length, 0);
  assert.equal(E.ensureGuestSession(), null);
});

test("نمونه‌سازی: فروش، فاکتور، فروش آنلاین، هزینه، تعهد، کارمند و حقوق ماه", () => {
  assert.equal(E.seedGuestData(), true);
  const sales = E.getSales();
  assert.equal(sales.length, 6);
  assert.ok(sales.every((s) => !s.cancelled));
  assert.equal(sales.filter((s) => s.channel === "online").length, 1);
  assert.equal(E.lsRead("cafenet_invoices", []).length, 6);
  const tx = E.lsRead("cafenet_tx3", []);
  assert.ok(tx.some((t) => t.type === "income") && tx.some((t) => t.type === "expense" && t.category === "برق"));
  assert.ok(sales.some((s) => E.saleRemaining(s) > 0), "یک فروش نسیه برای دیدن بدهکاران");
  assert.equal(stockOf(1).qty, 370); assert.equal(stockOf(3).qty, 2);
  assert.equal(E.getEmployees().length, 2);
  assert.equal(E.getNotes().length, 1);
  assert.equal(E.getReminders().length, 2);
  assert.equal(E.lsRead("cafenet_obligations", []).filter((o) => o.kind === "salary").length, 2);
  assert.equal(E.lsRead("cafenet_obligations", []).filter((o) => o.kind === "rent" || o.kind === "cheque").length, 2);
});

test("نمونه‌سازی فقط یک‌بار انجام می‌شود و نشست مهمان ساخته می‌شود", () => {
  assert.equal(E.seedGuestData(), true);
  assert.equal(E.seedGuestData(), false);
  assert.equal(E.getSales().length, 6);
  assert.equal(E.ensureGuestSession(), "guest@cafino.local");
  assert.equal(E.ensureGuestSession(), "guest@cafino.local");
});
