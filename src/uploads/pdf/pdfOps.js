// ابزارهای PDF/تصویر — توابع خالص روی بایت‌ها (pdf-lib). هم در Web Worker اجرا می‌شود (خارج از رشتهٔ اصلی) و هم در رشتهٔ اصلی (جایگزین/تست).
// ورودی/خروجی: Uint8Array. شمارهٔ صفحه‌ها همه ۱-مبنا است.
import { PDFDocument, degrees } from "pdf-lib";

const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const normDigits = (s) => String(s ?? "").replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
export class PdfToolError extends Error { constructor(message, code = "pdf_error") { super(message); this.code = code; } }
const err = (m, c) => new PdfToolError(m, c);

export const PAGE_SIZES = { a4: [595.28, 841.89], a5: [419.53, 595.28], a3: [841.89, 1190.55], letter: [612, 792] };

/** «1-3, 5, 8-» → [1,2,3,5,8,…,total]. ترتیب نوشته‌شده حفظ می‌شود (برای استخراج با ترتیب دلخواه)، تکراری‌ها حذف. خطا برای صفحهٔ خارج از محدوده. */
export function parseRanges(text, total) {
  const src = normDigits(text).replace(/[،؛;]/g, ",").replace(/[–—‑−]/g, "-").replace(/\s+/g, "");
  if (!src) throw err("بازهٔ صفحه‌ها خالی است", "bad_range");
  const out = [], seen = new Set();
  for (const part of src.split(",")) {
    if (!part) continue;
    const m = /^(\d*)-(\d*)$/.exec(part) || /^(\d+)$/.exec(part);
    if (!m) throw err(`بازهٔ «${part}» نامعتبر است`, "bad_range");
    let a, b;
    if (m.length === 2) a = b = Number(m[1]); else { a = m[1] === "" ? 1 : Number(m[1]); b = m[2] === "" ? total : Number(m[2]); }
    if (a < 1 || b < 1 || a > total || b > total) throw err(`صفحهٔ «${part}» خارج از محدوده است (این فایل ${total} صفحه دارد)`, "bad_range");
    const step = a <= b ? 1 : -1;
    for (let p = a; step > 0 ? p <= b : p >= b; p += step) if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  if (!out.length) throw err("بازهٔ صفحه‌ها خالی است", "bad_range");
  return out;
}

const loadPdf = async (bytes, label = "فایل") => {
  try { return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false }); }
  catch (e) {
    if (/encrypt/i.test(String(e?.message))) throw err(`«${label}» رمزگذاری شده است؛ ابتدا رمز آن را بردارید`, "encrypted");
    throw err(`«${label}» PDF سالم نیست یا خراب است`, "bad_pdf");
  }
};
const save = async (doc) => new Uint8Array(await doc.save({ useObjectStreams: true }));

export async function pageCount(bytes) { return (await loadPdf(bytes)).getPageCount(); }

/** ادغام چند PDF به ترتیب. */
export async function mergePdfs({ files }, progress) {
  if (!files?.length || files.length < 2) throw err("برای ادغام دست‌کم دو PDF لازم است", "need_two");
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    const src = await loadPdf(files[i].bytes, files[i].name);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
    progress?.((i + 1) / files.length);
  }
  return { bytes: await save(out), pages: out.getPageCount() };
}

/** استخراج صفحه‌های انتخابی (ترتیب دلخواه) در یک PDF تازه. */
export async function extractPages({ bytes, pages }, progress) {
  const src = await loadPdf(bytes), n = src.getPageCount();
  if (!pages?.length) throw err("صفحه‌ای انتخاب نشده است", "bad_range");
  for (const p of pages) if (!Number.isInteger(p) || p < 1 || p > n) throw err(`صفحهٔ ${p} در این فایل نیست (${n} صفحه)`, "bad_range");
  const out = await PDFDocument.create();
  for (const p of await out.copyPages(src, pages.map((x) => x - 1))) out.addPage(p);
  progress?.(1);
  return { bytes: await save(out), pages: pages.length };
}

/** جداسازی: هر N صفحه یک فایل (mode:"every")، یا بازه‌ها (mode:"ranges": "1-3,4-6" → هر بازه یک فایل)، یا تک‌تک صفحه‌ها (mode:"each"). */
export async function splitPdf({ bytes, mode = "every", n = 1, ranges = "", baseName = "split" }, progress) {
  const src = await loadPdf(bytes), total = src.getPageCount();
  let groups = [];
  if (mode === "each") n = 1;
  if (mode === "every" || mode === "each") {
    n = Math.max(1, Math.floor(Number(n) || 1));
    for (let i = 1; i <= total; i += n) groups.push(Array.from({ length: Math.min(n, total - i + 1) }, (_, k) => i + k));
  } else if (mode === "ranges") {
    for (const part of normDigits(ranges).replace(/[،؛;]/g, ",").split(",").map((s) => s.trim()).filter(Boolean)) groups.push(parseRanges(part, total));
  } else throw err("حالت جداسازی نامعتبر است", "bad_mode");
  if (!groups.length) throw err("چیزی برای جداسازی نیست", "bad_range");
  if (groups.length > 200) throw err("بیش از ۲۰۰ فایل خروجی ممکن نیست", "too_many");
  if (groups.length === 1 && groups[0].length === total) throw err("این انتخاب همهٔ صفحه‌ها را در یک فایل می‌گذارد؛ جداسازی معنی ندارد", "no_split");
  const files = [];
  for (let g = 0; g < groups.length; g++) {
    const out = await PDFDocument.create();
    for (const p of await out.copyPages(src, groups[g].map((x) => x - 1))) out.addPage(p);
    const first = groups[g][0], last = groups[g][groups[g].length - 1];
    files.push({ name: `${baseName}-${first === last ? first : `${first}-${last}`}.pdf`, bytes: await save(out), pages: groups[g].length });
    progress?.((g + 1) / groups.length);
  }
  return { files };
}

