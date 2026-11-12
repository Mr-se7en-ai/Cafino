// تنظیمات دریافت فایل: محدودیت‌ها، نگه‌داری و حذف خودکار، وضعیت ضدویروس + فایل‌های ردشده، اعلان و صدا.
import React, { useState, useEffect } from "react";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { formatLogTimestamp } from "../app/core/activity.js";
import { uploads, fmtSize } from "./uploadsApi.js";
import { getSoundOn, setSoundOn, useUploadsSummary } from "./uploadsBadge.js";
import { card, sub, msgOf, Note, Pill } from "./ui.jsx";

const AV_TEXT = { off: "خاموش", optional: "اختیاری (اگر ClamAV در دسترس نبود، فایل بدون اسکن پذیرفته می‌شود)", required: "اجباری (اگر ClamAV در دسترس نبود، دریافت فایل متوقف می‌شود)" };

function AvBox({ av }) {
  const [blocked, setBlocked] = useState(null), sum = useUploadsSummary();
  useEffect(() => { let dead = false; uploads.blocked().then((r) => { if (!dead) setBlocked(r?.data || []); }, () => { if (!dead) setBlocked([]); }); return () => { dead = true; }; }, [sum.blocked7d]);
  if (!av) return null;
  const ok = av.mode !== "off" && av.available;
  return (
    <div data-testid="up-av" style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>ضدویروس</b>
        <Pill color={av.mode === "off" ? "#9ca3af" : ok ? "#34d399" : "#f87171"} data-testid="up-av-state">{av.mode === "off" ? "غیرفعال" : ok ? `فعال (${av.engine || "ClamAV"})` : "در دسترس نیست"}</Pill>
      </div>
      <div style={sub}>حالت: {AV_TEXT[av.mode] || av.mode}.{av.mode === "off" && " برای استقرار جدی، ClamAV را راه‌اندازی کنید (راهنما: server/README و docker compose --profile av)."}</div>
      {av.mode !== "off" && !av.available && <Note kind="error">سرویس ClamAV پاسخ نمی‌دهد.{av.mode === "required" ? " تا برگشت آن، مشتریان نمی‌توانند فایل بفرستند." : " فایل‌ها بدون اسکن پذیرفته و «اسکن‌نشده» علامت می‌خورند."}</Note>}
      {blocked && blocked.length > 0 && (
        <div data-testid="up-blocked">
          <div style={{ fontSize: 12.5, marginBottom: 2 }}>فایل‌های ردشده اخیر ({toFA(sum.blocked7d || blocked.length)} مورد در ۷ روز):</div>
          {blocked.slice(0, 8).map((b) => <div key={b.id} style={{ ...sub, display: "flex", gap: 8, flexWrap: "wrap" }}><span dir="ltr">{b.name}</span><span>{b.reason}</span><span>{formatLogTimestamp(b.at)}</span></div>)}
        </div>)}
    </div>
  );
}

