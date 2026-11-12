// «مرکز چاپ و اسکن» — دستگاه‌ها، ثبت جاب (چاپ / کپی / اسکن)، کنتور و گزارش.
// • نسخهٔ ویندوز: چاپ مستقیم روی پرینتر ویندوز با شمارش از spooler، اسکن با WIA، خواندن کنتور از پرینتر شبکه‌ای با SNMP.
// • مرورگر/PWA: همان صفحه با «ثبت دستی» کار می‌کند (تعداد صفحات را اپراتور وارد می‌کند؛ فایل PDF صفحه‌ها را خودکار می‌شمارد).
import React, { useState, useEffect, useMemo, useRef } from "react";
import { BTN, INP } from "../app/core/constants.js";
import { fmtM, toFA } from "../app/core/format.js";
import { jalaliLabel } from "../app/domain/backup.js";
import { SearchableSelect } from "../app/components/controls.jsx";
import { useCustomers } from "../app/pages/customers.jsx";
import { PAY_METHODS, useDataSync } from "../app/domain/sales.jsx";
import { askReason } from "../audit/ReasonDialog.jsx";
import { capabilities } from "../services/devices/deviceManager.js";
import * as Printer from "../services/devices/printer.js";
import * as Scanner from "../services/devices/scanner.js";
import {
  JOB_KINDS, JOB_STATUS, getDevices, saveDevice, removeDevice, mergeNativeDevices, getJobs, recordJob, billJob, voidJob, deviceOverview, devicePrice, summarize,
  periodReport, jobsToCsv, getMeterReadings, addMeterReading, reconcile, reconcileLatest, estimatedMeter, countPdfPagesAsync,
} from "./printCenter.js";

const card = { background: "var(--bg-card)", borderRadius: 12, padding: 18 };
const sub = { fontSize: 11.5, color: "var(--text-muted)" };
const ST = { done: ["#4ade80", "#14532d55"], partial: ["#fbbf24", "#78350f55"], failed: ["#f87171", "#7f1d1d55"], cancelled: ["#94a3b8", "#33415555"] };
const Badge = ({ status, voided }) => { const [c, bg] = ST[status] || ST.cancelled; return <span style={{ background: voided ? "#33415588" : bg, color: voided ? "#94a3b8" : c, borderRadius: 10, padding: "1px 9px", fontSize: 11, whiteSpace: "nowrap" }}>{voided ? "باطل" : JOB_STATUS[status] || status}</span>; };
const fmtDT = (ts) => { try { const d = new Date(ts); return `${jalaliLabel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)} ${toFA(String(d.getHours()).padStart(2, "0"))}:${toFA(String(d.getMinutes()).padStart(2, "0"))}`; } catch { return ""; } };
function download(name, text, type) { try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch { /* ignore */ } }

export function PrintCenter({ suggestPrice }) {
  const [tick, setTick] = useState(0);
  useDataSync(() => setTick((t) => t + 1));
  const [caps, setCaps] = useState({ native: false, printer: false, scanner: false, snmp: false, platform: "web" });
  useEffect(() => { let on = true; capabilities().then((c) => on && setCaps(c)); return () => { on = false; }; }, []);
  const devices = useMemo(() => getDevices().filter((d) => !d.archived), [tick]);  
  const jobs = useMemo(() => getJobs(), [tick]);  
  const [msg, setMsg] = useState(null);
  const flash = (type, text) => { setMsg({ type, text }); };
  useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(null), 12000); return () => clearTimeout(t); }, [msg]);
  const [edit, setEdit] = useState(null);

  const detect = async () => {
    try {
      let added = 0;
      if (caps.printer) { const p = await Printer.getPrinters(); added += mergeNativeDevices(p.map((x) => ({ name: x.name, displayName: x.displayName, ip: x.ip, color: x.color })), "printer").added; }
      if (caps.scanner) { const s = await Scanner.getScanners(); added += mergeNativeDevices(s.map((x) => ({ name: x.id, displayName: x.displayName })), "scanner").added; }
      flash("success", added ? `✓ ${toFA(added)} دستگاه جدید شناسایی شد` : "دستگاه جدیدی پیدا نشد (همهٔ دستگاه‌های ویندوز قبلاً اضافه شده‌اند)");
    } catch (e) { flash("error", e.message); }
  };
  const defaults = () => { if (!devices.some((d) => d.kind === "printer")) saveDevice({ kind: "printer", name: "پرینتر اصلی", color: true }); if (!devices.some((d) => d.kind === "scanner")) saveDevice({ kind: "scanner", name: "اسکنر اصلی" }); };

  return (
    <div data-testid="print-center" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div data-testid="pc-mode" style={{ ...card, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, background: caps.native ? "#052e1688" : "var(--bg-card)", border: `1px solid ${caps.native ? "#16a34a55" : "var(--border)"}` }}>
        <span style={{ fontSize: 18 }}>{caps.native ? "🖥️" : "🌐"}</span>
        <span style={{ flex: 1, minWidth: 220, color: "var(--text-secondary)", lineHeight: 1.9 }}>
          {caps.native ? <><b style={{ color: "#4ade80" }}>نسخهٔ ویندوز:</b> چاپ، اسکن و خواندن کنتور مستقیماً از دستگاه‌های ویندوز انجام می‌شود.</> : <><b>حالت ثبت دستی:</b> در مرورگر به پرینتر و اسکنر ویندوز دسترسی نیست؛ تعداد صفحات را وارد کنید (برای PDF خودکار شمرده می‌شود). چاپ و اسکن مستقیم در نسخهٔ دسکتاپ ویندوز فعال است.</>}
        </span>
        {caps.native && <button data-testid="pc-detect" onClick={detect} style={{ ...BTN("#2563eb"), padding: "6px 14px", fontSize: 12 }}>🔄 شناسایی دستگاه‌های ویندوز</button>}
      </div>
      {msg && <div data-testid="pc-msg" style={{ ...card, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.9, background: msg.type === "error" ? "#2d0a0a" : "#052e16", border: `1px solid ${msg.type === "error" ? "#dc262666" : "#16a34a44"}`, color: msg.type === "error" ? "#fca5a5" : "#86efac" }}>{msg.text}</div>}

      <DevicesSection devices={devices} jobs={jobs} caps={caps} flash={flash} onEdit={setEdit} onDefaults={defaults} />
      {edit && <DeviceForm dev={edit} caps={caps} onClose={() => setEdit(null)} flash={flash} />}
      <JobForm devices={devices} caps={caps} flash={flash} suggestPrice={suggestPrice} />
      <ReportSection devices={devices} jobs={jobs} flash={flash} />
    </div>
  );
}

