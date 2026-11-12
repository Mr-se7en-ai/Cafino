// «گزارش‌ها» در تم نارنجی: خلاصهٔ مالی، نمودار درآمد/هزینهٔ ماهانه و دفتر کل. گزارش‌های تخصصی قبلی در زبانهٔ «گزارش‌های کامل» هستند.
import React, { useState } from "react";
import Icon from "../../components/Icon.jsx";
import { toFA } from "../../app/core/format.js";
import { jalaliLabel } from "../../app/domain/backup.js";
import { todayIso } from "../../app/core/jalali.js";
import { ExportBar } from "../../app/components/reportExport.jsx";
import { addDaysIso, jalaliMonthRanges, ledgerRows, monthlyIncomeExpense, pctChange, rangeTotals } from "./data.js";
import { Card, Kpi, PairBars, num, unit, ORANGE, PEACH } from "./ui.jsx";

const RANGES = {
  months7: ["۷ ماه اخیر", (t) => ({ from: jalaliMonthRanges(t, 7)[0].from, to: t })],
  month: ["ماه جاری", (t) => { const m = jalaliMonthRanges(t, 1)[0]; return { from: m.from, to: t }; }],
  days30: ["۳۰ روز اخیر", (t) => ({ from: addDaysIso(t, -29), to: t })],
  year: ["۱۲ ماه اخیر", (t) => ({ from: jalaliMonthRanges(t, 12)[0].from, to: t })],
};

export function OrangeReports({ transactions, onNavigate, children }) {
  const [tab, setTab] = useState("ledger");
  const [rk, setRk] = useState("months7");
  const [q, setQ] = useState("");
  const today = todayIso();
  const { from, to } = RANGES[rk][1](today);
  const span = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
  const cur = rangeTotals(transactions, from, to);
  const prevTo = addDaysIso(from, -1), prev = rangeTotals(transactions, addDaysIso(prevTo, -span + 1), prevTo);
  const bars = monthlyIncomeExpense(transactions, today, 7);
  const rows = ledgerRows(transactions, from, to, 200).filter((r) => !q.trim() || String(r.desc).includes(q.trim())).slice(-15).reverse();
  const u = unit();
  const tabs = [["ledger", "دفتر کل و مالی"], ["full", "گزارش‌های کامل"], ["debtors", "بدهکاران"], ["stock", "گزارش انبار"]];
  const go = (k) => { if (k === "debtors") onNavigate("ledger"); else if (k === "stock") onNavigate("inventory"); else setTab(k); };
  const sections = [{ name: "دفتر کل", head: ["تاریخ", "شرح", "بدهکار", "بستانکار", "مانده"], money: [2, 3, 4], rows: rows.map((r) => [jalaliLabel(r.date), r.desc, r.debit, r.credit, r.balance]) }];
  return (
    <div data-testid="orange-reports" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div role="tablist" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 5 }}>
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} data-testid={`oc-rep-tab-${k}`} onClick={() => go(k)} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "9px 18px", borderRadius: 12, background: tab === k ? "#2b1a12" : "transparent", color: tab === k ? "#fff" : "var(--text-secondary)" }}>{l}</button>)}
        </div>
        {tab === "ledger" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid var(--border)", background: "var(--bg-card)", borderRadius: 12, padding: "0 12px", fontSize: 13, color: "var(--text-secondary)" }}>
              <Icon name="CalendarDays" size={15} />
              <select data-testid="oc-rep-range" value={rk} onChange={(e) => setRk(e.target.value)} style={{ border: "none", background: "transparent", color: "var(--text-primary)", fontFamily: "inherit", fontSize: 13, padding: "10px 4px", cursor: "pointer" }}>
                {Object.entries(RANGES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <ExportBar title={`دفتر کل — ${RANGES[rk][0]}`} fileBase="ledger-overview" sections={sections} kpis={[["جمع درآمد", cur.income], ["جمع هزینه", cur.expense], ["سود خالص", cur.net]]} />
          </div>)}
      </div>

      {tab === "full" ? <div data-testid="orange-legacy-report">{children}</div> : (<>
        <div className="oc-grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
          <Kpi testid="rep-income" label="جمع درآمد" value={num(cur.income)} unit={u} trend={pctChange(cur.income, prev.income)} tint={["rgba(232,89,12,.13)", ORANGE]} icon={<Icon name="TrendingUp" size={22} />} />
          <Kpi testid="rep-expense" label="جمع هزینه" value={num(cur.expense)} unit={u} trend={pctChange(cur.expense, prev.expense)} invert tint={["rgba(214,51,57,.12)", "#d63339"]} icon={<Icon name="TrendingDown" size={22} />} />
          <div data-testid="rep-net" className="oc-card" style={{ background: "linear-gradient(135deg,#ff9a3c,#e8590c)", color: "#fff", borderRadius: 22, padding: 20, boxShadow: "0 14px 30px rgba(232,89,12,.30)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13.5, opacity: 0.95 }}>سود خالص</span><span style={{ fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,.2)", borderRadius: 999, padding: "2px 10px" }}>{pctChange(cur.net, prev.net) >= 0 ? "▲" : "▼"} {toFA(Math.abs(pctChange(cur.net, prev.net)))}٪</span></div>
            <div data-testid="rep-net-value" style={{ fontSize: 28, fontWeight: 800 }}>{num(cur.net)} <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{u}</span></div>
          </div>
        </div>

        <Card testid="orange-bars" title={`درآمد و هزینهٔ ماهانه (${u})`} action={<div style={{ display: "flex", gap: 14, fontSize: 12.5, color: "var(--text-secondary)" }}><span><i style={{ display: "inline-block", width: 11, height: 11, borderRadius: 4, background: ORANGE, marginInlineEnd: 5 }} />درآمد</span><span><i style={{ display: "inline-block", width: 11, height: 11, borderRadius: 4, background: PEACH, marginInlineEnd: 5 }} />هزینه</span></div>}>
          {bars.some((b) => b.income || b.expense) ? <PairBars data={bars} /> : <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0", fontSize: 13 }}>هنوز تراکنشی برای نمودار ثبت نشده است</div>}
        </Card>

        <Card testid="orange-ledger" pad={0} style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "18px 20px" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>دفتر کل</h3>
            <input data-testid="oc-ledger-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="فیلتر بر اساس شرح…" aria-label="فیلتر دفتر کل" style={{ border: "1px solid var(--border)", background: "var(--bg-app)", color: "var(--text-primary)", borderRadius: 12, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, width: 190 }} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
              <thead><tr style={{ background: "var(--bg-app)", color: "var(--text-muted)", fontSize: 12.5 }}>{["تاریخ", "شرح", "بدهکار", "بستانکار", "مانده"].map((h) => <th key={h} style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700 }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid="oc-ledger-row" style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{jalaliLabel(r.date)}</td>
                    <td style={{ padding: "12px 16px", color: "var(--text-primary)" }}>{r.desc}</td>
                    <td style={{ padding: "12px 16px", color: "#d63339" }}>{r.debit ? num(r.debit) : "—"}</td>
                    <td style={{ padding: "12px 16px", color: "#2f9e57" }}>{r.credit ? num(r.credit) : "—"}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 800, color: "var(--text-primary)" }}>{num(r.balance)}</td>
                  </tr>))}
                {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 36, textAlign: "center", color: "var(--text-muted)" }}>در این بازه تراکنشی نیست</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </>)}
    </div>);
}
