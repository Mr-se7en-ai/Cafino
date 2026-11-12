// تعرفه: گرد کردن قیمت‌ها، فایل تعرفهٔ شخصی (JPG/PDF) و نام اتحادیه
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); E.setTariffVaultForTests(E.createFileStore({ adapter: E.memoryAdapter() })); });
const fileOf = (name, type, size = 1000) => Object.assign(new Blob([new Uint8Array(size).fill(7)], { type }), { name });
const data = () => [
  { cat: "الف", items: [{ id: 1, name: "یک", price: 8_512_345 }, { id: 2, name: "دو", price: 1_700_000 }, { id: 3, name: "توافقی", price: 0 }] },
  { cat: "ب", items: [{ id: 4, name: "کوچک", price: 400 }, { id: 5, name: "گرد", price: 3_000_000 }] },
];

test("roundPrice: بالا / پایین / نزدیک‌ترین؛ صفر (توافقی) دست‌نخورده", () => {
  assert.equal(E.roundPrice(8_512_345, "up", 10_000), 8_520_000);
  assert.equal(E.roundPrice(8_512_345, "down", 10_000), 8_510_000);
  assert.equal(E.roundPrice(8_512_345, "nearest", 10_000), 8_510_000);
  assert.equal(E.roundPrice(8_515_000, "nearest", 10_000), 8_520_000);
  assert.equal(E.roundPrice(8_520_000, "up", 10_000), 8_520_000, "مضرب دقیق تغییر نمی‌کند");
  assert.equal(E.roundPrice(8_520_000, "down", 10_000), 8_520_000);
  assert.equal(E.roundPrice(0, "up", 10_000), 0);
  assert.throws(() => E.roundPrice(5, "sideways", 1000), TypeError);
  assert.throws(() => E.roundPrice(5, "up", 0), TypeError);
});

test("planRounding: فقط خواسته‌شده‌ها تغییر می‌کند؛ گردکردن به پایین قیمت مثبت را به صفر نمی‌رساند", () => {
  const d = data();
  const p = E.planRounding(d, { mode: "down", unit: 10_000 });
  assert.deepEqual(p.changed.map((c) => [c.id, c.before, c.after]), [[1, 8_512_345, 8_510_000]]);
  assert.deepEqual(p.skipped.map((c) => c.id), [4], "۴۰۰ ریال با واحد ۱۰٬۰۰۰ به صفر می‌رسید");
  assert.equal(p.data[1].items[0].price, 400);
  assert.equal(p.data[0].items[2].price, 0);
  assert.equal(p.unchanged, 2, "۱٬۷۰۰٬۰۰۰ و ۳٬۰۰۰٬۰۰۰ از قبل گردند");
  assert.equal(d[0].items[0].price, 8_512_345, "ورودی دست‌نخورده می‌ماند (تابع خالص)");
  const only = E.planRounding(d, { mode: "up", unit: 100_000, cat: "ب" });
  assert.deepEqual(only.changed.map((c) => c.id), [4], "فقط دستهٔ «ب»");
  assert.equal(only.data[0].items[0].price, 8_512_345);
  assert.equal(only.data[1].items[0].price, 100_000);
});

test("فایل تعرفه: فقط JPG/PDF تا ۵ مگابایت؛ آپلود فعال می‌شود، جایگزین قبلی می‌شود، حذف امن", async () => {
  assert.match(E.validateTariffFile(fileOf("a.png", "image/png")), /JPG و PDF/);
  assert.match(E.validateTariffFile(fileOf("big.pdf", "application/pdf", 5 * 1024 * 1024 + 1)), /۵ مگابایت/);
  assert.equal(E.validateTariffFile(fileOf("ok.jpg", "image/jpeg")), "");
  assert.equal(E.validateTariffFile({ name: "x.PDF", type: "", size: 10 }), "", "type خالی با پسوند pdf پذیرفته می‌شود");
  await assert.rejects(() => E.saveTariffFile(fileOf("a.gif", "image/gif")), /JPG و PDF/);
  assert.equal(E.getTariffFileMeta(), null);

  const m1 = await E.saveTariffFile(fileOf("نرخنامه.pdf", "application/pdf", 2048));
  assert.equal(m1.active, true); assert.equal(m1.type, "application/pdf"); assert.equal(E.getTariffFileMeta().name, "نرخنامه.pdf");
  const b1 = await E.loadTariffFileBlob(); assert.equal(b1.type, "application/pdf"); assert.equal(b1.size, 2048);

  const m2 = await E.saveTariffFile(fileOf("new.jpg", "image/jpeg", 500));
  assert.equal(m2.type, "image/jpeg"); assert.equal((await E.loadTariffFileBlob()).size, 500, "فایل جدید جایگزین فایل قبلی شد");

  assert.equal(E.setTariffFileActive(false).active, false); assert.equal(E.getTariffFileMeta().active, false);
  assert.equal(E.setTariffFileActive(true).active, true);
  await E.removeTariffFile();
  assert.equal(E.getTariffFileMeta(), null); assert.equal(await E.loadTariffFileBlob(), null);
});
