// «درخواست‌های سفارش از مینی‌اپ»: مشتری از مینی‌اپ درخواست می‌دهد؛ کافی‌نت‌دار اینجا (یا در مینی‌اپ) می‌پذیرد/رد می‌کند و پاسخ می‌نویسد.
// پذیرفتن می‌تواند هم‌زمان سفارش را در برنامه بسازد (اگر مشتری در برنامه شناخته شود).
import React, { useCallback, useEffect, useState } from "react";
import { toFA } from "../app/core/format.js";
import { miniapp } from "./miniappApi.js";
import { createOrderFromRequest } from "../app/domain/miniappWire.js";
import { card, sub, msgOf, Note, Pill, smallBtn } from "./ui.jsx";

export const REQ_LABEL = { new: "جدید", accepted: "پذیرفته", rejected: "ردشده", done: "انجام‌شده" };
const REQ_COLOR = { new: "#f59e0b", accepted: "#34d399", rejected: "#f87171", done: "#60a5fa" };

function Row({ r, onChange, busy }) {
  const [reply, setReply] = useState(r.reply || ""), [mk, setMk] = useState(true);
  const act = (status) => {
    let orderId;
    if (status === "accepted" && mk && !r.orderId) { try { orderId = createOrderFromRequest(r) || undefined; } catch { orderId = undefined; } }
    return onChange(r.id, { status, reply: reply.trim(), ...(orderId ? { orderId } : {}) }, orderId);
  };
  const open = r.status === "new" || r.status === "accepted";
  return (
    <div data-testid="req-row" style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>{r.service}</b><Pill color={REQ_COLOR[r.status]}>{REQ_LABEL[r.status]}</Pill>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.customer}{r.phone ? ` · ${toFA(r.phone)}` : ""}</span>
        {r.orderId && <Pill color="#a78bfa">سفارش ثبت شد</Pill>}
      </div>
      {r.note && <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{r.note}</div>}
      {open && <>
        <input data-testid="req-reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={300} placeholder="پاسخ به مشتری (اختیاری؛ در مینی‌اپ نمایش داده می‌شود)" style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit", fontSize: 12.5 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {r.status === "new" && <button data-testid="req-accept" disabled={busy} onClick={() => act("accepted")} style={smallBtn("#16a34a")}>پذیرفتن</button>}
          {r.status === "new" && <button data-testid="req-reject" disabled={busy} onClick={() => act("rejected")} style={smallBtn("transparent", "#f87171", { border: "1px solid #f8717188" })}>رد</button>}
          {r.status === "accepted" && <button data-testid="req-done" disabled={busy} onClick={() => act("done")} style={smallBtn("#2563eb")}>انجام شد</button>}
          {r.status === "new" && !r.orderId && <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}><input type="checkbox" checked={mk} onChange={(e) => setMk(e.target.checked)} />هم‌زمان سفارش در برنامه ثبت شود</label>}
        </div>
      </>}
      {!open && r.reply && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>پاسخ: {r.reply}</div>}
    </div>
  );
}

export default function RequestsPanel() {
  const [data, setData] = useState(null), [err, setErr] = useState(""), [note, setNote] = useState(null), [busy, setBusy] = useState(false), [filter, setFilter] = useState("open");
  const load = useCallback(() => miniapp.requests().then((d) => { setData(d); setErr(""); }, (e) => setErr(msgOf(e))), []);
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000); return () => clearInterval(t); }, [load]);
  const change = async (id, body, madeOrder) => {
    setBusy(true); setNote(null);
    try { await miniapp.setRequest(id, body); await load(); setNote({ k: "ok", t: madeOrder ? "وضعیت ثبت و سفارش در برنامه ساخته شد" : body.status === "accepted" && !madeOrder ? "وضعیت ثبت شد (سفارش در برنامه ساخته نشد؛ در صورت نیاز دستی ثبت کنید)" : "وضعیت ثبت شد" }); }
    catch (e) { setNote({ k: "error", t: msgOf(e) }); } finally { setBusy(false); }
  };
  if (err && !data) return null;       // سرور مینی‌اپ را ندارد/مجوز ندارد: بی‌صدا مخفی
  if (!data) return null;
  const items = data.items.filter((r) => filter === "all" || (filter === "open" ? r.status === "new" || r.status === "accepted" : r.status === "rejected" || r.status === "done"));
  return (
    <div style={card} data-testid="req-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>درخواست‌های سفارش از مینی‌اپ</b>
        {data.newCount > 0 && <Pill color="#f59e0b" data-testid="req-new">{toFA(data.newCount)} جدید</Pill>}
        <span style={{ flex: 1 }} />
        {[["open", "باز"], ["done", "بسته‌شده"], ["all", "همه"]].map(([k, t]) => <button key={k} onClick={() => setFilter(k)} style={smallBtn(filter === k ? "var(--accent,#e8590c)" : "var(--border)", filter === k ? "#fff" : "var(--text-secondary)")}>{t}</button>)}
      </div>
      <div style={sub}>مشتریانِ متصل می‌توانند از مینی‌اپ درخواست سفارش بدهند. اینجا یا از داخل مینی‌اپ (بخش کافی‌نت) پاسخ می‌دهید؛ پاسخ شما به مشتری نمایش داده می‌شود.</div>
      {items.length === 0 ? <div style={sub} data-testid="req-empty">درخواستی نیست.</div> : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{items.map((r) => <Row key={r.id + r.status} r={r} busy={busy} onChange={change} />)}</div>}
      {note && <Note kind={note.k}>{note.t}</Note>}
    </div>
  );
}
