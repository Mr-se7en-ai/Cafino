// «دریافت فایل از مشتری»: QR اختصاصی هر کافی‌نت + فهرست فایل‌های رسیده (دانلود، وضعیت، حذف) + تنظیمات.
// داده روی سرور نگه‌داری می‌شود (QR باید به یک نشانی اینترنتی اشاره کند)؛ بدون سرور فقط راهنما نشان داده می‌شود.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Icon from "../components/Icon.jsx";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { escapeHtml } from "../app/core/format.js";
import { formatLogTimestamp } from "../app/core/activity.js";
import { useShopInfo } from "../app/domain/invoiceData.js";
import { printFontCss, printWhenReady } from "../app/core/printFont.js";
import { WORDMARK_SVG } from "../app/components/brandAssets.js";
import { isApiConnected, getApiConfig } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { qrSvg } from "./qr.js";
import { uploads, STATUS_LABEL, STATUS_COLOR, STATUSES, publicUploadUrl, fmtSize, groupBatches, downloadUpload, buildPosterHtml } from "./uploadsApi.js";

const card = { background: "var(--bg-card)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const sub = { fontSize: 12, color: "var(--text-muted)" };
const msgOf = (e) => (e && (e.message || e.error)) || "خطای نامشخص";
const Note = ({ kind = "info", children, ...r }) => { const c = kind === "error" ? "#f87171" : kind === "ok" ? "#34d399" : "#60a5fa"; return <div role={kind === "error" ? "alert" : "status"} {...r} style={{ background: `${c}18`, border: `1px solid ${c}55`, color: c, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, lineHeight: 1.7 }}>{children}</div>; };
const Pill = ({ color, children }) => <span style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: 20, padding: "1px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;

export function QrCard({ settings, shopName, onRotate, canManage }) {
  const url = publicUploadUrl(settings);
  const svg = useMemo(() => (url ? qrSvg(url, { ecc: "Q" }) : ""), [url]);
  const [copied, setCopied] = useState(false);
  const [shop] = useShopInfo();
  const name = shopName || shop?.name || "کافی‌نت";
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt("نشانی را کپی کنید:", url); } };
  const poster = () => {
    const w = window.open("", "_blank");
    if (!w) { alert("مرورگر بازکردن پنجرهٔ جدید را مسدود کرد. پاپ‌آپ را برای این سایت مجاز کنید."); return; }
    w.document.write(buildPosterHtml({ shopName: name, url, qrSvgText: svg, wordmarkSvg: WORDMARK_SVG.replace("<svg ", '<svg style="height:100%;width:auto" '), esc: escapeHtml, fontCss: printFontCss(), notice: settings?.notice || "" }));
    w.document.close(); printWhenReady(w);
  };
  const downloadSvg = () => { const b = new Blob([svg], { type: "image/svg+xml" }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = "cafino-upload-qr.svg"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 10000); };
  return (
    <div style={{ ...card, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 18 }} data-testid="up-qr-card">
      <div data-testid="up-qr" style={{ width: 188, height: 188, flex: "none", borderRadius: 12, overflow: "hidden", border: "3px solid #e8590c", background: "#fff" }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg width="100%" height="100%" ') }} />
      <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <b style={{ fontSize: 15 }}>QR اختصاصی {name}</b>
        <div style={sub}>مشتری با اسکن این QR صفحهٔ ارسال فایل را باز می‌کند، فایل یا عکس را می‌فرستد و یک «کد پیگیری» می‌گیرد؛ فایل‌ها همین‌جا برای شما می‌رسد. نیازی به نصب برنامه یا ورود مشتری نیست.</div>
        <div dir="ltr" data-testid="up-url" style={{ fontSize: 12, background: "var(--bg-app)", borderRadius: 8, padding: "6px 10px", wordBreak: "break-all", textAlign: "left", color: "var(--text-secondary)" }}>{url}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button data-testid="up-poster" onClick={poster} style={BTN("var(--accent,#e8590c)", "#fff", { background: "linear-gradient(135deg,#ff9a3c,#e8590c)" })}>🖨️ چاپ پوستر QR</button>
          <button onClick={copy} style={BTN("var(--border)", "var(--text-secondary)")}>{copied ? "کپی شد ✓" : "کپی نشانی"}</button>
          <button onClick={downloadSvg} style={BTN("var(--border)", "var(--text-secondary)")}>ذخیرهٔ QR (SVG)</button>
          {canManage && <button data-testid="up-rotate" onClick={onRotate} style={BTN("transparent", "#f87171", { border: "1px solid #f8717188" })}>تعویض کد</button>}
        </div>
        {!settings.enabled && <Note kind="error">دریافت فایل فعلاً غیرفعال است؛ مشتری با اسکن QR پیام «بسته است» می‌بیند.</Note>}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, onSaved }) {
  const [f, setF] = useState(() => ({ enabled: settings.enabled, maxFileMb: settings.maxFileMb, maxFiles: settings.maxFiles, retentionDays: settings.retentionDays, requirePhone: settings.requirePhone, notice: settings.notice || "" }));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const num = (k, min, max) => (e) => setF((s) => ({ ...s, [k]: Math.min(max, Math.max(min, Number(String(e.target.value).replace(/[^\d]/g, "")) || min)) }));
  const save = async () => { setBusy(true); setMsg(null); try { const s = await uploads.saveSettings(f); onSaved(s); setMsg({ k: "ok", t: "ذخیره شد" }); } catch (e) { setMsg({ k: "error", t: msgOf(e) }); } finally { setBusy(false); } };
  const used = settings.quotaBytes ? Math.min(100, Math.round((settings.usedBytes / settings.quotaBytes) * 100)) : 0;
  return (
    <div style={card} data-testid="up-settings">
      <b style={{ fontSize: 14 }}>تنظیمات دریافت فایل</b>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />دریافت فایل از مشتری فعال باشد</label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={f.requirePhone} onChange={(e) => setF({ ...f, requirePhone: e.target.checked })} />شمارهٔ موبایل مشتری اجباری باشد</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 130px", fontSize: 12, color: "var(--text-muted)" }}>حداکثر حجم هر فایل (مگابایت)<input inputMode="numeric" value={f.maxFileMb} onChange={num("maxFileMb", 1, 100)} style={INP} /></label>
        <label style={{ flex: "1 1 130px", fontSize: 12, color: "var(--text-muted)" }}>حداکثر تعداد فایل در هر ارسال<input inputMode="numeric" value={f.maxFiles} onChange={num("maxFiles", 1, 30)} style={INP} /></label>
        <label style={{ flex: "1 1 130px", fontSize: 12, color: "var(--text-muted)" }}>نگه‌داری فایل‌ها (روز)<input inputMode="numeric" value={f.retentionDays} onChange={num("retentionDays", 1, 365)} style={INP} /></label>
      </div>
      <label style={{ fontSize: 12, color: "var(--text-muted)" }}>پیام نمایش‌داده‌شده به مشتری (اختیاری، حداکثر ۳۰۰ نویسه)<input maxLength={300} value={f.notice} onChange={(e) => setF({ ...f, notice: e.target.value })} style={INP} placeholder="مثلاً: چاپ رنگی هر برگ ۳٬۰۰۰ تومان" /></label>
      <div style={sub}>فضای مصرفی: {fmtSize(settings.usedBytes)} از {fmtSize(settings.quotaBytes)} ({toFA(used)}٪) — فایل‌ها پس از مدت نگه‌داری خودکار پاک می‌شوند. فرمت‌های مجاز: {settings.allowedExts.join("، ")}</div>
      {msg && <Note kind={msg.k}>{msg.t}</Note>}
      <div><button data-testid="up-save" disabled={busy} onClick={save} style={BTN("#2563eb", "#fff", { opacity: busy ? .6 : 1 })}>ذخیرهٔ تنظیمات</button></div>
    </div>
  );
}

