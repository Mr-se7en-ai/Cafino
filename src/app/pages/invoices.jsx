// Generated from App.jsx by the module split (v1.50.0). Section: invoices
import { ReasonChips, ensureOnlineForSensitive } from "../../audit/ReasonDialog.jsx";
import React, { useState, useEffect, useRef } from "react";
import InvoiceDashboard from "../../pages/invoices/InvoiceDashboard.jsx";
import { loadVendor } from "../../vendor/loader.js";
import { logActivity } from "../core/activity.js";
import { currencyLabel, displayMoney, fmtCompact, fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { BTN, CUSTOMERS_STORAGE_KEY, DEFAULT_INVENTORY, INP, INV_DASH_PERIODS, INV_STATE, INV_STORAGE_KEY, ORDERS_STORAGE_KEY, ORDER_STATUSES, TX_KEY, latinDigits } from "../core/constants.js";
import { JalaliPicker, SearchableSelect } from "../components/controls.jsx";
import { useCustomers } from "./customers.jsx";
import { currentActor } from "../core/identity.js";
import { useInventory } from "./inventory.jsx";
import { useInvoices, useShopInfo } from "../domain/invoiceData.js";
import { todayIso } from "../core/jalali.js";
import { code128Svg, digitsOnly, invBarcodeValue, invoiceDashData, invoiceExportSections, invoicePayInfo, nextInvNum } from "./printScan.jsx";
import { fmtQty } from "../domain/recipes.jsx";
import { ExportBar, sectionsToExcel } from "../components/reportExport.jsx";
import { SaleWizard } from "./saleWizard.jsx";
import { peekSearchFocus, clearSearchFocus } from "../domain/search.js";
import { PAY_METHODS, cancelSale, emitDataChange, getPaymentAccounts, getSale, getSales, invoiceItemsToWizard, lsRead, lsWrite, payLabel, receiveSalePayment, saleLinesToWizard, saleRemaining, takePendingInvoiceOpen, uid, useDataSync } from "../domain/sales.jsx";
import { deriveIncomeCategoryOptions, deriveTariffPriceMap, useTariffData } from "./tariff.jsx";
import { Empty, KPI } from "../components/ui.jsx";
import { VoidModal, VoidedPanel, getVoided, voidInvoice } from "../domain/voids.jsx";


// ══════════════════════════════════════════════════════════════════
// چاپ فاکتور: مبلغ به حروف، مهر و امضا، شماره کارت، تنظیمات چاپ
// ══════════════════════════════════════════════════════════════════
const _ones=["","یک","دو","سه","چهار","پنج","شش","هفت","هشت","نه","ده","یازده","دوازده","سیزده","چهارده","پانزده","شانزده","هفده","هجده","نوزده"];

const _tens=["","","بیست","سی","چهل","پنجاه","شصت","هفتاد","هشتاد","نود"];

const _hund=["","صد","دویست","سیصد","چهارصد","پانصد","ششصد","هفتصد","هشتصد","نهصد"];

const _scales=["","هزار","میلیون","میلیارد","تریلیون"];

function _below1000(n){const h=Math.floor(n/100),r=n%100,p=[];if(h)p.push(_hund[h]);if(r){if(r<20)p.push(_ones[r]);else{const t=Math.floor(r/10),o=r%10;p.push(_tens[t]+(o?" و "+_ones[o]:""));}}return p.join(" و ");}

function numToWords(n){n=Math.floor(Math.abs(Number(n)||0));if(n===0)return"صفر";const parts=[];let i=0;while(n>0&&i<_scales.length){const c=n%1000;if(c)parts.unshift(_below1000(c)+(_scales[i]?" "+_scales[i]:""));n=Math.floor(n/1000);i++;}return parts.join(" و ");}

function fmtCardNumber(v){const d=latinDigits(v).replace(/\D/g,"");return d.replace(/(\d{4})(?=\d)/g,"$1 ").trim();}

function fmtSheba(v){const d=latinDigits(v).toUpperCase().replace(/[^A-Z0-9]/g,"");return d.replace(/(.{4})/g,"$1 ").trim();}

function readImageDataUrl(file,maxDim=420){
  return new Promise((res,rej)=>{
    if(!file||!file.type.startsWith("image/")){rej("فقط فایل تصویری (PNG یا JPG) مجاز است");return;}
    if(file.size>3*1024*1024){rej("حجم تصویر باید کمتر از ۳ مگابایت باشد");return;}
    const r=new FileReader();r.onerror=()=>rej("خطا در خواندن فایل");
    r.onload=()=>{const img=new Image();img.onerror=()=>rej("تصویر قابل خواندن نیست");
      img.onload=()=>{const k=Math.min(1,maxDim/Math.max(img.width,img.height,1));const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));c.getContext("2d").drawImage(img,0,0,c.width,c.height);res(c.toDataURL("image/png"));};
      img.src=r.result;};
    r.readAsDataURL(file);
  });
}

export function invState(iv){
  if(iv.status==="draft")return"draft";
  const i=invoicePayInfo(iv);
  if(i.total>0&&i.remaining<=0)return"paid";
  if(i.paid>0)return"partial";
  return"unpaid";
}

function invoiceShareText(iv,shop){
  const o=shop.inv||{};
  const i=invoicePayInfo(iv);
  const m=n=>toFA(Number(displayMoney(n||0).toFixed(0)).toLocaleString("fa-IR"));
  const L=[];
  L.push(`🧾 فاکتور شماره ${toFA(iv.number)} — ${shop.name||"کافی‌نت"}`);
  L.push(`📅 ${jalaliLabel(iv.date)}${iv.time?` — ساعت ${toFA(iv.time)}`:""}`);
  if(iv.customerName)L.push(`👤 ${iv.customerName}`);
  L.push("");
  (iv.items||[]).forEach(it=>L.push(`• ${it.desc} × ${toFA(it.qty)}${it.unit&&it.unit!=="عدد"?" "+it.unit:""} = ${m((Number(it.qty)||0)*(Number(it.price)||0))}`));
  if(Number(iv.discount)>0)L.push(`🏷️ تخفیف: ${m(iv.discount)} ${currencyLabel()}`);
  L.push("");
  L.push(`💰 مبلغ نهایی: ${m(iv.totalAmount)} ${currencyLabel()}`);
  if(iv.status!=="draft"){
    L.push(`✅ پرداخت‌شده: ${m(i.paid)} ${currencyLabel()}`);
    if(i.remaining>0)L.push(`⏳ مانده: ${m(i.remaining)} ${currencyLabel()}`);
    L.push(`وضعیت: ${INV_STATE[invState(iv)].label}`);
  }
  if(i.remaining>0&&(o.showCardNumber||o.showAccounts)){
    if(o.showCardNumber&&shop.cardNumber)L.push("",`💳 شماره کارت: ${toFA(fmtCardNumber(shop.cardNumber))}${shop.cardHolder?` — ${shop.cardHolder}`:""}${shop.bankName?` (${shop.bankName})`:""}`);
    if(o.showAccounts&&shop.iban)L.push(`🏦 شماره شبا: ${fmtSheba(shop.iban)}`);
    if(o.showAccounts)getPaymentAccounts().filter(a=>a.cardNumber||a.iban).forEach(a=>{L.push(`🏦 ${a.label}`);if(a.cardNumber)L.push(`💳 شماره کارت: ${toFA(fmtCardNumber(a.cardNumber))}`);if(a.iban)L.push(`شماره شبا: ${fmtSheba(a.iban)}`);});
  }
  if(o.showMobile&&shop.mobile)L.push(`📱 ${toFA(shop.mobile)}`);
  if(shop.footer)L.push("",shop.footer);
  return L.join("\n");
}

export function phoneIntl(p){const d=latinDigits(p).replace(/\D/g,"");if(!d)return"";if(d.startsWith("98"))return d;if(d.startsWith("0"))return"98"+d.slice(1);return"98"+d;}

// Renders the printed invoice into a PDF (A4 / A5 pages split automatically, 80mm = one long page)
async function invoicePdfBlob(node,size){
  const {html2canvas,jsPDF}=await loadVendor("pdf");
  try{await Promise.all([400,700,800,900].map(w=>document.fonts.load(`${w} 14px Vazirmatn`)));await document.fonts.ready;}catch{}   // فونت پیش از عکس‌برداری آماده باشد
  const canvas=await html2canvas(node,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
  const th=size==="80";
  const pageW=th?80:size==="A5"?148:210,pageH=th?0:size==="A5"?210:297,mg=th?3:8;
  const imgW=pageW-mg*2,pxPerMm=canvas.width/imgW;
  const totalMm=canvas.height/pxPerMm;
  const doc=th?new jsPDF({unit:"mm",format:[pageW,totalMm+mg*2]}):new jsPDF({unit:"mm",format:[pageW,pageH]});
  if(th){doc.addImage(canvas.toDataURL("image/jpeg",0.95),"JPEG",mg,mg,imgW,totalMm);}
  else{
    const usable=pageH-mg*2,sliceH=Math.floor(usable*pxPerMm);
    let y=0,first=true;
    while(y<canvas.height){
      const h=Math.min(sliceH,canvas.height-y);
      const c=document.createElement("canvas");c.width=canvas.width;c.height=h;
      const cx=c.getContext("2d");cx.fillStyle="#fff";cx.fillRect(0,0,c.width,h);cx.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
      if(!first)doc.addPage([pageW,pageH]);
      doc.addImage(c.toDataURL("image/jpeg",0.95),"JPEG",mg,mg,imgW,h/pxPerMm);
      first=false;y+=h;
    }
  }
  return doc.output("blob");
}

function saveBlob(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),4000);
}

