// نوار سه‌مرحله‌ای «ثبت سریع خدمات»: انتخاب خدمت ← انتخاب مشتری ← پرداخت
import React from "react";

export function QuickSteps({ hasItems, hasCustomer }) {
  const cur = !hasItems ? 1 : !hasCustomer ? 2 : 3;
  const steps = [["انتخاب خدمت", hasItems], ["انتخاب مشتری", hasCustomer], ["پرداخت", false]];
  return (
    <div data-testid="quick-steps" aria-label="مراحل ثبت" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
      {steps.map(([label, done], i) => {
        const n = i + 1, active = cur === n;
        return (
          <React.Fragment key={label}>
            {i > 0 && <span style={{ width: 64, maxWidth: "14vw", height: 2, background: "var(--border)", borderRadius: 2 }} />}
            <span data-testid={`step-${n}`} data-state={done ? "done" : active ? "active" : "todo"} style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 14, fontWeight: 700, color: done || active ? "var(--text-primary)" : "var(--text-muted)" }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, background: done ? "#2f9e57" : "transparent", color: done ? "#fff" : active ? "#e8590c" : "var(--text-muted)", border: done ? "none" : `2px solid ${active ? "#e8590c" : "var(--border)"}` }}>{done ? "✓" : String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d])}</span>
              {label}
            </span>
          </React.Fragment>);
      })}
    </div>);
}
