// ابزارهای PDF روی فایل‌های واقعی (ساخته‌شده با pdf-lib و تصویرهای واقعی JPG/PNG/WEBP): ترتیب صفحه‌ها، چرخش، جداسازی، استخراج، فشرده‌سازی، تصویر→PDF، خطاها.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PDFDocument, degrees } from "pdf-lib";
import { runOp, parseRanges, jpegOrientation, sniffImage, PdfToolError } from "../uploads/pdf/pdfOps.js";

const fx = (n) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
// PDF با N صفحه؛ عرض صفحهٔ i برابر 200+10*i است تا ترتیب صفحه‌ها قابل‌تشخیص باشد
async function makePdf(n, { name = "x" } = {}) {
  const d = await PDFDocument.create(); d.setTitle(name);
  for (let i = 1; i <= n; i++) d.addPage([200 + 10 * i, 300]).drawText(`page ${i}`, { x: 20, y: 150, size: 18 });
  return new Uint8Array(await d.save());
}
const widths = async (bytes) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));

test("parseRanges: بازه، فارسی، باز، ترتیب دلخواه و خطا", () => {
  assert.deepEqual(parseRanges("1-3, 5", 9), [1, 2, 3, 5]);
  assert.deepEqual(parseRanges("۲-۴،۸", 9), [2, 3, 4, 8]);
  assert.deepEqual(parseRanges("7-", 9), [7, 8, 9]); assert.deepEqual(parseRanges("-2", 9), [1, 2]);
  assert.deepEqual(parseRanges("3,1,3,2", 5), [3, 1, 2], "ترتیب حفظ و تکراری حذف");
  assert.deepEqual(parseRanges("4-2", 5), [4, 3, 2], "بازهٔ معکوس");
  for (const bad of ["", "0", "6", "a", "1--2", "2-9", "1,,x"]) assert.throws(() => parseRanges(bad, 5), (e) => e instanceof PdfToolError && e.code === "bad_range", bad);
});

test("ادغام: ترتیب فایل‌ها و صفحه‌ها حفظ می‌شود؛ کمتر از دو فایل خطا؛ فایل خراب خطای فارسی با نام", async () => {
  const a = await makePdf(2), b = await makePdf(3);
  const r = await runOp("mergePdfs", { files: [{ name: "a.pdf", bytes: a }, { name: "b.pdf", bytes: b }] });
  assert.equal(r.pages, 5); assert.deepEqual(await widths(r.bytes), [210, 220, 210, 220, 230]);
  const r2 = await runOp("mergePdfs", { files: [{ name: "b.pdf", bytes: b }, { name: "a.pdf", bytes: a }] });
  assert.deepEqual(await widths(r2.bytes), [210, 220, 230, 210, 220]);
  await assert.rejects(runOp("mergePdfs", { files: [{ name: "a.pdf", bytes: a }] }), { code: "need_two" });
  await assert.rejects(runOp("mergePdfs", { files: [{ name: "a.pdf", bytes: a }, { name: "bad.pdf", bytes: new Uint8Array([1, 2, 3]) }] }), (e) => e.code === "bad_pdf" && /bad\.pdf/.test(e.message));
});

test("استخراج صفحه‌ها: ترتیب دلخواه، تکرار و خارج از محدوده", async () => {
  const p = await makePdf(6);
  const r = await runOp("extractPages", { bytes: p, pages: [4, 2, 6] }); assert.deepEqual(await widths(r.bytes), [240, 220, 260]); assert.equal(r.pages, 3);
  await assert.rejects(runOp("extractPages", { bytes: p, pages: [7] }), { code: "bad_range" });
  await assert.rejects(runOp("extractPages", { bytes: p, pages: [] }), { code: "bad_range" });
  await assert.rejects(runOp("extractPages", { bytes: p, pages: [1.5] }), { code: "bad_range" });
});

