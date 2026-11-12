// QR موقت برای هر سفارش/جلسهٔ کاری: ساخت، نمایش QR با شمارندهٔ انقضا، بستن، و رفتن به فایل‌های همان QR.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import Icon from "../components/Icon.jsx";
import { BTN, INP } from "../app/core/constants.js";
import { toFA, escapeHtml } from "../app/core/format.js";
import { printFontCss, printWhenReady } from "../app/core/printFont.js";
import { useOrders } from "../app/pages/orders.jsx";
import { useCustomers } from "../app/pages/customers.jsx";
import { qrSvg } from "./qr.js";
import { uploads, publicUploadUrl, timeLeft, TTL_OPTIONS } from "./uploadsApi.js";
import { card, sub, msgOf, Note, Pill, Modal } from "./ui.jsx";

const orderRef = (o) => String(o.serverId ?? o.id);
const custName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.phone || "مشتری";

/** نشانی کامل یک QR موقت (همان منطق QR دائمی). */
export const sessionUrl = (s) => publicUploadUrl({ code: s.code, url: s.url });

function SessionQr({ session, shopName, onClose, onClosed }) {
  const url = sessionUrl(session);
  const svg = useMemo(() => (url ? qrSvg(url, { ecc: "Q" }) : ""), [url]);
  const [now, setNow] = useState(Date.now()), [copied, setCopied] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const left = timeLeft(session.expiresAt, now), live = session.state === "active" && new Date(session.expiresAt).getTime() > now;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt("نشانی را کپی کنید:", url); } };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { setErr("مرورگر بازکردن پنجرهٔ جدید را مسدود کرد."); return; }
    const t = escapeHtml(session.label || session.orderLabel || "ارسال فایل");
    w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>QR — ${t}</title><style>${printFontCss()}@page{size:A5;margin:0}body{margin:0;font-family:Vazirmatn,Tahoma,sans-serif;text-align:center;padding:14mm 10mm;color:#2b1610}h1{font-size:20pt;margin:0 0 4mm}.q{width:100mm;height:100mm;margin:6mm auto;padding:4mm;border:2.5mm solid #e8590c;border-radius:8mm}.q svg{width:100%;height:100%}p{font-size:12pt;margin:3mm 0}.u{direction:ltr;font-size:9pt;color:#7a5a4a;word-break:break-all}@media print{.np{display:none}}</style></head><body><h1>${escapeHtml(shopName || "کافی‌نت")}</h1><p><b>${t}</b></p><div class="q">${svg}</div><p>برای ارسال فایل، دوربین گوشی را روی QR بگیرید</p><p>اعتبار تا ${escapeHtml(left)} دیگر</p><div class="u">${escapeHtml(url)}</div><button class="np" onclick="window.print()">چاپ</button></body></html>`);
    w.document.close(); printWhenReady(w);
  };
  const close = async () => {
    if (!window.confirm("این QR بسته شود؟ مشتری دیگر نمی‌تواند با آن فایل بفرستد (فایل‌های رسیده می‌مانند).")) return;
    setBusy(true); try { await uploads.closeSession(session.id); onClosed?.(); } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`QR موقت — ${session.label || session.orderLabel || "ارسال فایل"}`} onClose={onClose} width={560} testid="up-session-modal">
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <div data-testid="up-session-qr" style={{ width: 220, height: 220, borderRadius: 12, overflow: "hidden", border: "3px solid #e8590c", background: "#fff", opacity: live ? 1 : .35 }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg width="100%" height="100%" ') }} />
        <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 6 }}>
          {session.orderLabel && <div style={{ fontSize: 13 }}>سفارش: <b>{session.orderLabel}</b></div>}
          {session.customerLabel && <div style={{ fontSize: 13 }}>مشتری: <b>{session.customerLabel}</b></div>}
          <div data-testid="up-session-left" style={{ fontSize: 13 }}>{live ? <>اعتبار باقی‌مانده: <b>{toFA(left)}</b></> : <Pill color="#f87171">{session.state === "closed" ? "بسته شد" : "منقضی شد"}</Pill>}</div>
          <div style={sub}>حداکثر {toFA(session.maxFiles)} فایل{session.maxFileMb ? ` — هر فایل تا ${toFA(session.maxFileMb)} مگابایت` : ""}. فایل‌های این QR خودکار به همین سفارش/مشتری وصل می‌شوند.</div>
        </div>
      </div>
      <div dir="ltr" style={{ fontSize: 12, background: "var(--bg-app)", borderRadius: 8, padding: "6px 10px", wordBreak: "break-all", textAlign: "left" }}>{url}</div>
      {err && <Note kind="error">{err}</Note>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={print} style={BTN("var(--accent,#e8590c)", "#fff")}>🖨️ چاپ</button>
        <button onClick={copy} style={BTN("var(--border)", "var(--text-secondary)")}>{copied ? "کپی شد ✓" : "کپی نشانی"}</button>
        {live && <button data-testid="up-session-close" disabled={busy} onClick={close} style={BTN("transparent", "#f87171", { border: "1px solid #f8717188" })}>بستن QR</button>}
      </div>
    </Modal>
  );
}

