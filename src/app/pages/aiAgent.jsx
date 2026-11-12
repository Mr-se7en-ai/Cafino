// Generated from App.jsx by the module split (v1.50.0). Section: aiAgent
import React, { useState, useEffect, useRef } from "react";
import { currencyLabel, displayMoney, fmtM, getCurrencyUnit, toFA } from "../core/format.js";
import { isoToJKey, jalaliLabel, p2 } from "../domain/backup.js";
import { bizLineStats } from "./bizReports.jsx";
import { BTN, DEFAULT_INVENTORY, INP, INV_STORAGE_KEY, JM, TX_KEY } from "../core/constants.js";
import { computeDebtors, isoDaysAgo } from "./dashboard.jsx";
import { collectFollowUps, fuCounts } from "./followups.jsx";
import { dateToJalali, todayIso } from "../core/jalali.js";
import { financeOf, getSales, lsRead, lsWrite } from "../domain/sales.jsx";


// ══════════════════════════════════════════════════════════════════
// اتصال اختیاری به ایجنت هوش مصنوعی (OpenAI-سازگار، Claude، یا وب‌هوک) — تنظیمات › هوش مصنوعی
// ══════════════════════════════════════════════════════════════════
const AGENT_KEY="cafenet_ai_agent";
 // عمداً در BACKUP_KEYS نیست تا کلید API داخل فایل پشتیبان نرود
const AGENT_DEFAULT={type:"openai",url:"",key:"",keyInSecure:false,model:"",extra:"",shareStats:true,shareNames:false,mode:"local"};

const AGENT_TYPES={openai:"سازگار با OpenAI (OpenAI، OpenRouter، Ollama، LM Studio، ...)",anthropic:"Claude (Anthropic)",webhook:"وب‌هوک دلخواه (n8n، سرور خودتان)"};

// کلید API در نسخهٔ دسکتاپ در ذخیرهٔ امن سیستم‌عامل (DPAPI/Keychain) نگهداری می‌شود، نه localStorage. در وب/PWA همان localStorage می‌ماند.
const SECRET_NAME="ai_agent_key";
const nativeSecrets=()=>{try{const b=typeof window!=="undefined"?window.cafenetNative:null;return b&&b.secrets?b.secrets:null;}catch{return null;}};
// پیام هشدار ذخیرهٔ امن (مثلاً نبودن libsecret روی اوبونتو)؛ خالی = مشکلی نیست یا نسخهٔ مرورگری
export async function secureKeyWarning(){const s=nativeSecrets();if(!s)return "";try{const c=window.cafenetNative.capabilities?await window.cafenetNative.capabilities():{};return c.secureStore?"":String((c.secureStoreStatus&&c.secureStoreStatus.warning)||"");}catch{return "";}}
export async function secureKeyAvailable(){const s=nativeSecrets();if(!s)return false;try{const c=window.cafenetNative.capabilities?await window.cafenetNative.capabilities():{};return !!c.secureStore;}catch{return false;}}
// کلید قدیمی داخل localStorage → به ذخیرهٔ امن منتقل و از localStorage پاک می‌شود
export async function migrateAgentKey(){
  const c=getAgentCfg();const s=nativeSecrets();
  if(!s||!c.key||!(await secureKeyAvailable()))return false;
  try{await s.set(SECRET_NAME,c.key);lsWrite(AGENT_KEY,{...c,key:"",keyInSecure:true});return true;}catch{return false;}
}
async function resolveAgentKey(cfg){
  if(cfg.key||!cfg.keyInSecure)return cfg;
  const s=nativeSecrets();if(!s)return cfg;
  try{return{...cfg,key:await s.get(SECRET_NAME)||""};}catch{return cfg;}
}
export function getAgentCfg(){const v=lsRead(AGENT_KEY,null);return{...AGENT_DEFAULT,...(v&&typeof v==="object"?v:{})};}

export function agentReady(c){return !!(c.url&&(c.type==="webhook"||c.model));}

async function agentFetch(url,opts){
  if(typeof window!=="undefined"&&window.cafenetNative&&window.cafenetNative.fetch)return window.cafenetNative.fetch(url,opts);
  const ac=new AbortController();const tm=setTimeout(()=>ac.abort(),60000);
  try{const res=await fetch(url,{...opts,signal:ac.signal});const text=await res.text();return{ok:res.ok,status:res.status,text};}
  catch(e){throw new Error(e&&e.name==="AbortError"?"پاسخی دریافت نشد (۶۰ ثانیه).":"ارتباط برقرار نشد. آدرس را بررسی کنید؛ اگر برنامه را در مرورگر باز کرده‌اید، ممکن است سرور اجازه‌ی دسترسی (CORS) ندهد — نسخه‌ی ویندوز این مشکل را ندارد.");}
  finally{clearTimeout(tm);}
}

