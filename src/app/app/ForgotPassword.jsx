// «فراموشی رمز عبور» + نمایش کد بازیابی
//  • حالت سرور: ایمیل ← سرور لینک/کد یک‌بارمصرف می‌فرستد ← کد + رمز جدید (POST /api/auth/forgot-password و /reset-password)
//  • حالت محلی (فقط توسعه/دمو): ایمیل + کد بازیابی که هنگام ثبت‌نام نمایش داده شده + رمز جدید
import React, { useState } from "react";
import { apiResources } from "../../services/api/client.js";
import { resetPasswordWithRecoveryCode, validateNewPassword } from "../../services/auth/localAuth.js";
import { audit } from "../../audit/auditTrail.js";
import { BTN, INP } from "../core/constants.js";

const validEmail=(e)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const lbl={fontSize:13,color:"var(--text-secondary)"};

export function RecoveryCodeNotice({code,title="کد بازیابی شما",onDone,doneLabel="ذخیره کردم، ادامه"}){
  const [copied,setCopied]=useState(false);
  const [ok,setOk]=useState(false);
  const copy=async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);}catch{setCopied(false);}};
  return(
    <div data-testid="recovery-notice" style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{textAlign:"center",fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>🔑 {title}</div>
      <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:2}}>اگر رمز عبورتان را فراموش کردید، فقط با همین کد می‌توانید رمز جدید بسازید. آن را جایی امن (مثلاً دفترچه یا مدیر رمز) نگه دارید؛ <b>این کد فقط همین یک بار نمایش داده می‌شود</b>.</div>
      <div data-testid="recovery-code" dir="ltr" style={{background:"var(--bg-app)",border:"1px dashed var(--accent-light)",borderRadius:10,padding:"14px 8px",textAlign:"center",fontFamily:"monospace",fontSize:17,fontWeight:800,letterSpacing:1.5,userSelect:"all"}}>{code}</div>
      <div style={{display:"flex",gap:8}}>
        <button type="button" onClick={copy} style={{...BTN("var(--border)","var(--text-secondary)"),flex:1,fontSize:12}}>{copied?"✓ کپی شد":"کپی کد"}</button>
        <button type="button" onClick={()=>window.print()} style={{...BTN("var(--border)","var(--text-secondary)"),flex:1,fontSize:12}}>چاپ</button>
      </div>
      <label style={{display:"flex",gap:8,alignItems:"center",fontSize:12,color:"var(--text-secondary)",cursor:"pointer"}}><input data-testid="recovery-ack" type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)}/>کد را جای امنی ذخیره کردم</label>
      <button data-testid="recovery-continue" type="button" disabled={!ok} onClick={onDone} style={{...BTN("#2563eb"),padding:11,opacity:ok?1:0.5}}>{doneLabel}</button>
    </div>
  );
}

