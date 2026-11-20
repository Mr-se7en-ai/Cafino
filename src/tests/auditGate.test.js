import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../../scripts/audit-gate.mjs";
const adv = (name, sev, ghsa) => ({ [name]: { severity: sev, via: [{ source: 1, name, title: "t", url: `https://github.com/advisories/${ghsa}`, severity: sev }] } });
const NOW = new Date("2026-11-20");
test("آسیب‌پذیری high بدون استثنا مسدود می‌کند؛ low و moderate (سطح پیش‌فرض high) نه", () => {
  assert.equal(evaluate({ vulnerabilities: adv("a", "high", "GHSA-x") }, [], { now: NOW }).ok, false);
  assert.equal(evaluate({ vulnerabilities: adv("a", "critical", "GHSA-x") }, [], { now: NOW }).ok, false);
  assert.equal(evaluate({ vulnerabilities: { ...adv("a", "moderate", "GHSA-m"), ...adv("b", "low", "GHSA-l") } }, [], { now: NOW }).ok, true);
  assert.equal(evaluate({ vulnerabilities: adv("a", "moderate", "GHSA-m") }, [], { now: NOW, level: "moderate" }).ok, false);
});
test("استثنا: فقط با شناسهٔ دقیق و تا تاریخ انقضا؛ منقضی = شکست؛ بی‌استفاده گزارش می‌شود", () => {
  const v = { vulnerabilities: adv("xlsx", "high", "GHSA-4r6h-8v6p-xvw6") };
  const rule = { id: "GHSA-4r6h-8v6p-xvw6", package: "xlsx", reason: "r", expires: "2027-03-01" };
  const ok = evaluate(v, [rule, { id: "GHSA-unused", expires: "2027-01-01" }], { now: NOW });
  assert.equal(ok.ok, true); assert.equal(ok.allowed.length, 1); assert.deepEqual(ok.unused, ["GHSA-unused"]);
  assert.equal(evaluate(v, [{ ...rule, expires: "2026-01-01" }], { now: NOW }).ok, false);
  assert.equal(evaluate({ vulnerabilities: adv("xlsx", "high", "GHSA-OTHER") }, [rule], { now: NOW }).ok, false, "شناسهٔ دیگر مجاز نیست");
});
test("وابستگی انتقالی (via رشته) بدون advisory مستقل نادیده گرفته می‌شود و خروجی خالی/نامعتبر کرش نمی‌کند", () => {
  assert.equal(evaluate({ vulnerabilities: { p: { severity: "high", via: ["xlsx"] } } }, [], { now: NOW }).ok, true);
  assert.equal(evaluate({}, [], { now: NOW }).ok, true); assert.equal(evaluate(null, [], { now: NOW }).ok, true);
});
