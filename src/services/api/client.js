import { readTenantScope } from "../../data/tenantScope.js";
import { AppError } from "../../core/errors.js";
import { getAuthToken, getAuthenticatedUser, setAuthSession } from "../auth/session.js";
import { isGuestMode } from "../../guest/guestMode.js";

export const API_CONFIG_KEY = "cafenet_api_config";

export function getApiConfig(storage = globalThis.localStorage) {
  if (isGuestMode()) return { baseUrl: "", cafeId: "" };   // حالت مهمان هرگز با سرور حرف نمی‌زند
  // اولویت: config.js کنار برنامه (تنظیم مدیر استقرار) ← مقدار ذخیره‌شدهٔ قبلی ← مقدار زمان بیلد. رابط کاربری دیگر این را تنظیم نمی‌کند.
  const deploy = globalThis.CAFINO_CONFIG && typeof globalThis.CAFINO_CONFIG === "object" ? globalThis.CAFINO_CONFIG : {};
  // "same-origin" (یا "auto"): برنامه و API پشت یک دامنه‌اند (nginx) → نشانی همان مبدأ صفحه. در file:// معنایی ندارد (خالی می‌شود).
  const rawDeploy = String(deploy.apiBaseUrl || "").trim();
  const origin = String(globalThis.location?.origin || "");
  const deployUrl = (/^(same-origin|auto)$/i.test(rawDeploy) ? (/^https?:\/\//.test(origin) ? origin : "") : rawDeploy).replace(/\/+$/, "");
  const defaultBaseUrl = deployUrl || import.meta.env?.VITE_API_BASE_URL || (import.meta.env?.PROD ? globalThis.location?.origin || "" : "");
  const fallback = { baseUrl: defaultBaseUrl, cafeId: String(deploy.cafeId || "") };
  try {
    const saved = JSON.parse(storage?.getItem(API_CONFIG_KEY) || "{}");
    if (deployUrl) return { baseUrl: deployUrl, cafeId: String(deploy.cafeId || saved.cafeId || "").trim() };
    if (Object.prototype.hasOwnProperty.call(saved, "token")) {
      storage?.setItem(API_CONFIG_KEY, JSON.stringify({ baseUrl: saved.baseUrl || "", cafeId: saved.cafeId || "" }));
    }
    return { baseUrl: String(saved.baseUrl || fallback.baseUrl).trim().replace(/\/+$/, ""), cafeId: String(saved.cafeId || "").trim() };
  } catch {
    return fallback;
  }
}

export function saveApiConfig(config, storage = globalThis.localStorage) {
  try {
    storage?.setItem(API_CONFIG_KEY, JSON.stringify({
      baseUrl: String(config?.baseUrl || "").trim().replace(/\/+$/, ""),
      cafeId: String(config?.cafeId || "").trim(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function isApiConnected() {
  const config = getApiConfig();
  return Boolean(config.baseUrl);
}

export class ApiError extends AppError {
  constructor(status, payload = {}) {
    const body = payload?.error && typeof payload.error === "object" ? payload.error : payload;
    const message = body?.message || (typeof payload?.error === "string" ? payload.error : "") || `API request failed (${status})`;
    super(body?.code || `http_${status}`, message, { status, details: body?.details });
    this.name = "ApiError";
    this.status = status;
  }
}

// Global hook for diagnostics: every failed request is reported once (network errors included).
const apiErrorListeners = new Set();
export function onApiError(listener) { apiErrorListeners.add(listener); return () => apiErrorListeners.delete(listener); }
const notifyApiError = (error, info) => { apiErrorListeners.forEach(fn => { try { fn(error, info); } catch {} }); };

export const DEFAULT_REQUEST_TIMEOUT_MS = 20000;

export function createApiClient({ getConfig = getApiConfig, fetchImpl = globalThis.fetch, getScope = readTenantScope, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  // توکن دسترسی کوتاه‌عمر است. با ۴۰۱ یک بار (هم‌زمان‌ها یک بار) با کوکی refresh نشست را تازه می‌کنیم و همان درخواست را تکرار می‌کنیم؛
  // اگر refresh هم رد شد، همان ۴۰۱ به صف همگام‌سازی/صفحهٔ ورود می‌رسد.
  let refreshing = null;
  const refreshSession = () => (refreshing ||= (async () => {
    try {
      const base = getConfig()?.baseUrl; if (!base) return false;
      const res = await fetchImpl(`${base.replace(/\/+$/, "")}/api/auth/refresh`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "include", body: "{}" });
      if (!res.ok) return false;
      const payload = await res.json().catch(() => null);
      const data = payload?.data || payload;
      if (!data?.accessToken) return false;
      setAuthSession(payload);
      return true;
    } catch { return false; }
    finally { setTimeout(() => { refreshing = null; }, 0); }
  })());
  const client = {
    async request(path, options = {}) {
      try { return await client.requestRaw(path, options); }
      catch (error) { notifyApiError(error, { path, method: options.method || "GET" }); throw error; }
    },
    async requestRaw(path, { method = "GET", body, headers = {}, signal, rawEnvelope = false, _retried = false } = {}) {
      const config = getConfig();
      if (!config?.baseUrl) throw new AppError("api_not_configured", "API base URL is not configured");
      // These client-supplied scope headers are hints for routing only. The
      // backend must derive authorized organization/branch membership from
      // the authenticated session and reject any forged or out-of-scope ID.
      const scope = getScope?.() || {};
      const requestHeaders = {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        ...(scope.organizationId ? { "X-Organization-Id": scope.organizationId } : {}),
        ...(scope.branchId ? { "X-Branch-Id": scope.branchId } : {}),
        ...(config.cafeId ? { "X-Cafe-Id": config.cafeId } : {}),
        ...headers,
      };
      // A hung connection (captive portal, half-open Wi-Fi) must fail in bounded time so the offline queue can retry.
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let timedOut = false;
      const timer = controller && timeoutMs > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
      if (signal && controller) { if (signal.aborted) controller.abort(); else signal.addEventListener?.("abort", () => controller.abort(), { once: true }); }
      let response;
      try {
        response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}${path}`, {
          method, headers: requestHeaders, credentials: "include",
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          ...(controller ? { signal: controller.signal } : signal ? { signal } : {}),
        });
      } catch (cause) {
        if (signal?.aborted) throw cause; // caller cancelled on purpose
        const code = timedOut ? "timeout" : "network_error";
        throw new ApiError(0, { error: { code, message: timedOut ? "Request timed out" : "Network request failed" } });
      } finally { if (timer) clearTimeout(timer); }
      if (response.status === 204) return null;
      let payload = null;
      try { payload = await response.json(); } catch {}
      if (response.status === 401 && !_retried && !path.startsWith("/api/auth/") && (getAuthToken() || getAuthenticatedUser()) && await refreshSession()) {
        return client.requestRaw(path, { method, body, headers, signal, rawEnvelope, _retried: true });
      }
      if (!response.ok) {
        const error = new ApiError(response.status, payload || {});
        const retryAfter = Number(response.headers?.get?.("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = Math.min(retryAfter, 3600) * 1000;
        throw error;
      }
      if (rawEnvelope) return payload;
      // Accept both the legacy raw response and the standard { data, meta } envelope.
      return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
    },
  };
  return client;
}

export function createApiResources(client) {
  const collection = path => ({
    list: (query = {}) => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
      });
      const queryString = params.toString();
      const suffix = queryString ? `?${queryString}` : "";
      return client.request(`${path}${suffix}`);
    },
    listPage: async (query = {}) => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
      });
      const suffix = params.toString() ? `?${params}` : "";
      return client.request(`${path}${suffix}`, { rawEnvelope: true });
    },
    listAll: async (query = {}) => {
      // سرور 1.75+: صفحه‌بندی کلیدی (cursor) — هزینهٔ هر صفحه به عمق بستگی ندارد و با تغییر هم‌زمان داده ردیفی جا نمی‌افتد.
      // سرور قدیمی meta.hasMore را برنمی‌گرداند → همان صفحه‌بندی OFFSET قبلی.
      const rows = [], pageSize = query.limit || 200;
      let offset = Number(query.offset) || 0, cursor = "";
      while (true) {
        const page = await collection(path).listPage({ ...query, limit: pageSize, ...(cursor ? { cursor } : { offset }), count: "false" });
        if (Array.isArray(page)) return page;
        const data = Array.isArray(page?.data) ? page.data : [];
        rows.push(...data);
        if (typeof page?.meta?.hasMore === "boolean") {
          if (!page.meta.hasMore || !page.meta.nextCursor) break;
          cursor = page.meta.nextCursor; continue;
        }
        if (data.length < pageSize) break;
        offset += data.length;
      }
      return rows;
    },
    get: id => client.request(`${path}/${encodeURIComponent(id)}`),
    create: (payload, { idempotencyKey } = {}) => client.request(path, { method: "POST", body: payload, ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}) }),
    update: (id, payload) => client.request(`${path}/${encodeURIComponent(id)}`, { method: "PATCH", body: payload }),
    remove: id => client.request(`${path}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  });

  return {
    auth: {
      login: payload => client.request("/api/auth/login", { method: "POST", body: payload }),
      // کپچای ورود: سرور فقط بعد از چند شکست آن را می‌خواهد ({id, image: data-URI, expiresIn}); هر چالش یک‌بارمصرف است
      captcha: () => client.request("/api/auth/captcha"),
      register: payload => client.request("/api/auth/register", { method: "POST", body: payload }),
      refresh: payload => client.request("/api/auth/refresh", { method: "POST", body: payload }),
      logout: () => client.request("/api/auth/logout", { method: "POST" }),
      me: () => client.request("/api/auth/me"),
      changePassword: payload => client.request("/api/auth/password", { method: "POST", body: payload }),
      // «فراموشی رمز»: the server e-mails a one-time link/code (always answers 202 — it never reveals whether the e-mail exists)
      forgotPassword: payload => client.request("/api/auth/forgot-password", { method: "POST", body: payload }),
      resetPassword: payload => client.request("/api/auth/reset-password", { method: "POST", body: payload }),
      // ورود/ثبت‌نام با کد پیامکی (ملی پیامک): config → کدام گزینه‌ها فعال است؛ send با کپچا؛ phone* برای تأیید شمارهٔ حساب واردشده
      smsConfig: () => client.request("/api/auth/sms/config"),
      smsSend: payload => client.request("/api/auth/sms/send", { method: "POST", body: payload }),
      smsLogin: payload => client.request("/api/auth/sms/login", { method: "POST", body: payload }),
      phoneSend: payload => client.request("/api/auth/phone/send", { method: "POST", body: payload }),
      phoneVerify: payload => client.request("/api/auth/phone/verify", { method: "POST", body: payload }),
    },
    users: collection("/api/users"),
    customers: collection("/api/customers"),
    invoices: collection("/api/invoices"),
    payments: collection("/api/payments"),
    accounts: collection("/api/accounts"),
    transactions: collection("/api/transactions"),
    expenses: collection("/api/expenses"),
    inventory: collection("/api/inventory"),
    inventoryMovements: collection("/api/inventory-movements"),
    obligations: collection("/api/obligations"),
    reports: collection("/api/reports"),
    settings: collection("/api/settings"),
    orders: collection("/api/orders"),
  };
}

const defaultClient = createApiClient();
export const apiResources = createApiResources(defaultClient);
export const apiRequest = (path, options) => defaultClient.request(path, options);
export async function apiPushSilent(path, options) {
  if (!getApiConfig().baseUrl) return null;
  try { return await apiRequest(path, options); } catch { return null; }
}
