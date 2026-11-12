import { createId } from "../core/ids.js";
import { ValidationError } from "../core/errors.js";
import { DEFAULT_TENANT_SCOPE } from "../data/tenantScope.js";
import { validateEntity } from "./validation.js";

function make(kind, input = {}, scope = DEFAULT_TENANT_SCOPE) {
  const now = new Date().toISOString();
  const id = input.id || createId(kind);
  const entity = {
    ...input,
    id,
    organizationId: input.organizationId || (kind === "organization" ? id : scope.organizationId),
    ...(kind === "organization" ? {} : { branchId: input.branchId || (kind === "branch" ? id : scope.branchId) }),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
  const result = validateEntity(kind, entity);
  if (result !== true) throw new ValidationError(kind, result);
  return entity;
}

export const createOrganization = input => make("organization", input, DEFAULT_TENANT_SCOPE);
export const createBranch = (input, scope) => make("branch", input, scope);
export const createUser = (input, scope) => make("user", input, scope);
export const createCustomer = (input, scope) => make("customer", input, scope);
export const createInvoice = (input, scope) => make("invoice", input, scope);
export const createPayment = (input, scope) => make("payment", input, scope);
export const createAccount = (input, scope) => make("account", input, scope);
export const createTransaction = (input, scope) => make("transaction", input, scope);
export const createInventoryItem = (input, scope) => make("inventoryItem", input, scope);
