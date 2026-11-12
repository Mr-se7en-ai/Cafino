// خواندن امن Excel: فایل‌های واقعی xlsx/xls/csv-ساختگی، zip-bomb، ZIP خراب، مسیر مشکوک، ماکرو، نام شیت خطرناک، سقف‌ها
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import * as XLSX from "xlsx";
import * as E from "./.build/engine.mjs";

const real = (aoa, sheet = "تعرفه") => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet); return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })); };
// نویسندهٔ ZIP حداقلی برای ساخت فایل‌های مخرب (اندازه‌های اعلام‌شده را می‌توان دروغ گفت)
function zip(entries, { lie = {} } = {}) {
  const parts = [], cd = []; let off = 0;
  for (const [name, data, flags = 0] of entries) {
    const nb = Buffer.from(name), raw = Buffer.from(data), c = zlib.deflateRawSync(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(c.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(flags, 8); h.writeUInt16LE(8, 10); h.writeUInt32LE(c.length, 20); h.writeUInt32LE(lie[name] ?? raw.length, 24); h.writeUInt16LE(nb.length, 28); h.writeUInt32LE(off, 42);
    parts.push(lh, nb, c); cd.push(h, nb); off += 30 + nb.length + c.length;
  }
  const cdb = Buffer.concat(cd), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cdb, end]));
}
const minimal = (extra = []) => [["[Content_Types].xml", "<Types/>"], ["xl/workbook.xml", "<workbook/>"], ...extra];

test("xlsx واقعی: خوانده می‌شود؛ اعداد، متن فارسی و سطرهای خالی حفظ", () => {
  const f = real([["خدمت", "قیمت"], ["پرینت A4", 1500], ["اسکن", 3000]]);
  const r = E.readSheetsSafe(XLSX, f);
  assert.equal(r.kind, "xlsx"); assert.equal(r.sheets.length, 1); assert.equal(r.sheets[0].name, "تعرفه");
  assert.deepEqual(r.sheets[0].rows, [["خدمت", "قیمت"], ["پرینت A4", 1500], ["اسکن", 3000]]);
});
test("xls قدیمی (BIFF/CFB) پذیرفته و خوانده می‌شود", () => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["a", 1]]), "S");
  const r = E.readSheetsSafe(XLSX, new Uint8Array(XLSX.write(wb, { type: "array", bookType: "biff8" })));
  assert.equal(r.kind, "xls"); assert.deepEqual(r.sheets[0].rows, [["a", 1]]);
});
test("رد: فایل خالی، غیر Excel، حجم زیاد، ZIP خراب", () => {
  assert.throws(() => E.inspectContainer(new Uint8Array(3)), /خالی|خراب/);
  assert.throws(() => E.inspectContainer(new TextEncoder().encode("hello world, not a spreadsheet")), /قالب/);
  assert.throws(() => E.inspectContainer(new Uint8Array(E.XLSX_LIMITS.maxBytes + 1)), /مگابایت/);
  const f = real([["a"]]); assert.throws(() => E.inspectContainer(f.subarray(0, f.length - 10)), /ZIP/);
});
test("رد: zip-bomb (اندازهٔ باز‌شده/نسبت فشرده‌سازی)، تعداد زیاد ورودی، مسیر مشکوک، رمزگذاری، ماکرو، بدون ساختار xlsx", () => {
  const big = Buffer.alloc(5 * 1024 * 1024, 0);                                                    // ۵MB صفر → فشرده‌شده چند KB
  assert.throws(() => E.inspectContainer(zip(minimal([["xl/worksheets/sheet1.xml", big]]))), /نسبت فشرده/);
  assert.throws(() => E.inspectContainer(zip(minimal([["xl/worksheets/sheet1.xml", "x"]]), { lie: { "xl/worksheets/sheet1.xml": 40 * 1024 * 1024 } })), /بزرگ/, "اندازهٔ اعلامی بزرگ");
  assert.throws(() => E.inspectContainer(zip(Array.from({ length: 301 }, (_, i) => [`xl/f${i}.xml`, "x"]))), /تعداد بخش/);
  assert.throws(() => E.inspectContainer(zip(minimal([["../../evil.txt", "x"]]))), /مسیر/);
  assert.throws(() => E.inspectContainer(zip(minimal([["xl\\a.xml", "x"]]))), /مسیر/);
  assert.throws(() => E.inspectContainer(zip(minimal([["xl/a.xml", "x", 1]]))), /رمزگذاری/);
  assert.throws(() => E.inspectContainer(zip(minimal([["xl/vbaProject.bin", "x"]]))), /ماکرو/);
  assert.throws(() => E.inspectContainer(zip([["readme.txt", "hi"]])), /معتبر/);
  assert.equal(E.inspectContainer(zip(minimal())).kind, "xlsx");
});
test("رد: نام شیت خطرناک (__proto__/constructor)؛ prototype سراسری دست‌نخورده می‌ماند", () => {
  for (const nm of ["__proto__", "constructor", "prototype"]) {
    const f = real([["x", 1]], nm.slice(0, 31));
    assert.throws(() => E.readSheetsSafe(XLSX, f), /نام شیت|تغییر ساختار|خواندن فایل/, nm);
  }
  assert.equal({}.polluted, undefined); assert.equal(Object.getOwnPropertyNames(Object.prototype).includes("polluted"), false);
});
test("سقف‌ها: ستون، سطر، سلول، شیت و طول متن", () => {
  const L = { ...E.XLSX_LIMITS, maxCols: 5, maxRows: 10, maxCells: 30, maxSheets: 2, maxText: 8 };
  assert.throws(() => E.readSheetsSafe(XLSX, real([Array.from({ length: 6 }, (_, i) => i)]), L), /ستون/);
  const rows = E.readSheetsSafe(XLSX, real(Array.from({ length: 50 }, (_, i) => [i])), L).sheets[0].rows; assert.equal(rows.length, 10, "سطرها بریده می‌شوند");
  assert.throws(() => E.readSheetsSafe(XLSX, real(Array.from({ length: 10 }, () => [1, 2, 3, 4, 5])), L), /سلول/);
  const wb = XLSX.utils.book_new(); for (const n of ["a", "b", "c"]) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[1]]), n);
  assert.throws(() => E.readSheetsSafe(XLSX, new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), L), /شیت/);
  assert.equal(E.readSheetsSafe(XLSX, real([["x".repeat(100)]]), L).sheets[0].rows[0][0].length, 8);
});
test("فرمول و HTML در خروجی نمی‌آیند و اجرا نمی‌شوند (فقط مقدار)", () => {
  const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet([["=1+1", "<img src=x onerror=alert(1)>"]]); ws.C1 = { t: "n", v: 2, f: "1+1" }; ws["!ref"] = "A1:C1";
  XLSX.utils.book_append_sheet(wb, ws, "S");
  const r = E.readSheetsSafe(XLSX, new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })));
  assert.equal(r.sheets[0].rows[0][2], 2); assert.equal(typeof r.sheets[0].rows[0][1], "string");
});
test("اگر کتابخانه prototype سراسری را آلوده کند: شناسایی، پاک‌سازی و رد فایل", () => {
  const evil = { read: () => { Object.prototype.polluted = "yes"; Array.prototype.polluted2 = 1; return { SheetNames: [], Sheets: {} }; }, utils: {} };
  assert.throws(() => E.readSheetsSafe(evil, real([["a"]])), /تغییر ساختار/);
  assert.equal({}.polluted, undefined); assert.equal([].polluted2, undefined);
});