function FileRow({ f, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn) => { setBusy(true); try { await fn(); } catch (e) { onError(msgOf(e)); } finally { setBusy(false); } };
  return (
    <div data-testid="up-file" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
      <Icon name="FileText" size={16} style={{ color: "var(--text-muted)", flex: "none" }} />
      <span dir="ltr" style={{ flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontSize: 13 }} title={f.name}>{f.name}</span>
      <span style={sub}>{fmtSize(f.size)}</span>
      <Pill color={STATUS_COLOR[f.status]}>{STATUS_LABEL[f.status]}</Pill>
      <select aria-label="وضعیت" disabled={busy} value={f.status} onChange={(e) => act(async () => { await uploads.setStatus(f.id, e.target.value); onChanged(); })} style={{ ...INP, width: "auto", marginTop: 0, padding: "5px 8px", fontSize: 12 }}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
      <button data-testid="up-dl" disabled={busy} onClick={() => act(async () => { await downloadUpload(f); onChanged(); })} style={BTN("#16a34a", "#fff", { padding: "5px 12px", fontSize: 12 })}>دانلود</button>
      <button data-testid="up-del" disabled={busy} aria-label={`حذف ${f.name}`} onClick={() => { if (window.confirm(`«${f.name}» برای همیشه از سرور حذف شود؟`)) act(async () => { await uploads.remove(f.id); onChanged(); }); }} style={BTN("transparent", "#f87171", { padding: "5px 8px", fontSize: 12, border: "1px solid #f8717166" })}><Icon name="Trash2" size={14} /></button>
    </div>
  );
}

