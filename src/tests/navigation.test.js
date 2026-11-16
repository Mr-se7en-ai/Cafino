// ساختار منو: گزارش حسابرسی در حسابداری، «درباره و نسخه» داخل «درباره من»، «لاگ» با دو زیرتب، ترتیب فیلدهای تبدیل تاریخ
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const root = new URL("../", import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, root), "utf8");

test("گزارش حسابرسی زیرمجموعهٔ حسابداری است و دیگر در تنظیمات نیست", () => {
  const c = rd("app/core/constants.js");
  assert.match(c, /key:"audit".*label:"حسابرسی و مرکز مالی"/);
  assert.match(c, /group:"accounting"[^\n]*"audit"/);
  const m = rd("app/app/MainApp.jsx");
  assert.match(m, /activeTab==="audit"&&<AuditFinancePage sub=\{auditSub\} setSub=\{setAuditSub\}\/>/);
  assert.doesNotMatch(m, /settingsTab==="activity"/);
  assert.doesNotMatch(m, /key:"activity"/);
});

test("تنظیمات: یک تب «لاگ» با زیرتب‌های خطا و فعالیت؛ «درباره و نسخه» حذف شده", () => {
  const m = rd("app/app/MainApp.jsx");
  assert.match(m, /key:"logs",label:"لاگ"/);
  assert.doesNotMatch(m, /key:"errors"/);
  assert.doesNotMatch(m, /key:"about",label:"درباره و نسخه"/);
  assert.doesNotMatch(m, /settingsTab==="about"/);
  const l = rd("audit/LogsPanel.jsx");
  assert.match(l, /\["errors", "⚠️ لاگ خطا"\]/);
  assert.match(l, /\["activity", "📋 لاگ فعالیت"\]/);
});

test("«درباره من» نسخه و تغییرات نسخه‌ها را دارد", () => {
  const a = rd("app/pages/about.jsx");
  assert.match(a, /data-testid="about-version"/);
  assert.match(a, /APP_CHANGELOG/);
  assert.doesNotMatch(rd("app/pages/settingsPanels.jsx"), /export function AboutPanel/);
});

test("هیچ ارجاع قدیمی به تب‌های جابه‌جاشده نمانده (ناوبری/جستجو/اعلان)", () => {
  const m = rd("app/app/MainApp.jsx"), s = rd("app/domain/search.js"), a = rd("app/core/activity.js");
  assert.doesNotMatch(m, /setSettingsTab\("(about|activity|errors)"\)/);
  assert.doesNotMatch(s, /key: "(about|activity|errors)"/);
  assert.doesNotMatch(a, /category:"به‌روزرسانی",tab:"settings"/);
});

test("نشانگر همگام‌سازی همیشه در نوار بالا است (حتی بدون سرور)", () => {
  const u = rd("sync/SyncUI.jsx");
  assert.doesNotMatch(u, /if \(!isApiConnected\(\)\) return null;\s*\n\s*const st = syncState/);
  assert.match(u, /localSyncState/);
  assert.match(u, /data-testid="sync-legend"/);
});

test("تبدیل تاریخ: فیلدها از چپ به راست سال، ماه، روز", () => {
  const c = rd("app/components/controls.jsx");
  assert.match(c, /data-testid="dc-fields" style=\{\{[^}]*direction:"ltr"\}\}>\{fld\("y","سال",2\)\}\{fld\("m","ماه",1\)\}\{fld\("d","روز",1\)\}/);
});

test("v1.60: نوار مهمان ثابت و قرمز در بالا؛ پروفایل کاربر/فروشگاه یک تب؛ همگام‌سازی فقط آیکن", () => {
  const m = rd("app/app/MainApp.jsx");
  assert.match(m, /data-testid="guest-banner"[^\n]*position:"fixed",top:0,left:0,right:0[^\n]*#dc2626/);
  assert.doesNotMatch(m, /data-testid="guest-banner"[^\n]*bottom:/);
  assert.match(m, /"--gb":isGuestMode\(\)\?"36px":"0px"/);
  assert.match(m, /data-testid=\{`profile-tab-\$\{k\}`\}/);
  assert.doesNotMatch(m, /key:"shop",label:"فروشگاه"/);
  const u = rd("sync/SyncUI.jsx");
  const chip = u.slice(u.indexOf("export function SyncChip"), u.indexOf("// Floating capsule"));
  assert.doesNotMatch(chip, /\{st\.text\}<\/span>/, "متن وضعیت نباید کنار آیکن چاپ شود");
});

test("v1.60: تعهدات در نمای جدا با دکمهٔ بازگشت؛ فروش محصول با پورتال", () => {
  const o = rd("app/domain/obligations.jsx");
  assert.match(o, /data-testid="obl-back"/);
  assert.match(o, /view==="form"/); assert.match(o, /view==="payroll"/);
  assert.match(rd("app/pages/pos.jsx"), /return createPortal\(\s*<div data-testid="product-sale-overlay"/);
});

test("v1.62: «اطلاعیه و تیکت» در منوی مدیریت، با نشان نخوانده، نوار فوری و دریافت دوره‌ای", () => {
  const c = rd("app/core/constants.js");
  assert.match(c, /key:"inbox",icon:"Megaphone",label:"اطلاعیه و تیکت"/);
  assert.match(c, /group:"manage"[^\n]*"inbox"/);
  const m = rd("app/app/MainApp.jsx");
  assert.match(m, /activeTab==="inbox"&&<InboxPage\/>/);
  assert.match(m, /startInboxPolling\(\)/);
  assert.match(m, /<UrgentAnnouncementBar onOpen=/);
  assert.match(m, /t\.key==="inbox"&&<InboxBadge/);
  assert.match(rd("app/core/activity.js"), /inboxNotifications\(\)/);
  assert.match(rd("app/domain/search.js"), /inbox: "اطلاعیه/);
  // ساخت و پاسخ تیکت باید از صف آفلاین (Idempotency) برود، نه fetch مستقیم
  const i = rd("inbox/inbox.js");
  assert.match(i, /queueOp\(\{\s*resource: "tickets", action: "create"/);
  assert.match(i, /idem: `ticket-message-\$\{message\.id\}`/);
  assert.doesNotMatch(i.replace(/refreshInbox[\s\S]*?\/\/ ── ثبت‌های کاربر/, ""), /apiRequest\(/, "نوشتن فقط از صف");
});
