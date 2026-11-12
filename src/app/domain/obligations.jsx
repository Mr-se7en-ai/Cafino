// Generated from App.jsx by the module split (v1.50.0). Section: obligations
import React, { useState, useEffect, useRef } from "react";
import { logActivity } from "../core/activity.js";
import { fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "./backup.js";
import { BTN, CUSTOMERS_STORAGE_KEY, INP, LEDGER_STORAGE, OBL_KEY, TX_KEY, latinDigits } from "../core/constants.js";
import { PayrollPanel } from "./payrollUI.jsx";
import { JalaliPicker } from "../components/controls.jsx";
import { dateToJalali, jalaliMonthDays, jalaliToIso, todayIso } from "../core/jalali.js";
import { emitDataChange, getSales, lsRead, lsWrite, saleRemaining, uid, useDataSync } from "./sales.jsx";
import { Empty } from "../components/ui.jsx";
import { voidTx } from "./voids.jsx";


// ══════════════════════════════════════════════════════════════════
// OBLIGATIONS (اقساط، چک‌ها و اجاره) — due-date reminders linked to accounting
// ══════════════════════════════════════════════════════════════════

const OBL_KINDS=[
  {key:"installment",label:"قسط",icon:"💳",txCat:{pay:"اقساط",receive:"اقساط دریافتی"},series:true},
  {key:"cheque",label:"چک",icon:"🧾",txCat:{pay:"چک پرداختی",receive:"چک دریافتی"},series:false},
  {key:"rent",label:"اجاره",icon:"🏠",txCat:{pay:"اجاره",receive:"اجاره دریافتی"},series:true},
  {key:"renewal",label:"تمدید سرویس",icon:"🔄",txCat:{pay:"تمدید سرویس",receive:"سایر"},series:true},
  {key:"salary",label:"حقوق کارمندان",icon:"👷",txCat:{pay:"حقوق کارمند",receive:"سایر"},series:true},
  {key:"other",label:"سایر",icon:"📌",txCat:{pay:"سایر هزینه",receive:"سایر"},series:false},
];

export function oblKind(k){return OBL_KINDS.find(x=>x.key===k)||OBL_KINDS[3];}

export function getObligations(){return lsRead(OBL_KEY,[]);}

export function saveObligations(list){lsWrite(OBL_KEY,list);emitDataChange();}

function jalaliMonthLen(jy,jm){return jalaliMonthDays(jy,jm);}

function addJalaliMonths(iso,k){
  const[jy,jm,jd]=dateToJalali(iso);
  const t=jy*12+(jm-1)+k;const ny=Math.floor(t/12),nm=t%12+1;
  return jalaliToIso(ny,nm,Math.min(jd,jalaliMonthLen(ny,nm)));
}

export function daysUntil(iso){
  const a=new Date(todayIso()+"T00:00:00"),b=new Date(iso+"T00:00:00");
  return Math.round((b-a)/86400000);
}

export function oblStatus(o){
  if(o.status==="done")return"done";
  const d=daysUntil(o.dueDate);
  if(d<0)return"overdue";
  if(d<=(Number(o.remindDays)||3))return"soon";
  return"future";
}

export function settleObligation(id,undo=false){
  const list=getObligations();
  const o=list.find(x=>String(x.id)===String(id));if(!o)return;
  if(!undo&&o.status!=="done"){
    const k=oblKind(o.kind);const date=todayIso();
    const tx={id:uid(),type:o.dir==="receive"?"income":"expense",category:k.txCat[o.dir]||"سایر",amount:o.amount,desc:`${k.label}${o.dir==="receive"?" دریافتی":""}: ${o.title}${o.party?` — ${o.party}`:""}${o.seq?` (${toFA(o.seq)}/${toFA(o.total)})`:""}`,date,method:"cash",oblId:o.id};
    lsWrite(TX_KEY,[...lsRead(TX_KEY,[]),tx]);
    saveObligations(list.map(x=>x.id===o.id?{...x,status:"done",paidDate:date,txId:tx.id}:x));
    logActivity(o.dir==="receive"?"دریافت تعهد":"پرداخت تعهد",`${k.label} — ${o.title} — ${fmtM(o.amount)}`);
  }else if(undo&&o.status==="done"){
    {const cur=lsRead(TX_KEY,[]);cur.filter(t=>String(t.id)===String(o.txId)||String(t.oblId)===String(o.id)).forEach(t=>voidTx(t,[],"برگشت وضعیت تعهد"));lsWrite(TX_KEY,cur.filter(t=>String(t.id)!==String(o.txId)&&String(t.oblId)!==String(o.id)));}
    saveObligations(list.map(x=>x.id===o.id?{...x,status:"pending",paidDate:"",txId:null}:x));
  }
}

// ───────── Financial alerts (سیستم هشدار مالی) ─────────
const ALERT_CFG_KEY="cafenet_alert_cfg";

function getAlertCfg(){
  const v=lsRead(ALERT_CFG_KEY,null)||{};
  const n=(x,d)=>Number.isFinite(Number(x))&&Number(x)>=0&&x!==""&&x!=null?Math.floor(Number(x)):d;
  const red=n(v.redDays,1);
  return{redDays:red,yellowDays:Math.max(red,n(v.yellowDays,7)),recvDays:n(v.recvDays,3)};
}

function alertWhen(d){
  if(d<0)return `${toFA(-d)} روز گذشته`;
  if(d===0)return"امروز";
  if(d===1)return"فردا";
  return `${toFA(d)} روز دیگر`;
}

const ALERT_LEVELS={red:{dot:"🔴",color:"#f87171",bg:"#450a0a",rank:0,label:"فوری"},yellow:{dot:"🟡",color:"#fbbf24",bg:"#451a03",rank:1,label:"نزدیک"},blue:{dot:"🔵",color:"#60a5fa",bg:"#172554",rank:2,label:"طلب"}};

export function buildFinancialAlerts(){
  const cfg=getAlertCfg();
  const out=[];
  getObligations().filter(o=>o.status!=="done"&&o.dueDate).forEach(o=>{
    const d=daysUntil(o.dueDate),k=oblKind(o.kind);
    const title=`${o.title}${o.seq?` (${toFA(o.seq)}/${toFA(o.total)})`:""}`;
    if(o.dir==="receive"){
      if(d<=Math.max(cfg.recvDays,Number(o.remindDays)||0))out.push({key:"o"+o.id,level:"blue",days:d,amount:o.amount,icon:k.icon,tab:"obligations",oblId:o.id,recv:true,
        text:d<0?`${k.label} دریافتی سررسید شد: ${title}${o.party?` — ${o.party}`:""}`:`${alertWhen(d)}: ${k.label} دریافتی ${title}${o.party?` — ${o.party}`:""}`});
    }else{
      const lvl=d<=cfg.redDays?"red":d<=Math.max(cfg.yellowDays,Number(o.remindDays)||0)?"yellow":null;
      if(lvl)out.push({key:"o"+o.id,level:lvl,days:d,amount:o.amount,icon:k.icon,tab:"obligations",oblId:o.id,text:`${alertWhen(d)}: ${title}`});
    }
  });
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  const nameOf=id=>{const c=customers.find(x=>String(x.id)===String(id));return c?`${c.firstName||""} ${c.lastName||""}`.trim():"مشتری";};
  const byCust={};
  getSales().filter(s=>!s.cancelled&&s.customerId!=null&&s.dueDate&&saleRemaining(s)>0).forEach(s=>{
    const d=daysUntil(s.dueDate);if(d>cfg.recvDays)return;
    const o=byCust[s.customerId]||(byCust[s.customerId]={amount:0,days:d});
    o.amount+=saleRemaining(s);o.days=Math.min(o.days,d);
  });
  lsRead(LEDGER_STORAGE,[]).forEach(a=>{
    if(a.customerId==null)return;
    (a.entries||[]).forEach(e=>{
      if(e.saleId!=null||e.category!=="بدهکار"||!e.reminderDate||!(Number(e.amount)>0))return;
      const d=daysUntil(e.reminderDate);if(d>cfg.recvDays)return;
      const o=byCust[a.customerId]||(byCust[a.customerId]={amount:0,days:d});
      o.amount+=Number(e.amount)||0;o.days=Math.min(o.days,d);
    });
  });
  Object.keys(byCust).forEach(cid=>{
    const o=byCust[cid];
    out.push({key:"c"+cid,level:"blue",days:o.days,amount:o.amount,icon:"👤",tab:"customers",customerId:cid,recv:true,
      text:o.days<0?`طلب مشتری ${nameOf(cid)} سررسید شد`:`${alertWhen(o.days)}: طلب مشتری ${nameOf(cid)}`});
  });
  return out.sort((a,b)=>ALERT_LEVELS[a.level].rank-ALERT_LEVELS[b.level].rank||a.days-b.days);
}

export function FinancialAlertsPanel({onNavigate,compact}){
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const [all,setAll]=useState(false);
  const [cfgOpen,setCfgOpen]=useState(false);
  const [cfg,setCfg]=useState(()=>getAlertCfg());
  const items=buildFinancialAlerts();
  const cnt=l=>items.filter(i=>i.level===l).length;
  const shown=all?items:items.slice(0,compact?5:8);
  const saveCfg=()=>{lsWrite(ALERT_CFG_KEY,{redDays:cfg.redDays,yellowDays:cfg.yellowDays,recvDays:cfg.recvDays});setCfg(getAlertCfg());setCfgOpen(false);emitDataChange();};
  const nf=(k,l)=><label style={{fontSize:11,color:"var(--text-muted)",display:"flex",alignItems:"center",gap:6}}>{l}<input data-testid={`alert-cfg-${k}`} inputMode="numeric" value={cfg[k]} onChange={e=>setCfg({...cfg,[k]:latinDigits(e.target.value).replace(/\D/g,"")})} style={{...INP,marginTop:0,width:56,padding:"4px 6px",textAlign:"center"}}/>روز</label>;
  return(
    <div data-testid="fin-alerts" style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",borderRight:`4px solid ${cnt("red")?"#f87171":cnt("yellow")?"#fbbf24":cnt("blue")?"#60a5fa":"#4ade80"}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>🚨 هشدارهای مالی
          <span style={{marginRight:10,display:"inline-flex",gap:8,fontSize:11,fontWeight:700}}>
            {["red","yellow","blue"].map(l=>cnt(l)>0&&<span key={l} data-testid={`alert-count-${l}`} style={{background:ALERT_LEVELS[l].bg,color:ALERT_LEVELS[l].color,borderRadius:20,padding:"2px 9px"}}>{ALERT_LEVELS[l].dot} {toFA(cnt(l))}</span>)}
          </span>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <button data-testid="alert-cfg-btn" onClick={()=>setCfgOpen(o=>!o)} title="تنظیم زمان‌بندی هشدارها" style={{background:"transparent",border:"none",color:"var(--text-muted)",cursor:"pointer",fontSize:14,padding:0}}>⚙️</button>
          {onNavigate&&<button onClick={()=>onNavigate("obligations")} style={{background:"transparent",border:"none",color:"var(--accent-light)",fontSize:11,cursor:"pointer",fontFamily:"inherit",padding:0}}>تعهدات ←</button>}
        </div>
      </div>
      {cfgOpen&&(
        <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px",marginBottom:10,display:"flex",gap:14,flexWrap:"wrap",alignItems:"center"}}>
          {nf("redDays","🔴 فوری تا")}{nf("yellowDays","🟡 نزدیک تا")}{nf("recvDays","🔵 طلب تا")}
          <button data-testid="alert-cfg-save" onClick={saveCfg} style={{...BTN("#2563eb"),padding:"5px 12px",fontSize:12}}>ذخیره</button>
        </div>
      )}
      {items.length===0?<div data-testid="alert-empty" style={{textAlign:"center",color:"var(--text-dim)",fontSize:12,padding:"14px 0"}}>✅ هشدار مالی فعالی نیست — همه‌چیز سر وقت است</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {shown.map(a=>{const L=ALERT_LEVELS[a.level];return(
            <div key={a.key} data-testid="alert-row" data-level={a.level} style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-app)",borderRadius:9,padding:"8px 11px",flexWrap:"wrap"}}>
              <span style={{fontSize:15}}>{L.dot}</span>
              <div style={{flex:"1 1 180px",minWidth:0,fontSize:13,fontWeight:600,color:a.level==="red"?L.color:"var(--text-primary)"}}>{a.text}</div>
              <div style={{fontSize:12,fontWeight:700,color:L.color,whiteSpace:"nowrap"}}>{fmtM(a.amount)}</div>
              {a.oblId&&<button data-testid="alert-settle" onClick={()=>{settleObligation(a.oblId);}} style={{...BTN("#166534"),padding:"4px 10px",fontSize:11}}>✔ {a.recv?"دریافت شد":"پرداخت شد"}</button>}
              {a.customerId&&onNavigate&&<button data-testid="alert-open" onClick={()=>onNavigate(a.tab)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"4px 10px",fontSize:11}}>مشتریان</button>}
            </div>);})}
          {items.length>shown.length&&<button onClick={()=>setAll(true)} style={{background:"transparent",border:"none",color:"var(--accent-light)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>نمایش همه ({toFA(items.length)}) ↓</button>}
          {all&&items.length>(compact?5:8)&&<button onClick={()=>setAll(false)} style={{background:"transparent",border:"none",color:"var(--text-muted)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>کمتر ↑</button>}
        </div>
      )}
    </div>
  );
}

export function ObligationsSection({onNavigate}={}){
  const [list,setList]=useState(()=>getObligations());
  useDataSync(()=>setList(getObligations()));
  const [kindF,setKindF]=useState("all");
  const [statF,setStatF]=useState("pending");
  const [modal,setModal]=useState(null);
  const [del,setDel]=useState(null);
  const [payrollOpen,setPayrollOpen]=useState(false);
  const blank=()=>({id:null,kind:"installment",dir:"pay",title:"",party:"",amount:"",dueDate:todayIso(),count:"1",chequeNo:"",bank:"",remindDays:"3",note:""});

  const pending=list.filter(o=>o.status!=="done");
  const sum=(arr)=>arr.reduce((s,o)=>s+(Number(o.amount)||0),0);
  const overdue=pending.filter(o=>oblStatus(o)==="overdue");
  const soon=pending.filter(o=>oblStatus(o)==="soon");
  const next30=pending.filter(o=>{const d=daysUntil(o.dueDate);return d>=0&&d<=30;});
  const payTotal=sum(pending.filter(o=>o.dir==="pay")),recvTotal=sum(pending.filter(o=>o.dir==="receive"));

  const shown=list.filter(o=>(kindF==="all"||o.kind===kindF)&&(statF==="all"||(statF==="pending"?o.status!=="done":o.status==="done")))
    .sort((a,b)=>statF==="done"?String(b.paidDate||"").localeCompare(String(a.paidDate||"")):String(a.dueDate).localeCompare(String(b.dueDate)));

  const save=()=>{
    const f=modal;const amount=Number(f.amount)||0;
    if(!f.title.trim()||amount<=0||!f.dueDate)return;
    const k=oblKind(f.kind);
    if(f.id){
      setList(prev=>{const n=prev.map(o=>o.id===f.id?{...o,kind:f.kind,dir:f.dir,title:f.title.trim(),party:f.party.trim(),amount,dueDate:f.dueDate,chequeNo:f.chequeNo,bank:f.bank,remindDays:Number(f.remindDays)||3,note:f.note}:o);saveObligations(n);return n;});
    }else{
      const cnt=k.series?Math.max(1,Math.min(120,Number(f.count)||1)):1;
      const gid=cnt>1?uid():null;
      const items=Array.from({length:cnt},(_,i)=>({id:uid(),kind:f.kind,dir:f.dir,title:f.title.trim(),party:f.party.trim(),amount,dueDate:i===0?f.dueDate:addJalaliMonths(f.dueDate,i),status:"pending",chequeNo:f.chequeNo,bank:f.bank,remindDays:Number(f.remindDays)||3,note:f.note,groupId:gid,seq:cnt>1?i+1:0,total:cnt>1?cnt:0}));
      const n=[...list,...items];saveObligations(n);setList(n);
      logActivity("ثبت تعهد",`${k.label} — ${f.title.trim()}${cnt>1?` (${toFA(cnt)} ماه)`:""}`);
    }
    setModal(null);
  };
  const remove=(o,all)=>{
    const n=list.filter(x=>all&&o.groupId?!(x.groupId===o.groupId&&x.status!=="done"):x.id!==o.id);
    if(o.status==="done"){const cur=lsRead(TX_KEY,[]);cur.filter(t=>String(t.oblId)===String(o.id)).forEach(t=>voidTx(t,[],"حذف تعهد"));lsWrite(TX_KEY,cur.filter(t=>String(t.oblId)!==String(o.id)));}
    saveObligations(n);setList(n);setDel(null);
  };
  const stBadge=(o)=>{
    const st=oblStatus(o);const d=daysUntil(o.dueDate);
    if(st==="done")return{bg:"#052e16",fg:"#4ade80",text:`${o.dir==="receive"?"دریافت":"پرداخت"} شد · ${jalaliLabel(o.paidDate)}`};
    if(st==="overdue")return{bg:"#450a0a",fg:"#f87171",text:`${toFA(-d)} روز گذشته`};
    if(d===0)return{bg:"#451a03",fg:"#fbbf24",text:"امروز"};
    if(st==="soon")return{bg:"#451a03",fg:"#fbbf24",text:`${toFA(d)} روز دیگر`};
    return{bg:"var(--bg-app)",fg:"var(--text-muted)",text:`${toFA(d)} روز دیگر`};
  };
  const card=(label,val,sub,color)=>(
    <div style={{flex:"1 1 150px",background:"var(--bg-card)",borderRadius:12,padding:"12px 14px",borderTop:`3px solid ${color}`}}>
      <div style={{fontSize:11,color:"var(--text-muted)"}}>{label}</div>
      <div style={{fontSize:16,fontWeight:800,color,marginTop:4}}>{val}</div>
      <div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>{sub}</div>
    </div>
  );
  const chip=(active,label,onClick)=><button key={label} onClick={onClick} style={{...BTN(active?"#2563eb":"var(--bg-card)",active?"#fff":"var(--text-secondary)"),padding:"6px 14px",fontSize:12}}>{label}</button>;
  const mk=modal?oblKind(modal.kind):null;
  // نمای جدا: فرم تعهد و حقوق کارمندان در یک «صفحهٔ» مستقل با دکمهٔ بازگشت باز می‌شوند (نه زیر فهرست)
  const view=payrollOpen?"payroll":modal?"form":"list";
  useEffect(()=>{try{window.scrollTo({top:0});}catch{}},[view]);
  const goBack=()=>{setPayrollOpen(false);setModal(null);};
  const backBar=(title)=>(
    <div data-testid="obl-viewbar" style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      <button data-testid="obl-back" onClick={goBack} style={{...BTN("var(--bg-card)","var(--text-primary)"),border:"1px solid var(--border)",padding:"8px 16px",fontSize:13,display:"flex",alignItems:"center",gap:6}}><span aria-hidden="true">→</span>بازگشت به تعهدات</button>
      <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>{title}</div>
    </div>);

  return(
    <div data-testid="obligations-root" data-view={view}>
      {view==="payroll"&&<div data-testid="obl-payroll-view">{backBar("👷 حقوق کارمندان")}<PayrollPanel onClose={goBack} onSettle={(id,undo)=>{settleObligation(id,undo);setList(getObligations());}}/></div>}
      {view==="form"&&backBar(modal.id?"✏️ ویرایش تعهد":"＋ تعهد جدید")}
      {view==="list"&&<>
      <div style={{marginBottom:16}}><FinancialAlertsPanel onNavigate={onNavigate} compact/></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
        {card("سررسید گذشته",fmtM(sum(overdue)),`${toFA(overdue.length)} مورد`,overdue.length?"#f87171":"#4ade80")}
        {card("نزدیک سررسید",fmtM(sum(soon)),`${toFA(soon.length)} مورد`,"#fbbf24")}
        {card("۳۰ روز آینده",fmtM(sum(next30)),`${toFA(next30.length)} مورد`,"#60a5fa")}
        {card("کل پرداختی‌ها",fmtM(payTotal),"در انتظار پرداخت","#f472b6")}
        {recvTotal>0&&card("کل دریافتنی‌ها",fmtM(recvTotal),"در انتظار دریافت","#4ade80")}
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:14}}>
        {chip(kindF==="all","همه",()=>setKindF("all"))}
        {OBL_KINDS.map(k=>chip(kindF===k.key,`${k.icon} ${k.label}`,()=>setKindF(k.key)))}
        <span style={{flex:1}}/>
        {chip(statF==="pending","در انتظار",()=>setStatF("pending"))}
        {chip(statF==="done","انجام‌شده",()=>setStatF("done"))}
        {chip(statF==="all","همه وضعیت‌ها",()=>setStatF("all"))}
        <button data-testid="open-payroll" onClick={()=>setPayrollOpen(o=>!o)} style={{...BTN(payrollOpen?"#2563eb":"#7c3aed"),padding:"7px 16px"}}>👷 حقوق کارمندان</button>
        <button onClick={()=>setModal(blank())} style={{...BTN("#16a34a"),padding:"7px 16px"}}>＋ تعهد جدید</button>
      </div>

      {shown.length===0
        ?<Empty text="موردی ثبت نشده" sub="اقساط، چک‌ها و اجاره را با «＋ تعهد جدید» اضافه کنید"/>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {shown.map(o=>{
            const k=oblKind(o.kind);const b=stBadge(o);const done=o.status==="done";
            return(
              <div key={o.id} style={{background:"var(--bg-card)",borderRadius:11,padding:"11px 14px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",opacity:done?0.75:1,borderRight:`4px solid ${o.dir==="receive"?"#4ade80":"#f472b6"}`}}>
                <div style={{fontSize:22}}>{k.icon}</div>
                <div style={{flex:"1 1 160px",minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700}}>{o.title}{o.seq>0&&<span style={{fontSize:11,color:"var(--text-muted)",fontWeight:400}}> — {toFA(o.seq)} از {toFA(o.total)}</span>}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>
                    {k.label} {o.dir==="receive"?"دریافتی":"پرداختی"}{o.party?` · ${o.party}`:""}{o.chequeNo?` · شماره چک ${toFA(o.chequeNo)}`:""}{o.bank?` · ${o.bank}`:""}
                  </div>
                  {o.note&&<div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>📝 {o.note}</div>}
                </div>
                <div style={{textAlign:"center",minWidth:90}}>
                  <div style={{fontSize:14,fontWeight:800,color:o.dir==="receive"?"#4ade80":"var(--text-primary)"}}>{fmtM(o.amount)}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)"}}>سررسید {jalaliLabel(o.dueDate)}</div>
                </div>
                <span style={{background:b.bg,color:b.fg,borderRadius:20,padding:"3px 11px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{b.text}</span>
                <div style={{display:"flex",gap:6}}>
                  {!done
                    ?<button onClick={()=>{settleObligation(o.id);setList(getObligations());}} style={{...BTN("#166534"),padding:"5px 12px",fontSize:12}}>✔ {o.dir==="receive"?"دریافت شد":"پرداخت شد"}</button>
                    :<button onClick={()=>{settleObligation(o.id,true);setList(getObligations());}} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"5px 12px",fontSize:12}}>↩ بازگردانی</button>}
                  {!done&&<button onClick={()=>setModal({...blank(),...o,amount:String(o.amount),count:"1",remindDays:String(o.remindDays||3)})} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"5px 10px",fontSize:12}}>✏️</button>}
                  <button onClick={()=>setDel(o)} style={{...BTN("#450a0a","#f87171"),padding:"5px 10px",fontSize:12}}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>}
      </>}

      {view==="form"&&(
        <div data-testid="obligation-form" style={{background:"var(--bg-card)",borderRadius:12,padding:18,border:"1px solid var(--border)",maxWidth:720}}>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><div style={{fontWeight:700,color:"var(--accent-light)"}}>{modal.id?"ویرایش تعهد":"تعهد جدید"}</div><button type="button" onClick={()=>setModal(null)} aria-label="بستن فرم" style={{...BTN("var(--border)","var(--text-secondary)"),padding:"4px 10px"}}>×</button></div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {OBL_KINDS.map(k=><button key={k.key} onClick={()=>setModal(m=>({...m,kind:k.key,dir:k.key==="cheque"?m.dir:(k.key==="other"?m.dir:"pay"),count:oblKind(k.key).series?(k.key==="rent"?"12":m.count):"1"}))} style={{...BTN(modal.kind===k.key?"#2563eb":"var(--bg-app)",modal.kind===k.key?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12}}>{k.icon} {k.label}</button>)}
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              {[["pay","📤 پرداختی (ما می‌پردازیم)"],["receive","📥 دریافتی (ما می‌گیریم)"]].map(([v,l])=><button key={v} onClick={()=>setModal(m=>({...m,dir:v}))} style={{...BTN(modal.dir===v?(v==="pay"?"#9d174d":"#166534"):"var(--bg-app)",modal.dir===v?"#fff":"var(--text-secondary)"),flex:1,padding:"6px 8px",fontSize:12}}>{l}</button>)}
            </div>
            <label style={{fontSize:11,color:"var(--text-muted)"}}>عنوان<input value={modal.title} onChange={e=>setModal(m=>({...m,title:e.target.value}))} placeholder={modal.kind==="rent"?"مثلاً: اجاره مغازه":modal.kind==="cheque"?"مثلاً: چک تأمین‌کننده کاغذ":"مثلاً: قسط دستگاه کپی"} style={INP}/></label>
            <label style={{fontSize:11,color:"var(--text-muted)",display:"block",marginTop:8}}>طرف حساب (اختیاری)<input value={modal.party} onChange={e=>setModal(m=>({...m,party:e.target.value}))} style={INP}/></label>
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <label style={{flex:1,fontSize:11,color:"var(--text-muted)"}}>{mk.series&&!modal.id?"مبلغ هر ماه (ریال)":"مبلغ (ریال)"}<input type="number" value={modal.amount} onChange={e=>setModal(m=>({...m,amount:e.target.value}))} style={INP}/></label>
              {mk.series&&!modal.id&&<label style={{width:110,fontSize:11,color:"var(--text-muted)"}}>تعداد ماه<input type="number" min="1" max="120" value={modal.count} onChange={e=>setModal(m=>({...m,count:e.target.value}))} style={INP}/></label>}
            </div>
            {mk.series&&!modal.id&&Number(modal.count)>1&&Number(modal.amount)>0&&<div style={{fontSize:11,color:"var(--accent-light)",marginTop:6}}>جمع کل: {fmtM(Number(modal.amount)*Number(modal.count))} در {toFA(modal.count)} ماه، هر ماه در همین روز</div>}
            {modal.kind==="cheque"&&(
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <label style={{flex:1,fontSize:11,color:"var(--text-muted)"}}>شماره چک<input value={modal.chequeNo} onChange={e=>setModal(m=>({...m,chequeNo:e.target.value}))} style={INP}/></label>
                <label style={{flex:1,fontSize:11,color:"var(--text-muted)"}}>بانک<input value={modal.bank} onChange={e=>setModal(m=>({...m,bank:e.target.value}))} style={INP}/></label>
              </div>
            )}
            <div style={{marginTop:8}}>
              <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:4}}>{mk.series&&!modal.id?"تاریخ اولین سررسید":"تاریخ سررسید"}</div>
              <JalaliPicker value={modal.dueDate} onChange={d=>setModal(m=>({...m,dueDate:d}))}/>
            </div>
            <label style={{fontSize:11,color:"var(--text-muted)",display:"block",marginTop:8}}>چند روز قبل از سررسید یادآوری شود
              <input type="number" min="0" value={modal.remindDays} onChange={e=>setModal(m=>({...m,remindDays:e.target.value}))} style={INP}/></label>
            <label style={{fontSize:11,color:"var(--text-muted)",display:"block",marginTop:8}}>یادداشت<input value={modal.note} onChange={e=>setModal(m=>({...m,note:e.target.value}))} style={INP}/></label>
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={save} style={{...BTN("#2563eb"),flex:1}}>ذخیره</button>
              <button onClick={()=>setModal(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button>
            </div>
        </div>
      )}
      {del&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:22,width:340,maxWidth:"100%",textAlign:"center"}}>
            <div style={{fontSize:34,marginBottom:8}}>🗑️</div>
            <div style={{fontWeight:700,marginBottom:6}}>حذف «{del.title}»</div>
            {del.status==="done"&&<div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:8}}>تراکنش ثبت‌شده برای آن هم حذف می‌شود.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:12}}>
              <button onClick={()=>remove(del,false)} style={{...BTN("#dc2626")}}>حذف همین مورد</button>
              {del.groupId&&<button onClick={()=>remove(del,true)} style={{...BTN("#7f1d1d")}}>حذف همه اقساط/ماه‌های انجام‌نشده این سری</button>}
              <button onClick={()=>setDel(null)} style={{...BTN("var(--border)","var(--text-primary)")}}>لغو</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
