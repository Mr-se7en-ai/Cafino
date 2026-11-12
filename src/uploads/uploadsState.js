// وضعیت مشترک نشان/اعلان «فایل تازه» (بدون وابستگی به رابط؛ قابل‌آزمون در Node).
import { useSyncExternalStore } from "react";

const SOUND_KEY = "cf-uploads-sound";
let state = { newCount: 0, latest: null, blocked7d: 0, ready: false, toast: null };
const subs = new Set();
const emit = (patch) => { if (Object.keys(patch).every((k) => state[k] === patch[k])) return; state = { ...state, ...patch }; subs.forEach((f) => f()); };
export const emitUploads = emit;
export const getUploadsState = () => state;
export const subscribeUploads = (f) => { subs.add(f); return () => subs.delete(f); };
export const useUploadsSummary = () => useSyncExternalStore(subscribeUploads, getUploadsState, getUploadsState);

export const getSoundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== "0"; } catch { return true; } };
export const setSoundOn = (on) => { try { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch { /* ignore */ } };
export function beep() {
  try {
    if (!getSoundOn()) return;
    const A = globalThis.AudioContext || globalThis.webkitAudioContext; if (!A) return;
    const c = new A(), o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.15, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.4); o.onended = () => c.close?.();
  } catch { /* صدا اختیاری است */ }
}

/** آیا ارسال تازه‌ای رسیده؟ lastAt = زمان تازه‌ترین ارسالی که قبلاً دیده/اعلان شده (اولین دریافت فقط مبنا را می‌گذارد، اعلان نمی‌دهد). */
export function detectNewArrival(lastAt, summary) {
  const at = summary?.latest?.at ? Date.parse(summary.latest.at) : 0;
  if (lastAt === null) return { alert: false, lastAt: at };
  return { alert: at > lastAt && (summary?.newCount || 0) > 0, lastAt: Math.max(lastAt, at) };
}
export function arrivalText(latest) {
  const who = latest?.senderName ? ` از ${latest.senderName}` : "";
  const ord = latest?.orderLabel ? ` برای «${latest.orderLabel}»` : "";
  return { title: "فایل تازه از مشتری", body: `${latest?.count || 1} فایل${who}${ord} — کد پیگیری ${latest?.batchCode || ""}` };
}

export const dismissUploadsToast = () => emit({ toast: null });
/** وقتی کارمند صفحهٔ فایل‌ها را باز/تازه می‌کند، شمارنده را فوراً به‌روز می‌کنیم. */
export const setUploadsNewCount = (n) => emit({ newCount: Math.max(0, n | 0) });
