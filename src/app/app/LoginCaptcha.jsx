// کادر کپچای ورود: تصویر ۵ رقمی + ورودی عددی + «کد جدید». فقط وقتی سرور کپچا بخواهد نمایش داده می‌شود.
import React from "react";
import { INP } from "../core/constants.js";
import { CAPTCHA_LENGTH, normalizeCaptchaAnswer } from "./loginCaptcha.js";

export function LoginCaptcha({ challenge, loading, value, onChange, onRefresh, onSubmit }) {
  return (
    <div data-testid="login-captcha" style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>برای امنیت بیشتر، عدد تصویر را وارد کنید:</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, direction: "ltr" }}>
        <div style={{ width: 150, height: 52, flex: "none", borderRadius: 8, overflow: "hidden", background: "#f1f5f9" }}>
          {challenge?.image && !loading ? <img data-testid="captcha-image" src={challenge.image} alt="کد تصویر" width={150} height={52} draggable={false} style={{ display: "block" }} /> : <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: "52px" }}>{loading ? "در حال دریافت…" : "—"}</div>}
        </div>
        <button data-testid="captcha-refresh" type="button" onClick={onRefresh} disabled={loading} title="کد جدید" aria-label="کد جدید" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 8, width: 36, height: 36, cursor: "pointer", fontSize: 16 }}>↻</button>
      </div>
      <input data-testid="captcha-input" value={value} onChange={(e) => onChange(normalizeCaptchaAnswer(e.target.value))} onKeyDown={(e) => e.key === "Enter" && onSubmit()} inputMode="numeric" autoComplete="off" maxLength={CAPTCHA_LENGTH * 2} placeholder={"۱۲۳۴۵ (یا 12345)"} aria-label="عدد تصویر" style={{ ...INP, direction: "ltr", letterSpacing: 4, textAlign: "center" }} />
    </div>
  );
}
