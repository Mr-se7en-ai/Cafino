// دیالوگ «دلیل اجباری» برای عملیات حساس — promise-based: const reason = await askReason({...}); null = انصراف.
import React, { useState, useEffect, useRef } from "react";
import { BTN, INP } from "../app/core/constants.js";
import { MIN_REASON } from "./auditTrail.js";
import { isOfflineNow } from "../services/auth/offlineSession.js";
import { isApiConnected } from "../services/api/client.js";

let hostSetter = null;
// بدون میزبان (تست/محیط‌های بدون UI) فوراً با رشتهٔ خالی resolve می‌شود تا کار قفل نکند؛ رویداد با پرچم «بدون دلیل» ثبت می‌شود.
export function askReason(opts = {}) {
  return new Promise((resolve) => {
    // عملیات حساس مالی (opts.online): در حالت سرور بدون اتصال، همان هویتِ ذخیره‌شدهٔ آفلاین اجازهٔ تعدیل/حذف/ابطال نمی‌دهد
    if (opts.online && financialBlockedOffline()) { if (!hostSetter) { resolve(null); return; } hostSetter({ opts: { ...opts, blocked: true }, resolve }); return; }
    if (!hostSetter) { resolve(""); return; }
    hostSetter({ opts, resolve });
  });
}

// فقط وقتی برنامه به سرور وصل است (حالت چندکاربره) و اتصال/تأیید هویت آنلاین نیست
export function financialBlockedOffline() {
  let server = false; try { server = isApiConnected(); } catch { server = false; }
  return server && isOfflineNow();
}
// برای مسیرهایی که askReason ندارند (مثل ابطال فاکتور): true = اجازه هست؛ false = دیالوگ «آنلاین لازم است» نشان داده شد
export async function ensureOnlineForSensitive(title = "این عملیات") {
  if (!financialBlockedOffline()) return true;
  await askReason({ title, online: true });
  return false;
}

export function ReasonChips({ presets = [], onPick }) {
  if (!presets.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 10 }}>
      {presets.map((p) => (
        <button key={p} type="button" data-testid="reason-chip" onClick={() => onPick(p)} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 20, border: "1px solid var(--border)", background: "var(--bg-app)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>{p}</button>
      ))}
    </div>
  );
}

export function ReasonHost() {
  const [req, setReq] = useState(null);
  const [text, setText] = useState("");
  const ref = useRef(null);
  useEffect(() => { hostSetter = (r) => { setText(""); setReq(r); }; return () => { hostSetter = null; }; }, []);
  useEffect(() => { if (req && ref.current) ref.current.focus(); }, [req]);
  if (!req) return null;
  const { opts, resolve } = req;
  const ok = text.trim().length >= MIN_REASON;
  const close = (v) => { setReq(null); resolve(v); };
  if (opts.blocked) return (
    <div data-testid="offline-blocked-dialog" style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, padding: 12 }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 22, width: "100%", maxWidth: 380, textAlign: "center", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>📡</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{opts.title || "عملیات حساس مالی"}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.9 }}>اصلاح، حذف و ابطال مالی در حالت آفلاین مجاز نیست، چون سرور نمی‌تواند هویت و اختیار شما را همان لحظه تأیید کند. وقتی اینترنت وصل شد و برنامه هویت شما را تأیید کرد، دوباره انجام دهید. فروش و دریافت معمولی آفلاین کار می‌کند.</div>
        <button data-testid="offline-blocked-ok" onClick={() => close(null)} style={{ ...BTN("#2563eb"), width: "100%" }}>متوجه شدم</button>
      </div>
    </div>
  );
  return (
    <div data-testid="reason-dialog" style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, padding: 12 }} onKeyDown={(e) => { if (e.key === "Escape") close(null); }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 22, width: "100%", maxWidth: 380, textAlign: "center", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>{opts.icon || "📝"}</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{opts.title || "ثبت دلیل"}</div>
        {opts.desc && <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.9 }}>{opts.desc}</div>}
        <ReasonChips presets={opts.presets} onPick={(p) => setText(p)} />
        <input ref={ref} data-testid="reason-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ok) close(text.trim()); }} placeholder="دلیل این تغییر (الزامی)" maxLength={300} style={{ ...INP, marginTop: 0, marginBottom: 6, textAlign: "right" }} />
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>این دلیل همراه نام شما و دستگاه در «گزارش حسابرسی» ثبت می‌شود.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button data-testid="reason-confirm" disabled={!ok} onClick={() => close(text.trim())} style={{ ...BTN(opts.danger ? "#dc2626" : "#2563eb"), flex: 1, opacity: ok ? 1 : 0.45, cursor: ok ? "pointer" : "not-allowed" }}>{opts.confirmLabel || "ثبت و ادامه"}</button>
          <button data-testid="reason-cancel" onClick={() => close(null)} style={{ ...BTN("var(--border)", "var(--text-primary)"), flex: 1 }}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
