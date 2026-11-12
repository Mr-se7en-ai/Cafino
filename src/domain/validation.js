export const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;
export const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value);

export function validateEntity(kind, value) {
  const issues = [];
  if (!isRecord(value)) return [`${kind} must be an object`];
  if (!isNonEmptyString(value.id)) issues.push("id is required");
  if (!isNonEmptyString(value.organizationId)) issues.push("organizationId is required");
  if (kind !== "organization" && !isNonEmptyString(value.branchId)) issues.push("branchId is required");
  if (!isNonEmptyString(value.createdAt)) issues.push("createdAt is required");
  if (!isNonEmptyString(value.updatedAt)) issues.push("updatedAt is required");

  if (kind === "organization" && !isNonEmptyString(value.name)) issues.push("name is required");
  if (kind === "branch" && !isNonEmptyString(value.name)) issues.push("name is required");
  if (kind === "user") {
    if (!isNonEmptyString(value.email)) issues.push("email is required");
    if (!isNonEmptyString(value.organizationId)) issues.push("organizationId is required");
  }
  if (kind === "customer" && !isNonEmptyString(value.firstName) && !isNonEmptyString(value.lastName)) {
    issues.push("firstName or lastName is required");
  }
  if (kind === "invoice") {
    if (!isNonEmptyString(value.number)) issues.push("number is required");
    if (!Array.isArray(value.items)) issues.push("items must be an array");
    if (!isFiniteNumber(value.totalAmount) || value.totalAmount < 0) issues.push("totalAmount must be a non-negative number");
    if (!["draft", "unpaid", "partial", "paid", "void"].includes(value.status)) issues.push("status is invalid");
  }
  if (kind === "payment") {
    if (!isNonEmptyString(value.invoiceId)) issues.push("invoiceId is required");
    if (!isFiniteNumber(value.amount) || value.amount <= 0) issues.push("amount must be positive");
    if (!isNonEmptyString(value.method)) issues.push("method is required");
  }
  if (kind === "account") {
    if (!isNonEmptyString(value.name)) issues.push("name is required");
    if (!isFiniteNumber(value.openingBalance)) issues.push("openingBalance must be numeric");
    if (!isNonEmptyString(value.currency)) issues.push("currency is required");
  }
  if (kind === "transaction") {
    if (!["income", "expense", "transfer"].includes(value.type)) issues.push("type is invalid");
    if (!isFiniteNumber(value.amount) || value.amount <= 0) issues.push("amount must be positive");
    if (!isNonEmptyString(value.date)) issues.push("date is required");
  }
  if (kind === "inventoryItem") {
    if (!isNonEmptyString(value.name)) issues.push("name is required");
    if (!isFiniteNumber(value.quantity) || value.quantity < 0) issues.push("quantity must be non-negative");
  }
  return issues.length ? issues : true;
}
