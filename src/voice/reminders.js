// Voice intents for notes & reminders (یادداشت و یادآوری).
// Pure: no DOM / storage. «Now» comes from ctx.now (ms) so everything is testable.
// Spoken time is understood in the ways people actually say it:
//   «فردا ساعت ۵ عصر», «ساعت ۱۷:۳۰», «ساعت پنج و نیم», «یک ساعت دیگه», «نیم ساعت دیگه», «۳ روز دیگه»,
//   «هفتهٔ بعد», «یکشنبه», «هر روز / هر هفته / هر ماه / هر سال», «فردا صبح».
import { parseNumberRun, findSeq, stripRanges, stem } from "./normalize.js";
import { addDaysIso } from "./normalize.js";

const isDigit = (t) => /^\d+$/.test(t || "");
const p2 = (n) => String(n).padStart(2, "0");
export const DEFAULT_TIME = "09:00";
const PERIOD_DEFAULT = { صبح: "08:00", ظهر: "12:00", عصر: "17:00", شب: "21:00" };
const WEEKDAYS = [["شنبه", 6], ["یکشنبه", 0], ["دوشنبه", 1], ["سه شنبه", 2], ["چهارشنبه", 3], ["پنجشنبه", 4], ["پنج شنبه", 4], ["جمعه", 5]];
const TRAIL = new Set(["دیگه", "دیگر", "بعد", "بعدش", "بعدتر", "دیگری"]);
const REPEAT_WORDS = [["هر روز", "daily"], ["روزانه", "daily"], ["هر هفته", "weekly"], ["هفتگی", "weekly"], ["هر ماه", "monthly"], ["ماهانه", "monthly"], ["هر سال", "yearly"], ["سالانه", "yearly"]];

const nowOf = (ctx) => new Date(ctx.now != null ? ctx.now : Date.now());
const localIso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const localTime = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const tsOf = (date, time) => new Date(`${date}T${time}:00`).getTime();
const dowOf = (iso) => new Date(iso + "T12:00:00").getDay();

// Clock time after «ساعت»: returns {hour, minute, period, end} or null
function clockAfter(tokens, i) {
  const a = tokens[i + 1];
  if (a === undefined) return null;
  let h, m = 0, j;
  if (isDigit(a)) {
    h = Number(a); j = i + 2;
    if (isDigit(tokens[j]) && a.length <= 2 && Number(tokens[j]) < 60) { m = Number(tokens[j]); j++; }                 // «17:30» → «17 30»
    else if (tokens[j] === "و" || tokens[j] === "ونیم") {
      if (tokens[j] === "ونیم") { m = 30; j++; }
      else if (tokens[j + 1] === "نیم") { m = 30; j += 2; }
      else if (tokens[j + 1] === "ربع") { m = 15; j += 2; }
      else if (isDigit(tokens[j + 1]) && tokens[j + 2] === "دقیقه") { m = Number(tokens[j + 1]); j += 3; }
    }
  } else {
    const run = parseNumberRun(tokens, i + 1);
    if (!run || run.value > 24) return null;
    h = Math.floor(run.value); if (run.value % 1) m = 30;
    j = run.end;
    if (tokens[j] === "ربع" && tokens[j - 1] === "و") { m = 15; j++; }
  }
  if (h > 24 || m > 59) return null;
  let period = null;
  if (tokens[j] === "بعد" && tokens[j + 1] === "از" && tokens[j + 2] === "ظهر") { period = "pm"; j += 3; }
  else if (tokens[j] === "قبل" && tokens[j + 1] === "از" && tokens[j + 2] === "ظهر") { period = "am"; j += 3; }
  else if (tokens[j] === "نیمه" && tokens[j + 1] === "شب") { period = "mid"; j += 2; }
  else if (["صبح", "بامداد"].includes(tokens[j])) { period = "am"; j++; }
  else if (tokens[j] === "ظهر") { period = "noon"; j++; }
  else if (["عصر", "غروب"].includes(tokens[j])) { period = "pm"; j++; }
  else if (tokens[j] === "شب") { period = "night"; j++; }
  return { hour: h, minute: m, period, end: j };
}

function applyPeriod(h, period) {
  if (period === "am") return h === 12 ? 0 : h;
  if (period === "noon") return h >= 1 && h <= 4 ? h + 12 : h;            // «ساعت ۱ ظهر» = 13
  if (period === "pm") return h < 12 ? h + 12 : h;
  if (period === "night") return h === 12 ? 0 : h < 6 ? h + 12 + (h < 6 && h >= 1 ? 0 : 0) : h < 12 ? h + 12 : h;   // «۱۰ شب» = 22, «۱۲ شب» = 0, «۲ شب» = 2 (بامداد) handled below
  if (period === "mid") return h === 12 ? 0 : h;
  return null;
}

