import test from "node:test";
import assert from "node:assert/strict";
import { iconForLabel, BUTTON_ICON_RULES, MOBILE_UI_CSS } from "../mobile/mobileUi.js";
import { readFileSync } from "node:fs";

test("iconForLabel: برچسب‌های رایج آیکن می‌گیرند، متن‌های دارای نماد/ایموجی و بلند نه", () => {
  const cases = { "افزودن": "Plus", "ثبت فروش": "Plus", "ویرایش": "Pencil", "حذف دسته": "Trash2", "ذخیره": "Save", "تأیید": "Check", "تایید": "Check", "خروجی اکسل": "FileSpreadsheet", "چاپ فاکتور": "Printer", "انصراف": "X", "بازگشت": "ArrowRight", "به‌روزرسانی": "RefreshCw", "جستجو": "Search", "ارسال": "Send", "مشاهده": "Eye" };
  for (const [t, icon] of Object.entries(cases)) assert.equal(iconForLabel(t), icon, t);
  for (const t of ["", "  ", "📗 خروجی اکسل", "＋ دسته جدید", "+ افزودن", "✏️ ویرایش", "× پاک", "همه (۶)", "امروز", "این ماه", "x".repeat(40)]) assert.equal(iconForLabel(t), null, JSON.stringify(t));
});

test("iconForLabel: حروف عربی (ي/ك) و نیم‌فاصله نرمال می‌شوند", () => {
  assert.equal(iconForLabel("ويرايش"), "Pencil");
  assert.equal(iconForLabel("پیش‌نمایش"), "Eye");
});

test("هر آیکن جدول قواعد در Icon.jsx وجود دارد (جلوگیری از آیکن گمشده)", () => {
  const src = readFileSync(new URL("../components/Icon.jsx", import.meta.url), "utf8"), map = src.slice(src.indexOf("export const ICONS"));
  for (const [, name] of BUTTON_ICON_RULES) assert.match(map, new RegExp(`\\b${name}\\b`), `آیکن ${name} در ICONS نیست`);
});

test("CSS موبایل فقط زیر body.m-ui فعال است و نوار ناوبری/دستیار صوتی/ماشین‌حساب را نمی‌گیرد", () => {
  const sel = MOBILE_UI_CSS.split("{").map((x) => x.split("}").pop().trim()).filter((x) => x && !x.startsWith("@") && !x.startsWith("/*"));
  for (const s of sel) for (const part of s.split(/,(?![^(]*\))/)) assert.ok(part.trim().startsWith("body.m-ui"), `بدون محدودهٔ body.m-ui: ${part.slice(0, 80)}`);
  assert.match(MOBILE_UI_CSS, /:not\(nav \*\)/); assert.match(MOBILE_UI_CSS, /:not\(\.va-panel \*\)/); assert.match(MOBILE_UI_CSS, /data-no-m/);
  assert.match(MOBILE_UI_CSS, /prefers-reduced-motion/);
});
