// Generated from App.jsx by the module split (v1.50.0). Section: AuthScreen
import React, { useState, useEffect, useRef } from "react";
import BrandLogo, { BrandWordmark } from "../components/BrandLogo.jsx";
import { getApiConfig, saveApiConfig, isApiConnected, apiResources, apiRequest } from "../../services/api/client.js";
import { clearAuthSession, discardLegacyLocalCredentials, getAuthenticatedUser, normalizeAuthUser, setAuthSession, setAuthenticatedUser } from "../../services/auth/session.js";
import { writeTenantScope } from "../../data/tenantScope.js";
import { getUsers, registerUser, loginUser, changeUserPassword, startSession, endSession, getSessionEmail, touchSession, MIN_PASSWORD_LENGTH } from "../../services/auth/localAuth.js";
import { logActivity } from "../core/activity.js";
import { BTN, INP } from "../core/constants.js";
import { appFontFamily, themeVars } from "../core/theme.jsx";
import { ForgotPasswordForm, RecoveryCodeNotice } from "./ForgotPassword.jsx";
import { LoginCaptcha } from "./LoginCaptcha.jsx";
import { captchaPayload, captchaReady, isCaptchaCode } from "./loginCaptcha.js";
import { APP_BRAND } from "../core/version.js";
import { enterGuestMode } from "../../guest/guestMode.js";
import { useSkin } from "../../skins/useSkin.js";
import { SHOW_SERVER_SETTINGS } from "../core/features.js";
import { localAccountsAllowed, LOCAL_ACCOUNTS_NOTICE } from "../../services/auth/localPolicy.js";