// Main entry. tokens: normalised tokens. Returns everything the intent needs plus the token ranges to strip from the title.
export function parseWhen(tokens, ctx = {}) {
  const now = nowOf(ctx), today = ctx.today || localIso(now);
  const ranges = [];
  let date = null, time = null, repeat = "none", relative = false, period = null, clockFound = false;

  // 1) relative durations: «۱۰ دقیقه دیگه», «یک ساعت و نیم دیگه», «نیم ساعت دیگه», «یه ربع دیگه», «۳ روز دیگه», «دو هفته دیگه»
  for (let i = 0; i < tokens.length && !relative; i++) {
    let qty = null, k = i;
    if (tokens[i] === "نیم") { qty = 0.5; k = i + 1; }
    else { const run = parseNumberRun(tokens, i); if (run && !(isDigit(tokens[i]) && isDigit(tokens[i + 1]))) { qty = run.value; k = run.end; } }
    if (qty == null) continue;
    let unit = tokens[k];
    if (!["دقیقه", "ساعت", "روز", "هفته", "ماه", "ربع"].includes(unit)) continue;
    let end = k + 1;
    if (tokens[end] === "و" && tokens[end + 1] === "نیم") { qty += 0.5; end += 2; }
    if (!TRAIL.has(tokens[end])) continue;
    end++;
    const d = new Date(now);
    if (unit === "دقیقه") d.setMinutes(d.getMinutes() + Math.round(qty));
    else if (unit === "ربع") d.setMinutes(d.getMinutes() + Math.round(qty * 15));
    else if (unit === "ساعت") d.setMinutes(d.getMinutes() + Math.round(qty * 60));
    else { d.setDate(d.getDate() + Math.round(qty * (unit === "روز" ? 1 : unit === "هفته" ? 7 : 30))); }
    date = localIso(d);
    if (["دقیقه", "ربع", "ساعت"].includes(unit)) time = localTime(d);
    relative = true; ranges.push({ start: i, end });
  }
  // «هفته بعد/آینده», «ماه بعد»
  if (!relative) for (let i = 0; i + 1 < tokens.length; i++) {
    if ((tokens[i] === "هفته" || tokens[i] === "ماه") && ["بعد", "آینده", "بعدی"].includes(tokens[i + 1])) {
      date = addDaysIso(today, tokens[i] === "هفته" ? 7 : 30); ranges.push({ start: i, end: i + 2 }); break;
    }
  }
  // 2) day words
  if (!date) for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "امروز") { date = today; ranges.push({ start: i, end: i + 1 }); break; }
    if (tokens[i] === "دیروز") { date = addDaysIso(today, -1); ranges.push({ start: i, end: i + 1 }); break; }
    if (tokens[i] === "فردا") { date = addDaysIso(today, 1); ranges.push({ start: i, end: i + 1 }); break; }
    if (tokens[i] === "پس" && tokens[i + 1] === "فردا") { date = addDaysIso(today, 2); ranges.push({ start: i, end: i + 2 }); break; }
    if (tokens[i] === "پسفردا") { date = addDaysIso(today, 2); ranges.push({ start: i, end: i + 1 }); break; }
  }
  // explicit dates: 1405/08/10, «۲۵ مهر»
  if (!date && ctx.jalali) {
    const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
    for (let i = 0; i + 1 < tokens.length; i++) {
      const mi = MONTHS.indexOf(tokens[i + 1]);
      if (isDigit(tokens[i]) && mi >= 0 && Number(tokens[i]) >= 1 && Number(tokens[i]) <= 31) {
        const [cy, cm, cd] = ctx.jalali.fromIso(today);
        const d = Number(tokens[i]);
        const hasYear = /^1[34]\d{2}$/.test(tokens[i + 2] || "");
        let y = hasYear ? Number(tokens[i + 2]) : cy;
        let iso = ctx.jalali.toIso(y, mi + 1, d);
        if (!hasYear && iso < today) iso = ctx.jalali.toIso(y + 1, mi + 1, d);        // «۲۵ مهر» که گذشته = سال بعد
        date = iso; ranges.push({ start: i, end: i + (hasYear ? 3 : 2) }); break;
      }
    }
    if (!date) for (let i = 0; i < tokens.length; i++) {
      const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(tokens[i]);
      if (m) { const y = +m[1]; date = y >= 1300 && y < 1700 ? ctx.jalali.toIso(y, +m[2], +m[3]) : `${y}-${p2(+m[2])}-${p2(+m[3])}`; ranges.push({ start: i, end: i + 1 }); break; }
    }
  }
  // weekday names → next such day (strictly after today)
  if (!date) for (const [name, dow] of WEEKDAYS) {
    const parts = name.split(" "), i = findSeq(tokens, parts);
    if (i < 0) continue;
    let diff = (dow - dowOf(today) + 7) % 7; if (diff === 0) diff = 7;
    date = addDaysIso(today, diff);
    let end = i + parts.length; if (["آینده", "بعد", "بعدی"].includes(tokens[end])) end++;
    ranges.push({ start: i, end }); break;
  }

  // 3) clock time (not for relative-duration phrases that already fixed the time)
  if (!relative || time == null) for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "ساعت") continue;
    if (ranges.some((r) => i >= r.start && i < r.end)) continue;
    const c = clockAfter(tokens, i);
    if (!c) continue;
    clockFound = true; period = c.period;
    let h = c.hour;
    if (c.period) {
      let hh = applyPeriod(h, c.period);
      if (c.period === "night") hh = h === 12 ? 0 : h >= 1 && h <= 5 ? h : h < 12 ? h + 12 : h;      // «۲ شب» = ۰۲:۰۰
      h = hh;
    }
    else if (h <= 12) {
      // no period given: choose by the day we are talking about
      const day = date || today;
      if (day === today) {
        const am = tsOf(today, `${p2(h % 24)}:${p2(c.minute)}`), pm = h < 12 ? tsOf(today, `${p2(h + 12)}:${p2(c.minute)}`) : am;
        h = am > now.getTime() ? h : pm > now.getTime() ? h + 12 : h;                                  // اگر هر دو گذشته → فردا (پایین)
      } else if (h >= 1 && h <= 6) h += 12;
    }
    if (h === 24) h = 0;
    time = `${p2(h)}:${p2(c.minute)}`;
    ranges.push({ start: i, end: c.end });
    break;
  }
  // bare period of day: «فردا صبح», «عصر»
  if (!time) for (let i = 0; i < tokens.length; i++) {
    if (PERIOD_DEFAULT[tokens[i]] && !ranges.some((r) => i >= r.start && i < r.end)) { time = PERIOD_DEFAULT[tokens[i]]; ranges.push({ start: i, end: i + 1 }); period = tokens[i]; break; }
  }
  // 4) repetition
  for (const [phrase, key] of REPEAT_WORDS) {
    const parts = phrase.split(" "), i = findSeq(tokens, parts);
    if (i >= 0) { repeat = key; ranges.push({ start: i, end: i + parts.length }); break; }
  }
  return { date, time, repeat, relative, clockFound, period, ranges, explicit: !!(date || time) };
}

