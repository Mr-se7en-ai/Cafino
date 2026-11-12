// Generated from App.jsx by the module split (v1.50.0). Section: dashboard
import React, { useState, useEffect, useRef } from "react";
import BrandLogo from "../components/BrandLogo.jsx";
import Icon, { ICONS } from "../../components/Icon.jsx";
import { currencyLabel, fmtCompact, fmtM, toFA } from "../core/format.js";
import { isoToJKey, jalaliLabel, p2 } from "../domain/backup.js";
import { clubAggregate, clubInfo, crmAggregate, crmStats, getClubConfig, getCrmConfig } from "../domain/club.js";
import { BTN, CUSTOMERS_STORAGE_KEY, DEFAULT_INVENTORY, FU_COL, INV_STORAGE_KEY, JM, LEDGER_STORAGE, LINK_CAT_ICON, ORDERS_STORAGE_KEY, WEEKDAYS_FA } from "../core/constants.js";
import { DashTiles } from "./dashTiles.jsx";
import { collectFollowUps, fuBucket, fuCounts, fuRel } from "./followups.jsx";
import { dateToJalali, jalaliMonthDays, jalaliToIso, todayIso } from "../core/jalali.js";
import { allLinks, getLinksState, hostOf, openLink } from "./links.jsx";
import { FinancialAlertsPanel, buildFinancialAlerts, daysUntil, getObligations, oblKind, oblStatus } from "../domain/obligations.jsx";
import { fmtQty } from "../domain/recipes.jsx";
import { financeOf, fmtPct, getSales, lsRead, lsWrite, methodSummary, payLabel, saleRemaining, useDataSync } from "../domain/sales.jsx";
import { Empty } from "../components/ui.jsx";
import { APP_BRAND } from "../core/version.js";
import { NotesWidget } from "./notesUI.jsx";
import { HealthWidget, getLastHealth } from "../../health/HealthPage.jsx";
import { CafindWidget } from "./searchUI.jsx";
import { NewsWidget } from "./newsWidget.jsx";
import { getCachedNews } from "../domain/newsFeed.js";
import { dueReminders, getReminders } from "../domain/notes.js";


// ══════════════════════════════════════════════════════════════════
// MANAGEMENT DASHBOARD (داشبورد مدیریتی) — customizable widgets
// ══════════════════════════════════════════════════════════════════
const DASH_KEY="cafenet_dash_layout";

const DASH_WIDGETS=[
  {id:"search",title:"کافیند | CAFIND — جستجو در همهٔ بخش‌های برنامه",icon:"🔍",size:"full"},
  {id:"quick",title:"مرکز عملیات (کاشی‌های دسترسی سریع)",icon:"⚡",size:"full"},
  {id:"kpiToday",title:"امروز در یک نگاه (فروش، هزینه، سود، صندوق)",icon:"📅",size:"full"},
  {id:"kpiMonth",title:"این ماه در یک نگاه (فروش، هزینه، سود، بدهی)",icon:"🗓️",size:"full"},
  {id:"charts",title:"نمودارها (فروش، سود، هزینه، مقایسه با ماه قبل)",icon:"📊",size:"full"},
  {id:"insights",title:"پرفروش‌ها، بهترین مشتریان، روش‌های پرداخت، کم‌موجودی",icon:"🔥",size:"full"},
  {id:"attention",title:"امروز چه چیزی نیاز به توجه دارد؟",icon:"⚠️",size:"full"},
  {id:"alerts",title:"هشدارهای مالی",icon:"🚨",size:"full"},
  {id:"today",title:"امروز",icon:"📅",size:"full"},
  {id:"finance",title:"عملکرد مالی (درآمد ← سود)",icon:"📊",size:"full"},
  {id:"cashbox",title:"صندوق به تفکیک روش پرداخت",icon:"🏧",size:"half"},
  {id:"health",title:"کنترل سلامت کسب‌وکار (بررسی وضعیت کافینو)",icon:"🩺",size:"half"},
  {id:"notes",title:"یادداشت و یادآوری (افزودن سریع و سررسیدها)",icon:"⏰",size:"half"},
  {id:"news",title:"اخبار کافی‌نت (سرتیتر، ساعت و تاریخ)",icon:"📰",size:"full"},
  {id:"followups",title:"پیگیری مشتریان امروز",icon:"🔔",size:"half"},
  {id:"club",title:"باشگاه مشتریان",icon:"🏅",size:"half"},
  {id:"topSellers",title:"۵ خدمت پرفروش",icon:"🏆",size:"half"},
  {id:"topProfit",title:"۵ خدمت پرسود",icon:"💎",size:"half"},
  {id:"debtors",title:"بدهکاران",icon:"🔴",size:"half"},
  {id:"lowStock",title:"موجودی‌های رو به اتمام",icon:"📦",size:"half"},
  {id:"orders",title:"سفارش‌های در انتظار",icon:"📋",size:"half"},
  {id:"obligations",title:"چک/تعهدات نزدیک سررسید",icon:"🗓️",size:"half"},
  {id:"recent",title:"آخرین تراکنش‌ها",icon:"🧾",size:"full"},
  {id:"links",title:"لینک‌های مورد علاقه",icon:"🔗",size:"half"},
  {id:"calendar",title:"تقویم",icon:"📆",size:"half"},
  {id:"compare",title:"مقایسه ماه جاری با ماه قبل",icon:"🔁",size:"half"},
  {id:"totals",title:"جمع کل درآمد، هزینه و سود",icon:"💰",size:"full"},
  {id:"trend",title:"روند ۶ ماه اخیر",icon:"📉",size:"half"},
  {id:"monthly",title:"نمودار درآمد ماهانه",icon:"📈",size:"half"},
  {id:"bars",title:"مقایسه ماهانه درآمد/هزینه",icon:"📊",size:"half"},
  {id:"donuts",title:"سهم دسته‌های درآمد و هزینه",icon:"🍩",size:"full"},
  {id:"ratio",title:"نسبت درآمد به هزینه",icon:"⚖️",size:"half"},
];

const DASH_QUICK_ACTIONS=[
  {id:"sale",title:"فروش سریع",icon:"Zap",color:"linear-gradient(135deg,#7c3aed,#a855f7)",kind:"sale"},
  {id:"pos",title:"صندوق فروش",icon:"Calculator",color:"linear-gradient(135deg,#be123c,#f43f5e)",tab:"pos"},
  {id:"topup",title:"شارژ و بسته اینترنت",icon:"Smartphone",color:"linear-gradient(135deg,#0e7490,#06b6d4)",tab:"topup"},
  {id:"product",title:"فروش محصول",icon:"Package",color:"linear-gradient(135deg,#b45309,#f59e0b)",kind:"product"},
  {id:"order",title:"سفارش جدید",icon:"ClipboardPlus",color:"#2563eb",tab:"orders",action:"new_order"},
  {id:"invoice",title:"فاکتور جدید",icon:"FileText",color:"#7c2d12",tab:"invoice",action:"new_invoice"},
  {id:"customer",title:"مشتری جدید",icon:"UserPlus",color:"#166534",tab:"customers",action:"new_customer"},
  {id:"report",title:"گزارش",icon:"BarChart3",color:"var(--bg-app)",tab:"report",outline:true},
];
const DASH_VER=2;

function defaultDashLayout(){
  const first=["search","quick","kpiToday","kpiMonth","charts","insights","attention","health","notes","news"];
  return{ver:DASH_VER,order:[...first,...DASH_WIDGETS.map(w=>w.id).filter(x=>!first.includes(x))],hidden:["calendar","trend","monthly","bars","ratio","today","cashbox","topSellers","lowStock","debtors","alerts"],sizes:{},period:"30",quickHidden:[],buttonSizes:{}};
}

function getDashLayout(){
  const d=defaultDashLayout();const v=lsRead(DASH_KEY,null);
  if(!v||!Array.isArray(v.order))return d;
  if(v.ver!==DASH_VER)return{...d,period:v.period||d.period};
  const known=DASH_WIDGETS.map(w=>w.id);
  const order=[...v.order.filter(x=>known.includes(x)),...known.filter(x=>!v.order.includes(x))];
  if(!v.order.includes("search")){const i=order.indexOf("search");if(i>=0)order.splice(i,1);order.unshift("search");}
  if(!v.order.includes("notes")){const i=order.indexOf("notes");if(i>=0)order.splice(i,1);const a=order.indexOf("attention");order.splice(a>=0?a+1:order.length,0,"notes");}
  if(!v.order.includes("health")){const i=order.indexOf("health");if(i>=0)order.splice(i,1);const a=order.indexOf("attention");order.splice(a>=0?a+1:order.length,0,"health");}
  if(!v.order.includes("news")){const i=order.indexOf("news");if(i>=0)order.splice(i,1);const a=order.indexOf("notes");order.splice(a>=0?a+1:order.length,0,"news");}
  if(!v.order.includes("alerts")){order.splice(order.indexOf("alerts"),1);order.unshift("alerts");}
  return{ver:DASH_VER,order,hidden:(v.hidden||[]).filter(x=>known.includes(x)),sizes:v.sizes||{},period:v.period||"30",quickHidden:(v.quickHidden||[]).filter(x=>DASH_QUICK_ACTIONS.some(a=>a.id===x)),buttonSizes:Object.fromEntries(DASH_QUICK_ACTIONS.filter(a=>["small","medium","large"].includes(v.buttonSizes?.[a.id])).map(a=>[a.id,v.buttonSizes[a.id]]))};
}

export function isoAdd(iso,n){const d=new Date(iso+"T00:00:00");d.setDate(d.getDate()+n);return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;}

export function isoDaysAgo(n){const d=new Date(todayIso()+"T00:00:00");d.setDate(d.getDate()-n);return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;}

export function computeDebtors(){
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  const nameOf=id=>{const c=customers.find(x=>String(x.id)===String(id));return c?`${c.firstName||""} ${c.lastName||""}`.trim():"—";};
  const map={};
  const add=(k,name,amt,date)=>{const r=map[k]||(map[k]={key:k,name,amount:0,oldest:date});r.amount+=amt;if(date&&(!r.oldest||date<r.oldest))r.oldest=date;};
  getSales().filter(s=>!s.cancelled).forEach(s=>{const r=saleRemaining(s);if(r>0)add("c"+s.customerId,s.customerName||nameOf(s.customerId),r,s.date);});
  lsRead(LEDGER_STORAGE,[]).forEach(a=>{
    (a.entries||[]).filter(e=>e.saleId==null&&e.category==="بدهکار"&&Number(e.amount)>0).forEach(e=>{
      const nm=a.customerId!=null?nameOf(a.customerId):`${a.firstName||""} ${a.lastName||""}`.trim()||"—";
      add(a.customerId!=null?"c"+a.customerId:"a"+a.id,nm,Number(e.amount),e.date);
    });
  });
  return Object.values(map).sort((x,y)=>y.amount-x.amount);
}

