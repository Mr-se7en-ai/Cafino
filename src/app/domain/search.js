// موتور جستجوی «کاوینو» — جستجو در همهٔ بخش‌های برنامه (فقط روی داده‌های همین دستگاه؛ هیچ درخواستی به بیرون نمی‌رود).
// ورودی: متن جستجو ← خروجی: نتیجه‌های گروه‌بندی‌شده با امتیاز. بدون وابستگی به React؛ با داده‌های localStorage کار می‌کند.
import { TABS, DEFAULT_TARIFF_DATA, TARIFF_STORAGE_KEY, CUSTOMERS_STORAGE_KEY, INV_STORAGE, INV_STORAGE_KEY, ORDERS_STORAGE_KEY, LEDGER_STORAGE, TX_KEY, OBL_KEY, EMP_KEY, NOTES_KEY, REMINDERS_KEY, JM } from "../core/constants.js";
import { dateToJalali } from "../core/jalali.js";
import { getSales, lsRead, lsWrite } from "./sales.jsx";
import { allLinks } from "../pages/links.jsx";

export const SEARCH_BRAND = { fa: "کافیند", en: "CAFIND", tagline: "هر چیزی را در کافینو پیدا کنید" };
const CAL_KEY = "cafenet_cal_events", RECENT_KEY = "cafenet_cafind_recent", FOCUS_KEY = "cafenet_search_focus";

// ───────── یکسان‌سازی متن فارسی/عربی/ارقام ─────────
const DIGITS = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
export function norm(v) {
  return String(v == null ? "" : v).toLowerCase()
    .replace(/[۰-۹٠-٩]/g, (c) => DIGITS[c])
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ی")
    .replace(/[ً-ٰٟـ]/g, "")       // اعراب و کشیده
    .replace(/[‌‍‎‏]/g, "")         // نیم‌فاصله و نشانه‌های جهت (می‌خواهم = میخواهم)
    .replace(/[٬,،]/g, "")                                // جداکنندهٔ هزارگان
    .replace(/\s+/g, " ").trim();
}
export const normalize = norm;
const tokens = (q) => norm(q).split(" ").filter(Boolean);

// برای جستجو در تاریخ: 1405/8/5 ، 1405/08/05 ، «آبان»
export function dateWords(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ""))) return "";
  try { const [y, m, d] = dateToJalali(String(iso).slice(0, 10)); const p = (n) => String(n).padStart(2, "0"); return `${y}/${p(m)}/${p(d)} ${y}/${m}/${d} ${JM[m - 1]} ${d} ${JM[m - 1]}`; } catch { return ""; }
}
const money = (n) => { const r = Math.round(Number(n) || 0); return r ? `${r} ${Math.round(r / 10)}` : ""; };   // ریال و تومان

// امتیاز یک نتیجه نسبت به توکن‌های جستجو؛ 0 = نامرتبط (همهٔ توکن‌ها باید پیدا شوند)
function scoreOf(toks, title, sub, extra) {
  const t = norm(title), s = norm(sub), e = norm(extra);
  let total = 0;
  for (const k of toks) {
    let best = 0;
    if (t === k) best = 100;
    else if (t.startsWith(k)) best = 80;
    else if (t.split(" ").some((w) => w.startsWith(k))) best = 65;
    else if (t.includes(k)) best = 45;
    else if (s.split(" ").some((w) => w.startsWith(k))) best = 30;
    else if (s.includes(k)) best = 22;
    else if (e.includes(k)) best = 12;
    if (!best) return 0;
    total += best;
  }
  return total / toks.length + (t.startsWith(toks.join(" ")) ? 15 : 0);
}

// برای هایلایت: بازه‌های تطابق در متن اصلی (روی متن هنجارشده نگاشت می‌شود، اگر طول عوض نشده باشد)
export function highlightRanges(text, q) {
  const raw = String(text || ""), toks = tokens(q);
  if (!raw || !toks.length) return [];
  const n = norm(raw);
  if (n.length !== raw.length) {            // طول متن هنجارشده فرق دارد (نیم‌فاصله…) — نگاشت نمی‌شود
    const out = []; const low = raw.toLowerCase();
    toks.forEach((k) => { const i = low.indexOf(k); if (i >= 0) out.push([i, i + k.length]); });
    return mergeRanges(out);
  }
  const out = []; toks.forEach((k) => { let i = n.indexOf(k); while (i >= 0 && out.length < 12) { out.push([i, i + k.length]); i = n.indexOf(k, i + k.length); } });
  return mergeRanges(out);
}
function mergeRanges(r) { const s = [...r].sort((a, b) => a[0] - b[0]), out = []; for (const x of s) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([...x]); } return out; }

