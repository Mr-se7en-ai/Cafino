import test from "node:test";
import assert from "node:assert/strict";
import { LIQUID_CSS } from "../skins/liquid/liquidCss.js";

test("لیکوید: انیمیشن‌های سبک و فقط‌زیر skin-liquid", () => {
  assert.match(LIQUID_CSS, /body\.skin-liquid :is\(\.ui-page-enter,\.tab-active,\.tab-active svg,\.mobile-tab-indicator\)\{animation:none!important\}/);
  // پس‌زمینه روی لایهٔ جدا؛ background-attachment:fixed نباشد
  assert.match(LIQUID_CSS, /body\.skin-liquid::before\{[^}]*position:fixed/);
  assert.doesNotMatch(LIQUID_CSS, /background-attachment:fixed/);
  // هاور دکمه فیلتر/جابه‌جایی سنگین ندارد
  assert.match(LIQUID_CSS, /\.app-shell button:not\(:disabled\):hover\{filter:none;transform:none\}/);
  // هنگام حرکت، لنز SVG کنار می‌رود
  assert.match(LIQUID_CSS, /body\.skin-liquid\.lq-moving/);
  assert.match(LIQUID_CSS, /prefers-reduced-motion:reduce\)\{body\.skin-liquid/);
});
