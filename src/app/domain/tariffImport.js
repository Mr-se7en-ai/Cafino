// ورود تعرفه از فایل Excel / CSV — بخش خالص (بدون DOM) تا کامل قابل آزمون باشد.
// خواندن فایل Excel با کتابخانهٔ xlsx (chunk تنبل) در تعرفه‌UI انجام می‌شود؛ اینجا فقط «آرایهٔ سطرها» پردازش می‌شود.
//
// قالب پذیرفته‌شده (ردیف عنوان ستون‌ها لازم است؛ ترتیب ستون‌ها مهم نیست):
//   دسته | خدمت | قیمت | توضیح          ← ستون «دسته» اختیاری است
// اگر ستون «دسته» نباشد، ردیفی که فقط نام دارد (بدون قیمت و توضیح) عنوان یک دسته حساب می‌شود.
// قیمت خالی یا «توافقی» = ۰ (توافقی).

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_FILE_RE = /\.(xlsx|xls|csv)$/i;
const MAX_PRICE = 1e12;
const DEFAULT_CAT = "سایر";

// ───────── متن / عدد ─────────
const P2L = "۰۱۲۳۴۵۶۷۸۹", A2L = "٠١٢٣٤٥٦٧٨٩";
export function normDigits(s) {
  return String(s).replace(/[۰-۹]/g, (d) => P2L.indexOf(d)).replace(/[٠-٩]/g, (d) => A2L.indexOf(d));
}
const normText = (s) => String(s == null ? "" : s).replace(/\u064a/g, "\u06cc").replace(/\u0643/g, "\u06a9").replace(/[\u200f\u200e\u00a0]/g, " ").replace(/\s+/g, " ").trim();
const normKey = (s) => normText(s).replace(/\u200c/g, " ").toLowerCase().replace(/[()\uff08\uff09:\u061b\u060c,.\-_/\\*]/g, " ").replace(/\s+/g, " ").trim();

const NEGOTIABLE = /^(توافقی|تماس بگیرید|تماس|نامشخص|-|—|–|n\/a|na)$/i;
/** قیمت یک سلول را به عدد (ریال یا واحد فایل) برمی‌گرداند. {ok, price, error} */
export function parsePrice(v) {
  if (v == null || v === "") return { ok: true, price: 0, blank: true };
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: "قیمت نامعتبر است" };
    if (v > MAX_PRICE) return { ok: false, error: "قیمت بیش‌ازحد بزرگ است" };
    return { ok: true, price: Math.round(v) };
  }
  let s = normText(v);
  if (s === "") return { ok: true, price: 0, blank: true };
  if (NEGOTIABLE.test(s)) return { ok: true, price: 0, negotiable: true };
  s = normDigits(s).replace(/ریال|تومان|تومن|ریالی|rials?|irr|toman|ر\.?\s*$/gi, "").replace(/[٬,،'\s]/g, "").replace(/٫/g, ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: `«${normText(v).slice(0, 24)}» عدد قیمت نیست` };
  const n = Number(s);
  if (n > MAX_PRICE) return { ok: false, error: "قیمت بیش‌ازحد بزرگ است" };
  return { ok: true, price: Math.round(n) };
}

// ───────── CSV ─────────
export function decodeCsvBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(u8); }
  catch { try { text = new TextDecoder("windows-1256").decode(u8); } catch { text = new TextDecoder("utf-8").decode(u8); } }
  return text.replace(/^﻿/, "");
}
export function parseCsv(text) {
  const t = String(text).replace(/^﻿/, "");
  // تشخیص جداکننده از چند خط اول (خارج از گیومه)
  const count = (line, d) => { let q = false, n = 0; for (const ch of line) { if (ch === '"') q = !q; else if (!q && ch === d) n++; } return n; };
  const lines = t.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 5);
  let delim = ",", best = -1;
  for (const d of [",", ";", "\t", "|"]) { const sc = lines.reduce((a, l) => a + count(l, d), 0); if (sc > best) { best = sc; delim = d; } }
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ───────── تشخیص ستون‌ها ─────────
const H = {
  cat: ["دسته", "گروه", "category", "group"],
  note: ["توضیح", "یادداشت", "نکته", "ملاحظات", "note", "remark"],
  price: ["قیمت", "نرخ", "مبلغ", "تعرفه", "هزینه", "price", "amount", "rate", "cost", "fee"],
  name: ["خدمت", "خدمات", "عنوان", "شرح", "نام", "محصول", "کالا", "سرویس", "service", "name", "title", "item", "product", "description"],
};
function classifyHeader(cell) {
  const k = normKey(cell); if (!k) return null;
  for (const t of ["cat", "note", "price", "name"]) if (H[t].some((w) => k.includes(w))) return t;
  return null;
}
function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cols = {}; (rows[r] || []).forEach((c, i) => { const t = classifyHeader(c); if (t && cols[t] == null) cols[t] = i; });
    if (cols.name != null && cols.price != null && cols.name !== cols.price) {
      const k = normKey(rows[r][cols.price]);
      return { row: r, cols, unit: /تومان|تومن|toman/.test(k) ? "toman" : /ریال|rial|irr/.test(k) ? "rial" : null };
    }
  }
  return null;
}

