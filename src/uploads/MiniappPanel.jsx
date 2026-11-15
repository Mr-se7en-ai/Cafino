// کارت «مینی‌اپ تلگرام» در صفحهٔ دریافت فایل: لینک/QR ورود مشتری به ربات مشترک، فعال/غیرفعال، همگام‌سازی تعرفه.
import React, { useEffect, useMemo, useState } from "react";
import { BTN } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { useTariffData } from "../app/pages/tariff.jsx";
import { qrSvg } from "./qr.js";
import { miniapp, syncTariffNow, tariffToPublic } from "./miniappApi.js";
import { card, sub, msgOf, Note, Pill } from "./ui.jsx";

export default function MiniappPanel() {
  const [info, setInfo] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState(null);
  const [tariff] = useTariffData();
  const load = () => miniapp.info().then((d) => { setInfo(d); setErr(""); }, (e) => setErr(msgOf(e)));
  useEffect(() => { load(); }, []);
  const svg = useMemo(() => (info?.link ? qrSvg(info.link, { ecc: "Q" }) : ""), [info?.link]);
  const groups = useMemo(() => tariffToPublic(tariff), [tariff]);
  const run = async (fn, okText) => { setBusy(true); setNote(null); try { await fn(); await load(); setNote({ k: "ok", t: okText }); } catch (e) { setNote({ k: "error", t: msgOf(e) }); } finally { setBusy(false); } };
  const copy = () => navigator.clipboard?.writeText(info.link).then(() => setNote({ k: "ok", t: "لینک کپی شد" }), () => setNote({ k: "error", t: "کپی نشد؛ لینک را دستی انتخاب کنید" }));
  const downloadSvg = () => { const b = new Blob([svg], { type: "image/svg+xml" }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = "cafino-telegram-qr.svg"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 10000); };
  if (err) return <div style={card} data-testid="mini-card"><b style={{ fontSize: 15 }}>مینی‌اپ تلگرام</b><Note kind="error">{err}</Note></div>;
  if (!info) return null;
  return (
    <div style={card} data-testid="mini-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>مینی‌اپ تلگرام مشتریان</b>
        <Pill color={!info.serverEnabled ? "#9ca3af" : info.enabled ? "#34d399" : "#fbbf24"} data-testid="mini-state">{!info.serverEnabled ? "سرور فعال نکرده" : info.enabled ? "فعال" : "خاموش"}</Pill>
        {info.serverEnabled && <Pill color="#60a5fa">{toFA(info.linkedCustomers)} مشتری متصل</Pill>}
      </div>
      <div style={sub}>مشتری با لینک یا QR زیر وارد ربات مشترک کافینو می‌شود و در مینی‌اپ، خدمات و قیمت‌ها، وضعیت سفارش‌ها و مانده حساب خودش را می‌بیند. شمارهٔ موبایل را خود تلگرام تأیید می‌کند؛ مشتری فقط اطلاعات خودش را می‌بیند.</div>
      {!info.serverEnabled && <Note kind="warn" data-testid="mini-server-off">مدیر سرور هنوز مینی‌اپ را راه‌اندازی نکرده است (متغیرهای MINIAPP_BOT_TOKEN و MINIAPP_URL). راهنما: server/MINIAPP-fa.md</Note>}
      {info.serverEnabled && !info.link && <Note kind="warn">ربات هنوز راه‌اندازی نشده یا به تلگرام دسترسی ندارد؛ چند دقیقه بعد دوباره امتحان کنید. (تلگرام در ایران فیلتر است؛ سرور باید به تلگرام دسترسی داشته باشد.)</Note>}
      {info.link && <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div data-testid="mini-qr" style={{ width: 150, height: 150, flex: "none", borderRadius: 12, overflow: "hidden", border: "3px solid #229ed9", background: "#fff" }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg width="100%" height="100%" ') }} />
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
          <div dir="ltr" data-testid="mini-link" style={{ fontSize: 12.5, wordBreak: "break-all", background: "var(--bg-app)", borderRadius: 8, padding: "8px 10px" }}>{info.link}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={copy} style={BTN("var(--accent,#e8590c)", "#fff")}>کپی لینک</button>
            <button onClick={downloadSvg} style={BTN("var(--border)", "var(--text-secondary)")}>ذخیرهٔ QR (SVG)</button>
          </div>
        </div>
      </div>}
      {info.serverEnabled && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input data-testid="mini-toggle" type="checkbox" checked={info.enabled} disabled={busy} onChange={(e) => run(() => miniapp.setEnabled(e.target.checked), e.target.checked ? "مینی‌اپ فعال شد" : "مینی‌اپ خاموش شد")} />مینی‌اپ برای مشتریان این کافی‌نت فعال باشد</label>}
      {info.serverEnabled && <div style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13 }}><b>تعرفهٔ نمایش‌داده‌شده به مشتری</b>: {info.tariff ? `${toFA(Number(info.tariff.groups) || 0)} گروه` : "هنوز همگام نشده"}</div>
        <div style={sub}>با هر تغییر در «تعرفه»، نام و قیمت خدمات خودکار به مینی‌اپ می‌رسد (فقط نام و قیمت). در حال حاضر در برنامه {toFA(groups.length)} گروه تعرفه دارید.</div>
        <div><button data-testid="mini-sync" disabled={busy} onClick={() => run(() => syncTariffNow(tariff), "تعرفه همگام شد")} style={BTN("var(--border)", "var(--text-secondary)")}>همگام‌سازی تعرفه اکنون</button></div>
      </div>}
      {note && <Note kind={note.k}>{note.t}</Note>}
    </div>
  );
}
