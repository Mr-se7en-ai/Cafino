// «فاکتورها» در تم نارنجی: فهرست فاکتورهای اخیر + پیش‌نمایش فاکتور انتخاب‌شده. ساخت/ویرایش/ابطال/چاپ و PDF همان بخش کامل قبلی است.
import React, { useState } from "react";
import Icon from "../../components/Icon.jsx";
import { toFA } from "../../app/core/format.js";
import { jalaliLabel } from "../../app/domain/backup.js";
import { useInvoices, useShopInfo } from "../../app/domain/invoiceData.js";
import { setPendingInvoiceOpen } from "../../app/domain/sales.jsx";
import { InvoiceSection } from "../../app/pages/invoices.jsx";
import BrandLogo from "../../app/components/BrandLogo.jsx";
import { Card, Pill, num, unit } from "./ui.jsx";

const totalOf = (iv) => {
  if (Number(iv.totalAmount) > 0) return Number(iv.totalAmount);
  const sub = (iv.items || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  return Math.max(0, sub - (Number(iv.discount) || 0));
};
const ST = { paid: ["پرداخت‌شده", "green", "#2f9e57"], partial: ["نیمه‌پرداخت", "orange", "#e8590c"], unpaid: ["پرداخت‌نشده", "red", "#d63339"], draft: ["پیش‌نویس", "gray", "#8a7a6e"] };
const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

export function OrangeInvoices(props) {
  const { pendingAction } = props;
  const [invoices] = useInvoices();
  const [shop] = useShopInfo();
  const [mode, setMode] = useState("overview");
  const [fullAction, setFullAction] = useState(null);
  const [sel, setSel] = useState(null);

  if (mode === "full" || pendingAction === "new_invoice") {
    return (
      <div>
        {mode === "full" && <button type="button" data-testid="oc-inv-back" onClick={() => { setMode("overview"); setFullAction(null); }} style={{ marginBottom: 12, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 14px", color: "var(--accent-light)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>→ بازگشت به نمای کلی فاکتورها</button>}
        <InvoiceSection {...props} pendingAction={fullAction || pendingAction} clearPendingAction={() => { setFullAction(null); props.clearPendingAction && props.clearPendingAction(); }} />
      </div>);
  }

  const list = invoices.filter((iv) => iv && iv.status !== "draft").slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (Number(b.createdTs) || Number(b.id) || 0) - (Number(a.createdTs) || Number(a.id) || 0));
  const recent = list.slice(0, 12);
  const cur = invoices.find((iv) => String(iv.id) === String(sel)) || recent[0] || null;
  const openPrint = (iv) => { setPendingInvoiceOpen(iv.id); setMode("full"); };
  const u = unit();
  const st = cur ? ST[cur.status] || ST.paid : null;
  const sub = cur ? (cur.items || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0) : 0;
  const discount = cur ? Number(cur.discount) || 0 : 0;
  const total = cur ? totalOf(cur) : 0;

  return (
    <div data-testid="orange-invoices" className="oc-inv" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2.15fr)", gap: 16, alignItems: "start" }}>
      <Card title="فاکتورهای اخیر" testid="oc-inv-list" style={{ display: "flex", flexDirection: "column" }}>
        {recent.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "30px 8px" }}>هنوز فاکتوری ثبت نشده است.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 560, overflowY: "auto" }}>
          {recent.map((iv) => {
            const s = ST[iv.status] || ST.paid, on = cur && String(cur.id) === String(iv.id);
            return (
              <button key={iv.id} type="button" data-testid="oc-inv-item" aria-pressed={on} onClick={() => setSel(iv.id)} style={{ textAlign: "right", fontFamily: "inherit", cursor: "pointer", border: "none", borderRadius: 16, padding: "12px 14px", background: on ? "rgba(232,89,12,.10)" : "transparent", display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 10px", alignItems: "center" }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: "var(--text-primary)" }}>فاکتور {toFA(iv.number)}</span>
                <b style={{ fontSize: 14, color: "var(--text-primary)" }}>{num(totalOf(iv))}</b>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iv.customerName || "مشتری نقدی"}</span>
                <Pill tone={s[1]}>{s[0]}</Pill>
              </button>);
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
          <button type="button" data-testid="oc-inv-print" disabled={!cur} onClick={() => cur && openPrint(cur)} style={{ flex: "1 1 90px", border: "none", cursor: cur ? "pointer" : "default", fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "11px 12px", borderRadius: 12, background: "linear-gradient(135deg,#ff9a3c,#e8590c)", color: "#fff", opacity: cur ? 1 : 0.5, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="Printer" size={15} />چاپ</button>
          <button type="button" data-testid="oc-inv-pdf" disabled={!cur} onClick={() => cur && openPrint(cur)} style={ghost}><Icon name="FileText" size={15} />PDF</button>
          <button type="button" data-testid="oc-inv-send" disabled={!cur} onClick={() => cur && openPrint(cur)} style={ghost}><Icon name="Send" size={15} />ارسال</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" data-testid="oc-inv-new" onClick={() => { setFullAction("new_invoice"); setMode("full"); }} style={{ ...ghost, flex: 1 }}><Icon name="Plus" size={15} />فاکتور جدید</button>
          <button type="button" data-testid="oc-inv-full" onClick={() => setMode("full")} style={{ ...ghost, flex: 1 }}>مدیریت کامل</button>
        </div>
      </Card>

      {cur ? (
        <Card testid="oc-inv-preview" pad={0} style={{ overflow: "hidden" }}>
          <div style={{ padding: "26px 28px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {shop.logo ? <img src={shop.logo} alt="لوگو" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 14, background: "#fff" }} /> : <BrandLogo size={56} />}
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>{shop.name || "کافی‌نت"}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{[shop.address, shop.phone && faDigits(shop.phone)].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div data-testid="oc-inv-number" style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>فاکتور شماره {toFA(cur.number)}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>تاریخ: {jalaliLabel(String(cur.date || "").slice(0, 10))}{cur.time ? ` — ساعت ${faDigits(cur.time)}` : ""}</div>
              </div>
            </div>
            <div style={{ height: 2, background: "var(--text-primary)", opacity: 0.85, margin: "18px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: 14, marginBottom: 16 }}>
              <span><span style={{ color: "var(--text-muted)" }}>مشتری: </span><b>{cur.customerName || "مشتری نقدی"}</b></span>
              {cur.customerPhone && <span><span style={{ color: "var(--text-muted)" }}>موبایل: </span><b style={{ direction: "ltr", display: "inline-block" }}>{faDigits(cur.customerPhone)}</b></span>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 420 }}>
                <thead><tr style={{ background: "#2b1a12", color: "#f6eadf" }}>{["#", "شرح خدمت", "تعداد", `فی (${u})`, `مبلغ (${u})`].map((h) => <th key={h} style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(cur.items || []).map((l, i) => (
                    <tr key={l.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={cell}>{toFA(i + 1)}</td><td style={{ ...cell, fontWeight: 600 }}>{l.desc}</td><td style={cell}>{toFA(l.qty)}</td><td style={cell}>{num(l.price)}</td><td style={{ ...cell, fontWeight: 700 }}>{num((Number(l.qty) || 0) * (Number(l.price) || 0))}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
              <div style={{ flex: "1 1 240px", maxWidth: 360 }}>
                <Row l="جمع کل" v={num(sub)} />
                {discount > 0 && <Row l="تخفیف" v={`${num(discount)}−`} color="#2f9e57" />}
                {Number(cur.remainingAmount) > 0 && <Row l="مانده بدهی" v={num(cur.remainingAmount)} color="#d63339" />}
                <div style={{ marginTop: 8, background: "rgba(232,89,12,.10)", borderRadius: 14, padding: "13px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ fontSize: 14, color: "var(--text-primary)" }}>مبلغ قابل پرداخت</b>
                  <b data-testid="oc-inv-total" style={{ fontSize: 17, color: "#d9560f" }}>{num(total)} {u}</b>
                </div>
              </div>
              <div data-testid="oc-inv-stamp" style={{ border: `4px solid ${st[2]}`, color: st[2], borderRadius: 16, padding: "10px 30px", fontSize: 26, fontWeight: 800, transform: "rotate(-8deg)", opacity: 0.88, whiteSpace: "nowrap" }}>{st[0]}</div>
            </div>
          </div>
          <div style={{ borderTop: "1px dashed var(--border)", padding: "14px 28px 22px", textAlign: "center", fontSize: 12.5, color: "var(--text-muted)" }}>{shop.footer || `از اعتماد شما سپاسگزاریم — ${shop.name || ""}`}</div>
        </Card>
      ) : <Card><div style={{ textAlign: "center", color: "var(--text-muted)", padding: 50 }}>فاکتوری برای نمایش نیست. با «فاکتور جدید» شروع کنید.</div></Card>}
    </div>);
}
const ghost = { border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "11px 12px", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flex: "1 1 70px" };
const cell = { padding: "12px", textAlign: "right", color: "var(--text-primary)" };
function Row({ l, v, color }) { return <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 2px", fontSize: 14 }}><span style={{ color: "var(--text-muted)" }}>{l}</span><b style={{ color: color || "var(--text-primary)" }}>{v}</b></div>; }
