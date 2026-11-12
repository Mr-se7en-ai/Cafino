import { createErrorLog } from "./errorLog.js";
import { installGlobalErrorHandlers } from "./globalHandlers.js";
import { onApiError } from "../services/api/client.js";
import { classifyError } from "./errorLog.js";

export { errorIdFor, scrub, classifyError, normalizeError, ERROR_LOG_KEY } from "./errorLog.js";

let appVersion = "";
export const setDiagnosticsVersion = (v) => { appVersion = String(v || ""); };

// One shared log for the whole app (React tree, window handlers, API client, sync engine).
export const errorLog = createErrorLog({
  env: () => ({ v: appVersion, online: typeof navigator === "undefined" ? undefined : navigator.onLine, page: typeof location === "undefined" ? undefined : (location.hash || "").slice(0, 40) }),
});

export function reportError(error, source = "app", context = {}) {
  try { return errorLog.record(error, { source, context }); } catch { return null; }
}

export function installDiagnostics(version) {
  setDiagnosticsVersion(version);
  const off = installGlobalErrorHandlers({ log: errorLog });
  // API errors: offline / timeouts are expected (the sync queue handles them) and are not logged; auth expiry is a normal
  // lifecycle event; everything else (4xx validation, 5xx) is logged with the request path so it can be traced by Error ID.
  const offApi = onApiError((error, info) => {
    const k = classifyError(error).kind;
    if (k === "offline" || k === "timeout" || k === "auth") return;
    try { errorLog.record(error, { source: "api", context: { path: String(info?.path || "").split("?")[0], method: info?.method }, severity: k === "server" ? "error" : "warn" }); } catch { /* never throw from diagnostics */ }
  });
  return () => { off(); offApi(); };
}
