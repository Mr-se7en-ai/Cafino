// گرد کردن قیمت‌های تعرفه (ریال): به بالا، به پایین یا نزدیک‌ترین مضرب. تابع‌های خالص و قابل‌آزمون.
// قیمت صفر = «توافقی» است و هرگز دست نمی‌خورد. گردکردن به پایین هرگز قیمت مثبت را به صفر (توافقی) نمی‌رساند؛ آن قلم بدون تغییر می‌ماند و جزو «ردشده‌ها» گزارش می‌شود.
export const ROUND_MODES = Object.freeze({ up: "به بالا", down: "به پایین", nearest: "نزدیک‌ترین" });
export const ROUND_UNITS = Object.freeze([1000, 10000, 50000, 100000, 500000, 1000000]);
export const ROUND_UNIT_LABEL = (u) => `${Number(u).toLocaleString("fa-IR")} ریال (${(Number(u) / 10).toLocaleString("fa-IR")} تومان)`;
export const TARIFF_ROUND_CFG_KEY = "cafenet_tariff_round_cfg";
export const TARIFF_ROUND_UNDO_KEY = "cafenet_tariff_round_undo";

export function roundPrice(price, mode, unit) {
  const p = Number(price) || 0, u = Math.trunc(Number(unit));
  if (!(u >= 1) || !ROUND_MODES[mode]) throw new TypeError("حالت یا واحد گرد کردن نامعتبر است");
  if (p <= 0) return 0;
  const q = p / u;
  const r = mode === "up" ? Math.ceil(q - 1e-9) : mode === "down" ? Math.floor(q + 1e-9) : Math.round(q);
  return r * u;
}

// cat = نام دسته (یا "all"). خروجی: { data, changed:[{cat,id,name,before,after}], skipped:[{cat,id,name,price}], unchanged }
export function planRounding(tariffData, { mode, unit, cat = "all" }) {
  const changed = [], skipped = []; let unchanged = 0;
  const data = (tariffData || []).map((g) => {
    if (cat !== "all" && g.cat !== cat) return g;
    return { ...g, items: g.items.map((it) => {
      const before = Number(it.price) || 0;
      if (before <= 0) return it;
      const after = roundPrice(before, mode, unit);
      if (after <= 0) { skipped.push({ cat: g.cat, id: it.id, name: it.name, price: before }); return it; }
      if (after === before) { unchanged++; return it; }
      changed.push({ cat: g.cat, id: it.id, name: it.name, before, after });
      return { ...it, price: after };
    }) };
  });
  return { data, changed, skipped, unchanged };
}
