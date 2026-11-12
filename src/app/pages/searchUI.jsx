// «کافیند | CAFIND» — جستجوی سراسری کافینو (ویجت داشبورد + پالت Ctrl+K)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toFA } from "../core/format.js";
import { useDataSync } from "../domain/sales.jsx";
import { SEARCH_BRAND, buildIndex, categoryMeta, collectSources, countByCategory, instantAnswer, normalize, search, suggestions } from "../domain/search.js";

const RECENT_KEY = "cafenet_cafind_recent";
const CAT_COLOR = { action: "#7c3aed", page: "#0ea5e9", customer: "#16a34a", invoice: "#2563eb", order: "#0891b2", tx: "#d97706", obligation: "#dc2626", employee: "#9333ea", stock: "#b45309", ledger: "#be123c", note: "#ca8a04", reminder: "#ea580c", event: "#0d9488", tariff: "#4f46e5", link: "#64748b", setting: "#475569" };

const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : []; } catch { return []; } };
const writeRecent = (a) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 6))); } catch { /* ignore */ } };

export function CafindLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" data-testid="cafind-logo">
      <defs><linearGradient id="cfg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#7c3aed" /></linearGradient></defs>
      <rect width="48" height="48" rx="12" fill="url(#cfg)" />
      <circle cx="22" cy="22" r="10" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M30 30l9 9" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M22 17.5v9M17.5 22h9" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".9" />
    </svg>);
}

function Highlight({ text, tokens }) {
  const t = String(text || "");
  if (!tokens.length || normalize(t).length !== t.length) return <>{t}</>;
  const n = normalize(t), mark = new Array(t.length).fill(false);
  tokens.forEach((tok) => { let i = n.indexOf(tok); while (i >= 0) { for (let k = i; k < i + tok.length; k++) mark[k] = true; i = n.indexOf(tok, i + tok.length); } });
  const parts = []; let cur = "", on = false;
  for (let i = 0; i < t.length; i++) { if (mark[i] !== on) { if (cur) parts.push([on, cur]); cur = ""; on = mark[i]; } cur += t[i]; }
  if (cur) parts.push([on, cur]);
  return <>{parts.map(([m, s], i) => (m ? <mark key={i} style={{ background: "transparent", color: "#38bdf8", fontWeight: 800 }}>{s}</mark> : <React.Fragment key={i}>{s}</React.Fragment>))}</>;
}

