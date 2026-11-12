// موتور جستجوی «کافیند» — روی داده‌های واقعی برنامه (فروش ثبت‌شده با موتور فروش)
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh, T } from "./helpers.js";

let E;
beforeEach(() => {
  E = fresh();
  E.createSale({ customerId: 1, date: "2026-10-27", items: [{ desc: "پرینت رنگی", qty: 10, price: T(60000), stockId: 101, stockQty: 10 }], payments: [{ method: "cash", amount: T(600000) }] });
  E.createSale({ customerId: 2, date: "2026-10-20", items: [{ desc: "ثبت‌نام آنلاین دانشگاه", qty: 1, price: T(1500000) }], payments: [] });
  E.lsWrite("cafenet_obligations", [{ id: 7, kind: "cheque", dir: "pay", title: "چک خرید تجهیزات", party: "فروشگاه رایانه", amount: T(4000000), dueDate: "2026-11-05", status: "pending" }]);
  E.lsWrite("cafenet_employees", [{ id: 9, name: "مریم صادقی", role: "صندوقدار", salary: T(9000000), active: true }]);
  E.saveNote({ title: "لیست خرید", body: "کاغذ A4 و تونر" });
  E.saveReminder({ title: "پیگیری چک رضایی", date: "2026-11-01", time: "10:00" });
});
const idx = () => E.buildIndex(E.collectSources());
const S = (q, o) => E.search(idx(), q, { limit: 500, perCat: 500, ...o });
const titles = (q, cat) => S(q).filter((r) => r.cat === cat).map((r) => r.title);
const cats = (q) => [...new Set(S(q).map((r) => r.cat))];

test("نرمال‌سازی: ی/ک عربی، ارقام فارسی/عربی، نیم‌فاصله و اعراب", () => {
  assert.equal(E.normalize("عليرضا"), "علیرضا");
  assert.equal(E.normalize("كاغذ"), "کاغذ");
  assert.equal(E.normalize("۰۹۱۲-٣٤٥"), "0912-345");
  assert.equal(E.normalize("می‌خواهم"), E.normalize("میخواهم"));
  assert.equal(E.normalize("آب"), E.normalize("اب"));
  assert.equal(E.normalize("۱۲٬۵۰۰"), "12500");
});

test("جستجوی مشتری با نام، نام خانوادگی و شماره (فارسی و لاتین)", () => {
  assert.deepEqual(titles("رضایی", "customer"), ["علی رضایی"]);
  assert.deepEqual(titles("علي", "customer"), ["علی رضایی"], "ي عربی هم پیدا می‌شود");
  assert.deepEqual(titles("۰۹۱۲۱۲۳۴", "customer"), ["علی رضایی"], "ارقام فارسی");
  assert.deepEqual(titles("سارا احمدی", "customer"), ["سارا احمدی"], "چند کلمه = همه باید باشند");
  assert.deepEqual(titles("سارا رضایی", "customer"), []);
});

test("جستجو در همهٔ بخش‌ها از یک عبارت: «چک» تعهد، یادآور، صفحه", () => {
  const c = cats("چک");
  assert.ok(c.includes("obligation") && c.includes("reminder") && c.includes("page"));
  assert.ok(titles("چک", "obligation")[0].includes("چک خرید"));
});

test("فاکتور: با شرح خدمت، مشتری، مبلغ (تومان و ریال) و تاریخ شمسی", () => {
  assert.equal(titles("پرینت رنگی", "invoice").length, 1);
  assert.ok(titles("ثبت نام آنلاین", "invoice")[0].includes("سارا احمدی"), "نیم‌فاصله/فاصله فرقی ندارد");
  assert.equal(titles("600000", "invoice").length, 1, "مبلغ به تومان");
  assert.equal(titles("6000000", "invoice").length, 1, "مبلغ به ریال");
  assert.equal(titles("۶۰۰۰۰۰", "invoice").length, 1, "مبلغ با رقم فارسی");
  const j = E.dateWords("2026-10-27");
  assert.match(j, /1405\/08\/05/);
  assert.ok(titles("1405/08/05", "invoice").length >= 1, "تاریخ شمسی با صفر");
  assert.ok(titles("۱۴۰۵/۸/۵", "invoice").length >= 1, "تاریخ شمسی بدون صفر، ارقام فارسی");
});

test("انبار، کارمند، یادداشت، یادآور، تعرفه", () => {
  assert.ok(titles("تونر", "stock").includes("تونر"));
  assert.equal(titles("تونر", "note").length, 1, "کلمهٔ داخل متن یادداشت");
  assert.deepEqual(titles("صندوقدار", "employee"), ["مریم صادقی"]);
  assert.ok(titles("رضایی پیگیری", "reminder")[0].includes("پیگیری چک"));
  assert.ok(S("اینترنت").some((r) => r.cat === "tariff"), "تعرفهٔ پیش‌فرض هم جستجو می‌شود");
});

