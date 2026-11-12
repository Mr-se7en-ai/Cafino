import test from "node:test";
import assert from "node:assert/strict";
import { createErrorLog, errorIdFor, scrub, classifyError } from "../diagnostics/errorLog.js";
import { installGlobalErrorHandlers } from "../diagnostics/globalHandlers.js";
import { ApiError } from "../services/api/client.js";

class Mem { d = new Map(); getItem(k) { return this.d.has(k) ? this.d.get(k) : null; } setItem(k, v) { this.d.set(k, String(v)); } removeItem(k) { this.d.delete(k); } }

test("error ids are stable CF-XXXX fingerprints: same bug → same id, ignoring numbers and ids in the message", () => {
  const a = errorIdFor(new TypeError("Cannot read properties of undefined (reading 'x') at row 12"), "react");
  const b = errorIdFor(new TypeError("Cannot read properties of undefined (reading 'x') at row 98"), "react");
  const c = errorIdFor(new TypeError("Something else"), "react");
  assert.match(a, /^CF-[0-9A-F]{4}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, errorIdFor(new TypeError("Cannot read properties of undefined (reading 'x') at row 12"), "api"), "source is part of the fingerprint");
});

test("log dedupes by id, counts occurrences, is bounded and searchable by id", () => {
  let t = 1000; const log = createErrorLog({ storage: new Mem(), now: () => t++, max: 3, env: () => ({ v: "9" }) });
  const e1 = log.record(new Error("boom 1"), { source: "x", context: { page: "dash" } });
  const e2 = log.record(new Error("boom 2"), { source: "x" });
  assert.equal(e1.id, e2.id); assert.equal(log.list().length, 1); assert.equal(log.list()[0].count, 2);
  assert.equal(log.find(e1.id.slice(3)).id, e1.id); assert.equal(log.find("#" + e1.id.toLowerCase()).id, e1.id);
  ["a", "b", "c", "d"].forEach((m) => log.record(new Error(m + "-unique-" + m), { source: m }));
  assert.equal(log.list().length, 3, "bounded");
  assert.match(log.format(log.list()[0]), /Error ID: CF-/);
});

test("secrets are scrubbed from messages, stacks and context before being stored", () => {
  const log = createErrorLog({ storage: new Mem() });
  const e = log.record(new Error('failed: Authorization: Bearer abcdefghijklmnop1234 {"password":"hunter2","apiKey":"sk-abcdefghijk12345"} phone 09121234567'), { context: { token: "token=zzz", note: "Bearer qwertyuiop12345" } });
  const dump = JSON.stringify(e);
  assert.ok(!/hunter2|abcdefghijklmnop1234|sk-abcdefghijk12345|09121234567|qwertyuiop12345/.test(dump), dump);
  assert.equal(scrub("x 09121234567 y"), "x 0912***67 y");
});

test("storage failures never throw (quota → trimmed → memory fallback)", () => {
  const storage = { getItem: () => null, setItem() { throw new Error("quota"); }, removeItem() {} };
  const log = createErrorLog({ storage });
  assert.doesNotThrow(() => log.record(new Error("q")));
  assert.equal(log.list().length, 1);
});

test("classification drives user messages and retry decisions", () => {
  assert.equal(classifyError(new ApiError(0, { error: { code: "network_error", message: "x" } })).kind, "offline");
  assert.equal(classifyError(new ApiError(0, { error: { code: "timeout", message: "x" } })).kind, "timeout");
  assert.equal(classifyError(new ApiError(401, {})).kind, "auth");
  assert.equal(classifyError(new ApiError(422, {})).retryable, false);
  assert.equal(classifyError(new ApiError(503, {})).retryable, true);
  assert.equal(classifyError(new ApiError(429, {})).retryable, true);
  assert.equal(classifyError(new TypeError("Failed to fetch")).kind, "offline");
});

test("global handlers log uncaught errors / rejections, ignore benign noise and throttle the toast event", () => {
  const listeners = {}; const events = [];
  const win = { addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener() {}, dispatchEvent: (e) => { events.push(e.detail); return true; } };
  globalThis.CustomEvent ??= class { constructor(n, o) { this.type = n; this.detail = o?.detail; } };
  let t = 0; const log = createErrorLog({ storage: new Mem() });
  installGlobalErrorHandlers({ log, win, now: () => t, throttleMs: 4000 });
  listeners.error({ error: new Error("bad thing"), filename: "http://x/app.js", lineno: 3 });
  listeners.error({ message: "ResizeObserver loop completed with undelivered notifications." });
  listeners.unhandledrejection({ reason: new Error("async bad") });
  t += 10; listeners.error({ error: new Error("bad thing") });
  assert.equal(log.list().length, 2);
  assert.equal(events.length, 2, "second identical error inside the throttle window does not toast again");
  assert.match(events[0].id, /^CF-/);
});
