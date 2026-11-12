// Generated from App.jsx by the module split (v1.50.0). Section: reportExport
import { PRINT_FONT_FAMILY, printFontCss, printWhenReady } from "../core/printFont.js";
import { loadVendor } from "../../vendor/loader.js";
import { logActivity } from "../core/activity.js";
import { currencyLabel, displayMoney, escapeHtml, safeImgSrc, fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { BTN } from "../core/constants.js";
import { useShopInfo } from "../domain/invoiceData.js";
import { todayIso } from "../core/jalali.js";


// ══════════════════════════════════════════════════════════════════
// SHARED REPORT EXPORT (Excel + PDF) — used by every report tab
// section = {name, head:[...], rows:[[...]], money:[colIdx of rial amounts]}
// ══════════════════════════════════════════════════════════════════
export async function sectionsToExcel(title,sections,fileBase){
  const XLSX=await loadVendor("xlsx");
  const wb=XLSX.utils.book_new();
  const used=new Set();
  const list=sections.filter(s=>s&&s.head);
  (list.length?list:[{name:"گزارش",head:["نتیجه"],rows:[["داده‌ای وجود ندارد"]]}]).forEach((s,i)=>{
    const headers=s.head.map(h=>typeof h==="string"?h.replace(/ریال/g,currencyLabel()):h);
    const rows=s.rows.map(row=>row.map((v,k)=>s.money&&s.money.includes(k)&&typeof v==="number"?displayMoney(v):v));
    const ws=XLSX.utils.aoa_to_sheet([[title],[`تاریخ: ${jalaliLabel(todayIso())}`],[],headers,...(rows.length?rows:[["موردی وجود ندارد"]])]);
    ws["!views"]=[{RTL:true}];ws["!cols"]=s.head.map((h,k)=>({wch:Math.max(14,Math.min(34,String(h).length+4,k===1?28:99))}));
    let nm=String(s.name).replace(/[\\/?*[\]:]/g,"").slice(0,28)||`شیت ${i+1}`;if(used.has(nm))nm=nm.slice(0,25)+" "+(i+1);used.add(nm);
    XLSX.utils.book_append_sheet(wb,ws,nm);
  });
  XLSX.writeFile(wb,`${fileBase}-${todayIso()}.xlsx`);
  logActivity("خروجی اکسل گزارش",title);
}

export function sectionsToHtml(title,sections,shop,kpis){
  const cell=(s,c,i)=>typeof c==="number"?(s.money&&s.money.includes(i)?fmtM(c):toFA(Math.round(c*100)/100)):escapeHtml(c==null?"":c);
  const tbl=(s)=>`<h3>${escapeHtml(s.name)}</h3>${s.rows.length?`<table><thead><tr>${s.head.map(h=>`<th>${escapeHtml(typeof h==="string"?h.replace(/ریال/g,currencyLabel()):h)}</th>`).join("")}</tr></thead><tbody>${s.rows.map(r=>`<tr>${r.map((c,i)=>`<td>${cell(s,c,i)}</td>`).join("")}</tr>`).join("")}</tbody></table>`:`<div class="empty">موردی وجود ندارد</div>`}`;
  return `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
${printFontCss()}    body{font-family:${PRINT_FONT_FAMILY};color:#1e293b;padding:24px;}
    h1{font-size:18px;margin:0 0 4px} h3{font-size:14px;margin:20px 0 6px} .sub{font-size:12px;color:#64748b;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px} th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right} th{background:#f1f5f9}
    .kpis{display:flex;gap:8px;margin:12px 0}.kpi{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:10px;text-align:center}.kpi .l{font-size:11px;color:#64748b}.kpi .v{font-size:14px;font-weight:700;margin-top:4px}
    .empty{font-size:12px;color:#64748b;padding:8px 0} tr{page-break-inside:avoid}
  </style></head><body>
    <div style="display:flex;align-items:center;gap:12px">${safeImgSrc(shop&&shop.logo)?`<img src="${safeImgSrc(shop.logo)}" style="width:48px;height:48px;object-fit:contain">`:""}<h1>${escapeHtml(title)} — ${escapeHtml((shop&&shop.name)||"کافینو | CAFINO")}</h1></div>
    <div class="sub">تاریخ تهیه: ${jalaliLabel(todayIso())}</div>
    ${kpis&&kpis.length?`<div class="kpis">${kpis.map(([l,v])=>`<div class="kpi"><div class="l">${escapeHtml(l)}</div><div class="v">${escapeHtml(v)}</div></div>`).join("")}</div>`:""}
    ${sections.filter(s=>s&&s.head).map(tbl).join("")}</body></html>`;
}

export function ExportBar({title,fileBase,sections,kpis}){
  const [shop]=useShopInfo();
  const secs=(sections||[]).filter(s=>s&&s.head);
  const pdf=()=>{
    const w=window.open("","_blank");
    if(!w){alert("مرورگر بازکردن پنجره‌ی جدید را مسدود کرد. لطفاً پاپ‌آپ را برای این سایت مجاز کنید.");return;}
    w.document.write(sectionsToHtml(title,secs,shop,kpis));w.document.close();
    printWhenReady(w);
  };
  return(
    <div data-testid="export-bar" style={{display:"flex",gap:8,justifyContent:"flex-end",marginBottom:12,flexWrap:"wrap"}}>
      <button onClick={()=>sectionsToExcel(title,secs,fileBase)} data-testid="export-excel" style={{...BTN("#166534"),padding:"7px 14px",fontSize:12}}>📗 خروجی اکسل</button>
      <button onClick={pdf} data-testid="export-pdf" style={{...BTN("#b91c1c"),padding:"7px 14px",fontSize:12}}>📕 خروجی PDF / چاپ</button>
    </div>
  );
}
