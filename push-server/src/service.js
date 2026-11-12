// منطق اصلی: اشتراک‌ها، زمان‌بندی یادآورها و ارسال اعلان. هیچ وابستگی‌ای به HTTP یا کتابخانهٔ web-push ندارد
// (ارسال‌کننده و ساعت تزریق می‌شوند) تا کاملاً قابل‌تست باشد.
import crypto from "node:crypto";

export const LIMITS = { reminders: 500, fireAtPerReminder: 12, title: 160, body: 300, maxLateMs: 6 * 3600e3, maxAttempts: 3, keepPastMs: 3 * 86400e3, subscriptions: 5000 };

const sid = (endpoint) => crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 32);
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const isHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

export class PushError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function validateSubscription(sub) {
  if (!sub || typeof sub !== "object" || !isHttps(sub.endpoint) || String(sub.endpoint).length > 1000) throw new PushError(400, "اشتراک نامعتبر است");
  const k = sub.keys || {};
  if (typeof k.p256dh !== "string" || typeof k.auth !== "string" || k.p256dh.length > 200 || k.auth.length > 100) throw new PushError(400, "کلیدهای اشتراک نامعتبر است");
  return { endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? null, keys: { p256dh: k.p256dh, auth: k.auth } };
}

export function createPushService({ store, sender, now = () => Date.now(), log = () => {} }) {
  const subs = () => store.data.subs;

  function subscribe(subscription, meta = {}) {
    const clean = validateSubscription(subscription);
    const id = sid(clean.endpoint);
    if (!subs()[id] && Object.keys(subs()).length >= LIMITS.subscriptions) throw new PushError(503, "ظرفیت اشتراک‌ها پر است");
    const old = subs()[id];
    subs()[id] = { id, subscription: clean, cafeId: clip(meta.cafeId, 80), tz: clip(meta.tz, 60), createdAt: old?.createdAt || now(), updatedAt: now(), reminders: old?.reminders || {} };
    store.save();
    return { id };
  }

  function unsubscribe(endpoint) {
    const id = sid(endpoint);
    const had = !!subs()[id];
    delete subs()[id];
    if (had) store.save();
    return had;
  }

  // جایگزینی کل برنامهٔ زمان‌بندی یک دستگاه. اعلان‌هایی که قبلاً برای (شناسه، زمان) رفته‌اند دوباره نمی‌روند.
  function setReminders(endpoint, list) {
    const s = subs()[sid(endpoint)];
    if (!s) throw new PushError(404, "ابتدا اشتراک را ثبت کنید");
    if (!Array.isArray(list) || list.length > LIMITS.reminders) throw new PushError(400, "فهرست یادآورها نامعتبر است");
    const next = {};
    for (const r of list) {
      if (!r || typeof r !== "object" || !r.id) continue;
      const id = clip(r.id, 80);
      const title = clip(r.title, LIMITS.title).trim();
      if (!title) continue;
      const fireAt = (Array.isArray(r.fireAt) ? r.fireAt : []).map(Number).filter((t) => Number.isFinite(t) && t > 0).slice(0, LIMITS.fireAtPerReminder);
      if (!fireAt.length) continue;
      const prev = s.reminders[id];
      const sent = {};
      fireAt.forEach((t) => { if (prev?.sent?.[t] !== undefined) sent[t] = prev.sent[t]; });
      next[id] = { id, title, body: clip(r.body, LIMITS.body), fireAt, sent };
    }
    s.reminders = next; s.updatedAt = now();
    store.save();
    return { count: Object.keys(next).length };
  }

  const payloadOf = (r, ts) => JSON.stringify({ title: `⏰ ${r.title}`, body: r.body || "زمان یادآوری رسیده است", tag: `cafino-${r.id}`, id: r.id, ts, url: "./?tab=notes" });

  // یک دور زمان‌بندی؛ تعداد اعلان‌های ارسال‌شده را برمی‌گرداند
  async function tick() {
    const t = now();
    let sentCount = 0, dirty = false;
    for (const s of Object.values(subs())) {
      let gone = false;
      for (const r of Object.values(s.reminders)) {
        if (gone) break;
        for (const ts of r.fireAt) {
          if (ts > t) continue;
          const state = r.sent[ts];
          if (state === true || state === "skipped") continue;
          if (t - ts > LIMITS.maxLateMs) { r.sent[ts] = "skipped"; dirty = true; continue; }       // خیلی دیر شده؛ بی‌صدا کنار می‌رود
          try {
            await sender(s.subscription, payloadOf(r, ts), { TTL: Math.max(60, Math.floor((LIMITS.maxLateMs - (t - ts)) / 1000)), urgency: "high" });
            r.sent[ts] = true; sentCount++; dirty = true;
          } catch (e) {
            const code = e?.statusCode || e?.status;
            if (code === 404 || code === 410) { delete subs()[s.id]; dirty = true; gone = true; log("expired", s.id); break; }
            const n = (typeof state === "number" ? state : 0) + 1;
            r.sent[ts] = n >= LIMITS.maxAttempts ? "skipped" : n; dirty = true;
            log("send-failed", s.id, code || e?.message);
          }
        }
        // پاکسازی زمان‌های خیلی قدیمی تا فایل بزرگ نشود
        const keep = r.fireAt.filter((ts) => t - ts < LIMITS.keepPastMs);
        if (keep.length !== r.fireAt.length) { r.fireAt = keep; Object.keys(r.sent).forEach((k) => { if (!keep.includes(Number(k))) delete r.sent[k]; }); dirty = true; }
      }
      if (gone) continue;
      for (const [rid, r] of Object.entries(s.reminders)) if (!r.fireAt.length) { delete s.reminders[rid]; dirty = true; }
    }
    if (dirty) store.save();
    return sentCount;
  }

  async function sendTest(endpoint) {
    const s = subs()[sid(endpoint)];
    if (!s) throw new PushError(404, "ابتدا اشتراک را ثبت کنید");
    await sender(s.subscription, JSON.stringify({ title: "🔔 کافینو", body: "اعلان آزمایشی — اعلان پس‌زمینه درست کار می‌کند.", tag: "cafino-test", url: "./?tab=notes" }), { TTL: 300, urgency: "normal" });
    return true;
  }

  const stats = () => { const all = Object.values(subs()); return { subscriptions: all.length, reminders: all.reduce((n, s) => n + Object.keys(s.reminders).length, 0) }; };
  return { subscribe, unsubscribe, setReminders, tick, sendTest, stats, _sid: sid };
}