// ───────────── title / body text ─────────────
const REMIND_PHRASES = [
  "یادم بنداز", "یادم بیار", "یادم باشه", "یادم نره", "یادم بده", "یادم بنداز که", "یادآوری کن", "یادآوری کنید", "یادآور بذار", "یادآور بگذار", "یادآور بساز", "یادآور جدید",
  "یادآوری جدید", "ثبت یادآوری", "ثبت یادآور", "یادآوری بذار", "یادآوری بگذار", "یادآوری بساز", "یاداوری کن", "ریمایندر بذار", "هشدار بذار", "هشدار بگذار", "هشدار بساز",
  "یادآوری", "یادآور", "یاداوری", "ریمایندر", "برام", "به من", "برای من",
];
const NOTE_PHRASES = [
  "یادداشت کن", "یادداشت کنید", "یادداشت بنویس", "یادداشت بذار", "یادداشت بگذار", "یادداشت جدید", "ثبت یادداشت", "یادداشت بساز", "یادداشت ثبت کن", "نوت کن", "نوت بنویس", "یادداشت", "یادداشتی", "برام", "لطفا",
];
function removePhrases(tokens, phrases) {
  let t = tokens.slice();
  // longest first so «یادآوری کن» wins over «یادآوری»
  [...phrases].sort((a, b) => b.split(" ").length - a.split(" ").length).forEach((ph) => {
    const parts = ph.split(" ");
    for (let i = findSeq(t, parts); i >= 0; i = findSeq(t, parts)) t = [...t.slice(0, i), ...t.slice(i + parts.length)];
  });
  return t;
}
const trimEdges = (t) => { const a = t.slice(); while (a[0] === "که" || a[0] === "کن" || a[0] === "و") a.shift(); while (a[a.length - 1] === "کن" || a[a.length - 1] === "که") a.pop(); return a; };

