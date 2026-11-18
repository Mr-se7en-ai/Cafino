// 1.86 — اتصال مینی‌اپ تلگرام/بله برای هر کافی‌نت (سمت برنامه): زیرتب‌ها، وضعیت کارت، مسیرهای API مطابق سرور، SDK بله در مینی‌اپ.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { statusOfMini, MINI_BOT_HOWTO } from "../uploads/miniappBotMeta.js";
import { getTg } from "../miniapp/tg.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("زیرتب‌های اتصال: مینی‌اپ تلگرام و بله اضافه شده و به صفحهٔ اختصاصی وصل است", () => {
  const c = read("../app/pages/connectionsPanel.jsx");
  assert.match(c, /key: "mini-telegram", label: "مینی‌اپ تلگرام"/); assert.match(c, /key: "mini-bale", label: "مینی‌اپ بله"/);
  assert.match(c, /cur\.startsWith\("mini-"\) \? <MiniappBotPage key=\{cur\} provider=\{cur\.slice\(5\)\}/);
  // زیرتب‌های قبلی دست‌نخورده
  for (const k of ['"bale"', '"telegram"', '"ai"']) assert.ok(c.includes(`key: ${k}`));
});

test("statusOfMini: اولویت متصل‌نیست ← خاموش ← خطا ← سرور آماده نیست ← فعال", () => {
  assert.equal(statusOfMini(null, true).text, "متصل نیست");
  assert.equal(statusOfMini({ connected: true, enabled: false, lastError: "x" }, true).text, "خاموش");
  assert.equal(statusOfMini({ connected: true, enabled: true, lastError: "x" }, true).text, "خطا");
  assert.equal(statusOfMini({ connected: true, enabled: true }, false).text, "سرور آماده نیست");
  assert.equal(statusOfMini({ connected: true, enabled: true }, true).text, "فعال");
});

test("راهنمای هر دو پیام‌رسان هست و دربارهٔ آزمایش‌نشدنِ بله صادق است", () => {
  for (const k of ["telegram", "bale"]) { assert.ok(MINI_BOT_HOWTO[k].steps.length >= 3); assert.ok(MINI_BOT_HOWTO[k].note); }
  assert.match(MINI_BOT_HOWTO.bale.note, /آزمایش نشده/);
});

test("مسیرهای API برنامه با سرور یکی است و توکن هرگز نمایش داده نمی‌شود", async () => {
  const api = read("../uploads/miniappApi.js"), srv = read("../../server/src/routes/miniappCafeBots.js");
  for (const m of ['"/api/miniapp/cafe-bots"', "/api/miniapp/cafe-bots/${encodeURIComponent(provider)}"]) assert.ok(api.includes(m), m);
  assert.match(srv, /app\.put\("\/api\/miniapp\/cafe-bots\/:provider"/); assert.match(srv, /app\.patch\("\/api\/miniapp\/cafe-bots\/:provider"/); assert.match(srv, /app\.delete\("\/api\/miniapp\/cafe-bots\/:provider"/); assert.match(srv, /\/check"/);
  const page = read("../uploads/MiniappBotPage.jsx");
  assert.match(page, /••••\{s\.tokenHint\}/); assert.doesNotMatch(page, /s\.token\b/);
});

test("مینی‌اپ: getTg از SDK بله هم initData می‌خواند، و بدون SDK از hash", () => {
  const url = "https://x.ir/m/?c=ABC&m=staff";
  const bale = getTg({ Bale: { WebApp: { initData: "a=1&hash=h", ready() {} } }, location: { hash: "", search: "?c=ABC" } });
  assert.equal(bale.initData, "a=1&hash=h"); assert.equal(bale.cafe, "ABC"); assert.ok(bale.hasSdk);
  const both = getTg({ Telegram: { WebApp: { initData: "" } }, Bale: { WebApp: { initData: "b=2" } }, location: { hash: "", search: "" } });
  assert.equal(both.initData, "b=2", "SDKی که initData دارد انتخاب می‌شود");
  const hashOnly = getTg({ location: { hash: "#tgWebAppData=q%3D1%26hash%3Dz", search: new URL(url).search } });
  assert.equal(hashOnly.initData, "q=1&hash=z"); assert.equal(hashOnly.mode, "staff");
  assert.ok(read("../../server/src/routes/miniapp.js").includes("https://tapi.bale.ai"), "CSP و اسکریپت SDK بله");
});
