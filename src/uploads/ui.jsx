// اجزای مشترک رابط «دریافت فایل»: استایل‌ها، یادداشت، برچسب و پنجرهٔ گفتگو (Esc برای بستن، قفل اسکرول، بازگرداندن فوکوس).
import React, { useEffect, useRef } from "react";

export const card = { background: "var(--bg-card)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 };
export const sub = { fontSize: 12, color: "var(--text-muted)" };
export const msgOf = (e) => (e && (e.message || e.error)) || "خطای نامشخص";
export const Note = ({ kind = "info", children, ...r }) => { const c = kind === "error" ? "#f87171" : kind === "ok" ? "#34d399" : kind === "warn" ? "#fbbf24" : "#60a5fa"; return <div role={kind === "error" ? "alert" : "status"} {...r} style={{ background: `${c}18`, border: `1px solid ${c}55`, color: c, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, lineHeight: 1.7, ...(r.style || {}) }}>{children}</div>; };
export const Pill = ({ color, children, ...r }) => <span {...r} style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: 20, padding: "1px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", ...(r.style || {}) }}>{children}</span>;
export const smallBtn = (bg, col = "#fff", extra = {}) => ({ background: bg, color: col, border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", ...extra });

export function Modal({ title, onClose, children, width = 880, testid = "up-modal", footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement, scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } };
    document.addEventListener("keydown", onKey, true);
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey, true); document.body.style.overflow = scroll; try { prev?.focus?.(); } catch { /* ignore */ } };
  }, [onClose]);
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} data-testid={testid} style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "94vh", display: "flex", flexDirection: "column", outline: "none", boxShadow: "0 20px 60px #000a", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <b style={{ fontSize: 15, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</b>
          <button onClick={onClose} aria-label="بستن" data-testid={`${testid}-close`} style={{ all: "unset", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "2px 8px", color: "var(--text-muted)" }}>×</button>
        </div>
        <div style={{ padding: 16, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
        {footer && <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{footer}</div>}
      </div>
    </div>
  );
}
