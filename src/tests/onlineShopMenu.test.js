// 1.85: «مدیریت فایل» دکمهٔ مستقل (نه زیرمنو) و «آنلاین شاپ» با کاشی/ویجت زنده — منطق خالص + ثبت در سورس.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { onlineShopCounts, onlineShopLive } from "../uploads/onlineShopLive.js";

const read = (p) => fs.readFileSync(path.resolve(import.meta.dirname, p), "utf8");

test("مدیریت فایل: برچسب جدید، دکمهٔ مستقل با رنگ جدا، و دیگر زیرمنوی «مدیریت» نیست", () => {
  const c = read("../app/core/constants.js"), m = read("../app/app/MainApp.jsx");
  assert.match(c, /key:"uploads",icon:"FolderOpen",label:"مدیریت فایل"/);
  assert.match(c, /\{key:"uploads",featured:true\}/);
  assert.doesNotMatch(c, /group:"manage"[^\n]*"uploads"/);
  assert.match(c, /FEATURED_GRADIENT=Object\.freeze\(\{uploads:"linear-gradient\(135deg,#0f766e,#14b8a6\)","miniapp-orders":"linear-gradient\(135deg,#c2410c,#f59e0b\)"\}\)/, "فیروزه‌ای برای مدیریت فایل، نارنجی برای آنلاین شاپ؛ هر دو متفاوت از بنفشِ فروش یکپارچه");
  assert.match(m, /navTree\.filter\(n=>n\.featured\)/, "دکمه جدا از فهرست منو رندر می‌شود");
  assert.match(m, /navTree\.filter\(n=>!n\.featured\)/, "در فهرست زیرمنوها تکرار نمی‌شود");
  assert.ok(m.indexOf("سیستم فروش یکپارچه") < m.indexOf('data-featured="1"') && m.indexOf('data-featured="1"') < m.indexOf('data-testid="side-nav"'), "زیر «فروش یکپارچه» و بالای منو");
});

test("1.86 — آنلاین شاپ دکمهٔ مستقل زیر «مدیریت فایل» با رنگ دیگر؛ سه دکمهٔ فروش از منوی کناری حذف", () => {
  const c = read("../app/core/constants.js"), m = read("../app/app/MainApp.jsx");
  assert.match(c, /\{key:"uploads",featured:true\},\s*\{key:"miniapp-orders",featured:true\}/, "پشت سرِ مدیریت فایل");
  assert.match(c, /key:"miniapp-orders",icon:"ShoppingBag",label:"آنلاین شاپ",nav:"main"/);
  assert.match(c, /group:"shop"[^\n]*keys:\["shop-all","pos","topup","printscan"\]/);
  assert.doesNotMatch(c, /group:"shop"[^\n]*(shop-services|shop-inperson|shop-online|miniapp-orders)/);
  assert.match(m, /t\.key==="miniapp-orders"&&<MiniReqBadge/); assert.match(m, /data-testid="featured-nav"/);
  assert.ok(m.indexOf('data-testid="featured-nav"') < m.indexOf('data-testid="side-nav"'));
});

test("آنلاین شاپ: برچسب منو/صفحه و ثبت ویجت و کاشی‌های زنده", () => {
  const c = read("../app/core/constants.js"), d = read("../app/pages/dashboard.jsx"), t = read("../app/pages/dashTiles.jsx");
  assert.match(c, /key:"miniapp-orders",icon:"ShoppingBag",label:"آنلاین شاپ"/);
  assert.match(read("../uploads/MiniappOrdersPage.jsx"), /🛒 آنلاین شاپ/);
  assert.match(d, /id:"onlineShop"[^\n]*آنلاین شاپ/); assert.match(d, /onlineShop:\{color:"#0d9488"[^\n]*short:"آنلاین شاپ"/);
  assert.match(d, /onlineShop:\(\)=><OnlineShopWidget/); assert.match(d, /case "onlineShop":return onlineShopLive\(/);
  assert.match(d, /if\(!v\.order\.includes\("onlineShop"\)\)/, "ویجت به چیدمان ذخیره‌شدهٔ قدیمی اضافه می‌شود");
  assert.match(t, /id:"onlineshop"[^\n]*go:\{tab:"miniapp-orders"\}/); assert.match(t, /id:"filemanager"[^\n]*go:\{tab:"uploads"\}/);
  assert.match(t, /TILES_VER=3/); assert.match(t, /\(v\.ver\|\|1\)<3\)\["onlineshop","filemanager"\]/);
});

test("کاشی زندهٔ آنلاین شاپ: بدون سرور، بدون مورد، و با شمارنده‌ها", () => {
  assert.deepEqual(onlineShopCounts({ newCount: 2, pendingPayments: 1, unreadChats: "3", x: 9 }).parts.map((p) => p.count), [2, 1, 3]);
  assert.equal(onlineShopCounts({ newCount: -4, pendingPayments: "ab" }).total, 0, "مقدار نامعتبر صفر می‌شود");
  assert.equal(onlineShopLive({ newCount: 5 }, false).big, "—", "بدون اتصال سرور عدد نشان نمی‌دهد");
  assert.match(onlineShopLive({ newCount: 5 }, false).sub, /سرور/);
  assert.equal(onlineShopLive({ ready: true }, true).big, "✓");
  const l = onlineShopLive({ newCount: 2, pendingPayments: 1, unreadChats: 0, ready: true }, true);
  assert.equal(l.big, "۳"); assert.deepEqual(l.lines, ["۲ سفارش تازه", "۱ رسید در انتظار تأیید"], "فقط مواردِ دارای شمار");
});
