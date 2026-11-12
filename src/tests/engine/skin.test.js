// پوسته‌ها: تم مترو (قبلی)، تم نارنجی و تم لیکوید گلس
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });

test("Skin: پیش‌فرض مترو است و مقدار نامعتبر به مترو برمی‌گردد", () => {
  assert.equal(E.getSkin(), "metro");
  assert.equal(E.normalizeSkin("x"), "metro");
  assert.equal(E.normalizeSkin("orange"), "orange");
  assert.equal(E.normalizeSkin("liquid"), "liquid");
  assert.deepEqual(E.SKINS.map((s) => s.key), ["metro", "orange", "liquid"]);
  assert.deepEqual(E.SKINS.map((s) => s.label), ["تم مترو", "تم نارنجی", "تم لیکوید گلس"]);
});

test("Skin: انتخاب ذخیره می‌شود و themeVars رنگ پوسته را برمی‌گرداند", () => {
  const metroDark = E.themeVars("dark");
  assert.equal(metroDark["--bg-app"], "#0f172a");
  E.setSkin("orange");
  assert.equal(globalThis.localStorage.getItem("cafino_skin"), "orange");
  assert.equal(E.getSkin(), "orange");
  assert.equal(E.themeVars("dark")["--bg-app"], "#1a120d");
  assert.equal(E.themeVars("light")["--bg-app"], "#fdf6ee");
  E.setSkin("metro");
  assert.equal(E.themeVars("dark")["--bg-app"], "#0f172a");
});

test("Skin: هر دو حالت روشن/تیرهٔ نارنجی همهٔ متغیرهای لازم را دارند", () => {
  const keys = Object.keys(E.themeVars("dark")).sort();
  for (const t of ["light", "dark"]) assert.deepEqual(Object.keys(E.orangeThemeVars(t)).sort(), keys);
});

test("لیکوید گلس: انتخاب ذخیره می‌شود؛ themeVars همهٔ کلیدهای مترو + پارامترهای شیشه را دارد؛ مترو بدون هیچ اثری از شیشه", () => {
  const metro = E.themeVars("dark");
  assert.ok(!Object.keys(metro).some((k) => /glass/.test(k)), "حالت شیشه‌ای مترو حذف شده است");
  E.setSkin("liquid");
  assert.equal(globalThis.localStorage.getItem("cafino_skin"), "liquid"); assert.equal(E.getSkin(), "liquid");
  for (const t of ["light", "dark"]) {
    const lq = E.themeVars(t);
    for (const k of Object.keys(metro)) assert.ok(k in lq, `${t}: ${k}`);
    for (const k of ["--lq-tint", "--lq-a-card", "--lq-a-chrome", "--lq-w1", "--lq-o1", "--lq-field", "--lq-edge", "--lq-card-fallback"]) assert.ok(lq[k], `${t}: ${k}`);
    assert.deepEqual(Object.keys(E.liquidThemeVars("light")).sort(), Object.keys(E.liquidThemeVars("dark")).sort());
  }
  assert.notEqual(E.themeVars("light")["--bg-app"], E.themeVars("dark")["--bg-app"]);
  E.setSkin("metro"); assert.equal(E.themeVars("dark")["--bg-app"], "#0f172a");
});
test("لیکوید گلس: کلیدهای قدیمیِ شیشه‌ای مترو هنگام شروع پاک می‌شوند", () => {
  globalThis.localStorage.setItem("cafenet_glass", "1"); globalThis.localStorage.setItem("cafenet_glass_transparency", "40");
  E.initSkin();
  assert.equal(globalThis.localStorage.getItem("cafenet_glass"), null); assert.equal(globalThis.localStorage.getItem("cafenet_glass_transparency"), null);
});
test("لیکوید گلس: تنظیمات اعتبارسنجی و ضریب شفافیت", () => {
  assert.deepEqual(E.getLiquid(), E.LIQUID_DEFAULTS);
  assert.deepEqual(E.normalizeLiquid({ transparency: 999, blur: -5, lens: 0 }), { transparency: 100, blur: 4, lens: false });
  assert.deepEqual(E.normalizeLiquid("x"), E.LIQUID_DEFAULTS); assert.equal(E.normalizeLiquid({ transparency: "abc" }).transparency, 40);
  assert.equal(E.tintFactor(0), 1.5); assert.equal(E.tintFactor(100), 0.2); assert.ok(Math.abs(E.tintFactor(40) - 0.98) < 0.01);
  assert.ok(E.tintFactor(10) > E.tintFactor(60), "شفافیت بیشتر = رنگ شیشهٔ کمتر");
  const s = E.saveLiquid({ transparency: 70, blur: 20 }); assert.equal(s.transparency, 70); assert.equal(E.getLiquid().blur, 20);
  assert.equal(E.liquidCssVars(s)["--lq-blur"], "20px"); assert.equal(E.liquidCssVars(s)["--lq-k"], String(E.tintFactor(70)));
});
test("لیکوید گلس: CSS هر سه نوع سطح (کارت/کروم/نشسته) و حالت‌های دسترسی‌پذیری را دارد", () => {
  const c = E.LIQUID_CSS;
  for (const s of ['[style*="var(--bg-card)"]', "aside.no-print", "var(--glass-lens,)", "prefers-reduced-transparency", "forced-colors", "@media print", ":not(:has([style*=\"position: fixed\"]))"]) assert.ok(c.includes(s.replace(/\\/g, "")) || c.includes(s), s);
  assert.ok(!/glass-ui/.test(c));
});
