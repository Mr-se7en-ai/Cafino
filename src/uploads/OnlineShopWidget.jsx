// ویجت بزرگ «آنلاین شاپ» در داشبورد مدیریتی (1.85): شمارنده‌های زنده + آخرین سفارش‌های مینی‌اپ + میان‌بر.
import React, { useEffect, useState } from "react";
import { toFA } from "../app/core/format.js";
import { isApiConnected } from "../services/api/client.js";
import { useMiniReqSummary } from "./miniReqState.js";
import { onlineShopCounts } from "./onlineShopLive.js";
import { miniapp } from "./miniappApi.js";

const STATUS = { new: ["جدید", "#f59e0b"], accepted: ["پذیرفته", "#2563eb"], done: ["انجام‌شده", "#16a34a"], rejected: ["ردشده", "#94a3b8"] };

export function OnlineShopWidget({ onNavigate }) {
  const st = useMiniReqSummary(), connected = isApiConnected();
  const { total, parts } = onlineShopCounts(st);
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    if (!connected) { setRecent(null); return undefined; }
    let alive = true;
    miniapp.requests().then((d) => { if (alive) setRecent((d.items || []).slice(0, 4)); }, () => { if (alive) setRecent([]); });
    return () => { alive = false; };
  }, [connected, total]);
  const go = () => onNavigate && onNavigate("miniapp-orders");
  return (
    <div data-testid="online-shop-widget" style={{ background: "var(--bg-card)", borderRadius: 14, padding: "16px 18px", border: total ? "1px solid #14b8a666" : "1px solid var(--border)", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>🛒 آنلاین شاپ</div>
        <button onClick={go} data-testid="online-shop-open" style={{ background: "transparent", border: "none", color: "var(--accent-light)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>باز کردن ←</button>
      </div>
      {!connected ? <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.9 }}>برای دریافت سفارش، رسید و پیام مشتریان مینی‌اپ، برنامه باید به سرور وصل باشد.</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {parts.map((p) => (
            <button key={p.key} onClick={go} data-testid={`online-shop-${p.key}`} style={{ background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 6px", cursor: "pointer", fontFamily: "inherit", color: "var(--text-primary)" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: p.count ? "#f59e0b" : "var(--text-muted)" }}>{toFA(p.count)}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-secondary)", marginTop: 2 }}>{p.label}</div>
            </button>))}
        </div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }} data-testid="online-shop-recent">
          {recent === null ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>در حال بارگذاری…</div>
            : !recent.length ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>هنوز سفارشی از مینی‌اپ نرسیده است.</div>
            : recent.map((r) => { const [l, c] = STATUS[r.status] || [r.status, "#94a3b8"]; return (
              <button key={r.id} onClick={go} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-app)", border: "none", borderRight: `3px solid ${c}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", color: "var(--text-primary)", textAlign: "right" }}>
                <span style={{ flex: 1, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.service}{r.customer ? ` — ${r.customer}` : ""}</span>
                <span style={{ fontSize: 11, color: c, fontWeight: 700 }}>{l}</span>
              </button>); })}
        </div>
      </>}
    </div>
  );
}
