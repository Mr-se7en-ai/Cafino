// پیش‌نمایش فایل دریافتی (تصویر، PDF، متن) + «پیش‌نمایش چاپ» (کاغذ، جهت، حاشیه، سیاه‌وسفید، تعداد برگ) پیش از چاپ.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BTN, INP } from "../app/core/constants.js";
import { toFA, escapeHtml } from "../app/core/format.js";
import { printFontCss, printWhenReady } from "../app/core/printFont.js";
import { uploads, fileKind, fetchUploadBytes, fmtSize, MIME_OF, saveBlob } from "./uploadsApi.js";
import { pdfToJpegPages } from "./pdf/pdfRender.js";
import PdfPages, { usePdf } from "./PdfPages.jsx";
import { Modal, Note, smallBtn, sub, msgOf } from "./ui.jsx";

const PAPERS = { a4: ["A4", 210, 297], a5: ["A5", 148, 210], a3: ["A3", 297, 420], letter: ["Letter", 216, 279] };
const ext = (n) => (/\.([A-Za-z0-9]{1,6})$/.exec(n || "")?.[1] || "").toLowerCase();
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

/** صفحه‌های قابل چاپ: [{src, w, h}] — PDF → JPEG با pdf.js، تصویر → خودش. */
async function printablePages(file, bytes, onProgress) {
  const kind = fileKind(file.name);
  if (kind === "image") return [{ src: `data:${MIME_OF[ext(file.name)] || "image/jpeg"};base64,${b64(bytes)}` }];
  if (kind === "pdf") {
    const pages = await pdfToJpegPages(bytes, { dpi: 140, quality: 0.85, onProgress });
    if (pages.length > 80) throw new Error("برای چاپ مستقیم حداکثر ۸۰ صفحه پشتیبانی می‌شود؛ ابتدا با «استخراج صفحه» بخش مورد نظر را جدا کنید.");
    return pages.map((p) => ({ src: `data:image/jpeg;base64,${b64(p.jpeg)}`, w: p.wPt, h: p.hPt }));
  }
  throw new Error("چاپ مستقیم فقط برای PDF و تصویر است");
}