const isGenericSheet = (n) => !n || /^(sheet|برگه|صفحه|شیت)\s*\d*$/i.test(String(n).trim());

/**
 * یک شیت (آرایهٔ سطرها) را پردازش می‌کند.
 * @returns {{ok:boolean, header?, groups, errors, warnings, unit}}
 */
export function parseSheetRows(rows, { sheetName = "", unit = "rial", defaultCat } = {}) {
  const errors = [], warnings = [], groups = [];
  const h = findHeader(rows);
  if (!h) return { ok: false, groups, errors: [{ sheet: sheetName, row: 0, msg: "ردیف عنوان ستون‌ها پیدا نشد. ستون‌هایی مثل «خدمت» و «قیمت» لازم است." }], warnings, unit };
  const mul = unit === "toman" ? 10 : 1;
  const fallbackCat = defaultCat || (isGenericSheet(sheetName) ? DEFAULT_CAT : normText(sheetName).slice(0, 60));
  const byCat = new Map(); const seen = new Set();
  let cur = fallbackCat;
  const put = (cat) => { if (!byCat.has(cat)) { const g = { cat, items: [] }; byCat.set(cat, g); groups.push(g); } return byCat.get(cat); };
  const { cols } = h;
  const cell = (r, i) => (i == null ? "" : r[i] == null ? "" : r[i]);
  let used = 0;
  for (let ri = h.row + 1; ri < rows.length; ri++) {
    const r = rows[ri] || []; const line = ri + 1;
    if (r.every((c) => normText(c) === "")) continue;
    if (++used > IMPORT_MAX_ROWS) { errors.push({ sheet: sheetName, row: line, msg: `بیش از ${IMPORT_MAX_ROWS} ردیف؛ بقیه خوانده نشد` }); break; }
    const name = normText(cell(r, cols.name));
    const priceRaw = cell(r, cols.price);
    const note = normText(cell(r, cols.note));
    const catCell = normText(cell(r, cols.cat));
    const priceBlank = normText(priceRaw) === "";
    const others = r.some((c, i) => i !== cols.name && normText(c) !== "");
    if (cols.cat == null && name && !others) { cur = name.slice(0, 60); put(cur); continue; }        // ردیف عنوان دسته
    if (!name) { errors.push({ sheet: sheetName, row: line, msg: "نام خدمت خالی است" }); continue; }
    const p = parsePrice(priceRaw);
    if (!p.ok) { errors.push({ sheet: sheetName, row: line, msg: p.error }); continue; }
    let cat = cols.cat != null ? (catCell || cur) : cur;
    if (cols.cat != null && catCell) cur = catCell;
    cat = cat.slice(0, 60);
    let nm = name; if (nm.length > 120) { nm = nm.slice(0, 120); warnings.push({ sheet: sheetName, row: line, msg: "نام خدمت کوتاه شد (حداکثر ۱۲۰ نویسه)" }); }
    let nt = note; if (nt.length > 200) { nt = nt.slice(0, 200); warnings.push({ sheet: sheetName, row: line, msg: "توضیح کوتاه شد (حداکثر ۲۰۰ نویسه)" }); }
    const key = cat + " > " + nm;
    if (seen.has(key)) { warnings.push({ sheet: sheetName, row: line, msg: `«${nm}» در دستهٔ «${cat}» تکراری است؛ ردیف اول نگه داشته شد` }); continue; }
    seen.add(key);
    const price = Math.round(p.price * mul);
    if (price > MAX_PRICE) { errors.push({ sheet: sheetName, row: line, msg: "قیمت بیش‌ازحد بزرگ است" }); continue; }
    if (priceBlank && cols.cat == null) warnings.push({ sheet: sheetName, row: line, msg: `«${nm}» قیمت ندارد؛ توافقی (۰) ثبت می‌شود` });
    put(cat).items.push(nt ? { name: nm, price, note: nt } : { name: nm, price });
  }
  return { ok: true, header: { row: h.row + 1, cols }, groups: groups.filter((g) => g.items.length), errors, warnings, unit: h.unit };
}

