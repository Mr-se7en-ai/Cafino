// «دریافت فایل از مشتری»: QR اختصاصی هر کافی‌نت + فهرست فایل‌های رسیده (دانلود، وضعیت، حذف) + تنظیمات.
// داده روی سرور نگه‌داری می‌شود (QR باید به یک نشانی اینترنتی اشاره کند)؛ بدون سرور فقط راهنما نشان داده می‌شود.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../components/Icon.jsx";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { escapeHtml } from "../app/core/format.js";
import { printFontCss, printWhenReady } from "../app/core/printFont.js";
import { WORDMARK_SVG } from "../app/components/brandAssets.js";
import { isApiConnected, getApiConfig } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { qrSvg } from "./qr.js";
import { uploads, publicUploadUrl, buildPosterHtml } from "./uploadsApi.js";
import { useUploadsSummary } from "./uploadsBadge.js";
import SessionsPanel from "./SessionsPanel.jsx";
import FileManager from "./FileManager.jsx";
import SettingsPanel from "./SettingsPanel.jsx";
import MiniappPanel from "./MiniappPanel.jsx";
import StaffLinkPanel from "./StaffLinkPanel.jsx";
import RequestsPanel from "./RequestsPanel.jsx";
import { useShopProfileSync } from "./shopSync.js";
import { useShopInfo } from "../app/domain/invoiceData.js";
import { card, sub, msgOf, Note, Pill } from "./ui.jsx";


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

export default function UploadsPage() {
  const connected = isApiConnected(), guest = isGuestMode();
  const [settings, setSettings] = useState(null), [err, setErr] = useState(""), [sessionFilter, setSessionFilter] = useState(""), [tick, setTick] = useState(0);
  const sum = useUploadsSummary();
  const [shop] = useShopInfo();
  const mergeSettings = useCallback((s) => setSettings((p) => ({ ...p, ...s })), []);
  useShopProfileSync(settings, shop, mergeSettings);
  const loadSettings = useCallback(async () => { try { const s = await uploads.settings(); setSettings(s); setErr(""); } catch (e) { setErr(msgOf(e)); } }, []);
  useEffect(() => { if (!connected || guest) return undefined; loadSettings(); const t = setInterval(() => { if (document.visibilityState === "visible") loadSettings(); }, 20000); return () => clearInterval(t); }, [loadSettings, connected, guest]);
  const rotate = async () => {
    if (!window.confirm("با تعویض کد، QR و نشانی قبلی (و پوسترهای چاپ‌شده) از کار می‌افتد و باید دوباره چاپ کنید. ادامه می‌دهید؟")) return;
    try { const s = await uploads.rotateCode(); setSettings((p) => ({ ...p, ...s })); } catch (e) { setErr(msgOf(e)); }
  };
  return (
    <div data-testid="uploads-page" style={{ maxWidth: 940, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon name="QrCode" size={20} style={{ color: "var(--accent-light)" }} />
          <b style={{ fontSize: 17 }}>دریافت فایل از مشتری</b>
          {sum.newCount > 0 && <Pill color="#f59e0b" data-testid="up-new-pill">{toFA(sum.newCount)} فایل جدید</Pill>}
        </div>
        <div style={sub}>QR دائمی کافی‌نت را کنار صندوق بزنید یا برای هر سفارش یک QR موقت بسازید. مشتری فایل را از گوشی می‌فرستد و بدون ورود یا نصب برنامه به این صفحه می‌رسد.</div>
      </div>
      {(!connected || guest)
        ? <div style={card} data-testid="up-offline"><Note>{guest ? "در حالت مهمان این بخش در دسترس نیست." : "این بخش به اتصال سرور نیاز دارد، چون QR باید به یک نشانی اینترنتی اشاره کند و فایل‌ها روی سرور نگه‌داری می‌شوند. سرور را مطابق راهنمای استقرار راه‌اندازی کنید."}</Note></div>
        : <>
          {err && <Note kind="error" data-testid="up-error-top">{err}</Note>}
          {settings && <QrCard settings={settings} shopName={shop?.name} onRotate={rotate} canManage={settings.canManage} />}
          {settings && <SessionsPanel shopName={shop?.name} activeFilter={sessionFilter} onFilter={setSessionFilter} onChanged={() => setTick((t) => t + 1)} />}
          {settings && <FileManager settings={settings} sessionFilter={sessionFilter} onSessionFilter={setSessionFilter} refreshKey={tick} />}
          {settings?.canManage && <MiniappPanel />}
          {settings && <RequestsPanel />}
          {settings && <StaffLinkPanel />}
          {settings?.canManage && <SettingsPanel key={settings.updatedAt} settings={settings} blocked7d={sum.blocked7d} onSaved={(s) => setSettings((p) => ({ ...p, ...s }))} />}
        </>}
    </div>
  );
}
