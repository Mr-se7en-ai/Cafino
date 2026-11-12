// فروش آنلاین — توابع خالص (بدون وابستگی به ذخیره‌سازی) برای هسته مالی و گزارش‌ها
import { ONLINE_FEE_CAT, ONLINE_SHIP_CAT, ONLINE_STATUSES } from "../core/constants.js";

const num = (v) => Math.max(0, Math.round(Number(v) || 0));
const str = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);

// ورودی فرم → ساختار ذخیره‌شده روی فروش. مقدارهای نامعتبر پاک‌سازی می‌شوند.
export function normalizeOnline(o) {
  if (!o || typeof o !== "object") return null;
  const status = ONLINE_STATUSES.some((s) => s.key === o.status) ? o.status : "new";
  return {
    platform: str(o.platform, 60) || "سایر",
    orderRef: str(o.orderRef, 60),
    carrier: str(o.carrier, 60),
    trackingCode: str(o.trackingCode, 60),
    address: str(o.address, 400),
    shippingCost: num(o.shippingCost),   // آنچه فروشگاه به شرکت حمل می‌دهد (هزینه)
    platformFee: num(o.platformFee),     // کارمزد درگاه / پلتفرم (هزینه)
    status,
  };
}

export const isOnlineSale = (s) => !!s && s.channel === "online";
export const onlineStatusInfo = (key) => ONLINE_STATUSES.find((s) => s.key === key) || ONLINE_STATUSES[0];

// مجموع هزینه‌های آنلاین یک فروش (از روی خود تراکنش‌ها تا با ویرایش/ابطال همیشه هم‌خوان باشد)
export function onlineCostsOf(txs, saleId) {
  let ship = 0, fee = 0;
  (txs || []).forEach((t) => {
    if (t.type !== "expense" || String(t.saleId) !== String(saleId)) return;
    if (t.category === ONLINE_SHIP_CAT) ship += Number(t.amount) || 0;
    else if (t.category === ONLINE_FEE_CAT) fee += Number(t.amount) || 0;
  });
  return { ship, fee };
}

// خلاصهٔ فروش آنلاین برای گزارش: match(date) بازهٔ زمانی را تعیین می‌کند.
export function onlineStats(sales, txs, match = () => true) {
  const all = (sales || []).filter((s) => !s.cancelled && match(s.date));
  const on = all.filter(isOnlineSale);
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const net = (s) => (Number(s.total) || 0) - (Number(s.waived) || 0);
  const rows = on.map((s) => {
    const c = onlineCostsOf(txs, s.id);
    const revenue = net(s);
    const cost = Number(s.costTotal) || 0;
    return { sale: s, revenue, ship: c.ship, fee: c.fee, cost, profit: revenue - cost };
  });
  const byPlatform = {};
  rows.forEach((r) => {
    const k = (r.sale.online && r.sale.online.platform) || "سایر";
    const g = byPlatform[k] || (byPlatform[k] = { platform: k, count: 0, revenue: 0, ship: 0, fee: 0, profit: 0 });
    g.count += 1; g.revenue += r.revenue; g.ship += r.ship; g.fee += r.fee; g.profit += r.profit;
  });
  const byStatus = {};
  ONLINE_STATUSES.forEach((s) => { byStatus[s.key] = 0; });
  on.forEach((s) => { const k = (s.online && s.online.status) || "new"; byStatus[k] = (byStatus[k] || 0) + 1; });
  const revenue = sum(rows, (r) => r.revenue), totalAll = sum(all, net);
  return {
    count: on.length, revenue, ship: sum(rows, (r) => r.ship), fee: sum(rows, (r) => r.fee), cost: sum(rows, (r) => r.cost),
    profit: sum(rows, (r) => r.profit), share: totalAll > 0 ? revenue / totalAll : 0, storeCount: all.length - on.length, storeRevenue: totalAll - revenue,
    avgOrder: on.length ? Math.round(revenue / on.length) : 0,
    byPlatform: Object.values(byPlatform).sort((a, b) => b.revenue - a.revenue), byStatus, rows,
  };
}
