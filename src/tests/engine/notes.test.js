// یادداشت و یادآوری — منطق واقعی برنامه
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const at = (iso, hhmm = "09:00") => new Date(`${iso}T${hhmm}:00`).getTime();

test("یادداشت: ساخت، اعتبارسنجی، ویرایش، سنجاق، جستجو و حذف", () => {
  assert.equal(E.saveNote({ title: "", body: "   " }).ok, false);
  const a = E.saveNote({ title: "تماس با تأمین‌کننده", body: "کاغذ A4 تمام می‌شود", color: "blue" });
  const b = E.saveNote({ title: "", body: "رمز وای‌فای مشتریان عوض شود", color: "bogus" });
  assert.ok(a.ok && b.ok);
  assert.equal(E.getNotes().find((n) => n.id === b.note.id).color, "default", "رنگ نامعتبر به پیش‌فرض برمی‌گردد");
  E.saveNote({ id: a.note.id, title: "تماس با تأمین‌کننده کاغذ", body: a.note.body, color: "blue" });
  assert.equal(E.getNotes().length, 2);
  E.toggleNotePin(b.note.id);
  assert.equal(E.filterNotes(E.getNotes(), "")[0].id, b.note.id, "سنجاق‌شده بالا می‌آید");
  assert.equal(E.filterNotes(E.getNotes(), "وای‌فای").length, 1);
  assert.equal(E.filterNotes(E.getNotes(), "چیزی نیست").length, 0);
  E.deleteNote(a.note.id);
  assert.equal(E.getNotes().length, 1);
});

test("یادداشت: متن خیلی بلند بریده می‌شود و HTML تزریقی فقط متن می‌ماند", () => {
  const r = E.saveNote({ title: "x".repeat(500), body: "<img src=x onerror=alert(1)>" + "y".repeat(50000) });
  assert.ok(r.note.title.length <= 200);
  assert.ok(r.note.body.length <= 20000);
});

test("یادآور: اعتبارسنجی عنوان و تاریخ", () => {
  assert.equal(E.saveReminder({ title: "", date: "2026-01-01" }).ok, false);
  assert.equal(E.saveReminder({ title: "الف", date: "" }).ok, false);
  const r = E.saveReminder({ title: "الف", date: "2026-01-01", time: "bad", repeat: "bad" });
  assert.equal(r.reminder.time, "09:00"); assert.equal(r.reminder.repeat, "none");
});

test("وضعیت یادآور: آینده / سررسید / انجام‌شده، و مرتب‌سازی سررسیدها", () => {
  const r1 = E.saveReminder({ title: "قدیمی", date: "2026-01-01", time: "08:00" }).reminder;
  const r2 = E.saveReminder({ title: "جدیدتر", date: "2026-01-02", time: "08:00" }).reminder;
  const r3 = E.saveReminder({ title: "آینده", date: "2026-02-01", time: "08:00" }).reminder;
  const now = at("2026-01-05", "12:00");
  assert.equal(E.reminderState(r1, now), "due");
  assert.equal(E.reminderState(r3, now), "upcoming");
  assert.deepEqual(E.dueReminders(now).map((r) => r.title), ["قدیمی", "جدیدتر"]);
  E.completeReminder(r1.id, now);
  assert.deepEqual(E.dueReminders(now).map((r) => r.id), [r2.id]);
  assert.equal(E.getReminders().find((r) => r.id === r1.id).status, "done");
  E.reopenReminder(r1.id);
  assert.equal(E.dueReminders(now).length, 2);
});

test("تعویق: تا زمان تعویق از سررسید خارج می‌شود و بعد دوباره برمی‌گردد", () => {
  const r = E.saveReminder({ title: "تعویق", date: "2026-03-01", time: "10:00" }).reminder;
  const now = at("2026-03-01", "10:05");
  assert.equal(E.dueReminders(now).length, 1);
  E.snoozeReminder(r.id, 10, now);
  assert.equal(E.dueReminders(now + 5 * 60000).length, 0);
  assert.equal(E.dueReminders(now + 11 * 60000).length, 1);
  E.snoozeToTomorrow(r.id, now);
  const t = E.getReminders()[0].snoozeUntil;
  const d = new Date(t);
  assert.equal(d.getHours(), 9); assert.equal(d.getDate(), new Date(now + 86400000).getDate());
});

