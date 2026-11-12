// Generated from App.jsx by the module split (v1.50.0). Section: bizReports
import React, { useState, useEffect, useRef } from "react";
import { fmtCompact, fmtM, toFA } from "../core/format.js";
import { isoToJKey, jalaliLabel, p2 } from "../domain/backup.js";
import { BE_KEY, BTN, COST_CATEGORY, CUSTOMERS_STORAGE_KEY, DEFAULT_INVENTORY, INP, INV_STORAGE_KEY, JM } from "../core/constants.js";
import { buildCustomerFinance, jalaliShort } from "./customers.jsx";
import { computeDebtors, isoDaysAgo } from "./dashboard.jsx";
import { dateToJalali, jalaliToIso, todayIso } from "../core/jalali.js";
import { daysUntil } from "../domain/obligations.jsx";
import { ExportBar } from "../components/reportExport.jsx";
import { directCats, financeOf, fmtPct, getSales, lsRead, lsWrite, useDataSync } from "../domain/sales.jsx";


export function bizLineStats(from,to,mode){
  const inv=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;const m={};
  getSales().filter(s=>!s.cancelled&&(!from||s.date>=from)&&(!to||s.date<=to)).forEach(s=>{
    const sub=(s.lines||[]).reduce((a,l)=>a+l.qty*l.price,0)||1;
    const ratio=((s.total||0)-(s.waived||0))/sub;
    (s.lines||[]).forEach(l=>{
      const key=mode==="category"?(l.category||l.desc||"بدون دسته"):String(l.desc||l.category||"—").split(" — ")[0].trim();
      const net=l.qty*l.price*ratio;
      const st=l.stockId?inv.find(x=>String(x.id)===String(l.stockId)):null;
      const cost=(Number(l.cost)||0)+(Number(l.autoCost)||0)+(st?(Number(st.unitCost)||0)*(Number(l.stockQty)||0):0);
      const r=m[key]||(m[key]={name:key,qty:0,count:0,revenue:0,profit:0});
      r.qty+=Number(l.qty)||0;r.count+=1;r.revenue+=net;r.profit+=net-cost;
    });
  });
  return Object.values(m).map(r=>({...r,margin:r.revenue>0?r.profit/r.revenue:0}));
}

function expenseBucket(cat){
  const c=String(cat||"");
  if(/اجاره/.test(c))return"اجاره";
  if(/حقوق|دستمزد/.test(c))return"حقوق";
  if(/اینترنت|ISP/i.test(c))return"اینترنت";
  if(/برق/.test(c))return"برق";
  if(c===COST_CATEGORY||/مصرفی|کاغذ|تونر|جوهر/.test(c)||directCats().includes(c))return"مواد مصرفی";
  return"سایر";
}

export function jMonthShift(back){const[jy,jm]=dateToJalali(todayIso());let m=jm-back,y=jy;while(m<=0){m+=12;y--;}return{y,m,key:`${y}-${p2(m)}`};}

