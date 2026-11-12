// UI for the offline queue and the error log: header chip, offline capsule, sync center, error-log viewer, error toast.
// All strings are Persian; colours use the app's CSS variables so both themes work.
import React, { useEffect, useMemo, useState } from "react";
import { syncQueue, getSyncConfig, setSyncConfig } from "./index.js";
import { useSyncStatus } from "./useSyncStatus.js";
import { errorLog, classifyError } from "../diagnostics/index.js";
import { isApiConnected } from "../services/api/client.js";
import { buildUploadOps, countByResource, lastUpload, runInitialUpload } from "./initialUpload.js";
import { lsRead, loadRemoteIds, saveRemoteIds, getSales } from "../app/domain/sales.jsx";
import { CUSTOMERS_STORAGE_KEY, INV_STORAGE_KEY, OBL_KEY, ORDERS_STORAGE_KEY, TX_KEY } from "../app/core/constants.js";

const readLocalData = () => ({ customers: lsRead(CUSTOMERS_STORAGE_KEY, []), inventory: lsRead(INV_STORAGE_KEY, []), sales: getSales(), orders: lsRead(ORDERS_STORAGE_KEY, []), transactions: lsRead(TX_KEY, []), obligations: lsRead(OBL_KEY, []) });
const RES_FA = { customers: "مشتری", inventory: "کالا", invoices: "فاکتور", payments: "پرداخت", orders: "سفارش", transactions: "تراکنش دستی", obligations: "تعهد" };

const fa = (n) => Number(n || 0).toLocaleString("fa-IR");
const when = (t) => { try { return t ? new Date(t).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "medium" }) : "—"; } catch { return "—"; } };
const btn = (bg = "var(--bg-app)", col = "var(--text-primary)") => ({ background: bg, color: col, border: "1px solid var(--border)", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" });

export function syncState(stats) {
  // 🟢 online & everything delivered · 🔵 syncing · 🟡 N operations waiting · 🔴 N operations failed · 📴 offline (work is saved locally)
  if (stats.paused === "auth") return { key: "auth", color: "#ef4444", icon: "🔴", text: stats.total ? `نیاز به ورود مجدد · ${fa(stats.total)} عملیات منتظر` : "نیاز به ورود مجدد" };
  if (!stats.online || (!stats.reachable && stats.total > 0)) return { key: "offline", color: "#f59e0b", icon: "📴", text: stats.total ? `آفلاین · ${fa(stats.total)} عملیات در صف` : "آفلاین" };
  if (stats.failed) return { key: "failed", color: "#ef4444", icon: "🔴", text: `${fa(stats.failed)} عملیات خطادار` };
  if (stats.flushing || stats.inflight) return { key: "syncing", color: "#3b82f6", icon: "🔵", text: stats.total ? `در حال همگام‌سازی · ${fa(stats.total)} عملیات` : "در حال همگام‌سازی…" };
  if (stats.pending) return { key: "pending", color: "#eab308", icon: "🟡", text: `${fa(stats.pending)} عملیات منتظر ارسال` };
  return { key: "ok", color: "#22c55e", icon: "🟢", text: "آنلاین" };
}

// وضعیت حالت «فقط محلی» (بدون سرور): داده‌ها روی همین دستگاه ذخیره می‌شوند و چیزی برای همگام‌سازی نیست.
export function localSyncState(stats) {
  if (stats && stats.online === false) return { key: "local-offline", color: "#f59e0b", icon: "📴", text: "آفلاین · ذخیره محلی" };
  return { key: "local", color: "#22c55e", icon: "💾", text: "ذخیره محلی" };
}
const LEGEND = [
  ["ok", "🟢", "#22c55e", "آنلاین — همهٔ تغییرات به سرور رسیده است"],
  ["syncing", "🔵", "#3b82f6", "در حال همگام‌سازی با سرور"],
  ["pending", "🟡", "#eab308", "تغییراتی در صف ارسال منتظر اتصال یا نوبت است"],
  ["failed", "🔴", "#ef4444", "ارسال ناموفق یا نیاز به ورود مجدد"],
  ["offline", "📴", "#f59e0b", "اینترنت قطع است؛ کار شما محلی ذخیره می‌شود و بعداً ارسال می‌شود"],
];

// Pill in the top bar: always visible. With a server it opens the sync center; in local-only mode it opens a small legend of the colour states.
export function SyncChip({ onOpen, compact }) {
  const { stats } = useSyncStatus();
  const [pop, setPop] = useState(false);
  const ref = React.useRef(null);
  useEffect(() => {
    if (!pop) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setPop(false); };
    document.addEventListener("mousedown", h); document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [pop]);
  const connected = isApiConnected();
  const st = connected ? syncState(stats) : localSyncState(stats);
  const cur = connected ? st.key : "";
  return (<div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
    <style>{"@keyframes cf-spin{to{transform:rotate(360deg)}} @keyframes cf-pulse{50%{opacity:.35}}"}</style>
    <button data-testid="sync-chip" data-state={st.key} data-mode={connected ? "server" : "local"} onClick={connected ? onOpen : () => setPop((v) => !v)} title={`وضعیت همگام‌سازی: ${st.text}`} aria-label={`وضعیت همگام‌سازی: ${st.text}`} aria-expanded={connected ? undefined : pop}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-card)", border: `1px solid ${st.color}66`, color: st.color, borderRadius: 18, height: 34, padding: "0 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap" }}>
      <span style={{ display: "inline-block", animation: st.key === "syncing" ? "cf-pulse 1s ease-in-out infinite" : "none" }}>{st.icon}</span>
      {connected && stats.total > 0 && <span>{fa(stats.total)}</span>}
    </button>
    {pop && !connected && (
      <div data-testid="sync-legend" style={{ position: "absolute", top: 40, insetInlineEnd: 0, zIndex: 300, width: 292, maxWidth: "calc(100vw - 24px)", background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, boxShadow: "0 10px 30px #0006", fontSize: 12, lineHeight: 1.9, color: "var(--text-secondary)", textAlign: "right" }}>
        <div style={{ fontWeight: 700, color: st.color, marginBottom: 4 }}>{st.icon} {st.text}</div>
        <div style={{ marginBottom: 8 }}>برنامه در حالت محلی کار می‌کند: همهٔ اطلاعات روی همین دستگاه ذخیره می‌شود و سروری برای همگام‌سازی وصل نیست. با اتصال به سرور (توسط مدیر سیستم)، این نشانگر وضعیت ارسال را با رنگ‌های زیر نشان می‌دهد:</div>
        {LEGEND.map(([k, ic, c, t]) => <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: cur === k ? c : undefined }}><span>{ic}</span><span>{t}</span></div>)}
      </div>
    )}
  </div>);
}

