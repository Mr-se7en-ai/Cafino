// صفحه و ویجت «کنترل سلامت کسب‌وکار» — دکمهٔ «بررسی وضعیت کافینو».
import React, { useState, useEffect, useRef } from "react";
import { BTN } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { runHealthCheck } from "./healthCheck.js";

const LAST_KEY = "cafenet_health_last";
const ST = {
  ok: { icon: "✓", color: "#4ade80", bg: "#14532d33", label: "سالم" },
  warn: { icon: "⚠️", color: "#fbbf24", bg: "#78350f33", label: "نیاز به توجه" },
  bad: { icon: "⛔", color: "#f87171", bg: "#7f1d1d44", label: "مشکل" },
  info: { icon: "ℹ️", color: "#60a5fa", bg: "#1e3a8a33", label: "اطلاع" },
};
const ORDER = { bad: 0, warn: 1, info: 2, ok: 3 };
const saveLast = (r) => { try { localStorage.setItem(LAST_KEY, JSON.stringify({ at: r.at, score: r.score, summary: r.summary, level: r.level })); } catch { /* ignore */ } };
export const getLastHealth = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY) || "null"); } catch { return null; } };
const safeRun = () => { try { return runHealthCheck(); } catch (e) { return { at: Date.now(), checks: [{ id: "err", group: "سیستم", title: "بررسی کامل نشد", status: "bad", detail: String((e && e.message) || e) }], summary: { ok: 0, warn: 0, bad: 1, info: 0 }, score: 0, level: "bad" }; } };
const verdict = (r) => (r.level === "ok" ? "کافینو سالم است" : r.level === "warn" ? `${toFA(r.summary.warn)} مورد نیاز به توجه دارد` : `${toFA(r.summary.bad)} مشکل جدی پیدا شد`);
const when = (t) => { try { return new Date(t).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

function Ring({ score, level }) {
  const c = ST[level === "ok" ? "ok" : level].color, R = 34, L = 2 * Math.PI * R;
  return (
    <svg width="86" height="86" viewBox="0 0 86 86" aria-label={`امتیاز سلامت ${score}`}>
      <circle cx="43" cy="43" r={R} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle cx="43" cy="43" r={R} fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * L} ${L}`} transform="rotate(-90 43 43)" />
      <text x="43" y="49" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--text-primary)" fontFamily="inherit">{toFA(score)}</text>
    </svg>
  );
}

export function HealthPage({ onNavigate }) {
  const [res, setRes] = useState(null), [busy, setBusy] = useState(false), [open, setOpen] = useState(null);
  const timer = useRef(null);
  const run = () => { setBusy(true); clearTimeout(timer.current); timer.current = setTimeout(() => { const r = safeRun(); saveLast(r); setRes(r); setBusy(false); }, 350); };
  useEffect(() => { run(); return () => clearTimeout(timer.current); }, []);  
  const checks = res ? [...res.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : [];
  return (
    <div data-testid="health-page" style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 20, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        {res ? <Ring score={res.score} level={res.level} /> : <div style={{ width: 86, height: 86 }} />}
        <div style={{ flex: "1 1 220px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--accent-light)" }}>🩺 کنترل سلامت کسب‌وکار</div>
          <div data-testid="health-verdict" style={{ fontSize: 14, marginTop: 4, color: res ? ST[res.level].color : "var(--text-secondary)", fontWeight: 700 }}>{busy ? "در حال بررسی…" : res ? verdict(res) : "—"}</div>
          {res && !busy && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{toFA(res.summary.ok)} سالم · {toFA(res.summary.warn)} هشدار · {toFA(res.summary.bad)} مشکل · آخرین بررسی {when(res.at)}</div>}
        </div>
        <button data-testid="health-run" onClick={run} disabled={busy} style={{ ...BTN("#2563eb"), padding: "11px 20px", fontSize: 14, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "بررسی وضعیت کافینو"}</button>
      </div>
      <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {checks.map((c) => {
          const s = ST[c.status], isOpen = open === c.id, more = c.items && c.items.length > 0;
          return (
            <div key={c.id} data-testid="health-item" data-id={c.id} data-status={c.status} style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", borderInlineStart: `3px solid ${s.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: s.bg, color: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{s.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{c.title}</div>
                  {c.detail && <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>{c.detail}</div>}
                </div>
                {more && <button onClick={() => setOpen(isOpen ? null : c.id)} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "4px 10px", fontSize: 11 }}>{isOpen ? "بستن" : "جزئیات"}</button>}
                {c.tab && c.status !== "ok" && onNavigate && <button data-testid="health-go" onClick={() => onNavigate(c.tab)} style={{ ...BTN("var(--border)", "var(--accent-light)"), padding: "4px 10px", fontSize: 11 }}>بررسی ←</button>}
              </div>
              {isOpen && more && <ul style={{ margin: "8px 34px 0", padding: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 2 }}>{c.items.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.9 }}>این بررسی فقط می‌خواند و هیچ داده‌ای را تغییر نمی‌دهد. «حساب‌ها متعادل است» یعنی فروش‌ها، فاکتورها، درآمدها و بدهی‌های دفتر حساب با هم می‌خوانند؛ مغایرت‌های ناشی از ثبت خارج از برنامه را نمی‌تواند ببیند.</div>
    </div>
  );
}

// ویجت داشبورد: دکمه + خلاصهٔ نتیجه
export function HealthWidget({ onNavigate }) {
  const [res, setRes] = useState(null);
  const last = getLastHealth();
  const run = () => { const r = safeRun(); saveLast(r); setRes(r); };
  const show = res || null;
  const top = show ? [...show.checks].filter((c) => c.status !== "ok").sort((a, b) => ORDER[a.status] - ORDER[b.status]).slice(0, 4) : [];
  return (
    <div data-testid="health-widget" style={{ background: "var(--bg-card)", borderRadius: 14, padding: 16, height: "100%", boxSizing: "border-box" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🩺 کنترل سلامت کسب‌وکار</div>
      <button data-testid="health-widget-run" onClick={run} style={{ ...BTN("#2563eb"), width: "100%", padding: 11, fontSize: 13 }}>بررسی وضعیت کافینو</button>
      {show ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ST[show.level].color, marginBottom: 4 }}>{verdict(show)} · امتیاز {toFA(show.score)}</div>
          {top.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>✓ همه‌چیز مرتب است</div> : top.map((c) => <div key={c.id} style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>{ST[c.status].icon} {c.title}</div>)}
        </div>
      ) : last ? <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 }}>آخرین بررسی ساعت {when(last.at)} — امتیاز {toFA(last.score)}</div> : <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 }}>هنوز بررسی انجام نشده است.</div>}
      <button onClick={() => onNavigate && onNavigate("health")} style={{ ...BTN("transparent", "var(--accent-light)"), padding: "8px 0 0", fontSize: 12 }}>جزئیات کامل ←</button>
    </div>
  );
}
