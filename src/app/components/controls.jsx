// Generated from App.jsx by the module split (v1.50.0). Section: controls
import React, { useState, useEffect, useRef } from "react";
import { toFA } from "../core/format.js";
import { BTN, INP, JD, JM, WEEKDAYS_FA, latinDigits } from "../core/constants.js";
import { copyText } from "../pages/customers.jsx";
import { dateToJalali, gregorianToJalali, jalaliFirstWeekday, jalaliMonthDays, jalaliToGregorian, jalaliToIso, todayJalali } from "../core/jalali.js";


// ══════════════════════════════════════════════════════════════════
// JALALI DATE PICKER
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// SEARCHABLE SELECT (combobox with type-to-filter, grouped options)
// ══════════════════════════════════════════════════════════════════
export function SearchableSelect({options,value,onChange,placeholder="جستجو..."}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const ref=useRef();

  const selected=options.find(o=>o.value===value);

  useEffect(()=>{
    const h=(e)=>{if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setQuery("");}};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  const q=query.trim();
  const filtered=q
    ? options.filter(o=>o.label.includes(q)||(o.group||"").includes(q))
    : options;

  // group the filtered options preserving order of first appearance
  const groups=[];
  filtered.forEach(o=>{
    let g=groups.find(g=>g.group===(o.group||null));
    if(!g){g={group:o.group||null,items:[]};groups.push(g);}
    g.items.push(o);
  });

  const pick=(opt)=>{onChange(opt.value);setOpen(false);setQuery("");};

  return(
    <div ref={ref} style={{position:"relative"}}>
      <input
        value={open?query:(selected?selected.label:"")}
        onChange={e=>{setQuery(e.target.value);if(!open)setOpen(true);}}
        onFocus={()=>{setOpen(true);setQuery("");}}
        placeholder={placeholder}
        style={INP}
      />
      <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--text-muted)",fontSize:13,pointerEvents:"none"}}>🔍</span>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,left:0,zIndex:50,background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,maxHeight:280,overflowY:"auto",boxShadow:"0 12px 30px #0006"}}>
          {groups.length===0&&<div style={{padding:"14px",fontSize:12,color:"var(--text-muted)",textAlign:"center"}}>نتیجه‌ای یافت نشد</div>}
          {groups.map((g,gi)=>(
            <div key={gi}>
              {g.group&&<div style={{padding:"8px 12px 4px",fontSize:11,color:"var(--text-dim)",fontWeight:700}}>{g.group}</div>}
              {g.items.map(o=>(
                <div key={o.value} onClick={()=>pick(o)} style={{padding:"9px 14px",fontSize:13,cursor:"pointer",color:o.value===value?"var(--accent-light)":"var(--text-primary)",background:o.value===value?"var(--header-grad-1)":"transparent"}}>
                  {o.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardCalendar(){
  const [tjy,tjm,tjd]=todayJalali();
  const [viewY,setViewY]=useState(tjy);
  const [viewM,setViewM]=useState(tjm);
  const days=jalaliMonthDays(viewY,viewM);
  const firstDay=jalaliFirstWeekday(viewY,viewM);
  const prevM=()=>{if(viewM===1){setViewM(12);setViewY(y=>y-1);}else setViewM(m=>m-1);};
  const nextM=()=>{if(viewM===12){setViewM(1);setViewY(y=>y+1);}else setViewM(m=>m+1);};
  const goToday=()=>{setViewY(tjy);setViewM(tjm);};
  const isCurrentMonth=viewY===tjy&&viewM===tjm;
  return(
    <div style={{background:"var(--bg-card)",borderRadius:12,padding:20,marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>📅 تقویم خورشیدی</div>
        {!isCurrentMonth&&<button onClick={goToday} style={{...BTN("var(--border)","var(--accent-light)"),padding:"4px 12px",fontSize:11}}>امروز</button>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <button onClick={nextM} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"4px 10px"}}>‹</button>
        <span style={{fontWeight:700,fontSize:14}}>{JM[viewM-1]} {toFA(viewY)}</span>
        <button onClick={prevM} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"4px 10px"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {JD.map(d=><div key={d} style={{textAlign:"center",fontSize:11,color:"var(--text-muted)",padding:"4px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {Array.from({length:firstDay}).map((_,i)=><div key={"e"+i}/>)}
        {Array.from({length:days}).map((_,i)=>{
          const d=i+1;
          const isTd=viewY===tjy&&viewM===tjm&&d===tjd;
          return(
            <div key={d} style={{textAlign:"center",padding:"7px 2px",borderRadius:6,fontSize:13,background:isTd?"#2563eb":"transparent",color:isTd?"#fff":"var(--text-primary)",fontWeight:isTd?700:400}}>
              {toFA(d)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const GREG_MONTHS_FA=["ژانویه","فوریه","مارس","آوریل","مه","ژوئن","ژوئیه","اوت","سپتامبر","اکتبر","نوامبر","دسامبر"];

export function DateConverterSection(){
  const tj=todayJalali(),tg=(()=>{const n=new Date();return[n.getFullYear(),n.getMonth()+1,n.getDate()];})();
  const [mode,setMode]=useState("j2g");
  const [j,setJ]=useState({y:String(tj[0]),m:String(tj[1]),d:String(tj[2])});
  const [g,setG]=useState({y:String(tg[0]),m:String(tg[1]),d:String(tg[2])});
  const [msg,setMsg]=useState("");
  const num=v=>Number(latinDigits(v).replace(/\D/g,""));
  let res=null,err="";
  if(mode==="j2g"){
    const y=num(j.y),m=num(j.m),d=num(j.d);
    if(!y||!m||!d)err="سال، ماه و روز را وارد کنید";
    else if(y<1||y>3000)err="سال شمسی نامعتبر است";
    else if(m<1||m>12)err="ماه باید بین ۱ تا ۱۲ باشد";
    else if(d<1||d>jalaliMonthDays(y,m))err=`${JM[m-1]} ${toFA(y)} فقط ${toFA(jalaliMonthDays(y,m))} روز دارد`;
    else{const[gy,gm,gd]=jalaliToGregorian(y,m,d);res={jy:y,jm:m,jd:d,gy,gm,gd};}
  }else{
    const y=num(g.y),m=num(g.m),d=num(g.d);
    if(!y||!m||!d)err="سال، ماه و روز را وارد کنید";
    else if(y<622||y>3999)err="سال میلادی نامعتبر است (۶۲۲ تا ۳۹۹۹)";
    else if(m<1||m>12)err="ماه باید بین ۱ تا ۱۲ باشد";
    else{const dt=new Date(Date.UTC(2000,m-1,d));dt.setUTCFullYear(y);if(dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)err="این تاریخ در تقویم میلادی وجود ندارد";
      else{const[jy,jm,jd]=gregorianToJalali(y,m,d);res={jy,jm,jd,gy:y,gm:m,gd:d};}}
  }
  const wd=res?(()=>{const dt=new Date(Date.UTC(2000,res.gm-1,res.gd));dt.setUTCFullYear(res.gy);return WEEKDAYS_FA[dt.getUTCDay()];})():"";
  const p2s=n=>String(n).padStart(2,"0");
  const jTxt=res?`${res.jy}/${p2s(res.jm)}/${p2s(res.jd)}`:"";
  const gTxt=res?`${res.gy}-${p2s(res.gm)}-${p2s(res.gd)}`:"";
  const copy=async(t)=>{const ok=await copyText(t);setMsg(ok===false?"کپی انجام نشد":"✓ کپی شد: "+t);setTimeout(()=>setMsg(""),2000);};
  const today=()=>{setJ({y:String(tj[0]),m:String(tj[1]),d:String(tj[2])});setG({y:String(tg[0]),m:String(tg[1]),d:String(tg[2])});};
  const swap=()=>{
    if(res){if(mode==="j2g")setG({y:String(res.gy),m:String(res.gm),d:String(res.gd)});else setJ({y:String(res.jy),m:String(res.jm),d:String(res.jd)});}
    setMode(mode==="j2g"?"g2j":"j2g");
  };
  const src=mode==="j2g"?j:g,setSrc=mode==="j2g"?setJ:setG;
  const fld=(k,l,w)=><label style={{flex:w,fontSize:11,color:"var(--text-muted)",direction:"rtl",textAlign:"center"}}>{l}<input data-testid={`dc-${k}`} inputMode="numeric" value={src[k]} onChange={e=>setSrc({...src,[k]:e.target.value})} style={{...INP,marginTop:4,textAlign:"center"}}/></label>;
  const big=(l,v,c,tid,copyTxt)=>(
    <div style={{flex:"1 1 220px",background:"var(--bg-app)",borderRadius:12,padding:"14px 16px",borderTop:`3px solid ${c}`}}>
      <div style={{fontSize:11,color:"var(--text-muted)"}}>{l}</div>
      <div data-testid={tid} style={{fontSize:19,fontWeight:800,color:c,marginTop:6}}>{v}</div>
      <button onClick={()=>copy(copyTxt)} style={{...BTN("var(--border)","var(--text-primary)"),padding:"5px 10px",fontSize:11,marginTop:8}}>📋 کپی</button>
    </div>
  );
  return(
    <div data-testid="date-converter" style={{maxWidth:760}}>
      <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)",marginBottom:4}}>🔁 تبدیل تاریخ شمسی و میلادی</div>
      <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:14}}>تاریخ را وارد کنید؛ نتیجه همان لحظه نمایش داده می‌شود. ارقام فارسی و انگلیسی هر دو پذیرفته است.</div>
      <div style={{background:"var(--bg-card)",borderRadius:16,padding:18}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
          {[["j2g","شمسی ← میلادی"],["g2j","میلادی ← شمسی"]].map(([k,l])=><button key={k} data-testid={`dc-mode-${k}`} onClick={()=>setMode(k)} style={{...BTN(mode===k?"#2563eb":"var(--border)",mode===k?"#fff":"var(--text-primary)"),padding:"8px 16px"}}>{l}</button>)}
          <button data-testid="dc-swap" onClick={swap} title="جابه‌جایی مبدأ و مقصد" style={{...BTN("var(--border)","var(--text-primary)"),padding:"8px 12px"}}>⇄</button>
          <button data-testid="dc-today" onClick={today} style={{...BTN("var(--border)","var(--text-primary)"),padding:"8px 14px",marginRight:"auto"}}>📅 امروز</button>
        </div>
        <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:6}}>{mode==="j2g"?"تاریخ شمسی":"تاریخ میلادی"}</div>
        {/* از چپ به راست: سال ← ماه ← روز */}
        <div data-testid="dc-fields" style={{display:"flex",gap:10,direction:"ltr"}}>{fld("y","سال",2)}{fld("m","ماه",1)}{fld("d","روز",1)}</div>
        {err&&<div data-testid="dc-error" style={{marginTop:12,color:"#f87171",fontSize:13}}>⚠️ {err}</div>}
        {res&&(
          <div data-testid="dc-result" style={{marginTop:16}}>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {mode==="j2g"
                ?big("تاریخ میلادی",`${toFA(res.gd)} ${GREG_MONTHS_FA[res.gm-1]} ${toFA(res.gy)}`,"#60a5fa","dc-out",gTxt)
                :big("تاریخ شمسی",`${toFA(res.jd)} ${JM[res.jm-1]} ${toFA(res.jy)}`,"#4ade80","dc-out",jTxt)}
              {big(mode==="j2g"?"به‌صورت عددی (میلادی)":"به‌صورت عددی (شمسی)",mode==="j2g"?gTxt:jTxt,"#a78bfa","dc-num",mode==="j2g"?gTxt:jTxt)}
            </div>
            <div data-testid="dc-weekday" style={{marginTop:12,fontSize:13,color:"var(--text-secondary)"}}>روز هفته: <b style={{color:"var(--text-primary)"}}>{wd}</b></div>
          </div>
        )}
        {msg&&<div style={{marginTop:10,fontSize:12,color:"#4ade80"}}>{msg}</div>}
      </div>
    </div>
  );
}

export function JalaliPicker({value,onChange,placeholder="انتخاب تاریخ"}){
  const [jy,jm,jd]=value?dateToJalali(value):todayJalali();
  const [viewY,setViewY]=useState(jy);
  const [viewM,setViewM]=useState(jm);
  const [open,setOpen]=useState(false);
  const ref=useRef();
  useEffect(()=>{const h=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  // Keep the visible month/year in sync with the current value whenever the picker is (re)opened,
  // so it never shows a stale month left over from a previously edited date/record.
  useEffect(()=>{if(open){setViewY(jy);setViewM(jm);}},[open]);  
  const days=jalaliMonthDays(viewY,viewM);
  const firstDay=jalaliFirstWeekday(viewY,viewM);
  const select=(d)=>{onChange(jalaliToIso(viewY,viewM,d));setOpen(false);};
  const prevM=()=>{if(viewM===1){setViewM(12);setViewY(y=>y-1);}else setViewM(m=>m-1);};
  const nextM=()=>{if(viewM===12){setViewM(1);setViewY(y=>y+1);}else setViewM(m=>m+1);};
  const [tjy,tjm,tjd]=todayJalali();
  return(
    <div style={{position:"relative"}} ref={ref}>
      <div onClick={()=>setOpen(o=>!o)} style={{...INP,marginTop:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:value?"var(--text-primary)":"var(--text-muted)"}}>{value?`${toFA(jd)} ${JM[jm-1]} ${toFA(jy)}`:placeholder}</span>
        <span>📅</span>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"110%",right:0,background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,padding:16,zIndex:400,minWidth:280,boxShadow:"0 20px 40px #000c"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={nextM} style={{...BTN("var(--border)"),padding:"4px 10px"}}>‹</button>
            <span style={{fontWeight:700,color:"var(--accent-light)"}}>{JM[viewM-1]} {toFA(viewY)}</span>
            <button onClick={prevM} style={{...BTN("var(--border)"),padding:"4px 10px"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
            {JD.map(d=><div key={d} style={{textAlign:"center",fontSize:11,color:"var(--text-muted)",padding:"4px 0"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {Array.from({length:firstDay}).map((_,i)=><div key={"e"+i}/>)}
            {Array.from({length:days}).map((_,i)=>{const d=i+1;const isTd=viewY===tjy&&viewM===tjm&&d===tjd;const isSel=value&&viewY===jy&&viewM===jm&&d===jd;return(<div key={d} onClick={()=>select(d)} style={{textAlign:"center",padding:"6px 2px",borderRadius:6,cursor:"pointer",fontSize:13,background:isSel?"#2563eb":isTd?"var(--header-grad-1)":"transparent",color:isSel?"#fff":isTd?"#fff":"var(--text-primary)",fontWeight:isSel||isTd?700:400,border:isTd&&!isSel?"1px solid #2563eb":"1px solid transparent"}}>{toFA(d)}</div>);})}
          </div>
          <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center"}}>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>سال:</span>
            <input type="number" value={viewY} onChange={e=>setViewY(Number(e.target.value))} style={{...INP,marginTop:0,width:90,padding:"5px 8px",fontSize:13}}/>
          </div>
        </div>
      )}
    </div>
  );
}
