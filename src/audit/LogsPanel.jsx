// تب «لاگ» در تنظیمات: دو زیرتب — «لاگ خطا» (خطاهای فنی با Error ID) و «لاگ فعالیت» (تاریخچهٔ کارهای کاربران).
import React, { useState, useMemo } from "react";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { ErrorLogPanel } from "../sync/SyncUI.jsx";
import { getAuditEvents, SEVERITY_LABEL } from "./auditTrail.js";
import { fmtJalaliDT } from "./AuditPanel.jsx";
import { useDataSync } from "../app/domain/sales.jsx";

const SEV_COLOR = { info: "#94a3b8", sensitive: "#fbbf24", critical: "#f87171" };

export function ActivityLogPanel({ onOpenAudit }) {
  const [tick, setTick] = useState(0);
  useDataSync(() => setTick((t) => t + 1));
  const [q, setQ] = useState(""), [limit, setLimit] = useState(40);
  const list = useMemo(() => getAuditEvents({ q, includeInfo: true }), [q, tick]);  
  return (
    <div data-testid="activity-log" style={{ background: "var(--bg-card)", borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)" }}>📋 لاگ فعالیت کاربران</div>
        {onOpenAudit && <button data-testid="activity-open-audit" onClick={onOpenAudit} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>🛡️ گزارش حسابرسی (حسابداری) ◂</button>}
      </div>
      <input data-testid="activity-q" value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} placeholder="جستجو در فعالیت‌ها…" style={{ ...INP, marginTop: 0, marginBottom: 12, fontSize: 12 }} />
      {list.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 24, fontSize: 13 }}>فعالیتی ثبت نشده است.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {list.slice(0, limit).map((e) => (
            <div key={e.id} data-testid="activity-row" style={{ background: "var(--bg-app)", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, borderInlineStart: `3px solid ${SEV_COLOR[e.severity] || SEV_COLOR.info}`, lineHeight: 1.8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <b style={{ color: "var(--text-primary)" }}>{e.label}{e.severity !== "info" && <span style={{ marginInlineStart: 8, fontSize: 10.5, fontWeight: 400, color: SEV_COLOR[e.severity] }}>{SEVERITY_LABEL[e.severity]}</span>}</b>
                <span dir="ltr" style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtJalaliDT(e.ts)}</span>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 11.5 }}>{e.actor}{(e.details || e.entityLabel) ? ` — ${e.details || e.entityLabel}` : ""}{e.reason ? ` — علت: ${e.reason}` : ""}</div>
            </div>
          ))}
          {list.length > limit && <button onClick={() => setLimit((l) => l + 60)} style={{ ...BTN("var(--bg-app)", "var(--text-secondary)"), padding: 9, fontSize: 12 }}>نمایش بیشتر ({toFA(list.length - limit)} مورد دیگر)</button>}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.9 }}>این فهرست فقط‌خواندنی است و شامل عملیات حساس هم می‌شود؛ جزئیات و بررسی صحت در «حسابداری ← گزارش حسابرسی» است.</div>
    </div>
  );
}

export function LogsPanel({ sub = "errors", setSub, onOpenAudit }) {
  const tabs = [["errors", "⚠️ لاگ خطا"], ["activity", "📋 لاگ فعالیت"]];
  return (
    <div data-testid="logs-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map(([k, l]) => (
          <button key={k} data-testid={`logs-tab-${k}`} onClick={() => setSub(k)} style={{ ...BTN(sub === k ? "#2563eb" : "var(--bg-card)", sub === k ? "#fff" : "var(--text-secondary)"), padding: "8px 16px", fontSize: 12.5, border: sub === k ? "none" : "1px solid var(--border)" }}>{l}</button>
        ))}
      </div>
      {sub === "activity" ? <ActivityLogPanel onOpenAudit={onOpenAudit} /> : <ErrorLogPanel />}
    </div>
  );
}
