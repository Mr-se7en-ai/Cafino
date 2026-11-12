// Generated from App.jsx by the module split (v1.50.0). Section: followups
import React, { useState, useEffect, useRef } from "react";
import { fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { BTN, CUSTOMERS_STORAGE_KEY, FU_COL, FU_STATUSES, INP } from "../core/constants.js";
import { JalaliPicker, SearchableSelect } from "../components/controls.jsx";
import { isoAdd } from "./dashboard.jsx";
import { todayIso } from "../core/jalali.js";
import { daysUntil } from "../domain/obligations.jsx";
import { createId, emitDataChange, getSales, lsRead, lsWrite, saleRemaining, useDataSync } from "../domain/sales.jsx";
import { Empty } from "../components/ui.jsx";


const FU_LABEL={overdue:"🔴 عقب‌افتاده",today:"🟡 امروز",future:"🟢 آینده",none:"⚪ بدون تاریخ",done:"✅ انجام‌شده"};

export function fuBucket(f){if(f.done)return"done";if(!f.dueDate)return"none";const t=todayIso();return f.dueDate<t?"overdue":f.dueDate===t?"today":"future";}

export function fuRel(iso){
  if(!iso)return"بدون تاریخ";
  const d=daysUntil(iso);
  return d===0?"امروز":d===1?"فردا":d===2?"پس‌فردا":d===-1?"دیروز":d>2?`${toFA(d)} روز دیگر`:`${toFA(-d)} روز گذشته`;
}

export function collectFollowUps(){
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);const out=[];
  const nm=c=>`${c.firstName||""} ${c.lastName||""}`.trim()||"—";
  customers.forEach(c=>(c.followUps||[]).forEach(f=>out.push({...f,custId:c.id,name:nm(c),phone:c.phone||"",auto:false})));
  getSales().filter(s=>!s.cancelled&&s.customerId!=null&&s.dueDate&&saleRemaining(s)>0).forEach(s=>{
    const c=customers.find(x=>String(x.id)===String(s.customerId));if(!c)return;
    out.push({id:"debt"+s.id,auto:true,custId:c.id,name:nm(c),phone:c.phone||"",service:s.title||`فاکتور ${toFA(s.number||"")}`,status:"منتظر پرداخت",text:`باقی‌مانده ${fmtM(saleRemaining(s))}`,dueDate:s.dueDate,done:false,createdAt:s.date});
  });
  return out;
}

export function fuCounts(list){
  const c={overdue:0,today:0,future:0,none:0,done:0};list.forEach(f=>{c[fuBucket(f)]++;});
  const people=new Set(list.filter(f=>{const b=fuBucket(f);return b==="overdue"||b==="today";}).map(f=>String(f.custId))).size;
  return{...c,people};
}

function fuUpdate(custId,fid,patch){
  const all=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  lsWrite(CUSTOMERS_STORAGE_KEY,all.map(c=>String(c.id)!==String(custId)?c:{...c,followUps:(c.followUps||[]).map(f=>f.id===fid?{...f,...patch}:f)}));emitDataChange();
}

function fuDelete(custId,fid){
  const all=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  lsWrite(CUSTOMERS_STORAGE_KEY,all.map(c=>String(c.id)!==String(custId)?c:{...c,followUps:(c.followUps||[]).filter(f=>f.id!==fid)}));emitDataChange();
}