export default function UploadsPage() {
  const connected = isApiConnected(), guest = isGuestMode();
  const [settings, setSettings] = useState(null);
  const [list, setList] = useState({ items: [], newCount: 0, total: 0 });
  const [filter, setFilter] = useState(""), [q, setQ] = useState("");
  const [err, setErr] = useState(""), [loading, setLoading] = useState(true);
  const timer = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [s, l] = await Promise.all([uploads.settings(), uploads.list({ status: filter, q: q.trim(), limit: 100 })]);
      setSettings(s); setList({ items: l?.data || [], newCount: l?.meta?.newCount || 0, total: l?.meta?.total || 0 }); setErr("");
    } catch (e) { setErr(msgOf(e)); } finally { setLoading(false); }
  }, [filter, q]);
  useEffect(() => { if (!connected || guest) return undefined; const t = setTimeout(() => load(), 250); return () => clearTimeout(t); }, [load, connected, guest]);
  useEffect(() => {   // فایل تازه رسیده را بدون رفرش ببینید: هر ۲۰ ثانیه (فقط وقتی تب دیده می‌شود)
    if (!connected || guest) return undefined;
    timer.current = setInterval(() => { if (document.visibilityState === "visible") load(true); }, 20000);
    return () => clearInterval(timer.current);
  }, [load, connected, guest]);
  const rotate = async () => {
    if (!window.confirm("با تعویض کد، QR و نشانی قبلی (و پوسترهای چاپ‌شده) از کار می‌افتد و باید دوباره چاپ کنید. ادامه می‌دهید؟")) return;
    try { setSettings(await uploads.rotateCode()); } catch (e) { setErr(msgOf(e)); }
  };
  const batches = useMemo(() => groupBatches(list.items), [list.items]);
  return (
    <div data-testid="uploads-page" style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon name="QrCode" size={20} style={{ color: "var(--accent-light)" }} />
          <b style={{ fontSize: 17 }}>دریافت فایل از مشتری</b>
          {list.newCount > 0 && <Pill color="#f59e0b">{toFA(list.newCount)} فایل جدید</Pill>}
        </div>
        <div style={sub}>هر کافی‌نت یک QR مخصوص خود دارد. مشتری فایل را از گوشی می‌فرستد و بدون ورود یا نصب برنامه به این صفحه می‌رسد.</div>
      </div>
      {(!connected || guest)
        ? <div style={card} data-testid="up-offline"><Note>{guest ? "در حالت مهمان این بخش در دسترس نیست." : "این بخش به اتصال سرور نیاز دارد، چون QR باید به یک نشانی اینترنتی اشاره کند و فایل‌ها روی سرور نگه‌داری می‌شوند. سرور را مطابق راهنمای استقرار راه‌اندازی کنید."}</Note></div>
        : <>
          {err && <Note kind="error" data-testid="up-error">{err}</Note>}
          {settings && <QrCard settings={settings} onRotate={rotate} canManage={settings.canManage} />}
          <div style={card}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <b style={{ fontSize: 14 }}>فایل‌های دریافتی</b>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["", "همه"], ...STATUSES.map((s) => [s, STATUS_LABEL[s]])].map(([k, l]) => <button key={k || "all"} data-testid={`up-f-${k || "all"}`} aria-pressed={filter === k} onClick={() => setFilter(k)} style={BTN(filter === k ? "#2563eb" : "var(--bg-app)", filter === k ? "#fff" : "var(--text-secondary)", { padding: "4px 12px", fontSize: 12 })}>{l}</button>)}
              </div>
              <input data-testid="up-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو: کد پیگیری، نام، موبایل، فایل" style={{ ...INP, marginTop: 0, flex: "1 1 200px", maxWidth: 320, padding: "6px 10px", fontSize: 12 }} />
              <button onClick={() => load()} style={BTN("var(--border)", "var(--text-secondary)", { padding: "5px 12px", fontSize: 12 })}>بازخوانی</button>
            </div>
            {loading && !list.items.length ? <div style={sub}>در حال بارگیری…</div>
              : !batches.length ? <div style={sub} data-testid="up-empty">{filter || q ? "موردی با این فیلتر پیدا نشد." : "هنوز فایلی نرسیده است. پوستر QR را چاپ و کنار صندوق بزنید."}</div>
              : batches.map((b) => (
                <div key={b.batchId} data-testid="up-batch" style={{ background: "var(--bg-app)", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
                    <b data-testid="up-code" dir="ltr" style={{ fontSize: 16, letterSpacing: 2, color: "var(--accent-light)" }}>#{toFA(b.batchCode)}</b>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{b.senderName || "ناشناس"}</span>
                    {b.senderPhone && <span dir="ltr" style={sub}>{toFA(b.senderPhone)}</span>}
                    <span style={{ ...sub, marginInlineStart: "auto" }}>{formatLogTimestamp(b.createdAt)}</span>
                  </div>
                  {b.note && <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 2 }}>📝 {b.note}</div>}
                  {b.files.map((f) => <FileRow key={f.id} f={f} onChanged={() => load(true)} onError={setErr} />)}
                </div>
              ))}
            {list.total > list.items.length && <div style={sub}>{toFA(list.items.length)} مورد از {toFA(list.total)} نمایش داده شد؛ برای دیدن بقیه جستجو یا فیلتر کنید.</div>}
          </div>
          {settings?.canManage && <SettingsPanel key={settings.updatedAt} settings={settings} onSaved={setSettings} />}
        </>}
    </div>
  );
}