// Floating capsule that reassures the cashier while offline: work is saved and will be sent automatically.
export function OfflineCapsule({ isMobile, onOpen }) {
  const { stats } = useSyncStatus();
  const [justSynced, setJustSynced] = useState(false);
  const prev = React.useRef(false);
  const offline = isApiConnected() && (!stats.online || (!stats.reachable && stats.total > 0));
  useEffect(() => {
    let timer = null;
    if (prev.current && !offline) { setJustSynced(true); timer = setTimeout(() => setJustSynced(false), 3500); }
    prev.current = offline;
    return () => { if (timer) clearTimeout(timer); };
  }, [offline]);
  if (!offline && !justSynced) return null;
  const pos = { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: isMobile ? 84 : 18, zIndex: 125, maxWidth: "calc(100vw - 24px)" };
  return (
    <button data-testid="offline-capsule" onClick={onOpen} style={{ ...pos, display: "flex", alignItems: "center", gap: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "#fff", borderRadius: 22, padding: "9px 16px", background: offline ? "#b45309" : "#15803d", boxShadow: "0 8px 24px #0008" }}>
      {offline ? <>📴 اینترنت قطع است؛ کار شما ذخیره می‌شود{stats.total ? ` (${fa(stats.total)} عملیات در صف)` : ""} و بعد از اتصال خودکار ارسال می‌شود</> : <>✓ اتصال برقرار شد و همه‌چیز همگام شد</>}
    </button>
  );
}

const STATUS_LABEL = { pending: ["در صف", "#f59e0b"], inflight: ["در حال ارسال", "#3b82f6"], failed: ["ناموفق", "#ef4444"] };

