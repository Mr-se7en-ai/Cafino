// Generated from App.jsx by the module split (v1.50.0). Section: reports
import { PRINT_FONT_FAMILY, printFontCss, printWhenReady } from "../core/printFont.js";
import React, { useState, useEffect, useRef } from "react";
import { loadVendor } from "../../vendor/loader.js";
import { escapeHtml, safeImgSrc, fmtM, toFA } from "../core/format.js";
import { isoToJKey, jalaliLabel } from "../domain/backup.js";
import { BizReports } from "./bizReports.jsx";
import { BarChart, LineChart } from "../components/charts.jsx";
import { BTN, INP, JM, isRealCashTx, txMethod } from "../core/constants.js";
import { JalaliPicker, SearchableSelect } from "../components/controls.jsx";
import { InventoryReportView, buildInventoryReport, inventorySections } from "./inventoryReports.jsx";
import { todayIso } from "../core/jalali.js";
import { RegisterHistory } from "./pos.jsx";
import { ExportBar } from "../components/reportExport.jsx";
import { MethodSummary, financeOf, getSales, methodSummary, payLabel } from "../domain/sales.jsx";
import { RealProfitReport } from "../domain/topup.jsx";
import { CatCard, Empty, KPI } from "../components/ui.jsx";
import { VoidedReport } from "../domain/voids.jsx";
import GeneralLedger from "../../gl/GeneralLedger.jsx";
import { OnlineReport } from "./onlineReport.jsx";


