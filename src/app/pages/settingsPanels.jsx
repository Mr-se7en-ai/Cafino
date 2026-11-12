// Generated from App.jsx by the module split (v1.50.0). Section: settingsPanels
import React, { useState, useEffect, useRef } from "react";
import Icon, { ICONS } from "../../components/Icon.jsx";
import { getApiConfig, saveApiConfig, isApiConnected, apiResources, apiRequest } from "../../services/api/client.js";
import { clearAuthSession, discardLegacyLocalCredentials, getAuthenticatedUser, normalizeAuthUser, setAuthSession, setAuthenticatedUser } from "../../services/auth/session.js";
import { logActivity } from "../core/activity.js";
import { audit } from "../../audit/auditTrail.js";
import { fmtM } from "../core/format.js";
import { BTN, DEFAULT_PRINT_COSTS, INP, PAYMENT_ACCOUNTS_KEY, latinDigits } from "../core/constants.js";
import { suggestPrintUnitPrice, usePrintCosts } from "./printScan.jsx";
import { emitDataChange, getPaymentAccounts, lsWrite, refreshPaymentMethods, uid } from "../domain/sales.jsx";
import { useTariffData } from "./tariff.jsx";


// ── Shared UI components ──
// ══════════════════════════════════════════════════════════════════
// SIMPLE CALCULATOR (popup)
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// BACKUP / RESTORE MODAL (پشتیبان‌گیری)
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// ACTIVITY LOG VIEWER (لاگ فعالیت کاربران) — shown in Settings
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// BACKUP PANEL (inline, embedded in Settings) — same logic as BackupModal
// but rendered directly in the page instead of as a popup.
// ══════════════════════════════════════════════════════════════════
export function PaymentAccountsSettings(){
  const [accounts,setAccounts]=useState(()=>getPaymentAccounts());
  const [kind,setKind]=useState("pos");
  const [bank,setBank]=useState("");
  const [name,setName]=useState("");
  const [lastFour,setLastFour]=useState("");
  const [cardNumber,setCardNumber]=useState("");
  const [iban,setIban]=useState("");
  const [error,setError]=useState("");
  const add=()=>{
    const bankName=bank.trim(),accountName=name.trim(),digits=lastFour.replace(/\D/g,"").slice(-4),card=latinDigits(cardNumber).replace(/\D/g,"").slice(0,16),sheba=latinDigits(iban).toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!bankName){setError("نام بانک را وارد کنید.");return;}
    if(!accountName){setError(kind==="pos"?"برای تشخیص کارتخوان، یک عنوان وارد کنید.":"برای حساب بانکی، یک عنوان وارد کنید.");return;}
    if(card&&card.length!==16){setError("شماره کارت باید ۱۶ رقم باشد.");return;}
    if(sheba&&!/^IR\d{24}$/.test(sheba)){setError("شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.");return;}
    const entry={key:`${kind}_${uid()}`,kind,label:`${kind==="pos"?"کارتخوان":"حساب بانکی"} ${bankName} — ${accountName}${digits?` (…${digits})`:""}`,bank:bankName,name:accountName,lastFour:digits,cardNumber:card,iban:sheba};
    const next=[...accounts,entry];setAccounts(next);lsWrite(PAYMENT_ACCOUNTS_KEY,next);refreshPaymentMethods(next);emitDataChange();
    logActivity(kind==="pos"?"افزودن کارتخوان بانکی":"افزودن حساب بانکی",entry.label);
    setBank("");setName("");setLastFour("");setCardNumber("");setIban("");setError("");
  };
  return <div style={{background:"var(--bg-card)",borderRadius:12,padding:18}}>
    <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>🏦 کارتخوان‌ها و حساب‌های بانکی</div>
    <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:14}}>هر کارتخوان یا حساب بانکی را جداگانه ثبت کنید. بعد از ثبت، در روش‌های دریافت و پرداخت، فاکتورها و گزارش صندوق قابل انتخاب و پیگیری است.</div>
    <div style={{background:"var(--bg-app)",borderRadius:10,padding:14,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,alignItems:"end",marginBottom:14}}>
      <label style={{fontSize:12,color:"var(--text-secondary)"}}>نوع
        <select value={kind} onChange={e=>setKind(e.target.value)} style={INP}><option value="pos">کارتخوان بانکی</option><option value="bank">حساب بانکی</option></select>
      </label>
      <label style={{fontSize:12,color:"var(--text-secondary)"}}>نام بانک
        <input value={bank} onChange={e=>setBank(e.target.value)} placeholder="مثلاً ملت" style={INP}/>
      </label>
      <label style={{fontSize:12,color:"var(--text-secondary)"}}>عنوان برای تشخیص
        <input value={name} onChange={e=>setName(e.target.value)} placeholder={kind==="pos"?"مثلاً صندوق اصلی":"مثلاً حساب جاری"} style={INP}/>
      </label>
      <label style={{fontSize:12,color:"var(--text-secondary)"}}>شماره کارت (اختیاری)
        <input value={cardNumber} onChange={e=>setCardNumber(e.target.value)} inputMode="numeric" maxLength={23} placeholder="۶۰۳۷…" style={{...INP,direction:"ltr",textAlign:"right"}}/>
      </label>
      <label style={{fontSize:12,color:"var(--text-secondary)"}}>شماره شبا (اختیاری)
        <input value={iban} onChange={e=>setIban(e.target.value)} inputMode="text" maxLength={29} placeholder="IR…" style={{...INP,direction:"ltr",textAlign:"right"}}/>
      </label>
      <button type="button" onClick={add} style={{...BTN("#2563eb"),padding:"10px 16px"}}>＋ افزودن</button>
    </div>
    {error&&<div style={{fontSize:12,color:"#f87171",marginBottom:10}}>{error}</div>}
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {accounts.map(a=><div key={a.key} style={{background:"var(--bg-app)",borderRadius:9,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,fontSize:13}}><span>{a.kind==="pos"?"💳":"🏦"}</span><span style={{flex:1}}>{a.label}</span><span style={{fontSize:10,color:"var(--text-muted)"}}>{a.kind==="pos"?"کارتخوان":"حساب بانکی"}</span></div>)}
      {accounts.length===0&&<div style={{textAlign:"center",padding:14,color:"var(--text-muted)",fontSize:12}}>هنوز کارتخوان یا حساب بانکی اضافه نشده است.</div>}
    </div>
  </div>;
}

