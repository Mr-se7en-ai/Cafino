// تنظیمات «تم لیکوید گلس» (فقط وقتی این تم فعال است نشان داده می‌شود)
import React, { useEffect, useState } from "react";
import { getLiquid, saveLiquid, LIQUID_DEFAULTS } from "./liquidSettings.js";
import { setLiquidLensEnabled } from "./liquidLens.js";
import { isLensSupported } from "./lens.js";

export function LiquidPanel() {
  const [v, setV] = useState(getLiquid);
  const [supported, setSupported] = useState(true);
  useEffect(() => { try { setSupported(isLensSupported()); } catch { setSupported(false); } }, []);
  const set = (patch) => { const next = saveLiquid(patch); setV(next); if ("lens" in patch) setLiquidLensEnabled(next.lens); };
  const row = { background: "var(--bg-card)", borderRadius: 12, padding: 18 };
  const lbl = { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" };
  const slider = (id, label, min, max, value, unit, onChange, note) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <label htmlFor={id} style={lbl}>{label}</label><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{value}{unit}</span>
      </div>
      <input id={id} data-testid={id} type="range" min={min} max={max} step="1" value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: "#3b82f6", direction: "ltr" }} />
      {note && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{note}</div>}
    </div>);
  return (
    <div data-testid="liquid-panel" style={row}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)", marginBottom: 12 }}>🫧 تنظیم شیشه (لیکوید گلس)</div>
      {slider("lq-transparency", "میزان شفافیت", 0, 100, v.transparency, "٪", (n) => set({ transparency: n }), "عدد بیشتر یعنی پس‌زمینهٔ رنگی بیشتر دیده می‌شود. برای خوانایی بهتر متن‌ها عدد را کمتر کنید.")}
      {slider("lq-blur", "میزان محو", 4, 32, v.blur, " px", (n) => set({ blur: n }))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={lbl}>شکست نور لبه‌ها</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.8 }}>{supported ? "لبهٔ منوی کناری، هدر و نوار پایین مثل لبهٔ شیشهٔ ضخیم نور را می‌شکند." : "این مرورگر شکست نور لبه را پشتیبانی نمی‌کند (فقط کروم/اج و نسخهٔ دسکتاپ)؛ شیشهٔ محو و نور لبه همچنان فعال است."}</div>
        </div>
        <button type="button" role="switch" data-testid="lq-lens" aria-checked={v.lens} disabled={!supported} onClick={() => set({ lens: !v.lens })}
          style={{ width: 76, padding: "9px 10px", borderRadius: 999, border: "1px solid var(--border)", background: v.lens && supported ? "#3b82f6" : "var(--bg-app)", color: v.lens && supported ? "#fff" : "var(--text-secondary)", cursor: supported ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 12, fontWeight: 700, opacity: supported ? 1 : .55 }}>{v.lens && supported ? "روشن" : "خاموش"}</button>
      </div>
      <button type="button" data-testid="lq-reset" onClick={() => { const n = saveLiquid(LIQUID_DEFAULTS); setV(n); setLiquidLensEnabled(n.lens); }}
        style={{ marginTop: 14, padding: "7px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>بازگشت به مقدارهای پیش‌فرض</button>
      <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.8 }}>ماده‌ی شیشه و الگوریتم شکست نور برگرفته از پروژهٔ Glasswork (Kubai087) با مجوز MIT است.</div>
    </div>);
}