test("صفحه‌ها و تنظیمات: هم‌معنی‌ها و «تنظیمات ← ...»", () => {
  assert.ok(titles("بکاپ", "setting").some((t) => t.includes("پشتیبان")), "بکاپ ← پشتیبان‌گیری");
  assert.ok(titles("کارتریج", "page").includes("انبار"));
  const t = S("تیره").find((r) => r.cat === "setting");
  assert.equal(t.go.tab, "settings"); assert.equal(t.go.settingsTab, "appearance");
});

test("کارهای سریع: «فروش جدید» ← action", () => {
  assert.equal(S("فروش جدید").find((r) => r.cat === "action").go.action, "new_sale");
  assert.equal(S("یادم بنداز").find((r) => r.cat === "action").go.action, "new_reminder");
});

test("هر نتیجه مقصد دارد (tab یا action) و فاکتور/مشتری برای تمرکز اطلاعات دارد", () => {
  S("ا").forEach((r) => assert.ok(r.go && (r.go.tab || r.go.action), r.key));
  assert.equal(S("علی", { }).find((r) => r.cat === "customer").go.focus.kind, "customer");
  assert.equal(S("پرینت رنگی").find((r) => r.cat === "invoice").go.tab, "invoice");
});

test("امتیاز: تطابق دقیق/شروع کلمه بالاتر؛ سقف هر دسته و فیلتر دسته", () => {
  E.lsWrite("cafenet_customers", [
    { id: 11, firstName: "حسین", lastName: "کریمی" }, { id: 12, firstName: "محسن", lastName: "حسینی" }, { id: 13, firstName: "ابوالحسین", lastName: "نوری" },
  ]);
  assert.equal(S("حسین", { cat: "customer" })[0].title, "حسین کریمی");
  E.lsWrite("cafenet_customers", Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, firstName: "مشتری", lastName: `تست ${i}` })));
  const q = (o) => E.search(idx(), "مشتری", o).filter((r) => r.cat === "customer").length;
  assert.equal(q({ perCat: 4, limit: 100 }), 4, "در حالت همه، هر دسته ۴ مورد");
  assert.equal(q({ cat: "customer", limit: 100 }), 30, "با فیلتر دسته: همه");
  assert.equal(E.countByCategory(S("مشتری")).customer, 30);
  assert.ok(E.search(idx(), "مشتری", { limit: 5 }).length <= 5);
});

test("پاسخ فوری: ماشین‌حساب امن، و تاریخ/شماره اشتباه محاسبه نمی‌شود", () => {
  assert.equal(E.instantAnswer("12*500+3").value, 6003);
  assert.equal(E.instantAnswer("(2+3)×4").value, 20);
  assert.equal(E.instantAnswer("۱۰۰۰۰+۲۵٪").value, 10000.25);
  assert.equal(E.instantAnswer("50%+1").value, 1.5);
  assert.equal(E.instantAnswer("1405/8/5"), null, "تاریخ نباید تقسیم شود");
  assert.equal(E.instantAnswer("09121234567"), null);
  assert.equal(E.instantAnswer("0912-111"), null);
  assert.equal(E.instantAnswer("2**8"), null);
  assert.equal(E.instantAnswer("process.exit()"), null);
  assert.equal(E.instantAnswer("1/0"), null, "بی‌نهایت جواب نیست");
  assert.match(E.instantAnswer("امروز", new Date(2026, 9, 27)).title, /امروز ۵ آبان ۱۴۰۵/);
});

test("هایلایت: بازه‌های تطابق", () => {
  assert.deepEqual(E.highlightRanges("پرینت رنگی", "رنگ"), [[6, 9]]);
  assert.deepEqual(E.highlightRanges("abc", ""), []);
});

test("جستجوهای اخیر و تمرکز روی نتیجه (یک‌بار مصرف، فقط برای همان صفحه)", () => {
  E.pushRecent("رضایی"); E.pushRecent("چک"); E.pushRecent("رضایی"); E.pushRecent("x");
  assert.deepEqual(E.getRecent(), ["رضایی", "چک"], "تکراری جابه‌جا می‌شود، خیلی کوتاه ذخیره نمی‌شود");
  E.clearRecent(); assert.deepEqual(E.getRecent(), []);
  E.setSearchFocus({ tab: "customers", focus: { kind: "customer", id: 1 } });
  assert.equal(E.takeSearchFocus("invoice"), null);
  assert.equal(E.takeSearchFocus("customers").id, 1);
  assert.equal(E.takeSearchFocus("customers"), null, "فقط یک بار");
});

test("داده خراب یا خالی باعث خطا نمی‌شود", () => {
  E.lsWrite("cafenet_customers", "garbage"); E.lsWrite("cafenet_sales", { x: 1 }); E.lsWrite("cafenet_obligations", [null, 5, { title: null }]);
  assert.doesNotThrow(() => S("الف"));
  assert.deepEqual(S("   "), []);
  assert.deepEqual(S(""), []);
});
