// "Offline-first" identity for server mode.
//
// The access token lives in memory only, so after the app is closed and re-opened WITHOUT internet the server cannot confirm
// who is signed in. Instead of throwing the cashier back to a login form that needs the server, the last server-verified
// profile (never a token or a password) is remembered for a limited time and used to keep working locally.
// Everything done meanwhile goes through the offline queue; once the connection returns the identity is re-verified, and a real
// 401 from the server ends the session immediately.

export const OFFLINE_USER_KEY = "cafenet_offline_user";
// How long the app may keep working WITHOUT the server confirming the user (measured from the last successful /auth/me).
// The server sends the allowed time in user.offlinePolicy.maxAgeSec (OFFLINE_SESSION_MAX_AGE_OWNER_SEC / _STAFF_SEC);
// when it does not (old server), these role-based defaults apply. Never 7 days any more: owner 24 h, everybody else 8 h.
export const OFFLINE_OWNER_MAX_AGE_MS = 24 * 3600 * 1000;
export const OFFLINE_STAFF_MAX_AGE_MS = 8 * 3600 * 1000;
export const OFFLINE_MAX_AGE_MS = OFFLINE_STAFF_MAX_AGE_MS;           // kept as the strictest default for callers that pass no user
const MIN_MAX_AGE_MS = 5 * 60 * 1000, ABSOLUTE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
export const isOwnerLike = (u) => !!u && (u.isOwner === true || u.role === "owner" || u.role === "platform_admin");
export const defaultMaxAgeMs = (u) => (isOwnerLike(u) ? OFFLINE_OWNER_MAX_AGE_MS : OFFLINE_STAFF_MAX_AGE_MS);
export function policyMaxAgeMs(user) {
  const sec = Number(user && user.offlinePolicy && user.offlinePolicy.maxAgeSec);
  if (Number.isFinite(sec) && sec > 0) return Math.min(ABSOLUTE_MAX_AGE_MS, Math.max(MIN_MAX_AGE_MS, sec * 1000));
  return defaultMaxAgeMs(user);
}

// Process-wide flag: the app is currently running on a remembered identity (server could not confirm it). Sensitive financial
// operations check it (and navigator.onLine) and refuse to run — see src/audit/ReasonDialog.jsx `online: true`.
let offlineActive = false;
export const setOfflineActive = (v) => { offlineActive = !!v; };
export function isOfflineNow() {
  return offlineActive || (typeof navigator !== "undefined" && navigator.onLine === false);
}

const PROFILE_FIELDS = ["id", "email", "firstName", "lastName", "name", "phone", "role", "isOwner", "organizationId", "branchId", "permissions", "grants", "offlinePolicy"];
const store = (s) => (s === undefined ? globalThis.localStorage : s);

export function rememberVerifiedUser(user, { storage, now = Date.now() } = {}) {
  try {
    if (!user || typeof user !== "object" || !(user.id || user.email)) return false;
    const profile = {};
    for (const k of PROFILE_FIELDS) if (user[k] !== undefined) profile[k] = user[k];
    store(storage).setItem(OFFLINE_USER_KEY, JSON.stringify({ user: profile, verifiedAt: now, maxAgeMs: policyMaxAgeMs(user) }));
    return true;
  } catch { return false; }
}

export function loadOfflineUser({ storage, now = Date.now(), maxAgeMs } = {}) {
  try {
    const rec = JSON.parse(store(storage).getItem(OFFLINE_USER_KEY) || "null");
    if (!rec || !rec.user || !(rec.user.id || rec.user.email)) return null;
    // the stored limit can only shorten the role default's ceiling of 30 days; a tampered record cannot grant more than the absolute cap
    const limit = maxAgeMs ?? (Number.isFinite(rec.maxAgeMs) ? Math.min(ABSOLUTE_MAX_AGE_MS, Math.max(MIN_MAX_AGE_MS, rec.maxAgeMs)) : defaultMaxAgeMs(rec.user));
    if (!Number.isFinite(rec.verifiedAt) || now - rec.verifiedAt > limit || rec.verifiedAt > now + 60000) return null;
    return { ...rec.user, offline: true, verifiedAt: rec.verifiedAt, expiresAt: rec.verifiedAt + limit };
  } catch { return null; }
}

export function forgetOfflineUser({ storage } = {}) {
  try { store(storage).removeItem(OFFLINE_USER_KEY); } catch { /* ignore */ }
  offlineActive = false;
}

// Decides what to do when GET /auth/me failed.  "auth" = the server answered and said no → sign out.
// Anything else (no network, timeout, server down) → keep working offline if a recent verified identity exists.
export function decideAfterMeFailure(error, { storage, now } = {}) {
  const status = Number(error?.status) || 0;
  if (status === 401 || status === 403) return { action: "signout" };
  const user = loadOfflineUser({ storage, now });
  return user ? { action: "offline", user } : { action: "signout" };
}
