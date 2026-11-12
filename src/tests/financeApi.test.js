import test from "node:test";
import assert from "node:assert/strict";
import { parseMoneyInput, normalizeAmountText, summarizeFindings, buildPolicy, effectiveState, setPermission, errorText, SCOPES } from "../finance/financeApi.js";
import { readFileSync } from "node:fs";

test("parseMoneyInput: رقم فارسی/هزارگان، تبدیل تومان به ریال، رد ورودی نامعتبر", () => {
  assert.equal(normalizeAmountText("۱٬۲۳۴,۵"), "12345");
  assert.deepEqual(parseMoneyInput("۱۲۰٬۰۰۰", "rial"), { ok: true, rial: 120000 });
  assert.deepEqual(parseMoneyInput("12000", "toman"), { ok: true, rial: 120000 });
  assert.deepEqual(parseMoneyInput("0", "rial"), { ok: true, rial: 0 });
  for (const bad of ["", "  ", "-5", "1.5", "۱۲abc", "1e3", "9".repeat(20)]) assert.equal(parseMoneyInput(bad).ok, false, bad);
});

test("summarizeFindings: ترتیب شدت و شمارش", () => {
  const s = summarizeFindings({ ok: false, summary: { total: 5, critical: 1, high: 0, medium: 3, low: 1 } });
  assert.deepEqual(s.rows.map((r) => [r.severity, r.count]), [["critical", 1], ["high", 0], ["medium", 3], ["low", 1]]);
  assert.equal(s.total, 5); assert.equal(s.ok, false);
  assert.equal(summarizeFindings(null).total, 0);
});

test("سیاست دسترسی: فقط تفاوت با پیش‌فرض ذخیره می‌شود و grant/deny هم‌زمان نمی‌شوند", () => {
  const def = ["a", "b"];
  assert.equal(effectiveState("a", def, null), "allow"); assert.equal(effectiveState("c", def, null), "deny");
  assert.equal(effectiveState("a", def, { deny: ["a"] }), "deny"); assert.equal(effectiveState("c", def, { grant: ["c"] }), "allow");
  assert.deepEqual(setPermission(null, "c", true, def), { grant: ["c"], deny: [] });
  assert.deepEqual(setPermission(null, "a", false, def), { grant: [], deny: ["a"] });
  assert.deepEqual(setPermission({ grant: ["c"], deny: [] }, "c", false, def), { grant: [], deny: [] });        // برگشت به پیش‌فرض → اثری باقی نمی‌ماند
  assert.deepEqual(setPermission({ grant: [], deny: ["a"] }, "a", true, def), { grant: [], deny: [] });
  const p = buildPolicy({ staff: { grant: ["c", "c"], deny: [] }, manager: { grant: [], deny: [] } }, {}, { staff: { discountMaxPercent: 10 } }, 3);
  assert.deepEqual(p, { roles: { staff: { grant: ["c"], deny: [] } }, users: {}, limits: { staff: { discountMaxPercent: 10 } }, version: 3 });
});

test("errorText و SCOPES با کلیدهای سرور هم‌خوانند", () => {
  assert.equal(errorText({ message: "x" }), "x"); assert.equal(errorText(null), "خطای نامشخص");
  const src = readFileSync(new URL("../../server/src/routes/integrity.js", import.meta.url), "utf8");
  const m = src.match(/SCOPES\s*=\s*\[([^\]]+)\]/); assert.ok(m, "SCOPES در سرور پیدا نشد");
  assert.deepEqual(m[1].split(",").map((s) => s.trim().replace(/["']/g, "")).sort(), SCOPES.map((s) => s.key).sort());
});

test("ثبت تب: مرکز مالی در TABS و NAV_TREE و MainApp هست", () => {
  const c = readFileSync(new URL("../app/core/constants.js", import.meta.url), "utf8"), m = readFileSync(new URL("../app/app/MainApp.jsx", import.meta.url), "utf8");
  assert.match(c, /key:"fincenter".*label:"مرکز مالی سرور"/); assert.match(c, /group:"accounting"[^\n]*"fincenter"/);
  assert.match(m, /activeTab==="fincenter"&&<FinanceCenter\/>/);
});