export function PrintScanSettingsPanel({onOpenTool}){
  const [costs,setCosts]=usePrintCosts();
  const [tariffData]=useTariffData();
  const setCost=(k,v)=>setCosts(c=>({...c,[k]:Math.max(0,Number(v)||0)}));
  const field=(k,label,icon)=>(
    <label style={{fontSize:12,color:"var(--text-muted)"}}>{icon} {label}
      <input type="number" value={costs[k]} onChange={e=>setCost(k,e.target.value)} style={INP}/>
    </label>
  );
  const bwCost=costs.paperPerPage+costs.inkBWPerPage+costs.servicePerPage;
  const colorCost=costs.paperPerPage+costs.inkColorPerPage+costs.servicePerPage;
  const bwPrice=suggestPrintUnitPrice(tariffData,"print",false,"A4");
  const colorPrice=suggestPrintUnitPrice(tariffData,"print",true,"A4");
  const margin=(price,cost)=>price!=null?`سود هر برگ ≈ ${fmtM(price-cost)}`:"قیمت در تعرفه تعریف نشده";
  return(
    <div style={{background:"var(--bg-card)",borderRadius:14,padding:22}}>
      <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)",marginBottom:6,display:"flex",alignItems:"center",gap:8}}><Icon name="Printer" size={18}/>تنظیمات پرینت و اسکن</div>
      <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:16,lineHeight:1.9}}>هزینه تمام‌شده هر برگ A4 (ریال) — برای اندازه‌های دیگر خودکار ضرب می‌شود (A5 ×۰٫۶ ، A3 ×۲). این مقادیر در صفحه «پرینت و اسکن» برای محاسبه سود هر کار استفاده می‌شوند.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
        {field("paperPerPage","هزینه کاغذ","💵")}
        {field("inkBWPerPage","هزینه جوهر/تونر سیاه‌وسفید","⚫")}
        {field("inkColorPerPage","هزینه جوهر/تونر رنگی","🌈")}
        {field("servicePerPage","هزینه سرویس دستگاه (استهلاک)","🔧")}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10,marginTop:16}}>
        <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:11,color:"var(--text-muted)"}}>هزینه هر برگ سیاه‌وسفید A4</div>
          <div style={{fontSize:14,fontWeight:700,marginTop:3}}>{fmtM(bwCost)}</div>
          <div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>{margin(bwPrice,bwCost)}</div>
        </div>
        <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:11,color:"var(--text-muted)"}}>هزینه هر برگ رنگی A4</div>
          <div style={{fontSize:14,fontWeight:700,marginTop:3}}>{fmtM(colorCost)}</div>
          <div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>{margin(colorPrice,colorCost)}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
        <button onClick={()=>setCosts(DEFAULT_PRINT_COSTS)} style={{...BTN("var(--border)","var(--text-secondary)"),fontSize:12}}>بازگشت به مقادیر پیش‌فرض</button>
        {onOpenTool&&<button onClick={onOpenTool} style={{...BTN("#2563eb"),fontSize:12,display:"flex",alignItems:"center",gap:6}}><Icon name="Printer" size={14}/>رفتن به صفحه پرینت و اسکن</button>}
      </div>
      <div style={{fontSize:11,color:"var(--text-dim)",marginTop:12}}>قیمت فروش هر برگ از «تعرفه» خوانده می‌شود؛ برای تغییر آن به تب تعرفه بروید.</div>
    </div>
  );
}