export default function SessionsPanel({ shopName, onFilter, activeFilter, onChanged }) {
  const [orders] = useOrders(), [customers] = useCustomers();
  const [sessions, setSessions] = useState([]), [open, setOpen] = useState(false), [show, setShow] = useState(null), [err, setErr] = useState(""), [all, setAll] = useState(false);
  const [f, setF] = useState({ orderId: "", free: "", customerId: "", ttl: 1440, maxFiles: 20 });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { { const r = await uploads.sessions(all ? { all: 1 } : {}); setSessions(Array.isArray(r) ? r : r?.data || []); }; setErr(""); } catch (e) { setErr(msgOf(e)); } }, [all]);
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000); return () => clearInterval(t); }, [load]);
  const openOrders = useMemo(() => (orders || []).filter((o) => !["delivered", "cancelled", "canceled", "done"].includes(o.status)).slice(-60).reverse(), [orders]);
  const create = async () => {
    const o = openOrders.find((x) => orderRef(x) === f.orderId) || (orders || []).find((x) => orderRef(x) === f.orderId);
    const c = (customers || []).find((x) => String(x.id) === f.customerId) || (o && (customers || []).find((x) => String(x.id) === String(o.customerId)));
    const label = f.free.trim() || (o ? o.title : "") || (c ? custName(c) : "");
    if (!label) { setErr("یک سفارش انتخاب کنید یا عنوان جلسه را بنویسید."); return; }
    setBusy(true); setErr("");
    try {
      const s = await uploads.createSession({ label, orderRef: o ? orderRef(o) : "", orderLabel: o ? o.title || "" : "", customerRef: c ? String(c.id) : "", customerLabel: c ? custName(c) : (o?.customerName || ""), ttlMinutes: Number(f.ttl), maxFiles: Number(f.maxFiles) || 20 });
      setOpen(false); setF({ orderId: "", free: "", customerId: "", ttl: 1440, maxFiles: 20 }); setShow(s); await load(); onChanged?.();
    } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); }
  };
  return (
    <div style={card} data-testid="up-sessions">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>QR موقت برای سفارش / جلسه</b>
        <button data-testid="up-session-new" onClick={() => setOpen((v) => !v)} style={BTN("#2563eb", "#fff", { padding: "5px 12px", fontSize: 12 })}>+ ساخت QR موقت</button>
        <label style={{ ...sub, display: "flex", gap: 4, alignItems: "center", marginInlineStart: "auto" }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />نمایش بسته/منقضی‌ها</label>
      </div>
      <div style={sub}>برای هر سفارش یک QR جدا بسازید؛ مشتری با اسکن آن فایل می‌فرستد و فایل مستقیم به همان سفارش وصل می‌شود. QR بعد از انقضا یا بستن، از کار می‌افتد.</div>
      {open && (
        <div data-testid="up-session-form" style={{ background: "var(--bg-app)", borderRadius: 12, padding: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 220px", fontSize: 12, color: "var(--text-muted)" }}>سفارش
            <select data-testid="up-session-order" value={f.orderId} onChange={(e) => setF({ ...f, orderId: e.target.value })} style={INP}>
              <option value="">— بدون سفارش (جلسهٔ آزاد) —</option>
              {openOrders.map((o) => <option key={orderRef(o)} value={orderRef(o)}>{o.title || "سفارش"}{o.customerName ? ` — ${o.customerName}` : ""}</option>)}
            </select></label>
          <label style={{ flex: "1 1 200px", fontSize: 12, color: "var(--text-muted)" }}>مشتری (اختیاری)
            <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} style={INP}>
              <option value="">— از سفارش / بدون مشتری —</option>
              {(customers || []).slice(0, 300).map((c) => <option key={c.id} value={String(c.id)}>{custName(c)}{c.phone ? ` (${toFA(c.phone)})` : ""}</option>)}
            </select></label>
          <label style={{ flex: "1 1 200px", fontSize: 12, color: "var(--text-muted)" }}>عنوان جلسه (اگر سفارش ندارید)
            <input data-testid="up-session-label" maxLength={80} value={f.free} onChange={(e) => setF({ ...f, free: e.target.value })} style={INP} placeholder="مثلاً: پایان‌نامهٔ آقای احمدی" /></label>
          <label style={{ flex: "1 1 120px", fontSize: 12, color: "var(--text-muted)" }}>اعتبار QR
            <select data-testid="up-session-ttl" value={f.ttl} onChange={(e) => setF({ ...f, ttl: e.target.value })} style={INP}>{TTL_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select></label>
          <label style={{ flex: "1 1 120px", fontSize: 12, color: "var(--text-muted)" }}>حداکثر تعداد فایل
            <input inputMode="numeric" value={f.maxFiles} onChange={(e) => setF({ ...f, maxFiles: Math.min(100, Number(String(e.target.value).replace(/\D/g, "")) || 1) })} style={INP} /></label>
          <div style={{ flex: "1 1 100%", display: "flex", gap: 8 }}>
            <button data-testid="up-session-create" disabled={busy} onClick={create} style={BTN("#16a34a", "#fff", { opacity: busy ? .6 : 1 })}>ساخت QR</button>
            <button onClick={() => setOpen(false)} style={BTN("var(--border)", "var(--text-secondary)")}>انصراف</button>
          </div>
        </div>
      )}
      {err && <Note kind="error">{err}</Note>}
      {sessions.length === 0 ? <div style={sub} data-testid="up-session-empty">{all ? "QR موقتی ساخته نشده است." : "QR موقت فعالی وجود ندارد."}</div>
        : sessions.map((s) => (
          <div key={s.id} data-testid="up-session-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
            <Icon name="QrCode" size={16} style={{ color: "var(--text-muted)" }} />
            <span style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.label}>{s.label}</span>
            <span style={sub}>{toFA(s.uploads)} فایل</span>
            {s.state === "active" ? <Pill color="#34d399">{toFA(timeLeft(s.expiresAt))} مانده</Pill> : <Pill color="#9ca3af">{s.state === "closed" ? "بسته" : "منقضی"}</Pill>}
            <button onClick={() => setShow(s)} style={BTN("var(--border)", "var(--text-secondary)", { padding: "4px 10px", fontSize: 12 })}>نمایش QR</button>
            <button data-testid="up-session-files" aria-pressed={activeFilter === s.id} onClick={() => onFilter?.(activeFilter === s.id ? "" : s.id)} style={BTN(activeFilter === s.id ? "#2563eb" : "var(--bg-app)", activeFilter === s.id ? "#fff" : "var(--text-secondary)", { padding: "4px 10px", fontSize: 12 })}>فایل‌ها</button>
          </div>
        ))}
      {show && <SessionQr session={show} shopName={shopName} onClose={() => setShow(null)} onClosed={() => { setShow(null); load(); onChanged?.(); }} />}
    </div>
  );
}
