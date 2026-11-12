// گزارش فروش آنلاین — به تفکیک پلتفرم، وضعیت پیگیری، هزینهٔ ارسال/کارمزد و سود (فقط خواندن؛ همه‌چیز از خود فروش‌ها و تراکنش‌ها)
import React, { useState } from "react";
import { fmtM, toFA } from "../core/format.js";
import { BTN, ONLINE_STATUSES, TX_KEY } from "../core/constants.js";
import { todayIso } from "../core/jalali.js";
import { jalaliLabel } from "../domain/backup.js";
import { ExportBar } from "../components/reportExport.jsx";
import { getSales, lsRead, useDataSync } from "../domain/sales.jsx";
import { onlineStats, onlineStatusInfo } from "../domain/onlineSales.js";
import { ReportTable } from "../domain/topup.jsx";

const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const RANGES = [["today", "امروز"], ["week", "۷ روز اخیر"], ["month", "۳۰ روز اخیر"], ["all", "همه"]];

export function OnlineReport() {
  const [, setTick] = useState(0);
  useDataSync(() => setTick((t) => t + 1));
  const [range, setRange] = useState("month");
  const t = todayIso();
  const from = range === "today" ? t : range === "week" ? addDays(t, -6) : range === "month" ? addDays(t, -29) : "";
  const stats = onlineStats(getSales(), lsRead(TX_KEY, []), (d) => !from || (d >= from && d <= t));
  const KP = (label, val, color) => (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${color}44`, borderRadius: 12, padding: "12px 14px", flex: "1 1 150px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 4 }}>{val}</div>
    </div>
  );
  const platformSec = { name: "فروش آنلاین به تفکیک پلتفرم", head: ["پلتفرم", "تعداد", "فروش (ریال)", "هزینه ارسال", "کارمزد", "سود ناخالص"], rows: stats.byPlatform.map((g) => [g.platform, toFA(g.count), g.revenue, g.ship, g.fee, g.profit]), money: [2, 3, 4, 5] };
  const orderSec = { name: "سفارش‌های آنلاین", head: ["تاریخ", "مشتری", "پلتفرم", "وضعیت", "فروش (ریال)", "ارسال", "کارمزد", "سود ناخالص"], rows: stats.rows.map((r) => [jalaliLabel(r.sale.date), r.sale.customerName || "—", (r.sale.online || {}).platform || "", onlineStatusInfo((r.sale.online || {}).status).label, r.revenue, r.ship, r.fee, r.profit]), money: [4, 5, 6, 7] };
  return (
    <div data-testid="online-report">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {RANGES.map(([k, l]) => <button key={k} data-testid={`onl-range-${k}`} onClick={() => setRange(k)} style={{ ...BTN(range === k ? "#2563eb" : "var(--bg-card)", range === k ? "#fff" : "var(--text-secondary)"), fontSize: 12, padding: "6px 12px" }}>{l}</button>)}
      </div>
      <ExportBar title="گزارش فروش آنلاین" fileBase="online-sales" sections={[platformSec, orderSec]} kpis={[["تعداد سفارش آنلاین", toFA(stats.count)], ["فروش آنلاین", fmtM(stats.revenue)], ["سود ناخالص", fmtM(stats.profit)]]} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {KP("تعداد سفارش آنلاین", toFA(stats.count), "#60a5fa")}
        {KP("فروش آنلاین", fmtM(stats.revenue), "#4ade80")}
        {KP("هزینه ارسال + کارمزد", fmtM(stats.ship + stats.fee), "#f87171")}
        {KP("سود ناخالص", fmtM(stats.profit), "#fbbf24")}
        {KP("سهم از کل فروش", toFA(Math.round(stats.share * 100)) + "٪", "#c084fc")}
      </div>
      <div data-testid="online-status-counts" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {ONLINE_STATUSES.map((s) => <span key={s.key} style={{ background: "var(--bg-card)", border: `1px solid ${s.color}66`, color: s.color, borderRadius: 20, padding: "4px 12px", fontSize: 12 }}>{s.label}: <b>{toFA(stats.byStatus[s.key] || 0)}</b></span>)}
      </div>
      {stats.count === 0
        ? <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>در این بازه فروش آنلاینی ثبت نشده است. از «فروش» ← «فروش آنلاین جدید» شروع کنید.</div>
        : <><ReportTable s={platformSec} /><ReportTable s={orderSec} /></>}
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.9 }}>درآمد فروش آنلاین مثل فروش حضوری فقط با دریافت پول ثبت می‌شود؛ هزینهٔ ارسال و کارمزد به‌صورت هزینهٔ مستقیم همان فروش حساب شده و روی سود ناخالص اثر دارد. سفارش‌های ابطال‌شده در این گزارش نیستند.</div>
    </div>
  );
}
