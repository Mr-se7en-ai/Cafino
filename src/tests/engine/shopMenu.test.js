// منوی «فروشگاه» و داشبوردهای مالی/مدیریتی (قرارداد دادهٔ ناوبری)
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const tab = (k) => E.TABS.find((t) => t.key === k);

test("منوی فروشگاه: گروه با چهار زیرمنو به‌ترتیب خواسته‌شده", () => {
  const g = E.NAV_TREE.find((n) => n.group === "shop");
  assert.equal(g.label, "فروشگاه");
  assert.deepEqual(g.keys, ["shop-all", "shop-services", "shop-inperson", "shop-online", "miniapp-orders", "pos", "topup", "printscan"]);
  assert.deepEqual(g.keys.map((k) => tab(k).label), ["فروش یکپارچه", "فروش خدمات", "فروش حضوری", "فروش آنلاین", "آنلاین شاپ", "صندوق", "فروش شارژ و اینترنت", "فروش کپی و اسکن"]);
  for (const k of g.keys.slice(0, 4)) { assert.ok(tab(k).saleMode, k + " باید saleMode داشته باشد"); assert.ok(E.SALE_MODES[tab(k).saleMode], k); }
  for (const k of g.keys.slice(4)) assert.ok(!tab(k).saleMode, k + " صفحهٔ واقعی است، نه حالت فروش");
  assert.ok(E.NAV_TREE.findIndex((n) => n.group === "shop") < E.NAV_TREE.findIndex((n) => n.group === "accounting"), "فروشگاه پیش از حسابداری است");
});

test("حالت‌های فروش: اقلام هر حالت دقیقاً طبق تعریف", () => {
  const M = E.SALE_MODES;
  assert.deepEqual(M.all.pickers.slice().sort(), ["print", "service", "stock", "topup"], "یکپارچه = همهٔ اقلام");
  assert.equal(M.all.online, "optional");
  assert.deepEqual(M.services.pickers.slice().sort(), ["print", "service", "topup"], "خدمات = خدمات + شارژ/اینترنت + کپی/اسکن، بدون انبار");
  assert.ok(!M.services.pickers.includes("stock")); assert.equal(M.services.online, "off");
  assert.deepEqual(M.inperson.pickers, ["stock"], "حضوری = فقط انبار"); assert.equal(M.inperson.online, "off"); assert.equal(M.inperson.manual, false);
  assert.deepEqual(M.online.pickers, ["stock"], "آنلاین = فقط کالای متصل به انبار"); assert.equal(M.online.online, "forced"); assert.equal(M.online.manual, false);
  assert.throws(() => { M.all.label = "x"; }, TypeError, "تعریف حالت‌ها تغییرناپذیر است");
});

test("دو داشبورد: «داشبورد مدیریتی» مخصوص تم نارنجی و کنار داشبورد مالی است", () => {
  assert.equal(tab("dashboard").label, "داشبورد");
  assert.equal(tab("mgmt").label, "داشبورد مدیریتی"); assert.equal(tab("mgmt").orangeOnly, true);
  const i = E.NAV_TREE.findIndex((n) => n.key === "dashboard"), j = E.NAV_TREE.findIndex((n) => n.key === "mgmt");
  assert.equal(j, i + 1);
  assert.equal(E.TABS.filter((t) => t.nav === "shop").length, 8);
  assert.ok(!E.BOTTOM_NAV.some((t) => String(t.key).startsWith("shop-")), "منوی فروشگاه در نوار پایین موبایل نیست");
});

test("انتقال به فروشگاه: صندوق، شارژ و اینترنت و کپی و اسکن دیگر در حسابداری/ابزارها نیستند و هر کلید فقط یک‌بار در منو می‌آید", () => {
  const acc = E.NAV_TREE.find((n) => n.group === "accounting"), tools = E.NAV_TREE.find((n) => n.group === "tools");
  for (const k of ["pos", "topup", "printscan"]) { assert.ok(!acc.keys.includes(k), k + " نباید در حسابداری بماند"); assert.ok(!tools.keys.includes(k), k + " نباید در ابزارها بماند"); }
  assert.ok(acc.keys.includes("orders") && acc.keys.includes("invoice"), "بقیهٔ حسابداری سر جایش");
  const all = E.NAV_TREE.flatMap((n) => n.keys || [n.key]); assert.equal(new Set(all).size, all.length, "کلید تکراری در منو");
  for (const k of all) assert.ok(tab(k), "تب ناشناخته در منو: " + k);
});
