// «آنلاین شاپ» (1.85): خلاصهٔ زنده برای کاشی/ویجت داشبورد — منطق خالص و قابل‌آزمون.
// ورودی: وضعیت شمارنده‌ها (miniReqState) و اینکه برنامه به سرور وصل است یا نه.
const n0 = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const fa = (n) => Number(n).toLocaleString("fa-IR");

/** {total, parts:[{key,label,count}]} — فقط مواردی که نیاز به اقدام دارند. */
export function onlineShopCounts(st = {}) {
  const parts = [
    { key: "new", label: "سفارش تازه", count: n0(st.newCount) },
    { key: "pay", label: "رسید در انتظار تأیید", count: n0(st.pendingPayments) },
    { key: "chat", label: "پیام خوانده‌نشده", count: n0(st.unreadChats) },
  ];
  return { total: parts.reduce((a, p) => a + p.count, 0), parts };
}

/** کاشی زنده: { big, sub, lines } */
export function onlineShopLive(st, connected) {
  if (!connected) return { big: "—", sub: "برای دیدن سفارش‌ها به سرور وصل شوید", lines: ["آنلاین شاپ: سفارش، رسید و گفتگوی مینی‌اپ"] };
  const { total, parts } = onlineShopCounts(st);
  if (!total) return { big: "✓", sub: st && st.ready ? "مورد تازه‌ای نیست" : "در حال بررسی…", lines: ["سفارش‌ها، رسیدها و پیام‌ها مرتب است"] };
  return { big: fa(total), sub: "مورد نیازمند پاسخ", lines: parts.filter((p) => p.count).map((p) => `${fa(p.count)} ${p.label}`) };
}
