import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { groupNotifications, topicOf, topicIcon, OTHER_TOPIC } from "../app/core/notifGroups.js";

const N = (category, level, text) => ({ category, level, text });
test("groupNotifications: گروه‌بندی موضوعی، ادغام اطلاعیه/تیکت، «سایر» آخر", () => {
  const g = groupNotifications([
    N("انبار", "warning", "a"), N("مشتریان", "info", "b"), N("اطلاعیه", "attention", "c"), N("تیکت", "critical", "d"),
    N("", "critical", "e"), N("مشتریان", "critical", "f"), N("انبار", "critical", "g"), N(undefined, "info", "h"),
  ]);
  assert.deepEqual(g.map((x) => x.topic), ["انبار", "مشتریان", "اطلاعیه و تیکت", OTHER_TOPIC]);   // بدترین شدت، سپس تعداد، سپس ترتیب ورود؛ سایر آخر
  const inbox = g.find((x) => x.topic === "اطلاعیه و تیکت"); assert.equal(inbox.count, 2); assert.equal(inbox.worst, "critical"); assert.deepEqual(inbox.counts, { critical: 1, attention: 1, warning: 0, info: 0 });
  assert.deepEqual(g.find((x) => x.topic === "انبار").items.map((n) => n.text), ["g", "a"]);        // داخل گروه: شدت، سپس ترتیب اصلی
  assert.equal(g.find((x) => x.topic === OTHER_TOPIC).count, 2);
  assert.equal(g.reduce((s, x) => s + x.count, 0), 8);                                            // هیچ اعلانی گم نمی‌شود
});
test("groupNotifications: ورودی خراب/خالی و سطح ناشناخته", () => {
  assert.deepEqual(groupNotifications(null), []); assert.deepEqual(groupNotifications([]), []);
  const g = groupNotifications([{ text: "x", level: "weird", category: "ویژه" }]);
  assert.equal(g[0].topic, "ویژه"); assert.equal(g[0].worst, "info"); assert.equal(g[0].icon, "🔔");
  assert.equal(topicOf({ category: " تقویم " }), "تقویم"); assert.equal(topicOf(null), OTHER_TOPIC); assert.equal(topicIcon("انبار"), "📦");
});
test("MainApp از NotificationCenter استفاده می‌کند و محتوای قدیمی تخت حذف شده", () => {
  const m = fs.readFileSync(new URL("../app/app/MainApp.jsx", import.meta.url), "utf8");
  assert.match(m, /<NotificationCenter notifications=\{notifications\}/); assert.doesNotMatch(m, /notifications\.map\(/);
  assert.match(fs.readFileSync(new URL("../app/components/NotificationCenter.jsx", import.meta.url), "utf8"), /groupNotifications\(notifications\)/);
});
