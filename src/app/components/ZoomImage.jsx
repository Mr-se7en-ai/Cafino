// نمایشگر تصویر با زوم: چرخ ماوس، دکمه‌ها، دو انگشت (pinch)، کشیدن برای جابه‌جایی، دابل‌کلیک، کلیدهای + − 0، تمام‌صفحه
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toFA } from "../core/format.js";
import { BTN } from "../core/constants.js";
import { ZOOM_MAX, ZOOM_MIN, clampPan, clampScale, fitWidth, zoomAt } from "./zoomMath.js";

const IDLE = { s: 1, tx: 0, ty: 0 };

function Viewer({ src, alt, height, testid, onFullscreen, onClose, fs }) {
  const box = useRef(null), imgRef = useRef(null);
  const [v, setV] = useState(IDLE);
  const [nat, setNat] = useState(null);                      // اندازهٔ واقعی تصویر
  const [drag, setDrag] = useState(false);
  const vRef = useRef(v); vRef.current = v;
  const ptrs = useRef(new Map()); const gesture = useRef(null);
  const dims = () => { const r = box.current.getBoundingClientRect(); return { cw: r.width, ch: r.height, r }; };
  const apply = useCallback((fn) => { if (!nat || !box.current) return; const { cw, ch } = dims(); setV((cur) => fn(cur, cw, ch)); }, [nat]);
  const zoomBy = (k, px = 0, py = 0) => apply((c, cw, ch) => zoomAt(c, c.s * k, px, py, cw, ch, nat.w, nat.h));
  const reset = () => setV(IDLE);
  const wide = () => apply((c, cw, ch) => fitWidth(cw, ch, nat.w, nat.h));
  const rel = (e) => { const { r } = dims(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; };

  // چرخ ماوس باید non-passive باشد تا صفحه اسکرول نشود
  useEffect(() => {
    const el = box.current; if (!el) return;
    const onWheel = (e) => { if (!nat) return; e.preventDefault(); const p = rel(e); zoomBy(Math.exp(-e.deltaY * 0.0018), p.x, p.y); };
    el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel);
  });
  useEffect(() => { setV(IDLE); setNat(null); }, [src]);
  useEffect(() => { // اگر اندازهٔ کادر عوض شد (چرخش گوشی/تغییر پنجره) محدودهٔ جابه‌جایی دوباره اعمال شود
    if (!box.current || !nat || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => apply((c, cw, ch) => clampPan(c, cw, ch, nat.w, nat.h))); ro.observe(box.current); return () => ro.disconnect();
  }, [nat, apply]);
  useEffect(() => { if (!fs) return; const k = (e) => { if (e.key === "Escape") onClose && onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [fs, onClose]);

  const down = (e) => {
    if (!nat) return; box.current.setPointerCapture && box.current.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: vRef.current.s }; }
    else setDrag(true);
  };
  const move = (e) => {
    const p = ptrs.current.get(e.pointerId); if (!p || !nat) return;
    const prev = { ...p }; ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && gesture.current) {
      const [a, b] = [...ptrs.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const { r } = dims();
      const cx = (a.x + b.x) / 2 - r.left - r.width / 2, cy = (a.y + b.y) / 2 - r.top - r.height / 2;
      apply((c, cw, ch) => zoomAt(c, gesture.current.s * (d / gesture.current.d), cx, cy, cw, ch, nat.w, nat.h));
    } else if (ptrs.current.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      apply((c, cw, ch) => clampPan({ s: c.s, tx: c.tx + dx, ty: c.ty + dy }, cw, ch, nat.w, nat.h));
    }
  };
  const up = (e) => { ptrs.current.delete(e.pointerId); gesture.current = null; if (!ptrs.current.size) setDrag(false); };
  const dbl = (e) => { if (!nat) return; const p = rel(e); if (vRef.current.s > 1.05) reset(); else zoomBy(2.5, p.x, p.y); };
  const key = (e) => { if (e.key === "+" || e.key === "=") zoomBy(1.3); else if (e.key === "-") zoomBy(1 / 1.3); else if (e.key === "0") reset(); else return; e.preventDefault(); };

  const btn = { ...BTN("var(--border)", "var(--text-primary)"), padding: "5px 11px", fontSize: 13, minWidth: 34 };
  return (
    <div data-testid={testid} style={fs ? { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(2,6,23,.96)", display: "flex", flexDirection: "column", padding: 12, gap: 10 } : {}}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: fs ? 0 : 8 }} dir="rtl">
        <button data-testid="zoom-in" onClick={() => zoomBy(1.4)} disabled={!nat || v.s >= ZOOM_MAX} style={btn} title="بزرگ‌نمایی">＋</button>
        <button data-testid="zoom-out" onClick={() => zoomBy(1 / 1.4)} disabled={!nat || v.s <= ZOOM_MIN} style={btn} title="کوچک‌نمایی">－</button>
        <span data-testid="zoom-level" style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 44, textAlign: "center" }}>{toFA(Math.round(v.s * 100))}٪</span>
        <button data-testid="zoom-reset" onClick={reset} disabled={!nat} style={{ ...btn, fontSize: 12 }}>جا شدن در کادر</button>
        <button data-testid="zoom-wide" onClick={wide} disabled={!nat} style={{ ...btn, fontSize: 12 }}>عرض کامل</button>
        {!fs && onFullscreen && <button data-testid="zoom-fullscreen" onClick={onFullscreen} disabled={!nat} style={{ ...btn, fontSize: 12 }}>⛶ تمام‌صفحه</button>}
        {fs && <button data-testid="zoom-fs-close" onClick={onClose} style={{ ...BTN("#dc2626"), padding: "5px 14px", fontSize: 12, marginInlineStart: "auto" }}>✕ بستن</button>}
        <span style={{ fontSize: 11, color: "var(--text-dim)", flexBasis: "100%" }}>چرخ ماوس یا دو انگشت برای زوم · کشیدن برای جابه‌جایی · دابل‌کلیک برای بزرگ‌نمایی سریع</span>
      </div>
      <div ref={box} tabIndex={0} onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={dbl}
        data-testid="zoom-stage" style={{ position: "relative", overflow: "hidden", borderRadius: 10, background: "#0b1220", border: "1px solid var(--border)", height: fs ? "auto" : height, flex: fs ? 1 : undefined, minHeight: fs ? 0 : undefined, touchAction: "none", cursor: v.s > 1 ? (drag ? "grabbing" : "grab") : "zoom-in", outline: "none", userSelect: "none" }}>
        <img ref={imgRef} data-testid="zoom-img" src={src} alt={alt} draggable={false}
          onLoad={(e) => setNat({ w: e.target.naturalWidth || 1, h: e.target.naturalHeight || 1 })}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "transparent", transform: `translate(${v.tx}px,${v.ty}px) scale(${v.s})`, transformOrigin: "center center", transition: drag || ptrs.current.size ? "none" : "transform .12s ease-out", willChange: "transform", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

export default function ZoomImage({ src, alt = "", height = "min(70vh,560px)", testid = "zoom-viewer" }) {
  const [fs, setFs] = useState(false);
  return (<>
    <Viewer src={src} alt={alt} height={height} testid={testid} onFullscreen={() => setFs(true)} />
    {fs && <Viewer src={src} alt={alt} testid="zoom-fs" fs onClose={() => setFs(false)} />}
  </>);
}
