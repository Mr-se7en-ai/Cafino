// انتخاب پوسته (تم مترو / تم نارنجی / تم لیکوید گلس) در تنظیمات ← ظاهر
import React from "react";
import { SKINS, setSkin } from "./skin.js";
import { useSkin } from "./useSkin.js";
import { LiquidPanel } from "./liquid/LiquidPanel.jsx";

export function SkinPanel() {
  const skin = useSkin();
  return (
    <>
    <div data-testid="skin-panel" style={{ background: "var(--bg-card)", borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)", marginBottom: 4 }}>🖌️ تم برنامه</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9, marginBottom: 12 }}>یکی از سه تم را انتخاب کنید؛ همه با حالت روشن و تیره کار می‌کنند و هر زمان می‌توانید برگردید.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        {SKINS.map((k) => {
          const on = skin === k.key;
          return (
            <button key={k.key} type="button" data-testid={`skin-${k.key}`} aria-pressed={on} onClick={() => setSkin(k.key)}
              style={{ textAlign: "right", cursor: "pointer", fontFamily: "inherit", padding: 14, borderRadius: 14, background: on ? "var(--bg-app)" : "transparent", color: "var(--text-primary)", border: on ? "2px solid var(--accent-light)" : "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{k.label}</span>
                {on && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-light)" }}>✓ فعال</span>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>{k.swatch.map((c) => <span key={c} style={{ width: 28, height: 18, borderRadius: 6, background: c, border: "1px solid rgba(128,128,128,.35)" }} />)}</div>
              <span style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.8 }}>{k.hint}</span>
            </button>);
        })}
      </div>
    </div>
    {skin === "liquid" && <div style={{ marginTop: 12 }}><LiquidPanel /></div>}
    </>);
}
