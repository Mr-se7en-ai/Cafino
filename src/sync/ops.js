// Operation model for the offline queue.
// Every mutation that must reach the server becomes ONE operation with:
//   opId   – unique id of this queued operation (never reused)
//   idem   – Idempotency-Key sent to the server. For creates it is derived from the entity id (e.g. invoice-<id>) so that
//            even a duplicated enqueue or a re-imported queue can never create the record twice.
//   entityKey – "resource:entityId" (ordering + dependency unit)
//   req    – the HTTP request to perform ({method, path, body})

export function newOpId() {
  let raw = "";
  try { raw = globalThis.crypto?.randomUUID?.().replaceAll("-", "") || ""; } catch { raw = ""; }
  if (!raw) raw = (Date.now().toString(16) + Math.floor(Math.random() * 1e15).toString(16) + "0".repeat(32)).slice(0, 32);
  return `op_${raw.toLowerCase()}`;
}

export const entityKeyOf = (resource, entityId) => `${resource}:${entityId}`;

const RESOURCE_PATHS = {
  customers: "/api/customers", orders: "/api/orders", inventory: "/api/inventory", inventoryMovements: "/api/inventory-movements",
  invoices: "/api/invoices", payments: "/api/payments", transactions: "/api/transactions", expenses: "/api/expenses",
  accounts: "/api/accounts", obligations: "/api/obligations",
};
export const pathFor = (resource) => RESOURCE_PATHS[resource] || `/api/${resource}`;

// Builds a queue-ready operation from a high-level description.
export function describeOp({ resource, action, entityId, body, idem, dependsOn = [], label = "", meta = {} }) {
  if (!resource || !action || entityId === undefined || entityId === null || entityId === "") throw new TypeError("resource, action and entityId are required");
  const base = pathFor(resource);
  const id = encodeURIComponent(String(entityId));
  const req = action === "create" ? { method: "POST", path: base, body }
    : action === "update" ? { method: "PATCH", path: `${base}/${id}`, body }
    : action === "remove" ? { method: "DELETE", path: `${base}/${id}` }
    : action === "command" ? { method: "POST", path: meta.path || base, body }
    : null;
  if (!req) throw new TypeError(`unknown action: ${action}`);
  return {
    resource, action, entityId: String(entityId), entityKey: entityKeyOf(resource, entityId), req,
    idem: idem || (action === "create" ? `${resource}-${entityId}` : undefined), dependsOn, label, meta,
  };
}
