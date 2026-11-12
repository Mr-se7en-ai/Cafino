import { createId } from "../core/ids.js";
import { readTenantScope } from "../data/tenantScope.js";

export function createAuditEvent({
  actorId = null,
  action,
  entityType = "application",
  entityId = null,
  details = "",
  organizationId,
  branchId,
  occurredAt = new Date().toISOString(),
} = {}) {
  const scope = readTenantScope();
  return {
    id: createId("event"),
    type: "audit",
    schemaVersion: 1,
    organizationId: organizationId || scope.organizationId,
    branchId: branchId || scope.branchId,
    actorId,
    action: String(action || "unknown"),
    entityType,
    entityId,
    details: details == null ? "" : String(details),
    occurredAt,
  };
}
