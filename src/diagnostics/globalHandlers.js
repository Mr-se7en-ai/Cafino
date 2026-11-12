// Installs window-level handlers (uncaught errors, unhandled promise rejections, offline/online) that feed the error log.
// Non-fatal errors never take the UI down; they raise a `cafenet:error` event the app shows as a small toast.

const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection captured/i];

export function installGlobalErrorHandlers({ log, win = globalThis.window, throttleMs = 4000, now = () => Date.now() } = {}) {
  if (!win || !log) return () => {};
  const recent = new Map();
  const report = (error, source, context) => {
    const msg = String(error?.message ?? error ?? "");
    if (IGNORED.some((re) => re.test(msg))) return null;
    const entry = log.record(error, { source, context });
    const t = now();
    if (!recent.has(entry.id) || t - recent.get(entry.id) > throttleMs) {
      recent.set(entry.id, t);
      try { win.dispatchEvent(new CustomEvent("cafenet:error", { detail: { id: entry.id, message: entry.message, source } })); } catch { /* ignore */ }
    }
    return entry;
  };
  const onError = (ev) => report(ev?.error || ev?.message || "window.onerror", "window", { file: ev?.filename ? String(ev.filename).split("/").pop() : undefined, line: ev?.lineno });
  const onRejection = (ev) => report(ev?.reason ?? "unhandledrejection", "promise", {});
  win.addEventListener("error", onError);
  win.addEventListener("unhandledrejection", onRejection);
  return () => { win.removeEventListener("error", onError); win.removeEventListener("unhandledrejection", onRejection); };
}
