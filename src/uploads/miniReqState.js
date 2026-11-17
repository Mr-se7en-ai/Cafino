// نشان «سفارش تازه از مینی‌اپ» روی منو + اعلان مرکز اعلان (1.83). هر ۳۰ ثانیه فهرست درخواست‌ها را می‌خواند
// (فقط وقتی برنامه دیده می‌شود و سرور وصل است). تعداد در localStorage هم نگه‌داری می‌شود تا computeNotifications آن را ببیند.
import { useSyncExternalStore } from "react";
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { miniapp } from "./miniappApi.js";

export const MINI_REQ_CACHE_KEY = "cafino_miniapp_req_new";
let state = { newCount: 0, pendingPayments: 0, unreadChats: 0, ready: false };
const subs = new Set();
export const getMiniReqState = () => state;
export const subscribeMiniReq = (f) => { subs.add(f); return () => subs.delete(f); };
export const useMiniReqSummary = () => useSyncExternalStore(subscribeMiniReq, getMiniReqState, getMiniReqState);
export function emitMiniReq(patch) {
  if (Object.keys(patch).every((k) => state[k] === patch[k])) return;
  state = { ...state, ...patch }; subs.forEach((f) => f());
}
export function readCachedNewCount() { try { const n = Number(localStorage.getItem(MINI_REQ_CACHE_KEY)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; } catch { return 0; } }
function cacheNewCount(n) { try { localStorage.setItem(MINI_REQ_CACHE_KEY, String(n)); } catch { /* ذخیره‌سازی در دسترس نیست */ } }
/** بعد از هر تغییر در صفحهٔ سفارش‌ها، شمارندهٔ منو را بی‌درنگ به‌روز می‌کند. */
export const MINI_PAY_CACHE_KEY = "cafino_miniapp_pay_pending", MINI_CHAT_CACHE_KEY = "cafino_miniapp_chat_unread";
const cnt = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const readKey = (k) => { try { return cnt(localStorage.getItem(k)); } catch { return 0; } };
export const readCachedPayCount = () => readKey(MINI_PAY_CACHE_KEY);
export const readCachedChatCount = () => readKey(MINI_CHAT_CACHE_KEY);
/** رسیدهای در انتظار تأیید و پیام‌های خوانده‌نشده (برای نشان منو و مرکز اعلان) */
export function setMiniExtras({ pendingPayments, unreadChats }) {
  const patch = {}, put = (k, key, v) => { if (v === undefined) return; const n = cnt(v); try { localStorage.setItem(key, String(n)); } catch { /* ذخیره‌سازی در دسترس نیست */ } patch[k] = n; };
  put("pendingPayments", MINI_PAY_CACHE_KEY, pendingPayments); put("unreadChats", MINI_CHAT_CACHE_KEY, unreadChats);
  emitMiniReq({ ...patch, ready: true });
}
export const miniBadgeTotal = (s = state) => cnt(s.newCount) + cnt(s.pendingPayments) + cnt(s.unreadChats);
export function setMiniReqNewCount(n) { const v = Math.max(0, Number(n) || 0); cacheNewCount(v); emitMiniReq({ newCount: v, ready: true }); }

export function startMiniReqPolling({ intervalMs = 30000, fetchReqs = () => miniapp.inboxSummary().then((d) => ({ newCount: d.newRequests, pendingPayments: d.pendingPayments, unreadChats: d.unreadChats })), isOn = () => isApiConnected() && !isGuestMode() } = {}) {
  if (typeof window === "undefined") return () => {};
  let stopped = false, pausedUntil = 0;
  const run = async () => {
    if (stopped || Date.now() < pausedUntil) return;
    if (!isOn()) { if (readCachedNewCount() || state.newCount) setMiniReqNewCount(0); if (readCachedPayCount() || readCachedChatCount() || state.pendingPayments || state.unreadChats) setMiniExtras({ pendingPayments: 0, unreadChats: 0 }); return; }   // سرور وصل نیست: شمارندهٔ کهنه نماند
    try {
      const r = await fetchReqs();
      setMiniReqNewCount(Number(r?.newCount) || (Array.isArray(r?.items) ? r.items.filter((x) => x.status === "new").length : 0));
      if (r && (r.pendingPayments !== undefined || r.unreadChats !== undefined)) setMiniExtras({ pendingPayments: r.pendingPayments, unreadChats: r.unreadChats });
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403 || e.status === 503)) { pausedUntil = Date.now() + 10 * 60000; setMiniReqNewCount(0); }   // مجوز ندارد / مینی‌اپ در سرور فعال نیست
    }
  };
  const onVisible = () => { if (document.visibilityState === "visible") run(); };
  document.addEventListener("visibilitychange", onVisible); window.addEventListener("online", run);
  const timer = setInterval(() => { if (document.visibilityState !== "hidden") run(); }, intervalMs);
  const first = setTimeout(run, 3000);
  return () => { stopped = true; clearInterval(timer); clearTimeout(first); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", run); };
}
