// فونت Vazirmatn برای پنجره‌های چاپ/PDF (about:blank). این پنجره‌ها استایل صفحهٔ اصلی را ندارند، پس @font-face باید داخل خود سند باشد.
// منبع: قاعده‌های @font-face همین صفحه (در نسخهٔ standalone داده‌ها data: هستند)؛ در حالت عادی آدرس نسبی به مطلق تبدیل
// و در پس‌زمینه به data: تبدیل و کش می‌شود تا در پنجرهٔ چاپ بدون درخواست شبکه و بدون وابستگی به مسیر بارگذاری شود.
export const PRINT_FONT_FAMILY = "'Vazirmatn','Segoe UI',Tahoma,sans-serif";
const WEIGHTS = [400, 700, 800, 900];
let cached = null;      // CSS نهایی با data:
let warming = null;

function pageFaces() {
  const out = [];
  try {
    for (const sh of Array.from(document.styleSheets)) {
      let rules; try { rules = sh.cssRules; } catch { continue; }
      for (const r of Array.from(rules || [])) {
        if (r.constructor && r.constructor.name !== "CSSFontFaceRule" && r.type !== 5) continue;
        const fam = (r.style.getPropertyValue("font-family") || "").replace(/["']/g, "").trim();
        if (fam !== "Vazirmatn") continue;
        const src = r.style.getPropertyValue("src") || "";
        const m = /url\((['"]?)(.*?)\1\)/.exec(src); if (!m) continue;
        out.push({ url: m[2], weight: Number(r.style.getPropertyValue("font-weight")) || 400 });
      }
    }
  } catch { /* بدون DOM (آزمون) */ }
  return out;
}
const absolute = (u) => { if (/^(data:|blob:|https?:|file:)/i.test(u)) return u; try { return new URL(u, document.baseURI).href; } catch { return u; } };
const css = (faces) => faces.map((f) => `@font-face{font-family:'Vazirmatn';src:url('${f.url}') format('woff2');font-weight:${f.weight};font-style:normal;font-display:block;}`).join("\n");

/** CSS آمادهٔ درج در سند چاپ (همگام). اگر کش آماده نباشد، آدرس مطلق همان فایل‌ها را می‌دهد. */
export function printFontCss() {
  if (cached) return cached;
  const faces = pageFaces().map((f) => ({ ...f, url: absolute(f.url) }));
  return faces.length ? css(faces) : "";
}

const toDataUrl = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
/** یک‌بار در پس‌زمینه: فایل‌های فونت را به data: تبدیل و کش می‌کند (بی‌صدا شکست می‌خورد). */
export function warmPrintFont() {
  if (cached) return Promise.resolve(true);
  if (warming) return warming;
  warming = (async () => {
    const faces = pageFaces(); if (!faces.length) return false;
    const done = [];
    for (const f of faces) {
      if (/^data:/i.test(f.url)) { done.push(f); continue; }
      const r = await fetch(absolute(f.url)); if (!r.ok) throw new Error("font " + r.status);
      done.push({ ...f, url: await toDataUrl(await r.blob()) });
    }
    cached = css(done); return true;
  })().catch(() => false).finally(() => { warming = null; });
  return warming;
}

/** چاپ را تا آماده شدن فونت‌های پنجره به تأخیر می‌اندازد (سقف ۳ ثانیه) */
export function printWhenReady(w) {
  const go = () => {
    try {
      w.focus();
      const f = w.document.fonts;
      const print = () => { try { w.print(); } catch { /* بسته شده */ } };
      if (!f || !f.load) { print(); return; }
      const loads = Promise.all(WEIGHTS.map((wt) => f.load(`${wt} 14px Vazirmatn`).catch(() => null))).then(() => f.ready);
      Promise.race([loads, new Promise((r) => setTimeout(r, 3000))]).then(print, print);
    } catch { /* پنجره بسته شد */ }
  };
  try { if (w.document.readyState === "complete") go(); else w.onload = go; } catch { /* ignore */ }
}
