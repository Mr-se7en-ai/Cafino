// Persian text normalisation + number / amount / date helpers for the voice assistant.
// Pure functions only (no DOM, no storage) so they can be unit-tested with node:test.

const DIGITS_FA = "۰۱۲۳۴۵۶۷۸۹";
const DIGITS_AR = "٠١٢٣٤٥٦٧٨٩";

export function toLatinDigits(value) {
  return String(value ?? "").replace(/[۰-۹٠-٩]/g, (d) => {
    const fa = DIGITS_FA.indexOf(d);
    return String(fa >= 0 ? fa : DIGITS_AR.indexOf(d));
  });
}

// Lower-case-like canonical form used for every comparison in the assistant.
export function normalizeText(raw) {
  let t = toLatinDigits(raw).toLowerCase();
  t = t
    .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ۀ|ة/g, "ه").replace(/ئ/g, "ی").replace(/ؤ/g, "و").replace(/[أإ]/g, "ا")
    .replace(/[ً-ٰٟـ]/g, "")            // diacritics, tatweel
    .replace(/[‌‍‎‏]/g, " ");            // ZWNJ & direction marks → space
  // thousands separators inside numbers: 500,000  500٬000  ۵۰۰،۰۰۰
  t = t.replace(/(\d)[,٬،](?=\d{3}(?!\d))/g, "$1");
  t = t.replace(/(\d)٫(?=\d)/g, "$1.");                      // Arabic decimal separator
  // phone numbers dictated in groups ("0912 123 4567") → one token
  t = t.replace(/(?:\+98|0098)\s?9/g, "09");
  t = t.replace(/\b0?9(?:[\s-]?\d){9}\b/g, (m) => {
    const d = m.replace(/[\s-]/g, "");
    return d.length === 11 ? d : d.length === 10 ? "0" + d : m;
  });
  t = t.replace(/[^\p{L}\p{N}\s./+-]/gu, " ");               // other punctuation → space
  t = t.replace(/(?<!\d)[./+-]|[./+-](?!\d)/g, " ");         // keep separators only between digits
  return t.replace(/\s+/g, " ").trim();
}

export function hasQuestionMark(raw) { return /[?؟]/.test(String(raw ?? "")); }

// ───────────────────────── number words ─────────────────────────
const ONES = {
  صفر: 0, یک: 1, یه: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, شیش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10,
  یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, پونزده: 15, شانزده: 16, شونزده: 16,
  هفده: 17, هجده: 18, هیجده: 18, نوزده: 19,
};
const TENS = { بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90 };
const HUNDREDS = {
  صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, پانسد: 500, پونصد: 500,
  ششصد: 600, شیشصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900,
};
const SCALES = { هزار: 1e3, میلیون: 1e6, ملیون: 1e6, میلیارد: 1e9, ملیارد: 1e9 };
const UNIT_RIAL = new Set(["ریال", "ریالی", "ریالش"]);
const UNIT_TOMAN = new Set(["تومان", "تومن", "تومنی", "تومانی", "تومنش"]);
// nouns that mark a number as a quantity, not a price
export const QTY_NOUNS = new Set([
  "عدد", "برگ", "بسته", "تا", "دانه", "جلد", "ورق", "رول", "کارتریج", "حلقه", "متر", "ساعت", "دقیقه", "نفر",
  "کیلو", "گرم", "لیتر", "بطری", "جعبه", "قوطی", "پاکت", "شیت", "صفحه", "نسخه", "کپی", "تکه", "جفت",
]);

const isDigitToken = (tok) => /^\d+(?:\.\d+)?$/.test(tok);
const isNumberWord = (tok) => tok in ONES || tok in TENS || tok in HUNDREDS;

