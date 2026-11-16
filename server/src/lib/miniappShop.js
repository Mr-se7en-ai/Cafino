// منطق خالص سبد خرید / رسید / تنظیمات پرداخت مینی‌اپ (1.84). قیمت‌ها فقط از تعرفهٔ سرور می‌آید؛ ورودی مشتری فقط نام و تعداد است.
export const MAX_LINES = 30, MAX_QTY = 999, MAX_RECEIPT_BYTES = 1_500_000;
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const toEn = (s) => String(s ?? "").replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));

/** سبد را با تعرفهٔ سرور قیمت‌گذاری می‌کند. خروجی: {lines:[{cat,name,qty,price,sum}], total, summary} یا {error}. */
export function priceCart(items, groups) {
  if (!Array.isArray(items) || !items.length) return { error: "سبد خالی است" };
  if (items.length > MAX_LINES) return { error: `حداکثر ${MAX_LINES} ردیف در سبد` };
  const byKey = new Map(), byName = new Map();
  for (const g of Array.isArray(groups) ? groups : []) for (const it of g?.items || []) { byKey.set(`${g.cat}\u0000${it.name}`, { cat: g.cat, name: it.name, price: it.price }); if (!byName.has(it.name)) byName.set(it.name, { cat: g.cat, name: it.name, price: it.price }); }
  const merged = new Map();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") return { error: "ردیف سبد نامعتبر است" };
    const name = clean(raw.name, 120), cat = clean(raw.cat, 80), qty = Number(raw.qty);
    if (!name) return { error: "نام خدمت در سبد خالی است" };
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: `تعداد «${name}» باید عددی بین ۱ تا ${MAX_QTY} باشد` };
    const hit = (cat && byKey.get(`${cat}\u0000${name}`)) || byName.get(name);
    if (!hit) return { error: `«${name}» در تعرفهٔ کافی‌نت نیست (ممکن است تعرفه تغییر کرده باشد)؛ سبد را به‌روز کنید` };
    const k = `${hit.cat}\u0000${hit.name}`, cur = merged.get(k);
    const q = (cur ? cur.qty : 0) + qty;
    if (q > MAX_QTY) return { error: `تعداد «${name}» بیش از حد مجاز است` };
    merged.set(k, { cat: hit.cat, name: hit.name, qty: q, price: hit.price });
  }
  const lines = [...merged.values()].map((l) => ({ ...l, sum: l.price * l.qty }));
  const total = lines.reduce((a, l) => a + l.sum, 0);
  if (total > 1_000_000_000_000) return { error: "جمع سبد بیش از حد مجاز است" };
  const first = lines[0], extra = lines.length - 1;
  const summary = clean(`${first.name}${first.qty > 1 ? ` ×${first.qty}` : ""}${extra > 0 ? ` و ${extra} مورد دیگر` : ""}`, 120);
  return { lines, total, summary };
}

/** نوع تصویر از روی امضای فایل (نه ادعای کلاینت). */
export function detectImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
/** رسید base64 (با یا بدون پیشوند data:) ← {mime,buf} یا {error}. */
export function parseReceipt(b64) {
  const s = String(b64 ?? "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!s || s.length > Math.ceil(MAX_RECEIPT_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return { error: "تصویر رسید نامعتبر است" };
  const buf = Buffer.from(s, "base64");
  if (buf.length > MAX_RECEIPT_BYTES) return { error: "تصویر رسید بزرگ‌تر از ۱٫۵ مگابایت است" };
  const mime = detectImage(buf);
  if (!mime) return { error: "فقط تصویر JPG، PNG یا WEBP پذیرفته می‌شود" };
  return { mime, buf };
}
/** شمارهٔ کارت: ۱۶ رقم (ارقام فارسی/عربی هم پذیرفته می‌شود)؛ نامعتبر ← null. خالی ← "". */
export function cleanCard(v) {
  const d = toEn(v).replace(/[\s-]/g, "");
  if (!d) return "";
  return /^[0-9]{16}$/.test(d) ? d : null;
}
export const cleanLine = clean;
/** روش‌های پرداختی که مشتری می‌بیند. */
export function payOptions(s) {
  const card = !!(s?.pay_card_enabled && s?.pay_card_number);
  return { cash: s?.pay_cash_enabled !== false, card, cardInfo: card ? { number: s.pay_card_number, holder: s.pay_card_holder || "", bank: s.pay_bank || "" } : null, soon: ["gateway", "wallet"] };
}
