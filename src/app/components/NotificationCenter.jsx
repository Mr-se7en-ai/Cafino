// محتوای «مرکز اعلان‌ها»: اعلان‌ها به‌صورت دسته‌بندی موضوعی (تاشو) با شمارندهٔ شدت.
import React, { useMemo, useState } from "react";
import { toFA } from "../core/format.js";
import { groupNotifications, LEVEL_BADGE } from "../core/notifGroups.js";

const KEY = "cafino_notif_collapsed";
const readCollapsed = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); } };
const SEV_COLOR = { critical: "#f87171", attention: "#fb923c", warning: "#fbbf24", info: "#60a5fa" };

export default function NotificationCenter({ notifications, onGo }) {
  const [closed, setClosed] = useState(readCollapsed);
  const groups = useMemo(() => groupNotifications(notifications), [notifications]);
  const toggle = (t) => setClosed((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); try { localStorage.setItem(KEY, JSON.stringify([...n])); } catch {} return n; });
  if (!groups.length) return <div data-testid="notif-empty" style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: "20px 0" }}>هشدار فعالی وجود ندارد</div>;
  return (
    <div data-testid="notif-groups">
      {groups.map((g) => {
        const open = !closed.has(g.topic);
        return (
          <div key={g.topic} data-testid="notif-group" data-topic={g.topic} style={{ marginBottom: 8 }}>
            <button onClick={() => toggle(g.topic)} aria-expanded={open} data-testid="notif-group-head" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--border)", padding: "6px 6px 7px", cursor: "pointer", fontFamily: "inherit", color: "var(--text-primary)", textAlign: "right" }}>
              <span style={{ fontSize: 14 }}>{g.icon}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, flex: 1 }}>{g.topic}</span>
              {["critical", "attention", "warning", "info"].filter((l) => g.counts[l] > 0).map((l) => <span key={l} title={LEVEL_BADGE[l]} style={{ fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 7px", background: `${SEV_COLOR[l]}22`, color: SEV_COLOR[l] }}>{toFA(g.counts[l])}</span>)}
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{open ? "▾" : "◂"}</span>
            </button>
            {open && <div style={{ paddingTop: 6 }}>{g.items.map((n, i) => {
              const badge = LEVEL_BADGE[n.level] || LEVEL_BADGE.info;
              const style = { display: "block", width: "100%", textAlign: "right", padding: "9px 10px", borderRadius: 9, background: "var(--bg-app)", marginBottom: 6, fontSize: 12, border: "1px solid transparent", fontFamily: "inherit", cursor: n.tab ? "pointer" : "default" };
              const content = <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, color: n.color || "var(--text-secondary)", fontWeight: 700, lineHeight: 1.7 }}><span>{n.icon || "🔔"}</span><span style={{ flex: 1 }}>{n.text}</span><span style={{ fontSize: 9, borderRadius: 10, padding: "2px 6px", background: `${n.color || "#64748b"}22`, whiteSpace: "nowrap" }}>{badge}</span></div>
                {n.detail && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.7 }}>{n.detail}</div>}
              </>;
              return n.tab ? <button key={n.key || i} data-testid="notif-item" onClick={() => onGo(n.tab)} style={style}>{content}</button> : <div key={n.key || i} data-testid="notif-item" style={style}>{content}</div>;
            })}</div>}
          </div>
        );
      })}
    </div>
  );
}
