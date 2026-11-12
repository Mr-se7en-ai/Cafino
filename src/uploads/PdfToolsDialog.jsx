// ابزارهای PDF/تصویر روی فایل‌های دریافتی: ادغام، تبدیل تصویر به PDF، جداسازی، چرخاندن، استخراج صفحه، فشرده‌سازی، تبدیل فرمت تصویر.
// پردازش سنگین در Web Worker (pdfClient) انجام می‌شود؛ نتیجه یا دانلود می‌شود یا به‌عنوان فایل تازه در همان سفارش/مشتری ذخیره می‌شود.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { fileKind, fetchUploadBytes, deriveUpload, saveBlob, fmtSize, MIME_OF } from "./uploadsApi.js";
import { runPdfOp } from "./pdf/pdfClient.js";
import { pdfToJpegPages } from "./pdf/pdfRender.js";
import { parseRanges } from "./pdf/pdfOps.js";
import PdfPages, { PageCanvas, usePdf } from "./PdfPages.jsx";
import { Modal, Note, smallBtn, sub, msgOf } from "./ui.jsx";

const baseName = (n) => String(n || "file").replace(/\.[^.]+$/, "");
const extOf = (n) => (/\.([A-Za-z0-9]{1,6})$/.exec(n || "")?.[1] || "").toLowerCase();
const TOOL_LABEL = { merge: "ادغام PDF", img2pdf: "تصویر به PDF", split: "جداسازی صفحه‌ها", rotate: "چرخاندن صفحه‌ها", extract: "استخراج صفحه‌ها", compress: "فشرده‌سازی", convert: "تبدیل فرمت تصویر" };

export function availableTools(files) {
  const pdfs = files.filter((f) => fileKind(f.name) === "pdf"), imgs = files.filter((f) => fileKind(f.name) === "image"), t = [];
  if (pdfs.length >= 2) t.push("merge");
  if (imgs.length >= 1) t.push("img2pdf");
  if (pdfs.length === 1) t.push("split", "rotate", "extract", "compress");
  if (imgs.length >= 1) t.push("convert");
  return t;
}

