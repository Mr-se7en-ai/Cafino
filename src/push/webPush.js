// اعلان وقتی برنامه بسته است (Web Push) — سمت برنامه.
// جریان: مجوز اعلان ← اشتراک مرورگر (PushManager) ← ثبت اشتراک روی سرویس اعلان ← ارسال برنامهٔ زمانی یادآورها.
// بعد از آن سرویس اعلان سر وقت، حتی با بسته‌بودن برنامه، پیام را می‌فرستد و service worker آن را نشان می‌دهد.
// نشانی سرویس و کلید عمومی فقط از config.js (تنظیم مدیر نصب) خوانده می‌شود؛ رابط کاربری گزینهٔ سرور ندارد.
import { getApiConfig } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { getReminders, occurrences } from "../app/domain/notes.js";

export const PUSH_STATE_KEY = "cafenet_push_state";
const DATA_EVENT = "cafenet:data";

const readState = () => { try { return JSON.parse(localStorage.getItem(PUSH_STATE_KEY) || "{}") || {}; } catch { return {}; } };
const writeState = (patch) => { try { localStorage.setItem(PUSH_STATE_KEY, JSON.stringify({ ...readState(), ...patch })); } catch { /* ignore */ } };
const clearState = () => { try { localStorage.removeItem(PUSH_STATE_KEY); } catch { /* ignore */ } };

export function pushConfig(env = globalThis) {
  const d = env.CAFINO_CONFIG && typeof env.CAFINO_CONFIG === "object" ? env.CAFINO_CONFIG : {};
  const base = String(d.pushUrl || getApiConfig().baseUrl || "").trim().replace(/\/+$/, "");
  return { base, publicKey: String(d.vapidPublicKey || "").trim(), sharedKey: String(d.pushKey || "").trim(), cafeId: String(d.cafeId || "") };
}

// دلیل ناممکن‌بودن را برمی‌گرداند (null = ممکن است)
export function pushUnavailableReason(env = globalThis) {
  if (isGuestMode()) return "guest";
  const nav = env.navigator;
  if (!nav || !("serviceWorker" in nav) || !("PushManager" in env) || !("Notification" in env)) return "unsupported";
  if (env.isSecureContext === false) return "insecure";
  if (!pushConfig(env).base) return "no-service";
  return null;
}
export const pushState = () => ({ ...readState(), permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported" });

export function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// فهرست زمان‌بندی برای سرور: فقط یادآورهای باز؛ هر کدام با چند نوبت آینده (تکراری‌ها)
export function buildSchedule(reminders = getReminders(), now = Date.now()) {
  return reminders
    .filter((r) => r && r.status !== "done" && r.title)
    .map((r) => ({ id: String(r.id), title: String(r.title), body: String(r.note || ""), fireAt: occurrences(r, now) }))
    .filter((r) => r.fireAt.length)
    .slice(0, 400);
}

async function call(path, body, cfg = pushConfig(), fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(cfg.base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(cfg.sharedKey ? { "x-push-key": cfg.sharedKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* بدنهٔ خالی */ }
  if (!res.ok) { const e = new Error(json?.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return json;
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg || (await navigator.serviceWorker.ready);
}
async function publicKey(cfg) { return cfg.publicKey || (await call("/api/push/public-key", undefined, cfg)).publicKey; }

async function subscribeBrowser(cfg) {
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(await publicKey(cfg)) });
  return sub;
}

export async function syncPush() {
  const st = readState();
  if (!st.enabled || pushUnavailableReason()) return { ok: false, skipped: true };
  const cfg = pushConfig();
  try {
    const sub = await subscribeBrowser(cfg);
    const json = sub.toJSON ? sub.toJSON() : sub;
    if (st.endpoint !== json.endpoint || !st.registeredAt) {
      await call("/api/push/subscribe", { subscription: json, cafeId: cfg.cafeId, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }, cfg);
      writeState({ endpoint: json.endpoint, registeredAt: Date.now() });
    }
    const schedule = buildSchedule();
    try { await call("/api/push/reminders", { endpoint: json.endpoint, reminders: schedule }, cfg); }
    catch (e) {
      if (e.status === 404) { await call("/api/push/subscribe", { subscription: json, cafeId: cfg.cafeId }, cfg); await call("/api/push/reminders", { endpoint: json.endpoint, reminders: schedule }, cfg); }   // سرور اشتراک را فراموش کرده
      else throw e;
    }
    writeState({ lastSyncAt: Date.now(), lastError: "", count: schedule.length });
    return { ok: true, count: schedule.length };
  } catch (e) {
    writeState({ lastError: String(e?.message || e).slice(0, 200) });
    return { ok: false, error: e };
  }
}

export async function enablePush() {
  const why = pushUnavailableReason();
  if (why) return { ok: false, reason: why };
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };
  writeState({ enabled: true, registeredAt: 0, lastError: "" });
  const r = await syncPush();
  if (!r.ok) { writeState({ enabled: false }); return { ok: false, reason: "service", error: r.error }; }
  return { ok: true };
}

export async function disablePush() {
  const st = readState();
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { try { await call("/api/push/unsubscribe", { endpoint: sub.endpoint }); } catch { /* سرور در دسترس نیست؛ اشتراک محلی هر حال حذف می‌شود */ } await sub.unsubscribe(); }
  } catch { /* ignore */ }
  clearState();
  return { ok: true, was: !!st.enabled };
}

export async function sendTestPush() {
  const st = readState();
  if (!st.enabled || !st.endpoint) return { ok: false };
  try { await call("/api/push/test", { endpoint: st.endpoint }); return { ok: true }; } catch (e) { return { ok: false, error: e }; }
}

// راه‌اندازی در MainApp: همگام‌سازی هنگام شروع، تغییر داده‌ها (با تأخیر)، برگشتن اینترنت و باز شدن دوبارهٔ صفحه
export function startPushSync() {
  if (typeof window === "undefined") return () => {};
  let timer = null;
  const later = (ms = 2500) => { clearTimeout(timer); timer = setTimeout(() => { if (readState().enabled) syncPush(); }, ms); };
  const onVis = () => { if (document.visibilityState === "visible") later(800); };
  const onData = () => later();
  const onOnline = () => later(500);
  window.addEventListener(DATA_EVENT, onData);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVis);
  later(1500);
  const iv = setInterval(() => later(0), 30 * 60 * 1000);       // نوبت‌های تکرارشونده را تازه می‌کند
  return () => { clearTimeout(timer); clearInterval(iv); window.removeEventListener(DATA_EVENT, onData); window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVis); };
}