// ───────── دسته‌ها ─────────
export const CATEGORIES = [
  { key: "action", label: "کارهای سریع", icon: "⚡" }, { key: "page", label: "صفحه‌ها", icon: "🧭" }, { key: "setting", label: "تنظیمات", icon: "⚙️" },
  { key: "customer", label: "مشتریان", icon: "👥" }, { key: "invoice", label: "فروش و فاکتور", icon: "🧾" }, { key: "order", label: "سفارش‌ها", icon: "📋" },
  { key: "stock", label: "انبار", icon: "📦" }, { key: "tx", label: "تراکنش‌ها", icon: "💳" }, { key: "ledger", label: "حساب‌ها و بدهی", icon: "📒" },
  { key: "obligation", label: "تعهدات و چک", icon: "🗓️" }, { key: "employee", label: "کارمندان", icon: "🧑‍💼" }, { key: "note", label: "یادداشت‌ها", icon: "📝" },
  { key: "reminder", label: "یادآورها", icon: "⏰" }, { key: "event", label: "رویدادها", icon: "📆" }, { key: "tariff", label: "تعرفه", icon: "🏷️" }, { key: "link", label: "لینک‌ها", icon: "🔗" },
];
export const categoryMeta = (k) => CATEGORIES.find((g) => g.key === k) || { key: k, label: k, icon: "🔎" };

export const QUICK_ACTIONS = [
  { id: "new_sale", title: "فروش جدید", sub: "ثبت فروش یکپارچه", words: "فروش جدید ثبت فروش سیستم فروش یکپارچه کاشیر" },
  { id: "new_online_sale", title: "فروش آنلاین جدید", sub: "ثبت سفارش اینستاگرام، دیجی‌کالا، ...", words: "فروش آنلاین سفارش اینترنتی پلتفرم اینستاگرام" },
  { id: "add_income", title: "ثبت درآمد", sub: "افزودن تراکنش درآمد", words: "درآمد دریافت ثبت درآمد" },
  { id: "add_expense", title: "ثبت هزینه", sub: "افزودن تراکنش هزینه", words: "هزینه خرج پرداخت ثبت هزینه" },
  { id: "new_customer", title: "مشتری جدید", sub: "افزودن مشتری", words: "مشتری جدید افزودن مشتری" },
  { id: "new_order", title: "سفارش جدید", sub: "ثبت سفارش", words: "سفارش جدید ثبت سفارش" },
  { id: "new_invoice", title: "فاکتور جدید", sub: "صدور فاکتور", words: "فاکتور جدید صدور فاکتور" },
  { id: "new_reminder", title: "یادآور جدید", sub: "ساخت یادآور", words: "یادآور جدید یادم بنداز یادآوری" },
  { id: "new_note", title: "یادداشت جدید", sub: "نوشتن یادداشت", words: "یادداشت جدید نوشتن یادداشت" },
  { id: "health_check", title: "بررسی وضعیت کافینو", sub: "کنترل سلامت کسب‌وکار", words: "بررسی وضعیت کافینو سلامت کسب‌وکار کنترل سلامت مغایرت تعادل حساب" },
];
export const suggestions = () => ["فروش جدید", "بدهکار", "کم‌موجودی", "چک", "یادآور امروز", "پشتیبان‌گیری", "تعرفه", "حقوق"];