export function ServerConnectionPanel(){
  const [cfg,setCfg]=useState(()=>getApiConfig());
  const [msg,setMsg]=useState(null);
  const [busy,setBusy]=useState(false);
  const inp={width:"100%",background:"var(--bg-app)",border:"1px solid var(--border)",borderRadius:9,padding:"10px 12px",color:"var(--text-primary)",fontSize:13,fontFamily:"inherit",direction:"ltr",textAlign:"left",boxSizing:"border-box",marginTop:5};
  const save=()=>{saveApiConfig(cfg);setMsg({ok:true,text:"✓ ذخیره شد. برای اعمال، صفحه سفارش‌ها را دوباره باز کنید."});logActivity("ذخیره تنظیمات اتصال به سرور","");};
  const test=async()=>{
    saveApiConfig(cfg);setBusy(true);setMsg(null);
    try{await apiResources.auth.me();setMsg({ok:true,text:"✓ سرور احراز هویت پاسخ داد"});}
    catch(e){if(e.status===401)setMsg({ok:true,text:"سرور در دسترس است؛ برای ادامه از صفحه ورود با سرور استفاده کنید."});else setMsg({ok:false,text:"✗ "+(e.message||"اتصال برقرار نشد")});}
    setBusy(false);
  };
  const disconnect=()=>{const e={baseUrl:"",cafeId:""};setCfg(e);saveApiConfig(e);clearAuthSession();setMsg({ok:true,text:"اتصال قطع شد؛ در حالت توسعه احراز هویت محلی استفاده می‌شود."});};
  return(
    <div style={{background:"var(--bg-card)",borderRadius:14,padding:22}}>
      <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)",marginBottom:6,display:"flex",alignItems:"center",gap:8}}><Icon name="Plug" size={18}/>اتصال به سرور مرکزی</div>
      <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:16,lineHeight:1.9}}>با اتصال به سرور، سفارش‌هایی که مشتریان از پورتال ثبت می‌کنند در تب «سفارش‌ها» نمایش داده می‌شود و تغییر وضعیت سفارش‌ها به سرور ارسال می‌شود.</div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <label style={{fontSize:13,color:"var(--text-secondary)"}}>آدرس سرور (Base URL)<input value={cfg.baseUrl} onChange={e=>setCfg(c=>({...c,baseUrl:e.target.value.trim()}))} placeholder="https://api.example.com" style={inp}/></label>
        <label style={{fontSize:13,color:"var(--text-secondary)"}}>شناسه کافی‌نت (اختیاری)<input value={cfg.cafeId} onChange={e=>setCfg(c=>({...c,cafeId:e.target.value.trim()}))} style={inp}/></label>
      </div>
      <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
        <button onClick={save} style={{...BTN("#2563eb"),padding:"9px 18px"}}>ذخیره</button>
        <button onClick={test} disabled={busy||!cfg.baseUrl} style={{...BTN("#166534","#fff"),padding:"9px 18px",opacity:(busy||!cfg.baseUrl)?0.5:1}}>{busy?"در حال تست...":"تست اتصال"}</button>
        <button onClick={disconnect} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"9px 18px"}}>قطع اتصال</button>
      </div>
      {msg&&<div style={{marginTop:12,fontSize:12,color:msg.ok?"#4ade80":"#f87171"}}>{msg.text}</div>}
      <div style={{marginTop:16,fontSize:11,color:"var(--text-dim)",lineHeight:1.9}}>توکن ورود در حافظه نشست نگهداری می‌شود؛ روش اصلی سرور باید Cookie امن HttpOnly باشد. هر دسترسی به داده و عملیات حساس باید سمت API مجدداً بررسی شود.</div>
    </div>
  );
}

