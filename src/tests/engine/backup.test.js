// Backup / export / import / restore / undo — the REAL backup code with an in-memory localStorage.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, item, T } from "./helpers.js";

let E;
const raw = (k) => globalThis.__storage.getItem(k);
beforeEach(() => { E = fresh(); E.createSale({ customerId: 1, items: [item({ price: T(10000), qty: 2 })], payments: [{ method: "cash", amount: T(5000) }] }); });

test("Export: فایل پشتیبان ساختار، شمارندهٔ بخش‌ها و کنترل صحت دارد", async () => {
  const p = await E.buildBackupPayload("full");
  assert.equal(p.app, "cafenet-accounting"); assert.ok(p.sections > 3); assert.match(p.checksum, /^[a-f0-9]{64}$/);
  assert.ok(p.data.cafenet_sales && p.data.cafenet_customers && p.data.cafenet_tx3);
  const fin = await E.buildBackupPayload("financial"); assert.ok(fin.data.cafenet_sales); assert.equal(fin.data.cafenet_inventory, undefined);
});

test("Import: خروجی → پاک‌کردن داده → بازیابی؛ همهٔ داده‌ها دقیقاً برمی‌گردند", async () => {
  const before = { s: raw("cafenet_sales"), t: raw("cafenet_tx3"), c: raw("cafenet_customers"), l: raw("cafenet_ledger2") };
  const text = JSON.stringify(await E.buildBackupPayload("full"));
  globalThis.__resetStorage(); assert.equal(raw("cafenet_sales"), null);
  const payload = await E.parseBackupFile(text); assert.ok(payload.data);
  E.restoreBackup(text);
  assert.equal(raw("cafenet_sales"), before.s); assert.equal(raw("cafenet_tx3"), before.t); assert.equal(raw("cafenet_ledger2"), before.l);
  assert.equal(JSON.parse(raw("cafenet_customers")).length, JSON.parse(before.c).length);
});

test("رمز درست: فایل رمزگذاری‌شده با AES-GCM باز می‌شود و محتوا در فایل خوانا نیست", async () => {
  const p = await E.buildBackupPayload("full");
  const env = await E.encryptBackupPayload(p, "S3cret-پسورد");
  const text = JSON.stringify(env);
  assert.equal(env.encrypted, true); assert.ok(!text.includes("cafenet_sales")); assert.ok(!text.includes("علی"));
  const back = await E.parseBackupFile(text, "S3cret-پسورد"); assert.equal(back.checksum, p.checksum);
});

test("Wrong password: رمز اشتباه رد می‌شود و بدون رمز، درخواست رمز می‌دهد؛ هیچ داده‌ای تغییر نمی‌کند", async () => {
  const text = JSON.stringify(await E.encryptBackupPayload(await E.buildBackupPayload("full"), "right-password"));
  const before = raw("cafenet_sales");
  await assert.rejects(() => E.parseBackupFile(text, "wrong-password"), /رمز فایل اشتباه/);
  await assert.rejects(() => E.parseBackupFile(text), (e) => e.needPassword === true);
  assert.equal(raw("cafenet_sales"), before);
});

test("Corrupt backup: JSON خراب، فایل غیر مرتبط، بخش خراب و دست‌کاری‌شده همه رد می‌شوند و چیزی نوشته نمی‌شود", async () => {
  const good = await E.buildBackupPayload("full");
  const snapshot = JSON.stringify([...Array(globalThis.__storage.length).keys()].map((i) => { const k = globalThis.__storage.key(i); return [k, raw(k)]; }));
  const bad = [
    "این JSON نیست {", JSON.stringify({ app: "other" }), JSON.stringify({ app: "cafenet-accounting" }),
    JSON.stringify({ ...good, data: { ...good.data, cafenet_sales: "{{{ not json" } }),
    JSON.stringify({ ...good, data: { ...good.data, cafenet_tx3: good.data.cafenet_tx3.replace("income", "expense") } }),   // tampered → checksum
  ];
  for (const [i, b] of bad.entries()) {
    await assert.rejects(() => E.parseBackupFile(b), Error);          // the app always parses (structure + checksum) before it restores
    if (i < 4) assert.throws(() => E.restoreBackup(b), Error);        // structural problems are also caught by restore itself
  }
  const after = JSON.stringify([...Array(globalThis.__storage.length).keys()].map((i) => { const k = globalThis.__storage.key(i); return [k, raw(k)]; }));
  assert.equal(after, snapshot);                                       // nothing was written, no restore snapshot either
  assert.equal(E.hasPreRestoreSnapshot(), false);
});

test("Restore + Undo restore: بازیابی نسخهٔ قبلی، سپس واگرد دقیقاً وضعیت فعلی را برمی‌گرداند", async () => {
  const oldBackup = JSON.stringify(await E.buildBackupPayload("full"));
  E.createSale({ customerId: 2, items: [item({ price: T(20000), qty: 1 })], payments: [{ method: "cash", amount: T(20000) }] });   // newer work
  assert.equal(E.getSales().length, 2); const current = raw("cafenet_sales");
  E.restoreBackup(oldBackup);
  assert.equal(E.getSales().length, 1); assert.equal(E.hasPreRestoreSnapshot(), true);
  E.undoRestoreFromSnapshot();
  assert.equal(raw("cafenet_sales"), current); assert.equal(E.getSales().length, 2);
});

test("Undo بدون نسخهٔ قبل از بازیابی خطا می‌دهد", () => {
  globalThis.__storage.removeItem("cafenet_prerestore_snapshot");
  assert.throws(() => E.undoRestoreFromSnapshot(), /موجود نیست/);
});
