// عنصرهای مشترک صفحه‌های «تم نارنجی»: کارت، نمودارها، برچسب‌ها
import React, { useState } from "react";
import { currencyLabel, displayMoney, toFA } from "../../app/core/format.js";

export const num = (n) => toFA(Math.round(Number(displayMoney(n)) || 0).toLocaleString("en-US"));
export const ORANGE = "#e8590c";
export const PEACH = "#ffc9a3";
export const SLICE_COLORS = ["#e8590c", "#ffab57", "#8a5a3c", "#1fa7c4", "#cdb9a8"];

export function Card({ children, style, title, action, testid, pad = 20 }) {
  return (
    <section data-testid={testid} className="oc-card" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 22, padding: pad, boxShadow: "0 1px 2px rgba(120,53,15,.05), 0 10px 28px rgba(120,53,15,.06)", minWidth: 0, ...style }}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>{title}</h3>
          {action}
        </div>)}
      {children}
    </section>);
}

export function LinkBtn({ children, onClick, testid }) {
  return <button type="button" data-testid={testid} onClick={onClick} style={{ background: "transparent", border: "none", color: "var(--accent-light)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>{children}</button>;
}

export function Pill({ children, tone = "green", style }) {
  const t = { green: ["rgba(47,158,87,.14)", "#2f9e57"], red: ["rgba(214,51,57,.13)", "#d63339"], orange: ["rgba(232,89,12,.14)", "#e8590c"], gray: ["rgba(128,128,128,.14)", "var(--text-secondary)"] }[tone] || [];
  return <span style={{ background: t[0], color: t[1], borderRadius: 999, padding: "3px 11px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", ...style }}>{children}</span>;
}

export function Trend({ pct, invert }) {
  const up = pct >= 0, good = invert ? !up : up;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: good ? "#2f9e57" : "#d63339" }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{up ? <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></> : <><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>}</svg>
    {toFA(Math.abs(pct))}٪</span>;
}

export function Kpi({ icon, tint, label, value, unit, trend, invert, testid, children }) {
  return (
    <Card testid={testid} pad={18} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, background: tint[0], color: tint[1], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</div>
            <div data-testid={testid ? testid + "-value" : undefined} style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.4, whiteSpace: "nowrap" }}>{value}{unit && <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginInlineStart: 6 }}>{unit}</span>}</div>
          </div>
        </div>
        {trend !== undefined && trend !== null && <Trend pct={trend} invert={invert} />}
      </div>
      {children}
    </Card>);
}