/** چرخاندن: pages = همهٔ صفحه‌ها (null) یا فهرست؛ degrees ∈ {90,180,270,-90}. یا rotations = {صفحه: درجه} برای هر صفحه جدا. زاویه به زاویهٔ فعلی صفحه افزوده می‌شود. */
export async function rotatePages({ bytes, pages = null, degrees: deg = 90, rotations = null }, progress) {
  const doc = await loadPdf(bytes), n = doc.getPageCount();
  const plan = new Map();
  if (rotations) { for (const [p, d] of Object.entries(rotations)) plan.set(Number(p), Number(d)); }
  else { if (![90, 180, 270, -90].includes(Number(deg))) throw err("زاویهٔ چرخش باید ۹۰، ۱۸۰ یا ۲۷۰ باشد", "bad_angle"); for (const p of pages || Array.from({ length: n }, (_, i) => i + 1)) plan.set(p, Number(deg)); }
  let changed = 0;
  for (const [p, d] of plan) {
    if (!Number.isInteger(p) || p < 1 || p > n) throw err(`صفحهٔ ${p} در این فایل نیست`, "bad_range");
    if (d % 90 !== 0) throw err("زاویهٔ چرخش باید مضرب ۹۰ باشد", "bad_angle");
    if (((d % 360) + 360) % 360 === 0) continue;
    const page = doc.getPage(p - 1);
    page.setRotation(degrees((((page.getRotation().angle + d) % 360) + 360) % 360)); changed++;
  }
  progress?.(1);
  if (!changed) throw err("هیچ صفحه‌ای برای چرخاندن انتخاب نشده است", "bad_range");
  return { bytes: await save(doc), changed };
}

/** فشرده‌سازی سبک: بازسازی ساختار (حذف شیءهای بی‌مصرف، object stream). متن و کیفیت دست‌نخورده؛ برای اسکن‌ها اثر کم است. */
export async function compressLight({ bytes }, progress) {
  const src = await loadPdf(bytes), out = await PDFDocument.create();
  for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  out.setProducer("Cafino"); out.setCreator("Cafino");
  progress?.(1);
  const res = await save(out);
  return { bytes: res, before: bytes.length, after: res.length, pages: out.getPageCount() };
}

// ── تصویر ──
const readU16 = (b, o, le) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
const readU32 = (b, o, le) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
/** جهت EXIF یک JPEG (۱ تا ۸؛ ۱ = عادی). عکس گوشی اغلب ۶ یا ۸ است و بدون اصلاح در PDF خوابیده دیده می‌شود. */
export function jpegOrientation(b) {
  if (!b || b.length < 12 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let o = 2;
  while (o + 4 < b.length) {
    if (b[o] !== 0xff) return 1;
    const mk = b[o + 1], len = (b[o + 2] << 8) | b[o + 3];
    if (mk === 0xe1 && b[o + 4] === 0x45 && b[o + 5] === 0x78 && b[o + 6] === 0x69 && b[o + 7] === 0x66) {
      const t = o + 10, le = b[t] === 0x49;
      const ifd = t + readU32(b, t + 4, le), n = readU16(b, ifd, le);
      for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (readU16(b, e, le) === 0x0112) { const v = readU16(b, e + 8, le); return v >= 1 && v <= 8 ? v : 1; } }
      return 1;
    }
    if (mk === 0xda || mk === 0xd9) return 1;
    o += 2 + len;
  }
  return 1;
}
export function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") return "webp";
  return "";
}

