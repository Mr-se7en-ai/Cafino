const PREFIXES = new Set([
  "org", "branch", "user", "customer", "invoice", "payment", "account",
  "transaction", "inventory", "event", "order", "sale", "obligation",
]);
const ALIASES = { organization: "org", inventoryItem: "inventory" };

function prefixFor(kind) {
  const candidate = ALIASES[kind] || kind;
  return PREFIXES.has(candidate) ? candidate : "record";
}

export function createId(kind) {
  const prefix = prefixFor(kind);
  let raw;
  try {
    raw = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  } catch {
    raw = null;
  }
  if (!raw) {
    const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
    raw = `${Date.now().toString(16)}${random}`.padEnd(32, "0").slice(0, 32);
  }
  return `${prefix}_${raw.toLowerCase()}`;
}

export function isStandardId(value, kind) {
  const prefix = prefixFor(kind);
  return typeof value === "string" && new RegExp(`^${prefix}_[a-f0-9]{32}$`).test(value);
}
