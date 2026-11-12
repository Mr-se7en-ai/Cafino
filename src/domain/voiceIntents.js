// Voice-assistant intent layer.
//
//   utterance ──► parseVoiceCommand() ──► { intent, confidence, slots, missing, issues }
//                                              │
//                       (UI shows / edits / confirms the structured intent)
//                                              ▼
//                         business logic executes the validated intent
//
// This module is PURE: no storage, no React, no clock — everything it needs from the
// app (today's date, categories, customers, stock, invoices…) is passed in `ctx`.
// All money slots are returned in RIAL (the app's internal unit); the unit the user
// spoke is kept in `slots.amountUnit` for display.

// ───────────────────────── text normalisation ─────────────────────────
const DIGIT_MAP = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

export function normalizeText(raw) {
  let s = String(raw ?? "");
  s = s.replace(/[۰-۹٠-٩]/g, d => DIGIT_MAP[d]);
  s = s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ۀ|ة/g, "ه").replace(/[ؤ]/g, "و").replace(/[إأآ]/g, "ا").replace(/ـ/g, "");
  s = s.replace(/[ً-ٰٟ]/g, ""); // harakat
  s = s.replace(/‌|‏|‎/g, " "); // ZWNJ / direction marks → space
  s = s.replace(/(?<=\d)[,٬،](?=\d{3})/g, ""); // 1,500,000
  s = s.replace(/٫/g, ".");
  s = s.replace(/[؟?!؛;:"'«»()\[\]{}…]/g, " ");
  s = s.replace(/[،,]/g, " ");
  s = s.replace(/\.(?!\d)/g, " ").replace(/(?<!\d)\./g, " ");
  s = s.replace(/تومن/g, "تومان").replace(/ملیون/g, "میلیون").replace(/میلیارد/g, "میلیارد");
  return s.replace(/\s+/g, " ").trim();
}

const tokenize = s => (s ? s.split(" ") : []);
const padded = s => ` ${s} `;
const hasPhrase = (norm, phrase) => padded(norm).includes(padded(normalizeText(phrase)));

// ───────────────────────── numbers (digits + Persian words) ─────────────────────────
const ONES = {
  صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, شیش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10,
  یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, پونزده: 15, شانزده: 16, شونزده: 16,
  هفده: 17, هجده: 18, نوزده: 19,
  بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90,
  صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, پونصد: 500, ششصد: 600, شیشصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900,
};
const SCALES = { هزار: 1e3, میلیون: 1e6, میلیارد: 1e9 };
const UNIT_TOMAN = new Set(["تومان"]);
const UNIT_RIAL = new Set(["ریال"]);
const isDigits = t => /^\d+(\.\d+)?$/.test(t);
const isNumWord = t => Object.prototype.hasOwnProperty.call(ONES, t);
const isScale = t => Object.prototype.hasOwnProperty.call(SCALES, t);
const isNumish = t => isDigits(t) || isNumWord(t) || isScale(t) || t === "نیم";

/** Find every numeric expression in a normalised string. */
export function extractNumbers(norm) {
  const toks = tokenize(norm);
  const out = [];
  let i = 0;
  while (i < toks.length) {
    if (!isNumish(toks[i]) || (toks[i] === "نیم" && !(isScale(toks[i + 1]) || (i > 0 && toks[i - 1] === "و")))) { i++; continue; }
    let j = i;
    const group = [];
    while (j < toks.length) {
      const t = toks[j];
      if (isNumish(t)) { group.push(t); j++; continue; }
      if (t === "و" && j + 1 < toks.length && isNumish(toks[j + 1]) && group.length) { group.push(t); j++; continue; }
      break;
    }
    while (group.length && group[group.length - 1] === "و") { group.pop(); j--; }
    // evaluate
    let total = 0, cur = 0, hasScale = false, hasWord = false;
    for (const t of group) {
      if (t === "و") continue;
      if (isDigits(t)) cur += Number(t);
      else if (isNumWord(t)) { cur += ONES[t]; hasWord = true; }
      else if (t === "نیم") { cur += 0.5; }
      else if (isScale(t)) { total += (cur || 1) * SCALES[t]; cur = 0; hasScale = true; hasWord = true; }
    }
    total += cur;
    const next = toks[j];
    const unit = UNIT_TOMAN.has(next) ? "toman" : UNIT_RIAL.has(next) ? "rial" : null;
    const rawTok = toks.slice(i, j).join(" ");
    const single = group.length === 1 && isDigits(group[0]) ? group[0] : null;
    out.push({
      value: Math.round(total * 1000) / 1000,
      start: i, end: unit ? j + 1 : j, hasScale, hasWord, unit, raw: rawTok, digitsOnly: single,
      isPhone: single ? /^0?9\d{9}$/.test(single) : false,
    });
    i = unit ? j + 1 : j;
  }
  return out;
}

/** Spoken amount → rial. */
export function toRial(value, unit, currencyUnit = "toman") {
  const u = unit || currencyUnit;
  return Math.round(value * (u === "toman" ? 10 : 1));
}

// ───────────────────────── fuzzy entity matching ─────────────────────────
const STOP = new Set(["و", "را", "به", "از", "با", "برای", "در", "یک", "این", "آن", "تا", "که", "هم", "جدید", "آقای", "خانم", "اقای", "دکتر", "مهندس"]);
const editDistance = (a, b) => {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};
const tokenSim = (a, b) => {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
  if (a.length >= 4 && b.length >= 4 && editDistance(a, b) <= 1) return 0.85;
  return 0;
};
/** How well does `label` appear inside `text`? 0..1 (both already normalised). */
export function labelScore(text, label) {
  const l = normalizeText(label);
  if (!l) return 0;
  if (hasPhrase(text, l)) return 1;
  const lt = tokenize(l).filter(t => !STOP.has(t));
  const tt = tokenize(text).filter(t => !STOP.has(t));
  if (!lt.length || !tt.length) return 0;
  let sum = 0;
  for (const t of lt) sum += Math.max(0, ...tt.map(x => tokenSim(x, t)));
  return sum / lt.length;
}
export function bestMatch(text, items, getLabel, min = 0.7) {
  let best = null;
  for (const item of items || []) {
    const s = labelScore(text, getLabel(item));
    if (s >= min && (!best || s > best.score || (s === best.score && getLabel(item).length > getLabel(best.item).length))) best = { item, score: s };
  }
  return best;
}

// ───────────────────────── dates ─────────────────────────
const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function parseDateSlot(norm, ctx) {
  const today = ctx.today;
  const rules = [
    ["پس فردا", 2], ["پسفردا", 2], ["فردا", 1], ["پریروز", -2], ["دیروز", -1], ["امروز", 0],
  ];
  for (const [w, n] of rules) if (hasPhrase(norm, w)) return { date: addDays(today, n), word: w, remove: w };
  const ago = norm.match(/(\d+) روز (?:پیش|قبل)/);
  if (ago) return { date: addDays(today, -Number(ago[1])), word: ago[0], remove: ago[0] };
  if (ctx.jalali && ctx.jalali.toIso && ctx.jalali.today) {
    const m = norm.match(new RegExp(`(\\d{1,2}) (${JALALI_MONTHS.join("|")})(?: (\\d{4}))?`));
    if (m) {
      const day = Number(m[1]), month = JALALI_MONTHS.indexOf(m[2]) + 1, year = m[3] ? Number(m[3]) : ctx.jalali.today[0];
      if (day >= 1 && day <= 31) {
        try { const iso = ctx.jalali.toIso(year, month, day); if (iso) return { date: iso, word: m[0], remove: m[0] }; } catch { /* ignore */ }
      }
    }
  }
  return null;
}

// ───────────────────────── small vocabularies ─────────────────────────
const METHOD_WORDS = [
  ["transfer", ["کارت به کارت", "کارت بکارت", "حواله", "انتقال", "واریز", "پایا", "ساتنا"]],
  ["pos", ["کارتخوان", "کارت خوان", "پوز", "با کارت", "کارتی"]],
  ["cash", ["نقدی", "نقد", "کش", "پول نقد", "نقداً", "نقدا"]],
];
export function parseMethod(norm, ctx) {
  for (const m of ctx.methods || []) if (m.label && !["cash", "pos", "transfer", "other", "wallet", "credit", "free"].includes(m.key) && hasPhrase(norm, m.label)) return { key: m.key, remove: m.label };
  if (hasPhrase(norm, "کیف پول")) return { key: "wallet", remove: "کیف پول" };
  for (const [key, words] of METHOD_WORDS) for (const w of words) if (hasPhrase(norm, w)) return { key, remove: w };
  return null;
}

export const NAV_TARGETS = [
  ["dateconv", ["تبدیل تاریخ", "مبدل تاریخ", "تبدیل شمسی", "تبدیل میلادی"]],
  ["inventory", ["انبار", "موجودی کالا", "انبارداری"]],
  ["transactions", ["تراکنش", "تراکنشها", "گردش مالی"]],
  ["topup", ["شارژ و اینترنت", "شارژ", "بسته اینترنت", "اینترنت"]],
  ["obligations", ["تعهدات", "تعهد", "اقساط", "قسط", "چکها", "چک"]],
  ["invoice", ["فاکتورها", "فاکتور"]],
  ["orders", ["سفارشها", "سفارش", "فروش"]],
  ["customers", ["مشتریان", "مشتری"]],
  ["ledger", ["حسابها", "دفتر حساب", "حساب"]],
  ["pos", ["صندوق", "پوز", "بستن صندوق"]],
  ["calendar", ["تقویم", "رویدادها", "رویداد"]],
  ["report", ["گزارشها", "گزارش"]],
  ["printscan", ["پرینت و اسکن", "پرینت", "اسکن", "چاپ"]],
  ["tariff", ["تعرفه", "قیمت خدمات", "لیست قیمت"]],
  ["links", ["لینکها", "لینک کاربردی", "لینک", "پیوند"]],
  ["settings", ["تنظیمات", "تنظیم"]],
  ["dashboard", ["داشبورد", "صفحه اصلی", "خانه", "صفحه نخست"]],
];
const compact = s => normalizeText(s).replace(/ /g, "");
export function parseNavTarget(norm) {
  const flat = norm.replace(/ها\b/g, "ها");
  for (const [key, words] of NAV_TARGETS) for (const w of words) {
    const n = normalizeText(w);
    if (hasPhrase(flat, n) || hasPhrase(flat, n.replace(/ها$/, "") + " ها") || compact(flat).includes(compact(w))) {
      if (n.length <= 3 && !hasPhrase(flat, n)) continue; // avoid 'دی'-like accidental substrings
      return key;
    }
  }
  return null;
}

const QUERY_TOPICS = [
  ["sales_today", ["فروش امروز", "فروش امروزم", "امروز چقدر فروختم", "امروز چقدر فروش"]],
  ["sales_month", ["فروش این ماه", "فروش ماه", "فروش ماهانه"]],
  ["profit_today", ["سود امروز"]],
  ["profit_month", ["سود این ماه", "سود ماه", "سود ماهانه"]],
  ["expense_today", ["هزینه امروز"]],
  ["expense_month", ["هزینه این ماه", "هزینه ماه"]],
  ["debt_total", ["بدهکار", "بدهی", "طلب"]],
  ["low_stock", ["کم موجودی", "رو به اتمام", "تمام شده", "کمبود", "ته کشیده"]],
  ["cash_balance", ["موجودی صندوق", "مانده صندوق", "صندوق چقدر", "پول صندوق"]],
  ["customer_count", ["تعداد مشتری", "چند مشتری", "چند نفر مشتری"]],
];

// ───────────────────────── intent catalogue ─────────────────────────
// fields: what the UI renders (and lets the user correct) before anything is written.
export const INTENT_META = {
  create_customer: { label: "ثبت مشتری جدید", icon: "👤", risk: "write", fields: [
    { key: "firstName", label: "نام", type: "text" }, { key: "lastName", label: "نام خانوادگی", type: "text" },
    { key: "phone", label: "شماره موبایل", type: "phone" }, { key: "note", label: "یادداشت", type: "text" }] },
  create_expense: { label: "ثبت هزینه", icon: "💸", risk: "write", fields: [
    { key: "amount", label: "مبلغ", type: "money", required: true }, { key: "category", label: "دسته", type: "category:expense" },
    { key: "description", label: "بابت", type: "text" }, { key: "method", label: "روش پرداخت", type: "method" }, { key: "date", label: "تاریخ", type: "date" }] },
  create_income: { label: "ثبت درآمد", icon: "💰", risk: "write", fields: [
    { key: "amount", label: "مبلغ", type: "money", required: true }, { key: "category", label: "دسته", type: "category:income" },
    { key: "description", label: "توضیح", type: "text" }, { key: "method", label: "روش دریافت", type: "method" }, { key: "date", label: "تاریخ", type: "date" }] },
  create_sale: { label: "ثبت فروش", icon: "🧾", risk: "write", fields: [
    { key: "description", label: "خدمت / کالا", type: "text", required: true }, { key: "qty", label: "تعداد", type: "number" },
    { key: "amount", label: "مبلغ کل", type: "money", required: true }, { key: "customerName", label: "مشتری (برای نسیه)", type: "text" },
    { key: "method", label: "روش پرداخت", type: "method" }, { key: "paid", label: "وضعیت پرداخت", type: "paid" }, { key: "date", label: "تاریخ", type: "date" }] },
  create_invoice: { label: "فاکتور جدید", icon: "📄", risk: "open", fields: [{ key: "customerName", label: "مشتری", type: "text" }] },
  create_order: { label: "ثبت سفارش", icon: "📋", risk: "write", fields: [
    { key: "title", label: "عنوان سفارش", type: "text", required: true }, { key: "customerName", label: "مشتری", type: "text" },
    { key: "amount", label: "مبلغ (اختیاری)", type: "money" }] },
  receive_payment: { label: "دریافت وجه", icon: "📥", risk: "write", fields: [
    { key: "invoiceNumber", label: "شماره فاکتور", type: "text" }, { key: "customerName", label: "مشتری", type: "text" },
    { key: "amount", label: "مبلغ (خالی = کل مانده)", type: "money" }, { key: "method", label: "روش", type: "method" }, { key: "date", label: "تاریخ", type: "date" }] },
  inventory_in: { label: "ورود به انبار", icon: "📦", risk: "write", fields: [
    { key: "itemName", label: "کالا", type: "text", required: true }, { key: "qty", label: "تعداد", type: "number", required: true }] },
  inventory_out: { label: "خروج از انبار", icon: "📤", risk: "write", fields: [
    { key: "itemName", label: "کالا", type: "text", required: true }, { key: "qty", label: "تعداد", type: "number", required: true }] },
  navigate: { label: "باز کردن بخش", icon: "🧭", risk: "nav", fields: [{ key: "target", label: "بخش", type: "text" }] },
  query: { label: "گزارش سریع", icon: "📊", risk: "read", fields: [{ key: "topic", label: "موضوع", type: "text" }] },
  confirm: { label: "تأیید", icon: "✅", risk: "control", fields: [] },
  cancel: { label: "لغو", icon: "✖️", risk: "control", fields: [] },
  help: { label: "راهنما", icon: "❓", risk: "control", fields: [] },
  unknown: { label: "نامشخص", icon: "🤔", risk: "control", fields: [] },
};
export const NAV_LABELS = {
  dashboard: "داشبورد", pos: "صندوق", orders: "فروش و سفارش‌ها", topup: "فروش شارژ و اینترنت", invoice: "فاکتورها", customers: "مشتریان",
  ledger: "حساب‌ها", obligations: "تعهدات", calendar: "تقویم", inventory: "انبار", report: "گزارش‌ها", transactions: "تراکنش‌ها",
  printscan: "فروش کپی و اسکن", tariff: "تعرفه", links: "لینک‌های کاربردی", dateconv: "تبدیل تاریخ", settings: "تنظیمات",
};

const CONFIRM_WORDS = ["تایید", "تایید کن", "تایید میکنم", "بله", "اره", "آره", "باشه", "اوکی", "اکی", "درسته", "ثبت کن", "ثبتش کن", "اجرا کن", "انجام بده", "انجام بده", "بزن", "تایید ثبت", "تایید و ثبت", "okay", "ok", "yes"];
const CANCEL_WORDS = ["لغو", "لغو کن", "نه", "نخیر", "انصراف", "کنسل", "بیخیال", "ولش کن", "نمیخوام", "بی خیال", "رها کن", "cancel", "no"];
const HELP_WORDS = ["راهنما", "کمک", "چه کارهایی بلدی", "چه کار میکنی", "چی بلدی", "help"];
const whole = (norm, list) => list.map(normalizeText).includes(norm);

const CREATE_VERBS = ["ثبت", "افزودن", "اضافه", "بساز", "ایجاد", "وارد کن", "تعریف"];
const has = (norm, words) => words.some(w => hasPhrase(norm, w));

// Words that never belong to a free-text description
const FILLER = new Set(["ثبت", "کن", "کنید", "لطفا", "لطفاً", "یک", "یه", "بابت", "برای", "جهت", "مبلغ", "به", "از", "را", "رو", "تومان", "ریال", "هزینه", "درآمد", "دریافت", "پرداخت", "خرید", "کردم", "کرد", "خریدم", "پرداختم", "دادم", "گرفتم", "شد", "است", "بود", "ام", "جدید", "نقدی", "نقد", "امروز", "دیروز", "فردا", "پریروز", "با", "در", "تو", "بده", "کن"]);

function removeWords(norm, phrases) {
  let s = padded(norm);
  for (const p of phrases.filter(Boolean).map(normalizeText).sort((a, b) => b.length - a.length)) {
    s = s.split(padded(p)).join(" ").replace(/\s+/g, " ");
    s = padded(s.trim());
  }
  return s.trim();
}
function removeTokenRanges(toks, ranges) {
  const drop = new Set();
  ranges.forEach(([a, b]) => { for (let i = a; i < b; i++) drop.add(i); });
  return toks.filter((_, i) => !drop.has(i));
}

// ───────────────────────── slot extraction per intent ─────────────────────────
function pickAmount(nums, norm, { preferScale = true } = {}) {
  const cands = nums.filter(n => !n.isPhone && n.value > 0);
  const withUnit = cands.find(n => n.unit);
  if (withUnit) return withUnit;
  const scaled = cands.find(n => n.hasScale);
  if (scaled) return scaled;
  const toks = tokenize(norm);
  const afterKey = cands.find(n => ["مبلغ", "هزینه", "درآمد", "قیمت", "به مبلغ"].includes(toks[n.start - 1]));
  if (afterKey) return afterKey;
  // plain large numbers (e.g. 250000)
  const big = cands.filter(n => n.value >= 1000);
  if (big.length) return big.sort((a, b) => b.value - a.value)[0];
  if (!preferScale) return cands[0] || null;
  return null;
}

function descriptionFrom(norm, consumedPhrases, nums, usedNums, extraFiller = []) {
  const toks = tokenize(norm);
  const ranges = usedNums.map(n => [n.start, n.end]);
  let rest = removeTokenRanges(toks, ranges).join(" ");
  rest = removeWords(rest, consumedPhrases);
  const after = rest.match(/(?:بابت|برای|جهت)\s+(.+)$/);
  const base = after ? after[1] : rest;
  const words = tokenize(base).filter(t => !FILLER.has(t) && !extraFiller.includes(t) && !isDigits(t));
  return words.join(" ").trim();
}

const EXPENSE_ALIASES = [
  [["برق", "قبض برق"], "برق"], [["اینترنت", "نت"], "اینترنت"], [["اجاره", "کرایه"], "اجاره"], [["حقوق", "دستمزد", "عیدی"], "حقوق"],
  [["تعمیر", "نگهداری", "سرویس"], "تعمیر"], [["تجهیزات", "دستگاه", "پرینتر", "کامپیوتر", "لپ تاپ", "ماوس", "کیبورد"], "تجهیزات"],
  [["چای", "قهوه", "نوشیدنی", "مواد مصرفی", "شکر", "آب"], "نوشیدنی"],
];
function matchCategory(text, list, type) {
  if (!Array.isArray(list) || !list.length) return null;
  const direct = bestMatch(text, list, x => x, 0.85);
  if (direct) return direct.item;
  if (type === "expense") {
    for (const [words, stem] of EXPENSE_ALIASES) {
      if (words.some(w => hasPhrase(text, w))) { const hit = list.find(c => normalizeText(c).includes(normalizeText(stem))); if (hit) return hit; }
    }
  }
  return null;
}

function extractMoneySlots(norm, ctx, intentId) {
  const nums = extractNumbers(norm);
  const chosen = pickAmount(nums, norm, { preferScale: false });
  const slots = {};
  if (chosen) {
    slots.amount = toRial(chosen.value, chosen.unit, ctx.currencyUnit);
    slots.amountUnit = chosen.unit || ctx.currencyUnit || "toman";
    slots.amountSpoken = chosen.value;
  }
  return { nums, chosen, slots, intentId };
}

function extractTx(norm, ctx, type) {
  const { nums, chosen, slots } = extractMoneySlots(norm, ctx);
  const consumed = [];
  const d = parseDateSlot(norm, ctx);
  slots.date = d ? d.date : ctx.today;
  if (d) consumed.push(d.remove);
  const m = parseMethod(norm, ctx);
  slots.method = m ? m.key : "cash";
  if (m) consumed.push(m.remove);
  const trig = type === "expense" ? ["هزینه", "خرج", "خرید", "پرداخت کردم", "پرداختم", "خریدم", "خرید کردم", "ثبت"] : ["درآمد", "دریافتی", "واریز", "ثبت", "دریافت"];
  const desc = descriptionFrom(norm, [...consumed, ...trig, "تومان", "ریال"], nums, chosen ? [chosen] : []);
  slots.description = desc;
  const list = ctx.categories && ctx.categories[type];
  const cat = matchCategory(`${desc} ${norm}`, list, type);
  slots.category = cat || (type === "expense" ? ((list || []).find(c => /سایر/.test(c)) || "سایر هزینه") : ((list || []).find(c => /دلخواه|سایر/.test(c)) || "مبلغ دلخواه"));
  slots.categoryMatched = !!cat;
  return slots;
}

function extractPhone(norm) {
  const m = norm.replace(/(?<=\d) (?=\d)/g, "").match(/(?:\+98|0098|98)?(0?9\d{9})/);
  if (!m) return "";
  const d = m[1];
  return d.startsWith("0") ? d : "0" + d;
}

function extractCustomer(norm, ctx) {
  const m = bestMatch(norm, ctx.customers || [], c => c.name, 0.8);
  return m ? m.item : null;
}

function extractCustomerSlots(norm, ctx) {
  const phone = extractPhone(norm);
  let text = norm.replace(/(?:\+98|0098|98)?0?9(?: ?\d){9}/g, " ");
  let note = "";
  const noteM = text.match(/(?:توضیح|توضیحات|یادداشت|نکته)\s+(.+)$/);
  if (noteM) { note = noteM[1].trim(); text = text.slice(0, noteM.index); }
  text = removeWords(text, ["مشتری جدید", "ثبت مشتری", "افزودن مشتری", "مشتری اضافه کن", "یک مشتری", "مشتری", "ثبت کن", "ثبت", "افزودن", "اضافه کن", "اضافه", "به نام", "اسم", "نام", "شماره تماس", "شماره موبایل", "شماره", "تلفن", "موبایل", "همراه", "تماس", "جدید", "لطفا", "با", "و", "کن", "را", "رو", "ایجاد", "بساز", "تعریف"]);
  const names = tokenize(text).filter(t => !isDigits(t));
  const slots = { phone };
  if (names.length) { slots.firstName = names[0]; slots.lastName = names.slice(1, 4).join(" "); }
  if (note) slots.note = note;
  return slots;
}

function extractInventorySlots(norm, ctx) {
  const nums = extractNumbers(norm).filter(n => !n.isPhone && n.value > 0);
  const toks = tokenize(norm);
  const qtyNum = nums.find(n => !n.unit) || null;
  const item = bestMatch(norm, ctx.inventory || [], i => i.name, 0.75);
  const slots = {};
  if (qtyNum) slots.qty = qtyNum.value;
  if (item) { slots.itemId = item.item.id; slots.itemName = item.item.name; slots.itemMatched = true; if (item.item.unit) slots.unit = item.item.unit; }
  else {
    const rest = removeWords(removeTokenRanges(toks, qtyNum ? [[qtyNum.start, qtyNum.end]] : []).join(" "), [
      "ورود به انبار", "خروج از انبار", "به انبار", "از انبار", "ثبت", "افزودن", "اضافه کن", "اضافه", "افزایش", "کاهش", "کم کن", "وارد کن", "خارج کن", "انبار", "موجودی", "کالا", "ورود", "خروج", "مصرف", "تعداد", "عدد", "واحد", "برگ", "بسته", "عدد", "تا", "تومان", "ریال", "کردم", "شد", "خرید", "رو", "را", "به", "از", "در", "کن"]);
    const name = tokenize(rest).filter(t => !isDigits(t)).join(" ");
    if (name) { slots.itemName = name; slots.itemMatched = false; }
  }
  return slots;
}

function extractReceiveSlots(norm, ctx) {
  const slots = {};
  const inv = norm.match(/(?:فاکتور|صورتحساب|صورت حساب|شماره)\s*(?:شماره\s*)?(\d{1,10})/);
  if (inv) slots.invoiceNumber = inv[1];
  const nums = extractNumbers(norm).filter(n => !n.isPhone && n.value > 0 && !(inv && n.digitsOnly === inv[1]));
  const amt = pickAmount(nums, norm, { preferScale: false });
  if (amt) { slots.amount = toRial(amt.value, amt.unit, ctx.currencyUnit); slots.amountUnit = amt.unit || ctx.currencyUnit || "toman"; slots.amountSpoken = amt.value; }
  const cust = extractCustomer(norm, ctx);
  if (cust) { slots.customerId = cust.id; slots.customerName = cust.name; }
  const m = parseMethod(norm, ctx);
  slots.method = m ? m.key : "cash";
  const d = parseDateSlot(norm, ctx);
  slots.date = d ? d.date : ctx.today;
  if (slots.invoiceNumber && Array.isArray(ctx.sales)) {
    const sale = ctx.sales.find(s => String(s.number) === String(slots.invoiceNumber));
    if (sale) { slots.saleId = sale.id; slots.saleRemaining = sale.remaining; if (!slots.customerName) slots.customerName = sale.customerName; }
  }
  return slots;
}

function extractSaleSlots(norm, ctx) {
  const { nums, chosen, slots } = extractMoneySlots(norm, ctx);
  const consumed = [];
  const d = parseDateSlot(norm, ctx); slots.date = d ? d.date : ctx.today; if (d) consumed.push(d.remove);
  const m = parseMethod(norm, ctx); slots.method = m ? m.key : "cash"; if (m) consumed.push(m.remove);
  const cust = extractCustomer(norm, ctx);
  if (cust) { slots.customerId = cust.id; slots.customerName = cust.name; consumed.push(cust.name); }
  slots.paid = has(norm, ["نسیه", "بدهکار", "اعتباری", "بعدا حساب", "بعدا میده", "پرداخت نکرد", "قرض"]) ? "unpaid" : "paid";
  // quantity: a plain number (not the amount) — e.g. "۱۰ برگ"
  const qtyNum = nums.find(n => !n.isPhone && n !== chosen && !n.unit && !n.hasScale && n.value > 0 && n.value < 100000);
  slots.qty = qtyNum ? qtyNum.value : 1;
  const used = [chosen, qtyNum].filter(Boolean);
  const desc = descriptionFrom(norm, [...consumed, "فروش", "فروختم", "فروش رفت", "نسیه", "بدهکار", "اعتباری", "تومان", "ریال", "برگ", "عدد", "تا"], nums, used, ["به", "مشتری", "خدمت", "خدمات", "کالا"]);
  slots.description = desc;
  if (/(فروش|فروختم)\s+(کالا|محصول)/.test(norm)) slots.kind = "product";
  return slots;
}

function extractOrderSlots(norm, ctx) {
  const cust = extractCustomer(norm, ctx);
  const nums = extractNumbers(norm).filter(n => !n.isPhone);
  const amt = pickAmount(nums, norm, { preferScale: false });
  const slots = {};
  if (cust) { slots.customerId = cust.id; slots.customerName = cust.name; }
  if (amt) { slots.amount = toRial(amt.value, amt.unit, ctx.currencyUnit); slots.amountUnit = amt.unit || ctx.currencyUnit || "toman"; slots.amountSpoken = amt.value; }
  const title = descriptionFrom(norm, [cust && cust.name, "سفارش جدید", "ثبت سفارش", "سفارش", "برای", "تومان", "ریال", "ثبت", "افزودن", "اضافه", "کن"], nums, amt ? [amt] : [], ["مشتری", "به", "نام"]);
  if (title) slots.title = title;
  return slots;
}

function extractQuerySlots(norm) {
  for (const [topic, phrases] of QUERY_TOPICS) if (phrases.some(p => hasPhrase(norm, p))) return { topic };
  const sales = has(norm, ["فروش", "فروختم"]), profit = has(norm, ["سود"]), expense = has(norm, ["هزینه", "خرج"]);
  const period = has(norm, ["ماه", "ماهانه"]) ? "month" : "today";
  if (sales) return { topic: period === "month" ? "sales_month" : "sales_today" };
  if (profit) return { topic: period === "month" ? "profit_month" : "profit_today" };
  if (expense) return { topic: period === "month" ? "expense_month" : "expense_today" };
  return {};
}

// ───────────────────────── scoring ─────────────────────────
function scoreIntents(norm, f, ctx) {
  const s = {};
  const add = (k, v) => { s[k] = (s[k] || 0) + v; };
  const money = !!f.amount;
  const question = has(norm, ["چقدر", "چند", "چنده", "چنده", "میزان", "چه قدر", "چه مقدار", "بگو", "نشان بده", "نمایش بده", "بود", "هست", "چطور", "وضعیت"]);

  // customer
  if (has(norm, ["مشتری جدید", "ثبت مشتری", "افزودن مشتری", "مشتری اضافه", "ایجاد مشتری", "مشتری بساز", "یک مشتری"])) add("create_customer", 6);
  else if (has(norm, ["مشتری"]) && f.phone && !has(norm, ["فاکتور", "فروش", "دریافت", "سفارش"])) add("create_customer", 3);
  // expense
  if (has(norm, ["هزینه", "خرج", "مخارج"])) add("create_expense", 4);
  if (has(norm, ["خریدم", "خرید کردم", "پرداخت کردم", "پرداختم", "دادم بابت", "خرج کردم"])) add("create_expense", 3);
  if (money && has(norm, ["بابت", "جهت"])) add("create_expense", 1);
  if (question) add("create_expense", -3);
  // income
  if (has(norm, ["درآمد", "دریافتی", "واریزی", "واریز شد", "ثبت درآمد"])) add("create_income", 4);
  // receive payment
  const recv = has(norm, ["دریافت", "وصول", "تسویه", "پرداخت کرد", "پرداخت کردند", "داد", "حساب کرد", "گرفتم", "واریز کرد"]);
  if (recv && (f.invoiceNumber || f.customerName)) add("receive_payment", 6);
  else if (recv && has(norm, ["فاکتور", "صورتحساب", "صورت حساب"])) add("receive_payment", 4);
  if (f.invoiceNumber && has(norm, ["دریافت وجه", "وصول"])) add("receive_payment", 2);
  if (recv && !(f.invoiceNumber || f.customerName)) add("create_income", 2);
  // sale
  if (has(norm, ["فروش", "فروختم", "فروش رفت", "فروش کردم"])) add("create_sale", 3);
  if (has(norm, ["فروش کالا", "فروش محصول"])) add("create_sale", 2);
  if (money && has(norm, ["فروش", "فروختم"])) add("create_sale", 2);
  if (question || !money) add("create_sale", -3);
  if (has(norm, ["فروش"]) && has(norm, ["شارژ", "بسته اینترنت"]) && !money) add("create_sale", -2);
  // invoice / order
  if (has(norm, ["فاکتور جدید", "صدور فاکتور", "ثبت فاکتور", "فاکتور بزن", "فاکتور بساز", "یک فاکتور"])) add("create_invoice", 6);
  if (has(norm, ["سفارش جدید", "ثبت سفارش", "سفارش بده", "سفارش ثبت", "یک سفارش"])) add("create_order", 6);
  // inventory
  const invWord = has(norm, ["انبار", "موجودی", "کالا"]) || !!f.itemMatched;
  if (has(norm, ["ورود", "وارد کن", "اضافه کن", "افزایش", "اضافه شد", "شارژ شد", "ورودی"]) && invWord) add("inventory_in", 5);
  if (has(norm, ["خروج", "خارج کن", "کم کن", "کاهش", "مصرف شد", "مصرف کردم", "خروجی", "کسر"]) && invWord) add("inventory_out", 5);
  if (invWord && has(norm, ["خرید", "خریدم"]) && f.itemMatched) add("inventory_in", 3);
  if (invWord && has(norm, ["انبار"]) && !(s.inventory_in || s.inventory_out)) add("inventory_in", 1);
  // query
  if (question) add("query", 3);
  if (has(norm, ["سود", "بدهکار", "بدهی", "کم موجودی", "رو به اتمام", "مانده صندوق"])) add("query", 2);
  if (has(norm, ["گزارش"]) && has(norm, ["امروز", "ماه"])) add("query", 2);
  // navigation
  if (has(norm, ["برو", "باز کن", "نمایش", "صفحه", "بخش", "ببر", "برم", "نشان بده", "بیار", "فهرست"]) && f.navTarget) add("navigate", 3);
  if (f.navTarget && norm.split(" ").length <= 3 && !(s.create_customer || s.create_invoice || s.create_order)) add("navigate", 2);
  // a trailing "جدید" + target is a create-form request, never plain navigation
  if (s.create_customer || s.create_invoice || s.create_order) add("navigate", -3);
  return s;
}

const REQUIRED = {
  create_customer: [["firstName", "lastName"]], // at least one of
  create_expense: ["amount"],
  create_income: ["amount"],
  create_sale: ["description", "amount"],
  create_order: ["title"],
  receive_payment: [["invoiceNumber", "customerName"], "amount"],
  inventory_in: ["itemName", "qty"],
  inventory_out: ["itemName", "qty"],
  navigate: ["target"],
  query: ["topic"],
};
const SLOT_LABEL = { amount: "مبلغ", description: "شرح", title: "عنوان سفارش", itemName: "نام کالا", qty: "تعداد", target: "بخش", topic: "موضوع گزارش", firstName: "نام مشتری", lastName: "نام مشتری", invoiceNumber: "شماره فاکتور", customerName: "نام مشتری" };

/** Which required slots are still empty? (returns slot keys; groups report their first key) */
export function missingSlots(intent, slots) {
  const out = [];
  for (const req of REQUIRED[intent] || []) {
    if (Array.isArray(req)) { if (!req.some(k => slots[k])) out.push(req[0]); }
    else if (!(slots[req] > 0 || (typeof slots[req] === "string" && slots[req].trim()))) out.push(req);
  }
  return out;
}
export const slotLabel = k => SLOT_LABEL[k] || k;

/** Cross-checks that need app data (unknown customer, invoice, stock …). */
export function validateIntent(result, ctx) {
  const issues = [];
  const { intent, slots } = result;
  if (slots.amount != null) {
    if (!(slots.amount > 0)) issues.push("مبلغ باید بیشتر از صفر باشد");
    else if (slots.amount > 1e12) issues.push("مبلغ بسیار بزرگ است؛ دوباره بررسی کنید");
  }
  if (intent === "receive_payment") {
    if (slots.invoiceNumber && Array.isArray(ctx.sales) && !slots.saleId) issues.push(`فاکتور شماره ${slots.invoiceNumber} پیدا نشد`);
    if (slots.saleRemaining != null && slots.amount > slots.saleRemaining) issues.push("مبلغ بیشتر از مانده‌ی فاکتور است؛ فقط به اندازه‌ی مانده ثبت می‌شود");
    if (slots.saleRemaining === 0) issues.push("این فاکتور مانده‌ای ندارد");
  }
  if ((intent === "inventory_in" || intent === "inventory_out") && slots.itemName && !slots.itemMatched) {
    issues.push(intent === "inventory_out" ? `کالای «${slots.itemName}» در انبار پیدا نشد` : `کالای «${slots.itemName}» در انبار نیست؛ به‌عنوان کالای جدید ساخته می‌شود`);
  }
  if (intent === "create_sale" && slots.paid === "unpaid" && !slots.customerId) issues.push("برای فروش نسیه باید مشتری مشخص باشد");
  if (intent === "create_order" && !slots.customerId) issues.push("مشتری مشخص نیست؛ فرم سفارش برای انتخاب مشتری باز می‌شود");
  if (intent === "create_customer" && slots.phone && Array.isArray(ctx.customers) && ctx.customers.some(c => c.phone && String(c.phone).replace(/\D/g, "").slice(-10) === slots.phone.slice(-10))) {
    issues.push("مشتری با این شماره قبلاً ثبت شده است");
  }
  if (intent === "create_customer" && slots.phone && !/^09\d{9}$/.test(slots.phone)) issues.push("شماره موبایل معتبر نیست");
  return issues;
}

/** Main entry: free speech/text → structured intent. */
export function parseVoiceCommand(raw, ctxIn = {}) {
  const ctx = { today: new Date().toISOString().slice(0, 10), currencyUnit: "toman", ...ctxIn };
  const norm = normalizeText(raw);
  const base = { raw: String(raw ?? ""), normalized: norm, intent: "unknown", confidence: 0, slots: {}, missing: [], issues: [], alternatives: [] };
  if (!norm) return base;

  // control words (whole utterance)
  if (whole(norm, CONFIRM_WORDS)) return { ...base, intent: "confirm", confidence: 1 };
  if (whole(norm, CANCEL_WORDS)) return { ...base, intent: "cancel", confidence: 1 };
  if (whole(norm, HELP_WORDS)) return { ...base, intent: "help", confidence: 1 };

  // features used by scoring
  const nums = extractNumbers(norm);
  const amt = pickAmount(nums, norm, { preferScale: false });
  const inv = norm.match(/(?:فاکتور|صورتحساب|صورت حساب)\s*(?:شماره\s*)?(\d{1,10})/);
  const cust = extractCustomer(norm, ctx);
  const item = bestMatch(norm, ctx.inventory || [], i => i.name, 0.8);
  const f = {
    amount: amt ? amt.value : 0,
    phone: extractPhone(norm),
    invoiceNumber: inv ? inv[1] : null,
    customerName: cust ? cust.name : null,
    itemMatched: !!item,
    navTarget: parseNavTarget(norm),
  };
  const scores = scoreIntents(norm, f, ctx);
  const ranked = Object.entries(scores).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return base;
  const [top, topScore] = ranked[0];
  const second = ranked[1] ? ranked[1][1] : 0;
  let slots = {};
  switch (top) {
    case "create_customer": slots = extractCustomerSlots(norm, ctx); break;
    case "create_expense": slots = extractTx(norm, ctx, "expense"); break;
    case "create_income": slots = extractTx(norm, ctx, "income"); break;
    case "create_sale": slots = extractSaleSlots(norm, ctx); break;
    case "create_order": slots = extractOrderSlots(norm, ctx); break;
    case "create_invoice": { const c = extractCustomer(norm, ctx); slots = c ? { customerId: c.id, customerName: c.name } : {}; break; }
    case "receive_payment": slots = extractReceiveSlots(norm, ctx); break;
    case "inventory_in": case "inventory_out": slots = extractInventorySlots(norm, ctx); break;
    case "navigate": slots = { target: f.navTarget }; break;
    case "query": slots = extractQuerySlots(norm); break;
    default: break;
  }
  const missing = missingSlots(top, slots);
  let confidence = Math.min(1, 0.35 + topScore * 0.09);
  confidence -= Math.min(0.5, (topScore - second) < 2 && second > 0 ? 0.15 : 0);
  confidence -= missing.length * 0.1;
  confidence = Math.max(0.05, Math.min(1, Math.round(confidence * 100) / 100));
  const out = { ...base, intent: confidence < 0.3 ? "unknown" : top, confidence, slots, missing,
    alternatives: ranked.slice(1, 3).map(([intent, score]) => ({ intent, score })) };
  if (out.intent === "unknown") { out.slots = {}; out.missing = []; out.alternatives = ranked.slice(0, 2).map(([intent, score]) => ({ intent, score })); return out; }
  out.issues = validateIntent(out, ctx);
  return out;
}

/** A follow-up utterance answering a question about a missing slot ("مبلغ چقدر بود؟" → "پانصد هزار تومان"). */
export function fillMissingSlot(current, raw, ctxIn = {}) {
  if (!current || !current.missing || !current.missing.length) return null;
  const ctx = { today: new Date().toISOString().slice(0, 10), currencyUnit: "toman", ...ctxIn };
  const norm = normalizeText(raw);
  if (!norm) return null;
  const slots = { ...current.slots };
  const key = current.missing[0];
  const nums = extractNumbers(norm);
  const clean = removeWords(norm, ["مبلغ", "تومان", "ریال", "هست", "است", "بود", "حدود", "تقریبا", "نام", "اسم", "عنوان", "شماره", "فاکتور", "تعداد", "عدد", "کالا", "بابت", "برای"]);
  if (key === "amount") {
    const a = pickAmount(nums, norm, { preferScale: false }) || nums.find(n => !n.isPhone && n.value > 0);
    if (!a) return null;
    slots.amount = toRial(a.value, a.unit, ctx.currencyUnit); slots.amountUnit = a.unit || ctx.currencyUnit; slots.amountSpoken = a.value;
  } else if (key === "qty") {
    const a = nums.find(n => !n.isPhone && n.value > 0); if (!a) return null; slots.qty = a.value;
  } else if (key === "invoiceNumber" || key === "customerName") {
    const m = norm.match(/(\d{1,10})/);
    const c = extractCustomer(norm, ctx);
    if (m && /فاکتور|شماره/.test(norm + " فاکتور")) { slots.invoiceNumber = m[1]; const sale = (ctx.sales || []).find(s => String(s.number) === m[1]); if (sale) { slots.saleId = sale.id; slots.saleRemaining = sale.remaining; slots.customerName = slots.customerName || sale.customerName; } }
    else if (c) { slots.customerId = c.id; slots.customerName = c.name; } else return null;
  } else if (key === "firstName" || key === "lastName") {
    const names = tokenize(clean).filter(t => !isDigits(t));
    if (!names.length) return null; slots.firstName = names[0]; slots.lastName = names.slice(1, 4).join(" ");
    const ph = extractPhone(norm); if (ph) slots.phone = ph;
  } else if (key === "itemName") {
    const it = bestMatch(norm, ctx.inventory || [], i => i.name, 0.75);
    if (it) { slots.itemId = it.item.id; slots.itemName = it.item.name; slots.itemMatched = true; }
    else if (clean) { slots.itemName = clean; slots.itemMatched = false; } else return null;
  } else if (key === "description" || key === "title") {
    if (!clean) return null; slots[key] = clean;
  } else if (key === "target") {
    const t = parseNavTarget(norm); if (!t) return null; slots.target = t;
  } else return null;
  const next = { ...current, slots, raw: `${current.raw} ⟵ ${raw}` };
  next.missing = missingSlots(next.intent, slots);
  next.confidence = Math.max(current.confidence, 0.7);
  next.issues = validateIntent(next, ctx);
  return next;
}

/** Re-validate after the user edited a field in the UI. */
export function reviseIntent(current, patch, ctxIn = {}) {
  const ctx = { today: new Date().toISOString().slice(0, 10), currencyUnit: "toman", ...ctxIn };
  const slots = { ...current.slots, ...patch };
  if (patch.customerName !== undefined) {
    const m = bestMatch(normalizeText(patch.customerName), ctx.customers || [], c => c.name, 0.8);
    if (m) { slots.customerId = m.item.id; slots.customerName = m.item.name; } else { delete slots.customerId; }
  }
  if (patch.itemName !== undefined) {
    const m = bestMatch(normalizeText(patch.itemName), ctx.inventory || [], i => i.name, 0.75);
    if (m) { slots.itemId = m.item.id; slots.itemName = m.item.name; slots.itemMatched = true; if (m.item.unit) slots.unit = m.item.unit; } else { delete slots.itemId; slots.itemMatched = false; }
  }
  if (patch.invoiceNumber !== undefined) {
    const sale = (ctx.sales || []).find(s => String(s.number) === String(patch.invoiceNumber));
    if (sale) { slots.saleId = sale.id; slots.saleRemaining = sale.remaining; if (!slots.customerName) slots.customerName = sale.customerName; } else { delete slots.saleId; delete slots.saleRemaining; }
  }
  const next = { ...current, slots };
  next.missing = missingSlots(next.intent, slots);
  next.issues = validateIntent(next, ctx);
  return next;
}

/** One-line human summary of an intent (used for history, speech feedback and logs). */
export function summarizeIntent(r, fmtMoney = n => String(n)) {
  const s = r.slots || {};
  switch (r.intent) {
    case "create_customer": return `مشتری جدید: ${[s.firstName, s.lastName].filter(Boolean).join(" ") || "—"}${s.phone ? ` (${s.phone})` : ""}`;
    case "create_expense": return `هزینه ${fmtMoney(s.amount || 0)}${s.description ? ` بابت ${s.description}` : ""}`;
    case "create_income": return `درآمد ${fmtMoney(s.amount || 0)}${s.description ? ` — ${s.description}` : ""}`;
    case "create_sale": return `فروش ${s.description || ""} ${fmtMoney(s.amount || 0)}${s.customerName ? ` به ${s.customerName}` : ""}${s.paid === "unpaid" ? " (نسیه)" : ""}`.trim();
    case "create_invoice": return "فاکتور جدید";
    case "create_order": return `سفارش «${s.title || "—"}»${s.customerName ? ` برای ${s.customerName}` : ""}`;
    case "receive_payment": return `دریافت ${s.amount ? fmtMoney(s.amount) : "کل مانده"} ${s.invoiceNumber ? `از فاکتور ${s.invoiceNumber}` : s.customerName ? `از ${s.customerName}` : ""}`.trim();
    case "inventory_in": return `ورود ${s.qty || ""} ${s.itemName || ""} به انبار`.trim();
    case "inventory_out": return `خروج ${s.qty || ""} ${s.itemName || ""} از انبار`.trim();
    case "navigate": return `رفتن به ${NAV_LABELS[s.target] || s.target || "—"}`;
    case "query": return "گزارش سریع";
    default: return INTENT_META[r.intent] ? INTENT_META[r.intent].label : r.intent;
  }
}

export const VOICE_EXAMPLES = [
  "مشتری جدید علی رضایی ۰۹۱۲۱۲۳۴۵۶۷",
  "هزینه ۵۰۰ هزار تومان بابت کاغذ",
  "درآمد دو میلیون تومان کارتخوان",
  "فروش ۱۰ برگ پرینت رنگی ۵۰ هزار تومان به علی رضایی نسیه",
  "دریافت ۲ میلیون تومان از فاکتور ۱۰۰۵",
  "ورود ۲۰ بسته کاغذ A4 به انبار",
  "سفارش جدید برای علی رضایی طراحی لوگو",
  "فروش امروز چقدر بود؟",
  "برو به گزارش‌ها",
];
