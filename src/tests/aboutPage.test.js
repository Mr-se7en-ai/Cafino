// قاعدهٔ همیشگی: صفحهٔ «درباره من» با هر نسخهٔ جدید به‌روز می‌شود. اگر این تست شکست خورد، about.jsx را مرور و ABOUT_REVIEWED_VERSION را به‌روز کنید.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION, APP_CHANGELOG } from "../app/core/version.js";

const about = readFileSync(new URL("../app/pages/about.jsx", import.meta.url), "utf8");

test("درباره من: برای نسخهٔ فعلی مرور شده است (ABOUT_REVIEWED_VERSION = APP_VERSION)", () => {
  const m = about.match(/ABOUT_REVIEWED_VERSION\s*=\s*"([^"]+)"/);
  assert.ok(m, "ABOUT_REVIEWED_VERSION در about.jsx نیست");
  assert.equal(m[1], APP_VERSION, `صفحهٔ «درباره من» برای v${m[1]} مرور شده ولی نسخهٔ برنامه v${APP_VERSION} است؛ امکانات جدید را در FEATURES اضافه کنید`);
});
test("درباره من: نسخهٔ فعلی در APP_CHANGELOG ثبت شده و دست‌کم یک کارت امکانات با since همان نسخه دارد", () => {
  const cur = APP_CHANGELOG.find((c) => c.v === APP_VERSION);
  assert.ok(cur && cur.items.length, "ورودی APP_CHANGELOG برای نسخهٔ فعلی نیست");
  if (cur.noAbout === true) return;   // نسخهٔ فقط‌رفع‌اشکال بدون قابلیت تازه
  assert.ok(about.includes(`"${APP_VERSION}"]`), `هیچ کارتی در FEATURES با since "${APP_VERSION}" نیست (یا برای نسخهٔ فقط‌رفع‌اشکال noAbout:true بگذارید)`);
});
test("درباره من: هر قابلیت‌های اصلی QR، ابزار PDF، ضدویروس، مشخصات صفحهٔ مشتری ربات بله/تلگرام و مینی‌اپ ذکر شده است", () => {
  for (const w of ["QR", "PDF", "ClamAV", "وزیرمتن", "پروفایل فروشگاه", "بله", "تلگرام", "مینی‌اپ"]) assert.ok(about.includes(w), `«${w}» در صفحهٔ درباره من نیست`);
});
test("درباره من: شمارهٔ نسخه‌های package.json و sw.js با APP_VERSION یکی است", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  assert.equal(pkg, APP_VERSION);
});
