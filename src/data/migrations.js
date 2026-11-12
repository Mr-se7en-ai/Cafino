import { readJsonValue, writeJsonValue } from "./localRepository.js";
import {
  BRANCHES_KEY,
  CURRENT_DATA_SCHEMA_VERSION,
  DATA_SCHEMA_VERSION_KEY,
  DEFAULT_TENANT_SCOPE,
  ORGANIZATIONS_KEY,
  TENANT_SCOPE_KEY,
} from "./tenantScope.js";

const DEFAULT_ORGANIZATION = {
  id: DEFAULT_TENANT_SCOPE.organizationId,
  organizationId: DEFAULT_TENANT_SCOPE.organizationId,
  name: "کافی‌نت من",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const DEFAULT_BRANCH = {
  id: DEFAULT_TENANT_SCOPE.branchId,
  organizationId: DEFAULT_TENANT_SCOPE.organizationId,
  name: "شعبه اصلی",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export function initializeDataSchema(storage = globalThis.localStorage) {
  const version = Number(readJsonValue(DATA_SCHEMA_VERSION_KEY, 0, { storage })) || 0;
  if (version >= CURRENT_DATA_SCHEMA_VERSION) return { ok: true, version };

  const organizations = readJsonValue(ORGANIZATIONS_KEY, null, { storage });
  const branches = readJsonValue(BRANCHES_KEY, null, { storage });
  const scope = readJsonValue(TENANT_SCOPE_KEY, null, { storage });
  const writes = [];
  if (!Array.isArray(organizations) || organizations.length === 0) {
    writes.push(writeJsonValue(ORGANIZATIONS_KEY, [DEFAULT_ORGANIZATION], { storage }));
  }
  if (!Array.isArray(branches) || branches.length === 0) {
    writes.push(writeJsonValue(BRANCHES_KEY, [DEFAULT_BRANCH], { storage }));
  }
  if (!scope || typeof scope.organizationId !== "string" || typeof scope.branchId !== "string") {
    writes.push(writeJsonValue(TENANT_SCOPE_KEY, DEFAULT_TENANT_SCOPE, { storage }));
  }
  const failed = writes.find(result => !result.ok);
  if (failed) return failed;
  const saved = writeJsonValue(DATA_SCHEMA_VERSION_KEY, CURRENT_DATA_SCHEMA_VERSION, { storage });
  return saved.ok ? { ok: true, version: CURRENT_DATA_SCHEMA_VERSION } : saved;
}
