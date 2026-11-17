// مدیریت فایل‌های دریافتی: جستجو، مرتب‌سازی، فیلتر، انتخاب چندتایی، حذف گروهی (با مجوز)، تغییر نام، «نگه‌داری ویژه»، اتصال به سفارش/مشتری،
// پیش‌نمایش (PDF/تصویر/متن) + پیش‌نمایش چاپ، ابزارهای PDF، دانلود. هر ۲۰ ثانیه خودکار تازه می‌شود.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Icon from "../components/Icon.jsx";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { formatLogTimestamp } from "../app/core/activity.js";
import { uploads, SORTS, STATUS_LABEL, STATUS_COLOR, STATUSES, fmtSize, groupBatches, downloadUpload, fileKind } from "./uploadsApi.js";
import { setUploadsNewCount } from "./uploadsBadge.js";
import { useOrders } from "../app/pages/orders.jsx";
import { useCustomers } from "../app/pages/customers.jsx";
import { addUploadSenderToCustomers } from "../app/domain/miniappWire.js";
import { findCustomerForRequest } from "./miniappOrders.js";
import FilePreview from "./FilePreview.jsx";
import PdfToolsDialog, { availableTools } from "./PdfToolsDialog.jsx";
import { card, sub, msgOf, Note, Pill, Modal, smallBtn } from "./ui.jsx";

const iconBtn = (extra = {}) => ({ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 8, padding: "4px 7px", cursor: "pointer", display: "inline-flex", alignItems: "center", fontFamily: "inherit", fontSize: 12, ...extra });

/** «افزودن به مشتریان» با یک دکمه؛ اگر فرستنده (با موبایل) از قبل مشتری باشد، نشان «مشتری است» می‌دهد. */
function AddSenderButton({ b, customers, onAdded }) {
  const probe = { customer: b.senderName || "", phone: b.senderPhone || "" };
  const known = findCustomerForRequest(probe, customers || []);
  if (!probe.phone && !probe.customer.trim()) return null;
  if (known) return <Pill color="#34d399" data-testid="up-sender-known">✓ مشتری است</Pill>;
  return <button data-testid="up-add-customer" onClick={() => { const r = addUploadSenderToCustomers({ name: b.senderName || "", phone: b.senderPhone || "" }); if (r) onAdded(r.created ? `«${[r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ")}» به مشتریان اضافه شد.` : "این مشتری از قبل در لیست بود."); }} style={smallBtn("#2563eb")}>➕ افزودن به مشتریان</button>;
}

