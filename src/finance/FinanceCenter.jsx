// «مرکز مالی سرور»: تطبیق مالی (با درخواست اصلاح و تأیید مدیر)، شیفت صندوق، پنل دسترسی‌ها و هوش کسب‌وکار.
// همهٔ داده از سرور خوانده می‌شود (منبع حقیقت مالی)؛ بدون اتصال به سرور فقط پیام راهنما نشان داده می‌شود
// و هیچ عملیات مالیِ محلی انجام نمی‌شود.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../components/Icon.jsx";
import { BTN, INP } from "../app/core/constants.js";
import { toFA, fmtM, getCurrencyUnit, currencyLabel } from "../app/core/format.js";
import { formatLogTimestamp } from "../app/core/activity.js";
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import {
  finance, SCOPES, SEVERITY_LABEL, SEVERITY_COLOR, STATUS_LABEL, parseMoneyInput, errorText, summarizeFindings,
  buildPolicy, effectiveState, setPermission,
} from "./financeApi.js";

const card = { background: "var(--bg-card)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const sub = { fontSize: 12, color: "var(--text-muted)" };
const Pill = ({ color, children, ...r }) => <span {...r} style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: 20, padding: "1px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
const Note = ({ kind = "info", children, ...r }) => {
  const c = kind === "error" ? "#f87171" : kind === "ok" ? "#34d399" : "#60a5fa";
  return <div role={kind === "error" ? "alert" : "status"} {...r} style={{ background: `${c}18`, border: `1px solid ${c}55`, color: c, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, lineHeight: 1.9 }}>{children}</div>;
};
const Kpi = ({ label, value, color, ...r }) => <div {...r} style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", minWidth: 120, flex: "1 1 120px" }}><div style={sub}>{label}</div><div style={{ fontSize: 16, fontWeight: 800, color: color || "var(--text-primary)", marginTop: 2 }}>{value}</div></div>;
const pct = (v) => v == null ? "—" : `${toFA(Math.abs(v).toFixed(1))}٪ ${v >= 0 ? "▲" : "▼"}`;
const fmtDiff = (n) => n === 0 ? "بدون اختلاف" : `${n > 0 ? "اضافه " : "کسری "}${fmtM(Math.abs(n))}`;

function useLoad(fn, deps = []) {
  const [state, set] = useState({ loading: true, data: null, error: "" });
  const reload = useCallback(async () => {
    set((s) => ({ ...s, loading: true, error: "" }));
    try { set({ loading: false, data: await fn(), error: "" }); }
    catch (e) { set({ loading: false, data: null, error: errorText(e) }); }
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

// ───────────────────────── تطبیق مالی ─────────────────────────
function Reconciliation() {
  const rep = useLoad(() => finance.integrity());
  const reqs = useLoad(() => finance.corrections());
  const [scope, setScope] = useState(["invoices", "accounts", "inventory"]);
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), [notes, setNotes] = useState({});
  const sum = summarizeFindings(rep.data);
  const act = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ kind: "ok", text: okText }); await Promise.all([reqs.reload(), rep.reload()]); }
    catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
    setBusy(false);
  };
  const toggle = (k) => setScope((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);
  const findings = rep.data?.findings || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="rec-tab">
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b style={{ fontSize: 15 }}>گزارش تطبیق مالی</b>
          {rep.data && <Pill color={sum.ok ? "#34d399" : "#f87171"} data-testid="rec-status">{sum.ok ? "سالم" : "مغایرت دارد"}</Pill>}
          <button onClick={rep.reload} disabled={rep.loading} style={{ ...BTN("var(--border)", "var(--text-secondary)"), marginInlineStart: "auto", padding: "5px 12px", fontSize: 12 }}>{rep.loading ? "…" : "بازخوانی"}</button>
        </div>
        {rep.error && <Note kind="error">{rep.error}</Note>}
        {rep.data && <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{sum.rows.map((r) => <Kpi key={r.severity} data-testid={`rec-sev-${r.severity}`} label={r.label} value={toFA(r.count)} color={r.count ? r.color : undefined} />)}</div>
          {rep.data.generatedAt && <div style={sub}>زمان تولید: {formatLogTimestamp(rep.data.generatedAt)} — این گزارش فقط‌خواندنی است و چیزی را تغییر نمی‌دهد.</div>}
          {findings.length > 0 && <div style={{ maxHeight: 300, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }} data-testid="rec-findings">
            {findings.slice(0, 100).map((f, i) => <div key={`${f.code}-${f.id}-${i}`} style={{ background: "var(--bg-app)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Pill color={SEVERITY_COLOR[f.severity] || "#94a3b8"}>{SEVERITY_LABEL[f.severity] || f.severity}</Pill>
              <span style={{ flex: 1, minWidth: 160 }}>{f.message}</span>
              <code style={{ fontSize: 11, color: "var(--text-muted)", direction: "ltr" }}>{f.entity}:{String(f.id).slice(0, 18)}</code>
              {f.expected !== undefined && <span style={sub}>مورد انتظار {fmtM(f.expected)} · ثبت‌شده {fmtM(f.actual)}</span>}
            </div>)}
            {findings.length > 100 && <div style={sub}>{toFA(findings.length - 100)} مورد دیگر نمایش داده نمی‌شود.</div>}
          </div>}
          {!findings.length && <Note kind="ok">هیچ مغایرتی پیدا نشد.</Note>}
        </>}
      </div>

      <div style={card}>
        <b style={{ fontSize: 15 }}>درخواست اصلاح (با تأیید مدیر)</b>
        <div style={sub}>اصلاح هرگز مستقیم اجرا نمی‌شود: ابتدا یک پیش‌نمایش (بدون تغییر) ساخته می‌شود و پس از تأیید مدیر/مالک اجرا می‌شود. درخواست‌دهنده نمی‌تواند درخواست خودش را تأیید کند (مالک استثناست). هیچ سند مالیِ قبلی حذف نمی‌شود؛ فقط سند اصلاحیِ جدید ثبت می‌شود.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{SCOPES.map((s) => <label key={s.key} style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" data-testid={`rec-scope-${s.key}`} checked={scope.includes(s.key)} onChange={() => toggle(s.key)} />{s.label}</label>)}</div>
        <textarea data-testid="rec-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل درخواست (دست‌کم ۵ نویسه)" rows={2} style={{ ...INP, resize: "vertical" }} />
        <div><button data-testid="rec-submit" disabled={busy || !scope.length || reason.trim().length < 5} onClick={() => act(() => finance.requestCorrection({ scope, reason: reason.trim() }).then(() => setReason("")), "درخواست ثبت شد و منتظر تأیید مدیر است.")} style={{ ...BTN("#2563eb"), opacity: busy || !scope.length || reason.trim().length < 5 ? 0.5 : 1 }}>ثبت درخواست اصلاح</button></div>
        {msg && <Note kind={msg.kind} data-testid="rec-msg">{msg.text}</Note>}
      </div>

      <div style={card}>
        <b style={{ fontSize: 15 }}>درخواست‌های اصلاح</b>
        {reqs.error && <Note kind="error">{reqs.error}</Note>}
        {reqs.data && !reqs.data.length && <div style={sub}>درخواستی ثبت نشده است.</div>}
        {(reqs.data || []).map((r) => <div key={r.id} data-testid="rec-request" data-status={r.status} style={{ background: "var(--bg-app)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Pill color={r.status === "approved" ? "#34d399" : r.status === "pending" ? "#fbbf24" : "#f87171"}>{STATUS_LABEL[r.status] || r.status}</Pill>
            <span style={{ fontSize: 12.5 }}>{(r.scope || []).map((k) => SCOPES.find((s) => s.key === k)?.label.split(" ")[0] || k).join("، ")}</span>
            <span style={{ ...sub, marginInlineStart: "auto" }}>{r.requestedByName || "—"} · {formatLogTimestamp(r.requestedAt)}</span>
          </div>
          <div style={{ fontSize: 12.5 }}>{r.reason}</div>
          {r.preview?.wouldChange && <div style={sub}>پیش‌نمایش: {Object.entries(r.preview.wouldChange).map(([k, v]) => `${SCOPES.find((s) => s.key === k)?.label.split(" ")[0] || k}: ${toFA(v.fixed ?? 0)} مورد از ${toFA(v.checked ?? 0)}`).join(" · ")}</div>}
          {r.decisionNote && <div style={sub}>یادداشت تصمیم ({r.decidedByName || "—"}): {r.decisionNote}</div>}
          {r.status === "pending" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input data-testid="rec-note" value={notes[r.id] || ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="یادداشت (برای رد الزامی)" style={{ ...INP, marginTop: 0, flex: 1, minWidth: 160, padding: "6px 10px" }} />
            <button data-testid="rec-approve" disabled={busy} onClick={() => { if (typeof window !== "undefined" && window.confirm && !window.confirm("اجرای این اصلاح روی داده‌های مالی تأیید شود؟")) return; act(() => finance.approveCorrection(r.id, notes[r.id] || ""), "اصلاح اجرا شد."); }} style={{ ...BTN("#059669"), padding: "6px 14px" }}>تأیید و اجرا</button>
            <button data-testid="rec-reject" disabled={busy} onClick={() => act(() => finance.rejectCorrection(r.id, notes[r.id] || ""), "درخواست رد شد.")} style={{ ...BTN("#dc2626"), padding: "6px 14px" }}>رد</button>
          </div>}
        </div>)}
      </div>
    </div>
  );
}

// ───────────────────────── شیفت صندوق ─────────────────────────
function Shifts() {
  const cur = useLoad(() => finance.currentShift());
  const list = useLoad(() => finance.shifts({ limit: 20 }));
  const [opening, setOpening] = useState(""), [counted, setCounted] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const unit = getCurrencyUnit();
  const s = cur.data, live = s?.live;
  const act = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ kind: "ok", text: okText }); setOpening(""); setCounted(""); setNote(""); await Promise.all([cur.reload(), list.reload()]); }
    catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
    setBusy(false);
  };
  const openP = parseMoneyInput(opening, unit), cntP = parseMoneyInput(counted, unit);
  const expected = live?.expectedCash;
  const diffPreview = cntP.ok && expected != null ? cntP.rial - expected : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="shift-tab">
      <div style={card}>
        <b style={{ fontSize: 15 }}>شیفت جاری</b>
        {cur.error && <Note kind="error">{cur.error}</Note>}
        {cur.data === null && !cur.loading && !cur.error && <>
          <div style={sub}>شیفت بازی وجود ندارد. با ثبت موجودی نقدِ ابتدای شیفت، شیفت را باز کنید.</div>
          <label style={{ fontSize: 12.5 }}>موجودی نقد ابتدای شیفت ({currencyLabel()})<input data-testid="shift-opening" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} style={INP} /></label>
          {opening !== "" && !openP.ok && <Note kind="error">{openP.error}</Note>}
          <div><button data-testid="shift-open" disabled={busy || !openP.ok} onClick={() => act(() => finance.openShift({ openingCash: openP.rial, note }), "شیفت باز شد.")} style={{ ...BTN("#059669"), opacity: busy || !openP.ok ? 0.5 : 1 }}>شروع شیفت</button></div>
        </>}
        {s && <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="shift-live">
            <Kpi label="مسئول شیفت" value={s.openedByName || "—"} />
            <Kpi label="شروع" value={formatLogTimestamp(s.openedAt)} />
            <Kpi label="موجودی ابتدا" value={fmtM(s.openingCash)} />
            {live && <>
              <Kpi label="دریافتی نقد (خالص)" value={fmtM(live.cashNet)} />
              <Kpi label="هزینه نقد" value={fmtM(live.cashExpenses)} />
              <Kpi label="نقد مورد انتظار در صندوق" value={fmtM(live.expectedCash)} color="#60a5fa" data-testid="shift-expected" />
              <Kpi label="تعداد پرداخت / فاکتور" value={`${toFA(live.paymentCount)} / ${toFA(live.invoices?.count ?? 0)}`} />
            </>}
          </div>
          {live?.receipts && <div style={sub}>دریافتی به تفکیک روش: {Object.entries(live.receipts).map(([k, v]) => `${k}: ${fmtM(v)}`).join(" · ") || "—"}</div>}
          <label style={{ fontSize: 12.5 }}>مبلغ نقد شمارش‌شده ({currencyLabel()})<input data-testid="shift-counted" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} style={INP} /></label>
          {diffPreview !== null && <Note kind={diffPreview === 0 ? "ok" : "error"} data-testid="shift-diff">{fmtDiff(diffPreview)}{diffPreview !== 0 && " — برای بستن شیفت توضیح اختلاف الزامی است."}</Note>}
          <textarea data-testid="shift-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح (در صورت اختلاف الزامی)" rows={2} style={{ ...INP, resize: "vertical" }} />
          <div><button data-testid="shift-close" disabled={busy || !cntP.ok} onClick={() => act(() => finance.closeShift(s.id, { countedCash: cntP.rial, note }), "شیفت بسته شد.")} style={{ ...BTN("#dc2626"), opacity: busy || !cntP.ok ? 0.5 : 1 }}>بستن شیفت</button></div>
        </>}
        {msg && <Note kind={msg.kind} data-testid="shift-msg">{msg.text}</Note>}
        <div style={sub}>مبلغ‌ها بر پایهٔ زمان ثبت روی سرور محاسبه می‌شوند؛ سندهایی که آفلاین ثبت و بعداً همگام شوند، در شیفتی حساب می‌شوند که به سرور رسیده‌اند. شیفت بسته‌شده تغییرناپذیر است.</div>
      </div>

      <div style={card}>
        <b style={{ fontSize: 15 }}>شیفت‌های اخیر</b>
        {list.error && <Note kind="error">{list.error}</Note>}
        {list.data && !list.data.length && <div style={sub}>شیفتی ثبت نشده است.</div>}
        <div style={{ overflowX: "auto" }}>
          {(list.data || []).length > 0 && <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }} data-testid="shift-list">
            <thead><tr style={{ color: "var(--text-muted)", textAlign: "right" }}>{["مسئول", "شروع", "پایان", "مورد انتظار", "شمارش", "اختلاف"].map((h) => <th key={h} style={{ padding: "4px 6px", fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{list.data.map((x) => <tr key={x.id} data-status={x.status} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "6px" }}>{x.openedByName || "—"}</td><td>{formatLogTimestamp(x.openedAt)}</td>
              <td>{x.status === "open" ? <Pill color="#34d399">باز</Pill> : formatLogTimestamp(x.closedAt)}</td>
              <td>{x.expectedCash == null ? "—" : fmtM(x.expectedCash)}</td><td>{x.countedCash == null ? "—" : fmtM(x.countedCash)}</td>
              <td style={{ color: x.difference ? "#f87171" : undefined }}>{x.difference == null ? "—" : fmtDiff(x.difference)}</td>
            </tr>)}</tbody>
          </table>}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── دسترسی‌ها ─────────────────────────
function Permissions() {
  const p = useLoad(() => finance.permissions());
  const [roles, setRoles] = useState(null), [users, setUsers] = useState({}), [limits, setLimits] = useState({}), [sel, setSel] = useState("role:staff"), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const d = p.data;
  useEffect(() => { if (d?.policy) { setRoles(d.policy.roles || {}); setUsers(d.policy.users || {}); setLimits(d.policy.limits || {}); } }, [d]);
  if (p.error) return <div style={card}><Note kind="error">{p.error}</Note></div>;
  if (!d) return <div style={card}><div style={sub}>در حال دریافت…</div></div>;
  if (!d.policy) return <div style={card} data-testid="perm-readonly"><b style={{ fontSize: 15 }}>مجوزهای شما</b><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(d.me?.permissions || []).map((k) => <Pill key={k} color="#60a5fa">{(d.catalogue.find((c) => c.key === k) || {}).label || k}</Pill>)}</div><div style={sub}>ویرایش سیاست دسترسی فقط برای دارندگان مجوز «مدیریت کاربران» ممکن است.</div></div>;
  const isRole = sel.startsWith("role:"), id = sel.slice(sel.indexOf(":") + 1);
  const defaults = isRole ? d.defaults[id] : d.defaults[d.users.find((u) => u.id === id)?.role] || [];
  const override = isRole ? roles?.[id] : users?.[id];
  const setOver = (next) => isRole ? setRoles({ ...roles, [id]: next }) : setUsers({ ...users, [id]: next });
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await finance.savePermissions(buildPolicy(roles, users, limits, d.policy.version)); setMsg({ kind: "ok", text: "سیاست دسترسی ذخیره شد (در گزارش حسابرسی ثبت می‌شود)." }); await p.reload(); }
    catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
    setBusy(false);
  };
  const staffUsers = d.users.filter((u) => u.role !== "owner");
  const limitEdit = isRole ? limits[id] || {} : null;
  return (
    <div style={card} data-testid="perm-tab">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 15 }}>سیاست دسترسی</b><Pill color="#60a5fa">پروفایل: {d.profile}</Pill><span style={sub}>نسخهٔ سیاست: {toFA(d.policy.version)}</span>
      </div>
      <select data-testid="perm-select" value={sel} onChange={(e) => setSel(e.target.value)} style={INP}>
        <option value="role:staff">نقش: کارمند</option><option value="role:manager">نقش: مدیر</option>
        {staffUsers.map((u) => <option key={u.id} value={`user:${u.id}`}>کاربر: {u.name || u.email} ({u.role === "staff" ? "کارمند" : "مدیر"})</option>)}
      </select>
      <div style={sub}>مالک همیشه همهٔ مجوزها را دارد و قابل تغییر نیست. تیک = مجاز. فقط تفاوت با پیش‌فرض ذخیره می‌شود.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 6 }}>
        {d.catalogue.map((c) => { const st = effectiveState(c.key, defaults, override); const changed = (st === "allow") !== defaults.includes(c.key);
          return <label key={c.key} data-testid={`perm-${c.key}`} style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center", background: "var(--bg-app)", borderRadius: 8, padding: "6px 10px", border: changed ? "1px solid #fbbf24" : "1px solid transparent" }}>
            <input type="checkbox" checked={st === "allow"} onChange={(e) => setOver(setPermission(override, c.key, e.target.checked, defaults))} />{c.label}
          </label>; })}
      </div>
      {isRole && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <b style={{ fontSize: 13 }}>سقف‌ها (خالی = بدون سقف)</b>
        {Object.entries(d.limitKeys || {}).map(([k, label]) => <label key={k} style={{ fontSize: 12.5 }}>{label}
          <input data-testid={`limit-${k}`} inputMode="numeric" value={limitEdit[k] ?? ""} onChange={(e) => { const t = e.target.value.trim(); const v = { ...limitEdit }; if (t === "") delete v[k]; else if (/^\d+$/.test(t)) v[k] = Number(t); setLimits({ ...limits, [id]: v }); }} style={INP} /></label>)}
      </div>}
      <div><button data-testid="perm-save" disabled={busy} onClick={save} style={BTN("#2563eb")}>ذخیرهٔ سیاست</button></div>
      {msg && <Note kind={msg.kind} data-testid="perm-msg">{msg.text}</Note>}
    </div>
  );
}