export function buildPrintHtml({ title, pages, paper, orient, margin, gray, copies, fit }) {
  const [, pw, ph] = PAPERS[paper] || PAPERS.a4;
  const sheets = [];
  for (let c = 0; c < copies; c++) for (const p of pages) sheets.push(p);
  const size = orient === "auto" ? `${PAPERS[paper]?.[0] || "A4"}` : `${PAPERS[paper]?.[0] || "A4"} ${orient}`;
  const body = sheets.map((p) => {
    const land = orient === "landscape" || (orient === "auto" && p.w && p.h && p.w > p.h);
    return `<section class="s${land ? " l" : ""}"><img src="${p.src}" alt=""></section>`;
  }).join("");
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${printFontCss()}
@page{size:${orient === "auto" ? "auto" : size};margin:0}*{box-sizing:border-box}body{margin:0;background:#fff}
.s{width:${pw}mm;height:${ph}mm;padding:${margin}mm;display:flex;align-items:center;justify-content:center;page-break-after:always;break-after:page;overflow:hidden}
.s.l{width:${ph}mm;height:${pw}mm}
.s img{max-width:100%;max-height:100%;${fit === "fill" ? "width:100%;height:100%;object-fit:contain;" : ""}${gray ? "filter:grayscale(1);" : ""}}
@media screen{body{background:#888;padding:10px}.s{background:#fff;margin:0 auto 10px;box-shadow:0 2px 10px #0006}}
</style></head><body>${body}</body></html>`;
}

function PrintPreview({ file, bytes, onPrinted }) {
  const [o, setO] = useState({ paper: "a4", orient: "auto", margin: 8, gray: false, copies: 1, fit: "fit" });
  const [busy, setBusy] = useState(false), [prog, setProg] = useState(0), [err, setErr] = useState(""), [done, setDone] = useState(false);
  const kind = fileKind(file.name), isPdf = kind === "pdf";
  const { pdf, error, loading } = usePdf(isPdf ? bytes : null);
  const imgUrl = useMemo(() => (kind === "image" && bytes ? URL.createObjectURL(new Blob([bytes], { type: MIME_OF[ext(file.name)] })) : ""), [kind, bytes, file.name]);
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);
  const pages = isPdf ? pdf?.numPages || 0 : 1, [name, pw, ph] = PAPERS[o.paper];
  const landscape = o.orient === "landscape";
  const doPrint = async () => {
    setBusy(true); setErr(""); setProg(0);
    const w = window.open("", "_blank");
    if (!w) { setBusy(false); setErr("مرورگر بازکردن پنجرهٔ چاپ را مسدود کرد؛ پاپ‌آپ را مجاز کنید."); return; }
    try { w.document.write('<!doctype html><meta charset="utf-8"><title>آماده‌سازی چاپ</title><body dir="rtl" style="font-family:Tahoma,sans-serif;padding:24px">در حال آماده‌سازی صفحه‌ها برای چاپ…</body>'); w.document.close(); } catch { /* ignore */ }
    try {
      const pp = await printablePages(file, bytes, setProg);
      w.document.open(); w.document.write(buildPrintHtml({ title: file.name, pages: pp, ...o, copies: Math.max(1, o.copies) })); w.document.close(); printWhenReady(w); setDone(true);
    } catch (e) { try { w.close(); } catch { /* ignore */ } setErr(msgOf(e)); } finally { setBusy(false); }
  };
  const lab = { fontSize: 12, color: "var(--text-muted)" };
  const sel = { ...INP, marginTop: 2, padding: "5px 8px", fontSize: 12 };
  if (kind !== "pdf" && kind !== "image") return <Note kind="warn">چاپ مستقیم فقط برای PDF و تصویر ممکن است. فایل را دانلود و با برنامهٔ مناسب چاپ کنید.</Note>;
  return (
    <div data-testid="up-print" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <style>{`.up-pp canvas{width:100%!important;height:100%!important;object-fit:contain;display:block}`}</style>
      <div style={{ flex: "0 0 220px", display: "flex", flexDirection: "column", gap: 8, minWidth: 200 }}>
        <label style={lab}>کاغذ<select data-testid="up-print-paper" value={o.paper} onChange={(e) => setO({ ...o, paper: e.target.value })} style={sel}>{Object.entries(PAPERS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></label>
        <label style={lab}>جهت<select data-testid="up-print-orient" value={o.orient} onChange={(e) => setO({ ...o, orient: e.target.value })} style={sel}><option value="auto">خودکار (مطابق صفحه)</option><option value="portrait">عمودی</option><option value="landscape">افقی</option></select></label>
        <label style={lab}>حاشیه (میلی‌متر)<input inputMode="numeric" value={o.margin} onChange={(e) => setO({ ...o, margin: Math.min(30, Number(String(e.target.value).replace(/\D/g, "")) || 0) })} style={sel} /></label>
        <label style={lab}>تعداد نسخه<input data-testid="up-print-copies" inputMode="numeric" value={o.copies} onChange={(e) => setO({ ...o, copies: Math.min(50, Math.max(1, Number(String(e.target.value).replace(/\D/g, "")) || 1)) })} style={sel} /></label>
        <label style={{ ...lab, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={o.gray} onChange={(e) => setO({ ...o, gray: e.target.checked })} />سیاه‌وسفید</label>
        <label style={{ ...lab, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={o.fit === "fill"} onChange={(e) => setO({ ...o, fit: e.target.checked ? "fill" : "fit" })} />بزرگ‌نمایی تا لبهٔ کاغذ</label>
        <div data-testid="up-print-sheets" style={{ fontSize: 13, background: "var(--bg-app)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.8 }}>
          {toFA(pages)} صفحه × {toFA(o.copies)} نسخه = <b>{toFA(pages * o.copies)} برگ {name}</b>
        </div>
        {err && <Note kind="error">{err}</Note>}
        <button data-testid="up-print-go" disabled={busy || loading || !!error} onClick={doPrint} style={BTN("var(--accent,#e8590c)", "#fff", { opacity: busy ? .6 : 1 })}>{busy ? `آماده‌سازی… ${toFA(Math.round(prog * 100))}٪` : "🖨️ چاپ"}</button>
        {done && <button data-testid="up-print-mark" onClick={async () => { try { await uploads.setStatus(file.id, "printed"); onPrinted?.(); setDone(false); } catch (e) { setErr(msgOf(e)); } }} style={BTN("#7c3aed", "#fff")}>علامت «چاپ‌شده»</button>}
      </div>
      <div style={{ flex: "1 1 280px", minWidth: 0, maxHeight: "62vh", overflow: "auto", background: "#6b7280", borderRadius: 10, padding: 12, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", alignContent: "flex-start" }}>
        {error ? <Note kind="error">{error}</Note>
          : isPdf ? (loading || !pdf ? <span style={{ color: "#fff", fontSize: 12 }}>در حال آماده‌سازی…</span> : Array.from({ length: Math.min(pages, 40) }, (_, i) => i + 1).map((n) => <PaperSheet key={n} n={n} pdf={pdf} pw={landscape ? ph : pw} ph={landscape ? pw : ph} margin={o.margin} gray={o.gray} />))
          : <div className="up-pp" style={{ width: 160, aspectRatio: `${landscape ? ph : pw} / ${landscape ? pw : ph}`, background: "#fff", padding: `${(o.margin / (landscape ? ph : pw)) * 100}%`, boxShadow: "0 2px 8px #0008" }}><img src={imgUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", filter: o.gray ? "grayscale(1)" : undefined }} /></div>}
        {isPdf && pages > 40 && <span style={{ color: "#fff", fontSize: 11, width: "100%", textAlign: "center" }}>فقط ۴۰ صفحهٔ اول در پیش‌نمایش نشان داده می‌شود.</span>}
      </div>
    </div>
  );
}

function PaperSheet({ n, pdf, pw, ph, margin, gray }) {
  const cv = useRef(null), [vis, setVis] = useState(false), host = useRef(null);
  useEffect(() => { const el = host.current; if (!el || typeof IntersectionObserver === "undefined") { setVis(true); return undefined; } const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setVis(true); io.disconnect(); } }, { rootMargin: "200px" }); io.observe(el); return () => io.disconnect(); }, []);
  useEffect(() => { if (vis && cv.current) pdf.renderPage(n, cv.current, { width: 160 }).catch(() => {}); }, [vis, pdf, n]);
  const pad = `${(margin / pw) * 100}%`;
  return (
    <div ref={host} className="up-pp" data-testid="up-print-sheet" style={{ width: 160, aspectRatio: `${pw} / ${ph}`, background: "#fff", padding: pad, boxShadow: "0 2px 8px #0008", position: "relative", filter: gray ? "grayscale(1)" : undefined }}>
      <canvas ref={cv} />
      <span style={{ position: "absolute", bottom: 2, insetInlineEnd: 4, fontSize: 10, color: "#6b7280" }}>{toFA(n)}</span>
    </div>
  );
}

export default function FilePreview({ file, onClose, onChanged, startTab = "view" }) {
  const kind = fileKind(file.name);
  const [bytes, setBytes] = useState(null), [err, setErr] = useState(""), [tab, setTab] = useState(startTab);
  useEffect(() => { let dead = false; fetchUploadBytes(file).then((b) => { if (!dead) { setBytes(b); onChanged?.(); } }, (e) => { if (!dead) setErr(msgOf(e)); }); return () => { dead = true; }; }, [file.id]);
  const url = useMemo(() => (kind === "image" && bytes ? URL.createObjectURL(new Blob([bytes], { type: MIME_OF[ext(file.name)] })) : ""), [kind, bytes, file.name]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const text = useMemo(() => (kind === "text" && bytes ? new TextDecoder("utf-8").decode(bytes.subarray(0, 200000)) : ""), [kind, bytes]);
  const { pdf, error: pdfErr, loading } = usePdf(kind === "pdf" ? bytes : null);
  const canPrint = kind === "pdf" || kind === "image";
  return (
    <Modal title={file.name} onClose={onClose} testid="up-preview" width={960}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={sub}>{fmtSize(file.size)}{pdf ? ` — ${toFA(pdf.numPages)} صفحه` : ""}</span>
        {canPrint && <div style={{ marginInlineStart: "auto", display: "flex", gap: 6 }}>
          {[["view", "پیش‌نمایش"], ["print", "پیش‌نمایش چاپ"]].map(([k, l]) => <button key={k} data-testid={`up-prev-tab-${k}`} aria-pressed={tab === k} onClick={() => setTab(k)} style={smallBtn(tab === k ? "#2563eb" : "var(--bg-app)", tab === k ? "#fff" : "var(--text-secondary)")}>{l}</button>)}
          <button onClick={() => bytes && saveBlob(bytes, file.name, MIME_OF[ext(file.name)])} disabled={!bytes} style={smallBtn("#16a34a")}>دانلود</button>
        </div>}
      </div>
      {err ? <Note kind="error" data-testid="up-preview-error">{err}</Note>
        : !bytes ? <div style={sub} data-testid="up-preview-loading">در حال بارگیری…</div>
        : tab === "print" ? <PrintPreview file={file} bytes={bytes} onPrinted={onChanged} />
        : kind === "image" ? <div style={{ textAlign: "center" }}><img data-testid="up-preview-img" src={url} alt={file.name} style={{ maxWidth: "100%", maxHeight: "68vh", borderRadius: 8, background: "#fff" }} /></div>
        : kind === "pdf" ? (pdfErr ? <Note kind="error">{pdfErr}</Note> : loading || !pdf ? <div style={sub}>در حال آماده‌سازی PDF…</div> : <div style={{ background: "#6b7280", borderRadius: 10, padding: 12, maxHeight: "68vh", overflow: "auto" }}><PdfPages pdf={pdf} width={640} /></div>)
        : kind === "text" ? <pre dir="auto" data-testid="up-preview-text" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12.5, background: "var(--bg-app)", borderRadius: 8, padding: 12, maxHeight: "68vh", overflow: "auto" }}>{text}</pre>
        : <Note kind="warn">پیش‌نمایش این نوع فایل ممکن نیست؛ آن را دانلود کنید.</Note>}
    </Modal>
  );
}
