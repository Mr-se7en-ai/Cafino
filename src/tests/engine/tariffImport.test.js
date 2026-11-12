// ورود تعرفه از Excel/CSV: تشخیص ستون‌ها، قیمت فارسی، CSV ویندوزی، دسته‌ها، خطاها، مقایسه
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const build = (rows, o) => E.buildTariffFromSheets([{ name: "Sheet1", rows }], o);

test("parsePrice: ارقام فارسی/عربی، جداکننده، واحد، توافقی و مقدار نامعتبر", () => {
  const p = (v) => E.parsePrice(v);
  assert.equal(p("۱٬۲۳۴٬۵۰۰").price, 1234500);
  assert.equal(p("1,234,500 ریال").price, 1234500);
  assert.equal(p("٣٥٠٠").price, 3500);
  assert.equal(p(2040000).price, 2040000);
  assert.equal(p("").price, 0); assert.equal(p(null).price, 0);
  assert.equal(p("توافقی").price, 0); assert.equal(p("توافقی").negotiable, true);
  assert.equal(p("12.6").price, 13);
  assert.equal(p("abc").ok, false); assert.equal(p(-5).ok, false); assert.equal(p(1e15).ok, false); assert.equal(p(NaN).ok, false);
});

test("ستون‌ها با هر ترتیب و عنوان فارسی/انگلیسی شناخته می‌شوند", () => {
  const r = build([["توضیحات", "قیمت (ریال)", "نام خدمت", "دسته‌بندی"], ["بدون حجم", 595000, "اینترنت - یک ربع", "خدمات سیستم"], ["", "۳٬۱۸۸٬۰۰۰", "ثبت‌نام", "ثبت‌نام اینترنتی"]]);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.data.map((g) => g.cat), ["خدمات سیستم", "ثبت‌نام اینترنتی"]);
  assert.deepEqual(r.data[0].items[0], { id: 1, name: "اینترنت - یک ربع", price: 595000, note: "بدون حجم" });
  assert.deepEqual(r.data[1].items[0], { id: 2, name: "ثبت‌نام", price: 3188000 }, "توضیح خالی کلید note نمی‌سازد");
  const en = build([["Category", "Service", "Price"], ["A", "x", 10]]);
  assert.equal(en.data[0].items[0].price, 10);
});

test("بدون ستون دسته: ردیفِ فقط‌نام = عنوان دسته؛ ردیف‌های قبل از آن «سایر»", () => {
  const r = build([["تعرفه اتحادیه"], [], ["خدمت", "قیمت"], ["کپی", 1000], ["گروه الف"], ["الف۱", 5], ["الف۲", "توافقی"], ["گروه ب"], ["ب۱", 7]]);
  assert.deepEqual(r.data.map((g) => g.cat), ["سایر", "گروه الف", "گروه ب"]);
  assert.equal(r.data[1].items.length, 2);
  assert.equal(r.data[1].items[1].price, 0);
  assert.equal(build([["خدمت", "قیمت"], ["گروه", ""], ["الف", 5]]).data[0].cat, "گروه", "قیمتِ خالیِ بدون توضیح = عنوان دسته (در پیش‌نمایش دیده می‌شود)");
});

test("خطاها: بدون عنوان ستون، نام خالی، قیمت غیرعددی؛ ردیف خوب‌ها حفظ می‌شوند", () => {
  const none = build([["الف", "ب"], ["x", "y"]]);
  assert.equal(none.data.length, 0); assert.ok(none.errors[0].msg.includes("عنوان ستون"));
  const r = build([["دسته", "خدمت", "قیمت"], ["A", "خوب", 100], ["A", "", 5], ["A", "بد", "ده تومن"], ["A", "خوب", 200]]);
  assert.equal(r.data[0].items.length, 1);
  assert.equal(r.errors.length, 2); assert.deepEqual(r.errors.map((e) => e.row), [3, 4]);
  assert.ok(r.warnings.some((w) => /تکراری/.test(w.msg)) && r.data[0].items[0].price === 100, "تکراری: اولی می‌ماند");
});

