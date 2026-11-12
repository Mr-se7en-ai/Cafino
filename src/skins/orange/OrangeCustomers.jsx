// «مشتریان» در تم نارنجی: جدول مشتریان با فیلترها + پنل خلاصهٔ مشتری انتخاب‌شده. مدیریت کامل (افزودن، ویرایش، پرونده، کیف پول) همان بخش قبلی است.
import React, { useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { toFA } from "../../app/core/format.js";
import { jalaliLabel } from "../../app/domain/backup.js";
import { todayIso } from "../../app/core/jalali.js";
import { getSales, useDataSync } from "../../app/domain/sales.jsx";
import { CustomersSection, useCustomers } from "../../app/pages/customers.jsx";
import { clubAggregate, crmAggregate, crmStats, getClubConfig, getCrmConfig } from "../../app/domain/club.js";
import { setSearchFocus } from "../../app/domain/search.js";
import { addDaysIso, avatarColor, initialOf, relativeDay } from "./data.js";
import { Avatar, Card, Pill, num, unit } from "./ui.jsx";

const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

export function OrangeCustomers(props) {
  const { pendingAction } = props;
  const [rev, tick] = useState(0); useDataSync(() => tick((t) => t + 1));
  const [customers] = useCustomers();
  const [mode, setMode] = useState("overview");
  const [fullAction, setFullAction] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const today = todayIso();

  const rows = useMemo(() => {
    const crm = getCrmConfig(), club = getClubConfig(), ca = clubAggregate(), agg = crmAggregate();
    return customers.map((c) => {
      const s = crmStats(c, agg, crm, club, ca);
      const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || "بدون نام";
      const loyal = c.discountRule && c.discountRule.enabled && (c.serviceHistory || []).length >= Number(c.discountRule.threshold) ? Number(c.discountRule.percent) || 0 : 0;
      const discount = Math.max(loyal, s.club ? s.club.percent : 0);
      const inactive = s.count === 0 || !s.last || s.last < addDaysIso(today, -30);
      const status = s.debt > 0 ? "debtor" : s.golden ? "vip" : "active";
      return { c, s, name, discount, inactive, status };
    });
  }, [customers, today, rev]);

  if (mode === "full" || pendingAction === "new_customer" || props.forceMode || props.voicePrefill) {
    return (
      <div>
        {mode === "full" && <button type="button" data-testid="oc-back" onClick={() => { setMode("overview"); setFullAction(null); }} style={{ marginBottom: 12, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 14px", color: "var(--accent-light)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>→ بازگشت به نمای کلی مشتریان</button>}
        <CustomersSection {...props} pendingAction={fullAction || pendingAction} clearPendingAction={() => { setFullAction(null); props.clearPendingAction && props.clearPendingAction(); }} />
      </div>);
  }

  const counts = { all: rows.length, vip: rows.filter((r) => r.status === "vip").length, debtor: rows.filter((r) => r.status === "debtor").length, inactive: rows.filter((r) => r.inactive).length };
  const term = q.trim();
  const list = rows.filter((r) => (filter === "all" || (filter === "inactive" ? r.inactive : r.status === filter)) && (!term || r.name.includes(term) || String(r.c.phone || "").includes(term)))
    .sort((a, b) => (b.s.last || "").localeCompare(a.s.last || "") || a.name.localeCompare(b.name, "fa"));
  const cur = rows.find((r) => String(r.c.id) === String(sel)) || list[0] || null;
  const openFull = (id) => { if (id != null) setSearchFocus({ tab: "customers", focus: { kind: "customer", id } }); setMode("full"); };
  const newCustomer = () => { setFullAction("new_customer"); setMode("full"); };
  const u = unit();
  const chips = [["all", "همه"], ["vip", "مشتریان ویژه"], ["debtor", "بدهکار"], ["inactive", "بدون مراجعه"]];
  const statusPill = (r) => r.status === "debtor" ? <Pill tone="red">بدهکار</Pill> : r.status === "vip" ? <Pill tone="orange">مشتری ویژه</Pill> : <Pill tone="green">فعال</Pill>;
  const curSales = cur ? getSales().filter((s) => !s.cancelled && String(s.customerId) === String(cur.c.id)).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 5) : [];

  return (
    <div data-testid="orange-customers" className="oc-cust" style={{ display: "grid", gridTemplateColumns: "minmax(0,2.1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "16px 18px" }}>
          {chips.map(([k, l]) => (
            <button key={k} type="button" data-testid={`oc-filter-${k}`} aria-pressed={filter === k} onClick={() => setFilter(k)} style={{ border: filter === k ? "none" : "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 999, background: filter === k ? "#2b1a12" : "transparent", color: filter === k ? "#fff" : "var(--text-secondary)" }}>
              {l} <span style={{ opacity: 0.7, marginInlineStart: 4 }}>{toFA(counts[k])}</span></button>))}
          <span style={{ flex: 1 }} />
          <input data-testid="oc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام یا موبایل…" aria-label="جستجوی مشتری" style={{ border: "1px solid var(--border)", background: "var(--bg-app)", color: "var(--text-primary)", borderRadius: 12, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, minWidth: 150, flex: "0 1 190px" }} />
          <button type="button" data-testid="oc-new-customer" onClick={newCustomer} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, padding: "9px 18px", borderRadius: 12, background: "linear-gradient(135deg,#ff9a3c,#e8590c)", color: "#fff", display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="UserPlus" size={16} />مشتری جدید</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table data-testid="oc-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: "var(--bg-app)", color: "var(--text-muted)", fontSize: 12.5 }}>
              <th style={th}>مشتری</th><th className="oc-hide-sm" style={th}>موبایل</th><th className="oc-hide-sm" style={th}>کیف پول</th><th className="oc-hide-sm" style={th}>تخفیف</th><th style={th}>آخرین مراجعه</th><th style={th}>وضعیت</th>
            </tr></thead>
            <tbody>
              {list.map((r) => {
                const on = cur && String(cur.c.id) === String(r.c.id);
                return (
                  <tr key={r.c.id} data-testid="oc-row" tabIndex={0} onClick={() => setSel(r.c.id)} onKeyDown={(e) => { if (e.key === "Enter") setSel(r.c.id); }} style={{ cursor: "pointer", borderTop: "1px solid var(--border)", background: on ? "rgba(232,89,12,.08)" : "transparent" }}>
                    <td style={td}><span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}><Avatar name={initialOf(r.name)} color={avatarColor(r.c.id)} size={38} /><b style={{ color: "var(--text-primary)" }}>{r.name}</b></span></td>
                    <td className="oc-hide-sm" style={{ ...td, direction: "ltr", textAlign: "right", color: "var(--text-secondary)" }}>{faDigits(r.c.phone || "—")}</td>
                    <td className="oc-hide-sm" style={{ ...td, fontWeight: 800, color: (Number(r.c.wallet) || 0) > 0 ? "#2f9e57" : "var(--text-muted)" }}>{num(r.c.wallet || 0)}</td>
                    <td className="oc-hide-sm" style={{ ...td, color: "var(--text-secondary)" }}>{r.discount ? `${toFA(r.discount)}٪` : "—"}</td>
                    <td style={{ ...td, color: "var(--text-secondary)" }}>{faDigits(relativeDay(r.s.last, today))}</td>
                    <td style={td}>{statusPill(r)}</td>
                  </tr>);
              })}
              {list.length === 0 && <tr><td colSpan={6} style={{ padding: 36, textAlign: "center", color: "var(--text-muted)" }}>{rows.length === 0 ? "هنوز مشتری ثبت نشده است. با «مشتری جدید» شروع کنید." : "مشتری با این فیلتر پیدا نشد."}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {cur && (
        <Card testid="oc-detail" pad={18} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={initialOf(cur.name)} color={avatarColor(cur.c.id)} size={64} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{cur.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{cur.s.first ? `مشتری از ${jalaliLabel(cur.s.first)}` : "هنوز خریدی ثبت نشده"}</div>
            </div>
          </div>
          <div style={{ background: "#2b1a12", borderRadius: 18, padding: 18, color: "#f6eadf" }}>
            <div style={{ fontSize: 12.5, opacity: 0.8 }}>موجودی کیف پول</div>
            <div data-testid="oc-wallet" style={{ fontSize: 28, fontWeight: 800, margin: "4px 0 14px" }}>{num(cur.c.wallet || 0)} <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>{u}</span></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" data-testid="oc-charge" onClick={() => openFull(cur.c.id)} style={{ flex: 1, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "10px 12px", borderRadius: 12, background: "linear-gradient(135deg,#ff9a3c,#e8590c)", color: "#fff" }}>＋ شارژ کیف پول</button>
              <button type="button" onClick={() => openFull(cur.c.id)} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 12, background: "rgba(255,255,255,.12)", color: "#f6eadf" }}>برداشت</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[[cur.discount ? `${toFA(cur.discount)}٪` : "—", "تخفیف اختصاصی"], [num(cur.s.spent), `مجموع خرید (${u})`], [toFA(cur.s.count), "تعداد مراجعه"]].map(([v, l]) => (
              <div key={l} style={{ background: "var(--bg-app)", borderRadius: 14, padding: "12px 6px", textAlign: "center" }}><div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{v}</div><div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{l}</div></div>))}
          </div>
          {cur.s.debt > 0 && <div style={{ background: "rgba(214,51,57,.10)", color: "#d63339", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>بدهی باز: {num(cur.s.debt)} {u}</div>}
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 6 }}>آخرین تراکنش‌ها</div>
            {curSales.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "8px 0" }}>تراکنشی ثبت نشده است</div> : curSales.map((s, i) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 0", borderTop: i ? "1px dashed var(--border)" : "none", fontSize: 13 }}>
                <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || (s.lines && s.lines[0] && s.lines[0].desc) || "فروش"}</span>
                <b style={{ color: "#d63339", whiteSpace: "nowrap" }}>{num(s.total)}−</b>
              </div>))}
          </div>
          {(cur.c.files || []).length > 0 && <div><div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 8 }}>فایل‌های پرونده</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{cur.c.files.slice(0, 4).map((f) => <span key={f.id || f.name} style={{ background: "var(--bg-app)", borderRadius: 10, padding: "6px 12px", fontSize: 12, color: "var(--text-secondary)" }}>📄 {f.name}</span>)}</div></div>}
          <button type="button" data-testid="oc-open-full" onClick={() => openFull(cur.c.id)} style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--accent-light)", fontWeight: 800, borderRadius: 12, padding: "10px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>مشاهده پرونده کامل و ویرایش</button>
        </Card>)}
    </div>);
}
const th = { padding: "12px 16px", textAlign: "right", fontWeight: 700 };
const td = { padding: "12px 16px", textAlign: "right" };
