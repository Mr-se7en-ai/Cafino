import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timeLeft, fileKind, SORTS, TTL_OPTIONS, saveBlob, STATUSES } from "../uploads/uploadsApi.js";
import { detectNewArrival, arrivalText, getUploadsState, setUploadsNewCount, subscribeUploads, getSoundOn } from "../uploads/uploadsState.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("timeLeft: روز/ساعت/دقیقه به فارسی و «منقضی شد»", () => {
  const now = Date.parse("2026-11-12T10:00:00Z"), at = (m) => new Date(now + m * 60000).toISOString();
  assert.equal(timeLeft(at(-1), now), "منقضی شد");
  assert.equal(timeLeft(at(0), now), "منقضی شد");
  assert.equal(timeLeft(at(1), now), "1 دقیقه");
  assert.equal(timeLeft(at(45), now), "45 دقیقه");
  assert.equal(timeLeft(at(60), now), "1 ساعت");
  assert.equal(timeLeft(at(90), now), "1 ساعت و 30 دقیقه");
  assert.equal(timeLeft(at(60 * 24), now), "1 روز");
  assert.equal(timeLeft(at(60 * 24 * 3 + 5), now), "3 روز");
});

test("fileKind: pdf / تصویر / متن / سایر — مستقل از حروف بزرگ و کوچک", () => {
  assert.equal(fileKind("a.PDF"), "pdf"); assert.equal(fileKind("x.JPG"), "image"); assert.equal(fileKind("x.jpeg"), "image");
  assert.equal(fileKind("x.png"), "image"); assert.equal(fileKind("x.webp"), "image"); assert.equal(fileKind("n.txt"), "text"); assert.equal(fileKind("n.csv"), "text");
  assert.equal(fileKind("d.docx"), "other"); assert.equal(fileKind("noext"), "other"); assert.equal(fileKind(""), "other"); assert.equal(fileKind(undefined), "other");
});

test("مرتب‌سازی و TTL: کلیدها با فهرست سفید سرور هم‌خوان، TTL در بازهٔ ۵ دقیقه تا ۷ روز", () => {
  assert.deepEqual(SORTS.map((s) => s[0]), ["created", "name", "size", "status"]);
  for (const [m] of TTL_OPTIONS) assert.ok(m >= 5 && m <= 10080);
  assert.deepEqual(STATUSES, ["new", "seen", "printed", "done"]);
  const srv = read("../../server/src/routes/uploads.js"); for (const k of SORTS.map((s) => s[0])) assert.match(srv, new RegExp(`\\b${k}\\b`));
});

test("detectNewArrival: نخستین دریافت فقط مبنا می‌گذارد؛ ارسال تازه اعلان می‌دهد؛ تکرار همان ارسال یا شمارش صفر اعلان نمی‌دهد", () => {
  const s = (at, n) => ({ newCount: n, latest: at ? { at, batchId: "b", batchCode: "12345", count: 2, senderName: "علی" } : null });
  let d = detectNewArrival(null, s("2026-11-12T10:00:00Z", 3)); assert.equal(d.alert, false); assert.equal(d.lastAt, Date.parse("2026-11-12T10:00:00Z"));
  d = detectNewArrival(d.lastAt, s("2026-11-12T10:00:00Z", 3)); assert.equal(d.alert, false);
  d = detectNewArrival(d.lastAt, s("2026-11-12T10:05:00Z", 4)); assert.equal(d.alert, true); assert.equal(d.lastAt, Date.parse("2026-11-12T10:05:00Z"));
  d = detectNewArrival(d.lastAt, s("2026-11-12T10:06:00Z", 0)); assert.equal(d.alert, false);   // دیده‌شده → اعلان نه
  d = detectNewArrival(d.lastAt, s(null, 0)); assert.equal(d.alert, false);
  d = detectNewArrival(Date.parse("2026-11-12T10:06:00Z"), s("2026-11-12T09:00:00Z", 5)); assert.equal(d.alert, false); assert.equal(d.lastAt, Date.parse("2026-11-12T10:06:00Z"));   // زمان به عقب نمی‌رود
});

test("arrivalText: تعداد، فرستنده، سفارش و کد پیگیری", () => {
  const t = arrivalText({ count: 3, senderName: "علی", orderLabel: "پایان‌نامه", batchCode: "01234" });
  assert.equal(t.title, "فایل تازه از مشتری"); assert.match(t.body, /3 فایل از علی برای «پایان‌نامه»/); assert.match(t.body, /01234/);
  assert.match(arrivalText({}).body, /1 فایل/);
});

test("وضعیت نشان: setUploadsNewCount مشترکین را خبر می‌کند و بدون تغییر، تکرار نمی‌کند", () => {
  let n = 0; const off = subscribeUploads(() => n++);
  setUploadsNewCount(4); assert.equal(getUploadsState().newCount, 4); const a = n; setUploadsNewCount(4); assert.equal(n, a); setUploadsNewCount(0); assert.equal(getUploadsState().newCount, 0); off();
  assert.equal(typeof getSoundOn(), "boolean");
});

test("سیم‌کشی: نشان و اعلان در منو، نظرسنجی ۲۰ ثانیه‌ای، تازه‌سازی ۲۰ ثانیه‌ای صفحه، Worker برای ابزارها", () => {
  const main = read("../app/app/MainApp.jsx");
  assert.match(main, /startUploadsPolling/); assert.match(main, /<UploadsBadge/); assert.match(main, /<UploadsToast/);
  assert.match(read("../uploads/uploadsBadge.js"), /intervalMs = 20000/);
  assert.match(read("../uploads/FileManager.jsx"), /20000/); assert.match(read("../uploads/SessionsPanel.jsx"), /20000/);
  const client = read("../uploads/pdf/pdfClient.js"); assert.match(client, /new Worker/); assert.match(client, /terminate/);
  const dlg = read("../uploads/PdfToolsDialog.jsx"); assert.match(dlg, /runPdfOp/); assert.doesNotMatch(dlg, /from "pdf-lib"/);   // پردازش PDF فقط از راه Worker
  assert.match(read("../../build.sh"), /pdftools pdfjs pdfjsworker/);
});

test("حذف گروهی فقط با مجوز: دکمه به canBulkDelete بسته است و سرور مجوز را اعمال می‌کند", () => {
  assert.match(read("../uploads/FileManager.jsx"), /canBulk && <button data-testid="up-bulk-delete"/);
  assert.match(read("../../server/src/routes/uploads.js"), /requirePerm\("upload\.bulk_delete", "upload\.manage"\)/);
});
