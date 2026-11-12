// Authentication material is memory-only. Prefer an HttpOnly server cookie;
// this access token is only used when the API explicitly returns one.
let accessToken = "";
let authenticatedUser = null;

export function setAuthSession(payload = {}) {
  const data = payload?.data || payload;
  accessToken = String(data?.accessToken || data?.token || "");
  authenticatedUser = data?.user || data?.profile || null;
  return authenticatedUser;
}

export function setAuthenticatedUser(user) {
  authenticatedUser = user || null;
  return authenticatedUser;
}

export function getAuthToken() { return accessToken; }
export function getAuthenticatedUser() { return authenticatedUser; }

export function clearAuthSession() {
  accessToken = "";
  authenticatedUser = null;
}

export function discardLegacyLocalCredentials(storage = globalThis.localStorage) {
  try { storage?.removeItem("cafenet_users"); storage?.removeItem("cafenet_session"); } catch {}
}

export function normalizeAuthUser(value) {
  const user = value?.user || value?.profile || value;
  if (!user || typeof user !== "object") return null;
  return {
    ...user,
    id: user.id || user.userId || user.email || null,
    email: String(user.email || "").trim().toLowerCase(),
    organizationId: user.organizationId || user.organization?.id || null,
    branchId: user.branchId || user.branch?.id || null,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

// مجوزهای مؤثر ریزدانهٔ سرور (user.grants، مثلاً "payment.void"). null = نامعلوم (سرور قدیمی/آفلاین) ⇒ UI چیزی را مسدود نمی‌کند؛
// اعمال واقعی همیشه سمت سرور است و این فقط برای پیام روشن پیش از ثبت تغییری است که سرور رد می‌کرد.
export function serverGrant(key, user = authenticatedUser) {
  if (!user || !Array.isArray(user.grants)) return null;
  if (user.isOwner === true || user.role === "owner") return true;
  return user.grants.includes(key);
}

// UI-only capability helper. The API must enforce every permission on writes
// and sensitive reads; hiding a control in React is never authorization.
export function hasUiPermission(permission, user = authenticatedUser) {
  if (!user || !permission) return false;
  if (user.isOwner === true || user.role === "owner" || user.role === "admin") return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}
