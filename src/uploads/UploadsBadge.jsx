import React from "react";
import { toFA } from "../app/core/format.js";
import { useUploadsSummary, dismissUploadsToast } from "./uploadsBadge.js";

export function UploadsBadge({ style }) {
  const { newCount } = useUploadsSummary();
  if (!newCount) return null;
  return <span data-testid="uploads-badge" aria-label={`${newCount} فایل جدید`} style={{ background: "#dc2626", color: "#fff", borderRadius: 10, minWidth: 18, height: 18, padding: "0 5px", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}>{toFA(newCount > 99 ? "99+" : newCount)}</span>;
}

/** اعلان درون‌برنامه‌ای ارسال تازه؛ با کلیک، صفحهٔ فایل‌ها باز می‌شود. */
export function UploadsToast({ onOpen, isMobile }) {
  const { toast } = useUploadsSummary();
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" data-testid="uploads-toast" style={{ position: "fixed", insetInlineStart: 14, bottom: isMobile ? 84 : 18, zIndex: 9000, maxWidth: "min(92vw,360px)", background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid #e8590c", borderRadius: 14, boxShadow: "0 10px 30px #0006", padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 22 }}>📥</span>
      <button onClick={() => { dismissUploadsToast(); onOpen?.(); }} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{toast.title}</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>{toast.body}</div>
      </button>
      <button onClick={dismissUploadsToast} aria-label="بستن" style={{ all: "unset", cursor: "pointer", fontSize: 18, padding: 4, color: "var(--text-muted)" }}>×</button>
    </div>
  );
}