// ───────── نمودار خطی/ناحیه‌ای (قدیمی‌ترین نقطه سمت راست) ─────────
export function AreaChart({ points, height = 210, testid }) {
  const W = 640, H = height, padX = 14, padT = 26, padB = 26;
  const [hi, setHi] = useState(null);
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i) => W - padX - (n <= 1 ? 0 : (i / (n - 1)) * (W - padX * 2));
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const xy = points.map((p, i) => [x(i), y(p.value)]);
  // درون‌یابی تکنوای یکنوا (Fritsch–Carlson): بدون موج و فروافتادن بیرون از دادهٔ واقعی
  const path = (() => {
    const m = xy.length;
    if (!m) return "";
    if (m === 1) return `M${xy[0][0]},${xy[0][1]}`;
    const dx = [], sl = [];
    for (let i = 0; i < m - 1; i++) { dx.push(xy[i + 1][0] - xy[i][0]); sl.push((xy[i + 1][1] - xy[i][1]) / (dx[i] || 1)); }
    const tg = [sl[0]];
    for (let i = 1; i < m - 1; i++) tg.push(sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2);
    tg.push(sl[m - 2]);
    for (let i = 0; i < m - 1; i++) {
      if (sl[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
      const a = tg[i] / sl[i], b = tg[i + 1] / sl[i], h = Math.hypot(a, b);
      if (h > 3) { tg[i] = (3 * a / h) * sl[i]; tg[i + 1] = (3 * b / h) * sl[i]; }
    }
    let d = `M${xy[0][0]},${xy[0][1]}`;
    for (let i = 0; i < m - 1; i++) { const k = dx[i] / 3; d += ` C${xy[i][0] + k},${xy[i][1] + tg[i] * k} ${xy[i + 1][0] - k},${xy[i + 1][1] - tg[i + 1] * k} ${xy[i + 1][0]},${xy[i + 1][1]}`; }
    return d;
  })();
  const area = xy.length > 1 ? `${path} L${xy[xy.length - 1][0]},${H - padB} L${xy[0][0]},${H - padB} Z` : "";
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect(); const rel = (e.clientX - r.left) / r.width * W;
    let best = 0, bd = 1e9; xy.forEach((p, i) => { const d = Math.abs(p[0] - rel); if (d < bd) { bd = d; best = i; } }); setHi(best);
  };
  const h = hi == null ? null : points[hi];
  return (
    <div data-testid={testid} style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="نمودار درآمد" onMouseMove={move} onMouseLeave={() => setHi(null)} onTouchStart={(e) => move(e.touches[0])} style={{ display: "block", touchAction: "pan-y" }}>
        <defs><linearGradient id="oc-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={ORANGE} stopOpacity=".28" /><stop offset="1" stopColor={ORANGE} stopOpacity="0" /></linearGradient></defs>
        {[0, 1, 2, 3].map((i) => <line key={i} x1={padX} x2={W - padX} y1={padT + (i / 3) * (H - padT - padB)} y2={padT + (i / 3) * (H - padT - padB)} stroke="var(--border)" strokeWidth="1" />)}
        {area && <path d={area} fill="url(#oc-area)" />}
        {path && <path d={path} fill="none" stroke={ORANGE} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
        {hi != null && <><line x1={xy[hi][0]} x2={xy[hi][0]} y1={padT} y2={H - padB} stroke={ORANGE} strokeOpacity=".5" strokeDasharray="4 4" /><circle cx={xy[hi][0]} cy={xy[hi][1]} r="5" fill="#fff" stroke={ORANGE} strokeWidth="2.5" /></>}
        {hi == null && xy.length > 0 && <circle cx={xy[0][0]} cy={xy[0][1]} r="4.5" fill={ORANGE} />}
      </svg>
      {h && (
        <div data-testid="chart-tooltip" style={{ position: "absolute", top: 0, left: `${Math.max(12, Math.min(88, (xy[hi][0] / W) * 100))}%`, transform: "translateX(-50%)", background: "#2b1a12", color: "#fff", borderRadius: 12, padding: "7px 13px", fontSize: 12, textAlign: "center", pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 8px 20px rgba(0,0,0,.25)" }}>
          <div style={{ fontWeight: 800 }}>{num(h.value)}</div><div style={{ opacity: 0.75, fontSize: 11 }}>{h.label}</div>
        </div>)}
    </div>);
}

// ───────── دونات ─────────
export function Donut({ slices, size = 170, centerTop, centerBottom, testid }) {
  const r = size / 2 - 14, c = 2 * Math.PI * r, total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <div data-testid={testid} style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="سهم دسته‌ها">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="26" />
        {slices.map((s, i) => { const len = (s.value / total) * c, off = acc; acc += len; return <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={SLICE_COLORS[i % SLICE_COLORS.length]} strokeWidth="26" strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />; })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>{centerTop}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{centerBottom}</div>
      </div>
    </div>);
}

// ───────── میله‌ای دوتایی (درآمد/هزینه) ─────────
export function PairBars({ data, height = 170, testid }) {
  const W = 700, H = height, padB = 30, padT = 14, n = data.length;
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const slot = (W - 20) / Math.max(1, n), bw = Math.min(34, slot / 3.2);
  const hOf = (v) => (v / max) * (H - padB - padT);
  return (
    <svg data-testid={testid} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="نمودار درآمد و هزینه ماهانه" style={{ display: "block" }}>
      {[0, 1, 2, 3].map((i) => <line key={i} x1="10" x2={W - 10} y1={padT + (i / 3) * (H - padB - padT)} y2={padT + (i / 3) * (H - padB - padT)} stroke="var(--border)" />)}
      {data.map((d, i) => {
        const cx = W - 10 - slot * (i + 0.5);   // قدیمی‌ترین ماه سمت راست
        return (<g key={i}>
          <rect x={cx + 3} y={H - padB - hOf(d.income)} width={bw} height={Math.max(0, hOf(d.income))} rx="7" fill={ORANGE}><title>{`درآمد: ${num(d.income)}`}</title></rect>
          <rect x={cx - bw - 3} y={H - padB - hOf(d.expense)} width={bw} height={Math.max(0, hOf(d.expense))} rx="7" fill={PEACH}><title>{`هزینه: ${num(d.expense)}`}</title></rect>
          <text x={cx} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--text-muted)" fontFamily="inherit">{d.label}</text>
        </g>);
      })}
    </svg>);
}

export function Progress({ pct, low }) {
  return <div style={{ flex: 1, height: 9, borderRadius: 999, background: "var(--bg-app)", overflow: "hidden", direction: "rtl" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: low ? "#d63339" : "#2f9e57" }} /></div>;
}

export function Segmented({ options, value, onChange, testid }) {
  return (
    <div role="tablist" data-testid={testid} style={{ display: "inline-flex", gap: 2, background: "var(--bg-app)", borderRadius: 12, padding: 4 }}>
      {options.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} data-testid={testid ? `${testid}-${k}` : undefined} onClick={() => onChange(k)} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "6px 14px", borderRadius: 9, background: value === k ? "var(--bg-card)" : "transparent", color: value === k ? "var(--text-primary)" : "var(--text-muted)", boxShadow: value === k ? "0 1px 4px rgba(0,0,0,.12)" : "none" }}>{l}</button>)}
    </div>);
}

export const unit = () => currencyLabel();
export function Avatar({ name, color, size = 40 }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>{name}</span>;
}
