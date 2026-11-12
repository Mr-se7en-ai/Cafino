// محاسبات خالص نمایشگر زوم تصویر (قابل آزمون بدون DOM)
// مدل: تصویر در مرکز کادر است و با translate(tx,ty) scale(s) جابه‌جا/بزرگ می‌شود؛ s=1 یعنی «جا شدن کامل در کادر».
export const ZOOM_MIN = 1, ZOOM_MAX = 8;
export const clampScale = (s) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(s) ? s : 1));
/** اندازهٔ تصویر وقتی در کادر جا می‌شود (contain) */
export function fitSize(cw, ch, nw, nh) { const k = Math.min(cw / nw, ch / nh); return { w: nw * k, h: nh * k, k }; }
/** جابه‌جایی را طوری محدود می‌کند که تصویر از کادر خارج نشود */
export function clampPan({ s, tx, ty }, cw, ch, nw, nh) {
  const f = fitSize(cw, ch, nw, nh);
  const mx = Math.max(0, (f.w * s - cw) / 2), my = Math.max(0, (f.h * s - ch) / 2);
  return { s, tx: Math.min(mx, Math.max(-mx, tx)) || 0, ty: Math.min(my, Math.max(-my, ty)) || 0 };
}
/** زوم حول نقطهٔ (px,py) که نسبت به مرکز کادر سنجیده می‌شود (مثلاً موقعیت ماوس/انگشت) */
export function zoomAt(v, s2, px, py, cw, ch, nw, nh) {
  const s = clampScale(s2); const r = s / v.s;
  return clampPan({ s, tx: px - (px - v.tx) * r, ty: py - (py - v.ty) * r }, cw, ch, nw, nh);
}
/** تصویر را به‌اندازهٔ عرض کادر می‌کند و بالای تصویر را نشان می‌دهد (مناسب برگه‌های بلند) */
export function fitWidth(cw, ch, nw, nh) {
  const f = fitSize(cw, ch, nw, nh); const s = clampScale(cw / f.w);
  return clampPan({ s, tx: 0, ty: (f.h * s - ch) / 2 }, cw, ch, nw, nh);
}
