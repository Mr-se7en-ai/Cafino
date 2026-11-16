// «حسابرسی و مرکز مالی»: گزارش حسابرسی (محلی) و مرکز مالی سرور در یک منو با دو زیرتب.
import React from "react";
import { BTN } from "../app/core/constants.js";
import { AuditPanel } from "./AuditPanel.jsx";
import FinanceCenter from "../finance/FinanceCenter.jsx";

export const AUDIT_FIN_TABS = [
  { key: "audit", label: "🛡️ گزارش حسابرسی" },
  { key: "finance", label: "📊 مرکز مالی سرور" },
];
export const normAuditSub = (k) => (k === "finance" ? "finance" : "audit");

export default function AuditFinancePage({ sub, setSub }) {
  const cur = normAuditSub(sub);
  return (
    <div data-testid="auditfin-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {AUDIT_FIN_TABS.map((t) => (
          <button key={t.key} data-testid={`auditfin-tab-${t.key}`} onClick={() => setSub(t.key)} style={{ ...BTN(cur === t.key ? "#2563eb" : "var(--bg-card)", cur === t.key ? "#fff" : "var(--text-secondary)"), padding: "8px 16px", fontSize: 12.5, border: cur === t.key ? "none" : "1px solid var(--border)" }}>{t.label}</button>
        ))}
      </div>
      {cur === "finance" ? <FinanceCenter /> : <AuditPanel />}
    </div>
  );
}
