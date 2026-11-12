// یادداشت و یادآوری — منطق خالص + ذخیره‌سازی محلی (همه‌چیز روی همین دستگاه؛ هیچ سروری لازم نیست).
// یادآور: عنوان، تاریخ و ساعت (به وقت محلی)، تکرار (روزانه/هفتگی/ماهانه/سالانه شمسی)، تعویق و انجام.
import { NOTES_KEY, REMINDERS_KEY, REMINDERS_NOTIFIED_KEY } from "../core/constants.js";
import { dateToJalali, jalaliMonthDays, jalaliToIso } from "../core/jalali.js";
import { emitDataChange, lsRead, lsWrite, uid } from "./sales.jsx";

const str = (v, max = 4000) => String(v == null ? "" : v).trim().slice(0, max);
export const REPEATS = [["none", "بدون تکرار"], ["daily", "هر روز"], ["weekly", "هر هفته"], ["monthly", "هر ماه"], ["yearly", "هر سال"]];
export const NOTE_COLORS = [["default", "#64748b"], ["yellow", "#f59e0b"], ["green", "#22c55e"], ["blue", "#3b82f6"], ["pink", "#ec4899"], ["purple", "#8b5cf6"]];
const DEFAULT_TIME = "09:00";

// ───────── یادداشت‌ها ─────────
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
export const getNotes = () => arr(lsRead(NOTES_KEY, []));

export function saveNote(input) {
  const title = str(input.title, 120), body = str(input.body);
  if (!title && !body) return { ok: false, error: "عنوان یا متن یادداشت را بنویسید" };
  const now = Date.now(), list = getNotes();
  const old = input.id ? list.find((n) => String(n.id) === String(input.id)) : null;
  const note = {
    id: old ? old.id : uid(), title, body,
    color: NOTE_COLORS.some(([k]) => k === input.color) ? input.color : "default",
    pinned: !!input.pinned, createdAt: old ? old.createdAt : now, updatedAt: now,
  };
  lsWrite(NOTES_KEY, old ? list.map((n) => (String(n.id) === String(old.id) ? note : n)) : [note, ...list]);
  emitDataChange();
  return { ok: true, note };
}
export function deleteNote(id) { lsWrite(NOTES_KEY, getNotes().filter((n) => String(n.id) !== String(id))); emitDataChange(); }
export function toggleNotePin(id) { lsWrite(NOTES_KEY, getNotes().map((n) => (String(n.id) === String(id) ? { ...n, pinned: !n.pinned } : n))); emitDataChange(); }
export function filterNotes(list, q) {
  const s = str(q, 100).toLowerCase();
  const rows = s ? list.filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(s)) : list;
  return [...rows].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

// ───────── یادآورها ─────────
export const getReminders = () => arr(lsRead(REMINDERS_KEY, []));
const saveAll = (list) => { lsWrite(REMINDERS_KEY, list); emitDataChange(); };

// زمان سررسید به میلی‌ثانیه (وقت محلی). اگر تعویق خورده باشد، همان ملاک است.
export const scheduledTs = (r) => new Date(`${r.date}T${r.time || DEFAULT_TIME}:00`).getTime();
export const dueTs = (r) => (r.snoozeUntil && r.snoozeUntil > 0 ? r.snoozeUntil : scheduledTs(r));

export function reminderState(r, now = Date.now()) {
  if (r.status === "done") return "done";
  return dueTs(r) <= now ? "due" : "upcoming";
}

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function addMonthsJalali(iso, k) {
  const [jy, jm, jd] = dateToJalali(iso);
  const t = jy * 12 + (jm - 1) + k, ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return jalaliToIso(ny, nm, Math.min(jd, jalaliMonthDays(ny, nm)));
}
function stepDate(iso, repeat, k) {
  if (repeat === "daily" || repeat === "weekly") { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + k * (repeat === "weekly" ? 7 : 1)); return isoOf(d); }
  return addMonthsJalali(iso, k * (repeat === "yearly" ? 12 : 1));
}
// نخستین تاریخِ تکرار که بعد از «now» باشد (برای یادآور تکرارشونده)؛ برای بدون‌تکرار null.
export function nextOccurrence(r, now = Date.now()) {
  if (!r.repeat || r.repeat === "none") return null;
  for (let k = 1; k < 5000; k++) {
    const date = stepDate(r.date, r.repeat, k);
    if (new Date(`${date}T${r.time || DEFAULT_TIME}:00`).getTime() > now) return { date, time: r.time || DEFAULT_TIME };
  }
  return null;
}

// نوبت‌های آیندهٔ یک یادآور (برای ارسال به سرویس اعلان): نوبت جاری (با احتساب تعویق) + چند تکرار بعدی
export function occurrences(r, now = Date.now(), limit = 8, horizonDays = 120) {
  if (!r || r.status === "done") return [];
  const out = [dueTs(r)];
  if (r.repeat && r.repeat !== "none") {
    const end = now + horizonDays * 86400000;
    for (let k = 1; k < 800 && out.length < limit; k++) {
      const ts = new Date(`${stepDate(r.date, r.repeat, k)}T${r.time || DEFAULT_TIME}:00`).getTime();
      if (ts > end) break;
      if (ts > out[0]) out.push(ts);
    }
  }
  return out.filter((t) => Number.isFinite(t));
}

