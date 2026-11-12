// خواندن امن فایل Excel واردشده (کتابخانهٔ xlsx ۰٫۱۸٫۵ نسخهٔ اصلاح‌شدهٔ رسمی در npm ندارد؛ پس ورودی را خودمان محدود و بازرسی می‌کنیم):
//   ۱) قبل از هر تجزیه، ساختار ZIP/CFB بررسی می‌شود: قالب، تعداد و حجم ورودی‌ها (ضد zip-bomb)، مسیر مشکوک، رمزگذاری، ماکرو
//   ۲) تجزیه با گزینه‌های حداقلی (بدون فرمول/HTML/استایل/ماکرو) و سقف سطر؛ سپس سقف تعداد شیت/ستون/سلول و طول متن
//   ۳) نام‌های خطرناک شیت (__proto__ و …) رد می‌شوند و Object/Array.prototype قبل و بعد مقایسه می‌شود (ضد prototype pollution)
// تابع‌ها «خالص»اند (کتابخانه تزریق می‌شود) تا هم در Worker، هم در رشتهٔ اصلی و هم در تست‌ها کار کنند.
export const XLSX_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024, maxEntries: 300, maxEntryBytes: 30 * 1024 * 1024, maxTotalBytes: 80 * 1024 * 1024, maxRatio: 200,
  maxSheets: 20, maxRows: 5000, maxCols: 60, maxCells: 100000, maxText: 500,
});
const bad = (m) => { const e = new Error(m); e.code = "xlsx_rejected"; return e; };
const FORBIDDEN_NAMES = new Set(["__proto__", "constructor", "prototype"]);

// ── بازرسی ظرف فایل ─────────────────────────────────────────────────────────
export function inspectContainer(input, L = XLSX_LIMITS) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (u8.length < 8) throw bad("فایل خالی یا خراب است.");
  if (u8.length > L.maxBytes) throw bad(`حجم فایل بیشتر از ${Math.round(L.maxBytes / 1048576)} مگابایت است.`);
  const isCfb = u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0;     // .xls قدیمی
  if (isCfb) return { kind: "xls" };
  if (!(u8[0] === 0x50 && u8[1] === 0x4b)) throw bad("قالب فایل Excel (xlsx/xls) نیست.");
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22, lim = Math.max(0, u8.length - 22 - 65535); i >= lim; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw bad("ساختار ZIP فایل خراب است.");
  const count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw bad("فایل ZIP64 پشتیبانی نمی‌شود.");
  if (count > L.maxEntries) throw bad("تعداد بخش‌های داخل فایل بیش از حد است.");
  if (cdOff + cdSize > eocd) throw bad("ساختار ZIP فایل خراب است.");
  const td = new TextDecoder("utf-8", { fatal: false });
  let p = cdOff, total = 0, seen = 0; const names = [];
  while (p + 46 <= cdOff + cdSize && dv.getUint32(p, true) === 0x02014b50) {
    const flags = dv.getUint16(p + 8, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    if (p + 46 + nl > u8.length) throw bad("ساختار ZIP فایل خراب است.");
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
    if (flags & 1) throw bad("فایل رمزگذاری‌شده پشتیبانی نمی‌شود.");
    if (/(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[A-Za-z]:|\\/.test(name)) throw bad("مسیر نامعتبر داخل فایل.");
    if (usize > L.maxEntryBytes) throw bad("یکی از بخش‌های فایل پس از باز شدن بیش از حد بزرگ است.");
    if (usize > 1024 * 1024 && csize > 0 && usize / csize > L.maxRatio) throw bad("نسبت فشرده‌سازی مشکوک است (احتمال فایل مخرب).");
    total += usize; if (total > L.maxTotalBytes) throw bad("حجم کل فایل پس از باز شدن بیش از حد است.");
    names.push(name); seen++; p += 46 + nl + el + cl;
  }
  if (seen !== count) throw bad("ساختار ZIP فایل خراب است.");
  const lower = names.map((n) => n.toLowerCase());
  if (lower.some((n) => n.endsWith("vbaproject.bin") || n.startsWith("xl/macrosheets/"))) throw bad("فایل دارای ماکرو (VBA) است و پذیرفته نمی‌شود.");
  if (!lower.includes("[content_types].xml") || !lower.some((n) => n.startsWith("xl/"))) throw bad("فایل Excel معتبر (xlsx) نیست.");
  return { kind: "xlsx", entries: count, uncompressed: total };
}

// ── تجزیهٔ محدود ─────────────────────────────────────────────────────────────
const protoSig = () => {
  const o = {}; for (const [k, ob] of [["O", Object.prototype], ["A", Array.prototype], ["F", Function.prototype]]) o[k] = Object.getOwnPropertyNames(ob).sort().join("\u0001");
  return o;
};
export function readSheetsSafe(XLSX, input, L = XLSX_LIMITS) {
  const info = inspectContainer(input, L);
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const before = protoSig();
  let wb;
  try {
    wb = XLSX.read(u8, { type: "array", cellFormula: false, cellHTML: false, cellNF: false, cellStyles: false, cellText: false, cellDates: false, bookVBA: false, bookProps: false, bookFiles: false, sheetRows: L.maxRows + 1 });
  } catch (e) { throw bad("خواندن فایل ممکن نشد: " + (e && e.message ? String(e.message).slice(0, 120) : "فایل خراب است")); }
  const after = protoSig();
  if (before.O !== after.O || before.A !== after.A || before.F !== after.F) {
    for (const [ob, key] of [[Object.prototype, "O"], [Array.prototype, "A"], [Function.prototype, "F"]]) {
      const keep = new Set(before[key].split("\u0001")); for (const n of Object.getOwnPropertyNames(ob)) if (!keep.has(n)) { try { delete ob[n]; } catch { /* ignore */ } }
    }
    throw bad("فایل تلاش به تغییر ساختار داخلی برنامه کرد و رد شد.");
  }
  const names = wb.SheetNames || [];
  if (names.length > L.maxSheets) throw bad(`تعداد شیت‌ها بیش از ${L.maxSheets} است.`);
  const sheets = []; let cells = 0;
  for (const n of names) {
    if (FORBIDDEN_NAMES.has(String(n).toLowerCase()) || /[\u0000-\u001f]/.test(n)) throw bad("نام شیت نامعتبر است.");
    if (!Object.prototype.hasOwnProperty.call(wb.Sheets, n)) continue;
    const ws = wb.Sheets[n]; const ref = ws && ws["!ref"];
    if (ref) { const r = XLSX.utils.decode_range(ref); if (r.e.c - r.s.c + 1 > L.maxCols) throw bad(`تعداد ستون‌ها بیش از ${L.maxCols} است.`); }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }).slice(0, L.maxRows).map((row) => {
      cells += row.length; if (cells > L.maxCells) throw bad("تعداد سلول‌های فایل بیش از حد است.");
      return row.map((v) => (typeof v === "string" ? v.slice(0, L.maxText) : typeof v === "number" || typeof v === "boolean" ? v : v == null ? "" : String(v).slice(0, L.maxText)));
    });
    sheets.push({ name: String(n).slice(0, 100), rows });
  }
  return { sheets, kind: info.kind };
}