export function noteBody(tokens) { return trimEdges(removePhrases(tokens, NOTE_PHRASES)).join(" "); }

export function reminderParts(tokens, ctx = {}) {
  const w = parseWhen(tokens, ctx);
  const left = stripRanges(tokens, w.ranges).split(" ").filter(Boolean);
  return { when: w, title: trimEdges(removePhrases(left, REMIND_PHRASES)).join(" ") };
}

// Decide date/time defaults: only today/tomorrow rule + 09:00 default for a bare date.
export function resolveWhen(w, ctx = {}) {
  const now = nowOf(ctx), today = ctx.today || localIso(now);
  const warnings = [];
  let { date, time } = w;
  if (!date && !time) return { date: "", time: "", warnings, explicit: false };
  if (date && !time) { time = DEFAULT_TIME; warnings.push("ساعت مشخص نبود؛ ۰۹:۰۰ گذاشته شد."); }
  if (!date && time) {
    date = tsOf(today, time) > now.getTime() ? today : addDaysIso(today, 1);
    if (date !== today) warnings.push("این ساعت امروز گذشته است؛ برای فردا ثبت می‌شود.");
  }
  return { date, time, warnings, explicit: true };
}

// ───────────── intent definitions ─────────────
const REPEAT_OPTIONS = [["none", "بدون تکرار"], ["daily", "هر روز"], ["weekly", "هر هفته"], ["monthly", "هر ماه"], ["yearly", "هر سال"]];
export const REPEAT_LABEL = Object.fromEntries(REPEAT_OPTIONS);

export const createNote = {
  id: "create_note", kind: "write", icon: "📝", label: "یادداشت جدید",
  fields: [{ name: "body", type: "text", label: "متن یادداشت", required: true, ask: "متن یادداشت چیست؟" }],
  extract(f) { return { slots: { body: noteBody(f.tokens) }, warnings: [] }; },
  validate(s) { return { missing: s.body ? [] : ["body"], errors: {} }; },
  summary: (s) => [["یادداشت", s.body]],
};

export const createReminder = {
  id: "create_reminder", kind: "write", icon: "⏰", label: "یادآور جدید",
  fields: [
    { name: "title", type: "text", label: "موضوع", required: true, ask: "چه چیزی را یادآوری کنم؟" },
    { name: "date", type: "date", label: "تاریخ", future: true },
    { name: "time", type: "time", label: "ساعت", required: true, ask: "چه زمانی یادآوری کنم؟ مثلاً «فردا ساعت ۹ صبح» یا «۱ ساعت دیگه»." },
    { name: "repeat", type: "select", label: "تکرار", options: REPEAT_OPTIONS },
  ],
  extract(f, ctx) {
    const { when, title } = reminderParts(f.tokens, ctx);
    const r = resolveWhen(when, ctx);
    return { slots: { title, date: r.date, time: r.time, repeat: when.repeat, whenExplicit: r.explicit }, warnings: r.warnings };
  },
  validate(s, ctx = {}) {
    const errors = {};
    const missing = [];
    if (!s.title) missing.push("title");
    if (!s.time || !s.date) missing.push("time");
    else if (tsOf(s.date, s.time) < nowOf(ctx).getTime() - 60000) errors.time = "این زمان گذشته است؛ تاریخ یا ساعت را اصلاح کنید";
    return { missing, errors };
  },
  summary: (s) => [["موضوع", s.title], s.date && ["تاریخ", { date: s.date }], s.time && ["ساعت", { ltr: s.time }], s.repeat && s.repeat !== "none" && ["تکرار", REPEAT_LABEL[s.repeat]]].filter(Boolean),
};

export const showReminders = {
  id: "show_reminders", kind: "read", icon: "🔔", label: "فهرست یادآورها",
  fields: [],
  extract(f, ctx) {
    const t = f.tokens;
    const scope = t.includes("فردا") ? "tomorrow" : t.includes("امروز") ? "today" : t.includes("عقب") || t.includes("گذشته") ? "overdue" : "all";
    return { slots: { scope }, warnings: [] };
  },
  validate: () => ({ missing: [], errors: {} }),
  summary: (s) => [["نمایش", { all: "همهٔ یادآورهای باز", today: "یادآورهای امروز", tomorrow: "یادآورهای فردا", overdue: "یادآورهای سررسید شده" }[s.scope] || "یادآورها"]],
};

export const REMINDER_INTENTS = [createNote, createReminder, showReminders];
export { stem };