export function saveReminder(input) {
  const title = str(input.title, 160);
  if (!title) return { ok: false, error: "عنوان یادآور را بنویسید" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ""))) return { ok: false, error: "تاریخ یادآور را انتخاب کنید" };
  const time = /^\d{2}:\d{2}$/.test(String(input.time || "")) ? input.time : DEFAULT_TIME;
  const list = getReminders(), old = input.id ? list.find((x) => String(x.id) === String(input.id)) : null;
  const r = {
    id: old ? old.id : uid(), title, note: str(input.note, 1000), date: input.date, time,
    repeat: REPEATS.some(([k]) => k === input.repeat) ? input.repeat : "none",
    status: "pending", snoozeUntil: null, createdAt: old ? old.createdAt : Date.now(), doneAt: null,
  };
  saveAll(old ? list.map((x) => (String(x.id) === String(old.id) ? r : x)) : [...list, r]);
  return { ok: true, reminder: r };
}
export function deleteReminder(id) { saveAll(getReminders().filter((r) => String(r.id) !== String(id))); }
export function clearDoneReminders() { saveAll(getReminders().filter((r) => r.status !== "done")); }

// «انجام شد»: بدون تکرار ← بسته می‌شود؛ تکرارشونده ← به نوبت بعدی می‌رود و باز می‌ماند.
export function completeReminder(id, now = Date.now()) {
  const list = getReminders(), r = list.find((x) => String(x.id) === String(id));
  if (!r) return { ok: false, error: "یادآور پیدا نشد" };
  const next = r.status === "pending" ? nextOccurrence(r, now) : null;
  const upd = next ? { ...r, ...next, snoozeUntil: null, lastDoneAt: now } : { ...r, status: "done", snoozeUntil: null, doneAt: now };
  saveAll(list.map((x) => (String(x.id) === String(id) ? upd : x)));
  return { ok: true, reminder: upd, repeated: !!next };
}
export function reopenReminder(id) {
  saveAll(getReminders().map((r) => (String(r.id) === String(id) ? { ...r, status: "pending", doneAt: null, snoozeUntil: null } : r)));
}
export function snoozeReminder(id, minutes, now = Date.now()) {
  const m = Math.max(1, Math.min(60 * 24 * 30, Math.round(Number(minutes) || 10)));
  saveAll(getReminders().map((r) => (String(r.id) === String(id) && r.status === "pending" ? { ...r, snoozeUntil: now + m * 60000 } : r)));
}
export function snoozeToTomorrow(id, now = Date.now()) {
  const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
  snoozeReminder(id, Math.ceil((d.getTime() - now) / 60000), now);
}

export const dueReminders = (now = Date.now()) => getReminders().filter((r) => reminderState(r, now) === "due").sort((a, b) => dueTs(a) - dueTs(b));

// «۲ ساعت پیش» / «۳ روز دیگر» — اعداد لاتین؛ نمایش با toFA در رابط
export function relativeLabel(ts, now = Date.now()) {
  const diff = ts - now, abs = Math.abs(diff), min = Math.round(abs / 60000);
  const unit = min < 1 ? "لحظه‌ای" : min < 60 ? `${min} دقیقه` : min < 60 * 24 ? `${Math.round(min / 60)} ساعت` : `${Math.round(min / 1440)} روز`;
  if (min < 1) return "همین الان";
  return diff < 0 ? `${unit} پیش` : `${unit} دیگر`;
}

// برای اعلان مرورگر: هر نوبت یک بار (کلید = شناسه + زمان سررسید)
const nkey = (r) => `${r.id}@${dueTs(r)}`;
export const wasNotified = (r) => !!lsRead(REMINDERS_NOTIFIED_KEY, {})[nkey(r)];
export function markNotified(r) {
  const m = lsRead(REMINDERS_NOTIFIED_KEY, {}); m[nkey(r)] = Date.now();
  const keys = Object.keys(m); if (keys.length > 200) keys.sort((a, b) => m[a] - m[b]).slice(0, keys.length - 200).forEach((k) => delete m[k]);
  lsWrite(REMINDERS_NOTIFIED_KEY, m);
}

// زنگ اعلان‌های برنامه (computeNotifications)
export function reminderNotifications(now = Date.now()) {
  return dueReminders(now).slice(0, 20).map((r) => ({
    icon: "⏰", color: "#f59e0b", level: "attention", category: "یادآوری", tab: "notes",
    text: `یادآوری: ${r.title}`, detail: `${r.date} ${r.time} · ${relativeLabel(dueTs(r), now)}`,
  }));
}
