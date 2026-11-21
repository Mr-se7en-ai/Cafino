// Generated from App.jsx by the module split (v1.50.0). Section: ui
import React, { useState, useEffect, useRef } from "react";
import { evalArithmetic } from "../core/calc.js";
import Icon, { ICONS } from "../../components/Icon.jsx";
import { getApiConfig, saveApiConfig, isApiConnected, apiResources, apiRequest } from "../../services/api/client.js";
import { getUsers, registerUser, loginUser, changeUserPassword, startSession, endSession, getSessionEmail, touchSession, MIN_PASSWORD_LENGTH, issueRecoveryCode, hasRecoveryCode } from "../../services/auth/localAuth.js";
import { RecoveryCodeNotice } from "../app/ForgotPassword.jsx";
import { audit } from "../../audit/auditTrail.js";
import { fmtM, toFA } from "../core/format.js";
import { DonutChart } from "./charts.jsx";
import { BTN, INP } from "../core/constants.js";
import { PhoneVerifyCard } from "../../sms/PhoneVerifyCard.jsx";


// ══════════════════════════════════════════════════════════════════
// PROFILE PANEL (پروفایل کاربر) — account info + change password
// ══════════════════════════════════════════════════════════════════
export function ProfilePanel({userEmail,onLogout,onPasswordChanged}){
  const [curPass,setCurPass]=useState("");
  const [newPass,setNewPass]=useState("");
  const [newPass2,setNewPass2]=useState("");
  const [err,setErr]=useState("");
  const [ok,setOk]=useState("");
  const [busy,setBusy]=useState(false);
  const [rcPass,setRcPass]=useState("");
  const [rcErr,setRcErr]=useState("");
  const [rcCode,setRcCode]=useState(null);
  const [rcHas,setRcHas]=useState(()=>hasRecoveryCode(userEmail));
  const makeRecovery=async()=>{
    setRcErr("");setBusy(true);
    try{const r=await issueRecoveryCode(userEmail,rcPass);if(!r.ok){setRcErr(r.error);}else{setRcCode(r.recoveryCode);setRcPass("");setRcHas(true);audit({action:"recovery_reset",entityType:"حساب",entityLabel:userEmail});}}
    catch{setRcErr("خطایی رخ داد، دوباره تلاش کنید");}
    setBusy(false);
  };

  const changePassword=async()=>{
    setErr("");setOk("");
    if(newPass.length<MIN_PASSWORD_LENGTH){setErr(`رمز جدید باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد`);return;}
    if(newPass!==newPass2){setErr("تکرار رمز جدید مطابقت ندارد");return;}
    setBusy(true);
    try{
      if(isApiConnected()){
        await apiResources.auth.changePassword({currentPassword:curPass,newPassword:newPass});
        onPasswordChanged&&onPasswordChanged();
        audit({action:"password_change",entityType:"حساب",entityLabel:userEmail,details:"حساب سروری"});
        setOk("✓ رمز عبور با موفقیت تغییر کرد");
        setCurPass("");setNewPass("");setNewPass2("");setBusy(false);return;
      }
      const r=await changeUserPassword(userEmail,curPass,newPass);
      if(!r.ok){setErr(r.error);setBusy(false);return;}
      startSession(userEmail);   // other open sessions are revoked by the password change; keep this one alive
      audit({action:"password_change",entityType:"حساب",entityLabel:userEmail,details:"حساب محلی"});
      setOk("✓ رمز عبور با موفقیت تغییر کرد");
      setCurPass("");setNewPass("");setNewPass2("");
    }catch{setErr("خطایی رخ داد، دوباره تلاش کنید");}
    setBusy(false);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:"var(--bg-card)",borderRadius:12,padding:18}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>👤 پروفایل کاربر</div>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:6}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:"var(--header-grad-1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <Icon name="User" size={24} style={{color:"var(--accent-light)"}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--text-dim)"}}>ایمیل حساب کاربری (ادمین)</div>
            <div style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",direction:"ltr",textAlign:"right"}}>{userEmail}</div>
          </div>
        </div>
      </div>

      {isApiConnected()&&<PhoneVerifyCard/>}

      <div style={{background:"var(--bg-card)",borderRadius:12,padding:18}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>🔒 تغییر رمز عبور</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <label style={{fontSize:13,color:"var(--text-secondary)"}}>رمز عبور فعلی
            <input type="password" value={curPass} onChange={e=>setCurPass(e.target.value)} style={INP} dir="ltr"/>
          </label>
          <label style={{fontSize:13,color:"var(--text-secondary)"}}>رمز عبور جدید
            <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} style={INP} dir="ltr"/>
          </label>
          <label style={{fontSize:13,color:"var(--text-secondary)"}}>تکرار رمز عبور جدید
            <input type="password" value={newPass2} onChange={e=>setNewPass2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&changePassword()} style={INP} dir="ltr"/>
          </label>
          {err&&<div style={{background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#f87171"}}>⚠️ {err}</div>}
          {ok&&<div style={{background:"#052e16",border:"1px solid #16a34a44",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#4ade80"}}>{ok}</div>}
          <button onClick={changePassword} disabled={busy} style={{...BTN("#2563eb"),padding:11,opacity:busy?0.6:1}}>{busy?"در حال بررسی...":"تغییر رمز عبور"}</button>
        </div>
      </div>

      {!isApiConnected()&&(
        <div data-testid="recovery-card" style={{background:"var(--bg-card)",borderRadius:12,padding:18}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>🔑 کد بازیابی رمز عبور</div>
          {rcCode?<RecoveryCodeNotice code={rcCode} title="کد بازیابی جدید شما" onDone={()=>setRcCode(null)} doneLabel="بستن"/>:(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:2}}>{rcHas?"برای این حساب کد بازیابی ثبت شده است. اگر کدتان را گم کردید، با رمز فعلی یک کد جدید بسازید (کد قبلی باطل می‌شود).":"برای این حساب هنوز کد بازیابی ساخته نشده است. با ساختن آن، در صورت فراموشی رمز می‌توانید از صفحه ورود رمز جدید بسازید."}</div>
              <input data-testid="rc-pass" type="password" placeholder="رمز عبور فعلی" value={rcPass} onChange={e=>setRcPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&makeRecovery()} style={INP} dir="ltr"/>
              {rcErr&&<div style={{fontSize:12,color:"#f87171"}}>⚠️ {rcErr}</div>}
              <button data-testid="rc-make" onClick={makeRecovery} disabled={busy||!rcPass} style={{...BTN("#2563eb"),padding:10,opacity:(busy||!rcPass)?0.6:1}}>{rcHas?"ساخت کد بازیابی جدید":"ساخت کد بازیابی"}</button>
            </div>)}
        </div>
      )}

      <button onClick={onLogout} style={{...BTN("#450a0a","#f87171"),padding:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        <Icon name="LogOut" size={16}/><span>خروج از حساب</span>
      </button>
    </div>
  );
}

export function Calculator({onClose}){
  const [expr,setExpr]=useState("");     // what user typed, e.g. "12+3"
  const [display,setDisplay]=useState("0");
  const [justEvaluated,setJustEvaluated]=useState(false);

  const safeEval=evalArithmetic;   // بدون eval / new Function (CSP بدون unsafe-eval)

  const press=(val)=>{
    if(val==="C"){setExpr("");setDisplay("0");setJustEvaluated(false);return;}
    if(val==="back"){const n=expr.slice(0,-1);setExpr(n);setDisplay(n===""?"0":n);setJustEvaluated(false);return;}
    if(val==="="){
      const r=safeEval(expr);
      if(r===null){setDisplay("خطا");setExpr("");}
      else{const rounded=Math.round(r*1e6)/1e6;setDisplay(String(rounded));setExpr(String(rounded));}
      setJustEvaluated(true);
      return;
    }
    const isOp=["+","-","*","/"].includes(val);
    let next;
    if(justEvaluated){
      next=isOp?display+val:(val==="."?display+val:val);
      setJustEvaluated(false);
    }else{
      next=(expr===""&&val==="0")?"0":expr+val;
    }
    setExpr(next);
    setDisplay(next===""?"0":next);
  };

  const keys=[
    ["C","back","%","/"],
    ["7","8","9","*"],
    ["4","5","6","-"],
    ["1","2","3","+"],
    ["0",".","="],
  ];
  const opColor=(k)=>["+","-","*","/","%"].includes(k)?"#2563eb":k==="="?"#16a34a":k==="C"?"#dc2626":"var(--bg-app)";
  const opTextColor=(k)=>["+","-","*","/","%","=","C"].includes(k)?"#fff":"var(--text-primary)";

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-card)",borderRadius:16,padding:20,width:"100%",maxWidth:300,boxShadow:"0 25px 60px #000a"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>🧮 ماشین حساب</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:18,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={{background:"var(--bg-app)",borderRadius:10,padding:"16px 14px",marginBottom:14,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",direction:"ltr"}}>
          <div style={{fontSize:24,fontWeight:700,color:"var(--text-primary)"}}>{display}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {keys.map((row,ri)=>(
            <div key={ri} style={{display:"flex",gap:8}}>
              {row.map(k=>(
                <button key={k} onClick={()=>press(k)} style={{flex:k==="0"?2:1,background:opColor(k),color:opTextColor(k),border:"none",borderRadius:9,padding:"14px 0",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {k==="back"?"⌫":k}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function KPI({icon,label,val,color,bg}){
  const isLucide=typeof icon==="string"&&!!ICONS[icon];
  return(<div className="ui-kpi" style={{"--tc":color,background:bg,border:`1px solid ${color}33`,borderRadius:12,padding:"16px 18px"}}><div style={{marginBottom:8,color}}>{isLucide?<Icon name={icon} size={22}/>:<span style={{fontSize:22}}>{icon}</span>}</div><div style={{fontSize:12,color:"var(--text-muted)",marginBottom:4}}>{label}</div><div style={{fontSize:15,fontWeight:700,color}}>{val}</div></div>);
}

export function ComparisonCell({label,data,goodDirection}){
  const {cur,prev,pct}=data;
  const isUp=pct>0, isFlat=pct===0;
  const isGood=isFlat?null:(goodDirection==="up"?isUp:!isUp);
  const arrowColor=isFlat?"var(--text-muted)":(isGood?"#4ade80":"#f87171");
  return(
    <div style={{background:"var(--bg-app)",borderRadius:10,padding:"12px 14px"}}>
      <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:6}}>{label}</div>
      <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",marginBottom:4}}>{fmtM(Math.abs(cur))}</div>
      <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}>
        <span style={{color:arrowColor,fontWeight:700}}>{isFlat?"—":(isUp?"▲":"▼")} {toFA(Math.abs(pct))}٪</span>
        <span style={{color:"var(--text-dim)"}}>نسبت به ماه قبل</span>
      </div>
    </div>
  );
}

export function DonutSection({title,slices,color,total}){return(<div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}><div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>{title}</div><div style={{display:"flex",alignItems:"center",gap:16}}><DonutChart slices={slices} size={120}/><div style={{flex:1}}>{slices.slice(0,5).map(s=><div key={s.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/><span style={{fontSize:11,color:"var(--text-secondary)"}}>{s.name}</span></div><span style={{fontSize:11,color,fontWeight:600}}>{total>0?Math.round(s.value/total*100):0}٪</span></div>)}</div></div></div>);}

export function CatCard({title,data,color,total}){const entries=Object.entries(data).sort((a,b)=>b[1]-a[1]);return(<div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}><div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>{title}</div>{entries.length===0?<div style={{fontSize:12,color:"var(--text-dim)"}}>داده‌ای موجود نیست</div>:entries.map(([cat,amt])=><div key={cat} style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:"var(--text-secondary)"}}>{cat}</span><span style={{color,fontWeight:600}}>{Math.round(amt/total*100)}٪</span></div><div style={{height:5,background:"var(--bg-app)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${amt/total*100}%`,height:"100%",background:color,borderRadius:3}}/></div></div>)}</div>);}

export function Empty({text,sub}){return(<div style={{textAlign:"center",padding:60,color:"var(--text-dim)"}}><div style={{fontSize:44,marginBottom:14}}>📭</div><div style={{fontSize:15}}>{text}</div>{sub&&<div style={{fontSize:13,marginTop:6}}>{sub}</div>}</div>);}