test("واحد تومان ×۱۰ می‌شود و از عنوان ستون تشخیص داده می‌شود", () => {
  const rows = [["دسته", "خدمت", "قیمت (تومان)"], ["A", "x", 1500]];
  const r = build(rows, { unit: "toman" });
  assert.equal(r.data[0].items[0].price, 15000); assert.equal(r.detectedUnit, "toman");
  assert.equal(build(rows, { unit: "rial" }).data[0].items[0].price, 1500);
});

test("چند شیت: نام شیت دسته می‌شود؛ شیت بی‌عنوان نادیده؛ دستهٔ هم‌نام ادغام", () => {
  const r = E.buildTariffFromSheets([
    { name: "کپی", rows: [["خدمت", "قیمت"], ["A4", 1000]] },
    { name: "Sheet2", rows: [["خدمت", "قیمت"], ["x", 5]] },
    { name: "یادداشت", rows: [["فقط متن"]] },
    { name: "کپی", rows: [["خدمت", "قیمت"], ["A3", 2000]] },
  ]);
  assert.deepEqual(r.data.map((g) => g.cat), ["کپی", "سایر"]);
  assert.deepEqual(r.data[0].items.map((i) => i.id), [1, 2], "شناسه‌ها پشت‌سرهم و یکتا");
  assert.ok(r.warnings.some((w) => /یادداشت/.test(w.msg)));
  assert.equal(r.errors.length, 0);
});

test("CSV: جداکنندهٔ ; و تب، گیومه، BOM و کدگذاری ویندوز-۱۲۵۶", () => {
  const rows = E.parseCsv('﻿دسته;خدمت;قیمت\r\nالف;"یک; دو";۱٬۰۰۰\r\nالف;"با ""گیومه""";2000\r\n');
  assert.equal(rows.length, 3); assert.equal(rows[1][1], "یک; دو"); assert.equal(rows[2][1], 'با "گیومه"');
  const tab = E.parseCsv("خدمت\tقیمت\nx\t5");
  assert.deepEqual(tab[1], ["x", "5"]);
  const r = build(rows); assert.equal(r.data[0].items[0].price, 1000);
  // windows-1256: «قیمت» (ق=0xDE ی=0xED م=0xE3 ت=0xCA) و «خدمت» (خ=0xCE د=0xCF م=0xE3 ت=0xCA)
  const w1256 = new Uint8Array([0xCE, 0xCF, 0xE3, 0xCA, 0x2C, 0xDE, 0xED, 0xE3, 0xCA, 0x0A, 0x78, 0x2C, 0x35]);
  const txt = E.decodeCsvBuffer(w1256); assert.ok(txt.startsWith("خدمت,قيمت") || txt.startsWith("خدمت,قیمت"), txt);
  assert.equal(build(E.parseCsv(txt)).data[0].items[0].price, 5);
  assert.equal(E.decodeCsvBuffer(new TextEncoder().encode("﻿خدمت,قیمت")).startsWith("خدمت"), true);
});

test("diffTariffs و tariffToAoa: رفت‌وبرگشت بی‌تغییر", () => {
  const old = [{ cat: "A", items: [{ id: 1, name: "x", price: 10 }, { id: 2, name: "y", price: 20 }] }];
  const nw = [{ cat: "A", items: [{ id: 1, name: "x", price: 10 }, { id: 2, name: "y", price: 25 }, { id: 3, name: "z", price: 1 }] }, { cat: "B", items: [{ id: 4, name: "x", price: 1 }] }];
  assert.deepEqual(E.diffTariffs(old, nw), { added: 2, removed: 0, changed: 1, same: 1, oldCount: 2, newCount: 4 });
  const again = build(E.tariffToAoa(E.DEFAULT_TARIFF_DATA));
  assert.equal(again.errors.length, 0);
  assert.deepEqual(again.data.map((g) => ({ c: g.cat, i: g.items.map((i) => [i.name, i.price]) })), E.DEFAULT_TARIFF_DATA.map((g) => ({ c: g.cat, i: g.items.map((i) => [i.name, i.price]) })), "خروجی نمونه دوباره بدون تغییر وارد می‌شود");
});