const TAB_WORDS = {
  uploads: "مدیریت فایل دریافت فایل از مشتری QR کیوآر فایل‌های مشتری",
  "miniapp-orders": "آنلاین شاپ مینی‌اپ مینی اپ تلگرام درخواست سفارش مشتری سفارش‌های مینی‌اپ فروش آنلاین",
  dashboard: "خانه داشبورد مدیریتی کاشی ویجت", pos: "صندوق فروش کاشیر pos", orders: "فروش سفارش‌ها فروش‌ها سفارش", topup: "شارژ اینترنت بسته ایرانسل همراه اول رایتل", invoice: "فاکتور فاکتورها صورتحساب",
  audit: "گزارش حسابرسی مرکز مالی سرور مالی audit ابطال تغییر قیمت موجودی بازیابی بکاپ دلیل دستگاه زنجیره هش لاگ فعالیت",
  inbox: "اطلاعیه اطلاعیه‌ها تیکت تیکت‌ها پشتیبانی پنل مرکزی ادمین پیام صندوق پیام پاسخ درخواست پشتیبان",
  health: "سلامت کسب‌وکار بررسی وضعیت کافینو کنترل مغایرت تعادل حساب‌ها موجودی بدهی بکاپ همگام‌سازی",
  customers: "مشتری مشتریان باشگاه پیگیری", ledger: "حساب دفتر کل بدهکار بستانکار بدهی", obligations: "تعهدات چک اجاره حقوق قسط کارمند", calendar: "تقویم رویداد ثبت‌نام مناسبت", notes: "یادداشت یادآور یادآوری",
  inventory: "انبار موجودی کالا کاغذ کارتریج", report: "گزارش گزارشات سود زیان نمودار", transactions: "تراکنش درآمد هزینه", printscan: "پرینت اسکن کپی مرکز چاپ و اسکن کنتور پرینتر اسکنر جاب صفحه چاپ‌شده مغایرت کنتور", tariff: "تعرفه قیمت خدمات نرخ", links: "لینک سایت کاربردی", dateconv: "تبدیل تاریخ شمسی میلادی", settings: "تنظیمات", about: "درباره من کافینو نسخه تغییرات نسخه‌ها version changelog",
};
export const SETTINGS_SECTIONS = [
  { key: "appearance", label: "ظاهر برنامه", words: "تم تیره روشن شیشه‌ای فلوئنت fluent فونت" }, { key: "profile", psub: "shop", label: "پروفایل ← پروفایل فروشگاه", words: "نام فروشگاه آدرس تلفن لوگو مشخصات کافی‌نت شماره کارت شبا" },
  { key: "accounting", label: "تنظیمات حسابداری", words: "واحد پول تومان ریال مالیات" }, { key: "categories", label: "دسته‌بندی‌ها", words: "دسته بندی درآمد هزینه" },
  { key: "printscan", label: "تنظیمات پرینت و اسکن", words: "هزینه پرینت" }, { key: "connections", sub: "ai", conn: true, label: "اتصال ← هوش مصنوعی و دستیار", words: "دستیار صوتی agent کلید api هوش مصنوعی" }, { key: "connections", sub: "bale", conn: true, label: "اتصال ← ربات بله", words: "بله bale ربات گزارش روزانه توکن بات‌فادر" }, { key: "connections", sub: "telegram", conn: true, label: "اتصال ← ربات تلگرام", words: "تلگرام telegram ربات گزارش روزانه توکن botfather" },
  { key: "privacy", label: "حریم خصوصی", words: "امنیت" }, { key: "logs", sub: "errors", label: "لاگ ← لاگ خطا", words: "خطا error ارور مشکل" }, { key: "logs", sub: "activity", label: "لاگ ← لاگ فعالیت", words: "فعالیت تاریخچه عملیات کاربران" }, { key: "backup", label: "پشتیبان‌گیری و بازیابی", words: "بکاپ پشتیبان بازیابی خروجی" },
  { key: "profile", psub: "user", label: "پروفایل ← پروفایل کاربر", words: "رمز عبور حساب کاربری ایمیل کد بازیابی" },
];

// ───────── منبع داده‌ها (فقط خواندن از حافظهٔ همین دستگاه) ─────────
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const get = (k) => arr(lsRead(k, []));
export function collectSources() {
  let tariff = lsRead(TARIFF_STORAGE_KEY, null); if (!Array.isArray(tariff) || !tariff.length) tariff = DEFAULT_TARIFF_DATA;
  const cal = lsRead(CAL_KEY, null);
  let links = []; try { links = allLinks(); } catch { /* ignore */ }
  let sales = []; try { sales = getSales(); } catch { /* ignore */ }
  return {
    customers: get(CUSTOMERS_STORAGE_KEY), invoices: get(INV_STORAGE), sales: arr(sales), orders: get(ORDERS_STORAGE_KEY), transactions: get(TX_KEY),
    obligations: get(OBL_KEY), employees: get(EMP_KEY), inventory: get(INV_STORAGE_KEY), ledger: get(LEDGER_STORAGE), notes: get(NOTES_KEY),
    reminders: get(REMINDERS_KEY), calEvents: cal && Array.isArray(cal.custom) ? arr(cal.custom) : [], tariff: Array.isArray(tariff) ? tariff : [], links: arr(links),
  };
}

