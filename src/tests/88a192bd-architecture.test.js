import test from "node:test";
import assert from "node:assert/strict";
import { createId, isStandardId } from "../core/ids.js";
import { ValidationError } from "../core/errors.js";
import { LocalRepository, readJsonValue, writeJsonValue } from "../data/localRepository.js";
import { initializeDataSchema } from "../data/migrations.js";
import { createBranch, createInvoice, createOrganization, createPayment } from "../domain/models.js";
import { validateEntity } from "../domain/validation.js";
import { createAuditEvent } from "../domain/audit.js";

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

test("entity ids have stable type prefixes and fixed UUID payloads", () => {
  const id = createId("invoice");
  assert.match(id, /^invoice_[a-f0-9]{32}$/);
  assert.equal(isStandardId(id, "invoice"), true);
  assert.notEqual(id, createId("invoice"));
});

test("new domain models include organization and branch scope", () => {
  const invoice = createInvoice({ number: "42", items: [], totalAmount: 1200, status: "draft" });
  assert.equal(invoice.organizationId.startsWith("org_"), true);
  assert.equal(invoice.branchId.startsWith("branch_"), true);
  assert.equal(isStandardId(invoice.id, "invoice"), true);
  assert.equal(validateEntity("invoice", invoice), true);
  const organization = createOrganization({ name: "Café" });
  assert.equal(isStandardId(organization.id, "organization"), true);
  const branch = createBranch({ name: "Central" }, { organizationId: organization.id, branchId: "branch_placeholder" });
  assert.equal(isStandardId(branch.id, "branch"), true);
  assert.equal(branch.branchId, branch.id);
});

test("invalid invoices and payments fail validation explicitly", () => {
  assert.throws(() => createInvoice({ number: "", items: [], totalAmount: -1, status: "bad" }), ValidationError);
  assert.throws(() => createPayment({ invoiceId: "", amount: 0, method: "" }), ValidationError);
});

test("repository reads legacy JSON values and supports validated updates", () => {
  const storage = new MemoryStorage();
  assert.equal(writeJsonValue("legacy", [{ id: 1 }], { storage }).ok, true);
  assert.deepEqual(readJsonValue("legacy", [], { storage }), [{ id: 1 }]);
  const repo = new LocalRepository({ key: "legacy", fallback: [], storage, validate: Array.isArray });
  assert.equal(repo.update(rows => [...rows, { id: 2 }]).ok, true);
  assert.deepEqual(repo.read().value, [{ id: 1 }, { id: 2 }]);
  assert.equal(repo.write("not an array").ok, false);
});

test("schema bootstrap leaves existing business records untouched", () => {
  const storage = new MemoryStorage();
  const legacySales = [{ id: 1700000000000001, total: 1000 }];
  storage.setItem("cafenet_sales", JSON.stringify(legacySales));
  initializeDataSchema(storage);
  assert.deepEqual(JSON.parse(storage.getItem("cafenet_sales")), legacySales);
});

test("storage failures return typed errors instead of throwing", () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem() {} };
  const result = writeJsonValue("limited", { a: 1 }, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "storage_write_failed");
});

test("repository reports corrupt stored JSON and does not overwrite it", () => {
  const storage = new MemoryStorage();
  storage.setItem("broken", "{");
  const repo = new LocalRepository({ key: "broken", fallback: [], storage, validate: Array.isArray });
  const result = repo.read();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "storage_read_failed");
  assert.equal(storage.getItem("broken"), "{");
});

test("schema bootstrap creates one default organization and branch idempotently", () => {
  const storage = new MemoryStorage();
  assert.equal(initializeDataSchema(storage).ok, true);
  const orgs = JSON.parse(storage.getItem("cafenet_organizations"));
  const branches = JSON.parse(storage.getItem("cafenet_branches"));
  assert.equal(orgs.length, 1);
  assert.equal(branches.length, 1);
  assert.equal(branches[0].organizationId, orgs[0].id);
  assert.equal(initializeDataSchema(storage).version, 1);
  assert.equal(JSON.parse(storage.getItem("cafenet_organizations")).length, 1);
});

test("audit entries carry actor, tenant, target, and event version", () => {
  const event = createAuditEvent({ actorId: "user_local", action: "invoice.created", entityType: "invoice", entityId: "invoice_1" });
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.actorId, "user_local");
  assert.equal(event.entityType, "invoice");
  assert.equal(event.organizationId.startsWith("org_"), true);
  assert.equal(event.branchId.startsWith("branch_"), true);
});