// انتقال یک‌بارهٔ دادهٔ موجود به سرور (هنگام راه‌اندازی سرور). پیش‌نمایش تعداد، تأیید، سپس صف آفلاین.
function UploadExisting({ note, finance }) {
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => countByResource(buildUploadOps(readLocalData(), { finance })), [finance, busy]);
  const total = Object.values(plan).reduce((a, b) => a + b, 0);
  const last = lastUpload();
  const go = async () => {
    if (!window.confirm(`${fa(total)} رکورد (${Object.entries(plan).map(([k, v]) => `${fa(v)} ${RES_FA[k] || k}`).join("، ")}) برای سرور در صف قرار می‌گیرد. ادامه می‌دهید؟\nاجرای دوباره هیچ رکورد تکراری نمی‌سازد.`)) return;
    setBusy(true);
    try {
      const r = await runInitialUpload(readLocalData, { finance });
      const ids = loadRemoteIds("customers"); readLocalData().customers.forEach((c) => c?.id != null && ids.add(String(c.id))); saveRemoteIds("customers", ids);
      note(`${fa(r.queued)} رکورد در صف ارسال قرار گرفت`);
    } finally { setBusy(false); }
  };
  return (
    <div data-testid="sync-upload" style={{ background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, lineHeight: 1.9 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>انتقال دادهٔ موجود به سرور</div>
      <div style={{ color: "var(--text-muted)" }}>برای اولین اتصال به سرور: دادهٔ فعلی این دستگاه ({total ? Object.entries(plan).map(([k, v]) => `${fa(v)} ${RES_FA[k] || k}`).join("، ") : "چیزی برای ارسال نیست"}) یک‌بار در صف ارسال قرار می‌گیرد. تکرار آن بی‌خطر است.{last ? ` آخرین بار: ${when(last.at)}` : ""}</div>
      <button data-testid="sync-upload-btn" disabled={busy || !total} onClick={go} style={{ ...btn("#7c3aed", "#fff"), marginTop: 6, opacity: busy || !total ? 0.5 : 1 }}>ارسال دادهٔ موجود به سرور</button>
    </div>
  );
}

export function SyncCenterPanel() {
  const { stats, ops } = useSyncStatus();
  const [cfg, setCfg] = useState(() => getSyncConfig());
  const [msg, setMsg] = useState("");
  const st = syncState(stats);
  const history = syncQueue.history();
  const note = (t) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };
  const download = () => {
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([syncQueue.exportJson()], { type: "application/json" })); a.download = "cafenet-sync-queue.json"; a.click(); } catch { note("دانلود انجام نشد"); }
  };
  const row = { background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 };
  return (
    <div data-testid="sync-center" style={{ background: "var(--bg-card)", borderRadius: 14, padding: "18px 20px", maxWidth: 780 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🔄 همگام‌سازی و حالت آفلاین</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.9, marginBottom: 14 }}>
        هر عملیات (مشتری، سفارش، فاکتور، پرداخت، انبار و …) اول روی همین دستگاه ذخیره می‌شود، یک شناسهٔ یکتا و کلید Idempotency می‌گیرد و در یک صف ماندگار می‌رود. با قطع اینترنت کار ادامه دارد؛ با اتصال دوباره، صف به‌ترتیب به سرور ارسال می‌شود و ارسال تکراری هیچ‌وقت رکورد تکراری نمی‌سازد.
      </div>
      {!isApiConnected() && <div style={{ ...row, color: "#fbbf24", marginBottom: 12 }}>برنامه به سرور وصل نیست؛ همه‌چیز فقط روی همین دستگاه ذخیره می‌شود. از «تنظیمات › اتصال به سرور» آدرس API را وارد کنید.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 14 }}>
        {[["وضعیت", st.text, st.color], ["در صف", fa(stats.pending + stats.inflight), "var(--text-primary)"], ["ناموفق", fa(stats.failed), stats.failed ? "#ef4444" : "var(--text-primary)"], ["آخرین همگام‌سازی", when(stats.lastSyncAt), "var(--text-primary)"]].map(([k, v, c]) => (
          <div key={k} style={{ background: "var(--bg-app)", borderRadius: 10, padding: "9px 12px" }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{k}</div><div data-testid={"sync-stat-" + k} style={{ fontSize: 13, fontWeight: 700, color: c, marginTop: 3 }}>{v}</div></div>
        ))}
      </div>
      {stats.lastError && <div style={{ fontSize: 11.5, color: "#fbbf24", marginBottom: 10 }}>آخرین خطا: {classifyError({ status: stats.lastError.status, code: stats.lastError.code }).fa} <span dir="ltr">({stats.lastError.status || stats.lastError.code || "—"})</span></div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button data-testid="sync-now" onClick={() => syncQueue.flush({ ignoreBackoff: true })} style={btn("#2563eb", "#fff")}>ارسال همین حالا</button>
        <button data-testid="sync-retry-failed" disabled={!stats.failed} onClick={async () => note(`${fa(await syncQueue.retryAllFailed())} عملیات دوباره در صف قرار گرفت`)} style={{ ...btn(), opacity: stats.failed ? 1 : .5 }}>تلاش دوباره برای ناموفق‌ها</button>
        {stats.paused ? <button onClick={() => syncQueue.resume()} style={btn("#166534", "#fff")}>ادامهٔ ارسال</button> : <button onClick={() => syncQueue.pause("manual")} style={btn()}>توقف موقت</button>}
        <button onClick={download} style={btn()}>دانلود صف (JSON)</button>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" data-testid="sync-finance" checked={cfg.finance !== false} onChange={(e) => { setSyncConfig({ finance: e.target.checked }); setCfg(getSyncConfig()); }} />
        فاکتور، پرداخت و هزینه/درآمد دستی هم به سرور ارسال شود (اگر سرور هنوز این مسیرها را ندارد، خاموش کنید)
      </label>
      {isApiConnected() && <UploadExisting note={note} finance={cfg.finance !== false} />}
      {msg && <div role="status" style={{ fontSize: 12, color: "#4ade80", marginBottom: 8 }}>{msg}</div>}
      <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 8px" }}>صف عملیات ({fa(ops.length)})</div>
      {ops.length === 0 ? <div data-testid="sync-empty" style={{ ...row, color: "var(--text-muted)" }}>صف خالی است؛ همه‌چیز با سرور همگام است ✓</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ops.map((o) => {
            const [label, color] = STATUS_LABEL[o.status] || ["—", "var(--text-muted)"];
            const why = o.lastError ? classifyError({ status: o.lastError.status, code: o.lastError.code }).fa : "";
            return (
              <div key={o.opId} data-testid="sync-op" data-status={o.status} style={row}>
                <span style={{ color, fontWeight: 700, minWidth: 74 }}>{label}{o.blocked ? " (منتظر وابستگی)" : ""}</span>
                <span style={{ flex: "1 1 200px", minWidth: 0 }}>{o.label || `${o.resource} · ${o.action}`}
                  <span dir="ltr" style={{ display: "block", fontSize: 10, color: "var(--text-dim)" }}>{o.opId.slice(0, 15)}… · {o.idem || "—"}</span></span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{when(o.createdAt)} · تلاش {fa(o.tries)}</span>
                {why && <span style={{ color: "#fbbf24", fontSize: 11, flexBasis: "100%" }}>{why} {o.lastError.message ? `— ${o.lastError.message}` : ""}</span>}
                {o.status === "failed" && <button onClick={() => syncQueue.retry(o.opId)} style={btn()}>دوباره</button>}
                <button data-testid="sync-discard" onClick={() => { if (window.confirm("این عملیات از صف حذف می‌شود و هرگز به سرور نمی‌رود (داده‌ی محلی دست‌نخورده می‌ماند). ادامه؟")) syncQueue.discard(o.opId, { cascade: true }); }} style={btn("#450a0a", "#f87171")}>حذف</button>
              </div>
            );
          })}
        </div>
      )}
      {history.length > 0 && <>
        <div style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 8px" }}>آخرین ارسال‌های موفق</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text-muted)" }}>
          {history.slice(0, 8).map((h) => <div key={h.opId}>✓ {h.label} — {when(h.at)}</div>)}
        </div>
      </>}
    </div>
  );
}