const custName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim();
const faDate = (iso) => { try { const [y, m, d] = dateToJalali(String(iso).slice(0, 10)); return `${fa(d)} ${JM[m - 1]} ${fa(y)}`; } catch { return iso || ""; } };
const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const toman = (rial) => `${fa(Math.round((Number(rial) || 0) / 10).toLocaleString("en-US"))} تومان`;

// ورودی‌های فهرست: { key, cat, title, sub, extra, go:{tab,settingsTab?,focus?,action?}, date?, meta? }
export function buildIndex(src) {
  const out = [];
  const add = (cat, id, title, sub, extra, go, date, meta) => out.push({ key: `${cat}:${id}`, cat, title: String(title || ""), sub: String(sub || ""), extra: String(extra || ""), go, date: date || "", meta: meta || "" });
  QUICK_ACTIONS.forEach((a) => add("action", a.id, a.title, a.sub, a.words, { action: a.id }));
  TABS.forEach((t) => add("page", t.key, t.label, "صفحه", TAB_WORDS[t.key] || "", { tab: t.key }));
  SETTINGS_SECTIONS.forEach((x) => add("setting", x.key + (x.sub || "") + (x.psub || ""), `تنظیمات ← ${x.label}`, "تنظیمات", `${x.label} ${x.words}`, { tab: "settings", settingsTab: x.key, ...(x.conn ? { connSub: x.sub } : x.sub ? { logsSub: x.sub } : {}), ...(x.psub ? { profileSub: x.psub } : {}) }));
  const customers = arr(src.customers);
  customers.forEach((c) => add("customer", c.id, custName(c) || "بدون نام", [c.phone, c.address].filter(Boolean).join(" · "), `${c.nationalId || ""} ${c.note || ""} ${c.postalCode || ""}`, { tab: "customers", focus: { kind: "customer", id: c.id } }, "", c.wallet ? `کیف پول ${toman(c.wallet)}` : ""));
  const seenInv = new Set();
  arr(src.sales).filter((s) => !s.cancelled).forEach((s) => {
    if (s.invoiceId != null) seenInv.add(String(s.invoiceId));
    add("invoice", s.id, `فاکتور ${s.number || ""} — ${s.customerName || "مشتری حضوری"}`, (s.lines || []).map((l) => l.desc).filter(Boolean).join("، "),
      `${s.notes || ""} ${money(s.total)} ${dateWords(s.date)} ${s.online ? `${s.online.platform || ""} ${s.online.orderRef || ""} ${s.online.trackingCode || ""} آنلاین` : ""} ${(s.payments || []).map((p) => p.method).join(" ")}`,
      { tab: "invoice", focus: { kind: "sale", id: s.id, q: String(s.number || "") } }, s.date, `${toman(s.total)} · ${faDate(s.date)}`);
  });
  arr(src.invoices).filter((iv) => iv.saleId == null && !seenInv.has(String(iv.id)) && iv.status !== "void").forEach((iv) =>
    add("invoice", `inv${iv.id}`, `فاکتور ${iv.number || ""} — ${iv.customerName || "مشتری"}`, (iv.items || []).map((l) => l.desc).filter(Boolean).join("، "),
      `${iv.note || ""} ${money(iv.totalAmount)} ${dateWords(iv.date)} ${iv.status || ""}`, { tab: "invoice", focus: { kind: "sale", id: iv.id, q: String(iv.number || "") } }, iv.date, `${toman(iv.totalAmount)} · ${faDate(iv.date)}`));
  arr(src.orders).forEach((o) => add("order", o.id, o.title || "سفارش", o.notes || "", `${money(o.amount)} ${dateWords(o.createdAt)} ${o.status || ""}`, { tab: "orders", focus: { kind: "order", id: o.id } }, o.createdAt, `${o.amount ? toman(o.amount) + " · " : ""}${faDate(o.createdAt)}`));
  arr(src.inventory).forEach((i) => add("stock", i.id, i.name || "کالا", `موجودی ${fa(i.qty ?? 0)} ${i.unit || ""}`, `${i.cat || ""} ${money(i.salePrice)} ${money(i.unitCost)}`, { tab: "inventory", focus: { kind: "stock", id: i.id } }, "", i.salePrice ? `فروش ${toman(i.salePrice)}` : ""));
  arr(src.transactions).forEach((t) => add("tx", t.id, `${t.type === "income" ? "درآمد" : "هزینه"}: ${t.category || ""}`, t.desc || "", `${money(t.amount)} ${dateWords(t.date)} ${t.method || ""}`, { tab: "transactions", focus: { kind: "tx", id: t.id, q: t.desc || t.category || "" } }, t.date, `${toman(t.amount)} · ${faDate(t.date)}`));
  arr(src.ledger).forEach((a) => {
    const c = customers.find((x) => String(x.id) === String(a.customerId)), name = c ? custName(c) : `${a.firstName || ""} ${a.lastName || ""}`.trim() || "حساب";
    arr(a.entries).forEach((e) => add("ledger", e.id, `${e.category || "ثبت"} — ${name}`, e.desc || "", `${money(e.amount)} ${dateWords(e.date)}`, { tab: "ledger", focus: { kind: "ledger", id: a.id, q: name } }, e.date, `${toman(e.amount)} · ${faDate(e.date)}`));
  });
  arr(src.obligations).forEach((o) => add("obligation", o.id, o.title || "تعهد", [o.party, o.note].filter(Boolean).join(" · "), `${o.kind || ""} ${money(o.amount)} ${dateWords(o.dueDate)} ${o.status || ""}`, { tab: "obligations", focus: { kind: "obligation", id: o.id } }, o.dueDate, `${toman(o.amount)} · سررسید ${faDate(o.dueDate)}`));
  arr(src.employees).forEach((e) => add("employee", e.id, e.name || "کارمند", [e.role, e.phone].filter(Boolean).join(" · "), `${e.note || ""} ${money(e.salary)} حقوق`, { tab: "obligations", focus: { kind: "employee", id: e.id } }, "", e.salary ? `حقوق ${toman(e.salary)}` : ""));
  arr(src.notes).forEach((n) => add("note", n.id, n.title || String(n.body || "").slice(0, 50) || "یادداشت", String(n.body || "").slice(0, 120), n.body || "", { tab: "notes", focus: { kind: "note", id: n.id, view: "notes" } }, n.updatedAt ? new Date(n.updatedAt).toISOString().slice(0, 10) : "", n.pinned ? "📌 سنجاق‌شده" : ""));
  arr(src.reminders).forEach((r) => add("reminder", r.id, r.title || "یادآور", r.note || "", `${r.date || ""} ${dateWords(r.date)} ${r.time || ""}`, { tab: "notes", focus: { kind: "reminder", id: r.id, view: "reminders" } }, r.date, `${faDate(r.date)} · ${fa(r.time || "")}${r.status === "done" ? " · انجام شد" : ""}`));
  arr(src.calEvents).forEach((e, i) => add("event", e.id ?? i, e.title || "رویداد", e.note || "", `${e.start || ""} ${dateWords(e.start)}`, { tab: "calendar", focus: { kind: "event", id: e.id ?? i } }, e.start, e.start ? faDate(e.start) : ""));
  arr(src.tariff).forEach((g) => arr(g.items).forEach((it) => add("tariff", `${g.cat}:${it.id ?? it.name}`, it.name || "خدمت", `${g.cat || ""}${it.note ? " · " + it.note : ""}`, money(it.price), { tab: "tariff", focus: { kind: "tariff", id: it.id } }, "", it.price ? toman(it.price) : "")));
  arr(src.links).forEach((l) => add("link", l.id ?? l.url, l.title || l.url, l.desc || l.url || "", `${l.url || ""} ${l.cat || ""}`, { tab: "links", focus: { kind: "link", id: l.id } }, "", ""));
  return out;
}

