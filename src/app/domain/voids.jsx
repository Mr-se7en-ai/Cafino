// Generated from App.jsx by the module split (v1.50.0). Section: voids
import React, { useState, useEffect, useRef } from "react";
import { logActivity } from "../core/activity.js";
import { audit, MIN_REASON } from "../../audit/auditTrail.js";
import { ReasonChips } from "../../audit/ReasonDialog.jsx";
import { fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "./backup.js";
import { BTN, CUSTOMERS_STORAGE_KEY, DEFAULT_INVENTORY, INP, INV_STORAGE, INV_STORAGE_KEY, LEDGER_STORAGE, TX_KEY, VOID_KINDS } from "../core/constants.js";
import { todayIso } from "../core/jalali.js";
import { ExportBar } from "../components/reportExport.jsx";
import { atomic, emitDataChange, lsRead, lsWrite, uid, useDataSync } from "./sales.jsx";
import { ReportTable } from "./topup.jsx";


// ══════════════════════════════════════════════════════════════════
// ابطال به‌جای حذف کامل — رکورد باطل‌شده از دفاتر فعال خارج می‌شود (در جمع و گزارش‌ها نمی‌آید)
// ولی با دلیل و زمان در بایگانی می‌ماند و (برای تراکنش، فاکتور دستی و سند) قابل بازگردانی است.
// ══════════════════════════════════════════════════════════════════
const VOID_KEY="cafenet_voided";

export function getVoided(){const v=lsRead(VOID_KEY,[]);return Array.isArray(v)?v:[];}

export function archiveVoid(kind,record,reason,meta){
  const e={id:uid(),kind,record,reason:String(reason||"").trim(),voidedAt:Date.now(),date:todayIso(),title:"",amount:0,...meta};
  lsWrite(VOID_KEY,[e,...getVoided()]);
  audit({action:kind==="tx"?"tx_void":kind==="entry"?"entry_void":"invoice_void",label:"ابطال "+VOID_KINDS[kind],entityType:VOID_KINDS[kind],entityId:e.number||e.id,entityLabel:e.title,amount:e.amount,reason:e.reason,before:{kind,amount:e.amount},details:`شناسهٔ بایگانی: ${e.id}`});
  emitDataChange();
  return e;
}

export function voidTx(t,linked,reason){
  return archiveVoid("tx",{tx:t,linked:linked||[]},reason,{title:`${t.type==="income"?"درآمد":"هزینه"}: ${t.category}${t.desc?` — ${t.desc}`:""}`,amount:Number(t.amount)||0});
}

export function voidInvoice(iv,reason){return atomic("voidInvoice",()=>voidInvoiceCore(iv,reason));}

function voidInvoiceCore(iv,reason){
  if((iv.stockUsed||[]).length){
    const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
    iv.stockUsed.forEach(u=>{const it=stock.find(x=>String(x.id)===String(u.itemId));if(it)it.qty=Math.round(((Number(it.qty)||0)+(Number(u.qty)||0))*10000)/10000;});
    lsWrite(INV_STORAGE_KEY,stock);
  }
  return archiveVoid("invoice",{invoice:iv},reason,{title:`فاکتور ${iv.number} — ${iv.customerName||"—"}`,amount:Number(iv.totalAmount)||0,number:iv.number});
}

export function voidEntry(accId,entry,reason){
  const acc=lsRead(LEDGER_STORAGE,[]).find(a=>String(a.id)===String(accId));
  const cust=acc&&acc.customerId!=null?lsRead(CUSTOMERS_STORAGE_KEY,[]).find(c=>String(c.id)===String(acc.customerId)):null;
  return archiveVoid("entry",{accId,entry},reason,{accId,title:`${entry.category} — ${entry.desc||""}${cust?` (${cust.firstName} ${cust.lastName})`:""}`,amount:Number(entry.amount)||0});
}

export function restoreVoided(id){return atomic("restoreVoided",()=>restoreVoidedCore(id));}

function restoreVoidedCore(id){
  const list=getVoided();const e=list.find(x=>x.id===id);
  if(!e||e.restoredAt)return{ok:false,error:"این مورد قابل بازگردانی نیست"};
  if(e.kind==="tx"){
    const {tx,linked}=e.record;const cur=lsRead(TX_KEY,[]);
    if(cur.some(t=>t.id===tx.id))return{ok:false,error:"این تراکنش قبلاً برگشته است"};
    if((tx.stockUsed||[]).length){const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;tx.stockUsed.forEach(u=>{const it=stock.find(x=>String(x.id)===String(u.itemId));if(it)it.qty=Math.max(0,Math.round(((Number(it.qty)||0)-u.qty)*10000)/10000);});lsWrite(INV_STORAGE_KEY,stock);}
    lsWrite(TX_KEY,[...cur,tx,...(linked||[])]);
  }else if(e.kind==="invoice"){
    const iv=e.record.invoice;const cur=lsRead(INV_STORAGE,[]);
    if(cur.some(x=>x.id===iv.id))return{ok:false,error:"این فاکتور قبلاً برگشته است"};
    if((iv.stockUsed||[]).length){
      const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
      for(const u of iv.stockUsed){const it=stock.find(x=>String(x.id)===String(u.itemId));if(!it||Number(it.qty)<Number(u.qty))return{ok:false,error:`موجودی کافی برای بازگردانی ${it?.name||"کالا"} نیست`};}
      iv.stockUsed.forEach(u=>{const it=stock.find(x=>String(x.id)===String(u.itemId));it.qty=Math.round(((Number(it.qty)||0)-(Number(u.qty)||0))*10000)/10000;});
      lsWrite(INV_STORAGE_KEY,stock);
    }
    lsWrite(INV_STORAGE,[iv,...cur]);
  }else if(e.kind==="entry"){
    const accs=lsRead(LEDGER_STORAGE,[]);const acc=accs.find(a=>String(a.id)===String(e.record.accId));
    if(!acc)return{ok:false,error:"حساب این سند دیگر وجود ندارد"};
    acc.entries=[...(acc.entries||[]),e.record.entry];lsWrite(LEDGER_STORAGE,accs);
  }else return{ok:false,error:"فروش‌های باطل‌شده قابل بازگردانی نیستند؛ فروش را دوباره ثبت کنید"};
  lsWrite(VOID_KEY,list.map(x=>x.id===id?{...x,restoredAt:Date.now()}:x));
  audit({action:"void_restore",label:"بازگردانی "+VOID_KINDS[e.kind],entityType:VOID_KINDS[e.kind],entityId:e.number||e.id,entityLabel:e.title,amount:e.amount,reason:e.reason?`ابطال اولیه: ${e.reason}`:"",details:`شناسهٔ بایگانی: ${e.id}`});
  emitDataChange();
  return{ok:true};
}

export function VoidModal({title,desc,onConfirm,onClose,z=220}){
  const [reason,setReason]=useState("");
  return(
    <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:z,padding:12}}>
      <div data-testid="void-modal" style={{background:"var(--bg-card)",borderRadius:16,padding:24,width:"100%",maxWidth:360,textAlign:"center"}}>
        <div style={{fontSize:34,marginBottom:8}}>🚫</div>
        <div style={{fontWeight:700,marginBottom:8}}>{title}</div>
        <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:12,lineHeight:1.9}}>{desc}</div>
        <ReasonChips presets={["اشتباه در ثبت","درخواست مشتری","ثبت تکراری","خطای قیمت/مبلغ"]} onPick={setReason}/>
        <input data-testid="void-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="دلیل ابطال (الزامی)" maxLength={300} style={{...INP,marginTop:0,marginBottom:14,textAlign:"right"}}/>
        <div style={{display:"flex",gap:10}}>
          <button data-testid="void-confirm" disabled={reason.trim().length<MIN_REASON} onClick={()=>onConfirm(reason.trim())} style={{...BTN("#dc2626"),flex:1,opacity:reason.trim().length<MIN_REASON?.45:1,cursor:reason.trim().length<MIN_REASON?"not-allowed":"pointer"}}>ابطال</button>
          <button onClick={onClose} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>انصراف</button>
        </div>
      </div>
    </div>);
}