export function ReportSection({transactions,categories,reportMode,setReportMode,srchDateFrom,setSrchDateFrom,srchDateTo,setSrchDateTo,srchCat,setSrchCat,srchType,setSrchType,shop}){
  const [activeReport,setActiveReport]=useState("general"); // general | topServices | topDays | expenses | debtors

  // ── Shared filter logic ──
  const filteredTx=transactions.filter(t=>{
    if(srchType!=="all"&&t.type!==srchType)return false;
    if(srchCat!=="all"&&t.category!==srchCat)return false;
    if(srchDateFrom&&t.date<srchDateFrom)return false;
    if(srchDateTo&&t.date>srchDateTo)return false;
    return true;
  });
  const inRange=d=>!((srchDateFrom&&d<srchDateFrom)||(srchDateTo&&d>srchDateTo));
  const allSalesRep=getSales();
  const finTotal=financeOf(inRange,transactions,allSalesRep);
  const filteredIncome=finTotal.revenue;
  const filteredExpense=finTotal.direct+finTotal.operating;
  const filteredProfit=finTotal.net;
  const finOfKey=key=>financeOf(d=>inRange(d)&&isoToJKey(d,reportMode)===key,transactions,allSalesRep);

  const groups={};
  filteredTx.forEach(t=>{const k=isoToJKey(t.date,reportMode);if(!groups[k])groups[k]=[];groups[k].push(t);});
  const keySet=new Set(Object.keys(groups));
  allSalesRep.filter(x=>!x.cancelled&&inRange(x.date)).forEach(x=>keySet.add(isoToJKey(x.date,reportMode)));
  transactions.filter(t=>inRange(t.date)).forEach(t=>keySet.add(isoToJKey(t.date,reportMode)));
  const groupKeys=[...keySet].sort().reverse();
  const groupLabel=(key)=>{
    if(reportMode==="daily"){const[jy,jm,jd]=key.split("-").map(Number);return`${toFA(jd)} ${JM[jm-1]} ${toFA(jy)}`;}
    if(reportMode==="monthly"){const[jy,jm]=key.split("-").map(Number);return`${JM[jm-1]} ${toFA(jy)}`;}
    return`سال ${toFA(key)}`;
  };
  const reportChartData=groupKeys.slice().reverse().map(key=>{const f=finOfKey(key);return{label:groupLabel(key).split(" ")[0],income:f.revenue,expense:f.direct+f.operating};});
  const filtCatIncome={},filtCatExpense={};
  filteredTx.forEach(t=>{if(t.type==="income")filtCatIncome[t.category]=(filtCatIncome[t.category]||0)+Number(t.amount);else filtCatExpense[t.category]=(filtCatExpense[t.category]||0)+Number(t.amount);});

  // ── Top Services ──
  const serviceMap={};
  transactions.filter(t=>t.type==="income").forEach(t=>{
    if(!serviceMap[t.category])serviceMap[t.category]={count:0,total:0};
    serviceMap[t.category].count++;
    serviceMap[t.category].total+=Number(t.amount);
  });
  const topServices=Object.entries(serviceMap).sort((a,b)=>b[1].total-a[1].total).slice(0,15);
  const maxSvcTotal=topServices[0]?.[1]?.total||1;

  // ── Top Days & Months ──
  const dayMap={},monthMap={};
  transactions.filter(t=>t.type==="income").forEach(t=>{
    const dk=isoToJKey(t.date,"daily");
    const mk=isoToJKey(t.date,"monthly");
    dayMap[dk]=(dayMap[dk]||0)+Number(t.amount);
    monthMap[mk]=(monthMap[mk]||0)+Number(t.amount);
  });
  const topDays=Object.entries(dayMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const topMonths=Object.entries(monthMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const maxDay=topDays[0]?.[1]||1;
  const maxMonth=topMonths[0]?.[1]||1;

  // ── Expense Report ──
  const expByCat={};
  transactions.filter(t=>t.type==="expense").forEach(t=>{
    if(!expByCat[t.category])expByCat[t.category]={count:0,total:0};
    expByCat[t.category].count++;
    expByCat[t.category].total+=Number(t.amount);
  });
  const topExpenses=Object.entries(expByCat).sort((a,b)=>b[1].total-a[1].total);
  const totalAllExp=transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);

  // Monthly expense trend
  const expMonthMap={};
  transactions.filter(t=>t.type==="expense").forEach(t=>{
    const mk=isoToJKey(t.date,"monthly");
    expMonthMap[mk]=(expMonthMap[mk]||0)+Number(t.amount);
  });
  const expMonthData=Object.entries(expMonthMap).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);

  // ── Debtors (from ledger) ──
  const ledgerAccounts=JSON.parse(localStorage.getItem("cafenet_ledger2")||"[]");
  const customers=JSON.parse(localStorage.getItem("cafenet_customers")||"[]");
  const debtors=ledgerAccounts.map(a=>{
    const total=a.entries.reduce((s,e)=>s+Number(e.amount||0),0);
    let name="ناشناس";
    if(a.customerId){const c=customers.find(c=>c.id===a.customerId);if(c)name=`${c.firstName} ${c.lastName}`;}
    else name=`${a.firstName||""} ${a.lastName||""}`.trim()||"ناشناس";
    const lastEntry=a.entries.length>0?[...a.entries].sort((x,y)=>y.date.localeCompare(x.date))[0]:null;
    return{id:a.id,name,phone:a.customerId?(customers.find(c=>c.id===a.customerId)?.phone||""):(a.phone||""),total,entries:a.entries.length,lastDate:lastEntry?.lastDate||lastEntry?.date||""};
  }).filter(d=>d.total>0).sort((a,b)=>b.total-a.total);

  const REPORT_TABS=[
    {key:"general",icon:"📋",label:"گزارش کلی"},
    {key:"topServices",icon:"🏆",label:"پرفروش‌ترین خدمات"},
    {key:"topDays",icon:"📅",label:"بیشترین درآمد روزها/ماه‌ها"},
    {key:"expenses",icon:"💸",label:"گزارش هزینه‌ها"},
    {key:"debtors",icon:"⚠️",label:"مشتریان بدهکار"},
    {key:"inventory",icon:"📦",label:"گزارش انبار"},
    {key:"online",icon:"🛒",label:"فروش آنلاین"},
    {key:"realprofit",icon:"💰",label:"سود واقعی (خرید و فروش)"},
    {key:"register",icon:"🧮",label:"صندوق (بستن روزانه)"},
    {key:"gl",icon:"📒",label:"دفتر کل و مغایرت‌گیری"},
    {key:"voided",icon:"🚫",label:"ابطال‌شده‌ها"},
    {key:"biz",icon:"🎯",label:"گزارش‌های کاربردی و سربه‌سر"},
  ];

  const clearFilters=()=>{setSrchDateFrom("");setSrchDateTo("");setSrchCat("all");setSrchType("all");};

  // ── Export: Excel (.xlsx) ──
  const exportExcel=async()=>{
    const XLSX=await loadVendor("xlsx");
    const wb=XLSX.utils.book_new();
    const summaryRows=[["دوره","درآمد = فروش (ریال)","هزینه مستقیم (ریال)","سود ناخالص (ریال)","هزینه‌های جاری (ریال)","سود خالص (ریال)"]];
    groupKeys.slice().reverse().forEach(key=>{
      const f=finOfKey(key);
      summaryRows.push([groupLabel(key),f.revenue,f.direct,f.gross,f.operating,f.net]);
    });
    summaryRows.push(["جمع کل",finTotal.revenue,finTotal.direct,finTotal.gross,finTotal.operating,finTotal.net]);
    const wsSummary=XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb,wsSummary,"خلاصه سود و زیان");

    const catRows=[["دسته‌بندی","نوع","مبلغ (ریال)"]];
    Object.entries(filtCatIncome).forEach(([cat,amt])=>catRows.push([cat,"درآمد",amt]));
    Object.entries(filtCatExpense).forEach(([cat,amt])=>catRows.push([cat,"هزینه",amt]));
    const wsCat=XLSX.utils.aoa_to_sheet(catRows);
    XLSX.utils.book_append_sheet(wb,wsCat,"دسته‌بندی‌ها");

    const msRows=[["روش","دریافتی (ریال)","پرداختی (ریال)","مانده (ریال)"]];
    methodSummary(filteredTx).forEach(r=>msRows.push([r.label,r.inc,r.out,r.net]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(msRows),"روش‌های پرداخت");
    {const inv=buildInventoryReport("30"),sc=inventorySections(inv,"۳۰ روز اخیر");
      [sc[0],sc[1]].forEach(sec=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([sec.head,...sec.rows]),"انبار - "+sec.name));}
    const txRows=[["تاریخ","نوع","دسته‌بندی","توضیحات","مبلغ (ریال)","روش"]];
    [...filteredTx].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{
      txRows.push([jalaliLabel(t.date),t.type==="income"?"درآمد":"هزینه",t.category,t.desc||"",Number(t.amount),isRealCashTx(t)?payLabel(txMethod(t)):"—"]);
    });
    const wsTx=XLSX.utils.aoa_to_sheet(txRows);
    XLSX.utils.book_append_sheet(wb,wsTx,"تراکنش‌ها");

    XLSX.writeFile(wb,`گزارش-سود-و-زیان-${todayIso()}.xlsx`);
  };

  // ── Export: PDF (print-friendly view → browser "Save as PDF") ──
  const buildReportHtml=()=>{
    const rowsHtml=groupKeys.slice().reverse().map(key=>{
      const f=finOfKey(key);const col=v=>v>=0?'#16a34a':'#dc2626';
      return `<tr><td>${groupLabel(key)}</td><td>${fmtM(f.revenue)}</td><td>${fmtM(f.direct)}</td><td style="color:${col(f.gross)};font-weight:700">${fmtM(f.gross)}</td><td>${fmtM(f.operating)}</td><td style="color:${col(f.net)};font-weight:700">${fmtM(f.net)}</td></tr>`;
    }).join("");
    return `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>گزارش سود و زیان</title>
      <style>
${printFontCss()}        body{font-family:${PRINT_FONT_FAMILY};color:#1e293b;padding:24px;}
        h1{font-size:18px;margin-bottom:4px;} .sub{font-size:12px;color:#64748b;margin-bottom:18px;}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px;}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:right;}
        th{background:#f1f5f9;}
        .kpis{display:flex;gap:8px;margin-bottom:18px;}
        .kpi{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:12px;text-align:center;}
        .kpi .l{font-size:11px;color:#64748b;} .kpi .v{font-size:15px;font-weight:700;margin-top:4px;}
        @media print{ .no-print{display:none} }
      </style></head><body>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px;">
        ${safeImgSrc(shop&&shop.logo)?`<img src="${safeImgSrc(shop.logo)}" style="width:52px;height:52px;object-fit:contain;border-radius:8px;">`:""}
        <div>
          <h1 style="margin:0;">گزارش سود و زیان — ${escapeHtml(shop&&shop.name?shop.name:"کافینو | CAFINO")}</h1>
        </div>
      </div>
      <div class="sub">تاریخ تهیه گزارش: ${jalaliLabel(todayIso())}</div>
      <div class="kpis">
        <div class="kpi"><div class="l">درآمد (فروش)</div><div class="v" style="color:#2563eb">${fmtM(finTotal.revenue)}</div></div>
        <div class="kpi"><div class="l">هزینه مستقیم</div><div class="v" style="color:#ea580c">${fmtM(finTotal.direct)}</div></div>
        <div class="kpi"><div class="l">${finTotal.gross>=0?"سود ناخالص":"زیان ناخالص"}</div><div class="v" style="color:${finTotal.gross>=0?'#16a34a':'#dc2626'}">${fmtM(Math.abs(finTotal.gross))}</div></div>
        <div class="kpi"><div class="l">هزینه‌های جاری</div><div class="v" style="color:#dc2626">${fmtM(finTotal.operating)}</div></div>
        <div class="kpi"><div class="l">${finTotal.net>=0?"سود خالص":"زیان خالص"}</div><div class="v" style="color:${finTotal.net>=0?'#16a34a':'#dc2626'}">${fmtM(Math.abs(finTotal.net))}</div></div>
      </div>
      <table><thead><tr><th>دوره</th><th>درآمد (فروش)</th><th>هزینه مستقیم</th><th>سود ناخالص</th><th>هزینه جاری</th><th>سود خالص</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <h3 style="font-size:13px;margin:10px 0 6px">به تفکیک روش پرداخت</h3><table><thead><tr><th>روش</th><th>دریافتی</th><th>پرداختی</th><th>مانده</th></tr></thead><tbody>${methodSummary(filteredTx).map(r=>`<tr><td>${r.label}</td><td>${fmtM(r.inc)}</td><td>${fmtM(r.out)}</td><td>${fmtM(r.net)}</td></tr>`).join("")}</tbody></table>
      <button class="no-print" onclick="window.print()" style="padding:10px 18px;font-size:14px;cursor:pointer">🖨️ چاپ / ذخیره PDF</button>
      </body></html>`;
  };
  // پیش‌نمایش چاپ: فقط نمایش، بدون فراخوانی خودکار دیالوگ چاپ
  const previewPrintReport=()=>{
    const w=window.open("","_blank");
    if(!w){alert("مرورگر بازکردن پنجره‌ی جدید را مسدود کرد. لطفاً پاپ‌آپ را برای این سایت مجاز کنید.");return;}
    w.document.write(buildReportHtml()); w.document.close();
  };
  // چاپ مستقیم: باز کردن گزارش و فراخوانی فوری دیالوگ چاپ
  const printReport=()=>{
    const w=window.open("","_blank");
    if(!w){alert("مرورگر بازکردن پنجره‌ی جدید را مسدود کرد. لطفاً پاپ‌آپ را برای این سایت مجاز کنید.");return;}
    w.document.write(buildReportHtml()); w.document.close();
    printWhenReady(w);
  };
  const exportPDF=printReport;

  return(
    <div>
      {/* Report type tabs */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {REPORT_TABS.map(t=>(
          <button key={t.key} onClick={()=>setActiveReport(t.key)} style={{
            ...BTN(activeReport===t.key?"#2563eb":"var(--bg-card)", activeReport===t.key?"#fff":"var(--text-secondary)"),
            padding:"8px 14px",fontSize:12,border:`1px solid ${activeReport===t.key?"#2563eb":"var(--border)"}`,
            display:"flex",alignItems:"center",gap:6
          }}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {activeReport==="inventory"&&<InventoryReportView/>}
      {activeReport==="realprofit"&&<RealProfitReport/>}
      {activeReport==="register"&&<RegisterHistory/>}
      {activeReport==="gl"&&<GeneralLedger/>}
      {activeReport==="voided"&&<VoidedReport/>}
      {activeReport==="online"&&<OnlineReport/>}
      {activeReport==="biz"&&<BizReports transactions={transactions}/>}

      {/* ── GENERAL REPORT ── */}
      {activeReport==="general"&&(
        <div>
          {/* Filter panel */}
          <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>🔍 فیلتر</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>از تاریخ</div><JalaliPicker value={srchDateFrom} onChange={setSrchDateFrom} placeholder="از تاریخ..."/></div>
              <div><div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>تا تاریخ</div><JalaliPicker value={srchDateTo} onChange={setSrchDateTo} placeholder="تا تاریخ..."/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div><div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>نوع</div><select value={srchType} onChange={e=>setSrchType(e.target.value)} style={{...INP,marginTop:0,fontSize:12}}><option value="all">همه</option><option value="income">درآمد</option><option value="expense">هزینه</option></select></div>
              <div><div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>دسته</div><SearchableSelect options={[{value:"all",label:"همه",group:null},...(srchType==="all"?[...categories.income,...categories.expense]:categories[srchType]||[]).map(c=>({value:c,label:c,group:null}))]} value={srchCat} placeholder="جستجوی دسته..." onChange={setSrchCat}/></div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              {[["daily","روزانه"],["monthly","ماهانه"],["yearly","سالانه"]].map(([m,l])=>(
                <button key={m} onClick={()=>setReportMode(m)} style={{...BTN(reportMode===m?"#2563eb":"var(--border)",reportMode===m?"#fff":"var(--text-secondary)"),padding:"6px 14px",fontSize:12}}>{l}</button>
              ))}
              <button onClick={clearFilters} style={{...BTN("var(--border)","#f87171"),padding:"6px 12px",fontSize:12,marginRight:"auto"}}>× پاک</button>
            </div>
          </div>

          {/* KPIs */}
          <div data-testid="rep-kpis" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:6}}>
            <KPI icon="TrendingUp" label="درآمد (فروش)" val={fmtM(finTotal.revenue)} color="#60a5fa" bg="#0a1a33"/>
            <KPI icon="TrendingDown" label="هزینه مستقیم" val={fmtM(finTotal.direct)} color="#fdba74" bg="#2a1505"/>
            <KPI icon={finTotal.gross>=0?"TrendingUp":"TrendingDown"} label={finTotal.gross>=0?"سود ناخالص":"زیان ناخالص"} val={fmtM(Math.abs(finTotal.gross))} color={finTotal.gross>=0?"#16a34a":"#dc2626"} bg={finTotal.gross>=0?"#052e16":"#2d0a0a"}/>
            <KPI icon="TrendingDown" label="هزینه‌های جاری" val={fmtM(finTotal.operating)} color="#dc2626" bg="#2d0a0a"/>
            <KPI icon={finTotal.net>=0?"TrendingUp":"TrendingDown"} label={finTotal.net>=0?"سود خالص":"زیان خالص"} val={fmtM(Math.abs(finTotal.net))} color={finTotal.net>=0?"#22d3ee":"#f97316"} bg={finTotal.net>=0?"#0a1f2e":"#1c0a00"}/>
          </div>
          <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:12}}>سود ناخالص = فروش − هزینه مستقیم · سود خالص = سود ناخالص − هزینه‌های جاری. فیلتر نوع/دسته فقط فهرست تراکنش‌ها را محدود می‌کند، نه این ۵ عدد.</div>
          <MethodSummary txs={filteredTx}/>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <button onClick={exportExcel} data-testid="export-excel" style={{...BTN("#166534","#fff"),padding:"8px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><span>📗</span><span>خروجی اکسل</span></button>
            <button onClick={previewPrintReport} style={{...BTN("var(--border)","var(--text-primary)"),padding:"8px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><span>🔍</span><span>پیش‌نمایش چاپ</span></button>
            <button onClick={printReport} data-testid="export-pdf" style={{...BTN("#b91c1c","#fff"),padding:"8px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><span>📕</span><span>خروجی PDF / چاپ</span></button>
          </div>
          {reportChartData.length>1&&<div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}><div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>📈 نمودار</div><LineChart data={reportChartData}/></div>}
          {(Object.keys(filtCatIncome).length>0||Object.keys(filtCatExpense).length>0)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}><CatCard title="درآمد بر دسته" data={filtCatIncome} color="#16a34a" total={filteredIncome}/><CatCard title="هزینه بر دسته" data={filtCatExpense} color="#dc2626" total={filteredExpense}/></div>}
          <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>{toFA(filteredTx.length)} تراکنش</div>
          {groupKeys.length===0?<Empty text="نتیجه‌ای پیدا نشد" sub="فیلترها را تغییر دهید"/>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {groupKeys.map(key=>{const grp=groups[key]||[];const ff=finOfKey(key);const inc=ff.revenue,exp=ff.direct+ff.operating,prf=ff.net;return(
                <div key={key} style={{background:"var(--bg-card)",borderRadius:10,padding:"12px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:"var(--accent-light)",fontWeight:700,fontSize:13}}>{groupLabel(key)}</span><span style={{fontSize:11,color:"var(--text-muted)"}}>{toFA(grp.length)} تراکنش</span></div>
                  <div style={{display:"flex",gap:14,marginTop:6,flexWrap:"wrap",fontSize:12}}><span style={{color:"#60a5fa"}}>فروش {fmtM(inc)}</span><span style={{color:"#fdba74"}}>مستقیم −{fmtM(ff.direct)}</span><span style={{color:ff.gross>=0?"#4ade80":"#f87171",fontWeight:700}}>ناخالص {fmtM(ff.gross)}</span><span style={{color:"#f87171"}}>جاری −{fmtM(ff.operating)}</span><span style={{color:prf>=0?"#22d3ee":"#f97316",fontWeight:700}}>خالص {prf>=0?"+":""}{fmtM(prf)}</span></div>
                  {(inc+exp)>0&&<div style={{marginTop:6,height:3,borderRadius:2,overflow:"hidden",background:"var(--bg-app)",display:"flex"}}><div style={{width:`${inc/(inc+exp)*100}%`,background:"#16a34a"}}/><div style={{flex:1,background:"#dc2626"}}/></div>}
                </div>
              );})}
            </div>
          }
        </div>
      )}

      {/* ── TOP SERVICES ── */}
      {activeReport==="topServices"&&(
        <div>
          <ExportBar title="گزارش پرفروش‌ترین خدمات" fileBase="top-services" sections={[{name:"پرفروش‌ترین خدمات",head:["رتبه","خدمت","تعداد فروش","جمع درآمد (ریال)"],rows:topServices.map(([n,{count,total}],i)=>[i+1,n,count,total]),money:[3]}]}/>
          <div style={{background:"linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2))",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:28}}>🏆</span>
            <div><div style={{fontSize:14,fontWeight:700,color:"#fff"}}>پرفروش‌ترین خدمات</div><div style={{fontSize:12,color:"#cbd5e1"}}>بر اساس مجموع درآمد هر خدمت</div></div>
          </div>
          {topServices.length===0?<Empty text="داده‌ای وجود ندارد" sub="ابتدا تراکنش‌های درآمد ثبت کنید"/>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {topServices.map(([name,{count,total}],idx)=>(
                <div key={name} style={{background:"var(--bg-card)",borderRadius:10,padding:"12px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:idx===0?"#d97706":idx===1?"#6b7280":idx===2?"#92400e":"var(--header-grad-1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{toFA(idx+1)}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text-primary)"}}>{name}</div>
                      <div style={{fontSize:11,color:"var(--text-muted)"}}>{toFA(count)} بار فروش</div>
                    </div>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#4ade80"}}>{fmtM(total)}</div>
                      <div style={{fontSize:10,color:"var(--text-muted)"}}>{toFA(Math.round(total/maxSvcTotal*100))}٪ از کل</div>
                    </div>
                  </div>
                  <div style={{height:5,background:"var(--bg-app)",borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${total/maxSvcTotal*100}%`,height:"100%",background:`hsl(${150-idx*10},70%,45%)`,borderRadius:3,transition:"width .4s"}}/>
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {/* ── TOP DAYS & MONTHS ── */}
      {activeReport==="topDays"&&(
        <div>
          <ExportBar title="گزارش بیشترین درآمد روزها و ماه‌ها" fileBase="top-days" sections={[
            {name:"روزهای پردرآمد",head:["رتبه","روز","درآمد (ریال)"],rows:topDays.map(([k,t],i)=>{const[jy,jm,jd]=k.split("-").map(Number);return[i+1,`${toFA(jd)} ${JM[jm-1]} ${toFA(jy)}`,t];}),money:[2]},
            {name:"ماه‌های پردرآمد",head:["رتبه","ماه","درآمد (ریال)"],rows:topMonths.map(([k,t],i)=>{const[jy,jm]=k.split("-").map(Number);return[i+1,`${JM[jm-1]} ${toFA(jy)}`,t];}),money:[2]},
          ]}/>
          <div style={{background:"linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2))",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:28}}>📅</span>
            <div><div style={{fontSize:14,fontWeight:700,color:"#fff"}}>بیشترین درآمد</div><div style={{fontSize:12,color:"#cbd5e1"}}>پرسودترین روزها و ماه‌ها</div></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {/* Top Days */}
            <div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>📆 پرسودترین روزها</div>
              {topDays.length===0?<div style={{fontSize:12,color:"var(--text-dim)",textAlign:"center",padding:20}}>داده‌ای موجود نیست</div>
                :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {topDays.map(([key,total],i)=>{
                    const[jy,jm,jd]=key.split("-").map(Number);
                    return(
                      <div key={key} style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:"var(--text-muted)",width:20,textAlign:"center"}}>{toFA(i+1)}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,color:"var(--text-primary)",marginBottom:2}}>{toFA(jd)} {JM[jm-1]}</div>
                          <div style={{height:4,background:"var(--bg-app)",borderRadius:2,overflow:"hidden"}}>
                            <div style={{width:`${total/maxDay*100}%`,height:"100%",background:"#16a34a",borderRadius:2}}/>
                          </div>
                        </div>
                        <span style={{fontSize:11,color:"#4ade80",fontWeight:600,whiteSpace:"nowrap"}}>{toFA(Math.round(total/10000)/100)}M</span>
                      </div>
                    );
                  })}
                </div>
              }
            </div>
            {/* Top Months */}
            <div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>🗓️ پرسودترین ماه‌ها</div>
              {topMonths.length===0?<div style={{fontSize:12,color:"var(--text-dim)",textAlign:"center",padding:20}}>داده‌ای موجود نیست</div>
                :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {topMonths.map(([key,total],i)=>{
                    const[jy,jm]=key.split("-").map(Number);
                    return(
                      <div key={key} style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:"var(--text-muted)",width:20,textAlign:"center"}}>{toFA(i+1)}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,color:"var(--text-primary)",marginBottom:2}}>{JM[jm-1]} {toFA(jy)}</div>
                          <div style={{height:4,background:"var(--bg-app)",borderRadius:2,overflow:"hidden"}}>
                            <div style={{width:`${total/maxMonth*100}%`,height:"100%",background:"#2563eb",borderRadius:2}}/>
                          </div>
                        </div>
                        <span style={{fontSize:11,color:"#60a5fa",fontWeight:600,whiteSpace:"nowrap"}}>{toFA(Math.round(total/10000)/100)}M</span>
                      </div>
                    );
                  })}
                </div>
              }
            </div>
          </div>
          {/* Bar chart of last 6 months income */}
          {expMonthData.length>0&&(
            <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginTop:14}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>📊 روند درآمد ماهانه</div>
              <BarChart data={topMonths.slice().reverse().slice(-6).map(([k,v])=>{const[jy,jm]=k.split("-").map(Number);return{label:JM[jm-1].slice(0,3),income:v,expense:0};})} height={140}/>
            </div>
          )}
        </div>
      )}

      {/* ── EXPENSE REPORT ── */}
      {activeReport==="expenses"&&(
        <div>
          <ExportBar title="گزارش هزینه‌ها (کل دوره)" fileBase="expenses" sections={[{name:"هزینه به تفکیک دسته",head:["دسته","تعداد","مبلغ (ریال)","سهم ٪"],rows:topExpenses.map(([c,{count,total}])=>[c,count,total,totalAllExp>0?Math.round(total/totalAllExp*100):0]),money:[2]}]}/>
          <div style={{background:"linear-gradient(135deg,#2d0a0a,#1c0505)",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:28}}>💸</span>
              <div><div style={{fontSize:14,fontWeight:700,color:"#f87171"}}>گزارش هزینه‌ها</div><div style={{fontSize:12,color:"var(--text-muted)"}}>تجزیه و تحلیل کامل هزینه‌ها</div></div>
            </div>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:11,color:"var(--text-muted)"}}>کل هزینه</div>
              <div style={{fontSize:15,fontWeight:700,color:"#f87171"}}>{fmtM(totalAllExp)}</div>
            </div>
          </div>

          {/* Expense trend chart */}
          {expMonthData.length>1&&(
            <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:"#f87171",marginBottom:12}}>📈 روند هزینه‌های ماهانه</div>
              <BarChart data={expMonthData.map(([k,v])=>{const[jy,jm]=k.split("-").map(Number);return{label:JM[jm-1].slice(0,3),income:0,expense:v};})} height={140}/>
            </div>
          )}

          {/* Category breakdown */}
          {topExpenses.length===0?<Empty text="هنوز هزینه‌ای ثبت نشده"/>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {topExpenses.map(([cat,{count,total}])=>{
                const pct=Math.round(total/totalAllExp*100);
                return(
                  <div key={cat} style={{background:"var(--bg-card)",borderRadius:10,padding:"12px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text-primary)"}}>{cat}</div>
                        <div style={{fontSize:11,color:"var(--text-muted)"}}>{toFA(count)} بار · {toFA(pct)}٪ از کل هزینه</div>
                      </div>
                      <div style={{textAlign:"left"}}>
                        <div style={{fontSize:14,fontWeight:700,color:"#f87171"}}>{fmtM(total)}</div>
                        <div style={{fontSize:11,color:"var(--text-muted)"}}>میانگین: {fmtM(Math.round(total/count))}</div>
                      </div>
                    </div>
                    <div style={{height:5,background:"var(--bg-app)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:"#dc2626",borderRadius:3}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}

      {/* ── DEBTORS ── */}
      {activeReport==="debtors"&&(
        <div>
          <ExportBar title="گزارش مشتریان بدهکار" fileBase="debtors" sections={[{name:"مشتریان بدهکار",head:["رتبه","مشتری","تلفن","تعداد رکورد","آخرین تاریخ","بدهی (ریال)"],rows:debtors.map((d,i)=>[i+1,d.name,d.phone||"",d.entries,d.lastDate?jalaliLabel(d.lastDate):"",d.total]),money:[5]}]}/>
          <div style={{background:"linear-gradient(135deg,#1c0a00,#2d1500)",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:28}}>⚠️</span>
              <div><div style={{fontSize:14,fontWeight:700,color:"#f97316"}}>مشتریان بدهکار</div><div style={{fontSize:12,color:"var(--text-muted)"}}>از بخش حساب دفتری — دارندگان مانده مثبت</div></div>
            </div>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:11,color:"var(--text-muted)"}}>جمع بدهی</div>
              <div style={{fontSize:15,fontWeight:700,color:"#f97316"}}>{fmtM(debtors.reduce((s,d)=>s+d.total,0))}</div>
            </div>
          </div>

          {debtors.length===0
            ?<div style={{textAlign:"center",padding:60,color:"var(--text-dim)"}}>
                <div style={{fontSize:44,marginBottom:14}}>✅</div>
                <div style={{fontSize:15}}>هیچ بدهکاری ثبت نشده</div>
                <div style={{fontSize:12,marginTop:6}}>حساب‌های دفتری با مانده مثبت اینجا نمایش داده می‌شوند</div>
              </div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {debtors.map((d,i)=>(
                <div key={d.id} style={{background:"var(--bg-card)",borderRadius:10,padding:"14px 16px",borderRight:"3px solid #f97316"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:"#1c0a00",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#f97316",flexShrink:0}}>{toFA(i+1)}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)"}}>{d.name}</div>
                      <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2,display:"flex",gap:10}}>
                        {d.phone&&<span>📞 {d.phone}</span>}
                        <span>{toFA(d.entries)} رکورد</span>
                        {d.lastDate&&<span>آخرین: {jalaliLabel(d.lastDate)}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontSize:15,fontWeight:700,color:"#f97316"}}>{fmtM(d.total)}</div>
                      <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>مانده بدهی</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
      )}
    </div>
  );
}