// ───────────────────────── هوش کسب‌وکار ─────────────────────────
function Bars({ rows, keyName, color }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r[keyName] || 0)));
  return <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }} role="img" aria-label="نمودار ماهانه">{rows.map((r) => <div key={r.month} title={`${r.month}: ${fmtM(r[keyName])}`} style={{ flex: 1, background: r[keyName] < 0 ? "#f87171" : color, height: `${Math.max(2, Math.abs(r[keyName] || 0) / max * 100)}%`, borderRadius: "3px 3px 0 0", opacity: r.partial ? 0.55 : 1 }} />)}</div>;
}
function BI() {
  const [months, setMonths] = useState(12);
  const b = useLoad(() => finance.bi({ months }), [months]);
  const d = b.data, last = d?.series?.[d.series.length - 1];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="bi-tab">
      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 15 }}>فروش، هزینه و سود</b>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} style={{ ...INP, marginTop: 0, width: "auto", padding: "5px 10px" }} data-testid="bi-months">{[6, 12, 24].map((m) => <option key={m} value={m}>{toFA(m)} ماه اخیر</option>)}</select>
        </div>
        {b.error && <Note kind="error">{b.error}</Note>}
        {b.loading && !d && <div style={sub}>در حال دریافت…</div>}
        {d && <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {last && <><Kpi label="فروش ماه جاری" value={fmtM(last.revenue)} /><Kpi label="هزینهٔ ثبت‌شده" value={fmtM(last.expenses)} /><Kpi label="سود (فروش − هزینه)" value={fmtM(last.profit)} color={last.profit < 0 ? "#f87171" : "#34d399"} /></>}
            {d.growth && <Kpi label={`رشد فروش نسبت به ماه قبل`} value={pct(d.growth.revenuePct)} data-testid="bi-growth" />}
          </div>
          <Bars rows={d.series} keyName="revenue" color="#60a5fa" />
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: "var(--text-muted)", textAlign: "right" }}>{["ماه", "فروش", "فاکتور", "هزینه", "سود", "مشتری جدید"].map((h) => <th key={h} style={{ padding: "4px 6px", fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{[...d.series].reverse().map((r) => <tr key={r.month} style={{ borderTop: "1px solid var(--border)", opacity: r.partial ? 0.7 : 1 }}><td style={{ padding: 6 }}>{r.month}{r.partial ? " (جاری)" : ""}</td><td>{fmtM(r.revenue)}</td><td>{toFA(r.invoices)}</td><td>{fmtM(r.expenses)}</td><td style={{ color: r.profit < 0 ? "#f87171" : undefined }}>{fmtM(r.profit)}</td><td>{toFA(r.newCustomers)}</td></tr>)}</tbody>
          </table></div>
          <div style={sub}>«هزینه» یعنی هزینه‌های ثبت‌شده؛ بهای تمام‌شدهٔ کالا (COGS) حساب نمی‌شود، پس «سود» سود ناخالص واقعی نیست. {d.definitions?.revenue}</div>
        </>}
      </div>
      {d && <div style={card} data-testid="bi-forecast">
        <b style={{ fontSize: 15 }}>پیش‌بینی فروش ({toFA(3)} ماه آینده)</b>
        {d.forecast?.available ? <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{d.forecast.predictions.map((p) => <Kpi key={p.step} label={`ماه +${toFA(p.step)}`} value={fmtM(p.value)} />)}</div>
          <div style={sub}>بازهٔ اطمینان ≈۹۵٪ ماه اول: {fmtM(d.forecast.predictions[0].low)} تا {fmtM(d.forecast.predictions[0].high)} · روند ماهانه {fmtM(d.forecast.slopePerMonth)} · R² = {toFA(d.forecast.r2)} · {toFA(d.forecast.points)} ماه داده</div>
          <Note>{d.forecast.caveat}</Note>
        </> : <Note>{d.forecast?.reason || "داده کافی نیست."}</Note>}
      </div>}
      {d && <div style={card}>
        <b style={{ fontSize: 15 }}>مشتریان غیرفعال (بیش از {toFA(d.inactiveCustomers.days)} روز بدون خرید) — {toFA(d.inactiveCustomers.count)} نفر</b>
        {!d.inactiveCustomers.items.length ? <div style={sub}>مشتری غیرفعالی پیدا نشد.</div> : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflow: "auto" }} data-testid="bi-inactive">{d.inactiveCustomers.items.map((c) => <div key={c.id} style={{ background: "var(--bg-app)", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, display: "flex", gap: 8, flexWrap: "wrap" }}><b>{c.name}</b><span style={sub}>{c.phone || ""}</span><span style={{ marginInlineStart: "auto", ...sub }}>{toFA(c.daysSince)} روز پیش · مجموع خرید {fmtM(c.totalSpent)}</span></div>)}</div>}
        <b style={{ fontSize: 14 }}>مشتریان برتر ۹۰ روز اخیر</b>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{d.topCustomers90d.map((c, i) => <div key={c.id} style={{ fontSize: 12.5, display: "flex", gap: 8 }}><span style={sub}>{toFA(i + 1)}.</span><span style={{ flex: 1 }}>{c.name}</span><span>{fmtM(c.total)}</span><span style={sub}>{toFA(c.invoices)} فاکتور</span></div>)}</div>
      </div>}
    </div>
  );
}

