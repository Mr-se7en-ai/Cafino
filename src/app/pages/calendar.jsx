// Generated from App.jsx by the module split (v1.50.0). Section: calendar
import React, { useState, useEffect, useRef } from "react";
import { fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { BTN, CUSTOMERS_STORAGE_KEY, INP, JD, JM } from "../core/constants.js";
import { JalaliPicker } from "../components/controls.jsx";
import { jalaliShort } from "./customers.jsx";
import { jalaliFirstWeekday, jalaliMonthDays, jalaliToIso, todayIso, todayJalali } from "../core/jalali.js";
import { normUrl, openLink } from "./links.jsx";
import { daysUntil, getObligations, oblKind } from "../domain/obligations.jsx";
import { createId, emitDataChange, lsRead, lsWrite, useDataSync } from "../domain/sales.jsx";


// ══════════════════════════════════════════════════════════════════
// تقویم رویدادها — رویدادهای ثبت‌نامی خودکار + رویداد دلخواه + چک/تعهدات + پیگیری‌ها
// ══════════════════════════════════════════════════════════════════
const CAL_KEY="cafenet_cal_events";

const REG_TEMPLATES=[
  {id:"konkur_reg",title:"ثبت‌نام کنکور سراسری",m1:11,d1:1,m2:11,d2:15,approx:true,url:"https://www.sanjesh.org",note:"تاریخ دقیق هر سال را از سایت سازمان سنجش وارد کنید"},
  {id:"konkur_pick",title:"انتخاب رشته کنکور",m1:5,d1:10,m2:5,d2:25,approx:true,url:"https://www.sanjesh.org",note:"معمولاً پس از اعلام نتایج"},
  {id:"arshad_reg",title:"ثبت‌نام آزمون کارشناسی ارشد",m1:9,d1:1,m2:9,d2:15,approx:true,url:"https://www.sanjesh.org",note:""},
  {id:"phd_reg",title:"ثبت‌نام آزمون دکتری",m1:11,d1:15,m2:12,d2:5,approx:true,url:"https://www.sanjesh.org",note:""},
  {id:"pnu_mehr",title:"ثبت‌نام پیام نور (ترم مهر)",m1:5,d1:20,m2:6,d2:31,approx:true,url:"https://www.pnu.ac.ir",note:""},
  {id:"pnu_bahman",title:"ثبت‌نام پیام نور (ترم بهمن)",m1:10,d1:15,m2:11,d2:15,approx:true,url:"https://www.pnu.ac.ir",note:""},
  {id:"unit_mehr",title:"انتخاب واحد ترم مهر",m1:6,d1:20,m2:7,d2:5,approx:true,url:"",note:"دانشگاه‌ها هر کدام تقویم خودشان را دارند"},
  {id:"unit_bahman",title:"انتخاب واحد ترم بهمن",m1:11,d1:10,m2:11,d2:25,approx:true,url:"",note:"دانشگاه‌ها هر کدام تقویم خودشان را دارند"},
  {id:"school_reg",title:"ثبت‌نام مدارس",m1:3,d1:1,m2:4,d2:10,approx:true,url:"https://www.medu.ir",note:""},
  {id:"tax_person",title:"مهلت اظهارنامه مالیاتی اشخاص حقیقی (مشاغل)",m1:2,d1:1,m2:2,d2:31,approx:false,url:"https://tax.gov.ir",note:"پایان اردیبهشت"},
  {id:"tax_company",title:"مهلت اظهارنامه مالیاتی اشخاص حقوقی",m1:4,d1:1,m2:4,d2:31,approx:false,url:"https://tax.gov.ir",note:"برای سال مالی منتهی به پایان اسفند"},
];

const CAL_COLORS={reg:"#a78bfa",custom:"#38bdf8",obl:"#fbbf24",follow:"#4ade80"};

function getCalState(){const v=lsRead(CAL_KEY,null)||{};return{custom:Array.isArray(v.custom)?v.custom:[],over:v.over||{},off:Array.isArray(v.off)?v.off:[]};}

function calEventsForYear(jy){
  const st=getCalState();const out=[];
  REG_TEMPLATES.filter(t=>!st.off.includes(t.id)).forEach(t=>{
    const key=`${t.id}@${jy}`;const o=st.over[key]||{};
    if(o.hide)return;
    out.push({key,tplId:t.id,jy,title:t.title,start:o.start||jalaliToIso(jy,t.m1,t.d1),end:o.end||jalaliToIso(jy,t.m2,t.d2),kind:"reg",approx:t.approx&&!o.start,url:t.url,note:t.note,edited:!!o.start});
  });
  return out;
}

function calAllEvents(jys){
  const st=getCalState();const out=[];
  jys.forEach(y=>out.push(...calEventsForYear(y)));
  st.custom.forEach(c=>out.push({key:c.id,title:c.title,start:c.start,end:c.end||c.start,kind:"custom",url:c.url||"",note:c.note||"",custom:true}));
  try{getObligations().filter(o=>o.status!=="done"&&o.dueDate).forEach(o=>out.push({key:"o"+o.id,title:`${oblKind(o.kind).icon} ${o.title}`,start:o.dueDate,end:o.dueDate,kind:"obl",note:fmtM(o.amount)}));}catch{}
  try{lsRead(CUSTOMERS_STORAGE_KEY,[]).forEach(c=>(c.followUps||[]).filter(f=>!f.done&&f.dueDate).forEach(f=>out.push({key:"f"+f.id,title:`🔔 ${`${c.firstName||""} ${c.lastName||""}`.trim()||"مشتری"} — ${f.text}`,start:f.dueDate,end:f.dueDate,kind:"follow",note:""})));}catch{}
  return out;
}

function calRangeLabel(e){return e.end&&e.end!==e.start?`${jalaliShort(e.start)} تا ${jalaliShort(e.end)}`:jalaliLabel(e.start);}

export function calNotifications(){
  const t=todayIso();const [jy]=todayJalali();const out=[];
  calAllEvents([jy,jy+1]).filter(e=>e.kind==="reg"||e.kind==="custom").forEach(e=>{
    const toStart=daysUntil(e.start),toEnd=daysUntil(e.end);
    if(toStart>0&&toStart<=7)out.push({icon:"📝",color:"#a78bfa",text:`${e.title} — ${toFA(toStart)} روز دیگر شروع می‌شود`,detail:calRangeLabel(e)+(e.approx?" (تقریبی)":"")});
    else if(e.start<=t&&t<=e.end){out.push({icon:"📝",color:toEnd<=3?"#fbbf24":"#a78bfa",text:`${e.title} — ${toEnd===0?"امروز آخرین روز است":`${toFA(toEnd)} روز تا پایان`}`,detail:calRangeLabel(e)+(e.approx?" (تقریبی)":"")});}
  });
  return out;
}

export function EventCalendar({compact}){
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const [tjy,tjm,tjd]=todayJalali();
  const [viewY,setViewY]=useState(tjy);
  const [viewM,setViewM]=useState(tjm);
  const [sel,setSel]=useState(null);
  const [form,setForm]=useState(null);
  const [manage,setManage]=useState(false);
  const [editTpl,setEditTpl]=useState(null);
  const st=getCalState();
  const saveSt=(n)=>{lsWrite(CAL_KEY,n);emitDataChange();setTick(t=>t+1);};
  const days=jalaliMonthDays(viewY,viewM);
  const firstDay=jalaliFirstWeekday(viewY,viewM);
  const prevM=()=>{setSel(null);if(viewM===1){setViewM(12);setViewY(y=>y-1);}else setViewM(m=>m-1);};
  const nextM=()=>{setSel(null);if(viewM===12){setViewM(1);setViewY(y=>y+1);}else setViewM(m=>m+1);};
  const goToday=()=>{setViewY(tjy);setViewM(tjm);setSel(null);};
  const events=calAllEvents([viewY-1,viewY,viewY+1]);
  const iso=d=>jalaliToIso(viewY,viewM,d);
  const onDay=(d)=>events.filter(e=>e.start<=iso(d)&&iso(d)<=e.end);
  const monthStart=iso(1),monthEnd=iso(days);
  const listed=sel?onDay(sel):events.filter(e=>e.start<=monthEnd&&e.end>=monthStart).sort((a,b)=>a.start.localeCompare(b.start));
  const t=todayIso();
  const upcoming=calAllEvents([tjy,tjy+1]).filter(e=>(e.kind==="reg"||e.kind==="custom")&&e.end>=t).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,5);
  const saveForm=()=>{
    if(!form.title.trim()||!form.start)return;
    const item={id:form.id||"e_"+createId("event"),title:form.title.trim(),start:form.start,end:form.end&&form.end>=form.start?form.end:form.start,url:normUrl(form.url),note:(form.note||"").trim()};
    saveSt({...st,custom:form.id?st.custom.map(x=>x.id===form.id?item:x):[...st.custom,item]});setForm(null);
  };
  const saveTpl=()=>{
    const e=editTpl;if(!e.start)return;
    saveSt({...st,over:{...st.over,[e.key]:{start:e.start,end:e.end&&e.end>=e.start?e.end:e.start}}});setEditTpl(null);
  };
  const btn=(l,f,extra)=><button onClick={f} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"3px 9px",fontSize:11,border:"1px solid var(--border)",...extra}}>{l}</button>;
  return(
    <div data-testid="event-calendar" style={{background:"var(--bg-card)",borderRadius:12,padding:compact?16:20,marginBottom:compact?0:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>📅 تقویم رویدادها</div>
        <div style={{display:"flex",gap:6}}>
          {!(viewY===tjy&&viewM===tjm)&&btn("امروز",goToday)}
          {btn("+ رویداد",()=>setForm({title:"",start:sel?iso(sel):t,end:"",url:"",note:""}))}
          {!compact&&btn(manage?"× بستن مدیریت":"⚙️ رویدادهای ثبت‌نامی",()=>setManage(m=>!m))}
        </div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:10,color:"var(--text-muted)",marginBottom:10}}>
        <span><b style={{color:CAL_COLORS.reg}}>●</b> ثبت‌نام (خودکار)</span><span><b style={{color:CAL_COLORS.custom}}>●</b> رویداد من</span><span><b style={{color:CAL_COLORS.obl}}>●</b> چک/تعهد</span><span><b style={{color:CAL_COLORS.follow}}>●</b> پیگیری مشتری</span>
      </div>
      {form&&(
        <div style={{background:"var(--bg-app)",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
            <input data-testid="ev-title" placeholder="عنوان رویداد" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={{...INP,marginTop:0}}/>
            <div><div style={{fontSize:11,color:"var(--text-muted)"}}>شروع</div><JalaliPicker value={form.start} onChange={v=>setForm({...form,start:v})}/></div>
            <div><div style={{fontSize:11,color:"var(--text-muted)"}}>پایان (اختیاری)</div><JalaliPicker value={form.end} onChange={v=>setForm({...form,end:v})} placeholder="همان روز"/></div>
            <input dir="ltr" placeholder="لینک (اختیاری)" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} style={{...INP,marginTop:0,textAlign:"left"}}/>
            <input placeholder="یادداشت (اختیاری)" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} style={{...INP,marginTop:0}}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}><button data-testid="ev-save" onClick={saveForm} style={{...BTN("#2563eb"),padding:"6px 16px",fontSize:12}}>ذخیره</button><button onClick={()=>setForm(null)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"6px 16px",fontSize:12}}>لغو</button></div>
        </div>)}
      {editTpl&&(
        <div style={{background:"var(--bg-app)",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:6}}>تاریخ دقیق «{editTpl.title}» برای سال {toFA(editTpl.jy)}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
            <div><div style={{fontSize:11,color:"var(--text-muted)"}}>شروع</div><JalaliPicker value={editTpl.start} onChange={v=>setEditTpl({...editTpl,start:v})}/></div>
            <div><div style={{fontSize:11,color:"var(--text-muted)"}}>پایان</div><JalaliPicker value={editTpl.end} onChange={v=>setEditTpl({...editTpl,end:v})}/></div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}><button data-testid="tpl-save" onClick={saveTpl} style={{...BTN("#2563eb"),padding:"6px 16px",fontSize:12}}>ذخیره</button><button onClick={()=>setEditTpl(null)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"6px 16px",fontSize:12}}>لغو</button></div>
        </div>)}
      {!compact&&upcoming.length>0&&(
        <div data-testid="cal-upcoming" style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:6}}>⏳ رویدادهای پیش‌رو</div>
          {upcoming.map(e=>{const a=daysUntil(e.start),b=daysUntil(e.end);return(
            <div key={e.key} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12,padding:"3px 0"}}>
              <span>{e.title}{e.approx&&<span style={{color:"var(--text-dim)"}}> ≈</span>}</span>
              <span style={{color:a<=0?"#fbbf24":"var(--text-muted)",whiteSpace:"nowrap"}}>{a>0?`${toFA(a)} روز دیگر`:b===0?"امروز آخرین روز":`در جریان · ${toFA(b)} روز مانده`}</span>
            </div>);})}
        </div>)}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <button onClick={nextM} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"4px 10px"}}>‹</button>
        <span style={{fontWeight:700,fontSize:14}}>{JM[viewM-1]} {toFA(viewY)}</span>
        <button onClick={prevM} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"4px 10px"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>{JD.map(d=><div key={d} style={{textAlign:"center",fontSize:11,color:"var(--text-muted)",padding:"4px 0"}}>{d}</div>)}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {Array.from({length:firstDay}).map((_,i)=><div key={"e"+i}/>)}
        {Array.from({length:days}).map((_,i)=>{
          const d=i+1;const isTd=viewY===tjy&&viewM===tjm&&d===tjd;const ev=onDay(d);const kinds=[...new Set(ev.map(e=>e.kind))];
          return(
            <div key={d} data-testid={ev.length?"cal-day-ev":undefined} onClick={()=>setSel(sel===d?null:d)} style={{cursor:"pointer",textAlign:"center",padding:compact?"5px 2px":"9px 2px",borderRadius:6,fontSize:13,background:isTd?"#2563eb":sel===d?"var(--bg-app)":"transparent",border:sel===d?"1px solid var(--accent-light)":"1px solid transparent",color:isTd?"#fff":"var(--text-primary)",fontWeight:isTd?700:400}}>
              {toFA(d)}
              <div style={{height:6,display:"flex",justifyContent:"center",gap:2,marginTop:2}}>{kinds.slice(0,3).map(k=><span key={k} style={{width:5,height:5,borderRadius:"50%",background:CAL_COLORS[k]}}/>)}</div>
            </div>);
        })}
      </div>
      <div style={{marginTop:12}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{sel?`رویدادهای ${toFA(sel)} ${JM[viewM-1]}`:`رویدادهای ${JM[viewM-1]}`} ({toFA(listed.length)})</div>
        {listed.length===0?<div style={{fontSize:12,color:"var(--text-dim)",textAlign:"center",padding:"10px 0"}}>رویدادی نیست</div>:listed.map(e=>(
          <div key={e.key+e.start} data-testid="cal-event" style={{background:"var(--bg-app)",borderRadius:9,padding:"8px 11px",marginBottom:6,borderRight:`3px solid ${CAL_COLORS[e.kind]}`}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{fontSize:13,fontWeight:600}}>{e.title}{e.approx&&<span title="تاریخ تقریبی است؛ تاریخ رسمی را بررسی و ویرایش کنید" style={{fontSize:10,color:"#fbbf24",marginRight:6}}>≈ تقریبی</span>}{e.edited&&<span style={{fontSize:10,color:"#4ade80",marginRight:6}}>✓ تاریخ دقیق</span>}</div>
              <div style={{display:"flex",gap:5}}>
                {e.url&&btn("باز کردن ↗",()=>openLink(e.url))}
                {e.custom&&btn("✏️",()=>{const c=st.custom.find(x=>x.id===e.key);setForm({id:c.id,title:c.title,start:c.start,end:c.end&&c.end!==c.start?c.end:"",url:c.url||"",note:c.note||""});})}
                {e.custom&&btn("🗑️",()=>saveSt({...st,custom:st.custom.filter(x=>x.id!==e.key)}),{color:"#f87171"})}
                {e.kind==="reg"&&btn("📆 تاریخ دقیق",()=>setEditTpl({key:e.key,jy:e.jy,title:e.title,start:e.start,end:e.end}))}
              </div>
            </div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>{calRangeLabel(e)}{e.note?` · ${e.note}`:""}</div>
          </div>))}
      </div>
      {manage&&!compact&&(
        <div data-testid="reg-manage" style={{marginTop:14,borderTop:"1px solid var(--border)",paddingTop:12}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:4}}>رویدادهای ثبت‌نامی خودکار</div>
          <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:8}}>این رویدادها هر سال خودکار در تقویم می‌آیند و ۷ روز قبل از شروع در اعلان‌ها یادآوری می‌شوند. تاریخ‌های «تقریبی» بر اساس الگوی معمول سال‌های گذشته‌اند؛ تاریخ رسمی امسال را از سایت مرجع بگیرید و با «📆 تاریخ دقیق» ثبت کنید.</div>
          {REG_TEMPLATES.map(tp=>{const on=!st.off.includes(tp.id);return(
            <div key={tp.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,background:"var(--bg-app)",borderRadius:9,padding:"7px 11px",marginBottom:5,opacity:on?1:.55}}>
              <div style={{fontSize:12}}>{tp.title}<span style={{color:"var(--text-dim)",fontSize:10}}> · {toFA(tp.d1)} {JM[tp.m1-1]} تا {toFA(tp.d2)} {JM[tp.m2-1]}{tp.approx?" ≈":""}</span></div>
              {btn(on?"✓ فعال":"غیرفعال",()=>saveSt({...st,off:on?[...st.off,tp.id]:st.off.filter(x=>x!==tp.id)}),{color:on?"#4ade80":"var(--text-muted)"})}
            </div>);})}
        </div>)}
    </div>
  );
}