test("تکرار: انجام‌دادن، یادآور را به نوبت بعدی می‌برد و باز نگه می‌دارد", () => {
  const now = at("2026-04-10", "09:30");
  const day = E.saveReminder({ title: "روزانه", date: "2026-04-10", time: "09:00", repeat: "daily" }).reminder;
  const wk = E.saveReminder({ title: "هفتگی", date: "2026-04-03", time: "09:00", repeat: "weekly" }).reminder;
  const res = E.completeReminder(day.id, now);
  assert.ok(res.repeated);
  const d2 = E.getReminders().find((r) => r.id === day.id);
  assert.equal(d2.status, "pending"); assert.equal(d2.date, "2026-04-11");
  E.completeReminder(wk.id, now);
  assert.equal(E.getReminders().find((r) => r.id === wk.id).date, "2026-04-17");
  assert.equal(E.dueReminders(now).length, 0);
});

test("تکرار ماهانه و سالانه بر پایهٔ تقویم شمسی (۳۱ شهریور → ۳۰ مهر)", () => {
  // 1405/06/31 = 2026-09-22
  const r = E.saveReminder({ title: "ماهانه", date: "2026-09-22", time: "09:00", repeat: "monthly" }).reminder;
  const n = E.nextOccurrence(r, at("2026-09-22", "10:00"));
  assert.equal(n.date, "2026-10-22", "۳۱ شهریور ← ۳۰ مهر (مهر ۳۰ روز دارد)");
  const y = E.saveReminder({ title: "سالانه", date: "2026-03-21", time: "09:00", repeat: "yearly" }).reminder;
  assert.equal(E.nextOccurrence(y, at("2026-03-21", "10:00")).date, "2027-03-21");
});

test("تکرار با چند دورهٔ عقب‌افتاده: نوبت بعد همیشه در آینده است", () => {
  const r = E.saveReminder({ title: "عقب", date: "2026-01-01", time: "09:00", repeat: "daily" }).reminder;
  const now = at("2026-02-15", "12:00");
  E.completeReminder(r.id, now);
  const d = E.getReminders()[0];
  assert.ok(at(d.date, d.time) > now);
  assert.equal(d.date, "2026-02-16");
});

test("ویرایش یادآور وضعیت را بازنشانی می‌کند؛ حذف و پاک‌کردن انجام‌شده‌ها", () => {
  const a = E.saveReminder({ title: "الف", date: "2026-01-01" }).reminder;
  const b = E.saveReminder({ title: "ب", date: "2026-01-02" }).reminder;
  E.snoozeReminder(a.id, 30);
  E.saveReminder({ id: a.id, title: "الف۲", date: "2026-05-05", time: "07:00" });
  const a2 = E.getReminders().find((r) => r.id === a.id);
  assert.equal(a2.snoozeUntil, null); assert.equal(a2.title, "الف۲");
  E.completeReminder(b.id);
  E.clearDoneReminders();
  assert.equal(E.getReminders().length, 1);
  E.deleteReminder(a.id);
  assert.equal(E.getReminders().length, 0);
});

test("اعلان مرورگر: هر نوبت فقط یک بار؛ تعویق نوبت تازه حساب می‌شود", () => {
  const r = E.saveReminder({ title: "اعلان", date: "2026-01-01", time: "09:00" }).reminder;
  assert.equal(E.wasNotified(r), false);
  E.markNotified(r);
  assert.equal(E.wasNotified(E.getReminders()[0]), true);
  E.snoozeReminder(r.id, 10);
  assert.equal(E.wasNotified(E.getReminders()[0]), false);
});

test("اعلان‌های زنگ: فقط سررسیدشده‌ها و لینک به تب یادداشت", () => {
  E.saveReminder({ title: "گذشته", date: "2026-01-01", time: "09:00" });
  E.saveReminder({ title: "آینده", date: "2999-01-01", time: "09:00" });
  const n = E.reminderNotifications();
  assert.equal(n.length, 1);
  assert.equal(n[0].tab, "notes");
  assert.match(n[0].text, /گذشته/);
});

test("بازیابی داده خراب: لیست نامعتبر در حافظه باعث خطا نمی‌شود", () => {
  E.lsWrite("cafenet_notes", "garbage"); E.lsWrite("cafenet_reminders", { x: 1 });
  assert.doesNotThrow(() => { E.getNotes(); E.getReminders(); E.dueReminders(); E.reminderNotifications(); });
});
