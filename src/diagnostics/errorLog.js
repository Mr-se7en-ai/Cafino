// Production-grade error reporting core: stable Error IDs, a bounded persistent log and secret scrubbing.
// Pure module (storage and clock are injected) so it is unit-testable and has no React / DOM dependency.

export const ERROR_LOG_KEY = "cafenet_error_log";
export const MAX_LOG_ENTRIES = 100;
const MAX_STACK = 2500;
const MAX_MESSAGE = 600;

// Removes credentials that must never be written to a log / copied to a support message.
export function scrub(text) {
  return String(text ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer ***")
    .replace(/("?(?:password|passwd|pass|token|accessToken|refreshToken|apiKey|api_key|secret|authorization|key)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi, '$1"***"')
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{10,}/g, "$1-***")
    .replace(/\b09\d{9}\b/g, (m) => m.slice(0, 4) + "***" + m.slice(-2));
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function firstFrame(stack) {
  const lines = String(stack || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const frame = lines.find((l) => /^at\s|@/.test(l));
  if (!frame) return "";
  // keep only the function name: file names / line numbers change on every build, the function does not
  const m = frame.match(/^at\s+(?:async\s+)?([^\s(]+)/) || frame.match(/^([^@\s]+)@/);
  return m ? m[1].replace(/^Object\./, "") : "";
}

// Same bug → same ID (numbers / hex ids in the message are normalised away), so "CF-8A31" can be searched in the log.
export function errorIdFor(error, source = "app") {
  const e = normalizeError(error);
  const msg = e.message.replace(/\d+/g, "#").replace(/[a-f0-9]{16,}/gi, "?");
  const h = fnv1a(`${source}|${e.name}|${msg}|${firstFrame(e.stack)}`);
  return "CF-" + (h & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

export function normalizeError(error) {
  if (error && typeof error === "object" && (error.message !== undefined || error.stack !== undefined || error.name !== undefined)) {
    return { name: String(error.name || "Error"), message: String(error.message ?? ""), stack: String(error.stack || ""), code: error.code, status: error.status };
  }
  const text = typeof error === "string" ? error : (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
  return { name: "NonError", message: String(text ?? ""), stack: "", code: undefined, status: undefined };
}

export function createErrorLog({ storage = globalThis.localStorage, key = ERROR_LOG_KEY, max = MAX_LOG_ENTRIES, now = () => Date.now(), env = () => ({}) } = {}) {
  const listeners = new Set();
  let memory = null; // fallback when storage is unavailable / full

  function read() {
    if (memory) return memory;
    try {
      const v = JSON.parse(storage?.getItem(key) || "[]");
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }
  function write(rows) {
    try { storage.setItem(key, JSON.stringify(rows)); memory = null; }
    catch {
      // quota: drop the oldest half and retry once, then fall back to memory so reporting never throws
      try { const trimmed = rows.slice(0, Math.max(5, Math.floor(rows.length / 2))); storage.setItem(key, JSON.stringify(trimmed)); memory = null; }
      catch { memory = rows.slice(0, 30); }
    }
  }
  const emit = (entry) => { listeners.forEach((fn) => { try { fn(entry); } catch { /* listener errors must not recurse */ } }); };

  return {
    record(error, { source = "app", context = {}, severity = "error" } = {}) {
      const e = normalizeError(error);
      const id = errorIdFor(error, source);
      const t = now();
      const rows = read();
      const idx = rows.findIndex((r) => r.id === id);
      const occurrence = { at: t, ...env() };
      let entry;
      if (idx >= 0) {
        entry = { ...rows[idx], count: (rows[idx].count || 1) + 1, last: t, severity, context: { ...(rows[idx].context || {}), ...scrubObject(context) }, occurrences: [occurrence, ...(rows[idx].occurrences || [])].slice(0, 5) };
        rows.splice(idx, 1);
      } else {
        entry = {
          id, source, severity, name: e.name, message: scrub(e.message).slice(0, MAX_MESSAGE), stack: scrub(e.stack).slice(0, MAX_STACK),
          code: e.code, status: e.status, count: 1, first: t, last: t, context: scrubObject(context), occurrences: [occurrence],
        };
      }
      rows.unshift(entry);
      write(rows.slice(0, max));
      emit(entry);
      return entry;
    },
    list() { return read(); },
    find(id) { const q = String(id || "").trim().toUpperCase().replace(/^#/, ""); return read().find((r) => r.id === q || r.id === `CF-${q}`) || null; },
    clear() { memory = null; try { storage.removeItem(key); } catch { /* ignore */ } },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    format(entry, extra = {}) {
      if (!entry) return "";
      const fmt = (ts) => { try { return new Date(ts).toISOString(); } catch { return String(ts); } };
      return [
        `Error ID: ${entry.id}`, `Source: ${entry.source}  Severity: ${entry.severity}`, `Count: ${entry.count}`, `First: ${fmt(entry.first)}`, `Last: ${fmt(entry.last)}`,
        entry.code ? `Code: ${entry.code}` : "", entry.status ? `HTTP: ${entry.status}` : "",
        `Message: ${entry.name}: ${entry.message}`,
        Object.keys(entry.context || {}).length ? `Context: ${JSON.stringify(entry.context)}` : "",
        ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
        entry.stack ? `\n${entry.stack}` : "",
      ].filter(Boolean).join("\n");
    },
  };
}

function scrubObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" ? scrub(v).slice(0, 300) : (typeof v === "number" || typeof v === "boolean" || v === null) ? v : scrub((() => { try { return JSON.stringify(v); } catch { return String(v); } })()).slice(0, 300);
  }
  return out;
}

// ── error classification (API / network / app) → Persian, human message + retry hint ──
export function classifyError(error) {
  const e = normalizeError(error);
  const status = Number(e.status) || 0;
  const code = String(e.code || "");
  if (code === "network_error" || (e.name === "TypeError" && /fetch|network|load failed/i.test(e.message))) return { kind: "offline", retryable: true, fa: "ارتباط با سرور برقرار نشد (اینترنت یا سرور در دسترس نیست)." };
  if (code === "timeout" || e.name === "AbortError") return { kind: "timeout", retryable: true, fa: "سرور در مهلت مقرر پاسخ نداد." };
  if (status === 401) return { kind: "auth", retryable: false, fa: "نشست شما منقضی شده است؛ دوباره وارد شوید." };
  if (status === 403) return { kind: "forbidden", retryable: false, fa: "دسترسی لازم برای این عملیات را ندارید." };
  if (status === 404) return { kind: "notfound", retryable: false, fa: "مورد درخواستی روی سرور پیدا نشد." };
  if (status === 408 || status === 425 || status === 429) return { kind: "throttled", retryable: true, fa: "سرور موقتاً مشغول است؛ بعداً دوباره تلاش می‌شود." };
  if (status === 409) return { kind: "conflict", retryable: false, fa: "این مورد روی سرور تغییر کرده یا تکراری است." };
  if (status === 400 || status === 422) return { kind: "validation", retryable: false, fa: "سرور اطلاعات ارسالی را نپذیرفت (داده نامعتبر)." };
  if (status >= 500) return { kind: "server", retryable: true, fa: "خطای داخلی سرور؛ بعداً دوباره تلاش می‌شود." };
  return { kind: "unknown", retryable: false, fa: "خطای ناشناخته." };
}
