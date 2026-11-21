// کادر «کد پیامکی»: (کپچا) → ارسال کد → وارد کردن کد ۶رقمی، با شمارندهٔ ارسال مجدد.
// برای ورود/ثبت‌نام (public: کپچای همیشگی چون هر پیامک پول است) و تأیید شمارهٔ حساب واردشده (account: بدون کپچا) استفاده می‌شود.
import React, { useState, useEffect, useCallback } from "react";
import { INP, BTN } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { apiResources } from "../services/api/client.js";
import { LoginCaptcha } from "../app/app/LoginCaptcha.jsx";
import { captchaPayload, captchaReady, isCaptchaCode } from "../app/app/loginCaptcha.js";
import { isMobile, normalizeCode, mmss, smsErrorText, OTP_LENGTH } from "./smsLogic.js";

export function SmsCodeBox({ purpose, phone, code, onCode, send, withCaptcha = true, resendIn = 60, onSent, testid = "sms-box", submit }) {
  const [captcha, setCaptcha] = useState(null), [answer, setAnswer] = useState(""), [capLoading, setCapLoading] = useState(false);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [sent, setSent] = useState(false), [left, setLeft] = useState(0);

  const loadCaptcha = useCallback(async () => {
    if (!withCaptcha) return;
    setCapLoading(true); setAnswer("");
    try { const c = await apiResources.auth.captcha(); setCaptcha(c?.id ? c : null); } catch { setCaptcha(null); }
    setCapLoading(false);
  }, [withCaptcha]);
  useEffect(() => { loadCaptcha(); }, [loadCaptcha]);
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft((s) => s - 1), 1000); return () => clearTimeout(t); }, [left]);

  const canSend = isMobile(phone) && !busy && left <= 0 && (!withCaptcha || captchaReady(captcha, answer) && captcha?.id);
  const doSend = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await send({ phone, purpose, ...(withCaptcha ? captchaPayload(captcha, answer) : {}) });
      setSent(true); setLeft(Number(r?.resendIn) > 0 ? Number(r.resendIn) : resendIn); onSent?.(r);
    } catch (e) {
      setErr(smsErrorText(e));
      if (e?.code === "sms_wait" && Number(e?.retryAfterMs) > 0) setLeft(Math.ceil(Number(e.retryAfterMs) / 1000));
    }
    if (withCaptcha) await loadCaptcha();         // هر چالش یک‌بارمصرف است
    setBusy(false);
  };
  void isCaptchaCode;
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {withCaptcha && <LoginCaptcha challenge={captcha} loading={capLoading} value={answer} onChange={setAnswer} onRefresh={loadCaptcha} onSubmit={() => canSend && doSend()} />}
      <button type="button" data-testid={`${testid}-send`} onClick={doSend} disabled={!canSend} style={{ ...BTN(sent ? "var(--bg-app)" : "#16a34a", sent ? "var(--text-secondary)" : "#fff"), padding: 10, fontSize: 13, opacity: canSend ? 1 : 0.55, border: sent ? "1px solid var(--border)" : "none" }}>
        {busy ? "در حال ارسال…" : left > 0 ? `ارسال مجدد تا ${toFA(mmss(left))} دیگر` : sent ? "ارسال دوبارهٔ کد" : "ارسال کد پیامکی"}
      </button>
      {!isMobile(phone) && phone ? <div style={{ fontSize: 11.5, color: "#fbbf24" }}>شمارهٔ موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)</div> : null}
      {sent && <>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>کد {toFA(OTP_LENGTH)}رقمی به <b dir="ltr">{toFA(phone)}</b> پیامک شد (چند ثانیه صبر کنید).</div>
        <input data-testid={`${testid}-code`} value={code} onChange={(e) => onCode(normalizeCode(e.target.value))} onKeyDown={(e) => e.key === "Enter" && submit?.()} inputMode="numeric" autoComplete="one-time-code" maxLength={OTP_LENGTH * 2} placeholder="کد پیامک‌شده" aria-label="کد پیامکی" style={{ ...INP, direction: "ltr", letterSpacing: 6, textAlign: "center", fontSize: 18 }} />
      </>}
      {err && <div role="alert" data-testid={`${testid}-err`} style={{ background: "#2d0a0a", border: "1px solid #dc262644", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f87171" }}>⚠️ {err}</div>}
    </div>
  );
}
