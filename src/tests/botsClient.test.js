// ربات بله/تلگرام (1.79) — سمت برنامه: توابع خالص، ثبت صفحه/منو، تطابق مسیرهای API با سرور و نبودنِ نشت توکن در رابط.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { statusOf, secondsLeft, mmss, isTokenShape, RANGE_LABELS, HOWTO, bots } from "../bots/botsApi.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("statusOf: متصل‌نیست / غیرفعال / خطا / منتظر پیوند / فعال (به همین ترتیب اولویت)", () => {
  assert.equal(statusOf(null).text, "متصل نیست"); assert.equal(statusOf({ connected: false }).text, "متصل نیست");
  assert.equal(statusOf({ connected: true, enabled: false, lastError: "x", linked: true }).text, "غیرفعال");
  assert.equal(statusOf({ connected: true, enabled: true, lastError: "x", linked: true }).text, "خطا");
  assert.equal(statusOf({ connected: true, enabled: true, lastError: "", linked: false }).text, "منتظر پیوند چت");
  assert.equal(statusOf({ connected: true, enabled: true, lastError: "", linked: true }).text, "فعال");
});
test("شمارندهٔ کد پیوند: secondsLeft/mmss و ورودی بد", () => {
  const now = Date.parse("2026-11-14T10:00:00Z");
  assert.equal(secondsLeft("2026-11-14T10:10:00Z", now), 600); assert.equal(secondsLeft("2026-11-14T09:59:00Z", now), 0); assert.equal(secondsLeft("", now), 0); assert.equal(secondsLeft("خراب", now), 0); assert.equal(secondsLeft(undefined, now), 0);
  assert.equal(mmss(600), "10:00"); assert.equal(mmss(65), "01:05"); assert.equal(mmss(0), "00:00");
});
test("isTokenShape: با قالب سرور یکی است و ورودی نامعتبر را رد می‌کند", () => {
  assert.ok(isTokenShape("123456789:AAH-telegram_token_for_tests_0001")); assert.ok(isTokenShape("  222222222:bale_token_for_tests_zz9999aa00  "));
  for (const t of ["", "abc", "123:short", "x:AAH-telegram_token_for_tests_0001", null, undefined, "123456789:AAH token with spaces 000000"]) assert.ok(!isTokenShape(t), String(t));
  const srv = read("../../server/src/lib/bots.js").match(/TOKEN_RE = (\/.+\/);/); assert.ok(srv); assert.equal(srv[1], "/^\\d{3,16}:[A-Za-z0-9_:-]{16,100}$/", "الگو با سرور یکی بماند");
});
test("بازه‌های ارسال فوری = بازه‌های سرور؛ راهنمای هر دو پیام‌رسان موجود است", () => {
  const srv = read("../../server/src/lib/bots.js"); for (const [k] of RANGE_LABELS) assert.match(srv, new RegExp(`\\b${k}: \\{ title`), k);
  for (const p of ["telegram", "bale"]) { assert.ok(HOWTO[p].steps.length >= 3); assert.match(srv, new RegExp(`${p}: \\{ label`)); }
  assert.match(HOWTO.telegram.note, /فیلتر[\s\S]*TELEGRAM_API_BASE/);
});
test("مسیرهای API کلاینت با مسیرهای سرور یکی است", () => {
  const api = read("../bots/botsApi.js"), srv = read("../../server/src/routes/bots.js");
  const paths = [...srv.matchAll(/app\.(get|put|patch|post|delete)\("([^"]+)"/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  for (const w of ["GET /api/bots", "PUT /api/bots/:provider", "PATCH /api/bots/:provider", "POST /api/bots/:provider/link", "POST /api/bots/:provider/unlink", "POST /api/bots/:provider/test", "POST /api/bots/:provider/send", "DELETE /api/bots/:provider"]) assert.ok(paths.includes(w), `سرور ${w} ندارد`);
  for (const frag of ['"/api/bots"', "/api/bots/${p(provider)}`", "/link`", "/unlink`", "/test`", "/send`"]) assert.ok(api.includes(frag), frag);
  assert.deepEqual(Object.keys(bots).sort(), ["connect", "link", "list", "patch", "remove", "send", "test", "unlink"]);
});
test("ثبت: تب bots در TABS و NAV_TREE (مدیریت) و MainApp؛ آیکن موجود؛ مجوز سرور تعریف شده", () => {
  const c = read("../app/core/constants.js"), m = read("../app/app/MainApp.jsx");
  assert.match(c, /key:"bots",icon:"Send",label:"ربات بله و تلگرام"/); assert.match(c, /group:"manage"[^\n]*"bots"/);
  assert.match(m, /activeTab==="bots"&&<BotsPage\/>/); assert.match(m, /import BotsPage from "..\/..\/bots\/BotsPage.jsx"/);
  assert.match(read("../components/Icon.jsx"), /\bSend\b/); assert.match(read("../../server/src/lib/permissions.js"), /"bot\.manage"/);
});
test("رابط: توکن در state فقط برای ارسال است؛ بعد از اتصال پاک می‌شود، در localStorage/لاگ نمی‌رود و نمایش فقط چهار نویسهٔ آخر است", () => {
  const ui = read("../bots/BotsPage.jsx");
  assert.match(ui, /setToken\(""\)/); assert.match(ui, /••••\{s\.tokenHint\}/); assert.match(ui, /autoComplete="off"/);
  assert.ok(!/localStorage|sessionStorage|console\./.test(ui) && !/localStorage|sessionStorage|console\./.test(read("../bots/botsApi.js")), "توکن/وضعیت ربات در حافظهٔ مرورگر یا لاگ نمی‌رود");
  assert.match(ui, /dir="ltr"/); assert.match(ui, /bots-offline/);
});
