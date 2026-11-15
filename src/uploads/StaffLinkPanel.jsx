// «ورود کافی‌نت در مینی‌اپ»: ساخت کد اتصال یک‌بارمصرف + فهرست حساب‌های تلگرامِ متصل (اعلان، قطع اتصال).
import React, { useCallback, useEffect, useState } from "react";
import { BTN } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { miniapp } from "./miniappApi.js";
import { secondsLeft } from "./miniappOrders.js";
import { card, sub, msgOf, Note, Pill, smallBtn } from "./ui.jsx";

const fmtCountdown = (s) => `${toFA(Math.floor(s / 60))}:${toFA(String(s % 60).padStart(2, "0"))}`;

export default function StaffLinkPanel() {
  const [links, setLinks] = useState(null), [err, setErr] = useState(""), [note, setNote] = useState(null), [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null), [left, setLeft] = useState(0);
  const load = useCallback(() => miniapp.staffLinks().then((d) => { setLinks(d); setErr(""); }, (e) => setErr(msgOf(e))), []);
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!code) return undefined;
    const tick = () => { const s = secondsLeft(code.expiresAt); setLeft(s); if (!s) setCode(null); };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [code]);
  const run = async (fn, okText) => { setBusy(true); setNote(null); try { await fn(); await load(); if (okText) setNote({ k: "ok", t: okText }); } catch (e) { setNote({ k: "error", t: msgOf(e) }); } finally { setBusy(false); } };
  const make = () => run(async () => { const d = await miniapp.createStaffCode(); setCode(d); }, "");
  const copy = () => navigator.clipboard?.writeText(code.code.replace("-", "")).then(() => setNote({ k: "ok", t: "کد کپی شد" }), () => setNote({ k: "error", t: "کپی نشد؛ کد را دستی بنویسید" }));
  if (err && !links) return <div style={card} data-testid="staff-card"><b style={{ fontSize: 15 }}>ورود کافی‌نت در مینی‌اپ</b><Note kind="error">{err}</Note></div>;
  if (!links) return null;
  return (
    <div style={card} data-testid="staff-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>ورود کافی‌نت در مینی‌اپ تلگرام</b>
        <Pill color="#60a5fa">{toFA(links.items.length)} حساب متصل</Pill>
      </div>
      <div style={sub}>با این بخش، حساب کافینوی شما به تلگرام وصل می‌شود تا از گوشی سفارش‌ها و فایل‌های مشتری را ببینید، وضعیت را عوض کنید و درخواست‌های مشتری را پاسخ دهید. دسترسی‌ها همان دسترسی‌های حساب شما در برنامه است.</div>
      <div style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {code ? <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div dir="ltr" data-testid="staff-code" style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, fontFamily: "monospace" }}>{code.code}</div>
            <Pill color="#f59e0b" data-testid="staff-left">{fmtCountdown(left)} مانده</Pill>
            <button onClick={copy} style={smallBtn("var(--border)", "var(--text-secondary)")}>کپی کد</button>
          </div>
          <ol style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, lineHeight: 1.9, color: "var(--text-secondary)" }}>
            <li>ربات کافینو{code.botUsername ? <> (<span dir="ltr">@{code.botUsername}</span>)</> : ""} را در تلگرام باز کنید و Start بزنید.</li>
            <li>دکمهٔ «ورود کافی‌نت» را بزنید، سپس بخش «ورود به حساب کافی‌نت» را انتخاب کنید.</li>
            <li>این کد را وارد کنید. کد فقط یک بار و ۱۰ دقیقه معتبر است و ساخت کد تازه، کد قبلی را باطل می‌کند.</li>
          </ol>
        </> : <div><button data-testid="staff-make" disabled={busy} onClick={make} style={BTN("var(--accent,#e8590c)", "#fff")}>ساخت کد اتصال</button></div>}
      </div>
      {links.items.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="staff-list">
        {links.items.map((l) => (
          <div key={l.userId} data-testid="staff-row" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "var(--bg-app)", borderRadius: 10, padding: "8px 12px" }}>
            <b style={{ fontSize: 13 }}>{l.name}</b><Pill color="#a78bfa">{l.roleLabel}</Pill>{l.mine && <Pill color="#34d399">شما</Pill>}
            <span dir="ltr" style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.telegram}</span>
            <span style={{ flex: 1 }} />
            <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}><input type="checkbox" checked={l.notify} disabled={busy} onChange={(e) => run(() => miniapp.setStaffNotify(l.userId, e.target.checked), "")} />اعلان تلگرام</label>
            {l.notify && !l.canMessage && <span style={{ fontSize: 11, color: "#fbbf24" }} title="تا کاربر در تلگرام به ربات Start نزند، ربات نمی‌تواند پیام بفرستد">باید در ربات Start بزند</span>}
            <button data-testid="staff-unlink" disabled={busy} onClick={() => { if (window.confirm(`اتصال تلگرام «${l.name}» قطع شود؟`)) run(() => miniapp.unlinkStaff(l.userId), "اتصال قطع شد"); }} style={smallBtn("transparent", "#f87171", { border: "1px solid #f8717188" })}>قطع اتصال</button>
          </div>))}
      </div>}
      {note && <Note kind={note.k}>{note.t}</Note>}
    </div>
  );
}