test("جداسازی: هر N صفحه، بازه‌ها، تک‌تک؛ نام و مجموع صفحه‌ها؛ حالت بی‌معنی رد می‌شود", async () => {
  const p = await makePdf(5);
  const e2 = await runOp("splitPdf", { bytes: p, mode: "every", n: 2, baseName: "doc" });
  assert.deepEqual(e2.files.map((f) => [f.name, f.pages]), [["doc-1-2.pdf", 2], ["doc-3-4.pdf", 2], ["doc-5.pdf", 1]]);
  assert.deepEqual(await widths(e2.files[1].bytes), [230, 240]);
  const rg = await runOp("splitPdf", { bytes: p, mode: "ranges", ranges: "1-2, 4-5" });
  assert.deepEqual(rg.files.map((f) => f.pages), [2, 2]); assert.deepEqual(await widths(rg.files[1].bytes), [240, 250]);
  assert.equal((await runOp("splitPdf", { bytes: p, mode: "each" })).files.length, 5);
  await assert.rejects(runOp("splitPdf", { bytes: p, mode: "every", n: 9 }), { code: "no_split" });
  await assert.rejects(runOp("splitPdf", { bytes: p, mode: "ranges", ranges: "1-9" }), { code: "bad_range" });
  await assert.rejects(runOp("splitPdf", { bytes: p, mode: "zzz" }), { code: "bad_mode" });
});

test("چرخش: همه، صفحه‌های مشخص، چرخش مجدد جمع می‌شود، هر صفحه با زاویهٔ خودش؛ خطاها", async () => {
  const p = await makePdf(3);
  const angles = async (b) => (await PDFDocument.load(b)).getPages().map((x) => x.getRotation().angle);
  const all = await runOp("rotatePages", { bytes: p, degrees: 90 }); assert.deepEqual(await angles(all.bytes), [90, 90, 90]);
  const again = await runOp("rotatePages", { bytes: all.bytes, degrees: 180 }); assert.deepEqual(await angles(again.bytes), [270, 270, 270]);
  const back = await runOp("rotatePages", { bytes: again.bytes, degrees: 90 }); assert.deepEqual(await angles(back.bytes), [0, 0, 0], "۳۶۰ = صفر");
  assert.deepEqual(await angles((await runOp("rotatePages", { bytes: p, pages: [2], degrees: -90 })).bytes), [0, 270, 0]);
  assert.deepEqual(await angles((await runOp("rotatePages", { bytes: p, rotations: { 1: 90, 3: 180 } })).bytes), [90, 0, 180]);
  await assert.rejects(runOp("rotatePages", { bytes: p, degrees: 45 }), { code: "bad_angle" });
  await assert.rejects(runOp("rotatePages", { bytes: p, pages: [9], degrees: 90 }), { code: "bad_range" });
  await assert.rejects(runOp("rotatePages", { bytes: p, rotations: { 1: 360 } }), { code: "bad_range" }, "چرخش صفر = بدون تغییر");
  assert.equal((await widths(all.bytes)).length, 3, "اندازهٔ صفحه دست‌نخورده");
});

test("فشرده‌سازی سبک: خروجی سالم با همان تعداد صفحه؛ نتیجه ≤ ورودی+۵٪ برای فایل ساختاردار (اندازهٔ واقعی گزارش می‌شود)", async () => {
  const d = await PDFDocument.create(), png = fx("sq.png");
  for (let i = 0; i < 20; i++) { const img = await d.embedPng(png); const pg = d.addPage([300, 300]); pg.drawImage(img, { x: 10, y: 10, width: 100, height: 100 }); pg.drawText("text " + i, { x: 20, y: 200 }); }
  d.setTitle("t".repeat(200));
  const src = new Uint8Array(await d.save({ useObjectStreams: false }));
  const r = await runOp("compressLight", { bytes: src });
  assert.equal(r.pages, 20); assert.equal((await PDFDocument.load(r.bytes)).getPageCount(), 20);
  assert.equal(r.before, src.length); assert.equal(r.after, r.bytes.length);
  assert.ok(r.after <= src.length * 1.05, `${r.after} > ${src.length}`);
  console.log(`# compressLight: ${src.length} → ${r.after} بایت`);
});

