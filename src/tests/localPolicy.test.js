import test from "node:test";
import assert from "node:assert/strict";
import { localAccountsAllowed } from "../services/auth/localPolicy.js";

test("حساب محلی: پیش‌فرض نسخهٔ نهایی غیرفعال است", () => {
  assert.equal(localAccountsAllowed({ dev: false, config: null }), false);
  assert.equal(localAccountsAllowed({ dev: false, config: {} }), false);
  assert.equal(localAccountsAllowed({ dev: false, config: { allowLocalAccounts: false } }), false);
});
test("حساب محلی: فقط مقدار دقیق true از config.js فعال می‌کند", () => {
  assert.equal(localAccountsAllowed({ dev: false, config: { allowLocalAccounts: true } }), true);
  for (const bad of ["true", 1, "yes", {}, []]) assert.equal(localAccountsAllowed({ dev: false, config: { allowLocalAccounts: bad } }), false);
});
test("حساب محلی: در حالت توسعه همیشه مجاز است", () => {
  assert.equal(localAccountsAllowed({ dev: true, config: null }), true);
});
test("حساب محلی: config غیرشیء نادیده گرفته می‌شود", () => {
  assert.equal(localAccountsAllowed({ dev: false, config: "x" }), false);
});