export function BizReports({transactions}){
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const [tab,setTab]=useState("sales");
  const [period,setPeriod]=useState("30");
  const [idleDays,setIdleDays]=useState(30);
  const [be,setBe]=useState(()=>{const v=lsRead(BE_KEY,null);return v&&typeof v==="object"?v:{fixed:"",avg:""};});
  const saveBe=(n)=>{setBe(n);lsWrite(BE_KEY,n);};
  const digits=v=>String(v).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^\d]/g,"");
  const fc=v=>v<0?"−"+fmtCompact(-v):fmtCompact(v);
  const today=todayIso();
  const sales=getSales();
  const fin=(match)=>financeOf(match,transactions,sales);
  const from=period==="all"?"":period==="month"?"":isoDaysAgo(Number(period));
  const curMonth=isoToJKey(today,"monthly");
  const inPeriod=d=>period==="month"?isoToJKey(d,"monthly")===curMonth:(!from||d>=from);
  const periodLabel=period==="7"?"۷ روز اخیر":period==="30"?"۳۰ روز اخیر":period==="month"?"این ماه":"کل دوران";
  const fromFor=period==="month"?(()=>{const [jy,jm]=dateToJalali(today);return jalaliToIso(jy,jm,1);})():from;

  const bizExp={title:"گزارش کاربردی",file:"report",sections:[]};
  const card={background:"var(--bg-card)",borderRadius:12,padding:"14px 16px"};
  const h=(t)=><div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>{t}</div>;
  const row=(l,r,sub,col)=>(<div key={l+r} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,background:"var(--bg-app)",borderRadius:9,padding:"8px 11px",marginBottom:6}}><div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l}</div>{sub&&<div style={{fontSize:10,color:"var(--text-muted)",marginTop:1}}>{sub}</div>}</div><div style={{fontSize:12,fontWeight:700,color:col||"var(--text-primary)",whiteSpace:"nowrap"}}>{r}</div></div>);
  const none=t=><div style={{textAlign:"center",color:"var(--text-dim)",fontSize:12,padding:"16px 0"}}>{t}</div>;
  const clr=v=>v>=0?"#4ade80":"#f87171";
  const periodSel=(
    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
      <span style={{fontSize:12,color:"var(--text-muted)"}}>بازه:</span>
      {[["7","۷ روز"],["30","۳۰ روز"],["month","این ماه"],["all","کل"]].map(([k,l])=><button key={k} onClick={()=>setPeriod(k)} style={{...BTN(period===k?"#2563eb":"var(--bg-card)",period===k?"#fff":"var(--text-secondary)"),padding:"5px 12px",fontSize:12,border:"1px solid var(--border)"}}>{l}</button>)}
    </div>
  );

  // ── فروش ──
  const salesTab=()=>{
    const dow=(new Date(today+"T00:00:00").getDay()+1)%7; // شنبه=۰
    const weekStart=isoDaysAgo(dow), yest=isoDaysAgo(1), pm=jMonthShift(1);
    const ranges=[
      ["امروز",fin(d=>d===today)],
      ["دیروز",fin(d=>d===yest)],
      ["این هفته",fin(d=>d>=weekStart&&d<=today)],
      ["این ماه",fin(d=>isoToJKey(d,"monthly")===curMonth)],
      ["ماه قبل",fin(d=>isoToJKey(d,"monthly")===pm.key)],
    ];
    const mx=Math.max(1,...ranges.map(r=>r[1].revenue));
    bizExp.title="گزارش فروش و سود";bizExp.file="sales-report";
    bizExp.sections=[{name:"فروش بازه‌ها",head:["بازه","تعداد فروش","فروش (ریال)","دریافتی (ریال)","سود ناخالص (ریال)","سود خالص (ریال)"],rows:ranges.map(([n,f])=>[n,f.count,f.revenue,f.received,f.gross,f.net]),money:[2,3,4,5]}];
    return(
      <div data-testid="biz-sales" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12}}>
        {ranges.map(([name,f])=>(
          <div key={name} style={card}>
            {h(name)}
            <div style={{fontSize:20,fontWeight:800,color:"#60a5fa"}}>{fmtM(f.revenue)}</div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:8}}>{toFA(f.count)} فروش{f.count>0?` · میانگین ${fc(Math.round(f.revenue/f.count))}`:""}</div>
            <div style={{height:5,background:"var(--bg-app)",borderRadius:3,overflow:"hidden",marginBottom:10}}><div style={{width:`${f.revenue/mx*100}%`,height:"100%",background:"#60a5fa"}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:"var(--text-muted)"}}>دریافتی</span><b>{fmtM(f.received)}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:"var(--text-muted)"}}>سود ناخالص</span><b style={{color:clr(f.gross)}}>{fmtM(f.gross)}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"var(--text-muted)"}}>سود خالص</span><b style={{color:clr(f.net)}}>{fmtM(f.net)}</b></div>
          </div>))}
      </div>);
  };

  // ── سود ──
  const profitTab=()=>{
    const days=[];for(let i=0;i<14;i++){const d=isoDaysAgo(i);days.push([d,fin(x=>x===d)]);}
    const months=[];for(let i=0;i<6;i++){const mm=jMonthShift(i);months.push([mm,fin(x=>isoToJKey(x,"monthly")===mm.key)]);}
    const srv=bizLineStats(fromFor,"","service").sort((a,b)=>b.profit-a.profit);
    const cats=bizLineStats(fromFor,"","category").sort((a,b)=>b.profit-a.profit);
    const mxD=Math.max(1,...days.map(x=>Math.abs(x[1].gross)));
    const list=(arr)=>arr.length===0?none("فروشی در این بازه نیست"):arr.slice(0,10).map(r=>row(r.name,fmtM(Math.round(r.profit)),`فروش ${fc(Math.round(r.revenue))} · حاشیه ${toFA(Math.round(r.margin*100))}٪`,clr(r.profit)));
    bizExp.title="گزارش سود";bizExp.file="profit-report";
    const profRows=(arr)=>arr.map(r=>[r.name,Math.round(r.revenue),Math.round(r.profit),Math.round((r.margin||0)*100)]);
    bizExp.sections=[
      {name:"سود روزانه ۱۴ روز اخیر",head:["تاریخ","فروش (ریال)","سود ناخالص (ریال)","سود خالص (ریال)"],rows:days.map(([d,f])=>[jalaliLabel(d),f.revenue,f.gross,f.net]),money:[1,2,3]},
      {name:"سود ماهانه ۶ ماه اخیر",head:["ماه","فروش (ریال)","سود ناخالص (ریال)","سود خالص (ریال)"],rows:months.map(([mm,f])=>[`${JM[mm.m-1]} ${toFA(mm.y)}`,f.revenue,f.gross,f.net]),money:[1,2,3]},
      {name:`سود هر خدمت — ${periodLabel}`,head:["خدمت","فروش (ریال)","سود (ریال)","حاشیه سود ٪"],rows:profRows(srv),money:[1,2]},
      {name:`سود هر دسته — ${periodLabel}`,head:["دسته","فروش (ریال)","سود (ریال)","حاشیه سود ٪"],rows:profRows(cats),money:[1,2]},
    ];
    return(
      <div data-testid="biz-profit">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12,marginBottom:12}}>
          <div style={card}>{h("📆 سود روزانه (۱۴ روز اخیر)")}
            {days.map(([d,f])=>(
              <div key={d} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,fontSize:11}}>
                <span style={{width:62,color:"var(--text-muted)"}}>{jalaliShort(d)}</span>
                <div style={{flex:1,height:8,background:"var(--bg-app)",borderRadius:4,overflow:"hidden"}}><div style={{width:`${Math.abs(f.gross)/mxD*100}%`,height:"100%",background:f.gross>=0?"#16a34a":"#dc2626"}}/></div>
                <span title="سود ناخالص" style={{width:78,textAlign:"left",color:clr(f.gross),fontWeight:700}}>{fc(f.gross)}</span>
                <span title="سود خالص" style={{width:70,textAlign:"left",color:"var(--text-muted)"}}>{fc(f.net)}</span>
              </div>))}
            <div style={{fontSize:10,color:"var(--text-dim)",marginTop:6}}>ستون اول سود ناخالص، ستون دوم سود خالص روز</div>
          </div>
          <div style={card}>{h("🗓️ سود ماهانه (۶ ماه اخیر)")}
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{color:"var(--text-muted)",textAlign:"right"}}><th style={{padding:"4px 6px"}}>ماه</th><th>فروش</th><th>ناخالص</th><th>خالص</th><th>حاشیه</th></tr></thead>
              <tbody>{months.map(([mm,f])=>(<tr key={mm.key} style={{borderTop:"1px solid var(--border)"}}><td style={{padding:"6px"}}>{JM[mm.m-1]} {toFA(mm.y)}</td><td>{fc(f.revenue)}</td><td style={{color:clr(f.gross)}}>{fc(f.gross)}</td><td style={{color:clr(f.net),fontWeight:700}}>{fc(f.net)}</td><td>{fmtPct(f.net,f.revenue)}</td></tr>))}</tbody>
            </table></div>
          </div>
        </div>
        {periodSel}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12}}>
          <div style={card}>{h(`💎 سود هر خدمت — ${periodLabel}`)}{list(srv)}</div>
          <div style={card}>{h(`🗂️ سود هر دسته — ${periodLabel}`)}{list(cats)}</div>
        </div>
      </div>);
  };

  // ── مشتری ──
  const customerTab=()=>{
    const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
    const nameOf=c=>`${c.firstName||""} ${c.lastName||""}`.trim()||"—";
    const debtors=computeDebtors().slice(0,10);
    const byCust={};
    sales.filter(s=>!s.cancelled&&s.customerId!=null&&inPeriod(s.date)).forEach(s=>{const k=String(s.customerId);const r=byCust[k]||(byCust[k]={id:k,total:0,count:0});r.total+=(s.total||0)-(s.waived||0);r.count++;});
    const top=Object.values(byCust).map(r=>{const c=customers.find(x=>String(x.id)===r.id);return{...r,name:c?nameOf(c):"—"};}).sort((a,b)=>b.total-a.total).slice(0,10);
    const idle=customers.map(c=>{const f=buildCustomerFinance(c.id,c);const d=f.lastVisit?-daysUntil(f.lastVisit):null;return{c,last:f.lastVisit,d,spent:f.purchases};}).filter(x=>x.d==null||x.d>=idleDays).sort((a,b)=>(b.d==null?1e9:b.d)-(a.d==null?1e9:a.d));
    bizExp.title="گزارش مشتریان";bizExp.file="customers-report";
    bizExp.sections=[
      {name:"بدهکارترین مشتری‌ها",head:["مشتری","بدهی (ریال)"],rows:debtors.map(d=>[d.name,d.amount]),money:[1]},
      {name:`بیشترین خرید — ${periodLabel}`,head:["مشتری","مجموع خرید (ریال)","تعداد خرید"],rows:top.map(r=>[r.name,r.total,r.count]),money:[1]},
      {name:`مشتریان غیرفعال (بیش از ${idleDays} روز)`,head:["مشتری","آخرین مراجعه","روز از آخرین مراجعه","مجموع خرید (ریال)"],rows:idle.map(x=>[nameOf(x.c),x.last?jalaliLabel(x.last):"بدون مراجعه",x.d==null?"—":x.d,x.spent||0]),money:[3]},
    ];
    return(
      <div data-testid="biz-customers">
        {periodSel}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12}}>
          <div style={card}>{h("🔴 بدهکارترین مشتری‌ها")}{debtors.length===0?none("بدهکاری وجود ندارد 🎉"):debtors.map((d,i)=>row(`${toFA(i+1)}. ${d.name}`,fmtM(d.amount),d.oldest?`از ${jalaliLabel(d.oldest)}`:"","#f87171"))}</div>
          <div style={card}>{h(`🛍️ بیشترین خرید — ${periodLabel}`)}{top.length===0?none("خریدی ثبت نشده"):top.map((r,i)=>row(`${toFA(i+1)}. ${r.name}`,fmtM(r.total),`${toFA(r.count)} فروش`,"#60a5fa"))}</div>
          <div style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>{h(`😴 مشتریان غیرفعال (${toFA(idle.length)})`)}
              <select value={idleDays} onChange={e=>setIdleDays(Number(e.target.value))} style={{background:"var(--bg-app)",color:"var(--text-secondary)",border:"1px solid var(--border)",borderRadius:7,fontSize:11,padding:"2px 6px",fontFamily:"inherit",marginBottom:10}}><option value={30}>۳۰ روز</option><option value={60}>۶۰ روز</option><option value={90}>۹۰ روز</option></select>
            </div>
            {idle.length===0?none("همه مشتریان اخیراً مراجعه داشته‌اند ✓"):idle.slice(0,12).map(x=>row(nameOf(x.c),x.d==null?"بدون مراجعه":`${toFA(x.d)} روز پیش`,x.c.phone||"",x.d==null?"var(--text-muted)":"#fbbf24"))}
            {idle.length>12&&<div style={{fontSize:11,color:"var(--text-muted)",textAlign:"center"}}>و {toFA(idle.length-12)} مشتری دیگر</div>}
          </div>
        </div>
      </div>);
  };

  // ── خدمات ──
  const serviceTab=()=>{
    const st=bizLineStats(fromFor,"","service");
    const box=(title,arr,right,sub,col)=>(<div style={card}>{h(title)}{arr.length===0?none("فروشی در این بازه نیست"):arr.slice(0,8).map((r,i)=>row(`${toFA(i+1)}. ${r.name}`,right(r),sub(r),col(r)))}</div>);
    const mg=r=>`حاشیه ${toFA(Math.round(r.margin*100))}٪`;
    bizExp.title="گزارش خدمات";bizExp.file="services-report";
    bizExp.sections=[{name:`آمار خدمات — ${periodLabel}`,head:["خدمت","تعداد واحد","تعداد فروش","فروش (ریال)","سود (ریال)","حاشیه سود ٪"],rows:[...st].sort((a,b)=>b.revenue-a.revenue).map(r=>[r.name,r.qty,r.count,Math.round(r.revenue),Math.round(r.profit),Math.round((r.margin||0)*100)]),money:[3,4]}];
    return(
      <div data-testid="biz-services">
        {periodSel}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12}}>
          {box("🏆 پرفروش‌ترین",[...st].sort((a,b)=>b.qty-a.qty),r=>`${toFA(r.qty)} عدد`,r=>`فروش ${fc(Math.round(r.revenue))}`,()=>"#60a5fa")}
          {box("💎 پرسودترین",[...st].sort((a,b)=>b.profit-a.profit),r=>fc(Math.round(r.profit)),mg,r=>clr(r.profit))}
          {box("⚠️ کم‌سودترین",[...st].sort((a,b)=>a.profit-b.profit),r=>fc(Math.round(r.profit)),r=>`${mg(r)} · ${toFA(r.qty)} عدد`,r=>r.profit<0?"#f87171":"#fbbf24")}
          {box("🔢 تعداد فروش",[...st].sort((a,b)=>b.count-a.count),r=>`${toFA(r.count)} بار`,r=>`${toFA(r.qty)} واحد`,()=>"#a78bfa")}
        </div>
      </div>);
  };

  // ── هزینه ──
  const expenseTab=()=>{
    const BUCKETS=["اجاره","حقوق","اینترنت","برق","مواد مصرفی","سایر"];
    const exp=transactions.filter(t=>t.type==="expense"&&inPeriod(t.date));
    const by={};BUCKETS.forEach(b=>by[b]={total:0,cats:{}});
    exp.forEach(t=>{const b=by[expenseBucket(t.category)];const a=Number(t.amount)||0;b.total+=a;b.cats[t.category]=(b.cats[t.category]||0)+a;});
    const total=BUCKETS.reduce((a,b)=>a+by[b].total,0);
    const COL={"اجاره":"#6366f1","حقوق":"#0891b2","اینترنت":"#16a34a","برق":"#d97706","مواد مصرفی":"#ea580c","سایر":"#94a3b8"};
    bizExp.title="گزارش هزینه‌ها";bizExp.file="expenses-report";
    bizExp.sections=[
      {name:`هزینه به تفکیک گروه — ${periodLabel}`,head:["گروه","مبلغ (ریال)","سهم ٪"],rows:BUCKETS.map(b=>[b,by[b].total,total>0?Math.round(by[b].total/total*100):0]),money:[1]},
      {name:"ریز دسته‌های هزینه",head:["گروه","دسته","مبلغ (ریال)"],rows:BUCKETS.flatMap(b=>Object.entries(by[b].cats).sort((x,y)=>y[1]-x[1]).map(([c,v])=>[b,c,v])),money:[2]},
    ];
    return(
      <div data-testid="biz-expenses">
        {periodSel}
        <div style={{...card,marginBottom:12}}>
          <div style={{fontSize:12,color:"var(--text-muted)"}}>مجموع هزینه — {periodLabel}</div>
          <div style={{fontSize:22,fontWeight:800,color:"#f87171",marginBottom:10}}>{fmtM(total)}</div>
          {total>0&&<div style={{display:"flex",height:10,borderRadius:5,overflow:"hidden",background:"var(--bg-app)"}}>{BUCKETS.map(b=>by[b].total>0&&<div key={b} title={b} style={{width:`${by[b].total/total*100}%`,background:COL[b]}}/>)}</div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12}}>
          {BUCKETS.map(b=>(
            <div key={b} style={{...card,borderTop:`3px solid ${COL[b]}`}}>
              <div style={{fontSize:13,fontWeight:700}}>{b}</div>
              <div style={{fontSize:18,fontWeight:800,margin:"4px 0"}}>{fmtM(by[b].total)}</div>
              <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:6}}>{fmtPct(by[b].total,total)} از کل هزینه‌ها</div>
              {Object.entries(by[b].cats).sort((x,y)=>y[1]-x[1]).map(([c,v])=><div key={c} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text-secondary)"}}><span>{c}</span><span>{fc(v)}</span></div>)}
            </div>))}
        </div>
        <div style={{fontSize:11,color:"var(--text-dim)",marginTop:8}}>دسته‌های هزینه بر اساس نامشان در این گروه‌ها قرار می‌گیرند (مثلاً نامی که «اجاره» دارد در گروه اجاره). هر دسته‌ای که با هیچ‌کدام نخواند در «سایر» است.</div>
      </div>);
  };

  // ── نقطه سربه‌سر ──
  const breakEvenTab=()=>{
    const m3=[1,2,3].map(i=>jMonthShift(i));
    const opsMonths=m3.map(mm=>fin(x=>isoToJKey(x,"monthly")===mm.key).operating).filter(v=>v>0);
    const autoFixed=opsMonths.length?Math.round(opsMonths.reduce((a,b)=>a+b,0)/opsMonths.length):0;
    const since=isoDaysAgo(90);
    let win=sales.filter(s=>!s.cancelled&&s.date>=since);if(win.length===0)win=sales.filter(s=>!s.cancelled);
    const winGross=win.reduce((a,s)=>{const sf=financeOf(d=>d===s.date,[],[s]);return a+sf.revenue;},0)-transactions.filter(t=>t.type==="expense"&&directCats().includes(t.category)&&win.some(s=>s.id===t.saleId)).reduce((a,t)=>a+Number(t.amount||0),0);
    const autoAvg=win.length?Math.round(winGross/win.length):0;
    const fixed=be.fixed!==""&&be.fixed!=null?Number(be.fixed):autoFixed;
    const avg=be.avg!==""&&be.avg!=null?Number(be.avg):autoAvg;
    const need=fixed>0&&avg>0?Math.ceil(fixed/avg):null;
    const cur=fin(x=>isoToJKey(x,"monthly")===curMonth);
    const done=cur.count;
    const pct=need?Math.min(100,Math.round(done/need*100)):0;
    const [jy,jm,jd]=dateToJalali(today);
    const daysLeft=Math.max(1,(jm<=6?31:jm<=11?30:29)-jd+1);
    const remaining=need?Math.max(0,need-done):0;
    const winRev=win.reduce((a,x)=>a+(x.total||0)-(x.waived||0),0);const margin=winRev>0?winGross/winRev:0;
    const input=(label,key,auto,hint)=>(
      <div style={{flex:1,minWidth:220}}>
        <div style={{fontSize:12,color:"var(--text-muted)"}}>{label}</div>
        <input data-testid={"be-"+key} inputMode="numeric" value={be[key]===""||be[key]==null?"":Number(be[key]).toLocaleString("fa-IR")} placeholder={auto>0?`خودکار: ${Number(auto).toLocaleString("fa-IR")}`:"ریال"} onChange={e=>saveBe({...be,[key]:digits(e.target.value)})} style={INP}/>
        <div style={{fontSize:10,color:"var(--text-dim)",marginTop:3}}>{hint}{be[key]!==""&&be[key]!=null&&<button onClick={()=>saveBe({...be,[key]:""})} style={{background:"none",border:"none",color:"var(--accent-light)",cursor:"pointer",fontSize:10,fontFamily:"inherit"}}> · بازگشت به محاسبه خودکار</button>}</div>
      </div>);
    bizExp.title="گزارش نقطه سربه‌سر";bizExp.file="breakeven-report";
    bizExp.sections=[{name:"نقطه سربه‌سر ماهانه",head:["شاخص","مقدار"],rows:[["هزینه ثابت ماهانه (ریال)",fixed],["سود ناخالص متوسط هر خدمت (ریال)",avg],["تعداد فروش لازم برای سربه‌سر",need==null?"—":need],["فروش انجام‌شده این ماه",done],["باقی‌مانده تا سربه‌سر",need==null?"—":remaining]],money:[]}];
    return(
      <div data-testid="biz-breakeven">
        <div style={{...card,marginBottom:12}}>
          {h("🎯 نقطه سربه‌سر ماهانه")}
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {input("هزینه ثابت ماهانه (ریال)","fixed",autoFixed,"خودکار: میانگین هزینه‌های جاری ۳ ماه قبل")}
            {input("سود ناخالص متوسط هر خدمت (ریال)","avg",autoAvg,"خودکار: سود ناخالص ÷ تعداد فروش‌های ۹۰ روز اخیر")}
          </div>
        </div>
        {need==null?<div style={card}>{none("برای محاسبه، هزینه ثابت و سود متوسط هر خدمت لازم است (دستی وارد کنید یا کمی فروش و هزینه ثبت شود).")}</div>:(
        <div style={{...card,background:"linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2))"}}>
          <div style={{fontSize:12,color:"#cbd5e1",lineHeight:2}}>
            هزینه ثابت ماهانه: <b style={{color:"#fff"}}>{fmtM(fixed)}</b><br/>
            سود متوسط هر خدمت: <b style={{color:"#fff"}}>{fmtM(avg)}</b>
          </div>
          <div data-testid="be-result" style={{fontSize:18,fontWeight:800,color:"#fde68a",margin:"8px 0"}}>برای سربه‌سر شدن: {toFA(need)} خدمت در ماه</div>
          <div style={{fontSize:12,color:"#e2e8f0",marginBottom:6}}>این ماه تاکنون {toFA(done)} خدمت ثبت شده ({toFA(pct)}٪){remaining>0?` · ${toFA(remaining)} خدمت مانده (حدود ${toFA(Math.ceil(remaining/daysLeft))} در روز تا آخر ماه)`:" · از نقطه سربه‌سر عبور کرده‌اید ✅"}</div>
          <div style={{height:8,background:"#ffffff22",borderRadius:4,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:pct>=100?"#4ade80":"#fbbf24"}}/></div>
          {margin>0&&<div style={{fontSize:11,color:"#cbd5e1",marginTop:10}}>فروش لازم برای سربه‌سر ≈ {fmtM(Math.round(fixed/margin))} (با حاشیه سود ناخالص {toFA(Math.round(margin*100))}٪)</div>}
        </div>)}
        <div style={{fontSize:11,color:"var(--text-dim)",marginTop:8}}>«خدمت» = هر فروش ثبت‌شده (فاکتور). سود ناخالص یعنی فروش منهای هزینه مستقیم، پس هزینه ثابت (اجاره، حقوق، قبوض) فقط یک بار از آن کم می‌شود.</div>
      </div>);
  };

  const TABS=[["sales","💵 فروش",salesTab],["profit","💎 سود",profitTab],["customers","👥 مشتری",customerTab],["services","🛠️ خدمات",serviceTab],["expenses","💸 هزینه",expenseTab],["breakeven","🎯 سربه‌سر",breakEvenTab]];
  const cur=TABS.find(t=>t[0]===tab)||TABS[0];
  const bizBody=cur[2]();
  return(
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {TABS.map(([k,l])=><button key={k} data-testid={"biz-tab-"+k} onClick={()=>setTab(k)} style={{...BTN(tab===k?"#7c3aed":"var(--bg-card)",tab===k?"#fff":"var(--text-secondary)"),padding:"7px 14px",fontSize:12,border:"1px solid var(--border)"}}>{l}</button>)}
      </div>
      <ExportBar title={bizExp.title} fileBase={bizExp.file} sections={bizExp.sections}/>
      {bizBody}
    </div>
  );
}