// Parses a run of numeric tokens starting at index i. Returns {value,end,hasScale,words} or null.
export function parseNumberRun(tokens, i) {
  let total = 0, current = 0, any = false, hasScale = false, j = i, words = false;
  while (j < tokens.length) {
    const tok = tokens[j];
    if (isDigitToken(tok)) { current += Number(tok); any = true; j++; continue; }
    if (isNumberWord(tok)) { current += ONES[tok] ?? TENS[tok] ?? HUNDREDS[tok]; any = true; words = true; j++; continue; }
    if (tok in SCALES) {
      if (!any && current === 0) { current = 1; any = true; }
      total += current * SCALES[tok]; current = 0; hasScale = true; words = true; j++; continue;
    }
    if (tok === "و" && any && j + 1 < tokens.length) {
      const nx = tokens[j + 1];
      if (isDigitToken(nx) || isNumberWord(nx) || nx === "نیم" || nx in SCALES) { j++; continue; }
      break;
    }
    if (tok === "نیم" && any) {
      // "یک و نیم میلیون" → current 1.5 before the scale; "دو میلیون و نیم" → 2.5 million
      const prev = tokens[j - 1] === "و";
      if (prev) { if (current === 0 && total > 0) { const last = lastScaleOf(total); total += last / 2; } else current += 0.5; j++; continue; }
      break;
    }
    break;
  }
  if (!any) return null;
  return { value: total + current, end: j, hasScale, words };
}
function lastScaleOf(total) { return total >= 1e9 ? 1e9 : total >= 1e6 ? 1e6 : 1e3; }

// Scans all numeric runs of a normalised text. Each run: {start,end,value,hasScale,unit,kind}
export function scanNumbers(text) {
  const tokens = text.split(" ").filter(Boolean);
  const runs = [];
  for (let i = 0; i < tokens.length;) {
    const run = parseNumberRun(tokens, i);
    if (!run) { i++; continue; }
    const next = tokens[run.end];
    let unit = null, end = run.end;
    if (next && UNIT_TOMAN.has(next)) { unit = "toman"; end++; }
    else if (next && UNIT_RIAL.has(next)) { unit = "rial"; end++; }
    const raw = tokens.slice(i, run.end).join(" ");
    let kind = "number";
    if (/^09\d{9}$/.test(raw)) kind = "phone";
    else if (!unit && !run.hasScale && next && QTY_NOUNS.has(next)) kind = "quantity";
    else if (unit || run.hasScale) kind = "money";
    runs.push({ start: i, end, numEnd: run.end, value: run.value, hasScale: run.hasScale, unit, kind, qtyNoun: kind === "quantity" ? next : null, raw });
    i = end;
  }
  return { tokens, runs };
}

// Removes token ranges [{start,end}] and returns the remaining text.
export function stripRanges(tokens, ranges) {
  const kill = new Set();
  ranges.forEach(({ start, end }) => { for (let k = start; k < end; k++) kill.add(k); });
  return tokens.filter((_, k) => !kill.has(k)).join(" ");
}

// ───────────────────────── money ─────────────────────────
// Internal currency is always rial. defaultUnit: what a bare number means ("rial"|"toman").
export function extractAmount(text, defaultUnit = "rial") {
  const { tokens, runs } = scanNumbers(text);
  const money = runs.filter((r) => r.kind === "money");
  let pick = money[0];
  if (!pick) {
    const plain = runs.filter((r) => r.kind === "number" && r.value > 0 && !isLikelyId(r));
    pick = plain.sort((a, b) => b.value - a.value)[0];
  }
  if (!pick) return { amount: 0, range: null, tokens, runs };
  const unit = pick.unit || defaultUnit;
  const amount = Math.round(pick.value * (unit === "toman" ? 10 : 1));
  return { amount, range: { start: pick.start, end: pick.end }, run: pick, tokens, runs };
}
function isLikelyId(run) { return /^\d{8,}$/.test(run.raw); }

// ───────────────────────── dates ─────────────────────────
export const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