function LinkDialog({ target, onClose, onDone }) {
  const [orders] = useOrders(), [customers] = useCustomers();
  const [orderId, setOrderId] = useState(""), [custId, setCustId] = useState(""), [orderFree, setOrderFree] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const ordList = useMemo(() => (orders || []).slice(-80).reverse(), [orders]);
  const save = async (clear = false) => {
    setBusy(true); setErr("");
    try {
      const o = ordList.find((x) => String(x.serverId ?? x.id) === orderId), c = (customers || []).find((x) => String(x.id) === custId) || (o && (customers || []).find((x) => String(x.id) === String(o.customerId)));
      const body = clear ? { orderRef: "", orderLabel: "", customerRef: "", customerLabel: "" }
        : { orderRef: o ? String(o.serverId ?? o.id) : "", orderLabel: o ? o.title || "" : orderFree.trim(), customerRef: c ? String(c.id) : "", customerLabel: c ? `${c.firstName || ""} ${c.lastName || ""}`.trim() : (o?.customerName || "") };
      if (!clear && !body.orderLabel && !body.customerLabel) { setErr("یک سفارش یا مشتری انتخاب کنید."); setBusy(false); return; }
      await uploads.link({ ...(target.batchId ? { batchId: target.batchId } : { ids: target.ids }), ...body });
      onDone(); onClose();
    } catch (e) { setErr(msgOf(e)); setBusy(false); }
  };
  return (
    <Modal title={target.title || "اتصال به سفارش / مشتری"} onClose={onClose} width={520} testid="up-link">
      <label style={{ fontSize: 12, color: "var(--text-muted)" }}>سفارش
        <select data-testid="up-link-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} style={INP}><option value="">—</option>{ordList.map((o) => <option key={String(o.serverId ?? o.id)} value={String(o.serverId ?? o.id)}>{o.title || "سفارش"}{o.customerName ? ` — ${o.customerName}` : ""}</option>)}</select></label>
      {!orderId && <label style={{ fontSize: 12, color: "var(--text-muted)" }}>یا عنوان آزاد (مثلاً «پروژهٔ آقای احمدی»)<input maxLength={120} value={orderFree} onChange={(e) => setOrderFree(e.target.value)} style={INP} /></label>}
      <label style={{ fontSize: 12, color: "var(--text-muted)" }}>مشتری
        <select data-testid="up-link-customer" value={custId} onChange={(e) => setCustId(e.target.value)} style={INP}><option value="">{orderId ? "— از سفارش —" : "—"}</option>{(customers || []).slice(0, 300).map((c) => <option key={c.id} value={String(c.id)}>{`${c.firstName || ""} ${c.lastName || ""}`.trim() || c.phone}{c.phone ? ` (${toFA(c.phone)})` : ""}</option>)}</select></label>
      {err && <Note kind="error">{err}</Note>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button data-testid="up-link-save" disabled={busy} onClick={() => save(false)} style={BTN("#2563eb", "#fff")}>ذخیره</button>
        <button disabled={busy} onClick={() => save(true)} style={BTN("transparent", "#f87171", { border: "1px solid #f8717188" })}>رفع اتصال</button>
        <button onClick={onClose} style={BTN("var(--border)", "var(--text-secondary)")}>انصراف</button>
      </div>
    </Modal>
  );
}

function FileRow({ f, sel, onSel, canManage, showScan, onChanged, onError, onPreview, onTools, onLink }) {
  const [busy, setBusy] = useState(false), [ren, setRen] = useState(null);
  const act = async (fn) => { setBusy(true); try { await fn(); } catch (e) { onError(msgOf(e)); } finally { setBusy(false); } };
  const canTools = availableTools([f]).length > 0;
  const doRename = () => act(async () => { const n = ren.trim(); if (n && n !== f.name) await uploads.rename(f.id, n); setRen(null); onChanged(); });
  return (
    <div data-testid="up-file" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
      <input type="checkbox" data-testid="up-sel" aria-label={`انتخاب ${f.name}`} checked={!!sel} onChange={(e) => onSel(f.id, e.target.checked)} />
      <Icon name="FileText" size={16} style={{ color: "var(--text-muted)", flex: "none" }} />
      {ren !== null
        ? <span style={{ flex: "1 1 200px", display: "flex", gap: 4 }}><input data-testid="up-rename-input" dir="ltr" autoFocus value={ren} maxLength={120} onChange={(e) => setRen(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doRename(); if (e.key === "Escape") setRen(null); }} style={{ ...INP, marginTop: 0, padding: "4px 8px", fontSize: 12.5, flex: 1 }} /><button data-testid="up-rename-ok" disabled={busy} onClick={doRename} style={smallBtn("#16a34a")}>✓</button><button onClick={() => setRen(null)} style={smallBtn("var(--border)", "var(--text-secondary)")}>×</button></span>
        : <button type="button" data-testid="up-open" onClick={onPreview} title="پیش‌نمایش" dir="ltr" style={{ all: "unset", cursor: "pointer", flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontSize: 13, color: "var(--text-primary)" }}>{f.name}</button>}
      <span style={sub}>{fmtSize(f.size)}</span>
      {f.protected && <Pill color="#f59e0b" data-testid="up-protected" title="از حذف خودکار و گروهی مستثنا است">🔒 ویژه</Pill>}
      {f.derivedFrom && <Pill color="#60a5fa">ساخته‌شده با ابزار</Pill>}
      {showScan && f.scan === "skipped" && <Pill color="#9ca3af" title="ضدویروس در دسترس نبود">اسکن‌نشده</Pill>}
      <Pill color={STATUS_COLOR[f.status]}>{STATUS_LABEL[f.status]}</Pill>
      <select aria-label="وضعیت" disabled={busy} value={f.status} onChange={(e) => act(async () => { await uploads.setStatus(f.id, e.target.value); onChanged(); })} style={{ ...INP, width: "auto", marginTop: 0, padding: "4px 6px", fontSize: 12 }}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
      <button data-testid="up-preview-btn" disabled={busy} onClick={onPreview} aria-label={`پیش‌نمایش ${f.name}`} title="پیش‌نمایش" style={iconBtn()}><Icon name="Eye" size={14} /></button>
      <button data-testid="up-rename" disabled={busy} onClick={() => setRen(f.name)} aria-label={`تغییر نام ${f.name}`} title="تغییر نام" style={iconBtn()}><Icon name="Pencil" size={14} /></button>
      <button data-testid="up-link-btn" disabled={busy} onClick={onLink} aria-label={`اتصال ${f.name}`} title="اتصال به سفارش/مشتری" style={iconBtn()}><Icon name="Paperclip" size={14} /></button>
      {canManage && <button data-testid="up-protect" disabled={busy} aria-pressed={f.protected} onClick={() => act(async () => { await uploads.protect(f.id, !f.protected); onChanged(); })} aria-label={f.protected ? "برداشتن نگه‌داری ویژه" : "نگه‌داری ویژه"} title={f.protected ? "برداشتن نگه‌داری ویژه" : "نگه‌داری ویژه (حذف خودکار نشود)"} style={iconBtn(f.protected ? { color: "#f59e0b", borderColor: "#f59e0b" } : {})}><Icon name="Lock" size={14} /></button>}
      {canTools && <button data-testid="up-tools-btn" disabled={busy} onClick={onTools} title="ابزارهای PDF/تصویر" style={iconBtn()}>ابزار</button>}
      <button data-testid="up-dl" disabled={busy} onClick={() => act(async () => { await downloadUpload(f); onChanged(); })} style={BTN("#16a34a", "#fff", { padding: "5px 12px", fontSize: 12 })}>دانلود</button>
      <button data-testid="up-del" disabled={busy || (f.protected && !canManage)} aria-label={`حذف ${f.name}`} title={f.protected && !canManage ? "فایل ویژه است" : "حذف"} onClick={() => { if (window.confirm(f.protected ? `«${f.name}» «نگه‌داری ویژه» است. با این حال برای همیشه حذف شود؟` : `«${f.name}» برای همیشه از سرور حذف شود؟`)) act(async () => { await uploads.remove(f.id); onChanged(); }); }} style={BTN("transparent", "#f87171", { padding: "5px 8px", fontSize: 12, border: "1px solid #f8717166" })}><Icon name="Trash2" size={14} /></button>
      {(f.orderLabel || f.customerLabel) && <div data-testid="up-links" style={{ flex: "1 1 100%", display: "flex", gap: 6, flexWrap: "wrap", paddingInlineStart: 26 }}>
        {f.orderLabel && <Pill color="#2563eb">📋 {f.orderLabel}</Pill>}{f.customerLabel && <Pill color="#0d9488">👤 {f.customerLabel}</Pill>}
      </div>}
    </div>
  );
}

export default function FileManager({ settings, sessionFilter = "", onSessionFilter, refreshKey = 0 }) {
  const canManage = !!settings?.canManage, canBulk = !!settings?.canBulkDelete, showScan = !!settings?.av && settings.av.mode !== "off";
  const [list, setList] = useState({ items: [], newCount: 0, total: 0, matched: 0 });
  const [status, setStatus] = useState(""), [q, setQ] = useState(""), [sort, setSort] = useState("created"), [dir, setDir] = useState("desc"), [scope, setScope] = useState("");
  const [customers] = useCustomers(), [err, setErr] = useState(""), [loading, setLoading] = useState(true), [sel, setSel] = useState(() => new Set()), [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null), [tools, setTools] = useState(null), [link, setLink] = useState(null), [limit, setLimit] = useState(100);
  const timer = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const l = await uploads.list({ status, q: q.trim(), sort, dir, session: sessionFilter, unlinked: scope === "unlinked" ? 1 : "", protected: scope === "protected" ? 1 : "", limit });
      const meta = l?.meta || {};
      setList({ items: l?.data || [], newCount: meta.newCount || 0, total: meta.total || 0, matched: meta.matched ?? (l?.data || []).length });
      setUploadsNewCount(meta.newCount || 0); setErr("");
      setSel((s) => { const ids = new Set((l?.data || []).map((x) => x.id)); const n = new Set([...s].filter((i) => ids.has(i))); return n.size === s.size ? s : n; });
    } catch (e) { setErr(msgOf(e)); } finally { setLoading(false); }
  }, [status, q, sort, dir, sessionFilter, scope, limit]);
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); }, [load, refreshKey]);
  useEffect(() => { timer.current = setInterval(() => { if (document.visibilityState === "visible") load(true); }, 20000); return () => clearInterval(timer.current); }, [load]);
  const grouped = sort === "created" && dir === "desc";
  const batches = useMemo(() => (grouped ? groupBatches(list.items) : []), [grouped, list.items]);
  const byId = useMemo(() => Object.fromEntries(list.items.map((x) => [x.id, x])), [list.items]);
  const picked = [...sel].map((i) => byId[i]).filter(Boolean);
  const onSel = useCallback((id, on) => setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; }), []);
  const allOn = list.items.length > 0 && list.items.every((x) => sel.has(x.id));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(list.items.map((x) => x.id)));
  const bulkDelete = async () => {
    const prot = picked.filter((x) => x.protected).length;
    if (!window.confirm(`${toFA(picked.length)} فایل برای همیشه حذف شود؟${prot ? `\n(${toFA(prot)} فایل «نگه‌داری ویژه» حذف نمی‌شود.)` : ""}`)) return;
    try { const r = await uploads.bulkDelete([...sel]); setMsg(`${toFA(r.deleted)} فایل حذف شد${r.skipped?.length ? ` — ${toFA(r.skipped.length)} فایل ویژه دست‌نخورده ماند` : ""}.`); setSel(new Set()); load(true); } catch (e) { setErr(msgOf(e)); }
  };
  const bulkStatus = async (s) => { try { await uploads.bulkStatus([...sel], s); setMsg(`وضعیت ${toFA(sel.size)} فایل «${STATUS_LABEL[s]}» شد.`); load(true); } catch (e) { setErr(msgOf(e)); } };
  const row = (f) => <FileRow key={f.id} f={f} sel={sel.has(f.id)} onSel={onSel} canManage={canManage} showScan={showScan} onChanged={() => load(true)} onError={setErr} onPreview={() => setPreview(f)} onTools={() => setTools({ files: [f] })} onLink={() => setLink({ ids: [f.id], title: `اتصال «${f.name}»` })} />;
  const toolFiles = picked.filter((x) => fileKind(x.name) === "pdf" || fileKind(x.name) === "image");
  const small = { padding: "4px 12px", fontSize: 12 };
  return (
    <div style={card} data-testid="up-files">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 14 }}>فایل‌های دریافتی</b>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["", "همه"], ...STATUSES.map((s) => [s, STATUS_LABEL[s]])].map(([k, l]) => <button key={k || "all"} data-testid={`up-f-${k || "all"}`} aria-pressed={status === k} onClick={() => setStatus(k)} style={BTN(status === k ? "#2563eb" : "var(--bg-app)", status === k ? "#fff" : "var(--text-secondary)", small)}>{l}</button>)}
        </div>
        <input data-testid="up-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو: کد پیگیری، نام فایل، نام/موبایل مشتری، سفارش" style={{ ...INP, marginTop: 0, flex: "1 1 220px", maxWidth: 340, padding: "6px 10px", fontSize: 12 }} />
        <button onClick={() => load()} style={BTN("var(--border)", "var(--text-secondary)", { padding: "5px 12px", fontSize: 12 })}>بازخوانی</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ ...sub, display: "flex", gap: 4, alignItems: "center" }}>مرتب‌سازی
          <select data-testid="up-sort" value={sort} onChange={(e) => setSort(e.target.value)} style={{ ...INP, width: "auto", marginTop: 0, padding: "4px 8px", fontSize: 12 }}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <button data-testid="up-sort-dir" onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))} aria-label="جهت مرتب‌سازی" style={BTN("var(--bg-app)", "var(--text-secondary)", small)}>{dir === "desc" ? "↓ نزولی" : "↑ صعودی"}</button>
        <label style={{ ...sub, display: "flex", gap: 4, alignItems: "center" }}>نمایش
          <select data-testid="up-scope" value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...INP, width: "auto", marginTop: 0, padding: "4px 8px", fontSize: 12 }}><option value="">همه</option><option value="unlinked">بدون اتصال به سفارش/مشتری</option><option value="protected">نگه‌داری ویژه</option></select></label>
        {sessionFilter && <button onClick={() => onSessionFilter?.("")} style={BTN("#2563eb", "#fff", small)} data-testid="up-session-chip">فقط یک QR موقت ✕</button>}
        {list.items.length > 0 && <label style={{ ...sub, display: "flex", gap: 4, alignItems: "center", marginInlineStart: "auto" }}><input type="checkbox" data-testid="up-sel-all" checked={allOn} onChange={toggleAll} />انتخاب همه</label>}
      </div>
      {sel.size > 0 && (
        <div data-testid="up-bulkbar" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#2563eb18", border: "1px solid #2563eb55", borderRadius: 10, padding: "6px 10px" }}>
          <b style={{ fontSize: 13 }}>{toFA(sel.size)} فایل انتخاب شد</b>
          <select data-testid="up-bulk-status" value="" onChange={(e) => e.target.value && bulkStatus(e.target.value)} style={{ ...INP, width: "auto", marginTop: 0, padding: "4px 8px", fontSize: 12 }}><option value="">تغییر وضعیت…</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          <button data-testid="up-bulk-link" onClick={() => setLink({ ids: [...sel], title: `اتصال ${toFA(sel.size)} فایل` })} style={smallBtn("var(--border)", "var(--text-secondary)")}>اتصال به سفارش/مشتری</button>
          {toolFiles.length > 0 && availableTools(toolFiles).length > 0 && <button data-testid="up-bulk-tools" onClick={() => setTools({ files: toolFiles })} style={smallBtn("#7c3aed")}>ابزارهای PDF</button>}
          {canBulk && <button data-testid="up-bulk-delete" onClick={bulkDelete} style={smallBtn("#dc2626")}>حذف گروهی</button>}
          <button onClick={() => setSel(new Set())} style={smallBtn("transparent", "var(--text-muted)")}>لغو انتخاب</button>
        </div>)}
      {msg && <Note kind="ok" data-testid="up-msg">{msg}</Note>}
      {err && <Note kind="error" data-testid="up-error">{err}</Note>}
      {loading && !list.items.length ? <div style={sub}>در حال بارگیری…</div>
        : !list.items.length ? <div style={sub} data-testid="up-empty">{status || q || scope || sessionFilter ? "موردی با این فیلتر پیدا نشد." : "هنوز فایلی نرسیده است. پوستر QR را چاپ و کنار صندوق بزنید."}</div>
        : grouped ? batches.map((b) => (
          <div key={b.batchId} data-testid="up-batch" style={{ background: "var(--bg-app)", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
              <b data-testid="up-code" dir="ltr" style={{ fontSize: 16, letterSpacing: 2, color: "var(--accent-light)" }}>#{toFA(b.batchCode)}</b>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{b.senderName || "ناشناس"}</span>
              {b.senderPhone && <span dir="ltr" style={sub}>{toFA(b.senderPhone)}</span>}
              <AddSenderButton b={b} customers={customers} onAdded={(m) => { setErr(""); setMsg(m); }} />
              <button data-testid="up-batch-link" onClick={() => setLink({ batchId: b.batchId, title: `اتصال ارسال #${b.batchCode}` })} style={smallBtn("var(--border)", "var(--text-secondary)")}>اتصال کل ارسال</button>
              <span style={{ ...sub, marginInlineStart: "auto" }}>{formatLogTimestamp(b.createdAt)}</span>
            </div>
            {b.note && <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 2 }}>📝 {b.note}</div>}
            {b.files.map(row)}
          </div>))
        : <div data-testid="up-flat" style={{ background: "var(--bg-app)", borderRadius: 12, padding: "4px 12px" }}>{list.items.map(row)}</div>}
      {list.matched > list.items.length && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={sub}>{toFA(list.items.length)} مورد از {toFA(list.matched)} نمایش داده شد.</span><button data-testid="up-more" onClick={() => setLimit((l) => Math.min(200, l + 100))} disabled={limit >= 200} style={smallBtn("var(--border)", "var(--text-secondary)")}>نمایش بیشتر</button>{limit >= 200 && <span style={sub}>برای دیدن بقیه جستجو یا فیلتر کنید.</span>}</div>}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} onChanged={() => load(true)} />}
      {tools && <PdfToolsDialog files={tools.files} onClose={() => setTools(null)} onSaved={() => load(true)} />}
      {link && <LinkDialog target={link} onClose={() => setLink(null)} onDone={() => load(true)} />}
    </div>
  );
}