// ══════════════════════════════════════════════════════════════════
// LOGIN / REGISTER
// ══════════════════════════════════════════════════════════════════
export function AuthScreen({onLoggedIn,theme,customFont}){
  const skin=useSkin();
  // «تم لیکوید گلس»: پس‌زمینهٔ رنگی روی body است و رنگ‌هایش از متغیرهای تم می‌آید (در صفحهٔ ورود MainApp هنوز آن‌ها را روی body نگذاشته)
  useEffect(()=>{
    if(skin!=="liquid")return undefined;
    const b=document.body,vars=themeVars(theme);
    Object.entries(vars).forEach(([k,v])=>b.style.setProperty(k,v));
    return()=>{Object.keys(vars).forEach(k=>b.style.removeProperty(k));};
  },[skin,theme]);
  const remoteAuth=isApiConnected();
  const [mode,setMode]=useState(()=>remoteAuth?"login":getUsers().length?"login":"register"); // login | register | forgot
  const [recovery,setRecovery]=useState(null);   // {code,title,after} — one-time recovery-code screen (local accounts)
  const [notice,setNotice]=useState(()=>{try{if(sessionStorage.getItem("cafenet_offline_expired")==="1"){return"مدت مجاز کار بدون اینترنت تمام شد. برای ادامه، با اینترنت وارد شوید (اطلاعات ذخیره‌نشدهٔ شما حفظ شده و بعد از ورود همگام می‌شود).";}}catch{}return"";});
  useEffect(()=>{try{sessionStorage.removeItem("cafenet_offline_expired");}catch{/* sessionStorage در دسترس نیست */}},[]);   // پاک‌کردن اثر جانبی خارج از initializer
  const [apiUrl,setApiUrl]=useState(()=>getApiConfig().baseUrl);
  const [firstName,setFirstName]=useState("");
  const [lastName,setLastName]=useState("");
  const [phone,setPhone]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [password2,setPassword2]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  // کپچای ورود: فقط بعد از چند شکست پیاپی (سرور تصمیم می‌گیرد)؛ هر چالش یک‌بارمصرف است و بعد از هر تلاش تازه می‌شود
  const [captcha,setCaptcha]=useState(null);            // {id,image} | null
  const [captchaLoading,setCaptchaLoading]=useState(false);
  const [captchaAnswer,setCaptchaAnswer]=useState("");
  const loadCaptcha=async()=>{
    setCaptchaLoading(true);setCaptchaAnswer("");
    try{const c=await apiResources.auth.captcha();setCaptcha(c?.id?c:null);}
    catch{setCaptcha(null);setErr(p=>p||"دریافت کد تصویر ممکن نشد؛ اتصال را بررسی کنید و «کد جدید» را بزنید");}
    setCaptchaLoading(false);
  };

  const validEmail=(e)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const submit=async()=>{
    setErr("");
    if(mode==="register"){
      if(!firstName.trim()||!lastName.trim()){setErr("نام و نام خانوادگی را وارد کنید");return;}
      const normalizedPhone=phone.replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
      if(!/^09\d{9}$/.test(normalizedPhone)){setErr("شماره موبایل معتبر وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹)");return;}
    }
    if(!validEmail(email)){setErr("ایمیل معتبر وارد کنید");return;}
    if(password.length<8){setErr("رمز عبور باید حداقل ۸ کاراکتر باشد");return;}
    if(mode==="register"&&password!==password2){setErr("تکرار رمز عبور مطابقت ندارد");return;}
    if(remoteAuth&&mode==="login"&&!captchaReady(captcha,captchaAnswer)){setErr("عدد ۵ رقمی تصویر را وارد کنید");return;}
    setBusy(true);
    try{
      if(remoteAuth){
        const emailKey=email.trim().toLowerCase();
        const phoneDigits=Array.from(phone,character=>{const code=character.charCodeAt(0);return code>=0x06f0&&code<=0x06f9?String(code-0x06f0):code>=0x0660&&code<=0x0669?String(code-0x0660):character;}).join("").replace(/\D/g,"");
        const payload=mode==="register"
          ?{email:emailKey,password,firstName:firstName.trim(),lastName:lastName.trim(),phone:phoneDigits}
          :{email:emailKey,password,...captchaPayload(captcha,captchaAnswer)};
        const authResult=mode==="register"?await apiResources.auth.register(payload):await apiResources.auth.login(payload);
        setAuthSession(authResult);
        const authIdentity=normalizeAuthUser(authResult);
        if(authIdentity?.organizationId&&authIdentity?.branchId)writeTenantScope({organizationId:authIdentity.organizationId,branchId:authIdentity.branchId});
        const me=await apiResources.auth.me();
        const user=normalizeAuthUser(me)||normalizeAuthUser(authResult);
        if(!user)throw new Error("سرور هویت کاربر را برنگرداند");
        setAuthenticatedUser(user);
        logActivity(mode==="register"?"ثبت‌نام سروری":"ورود سروری","");
        onLoggedIn(user);
        setBusy(false);
        return;
      }
      if(!localAccountsAllowed()){setErr("ورود با حساب در این نسخه فعال نیست؛ برای آزمایش از «ورود مهمان» استفاده کنید یا با مدیر سیستم تماس بگیرید.");setBusy(false);return;}
      const emailKey=email.trim().toLowerCase();
      if(mode==="register"){
        if(password!==password2){setErr("تکرار رمز عبور مطابقت ندارد");setBusy(false);return;}
        const r=await registerUser({email:emailKey,password,firstName,lastName,phone});
        if(!r.ok){setErr(r.error);setBusy(false);return;}
        startSession(emailKey);
        logActivity("ثبت‌نام و ورود","حساب کاربری جدید ایجاد شد");
        if(r.recoveryCode){setRecovery({code:r.recoveryCode,title:"کد بازیابی رمز عبور",after:()=>onLoggedIn(emailKey)});setBusy(false);return;}
        onLoggedIn(emailKey);
      }else{
        const r=await loginUser(emailKey,password);
        if(!r.ok){setErr(r.error);setBusy(false);return;}
        startSession(emailKey);
        logActivity("ورود به حساب","");
        onLoggedIn(emailKey);
      }
    }catch(error){
      setErr(error?.message||"خطایی رخ داد، دوباره تلاش کنید");
      // کپچا لازم شد/غلط بود، یا کپچا نمایش داده می‌شد و تلاش رد شد (چالش مصرف شده) → کد تازه
      if(remoteAuth&&mode==="login"&&(isCaptchaCode(error?.code)||captcha))await loadCaptcha();
    }
    setBusy(false);
  };

  return(
    <div className="fl-root" style={{...themeVars(theme),minHeight:"100vh",background:"var(--bg-app)",color:"var(--text-primary)",fontFamily:appFontFamily(customFont),direction:"rtl",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380,background:"var(--bg-card)",borderRadius:16,padding:28,boxShadow:"0 25px 60px #000a"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{marginBottom:8,display:"flex",justifyContent:"center"}}><BrandWordmark height={72}/></div>
          <div data-testid="auth-brand" style={{fontSize:20,fontWeight:800,color:"var(--accent-light)"}}>{APP_BRAND.fa} <span style={{opacity:.5,fontWeight:400}}>|</span> <span dir="ltr" style={{letterSpacing:1.5}}>{APP_BRAND.en}</span></div>
          <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:3}}>{APP_BRAND.tagline}</div>
          <div style={{fontSize:12,color:"var(--text-muted)",marginTop:4}}>{recovery?"کد بازیابی":mode==="forgot"?"فراموشی رمز عبور":mode==="login"?"ورود به حساب کاربری":"ساخت حساب کاربری جدید"}</div>
        </div>
        {!remoteAuth&&!recovery&&localAccountsAllowed()&&<div data-testid="local-accounts-notice" role="note" style={{fontSize:11.5,lineHeight:1.9,color:"var(--text-secondary)",background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.35)",borderRadius:10,padding:"8px 10px",marginBottom:14}}>{LOCAL_ACCOUNTS_NOTICE}</div>}

        {recovery?(
          <RecoveryCodeNotice code={recovery.code} title={recovery.title} onDone={recovery.after}/>
        ):mode==="forgot"?(
          <ForgotPasswordForm remote={remoteAuth} initialEmail={email}
            onBack={(text)=>{setMode("login");setErr("");setNotice(text||"");}}
            onRecoveryCode={(code)=>setRecovery({code,title:"رمز تغییر کرد — کد بازیابی جدید",after:()=>{setRecovery(null);setMode("login");setPassword("");setNotice("رمز عبور تغییر کرد؛ با رمز جدید وارد شوید.");}})}/>
        ):(<>
        <div style={{display:"flex",gap:6,marginBottom:18,background:"var(--bg-app)",borderRadius:10,padding:4}}>
          <button onClick={()=>{setMode("login");setErr("");}} style={{flex:1,background:mode==="login"?"#2563eb":"transparent",color:mode==="login"?"#fff":"var(--text-secondary)",border:"none",borderRadius:8,padding:"8px 0",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>ورود</button>
          <button onClick={()=>{setMode("register");setErr("");}} style={{flex:1,background:mode==="register"?"#2563eb":"transparent",color:mode==="register"?"#fff":"var(--text-secondary)",border:"none",borderRadius:8,padding:"8px 0",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>ثبت‌نام</button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="register"&&<>
            <label style={{fontSize:13,color:"var(--text-secondary)"}}>نام
              <input autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="نام" style={INP}/>
            </label>
            <label style={{fontSize:13,color:"var(--text-secondary)"}}>نام خانوادگی
              <input autoComplete="family-name" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="نام خانوادگی" style={INP}/>
            </label>
            <label style={{fontSize:13,color:"var(--text-secondary)"}}>شماره موبایل
              <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="۰۹۱۲۳۴۵۶۷۸۹" style={INP}/>
            </label>
          </>}
          <label style={{fontSize:13,color:"var(--text-secondary)"}}>ایمیل
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="example@mail.com" style={INP} dir="ltr"/>
          </label>
          <label style={{fontSize:13,color:"var(--text-secondary)"}}>رمز عبور
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" style={INP} dir="ltr"/>
          </label>
          {mode==="register"&&(
            <label style={{fontSize:13,color:"var(--text-secondary)"}}>تکرار رمز عبور
              <input type="password" value={password2} onChange={e=>setPassword2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" style={INP} dir="ltr"/>
            </label>
          )}
          {remoteAuth&&mode==="login"&&captcha&&<LoginCaptcha challenge={captcha} loading={captchaLoading} value={captchaAnswer} onChange={setCaptchaAnswer} onRefresh={loadCaptcha} onSubmit={submit}/>}
          {mode==="login"&&<button data-testid="forgot-link" type="button" onClick={()=>{setMode("forgot");setErr("");setNotice("");}} style={{background:"transparent",border:"none",color:"var(--accent-light)",fontSize:12,cursor:"pointer",fontFamily:"inherit",textAlign:"right",padding:0,marginTop:-4}}>رمز عبور را فراموش کرده‌اید؟</button>}
          {notice&&<div data-testid="auth-notice" style={{background:"#052e16",border:"1px solid #16a34a44",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#4ade80"}}>✓ {notice}</div>}
          {err&&<div style={{background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#f87171"}}>⚠️ {err}</div>}
          <button onClick={submit} disabled={busy} style={{...BTN("#2563eb"),padding:11,fontSize:14,marginTop:6,opacity:busy?0.6:1}}>{busy?"در حال بررسی...":(mode==="login"?"ورود":"ثبت‌نام و ورود")}</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,margin:"18px 0 12px",color:"var(--text-dim)",fontSize:11}}><span style={{flex:1,height:1,background:"var(--border)"}}/>یا<span style={{flex:1,height:1,background:"var(--border)"}}/></div>
        <button data-testid="guest-login" type="button" onClick={()=>enterGuestMode()} style={{...BTN("var(--bg-app)","var(--text-primary)"),width:"100%",padding:11,fontSize:13,border:"1px dashed var(--accent-light)"}}>🧪 ورود مهمان (آزمایش برنامه)</button>
        <div style={{fontSize:11,color:"var(--text-muted)",textAlign:"center",marginTop:8,lineHeight:1.9}}>بدون حساب و با داده‌های نمونه. محیط مهمان از داده‌های واقعی جداست و هیچ اطلاعاتی از آن ذخیره یا ارسال نمی‌شود؛ با خروج یا بستن پنجره پاک می‌شود.</div>
</>)}
        {SHOW_SERVER_SETTINGS&&<>
        <div style={{fontSize:11,color:remoteAuth?"#4ade80":"#fbbf24",textAlign:"center",marginTop:16,lineHeight:1.9}}>{remoteAuth?"ورود و ثبت‌نام توسط سرور انجام می‌شود؛ رمز عبور در مرورگر ذخیره نمی‌شود.":"حالت آزمایشی محلی: ورود و کاربران این حالت فقط برای توسعه هستند و برای استفاده واقعی امن نیستند."}</div>
        <details style={{marginTop:12,fontSize:11,color:"var(--text-dim)"}}>
          <summary style={{cursor:"pointer"}}>تنظیم اتصال امن به سرور</summary>
          <label style={{display:"block",marginTop:8}}>نشانی API
            <input value={apiUrl} onChange={e=>setApiUrl(e.target.value)} placeholder="https://api.example.com" style={{...INP,marginTop:4,direction:"ltr"}}/>
          </label>
          <button onClick={()=>{saveApiConfig({...getApiConfig(),baseUrl:apiUrl});window.location.reload();}} style={{...BTN("#2563eb"),marginTop:8,width:"100%"}}>ذخیره و ورود با سرور</button>
        </details>
        </>}
      </div>
    </div>
  );
}