const canvasOk = () => typeof createImageBitmap === "function" && (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined");
const mkCanvas = (w, h) => (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));
const canvasBlob = (c, type, q) => (c.convertToBlob ? c.convertToBlob({ type, quality: q }) : new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, q)));
/** رمزگشایی با اصلاح جهت EXIF، (اختیاری) کوچک‌کردن به maxSide، و خروجی jpeg/png/webp. کانواس لازم دارد. */
export async function reencodeImage({ bytes, to = "jpeg", maxSide = 0, quality = 0.9, mime = "" }) {
  if (!canvasOk()) throw err("این مرورگر امکان تبدیل تصویر را ندارد", "no_canvas");
  let bmp;
  try { bmp = await createImageBitmap(new Blob([bytes], mime ? { type: mime } : undefined), { imageOrientation: "from-image" }); } catch { throw err("تصویر خوانده نشد؛ فایل خراب یا پشتیبانی‌نشده است", "bad_image"); }
  let w = bmp.width, h = bmp.height;
  if (maxSide && Math.max(w, h) > maxSide) { const k = maxSide / Math.max(w, h); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k)); }
  const c = mkCanvas(w, h), ctx = c.getContext("2d");
  if (to === "jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }   // زمینهٔ شفاف در JPEG سیاه می‌شود
  ctx.imageSmoothingQuality = "high"; ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const type = to === "png" ? "image/png" : to === "webp" ? "image/webp" : "image/jpeg";
  const blob = await canvasBlob(c, type, quality);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h, type: to };
}
/** تبدیل فرمت تصویر (jpg/png/webp) با تغییر اندازهٔ اختیاری. */
export async function convertImage({ bytes, to = "jpeg", maxSide = 0, quality = 0.9 }, progress) {
  const kind = sniffImage(bytes); if (!kind) throw err("فایل تصویر معتبر (JPG/PNG/WEBP) نیست", "bad_image");
  if (!["jpeg", "png", "webp"].includes(to)) throw err("فرمت مقصد نامعتبر است", "bad_mode");
  const r = await reencodeImage({ bytes, to, maxSide, quality: Math.min(1, Math.max(0.3, Number(quality) || 0.9)), mime: kind === "jpeg" ? "image/jpeg" : `image/${kind}` });
  progress?.(1);
  return { ...r, before: bytes.length, after: r.bytes.length };
}

/** تصاویر → یک PDF (هر تصویر یک صفحه). pageSize: a4|a5|a3|letter|fit؛ margin (pt)؛ orientation: auto|portrait|landscape. JPEG/PNG سالم مستقیم و بدون افت کیفیت جاسازی می‌شود. */
export async function imagesToPdf({ images, pageSize = "a4", margin = 24, orientation = "auto" }, progress) {
  if (!images?.length) throw err("تصویری انتخاب نشده است", "bad_image");
  const doc = await PDFDocument.create();
  for (let i = 0; i < images.length; i++) {
    let { bytes } = images[i]; let kind = sniffImage(bytes);
    if (!kind) throw err(`«${images[i].name || `تصویر ${i + 1}`}» تصویر معتبر نیست`, "bad_image");
    if (kind === "webp" || (kind === "jpeg" && jpegOrientation(bytes) !== 1)) {
      if (!canvasOk()) { if (kind === "webp") throw err("تبدیل WEBP در این مرورگر ممکن نیست؛ ابتدا به JPG تبدیل کنید", "no_canvas"); }
      else { const r = await reencodeImage({ bytes, to: kind === "webp" ? "png" : "jpeg", quality: 0.92 }); bytes = r.bytes; kind = r.type; }
    }
    let img;
    try { img = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); } catch { throw err(`«${images[i].name || `تصویر ${i + 1}`}» خوانده نشد (خراب یا پشتیبانی‌نشده)`, "bad_image"); }
    const iw = img.width, ih = img.height;
    let pw, ph;
    if (pageSize === "fit") { const k = 72 / 150; pw = Math.max(72, iw * k); ph = Math.max(72, ih * k); }
    else {
      const base = PAGE_SIZES[pageSize]; if (!base) throw err("اندازهٔ صفحه نامعتبر است", "bad_mode");
      const land = orientation === "landscape" || (orientation === "auto" && iw > ih);
      [pw, ph] = land ? [base[1], base[0]] : [base[0], base[1]];
    }
    const m = pageSize === "fit" ? 0 : Math.max(0, Math.min(Number(margin) || 0, Math.min(pw, ph) / 4));
    const k = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih), w = iw * k, h = ih * k;
    const page = doc.addPage([pw, ph]);
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    progress?.((i + 1) / images.length);
  }
  return { bytes: await save(doc), pages: images.length };
}

/** ساخت PDF از صفحه‌های JPEG (برای فشرده‌سازی قوی: هر صفحه به تصویر تبدیل و با همان اندازهٔ اصلی در PDF جدید می‌نشیند). */
export async function assembleJpegPages({ pages }, progress) {
  if (!pages?.length) throw err("صفحه‌ای نیست", "bad_range");
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i], img = await doc.embedJpg(p.jpeg);
    const page = doc.addPage([p.wPt, p.hPt]); page.drawImage(img, { x: 0, y: 0, width: p.wPt, height: p.hPt });
    progress?.((i + 1) / pages.length);
  }
  return { bytes: await save(doc), pages: pages.length };
}

export const OPS = { pageCount: async ({ bytes }) => ({ pages: await pageCount(bytes) }), mergePdfs, extractPages, splitPdf, rotatePages, compressLight, convertImage, imagesToPdf, assembleJpegPages };
export async function runOp(op, args, progress) {
  const fn = OPS[op]; if (!fn) throw err(`عملیات ناشناخته: ${op}`, "bad_op");
  return fn(args, progress);
}