function computeServiceStats(fromIso){
  const inv=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
  const m={};
  getSales().filter(s=>!s.cancelled&&(!fromIso||s.date>=fromIso)).forEach(s=>{
    const sub=(s.lines||[]).reduce((a,l)=>a+l.qty*l.price,0)||1;
    (s.lines||[]).forEach(l=>{
      const key=l.category||l.desc;
      const net=l.qty*l.price*((s.total||0)/sub);
      const st=l.stockId?inv.find(x=>String(x.id)===String(l.stockId)):null;
      const cost=(Number(l.cost)||0)+(Number(l.autoCost)||0)+(st?(Number(st.unitCost)||0)*(Number(l.stockQty)||0):0);
      const r=m[key]||(m[key]={name:key,qty:0,revenue:0,profit:0});
      r.qty+=l.qty;r.revenue+=net;r.profit+=net-cost;
    });
  });
  return Object.values(m);
}

// Small dependency-free SVG chart: bars (optionally stacked) or lines.
function MiniChart({labels,series,type="bar",stacked=false,height=190,fmt}){
  const W=640,H=height,pl=8,pr=8,pt=12,pb=24;
  const n=labels.length;
  const f=fmt||(v=>fmtCompact(v));
  const vals=series.flatMap(s=>s.values);
  let max=0,min=0;
  if(stacked){for(let i=0;i<n;i++){max=Math.max(max,series.reduce((a,s)=>a+Math.max(0,s.values[i]||0),0));}}
  else{max=Math.max(0,...vals);min=Math.min(0,...vals);}
  if(max===min)max=min+1;
  const y=v=>pt+(H-pt-pb)*(1-(v-min)/(max-min));
  const slot=(W-pl-pr)/Math.max(1,n);
  const x=i=>pl+slot*(i+0.5);
  const step=Math.max(1,Math.ceil(n/10));
  return(
    <svg data-testid="mini-chart" viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}} role="img">
      {[0,0.25,0.5,0.75,1].map(t=>{const v=min+(max-min)*t;return<g key={t}><line x1={pl} x2={W-pr} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" strokeDasharray={t===0?"":"3 4"} opacity={t===0?0.9:0.5}/><text x={W-pr} y={y(v)-3} fontSize="9" fill="var(--text-muted)" textAnchor="end">{f(v)}</text></g>;})}
      {type==="bar"&&labels.map((lb,i)=>{
        let acc=0;
        return<g key={i}>{series.map((s,si)=>{
          const v=s.values[i]||0;
          if(stacked){const h=(H-pt-pb)*(Math.max(0,v)/(max-min));const yy=y(0)-(H-pt-pb)*(acc/(max-min))-h;acc+=Math.max(0,v);return<rect key={si} x={x(i)-slot*0.32} width={slot*0.64} y={yy} height={Math.max(0,h)} fill={s.color} rx="2"><title>{`${lb} — ${s.name}: ${fmtM(v)}`}</title></rect>;}
          const top=y(Math.max(0,v)),bot=y(Math.min(0,v));
          return<rect key={si} x={x(i)-slot*0.32} width={slot*0.64} y={top} height={Math.max(1,bot-top)} fill={v<0?"#f87171":s.color} rx="2"><title>{`${lb} — ${s.name}: ${fmtM(v)}`}</title></rect>;
        })}</g>;
      })}
      {type==="line"&&series.map((s,si)=>{
        const pts=s.values.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);
        return<g key={si}><polyline points={pts.map(p=>p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeDasharray={s.dash||""}/>
          {pts.length===1&&<circle cx={pts[0][0]} cy={pts[0][1]} r="3" fill={s.color}/>}</g>;
      })}
      {labels.map((lb,i)=>i%step===0&&<text key={i} x={x(i)} y={H-8} fontSize="9" fill="var(--text-muted)" textAnchor="middle">{lb}</text>)}
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════
// WIDGET LIVE TILES (ویجت‌ها به‌صورت کاشی زنده — small/medium = live tile, large = full widget)
// ══════════════════════════════════════════════════════════════════
const WIDGET_TILE_META={
  search:{color:"#0ea5e9",icon:"Sparkles",short:"کافیند | جستجو"},
  quick:{color:"#7c3aed",icon:"Zap",short:"مرکز عملیات"},
  kpiToday:{color:"#0e7490",icon:"CalendarDays",short:"امروز",tab:"pos"},
  kpiMonth:{color:"#2563eb",icon:"BarChart3",short:"این ماه",tab:"report"},
  charts:{color:"#0369a1",icon:"TrendingUp",short:"نمودارها",tab:"report"},
  insights:{color:"#be123c",icon:"Sparkles",short:"پرفروش‌ها و بهترین‌ها",tab:"report"},
  attention:{color:"#d97706",icon:"Bell",short:"نیاز به توجه"},
  alerts:{color:"#b91c1c",icon:"Bell",short:"هشدارهای مالی",tab:"obligations"},
  today:{color:"#0f766e",icon:"CalendarDays",short:"خلاصه امروز",tab:"pos"},
  finance:{color:"#1d4ed8",icon:"Wallet",short:"عملکرد مالی",tab:"report"},
  cashbox:{color:"#15803d",icon:"Calculator",short:"صندوق امروز",tab:"pos"},
  health:{color:"#0f766e",icon:"Activity",short:"سلامت کسب‌وکار",tab:"health"},
  notes:{color:"#d97706",icon:"Bell",short:"یادداشت و یادآوری"}, // کلیک: باز می‌شود و افزودن سریع را نشان می‌دهد
  news:{color:"#0284c7",icon:"Newspaper",short:"اخبار کافی‌نت"},
  followups:{color:"#9333ea",icon:"Bell",short:"پیگیری مشتریان",tab:"followups"},
  club:{color:"#a16207",icon:"Sparkles",short:"باشگاه مشتریان",tab:"customers"},
  topSellers:{color:"#c2410c",icon:"TrendingUp",short:"پرفروش‌ترین‌ها",tab:"report"},
  topProfit:{color:"#047857",icon:"TrendingUp",short:"پرسودترین‌ها",tab:"report"},
  debtors:{color:"#be123c",icon:"Users",short:"بدهکاران",tab:"customers"},
  lowStock:{color:"#b45309",icon:"Package",short:"کم‌موجودی",tab:"inventory"},
  orders:{color:"#2563eb",icon:"ShoppingCart",short:"سفارش‌های باز",tab:"orders"},
  obligations:{color:"#6d28d9",icon:"CalendarClock",short:"تعهدات نزدیک",tab:"obligations"},
  recent:{color:"#475569",icon:"ListChecks",short:"آخرین تراکنش‌ها",tab:"transactions"},
  links:{color:"#4338ca",icon:"Link2",short:"لینک‌های محبوب",tab:"links"},
  calendar:{color:"#be185d",icon:"CalendarDays",short:"تقویم",tab:"calendar"},
  compare:{color:"#0891b2",icon:"BarChart3",short:"مقایسه با ماه قبل",tab:"report"},
  totals:{color:"#374151",icon:"Wallet",short:"جمع کل",tab:"report"},
  trend:{color:"#0369a1",icon:"TrendingUp",short:"روند فروش",tab:"report"},
  monthly:{color:"#1e40af",icon:"TrendingUp",short:"درآمد ماه",tab:"report"},
  bars:{color:"#7e22ce",icon:"BarChart3",short:"درآمد و هزینه",tab:"report"},
  donuts:{color:"#a21caf",icon:"BarChart3",short:"سهم خدمت‌ها",tab:"report"},
  ratio:{color:"#0d9488",icon:"Calculator",short:"نسبت درآمد/هزینه",tab:"report"},
};

const WIDGET_SIZE_LEGACY={full:"l",half:"m"};

const WIDGET_SIZE_LABEL={s:"کوچک",m:"متوسط",l:"بزرگ"};

// KPI as a flat Windows-style live tile: front = value, back = comparison (flips every few seconds)
function KpiLiveTile({tid,label,icon,value,sub,color,back,onClick,delay=0,compact}){
  const [phase,setPhase]=useState(0);
  useEffect(()=>{
    if(!back||!back.length)return;
    try{if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;}catch{}
    let iv=null;const st=setTimeout(()=>{iv=setInterval(()=>setPhase(p=>1-p),6000);},delay);
    return()=>{clearTimeout(st);if(iv)clearInterval(iv);};
  },[back&&back.length,delay]);  
  const face=(on,children,dir)=>(
    <div aria-hidden={!on} style={{position:"absolute",inset:0,padding:"11px 14px",display:"flex",flexDirection:"column",justifyContent:"space-between",boxSizing:"border-box",transition:"transform .55s ease, opacity .55s ease",transform:on?"none":`translateY(${dir*100}%)`,opacity:on?1:0}}>{children}</div>);
  return(
    <div data-testid={tid} role={onClick?"button":undefined} tabIndex={onClick?0:undefined} onClick={onClick} onKeyDown={e=>{if(onClick&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onClick();}}} className="dwt"
      style={{"--tc":color,position:"relative",overflow:"hidden",background:color,color:"#fff",borderRadius:3,minHeight:compact?92:108,cursor:onClick?"pointer":"default",minWidth:0}}>
      {face(!phase,<>
        <div style={{fontSize:12,fontWeight:700,opacity:.95}}>{icon} {label}</div>
        <div><div style={{fontSize:compact?17:20,fontWeight:800,lineHeight:1.25,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</div>{sub&&<div style={{fontSize:10.5,opacity:.85,marginTop:2}}>{sub}</div>}</div>
      </>,-1)}
      {back&&back.length>0&&face(!!phase,<>
        <div style={{fontSize:12,fontWeight:700,opacity:.95}}>{icon} {label}</div>
        <div>{back.map((l,i)=><div key={i} style={{fontSize:12,lineHeight:1.6,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l}</div>)}</div>
      </>,1)}
    </div>);
}

const kpiDelta=(cur,prev)=>prev>0?`${cur>=prev?"▲":"▼"} ${toFA(Math.abs(Math.round((cur-prev)/prev*100)))}٪`:"—";

function WidgetTileFace({meta,title,live,size,paused}){
  const lines=(live&&live.lines)||[];
  const [phase,setPhase]=useState(0);
  const seed=(title||"").length*397%2500;
  useEffect(()=>{
    if(size!=="s"||!lines.length||paused)return;
    try{if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;}catch{}
    const t=setInterval(()=>setPhase(p=>1-p),5200+seed);
    return()=>clearInterval(t);
  },[size,lines.length,paused]);  
  const big=String((live&&live.big)??"—");
  const bigFs=big.length>14?13:big.length>8?16:size==="m"?26:24;
  const bigEl=<div style={{fontSize:bigFs,fontWeight:800,lineHeight:1.25,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{big}</div>;
  const subEl=live&&live.sub?<div style={{fontSize:11,opacity:.88,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{live.sub}</div>:null;
  const linesEl=lines.map((l,i)=><div key={i} style={{fontSize:11.5,lineHeight:1.55,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l}</div>);
  const head=(<div style={{display:"flex",alignItems:"center",gap:7}}><span className="wt-ic"><Icon name={meta.icon} size={size==="m"?22:18}/></span><span style={{fontSize:12.5,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span></div>);
  if(size==="m")return(
    <div style={{display:"flex",height:"100%",boxSizing:"border-box",padding:"12px 14px",gap:14}}>
      <div style={{flex:"1 1 0",minWidth:0,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
        {head}
        <div>{bigEl}{subEl}</div>
      </div>
      {lines.length>0&&<div style={{flex:"1.25 1 0",minWidth:0,borderInlineStart:"1px solid #ffffff44",paddingInlineStart:12,display:"flex",flexDirection:"column",justifyContent:"center"}}>{linesEl}</div>}
    </div>);
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",boxSizing:"border-box",padding:"11px 12px",gap:6}}>
      <div style={{flex:1,position:"relative",overflow:"hidden",minHeight:0}}>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"center",transition:"transform .55s ease, opacity .55s ease",transform:phase?"translateY(-100%)":"none",opacity:phase?0:1}}>{bigEl}{subEl}</div>
        {lines.length>0&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"center",transition:"transform .55s ease, opacity .55s ease",transform:phase?"none":"translateY(100%)",opacity:phase?1:0}}>{linesEl}</div>}
      </div>
      {head}
    </div>);
}

// Block the browser's swipe-back / pull-to-refresh gestures while a tile is being dragged
export function lockOverscroll(){
  const els=[document.documentElement,document.body];const prev=els.map(e=>e.style.overscrollBehavior);
  els.forEach(e=>{e.style.overscrollBehavior="none";});
  return()=>els.forEach((e,i)=>{e.style.overscrollBehavior=prev[i];});
}

// Pointer-based reordering (mouse + touch) over elements carrying data-widget inside boxRef
function useWidgetDrag(boxRef,enabled,onDrop){
  const [drag,setDrag]=useState(null);
  const justDragged=useRef(false);
  const onDown=(e,id)=>{
    if(!enabled||(e.pointerType==="mouse"&&e.button!==0))return;
    if(e.target.closest&&e.target.closest("button,input,select,textarea,a"))return;
    const st={x:e.clientX,y:e.clientY,cx:e.clientX,cy:e.clientY,scrolled:0,sp:0,timer:null,moved:false,over:null};
    const unlock=lockOverscroll();
    const refresh=()=>{
      let over=null;
      for(const el of document.elementsFromPoint(st.cx,st.cy)){const t=el.closest&&el.closest("[data-widget]");if(t&&t.dataset.widget!==id&&boxRef.current&&boxRef.current.contains(t)){over=t.dataset.widget;break;}}
      st.over=over;setDrag({id,dx:st.cx-st.x,dy:st.cy-st.y+st.scrolled,over});
    };
    const scroller=()=>{let n=boxRef.current;while(n&&n!==document.body&&n!==document.documentElement){const o=getComputedStyle(n).overflowY;if((o==="auto"||o==="scroll")&&n.scrollHeight>n.clientHeight)return n;n=n.parentElement;}return null;};
    const move=(ev)=>{
      st.cx=ev.clientX;st.cy=ev.clientY;
      if(!st.moved&&Math.hypot(st.cx-st.x,st.cy-st.y)<7)return;
      st.moved=true;if(ev.cancelable)ev.preventDefault();
      refresh();
      st.sp=st.cy<70?-14:st.cy>window.innerHeight-70?14:0;
      if(st.sp&&!st.timer){st.timer=setInterval(()=>{
        if(!st.sp)return;
        const n=scroller();const b0=n?n.scrollTop:window.scrollY;
        if(n)n.scrollTop+=st.sp;else window.scrollBy(0,st.sp);
        st.scrolled+=(n?n.scrollTop:window.scrollY)-b0;refresh();
      },16);}
      if(!st.sp&&st.timer){clearInterval(st.timer);st.timer=null;}
    };
    const up=()=>{
      window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",up);
      if(st.timer)clearInterval(st.timer);unlock();
      if(st.moved){justDragged.current=true;setTimeout(()=>{justDragged.current=false;},0);if(st.over)onDrop(id,st.over);}
      setDrag(null);
    };
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",up);window.addEventListener("pointercancel",up);
  };
  return{drag,onDown,justDragged};
}

export function ManagementDashboard({transactions,legacy,isMobile,onQuickSale,onQuickProduct,onQuickTx,quickAction,onNavigate,onSearchGo,shopName}){
  const [,setTick]=useState(0);
  useDataSync(()=>setTick(t=>t+1));
  const [layout,setLayout]=useState(()=>getDashLayout());
  const [edit,setEdit]=useState(false);
  const [tileEditing,setTileEditing]=useState(false);
  const save=(l)=>{setLayout(l);lsWrite(DASH_KEY,l);};
  const today=todayIso();

  // ── data ──
  const sales=getSales().filter(s=>!s.cancelled);
  const todaySales=sales.filter(s=>s.date===today);
  const todayTx=transactions.filter(t=>t.date===today);
  const todayIncomeTx=todayTx.filter(t=>t.type==="income");
  const salesToday=todaySales.reduce((a,s)=>a+(s.total||0),0);
  const receivedToday=todayIncomeTx.reduce((a,t)=>a+Number(t.amount||0),0);
  const expenseToday=todayTx.filter(t=>t.type==="expense").reduce((a,t)=>a+Number(t.amount||0),0);
  const allSalesDash=getSales();
  const fToday=financeOf(d=>d===today,transactions,allSalesDash);
  const [finTab,setFinTab]=useState("month");
  const [cbTab,setCbTab]=useState("today");
  const [chTab,setChTab]=useState("sales");
  const todayJ=dateToJalali(today);
  const curMonthKey=isoToJKey(today,"monthly");
  const fFin=finTab==="today"?fToday:finTab==="month"?financeOf(d=>isoToJKey(d,"monthly")===curMonthKey,transactions,allSalesDash):financeOf(()=>true,transactions,allSalesDash);
  const fMonth=financeOf(d=>isoToJKey(d,"monthly")===curMonthKey,transactions,allSalesDash);
  const debtors=computeDebtors();
  const totalDebt=debtors.reduce((a,d)=>a+d.amount,0);
  const custToday=new Set([...todaySales.map(s=>"s"+s.id),...todayIncomeTx.filter(t=>!t.saleId).map(t=>"t"+(t.linkTxId||t.id))]).size;
  const byMethod={};todayIncomeTx.forEach(t=>{const k=t.method||"cash";byMethod[k]=(byMethod[k]||0)+Number(t.amount);});
  const from=layout.period==="all"?"":isoDaysAgo(Number(layout.period)||30);
  const stats=computeServiceStats(from);
  const topSellers=[...stats].sort((a,b)=>b.qty-a.qty).slice(0,5);
  const topProfit=[...stats].sort((a,b)=>b.profit-a.profit).slice(0,5);
  const stock=(lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY).filter(i=>Number(i.qty)<=Number(i.minQty)).sort((a,b)=>(Number(a.qty)-Number(a.minQty))-(Number(b.qty)-Number(b.minQty)));
  const obls=getObligations().filter(o=>o.status!=="done"&&(oblStatus(o)==="overdue"||oblStatus(o)==="soon")).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));
  const recent=[...transactions].sort((a,b)=>String(b.date).localeCompare(String(a.date))||(Number(b.id)||0)-(Number(a.id)||0)).slice(0,8);

  // ── small building blocks ──
  const Card=({title,icon,count,action,children})=>(
    <div style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",height:"100%",boxSizing:"border-box"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>{icon} {title}{count!=null&&<span style={{fontSize:11,color:"var(--text-muted)",fontWeight:400}}> ({toFA(count)})</span>}</div>
        {action}
      </div>
      {children}
    </div>
  );
  const row=(left,right,sub,color)=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,background:"var(--bg-app)",borderRadius:9,padding:"8px 11px",marginBottom:6}}>
      <div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{left}</div>{sub&&<div style={{fontSize:10,color:"var(--text-muted)",marginTop:1}}>{sub}</div>}</div>
      <div style={{fontSize:12,fontWeight:700,color:color||"var(--text-primary)",whiteSpace:"nowrap"}}>{right}</div>
    </div>
  );
  const empty=(t)=><div style={{textAlign:"center",color:"var(--text-dim)",fontSize:12,padding:"18px 0"}}>{t}</div>;
  const link=(label,tab)=><button onClick={()=>onNavigate(tab)} style={{background:"transparent",border:"none",color:"var(--accent-light)",fontSize:11,cursor:"pointer",fontFamily:"inherit",padding:0}}>{label} ←</button>;
  const periodSel=(
    <select value={layout.period} onChange={e=>save({...layout,period:e.target.value})} style={{background:"var(--bg-app)",color:"var(--text-secondary)",border:"1px solid var(--border)",borderRadius:7,fontSize:11,padding:"2px 6px",fontFamily:"inherit"}}>
      <option value="7">۷ روز</option><option value="30">۳۰ روز</option><option value="all">کل</option>
    </select>
  );
  const kpi=(label,val,color,sub,icon)=>(
    <div style={{background:"#ffffff1a",borderRadius:11,padding:"11px 13px"}}>
      <div style={{fontSize:11,color:"#cbd5e1",marginBottom:5}}>{icon} {label}</div>
      <div style={{fontSize:16,fontWeight:800,color:color||"#fff",whiteSpace:"nowrap"}}>{val}</div>
      {sub&&<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{sub}</div>}
    </div>
  );
  const rankList=(arr,key,color,fmt)=>arr.length===0?empty("هنوز فروشی در این بازه ثبت نشده"):arr.map((r,i)=>row(`${toFA(i+1)}. ${r.name}`,fmt(r),key==="qty"?`${fmtCompact(r.revenue)} درآمد`:`${toFA(r.qty)} فروش`,color));

  const attentionItems=()=>{
      const items=[];
      const add=(level,icon,text,tab)=>items.push({level,icon,text,tab});
      if(debtors.length>0)add(debtors.length>=1?"yellow":"info","🔴",`${toFA(debtors.length)} مشتری بدهکار — جمع ${fmtM(totalDebt)}`,"customers");
      const out0=stock.filter(i=>Number(i.qty)<=0).length;
      if(stock.length>0)add(out0>0?"red":"yellow","📦",`${toFA(stock.length)} قلم در آستانه اتمام${out0>0?` (${toFA(out0)} قلم تمام شده)`:""}: ${stock.slice(0,3).map(i=>i.name).join("، ")}${stock.length>3?" و ...":""}`,"inventory");
      buildFinancialAlerts().forEach(a=>{
        if(a.oblId){
          const o=getObligations().find(x=>String(x.id)===String(a.oblId));
          const rel=a.days<0?`${toFA(-a.days)} روز گذشته`:a.days===0?"امروز":a.days===1?"فردا":`تا ${toFA(a.days)} روز دیگر`;
          add(a.level,a.icon,`${o?o.title:"تعهد"}${o&&o.seq?` (${toFA(o.seq)}/${toFA(o.total)})`:""} ${a.recv?"(دریافتی) ":""}${rel} — ${fmtM(a.amount)}`,"obligations");
        }else add(a.level,"👤",a.text+` — ${fmtM(a.amount)}`,"customers");
      });
      try{const fu=collectFollowUps(),c=fuCounts(fu);if(c.overdue+c.today>0)add("yellow","🔔",`${toFA(c.overdue+c.today)} پیگیری مشتری برای امروز یا عقب‌افتاده`,"followups");}catch{}
      // today vs average
      const past=Array.from({length:30},(_,i)=>isoDaysAgo(i+1)).map(d=>financeOf(x=>x===d,transactions,allSalesDash).revenue).filter(v=>v>0);
      if(past.length>=3){
        const avg=past.reduce((a,b)=>a+b,0)/past.length,diff=Math.round((fToday.revenue-avg)/avg*100);
        if(Math.abs(diff)>=10)add(diff<0?"yellow":"good",diff<0?"📉":"📈",`فروش امروز ${toFA(Math.abs(diff))}٪ ${diff<0?"کمتر":"بیشتر"} از میانگین روزهای فروش (${fmtCompact(Math.round(avg))})${diff<0?" — تا این لحظه":""}`,"report");
      }
      const rank={red:0,yellow:1,blue:2,good:3,info:4};
      items.sort((a,b)=>(rank[a.level]??5)-(rank[b.level]??5));
      return items;
  };

  const body={
    quick:()=><DashTiles isMobile={isMobile} onQuickSale={onQuickSale} onQuickProduct={onQuickProduct} onQuickTx={onQuickTx} quickAction={quickAction} onEditChange={setTileEditing}
      live={{salesToday,receivedToday,expenseToday,salesCount:todaySales.length,orders:lsRead(ORDERS_STORAGE_KEY,[]).filter(o=>o.status!=="delivered").length,customers:lsRead(CUSTOMERS_STORAGE_KEY,[]).length,lowStock:stock.length,obls:obls.length,monthNet:fMonth.net,totalDebt,reminders:getReminders().filter(r=>r.status!=="done").length}}/>,
    today:()=>(
      <div style={{background:"linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2))",borderRadius:14,padding:"16px 18px",height:"100%",boxSizing:"border-box"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:12}}>📅 امروز · {jalaliLabel(today)}</div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,minmax(0,1fr))":"repeat(4,minmax(0,1fr))",gap:10}}>
          {kpi("درآمد (فروش) امروز",fmtM(fToday.revenue),"#fff",`${toFA(todaySales.length)} فاکتور`,"💵")}
          {kpi("دریافتی امروز",fmtM(fToday.received),"#86efac","نقد، کارتخوان و وصول بدهی","💳")}
          {kpi("هزینه مستقیم",fmtM(fToday.direct),"#fdba74","کاغذ، تونر، مواد مصرفی","🧾")}
          {kpi(fToday.gross>=0?"سود ناخالص":"زیان ناخالص",fmtM(Math.abs(fToday.gross)),fToday.gross>=0?"#4ade80":"#f87171","فروش − هزینه مستقیم",fToday.gross>=0?"🟢":"🔴")}
          {kpi("هزینه‌های جاری",fmtM(fToday.operating),"#fca5a5","اجاره، قبوض، حقوق، ...","💸")}
          {kpi(fToday.net>=0?"سود خالص":"زیان خالص",fmtM(Math.abs(fToday.net)),fToday.net>=0?"#22d3ee":"#fb923c","سود ناخالص − هزینه جاری",fToday.net>=0?"💎":"🔻")}
          {kpi("بدهی مشتریان",fmtM(totalDebt),totalDebt>0?"#fca5a5":"#86efac",`${toFA(debtors.length)} بدهکار`,"🔴")}
          {kpi("مشتری امروز",`${toFA(custToday)} نفر`,"#fff",null,"👥")}
        </div>
        {Object.keys(byMethod).length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>{Object.entries(byMethod).map(([k,v])=><span key={k} style={{background:"#ffffff1a",borderRadius:8,padding:"4px 10px",fontSize:11,color:"#e2e8f0"}}>{payLabel(k)}: <b>{fmtM(v)}</b></span>)}</div>}
      </div>
    ),
    finance:()=>{
      const f=fFin;
      const step=(label,val,color,sub,sign)=>(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-app)",borderRadius:9,padding:"9px 12px",marginBottom:6}}>
          <div><div style={{fontSize:13,fontWeight:600}}>{sign&&<span style={{color:"var(--text-muted)",marginLeft:6}}>{sign}</span>}{label}</div>{sub&&<div style={{fontSize:10,color:"var(--text-muted)",marginTop:1}}>{sub}</div>}</div>
          <div style={{fontSize:14,fontWeight:800,color,whiteSpace:"nowrap"}}>{fmtM(val)}</div>
        </div>);
      return(
        <Card title="عملکرد مالی" icon="📊" action={<div style={{display:"flex",gap:4}}>{[["today","امروز"],["month","این ماه"],["all","کل"]].map(([k,l])=><button key={k} onClick={()=>setFinTab(k)} style={{background:finTab===k?"var(--accent-light)":"var(--bg-app)",color:finTab===k?"#000":"var(--text-secondary)",border:"1px solid var(--border)",borderRadius:7,fontSize:11,padding:"2px 9px",cursor:"pointer",fontFamily:"inherit"}}>{l}</button>)}</div>}>
          <div data-testid="fin-chain">
            {step("درآمد (مجموع فروش)",f.revenue,"#60a5fa",`${toFA(f.count)} فاکتور فروش`)}
            {step("هزینه مستقیم",f.direct,"#fdba74","کاغذ، تونر، هزینه جانبی و ...","−")}
            {step("سود ناخالص",f.gross,f.gross>=0?"#4ade80":"#f87171",`حاشیه سود ناخالص: ${fmtPct(f.gross,f.revenue)}`,"=")}
            {step("هزینه‌های جاری",f.operating,"#fca5a5","اجاره، قبوض، حقوق و سایر هزینه‌ها","−")}
            {step(f.net>=0?"سود خالص":"زیان خالص",f.net,f.net>=0?"#22d3ee":"#fb923c",`حاشیه سود خالص: ${fmtPct(f.net,f.revenue)}`,"=")}
          </div>
          <div style={{fontSize:10,color:"var(--text-dim)",marginTop:6}}>درآمد بر اساس مبلغ فاکتورها (نه فقط پول دریافتی) محاسبه می‌شود. «دریافتی» در همان بازه: {fmtM(f.received)}</div>
        </Card>);
    },
    health:()=><HealthWidget onNavigate={onNavigate}/>,
    notes:()=><NotesWidget onNavigate={onNavigate}/>,
    search:()=><CafindWidget onGo={onSearchGo}/>,
    followups:()=>{
      const fl=collectFollowUps();const c=fuCounts(fl);
      const urgent=fl.filter(f=>{const b=fuBucket(f);return b==="overdue"||b==="today";}).sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||"")).slice(0,5);
      return(
      <Card title="پیگیری مشتریان" icon="🔔" action={link("همه پیگیری‌ها","followups")}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>امروز باید پیگیری شوند: {toFA(c.people)} نفر <span style={{fontSize:11,color:"var(--text-muted)",fontWeight:400}}>· 🔴 {toFA(c.overdue)} · 🟡 {toFA(c.today)} · 🟢 {toFA(c.future)}</span></div>
        {urgent.length===0?empty("پیگیری فوری‌ای نیست ✓"):urgent.map(f=>row(f.name,fuRel(f.dueDate),`${f.service||f.text||""}${f.status?" · "+f.status:""}`,FU_COL[fuBucket(f)]))}
      </Card>);
    },
    cashbox:()=>{
      const cbTx=transactions.filter(t=>cbTab==="today"?t.date===today:cbTab==="month"?isoToJKey(t.date,"monthly")===curMonthKey:true);
      return(
      <Card title="صندوق به تفکیک روش" icon="🏧" action={<div style={{display:"flex",gap:4}}>{[["today","امروز"],["month","این ماه"],["all","کل"]].map(([k,l])=><button key={k} onClick={()=>setCbTab(k)} style={{background:cbTab===k?"var(--accent-light)":"var(--bg-app)",color:cbTab===k?"#000":"var(--text-secondary)",border:"1px solid var(--border)",borderRadius:7,fontSize:11,padding:"2px 9px",cursor:"pointer",fontFamily:"inherit"}}>{l}</button>)}</div>}>
        {methodSummary(cbTx).length===0?empty("تراکنشی در این بازه نیست"):methodSummary(cbTx).map(r=>row(`${r.icon} ${r.label}`,fmtM(r.net),`دریافتی ${fmtCompact(r.inc)} · پرداختی ${fmtCompact(r.out)}`,r.net>=0?"#22d3ee":"#fb923c"))}
      </Card>);
    },
    club:()=>{
      const cc=getClubConfig(),ag=clubAggregate();
      const rs=lsRead(CUSTOMERS_STORAGE_KEY,[]).map(c=>({c,i:clubInfo(c,cc,ag)})).filter(r=>r.i.count>0).sort((a,b)=>b.i.spent-a.i.spent);
      return(<Card title="باشگاه مشتریان" icon="🏅" count={rs.length} action={link("باشگاه","customers")}>
        {rs.length===0?empty("هنوز فروشی برای ساخت باشگاه ثبت نشده"):<>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>{cc.tiers.map((t,k)=><span key={t.key} style={{fontSize:11,background:"var(--bg-app)",borderRadius:20,padding:"3px 10px"}}>{t.icon} {toFA(rs.filter(r=>r.i.idx===k).length)}</span>)}</div>
          {rs.slice(0,5).map(r=>row(`${r.i.tier.icon} ${r.c.firstName} ${r.c.lastName}`,fmtCompact(r.i.spent),`${toFA(r.i.count)} خرید · ⭐ ${toFA(r.i.points)}`,"#fbbf24"))}
        </>}
      </Card>);
    },
    topSellers:()=><Card title="۵ خدمت پرفروش" icon="🏆" action={periodSel}>{rankList(topSellers,"qty","#60a5fa",r=>`${toFA(r.qty)} عدد`)}</Card>,
    topProfit:()=><Card title="۵ خدمت پرسود" icon="💎" action={periodSel}>{rankList(topProfit,"profit","#4ade80",r=>fmtCompact(r.profit)+" سود")}</Card>,
    debtors:()=>(
      <Card title="بدهکاران" icon="🔴" count={debtors.length} action={link("حساب‌ها","ledger")}>
        {debtors.length===0?empty("بدهکاری وجود ندارد 🎉"):debtors.slice(0,5).map(d=>row(d.name,fmtM(d.amount),d.oldest?`از ${jalaliLabel(d.oldest)}`:"","#f87171"))}
        {debtors.length>5&&<div style={{fontSize:11,color:"var(--text-muted)",textAlign:"center"}}>و {toFA(debtors.length-5)} بدهکار دیگر</div>}
      </Card>
    ),
    lowStock:()=>(
      <Card title="موجودی‌های رو به اتمام" icon="📦" count={stock.length} action={link("انبار","inventory")}>
        {stock.length===0?empty("موجودی همه اقلام کافی است ✓"):stock.slice(0,6).map(i=>row(i.name,`${toFA(i.qty)} ${i.unit||""}`,`حد هشدار: ${toFA(i.minQty)}`,Number(i.qty)<=0?"#f87171":"#fbbf24"))}
      </Card>
    ),
    orders:()=>legacy.orders,
    alerts:()=><FinancialAlertsPanel onNavigate={onNavigate}/>,
    kpiToday:()=>{
      const exp=fToday.direct+fToday.operating,net=fToday.net;
      const cashRow=methodSummary(transactions).find(r=>r.key==="cash");
      const cashBal=cashRow?cashRow.net:0;
      const fY=financeOf(d=>d===isoDaysAgo(1),transactions,allSalesDash);
      const expY=fY.direct+fY.operating;
      const grid=isMobile?"repeat(2,minmax(0,1fr))":"repeat(auto-fit,minmax(150px,1fr))";
      return(<div style={{display:"grid",gridTemplateColumns:grid,gap:6}}>
        <KpiLiveTile tid="kpi-sales-today" label="فروش امروز" icon="💵" value={fmtM(fToday.revenue)} sub={`${toFA(todaySales.length)} فاکتور`} color="#2563eb" delay={0} onClick={()=>onNavigate("invoice")} back={[`دیروز: ${fmtM(fY.revenue)}`,`${kpiDelta(fToday.revenue,fY.revenue)} نسبت به دیروز`]}/>
        <KpiLiveTile tid="kpi-exp-today" label="هزینه امروز" icon="💸" value={fmtM(exp)} sub="مستقیم + جاری" color="#c2410c" delay={1500} onClick={()=>onNavigate("transactions")} back={[`دیروز: ${fmtM(expY)}`,`${kpiDelta(exp,expY)} نسبت به دیروز`]}/>
        <KpiLiveTile tid="kpi-profit-today" label={net>=0?"سود امروز":"زیان امروز"} icon={net>=0?"📈":"📉"} value={fmtM(Math.abs(net))} sub={`حاشیه ${fmtPct(net,fToday.revenue)}`} color={net>=0?"#15803d":"#b91c1c"} delay={3000} onClick={()=>onNavigate("report")} back={[`دیروز: ${fmtM(Math.abs(fY.net))}${fY.net<0?" (زیان)":""}`,`${kpiDelta(net,fY.net)} نسبت به دیروز`]}/>
        <KpiLiveTile tid="kpi-cash" label="مانده صندوق" icon="🏧" value={fmtM(cashBal)} sub="نقد در دست (جمع تجمعی)" color={cashBal>=0?"#0e7490":"#b91c1c"} delay={4500} onClick={()=>onNavigate("pos")} back={[`دریافتی امروز: ${fmtM(fToday.received)}`,`مشتری امروز: ${toFA(custToday)} نفر`]}/>
      </div>);
    },
    kpiMonth:()=>{
      const m=fMonth,exp=m.direct+m.operating,net=m.net;
      const [jy,jm]=todayJ;const pm=jm===1?12:jm-1,py=jm===1?jy-1:jy;
      const prevKey=isoToJKey(jalaliToIso(py,pm,1),"monthly");
      const fP=financeOf(d=>isoToJKey(d,"monthly")===prevKey,transactions,allSalesDash);
      const expP=fP.direct+fP.operating;
      const big=debtors.reduce((a,d)=>(!a||d.amount>a.amount)?d:a,null);
      const grid=isMobile?"repeat(2,minmax(0,1fr))":"repeat(auto-fit,minmax(150px,1fr))";
      return(<div style={{display:"grid",gridTemplateColumns:grid,gap:6}}>
        <KpiLiveTile tid="kpi-sales-month" label="فروش این ماه" icon="🗓️" value={fmtM(m.revenue)} sub={`${toFA(m.count)} فاکتور · ${JM[todayJ[1]-1]}`} color="#2563eb" delay={500} onClick={()=>onNavigate("report")} back={[`${JM[pm-1]}: ${fmtM(fP.revenue)}`,`${kpiDelta(m.revenue,fP.revenue)} نسبت به ماه قبل`]}/>
        <KpiLiveTile tid="kpi-exp-month" label="هزینه ماه" icon="🧾" value={fmtM(exp)} sub="مستقیم + جاری" color="#c2410c" delay={2000} onClick={()=>onNavigate("transactions")} back={[`${JM[pm-1]}: ${fmtM(expP)}`,`${kpiDelta(exp,expP)} نسبت به ماه قبل`]}/>
        <KpiLiveTile tid="kpi-profit-month" label={net>=0?"سود ماه":"زیان ماه"} icon={net>=0?"💎":"🔻"} value={fmtM(Math.abs(net))} sub={`حاشیه ${fmtPct(net,m.revenue)}`} color={net>=0?"#15803d":"#b91c1c"} delay={3500} onClick={()=>onNavigate("report")} back={[`${JM[pm-1]}: ${fmtM(Math.abs(fP.net))}${fP.net<0?" (زیان)":""}`,`${kpiDelta(net,fP.net)} نسبت به ماه قبل`]}/>
        <KpiLiveTile tid="kpi-debt" label="بدهی مشتریان" icon="🔴" value={fmtM(totalDebt)} sub={`${toFA(debtors.length)} بدهکار`} color={totalDebt>0?"#b91c1c":"#15803d"} delay={5000} onClick={()=>onNavigate("customers")} back={big?[`بیشترین بدهی: ${big.name}`,fmtM(big.amount)]:["بدهکاری وجود ندارد ✓"]}/>
      </div>);
    },
    charts:()=>{
      const tabs=[["sales","📈 فروش روزانه"],["profit","💎 سود روزانه"],["exp","💸 هزینه‌ها"],["cmp","🔁 مقایسه با ماه قبل"]];
      let chart=null,summary=null;
      if(chTab==="cmp"){
        const [jy,jm,jd]=todayJ;const pm=jm===1?12:jm-1,py=jm===1?jy-1:jy;
        const plen=jalaliMonthDays(py,pm),clen=jalaliMonthDays(jy,jm);
        const dayRev=(yy,mm,dd)=>financeOf(d=>d===jalaliToIso(yy,mm,dd),transactions,allSalesDash).revenue;
        let c=0,p=0;const cur=[],prev=[];
        for(let k=1;k<=Math.max(plen,clen);k++){
          if(k<=plen){p+=dayRev(py,pm,k);prev.push(p);}else prev.push(null);
          if(k<=jd){c+=dayRev(jy,jm,k);cur.push(c);}else cur.push(null);
        }
        const prevSame=prev[Math.min(jd,plen)-1]||0;
        const diff=prevSame>0?Math.round((c-prevSame)/prevSame*100):null;
        chart=<MiniChart type="line" labels={prev.map((_,i)=>toFA(i+1))} series={[{name:"ماه قبل",color:"#94a3b8",dash:"5 4",values:prev},{name:JM[jm-1],color:"#60a5fa",values:cur}]}/>;
        summary=<div data-testid="chart-summary" style={{fontSize:12,color:"var(--text-secondary)"}}>فروش تجمعی {JM[jm-1]}: <b style={{color:"#60a5fa"}}>{fmtM(c)}</b> · {JM[pm-1]} (تا همین روز): <b>{fmtM(prevSame)}</b>{diff!=null&&<> · <b style={{color:diff>=0?"#4ade80":"#f87171"}}>{toFA(Math.abs(diff))}٪ {diff>=0?"بیشتر":"کمتر"}</b></>}</div>;
      }else{
        const days=Array.from({length:30},(_,i)=>isoDaysAgo(29-i));
        const fin=days.map(d=>financeOf(x=>x===d,transactions,allSalesDash));
        const labels=days.map(d=>toFA(dateToJalali(d)[2]));
        if(chTab==="sales"){chart=<MiniChart labels={labels} series={[{name:"فروش",color:"#60a5fa",values:fin.map(f=>f.revenue)}]}/>;summary=<div data-testid="chart-summary" style={{fontSize:12,color:"var(--text-secondary)"}}>جمع ۳۰ روز اخیر: <b style={{color:"#60a5fa"}}>{fmtM(fin.reduce((a,f)=>a+f.revenue,0))}</b></div>;}
        if(chTab==="profit"){chart=<MiniChart labels={labels} series={[{name:"سود خالص",color:"#4ade80",values:fin.map(f=>f.net)}]}/>;const t=fin.reduce((a,f)=>a+f.net,0);summary=<div data-testid="chart-summary" style={{fontSize:12,color:"var(--text-secondary)"}}>جمع سود ۳۰ روز اخیر: <b style={{color:t>=0?"#4ade80":"#f87171"}}>{fmtM(t)}</b></div>;}
        if(chTab==="exp"){chart=<MiniChart stacked labels={labels} series={[{name:"هزینه مستقیم",color:"#fb923c",values:fin.map(f=>f.direct)},{name:"هزینه جاری",color:"#f87171",values:fin.map(f=>f.operating)}]}/>;summary=<div data-testid="chart-summary" style={{fontSize:12,color:"var(--text-secondary)"}}><span style={{color:"#fb923c"}}>■</span> مستقیم {fmtM(fin.reduce((a,f)=>a+f.direct,0))} · <span style={{color:"#f87171"}}>■</span> جاری {fmtM(fin.reduce((a,f)=>a+f.operating,0))}</div>;}
      }
      return(
        <Card title="نمودارها" icon="📊" action={<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{tabs.map(([k,l])=><button key={k} data-testid={`chart-tab-${k}`} onClick={()=>setChTab(k)} style={{background:chTab===k?"var(--accent-light)":"var(--bg-app)",color:chTab===k?"#0f172a":"var(--text-secondary)",border:"1px solid var(--border)",borderRadius:7,fontSize:11,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:chTab===k?700:400}}>{l}</button>)}</div>}>
          {chart}<div style={{marginTop:8}}>{summary}</div>
        </Card>);
    },
    insights:()=>{
      const ca=crmAggregate(),cc=getCrmConfig();
      const best=lsRead(CUSTOMERS_STORAGE_KEY,[]).map(c=>({c,s:crmStats(c,ca,cc)})).filter(r=>r.s.count>0).sort((a,b)=>b.s.spent-a.s.spent).slice(0,5);
      const monthTx=transactions.filter(t=>isoToJKey(t.date,"monthly")===curMonthKey&&t.type==="income");
      const ms=methodSummary(monthTx),msTot=ms.reduce((a,r)=>a+r.inc,0);
      const col=(title,tid,content)=>(
        <div data-testid={tid} style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 14px",minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>{title}</div>{content}
        </div>);
      return(<div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
        {col("🔥 پرفروش‌ترین خدمات","ins-services",topSellers.length===0?empty("فروشی ثبت نشده"):topSellers.map((r,i)=>row(`${toFA(i+1)}. ${r.name}`,`${toFA(r.qty)}`,`${fmtCompact(r.revenue)} درآمد`,"#fb923c")))}
        {col("👥 بهترین مشتریان","ins-customers",best.length===0?empty("هنوز مشتری‌ای خرید نکرده"):best.map((r,i)=>row(`${toFA(i+1)}. ${r.c.firstName||""} ${r.c.lastName||""}${r.s.golden?" ⭐":""}`,fmtCompact(r.s.spent),`${toFA(r.s.count)} خرید`,"#60a5fa")))}
        {col("💳 روش‌های پرداخت (این ماه)","ins-methods",ms.length===0?empty("دریافتی‌ای نیست"):ms.map(r=>row(`${r.icon} ${r.label}`,fmtCompact(r.inc),msTot>0?`${toFA(Math.round(r.inc/msTot*100))}٪ از دریافتی`:"","#22d3ee")))}
        {col("📦 اقلام کم‌موجودی","ins-stock",stock.length===0?empty("موجودی همه اقلام کافی است ✓"):stock.slice(0,5).map(i=>row(i.name,`${fmtQty(i.qty)} ${i.unit||""}`,`حد هشدار: ${fmtQty(i.minQty)}`,Number(i.qty)<=0?"#f87171":"#fbbf24")))}
      </div>);
    },
    attention:()=>{
      const items=attentionItems();
      const C={red:"#f87171",yellow:"#fbbf24",blue:"#60a5fa",good:"#4ade80",info:"var(--text-secondary)"};
      const urgent=items.filter(i=>i.level==="red"||i.level==="yellow"||i.level==="blue").length;
      return(
        <div data-testid="attention-box" style={{background:"var(--bg-card)",borderRadius:14,padding:"16px 18px",border:urgent?"1px solid #f59e0b66":"1px solid #16a34a55"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
            <div style={{fontSize:15,fontWeight:800,color:"#fbbf24"}}>⚠️ امروز چه چیزی نیاز به توجه دارد؟</div>
            <span style={{fontSize:11,color:"var(--text-muted)"}}>{urgent>0?`${toFA(urgent)} مورد`:"همه‌چیز مرتب است"}</span>
          </div>
          {items.length===0?<div data-testid="attention-empty" style={{textAlign:"center",color:"var(--text-dim)",fontSize:13,padding:"14px 0"}}>✅ امروز مورد فوری‌ای وجود ندارد</div>:(
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {items.map((it,i)=>(
                <button key={i} data-testid="attention-item" data-level={it.level} onClick={()=>onNavigate(it.tab)} style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-app)",border:"none",borderRight:`3px solid ${C[it.level]||"transparent"}`,borderRadius:9,padding:"9px 12px",cursor:"pointer",fontFamily:"inherit",textAlign:"right",color:"var(--text-primary)"}}>
                  <span style={{fontSize:16}}>{it.icon}</span><span style={{flex:1,fontSize:13,fontWeight:600}}>{it.text}</span><span style={{fontSize:11,color:"var(--accent-light)"}}>←</span>
                </button>))}
            </div>)}
        </div>);
    },
    obligations:()=>(
      <Card title="چک/تعهدات نزدیک سررسید" icon="🗓️" count={obls.length} action={link("تعهدات","obligations")}>
        {obls.length===0?empty("تعهد نزدیک یا عقب‌افتاده‌ای نیست ✓"):obls.slice(0,5).map(o=>{const d=daysUntil(o.dueDate);const k=oblKind(o.kind);return row(`${k.icon} ${o.title}`,fmtM(o.amount),`${jalaliLabel(o.dueDate)} · ${d<0?`${toFA(-d)} روز گذشته`:d===0?"امروز":`${toFA(d)} روز دیگر`}`,d<0?"#f87171":"#fbbf24");})}
      </Card>
    ),
    news:()=><NewsWidget/>,
    links:()=>{
      const ls=getLinksState();const fl=allLinks().filter(l=>ls.favs.includes(l.id));
      return(
      <Card title="لینک‌های مورد علاقه" icon="🔗" action={link("همه لینک‌ها","links")}>
        {fl.length===0?empty("لینکی ستاره‌دار نشده است"):<div style={{display:"flex",flexWrap:"wrap",gap:8}}>{fl.map(l=><button key={l.id} onClick={()=>openLink(l.url)} title={hostOf(l.url)} style={{background:"var(--bg-app)",color:"var(--text-primary)",border:"1px solid var(--border)",borderRadius:9,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{LINK_CAT_ICON[l.cat]||"🔗"} {l.title.replace(/\s*\(.*\)/,"")} ↗</button>)}</div>}
      </Card>);
    },
    recent:()=>(
      <Card title="آخرین تراکنش‌ها" icon="🧾" action={link("همه تراکنش‌ها","transactions")}>
        {recent.length===0?empty("هنوز تراکنشی ثبت نشده"):recent.map(t=>row(`${t.type==="income"?"💰":"💸"} ${t.category}`,`${t.type==="income"?"+":"−"}${fmtM(t.amount)}`,`${t.desc||"—"} · ${jalaliLabel(t.date)}`,t.type==="income"?"#4ade80":"#f87171"))}
      </Card>
    ),
    calendar:()=>legacy.calendar,compare:()=>legacy.compare,totals:()=>legacy.totals,trend:()=>legacy.trend,
    monthly:()=>legacy.monthly,bars:()=>legacy.bars,donuts:()=>legacy.donuts,ratio:()=>legacy.ratio,
  };

  // ── live tile summaries (computed only for widgets shown as small/medium tiles) ──
  const prevKey=()=>isoToJKey(isoDaysAgo(Number(todayJ[2])||1),"monthly");
  const liveOf=(id)=>{
    const cu=currencyLabel();
    const sum2=(r)=>[`فروش ${fmtCompact(r.revenue)}`,`هزینه ${fmtCompact(r.direct+r.operating)}`,`${r.net>=0?"سود":"زیان"} ${fmtCompact(Math.abs(r.net))}`];
    switch(id){
      case "today":return{big:fmtCompact(salesToday),sub:`فروش امروز (${cu})`,lines:[`${toFA(custToday)} مشتری امروز`,`دریافتی ${fmtCompact(receivedToday)}`,`هزینه ${fmtCompact(expenseToday)}`]};
      case "kpiToday":return{big:fmtCompact(fToday.net),sub:`${fToday.net>=0?"سود":"زیان"} امروز (${cu})`,lines:[`فروش ${fmtCompact(fToday.revenue)}`,`هزینه ${fmtCompact(fToday.direct+fToday.operating)}`,`${toFA(fToday.count)} فاکتور`]};
      case "kpiMonth":return{big:fmtCompact(fMonth.net),sub:`${fMonth.net>=0?"سود":"زیان"} این ماه (${cu})`,lines:[...sum2(fMonth).slice(0,2),`بدهی مشتریان ${fmtCompact(totalDebt)}`]};
      case "charts":return{big:fmtCompact(fMonth.revenue),sub:`فروش این ماه (${cu})`,lines:sum2(fMonth)};
      case "monthly":{const d=Math.max(1,Number(todayJ[2])||1);return{big:fmtCompact(fMonth.revenue),sub:`درآمد ${JM[todayJ[1]-1]} (${cu})`,lines:[`میانگین روزانه ${fmtCompact(Math.round(fMonth.revenue/d))}`,`${toFA(fMonth.count)} فاکتور`]};}
      case "trend":case "compare":{
        const pk=prevKey();const fp=financeOf(d=>isoToJKey(d,"monthly")===pk,transactions,allSalesDash);
        const ch=fp.revenue>0?Math.round((fMonth.revenue-fp.revenue)/fp.revenue*100):null;
        return{big:ch==null?fmtCompact(fMonth.revenue):`${ch>=0?"▲":"▼"} ${toFA(Math.abs(ch))}٪`,sub:ch==null?"فروش این ماه":"فروش نسبت به ماه قبل",lines:[`این ماه ${fmtCompact(fMonth.revenue)}`,`ماه قبل ${fmtCompact(fp.revenue)}`,`سود خالص ${fmtCompact(fMonth.net)} / ${fmtCompact(fp.net)}`]};}
      case "totals":{const a=financeOf(()=>true,transactions,allSalesDash);return{big:fmtCompact(a.net),sub:`${a.net>=0?"سود":"زیان"} خالص کل دوران (${cu})`,lines:[`درآمد ${fmtCompact(a.revenue)}`,`هزینه ${fmtCompact(a.direct+a.operating)}`]};}
      case "bars":return{big:fmtCompact(fMonth.revenue),sub:"درآمد این ماه",lines:[`هزینه ${fmtCompact(fMonth.direct+fMonth.operating)}`,`سود ناخالص ${fmtCompact(fMonth.gross)}`]};
      case "ratio":{const ex=fMonth.direct+fMonth.operating;return{big:ex>0?`${toFA((fMonth.revenue/ex).toFixed(1))}×`:"—",sub:"درآمد به هزینه (این ماه)",lines:[`درآمد ${fmtCompact(fMonth.revenue)}`,`هزینه ${fmtCompact(ex)}`]};}
      case "finance":return{big:fmtCompact(fFin.net),sub:`${fFin.net>=0?"سود":"زیان"} خالص (${cu})`,lines:[`درآمد ${fmtCompact(fFin.revenue)}`,`هزینه مستقیم ${fmtCompact(fFin.direct)}`,`سود ناخالص ${fmtCompact(fFin.gross)}`]};
      case "donuts":{const t=[...computeServiceStats("")].sort((a,b)=>b.revenue-a.revenue).slice(0,3);return{big:t[0]?t[0].name:"—",sub:"بیشترین سهم از درآمد",lines:t.map(r=>`${r.name}: ${fmtCompact(r.revenue)}`)};}
      case "cashbox":{const rows=methodSummary(transactions.filter(t=>t.date===today));const net=rows.reduce((a,r)=>a+r.net,0);return{big:fmtCompact(net),sub:`مانده امروز (${cu})`,lines:rows.slice(0,3).map(r=>`${r.icon} ${r.label}: ${fmtCompact(r.net)}`)};}
      case "health":{const l=getLastHealth();return l?{big:`${toFA(l.score)}`,sub:l.level==="ok"?"امتیاز سلامت — سالم":l.level==="warn"?"امتیاز سلامت — نیاز به توجه":"امتیاز سلامت — مشکل",lines:[`${toFA(l.summary.warn)} هشدار · ${toFA(l.summary.bad)} مشکل`,"برای بررسی دوباره کلیک کنید"]}:{big:"🩺",sub:"بررسی وضعیت کافینو",lines:["حساب‌ها، موجودی، بدهی، بکاپ…"]};}
      case "notes":{const op=getReminders().filter(r=>r.status!=="done");const du=dueReminders();return{big:toFA(du.length>0?du.length:op.length),sub:du.length>0?"یادآور سررسید شده":"یادآور باز",lines:(du.length>0?du:op).slice(0,3).map(r=>r.title)};}
      case "followups":{const fl=collectFollowUps();const c=fuCounts(fl);return{big:toFA(c.people),sub:"نفر برای پیگیری امروز",lines:[`🔴 ${toFA(c.overdue)} · 🟡 ${toFA(c.today)}`,...fl.filter(f=>{const b=fuBucket(f);return b==="overdue"||b==="today";}).slice(0,2).map(f=>f.name)]};}
      case "club":{const cc=getClubConfig(),ag=clubAggregate();const rs=lsRead(CUSTOMERS_STORAGE_KEY,[]).map(c=>({c,i:clubInfo(c,cc,ag)})).filter(r=>r.i.count>0).sort((a,b)=>b.i.spent-a.i.spent);return{big:toFA(rs.length),sub:"عضو فعال باشگاه",lines:rs.slice(0,3).map(r=>`${r.i.tier.icon} ${r.c.firstName} ${r.c.lastName}`)};}
      case "topSellers":return{big:topSellers[0]?topSellers[0].name:"—",sub:"پرفروش‌ترین خدمت",lines:topSellers.slice(0,3).map(r=>`${r.name}: ${toFA(r.qty)} عدد`)};
      case "topProfit":return{big:topProfit[0]?topProfit[0].name:"—",sub:"پرسودترین خدمت",lines:topProfit.slice(0,3).map(r=>`${r.name}: ${fmtCompact(r.profit)}`)};
      case "insights":return{big:topSellers[0]?topSellers[0].name:"—",sub:"پرفروش‌ترین خدمت",lines:[...topSellers.slice(0,2).map(r=>`${r.name}: ${toFA(r.qty)} عدد`),`${toFA(stock.length)} کالای رو به اتمام`]};
      case "debtors":return{big:toFA(debtors.length),sub:"مشتری بدهکار",lines:[`جمع ${fmtCompact(totalDebt)} ${cu}`,...[...debtors].sort((a,b)=>b.amount-a.amount).slice(0,2).map(d=>`${d.name}: ${fmtCompact(d.amount)}`)]};
      case "lowStock":return{big:toFA(stock.length),sub:"کالای رو به اتمام",lines:stock.slice(0,3).map(i=>`${i.name}: ${toFA(i.qty)} ${i.unit||""}`)};
      case "orders":{const act=lsRead(ORDERS_STORAGE_KEY,[]).filter(o=>o.status!=="delivered");return{big:toFA(act.length),sub:"سفارش باز",lines:act.slice(0,3).map(o=>o.title||"—")};}
      case "obligations":return{big:toFA(obls.length),sub:"تعهد نزدیک یا عقب‌افتاده",lines:obls.slice(0,3).map(o=>`${o.title} · ${jalaliLabel(o.dueDate)}`)};
      case "news":{const ns=getCachedNews(3);return{big:ns[0]?"📰":"—",sub:ns[0]?ns[0].title:"خبری ذخیره نشده — برای دیدن اخبار کلیک کنید",lines:ns.slice(1).map(n=>n.title)};}
      case "search":return{big:"🔍",sub:"جستجو در همه‌جا",lines:["مشتری، فاکتور، انبار…"]};
      case "alerts":{let al=[];try{al=buildFinancialAlerts();}catch{}return{big:toFA(al.length),sub:"هشدار مالی فعال",lines:al.slice(0,3).map(a=>a.text||a.title||"")};}
      case "attention":{const it=attentionItems();const urgent=it.filter(i=>i.level==="red"||i.level==="yellow"||i.level==="blue").length;return{big:urgent>0?toFA(urgent):"✓",sub:urgent>0?"مورد نیازمند توجه":"همه‌چیز مرتب است",lines:it.slice(0,3).map(i=>`${i.icon} ${i.text}`)};}
      case "recent":{const r0=recent[0];return{big:r0?`${r0.type==="income"?"+":"−"}${fmtCompact(r0.amount)}`:"—",sub:r0?`${r0.category} · ${jalaliLabel(r0.date)}`:"تراکنشی نیست",lines:recent.slice(1,4).map(t=>`${t.type==="income"?"+":"−"}${fmtCompact(t.amount)} ${t.category}`)};}
      case "links":{const ls=getLinksState();const fl=allLinks().filter(l=>ls.favs.includes(l.id));return{big:toFA(fl.length),sub:"لینک ستاره‌دار",lines:fl.slice(0,3).map(l=>l.title)};}
      case "calendar":return{big:toFA(todayJ[2]),sub:`${JM[todayJ[1]-1]} ${toFA(todayJ[0])} · ${WEEKDAYS_FA[new Date(today+"T00:00:00").getDay()]}`,lines:[]};
      default:return{big:"—",sub:"",lines:[]};
    }
  };

  const meta=(id)=>DASH_WIDGETS.find(w=>w.id===id);
  const tmeta=(id)=>WIDGET_TILE_META[id]||{color:"#475569",icon:"Info",short:(meta(id)||{}).title};
  const sizeOf=(id)=>{if(id==="quick")return"l";const v=layout.sizes[id]||meta(id).size;return WIDGET_SIZE_LEGACY[v]||v;};
  const visible=layout.order.filter(id=>!layout.hidden.includes(id));
  const hiddenIds=layout.order.filter(id=>layout.hidden.includes(id));
  const [selW,setSelW]=useState(null);
  const [expanded,setExpanded]=useState([]);
  const boxRef=useRef(null);
  const move=(id,dir)=>{
    if(id==="quick")return;                       // «مرکز عملیات» همیشه بالاست؛ ویجت‌ها فقط بین خودشان جابه‌جا می‌شوند
    const vis=visible.filter(x=>x!=="quick");const i=vis.indexOf(id);const j=i+dir;if(j<0||j>=vis.length)return;
    const a=layout.order.indexOf(id),b=layout.order.indexOf(vis[j]);
    const o=[...layout.order];[o[a],o[b]]=[o[b],o[a]];save({...layout,order:o});
  };
  const hide=(id)=>{save({...layout,hidden:[...layout.hidden,id]});if(selW===id)setSelW(null);};
  const show=(id)=>{save({...layout,hidden:layout.hidden.filter(x=>x!==id)});setSelW(id);};
  const setSize=(id,sz)=>save({...layout,sizes:{...layout.sizes,[id]:sz}});
  const moveTo=(id,targetId)=>{
    if(!targetId||id===targetId||id==="quick"||targetId==="quick")return;
    const o=layout.order.filter(x=>x!==id);const t=o.indexOf(targetId);if(t<0)return;
    o.splice(t,0,id);save({...layout,order:o});
  };
  const {drag,onDown,justDragged}=useWidgetDrag(boxRef,edit&&!tileEditing,moveTo);
  const cols=isMobile?2:4;
  const opsVisible=visible.includes("quick");
  const restVisible=visible.filter(x=>x!=="quick");
  const chip=(label,fn,extra,testid)=><button onClick={fn} data-testid={testid} style={{background:"var(--bg-app)",color:"var(--text-primary)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit",...extra}}>{label}</button>;
  const selMeta=selW&&visible.includes(selW)?tmeta(selW):null;
  const tileClick=(id)=>{
    if(justDragged.current)return;
    const m=tmeta(id);
    if(m.tab)onNavigate(m.tab);
    else setExpanded(x=>x.includes(id)?x.filter(y=>y!==id):[...x,id]);
  };

  const renderW=(id)=>{
          const m=tmeta(id);const sz0=sizeOf(id);
          const isExp=!edit&&expanded.includes(id)&&sz0!=="l";
          const sz=isExp?"l":sz0;
          const picked=edit&&selW===id;
          const isDrag=!!drag&&drag.id===id,isOver=!!drag&&drag.over===id;
          const span=sz==="s"?1:sz==="m"?Math.min(2,cols):cols;
          const common={"data-widget":id,"data-size":sz,style:{gridColumn:`span ${span}`,position:"relative",minWidth:0,borderRadius:sz==="l"?14:3,zIndex:isDrag?20:id==="search"?8:1,opacity:isDrag?0.85:1,pointerEvents:isDrag?"none":"auto",transform:isDrag?`translate(${drag.dx}px,${drag.dy}px) scale(1.02)`:"none",boxShadow:isDrag?"0 12px 30px #0009":isOver?"0 0 0 3px #fbbf24":picked?"0 0 0 3px #fff, 0 0 0 5px var(--accent)":"none"}};
          if(sz==="l")return (
            <div key={id} {...common} className="dw">
              {edit&&(
                <div data-testid={"wtile-handle-"+id} onPointerDown={e=>onDown(e,id)} onClick={()=>{if(!justDragged.current)setSelW(id);}} style={{background:m.color,color:"#fff",borderRadius:"3px 3px 0 0",padding:"6px 10px",display:"flex",alignItems:"center",gap:8,cursor:isDrag?"grabbing":"grab",touchAction:"none",fontSize:12,fontWeight:700,userSelect:"none"}}>
                  <span style={{opacity:.8}}>⠿</span><Icon name={m.icon} size={15}/><span style={{flex:1}}>{m.short}</span>
                  <button onClick={e=>{e.stopPropagation();hide(id);}} data-testid={"wtile-x-"+id} title="مخفی کردن" style={{width:20,height:20,lineHeight:"18px",padding:0,borderRadius:10,border:"none",background:"#000a",color:"#fff",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                </div>
              )}
              {isExp&&<button onClick={()=>setExpanded(x=>x.filter(y=>y!==id))} style={{background:m.color,color:"#fff",border:"none",borderRadius:"3px 3px 0 0",padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",textAlign:"start"}}>▲ جمع کردن به کاشی</button>}
              <div className="dw-card" style={(id==="kpiToday"||id==="kpiMonth")?{borderRadius:0}:{"--tc":m.color,borderTop:edit||isExp?"none":`3px solid ${m.color}`,borderRadius:edit||isExp?"0 0 14px 14px":14}}>{body[id]()}</div>
            </div>);
          return (
            <div key={id} {...common} className="dwt" role="button" tabIndex={0} title={m.short} aria-label={m.short}
              onPointerDown={e=>onDown(e,id)}
              onClick={()=>{if(justDragged.current)return;if(edit)setSelW(id);else tileClick(id);}}
              onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();edit?setSelW(id):tileClick(id);}}}
              style={{...common.style,"--tc":m.color,background:m.color,color:"#fff",minHeight:150,overflow:"hidden",cursor:edit?(isDrag?"grabbing":"grab"):"pointer",touchAction:edit?"none":"auto",userSelect:"none"}}>
              <WidgetTileFace meta={m} title={m.short} live={liveOf(id)} size={sz} paused={edit}/>
              {edit&&<button onClick={e=>{e.stopPropagation();hide(id);}} data-testid={"wtile-x-"+id} title="مخفی کردن" style={{position:"absolute",top:4,left:4,width:20,height:20,lineHeight:"18px",padding:0,borderRadius:10,border:"none",background:"#000a",color:"#fff",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕</button>}
            </div>);
  };
  return(
    <div data-testid="mgmt-dashboard">
      <style>{`.dw{display:flex;flex-direction:column;min-height:0}.dw-card{flex:1;min-width:0}.dw-card>div{margin-bottom:0!important;height:100%}
.wt-ic{display:inline-flex;align-self:flex-start;line-height:0;flex:none}.dwt{transition:filter .15s ease,box-shadow .15s ease}.dwt:hover{filter:brightness(1.1)}.dwt:active{transform:scale(.98)}
@media (prefers-reduced-motion:reduce){.dwt{transition:none}}`}</style>
      <div data-testid="brand-banner" style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,background:"linear-gradient(135deg,#1e3a8a,#2563eb 55%,#0ea5e9)",color:"#fff",borderRadius:14,padding:"12px 18px",marginBottom:12,boxShadow:"0 6px 18px #2563eb33"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
          <BrandLogo size={36}/>
          <div style={{minWidth:0}}>
            <div data-testid="brand-title" style={{fontSize:17,fontWeight:800,letterSpacing:.2}}>{APP_BRAND.fa} <span style={{opacity:.6,fontWeight:400}}>|</span> <span dir="ltr" style={{display:"inline-block",letterSpacing:1.5}}>{APP_BRAND.en}</span></div>
            <div style={{fontSize:12,opacity:.9,marginTop:2}}>{APP_BRAND.tagline}</div>
          </div>
        </div>
        <div dir="ltr" title="Cafe + Finance + Info" style={{fontSize:11,fontWeight:700,letterSpacing:1.2,background:"#ffffff22",borderRadius:20,padding:"4px 12px",whiteSpace:"nowrap"}}>CAFE + FINANCE + INFO</div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:800}}>📊 داشبورد مدیریتی{shopName?` — ${shopName}`:""}</div>
        <div style={{display:"flex",gap:8}}>
          {edit&&<button onClick={()=>save(defaultDashLayout())} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"6px 12px",fontSize:12}}>↺ بازنشانی چیدمان</button>}
          <button onClick={()=>{setEdit(e=>!e);setSelW(null);}} data-testid="dash-edit" style={{...BTN(edit?"#16a34a":"var(--bg-card)",edit?"#fff":"var(--text-secondary)"),border:edit?"none":"1px solid var(--border)",padding:"6px 14px",fontSize:12}}>{edit?"✓ پایان سفارشی‌سازی":"⚙️ سفارشی‌سازی"}</button>
        </div>
      </div>

      {edit&&(
        <>
          <div data-testid="widget-toolbar" style={{position:selMeta?"sticky":"static",top:72,zIndex:6,background:"var(--bg-card)",border:"1px dashed var(--accent-light)",borderRadius:12,padding:"10px 14px",boxShadow:selMeta?"0 6px 16px #0006":"none"}}>
            {!selMeta?(
              <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9}}>روی یک ویجت کلیک کنید تا انتخاب شود؛ سپس یکی از سه اندازه‌ی کوچک، متوسط (کاشی زنده) یا بزرگ (محتوای کامل) را بزنید. برای جابه‌جایی، ویجت را (با ماوس یا انگشت) بکشید و روی مقصد رها کنید، یا از «جلوتر/عقب‌تر» استفاده کنید. در ویجت‌های بزرگ، نوار رنگی بالای آن را بکشید.</div>
            ):(
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:12,fontWeight:700,color:"var(--accent-light)"}}>{selMeta.short}</span>
                {selW!=="quick"&&<span style={{display:"flex",gap:4}}>{["s","m","l"].map(k=>chip(WIDGET_SIZE_LABEL[k],()=>setSize(selW,k),sizeOf(selW)===k?{background:"var(--accent)",color:"#fff",borderColor:"transparent",fontWeight:700}:{},"wtile-size-"+k))}</span>}
                {selW!=="quick"&&<span style={{display:"flex",gap:4}}>{chip("→ جلوتر",()=>move(selW,-1),{},"wtile-prev")}{chip("عقب‌تر ←",()=>move(selW,1),{},"wtile-next")}</span>}
                {chip("✕ مخفی کردن",()=>hide(selW),{color:"#f87171"},"wtile-hide")}
              </div>
            )}
          </div>
          <div style={{background:"var(--bg-card)",borderRadius:12,padding:"10px 14px",margin:"8px 0 14px"}}>
            <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:6}}>ویجت‌های مخفی ({toFA(hiddenIds.length)}) — برای افزودن کلیک کنید:</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {hiddenIds.length===0&&<span style={{fontSize:11,color:"var(--text-dim)"}}>همه ویجت‌ها نمایش داده می‌شوند</span>}
              {hiddenIds.map(id=>{const m=tmeta(id);return <button key={id} onClick={()=>show(id)} data-add={id} style={{display:"flex",alignItems:"center",gap:6,background:m.color,color:"#fff",border:"none",borderRadius:3,padding:"6px 11px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}><Icon name={m.icon} size={14}/>＋ {m.short}</button>;})}
            </div>
          </div>
        </>
      )}

      {/* «مرکز عملیات» (کاشی‌های دسترسی سریع) بالا و جدا؛ همهٔ ویجت‌های دیگر داخل یک مستطیل با سرتیتر «مرکز گزارشات» */}
      <div ref={boxRef} data-testid="widget-area">
        {opsVisible&&<div data-testid="widget-grid-ops" style={{display:"grid",gridTemplateColumns:`repeat(${cols}, minmax(0,1fr))`,gridAutoFlow:"row dense",gap:10,alignItems:"stretch"}}>{renderW("quick")}</div>}
        {restVisible.length>0&&(
          <section data-testid="reports-center" className="reports-center" aria-label="مرکز گزارشات" style={{marginTop:opsVisible?16:0,border:"1px solid var(--border)",borderRadius:18,padding:"12px 12px 14px",background:"rgba(127,127,127,.07)"}}>
            <div data-testid="reports-center-title" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,margin:"0 4px 12px"}}>
              <h2 style={{margin:0,fontSize:15,fontWeight:800,display:"flex",alignItems:"center",gap:8}}><span aria-hidden="true">📊</span>مرکز گزارشات</h2>
              <span style={{fontSize:11,color:"var(--text-muted)"}}>{toFA(restVisible.length)} ویجت</span>
            </div>
            <div data-testid="widget-grid" style={{display:"grid",gridTemplateColumns:`repeat(${cols}, minmax(0,1fr))`,gridAutoFlow:"row dense",gap:10,alignItems:"stretch"}}>{restVisible.map(renderW)}</div>
          </section>
        )}
      </div>
      {visible.length===0&&<Empty text="همه ویجت‌ها مخفی هستند" sub="از «سفارشی‌سازی» ویجت‌ها را اضافه کنید"/>}
    </div>
  );
}