// جعبهٔ جستجو (مشترک بین ویجت و پالت)
export function CafindBox({ onGo, autoFocus = false, onDone, big = false, dropdown = true }) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [cat, setCat] = useState(null);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);
  const [ver, setVer] = useState(0);
  const [built, setBuilt] = useState(false);
  const inputRef = useRef(null), boxRef = useRef(null);
  useDataSync(() => setVer((v) => v + 1));
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);
  const index = useMemo(() => (built ? buildIndex(collectSources()) : []), [built, ver]);
  const open = dropdown && focus;
  const all = useMemo(() => (q.trim() ? search(index, q, { limit: 60, perCat: 8 }) : []), [index, q]);
  const counts = useMemo(() => countByCategory(all), [all]);
  const results = cat ? all.filter((r) => r.cat === cat) : all;
  const tokens = useMemo(() => normalize(q).split(" ").filter(Boolean), [q]);
  const answer = useMemo(() => (q.trim() ? instantAnswer(q) : null), [q]);
  useEffect(() => { setActive(0); }, [q, cat]);
  useEffect(() => {
    if (!focus) return undefined;
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setFocus(false); };
    document.addEventListener("pointerdown", h); return () => document.removeEventListener("pointerdown", h);
  }, [focus]);
  const remember = (text) => { const t = String(text || "").trim(); if (!t) return; const n = [t, ...readRecent().filter((x) => x !== t)].slice(0, 6); writeRecent(n); setRecent(n); };
  const go = (r) => { remember(q); setFocus(false); setQ(""); setCat(null); onGo && onGo(r.go, r); onDone && onDone(); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { if (results[active]) { e.preventDefault(); go(results[active]); } }
    else if (e.key === "Escape") { if (q) setQ(""); else { setFocus(false); inputRef.current?.blur(); onDone && onDone(); } }
  };
  useEffect(() => { const el = boxRef.current?.querySelector('[data-active="1"]'); el?.scrollIntoView?.({ block: "nearest" }); }, [active, results.length]);
  const showPanel = open && (q.trim() || recent.length > 0 || true);
  return (
    <div ref={boxRef} data-testid="cafind-box" className="cafind-box" style={{ position: "relative", width: "100%" }}>
      <div className="cafind-field" style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--cafind-field,var(--bg-app))", border: `1px solid ${focus ? "#38bdf8" : "var(--border)"}`, borderRadius: showPanel && dropdown ? (big ? 26 : 20) : 999, padding: big ? "0 8px 0 18px" : "0 6px 0 14px", height: big ? 54 : 44, boxShadow: focus ? "0 0 0 3px #38bdf833,0 6px 24px #0004" : "0 2px 10px #0003", transition: "box-shadow .15s,border-color .15s" }}>
        <span aria-hidden="true" style={{ fontSize: big ? 20 : 17, opacity: .85 }}>🔍</span>
        <input ref={inputRef} data-testid="cafind-input" value={q} onChange={(e) => { setQ(e.target.value); setBuilt(true); setFocus(true); }} onFocus={() => { setBuilt(true); setFocus(true); }} onKeyDown={onKey}
          placeholder="جستجو در مشتریان، فاکتورها، انبار، یادآورها، صفحه‌ها…" aria-label="جستجو در کافینو" autoComplete="off" spellCheck={false} role="combobox" aria-expanded={!!showPanel} aria-controls="cafind-results"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: big ? 16 : 14, fontFamily: "inherit", height: "100%" }} />
        {q && <button data-testid="cafind-clear" aria-label="پاک کردن" onClick={() => { setQ(""); inputRef.current?.focus(); }} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, padding: 6 }}>✕</button>}
        <button data-testid="cafind-go" aria-label="جستجو" onClick={() => { if (results[0]) go(results[0]); else inputRef.current?.focus(); }} style={{ background: "linear-gradient(135deg,#0ea5e9,#7c3aed)", color: "#fff", border: "none", borderRadius: 999, width: big ? 42 : 34, height: big ? 42 : 34, cursor: "pointer", fontSize: 15, flexShrink: 0 }}>↵</button>
      </div>
      {showPanel && (
        <div id="cafind-results" role="listbox" data-testid="cafind-panel" className="cafind-panel" style={{ position: "absolute", top: "calc(100% + 6px)", insetInline: 0, zIndex: 40, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 18px 48px #0007", maxHeight: "min(62vh,460px)", overflowY: "auto", padding: 8 }}>
          {!q.trim() && (
            <div>
              {recent.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", padding: "4px 8px" }}><span>جستجوهای اخیر</span><button onClick={() => { writeRecent([]); setRecent([]); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>پاک‌کردن</button></div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 8px 8px" }}>
                {recent.map((r) => <button key={"r" + r} data-testid="cafind-recent" onClick={() => { setQ(r); inputRef.current?.focus(); }} style={chipSt}>🕘 {r}</button>)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "2px 8px" }}>پیشنهاد</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 8px 6px" }}>
                {suggestions().map((s) => <button key={s} data-testid="cafind-suggest" onClick={() => { setQ(s); inputRef.current?.focus(); }} style={chipSt}>{s}</button>)}
              </div>
            </div>)}
          {q.trim() && all.length > 0 && Object.keys(counts).length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "2px 6px 8px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
              <button data-testid="cafind-cat-all" onClick={() => setCat(null)} style={{ ...chipSt, ...(cat === null ? chipOn : {}) }}>همه ({toFA(all.length)})</button>
              {Object.entries(counts).map(([k, n]) => <button key={k} data-testid={"cafind-cat-" + k} onClick={() => setCat(cat === k ? null : k)} style={{ ...chipSt, ...(cat === k ? chipOn : {}) }}>{categoryMeta(k).icon} {categoryMeta(k).label} ({toFA(n)})</button>)}
            </div>)}
          {answer && <div data-testid="cafind-answer" style={{ background: "linear-gradient(135deg,#0ea5e922,#7c3aed22)", border: "1px solid #38bdf855", borderRadius: 12, padding: "10px 14px", margin: "2px 4px 8px" }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{answer.kind === "calc" ? "🧮 " : "📅 "}{answer.sub}</div><div dir="auto" style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{answer.title}</div></div>}
          {q.trim() && all.length === 0 && !answer && <div data-testid="cafind-empty" style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "22px 10px" }}>چیزی برای «{q}» پیدا نشد.<div style={{ fontSize: 11, marginTop: 4, color: "var(--text-dim)" }}>نام مشتری، شمارهٔ فاکتور، شمارهٔ تلفن، مبلغ یا نام کالا را امتحان کنید.</div></div>}
          {results.map((r, i) => (
            <button key={r.key} role="option" aria-selected={i === active} data-testid="cafind-result" data-cat={r.cat} data-active={i === active ? "1" : "0"} onMouseEnter={() => setActive(i)} onClick={() => go(r)}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, textAlign: "start", background: i === active ? "var(--bg-app)" : "transparent", border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "var(--text-primary)", fontFamily: "inherit" }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: (CAT_COLOR[r.cat] || "#475569") + "33", color: CAT_COLOR[r.cat], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{categoryMeta(r.cat).icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Highlight text={r.title} tokens={tokens} /></span>
                {r.sub && <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</span>}
              </span>
              <span style={{ fontSize: 10, color: CAT_COLOR[r.cat], background: (CAT_COLOR[r.cat] || "#475569") + "22", borderRadius: 20, padding: "2px 9px", flexShrink: 0 }}>{categoryMeta(r.cat).label}</span>
            </button>))}
          {q.trim() && all.length > 0 && <div style={{ fontSize: 10.5, color: "var(--text-dim)", textAlign: "center", padding: "6px 0 2px" }}>↑↓ برای حرکت · Enter برای باز کردن · Esc برای بستن</div>}
        </div>)}
    </div>);
}
const chipSt = { background: "var(--bg-app)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };
const chipOn = { background: "#0ea5e9", color: "#fff", borderColor: "transparent" };

// ویجت داشبورد — طراحی شبیه کادر جستجوی موتورهای جستجو، با برند «کافیند»
export function CafindWidget({ onGo }) {
  return (
    <div data-testid="cafind-widget" className="cafind-widget" style={{ position: "relative", borderRadius: 16, padding: "22px 18px 20px", height: "100%", boxSizing: "border-box", background: "radial-gradient(ellipse at 15% 0%,#0ea5e944 0%,transparent 55%),radial-gradient(ellipse at 90% 100%,#7c3aed44 0%,transparent 55%),var(--bg-card)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CafindLogo size={38} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 800, background: "linear-gradient(135deg,#38bdf8,#a78bfa)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{SEARCH_BRAND.fa}</span>
            <span dir="ltr" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: "var(--text-muted)" }}>{SEARCH_BRAND.en}</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{SEARCH_BRAND.tagline}</div>
      </div>
      <div style={{ maxWidth: 640, margin: "0 auto" }}><CafindBox big onGo={onGo} /></div>
    </div>);
}

// پالت سراسری (Ctrl+K)
export function CafindPalette({ onGo, onClose }) {
  return createPortal(
    <div data-testid="cafind-palette" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 400, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "12vh 12px 0" }}>
      <div style={{ width: "100%", maxWidth: 620, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, padding: "14px 14px 16px", boxShadow: "0 30px 80px #000c" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><CafindLogo size={26} /><b style={{ fontSize: 14 }}>{SEARCH_BRAND.fa}</b><span dir="ltr" style={{ fontSize: 10, letterSpacing: 2, color: "var(--text-muted)" }}>{SEARCH_BRAND.en}</span><span style={{ flex: 1 }} /><span style={{ fontSize: 11, color: "var(--text-dim)" }}>Ctrl + K</span></div>
        <CafindBox big autoFocus onGo={onGo} onDone={onClose} />
        <div style={{ minHeight: 330 }} />
      </div>
    </div>, document.body);
}