function InvoiceShareModal({iv,shop,onClose,getPdf}){
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const text=invoiceShareText(iv,shop);
  const fname=`فاکتور-${iv.number}.pdf`;
  const ph=phoneIntl(iv.customerPhone);
  const doPdf=async(share)=>{
    setBusy(true);setMsg("");
    try{
      const blob=await getPdf();
      const file=new File([blob],fname,{type:"application/pdf"});
      if(share&&navigator.canShare&&navigator.canShare({files:[file]})){
        try{await navigator.share({files:[file],title:`فاکتور ${iv.number}`,text:`فاکتور شماره ${iv.number} — ${shop.name||""}`});setMsg("✓ ارسال شد");}
        catch(e){if(e&&e.name==="AbortError")setMsg("");else{saveBlob(blob,fname);setMsg("اشتراک‌گذاری ممکن نشد؛ فایل PDF دانلود شد");}}
      }else{saveBlob(blob,fname);setMsg(share?"این دستگاه اشتراک‌گذاری فایل را پشتیبانی نمی‌کند؛ PDF دانلود شد":"✓ فایل PDF دانلود شد");}
    }catch(e){setMsg("ساخت PDF انجام نشد؛ از «چاپ / ذخیره PDF» استفاده کنید");}
    setBusy(false);
  };
  const copy=async()=>{try{await navigator.clipboard.writeText(text);setMsg("✓ متن فاکتور کپی شد");}catch{setMsg("کپی انجام نشد");}};
  const nativeText=async()=>{if(navigator.share){try{await navigator.share({title:`فاکتور ${iv.number}`,text});}catch{}}else copy();};
  const btn=(bg,fg="#fff")=>({...BTN(bg,fg),display:"flex",alignItems:"center",gap:8,justifyContent:"flex-start",width:"100%",padding:"11px 14px",fontSize:13,textAlign:"right"});
  return(
    <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:420,padding:14}}>
      <div data-testid="inv-share" style={{background:"var(--bg-card)",borderRadius:16,padding:20,width:"100%",maxWidth:400,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,color:"var(--accent-light)"}}>📤 اشتراک‌گذاری فاکتور {toFA(iv.number)}</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <button data-testid="share-pdf" disabled={busy} onClick={()=>doPdf(true)} style={btn("#2563eb")}>📄 ارسال فایل PDF (واتساپ، تلگرام، ایمیل...)</button>
          <button data-testid="share-dl" disabled={busy} onClick={()=>doPdf(false)} style={btn("var(--border)","var(--text-primary)")}>⬇️ دانلود فایل PDF</button>
          <a data-testid="share-wa" href={`https://wa.me/${ph}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" style={{...btn("#16a34a"),textDecoration:"none"}}>💬 ارسال متن در واتساپ{ph?"":" (انتخاب مخاطب)"}</a>
          <a data-testid="share-sms" href={`sms:${iv.customerPhone?latinDigits(iv.customerPhone).replace(/\D/g,""):""}?body=${encodeURIComponent(text)}`} style={{...btn("var(--border)","var(--text-primary)"),textDecoration:"none"}}>✉️ ارسال پیامک</a>
          <button data-testid="share-copy" onClick={copy} style={btn("var(--border)","var(--text-primary)")}>📋 کپی متن فاکتور</button>
          {navigator.share&&<button onClick={nativeText} style={btn("var(--border)","var(--text-primary)")}>↗️ سایر برنامه‌ها (متن)</button>}
        </div>
        {busy&&<div style={{marginTop:10,fontSize:12,color:"#fbbf24"}}>در حال ساخت PDF...</div>}
        {msg&&<div data-testid="share-msg" style={{marginTop:10,fontSize:12,color:msg.startsWith("✓")?"#4ade80":"#fbbf24",lineHeight:1.8}}>{msg}</div>}
        <pre dir="rtl" style={{marginTop:12,background:"var(--bg-app)",borderRadius:10,padding:10,fontSize:11,color:"var(--text-secondary)",whiteSpace:"pre-wrap",fontFamily:"inherit",maxHeight:170,overflowY:"auto"}}>{text}</pre>
      </div>
    </div>
  );
}

// Where this invoice is connected: customer account · income · stock · profit
function InvoiceLinks({iv}){
  const sl=iv.saleId?getSale(iv.saleId):null;
  if(!sl){
    return(
      <div data-testid="inv-links" className="no-print" style={{background:"#1c1917",border:"1px solid #f59e0b55",borderRadius:12,padding:"12px 14px",marginBottom:12,fontSize:12,color:"#fbbf24",lineHeight:1.9}}>
        {iv.status==="draft"?"📝 این فاکتور پیش‌نویس است: هنوز درآمد، حساب مشتری و انبار را تغییر نداده. با «صدور فاکتور» همه‌چیز یک‌جا ثبت می‌شود."
          :"⚠️ این فاکتور دستی (قدیمی) است و به درآمد، انبار و حساب مشتری متصل نیست. برای فروش‌های جدید از «فاکتور جدید» استفاده کنید."}
      </div>);
  }
  const rem=saleRemaining(sl);
  const txs=lsRead(TX_KEY,[]).filter(t=>String(t.saleId)===String(sl.id));
  const income=txs.filter(t=>t.type==="income").reduce((a,t)=>a+(Number(t.amount)||0),0);
  const cost=txs.filter(t=>t.type==="expense").reduce((a,t)=>a+(Number(t.amount)||0),0);
  const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
  const used=(sl.stockUsed||[]).map(u=>{const it=stock.find(x=>String(x.id)===String(u.itemId));return it?`${it.name} ×${fmtQty(u.qty)}`:null;}).filter(Boolean);
  const order=lsRead(ORDERS_STORAGE_KEY,[]).find(o=>String(o.saleId)===String(sl.id));
  const ost=order?(ORDER_STATUSES.find(x=>x.key===order.status)||{}).label:null;
  const cust=lsRead(CUSTOMERS_STORAGE_KEY,[]).find(c=>String(c.id)===String(sl.customerId));
  const box=(icon,title,val,sub,color)=>(
    <div style={{background:"var(--bg-app)",borderRadius:10,padding:"9px 11px",minWidth:0}}>
      <div style={{fontSize:11,color:"var(--text-muted)"}}>{icon} {title}</div>
      <div style={{fontSize:13,fontWeight:700,color:color||"var(--text-primary)",marginTop:2}}>{val}</div>
      {sub&&<div style={{fontSize:10,color:"var(--text-dim)",marginTop:2,lineHeight:1.6}}>{sub}</div>}
    </div>);
  return(
    <div data-testid="inv-links" className="no-print" style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px",marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>🔗 این فاکتور به این بخش‌ها وصل است</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
        {box("👤","حساب مشتری",sl.customerName,cust?`${toFA((cust.serviceHistory||[]).length)} خدمت ثبت‌شده · کیف پول ${fmtCompact(cust.wallet||0)}`:"",)}
        {box("📒","بدهی / مانده",fmtM(rem),rem>0?"در حساب دفتری مشتری ثبت است":"تسویه کامل",rem>0?"#fbbf24":"#4ade80")}
        {box("💵","درآمد ثبت‌شده",fmtM(income),`${toFA(txs.filter(t=>t.type==="income").length)} تراکنش درآمد`,"#4ade80")}
        {box("📦","انبار",used.length?used.join("، "):"بدون کسر",used.length?"موجودی کسر شده":"")}
        {box("📈","سود ناخالص",fmtM(sl.total-cost),`هزینه مستقیم ${fmtM(cost)}`,sl.total-cost>=0?"#22d3ee":"#f87171")}
        {box("📋","سفارش",ost||"—",order?"در برد سفارش‌ها":"بدون سفارش")}
      </div>
      <div style={{fontSize:10,color:"var(--text-dim)",marginTop:8,lineHeight:1.8}}>ویرایش یا ابطال این فاکتور، همه این بخش‌ها را هم‌زمان اصلاح می‌کند؛ هیچ فروشی دوبار ثبت نمی‌شود.</div>
    </div>);
}

function InvoicePayModal({iv,onClose}){
  const sl=iv.saleId?getSale(iv.saleId):null;
  const rem=sl?saleRemaining(sl):0;
  const [amount,setAmount]=useState(String(rem));
  const [method,setMethod]=useState("cash");
  const [date,setDate]=useState(todayIso());
  const [err,setErr]=useState("");
  const [freeReason,setFreeReason]=useState("");
  const methods=PAY_METHODS.filter(m=>["cash","pos","transfer","wallet","other","free"].includes(m.key));
  const go=()=>{
    if(method==="free"&&freeReason.trim().length<3){setErr("برای بخشودگی، دلیل الزامی است (حداقل ۳ حرف)");return;}
    const r=receiveSalePayment(sl.id,Number(latinDigits(amount))||0,method,date,method==="free"?freeReason.trim():undefined);
    if(!r.ok){setErr(r.error||"ثبت نشد");return;}
    onClose();
  };
  if(!sl)return null;
  return(
    <div style={{position:"relative",background:"transparent",display:"block",padding:"0 0 14px"}}>
      <div data-testid="inv-pay-modal" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:560,boxSizing:"border-box"}}>
        <div style={{fontWeight:700,color:"var(--accent-light)",marginBottom:4}}>💰 دریافت وجه — فاکتور {toFA(iv.number)}</div>
        <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:12}}>مشتری: {sl.customerName} · مانده: <b style={{color:"#fbbf24"}}>{fmtM(rem)}</b></div>
        <label style={{fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:10}}>مبلغ (ریال)
          <input data-testid="inv-pay-amount" inputMode="numeric" value={amount} onChange={e=>{setAmount(e.target.value);setErr("");}} style={{...INP,fontSize:13,marginTop:3}}/>
        </label>
        <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:4}}>روش پرداخت</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
          {methods.map(m=><button key={m.key} data-testid={`inv-pay-m-${m.key}`} onClick={()=>setMethod(m.key)} style={{...BTN(method===m.key?"#2563eb":"var(--border)",method===m.key?"#fff":"var(--text-primary)"),padding:"6px 10px",fontSize:12}}>{m.icon} {m.label}</button>)}
        </div>
        {method==="free"&&<div style={{marginBottom:10}}>
          <ReasonChips presets={["مشتری ثابت","اشتباه در محاسبه","خسارت/نارضایتی","مبلغ ناچیز"]} onPick={v=>{setFreeReason(v);setErr("");}}/>
          <input data-testid="pay-free-reason" value={freeReason} onChange={e=>{setFreeReason(e.target.value);setErr("");}} placeholder="دلیل بخشودگی (الزامی)" maxLength={300} style={{...INP,fontSize:13}}/>
        </div>}
        <label style={{fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:10}}>تاریخ دریافت
          <JalaliPicker value={date} onChange={setDate}/>
        </label>
        {err&&<div style={{fontSize:12,color:"#f87171",marginBottom:8}}>{err}</div>}
        <div style={{display:"flex",gap:8}}>
          <button data-testid="inv-pay-confirm" onClick={go} style={{...BTN("#16a34a"),flex:2,padding:11,fontSize:13}}>ثبت دریافت</button>
          <button onClick={onClose} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11,fontSize:13}}>انصراف</button>
        </div>
      </div>
    </div>);
}

const PRINT_SIZES=[["A4","A4"],["A5","A5"],["80","رسید ۸۰ میلی‌متری"]];

function InvoicePrintSettings({shop,setShop}){
  const [err,setErr]=useState("");
  const o=shop.inv;
  const setInv=(patch)=>setShop(s=>({...s,inv:{...s.inv,...patch}}));
  const up=async(e,field)=>{const f=e.target.files&&e.target.files[0];e.target.value="";if(!f)return;setErr("");try{const d=await readImageDataUrl(f);setShop(s=>({...s,[field]:d}));}catch(m){setErr(String(m));}};
  const img=(field,label,tid)=>(
    <div style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-app)",borderRadius:10,padding:10,flex:"1 1 230px"}}>
      <div style={{width:70,height:70,borderRadius:8,background:"#fff",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
        {shop[field]?<img data-testid={tid+"-img"} src={shop[field]} alt={label} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>:<span style={{fontSize:11,color:"#94a3b8"}}>بدون {label}</span>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        <div style={{fontSize:12,fontWeight:700}}>{label}</div>
        <label style={{...BTN("#2563eb"),padding:"6px 12px",fontSize:11,cursor:"pointer",display:"inline-block",width:"fit-content"}}>📁 انتخاب تصویر<input data-testid={tid+"-file"} type="file" accept="image/*" onChange={e=>up(e,field)} style={{display:"none"}}/></label>
        {shop[field]&&<button data-testid={tid+"-del"} onClick={()=>setShop(s=>({...s,[field]:null}))} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"5px 12px",fontSize:11,width:"fit-content"}}>حذف</button>}
      </div>
    </div>);
  const toggles=[["showStamp","مهر"],["showSignature","امضا"],["showCardNumber","شماره کارت"],["showAccounts","حساب‌های بانکی و شبا"],["showMobile","موبایل"],["showPhone","تلفن"],["showWords","مبلغ به حروف"],["showBarcode","بارکد"]];
  return(
    <div data-testid="inv-print-settings" className="no-print" style={{background:"var(--bg-card)",borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>🧾 تنظیمات فاکتور</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>{img("stamp","مهر فروشنده","inv-stamp")}{img("signature","امضای فروشنده","inv-sign")}</div>
      {err&&<div style={{color:"#f87171",fontSize:12,marginBottom:8}}>⚠️ {err}</div>}
      <label style={{display:"block",fontSize:12,color:"var(--text-secondary)",marginBottom:12}}>متن پایین فاکتور
        <input data-testid="inv-footer-input" value={shop.footer||""} onChange={e=>{const v=e.target.value;setShop(s=>({...s,footer:v}));}} placeholder="مثلاً: از خرید شما سپاسگزاریم" style={{...INP,fontSize:13}}/>
      </label>
      <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:6}}>قطع چاپ</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{PRINT_SIZES.map(([k,l])=><button key={k} data-testid={"inv-size-"+k} onClick={()=>setInv({size:k})} style={{...BTN((o.size||"A4")===k?"#2563eb":"var(--bg-app)",(o.size||"A4")===k?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12}}>{l}</button>)}</div>
      <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:6}}>نمایش روی فاکتور</div>
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        {toggles.map(([k,l])=><label key={k} style={{fontSize:12,display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}><input data-testid={"inv-opt-"+k} type="checkbox" checked={!!o[k]} onChange={e=>setInv({[k]:e.target.checked})}/>{l}</label>)}
      </div>
      <div style={{fontSize:10,color:"var(--text-dim)",marginTop:8,lineHeight:1.9}}>شماره کارت و موبایل را از «تنظیمات ← فروشگاه» وارد کنید. مهر و امضا برای همه فاکتورها یکسان است و با عکس شفاف (PNG) بهترین نتیجه را می‌دهد.</div>
    </div>);
}

export function InvoiceSection({pendingAction,clearPendingAction,onNavigate}){
  const [invoices,setInvoices]=useInvoices();
  const [shop,setShop]=useShopInfo();
  const [customers]=useCustomers();
  const [inventory]=useInventory();
  const [tariffData]=useTariffData();
  const TARIFF_PRICE_MAP=deriveTariffPriceMap(tariffData);
  const INCOME_CATEGORY_OPTIONS=deriveIncomeCategoryOptions(tariffData);
  const [view,setView]=useState("list"); // list | form | preview | shopSettings
  const [showPrintSet,setShowPrintSet]=useState(false);
  const [wizard,setWizard]=useState(null); // {sale?,draft?,prefill?}
  const [shareIv,setShareIv]=useState(null);
  const [payIv,setPayIv]=useState(null);
  const [stFilter,setStFilter]=useState("all");
  const [editId,setEditId]=useState(null);
  const [printId,setPrintId]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const [search,setSearch]=useState(()=>{const f=peekSearchFocus("invoice",["sale"]);return f&&f.q?String(f.q):"";}); // از نتیجهٔ جستجوی «کافیند»
  useEffect(()=>{clearSearchFocus();},[]);
  const [dashPeriod,setDashPeriod]=useState("today");
  const [scan,setScan]=useState("");
  const [scanMsg,setScanMsg]=useState("");
  const [formError,setFormError]=useState("");
  const [,setInvTick]=useState(0);
  useDataSync(()=>setInvTick(t=>t+1));

  // Invoice form state
  const emptyForm=()=>({
    number:nextInvNum(invoices),
    date:todayIso(),
    customerId:"",
    customerName:"",customerPhone:"",customerAddress:"",
    items:[{id:1,desc:"",qty:1,unit:"عدد",price:0,stockId:"",stockQty:""}],
    tax:0, // percent
    discount:0, // ریال
    note:"",
    status:"draft", // draft | paid | unpaid
  });
  const [form,setForm]=useState(emptyForm);

  // ── Computed ──
  const subtotal=(f)=>f.items.reduce((s,it)=>s+Number(it.qty||0)*Number(it.price||0),0);
  const taxAmt=(f)=>Math.round(subtotal(f)*Number(f.tax||0)/100);
  const total=(f)=>subtotal(f)+taxAmt(f)-Number(f.discount||0);

  // ── Customer auto-fill ──
  const fillCustomer=(custId)=>{
    const c=customers.find(c=>String(c.id)===String(custId));
    if(c) setForm(f=>({...f,customerId:custId,customerName:`${c.firstName} ${c.lastName}`.trim(),customerPhone:c.phone||"",customerAddress:""}));
    else setForm(f=>({...f,customerId:"",customerName:"",customerPhone:"",customerAddress:""}));
  };

  // ── Item ops ──
  const addItem=()=>setForm(f=>({...f,items:[...f.items,{id:uid(),desc:"",qty:1,unit:"عدد",price:0,stockId:"",stockQty:""}]}));
  const removeItem=(id)=>setForm(f=>({...f,items:f.items.filter(it=>it.id!==id)}));
  const updateItem=(id,field,val)=>setForm(f=>({...f,items:f.items.map(it=>it.id===id?{...it,[field]:val}:it)}));

  // ── Tariff quick-fill for items ──
  const fillFromTariff=(itemId,tariffKey)=>{
    if(!tariffKey)return;
    const price=TARIFF_PRICE_MAP[tariffKey]||0;
    const name=tariffKey.includes(" > ")?tariffKey.split(" > ")[1]:tariffKey;
    updateItem(itemId,"desc",name);
    updateItem(itemId,"price",price);
  };

  // ── Save / Edit ──
  const saveInvoice=()=>{
    setFormError("");
    if(!form.customerName.trim()&&!form.customerId)return;
    const invoiceNumber=String(form.number||"").trim();
    if(!invoiceNumber){setFormError("شماره فاکتور را وارد کنید");return;}
    const duplicate=invoices.find(iv=>String(iv.id)!==String(editId||"")&&String(iv.number).trim()===invoiceNumber)||getVoided().some(v=>String(v.number||"").trim()===invoiceNumber);
    if(duplicate){setFormError(`شماره فاکتور ${invoiceNumber} قبلاً استفاده شده است`);return;}
    const existing=editId?invoices.find(iv=>String(iv.id)===String(editId)):null;
    if(existing?.saleId){setFormError("این فاکتور به فروش متصل است؛ اصلاح آن را از مسیر اصلاح فاکتور انجام دهید");return;}
    const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
    (existing?.stockUsed||[]).forEach(u=>{const it=stock.find(x=>String(x.id)===String(u.itemId));if(it)it.qty=Math.round(((Number(it.qty)||0)+(Number(u.qty)||0))*10000)/10000;});
    const stockUsed=[];
    for(const row of form.status==="draft"?[]:form.items){
      if(!row.stockId)continue;
      const qty=Number(row.stockQty);
      const item=stock.find(x=>String(x.id)===String(row.stockId));
      if(!item){setFormError(`کالای انتخاب‌شده برای «${row.desc||"ردیف فاکتور"}» در انبار پیدا نشد`);return;}
      if(!(qty>0)){setFormError(`مقدار برداشت «${item.name}» باید بیشتر از صفر باشد`);return;}
      if((Number(item.qty)||0)<qty){setFormError(`موجودی «${item.name}» کافی نیست؛ موجودی فعلی ${fmtQty(item.qty)} ${item.unit||""} است`);return;}
      item.qty=Math.round(((Number(item.qty)||0)-qty)*10000)/10000;
      stockUsed.push({itemId:item.id,qty,saleId:null,invoiceId:existing?.id||null});
    }
    const now=new Date(),pad=n=>String(n).padStart(2,"0");
    const invoiceId=editId||uid();
    stockUsed.forEach(u=>{u.invoiceId=invoiceId;});
    const inv={...form,number:invoiceNumber,id:invoiceId,time:form.time||`${pad(now.getHours())}:${pad(now.getMinutes())}`,createdAt:existing?.createdAt||todayIso(),createdBy:existing?.createdBy||currentActor(),stockUsed,...(existing?{editedAt:Date.now(),lastEditedBy:currentActor()}:{}),subtotal:subtotal(form),taxAmount:taxAmt(form),totalAmount:total(form)};
    if(editId&&form.saleId&&form.status==="paid"){
      // marking a sale-linked invoice as paid collects the remaining balance (income + ledger) in one step
      const prevInv=invoices.find(iv=>iv.id===editId);
      const sl=getSale(form.saleId);
      if(prevInv&&prevInv.status!=="paid"&&sl&&saleRemaining(sl)>0){receiveSalePayment(sl.id,saleRemaining(sl),"cash");inv.paidAmount=inv.totalAmount;}
    }
    if(editId){
      setInvoices(prev=>prev.map(iv=>iv.id===editId?inv:iv));
      logActivity("ویرایش فاکتور",`${form.customerName||"—"} — ${fmtM(inv.totalAmount)}`);
    } else {
      setInvoices(prev=>[inv,...prev]);
      logActivity("ثبت فاکتور",`${form.customerName||"—"} — ${fmtM(inv.totalAmount)}`);
    }
    if(stockUsed.length||(existing?.stockUsed||[]).length){lsWrite(INV_STORAGE_KEY,stock);emitDataChange();}
    setView("list");setEditId(null);
  };

  const openNew=()=>{setWizard(null);setEditId(null);setForm(emptyForm());setView("form");};
  useEffect(()=>{const id=takePendingInvoiceOpen();if(id!=null){setPrintId(id);setView("preview");}},[]);  
  const wizNav=(tab)=>{if(tab==="invoice"){const id=takePendingInvoiceOpen();if(id!=null){setPrintId(id);setView("preview");}}else if(onNavigate)onNavigate(tab);};
  const reissue=(iv)=>{
    const sl=iv.saleId?getSale(iv.saleId):null;
    const paymentRows=sl?(sl.payments||[]):(iv.payments||[]);
    setWizard({prefill:{customerId:iv.customerId||(sl?sl.customerId:""),lines:sl?saleLinesToWizard(sl.lines):invoiceItemsToWizard(iv.items),discount:Number(iv.discount)||0,notes:iv.note?String(iv.note).replace(/\s*—?\s*مبلغ [^—]*رایگان\/بخشیده شد\./,""):""}});
  };
  useEffect(()=>{
    if(pendingAction==="new_invoice"){openNew();clearPendingAction&&clearPendingAction();}
  },[pendingAction]);  
  const openEdit=(iv)=>{
    const sl=iv.saleId?getSale(iv.saleId):null;
    if(iv.status==="draft"&&iv.wizardLines){setWizard({draft:iv});return;}
    if(sl){setWizard({sale:sl});return;}
    setForm({...iv});setEditId(iv.id);setView("form"); // فاکتور دستیِ قدیمی (بدون اتصال به حساب‌ها)
  };
  const openPreview=(iv)=>{setPrintId(iv.id);setView("preview");};
  const deleteInvoice=async(id,reason)=>{
    if(!(await ensureOnlineForSensitive("ابطال/حذف فاکتور"))){setDelConfirm(null);return;}
    const iv=invoices.find(iv=>iv.id===id);
    if(iv&&iv.saleId&&getSales().some(x=>String(x.id)===String(iv.saleId))){cancelSale(iv.saleId,reason);}
    else if(iv)voidInvoice(iv,reason);
    setInvoices(prev=>prev.filter(x=>x.id!==id));
    setDelConfirm(null);
  };

  const doScan=()=>{
    const code=digitsOnly(scan);setScan("");
    if(!code){return;}
    const iv=invoices.find(x=>digitsOnly(x.number)===code||(digitsOnly(x.number).replace(/^0+/,"")===code.replace(/^0+/,"")&&code.replace(/^0+/,"")!==""));
    if(iv){setScanMsg("");openPreview(iv);}else setScanMsg(`فاکتوری با شماره ${toFA(code)} پیدا نشد`);
  };
  const filteredInvoices=invoices.filter(iv=>{
    if(stFilter!=="all"&&invState(iv)!==stFilter)return false;
    if(!search)return true;
    const q=digitsOnly(search)||search;
    return(iv.customerName+iv.number+(iv.totalAmount||0)+(iv.customerPhone||"")).includes(search)||(digitsOnly(search)&&(digitsOnly(iv.number).includes(q)||String(iv.totalAmount||0).includes(q)));
  });
  const stCount=(k)=>k==="all"?invoices.length:invoices.filter(iv=>invState(iv)===k).length;


  const overlays=(<>
    {wizard&&<SaleWizard editSale={wizard.sale||null} draft={wizard.draft||null} prefill={wizard.prefill||null} onClose={()=>setWizard(null)} onNavigate={wizNav}/>}
    {shareIv&&<InvoiceShareModal iv={shareIv} shop={shop} onClose={()=>setShareIv(null)} getPdf={()=>{const n=document.querySelector(".invoice-print");if(!n)return Promise.reject(new Error("no node"));return invoicePdfBlob(n,(shop.inv&&shop.inv.size)||"A4");}}/>}
    {payIv&&<InvoicePayModal iv={payIv} onClose={()=>setPayIv(null)}/>}
    {delConfirm&&(()=>{const iv=invoices.find(x=>x.id===delConfirm);const linked=iv&&iv.saleId;return <VoidModal title={`ابطال فاکتور ${iv?iv.number:""}`} desc={linked?"این فاکتور از جریان فروش ساخته شده؛ ابطال آن کل فروش را باطل می‌کند: درآمد، بدهی دفتری و تاریخچه‌ی مشتری برمی‌گردد و موجودی انبار بازگردانده می‌شود. سابقه در بایگانی می‌ماند.":"فاکتور از لیست و گزارش‌ها خارج می‌شود ولی با دلیل ابطال در بایگانی «ابطال‌شده‌ها» می‌ماند و شماره‌اش دوباره استفاده نمی‌شود."} onConfirm={(r)=>{deleteInvoice(delConfirm,r);if(view==="preview")setView("list");}} onClose={()=>setDelConfirm(null)}/>;})()}
  </>);

  // ── PRINT/PREVIEW ──
  if(view==="preview"){
    const iv=invoices.find(i=>i.id===printId);
    if(!iv) return <button onClick={()=>setView("list")} style={BTN("var(--border)")}>← بازگشت</button>;
    const o=shop.inv;const size=o.size||"A4";const th=size==="80";
    const W=th?302:size==="A5"?560:760;
    const pageCss=`@page{size:${th?"80mm auto":size==="A5"?"A5":"A4"};margin:${th?"3mm":"10mm"}}`;
    const money=(n)=>toFA(Number(displayMoney(n||0).toFixed(0)).toLocaleString("fa-IR"));
    const sl=iv.saleId?getSale(iv.saleId):null;
    const paymentRows=sl?(sl.payments||[]):(iv.payments||[]);
    const paid=Number(iv.paidAmount)||0,waived=Number(iv.waivedAmount)||0;
    const rem=Math.max(0,(iv.totalAmount||0)-paid-waived);
    const hasPay=iv.saleId||iv.paidAmount!=null;
    const invoicePaymentAccounts=getPaymentAccounts().filter(a=>a.cardNumber||a.iban);
    const showPhone=o.showPhone&&shop.phone,showMobile=o.showMobile&&shop.mobile,showCard=(o.showCardNumber&&shop.cardNumber)||(o.showAccounts&&(shop.iban||invoicePaymentAccounts.length>0));
    const fs=th?11:size==="A5"?12:13;
    const label={fontSize:fs-2,color:"#64748b"};
    const cardBox=showCard&&(
      <div data-testid="inv-card-box" className="avoid-break" style={{border:"1px solid #bfdbfe",background:"#eff6ff",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:fs}}>
        {o.showCardNumber&&shop.cardNumber&&<><div style={{...label,marginBottom:2}}>💳 شماره کارت جهت واریز{shop.bankName?` — ${shop.bankName}`:""}</div>
        <div data-testid="inv-card-number" style={{direction:"ltr",textAlign:"right",fontWeight:800,letterSpacing:1,fontSize:fs+3,color:"#1e3a8a"}}>{toFA(fmtCardNumber(shop.cardNumber))}</div>
        {shop.cardHolder&&<div style={{...label,marginTop:2}}>به نام: <b style={{color:"#1e293b"}}>{shop.cardHolder}</b></div>}</>}
        {o.showAccounts&&shop.iban&&<div data-testid="inv-shop-iban" style={{...label,marginTop:3,direction:"ltr",textAlign:"right"}}>شماره شبا: <b style={{color:"#1e3a8a",letterSpacing:.5}}>{fmtSheba(shop.iban)}</b></div>}
        {o.showAccounts&&invoicePaymentAccounts.map(a=><div key={a.key} data-testid={`inv-account-${a.key}`} style={{borderTop:"1px dashed #bfdbfe",marginTop:6,paddingTop:5}}>
          <div style={{...label,fontWeight:700,color:"#334155"}}>{a.label}</div>
          {a.cardNumber&&<div style={{direction:"ltr",textAlign:"right",fontWeight:700,color:"#1e3a8a",marginTop:2}}>💳 {toFA(fmtCardNumber(a.cardNumber))}</div>}
          {a.iban&&<div style={{...label,direction:"ltr",textAlign:"right",marginTop:2}}>🏦 شبا: <b style={{color:"#1e3a8a"}}>{fmtSheba(a.iban)}</b></div>}
        </div>)}
      </div>);
    const sealBox=(
      <div className="avoid-break" style={{display:"grid",gridTemplateColumns:th?"1fr":"1fr 1fr",gap:10,marginTop:10}}>
        <div data-testid="inv-seal-box" style={{position:"relative",height:th?90:112,border:"1px dashed #cbd5e1",borderRadius:8,overflow:"hidden"}}>
          <div style={{...label,position:"absolute",top:5,right:9,zIndex:3}}>مهر و امضای فروشنده</div>
          <div style={{position:"absolute",inset:"18px 8px 6px",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {o.showStamp&&shop.stamp&&<img data-testid="inv-stamp-print" src={shop.stamp} alt="مهر" style={{maxHeight:"100%",maxWidth:"55%",objectFit:"contain",mixBlendMode:"multiply",opacity:0.92}}/>}
            {o.showSignature&&shop.signature&&<img data-testid="inv-sign-print" src={shop.signature} alt="امضا" style={{maxHeight:"85%",maxWidth:"55%",objectFit:"contain",mixBlendMode:"multiply",marginRight:o.showStamp&&shop.stamp?-26:0,position:"relative",zIndex:2}}/>}
          </div>
        </div>
        {!th&&<div style={{position:"relative",height:112,border:"1px dashed #cbd5e1",borderRadius:8}}><div style={{...label,position:"absolute",top:5,right:9}}>امضای خریدار</div></div>}
      </div>);
    return(
      <div>
        <div className="no-print" style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={()=>setView("list")} style={{...BTN("var(--border)","var(--accent-light)"),padding:"7px 14px",fontSize:13}}>← بازگشت</button>
          <button data-testid="inv-print-btn" onClick={()=>window.print()} style={{...BTN("#2563eb"),padding:"7px 14px",fontSize:13}}>🖨️ چاپ / ذخیره PDF</button>
          <button data-testid="inv-edit-btn" onClick={()=>openEdit(iv)} style={{...BTN("var(--border)","#f59e0b"),padding:"7px 14px",fontSize:13}}>✏️ ویرایش</button>
          {iv.status!=="draft"&&<button data-testid="inv-share-btn" onClick={()=>setShareIv(iv)} style={{...BTN("#16a34a"),padding:"7px 14px",fontSize:13}}>📤 اشتراک‌گذاری / PDF</button>}
          {iv.saleId&&rem>0&&<button data-testid="inv-receive-btn" onClick={()=>setPayIv(iv)} style={{...BTN("#0d9488"),padding:"7px 14px",fontSize:13}}>💰 دریافت مانده</button>}
          <button data-testid="inv-reissue-btn" onClick={()=>reissue(iv)} style={{...BTN("var(--border)","#38bdf8"),padding:"7px 14px",fontSize:13}}>📄 کپی فاکتور</button>
          <button data-testid="inv-void-preview" onClick={()=>setDelConfirm(iv.id)} style={{...BTN("#450a0a","#f87171"),padding:"7px 14px",fontSize:13}}>🚫 ابطال</button>
          <button data-testid="inv-print-settings-btn" onClick={()=>setShowPrintSet(v=>!v)} style={{...BTN(showPrintSet?"#7c3aed":"var(--border)",showPrintSet?"#fff":"var(--text-secondary)"),padding:"7px 14px",fontSize:13}}>🧾 تنظیمات فاکتور</button>
        </div>
        <InvoiceLinks iv={iv}/>
        {overlays}
        {showPrintSet&&<InvoicePrintSettings shop={shop} setShop={setShop}/>}
        <style>{`${pageCss}@media print{html,body{background:#fff!important}body *{visibility:hidden!important}.invoice-print,.invoice-print *{visibility:visible!important}.invoice-print{position:absolute!important;top:0;left:0;right:0;width:100%!important;max-width:none!important;margin:0!important;box-shadow:none!important;border-radius:0!important;padding:0!important;background:#fff!important;color:#000!important}.no-print{display:none!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr,.avoid-break{page-break-inside:avoid;break-inside:avoid}thead{display:table-header-group}}`}</style>
        <div className="invoice-print" data-testid="invoice-print" style={{background:"#fff",color:"#1e293b",borderRadius:12,padding:th?14:size==="A5"?20:28,maxWidth:W,margin:"0 auto",fontFamily:"Vazirmatn,Tahoma,sans-serif",direction:"rtl",boxShadow:"0 4px 24px #0002",fontSize:fs}}>
          {/* Header */}
          <div style={{display:"flex",flexDirection:th?"column":"row",justifyContent:"space-between",alignItems:th?"center":"flex-start",gap:12,borderBottom:"2px solid #2563eb",paddingBottom:14,marginBottom:14,textAlign:th?"center":"right"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12,flexDirection:th?"column":"row"}}>
              {shop.logo&&<img src={shop.logo} alt="لوگو" style={{width:th?44:56,height:th?44:56,objectFit:"contain",borderRadius:8,flexShrink:0}}/>}
              <div>
                <div style={{fontSize:th?16:22,fontWeight:800,color:"#2563eb"}}>{shop.name||"کافی‌نت"}</div>
                {shop.address&&<div style={{fontSize:fs-1,color:"#64748b",marginTop:4}}>📍 {shop.address}</div>}
                {(showPhone||showMobile)&&<div data-testid="inv-contact" style={{fontSize:fs-1,color:"#64748b",marginTop:2}}>{showPhone&&<span>📞 {toFA(shop.phone)}</span>}{showPhone&&showMobile&&<span> &nbsp;|&nbsp; </span>}{showMobile&&<span>📱 {toFA(shop.mobile)}</span>}</div>}
                {shop.taxId&&<div style={{fontSize:fs-1,color:"#64748b",marginTop:2}}>شناسه مالیاتی: {toFA(shop.taxId)}</div>}
              </div>
            </div>
            <div style={{textAlign:th?"center":"left",background:"#f1f5f9",borderRadius:10,padding:"10px 14px",minWidth:th?"100%":150,boxSizing:"border-box"}}>
              <div style={label}>فاکتور فروش</div>
              <div style={{fontSize:th?16:20,fontWeight:800,color:"#1e293b"}}>شماره {toFA(iv.number)}</div>
              <div data-testid="inv-datetime" style={{...label,marginTop:3}}>تاریخ: {jalaliLabel(iv.date)}{iv.time?` — ساعت ${toFA(iv.time)}`:""}</div>
              {iv.createdBy?.name&&<div data-testid="inv-created-by" style={{...label,marginTop:2}}>ثبت‌کننده: {iv.createdBy.name}</div>}
              <div style={{marginTop:6,display:"inline-block",background:INV_STATE[invState(iv)].color,color:"#fff",borderRadius:5,padding:"2px 8px",fontSize:fs-2,fontWeight:700}}>{INV_STATE[invState(iv)].label}</div>
              {o.showBarcode&&<div data-testid="inv-barcode" style={{marginTop:8,direction:"ltr",textAlign:"center",background:"#fff",borderRadius:4,padding:"2px 4px"}}><div dangerouslySetInnerHTML={{__html:code128Svg(invBarcodeValue(iv),{height:th?32:38,module:th?1.1:1.3})}}/><div style={{fontSize:10,letterSpacing:2,color:"#475569"}}>{invBarcodeValue(iv)}</div></div>}
            </div>
          </div>

          {/* Customer */}
          <div className="avoid-break" style={{background:"#f8fafc",borderRadius:8,padding:"10px 14px",marginBottom:14}}>
            <div style={label}>خریدار / مشتری</div>
            <div style={{fontSize:fs+3,fontWeight:700}}>{iv.customerName||"—"}</div>
            {iv.customerPhone&&<div style={{fontSize:fs-1,color:"#64748b",marginTop:2}}>📞 {toFA(iv.customerPhone)}</div>}
            {iv.customerAddress&&<div style={{fontSize:fs-1,color:"#64748b",marginTop:2}}>📍 {iv.customerAddress}</div>}
            {iv.channel==="online"&&iv.online&&<div data-testid="inv-online" style={{fontSize:fs-1,color:"#1e40af",marginTop:2}}>🛒 سفارش آنلاین{iv.online.platform?` · ${iv.online.platform}`:""}{iv.online.orderRef?` · شمارهٔ سفارش ${iv.online.orderRef}`:""}{iv.online.carrier?` · ${iv.online.carrier}`:""}{iv.online.trackingCode?` · کد رهگیری ${iv.online.trackingCode}`:""}</div>}
          </div>

          {/* Items */}
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14,fontSize:fs}}>
            <thead>
              <tr style={{background:"#2563eb",color:"#fff"}}>
                <th style={{padding:"7px 8px",textAlign:"right"}}>ردیف</th>
                <th style={{padding:"7px 8px",textAlign:"right"}}>شرح</th>
                <th style={{padding:"7px 8px",textAlign:"center"}}>تعداد</th>
                {!th&&<th style={{padding:"7px 8px",textAlign:"center"}}>واحد</th>}
                {!th&&<th style={{padding:"7px 8px",textAlign:"left"}}>قیمت واحد ({currencyLabel()})</th>}
                <th style={{padding:"7px 8px",textAlign:"left"}}>جمع ({currencyLabel()})</th>
              </tr>
            </thead>
            <tbody>
              {iv.items.map((it,i)=>(
                <tr key={it.id} style={{background:i%2===0?"#f8fafc":"#fff",borderBottom:"1px solid #e2e8f0"}}>
                  <td style={{padding:"7px 8px",color:"#64748b"}}>{toFA(i+1)}</td>
                  <td style={{padding:"7px 8px",fontWeight:500}}>{it.desc||"—"}</td>
                  <td style={{padding:"7px 8px",textAlign:"center"}}>{toFA(it.qty)}</td>
                  {!th&&<td style={{padding:"7px 8px",textAlign:"center",color:"#64748b"}}>{it.unit}</td>}
                  {!th&&<td style={{padding:"7px 8px",textAlign:"left"}}>{money(it.price)}</td>}
                  <td style={{padding:"7px 8px",textAlign:"left",fontWeight:600}}>{money(Number(it.qty||0)*Number(it.price||0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals + words */}
          <div className="avoid-break" style={{display:"flex",flexDirection:th?"column":"row",gap:12,marginBottom:12,alignItems:"stretch"}}>
            <div style={{flex:1}}>
              {o.showWords&&iv.totalAmount>0&&<div data-testid="inv-words" style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:fs-1,lineHeight:1.9}}><span style={label}>مبلغ به حروف: </span><b>{numToWords(iv.totalAmount)} {currencyLabel()}</b></div>}
              {paymentRows.filter(p=>p.method!=="free").length>0&&<div style={{marginTop:8,fontSize:fs-2,color:"#64748b"}}>
                <div style={{fontWeight:700,marginBottom:3}}>پرداخت‌ها</div>
                {paymentRows.filter(p=>p.method!=="free").map(p=><div key={p.id} style={{display:"flex",justifyContent:"space-between",maxWidth:300}}><span>{payLabel(p.method)} · {jalaliLabel(p.date)}</span><span>{money(p.amount)}</span></div>)}
              </div>}
            </div>
            <div style={{minWidth:th?0:250,background:"#f8fafc",borderRadius:8,padding:"10px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:"#64748b"}}>جمع اقلام:</span><span>{money(subtotal(iv))} {currencyLabel()}</span></div>
              {Number(iv.tax)>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:"#64748b"}}>مالیات ({toFA(iv.tax)}٪):</span><span>{money(iv.taxAmount)} {currencyLabel()}</span></div>}
              {Number(iv.discount)>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5,color:"#16a34a"}}><span>تخفیف:</span><span>({money(iv.discount)}) {currencyLabel()}</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:fs+2,fontWeight:800,borderTop:"1px solid #e2e8f0",paddingTop:7,marginTop:4}}><span>قابل پرداخت:</span><span style={{color:"#2563eb"}}>{money(iv.totalAmount)} {currencyLabel()}</span></div>
              {hasPay&&<>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:7,color:"#16a34a"}}><span>پرداخت‌شده:</span><span>{money(paid)} {currencyLabel()}</span></div>
                {waived>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:3,color:"#64748b"}}><span>رایگان / بخشودگی:</span><span>{money(waived)} {currencyLabel()}</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,marginTop:3,color:rem>0?"#dc2626":"#16a34a"}}><span>باقی‌مانده:</span><span>{money(rem)} {currencyLabel()}</span></div>
              </>}
            </div>
          </div>

          {cardBox}
          {iv.note&&<div className="avoid-break" style={{background:"#fefce8",border:"1px solid #fde047",borderRadius:8,padding:"8px 12px",fontSize:fs-1,color:"#713f12",marginBottom:10}}>📝 {iv.note}</div>}
          {(o.showStamp&&shop.stamp)||(o.showSignature&&shop.signature)?sealBox:<div className="avoid-break" style={{display:"grid",gridTemplateColumns:th?"1fr":"1fr 1fr",gap:10,marginTop:10}}><div style={{position:"relative",height:th?60:90,border:"1px dashed #cbd5e1",borderRadius:8}}><div style={{...label,position:"absolute",top:5,right:9}}>مهر و امضای فروشنده</div></div>{!th&&<div style={{position:"relative",height:90,border:"1px dashed #cbd5e1",borderRadius:8}}><div style={{...label,position:"absolute",top:5,right:9}}>امضای خریدار</div></div>}</div>}

          {/* Footer */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:10,marginTop:12,textAlign:"center",fontSize:fs-2,color:"#94a3b8",lineHeight:1.9}}>
            <div data-testid="inv-footer" style={{color:"#475569",fontWeight:600,fontSize:fs-1}}>{shop.footer||"از خرید شما سپاسگزاریم"}</div>
            <div>صادرشده با کافینو | CAFINO — سامانه مدیریت هوشمند کافی‌نت</div>
          </div>
        </div>
      </div>
    );
  }

  // ── FORM VIEW ──
  if(view==="form"){
    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <button onClick={()=>{setView("list");setEditId(null);}} style={{...BTN("var(--border)","var(--accent-light)"),padding:"7px 14px",fontSize:13}}>← بازگشت</button>
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)"}}>{editId?"✏️ ویرایش فاکتور":"🧾 فاکتور جدید"} #{toFA(form.number)}</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          {/* Date & Status */}
          <div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>📋 اطلاعات فاکتور</div>
            <label style={{fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:10}}>شماره فاکتور
              <input value={form.number} onChange={e=>setForm(f=>({...f,number:e.target.value}))} style={{...INP,fontSize:13}}/>
            </label>
            <label style={{fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:10}}>تاریخ صدور
              <JalaliPicker value={form.date} onChange={d=>setForm(f=>({...f,date:d}))}/>
            </label>
            <label style={{fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:10}}>ساعت صدور
              <input type="time" value={form.time||""} onChange={e=>setForm(f=>({...f,time:e.target.value}))} style={{...INP,fontSize:13}}/>
            </label>
            <label style={{fontSize:12,color:"var(--text-secondary)",display:"block"}}>وضعیت
              <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{...INP,fontSize:13}}>
                <option value="draft">📝 پیش‌نویس</option>
                <option value="unpaid">🔴 پرداخت نشده</option>
                <option value="paid">✅ پرداخت شده</option>
              </select>
            </label>
          </div>

          {/* Customer */}
          <div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>👤 مشتری</div>
            {customers.length>0&&(
              <label style={{fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:10}}>انتخاب از مشتریان (جستجو کنید)
                <SearchableSelect
                  options={[{value:"",label:"— ورود دستی —",group:null},...customers.map(c=>({value:String(c.id),label:`${c.firstName} ${c.lastName}`.trim()+(c.phone?` (${c.phone})`:""),group:null}))]}
                  value={form.customerId}
                  placeholder="جستجوی مشتری..."
                  onChange={fillCustomer}
                />
              </label>
            )}
            <label style={{fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:8}}>نام و نام خانوادگی
              <input value={form.customerName} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))} placeholder="نام مشتری..." style={{...INP,fontSize:13}}/>
            </label>
            <label style={{fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:8}}>شماره تماس
              <input value={form.customerPhone} onChange={e=>setForm(f=>({...f,customerPhone:e.target.value}))} placeholder="۰۹۱۲..." style={{...INP,fontSize:13}}/>
            </label>
            <label style={{fontSize:12,color:"var(--text-secondary)",display:"block"}}>آدرس
              <input value={form.customerAddress} onChange={e=>setForm(f=>({...f,customerAddress:e.target.value}))} placeholder="آدرس..." style={{...INP,fontSize:13}}/>
            </label>
          </div>
        </div>

        {/* Items */}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)"}}>📦 اقلام فاکتور</div>
            <button onClick={addItem} style={{...BTN("#2563eb"),padding:"5px 12px",fontSize:12}}>+ افزودن ردیف</button>
          </div>

          {form.items.map((it,i)=>(
            <div key={it.id} style={{background:"var(--bg-app)",borderRadius:8,padding:12,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:11,color:"var(--text-muted)",minWidth:20}}>#{toFA(i+1)}</span>
                {form.items.length>1&&<button onClick={()=>removeItem(it.id)} style={{...BTN("#450a0a","#f87171"),padding:"3px 8px",fontSize:11,marginRight:"auto"}}>× حذف</button>}
              </div>
              {/* Tariff quick-fill */}
              <div style={{marginBottom:8}}>
                <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>انتخاب از تعرفه (اختیاری) — جستجو کنید</div>
                <SearchableSelect options={INCOME_CATEGORY_OPTIONS} value="" placeholder="جستجوی خدمت از تعرفه..." onChange={val=>fillFromTariff(it.id,val)}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8}}>
                <label style={{fontSize:11,color:"var(--text-secondary)"}}>شرح
                  <input value={it.desc} onChange={e=>updateItem(it.id,"desc",e.target.value)} placeholder="شرح خدمت..." style={{...INP,marginTop:3,fontSize:13}}/>
                </label>
                <label style={{fontSize:11,color:"var(--text-secondary)"}}>تعداد
                  <input type="number" value={it.qty} min={1} onChange={e=>updateItem(it.id,"qty",e.target.value)} style={{...INP,marginTop:3,fontSize:13}}/>
                </label>
                <label style={{fontSize:11,color:"var(--text-secondary)"}}>واحد
                  <select value={it.unit} onChange={e=>updateItem(it.id,"unit",e.target.value)} style={{...INP,marginTop:3,fontSize:12}}>
                    {["عدد","ساعت","برگ","نفر","بار","ماه","سرویس"].map(u=><option key={u}>{u}</option>)}
                  </select>
                </label>
                <label style={{fontSize:11,color:"var(--text-secondary)"}}>قیمت ({currencyLabel()})
                  <input type="number" value={it.price} onChange={e=>updateItem(it.id,"price",e.target.value)} placeholder="0" style={{...INP,marginTop:3,fontSize:13}}/>
                </label>
              </div>
              <div style={{textAlign:"left",fontSize:12,color:"#22d3ee",marginTop:6,fontWeight:600}}>
                جمع: {toFA((Number(it.qty||0)*Number(it.price||0)).toLocaleString("fa-IR"))} {currencyLabel()}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:9}}>
                <label style={{fontSize:11,color:"var(--text-secondary)"}}>کالای مرتبط در انبار
                  <select data-testid={`inv-stock-${it.id}`} value={it.stockId||""} onChange={e=>{const stockId=e.target.value;updateItem(it.id,"stockId",stockId);updateItem(it.id,"stockQty",stockId?String(Number(it.qty)||1):"");}} style={{...INP,marginTop:3,fontSize:12}}>
                    <option value="">خدمت / بدون برداشت از انبار</option>
                    {inventory.map(x=><option key={x.id} value={String(x.id)}>{x.name} — موجودی {fmtQty(x.qty)} {x.unit||""}</option>)}
                  </select>
                </label>
                <label style={{fontSize:11,color:"var(--text-secondary)"}}>مقدار برداشت از انبار
                  <input data-testid={`inv-stock-qty-${it.id}`} type="number" min="0" step="0.0001" disabled={!it.stockId} value={it.stockQty||""} onChange={e=>updateItem(it.id,"stockQty",e.target.value)} placeholder="به تعداد ردیف" style={{...INP,marginTop:3,fontSize:12,opacity:it.stockId?1:.55}}/>
                </label>
              </div>
            </div>
          ))}

          {/* Totals */}
          <div style={{borderTop:"1px solid var(--border)",paddingTop:12,marginTop:8}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <label style={{fontSize:12,color:"var(--text-secondary)"}}>مالیات (٪)
                <input type="number" value={form.tax} min={0} max={100} onChange={e=>setForm(f=>({...f,tax:e.target.value}))} style={{...INP,marginTop:3,fontSize:13}}/>
              </label>
              <label style={{fontSize:12,color:"var(--text-secondary)"}}>تخفیف ({currencyLabel()})
                <input type="number" value={form.discount} min={0} onChange={e=>setForm(f=>({...f,discount:e.target.value}))} style={{...INP,marginTop:3,fontSize:13}}/>
              </label>
              <div style={{background:"var(--bg-app)",borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                <div style={{fontSize:11,color:"var(--text-muted)"}}>مبلغ نهایی</div>
                <div style={{fontSize:16,fontWeight:800,color:"#22d3ee",marginTop:2}}>{fmtM(total(form))}</div>
              </div>
            </div>
            <label style={{fontSize:12,color:"var(--text-secondary)",display:"block"}}>توضیحات فاکتور
              <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="توضیحات اضافی..." rows={2} style={{...INP,marginTop:3,resize:"vertical",fontSize:13}}/>
            </label>
          </div>
        </div>

        {formError&&<div role="alert" style={{marginBottom:10,color:"#f87171",fontSize:12}}>{formError}</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={saveInvoice} style={{...BTN("#2563eb"),flex:2,padding:12,fontSize:14}}>💾 ذخیره فاکتور</button>
          <button onClick={()=>{saveInvoice();}} style={{...BTN("#16a34a"),flex:1,padding:12,fontSize:14}}>💾 ذخیره</button>
          <button onClick={()=>{setView("list");setEditId(null);}} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:12,fontSize:14}}>انصراف</button>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>🧾 فاکتورها ({toFA(invoices.length)})</div>
        <div style={{display:"flex",gap:8}}>
          <button data-testid="inv-print-settings-btn" onClick={()=>setShowPrintSet(v=>!v)} style={BTN(showPrintSet?"#7c3aed":"var(--bg-card)",showPrintSet?"#fff":"var(--text-secondary)")}>🧾 تنظیمات فاکتور</button>
          <button onClick={openNew} style={BTN("#2563eb")}>+ فاکتور جدید</button>
        </div>
      </div>
      {showPrintSet&&<InvoicePrintSettings shop={shop} setShop={setShop}/>}

      <InvoiceDashboard invoices={invoices} period={dashPeriod} setPeriod={setDashPeriod}
        d={invoiceDashData(invoices,dashPeriod)}
        allDebt={invoices.filter(iv=>iv.status!=="draft").reduce((sum,iv)=>sum+invoicePayInfo(iv).remaining,0)}
        paymentMethods={PAY_METHODS} periods={INV_DASH_PERIODS} formatMoney={fmtM} formatNumber={toFA} buttonStyle={BTN}/>
      <ExportBar title={`گزارش فاکتورها — ${(INV_DASH_PERIODS.find(p=>p[0]===dashPeriod)||[])[1]}`} fileBase="invoices" sections={invoiceExportSections(invoiceDashData(invoices,dashPeriod).list)} kpis={(()=>{const d=invoiceDashData(invoices,dashPeriod);return[["فروش",fmtM(d.sales)],["تعداد فاکتور",toFA(d.count)],["نقدی",fmtM(d.by.cash||0)],["کارتخوان",fmtM(d.by.pos||0)],["بدهی",fmtM(d.debt)]];})()}/>

      {/* Summary KPIs */}
      {invoices.length>0&&(()=>{const real=invoices.filter(iv=>iv.status!=="draft");const infos=real.map(invoicePayInfo);const paidSum=infos.reduce((a,x)=>a+x.paid,0),remSum=infos.reduce((a,x)=>a+x.remaining,0);return(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
          <KPI icon="FileText" label="کل فاکتور" val={toFA(real.length)+" فاکتور"} color="#2563eb" bg="#0a1628"/>
          <KPI icon="CheckCircle2" label="دریافت‌شده" val={fmtM(paidSum)} color="#16a34a" bg="#052e16"/>
          <KPI icon="Circle" label="مانده (بدهی)" val={fmtM(remSum)} color="#dc2626" bg="#2d0a0a"/>
        </div>);})()}
      <div data-testid="inv-filters" style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {[["all","همه","#2563eb"],["paid","پرداخت شده",INV_STATE.paid.color],["partial","نیمه‌پرداخت",INV_STATE.partial.color],["unpaid","پرداخت نشده",INV_STATE.unpaid.color],["draft","پیش‌نویس",INV_STATE.draft.color]].map(([k,l,c])=>(
          <button key={k} data-testid={`inv-filter-${k}`} onClick={()=>setStFilter(k)} style={{...BTN(stFilter===k?c:"var(--bg-card)",stFilter===k?"#fff":"var(--text-secondary)"),padding:"5px 12px",fontSize:12}}>{l} ({toFA(stCount(k))})</button>))}
      </div>

      {/* Search + barcode scan */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <div style={{position:"relative",flex:"2 1 240px"}}>
          <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"var(--text-muted)"}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جستجو بر اساس نام مشتری یا شماره فاکتور..." style={{...INP,marginTop:0,paddingRight:38}}/>
        </div>
        <div style={{position:"relative",flex:"1 1 200px"}}>
          <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"var(--text-muted)"}}>▮▯▮</span>
          <input data-testid="inv-scan" value={scan} onChange={e=>{setScan(e.target.value);setScanMsg("");}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();doScan();}}} placeholder="اسکن بارکد فاکتور + Enter" style={{...INP,marginTop:0,paddingRight:46,direction:"ltr",textAlign:"right"}}/>
        </div>
      </div>
      {scanMsg&&<div data-testid="inv-scan-msg" style={{fontSize:12,color:"#f87171",marginTop:-6,marginBottom:10}}>{scanMsg}</div>}

      {filteredInvoices.length===0
        ?<Empty text="هنوز فاکتوری صادر نشده" sub="از دکمه «فاکتور جدید» شروع کنید"/>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filteredInvoices.map(iv=>(
            <div key={iv.id} style={{background:"var(--bg-card)",borderRadius:12,padding:"14px 18px",borderRight:`3px solid ${INV_STATE[invState(iv)].color}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{background:"var(--header-grad-1)",borderRadius:8,padding:"6px 10px",textAlign:"center",flexShrink:0}}>
                    <div style={{fontSize:10,color:"var(--text-muted)"}}>فاکتور</div>
                    <div style={{fontSize:14,fontWeight:800,color:"#60a5fa"}}>#{toFA(iv.number)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700}}>{iv.customerName||"بدون نام"}</div>
                    <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2,display:"flex",gap:10}}>
                      <span>{jalaliLabel(iv.date)}</span>
                      {iv.customerPhone&&<span>📞 {iv.customerPhone}</span>}
                      <span>{toFA((iv.items||[]).length)} قلم</span>
                    </div>
                    {(()=>{const pi=invoicePayInfo(iv);const es=Object.entries(pi.by).filter(([,v])=>v>0);if(!es.length&&!(pi.remaining>0))return null;return(
                      <div data-testid="inv-methods" style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}>
                        {es.map(([k,v])=><span key={k} style={{fontSize:10,background:"var(--bg-app)",borderRadius:6,padding:"2px 7px",color:"#4ade80"}}>{(PAY_METHODS.find(m=>m.key===k)||{icon:"•••"}).icon} {payLabel(k)} {fmtCompact(v)}</span>)}
                        {pi.remaining>0&&<span style={{fontSize:10,background:"#450a0a",borderRadius:6,padding:"2px 7px",color:"#fca5a5"}}>📒 بدهی {fmtCompact(pi.remaining)}</span>}
                      </div>);})()}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#22d3ee"}}>{fmtM(iv.totalAmount||0)}</div>
                    <div style={{marginTop:4,display:"inline-block",background:INV_STATE[invState(iv)].color,color:"#fff",borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>{INV_STATE[invState(iv)].label}</div>
                    {iv.status!=="draft"&&invState(iv)!=="paid"&&<div style={{fontSize:10,color:"#fbbf24",marginTop:3}}>پرداخت {fmtM(invoicePayInfo(iv).paid)} · مانده {fmtM(invoicePayInfo(iv).remaining)}</div>}
                    {iv.saleId&&<div title="این فاکتور از جریان فروش ساخته شده و به سفارش، درآمد و حساب مشتری متصل است" style={{fontSize:10,color:"#60a5fa",marginTop:3}}>🔗 متصل به فروش</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    <button onClick={()=>openPreview(iv)} style={{...BTN("var(--header-grad-1)","var(--accent-light)"),padding:"4px 10px",fontSize:11}}>🔍 پیش‌نمایش چاپ</button>
                    <button data-testid="inv-export-excel" onClick={()=>sectionsToExcel(`فاکتور شماره ${iv.number}`,invoiceExportSections([iv]),`invoice-${iv.number}`)} style={{...BTN("#166534"),padding:"4px 10px",fontSize:11}}>📗 دانلود اکسل</button>
                    <button data-testid="inv-edit" onClick={()=>openEdit(iv)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"4px 10px",fontSize:11}}>{iv.status==="draft"?"📝 تکمیل و صدور":"✏️ ویرایش"}</button>
                    {iv.saleId&&invoicePayInfo(iv).remaining>0&&<button data-testid="inv-receive" onClick={()=>setPayIv(iv)} style={{...BTN("#0d9488"),padding:"4px 10px",fontSize:11}}>💰 دریافت مانده</button>}
                    {iv.status!=="draft"&&<button data-testid="inv-share" onClick={()=>{setPrintId(iv.id);setView("preview");setShareIv(iv);}} style={{...BTN("#16a34a"),padding:"4px 10px",fontSize:11}}>📄 دانلود PDF / اشتراک</button>}
                    <button data-testid="inv-reissue" onClick={()=>reissue(iv)} style={{...BTN("var(--border)","#38bdf8"),padding:"4px 10px",fontSize:11}}>📄 کپی فاکتور</button>
                    <button data-testid="inv-void" onClick={()=>setDelConfirm(iv.id)} style={{...BTN("#450a0a","#f87171"),padding:"4px 10px",fontSize:11}}>🚫 ابطال</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      }

      <VoidedPanel kinds={["invoice","sale"]} title="🚫 فاکتورهای باطل‌شده"/>
      {overlays}

    </div>
  );
}
