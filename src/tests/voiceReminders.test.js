// دستور صوتی یادداشت و یادآوری
import test from "node:test";
import assert from "node:assert/strict";
import { parseUtterance } from "../voice/parser.js";
import { createDialog } from "../voice/dialog.js";
import { jalali } from "./voiceFixtures.js";

const NOW = new Date("2026-10-22T10:00:00").getTime();       // پنجشنبه ۱۰:۰۰ (وقت محلی)
const ctx = (over = {}) => ({ today: "2026-10-22", now: NOW, defaultUnit: "rial", jalali, categories: { expense: ["برق"], income: [] }, customers: [], inventory: [], sales: [], ...over });
const P = (t, c = ctx()) => parseUtterance(t, c);

test("یادآور: فردا + ساعت + عصر", () => {
  const r = P("فردا ساعت ۵ عصر یادم بنداز به علی زنگ بزنم");
  assert.equal(r.intent, "create_reminder");
  assert.deepEqual([r.slots.title, r.slots.date, r.slots.time, r.slots.repeat], ["به علی زنگ بزنم", "2026-10-23", "17:00", "none"]);
  assert.deepEqual(r.missing, []);
});
test("یادآور: ساعت‌های گفتاری (۱۷:۳۰ / پنج و نیم / ۸ شب / ۱۲ شب / صبح)", () => {
  assert.equal(P("یادم بنداز ساعت ۱۷:۳۰ جلسه دارم").slots.time, "17:30");
  assert.equal(P("ساعت پنج و نیم یادم باشه بسته رو تحویل بدم").slots.time, "17:30");   // ۱۰ صبح الان؛ ۵:۳۰ بعدازظهر نزدیک‌ترین است
  assert.equal(P("یادم بنداز ساعت ۸ شب برم خونه").slots.time, "20:00");
  assert.equal(P("فردا ساعت ۱۲ شب یادم بنداز قرارداد").slots.time, "00:00");
  assert.equal(P("فردا ساعت ۹ صبح یادآوری کن جلسه").slots.time, "09:00");
  assert.equal(P("فردا ساعت ۱ ظهر یادم بنداز ناهار").slots.time, "13:00");
  assert.equal(P("فردا صبح یادم بنداز نانوایی").slots.time, "08:00");
});
test("یادآور: ساعت بدون صبح/عصر برای فردا (۱ تا ۶ = بعدازظهر، ۷ تا ۱۱ = صبح)", () => {
  assert.equal(P("فردا ساعت ۴ یادم بنداز جلسه").slots.time, "16:00");
  assert.equal(P("فردا ساعت ۹ یادم بنداز جلسه").slots.time, "09:00");
});
test("یادآور: امروز اگر ساعت گذشته باشد → فردا همراه هشدار", () => {
  const r = P("ساعت ۹ صبح یادآوری کن اجاره");
  assert.equal(r.slots.date, "2026-10-23"); assert.ok(r.warnings.some((w) => /فردا/.test(w)));
  assert.equal(P("ساعت ۱۱ یادآوری کن اجاره").slots.date, "2026-10-22");
});
test("یادآور: مدت نسبی (ساعت/دقیقه/روز/هفته/نیم ساعت/ربع)", () => {
  let r = P("یک ساعت دیگه یادم بنداز چک رضایی");
  assert.deepEqual([r.slots.date, r.slots.time, r.slots.title], ["2026-10-22", "11:00", "چک رضایی"]);
  assert.equal(P("۱۰ دقیقه دیگه یادم بنداز نان").slots.time, "10:10");
  assert.equal(P("نیم ساعت دیگه یادم بنداز نان").slots.time, "10:30");
  assert.equal(P("یه ربع دیگه یادم بنداز نان").slots.time, "10:15");
  assert.equal(P("یک ساعت و نیم دیگه یادم بنداز نان").slots.time, "11:30");
  r = P("۳ روز دیگه یادم بنداز اجاره رو بدم");
  assert.deepEqual([r.slots.date, r.slots.time], ["2026-10-25", "09:00"]);
  assert.equal(P("یک هفته دیگه یادم بنداز اجاره").slots.date, "2026-10-29");
  assert.equal(P("هفته بعد یادم بنداز اجاره").slots.date, "2026-10-29");
});
test("یادآور: روز هفته و تاریخ شمسی و تکرار", () => {
  let r = P("یکشنبه ساعت ۱۰ صبح یادم بنداز پشتیبان");
  assert.equal(r.slots.date, "2026-10-25");
  r = P("هر هفته یکشنبه ساعت ۱۰ صبح یادآوری کن پشتیبان بگیرم");
  assert.equal(r.slots.repeat, "weekly"); assert.equal(r.slots.title, "پشتیبان بگیرم");
  assert.equal(P("هر روز ساعت ۸ صبح یادم بنداز صندوق را باز کنم").slots.repeat, "daily");
  assert.equal(P("هر ماه ۵ آبان یادم بنداز اجاره").slots.repeat, "monthly");
  assert.equal(P("۵ آبان ساعت ۱۰ صبح یادم بنداز اجاره").slots.date, "2026-10-27");     // ۵ آبان ۱۴۰۵
  assert.equal(P("۲۵ مهر یادآوری کن اجاره").slots.date, "2027-10-17");                    // گذشته → سال بعد
});
test("یادآور: بدون زمان → ساعت پرسیده می‌شود؛ بدون موضوع → موضوع پرسیده می‌شود", () => {
  assert.deepEqual(P("یادم بنداز به علی زنگ بزنم").missing, ["time"]);
  assert.deepEqual(P("ساعت ۱۱ یادآوری کن").missing, ["title"]);
});
test("یادآور: زمان گذشتهٔ صریح خطا می‌دهد", () => {
  const r = P("دیروز ساعت ۸ صبح یادم بنداز نان");
  assert.equal(r.intent, "create_reminder");
  assert.ok(r.errors.time);
});
test("یادداشت", () => {
  let r = P("یادداشت کن کاغذ A4 تمام شده");
  assert.equal(r.intent, "create_note"); assert.match(r.slots.body, /کاغذ.*تمام شده/);
  r = P("یادداشت جدید: رمز وای‌فای عوض شود");
  assert.equal(r.intent, "create_note"); assert.equal(r.slots.body, "رمز وای فای عوض شود");
  assert.deepEqual(P("یادداشت کن").missing, ["body"]);
});
test("پرسش و ناوبری یادآورها با ثبت یادآور اشتباه نمی‌شود", () => {
  assert.equal(P("چه یادآوری هایی دارم؟").intent, "show_reminders");
  assert.equal(P("یادآورهای امروز").slots.scope, "today");
  assert.equal(P("یادآورهای فردا من چیه").slots.scope, "tomorrow");
  assert.equal(P("باز کن یادآوری ها").slots.tab, "notes");
  assert.equal(P("برو به یادداشت و یادآوری").slots.tab, "notes");
  // دستورهای قدیمی دست‌نخورده
  assert.equal(P("هزینه ۵۰۰ هزار تومان بابت کاغذ").intent, "create_expense");
  assert.equal(P("فروش ۲ برگ پرینت رنگی ۱۵ هزار تومان").intent, "create_sale");
});

