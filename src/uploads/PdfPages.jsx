// نمایش صفحه‌های یک PDF باز‌شده با pdf.js: رندر تنبل (فقط صفحه‌های نزدیک دید)، انتخاب صفحه، چرخش پیش‌نمایشی.
import React, { useEffect, useRef, useState } from "react";
import { openPdf } from "./pdf/pdfRender.js";
import { toFA } from "../app/core/format.js";

/** باز می‌کند و در پایان آزاد می‌کند. {pdf, error, loading} */
export function usePdf(bytes) {
  const [st, setSt] = useState({ pdf: null, error: "", loading: !!bytes });
  useEffect(() => {
    if (!bytes) { setSt({ pdf: null, error: "", loading: false }); return undefined; }
    let dead = false, doc = null; setSt({ pdf: null, error: "", loading: true });
    openPdf(bytes).then((p) => { if (dead) p.destroy(); else { doc = p; setSt({ pdf: p, error: "", loading: false }); } }, (e) => { if (!dead) setSt({ pdf: null, error: e?.message || "PDF خوانده نشد", loading: false }); });
    return () => { dead = true; doc?.destroy(); };
  }, [bytes]);
  return st;
}

export function PageCanvas({ pdf, n, width, rotation = 0, onSize }) {
  const host = useRef(null), cv = useRef(null), [vis, setVis] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState(false);
  useEffect(() => {
    const el = host.current; if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") { setVis(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVis(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!vis || !cv.current) return undefined;
    let dead = false;
    pdf.renderPage(n, cv.current, { width }).then((s) => { if (!dead) { setDone(true); onSize?.(n, s); } }, () => { if (!dead) setErr(true); });
    return () => { dead = true; };
  }, [vis, pdf, n, width, onSize]);
  return (
    <div ref={host} style={{ minHeight: done ? 0 : width * 1.3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {err ? <span style={{ fontSize: 11, color: "#f87171" }}>خطا</span> : <canvas ref={cv} data-testid="up-pdf-canvas" style={{ background: "#fff", maxWidth: "100%", transform: rotation ? `rotate(${rotation}deg)` : undefined, transition: "transform .2s", boxShadow: "0 1px 6px #0006" }} />}
    </div>
  );
}

/** props: pdf، width، selectable+selected(Set)+onToggle، rotations({n:deg})، columns */
export default function PdfPages({ pdf, width = 560, selectable = false, selected, onToggle, rotations, thumb = false }) {
  const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  return (
    <div data-testid="up-pdf-pages" style={{ display: "flex", flexWrap: "wrap", gap: thumb ? 10 : 14, justifyContent: "center" }}>
      {pages.map((n) => {
        const on = selected?.has(n), r = rotations?.[n] || 0;
        const body = <PageCanvas pdf={pdf} n={n} width={width} rotation={r} />;
        return (
          <div key={n} data-testid="up-pdf-page" data-page={n} style={{ width: thumb ? width + 12 : "100%", maxWidth: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {selectable
              ? <button type="button" aria-pressed={!!on} aria-label={`صفحهٔ ${n}`} onClick={() => onToggle?.(n)} style={{ all: "unset", cursor: "pointer", padding: 4, borderRadius: 8, outline: on ? "3px solid #2563eb" : "1px solid var(--border)", background: on ? "#2563eb22" : "transparent", maxWidth: "100%" }}>{body}</button>
              : body}
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>صفحهٔ {toFA(n)}{on ? " ✓" : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