export function ErrorLogPanel() {
  const [, tick] = useState(0);
  const [q, setQ] = useState(() => { try { return sessionStorage.getItem("cafenet_errlog_q") || ""; } catch { return ""; } });
  useEffect(() => { try { sessionStorage.removeItem("cafenet_errlog_q"); } catch { /* sessionStorage در دسترس نیست */ } }, []);   // opened from a toast → pre-filtered by its Error ID
  const [open, setOpen] = useState(null);
  const [copied, setCopied] = useState("");
  useEffect(() => errorLog.subscribe(() => tick((t) => t + 1)), []);
  const rows = errorLog.list();
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^#/, "");
    return s ? rows.filter((r) => r.id.toLowerCase().includes(s) || String(r.message).toLowerCase().includes(s) || String(r.source).toLowerCase().includes(s)) : rows;
  }, [rows, q]);
  const copy = (r) => { try { navigator.clipboard.writeText(errorLog.format(r, { UA: navigator.userAgent })).then(() => { setCopied(r.id); setTimeout(() => setCopied(""), 2000); }); } catch { /* ignore */ } };
  const download = () => { try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" })); a.download = "cafenet-error-log.json"; a.click(); } catch { /* ignore */ } };
  const sevColor = { error: "#ef4444", warn: "#f59e0b" };
  return (
    <div data-testid="error-log" style={{ background: "var(--bg-card)", borderRadius: 14, padding: "18px 20px", maxWidth: 780 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🐞 لاگ خطاها</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.9, marginBottom: 12 }}>هر خطا یک کد ثابت مثل <b dir="ltr">CF-8A31</b> دارد (همان خطا همیشه همان کد را می‌گیرد). کد را در جستجو بنویسید تا جزئیات فنی را ببینید. رمزها، توکن‌ها و شماره‌های موبایل قبل از ذخیره پوشانده می‌شوند.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input data-testid="errlog-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو: کد خطا، پیام یا منبع…" style={{ flex: "1 1 220px", background: "var(--bg-app)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }} />
        <button onClick={download} style={btn()}>دانلود JSON</button>
        <button data-testid="errlog-clear" onClick={() => { if (rows.length && window.confirm("همهٔ لاگ خطاها پاک شود؟")) { errorLog.clear(); tick((t) => t + 1); } }} style={btn("#450a0a", "#f87171")}>پاک کردن</button>
      </div>
      {shown.length === 0 ? <div data-testid="errlog-empty" style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "10px 0" }}>{rows.length ? "موردی پیدا نشد." : "هیچ خطایی ثبت نشده است ✓"}</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.map((r) => (
            <div key={r.id} data-testid="errlog-row" data-id={r.id} style={{ background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", fontSize: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <b dir="ltr" style={{ background: "#450a0a", color: "#fca5a5", borderRadius: 6, padding: "1px 8px" }}>{r.id}</b>
                <span style={{ color: sevColor[r.severity] || "var(--text-muted)", fontSize: 11 }}>{r.source}</span>
                <span style={{ flex: "1 1 200px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} dir="auto">{r.message}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>×{fa(r.count)} · {when(r.last)}</span>
              </div>
              {open === r.id && (
                <div style={{ marginTop: 8 }}>
                  <pre dir="ltr" style={{ margin: 0, background: "var(--bg-card)", borderRadius: 8, padding: 10, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto" }}>{errorLog.format(r)}</pre>
                  <button onClick={() => copy(r)} style={{ ...btn(), marginTop: 8 }}>{copied === r.id ? "✓ کپی شد" : "کپی جزئیات"}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Non-intrusive toast for unexpected (uncaught) errors; the details live in the log.
export function ErrorToast({ onOpen, isMobile }) {
  const [t, setT] = useState(null);
  useEffect(() => {
    let timer = null;
    const h = (e) => { setT(e.detail); clearTimeout(timer); timer = setTimeout(() => setT(null), 9000); };
    window.addEventListener("cafenet:error", h);
    return () => { window.removeEventListener("cafenet:error", h); clearTimeout(timer); };
  }, []);
  if (!t) return null;
  return (
    <div data-testid="error-toast" role="alert" style={{ position: "fixed", right: 14, top: isMobile ? 70 : 74, zIndex: 190, maxWidth: "min(380px, calc(100vw - 28px))", background: "#450a0a", color: "#fecaca", border: "1px solid #7f1d1d", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.8, boxShadow: "0 10px 30px #000a" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span>⚠️ خطایی رخ داد</span><b dir="ltr" data-testid="error-toast-id" style={{ background: "#7f1d1d", borderRadius: 6, padding: "0 7px" }}>{t.id}</b><button onClick={() => setT(null)} style={{ marginInlineStart: "auto", background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>
      <div style={{ fontSize: 11.5, opacity: .9 }}>برنامه ادامه می‌دهد و داده‌ها محفوظ‌اند. <a href="#errors" onClick={(e) => { e.preventDefault(); setT(null); onOpen && onOpen(t.id); }} style={{ color: "#fff", textDecoration: "underline" }}>مشاهدهٔ جزئیات</a></div>
    </div>
  );
}
