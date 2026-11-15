// مینی‌اپ ↔ سفارش‌های برنامه (1.81). سفارش‌ها در خود برنامه (محلی) نگه‌داری می‌شوند و سرور فقط آینهٔ آن‌ها را دارد؛
// پس تغییر وضعیتی که کافی‌نت‌دار در مینی‌اپ می‌زند در «صف» روی سرور می‌ماند و همین‌جا — وقتی برنامه باز و آنلاین است —
// روی سفارش محلی اعمال، به همگام‌سازی معمول سپرده و تأیید (ack) می‌شود. منطق خالص و قابل‌آزمون اینجاست؛ اتصال به ذخیره‌سازی در miniappWire.
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { miniapp } from "./miniappApi.js";

export const ORDER_STATUS_KEYS = ["new", "inprogress", "waiting_docs", "completed", "delivered"];
/** ثانیه‌های باقی‌ماندهٔ کد اتصال (۰ = منقضی/نامعتبر). */
export function secondsLeft(expiresAt, now = Date.now()) { const t = Date.parse(expiresAt); return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : 0; }
const same = (o, id) => String(o?.id) === String(id) || (o?.serverId != null && String(o.serverId) === String(id));

/** برنامهٔ اعمال: برای هر اقدام، سفارش محلی را می‌یابد. بی‌اثر (هم‌وضعیت) هم «applied» است؛ سفارش ناموجود «notFound». */
export function planOrderActions(actions, orders) {
  const list = Array.isArray(orders) ? orders : [];
  const updates = [], applied = [], notFound = [], seen = new Set();
  for (const a of Array.isArray(actions) ? actions : []) {
    if (!a || typeof a.id !== "string" || !ORDER_STATUS_KEYS.includes(a.status)) continue;
    const o = list.find((x) => same(x, a.orderId));
    if (!o) { notFound.push(a.id); continue; }
    applied.push(a.id);
    const key = String(o.id);
    if (o.status !== a.status && !seen.has(key)) { seen.add(key); updates.push({ order: o, status: a.status, by: a.by || "" }); }
  }
  return { updates, applied, notFound };
}

/** سفارش محلی از «درخواست مشتری»؛ فقط اگر مشتری در برنامه شناخته شود. */
export function buildOrderFromRequest(req, { customers, id, today }) {
  const c = (Array.isArray(customers) ? customers : []).find((x) => req?.customerId && String(x.id) === String(req.customerId));
  if (!c) return null;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const note = [req.note, "(درخواست از مینی‌اپ تلگرام)"].filter(Boolean).join(" — ");
  return { id, customerId: String(c.id), customerName: name, title: String(req.service || "سفارش").slice(0, 120), notes: note, amount: 0, status: "new", createdAt: today, source: "miniapp" };
}

/** یک دور: صف را می‌گیرد، اعمال می‌کند، تأیید می‌فرستد. deps: {readOrders, applyStatus(order,status,by), emit()}. */
export async function applyPendingOrderActions({ api = miniapp, deps }) {
  const r = await api.orderActions();
  const items = Array.isArray(r?.items) ? r.items : [];
  if (!items.length) return { applied: 0, notFound: 0, changed: 0 };
  const plan = planOrderActions(items, deps.readOrders());
  for (const u of plan.updates) deps.applyStatus(u.order, u.status, u.by);
  if (plan.updates.length) deps.emit();
  if (plan.applied.length || plan.notFound.length) await api.ackOrderActions({ applied: plan.applied, notFound: plan.notFound });
  return { applied: plan.applied.length, notFound: plan.notFound.length, changed: plan.updates.length };
}

/** حلقهٔ سراسری برنامه: هر ۳۰ ثانیه (فقط وقتی صفحه دیده می‌شود و سرور وصل است). برای جلوگیری از اجرای هم‌زمان در چند تب از قفل مرورگر استفاده می‌کند. */
export function startMiniappOrderSync({ deps, intervalMs = 30000, api = miniapp, isOn = () => isApiConnected() && !isGuestMode() } = {}) {
  if (typeof window === "undefined") return () => {};
  let stopped = false, busy = false, pausedUntil = 0;
  const once = async () => {
    if (stopped || busy || !isOn() || Date.now() < pausedUntil) return;
    busy = true;
    try {
      const go = () => applyPendingOrderActions({ api, deps });
      if (navigator.locks?.request) await navigator.locks.request("cafino-miniapp-order-actions", { ifAvailable: true }, (l) => (l ? go() : null));
      else await go();
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403 || e.status === 503)) pausedUntil = Date.now() + 10 * 60000;   // مجوز ندارد / مینی‌اپ در سرور فعال نیست
    } finally { busy = false; }
  };
  const onVisible = () => { if (document.visibilityState === "visible") once(); };
  document.addEventListener("visibilitychange", onVisible); window.addEventListener("online", once);
  const timer = setInterval(() => { if (document.visibilityState !== "hidden") once(); }, intervalMs);
  const first = setTimeout(once, 4000);
  return () => { stopped = true; clearInterval(timer); clearTimeout(first); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", once); };
}