export function ForgotPasswordForm({remote,initialEmail="",onBack,onRecoveryCode}){
  const [email,setEmail]=useState(initialEmail);
  const [code,setCode]=useState("");
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [step,setStep]=useState(1);            // remote only: 1 = ask for the code, 2 = enter code + new password
  const [msg,setMsg]=useState(null);           // {ok,text}
  const [busy,setBusy]=useState(false);
  const fail=(text)=>setMsg({ok:false,text});

  const sendRemote=async()=>{
    setMsg(null);
    if(!validEmail(email.trim())){fail("ایمیل معتبر وارد کنید");return;}
    setBusy(true);
    try{await apiResources.auth.forgotPassword({email:email.trim().toLowerCase()});}
    catch(e){
      const st=e&&e.status;
      if(st===404||st===405||st===501){setBusy(false);fail("این سرور هنوز بازیابی رمز را پشتیبانی نمی‌کند؛ با مدیر سیستم تماس بگیرید.");return;}
      if(!st||st>=500){setBusy(false);fail((e&&e.message)||"ارتباط با سرور برقرار نشد");return;}
    }   // other 4xx is swallowed on purpose: the answer never reveals whether the e-mail exists
    setBusy(false);setStep(2);setMsg({ok:true,text:"اگر این ایمیل در سیستم ثبت باشد، کد بازیابی برایش ارسال شده است. پوشه اسپم را هم نگاه کنید."});
  };
  const submit=async()=>{
    setMsg(null);
    if(!validEmail(email.trim())){fail("ایمیل معتبر وارد کنید");return;}
    if(!code.trim()){fail(remote?"کد ارسال‌شده به ایمیل را وارد کنید":"کد بازیابی را وارد کنید");return;}
    const weak=validateNewPassword(pw,email.trim());if(weak){fail(weak);return;}
    if(pw!==pw2){fail("تکرار رمز عبور مطابقت ندارد");return;}
    setBusy(true);
    try{
      if(remote){
        await apiResources.auth.resetPassword({email:email.trim().toLowerCase(),token:code.trim(),code:code.trim(),password:pw,newPassword:pw});
        audit({action:"password_reset",entityType:"حساب",entityLabel:email.trim().toLowerCase(),details:"از طریق ایمیل"});
        setBusy(false);onBack("رمز عبور تغییر کرد؛ با رمز جدید وارد شوید.");return;
      }
      if(!import.meta.env.DEV){fail("بازیابی رمز در این نسخه فعال نیست؛ با مدیر سیستم تماس بگیرید.");setBusy(false);return;}
      const r=await resetPasswordWithRecoveryCode(email,code,pw);
      if(!r.ok){fail(r.error);setBusy(false);return;}
      audit({action:"password_reset",entityType:"حساب",entityLabel:email.trim().toLowerCase(),details:"با کد بازیابی"});
      setBusy(false);onRecoveryCode(r.recoveryCode);
    }catch(e){setBusy(false);fail(e&&e.status===400||e&&e.status===401||e&&e.status===410?"کد نامعتبر یا منقضی شده است؛ دوباره درخواست دهید.":(e?.message||"بازیابی انجام نشد"));}
  };

  const showFields=!remote||step===2;
  return(
    <div data-testid="forgot-form" style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:2}}>
        {remote?"ایمیل حسابتان را وارد کنید تا یک کد یک‌بارمصرف برایتان ارسال شود.":"ایمیل حساب و «کد بازیابی» که هنگام ثبت‌نام به شما نمایش داده شد را وارد کنید."}
      </div>
      <label style={lbl}>ایمیل
        <input data-testid="forgot-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(showFields?submit():sendRemote())} placeholder="example@mail.com" style={INP} dir="ltr" disabled={remote&&step===2}/>
      </label>
      {showFields&&<>
        <label style={lbl}>{remote?"کد ارسال‌شده به ایمیل":"کد بازیابی"}
          <input data-testid="forgot-code" value={code} onChange={e=>setCode(e.target.value)} placeholder={remote?"123456":"XXXXX-XXXXX-XXXXX-XXXXX"} style={{...INP,letterSpacing:1}} dir="ltr" autoComplete="one-time-code"/>
        </label>
        <label style={lbl}>رمز عبور جدید
          <input data-testid="forgot-pw" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" style={INP} dir="ltr" autoComplete="new-password"/>
        </label>
        <label style={lbl}>تکرار رمز عبور جدید
          <input data-testid="forgot-pw2" type="password" value={pw2} onChange={e=>setPw2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" style={INP} dir="ltr" autoComplete="new-password"/>
        </label>
      </>}
      {msg&&<div data-testid="forgot-msg" style={{background:msg.ok?"#052e16":"#2d0a0a",border:`1px solid ${msg.ok?"#16a34a44":"#dc262644"}`,borderRadius:8,padding:"8px 12px",fontSize:12,color:msg.ok?"#4ade80":"#f87171",lineHeight:1.9}}>{msg.ok?"✓ ":"⚠️ "}{msg.text}</div>}
      {showFields
        ?<button data-testid="forgot-submit" onClick={submit} disabled={busy} style={{...BTN("#2563eb"),padding:11,fontSize:14,opacity:busy?0.6:1}}>{busy?"در حال بررسی...":"تغییر رمز عبور"}</button>
        :<button data-testid="forgot-send" onClick={sendRemote} disabled={busy} style={{...BTN("#2563eb"),padding:11,fontSize:14,opacity:busy?0.6:1}}>{busy?"در حال ارسال...":"ارسال کد بازیابی"}</button>}
      {remote&&step===2&&<button type="button" onClick={()=>{setStep(1);setMsg(null);}} style={{background:"transparent",border:"none",color:"var(--text-muted)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>ارسال دوباره کد</button>}
      <button data-testid="forgot-back" type="button" onClick={()=>onBack()} style={{background:"transparent",border:"none",color:"var(--accent-light)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>← بازگشت به ورود</button>
      {!remote&&<div style={{fontSize:11,color:"var(--text-dim)",lineHeight:1.9}}>کد بازیابی را ندارید؟ حساب‌های محلی بدون ایمیل قابل بازیابی نیستند؛ اگر هنوز وارد برنامه هستید از «تنظیمات ← پروفایل» کد جدید بسازید، وگرنه از پشتیبان یا سرور استفاده کنید.</div>}
    </div>
  );
}
