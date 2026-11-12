// نمایش لوگوی اپراتور (یا نشان جایگزین) و پنل مدیریت لوگوها
import React, { useEffect, useRef, useState } from "react";
import { BTN } from "../core/constants.js";
import { OPERATORS, OPERATOR_LOGO_EVENT, fileToLogoDataUrl, operatorInfo, operatorLogoSource, operatorLogoSrc, removeOperatorLogo, setOperatorLogo } from "../domain/operatorLogos.js";

function useLogoTick() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((t) => t + 1); window.addEventListener(OPERATOR_LOGO_EVENT, f); return () => window.removeEventListener(OPERATOR_LOGO_EVENT, f); }, []);
}

export default function OperatorLogo({ name, size = 24, style, title }) {
  useLogoTick();
  const info = operatorInfo(name), src = operatorLogoSrc(name);
  const [bad, setBad] = useState("");
  const base = { width: size, height: size, flexShrink: 0, borderRadius: Math.round(size * 0.28), display: "inline-flex", alignItems: "center", justifyContent: "center", verticalAlign: "middle", ...style };
  if (src && bad !== src) {
    return <span data-testid={`op-logo-${info.key}`} data-op-logo="img" title={title || info.name} style={{ ...base, background: "#fff", padding: Math.max(2, Math.round(size * 0.08)), boxSizing: "border-box", border: "1px solid var(--border)" }}>
      <img src={src} alt={info.name} onError={() => setBad(src)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></span>;
  }
  return <span data-testid={`op-logo-${info.key}`} data-op-logo="badge" title={title || info.name} aria-label={info.name}
    style={{ ...base, background: info.color, color: "#fff", fontSize: Math.round(size * 0.5), fontWeight: 800, lineHeight: 1 }}>{String(name || info.name).trim().charAt(0)}</span>;
}

/** پنل «لوگوی اپراتورها»: بارگذاری، تعویض و حذف برای هر اپراتور */
export function OperatorLogoManager() {
  useLogoTick();
  const [msg, setMsg] = useState({ k: "", t: "", ok: true });
  const inputs = useRef({});
  const pick = async (key, e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    try { setOperatorLogo(key, await fileToLogoDataUrl(f)); setMsg({ k: key, t: "لوگو ذخیره شد.", ok: true }); }
    catch (er) { setMsg({ k: key, t: er.message || "ذخیرهٔ لوگو ممکن نشد", ok: false }); }
  };
  return (
    <div data-testid="op-logo-manager">
      <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "12px 16px", marginBottom: 12, fontSize: 12, color: "var(--text-secondary)", lineHeight: 2 }}>
        لوگوی رسمی هر اپراتور را از سایت یا بستهٔ برند خود آن اپراتور بگیرید و اینجا بارگذاری کنید (PNG، JPG، WebP یا SVG؛ تا ۶۰۰ کیلوبایت). لوگوها روی همین دستگاه ذخیره می‌شوند، در فایل پشتیبان هم می‌آیند و کنار نام اپراتور در فروش شارژ و اینترنت نمایش داده می‌شوند. تا زمان بارگذاری، یک نشان ساده با حرف اول نام دیده می‌شود.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
        {OPERATORS.map((o) => {
          const src = operatorLogoSource(o.key);
          return (
            <div key={o.key} data-testid={`op-card-${o.key}`} style={{ background: "var(--bg-card)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <OperatorLogo name={o.name} size={64} />
              <div style={{ fontSize: 13, fontWeight: 700 }}>{o.name}</div>
              <div data-testid={`op-source-${o.key}`} style={{ fontSize: 11, color: "var(--text-dim)" }}>{src === "user" ? "لوگوی بارگذاری‌شده" : src === "config" ? "از تنظیمات سرور (config.js)" : "بدون لوگو — نشان ساده"}</div>
              <input ref={(el) => { inputs.current[o.key] = el; }} data-testid={`op-input-${o.key}`} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => pick(o.key, e)} style={{ display: "none" }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                <button data-testid={`op-upload-${o.key}`} onClick={() => inputs.current[o.key] && inputs.current[o.key].click()} style={{ ...BTN("#2563eb"), padding: "6px 12px", fontSize: 12 }}>{src === "user" ? "تعویض لوگو" : "بارگذاری لوگو"}</button>
                {src === "user" && <button data-testid={`op-remove-${o.key}`} onClick={() => { removeOperatorLogo(o.key); setMsg({ k: o.key, t: "لوگو حذف شد.", ok: true }); }} style={{ ...BTN("#450a0a", "#f87171"), padding: "6px 12px", fontSize: 12 }}>حذف</button>}
              </div>
              {msg.k === o.key && msg.t && <div data-testid={`op-msg-${o.key}`} style={{ fontSize: 11, color: msg.ok ? "#4ade80" : "#f87171", textAlign: "center" }}>{msg.ok ? "✓ " : "⚠️ "}{msg.t}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