// ───────── پاسخ فوری (ماشین‌حساب / تاریخ امروز) ─────────

// ارزیابی امن عبارت حسابی (بدون eval): + - * / % ، پرانتز، ممیز، منفیِ یکانی
function evalExpr(src) {
  let i = 0;
  const peek = () => src[i];
  const num = () => { const m = /^\d+(?:\.\d+)?|^\.\d+/.exec(src.slice(i)); if (!m) throw new Error("num"); i += m[0].length; let v = parseFloat(m[0]); while (peek() === "%") { i++; v /= 100; } return v; };
  const atom = () => { if (peek() === "(") { i++; const v = add(); if (peek() !== ")") throw new Error("paren"); i++; let r = v; while (peek() === "%") { i++; r /= 100; } return r; } if (peek() === "-") { i++; return -atom(); } if (peek() === "+") { i++; return atom(); } return num(); };
  const mul = () => { let v = atom(); while (peek() === "*" || peek() === "/") { const o = src[i++]; const r = atom(); v = o === "*" ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (peek() === "+" || peek() === "-") { const o = src[i++]; const r = mul(); v = o === "+" ? v + r : v - r; } return v; };
  const v = add();
  if (i !== src.length) throw new Error("trailing");
  return v;
}
export function instantAnswer(q, now = new Date()) {
  const raw = norm(q).replace(/٪/g, "%").replace(/[−–]/g, "-").replace(/×|x/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  const looksLikeDateOrPhone = /^\d{2,4}[/-]\d{1,2}[/-]\d{1,2}$/.test(raw) || /\d{8,}/.test(raw) || /^0\d/.test(raw);
  if (!looksLikeDateOrPhone && /^[\d+\-*/().%]+$/.test(raw) && /[+\-*/%]/.test(raw.replace(/^-/, "")) && /\d/.test(raw)) {
    try {
      const v = evalExpr(raw);
      if (typeof v === "number" && Number.isFinite(v)) return { kind: "calc", title: `${q.trim()} = ${fa(Number(v.toFixed(6)).toLocaleString("en-US"))}`, value: v, sub: "ماشین‌حساب" };
    } catch { /* عبارت نامعتبر */ }
  }
  const n = norm(q);
  if (["امروز", "تاریخ امروز", "تاریخ", "today"].includes(n)) {
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return { kind: "date", title: `امروز ${faDate(iso)}`, sub: `${iso} (میلادی)` };
  }
  return null;
}

// ───────── جستجو ─────────
// خروجی تخت: [{ ...entry, score }] مرتب‌شده؛ «perCat» سقف هر دسته (در حالت همه)، «limit» سقف کل.
export function search(index, query, { limit = 60, perCat = 6, cat = null } = {}) {
  const toks = tokens(query);
  if (!toks.length) return [];
  const hits = [];
  for (const e of index || []) {
    if (cat && e.cat !== cat) continue;
    const s = scoreOf(toks, e.title, e.sub, e.extra);
    if (s > 0) hits.push({ ...e, score: s });
  }
  hits.sort((a, b) => b.score - a.score || String(b.date || "").localeCompare(String(a.date || "")));
  const per = {}, out = [];
  for (const h of hits) { per[h.cat] = (per[h.cat] || 0) + 1; if (cat || per[h.cat] <= perCat) out.push(h); if (out.length >= limit) break; }
  return out;
}
export function countByCategory(results) { const m = {}; (results || []).forEach((r) => { m[r.cat] = (m[r.cat] || 0) + 1; }); return m; }

// ───────── جستجوهای اخیر + «تمرکز» روی نتیجه بعد از رفتن به صفحه ─────────
export const getRecent = () => { const v = lsRead(RECENT_KEY, []); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : []; };
export function pushRecent(q) { const s = String(q || "").trim(); if (s.length < 2) return; lsWrite(RECENT_KEY, [s, ...getRecent().filter((x) => x !== s)].slice(0, 8)); }
export const clearRecent = () => lsWrite(RECENT_KEY, []);
export function setSearchFocus(go) { try { sessionStorage.setItem(FOCUS_KEY, JSON.stringify({ tab: go.tab, ...(go.focus || {}), ts: Date.now() })); } catch { /* ignore */ } }
// خواندنِ «خالص» (بدون پاک‌کردن) برای مقداردهی اولیهٔ useState — پاک‌کردن در useEffect با clearSearchFocus انجام می‌شود (initializer نباید اثر جانبی داشته باشد)
export function peekSearchFocus(tab, kinds) {
  try {
    const v = JSON.parse(sessionStorage.getItem(FOCUS_KEY) || "null");
    if (!v || v.tab !== tab || Date.now() - (v.ts || 0) > 15000) return null;
    if (kinds && !kinds.includes(v.kind)) return null;
    return v;
  } catch { return null; }
}
export function clearSearchFocus() { try { sessionStorage.removeItem(FOCUS_KEY); } catch { /* sessionStorage در دسترس نیست */ } }
export function takeSearchFocus(tab, kinds) {
  try {
    const v = JSON.parse(sessionStorage.getItem(FOCUS_KEY) || "null");
    if (!v || v.tab !== tab || Date.now() - (v.ts || 0) > 15000) return null;
    if (kinds && !kinds.includes(v.kind)) return null;
    sessionStorage.removeItem(FOCUS_KEY);
    return v;
  } catch { return null; }
}