export default function SettingsPanel({ settings, onSaved }) {
  const [f, setF] = useState(() => ({ enabled: settings.enabled, maxFileMb: settings.maxFileMb, maxFiles: settings.maxFiles, retentionDays: settings.retentionDays, doneRetentionDays: settings.doneRetentionDays ?? 7, requirePhone: settings.requirePhone, notice: settings.notice || "" }));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), [sound, setSound] = useState(getSoundOn()), [perm, setPerm] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const num = (k, min, max) => (e) => setF((s) => ({ ...s, [k]: Math.min(max, Math.max(min, Number(String(e.target.value).replace(/[^\d]/g, "")) || min)) }));
  const save = async () => { setBusy(true); setMsg(null); try { const s = await uploads.saveSettings(f); onSaved(s); setMsg({ k: "ok", t: "ذخیره شد" }); } catch (e) { setMsg({ k: "error", t: msgOf(e) }); } finally { setBusy(false); } };
  const used = settings.quotaBytes ? Math.min(100, Math.round((settings.usedBytes / settings.quotaBytes) * 100)) : 0;
  const ask = async () => { try { setPerm(await Notification.requestPermission()); } catch { /* ignore */ } };
  const lab = { flex: "1 1 130px", fontSize: 12, color: "var(--text-muted)" };
  return (
    <div style={card} data-testid="up-settings">
      <b style={{ fontSize: 14 }}>تنظیمات دریافت فایل</b>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />دریافت فایل از مشتری فعال باشد</label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={f.requirePhone} onChange={(e) => setF({ ...f, requirePhone: e.target.checked })} />شمارهٔ موبایل مشتری اجباری باشد</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={lab}>حداکثر حجم هر فایل (مگابایت)<input inputMode="numeric" value={f.maxFileMb} onChange={num("maxFileMb", 1, 100)} style={INP} /></label>
        <label style={lab}>حداکثر تعداد فایل در هر ارسال<input inputMode="numeric" value={f.maxFiles} onChange={num("maxFiles", 1, 30)} style={INP} /></label>
        <label style={lab}>حذف خودکار فایل‌ها بعد از (روز)<input data-testid="up-retention" inputMode="numeric" value={f.retentionDays} onChange={num("retentionDays", 1, 365)} style={INP} /></label>
        <label style={lab}>حذف زودتر برای «چاپ‌شده/انجام‌شده» (روز)<input data-testid="up-done-retention" inputMode="numeric" value={f.doneRetentionDays} onChange={num("doneRetentionDays", 1, 365)} style={INP} /></label>
      </div>
      <label style={{ fontSize: 12, color: "var(--text-muted)" }}>پیام نمایش‌داده‌شده به مشتری (اختیاری، حداکثر ۳۰۰ نویسه)<input maxLength={300} value={f.notice} onChange={(e) => setF({ ...f, notice: e.target.value })} style={INP} placeholder="مثلاً: چاپ رنگی هر برگ ۳٬۰۰۰ تومان" /></label>
      <div style={sub}>فضای مصرفی: {fmtSize(settings.usedBytes)} از {fmtSize(settings.quotaBytes)} ({toFA(used)}٪). فایل‌های موقت پس از مدت بالا خودکار پاک می‌شوند، مگر «نگه‌داری ویژه» (🔒) شده باشند. فرمت‌های مجاز: {settings.allowedExts.join("، ")}</div>
      <AvBox av={settings.av} />
      <div style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }} data-testid="up-notify">
        <b style={{ fontSize: 13 }}>اعلان فایل تازه</b>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input data-testid="up-sound" type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setSoundOn(e.target.checked); }} />صدای کوتاه هنگام رسیدن فایل (روی همین دستگاه)</label>
        <div style={sub}>نشان قرمز روی منو و اعلان داخل برنامه همیشه فعال است و هر ۲۰ ثانیه تازه می‌شود. اعلان سیستم‌عامل فقط وقتی برنامه در پس‌زمینه باز است نشان داده می‌شود؛ وقتی برنامه کاملاً بسته باشد اعلان نمی‌رسد.</div>
        {perm === "default" && <div><button onClick={ask} style={BTN("var(--border)", "var(--text-secondary)", { padding: "4px 12px", fontSize: 12 })}>اجازهٔ اعلان سیستم‌عامل</button></div>}
        {perm === "denied" && <div style={sub}>اعلان سیستم‌عامل در مرورگر مسدود شده است.</div>}
        {perm === "granted" && <div style={sub}>اعلان سیستم‌عامل مجاز است ✓</div>}
      </div>
      {msg && <Note kind={msg.k}>{msg.t}</Note>}
      <div><button data-testid="up-save" disabled={busy} onClick={save} style={BTN("#2563eb", "#fff", { opacity: busy ? .6 : 1 })}>ذخیرهٔ تنظیمات</button></div>
    </div>
  );
}
