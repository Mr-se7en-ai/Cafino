// لوگوی اپراتورها: تشخیص نام، ذخیره/حذف، اعتبارسنجی data:، اولویت منابع
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let O;
beforeEach(() => { O = fresh(); });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("operatorKey: املاهای مختلف نام اپراتور به شناسهٔ ثابت می‌رسند", () => {
  const k = O.operatorKey;
  assert.equal(k("همراه اول"), "mci"); assert.equal(k("همراه‌اول"), "mci"); assert.equal(k("MCI"), "mci");
  assert.equal(k("ایرانسل"), "irancell"); assert.equal(k("رايتل"), "rightel", "ي عربی");
  assert.equal(k("شاتل موبایل"), "shatel"); assert.equal(k("شاتل"), "shatel"); assert.equal(k("لوتوس‌تل"), "lotus");
  assert.equal(k("شارژ همراه اول ۱۰۰ هزار"), "mci", "نام داخل عبارت");
  assert.equal(k("سایر"), "other"); assert.equal(k(""), "other"); assert.equal(k(null), "other"); assert.equal(k("اپراتور ناشناخته"), "other");
  for (const n of O.OPERATOR_NAMES) assert.equal(O.operatorInfo(n).name, n, "هر نام رسمی به خودش برمی‌گردد: " + n);
  assert.equal(new Set(O.OPERATORS.map((o) => o.key)).size, O.OPERATORS.length);
});

test("ذخیره، خواندن و حذف لوگو؛ نام‌های هم‌ارز یک لوگو را می‌گیرند", () => {
  assert.equal(O.operatorLogoSrc("همراه اول"), "");
  O.setOperatorLogo("mci", PNG);
  assert.equal(O.operatorLogoSrc("همراه اول"), PNG); assert.equal(O.operatorLogoSrc("MCI"), PNG); assert.equal(O.operatorLogoSrc("ایرانسل"), "");
  assert.equal(O.operatorLogoSource("mci"), "user");
  O.removeOperatorLogo("mci"); assert.equal(O.operatorLogoSrc("همراه اول"), ""); assert.equal(O.operatorLogoSource("mci"), "none");
});

test("اعتبارسنجی: فقط data:image امن؛ اپراتور ناشناخته و ورودی خراب رد می‌شود", () => {
  assert.throws(() => O.setOperatorLogo("mci", "javascript:alert(1)"), /فرمت/);
  assert.throws(() => O.setOperatorLogo("mci", "data:text/html;base64,PHNjcmlwdD4="), /فرمت/);
  assert.throws(() => O.setOperatorLogo("mci", "https://evil.example/x.png"), /فرمت/);
  assert.throws(() => O.setOperatorLogo("nope", PNG), /ناشناخته/);
  assert.throws(() => O.setOperatorLogo("mci", "data:image/png;base64," + "A".repeat(300000)), /حجم/);
  // مقدار آلودهٔ دستی در حافظه نادیده گرفته می‌شود
  E_write({ mci: "javascript:alert(1)", irancell: PNG, zzz: PNG });
  assert.deepEqual(O.getStoredOperatorLogos(), { irancell: PNG });
});
function E_write(v) { globalThis.localStorage.setItem(O.OPERATOR_LOGOS_KEY, JSON.stringify(v)); }

test("اولویت منابع: بارگذاری کاربر ← config.js؛ آدرس ناامن در config رد می‌شود", () => {
  globalThis.CAFINO_CONFIG = { operatorLogos: { mci: "brand/operators/mci.png", rightel: "javascript:alert(1)", irancell: "https://cdn.example.com/i.svg", shatel: "//evil.com/x.png" } };
  try {
    const cfg = O.getConfigOperatorLogos();
    assert.deepEqual(cfg, { mci: "brand/operators/mci.png", irancell: "https://cdn.example.com/i.svg" });
    assert.equal(O.operatorLogoSrc("همراه اول"), "brand/operators/mci.png"); assert.equal(O.operatorLogoSource("mci"), "config");
    O.setOperatorLogo("mci", PNG); assert.equal(O.operatorLogoSrc("همراه اول"), PNG, "بارگذاری کاربر مقدم است");
    assert.equal(O.operatorLogoSrc("رایتل"), "");
  } finally { delete globalThis.CAFINO_CONFIG; }
});

test("لوگوها در پشتیبان‌گیری می‌آیند و با بازیابی برمی‌گردند", async () => {
  O.setOperatorLogo("rightel", PNG);
  const text = JSON.stringify(await O.buildBackupPayload("full"));
  assert.ok(text.includes("cafenet_operator_logos") && text.includes("iVBORw0KGgo"), "لوگو در پشتیبان است");
  O.removeOperatorLogo("rightel"); assert.equal(O.operatorLogoSrc("رایتل"), "");
  O.restoreBackup(text);
  assert.equal(O.operatorLogoSrc("رایتل"), PNG, "پس از بازیابی لوگو برگشته");
});
