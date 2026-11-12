// صفحهٔ «حقوق کارمندان» داخل تعهدات: کارمندان + حقوق ماهانه (ساخت لیست، اضافه‌کار/کسورات، پرداخت)
import React, { useState } from "react";
import { fmtM, toFA } from "../core/format.js";
import { BTN, INP, latinDigits } from "../core/constants.js";
import { jalaliLabel } from "./backup.js";
import { todayIso, dateToJalali } from "../core/jalali.js";
import { useDataSync } from "./sales.jsx";
import { generatePayroll, getEmployees, missingPayroll, monthLabel, payrollItems, payrollSummary, removeEmployee, saveEmployee, shiftMonth, updatePayrollItem } from "./payroll.js";

const blank = () => ({ id: null, name: "", role: "", phone: "", salary: "", payDay: "1", active: true, note: "" });
const digits = (v) => latinDigits(v).replace(/[^\d]/g, "");

function NumInput({ value, onChange, disabled, testid, width = 110 }) {
  const [txt, setTxt] = useState(null);
  const shown = txt !== null ? txt : value ? String(value) : "";
  return <input data-testid={testid} inputMode="numeric" disabled={disabled} value={shown} placeholder="۰"
    onChange={(e) => setTxt(digits(e.target.value))} onBlur={() => { if (txt !== null) { onChange(txt); setTxt(null); } }}
    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    style={{ ...INP, marginTop: 0, width, padding: "5px 8px", fontSize: 12, direction: "ltr", textAlign: "left", opacity: disabled ? 0.6 : 1 }} />;
}

