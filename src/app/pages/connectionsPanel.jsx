// تنظیمات ← «اتصال»: ربات بله، ربات تلگرام و هوش مصنوعی در یک جا (زیرتب‌ها).
import React from "react";
import Icon from "../../components/Icon.jsx";
import { BTN } from "../core/constants.js";
import BotsPage from "../../bots/BotsPage.jsx";
import { AiAgentPanel } from "./aiAgent.jsx";

export const CONNECTION_TABS = [
  { key: "bale", label: "ربات بله", icon: "Send" },
  { key: "telegram", label: "ربات تلگرام", icon: "Send" },
  { key: "ai", label: "هوش مصنوعی", icon: "Sparkles" },
];
export const normConnSub = (k) => (CONNECTION_TABS.some((t) => t.key === k) ? k : "bale");

export default function ConnectionsPanel({ sub, setSub }) {
  const cur = normConnSub(sub);
  return (
    <div data-testid="connections-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {CONNECTION_TABS.map((t) => (
          <button key={t.key} data-testid={`conn-tab-${t.key}`} onClick={() => setSub(t.key)} style={{ ...BTN(cur === t.key ? "#2563eb" : "var(--bg-card)", cur === t.key ? "#fff" : "var(--text-secondary)"), padding: "8px 16px", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, border: cur === t.key ? "none" : "1px solid var(--border)" }}>
            <Icon name={t.icon} size={14} /><span>{t.label}</span>
          </button>
        ))}
      </div>
      {cur === "ai" ? <AiAgentPanel /> : <BotsPage key={cur} provider={cur} />}
    </div>
  );
}
