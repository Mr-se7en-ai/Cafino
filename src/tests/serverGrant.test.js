import test from "node:test";
import assert from "node:assert/strict";
import { serverGrant } from "../services/auth/session.js";

test("serverGrant: نامعلوم → null (UI مسدود نمی‌کند)؛ مالک همیشه true؛ در غیر این صورت عضویت در grants", () => {
  assert.equal(serverGrant("payment.void", null), null);
  assert.equal(serverGrant("payment.void", { role: "staff" }), null);
  assert.equal(serverGrant("payment.void", { role: "owner", grants: [] }), true);
  assert.equal(serverGrant("payment.void", { role: "staff", grants: ["payment.create"] }), false);
  assert.equal(serverGrant("payment.void", { role: "staff", grants: ["payment.void"] }), true);
});