function buildAgentContext(cfg){
  if(!cfg.shareStats)return"";
  const tx=lsRead(TX_KEY,[]),sales=getSales(),today=todayIso();const [jy,jm]=dateToJalali(today);
  const mk=`${jy}-${p2(jm)}`;
  const fd=financeOf(d=>d===today,tx,sales),fm=financeOf(d=>isoToJKey(d,"monthly")===mk,tx,sales);
  const L=[];const R=n=>Math.round(n).toLocaleString("en-US");
  L.push(`تاریخ امروز: ${jalaliLabel(today)}. همه‌ی مبالغ به ریال است.`);
  L.push(`امروز: فروش ${R(fd.revenue)}، دریافتی ${R(fd.received)}، هزینه مستقیم ${R(fd.direct)}، سود ناخالص ${R(fd.gross)}، هزینه جاری ${R(fd.operating)}، سود خالص ${R(fd.net)}، تعداد فروش ${fd.count}.`);
  L.push(`${JM[jm-1]} تاکنون: فروش ${R(fm.revenue)}، دریافتی ${R(fm.received)}، هزینه مستقیم ${R(fm.direct)}، سود ناخالص ${R(fm.gross)}، هزینه جاری ${R(fm.operating)}، سود خالص ${R(fm.net)}، تعداد فروش ${fm.count}.`);
  const st=bizLineStats(isoDaysAgo(30),"","service").sort((a,b)=>b.revenue-a.revenue).slice(0,8);
  if(st.length)L.push("خدمات ۳۰ روز اخیر (نام | تعداد | فروش | سود | حاشیه): "+st.map(r=>`${r.name} | ${R(r.qty)} | ${R(r.revenue)} | ${R(r.profit)} | ${Math.round(r.margin*100)}٪`).join(" ؛ "));
  const debtors=computeDebtors();
  L.push(`بدهی مشتریان: جمع ${R(debtors.reduce((a,x)=>a+x.amount,0))} از ${debtors.length} نفر.`+(cfg.shareNames&&debtors.length?" بدهکاران: "+debtors.slice(0,5).map(d=>`${d.name} ${R(d.amount)}`).join("، "):""));
  const low=(lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY).filter(i=>Number(i.qty)<=Number(i.minQty));
  L.push(low.length?`موجودی رو به اتمام: ${low.slice(0,8).map(i=>`${i.name} (${i.qty} ${i.unit||""})`).join("، ")}.`:"موجودی همه اقلام کافی است.");
  try{const c=fuCounts(collectFollowUps());L.push(`پیگیری مشتریان: ${c.overdue} عقب‌افتاده، ${c.today} امروز، ${c.future} آینده.`);}catch{}
  return L.join("\n");
}

function agentSystemPrompt(cfg){
  const ctx=buildAgentContext(cfg);
  return `تو دستیار هوشمند یک برنامه‌ی حسابداری و مدیریت کافی‌نت (ایران) هستی. فارسی، کوتاه و کاربردی جواب بده. فقط از داده‌های زیر استفاده کن؛ اگر داده‌ی لازم نیست یا نداری، صادقانه بگو و عدد حدسی نساز. تو نمی‌توانی در برنامه تغییری ایجاد کنی؛ فقط تحلیل و پیشنهاد بده.\n${cfg.extra?("\nدستور مالک: "+cfg.extra+"\n"):""}\n${ctx?("داده‌های فعلی کسب‌وکار:\n"+ctx):"(داده‌ای از برنامه ارسال نمی‌شود.)"}`;
}