// ───────── دستگاه‌ها + کنتور ─────────
function DevicesSection({ devices, jobs, caps, flash, onEdit, onDefaults }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)" }}>🖨️ دستگاه‌ها و کنتور</div>
        <div style={{ display: "flex", gap: 8 }}>
          {!devices.length && <button data-testid="pc-defaults" onClick={onDefaults} style={{ ...BTN("#16a34a"), padding: "6px 14px", fontSize: 12 }}>⚡ ساخت پرینتر و اسکنر پیش‌فرض</button>}
          <button data-testid="pc-add-device" onClick={() => onEdit({ kind: "printer" })} style={{ ...BTN("var(--border)", "var(--text-primary)"), padding: "6px 14px", fontSize: 12 }}>＋ دستگاه جدید</button>
        </div>
      </div>
      {!devices.length ? <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 20, fontSize: 13, lineHeight: 2 }}>هنوز دستگاهی تعریف نشده است. برای شروع «ساخت پرینتر و اسکنر پیش‌فرض» را بزنید{caps.native ? " یا دستگاه‌های ویندوز را شناسایی کنید" : ""}.</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 12 }}>
          {devices.map((d) => <DeviceCard key={d.id} dev={d} jobs={jobs} caps={caps} flash={flash} onEdit={() => onEdit(d)} />)}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ dev, jobs, caps, flash, onEdit }) {
  const ov = deviceOverview(dev.id, jobs), isP = dev.kind === "printer";
  const rs = getMeterReadings(dev.id), last = rs[rs.length - 1], rec = isP ? reconcileLatest(dev.id, jobs) : null, est = isP ? estimatedMeter(dev.id, jobs) : null;
  const [val, setVal] = useState(""), [open, setOpen] = useState(false), [reset, setReset] = useState(false), [busy, setBusy] = useState(false);
  const submit = (v, source) => {
    const r = addMeterReading({ deviceId: dev.id, value: v, reset, note: source === "snmp" ? "خوانده‌شده از دستگاه (SNMP)" : "" });
    if (!r.ok) { flash("error", r.error); if (r.needsReset) setReset(true); return; }
    setVal(""); setOpen(false); setReset(false);
    const rc = reconcileLatest(dev.id);
    flash(rc && rc.status !== "ok" ? "error" : "success", rc ? `✓ کنتور ثبت شد — ${rc.status === "ok" ? "با ثبت‌های برنامه می‌خواند" : `مغایرت: ${toFA(Math.abs(rc.diff))} صفحه ${rc.diff > 0 ? "چاپ ثبت‌نشده" : "ثبت بیش از کنتور"}`}` : "✓ کنتور پایهٔ این دستگاه ثبت شد؛ قرائت بعدی را که وارد کنید مغایرت محاسبه می‌شود.");
  };
  const fromDevice = async () => { setBusy(true); try { const r = await Printer.readCounter(dev.ip); submit(r.value, "snmp"); } catch (e) { flash("error", e.message); } setBusy(false); };
  return (
    <div data-testid="device-card" data-kind={dev.kind} style={{ background: "var(--bg-app)", borderRadius: 12, padding: 14, borderTop: `3px solid ${isP ? "#60a5fa" : "#a78bfa"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 14 }}>{isP ? "🖨" : "📠"} {dev.name}</b>
        <button data-testid="device-edit" onClick={onEdit} style={{ ...BTN("transparent", "var(--text-muted)"), padding: "2px 8px", fontSize: 12 }}>✏️</button>
      </div>
      <div style={{ ...sub, marginBottom: 8 }}>{isP ? (dev.color ? "رنگی" : "سیاه‌وسفید") : "اسکنر"}{dev.nativeName ? " · متصل به ویندوز" : ""}{dev.ip ? ` · ${dev.ip}` : ""}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
        <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: "6px 10px" }}><div style={sub}>امروز</div><b data-testid="dev-today">{toFA(ov.today.done)}</b> صفحه</div>
        <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: "6px 10px" }}><div style={sub}>این ماه</div><b data-testid="dev-month">{toFA(ov.month.done)}</b> صفحه</div>
      </div>
      {ov.last && <div style={{ ...sub, marginTop: 8 }}>آخرین کار: {fmtDT(ov.last.ts)} — {toFA(ov.last.done)}/{toFA(ov.last.requested)} <Badge status={ov.last.status} voided={ov.last.voided} /></div>}
      {isP && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10, fontSize: 12, lineHeight: 1.9 }}>
          <div>کنتور فعلی (تخمینی): <b data-testid="dev-meter-est">{est == null ? "—" : toFA(est)}</b>{last && <span style={sub}> · آخرین قرائت {toFA(last.value)}</span>}</div>
          {rec && (
            <div data-testid="dev-recon" data-status={rec.status} style={{ marginTop: 6, background: rec.status === "ok" ? "#14532d44" : "#78350f55", borderRadius: 8, padding: "8px 10px" }}>
              <div>🖨 کنتور واقعی دستگاه: <b>{toFA(rec.actual)}</b> صفحه</div>
              <div>📋 ثبت‌شده در برنامه: <b>{toFA(rec.recorded)}</b> صفحه</div>
              <div style={{ color: rec.status === "ok" ? "#4ade80" : "#fbbf24", fontWeight: 700 }}>{rec.status === "ok" ? "✓ بدون مغایرت" : `⚠️ اختلاف: ${toFA(Math.abs(rec.diff))} صفحه — ${rec.diff > 0 ? "این‌قدر چاپ ثبت نشده است" : "بیش از کنتور ثبت شده است"}`}</div>
            </div>
          )}
          {!open ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button data-testid="meter-open" onClick={() => setOpen(true)} style={{ ...BTN("var(--border)", "var(--text-primary)"), padding: "5px 12px", fontSize: 12 }}>📟 ثبت قرائت کنتور</button>
              {caps.snmp && dev.ip && <button data-testid="meter-snmp" disabled={busy} onClick={fromDevice} style={{ ...BTN("#2563eb"), padding: "5px 12px", fontSize: 12, opacity: busy ? 0.5 : 1 }}>{busy ? "…" : "📡 خواندن از دستگاه"}</button>}
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input data-testid="meter-input" type="number" min="0" value={val} onChange={(e) => setVal(e.target.value)} placeholder="عدد روی کنتور دستگاه" style={{ ...INP, marginTop: 0, fontSize: 12 }} />
                <button data-testid="meter-save" onClick={() => submit(val, "manual")} style={{ ...BTN("#16a34a"), padding: "5px 12px", fontSize: 12 }}>ثبت</button>
                <button onClick={() => { setOpen(false); setReset(false); }} style={{ ...BTN("var(--border)", "var(--text-primary)"), padding: "5px 10px", fontSize: 12 }}>✕</button>
              </div>
              {reset && <label style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "#fbbf24" }}><input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} /> کنتور دستگاه صفر یا تعویض شده؛ شروع دوباره</label>}
              <div style={{ ...sub, marginTop: 4 }}>اول و آخر هر ماه کنتور را وارد کنید تا برنامه چاپ‌های ثبت‌نشده را نشان دهد.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceForm({ dev, caps, onClose, flash }) {
  const [f, setF] = useState({ kind: "printer", name: "", nativeName: "", ip: "", color: false, priceBW: "", priceColor: "", priceScan: "", ...dev });
  const [nativeList, setNativeList] = useState([]);
  useEffect(() => { let on = true; (async () => { try { if (f.kind === "printer" && caps.printer) { const l = await Printer.getPrinters(); on && setNativeList(l.map((x) => ({ value: x.name, label: x.displayName, ip: x.ip }))); } else if (f.kind === "scanner" && caps.scanner) { const l = await Scanner.getScanners(); on && setNativeList(l.map((x) => ({ value: x.id, label: x.displayName }))); } else on && setNativeList([]); } catch { on && setNativeList([]); } })(); return () => { on = false; }; }, [f.kind, caps.printer, caps.scanner]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = () => { const r = saveDevice({ ...f, id: dev.id }); if (!r.ok) { flash("error", r.error); return; } flash("success", "✓ دستگاه ذخیره شد"); onClose(); };
  const del = async () => {
    const why = await askReason({ title: "حذف دستگاه", desc: "اگر دستگاه سابقهٔ چاپ داشته باشد فقط بایگانی می‌شود.", icon: "🗑️", danger: true, confirmLabel: "حذف", presets: ["دستگاه فروخته شد", "از رده خارج شد", "اشتباه تعریف شد"] });
    if (!why) return; const r = removeDevice(dev.id); flash("success", r.archived ? "دستگاه بایگانی شد (سابقهٔ آن حفظ می‌شود)" : "دستگاه حذف شد"); onClose();
  };
  const lbl = { fontSize: 12, color: "var(--text-secondary)" };
  return (
    <div data-testid="device-form" style={{ ...card, border: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{dev.id ? "ویرایش دستگاه" : "دستگاه جدید"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        {!dev.id && <label style={lbl}>نوع<select data-testid="dev-kind" value={f.kind} onChange={(e) => set("kind", e.target.value)} style={INP}><option value="printer">🖨 پرینتر / کپی</option><option value="scanner">📠 اسکنر</option></select></label>}
        <label style={lbl}>نام نمایشی<input data-testid="dev-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="مثلاً HP LaserJet" style={INP} /></label>
        {caps.native && nativeList.length > 0 && <label style={lbl}>دستگاه در ویندوز<select data-testid="dev-native" value={f.nativeName} onChange={(e) => { const it = nativeList.find((x) => x.value === e.target.value); setF((x) => ({ ...x, nativeName: e.target.value, name: x.name || (it ? it.label : ""), ip: x.ip || (it && it.ip) || "" })); }} style={INP}><option value="">— انتخاب —</option>{nativeList.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>}
        {f.kind === "printer" && <label style={lbl}>آدرس IP (برای خواندن کنتور، اختیاری)<input data-testid="dev-ip" dir="ltr" value={f.ip} onChange={(e) => set("ip", e.target.value)} placeholder="192.168.1.50" style={{ ...INP, textAlign: "left" }} /></label>}
        {f.kind === "printer" ? <>
          <label style={lbl}>قیمت هر صفحه سیاه‌وسفید (ریال)<input type="number" value={f.priceBW} onChange={(e) => set("priceBW", e.target.value)} style={INP} /></label>
          <label style={lbl}>قیمت هر صفحه رنگی (ریال)<input type="number" value={f.priceColor} onChange={(e) => set("priceColor", e.target.value)} style={INP} /></label>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={!!f.color} onChange={(e) => set("color", e.target.checked)} /> پرینتر رنگی است</label>
        </> : <label style={lbl}>قیمت هر صفحه اسکن (ریال)<input type="number" value={f.priceScan} onChange={(e) => set("priceScan", e.target.value)} style={INP} /></label>}
      </div>
      <div style={{ ...sub, marginTop: 8 }}>اگر قیمت خالی بماند، قیمت از «تعرفه» پیشنهاد می‌شود.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button data-testid="dev-save" onClick={save} style={{ ...BTN("#2563eb"), flex: 1 }}>ذخیره</button>
        {dev.id && <button onClick={del} style={{ ...BTN("#450a0a", "#f87171") }}>🗑️ حذف</button>}
        <button onClick={onClose} style={{ ...BTN("var(--border)", "var(--text-primary)") }}>لغو</button>
      </div>
    </div>
  );
}

// ───────── ثبت جاب ─────────
function JobForm({ devices, caps, flash, suggestPrice }) {
  const [customers] = useCustomers();
  const [kind, setKind] = useState("print");
  const [deviceId, setDeviceId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [color, setColor] = useState(false);
  const [size, setSize] = useState("A4");
  const [pages, setPages] = useState("1");        // صفحه‌های فایل (یا تعداد دستی)
  const [copies, setCopies] = useState("1");
  const [doneIn, setDoneIn] = useState("");       // فقط ثبت دستی: تعداد واقعاً چاپ‌شده (خالی = همه)
  const [price, setPrice] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState("");
  const [busy, setBusy] = useState(null);         // null | "print" | "scan"
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [src, setSrc] = useState("flatbed"), [dpi, setDpi] = useState("200"), [scanColor, setScanColor] = useState("color");
  const fileRef = useRef(null);
  const isScan = kind === "scan";
  const list = devices.filter((d) => d.kind === (isScan ? "scanner" : "printer"));
  const dev = list.find((d) => d.id === deviceId) || list[0] || null;
  useEffect(() => { if (dev && dev.id !== deviceId) setDeviceId(dev.id); }, [dev, deviceId]);
  const auto = useMemo(() => { const dp = devicePrice(dev, kind, color); if (dp > 0) return dp; const sp = suggestPrice ? suggestPrice(kind, color, size) : null; return sp > 0 ? sp : 0; }, [dev, kind, color, size, suggestPrice]);
  useEffect(() => { setPrice(auto ? String(auto) : ""); }, [auto]);
  const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const requested = isScan ? n(pages) : n(pages) * Math.max(1, n(copies));
  const native = caps.native && (isScan ? caps.scanner : caps.printer) && dev && dev.nativeName;
  const doneManual = doneIn === "" ? requested : Math.min(requested, n(doneIn));
  const custOptions = [{ value: "", label: "👤 بدون مشتری (نقدی)", group: null }, ...customers.map((c) => ({ value: String(c.id), label: `${c.firstName} ${c.lastName}`.trim() + (c.phone ? ` · ${c.phone}` : ""), group: null }))];

  const pickFile = async (f) => {
    if (!f) return; setFile(f); setResult(null);
    const ext = String(f.name).split(".").pop().toLowerCase();
    if (ext === "pdf") {
      setFileInfo("در حال شمارش صفحات…");
      const r = await countPdfPagesAsync(new Uint8Array(await f.arrayBuffer()));
      if (r.pages) { setPages(String(r.pages)); setFileInfo(`📄 ${f.name} — ${toFA(r.pages)} صفحه`); } else setFileInfo(`📄 ${f.name} — تعداد صفحات خوانده نشد؛ دستی وارد کنید`);
    } else if (["png", "jpg", "jpeg", "bmp"].includes(ext)) { setPages("1"); setFileInfo(`🖼️ ${f.name} — ۱ صفحه`); }
    else setFileInfo(`📎 ${f.name} — برای چاپ مستقیم فقط PDF و تصویر پشتیبانی می‌شود؛ تعداد صفحات را دستی وارد کنید`);
  };
  const reset = () => { setFile(null); setFileInfo(""); setPages("1"); setCopies("1"); setDoneIn(""); if (fileRef.current) fileRef.current.value = ""; };
  const common = () => ({ kind, deviceId: dev && dev.id, customerId: customerId || null, color, size, unitPrice: Number(price) || 0, payMethod: !customerId && (payMethod === "credit" || payMethod === "wallet") ? "cash" : payMethod, fileName: file ? file.name : "" });
  const finish = (r, extra = "") => {
    if (!r.ok) { flash("error", r.error); return; }
    setResult(r); flash(r.warning ? "error" : "success", `✓ ${JOB_KINDS[r.job.kind]} ثبت شد — ${toFA(r.job.done)} از ${toFA(r.job.requested)} صفحه${r.sale ? ` — فاکتور #${toFA(r.sale.number)}` : ""}${extra}${r.warning ? ` — ⚠️ ${r.warning}` : ""}`); reset();
  };

  const runPrint = async () => {
    if (!native) return;
    if (!file) { flash("error", "ابتدا فایل PDF یا تصویر را انتخاب کنید"); return; }
    if (!(n(pages) > 0)) { flash("error", "تعداد صفحات فایل مشخص نیست"); return; }
    setBusy("print"); setProgress({ printed: 0, total: requested }); setResult(null);
    try {
      const r = await Printer.printFile({ printer: dev.nativeName, file, pages: n(pages), copies: Math.max(1, n(copies)), color });
      finish(recordJob({ ...common(), requested: r.requested, done: r.done, source: "native", assumed: !!r.assumed, note: r.error ? `خطای چاپ: ${r.error}` : r.assumed ? "تعداد از spooler تأیید نشد (فرض‌شده)" : "" }), r.assumed ? " (تعداد از spooler تأیید نشد؛ با کنتور تطبیق دهید)" : "");
    } catch (e) { flash("error", e.message); }
    setBusy(null); setProgress(null);
  };
  const runScan = async () => {
    if (!native) return;
    setBusy("scan"); setResult(null);
    try {
      const r = await Scanner.scan({ scannerId: dev.nativeName, dpi: Number(dpi), color: scanColor, source: src, maxPages: 100 });
      const res = recordJob({ ...common(), color: false, requested: r.count, done: r.count, source: "native", note: `ذخیره در: ${r.dir}` });
      finish(res); if (res.ok) setResult({ ...res, files: r.files, dir: r.dir });
    } catch (e) { flash("error", e.message); }
    setBusy(null);
  };
  const runManual = () => {
    if (!dev) { flash("error", "ابتدا یک دستگاه تعریف کنید"); return; }
    if (!(requested > 0)) { flash("error", "تعداد صفحات را وارد کنید"); return; }
    finish(recordJob({ ...common(), requested, done: doneManual, source: "manual" }));
  };
  const total = doneManual * (Number(price) || 0);
  const lbl = { fontSize: 12, color: "var(--text-secondary)" };
  return (
    <div style={card} data-testid="job-form">
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)", marginBottom: 12 }}>🧾 ثبت چاپ / کپی / اسکن</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {Object.entries(JOB_KINDS).map(([k, l]) => <button key={k} data-testid={`job-kind-${k}`} onClick={() => { setKind(k); setDeviceId(""); setResult(null); }} style={BTN(kind === k ? "#2563eb" : "var(--bg-app)", kind === k ? "#fff" : "var(--text-secondary)")}>{l}</button>)}
      </div>
      {!list.length ? <div style={{ ...sub, padding: 10, lineHeight: 2 }}>برای ثبت {isScan ? "اسکن" : "چاپ"} ابتدا در بخش «دستگاه‌ها» یک {isScan ? "اسکنر" : "پرینتر"} تعریف کنید.</div> : (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 10 }}>
          <label style={lbl}>{isScan ? "اسکنر" : "پرینتر"}<select data-testid="job-device" value={dev ? dev.id : ""} onChange={(e) => setDeviceId(e.target.value)} style={INP}>{list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label style={lbl}>مشتری (اختیاری)<SearchableSelect options={custOptions} value={customerId} placeholder="جستجوی مشتری یا نقدی..." onChange={setCustomerId} /></label>
        </div>
        {!isScan && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={() => setColor(false)} style={{ ...BTN(!color ? "#334155" : "var(--bg-app)", !color ? "#fff" : "var(--text-secondary)"), flex: 1 }}>⚫ سیاه‌وسفید</button>
            <button onClick={() => setColor(true)} style={{ ...BTN(color ? "#7c3aed" : "var(--bg-app)", color ? "#fff" : "var(--text-secondary)"), flex: 1 }}>🌈 رنگی</button>
            <select value={size} onChange={(e) => setSize(e.target.value)} style={{ ...INP, marginTop: 0, width: 90 }}><option>A4</option><option>A5</option><option>A3</option></select>
          </div>
        )}
        {!isScan && (
          <div data-testid="job-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files && e.dataTransfer.files[0]); }} onClick={() => fileRef.current && fileRef.current.click()}
            style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: "14px 12px", textAlign: "center", cursor: "pointer", marginBottom: 10, fontSize: 12.5, color: "var(--text-secondary)" }}>
            {fileInfo || "📥 فایل PDF یا تصویر را اینجا رها کنید یا کلیک کنید (تعداد صفحات خودکار شمرده می‌شود)"}
            <input ref={fileRef} data-testid="job-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.bmp" style={{ display: "none" }} onChange={(e) => pickFile(e.target.files && e.target.files[0])} />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 10 }}>
          <label style={lbl}>{isScan ? "تعداد صفحه" : "صفحه‌های فایل"}<input data-testid="job-pages" type="number" min="1" value={pages} onChange={(e) => setPages(e.target.value)} style={INP} /></label>
          {!isScan && <label style={lbl}>تعداد نسخه<input data-testid="job-copies" type="number" min="1" value={copies} onChange={(e) => setCopies(e.target.value)} style={INP} /></label>}
          <label style={lbl}>قیمت هر صفحه (ریال)<input data-testid="job-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={INP} /></label>
          {!native && <label style={lbl}>واقعاً چاپ‌شده (اگر ناقص بود)<input data-testid="job-done" type="number" min="0" value={doneIn} onChange={(e) => setDoneIn(e.target.value)} placeholder={String(requested)} style={INP} /></label>}
        </div>
        {isScan && native && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <select data-testid="scan-source" value={src} onChange={(e) => setSrc(e.target.value)} style={{ ...INP, marginTop: 0, flex: 1 }}><option value="flatbed">شیشهٔ اسکنر (یک صفحه)</option><option value="feeder">فیدر (چندصفحه‌ای)</option></select>
            <select value={dpi} onChange={(e) => setDpi(e.target.value)} style={{ ...INP, marginTop: 0, flex: 1 }}>{["100", "150", "200", "300", "600"].map((x) => <option key={x} value={x}>{x} DPI</option>)}</select>
            <select value={scanColor} onChange={(e) => setScanColor(e.target.value)} style={{ ...INP, marginTop: 0, flex: 1 }}><option value="color">رنگی</option><option value="gray">خاکستری</option><option value="bw">سیاه‌وسفید</option></select>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {PAY_METHODS.filter((m) => ["cash", "pos", "transfer"].includes(m.key) || (customerId && ["wallet", "credit"].includes(m.key))).map((m) => <button key={m.key} onClick={() => setPayMethod(m.key)} style={{ ...BTN(payMethod === m.key ? "#2563eb" : "var(--bg-app)", payMethod === m.key ? "#fff" : "var(--text-secondary)"), padding: "6px 12px", fontSize: 12 }}>{m.icon} {m.label}</button>)}
        </div>
        <div style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <span>درخواستی: <b data-testid="job-requested">{toFA(requested)}</b> صفحه</span>
          <span>مبلغ (فقط صفحات انجام‌شده): <b data-testid="job-total">{fmtM(total)}</b></span>
        </div>
        {busy === "print" && <div data-testid="job-progress" style={{ ...sub, marginBottom: 10 }}>⏳ در حال چاپ… {progress ? `${toFA(progress.total)} صفحه` : ""} — پس از پایان، تعداد واقعاً چاپ‌شده از صف چاپ ویندوز خوانده و ثبت می‌شود.</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {native && !isScan && <button data-testid="job-print" disabled={!!busy} onClick={runPrint} style={{ ...BTN("#16a34a"), flex: 2, padding: 12, minWidth: 190, opacity: busy ? 0.5 : 1 }}>🖨️ چاپ و ثبت خودکار</button>}
          {native && isScan && <button data-testid="job-scan" disabled={!!busy} onClick={runScan} style={{ ...BTN("#16a34a"), flex: 2, padding: 12, minWidth: 190, opacity: busy ? 0.5 : 1 }}>{busy === "scan" ? "⏳ در حال اسکن…" : "📠 شروع اسکن و ثبت"}</button>}
          <button data-testid="job-manual" disabled={!!busy} onClick={runManual} style={{ ...BTN(native ? "var(--border)" : "#16a34a", native ? "var(--text-primary)" : "#fff"), flex: 1, padding: 12, minWidth: 170 }}>✅ ثبت دستی {isScan ? "(اسکن شد)" : "(چاپ شد)"}</button>
        </div>
      </>)}
      {result && result.job && <JobResult r={result} />}
    </div>
  );
}

function JobResult({ r }) {
  const j = r.job;
  return (
    <div data-testid="job-result" data-status={j.status} style={{ marginTop: 14, background: "var(--bg-app)", borderRadius: 12, padding: 14, fontSize: 12.5, lineHeight: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}><b>{JOB_KINDS[j.kind]} — {j.deviceName || "بدون دستگاه"}</b><Badge status={j.status} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, textAlign: "center", margin: "8px 0" }}>
        <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 6 }}><div style={sub}>درخواستی</div><b>{toFA(j.requested)}</b></div>
        <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 6 }}><div style={sub}>انجام‌شده</div><b style={{ color: "#4ade80" }}>{toFA(j.done)}</b></div>
        <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 6 }}><div style={sub}>خطا</div><b style={{ color: j.failed ? "#f87171" : "inherit" }}>{toFA(j.failed)}</b></div>
      </div>
      {j.invoiceNumber ? <div>🧾 فاکتور #{toFA(j.invoiceNumber)} — {fmtM(j.amount)}{j.customerName ? ` — ${j.customerName}` : ""}</div> : j.done > 0 ? <div style={{ color: "#fbbf24" }}>⚠️ صورتحساب نشد{j.billError ? `: ${j.billError}` : ""} — از فهرست کارها «صدور صورتحساب» را بزنید.</div> : <div style={{ color: "#f87171" }}>هیچ صفحه‌ای انجام نشد؛ صورتحسابی ثبت نشد.</div>}
      {j.assumed && <div style={{ color: "#fbbf24" }}>⚠️ تعداد از صف چاپ ویندوز تأیید نشد (فرض شده)؛ با کنتور دستگاه تطبیق دهید.</div>}
      {r.files && r.files.length > 0 && <div style={sub}>📁 فایل‌ها: {r.dir} <button onClick={() => Scanner.showFile(r.files[0]).catch(() => {})} style={{ ...BTN("var(--border)", "var(--text-primary)"), padding: "2px 10px", fontSize: 11, marginInlineStart: 6 }}>نمایش در پوشه</button></div>}
    </div>
  );
}

// ───────── گزارش ─────────
function ReportSection({ devices, jobs, flash }) {
  const [mode, setMode] = useState("daily"), [devF, setDevF] = useState(""), [limit, setLimit] = useState(15);
  const day = useMemo(() => new Date(), []);
  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const today = summarize(jobs, { from: iso, to: iso }), rows = periodReport(jobs, mode, { deviceId: devF || null });
  const shown = jobs.filter((j) => !devF || j.deviceId === devF).sort((a, b) => b.ts - a.ts);
  const act = async (j, kind) => {
    if (kind === "bill") { const r = billJob(j.id, {}); flash(r.ok ? "success" : "error", r.ok ? `✓ صورتحساب صادر شد (#${toFA(r.sale.number)})` : r.error); return; }
    const why = await askReason({ online: true, title: "ابطال کار چاپ/اسکن", desc: "فاکتور مربوط باطل می‌شود. صفحات چاپ‌شده همچنان در کنتور دستگاه شمرده می‌مانند.", icon: "🚫", danger: true, confirmLabel: "ابطال", presets: ["چاپ اشتباه", "مشتری انصراف داد", "ثبت تکراری", "کیفیت چاپ نامناسب"] });
    if (!why) return; const r = voidJob(j.id, why); flash(r.ok ? "success" : "error", r.ok ? "✓ باطل شد" : r.error);
  };
  return (
    <div style={card} data-testid="pc-report">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)" }}>📊 گزارش چاپ و اسکن</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select value={devF} onChange={(e) => setDevF(e.target.value)} style={{ ...INP, marginTop: 0, fontSize: 12, width: "auto" }}><option value="">همهٔ دستگاه‌ها</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          {[["daily", "روزانه"], ["monthly", "ماهانه"]].map(([k, l]) => <button key={k} onClick={() => setMode(k)} style={{ ...BTN(mode === k ? "#2563eb" : "var(--bg-app)", mode === k ? "#fff" : "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>{l}</button>)}
          <button data-testid="pc-csv" onClick={() => download("cafino-print-jobs.csv", jobsToCsv(shown), "text/csv;charset=utf-8")} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>⬇ CSV</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 14 }}>
        {[["چاپ امروز", today.print, "#60a5fa"], ["کپی امروز", today.copy, "#34d399"], ["اسکن امروز", today.scan, "#a78bfa"], ["خطا/ناقص امروز", today.failed, today.failed ? "#f87171" : "var(--text-primary)"], ["درآمد امروز", null, "#4ade80"]].map(([l, v, c]) => (
          <div key={l} style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px" }}><div style={sub}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v == null ? fmtM(today.amount) : toFA(v)}</div></div>
        ))}
      </div>
      {rows.length === 0 ? <div style={{ ...sub, textAlign: "center", padding: 16 }}>هنوز کاری ثبت نشده است.</div> : (
        <div style={{ overflowX: "auto", marginBottom: 14 }}>
          <table data-testid="pc-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ color: "var(--text-muted)", textAlign: "right" }}>{["تاریخ", "دستگاه", "کار", "چاپ", "کپی", "اسکن", "خطا", "درآمد"].map((h) => <th key={h} style={{ padding: "6px 8px", fontWeight: 500, borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>{rows.slice(0, limit).map((r) => <tr key={r.key + r.deviceId}><td style={{ padding: "6px 8px" }}>{mode === "monthly" ? r.key : jalaliLabel(r.date)}</td><td style={{ padding: "6px 8px" }}>{r.deviceName}</td><td style={{ padding: "6px 8px" }}>{toFA(r.jobs)}</td><td style={{ padding: "6px 8px" }}>{toFA(r.print)}</td><td style={{ padding: "6px 8px" }}>{toFA(r.copy)}</td><td style={{ padding: "6px 8px" }}>{toFA(r.scan)}</td><td style={{ padding: "6px 8px", color: r.failed ? "#f87171" : undefined }}>{toFA(r.failed)}</td><td style={{ padding: "6px 8px" }}>{fmtM(r.amount)}</td></tr>)}</tbody>
          </table>
          {rows.length > limit && <button onClick={() => setLimit((l) => l + 30)} style={{ ...BTN("var(--bg-app)", "var(--text-secondary)"), padding: 8, fontSize: 12, width: "100%", marginTop: 8 }}>نمایش بیشتر</button>}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>آخرین کارها</div>
      {shown.length === 0 ? <div style={sub}>—</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.slice(0, 20).map((j) => (
            <div key={j.id} data-testid="job-row" data-status={j.status} style={{ background: "var(--bg-app)", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center", opacity: j.voided ? 0.6 : 1 }}>
              <div style={{ flex: "1 1 220px" }}>
                <b>{JOB_KINDS[j.kind]}</b> · {j.deviceName || "—"}{j.customerName ? ` · ${j.customerName}` : ""} <Badge status={j.status} voided={j.voided} />
                <div style={sub}>{fmtDT(j.ts)} — درخواستی {toFA(j.requested)} · انجام‌شده {toFA(j.done)}{j.failed ? ` · خطا ${toFA(j.failed)}` : ""}{j.invoiceNumber ? ` · فاکتور #${toFA(j.invoiceNumber)}` : ""}{j.assumed ? " · فرض‌شده" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <b>{fmtM(j.amount)}</b>
                {j.unbilled && !j.saleId && !j.voided && <button data-testid="job-bill" onClick={() => act(j, "bill")} style={{ ...BTN("#2563eb"), padding: "3px 10px", fontSize: 11 }}>صدور صورتحساب</button>}
                {!j.voided && <button data-testid="job-void" onClick={() => act(j, "void")} style={{ ...BTN("#450a0a", "#f87171"), padding: "3px 10px", fontSize: 11 }}>ابطال</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
