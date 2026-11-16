// «سفارش‌های مینی‌اپ» (1.83) — بخش مستقل در منوی فروشگاه: دریافت و مدیریت سفارش‌هایی که مشتری‌ها از مینی‌اپ می‌فرستند.
// وضعیت‌ها: جدید ← پذیرفته ← انجام‌شده (یا ردشده). پذیرفتن می‌تواند هم‌زمان سفارش را در برنامه بسازد (مشتری ناشناخته هم ساخته می‌شود).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toFA, currencyLabel, getCurrencyUnit } from "../app/core/format.js";
import { isApiConnected } from "../services/api/client.js";
import { miniapp } from "./miniappApi.js";
import { createOrderFromRequest, ensureCustomerForRequest } from "../app/domain/miniappWire.js";
import { reqCounts, filterRequests } from "./miniappOrders.js";
import { setMiniReqNewCount } from "./miniReqState.js";
import { parseAmountInput, faDate } from "../gl/glCore.js";
import { card, sub, msgOf, Note, Pill, smallBtn } from "./ui.jsx";

export const REQ_LABEL = { new: "جدید", accepted: "پذیرفته", rejected: "ردشده", done: "انجام‌شده" };
const REQ_COLOR = { new: "#f59e0b", accepted: "#34d399", rejected: "#f87171", done: "#60a5fa" };
const QUICK = ["پذیرفته شد؛ به‌زودی آماده می‌شود.", "لطفاً فایل یا توضیح بیشتر را ارسال کنید.", "فعلاً امکان انجام این مورد نیست.", "آماده است؛ می‌توانید مراجعه کنید."];
const FILTERS = [["new", "جدید"], ["accepted", "در حال انجام"], ["done", "انجام‌شده"], ["rejected", "ردشده"], ["all", "همه"]];
const inputSt = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", color: "var(--text-primary)", fontSize: 12.5, fontFamily: "inherit" };

const when = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${faDate(d.toISOString().slice(0, 10))} ${toFA(String(d.getHours()).padStart(2, "0"))}:${toFA(String(d.getMinutes()).padStart(2, "0"))}`; };

function Row({ r, busy, onChange, onSell, onOpenOrders }) {
  const [reply, setReply] = useState(r.reply || ""), [mk, setMk] = useState(true), [amt, setAmt] = useState("");
  const [copied, setCopied] = useState(false);
  const open = r.status === "new" || r.status === "accepted";
  const act = (status) => {
    let orderId;
    if (status === "accepted" && mk && !r.orderId) {
      const a = amt.trim() ? parseAmountInput(amt, getCurrencyUnit()) : 0;
      try { orderId = createOrderFromRequest(r, { amount: a ?? 0 }) || undefined; } catch { orderId = undefined; }
    }
    return onChange(r.id, { status, reply: reply.trim(), ...(orderId ? { orderId } : {}) }, orderId);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(r.phone); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* کلیپ‌بورد در دسترس نیست */ } };
  return (
    <div data-testid="mo-row" data-status={r.status} style={{ background: "var(--bg-app)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, borderRight: `3px solid ${REQ_COLOR[r.status] || "var(--border)"}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b data-testid="mo-service" style={{ fontSize: 14 }}>{r.service}</b>
        <Pill color={REQ_COLOR[r.status]}>{REQ_LABEL[r.status]}</Pill>
        {r.orderId && <Pill color="#a78bfa">سفارش در برنامه ثبت شد</Pill>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{when(r.createdAt)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
        <span>👤 {r.customer || "بدون نام"}</span>
        {r.phone && <a href={`tel:${r.phone}`} dir="ltr" style={{ color: "var(--accent-light,#60a5fa)", textDecoration: "none" }}>{toFA(r.phone)}</a>}
        {r.phone && <button onClick={copy} style={smallBtn("var(--border)", "var(--text-secondary)")}>{copied ? "کپی شد ✓" : "کپی شماره"}</button>}
      </div>
      {r.note && <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.9, background: "var(--bg-card)", borderRadius: 8, padding: "6px 10px" }}>{r.note}</div>}
      {open && <>
        <input data-testid="mo-reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={300} placeholder="پاسخ به مشتری (اختیاری؛ در مینی‌اپ نشان داده می‌شود)" style={inputSt} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{QUICK.map((q) => <button key={q} data-testid="mo-quick" onClick={() => setReply(q)} style={{ ...smallBtn("transparent", "var(--text-muted)"), border: "1px dashed var(--border)", fontWeight: 400 }}>{q}</button>)}</div>
        {r.status === "new" && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}><input data-testid="mo-make-order" type="checkbox" checked={mk} onChange={(e) => setMk(e.target.checked)} />هم‌زمان سفارش در برنامه ثبت شود</label>
          {mk && <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}>مبلغ ({currencyLabel()}، اختیاری)<input data-testid="mo-amount" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="numeric" style={{ ...inputSt, width: 130 }} /></label>}
        </div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {r.status === "new" && <button data-testid="mo-accept" disabled={busy} onClick={() => act("accepted")} style={smallBtn("#16a34a")}>پذیرفتن</button>}
          {r.status === "new" && <button data-testid="mo-reject" disabled={busy} onClick={() => act("rejected")} style={smallBtn("transparent", "#f87171", { border: "1px solid #f8717188" })}>رد</button>}
          {r.status === "accepted" && <button data-testid="mo-done" disabled={busy} onClick={() => act("done")} style={smallBtn("#2563eb")}>انجام شد</button>}
          {r.status === "accepted" && r.orderId && <button data-testid="mo-open-order" onClick={onOpenOrders} style={smallBtn("var(--border)", "var(--text-secondary)")}>مشاهده در «فروش»</button>}
          {r.status === "accepted" && <button data-testid="mo-sell" disabled={busy} onClick={() => onSell?.(r)} style={smallBtn("#7c3aed")}>🌐 ثبت فروش آنلاین</button>}
        </div>
      </>}
      {!open && r.reply && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>پاسخ شما: {r.reply}</div>}
    </div>
  );
}

