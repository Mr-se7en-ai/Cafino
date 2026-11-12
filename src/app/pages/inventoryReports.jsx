// Generated from App.jsx by the module split (v1.50.0). Section: inventoryReports
import { PRINT_FONT_FAMILY, printFontCss, printWhenReady } from "../core/printFont.js";
import React, { useState, useEffect, useRef } from "react";
import { loadVendor } from "../../vendor/loader.js";
import { logActivity } from "../core/activity.js";
import { escapeHtml, safeImgSrc, fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { BTN, DEFAULT_INVENTORY, INV_PERIODS, INV_STORAGE, INV_STORAGE_KEY } from "../core/constants.js";
import { isoDaysAgo } from "./dashboard.jsx";
import { getInvCats } from "./inventory.jsx";
import { useShopInfo } from "../domain/invoiceData.js";
import { todayIso } from "../core/jalali.js";
import { getSales, lsRead, useDataSync } from "../domain/sales.jsx";


// ══════════════════════════════════════════════════════════════════
// INVENTORY REPORTS (گزارش انبار) — on-screen tables + Excel / PDF export
// ══════════════════════════════════════════════════════════════════
export function buildInventoryReport(period){
  const items=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
  const cats=getInvCats();
  const catLabel=(k)=>{const c=cats.find(x=>x.key===k);return c?`${c.icon} ${c.label}`:"—";};
  const status=(i)=>Number(i.qty)<=0?"تمام‌شده":Number(i.qty)<=Number(i.minQty)?"رو به اتمام":"کافی";
  const stock=items.map(i=>({id:i.id,cat:catLabel(i.cat),name:i.name,qty:Number(i.qty)||0,unit:i.unit||"",minQty:Number(i.minQty)||0,status:status(i),unitCost:Number(i.unitCost)||0,salePrice:Number(i.salePrice)||0,value:(Number(i.qty)||0)*(Number(i.unitCost)||0),saleValue:(Number(i.qty)||0)*(Number(i.salePrice)||0)}));
  const low=stock.filter(r=>r.status!=="کافی").map(r=>({...r,need:Math.max(0,r.minQty*2-r.qty)}));
  const cutoff=period==="all"?"":isoDaysAgo(Number(period));
  const usage={};
  getSales().forEach(s=>{
    if(s.cancelled||(cutoff&&(s.date||"")<cutoff))return;
    (s.stockUsed||[]).forEach(u=>{const o=usage[u.itemId]||(usage[u.itemId]={qty:0,auto:0,sales:new Set(),revenue:0});o.qty+=Number(u.qty)||0;if(u.auto)o.auto+=Number(u.qty)||0;o.sales.add(s.id);});
    (s.lines||[]).forEach(l=>{if(l.stockId){const o=usage[l.stockId]||(usage[l.stockId]={qty:0,auto:0,sales:new Set(),revenue:0});o.revenue+=(Number(l.qty)||0)*(Number(l.price)||0);}});
  });
  lsRead(INV_STORAGE,[]).filter(iv=>!iv.saleId&&iv.status!=="draft"&&(!cutoff||(iv.date||"")>=cutoff)).forEach(iv=>{
    (iv.stockUsed||[]).forEach(u=>{const o=usage[u.itemId]||(usage[u.itemId]={qty:0,auto:0,sales:new Set(),revenue:0});o.qty+=Number(u.qty)||0;o.sales.add(iv.id);});
    (iv.items||[]).forEach(l=>{if(l.stockId){const o=usage[l.stockId]||(usage[l.stockId]={qty:0,auto:0,sales:new Set(),revenue:0});o.revenue+=(Number(l.qty)||0)*(Number(l.price)||0);}});
  });
  const use=Object.keys(usage).map(id=>{const it=items.find(x=>String(x.id)===String(id));if(!it)return null;const o=usage[id];return{cat:catLabel(it.cat),name:it.name,unit:it.unit||"",qty:Math.round(o.qty*100)/100,auto:Math.round(o.auto*100)/100,sales:o.sales.size,cost:o.qty*(Number(it.unitCost)||0),revenue:o.revenue,left:Number(it.qty)||0};}).filter(Boolean).sort((a,b)=>b.qty-a.qty);
  const byCat=cats.map(c=>{const r=stock.filter(x=>x.cat===catLabel(c.key));return{cat:catLabel(c.key),n:r.length,low:r.filter(x=>x.status!=="کافی").length,value:r.reduce((s,x)=>s+x.value,0),saleValue:r.reduce((s,x)=>s+x.saleValue,0)};}).filter(r=>r.n>0);
  const totals={n:stock.length,low:low.length,out:stock.filter(r=>r.status==="تمام‌شده").length,value:stock.reduce((s,r)=>s+r.value,0),saleValue:stock.reduce((s,r)=>s+r.saleValue,0),useCost:use.reduce((s,r)=>s+r.cost,0)};
  return{stock,low,use,byCat,totals};
}

export function inventorySections(d,periodLabel){
  return[
    {name:"موجودی کالاها",head:["دسته","کالا","موجودی","واحد","حد هشدار","وضعیت","بهای واحد (ریال)","ارزش موجودی (ریال)","قیمت فروش واحد (ریال)"],rows:d.stock.map(r=>[r.cat,r.name,r.qty,r.unit,r.minQty,r.status,r.unitCost,r.value,r.salePrice]),money:[6,7,8]},
    {name:"کمبود موجودی",head:["دسته","کالا","موجودی","واحد","حد هشدار","وضعیت","مقدار پیشنهادی خرید"],rows:d.low.map(r=>[r.cat,r.name,r.qty,r.unit,r.minQty,r.status,r.need]),money:[]},
    {name:"مصرف و فروش ("+periodLabel+")",head:["دسته","کالا","مقدار مصرف/فروش","واحد","مصرف خودکار","تعداد فروش","هزینه مصرف (ریال)","درآمد فروش مستقیم (ریال)","موجودی فعلی"],rows:d.use.map(r=>[r.cat,r.name,r.qty,r.unit,r.auto,r.sales,r.cost,r.revenue,r.left]),money:[6,7]},
    {name:"خلاصه دسته‌ها",head:["دسته","تعداد قلم","رو به اتمام/تمام‌شده","ارزش موجودی (ریال)","ارزش فروش بالقوه (ریال)"],rows:d.byCat.map(r=>[r.cat,r.n,r.low,r.value,r.saleValue]),money:[3,4]},
  ];
}

export function InventoryReportView(){
  const [period,setPeriod]=useState("30");
  const [shop]=useShopInfo();
  const [,setTick]=useState(0);
  useDataSync(()=>setTick(t=>t+1));
  const d=buildInventoryReport(period);
  const periodLabel=(INV_PERIODS.find(p=>p[0]===period)||[])[1];
  const secs=inventorySections(d,periodLabel);
  const statusColor={"کافی":"#4ade80","رو به اتمام":"#fbbf24","تمام‌شده":"#f87171"};
  const exportExcel=async()=>{
    const XLSX=await loadVendor("xlsx");
    const wb=XLSX.utils.book_new();
    const head=[[`گزارش انبار — ${(shop&&shop.name)||"کافی‌نت"}`],[`تاریخ: ${jalaliLabel(todayIso())}`],[`ارزش موجودی: ${d.totals.value} ریال | رو به اتمام/تمام‌شده: ${d.totals.low} از ${d.totals.n} قلم`],[]];
    secs.forEach(s=>{
      const ws=XLSX.utils.aoa_to_sheet([...head,s.head,...s.rows]);
      ws["!views"]=[{RTL:true}];ws["!cols"]=s.head.map((h,i)=>({wch:i===1?28:Math.max(12,String(h).length+2)}));
      XLSX.utils.book_append_sheet(wb,ws,s.name.replace(/[\\/?*[\]:]/g,"").slice(0,31));
    });
    XLSX.writeFile(wb,`inventory-report-${todayIso()}.xlsx`);
    logActivity("خروجی اکسل گزارش انبار","");
  };
  const buildHtml=()=>{
    const tbl=(s)=>`<h3>${escapeHtml(s.name)}</h3>${s.rows.length?`<table><thead><tr>${s.head.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${s.rows.map(r=>`<tr>${r.map((c,i)=>`<td>${typeof c==="number"?(s.money.includes(i)?fmtM(c):toFA(Math.round(c*100)/100)):escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`:`<div class="empty">موردی وجود ندارد</div>`}`;
    return `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>گزارش انبار</title><style>
${printFontCss()}      body{font-family:${PRINT_FONT_FAMILY};color:#1e293b;padding:24px;}
      h1{font-size:18px;margin:0 0 4px} h3{font-size:14px;margin:20px 0 6px} .sub{font-size:12px;color:#64748b;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px} th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right} th{background:#f1f5f9}
      .kpis{display:flex;gap:8px;margin:12px 0}.kpi{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:10px;text-align:center}.kpi .l{font-size:11px;color:#64748b}.kpi .v{font-size:14px;font-weight:700;margin-top:4px}
      .empty{font-size:12px;color:#64748b;padding:8px 0} tr{page-break-inside:avoid}
    </style></head><body>
      <div style="display:flex;align-items:center;gap:12px">${safeImgSrc(shop&&shop.logo)?`<img src="${safeImgSrc(shop.logo)}" style="width:48px;height:48px;object-fit:contain">`:""}<h1>گزارش انبار — ${escapeHtml((shop&&shop.name)||"کافینو | CAFINO")}</h1></div>
      <div class="sub">تاریخ تهیه: ${jalaliLabel(todayIso())} · بازه مصرف: ${escapeHtml(periodLabel)}</div>
      <div class="kpis"><div class="kpi"><div class="l">تعداد اقلام</div><div class="v">${toFA(d.totals.n)}</div></div><div class="kpi"><div class="l">رو به اتمام / تمام‌شده</div><div class="v" style="color:#dc2626">${toFA(d.totals.low)}</div></div><div class="kpi"><div class="l">ارزش موجودی</div><div class="v">${fmtM(d.totals.value)}</div></div><div class="kpi"><div class="l">ارزش فروش بالقوه</div><div class="v">${fmtM(d.totals.saleValue)}</div></div></div>
      ${secs.map(tbl).join("")}</body></html>`;
  };
  const printPdf=()=>{
    const w=window.open("","_blank");
    if(!w){alert("مرورگر بازکردن پنجره‌ی جدید را مسدود کرد. لطفاً پاپ‌آپ را برای این سایت مجاز کنید.");return;}
    w.document.write(buildHtml());w.document.close();
    printWhenReady(w);
  };
  const kpi=(l,v,c)=><div style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>{l}</div><div style={{fontSize:16,fontWeight:800,marginTop:4,color:c||"var(--text-primary)"}}>{v}</div></div>;
  const table=(s,render)=>(
    <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>{s.name} <span style={{fontSize:11,color:"var(--text-muted)"}}>({toFA(s.rows.length)})</span></div>
      {s.rows.length===0?<div style={{fontSize:12,color:"var(--text-dim)",padding:"10px 0"}}>موردی وجود ندارد</div>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:560}}>
        <thead><tr>{s.head.map(h=><th key={h} style={{textAlign:"right",padding:"7px 8px",borderBottom:"1px solid var(--border)",color:"var(--text-muted)",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
        <tbody>{s.rows.map((r,ri)=><tr key={ri}>{r.map((c,i)=><td key={i} style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap",color:statusColor[c]||"var(--text-primary)",fontWeight:statusColor[c]?700:400}}>{typeof c==="number"?(s.money.includes(i)?fmtM(c):toFA(Math.round(c*100)/100)):c}</td>)}</tr>)}</tbody>
      </table></div>}
    </div>);
  return(
    <div data-testid="inv-report">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {INV_PERIODS.map(([k,l])=><button key={k} onClick={()=>setPeriod(k)} style={{...BTN(period===k?"#2563eb":"var(--bg-card)",period===k?"#fff":"var(--text-secondary)"),padding:"7px 12px",fontSize:12}}>{l}</button>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportExcel} data-testid="export-excel" style={{...BTN("#166534"),padding:"8px 14px",fontSize:12}}>📗 خروجی اکسل</button>
          <button onClick={printPdf} data-testid="export-pdf" style={{...BTN("#b91c1c"),padding:"8px 14px",fontSize:12}}>📕 خروجی PDF / چاپ</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:14}}>
        {kpi("تعداد اقلام",toFA(d.totals.n))}
        {kpi("رو به اتمام / تمام‌شده",`${toFA(d.totals.low)} (${toFA(d.totals.out)} تمام‌شده)`,d.totals.low?"#f87171":"#4ade80")}
        {kpi("ارزش موجودی (بهای تمام‌شده)",fmtM(d.totals.value))}
        {kpi("ارزش فروش بالقوه",fmtM(d.totals.saleValue),"#60a5fa")}
        {kpi("هزینه مصرف در بازه",fmtM(d.totals.useCost),"#fbbf24")}
      </div>
      {secs.map(s=><div key={s.name}>{table(s)}</div>)}
      <div style={{fontSize:11,color:"var(--text-dim)",lineHeight:1.9}}>ارزش موجودی بر اساس «بهای واحد» ثبت‌شده هر کالا محاسبه می‌شود. مصرف و فروش از فروش‌های ثبت‌شده (شامل کسر خودکار مواد مصرفی) ساخته می‌شود.</div>
    </div>
  );
}
