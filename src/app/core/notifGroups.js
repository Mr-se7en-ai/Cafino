// گروه‌بندی موضوعیِ مرکز اعلان‌ها (۱.۸۲). منطق خالص و قابل‌آزمون؛ رابط در components/NotificationCenter.jsx.
export const LEVEL_RANK = { critical: 0, attention: 1, warning: 2, info: 3 };
export const LEVEL_BADGE = { critical: "فوری", attention: "مهم", warning: "پیگیری", info: "اطلاع" };
export const OTHER_TOPIC = "سایر";

// دسته‌های ریز ← موضوع نمایشی (هر چه اینجا نیامده با همان نام دسته نمایش داده می‌شود)
const TOPIC_OF = { "اطلاعیه": "اطلاعیه و تیکت", "تیکت": "اطلاعیه و تیکت", "یادآوری": "یادآوری و یادداشت", "سفارش": "سفارش‌ها", "ارسال": "سفارش‌ها" };
const TOPIC_ICON = { "مشتریان": "👥", "تعهدات": "📅", "انبار": "📦", "صندوق": "🧮", "به‌روزرسانی": "🔵", "پشتیبان‌گیری": "💾", "تقویم": "🗓️", "سفارش‌ها": "🛒", "اطلاعیه و تیکت": "📣", "یادآوری و یادداشت": "📝", [OTHER_TOPIC]: "🔔" };

export const topicOf = (n) => { const c = String(n?.category || "").trim(); return c ? (TOPIC_OF[c] || c) : OTHER_TOPIC; };
export const topicIcon = (t) => TOPIC_ICON[t] || "🔔";

/** اعلان‌ها را به گروه‌های موضوعی تقسیم می‌کند؛ گروه‌ها بر اساس شدیدترین اعلان و سپس تعداد، و اعلان‌های هر گروه بر اساس شدت (پایدار) مرتب‌اند. «سایر» همیشه آخر است. */
export function groupNotifications(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((n, i) => {
    const t = topicOf(n);
    if (!map.has(t)) map.set(t, { topic: t, icon: topicIcon(t), items: [], counts: { critical: 0, attention: 0, warning: 0, info: 0 }, first: i });
    const g = map.get(t), lv = n.level in LEVEL_RANK ? n.level : "info";
    g.items.push({ n, i }); g.counts[lv]++;
  });
  const out = [...map.values()].map((g) => {
    const worst = ["critical", "attention", "warning", "info"].find((l) => g.counts[l] > 0) || "info";
    const items = g.items.sort((a, b) => ((LEVEL_RANK[a.n.level] ?? 4) - (LEVEL_RANK[b.n.level] ?? 4)) || a.i - b.i).map((x) => x.n);
    return { topic: g.topic, icon: g.icon, count: items.length, worst, counts: g.counts, items, first: g.first };
  });
  return out.sort((a, b) => (a.topic === OTHER_TOPIC) - (b.topic === OTHER_TOPIC) || LEVEL_RANK[a.worst] - LEVEL_RANK[b.worst] || b.count - a.count || a.first - b.first);
}
