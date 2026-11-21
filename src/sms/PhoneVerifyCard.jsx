// کارت «تأیید شمارهٔ موبایل» در پروفایل (فقط حساب سروری و وقتی سرور پیامک ملی‌پیامک دارد).
// بعد از تأیید، «ورود با کد پیامکی» برای همین حساب فعال می‌شود. ارسال کد در اینجا بدون کپچاست (کاربر وارد شده است).
import React, { useState, useEffect } from "react";
import { apiResources } from "../services/api/client.js";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { card, sub, Note, Pill, msgOf } from "../uploads/ui.jsx";
import { SmsCodeBox } from "./SmsCodeBox.jsx";
import { codeReady, isMobile, normalizeMobile, smsErrorText } from "./smsLogic.js";

export function PhoneVerifyCard() {
  const [cfg, setCfg] = useState(null), [me, setMe] = useState(null), [phone, setPhone] = useState(""), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [ok, setOk] = useState(""), [editing, setEditing] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try { const c = await apiResources.auth.smsConfig(); if (live) setCfg(c || null); } catch { if (live) setCfg(null); }
      try { const u = await apiResources.auth.me(); if (live) { setMe(u || null); setPhone(u?.phone || ""); } } catch { /* ignore */ }
    })();
    return () => { live = false; };
  }, []);

  if (!cfg || !(cfg.login || cfg.register)) return null;       // سرور پیامک ندارد → کارت نمایش داده نمی‌شود
  const verified = Boolean(me?.phoneVerified) && !editing;

  const verify = async () => {
    setErr(""); setOk("");
    if (!isMobile(phone)) { setErr("شمارهٔ موبایل معتبر نیست"); return; }
    if (!codeReady(code)) { setErr("ابتدا کد ۶رقمی پیامک‌شده را وارد کنید"); return; }
    setBusy(true);
    try {
      const r = await apiResources.auth.phoneVerify({ phone: normalizeMobile(phone), code });
      setMe((m) => ({ ...(m || {}), phone: r?.phone || normalizeMobile(phone), phoneVerified: true }));
      setOk("✓ شمارهٔ موبایل تأیید شد؛ از این به بعد می‌توانید با کد پیامکی وارد شوید"); setCode(""); setEditing(false);
    } catch (e) { setErr(smsErrorText(e) || msgOf(e)); }
    setBusy(false);
  };

  return (
    <div style={card} data-testid="phone-verify-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 14, color: "var(--accent-light)" }}>📱 شمارهٔ موبایل و ورود با پیامک</b>
        {me && (verified ? <Pill color="#34d399" data-testid="phone-verified-pill">تأییدشده</Pill> : <Pill color="#fbbf24">تأییدنشده</Pill>)}
      </div>
      {verified ? <>
        <div style={sub}>شمارهٔ تأییدشده: <b dir="ltr" style={{ color: "var(--text-primary)" }}>{toFA(me?.phone || "")}</b> — با همین شماره می‌توانید از صفحهٔ ورود «ورود با کد پیامکی» را بزنید.</div>
        <button type="button" onClick={() => { setEditing(true); setOk(""); setCode(""); }} style={{ ...BTN("var(--bg-app)", "var(--text-secondary)"), border: "1px solid var(--border)", padding: "7px 12px", fontSize: 12.5, alignSelf: "flex-start" }}>تغییر شماره</button>
      </> : <>
        <div style={sub}>شمارهٔ موبایل را وارد و با کد پیامکی تأیید کنید تا ورود با پیامک برای حساب شما فعال شود.</div>
        <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>شمارهٔ موبایل
          <input data-testid="phone-verify-input" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲۳۴۵۶۷۸۹" style={INP} />
        </label>
        <SmsCodeBox key={`pv-${editing}`} testid="phone-verify" purpose="verify" phone={phone} code={code} onCode={setCode} send={apiResources.auth.phoneSend} withCaptcha={false} resendIn={cfg.resendIn} submit={verify} />
        <button type="button" data-testid="phone-verify-submit" onClick={verify} disabled={busy} style={{ ...BTN("#2563eb"), padding: 10, fontSize: 13, opacity: busy ? 0.6 : 1 }}>{busy ? "در حال بررسی…" : "تأیید شماره"}</button>
      </>}
      {err && <Note kind="error" data-testid="phone-verify-err">{err}</Note>}
      {ok && <Note kind="ok" data-testid="phone-verify-ok">{ok}</Note>}
    </div>
  );
}