export function PayrollPanel({ onSettle, onClose }) {
  const [, setTick] = useState(0);
  useDataSync(() => setTick((t) => t + 1));
  const [tab, setTab] = useState("month");
  const [[jy, jm], setYm] = useState(() => dateToJalali(todayIso()).slice(0, 2));
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const employees = getEmployees();
  const items = payrollItems(jy, jm).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const sum = payrollSummary(items);
  const missing = missingPayroll(jy, jm);

  const saveForm = () => {
    const r = saveEmployee(form);
    if (!r.ok) { setErr(r.error); return; }
    setErr(""); setForm(null);
  };
  const gen = () => { const r = generatePayroll(jy, jm); setMsg(r.created ? `حقوق ${toFA(r.created)} کارمند برای ${monthLabel(jy, jm).replace(/\d+/, (m) => toFA(m))} ساخته شد` : "همهٔ کارمندان فعال از قبل ردیف حقوق دارند"); };
  const tabBtn = (k, l) => <button key={k} data-testid={`payroll-tab-${k}`} onClick={() => setTab(k)} style={{ ...BTN(tab === k ? "#2563eb" : "var(--bg-app)", tab === k ? "#fff" : "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>{l}</button>;
  const kp = (l, v, c) => <div style={{ flex: "1 1 130px", background: "var(--bg-app)", borderRadius: 10, padding: "9px 12px", borderTop: `3px solid ${c}` }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l}</div><div style={{ fontSize: 14, fontWeight: 800, color: c, marginTop: 3 }}>{v}</div></div>;
  const lbl = { fontSize: 11, color: "var(--text-muted)" };

  return (
    <div data-testid="payroll-panel" style={{ background: "var(--bg-card)", borderRadius: 14, padding: 16, marginBottom: 16, border: "1px solid #2563eb55" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)" }}>👷 حقوق کارمندان</div>
        <div style={{ display: "flex", gap: 6 }}>{tabBtn("month", "حقوق ماهانه")}{tabBtn("staff", `کارمندان (${toFA(employees.length)})`)}
          <button onClick={onClose} aria-label="بستن" style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 10px", fontSize: 12 }}>✕</button></div>
      </div>

      {tab === "month" && (<>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button data-testid="payroll-prev" onClick={() => setYm(shiftMonth(jy, jm, -1))} style={{ ...BTN("var(--bg-app)", "var(--text-secondary)"), padding: "5px 10px" }}>▸</button>
          <div data-testid="payroll-month" style={{ fontSize: 14, fontWeight: 800, minWidth: 130, textAlign: "center" }}>{monthLabel(jy, jm).replace(/\d+/, (m) => toFA(m))}</div>
          <button data-testid="payroll-next" onClick={() => setYm(shiftMonth(jy, jm, 1))} style={{ ...BTN("var(--bg-app)", "var(--text-secondary)"), padding: "5px 10px" }}>◂</button>
          <span style={{ flex: 1 }} />
          <button data-testid="payroll-generate" onClick={gen} disabled={!missing.length} style={{ ...BTN("#16a34a"), padding: "7px 14px", fontSize: 12, opacity: missing.length ? 1 : 0.5 }}>
            {missing.length ? `ساخت لیست حقوق (${toFA(missing.length)} کارمند)` : "لیست این ماه کامل است"}</button>
        </div>
        {msg && <div data-testid="payroll-msg" style={{ fontSize: 12, color: "#4ade80", marginBottom: 8 }}>✓ {msg}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {kp("جمع حقوق ماه", fmtM(sum.total), "#60a5fa")}{kp("پرداخت‌شده", fmtM(sum.paid), "#4ade80")}{kp("مانده پرداخت", fmtM(sum.pending), sum.pending ? "#f472b6" : "#4ade80")}
        </div>
        {!employees.length
          ? <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 18 }}>هنوز کارمندی ثبت نشده. <button onClick={() => { setTab("staff"); setForm(blank()); }} style={{ background: "none", border: "none", color: "var(--accent-light)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>افزودن کارمند ←</button></div>
          : !items.length
            ? <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 18 }}>برای این ماه لیست حقوقی ساخته نشده است.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((o) => { const done = o.status === "done"; return (
                <div key={o.id} data-testid="payroll-row" style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", opacity: done ? 0.8 : 1 }}>
                  <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{o.party}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>پایه {fmtM(o.base != null ? o.base : o.amount)} · سررسید {jalaliLabel(o.dueDate)}</div>
                  </div>
                  <label style={lbl}>اضافه‌کار / پاداش<div><NumInput testid="pr-extra" value={o.extra} disabled={done} onChange={(v) => { const r = updatePayrollItem(o.id, { extra: v }); setErr(r.ok ? "" : r.error); }} /></div></label>
                  <label style={lbl}>کسورات / مساعده<div><NumInput testid="pr-deduct" value={o.deduct} disabled={done} onChange={(v) => { const r = updatePayrollItem(o.id, { deduct: v }); setErr(r.ok ? "" : r.error); }} /></div></label>
                  <div style={{ textAlign: "center", minWidth: 100 }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>قابل پرداخت</div><div data-testid="pr-amount" style={{ fontSize: 14, fontWeight: 800 }}>{fmtM(o.amount)}</div></div>
                  {done
                    ? <><span style={{ background: "#052e16", color: "#4ade80", borderRadius: 20, padding: "3px 11px", fontSize: 11, fontWeight: 700 }}>پرداخت شد · {jalaliLabel(o.paidDate)}</span>
                      <button data-testid="pr-undo" onClick={() => onSettle(o.id, true)} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "5px 10px", fontSize: 12 }}>↩ بازگردانی</button></>
                    : <button data-testid="pr-pay" onClick={() => onSettle(o.id, false)} style={{ ...BTN("#166534"), padding: "6px 14px", fontSize: 12 }}>✔ پرداخت شد</button>}
                </div>); })}
            </div>}
        {err && <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>⚠️ {err}</div>}
        <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.9, marginTop: 10 }}>با «پرداخت شد»، مبلغ به‌عنوان هزینهٔ «حقوق کارمند» در حسابداری و گزارش‌ها ثبت می‌شود و از موجودی صندوق کم می‌شود؛ «بازگردانی» همان هزینه را باطل می‌کند. سررسید حقوق در هشدارهای مالی هم دیده می‌شود.</div>
      </>)}

      {tab === "staff" && (<>
        {!form && <div style={{ marginBottom: 10 }}><button data-testid="emp-add" onClick={() => { setForm(blank()); setErr(""); }} style={{ ...BTN("#16a34a"), padding: "7px 16px", fontSize: 12 }}>＋ کارمند جدید</button></div>}
        {form && (
          <div data-testid="emp-form" style={{ background: "var(--bg-app)", borderRadius: 12, padding: 12, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ ...lbl, flex: "1 1 160px" }}>نام و نام خانوادگی<input data-testid="emp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ ...INP, marginTop: 2 }} /></label>
              <label style={{ ...lbl, flex: "1 1 130px" }}>سمت<input data-testid="emp-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ ...INP, marginTop: 2 }} /></label>
              <label style={{ ...lbl, flex: "1 1 130px" }}>موبایل<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ ...INP, marginTop: 2 }} dir="ltr" /></label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ ...lbl, flex: "1 1 160px" }}>حقوق ماهانه (ریال)<input data-testid="emp-salary" inputMode="numeric" value={form.salary} onChange={(e) => setForm({ ...form, salary: digits(e.target.value) })} style={{ ...INP, marginTop: 2, direction: "ltr", textAlign: "left" }} /></label>
              <label style={{ ...lbl, flex: "1 1 130px" }}>روز پرداخت هر ماه (۱ تا ۳۱)<input data-testid="emp-payday" inputMode="numeric" value={form.payDay} onChange={(e) => setForm({ ...form, payDay: digits(e.target.value) })} style={{ ...INP, marginTop: 2, direction: "ltr", textAlign: "left" }} /></label>
              <label style={{ ...lbl, flex: "1 1 130px", display: "flex", alignItems: "center", gap: 6, paddingTop: 16 }}><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />فعال (در لیست حقوق ماه می‌آید)</label>
            </div>
            <label style={lbl}>یادداشت<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ ...INP, marginTop: 2 }} /></label>
            {err && <div style={{ fontSize: 12, color: "#f87171" }}>⚠️ {err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button data-testid="emp-save" onClick={saveForm} style={{ ...BTN("#2563eb"), flex: 1 }}>ذخیره</button>
              <button onClick={() => { setForm(null); setErr(""); }} style={{ ...BTN("var(--border)", "var(--text-primary)"), flex: 1 }}>لغو</button>
            </div>
          </div>)}
        {!employees.length && !form && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 14 }}>کارمندی ثبت نشده است.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {employees.map((e) => (
            <div key={e.id} data-testid="emp-row" style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", opacity: e.active === false ? 0.6 : 1 }}>
              <div style={{ flex: "1 1 160px" }}><div style={{ fontSize: 13, fontWeight: 700 }}>{e.name}{e.active === false && <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}> — غیرفعال</span>}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.role || "—"}{e.phone ? ` · ${e.phone}` : ""} · پرداخت روز {toFA(e.payDay)} هر ماه</div></div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{fmtM(e.salary)}</div>
              <button onClick={() => { setForm({ ...e, salary: String(e.salary), payDay: String(e.payDay) }); setErr(""); }} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "5px 10px", fontSize: 12 }}>✏️</button>
              <button onClick={() => { if (window.confirm(`«${e.name}» حذف شود؟ ردیف‌های حقوق قبلی او در تعهدات می‌ماند.`)) removeEmployee(e.id); }} style={{ ...BTN("#450a0a", "#f87171"), padding: "5px 10px", fontSize: 12 }}>🗑️</button>
            </div>))}
        </div>
      </>)}
    </div>
  );
}
