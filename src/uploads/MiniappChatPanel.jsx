// گفتگوی کافی‌نت با مشتریان مینی‌اپ (1.84): فهرست رشته‌ها + رشتهٔ باز با پولینگ سبک (۸ ثانیه).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toFA } from "../app/core/format.js";
import { miniapp } from "./miniappApi.js";
import { setMiniExtras } from "./miniReqState.js";
import { card, sub, msgOf, Note, Pill, smallBtn } from "./ui.jsx";

const clock = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${d.toLocaleDateString("fa-IR")} ${toFA(String(d.getHours()).padStart(2, "0"))}:${toFA(String(d.getMinutes()).padStart(2, "0"))}`; };
const inputSt = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", resize: "vertical" };

export function Thread({ thread, onBack, onSent }) {
  const [items, setItems] = useState([]), [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  const last = useRef(0), box = useRef(null), alive = useRef(true);
  const merge = useCallback((add) => { if (!add.length) return; setItems((cur) => { const seen = new Set(cur.map((m) => m.id)); const next = [...cur, ...add.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id); last.current = next[next.length - 1].id; return next; }); }, []);
  const load = useCallback(() => miniapp.chatThread(thread.telegramId, last.current).then((d) => { if (alive.current) { merge(d.items || []); setErr(null); } }, (e) => { if (alive.current) setErr(e); }), [thread.telegramId, merge]);
  useEffect(() => { alive.current = true; last.current = 0; setItems([]); load(); const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 8000); return () => { alive.current = false; clearInterval(t); }; }, [load]);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [items.length]);
  const send = async (e) => { e.preventDefault(); const body = text.trim(); if (!body) return; setBusy(true); setErr(null); try { const m = await miniapp.sendChat(thread.telegramId, body); setText(""); merge([m]); onSent?.(); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <div data-testid="mc-thread" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button data-testid="mc-back" onClick={onBack} style={smallBtn("var(--border)", "var(--text-secondary)")}>→ همهٔ گفتگوها</button>
        <b>{thread.name || "مشتری"}</b>{thread.phone && <span dir="ltr" style={{ fontSize: 12, color: "var(--text-muted)" }}>{toFA(thread.phone)}</span>}
      </div>
      <div ref={box} data-testid="mc-msgs" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, minHeight: 160, overflowY: "auto", background: "var(--bg-app)", borderRadius: 10, padding: 10 }}>
        {items.length === 0 ? <div style={sub}>هنوز پیامی نیست.</div> : items.map((m) => (
          <div key={m.id} data-testid="mc-msg" data-sender={m.sender} style={{ alignSelf: m.sender === "cafe" ? "flex-start" : "flex-end", maxWidth: "78%", background: m.sender === "cafe" ? "var(--accent,#e8590c)" : "var(--bg-card)", color: m.sender === "cafe" ? "#fff" : "var(--text-primary)", borderRadius: 12, padding: "6px 11px", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13 }}>
            {m.body}<div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 3 }}>{m.sender === "cafe" && m.by ? `${m.by} · ` : ""}{clock(m.at)}{m.sender === "cafe" && m.read ? " · ✓✓" : ""}</div>
          </div>))}
      </div>
      <form onSubmit={send} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea data-testid="mc-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={2} placeholder="پاسخ به مشتری…" style={{ ...inputSt, flex: 1 }} />
        <button data-testid="mc-send" disabled={busy || !text.trim()} style={smallBtn("var(--accent,#e8590c)", "#fff", { padding: "9px 18px" })}>{busy ? "…" : "ارسال"}</button>
      </form>
      {err && <Note kind="error">{msgOf(err)}</Note>}
    </div>
  );
}

export default function MiniappChatPanel({ openTg, onClosedTg }) {
  const [data, setData] = useState(null), [err, setErr] = useState(null), [open, setOpen] = useState(null);
  const load = useCallback(() => miniapp.chats().then((d) => { setData(d); setErr(null); setMiniExtras({ unreadChats: d.unread || 0 }); }, (e) => setErr(e)), []);
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (openTg && data) { const t = data.items.find((x) => x.telegramId === openTg); setOpen(t || { telegramId: openTg, name: "", phone: "" }); onClosedTg?.(); } }, [openTg, data]);
  if (open) return <Thread thread={open} onBack={() => { setOpen(null); load(); }} onSent={load} />;
  if (err && !data) return <Note kind="error">{msgOf(err)}</Note>;
  if (!data) return <div style={sub}>در حال بارگذاری…</div>;
  if (!data.items.length) return <div style={sub} data-testid="mc-empty">هنوز گفتگویی نیست. وقتی مشتری از مینی‌اپ (بخش «گفتگو») پیام بدهد اینجا می‌رسد؛ از دکمهٔ «گفتگو» روی هر سفارش هم می‌توانید شروع کنید.</div>;
  return (
    <div data-testid="mc-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.items.map((t) => (
        <button key={t.telegramId} data-testid="mc-item" onClick={() => setOpen(t)} style={{ ...card, padding: "10px 14px", gap: 4, textAlign: "right", cursor: "pointer", border: "1px solid var(--border)", fontFamily: "inherit", color: "var(--text-primary)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ fontSize: 13.5 }}>{t.name || "مشتری"}</b>{t.unread > 0 && <Pill color="#f59e0b">{toFA(t.unread)} جدید</Pill>}<span style={{ flex: 1 }} /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{clock(t.last.at)}</span></div>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{t.last.sender === "cafe" ? "شما: " : ""}{t.last.body}</div>
        </button>))}
    </div>
  );
}