// ───────────────────────── صفحهٔ اصلی ─────────────────────────
const TABS = [["rec", "تطبیق مالی", Reconciliation], ["shift", "شیفت صندوق", Shifts], ["perm", "دسترسی‌ها", Permissions], ["bi", "هوش کسب‌وکار", BI]];

export default function FinanceCenter({ initialTab = "rec" }) {
  const [tab, setTab] = useState(initialTab);
  const connected = isApiConnected(), guest = isGuestMode();
  const Cur = useMemo(() => (TABS.find((t) => t[0] === tab) || TABS[0])[2], [tab]);
  return (
    <div data-testid="fincenter-page" style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon name="BarChart3" size={20} style={{ color: "var(--accent-light)" }} />
          <b style={{ fontSize: 17 }}>مرکز مالی سرور</b>
        </div>
        <div style={sub}>این بخش مستقیماً با سرور کار می‌کند؛ سرور منبع حقیقت مالی است و همهٔ تغییرها در گزارش حسابرسی ثبت می‌شوند.</div>
        {connected && !guest && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{TABS.map(([k, label]) => <button key={k} data-testid={`fin-tab-${k}`} onClick={() => setTab(k)} aria-pressed={tab === k} style={{ ...BTN(tab === k ? "#2563eb" : "var(--bg-app)", tab === k ? "#fff" : "var(--text-secondary)"), padding: "6px 14px", fontSize: 12.5 }}>{label}</button>)}</div>}
      </div>
      {(!connected || guest) ? <div style={card} data-testid="fin-offline"><Note>{guest ? "در حالت مهمان این بخش در دسترس نیست." : "این بخش به اتصال سرور نیاز دارد. در «تنظیمات ← اتصال سرور» به سرور وصل شوید؛ بقیهٔ برنامه بدون سرور و آفلاین کار می‌کند."}</Note></div> : <Cur />}
    </div>
  );
}
export { Reconciliation, Shifts, Permissions, BI };
