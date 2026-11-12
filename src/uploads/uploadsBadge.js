// نشان «فایل تازه» روی منو + اعلان: هر ۲۰ ثانیه /api/uploads/summary را می‌خواند (فقط وقتی برنامه دیده می‌شود، سرور وصل است و کاربر مجوز دارد).
// هنگام رسیدن ارسال تازه: toast داخل برنامه + اعلان سیستم‌عامل (اگر برنامه در پس‌زمینه است و اجازه داده شده) + صدای کوتاه (قابل خاموش‌کردن).
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { uploads } from "./uploadsApi.js";
import { showSystemNotice } from "../inbox/inbox.js";
import { emitUploads as emit, detectNewArrival, arrivalText, beep } from "./uploadsState.js";
export * from "./uploadsState.js";

export function startUploadsPolling({ intervalMs = 20000, fetchSummary = () => uploads.summary(), isOn = () => isApiConnected() && !isGuestMode() } = {}) {
  if (typeof window === "undefined") return () => {};
  let stopped = false, lastAt = null, pausedUntil = 0, toastTimer = null;
  const run = async () => {
    if (stopped || !isOn() || Date.now() < pausedUntil) return;
    try {
      const s = await fetchSummary();
      const d = detectNewArrival(lastAt, s); lastAt = d.lastAt;
      emit({ newCount: s.newCount || 0, latest: s.latest || null, blocked7d: s.blocked7d || 0, ready: true });
      if (d.alert) {
        const t = arrivalText(s.latest);
        emit({ toast: { ...t, id: s.latest.batchId } }); clearTimeout(toastTimer); toastTimer = setTimeout(() => emit({ toast: null }), 9000);
        beep(); showSystemNotice(t.title, t.body, `up-${s.latest.batchId}`);
      }
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) pausedUntil = Date.now() + 10 * 60000;   // مجوز ندارد: ده دقیقه سراغش نمی‌رویم
    }
  };
  const onVisible = () => { if (document.visibilityState === "visible") run(); };
  document.addEventListener("visibilitychange", onVisible); window.addEventListener("online", run);
  const timer = setInterval(() => { if (document.visibilityState !== "hidden") run(); }, intervalMs);
  const first = setTimeout(run, 2000);
  return () => { stopped = true; clearInterval(timer); clearTimeout(first); clearTimeout(toastTimer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", run); };
}
