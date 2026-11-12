import { readJsonValue, writeJsonValue } from "./localRepository.js";

export const TENANT_SCOPE_KEY = "cafenet_tenant_scope";
export const ORGANIZATIONS_KEY = "cafenet_organizations";
export const BRANCHES_KEY = "cafenet_branches";
export const DATA_SCHEMA_VERSION_KEY = "cafenet_data_schema_version";
export const CURRENT_DATA_SCHEMA_VERSION = 1;

export const DEFAULT_TENANT_SCOPE = Object.freeze({
  organizationId: "org_00000000000040008000000000000001",
  branchId: "branch_00000000004000800000000000000002",
});

export function readTenantScope(storage = globalThis.localStorage) {
  const saved = readJsonValue(TENANT_SCOPE_KEY, null, { storage });
  if (
    saved && typeof saved.organizationId === "string" &&
    typeof saved.branchId === "string"
  ) return saved;
  return { ...DEFAULT_TENANT_SCOPE };
}

export function writeTenantScope(scope, storage = globalThis.localStorage) {
  if (!scope || typeof scope.organizationId !== "string" || typeof scope.branchId !== "string") {
    return { ok: false, error: { code: "invalid_tenant_scope" } };
  }
  return writeJsonValue(TENANT_SCOPE_KEY, scope, { storage });
}
