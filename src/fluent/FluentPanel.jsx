// تنظیمات «طراحی Fluent» در تب ظاهر
import React, { useEffect, useState } from "react";
import { getFluent, onFluentChange, setFluent } from "./fluent.js";

function Row({ id, title, hint, checked, onChange, disabled }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, opacity: disabled ? 0.5 : 1 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div><div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.8 }}>{hint}</div></div>
      <button type="button" role="switch" data-testid={id} aria-checked={checked} aria-label={title} disabled={disabled} onClick={() => onChange(!checked)}
        style={{ width: 66, flexShrink: 0, padding: "7px 8px", borderRadius: 999, border: "1px solid var(--border)", background: checked ? "#2563eb" : "var(--bg-app)", color: checked ? "#fff" : "var(--text-secondary)", fontWeight: 700, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", fontSize: 12 }}>
        {checked ? "روشن" : "خاموش"}
      </button>
    </div>);
}

export function FluentPanel() {
  const [s, setS] = useState(getFluent);
  useEffect(() => onFluentChange((e) => setS(e.detail || getFluent())), []);
  return (
    <div data-testid="fluent-panel" style={{ background: "var(--bg-card)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)", marginBottom: 4 }}>✨ طراحی Fluent (مایکروسافت)</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>با یک دکمه همهٔ جلوه‌های Fluent (اکریلیک، Reveal، سایه و حرکت) روشن یا خاموش می‌شود. با خاموش‌کردن، ظاهر کلاسیک برمی‌گردد.</div>
      </div>
      <Row id="fluent-on" title="طراحی Fluent" hint="سطح اکریلیک، افکت Reveal، سایه و حرکت نرم؛ با یک دکمه روشن یا خاموش می‌شود" checked={s.on} onChange={(v) => setS(setFluent({ on: v }))} />
    </div>);
}