export async function agentAsk(cfg0,history,text){
  await migrateAgentKey();
  const cfg=await resolveAgentKey(cfg0.key?cfg0:{...cfg0,keyInSecure:cfg0.keyInSecure||getAgentCfg().keyInSecure});
  const system=agentSystemPrompt(cfg);
  const hist=history.slice(-10).map(m=>({role:m.from==="me"?"user":"assistant",content:m.text}));
  while(hist.length&&hist[0].role==="assistant")hist.shift(); // Claude API: پیام اول باید از کاربر باشد
  let url=cfg.url.trim(),headers={"Content-Type":"application/json"},body;
  if(cfg.type==="openai"){
    if(!/\/chat\/completions\/?$/.test(url))url=url.replace(/\/+$/,"")+"/chat/completions";
    if(cfg.key)headers.Authorization="Bearer "+cfg.key;
    body={model:cfg.model,temperature:0.3,messages:[{role:"system",content:system},...hist,{role:"user",content:text}]};
  }else if(cfg.type==="anthropic"){
    if(!/\/v1\/messages\/?$/.test(url))url=url.replace(/\/+$/,"")+"/v1/messages";
    headers["x-api-key"]=cfg.key;headers["anthropic-version"]="2023-06-01";headers["anthropic-dangerous-direct-browser-access"]="true";
    body={model:cfg.model,max_tokens:1024,system,messages:[...hist,{role:"user",content:text}]};
  }else{
    if(cfg.key)headers.Authorization="Bearer "+cfg.key;
    body={message:text,history:hist,system,context:buildAgentContext(cfg)};
  }
  const r=await agentFetch(url,{method:"POST",headers,body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`خطای سرور (${r.status}): ${String(r.text||"").slice(0,200)}`);
  let j=null;try{j=JSON.parse(r.text);}catch{}
  let out="";
  if(cfg.type==="openai")out=j&&j.choices&&j.choices[0]&&(j.choices[0].message&&j.choices[0].message.content||j.choices[0].text)||"";
  else if(cfg.type==="anthropic")out=j&&Array.isArray(j.content)?j.content.filter(x=>x.type==="text").map(x=>x.text).join("\n"):"";
  else out=j?(j.reply||j.answer||j.text||j.output||(typeof j.message==="string"?j.message:"")||""):String(r.text||"");
  out=String(out||"").trim();
  if(!out)throw new Error("پاسخ خالی یا با قالب ناشناخته برگشت.");
  return out;
}

export const VOICE_FORMAT={
  money:fmtM,date:(iso)=>jalaliLabel(iso),num:(n)=>toFA(Number(n)||0),
  toDisplay:(n)=>displayMoney(n),fromDisplay:(n)=>getCurrencyUnit()==="toman"?Math.round(n*10):n,unitLabel:()=>currencyLabel(),
};

export const VOICE_STORE={read:(k,d)=>lsRead(k,d),write:(k,v)=>lsWrite(k,v)};

export function AiAgentPanel(){
  const [cfg,setCfg]=useState(()=>getAgentCfg());
  const [test,setTest]=useState("");
  const [saved,setSaved]=useState(false);
  const set=(patch)=>{setCfg(c=>({...c,...patch}));setSaved(false);};
  const ready=agentReady(cfg);
  const runTest=async()=>{
    setTest("در حال آزمایش...");
    try{const a=await agentAsk({...cfg,shareStats:false},[],"فقط بنویس: اتصال برقرار است");setTest("✅ متصل شد: "+a.slice(0,120));}
    catch(e){setTest("❌ "+e.message);}
  };
  const [secure,setSecure]=useState(false);const [secWarn,setSecWarn]=useState("");
  useEffect(()=>{let alive=true;secureKeyWarning().then(w=>{if(alive)setSecWarn(w);});return()=>{alive=false;};},[]);
  useEffect(()=>{let alive=true;(async()=>{const ok=await secureKeyAvailable();if(!alive)return;setSecure(ok);if(ok&&await migrateAgentKey()&&alive)setCfg(getAgentCfg());})();return()=>{alive=false;};},[]);
  const save=async()=>{
    const c={...cfg,url:cfg.url.trim(),model:cfg.model.trim()};if(!agentReady(c))c.mode="local";
    if(secure&&nativeSecrets()){try{if(c.key){await nativeSecrets().set(SECRET_NAME,c.key);c.keyInSecure=true;}else if(!c.keyInSecure){await nativeSecrets().delete(SECRET_NAME);}c.key="";}catch{/* ذخیرهٔ امن شکست خورد: کلید همان‌جا می‌ماند */}}
    lsWrite(AGENT_KEY,c);setCfg(c);setSaved(true);setTimeout(()=>setSaved(false),2500);
  };
  const reset=()=>{lsWrite(AGENT_KEY,{...AGENT_DEFAULT});try{nativeSecrets()&&nativeSecrets().delete(SECRET_NAME);}catch{}setCfg({...AGENT_DEFAULT});setTest("");};
  const field=(label,node)=><label style={{display:"block",fontSize:12,color:"var(--text-muted)",marginBottom:12}}>{label}{node}</label>;
  const inp={...INP,marginTop:4,padding:"9px 12px",fontSize:13};
  return(
    <div data-testid="ai-settings" style={{background:"var(--bg-card)",borderRadius:14,padding:"18px 20px",maxWidth:640}}>
      <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>🤖 اتصال به ایجنت هوش مصنوعی</div>
      <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.9,marginBottom:14}}>اختیاری است. دستیار صوتی پرسش‌های گزارشی («فروش امروز چقدر بود؟»، «کدوم خدمات رو گرون کنم؟») را با موتور داخلی پاسخ می‌دهد؛ اگر ایجنت را وصل کنید و حالت «ایجنت» را فعال کنید، پرسش‌ها به آن ارسال می‌شود و در صورت خطا دوباره موتور داخلی جواب می‌دهد. ثبت فرمان‌ها (هزینه، مشتری، فروش و …) همیشه محلی انجام می‌شود و به ایجنت نمی‌رود.</div>
      {field("نوع سرویس",<select data-testid="ag-type" value={cfg.type} onChange={e=>set({type:e.target.value})} style={inp}>{Object.entries(AGENT_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>)}
      {field(cfg.type==="webhook"?"آدرس وب‌هوک":cfg.type==="anthropic"?"آدرس API (پیش‌فرض: https://api.anthropic.com)":"آدرس پایه (مثلاً https://openrouter.ai/api/v1 یا http://localhost:11434/v1)",<input data-testid="ag-url" dir="ltr" value={cfg.url} onChange={e=>set({url:e.target.value})} placeholder={cfg.type==="anthropic"?"https://api.anthropic.com":"https://..."} style={{...inp,textAlign:"left"}}/>)}
      {cfg.type!=="webhook"&&field("نام مدل",<input data-testid="ag-model" dir="ltr" value={cfg.model} onChange={e=>set({model:e.target.value})} placeholder="مثلاً gpt-4o-mini یا claude-sonnet-4-5" style={{...inp,textAlign:"left"}}/>)}
      {secWarn&&<div data-testid="ag-secure-warn" role="alert" style={{background:"rgba(245,158,11,.12)",border:"1px solid rgba(245,158,11,.4)",borderRadius:10,padding:"9px 12px",fontSize:12,lineHeight:1.9,marginBottom:12}}>⚠ ذخیرهٔ امن سیستم‌عامل فعال نیست؛ کلید API در حافظهٔ عادی برنامه می‌ماند. {secWarn}</div>}
      {field(`کلید API (اختیاری برای سرور محلی)${secure?" — در ذخیرهٔ امن ویندوز نگهداری می‌شود":""}`,<input data-testid="ag-key" dir="ltr" type="password" value={cfg.key} onChange={e=>set({key:e.target.value,keyInSecure:e.target.value?false:cfg.keyInSecure})} placeholder={cfg.keyInSecure&&!cfg.key?"•••••••• (ذخیره‌شده؛ برای تغییر، کلید جدید را بنویسید)":""} style={{...inp,textAlign:"left"}}/>)}
      {field("دستور اضافه برای ایجنت (اختیاری)",<input data-testid="ag-extra" value={cfg.extra} onChange={e=>set({extra:e.target.value})} placeholder="مثلاً: لحن رسمی داشته باش" style={inp}/>)}
      <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,marginBottom:8,cursor:"pointer"}}><input type="checkbox" data-testid="ag-mode" checked={cfg.mode==="agent"} disabled={!ready} onChange={e=>set({mode:e.target.checked?"agent":"local"})}/> پاسخ پرسش‌های دستیار صوتی را از ایجنت بگیر{!ready&&<span style={{fontSize:11,color:"var(--text-dim)"}}> (ابتدا آدرس و مدل را کامل کنید)</span>}</label>
      <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,marginBottom:8,cursor:"pointer"}}><input type="checkbox" checked={cfg.shareStats} onChange={e=>set({shareStats:e.target.checked})}/> ارسال خلاصهٔ آمار کسب‌وکار به ایجنت (برای جواب‌های دقیق)</label>
      <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,marginBottom:12,opacity:cfg.shareStats?1:.5,cursor:"pointer"}}><input type="checkbox" disabled={!cfg.shareStats} checked={cfg.shareNames} onChange={e=>set({shareNames:e.target.checked})}/> شامل نام بدهکاران</label>
      <div style={{fontSize:11.5,color:"#fbbf24",lineHeight:1.9,background:"var(--bg-app)",borderRadius:8,padding:"8px 12px",marginBottom:12}}>⚠️ با فعال بودن ایجنت، متن پرسش و (در صورت تیک‌خوردن) خلاصهٔ آمار به سرویس انتخابی شما ارسال می‌شود. کلید API فقط در همین دستگاه ذخیره می‌شود و داخل فایل پشتیبان نمی‌آید. روی سیستم مشترک کافی‌نت از کلید با سقف هزینه استفاده کنید.</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <button data-testid="ag-test" onClick={runTest} style={{...BTN("var(--bg-app)","var(--accent-light)"),border:"1px solid var(--border)",padding:"8px 16px",fontSize:13}}>🔌 آزمایش اتصال</button>
        <button data-testid="ag-save" onClick={save} style={{...BTN("#16a34a"),padding:"8px 18px",fontSize:13}}>ذخیره</button>
        <button data-testid="ag-reset" onClick={reset} style={{...BTN("#450a0a","#f87171"),padding:"8px 14px",fontSize:13}}>حذف تنظیمات</button>
        {saved&&<span data-testid="ag-saved" style={{fontSize:12,color:"#4ade80"}}>✓ ذخیره شد</span>}
      </div>
      {test&&<div data-testid="ag-test-result" style={{fontSize:12,marginTop:12,lineHeight:1.8,wordBreak:"break-word"}}>{test}</div>}
    </div>
  );
}