function voidedRows(list){
  return list.map(e=>[jalaliLabel(e.date),VOID_KINDS[e.kind],e.title,e.amount||0,e.reason||"—",e.restoredAt?"بازگردانی شد":"باطل"]);
}

export function VoidedPanel({kinds,accId,title="🚫 ابطال‌شده‌ها"}){
  const [list,setList]=useState(getVoided);
  useDataSync(()=>setList(getVoided()));
  const [open,setOpen]=useState(false);
  const [msg,setMsg]=useState("");
  const items=list.filter(e=>kinds.includes(e.kind)&&(accId==null||String(e.accId)===String(accId)));
  if(!items.length)return null;
  const active=items.filter(e=>!e.restoredAt).length;
  return(
    <div data-testid="voided-panel" style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px",marginTop:16}}>
      <button data-testid="voided-toggle" onClick={()=>setOpen(o=>!o)} style={{background:"transparent",border:"none",color:"var(--text-secondary)",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,padding:0}}>{open?"▾":"◂"} {title} ({toFA(active)})</button>
      {open&&<div style={{marginTop:10}}>
        {msg&&<div style={{fontSize:12,color:"#f87171",marginBottom:8}}>{msg}</div>}
        {items.map(e=>{const canRestore=!e.restoredAt&&e.kind!=="sale";return(
          <div key={e.id} data-testid="voided-row" style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",background:"var(--bg-app)",borderRadius:9,padding:"8px 11px",marginBottom:6,fontSize:12,opacity:e.restoredAt?0.55:1}}>
            <div style={{minWidth:0}}>
              <div style={{textDecoration:e.restoredAt?"none":"line-through",color:"var(--text-muted)",lineHeight:1.7}}>{e.title}{e.amount?` · ${fmtM(e.amount)}`:""}</div>
              <div style={{fontSize:10,color:"var(--text-dim)"}}>{VOID_KINDS[e.kind]} · ابطال در {jalaliLabel(e.date)}{e.reason?` · دلیل: ${e.reason}`:""}{e.restoredAt?" · بازگردانی شد":""}</div>
            </div>
            {canRestore&&<button data-testid="void-restore" onClick={()=>{const r=restoreVoided(e.id);setMsg(r.ok?"":r.error);}} style={{...BTN("#2563eb"),padding:"5px 10px",fontSize:11,flexShrink:0}}>بازگردانی</button>}
          </div>);})}
      </div>}
    </div>);
}

