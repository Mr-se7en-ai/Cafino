import test from "node:test";
import assert from "node:assert/strict";
import { FLUENT_CSS } from "../fluent/fluent.js";

// باگ: روی موبایل، دکمهٔ میکروفن نوار پایین (box-shadow با var(--bg-card)) اکریلیک می‌گرفت، گرادیان خودش با !important
// پوشانده می‌شد و آیکن سفید روی سطح روشن (تم سفید + فلوئنت) ناپدید می‌شد.
test("اکریلیک Fluent به عنصرهای گرادیانی و دکمه‌های دستیار صوتی اعمال نمی‌شود", () => {
  const rules = FLUENT_CSS.split("\n").filter((l) => l.startsWith("body.fluent-ui.fl-acrylic [style*=\"var(--bg-card)\"]"));
  assert.ok(rules.length >= 2, "قاعده‌های اکریلیک پیدا نشد");
  for (const r of rules) {
    assert.match(r, /:not\(\[style\*="gradient"\]\)/, r.slice(0, 120));
    assert.match(r, /:not\(\[data-testid\^="va-"\]\)/, r.slice(0, 120));
  }
});