function harness() {
  const calls = []; let seq = 0;
  const deps = {
    format: { money: (n) => `${n}R`, date: (d) => d, num: (n) => String(n) },
    addNote: async (n) => { calls.push(["note", n]); return { ok: true, id: ++seq }; },
    removeNote: async (id) => { calls.push(["rmnote", id]); return { ok: true }; },
    addReminder: async (r) => { calls.push(["rem", r]); return { ok: true, id: ++seq }; },
    removeReminder: async (id) => { calls.push(["rmrem", id]); return { ok: true }; },
    listReminders: async (scope) => { calls.push(["list", scope]); return [{ title: "الف", date: "2026-10-23", time: "09:00" }, { title: "ب", date: "2026-10-20", time: "08:00", overdue: true }]; },
    navigate: (tab) => calls.push(["nav", tab]), answer: async (t) => t,
  };
  const d = createDialog({ getContext: () => ctx(), deps, getConfig: () => ({}) });
  return { d, calls, st: () => d.getState() };
}

test("دیالوگ: یادآور بدون ساعت → می‌پرسد → پاسخ نسبی → تأیید → ثبت یک‌باره → واگرد", async () => {
  const h = harness();
  await h.d.submit("یادم بنداز به علی زنگ بزنم");
  assert.equal(h.st().phase, "ask"); assert.equal(h.st().asking, "time");
  assert.equal(h.calls.length, 0);
  await h.d.submit("فردا ساعت ۹ صبح");
  assert.equal(h.st().phase, "confirm");
  assert.deepEqual([h.st().pending.slots.date, h.st().pending.slots.time], ["2026-10-23", "09:00"]);
  await h.d.submit("تأیید");
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], ["rem", { title: "به علی زنگ بزنم", date: "2026-10-23", time: "09:00", repeat: "none" }]);
  await h.d.submit("آخری رو پاک کن");
  assert.deepEqual(h.calls[1], ["rmrem", 1]);
});
test("دیالوگ: پاسخ «یک ساعت دیگه» به سؤال ساعت", async () => {
  const h = harness();
  await h.d.submit("یادم بنداز نان بخرم");
  await h.d.submit("یک ساعت دیگه");
  assert.equal(h.st().phase, "confirm");
  assert.deepEqual([h.st().pending.slots.date, h.st().pending.slots.time], ["2026-10-22", "11:00"]);
});
test("دیالوگ: یادداشت و فهرست یادآورها", async () => {
  const h = harness();
  await h.d.submit("یادداشت کن کاغذ تمام شده");
  await h.d.submit("تأیید");
  assert.equal(h.calls[0][0], "note"); assert.match(h.calls[0][1].body, /کاغذ تمام شده/);
  await h.d.submit("چه یادآوری هایی دارم؟");
  assert.deepEqual(h.calls.at(-1), ["list", "all"]);
  const last = h.st().messages.at(-1);
  assert.match(last.text, /2 یادآور|۲ یادآور/); assert.equal(last.details.length, 2);
});