export function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// Returns {iso, range:{start,end}} or null. ctx: {today, jalali:{toIso(y,m,d), fromIso(iso)->[y,m,d]}}
export function extractDate(text, ctx = {}) {
  const today = ctx.today;
  if (!today) return null;
  const tokens = text.split(" ").filter(Boolean);
  const at = (i, n = 1) => ({ start: i, end: i + n });
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "امروز") return { iso: today, range: at(i) };
    if (t === "دیروز") return { iso: addDaysIso(today, -1), range: at(i) };
    if (t === "پریروز") return { iso: addDaysIso(today, -2), range: at(i) };
    if (t === "فردا") return { iso: addDaysIso(today, 1), range: at(i) };
    if (t === "پس" && tokens[i + 1] === "فردا") return { iso: addDaysIso(today, 2), range: at(i, 2) };
  }
  // "N روز پیش|قبل" , "یک هفته پیش"
  for (let i = 0; i < tokens.length; i++) {
    const run = parseNumberRun(tokens, i);
    if (!run) continue;
    const unit = tokens[run.end], after = tokens[run.end + 1];
    if ((unit === "روز" || unit === "هفته") && (after === "پیش" || after === "قبل")) {
      return { iso: addDaysIso(today, -Math.round(run.value) * (unit === "هفته" ? 7 : 1)), range: { start: i, end: run.end + 2 } };
    }
    i = Math.max(i, run.end - 1);
  }
  // 1405/07/29 or 2026-10-21
  const m = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    let iso = null;
    if (y >= 1300 && y < 1700 && ctx.jalali) iso = ctx.jalali.toIso(y, mo, d);
    else if (y >= 1700) iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (iso) {
      const idx = tokens.findIndex((tk) => tk.includes(m[0]));
      return { iso, range: idx >= 0 ? at(idx) : null };
    }
  }
  // "25 مهر" / "25 مهر 1405"
  if (ctx.jalali) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const mi = JALALI_MONTHS.indexOf(tokens[i + 1]);
      if (isDigitToken(tokens[i]) && mi >= 0) {
        const d = Number(tokens[i]);
        if (d < 1 || d > 31) continue;
        const [cy] = ctx.jalali.fromIso(today);
        const hasYear = /^1[34]\d{2}$/.test(tokens[i + 2] || "");
        const iso = ctx.jalali.toIso(hasYear ? Number(tokens[i + 2]) : cy, mi + 1, d);
        return { iso, range: at(i, hasYear ? 3 : 2) };
      }
    }
  }
  return null;
}

// ───────────────────────── fuzzy matching ─────────────────────────
export function tokensOf(text) { return normalizeText(text).split(" ").filter(Boolean); }

// score in [0,1]: share of query tokens found (exact or prefix) in candidate
export function tokenScore(query, candidate) {
  const q = tokensOf(query), c = tokensOf(candidate);
  if (!q.length || !c.length) return 0;
  let hit = 0;
  q.forEach((qt) => { if (c.some((ct) => ct === qt || (qt.length >= 3 && (ct.startsWith(qt) || qt.startsWith(ct) && ct.length >= 3)))) hit++; });
  return hit / q.length;
}

export function rankMatches(query, items, getText, min = 0.5) {
  return items
    .map((item) => ({ item, score: tokenScore(query, getText(item)) }))
    .filter((r) => r.score >= min)
    .sort((a, b) => b.score - a.score);
}

// ───────────────────────── payment methods ─────────────────────────
export const METHOD_WORDS = [
  ["transfer", /(کارت به کارت|کارت‌به‌کارت|انتقال|واریز|ایرانکارت|حواله)/],
  ["pos", /(کارتخوان|پوز|pos|کارت)/i],
  ["cash", /(نقد|نقدی|کش)/],
  ["wallet", /(کیف پول|اعتبار مشتری)/],
  ["credit", /(نسیه|بدهکار|اعتباری|قرض|بعدا حساب|بعدا میده|بعدا می دهد|حساب بزن)/],
  ["free", /(رایگان|مجانی|هدیه)/],
];
export function extractMethod(text) {
  for (const [key, re] of METHOD_WORDS) {
    const m = text.match(re);
    if (m) return { key, match: m[0] };
  }
  return null;
}

// ───────────────────────── yes / no / cancel ─────────────────────────
export function interpretReply(raw) {
  const t = normalizeText(raw);
  if (!t) return null;
  if (/^(لغو|کنسل|بیخیال|منصرف|انصراف|نه نه|نمی خوام|نمیخوام|فراموش کن|ولش کن|بی خیال)(\s|$)/.test(t) || /^(نه|خیر|نخیر)(\s|$)/.test(t)) return "cancel";
  if (/^(بله|آره|اره|تایید|تأیید|درسته|باشه|اجرا کن|ثبت کن|ثبتش کن|انجام بده|انجام شود|بزن|اوکی|اکی|ok|okay|تایید می کنم|ثبت|اجرا)(\s|$)/i.test(t)) return "confirm";
  return null;
}

// Light stemmer used only for lexicon matching (plural «ها / های»).
export function stem(tok) {
  return tok.length > 4 ? tok.replace(/(ها|های)$/, "") : tok;
}

// Index of the first occurrence of the token sequence `phrase` (array) in `tokens`, or -1.
export function findSeq(tokens, phrase, from = 0) {
  outer: for (let i = from; i + phrase.length <= tokens.length; i++) {
    for (let k = 0; k < phrase.length; k++) if (stem(tokens[i + k]) !== stem(phrase[k])) continue outer;
    return i;
  }
  return -1;
}
