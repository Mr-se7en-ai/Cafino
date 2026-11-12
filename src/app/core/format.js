// Generated from App.jsx by the module split (v1.50.0). Section: format
import { CURRENCY_KEY } from "./constants.js";
import { todayIso } from "./jalali.js";


// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════
export function toFA(n){return String(n).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]);}

export function getCurrencyUnit(){try{return localStorage.getItem(CURRENCY_KEY)==="toman"?"toman":"rial";}catch{return"rial";}}

export function currencyLabel(){return getCurrencyUnit()==="toman"?"تومان":"ریال";}

export function displayMoney(n){const v=Number(n)||0;return getCurrencyUnit()==="toman"?v/10:v;}

export function fmtM(n){return toFA(Number(displayMoney(n).toFixed(0)).toLocaleString("fa-IR"))+" "+currencyLabel();}

// Escapes user-typed text before it's interpolated into a raw HTML string
// (used for print/export views built via document.write, which bypass React's
// automatic escaping). Prevents broken layout or markup injection from names,
// notes, or shop info that happen to contain HTML-special characters.
export function escapeHtml(str){
  if(str==null)return "";
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

// Only raster data-URLs are allowed as an <img src> inside generated print HTML (SVG is fine inside <img>: it cannot run script there; no quote breakout).
export function safeImgSrc(v){
  const s=String(v||"");
  return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s)?s:"";
}

export function fmtCompact(n){
  const v=displayMoney(n);
  if(v>=1000000)return toFA((Math.round(v/100000)/10))+" م";
  if(v>=1000)return toFA(Math.round(v/1000))+" ه";
  return toFA(v);
}

// ── Shared date-reminder status (overdue / soon / future) ──
export function dateReminderStatus(dateStr){
  if(!dateStr)return null;
  const today=todayIso();
  if(dateStr<today)return "overdue";
  const soonLimit=new Date(); soonLimit.setDate(soonLimit.getDate()+7);
  if(dateStr<=soonLimit.toISOString().split("T")[0])return "soon";
  return "future";
}