export function UserManagementPanel(){
  const [form,setForm]=useState({email:"",firstName:"",lastName:"",phone:"",role:"staff"});
  const [result,setResult]=useState(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const submit=async()=>{setBusy(true);setError("");setResult(null);try{const value=await apiRequest("/api/users/invite",{method:"POST",body:form});audit({action:"permission_change",label:"ساخت کاربر و تعیین نقش",entityType:"کاربر",entityId:value?.user?.id||form.email,entityLabel:`${form.firstName} ${form.lastName} <${form.email}>`.trim(),after:{role:form.role},details:`نقش: ${({staff:"کارمند",manager:"مدیر شعبه",admin:"مدیر سازمان"})[form.role]||form.role}`});setResult(value);setForm({email:"",firstName:"",lastName:"",phone:"",role:"staff"});}catch(e){setError(e?.message||"دعوت کاربر انجام نشد");}finally{setBusy(false);}};
  if(!isApiConnected())return <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,fontSize:13,color:"var(--text-secondary)"}}>برای مدیریت کاربران، ابتدا API سرور را در تنظیمات اتصال کنید.</div>;
  return(
    <div style={{background:"var(--bg-card)",borderRadius:14,padding:20,maxWidth:720}}>
      <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)",marginBottom:6}}>کاربران و دسترسی شعبه</div>
      <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9,marginBottom:14}}>دعوت فعلاً کاربر را به سازمان و شعبهٔ فعال شما اضافه می‌کند. رمز موقت فقط یک بار نمایش داده می‌شود و کاربر باید آن را پس از ورود عوض کند.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
        <label style={{fontSize:12,color:"var(--text-secondary)"}}>ایمیل<input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={INP}/></label>
        <label style={{fontSize:12,color:"var(--text-secondary)"}}>نام<input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} style={INP}/></label>
        <label style={{fontSize:12,color:"var(--text-secondary)"}}>نام خانوادگی<input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} style={INP}/></label>
        <label style={{fontSize:12,color:"var(--text-secondary)"}}>موبایل<input type="tel" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={INP}/></label>
        <label style={{fontSize:12,color:"var(--text-secondary)"}}>نقش<select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={INP}><option value="staff">کارمند</option><option value="manager">مدیر شعبه</option><option value="admin">مدیر سازمان</option></select></label>
      </div>
      <button onClick={submit} disabled={busy||!form.email||!form.firstName||!form.lastName} style={{...BTN("#2563eb"),marginTop:14,padding:"10px 18px",opacity:busy?0.6:1}}>{busy?"در حال ساخت دعوت…":"ساخت کاربر و نمایش رمز موقت"}</button>
      {error&&<div style={{color:"#f87171",fontSize:12,marginTop:12}}>{error}</div>}
      {result&&<div style={{background:"#052e16",border:"1px solid #16a34a55",borderRadius:10,padding:14,marginTop:14,fontSize:12,lineHeight:2}}><div>کاربر {result.user?.email} اضافه شد. این رمز را امن و یک‌بار در اختیار کاربر بگذارید:</div><code dir="ltr" style={{display:"inline-block",background:"#020617",borderRadius:6,padding:"4px 9px",fontSize:14,userSelect:"all"}}>{result.temporaryPassword}</code><button onClick={()=>navigator.clipboard?.writeText(result.temporaryPassword)} style={{...BTN("var(--border)","var(--text-primary)"),marginRight:8,padding:"5px 10px"}}>کپی رمز</button></div>}
    </div>
  );
}