export function VoidedReport(){
  const [list,setList]=useState(getVoided);
  useDataSync(()=>setList(getVoided()));
  const [kind,setKind]=useState("all");
  const shown=list.filter(e=>kind==="all"||e.kind===kind);
  const sec={name:"اسناد و تراکنش‌های باطل‌شده",head:["تاریخ ابطال","نوع","شرح","مبلغ (ریال)","دلیل ابطال","وضعیت"],rows:voidedRows(shown),money:[3]};
  return(
    <div data-testid="voided-report">
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {[["all","همه"],...Object.entries(VOID_KINDS)].map(([k,l])=><button key={k} onClick={()=>setKind(k)} style={{...BTN(kind===k?"#2563eb":"var(--bg-card)",kind===k?"#fff":"var(--text-secondary)"),padding:"7px 12px",fontSize:12}}>{l}</button>)}
      </div>
      <ExportBar title="گزارش ابطال‌شده‌ها" fileBase="voided" sections={[sec]} kpis={[["تعداد باطل‌شده",toFA(shown.filter(e=>!e.restoredAt).length)],["جمع مبالغ",fmtM(shown.filter(e=>!e.restoredAt).reduce((a,e)=>a+(e.amount||0),0))]]}/>
      <ReportTable s={sec}/>
      <div style={{fontSize:11,color:"var(--text-dim)",lineHeight:1.9}}>موارد باطل‌شده در جمع فروش، درآمد، هزینه و سایر گزارش‌ها حساب نمی‌شوند. بازگردانی تراکنش، فاکتور دستی و سند از پنل «ابطال‌شده‌ها» همان بخش انجام می‌شود.</div>
    </div>);
}
