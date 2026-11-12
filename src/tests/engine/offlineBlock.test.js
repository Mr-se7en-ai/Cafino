// عملیات حساس مالی در حالت سرور + آفلاین مسدود است؛ در حالت محلی یا آنلاین آزاد
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
afterEach(() => { E.setOfflineActive(false); E.saveApiConfig({ baseUrl: "" }); });

test("حالت محلی: آفلاین‌بودن عملیات را مسدود نمی‌کند (سرور ندارد)", () => {
  E.saveApiConfig({ baseUrl: "" }); E.setOfflineActive(true);
  assert.equal(E.financialBlockedOffline(), false);
});
test("حالت سرور: با هویت آفلاین مسدود؛ آنلاین آزاد", async () => {
  E.saveApiConfig({ baseUrl: "https://api.example.com" });
  assert.equal(E.financialBlockedOffline(), false);
  E.setOfflineActive(true);
  assert.equal(E.financialBlockedOffline(), true);
  assert.equal(await E.askReason({ online: true, title: "حذف" }), null, "بدون میزبان دیالوگ، null (لغو) برمی‌گردد");
  assert.equal(await E.ensureOnlineForSensitive("ابطال فاکتور"), false);
  E.setOfflineActive(false); assert.equal(E.financialBlockedOffline(), false);
  assert.equal(await E.ensureOnlineForSensitive("ابطال فاکتور"), true);
});
