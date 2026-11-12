import React from "react";
import { errorLog, reportError } from "../diagnostics/index.js";

// Last line of defence for render errors. Shows a stable Error ID (e.g. CF-8A31), keeps the technical details
// in the persistent error log and offers safe recovery actions (retry, download raw data, full reset).
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null, entry: null, copied: false }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    const entry = reportError(err, "react", { component: String(info?.componentStack || "").trim().split("\n").slice(0, 3).join(" ⟵ ") });
    this.setState({ entry });
  }
  componentDidUpdate(prev) {
    if (this.state.err && prev.resetKey !== this.props.resetKey) this.setState({ err: null, entry: null, copied: false });
  }
  dump() {
    try {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === "cafenet_ai_agent") continue; o[k] = localStorage.getItem(k); }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: "application/json" }));
      a.download = "cafenet-raw-data.json"; a.click();
    } catch { /* ignore */ }
  }
  reset() {
    if (!window.confirm("همه داده‌های ذخیره‌شده پاک می‌شود. ابتدا فایل داده را دانلود کرده‌اید؟ ادامه می‌دهید؟")) return;
    try { localStorage.clear(); } catch { /* ignore */ }
    location.reload();
  }
  copy() {
    const text = errorLog.format(this.state.entry, { UA: navigator.userAgent, URL: location.href.split("#")[0] });
    try { navigator.clipboard.writeText(text).then(() => this.setState({ copied: true })); } catch { /* ignore */ }
  }
  render() {
    if (!this.state.err) return this.props.children;
    const { entry } = this.state;
    if (this.props.inline) {
      const b = { background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 };
      return (
        <div dir="rtl" data-testid="section-error" style={{ background: "var(--bg-card,#1e293b)", border: "1px solid #7f1d1d", borderRadius: 12, padding: 18, margin: 12, color: "var(--text-primary,#e2e8f0)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>⚠️ این بخش با خطا مواجه شد{this.props.label ? ` (${this.props.label})` : ""}</div>
          <div data-testid="error-id" style={{ display: "inline-block", direction: "ltr", background: "#450a0a", color: "#fca5a5", borderRadius: 8, padding: "2px 9px", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{entry ? `#${entry.id}` : "…"}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary,#94a3b8)", lineHeight: 1.9, marginBottom: 10 }}>بقیهٔ برنامه و داده‌های شما سالم است. جزئیات در «تنظیمات › لاگ خطاها» با همین کد قابل پیدا کردن است.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={b} onClick={() => this.setState({ err: null, entry: null, copied: false })}>تلاش دوباره</button>
            <button style={{ ...b, background: "#334155" }} data-testid="error-copy" onClick={() => this.copy()}>{this.state.copied ? "✓ کپی شد" : "کپی جزئیات"}</button>
          </div>
        </div>
      );
    }
    const st = { background: "#2563eb", color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 };
    return (
      <div dir="rtl" data-testid="error-screen" style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Tahoma,sans-serif" }}>
        <div style={{ background: "#1e293b", borderRadius: 14, padding: 24, maxWidth: 540, width: "100%" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>⚠️ برنامه با خطا مواجه شد</div>
          <div data-testid="error-id" style={{ display: "inline-block", direction: "ltr", background: "#450a0a", color: "#fca5a5", borderRadius: 8, padding: "3px 10px", fontSize: 14, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>{entry ? entry.id : "…"}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10, lineHeight: 1.9 }}>
            خطا با کد بالا در «تنظیمات › لاگ خطاها» ذخیره شد. داده‌های شما دست‌نخورده است و عملیات آفلاین در صف همگام‌سازی مانده است. هنگام تماس با پشتیبانی این کد را بگویید یا جزئیات را کپی کنید.
          </div>
          <pre dir="ltr" style={{ background: "#0f172a", borderRadius: 8, padding: 10, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 150, overflow: "auto" }}>{String(this.state.err && (this.state.err.message || this.state.err)).slice(0, 400)}</pre>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button style={st} onClick={() => location.reload()}>تلاش دوباره</button>
            <button style={{ ...st, background: "#334155" }} data-testid="error-copy" onClick={() => this.copy()}>{this.state.copied ? "✓ کپی شد" : "کپی جزئیات"}</button>
            <button style={{ ...st, background: "#166534" }} onClick={() => this.dump()}>دانلود داده‌ها</button>
            <button style={{ ...st, background: "#991b1b" }} onClick={() => this.reset()}>بازنشانی کامل</button>
          </div>
        </div>
      </div>
    );
  }
}