test("تصویر → PDF: اندازهٔ A4/auto، جهت خودکار، fit، چند تصویر، جاسازی بدون افت؛ جهت EXIF شناخته می‌شود؛ تصویر/WEBP نامعتبر در Node خطا یا جایگزین", async () => {
  const land = fx("land.jpg"), port = fx("port.jpg"), png = fx("sq.png");
  assert.equal(sniffImage(land), "jpeg"); assert.equal(sniffImage(png), "png"); assert.equal(sniffImage(fx("pic.webp")), "webp"); assert.equal(sniffImage(new Uint8Array(8)), "");
  assert.equal(jpegOrientation(land), 1); assert.equal(jpegOrientation(fx("rot6.jpg")), 6); assert.equal(jpegOrientation(new Uint8Array(4)), 1);
  const r = await runOp("imagesToPdf", { images: [{ name: "a", bytes: land }, { name: "b", bytes: port }, { name: "c", bytes: png }], pageSize: "a4" });
  assert.equal(r.pages, 3);
  const pages = (await PDFDocument.load(r.bytes)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
  assert.deepEqual(pages, [[842, 595], [595, 842], [595, 842]], "افقی/عمودی خودکار؛ مربع → عمودی");
  const fixed = await runOp("imagesToPdf", { images: [{ bytes: land }], pageSize: "a4", orientation: "portrait" });
  assert.deepEqual((await PDFDocument.load(fixed.bytes)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]), [[595, 842]]);
  const fit = await runOp("imagesToPdf", { images: [{ bytes: land }], pageSize: "fit" });
  const fp = (await PDFDocument.load(fit.bytes)).getPage(0); assert.deepEqual([Math.round(fp.getWidth()), Math.round(fp.getHeight())], [Math.round(120 * 72 / 150), Math.round(60 * 72 / 150)].map((x) => Math.max(72, x)));
  // JPEG بدون تغییر در فایل جاسازی شده است (بدون افت)
  assert.ok(Buffer.from(r.bytes).includes(Buffer.from(land.subarray(0, 64))), "بایت‌های JPEG دست‌نخورده جاسازی شد");
  await assert.rejects(runOp("imagesToPdf", { images: [{ name: "x.txt", bytes: new TextEncoder().encode("hello") }] }), { code: "bad_image" });
  await assert.rejects(runOp("imagesToPdf", { images: [] }), { code: "bad_image" });
  await assert.rejects(runOp("imagesToPdf", { images: [{ bytes: land }], pageSize: "b7" }), { code: "bad_mode" });
  // بدون کانواس (Node): WEBP خطای روشن می‌دهد، JPEG دارای جهت ۶ بدون خطا جاسازی می‌شود
  await assert.rejects(runOp("imagesToPdf", { images: [{ bytes: fx("pic.webp") }] }), { code: "no_canvas" });
  assert.equal((await runOp("imagesToPdf", { images: [{ bytes: fx("rot6.jpg") }] })).pages, 1);
  await assert.rejects(runOp("convertImage", { bytes: land, to: "png" }), { code: "no_canvas" });
  await assert.rejects(runOp("convertImage", { bytes: new Uint8Array(10), to: "png" }), { code: "bad_image" });
});

test("assembleJpegPages: هر صفحه با اندازهٔ داده‌شده؛ شمارش صفحه؛ عملیات ناشناخته", async () => {
  const j = fx("land.jpg");
  const r = await runOp("assembleJpegPages", { pages: [{ jpeg: j, wPt: 300, hPt: 400 }, { jpeg: j, wPt: 500, hPt: 200 }] });
  assert.equal(r.pages, 2); assert.deepEqual((await PDFDocument.load(r.bytes)).getPages().map((p) => [p.getWidth(), p.getHeight()]), [[300, 400], [500, 200]]);
  assert.equal((await runOp("pageCount", { bytes: r.bytes })).pages, 2);
  await assert.rejects(runOp("nope", {}), { code: "bad_op" });
  await assert.rejects(runOp("assembleJpegPages", { pages: [] }), { code: "bad_range" });
});

test("پیشرفت: callback با مقدارهای صعودی تا ۱ فراخوانی می‌شود", async () => {
  const a = await makePdf(1), seen = [];
  await runOp("mergePdfs", { files: [a, a, a].map((b, i) => ({ name: `${i}`, bytes: b })) }, (p) => seen.push(p));
  assert.deepEqual(seen.map((x) => Math.round(x * 100)), [33, 67, 100]);
});