export default function PdfToolsDialog({ files, initialTool, onClose, onSaved }) {
  const tools = useMemo(() => availableTools(files), [files]);
  const [tool, setTool] = useState(initialTool && tools.includes(initialTool) ? initialTool : tools[0]);
  const [data, setData] = useState({}), [loadErr, setLoadErr] = useState("");
  const [order, setOrder] = useState(() => files.map((f) => f.id));
  const [busy, setBusy] = useState(false), [prog, setProg] = useState(0), [err, setErr] = useState(""), [results, setResults] = useState([]), [info, setInfo] = useState("");
  const [saved, setSaved] = useState({});
  useEffect(() => {
    let dead = false;
    Promise.all(files.map(async (f) => [f.id, await fetchUploadBytes(f)])).then((e) => { if (!dead) setData(Object.fromEntries(e)); }, (e) => { if (!dead) setLoadErr(msgOf(e)); });
    return () => { dead = true; };
  }, [files]);
  const ready = files.every((f) => data[f.id]);
  const byId = useMemo(() => Object.fromEntries(files.map((f) => [f.id, f])), [files]);
  const pdfs = order.map((i) => byId[i]).filter((f) => f && fileKind(f.name) === "pdf");
  const imgs = order.map((i) => byId[i]).filter((f) => f && fileKind(f.name) === "image");
  const single = pdfs[0];
  const singleBytes = single ? data[single.id] : null;
  const { pdf, error: pdfErr } = usePdf(tool && ["rotate", "extract"].includes(tool) ? singleBytes : null);
  const [rot, setRot] = useState({}), [sel, setSel] = useState(() => new Set()), [rangeTxt, setRangeTxt] = useState("");
  const [o, setO] = useState({ splitMode: "every", splitN: 1, splitRanges: "", pageSize: "a4", orientation: "auto", margin: 24, mode: "light", dpi: 110, quality: 0.6, to: "jpeg", maxSide: 0, convQ: 0.9, name: "" });
  useEffect(() => { setResults([]); setErr(""); setInfo(""); setSaved({}); }, [tool]);
  const move = (id, d) => setOrder((a) => { const i = a.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= a.length) return a; const b = a.slice(); [b[i], b[j]] = [b[j], b[i]]; return b; });
  const toggle = useCallback((n) => setSel((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; }), []);
  const applyRange = () => { try { setSel(new Set(parseRanges(rangeTxt, pdf.numPages))); setErr(""); } catch (e) { setErr(msgOf(e)); } };
  const rotatePage = (n, d) => setRot((r) => ({ ...r, [n]: (((r[n] || 0) + d) % 360 + 360) % 360 }));

  const run = async () => {
    setBusy(true); setErr(""); setInfo(""); setProg(0); setResults([]); setSaved({});
    const P = (v) => setProg(Math.min(1, Math.max(0, v)));
    try {
      const nm = (d) => (o.name.trim() ? o.name.trim().replace(/\.(pdf|jpe?g|png|webp)$/i, "") : d);
      if (tool === "merge") {
        const r = await runPdfOp("mergePdfs", { files: pdfs.map((f) => ({ name: f.name, bytes: data[f.id] })) }, { onProgress: P });
        setResults([{ name: `${nm(`${baseName(pdfs[0].name)}-ادغام`)}.pdf`, bytes: r.bytes, note: `${toFA(r.pages)} صفحه` }]);
      } else if (tool === "img2pdf") {
        const r = await runPdfOp("imagesToPdf", { images: imgs.map((f) => ({ name: f.name, bytes: data[f.id] })), pageSize: o.pageSize, margin: o.margin, orientation: o.orientation }, { onProgress: P });
        setResults([{ name: `${nm(imgs.length === 1 ? baseName(imgs[0].name) : "تصاویر")}.pdf`, bytes: r.bytes, note: `${toFA(r.pages)} صفحه` }]);
      } else if (tool === "split") {
        const r = await runPdfOp("splitPdf", { bytes: singleBytes, mode: o.splitMode, n: o.splitN, ranges: o.splitRanges, baseName: baseName(single.name) }, { onProgress: P });
        setResults(r.files.map((x) => ({ name: x.name, bytes: x.bytes, note: `${toFA(x.pages)} صفحه` })));
      } else if (tool === "rotate") {
        const rotations = Object.fromEntries(Object.entries(rot).filter(([, d]) => d));
        const r = await runPdfOp("rotatePages", { bytes: singleBytes, rotations }, { onProgress: P });
        setResults([{ name: `${nm(`${baseName(single.name)}-چرخیده`)}.pdf`, bytes: r.bytes, note: `${toFA(r.changed)} صفحه چرخید` }]);
      } else if (tool === "extract") {
        const pages = [...sel].sort((a, b) => a - b);
        const r = await runPdfOp("extractPages", { bytes: singleBytes, pages }, { onProgress: P });
        setResults([{ name: `${nm(`${baseName(single.name)}-استخراج`)}.pdf`, bytes: r.bytes, note: `${toFA(r.pages)} صفحه` }]);
      } else if (tool === "compress") {
        let r;
        if (o.mode === "light") r = await runPdfOp("compressLight", { bytes: singleBytes }, { onProgress: P });
        else {
          const pages = await pdfToJpegPages(singleBytes, { dpi: o.dpi, quality: o.quality, onProgress: (v) => P(v * 0.85) });
          const a = await runPdfOp("assembleJpegPages", { pages }, { onProgress: (v) => P(0.85 + v * 0.15) });
          r = { bytes: a.bytes, before: singleBytes.length, after: a.bytes.length };
        }
        const pct = Math.round((1 - r.after / r.before) * 100);
        setInfo(r.after < r.before ? `حجم از ${fmtSize(r.before)} به ${fmtSize(r.after)} رسید (${toFA(pct)}٪ کمتر).` : `این روش حجم را کم نکرد (${fmtSize(r.before)} → ${fmtSize(r.after)}). ${o.mode === "light" ? "برای اسکن و عکس، حالت «قوی» را امتحان کنید." : "کیفیت یا وضوح را پایین‌تر بگیرید."}`);
        if (r.after < r.before) setResults([{ name: `${nm(`${baseName(single.name)}-فشرده`)}.pdf`, bytes: r.bytes, note: `${fmtSize(r.after)}` }]);
      } else if (tool === "convert") {
        const out = [];
        for (let i = 0; i < imgs.length; i++) {
          const r = await runPdfOp("convertImage", { bytes: data[imgs[i].id], to: o.to, maxSide: Number(o.maxSide) || 0, quality: o.convQ }, { onProgress: (v) => P((i + v) / imgs.length) });
          out.push({ name: `${baseName(imgs[i].name)}.${o.to === "jpeg" ? "jpg" : o.to}`, bytes: r.bytes, note: `${fmtSize(r.before)} ← ${fmtSize(r.after)}` });
        }
        setResults(out);
      }
    } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); }
  };
  const from = (single || imgs[0] || files[0]);
  const saveBack = async (i) => {
    const r = results[i]; setSaved((s) => ({ ...s, [i]: "…" }));
    try { await deriveUpload(from, r.name, r.bytes); setSaved((s) => ({ ...s, [i]: "ok" })); onSaved?.(); } catch (e) { setSaved((s) => ({ ...s, [i]: msgOf(e) })); }
  };
  const lab = { fontSize: 12, color: "var(--text-muted)", flex: "1 1 140px" };
  const sel2 = { ...INP, marginTop: 2, padding: "5px 8px", fontSize: 12 };
  const canRun = ready && !busy && (tool !== "extract" || sel.size > 0) && (tool !== "rotate" || Object.values(rot).some(Boolean)) && (tool !== "split" || o.splitMode !== "ranges" || o.splitRanges.trim());

  return (
    <Modal title="ابزارهای PDF و تصویر" onClose={onClose} testid="up-tools" width={900}>
      <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tools.map((t) => <button key={t} role="tab" aria-selected={tool === t} data-testid={`up-tool-${t}`} onClick={() => setTool(t)} style={smallBtn(tool === t ? "#2563eb" : "var(--bg-app)", tool === t ? "#fff" : "var(--text-secondary)")}>{TOOL_LABEL[t]}</button>)}
      </div>
      {!tools.length && <Note kind="warn">برای این فایل‌ها ابزاری وجود ندارد (فقط PDF و تصویر JPG/PNG/WEBP).</Note>}
      {loadErr && <Note kind="error">{loadErr}</Note>}
      {!ready && !loadErr && <div style={sub} data-testid="up-tools-loading">در حال دریافت فایل‌ها…</div>}
      {ready && tool && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(tool === "merge" || tool === "img2pdf") && (
            <div data-testid="up-tool-order" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={sub}>ترتیب فایل‌ها (با دکمه‌ها جابه‌جا کنید):</div>
              {(tool === "merge" ? pdfs : imgs).map((f, i, arr) => (
                <div key={f.id} style={{ display: "flex", gap: 6, alignItems: "center", background: "var(--bg-app)", borderRadius: 8, padding: "4px 8px" }}>
                  <b style={{ width: 22 }}>{toFA(i + 1)}</b><span dir="ltr" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontSize: 12.5 }}>{f.name}</span>
                  <button aria-label="بالا" disabled={i === 0} onClick={() => move(f.id, -1)} style={smallBtn("var(--border)", "var(--text-secondary)", { padding: "2px 8px" })}>↑</button>
                  <button aria-label="پایین" disabled={i === arr.length - 1} onClick={() => move(f.id, 1)} style={smallBtn("var(--border)", "var(--text-secondary)", { padding: "2px 8px" })}>↓</button>
                </div>))}
            </div>)}
          {tool === "img2pdf" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={lab}>اندازهٔ صفحه<select value={o.pageSize} onChange={(e) => setO({ ...o, pageSize: e.target.value })} style={sel2}><option value="a4">A4</option><option value="a5">A5</option><option value="a3">A3</option><option value="letter">Letter</option><option value="fit">هم‌اندازهٔ تصویر</option></select></label>
              <label style={lab}>جهت<select value={o.orientation} onChange={(e) => setO({ ...o, orientation: e.target.value })} style={sel2}><option value="auto">خودکار</option><option value="portrait">عمودی</option><option value="landscape">افقی</option></select></label>
              <label style={lab}>حاشیه (پوینت)<input inputMode="numeric" value={o.margin} onChange={(e) => setO({ ...o, margin: Math.min(100, Number(String(e.target.value).replace(/\D/g, "")) || 0) })} style={sel2} /></label>
            </div>)}
          {tool === "split" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={lab}>روش<select data-testid="up-split-mode" value={o.splitMode} onChange={(e) => setO({ ...o, splitMode: e.target.value })} style={sel2}><option value="every">هر N صفحه یک فایل</option><option value="each">تک‌تک صفحه‌ها</option><option value="ranges">بازه‌های مشخص</option></select></label>
              {o.splitMode === "every" && <label style={lab}>N<input data-testid="up-split-n" inputMode="numeric" value={o.splitN} onChange={(e) => setO({ ...o, splitN: Math.max(1, Number(String(e.target.value).replace(/\D/g, "")) || 1) })} style={sel2} /></label>}
              {o.splitMode === "ranges" && <label style={{ ...lab, flex: "2 1 220px" }}>بازه‌ها (هر بازه یک فایل، مثل 1-3,4-6,7)<input data-testid="up-split-ranges" dir="ltr" value={o.splitRanges} onChange={(e) => setO({ ...o, splitRanges: e.target.value })} style={sel2} placeholder="1-3,4-6,7-" /></label>}
            </div>)}
          {tool === "rotate" && (pdfErr ? <Note kind="error">{pdfErr}</Note> : !pdf ? <div style={sub}>در حال آماده‌سازی صفحه‌ها…</div> : (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={sub}>برای هر صفحه بچرخانید، یا:</span>
                <button data-testid="up-rot-all-cw" onClick={() => setRot(Object.fromEntries(Array.from({ length: pdf.numPages }, (_, i) => [i + 1, ((rot[i + 1] || 0) + 90) % 360])))} style={smallBtn("var(--border)", "var(--text-secondary)")}>همه ۹۰° ↻</button>
                <button onClick={() => setRot({})} style={smallBtn("var(--border)", "var(--text-secondary)")}>بازنشانی</button>
              </div>
              <div style={{ maxHeight: "46vh", overflow: "auto", background: "#6b7280", borderRadius: 10, padding: 10, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((n) => (
                  <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 130, height: 150, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}><PageCanvas pdf={pdf} n={n} width={110} rotation={rot[n] || 0} /></div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <button data-testid={`up-rot-${n}`} aria-label={`چرخش صفحهٔ ${n}`} onClick={() => rotatePage(n, 90)} style={smallBtn("#2563eb", "#fff", { padding: "2px 10px" })}>↻</button>
                      <span style={{ color: "#fff", fontSize: 11 }}>{toFA(n)}{rot[n] ? ` · ${toFA(rot[n])}°` : ""}</span>
                    </div>
                  </div>))}
              </div>
            </>))}
          {tool === "extract" && (pdfErr ? <Note kind="error">{pdfErr}</Note> : !pdf ? <div style={sub}>در حال آماده‌سازی صفحه‌ها…</div> : (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input data-testid="up-extract-range" dir="ltr" value={rangeTxt} onChange={(e) => setRangeTxt(e.target.value)} placeholder="مثلاً 1-3,5,8-" style={{ ...INP, marginTop: 0, width: 180, padding: "5px 8px", fontSize: 12 }} />
                <button data-testid="up-extract-apply" onClick={applyRange} style={smallBtn("var(--border)", "var(--text-secondary)")}>انتخاب بازه</button>
                <button onClick={() => setSel(new Set(Array.from({ length: pdf.numPages }, (_, i) => i + 1)))} style={smallBtn("var(--border)", "var(--text-secondary)")}>همه</button>
                <button onClick={() => setSel(new Set())} style={smallBtn("var(--border)", "var(--text-secondary)")}>هیچ‌کدام</button>
                <span style={sub} data-testid="up-extract-count">{toFA(sel.size)} صفحه انتخاب شد</span>
              </div>
              <div style={{ maxHeight: "46vh", overflow: "auto", background: "#6b7280", borderRadius: 10, padding: 10 }}><PdfPages pdf={pdf} width={110} thumb selectable selected={sel} onToggle={toggle} /></div>
            </>))}
          {tool === "compress" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={lab}>روش<select data-testid="up-compress-mode" value={o.mode} onChange={(e) => setO({ ...o, mode: e.target.value })} style={sel2}><option value="light">سبک (متن و کیفیت دست‌نخورده)</option><option value="strong">قوی (تبدیل صفحه‌ها به تصویر؛ متن قابل انتخاب نمی‌ماند)</option></select></label>
              {o.mode === "strong" && <>
                <label style={lab}>وضوح (DPI)<select value={o.dpi} onChange={(e) => setO({ ...o, dpi: Number(e.target.value) })} style={sel2}><option value={72}>۷۲ (کم‌حجم)</option><option value={96}>۹۶</option><option value={110}>۱۱۰ (متعادل)</option><option value={150}>۱۵۰ (چاپی)</option></select></label>
                <label style={lab}>کیفیت JPEG<select value={o.quality} onChange={(e) => setO({ ...o, quality: Number(e.target.value) })} style={sel2}><option value={0.4}>پایین</option><option value={0.6}>متوسط</option><option value={0.8}>بالا</option></select></label>
              </>}
            </div>)}
          {tool === "convert" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={lab}>فرمت مقصد<select data-testid="up-convert-to" value={o.to} onChange={(e) => setO({ ...o, to: e.target.value })} style={sel2}><option value="jpeg">JPG</option><option value="png">PNG</option><option value="webp">WEBP</option></select></label>
              <label style={lab}>حداکثر ضلع (پیکسل؛ ۰ = بدون تغییر)<input inputMode="numeric" value={o.maxSide} onChange={(e) => setO({ ...o, maxSide: Math.min(10000, Number(String(e.target.value).replace(/\D/g, "")) || 0) })} style={sel2} /></label>
              <label style={lab}>کیفیت<select value={o.convQ} onChange={(e) => setO({ ...o, convQ: Number(e.target.value) })} style={sel2}><option value={0.6}>کم‌حجم</option><option value={0.8}>متوسط</option><option value={0.9}>بالا</option><option value={1}>بیشینه</option></select></label>
            </div>)}
          {tool !== "split" && tool !== "convert" && (
            <label style={{ ...lab, flex: "none" }}>نام فایل خروجی (اختیاری)<input value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} style={{ ...sel2, maxWidth: 320 }} maxLength={80} /></label>)}
          {err && <Note kind="error" data-testid="up-tool-error">{err}</Note>}
          {info && <Note kind={results.length ? "ok" : "warn"} data-testid="up-tool-info">{info}</Note>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button data-testid="up-tool-run" disabled={!canRun} onClick={run} style={BTN("#2563eb", "#fff", { opacity: canRun ? 1 : .5 })}>{busy ? `در حال پردازش… ${toFA(Math.round(prog * 100))}٪` : "اجرا"}</button>
            {busy && <div style={{ flex: "1 1 120px", height: 6, background: "var(--bg-app)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.round(prog * 100)}%`, height: "100%", background: "#2563eb", transition: "width .15s" }} /></div>}
          </div>
          {results.length > 0 && (
            <div data-testid="up-tool-results" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <b style={{ fontSize: 13 }}>خروجی ({toFA(results.length)} فایل)</b>
              {results.map((r, i) => (
                <div key={r.name + i} data-testid="up-tool-result" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "var(--bg-app)", borderRadius: 8, padding: "6px 10px" }}>
                  <span dir="ltr" style={{ flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontSize: 12.5 }}>{r.name}</span>
                  <span style={sub}>{r.note} · {fmtSize(r.bytes.length)}</span>
                  <button onClick={() => saveBlob(r.bytes, r.name, MIME_OF[extOf(r.name)])} style={smallBtn("#16a34a")}>دانلود</button>
                  <button data-testid="up-tool-save" disabled={saved[i] === "…" || saved[i] === "ok"} onClick={() => saveBack(i)} style={smallBtn("#2563eb")}>{saved[i] === "ok" ? "ذخیره شد ✓" : saved[i] === "…" ? "…" : "ذخیره کنار فایل‌های سفارش"}</button>
                  {saved[i] && saved[i] !== "ok" && saved[i] !== "…" && <Note kind="error" style={{ flex: "1 1 100%" }}>{saved[i]}</Note>}
                </div>))}
            </div>)}
        </div>)}
    </Modal>
  );
}