/** چند شیت (یا یک CSV) را به یک تعرفه تبدیل می‌کند و شناسهٔ ردیف‌ها را پشت‌سرهم می‌دهد. */
export function buildTariffFromSheets(sheets, { unit = "rial" } = {}) {
  const errors = [], warnings = [], merged = []; const byCat = new Map(); let detectedUnit = null, parsedSheets = 0;
  const multi = sheets.length > 1;
  for (const sh of sheets) {
    const res = parseSheetRows(sh.rows, { sheetName: multi ? sh.name : "", unit });
    if (!res.ok) { (multi ? warnings : errors).push(...res.errors.map((e) => (multi ? { ...e, msg: `شیت «${sh.name}» نادیده گرفته شد: ${e.msg}` } : e))); continue; }
    parsedSheets++; if (res.unit && !detectedUnit) detectedUnit = res.unit;
    errors.push(...res.errors); warnings.push(...res.warnings);
    for (const g of res.groups) {
      let t = byCat.get(g.cat); if (!t) { t = { cat: g.cat, items: [] }; byCat.set(g.cat, t); merged.push(t); }
      const have = new Set(t.items.map((i) => i.name));
      for (const it of g.items) { if (have.has(it.name)) { warnings.push({ sheet: sh.name, row: 0, msg: `«${it.name}» در دستهٔ «${g.cat}» تکراری است؛ مورد اول نگه داشته شد` }); continue; } have.add(it.name); t.items.push(it); }
    }
  }
  if (!parsedSheets && !errors.length) errors.push({ sheet: "", row: 0, msg: "هیچ شیتی با ستون‌های «خدمت» و «قیمت» پیدا نشد" });
  let id = 0;
  const data = merged.filter((g) => g.items.length).map((g) => ({ cat: g.cat, items: g.items.map((it) => ({ id: ++id, ...it })) }));
  return { data, count: id, errors, warnings, detectedUnit };
}

/** مقایسهٔ تعرفهٔ فعلی با تعرفهٔ واردشده (برای پیش‌نمایش پیش از جایگزینی). */
export function diffTariffs(oldData, newData) {
  const flat = (d) => { const m = new Map(); (d || []).forEach((g) => g.items.forEach((i) => m.set(g.cat + " > " + i.name, Number(i.price) || 0))); return m; };
  const a = flat(oldData), b = flat(newData);
  let added = 0, removed = 0, changed = 0, same = 0;
  for (const [k, v] of b) { if (!a.has(k)) added++; else if (a.get(k) !== v) changed++; else same++; }
  for (const k of a.keys()) if (!b.has(k)) removed++;
  return { added, removed, changed, same, oldCount: a.size, newCount: b.size };
}

/** تعرفه → آرایهٔ سطرها برای فایل نمونه / خروجی (همان قالب قابل ورود). */
export function tariffToAoa(data) {
  const rows = [["دسته", "خدمت", "قیمت (ریال)", "توضیح"]];
  (data || []).forEach((g) => g.items.forEach((i) => rows.push([g.cat, i.name, Number(i.price) || 0, i.note || ""])));
  return rows;
}

export const TARIFF_IMPORT_UNDO_KEY = "cafenet_tariff_import_undo";