export function FollowUpsSection(){
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const [filter,setFilter]=useState("active"); // active|all|overdue|today|future|none|done
  const [statusF,setStatusF]=useState("all");
  const [q,setQ]=useState("");
  const [adding,setAdding]=useState(false);
  const [snooze,setSnooze]=useState(null);
  const [form,setForm]=useState({custId:"",service:"",status:"منتظر مدرک",date:isoAdd(todayIso(),1),note:""});
  const [err,setErr]=useState("");
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  const all=collectFollowUps();
  const cnt=fuCounts(all);
  const today=todayIso();
  const services=[...new Set([...all.map(f=>f.service).filter(Boolean),...getSales().flatMap(s=>(s.lines||[]).map(l=>l.category)).filter(Boolean)])];
  const matches=f=>{
    const b=fuBucket(f);
    if(filter==="active"&&b==="done")return false;
    if(!["active","all"].includes(filter)&&b!==filter)return false;
    if(statusF!=="all"&&(f.status||"")!==statusF)return false;
    if(q.trim()&&!`${f.name} ${f.service||""} ${f.text||""} ${f.status||""} ${f.phone||""}`.includes(q.trim()))return false;
    return true;
  };
  const order={overdue:0,today:1,future:2,none:3,done:4};
  const list=all.filter(matches).sort((a,b)=>order[fuBucket(a)]-order[fuBucket(b)]||(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
  const add=()=>{
    if(!form.custId){setErr("مشتری را انتخاب کنید.");return;}
    if(!form.service.trim()&&!form.note.trim()){setErr("خدمت یا یادداشت را بنویسید.");return;}
    const entry={id:createId("rec"),text:form.note.trim(),service:form.service.trim(),status:form.status,dueDate:form.date||"",done:false,createdAt:today};
    const all2=lsRead(CUSTOMERS_STORAGE_KEY,[]);
    lsWrite(CUSTOMERS_STORAGE_KEY,all2.map(c=>String(c.id)!==String(form.custId)?c:{...c,followUps:[...(c.followUps||[]),entry]}));emitDataChange();
    setErr("");setAdding(false);setForm({custId:"",service:"",status:"منتظر مدرک",date:isoAdd(today,1),note:""});
  };
  const chip=(k,l,n,col)=><button key={k} data-testid={"fu-chip-"+k} onClick={()=>setFilter(k)} style={{...BTN(filter===k?"#2563eb":"var(--bg-card)",filter===k?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12,border:"1px solid var(--border)"}}>{l}{n!=null&&<b style={{marginRight:6,color:filter===k?"#fff":col}}>{toFA(n)}</b>}</button>;
  const quick=(label,days)=><button key={label} onClick={()=>setForm(f=>({...f,date:isoAdd(today,days)}))} style={{...BTN(form.date===isoAdd(today,days)?"#2563eb":"var(--bg-app)",form.date===isoAdd(today,days)?"#fff":"var(--text-secondary)"),padding:"5px 10px",fontSize:11,border:"1px solid var(--border)"}}>{label}</button>;
  return(
    <div data-testid="followups">
      <div style={{background:"linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2))",borderRadius:14,padding:"16px 20px",marginBottom:14}}>
        <div data-testid="fu-headline" style={{fontSize:18,fontWeight:800,color:"#fff"}}>امروز باید پیگیری شوند: {toFA(cnt.people)} نفر</div>
        <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:8,fontSize:13}}>
          <span style={{color:FU_COL.overdue}}>🔴 عقب‌افتاده: <b>{toFA(cnt.overdue)}</b></span>
          <span style={{color:FU_COL.today}}>🟡 امروز: <b>{toFA(cnt.today)}</b></span>
          <span style={{color:FU_COL.future}}>🟢 آینده: <b>{toFA(cnt.future)}</b></span>
        </div>
        <div style={{fontSize:11,color:"#cbd5e1",marginTop:6}}>«نفر» = مشتریانی که پیگیری‌شان عقب‌افتاده یا برای امروز است.</div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10,alignItems:"center"}}>
        <input data-testid="fu-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="جستجوی مشتری، خدمت یا وضعیت..." style={{...INP,marginTop:0,flex:1,minWidth:180}}/>
        <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{...INP,marginTop:0,width:"auto"}}><option value="all">همه وضعیت‌ها</option>{FU_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <button data-testid="fu-add" onClick={()=>setAdding(a=>!a)} style={BTN("#16a34a")}>{adding?"× بستن":"+ پیگیری جدید"}</button>
      </div>
      {adding&&(
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
            <div><div style={{fontSize:12,color:"var(--text-muted)",marginBottom:4}}>مشتری</div>
              <SearchableSelect options={customers.map(c=>({value:String(c.id),label:`${c.firstName||""} ${c.lastName||""}`.trim()||"—",group:null}))} value={form.custId} placeholder="جستجوی مشتری..." onChange={v=>setForm(f=>({...f,custId:v}))}/></div>
            <label style={{fontSize:12,color:"var(--text-muted)"}}>خدمت<input data-testid="fu-service" list="fu-services" value={form.service} onChange={e=>setForm(f=>({...f,service:e.target.value}))} placeholder="مثلاً ثبت‌نام دانشگاه" style={INP}/><datalist id="fu-services">{services.map(s=><option key={s} value={s}/>)}</datalist></label>
            <label style={{fontSize:12,color:"var(--text-muted)"}}>وضعیت<input data-testid="fu-status" list="fu-statuses" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={INP}/><datalist id="fu-statuses">{FU_STATUSES.map(s=><option key={s} value={s}/>)}</datalist></label>
            <div><div style={{fontSize:12,color:"var(--text-muted)",marginBottom:4}}>تاریخ پیگیری</div><JalaliPicker value={form.date} onChange={d=>setForm(f=>({...f,date:d}))}/>
              <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>{quick("امروز",0)}{quick("فردا",1)}{quick("۳ روز بعد",3)}{quick("هفته بعد",7)}</div></div>
          </div>
          <label style={{display:"block",fontSize:12,color:"var(--text-muted)",marginTop:10}}>یادداشت (اختیاری)<input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="مثلاً: کارت ملی و عکس لازم دارد" style={INP}/></label>
          {err&&<div style={{color:"#fca5a5",fontSize:12,marginTop:8}}>{err}</div>}
          <button data-testid="fu-save" onClick={add} style={{...BTN("#2563eb"),marginTop:12}}>ثبت پیگیری</button>
        </div>)}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {chip("active","فعال",cnt.overdue+cnt.today+cnt.future+cnt.none,"#fff")}{chip("overdue","🔴 عقب‌افتاده",cnt.overdue,FU_COL.overdue)}{chip("today","🟡 امروز",cnt.today,FU_COL.today)}{chip("future","🟢 آینده",cnt.future,FU_COL.future)}{chip("none","⚪ بدون تاریخ",cnt.none,FU_COL.none)}{chip("done","✅ انجام‌شده",cnt.done,FU_COL.done)}
      </div>
      {list.length===0?<Empty text="پیگیری‌ای پیدا نشد" sub={all.length===0?"با «+ پیگیری جدید» اولین پیگیری را ثبت کنید":"فیلتر یا جستجو را تغییر دهید"}/>:(
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {list.map(f=>{const b=fuBucket(f);const col=FU_COL[b];return(
          <div key={f.custId+"_"+f.id} data-testid="fu-card" data-bucket={b} style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 16px",borderRight:`4px solid ${col}`,opacity:b==="done"?.6:1}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"flex-start"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:15,fontWeight:700}}>{f.name}{f.auto&&<span style={{fontSize:10,color:"#fbbf24",marginRight:8,background:"var(--bg-app)",borderRadius:6,padding:"1px 7px"}}>خودکار · بدهی</span>}</div>
                <div style={{fontSize:13,marginTop:2}}>{f.service||f.text||"—"}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6,alignItems:"center"}}>
                  {!f.auto?<select value={f.status||""} onChange={e=>fuUpdate(f.custId,f.id,{status:e.target.value})} style={{background:"var(--bg-app)",color:"var(--text-secondary)",border:"1px solid var(--border)",borderRadius:7,fontSize:11,padding:"2px 6px",fontFamily:"inherit"}}><option value="">— وضعیت —</option>{[...new Set([...(f.status?[f.status]:[]),...FU_STATUSES])].map(s=><option key={s} value={s}>{s}</option>)}</select>
                    :<span style={{fontSize:11,color:"var(--text-secondary)"}}>وضعیت: {f.status}</span>}
                  {f.service&&f.text&&<span style={{fontSize:11,color:"var(--text-muted)"}}>{f.text}</span>}
                </div>
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:700,color:col}}>📅 پیگیری: {b==="done"?"انجام شد":fuRel(f.dueDate)}</div>
                {f.dueDate&&<div style={{fontSize:10,color:"var(--text-dim)"}}>{jalaliLabel(f.dueDate)}</div>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
              {!f.auto&&<button data-testid="fu-done" onClick={()=>fuUpdate(f.custId,f.id,{done:!f.done,doneAt:f.done?"":today})} style={{...BTN(f.done?"var(--bg-app)":"#16a34a",f.done?"var(--text-secondary)":"#fff"),padding:"5px 12px",fontSize:12}}>{f.done?"↩ بازگردانی":"✅ انجام شد"}</button>}
              {!f.auto&&!f.done&&<button onClick={()=>setSnooze(snooze===f.id?null:f.id)} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"5px 12px",fontSize:12,border:"1px solid var(--border)"}}>⏰ تعویق</button>}
              {f.phone&&<a href={"tel:"+f.phone} style={{...BTN("var(--bg-app)","var(--accent-light)"),padding:"5px 12px",fontSize:12,textDecoration:"none",border:"1px solid var(--border)"}}>📞 {f.phone}</a>}
              {!f.auto&&<button onClick={()=>fuDelete(f.custId,f.id)} style={{...BTN("#450a0a","#f87171"),padding:"5px 10px",fontSize:12,marginRight:"auto"}}>🗑️</button>}
            </div>
            {snooze===f.id&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8,alignItems:"center"}}>
              {[["فردا",1],["۳ روز بعد",3],["هفته بعد",7]].map(([l,d])=><button key={l} onClick={()=>{fuUpdate(f.custId,f.id,{dueDate:isoAdd(today,d)});setSnooze(null);}} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"4px 10px",fontSize:11,border:"1px solid var(--border)"}}>{l}</button>)}
              <div style={{minWidth:150}}><JalaliPicker value={f.dueDate} onChange={d=>{fuUpdate(f.custId,f.id,{dueDate:d});setSnooze(null);}} placeholder="تاریخ دیگر"/></div>
            </div>}
          </div>);})}
      </div>)}
    </div>
  );
}