export default function MiniappOrdersPage({ onSell, onOpenOrders }) {
  const [data, setData] = useState(null), [err, setErr] = useState(null), [note, setNote] = useState(null), [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("new"), [q, setQ] = useState(""), [pickedAuto, setPickedAuto] = useState(false);
  const connected = isApiConnected();
  const load = useCallback(() => miniapp.requests().then((d) => { setData(d); setErr(null); setMiniReqNewCount(d.newCount || 0); }, (e) => setErr(e)), []);
  useEffect(() => {
    if (!connected) return undefined;
    load(); const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    return () => clearInterval(t);
  }, [load, connected]);
  const items = data?.items || [];
  const counts = useMemo(() => reqCounts(items), [items]);
  // اگر سفارش جدید نیست، به‌جای صفحهٔ خالی «همه» را نشان بده (فقط یک بار پس از اولین بارگذاری)
  useEffect(() => { if (data && !pickedAuto) { setPickedAuto(true); if (counts.new === 0 && counts.all > 0) setFilter("all"); } }, [data, pickedAuto, counts]);
  const shown = useMemo(() => filterRequests(items, { filter, q }), [items, filter, q]);
  const change = async (id, body, madeOrder) => {
    setBusy(true); setNote(null);
    try {
      await miniapp.setRequest(id, body); await load();
      setNote({ k: "ok", t: madeOrder ? "وضعیت ثبت شد و سفارش در برنامه ساخته شد" : body.status === "accepted" ? "وضعیت ثبت شد (سفارشی در برنامه ساخته نشد)" : "وضعیت ثبت شد" });
    } catch (e) { setNote({ k: "error", t: msgOf(e) }); } finally { setBusy(false); }
  };
  const sell = (r) => { const c = ensureCustomerForRequest(r); onSell?.(r, c ? String(c.id) : ""); };
  const denied = err && (err.status === 401 || err.status === 403), off = err && err.status === 503;
  return (
    <div data-testid="miniapp-orders-page" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 980 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontSize: 17 }}>📱 سفارش‌های مینی‌اپ</b>
          {counts.new > 0 && <Pill color="#f59e0b" data-testid="mo-new-count">{toFA(counts.new)} جدید</Pill>}
          <span style={{ flex: 1 }} />
          {connected && <button data-testid="mo-refresh" onClick={load} style={smallBtn("var(--border)", "var(--text-secondary)")}>↻ به‌روزرسانی</button>}
        </div>
        <div style={sub}>سفارش‌ها و درخواست‌هایی که مشتری‌ها از مینی‌اپ تلگرام می‌فرستند اینجا می‌رسد. پذیرفتن، رد یا «انجام شد» را اینجا (یا از بخش کافی‌نت مینی‌اپ) بزنید؛ پاسخ شما در مینی‌اپ به مشتری نشان داده می‌شود.</div>
      </div>
      {!connected && <Note kind="warn" data-testid="mo-offline">برای دریافت سفارش‌های مینی‌اپ، برنامه باید به سرور وصل باشد (تنظیمات ← اتصال به سرور). مینی‌اپ را هم از «دریافت فایل از مشتری ← مینی‌اپ مشتریان» فعال کنید.</Note>}
      {connected && denied && <Note kind="warn" data-testid="mo-denied">این حساب اجازهٔ دیدن سفارش‌های مینی‌اپ را ندارد (مجوز «مشاهدهٔ فایل‌های مشتری»).</Note>}
      {connected && off && <Note kind="warn" data-testid="mo-off">مینی‌اپ روی سرور فعال نیست. از «دریافت فایل از مشتری ← مینی‌اپ مشتریان» فعالش کنید.</Note>}
      {connected && err && !denied && !off && !data && <Note kind="error">{msgOf(err)}</Note>}
      {connected && data && <div style={card}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {FILTERS.map(([k, t]) => <button key={k} data-testid={`mo-filter-${k}`} onClick={() => setFilter(k)} style={smallBtn(filter === k ? "var(--accent,#e8590c)" : "var(--border)", filter === k ? "#fff" : "var(--text-secondary)")}>{t} ({toFA(counts[k])})</button>)}
          <span style={{ flex: 1 }} />
          <input data-testid="mo-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو: نام، موبایل، خدمت…" style={{ ...inputSt, minWidth: 180 }} />
        </div>
        {shown.length === 0
          ? <div style={sub} data-testid="mo-empty">{items.length === 0 ? "هنوز سفارشی از مینی‌اپ نرسیده است." : "موردی با این فیلتر پیدا نشد."}</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{shown.map((r) => <Row key={r.id + r.status} r={r} busy={busy} onChange={change} onSell={sell} onOpenOrders={onOpenOrders} />)}</div>}
        {note && <Note kind={note.k} data-testid="mo-note">{note.t}</Note>}
      </div>}
    </div>
  );
}
