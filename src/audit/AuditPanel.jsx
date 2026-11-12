// نمایش «گزارش حسابرسی» (Audit Trail): رویدادهای حساس با زمان شمسی، کاربر، عملیات، رکورد، مبلغ، دلیل و دستگاه.
import React, { useState, useMemo } from "react";
import { BTN, INP } from "../app/core/constants.js";
import { fmtM, toFA } from "../app/core/format.js";
import { gregorianToJalali } from "../app/core/jalali.js";
import { AUDIT_ACTIONS, SEVERITY_LABEL, auditStats, eventsToCsv, exportChainJson, getAuditEvents, getDevice, setDeviceLabel, verifyAuditChain } from "./auditTrail.js";
import { useDataSync } from "../app/domain/sales.jsx";

export function fmtJalaliDT(iso) {
  try {
    const d = new Date(iso); const [y, m, dd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const p = (n) => String(n).padStart(2, "0");
    return `${toFA(y)}/${toFA(p(m))}/${toFA(p(dd))}  ${toFA(p(d.getHours()))}:${toFA(p(d.getMinutes()))}`;
  } catch { return "—"; }
}
const SEV = { info: { c: "#94a3b8", bg: "#94a3b81a" }, sensitive: { c: "#fbbf24", bg: "#fbbf241a" }, critical: { c: "#f87171", bg: "#f871711a" } };
const RANGES = [["all", "همه"], ["1", "امروز"], ["7", "۷ روز"], ["30", "۳۰ روز"]];

function download(name, text, type) {
  try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch { /* ignore */ }
}
const brief = (o) => { if (!o) return ""; try { return Object.entries(o).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object").map(([k, v]) => `${LBL[k] || k}: ${typeof v === "number" ? (MONEY.has(k) ? fmtM(v) : toFA(v)) : v}`).join(" · "); } catch { return ""; } };
const MONEY = new Set(["total", "paid", "price", "salePrice", "unitCost", "amount", "remaining", "balance", "balanceDue", "wallet"]);
const LBL = { total: "جمع", paid: "پرداخت", qty: "تعداد", price: "قیمت", salePrice: "قیمت فروش", unitCost: "بهای تمام‌شده", amount: "مبلغ", category: "نوع", date: "تاریخ", remaining: "مانده", unit: "واحد", balance: "مانده حساب", entries: "اسناد", wallet: "کیف پول", balanceDue: "مانده بدهی", sections: "بخش‌ها", kind: "نوع" };

export function AuditPanel() {
  const [tick, setTick] = useState(0);
  useDataSync(() => setTick((t) => t + 1));
  const [sev, setSev] = useState(""), [act, setAct] = useState(""), [q, setQ] = useState(""), [range, setRange] = useState("all"), [noR, setNoR] = useState(false), [info, setInfo] = useState(false), [limit, setLimit] = useState(30);
  const [chk, setChk] = useState(null), [devEdit, setDevEdit] = useState(null);
  const from = range === "all" ? "" : new Date(Date.now() - (Number(range) - 1) * 864e5).toISOString().slice(0, 10);
  const list = useMemo(() => getAuditEvents({ severity: sev || null, action: act || null, q, from, onlyNoReason: noR, includeInfo: info || sev === "info" }), [sev, act, q, range, noR, info, tick]);  
  const st = useMemo(() => auditStats(), [tick]);  
  const dev = getDevice();
  const verify = () => setChk({ ...verifyAuditChain(), at: Date.now() });
  return (
    <div data-testid="audit-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)" }}>🛡️ گزارش حسابرسی (Audit Trail)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button data-testid="audit-verify" onClick={verify} style={{ ...BTN("#2563eb"), padding: "6px 14px", fontSize: 12 }}>🔍 بررسی صحت زنجیره</button>
            <button data-testid="audit-csv" onClick={() => download("cafino-audit.csv", eventsToCsv(list), "text/csv;charset=utf-8")} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>⬇ CSV</button>
            <button data-testid="audit-json" onClick={() => download("cafino-audit-chain.json", exportChainJson(), "application/json")} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>⬇ JSON امضاشده</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 12 }}>
          {[["عملیات حساس", st.total, "var(--text-primary)"], ["۳۰ روز اخیر", st.recent30, "#60a5fa"], ["بحرانی (۳۰ روز)", st.critical30, st.critical30 ? "#f87171" : "var(--text-primary)"], ["بدون دلیل", st.noReason, st.noReason ? "#fbbf24" : "#4ade80"]].map(([l, v, c]) => (
            <div key={l} style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l}</div><div style={{ fontSize: 20, fontWeight: 800, color: c }}>{toFA(v)}</div></div>
          ))}
        </div>
        {chk && <div data-testid="audit-verify-result" style={{ padding: "10px 12px", borderRadius: 10, fontSize: 13, marginBottom: 12, background: chk.ok ? "#14532d33" : "#7f1d1d44", color: chk.ok ? "#4ade80" : "#fca5a5", lineHeight: 1.9 }}>
          {chk.ok ? "✓ " : "⛔ "}{chk.message}{!chk.ok && <div style={{ fontSize: 12 }}>دفتر حسابرسی پس از ثبت دستکاری شده است؛ از آخرین بکاپ/خروجی JSON امضاشده برای مقایسه استفاده کنید.</div>}
        </div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input data-testid="audit-q" value={q} onChange={(e) => { setQ(e.target.value); setLimit(30); }} placeholder="جستجو: فاکتور، کاربر، دلیل…" style={{ ...INP, marginTop: 0, flex: "2 1 160px", fontSize: 12 }} />
          <select value={sev} onChange={(e) => { setSev(e.target.value); setLimit(30); }} style={{ ...INP, marginTop: 0, flex: "1 1 100px", fontSize: 12 }}><option value="">همهٔ شدت‌ها</option>{Object.entries(SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={act} onChange={(e) => { setAct(e.target.value); setLimit(30); }} style={{ ...INP, marginTop: 0, flex: "1 1 130px", fontSize: 12 }}><option value="">همهٔ عملیات</option>{Object.entries(AUDIT_ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select value={range} onChange={(e) => setRange(e.target.value)} style={{ ...INP, marginTop: 0, flex: "1 1 90px", fontSize: 12 }}>{RANGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
          <label style={{ cursor: "pointer" }}><input type="checkbox" checked={noR} onChange={(e) => setNoR(e.target.checked)} /> فقط «بدون دلیل»</label>
          <label style={{ cursor: "pointer" }}><input data-testid="audit-info" type="checkbox" checked={info} onChange={(e) => setInfo(e.target.checked)} /> نمایش رویدادهای عادی (ورود، ثبت فروش…)</label>
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 18 }}>
        {list.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 24, fontSize: 13 }}>رویدادی با این فیلتر ثبت نشده است.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.slice(0, limit).map((e) => {
              const sv = SEV[e.severity] || SEV.info;
              return (
                <div key={e.id} data-testid="audit-row" data-action={e.action} style={{ background: "var(--bg-app)", borderRadius: 10, padding: "11px 14px", fontSize: 12.5, borderInlineStart: `3px solid ${sv.c}`, lineHeight: 1.9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <b style={{ color: "var(--text-primary)", fontSize: 13.5 }}>{e.label}</b>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {e.noReason && <span style={{ background: "#fbbf2433", color: "#fbbf24", borderRadius: 8, padding: "0 8px", fontSize: 11 }}>بدون دلیل</span>}
                      <span style={{ background: sv.bg, color: sv.c, borderRadius: 8, padding: "0 8px", fontSize: 11 }}>{SEVERITY_LABEL[e.severity]}</span>
                      <span dir="ltr" style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtJalaliDT(e.ts)}</span>
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "0 16px", color: "var(--text-secondary)" }}>
                    <div>کاربر: <b style={{ color: "var(--text-primary)" }}>{e.actor}</b></div>
                    {(e.entityLabel || e.entityId) && <div>{e.entityType || "رکورد"}: <b style={{ color: "var(--text-primary)" }}>{e.entityLabel || toFA(e.entityId)}</b></div>}
                    {e.amount != null && <div>مبلغ: <b style={{ color: "var(--text-primary)" }}>{fmtM(e.amount)}</b></div>}
                    {e.device && <div>دستگاه: <b style={{ color: "var(--text-primary)" }}>{e.device}</b></div>}
                  </div>
                  {e.reason && <div style={{ color: "var(--text-secondary)" }}>علت: <b style={{ color: "var(--text-primary)" }}>{e.reason}</b></div>}
                  {e.details && !e.reason && <div style={{ color: "var(--text-muted)" }}>{e.details}</div>}
                  {(e.before || e.after) && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{e.before && <>قبل: {brief(e.before) || "—"}</>}{e.before && e.after && "  ⟶  "}{e.after && <>بعد: {brief(e.after) || "—"}</>}</div>}
                </div>
              );
            })}
            {list.length > limit && <button onClick={() => setLimit((l) => l + 50)} style={{ ...BTN("var(--bg-app)", "var(--text-secondary)"), padding: 9, fontSize: 12 }}>نمایش بیشتر ({toFA(list.length - limit)} مورد دیگر)</button>}
          </div>
        )}
      </div>

      <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 18, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 2 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>🖥️ این دستگاه</div>
        {devEdit === null ? <div>نام دستگاه در گزارش‌ها: <b style={{ color: "var(--text-primary)" }}>{dev.label}</b> <span dir="ltr" style={{ color: "var(--text-muted)" }}>({dev.id})</span> <button data-testid="audit-dev-edit" onClick={() => setDevEdit(dev.custom ? dev.label : "")} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "3px 10px", fontSize: 11, marginInlineStart: 8 }}>تغییر نام</button></div>
          : <div style={{ display: "flex", gap: 8 }}><input data-testid="audit-dev-input" value={devEdit} onChange={(e) => setDevEdit(e.target.value)} placeholder="مثلاً POS-02 یا صندوق ۱" maxLength={40} style={{ ...INP, marginTop: 0, fontSize: 12 }} /><button data-testid="audit-dev-save" onClick={() => { setDeviceLabel(devEdit); setDevEdit(null); setTick((t) => t + 1); }} style={{ ...BTN("#2563eb"), padding: "6px 14px", fontSize: 12 }}>ذخیره</button></div>}
        <div style={{ marginTop: 8, color: "var(--text-muted)" }}>این دفتر پاک‌شدنی نیست و هر رویداد حساس به هش رویداد قبلی وصل است؛ ویرایش یا حذف یک رویداد با «بررسی صحت» آشکار می‌شود. ⚠ ذخیره‌سازی در مرورگر است و صاحب دستگاه می‌تواند کل داده‌های مرورگر را پاک کند — برای تضمین کامل، خروجی «JSON امضاشده» را دوره‌ای نگه دارید یا همگام‌سازی با سرور را فعال کنید.</div>
      </div>
    </div>
  );
}
