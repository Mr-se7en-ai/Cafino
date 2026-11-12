// داشبورد «تم نارنجی»: کارت‌های امروز، نمودار درآمد، سهم خدمات، آخرین تراکنش‌ها و هشدار انبار — همه از دادهٔ واقعی
import React, { useState } from "react";
import Icon from "../../components/Icon.jsx";
import { toFA } from "../../app/core/format.js";
import { jalaliLabel } from "../../app/domain/backup.js";
import { todayIso } from "../../app/core/jalali.js";
import { getSales, useDataSync } from "../../app/domain/sales.jsx";
import { useCustomers } from "../../app/pages/customers.jsx";
import { useInventory } from "../../app/pages/inventory.jsx";
import { activeCustomers, dayKpis, incomeShare, recentTx, revenueSeries, stockLevels } from "./data.js";
import { NewsWidget } from "../../app/pages/newsWidget.jsx";
import { AreaChart, Card, Donut, Kpi, LinkBtn, Progress, Segmented, SLICE_COLORS, num, unit } from "./ui.jsx";

export function OrangeDashboard({ transactions, onNavigate, children }) {
  const [, tick] = useState(0); useDataSync(() => tick((t) => t + 1));
  const [customers] = useCustomers();
  const [stock] = useInventory();
  const [range, setRange] = useState("month");
  const today = todayIso();
  const k = dayKpis(transactions, today);
  const ac = activeCustomers(customers, getSales(), today);
  const series = revenueSeries(transactions, range, today);
  const share = incomeShare(transactions, today);
  const recent = recentTx(transactions, 5);
  const st = stockLevels(stock, 4);
  const u = unit();
  const titles = { week: "درآمد ۷ روز اخیر", month: "درآمد ۳۰ روز اخیر", year: "درآمد ۱۲ ماه اخیر" };
  const hasSeries = series.some((p) => p.value > 0);
  return (
    <div data-testid="orange-dashboard" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <LinkBtn testid="oc-to-mgmt" onClick={() => onNavigate("mgmt")}>داشبورد مدیریتی (کاشی‌ها و دسترسی سریع) ←</LinkBtn>
      </div>
      <div className="oc-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
        <Kpi testid="kpi-income" label="درآمد امروز" value={num(k.income)} unit={u} trend={k.trend.income} tint={["rgba(232,89,12,.13)", "#e8590c"]} icon={<Icon name="Wallet" size={22} />} />
        <Kpi testid="kpi-expense" label="هزینه امروز" value={num(k.expense)} unit={u} trend={k.trend.expense} invert tint={["rgba(214,51,57,.12)", "#d63339"]} icon={<Icon name="TrendingDown" size={22} />} />
        <Kpi testid="kpi-net" label="سود خالص امروز" value={num(k.net)} unit={u} trend={k.trend.net} tint={["rgba(47,158,87,.13)", "#2f9e57"]} icon={<Icon name="TrendingUp" size={22} />} />
        <Kpi testid="kpi-customers" label="مشتریان فعال" value={toFA(ac.count)} unit={`نفر از ${toFA(ac.total)}`} trend={ac.trend} tint={["rgba(59,125,221,.13)", "#3b7ddd"]} icon={<Icon name="Users" size={22} />} />
      </div>

      <div className="oc-grid2" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)", gap: 16 }}>
        <Card testid="orange-chart" title={titles[range]} action={<Segmented testid="range" value={range} onChange={setRange} options={[["week", "هفته"], ["month", "ماه"], ["year", "سال"]]} />}>
          {hasSeries ? <AreaChart points={series} testid="orange-area" /> : <Empty text="هنوز درآمدی در این بازه ثبت نشده است" />}
        </Card>
        <Card testid="orange-share" title="سهم خدمات از درآمد">
          {share.total > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <Donut testid="orange-donut" slices={share.slices} centerTop={`${toFA(100)}٪`} centerBottom="درآمد ماه" />
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7 }}>
                {share.slices.map((s, i) => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: SLICE_COLORS[i % SLICE_COLORS.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--text-secondary)" }}>{s.label}</span>
                    <b style={{ color: "var(--text-primary)" }}>{toFA(s.pct)}٪</b>
                  </div>))}
              </div>
            </div>) : <Empty text="در ۳۰ روز گذشته درآمدی نیست" />}
        </Card>
      </div>

      <div className="oc-grid2" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 16 }}>
        <Card testid="orange-recent" title="آخرین تراکنش‌ها" action={<LinkBtn testid="orange-all-tx" onClick={() => onNavigate("transactions")}>مشاهده همه</LinkBtn>}>
          {recent.length === 0 ? <Empty text="تراکنشی ثبت نشده است" /> : recent.map((t, i) => {
            const inc = t.type === "income";
            return (
              <div key={t.id} data-testid="orange-tx-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i ? "1px dashed var(--border)" : "none" }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: inc ? "rgba(47,158,87,.13)" : "rgba(214,51,57,.12)", color: inc ? "#2f9e57" : "#d63339", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={inc ? "TrendingUp" : "TrendingDown"} size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc || t.category}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.category} · {jalaliLabel(String(t.date).slice(0, 10))}</div>
                </div>
                <b style={{ fontSize: 14, color: inc ? "#2f9e57" : "#d63339", whiteSpace: "nowrap", direction: "ltr" }}>{inc ? "+" : "−"}{num(t.amount)}</b>
              </div>);
          })}
        </Card>
        <Card testid="orange-stock" title="هشدار موجودی انبار" action={<LinkBtn onClick={() => onNavigate("inventory")}>انبار</LinkBtn>}>
          {st.rows.length === 0 ? <Empty text="کالایی با حداقل موجودی تعریف نشده است" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {st.rows.map((r) => (
                <div key={r.id} data-testid="orange-stock-row" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ width: 96, color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</span>
                  <Progress pct={r.pct} low={r.low} />
                  <b style={{ width: 38, textAlign: "left", color: r.low ? "#d63339" : "var(--text-secondary)" }}>{toFA(r.pct)}٪</b>
                </div>))}
              {st.lowCount > 0 && <div data-testid="orange-stock-warn" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, background: "rgba(232,89,12,.10)", color: "#d9560f", borderRadius: 12, padding: "11px 14px", fontSize: 13, fontWeight: 700 }}><Icon name="AlertTriangle" size={16} />{toFA(st.lowCount)} قلم در حال اتمام است</div>}
            </div>)}
        </Card>
      </div>
      <div data-testid="orange-news" style={{ marginTop: 6 }}><NewsWidget /></div>
      {children && <div data-testid="orange-legacy-dash" style={{ marginTop: 6 }}><div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", margin: "6px 4px 12px" }}>دسترسی سریع و ابزارها</div>{children}</div>}
    </div>);
}

function Empty({ text }) { return <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "34px 10px" }}>{text}</div>; }
