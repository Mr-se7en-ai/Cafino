// Generated from App.jsx by the module split (v1.50.0). Section: customers
import { PRINT_FONT_FAMILY, printFontCss, printWhenReady } from "../core/printFont.js";
import React, { useState, useEffect, useRef } from "react";
import Icon, { ICONS } from "../../components/Icon.jsx";
import { getApiConfig, saveApiConfig, isApiConnected, apiResources, apiRequest } from "../../services/api/client.js";
import { clearAuthSession, discardLegacyLocalCredentials, getAuthenticatedUser, normalizeAuthUser, setAuthSession, setAuthenticatedUser } from "../../services/auth/session.js";
import { queueOp, syncQueue, startAutoSync, getSyncConfig, mappers as syncMappers } from "../../sync/index.js";
import { vault, getPrivacyConfig, setPrivacyConfig, isPhotoRef, photoRefId, makePhotoRef, migrateInlineMedia, applyReplacements, inlineMediaForBackup, sweepVault, dropMissingRefs, referencedIds } from "../../data/customerFiles.js";
import { dataUrlToBlob, blobToDataUrl, validateUpload, MAX_FILE_BYTES, MAX_FILES_PER_OWNER, MAX_TOTAL_BYTES } from "../../data/fileStore.js";
import { reportError } from "../../diagnostics/index.js";
import { logActivity } from "../core/activity.js";
import { audit } from "../../audit/auditTrail.js";
import { askReason } from "../../audit/ReasonDialog.jsx";
import { escapeHtml, safeImgSrc, fmtCompact, fmtM, toFA } from "../core/format.js";
import { isoToJKey, jalaliLabel, p2 } from "../domain/backup.js";
import { clubAggregate, clubInfo, crmAggregate, crmStats, defaultCrmConfig, getClubConfig, getCrmConfig, receiveCustomerPayment } from "../domain/club.js";
import { ClubBadge, ClubDetailTab, ClubOverview } from "../components/clubUI.jsx";
import { BTN, CRM_KEY, CUSTOMERS_STORAGE_KEY, FU_STATUSES, INP, JM, LEDGER_STORAGE, ORDERS_STORAGE_KEY, ORDER_STATUSES, latinDigits } from "../core/constants.js";
import { JalaliPicker, SearchableSelect } from "../components/controls.jsx";
import { FollowUpsSection } from "./followups.jsx";
import { useShopInfo } from "../domain/invoiceData.js";
import { phoneIntl } from "./invoices.jsx";
import { dateToJalali, todayIso, todayJalali } from "../core/jalali.js";
import { daysUntil } from "../domain/obligations.jsx";
import { useOrders } from "./orders.jsx";
import { ExportBar } from "../components/reportExport.jsx";
import { SaleWizard } from "./saleWizard.jsx";
import { takeSearchFocus } from "../domain/search.js";
import { PAY_METHODS, createId, emitDataChange, getSales, hasPendingFor, loadRemoteIds, lsRead, lsWrite, payLabel, saleRemaining, saveRemoteIds, useDataSync } from "../domain/sales.jsx";
import { deriveIncomeCategoryOptions, useTariffData } from "./tariff.jsx";
import SmsCustomersPage from "../../sms/SmsCustomersPage.jsx";
import { Empty } from "../components/ui.jsx";


export function useCustomers(){
  const [customers,setCustomers]=useState(()=>{
    try{return JSON.parse(localStorage.getItem(CUSTOMERS_STORAGE_KEY)||"[]");}catch{return[];}
  });
  useEffect(()=>{lsWrite(CUSTOMERS_STORAGE_KEY,customers);},[customers]);
  useDataSync(()=>setCustomers(lsRead(CUSTOMERS_STORAGE_KEY,[])));
  return [customers,setCustomers];
}

function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

// ── Customer ↔ ledger link: one financial picture per customer (summary + timeline) ──
export function jalaliShort(iso){if(!iso)return"—";const[jy,jm,jd]=dateToJalali(iso);return `${toFA(jd)} ${JM[jm-1]}`;}

function relativeDay(iso){
  if(!iso)return"—";
  const d=daysUntil(iso);
  if(d===0)return"امروز";if(d===-1)return"دیروز";
  if(d<0&&d>=-30)return `${toFA(-d)} روز پیش`;
  return jalaliLabel(iso);
}

export function buildCustomerFinance(customerId,customerOverride){
  const cid=String(customerId);
  const cust=customerOverride||lsRead(CUSTOMERS_STORAGE_KEY,[]).find(c=>String(c.id)===cid)||{};
  const sales=getSales().filter(s=>String(s.customerId)===cid&&!s.cancelled);
  const manualSvc=(cust.serviceHistory||[]).filter(h=>h.saleId==null);
  const acc=lsRead(LEDGER_STORAGE,[]).find(a=>a.customerId!=null&&String(a.customerId)===cid);
  const manualEntries=((acc&&acc.entries)||[]).filter(e=>e.saleId==null);
  const orders=lsRead(ORDERS_STORAGE_KEY,[]).filter(o=>String(o.customerId)===cid&&o.saleId==null);
  const events=[];
  let purchases=0,paid=0,debt=0,waived=0;
  const visitDates=[];
  sales.forEach(s=>{
    purchases+=s.total||0;paid+=s.paid||0;waived+=s.waived||0;debt+=saleRemaining(s);
    visitDates.push(s.date);
    events.push({key:"s"+s.id,date:s.date,type:"sale",title:s.title||"فروش",sub:`فاکتور #${toFA(s.number)}`,amount:s.total||0,sign:0});
    const pays=(s.payments||[]).filter(p=>p.amount>0);
    pays.forEach(p=>{
      const free=p.method==="free";
      events.push({key:"p"+p.id,date:p.date||s.date,type:free?"free":"pay",title:free?"بخشیده شد":"پرداخت",sub:`${free?"":payLabel(p.method)+" · "}فاکتور #${toFA(s.number)}`,amount:p.amount,sign:free?0:1});
    });
    const onDay=pays.filter(p=>(p.date||s.date)<=s.date).reduce((x,p)=>x+p.amount,0);
    const initDebt=(s.total||0)-onDay;
    if(initDebt>0)events.push({key:"d"+s.id,date:s.date,type:"debt",title:"ثبت بدهی",sub:`فاکتور #${toFA(s.number)}`,amount:initDebt,sign:0});
    if(initDebt>0&&saleRemaining(s)===0&&pays.length){
      const last=pays.reduce((m,p)=>String(p.date||s.date)>m?String(p.date||s.date):m,s.date);
      events.push({key:"t"+s.id,date:last,type:"settle",title:"تسویه کامل",sub:`فاکتور #${toFA(s.number)}`,amount:0,sign:0});
    }
  });
  manualSvc.forEach(h=>{purchases+=h.amount||0;paid+=h.amount||0;visitDates.push(h.date);events.push({key:"m"+h.id,date:h.date,type:"sale",title:h.name||h.category||"خدمت",sub:h.category||"",amount:h.amount||0,sign:0});});
  manualEntries.forEach(e=>{
    const isDebt=e.category==="بدهکار";
    if(isDebt)debt+=e.amount||0;
    events.push({key:"e"+e.id,date:e.date,type:isDebt?"debt":"note",title:e.category+(e.desc?` — ${e.desc}`:""),sub:"دفتر حساب",amount:e.amount||0,sign:0});
  });
  orders.forEach(o=>{
    const st=ORDER_STATUSES.find(x=>x.key===o.status);
    events.push({key:"o"+o.id,date:o.createdAt||todayIso(),type:"order",title:`سفارش: ${o.title}`,sub:st?st.label:"",amount:0,sign:0});
  });
  (cust.followUps||[]).forEach(f=>{
    events.push({key:"f"+f.id,date:f.createdAt||f.dueDate||todayIso(),type:"follow",title:`پیگیری: ${f.text}`,sub:f.done?"انجام شد":(f.dueDate?`موعد ${jalaliLabel(f.dueDate)}`:"باز"),amount:0,sign:0});
  });
  (cust.walletHistory||[]).filter(h=>h.saleId==null).forEach(h=>{
    events.push({key:"w"+h.id,date:h.date,type:"wallet",title:h.type==="charge"?"شارژ کیف پول":"برداشت از کیف پول",sub:h.note||"",amount:h.amount||0,sign:h.type==="charge"?1:-1});
  });
  const typeOrder={sale:0,debt:1,pay:2,free:2,settle:3,order:4,follow:5,wallet:6,note:7};
  events.sort((a,b)=>String(a.date).localeCompare(String(b.date))||typeOrder[a.type]-typeOrder[b.type]);
  const services=Math.max((cust.serviceHistory||[]).length,sales.reduce((n,s)=>n+((s.lines||[]).length),0)+manualSvc.length);
  const lastVisit=visitDates.filter(Boolean).sort().pop()||"";
  return{services,purchases,paid,debt,waived,saleCount:sales.length,visits:sales.length+manualSvc.length,lastVisit,events,hasAccount:!!acc};
}

const TL_STYLE={
  sale:{icon:"🧾",color:"#60a5fa",label:"فروش"},pay:{icon:"💵",color:"#4ade80",label:"پرداخت"},free:{icon:"🎁",color:"#a78bfa",label:"پرداخت"},
  debt:{icon:"📒",color:"#f87171",label:"بدهی"},settle:{icon:"✅",color:"#22c55e",label:"تسویه"},order:{icon:"📋",color:"#f59e0b",label:"سفارش"},
  follow:{icon:"🔔",color:"#fbbf24",label:"پیگیری"},wallet:{icon:"👛",color:"#14b8a6",label:"کیف پول"},note:{icon:"📝",color:"#94a3b8",label:"سایر"},
};

// filter chips follow the customer's journey: sale → payment → debt → settlement → order → follow-up
const TL_FILTERS=[
  {key:"all",label:"همه"},{key:"sale",label:"🧾 فروش",types:["sale"]},{key:"pay",label:"💵 پرداخت",types:["pay","free"]},
  {key:"debt",label:"📒 بدهی",types:["debt"]},{key:"settle",label:"✅ تسویه",types:["settle"]},
  {key:"order",label:"📋 سفارش",types:["order"]},{key:"follow",label:"🔔 پیگیری",types:["follow"]},{key:"wallet",label:"👛 کیف پول",types:["wallet"]},
];

// ── Customer photo, monthly chart and printable statement ──
function compressImage(file,max=256){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(new Error("read"));
    r.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("img"));
      img.onload=()=>{
        const side=Math.min(img.width,img.height);
        const sx=(img.width-side)/2,sy=(img.height-side)/2;
        const size=Math.min(max,side);
        const cv=document.createElement("canvas");cv.width=size;cv.height=size;
        const ctx=cv.getContext("2d");ctx.drawImage(img,sx,sy,side,side,0,0,size,size);
        resolve(cv.toDataURL("image/jpeg",0.85));
      };
      img.src=r.result;
    };
    r.readAsDataURL(file);
  });
}

function faDigitsToEn(str){return String(str).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));}

export async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true;}catch{}
  try{
    const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";
    document.body.appendChild(ta);ta.select();const ok=document.execCommand("copy");document.body.removeChild(ta);return ok;
  }catch{return false;}
}

function CopyBtn({text,label,light}){
  const [done,setDone]=useState(false);
  return(
    <button type="button" title={label?`کپی ${label}`:"کپی"} data-copy={label||""} onClick={async(e)=>{e.stopPropagation();if(await copyText(text)){setDone(true);setTimeout(()=>setDone(false),1400);}}}
      style={{background:done?"#16a34a":(light?"#ffffff26":"var(--border)"),color:done?"#fff":(light?"#fff":"var(--text-secondary)"),border:"none",borderRadius:6,padding:"1px 7px",fontSize:11,cursor:"pointer",fontFamily:"inherit",marginRight:4,lineHeight:"18px"}}>{done?"✓ کپی شد":"📋"}</button>
  );
}

// ── Private media: customer files / photos live encrypted in IndexedDB (src/data/fileStore.js); records only keep metadata / an "idb:" reference ──
const _photoUrlCache=new Map();

// the encrypted local photo reference never goes to the server
function serverCustomerBody(o){const x={...o};if(isPhotoRef(x.photo))delete x.photo;return x;}

function usePhotoSrc(photo){
  const [src,setSrc]=useState(()=>isPhotoRef(photo)?(_photoUrlCache.get(photoRefId(photo))||""):(photo||""));
  useEffect(()=>{
    if(!isPhotoRef(photo)){setSrc(photo||"");return;}
    const id=photoRefId(photo),hit=_photoUrlCache.get(id);
    if(hit){setSrc(hit);return;}
    let alive=true;setSrc("");
    Promise.resolve(vault()&&vault().get(id)).then(b=>{if(b&&alive){const u=URL.createObjectURL(b);_photoUrlCache.set(id,u);setSrc(u);}}).catch(()=>{});
    return()=>{alive=false;};
  },[photo]);
  return src;
}

function PhotoImg({photo,style,alt=""}){const src=usePhotoSrc(photo);return src?<img src={src} alt={alt} style={style}/>:null;}

async function fileBlobOf(f){
  if(f&&f.stored==="idb"){const st=vault();const b=st?await st.get(f.id):null;if(!b)throw new Error("محتوای فایل پیدا نشد (ممکن است حذف شده باشد)");return b;}
  if(f&&typeof f.data==="string")return dataUrlToBlob(f.data);
  throw new Error("فایل قابل خواندن نیست");
}

async function downloadCustomerFile(f){
  const b=await fileBlobOf(f),u=URL.createObjectURL(b),a=document.createElement("a");
  a.href=u;a.download=f.name||"file";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);
}

async function previewCustomerFile(f){
  const w=window.open("","_blank");
  try{const b=await fileBlobOf(f),u=URL.createObjectURL(b);if(w)w.location.href=u;else window.open(u,"_blank");setTimeout(()=>URL.revokeObjectURL(u),60000);}
  catch(e){if(w)w.close();alert(e.message||"نمایش فایل ممکن نشد");}
}

// removes a customer's files + photo from the vault (secure delete)
async function wipeCustomerMedia(c){
  const st=vault();if(!st||!c)return;
  for(const f of c.files||[])if(f&&f.stored==="idb"){try{await st.remove(f.id);}catch{}}
  if(isPhotoRef(c.photo)){const id=photoRefId(c.photo);try{await st.remove(id);}catch{}const u=_photoUrlCache.get(id);if(u){URL.revokeObjectURL(u);_photoUrlCache.delete(id);}}
}

export function CustomerAvatar({c,size=44,fontSize=18,style}){
  const ini=((c.firstName||"").trim()[0]||(c.lastName||"").trim()[0]||"؟");
  const photoSrc=usePhotoSrc(c.photo);
  return photoSrc
    ?<img src={photoSrc} alt="" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,...style}}/>
    :<div style={{width:size,height:size,borderRadius:"50%",background:"var(--header-grad-1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize,flexShrink:0,fontWeight:700,color:"var(--accent-light)",...style}}>{ini}</div>;
}

// last 12 Jalali months of purchases / payments for one customer
function monthlyPurchases(customerId,months=12){
  const cid=String(customerId);
  const cust=lsRead(CUSTOMERS_STORAGE_KEY,[]).find(c=>String(c.id)===cid)||{};
  const rows=[];
  getSales().filter(s=>String(s.customerId)===cid&&!s.cancelled).forEach(s=>{
    rows.push({date:s.date,buy:s.total||0,paid:0});
    (s.payments||[]).forEach(p=>{if(p.method!=="free"&&p.amount>0)rows.push({date:p.date||s.date,buy:0,paid:p.amount});});
  });
  (cust.serviceHistory||[]).filter(h=>h.saleId==null).forEach(h=>rows.push({date:h.date,buy:h.amount||0,paid:h.amount||0}));
  const [jy,jm]=todayJalali();
  const out=[];
  for(let i=months-1;i>=0;i--){
    const t=jy*12+(jm-1)-i;const y=Math.floor(t/12),m=t%12+1;
    out.push({key:`${y}-${p2(m)}`,label:JM[m-1],year:y,buy:0,paid:0});
  }
  rows.forEach(r=>{if(!r.date)return;const k=isoToJKey(r.date,"monthly");const o=out.find(x=>x.key===k);if(o){o.buy+=r.buy;o.paid+=r.paid;}});
  return out;
}

function monthlyChartSvg(data,w=640,h=200){
  const max=Math.max(1,...data.map(d=>Math.max(d.buy,d.paid)));
  const bw=Math.min(16,(w-30)/(data.length*2.6));
  const step=(w-20)/data.length;
  let g="";
  data.forEach((d,i)=>{
    const x=w-10-(i+1)*step+(step-bw*2-2)/2;
    const bh=d.buy/max*(h-34),ph=d.paid/max*(h-34);
    g+=`<rect x="${x}" y="${h-22-bh}" width="${bw}" height="${bh}" rx="2" fill="#2563eb"/><rect x="${x+bw+2}" y="${h-22-ph}" width="${bw}" height="${ph}" rx="2" fill="#16a34a"/><text x="${x+bw}" y="${h-7}" font-size="9" text-anchor="middle" fill="#64748b">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-height:${h}px"><line x1="0" y1="${h-22}" x2="${w}" y2="${h-22}" stroke="#cbd5e1"/>${g}</svg>`;
}

function CustomerMonthlyChart({customerId}){
  const [,setTick]=useState(0);
  useDataSync(()=>setTick(t=>t+1));
  const data=monthlyPurchases(customerId);
  const tb=data.reduce((a,d)=>a+d.buy,0),tp=data.reduce((a,d)=>a+d.paid,0);
  const best=data.reduce((m,d)=>d.buy>m.buy?d:m,data[0]);
  return(
    <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}} data-testid="customer-monthly">
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>📊 خرید و پرداخت ماهانه (۱۲ ماه اخیر)</div>
        <div style={{display:"flex",gap:12,fontSize:11,color:"var(--text-muted)"}}>
          <span><span style={{display:"inline-block",width:10,height:10,background:"#2563eb",borderRadius:2,marginLeft:4}}/>خرید</span>
          <span><span style={{display:"inline-block",width:10,height:10,background:"#16a34a",borderRadius:2,marginLeft:4}}/>پرداخت</span>
        </div>
      </div>
      {tb===0&&tp===0
        ?<div style={{textAlign:"center",color:"var(--text-dim)",fontSize:13,padding:"26px 0"}}>در ۱۲ ماه اخیر خریدی ثبت نشده</div>
        :<>
          <div dangerouslySetInnerHTML={{__html:monthlyChartSvg(data)}}/>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
            {[["جمع خرید",fmtM(tb),"#60a5fa"],["جمع پرداخت",fmtM(tp),"#4ade80"],["میانگین ماهانه",fmtM(Math.round(tb/12)),"var(--text-primary)"],["پرخریدترین ماه",best&&best.buy>0?`${best.label} (${fmtCompact(best.buy)})`:"—","#fbbf24"]].map(([l,v,c])=>(
              <div key={l} style={{flex:"1 1 130px",background:"var(--bg-app)",borderRadius:10,padding:"9px 12px"}}><div style={{fontSize:10,color:"var(--text-muted)"}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:c,marginTop:3}}>{v}</div></div>
            ))}
          </div>
        </>}
    </div>
  );
}

function buildCustomerStatementHtml(c,shop){
  const f=buildCustomerFinance(c.id,c);
  const name=`${c.firstName||""} ${c.lastName||""}`.trim();
  const rows=f.events.map(e=>`<tr><td>${jalaliLabel(e.date)}</td><td>${escapeHtml((TL_STYLE[e.type]||{}).label||"")}</td><td>${escapeHtml(e.title)}${e.sub?`<div style="font-size:10px;color:#64748b">${escapeHtml(e.sub)}</div>`:""}</td><td>${e.amount>0?(e.sign>0?"+":e.sign<0?"−":"")+fmtM(e.amount):"—"}</td></tr>`).join("");
  const kp=(l,v,col)=>`<div style="flex:1;min-width:120px;border:1px solid #e2e8f0;border-top:3px solid ${col};border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:#64748b">${l}</div><div style="font-size:14px;font-weight:700;color:${col};margin-top:3px">${v}</div></div>`;
  return `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="UTF-8"><title>خلاصه حساب ${escapeHtml(name)}</title><style>
${printFontCss()}    body{font-family:${PRINT_FONT_FAMILY};padding:28px;color:#0f172a;max-width:820px;margin:auto;}
    h1{font-size:19px;margin:0;} h2{font-size:14px;margin:20px 0 8px;color:#0369a1;}
    table{width:100%;border-collapse:collapse;font-size:12px;} th,td{border:1px solid #cbd5e1;padding:6px 9px;text-align:right;} th{background:#f1f5f9;}
    @media print{.no-print{display:none} body{padding:0}}
  </style></head><body>
  <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #0369a1;padding-bottom:12px;margin-bottom:14px">
    ${safeImgSrc(shop&&shop.logo)?`<img src="${safeImgSrc(shop.logo)}" style="width:48px;height:48px;object-fit:contain;border-radius:8px">`:""}
    <div style="flex:1"><h1>خلاصه حساب مشتری</h1><div style="font-size:12px;color:#64748b">${escapeHtml(shop&&shop.name?shop.name:"کافینو | CAFINO")} · تاریخ تهیه: ${jalaliLabel(todayIso())}</div></div>
  </div>
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
    ${c.photo?`<img src="${c.photo}" style="width:64px;height:64px;border-radius:50%;object-fit:cover">`:""}
    <div><div style="font-size:18px;font-weight:700">${escapeHtml(name)}</div><div style="font-size:12px;color:#475569;margin-top:3px">${c.phone?"تلفن: "+escapeHtml(toFA(c.phone)):""}${c.nationalId?" · کد ملی: "+escapeHtml(toFA(c.nationalId)):""}${c.postalCode?" · کدپستی: "+escapeHtml(toFA(c.postalCode)):""}</div>${c.address?`<div style="font-size:12px;color:#475569;margin-top:3px">آدرس: ${escapeHtml(c.address)}</div>`:""}</div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${kp("مجموع خرید",fmtM(f.purchases),"#2563eb")}${kp("پرداخت‌شده",fmtM(f.paid),"#16a34a")}${kp("بدهی",fmtM(f.debt),f.debt>0?"#dc2626":"#16a34a")}
    ${kp("تعداد مراجعه",toFA(f.visits)+" بار","#7c3aed")}${kp("آخرین مراجعه",f.lastVisit?jalaliLabel(f.lastVisit):"—","#d97706")}${kp("اعتبار کیف پول",fmtM(c.wallet||0),"#0d9488")}
  </div>
  <h2>خرید و پرداخت ماهانه (۱۲ ماه اخیر)</h2>
  ${monthlyChartSvg(monthlyPurchases(c.id))}
  <div style="font-size:10px;color:#64748b"><span style="color:#2563eb">■</span> خرید &nbsp; <span style="color:#16a34a">■</span> پرداخت</div>
  <h2>تاریخچه کامل (${toFA(f.events.length)} رویداد)</h2>
  <table><thead><tr><th>تاریخ</th><th>نوع</th><th>شرح</th><th>مبلغ</th></tr></thead><tbody>${rows||'<tr><td colspan="4" style="text-align:center">رویدادی ثبت نشده</td></tr>'}</tbody></table>
  <button class="no-print" onclick="window.print()" style="margin-top:16px;padding:10px 18px;font-size:14px;cursor:pointer">🖨️ چاپ / ذخیره PDF</button>
  </body></html>`;
}

function GoldenBadge({st,small}){
  if(!st||!st.golden)return null;
  return <span data-testid="golden-badge" title={`امتیاز مشتری طلایی: ${toFA(st.score)} از ۱۰۰`} style={{background:"linear-gradient(135deg,#78350f,#b45309)",color:"#fde68a",borderRadius:20,padding:small?"2px 9px":"3px 11px",fontSize:small?10:11,fontWeight:800,whiteSpace:"nowrap"}}>⭐ مشتری طلایی</span>;
}

function CrmModalShell({title,onClose,testid,children}){
  return(
    <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:430,padding:14}} onClick={onClose}>
      <div data-testid={testid} onClick={e=>e.stopPropagation()} style={{background:"var(--bg-card)",borderRadius:16,padding:20,width:"100%",maxWidth:440,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontWeight:700,color:"var(--accent-light)"}}>{title}</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CrmPayModal({customer,debt,onClose}){
  const [amount,setAmount]=useState(String(debt||""));
  const [method,setMethod]=useState("cash");
  const [msg,setMsg]=useState("");
  const [done,setDone]=useState(null);
  const submit=()=>{
    const r=receiveCustomerPayment(customer.id,latinDigits(amount).replace(/[^\d.]/g,""),method,todayIso());
    if(!r.ok){setMsg(r.error||"ثبت نشد");return;}
    setDone(r);
  };
  return(
    <CrmModalShell title={`💳 ثبت پرداخت — ${customer.firstName} ${customer.lastName}`} onClose={onClose} testid="crm-pay-modal">
      {done?(
        <div data-testid="crm-pay-done">
          <div style={{color:"#4ade80",fontWeight:700,marginBottom:8}}>✓ {fmtM(done.received)} دریافت شد ({toFA(done.invoices)} فاکتور)</div>
          {done.unused>0&&<div style={{fontSize:12,color:"#fbbf24",marginBottom:8}}>{fmtM(done.unused)} از مبلغ وارد‌شده مصرف نشد (بدهی فاکتوری کمتر بود).</div>}
          <button onClick={onClose} style={{...BTN("#2563eb"),width:"100%"}}>بستن</button>
        </div>
      ):(<>
        <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:10}}>بدهی فعلی: <b style={{color:debt>0?"#f87171":"#4ade80"}}>{fmtM(debt)}</b> — پرداخت از قدیمی‌ترین فاکتور بدهکار تسویه می‌شود.</div>
        <input data-testid="crm-pay-amount" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مبلغ (ریال)" style={{...INP,marginTop:0,marginBottom:10}}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {PAY_METHODS.filter(m=>m.real&&m.key!=="wallet").map(m=><button key={m.key} onClick={()=>setMethod(m.key)} style={{...BTN(method===m.key?"#2563eb":"var(--border)",method===m.key?"#fff":"var(--text-primary)"),padding:"7px 12px",fontSize:12}}>{m.icon} {m.label}</button>)}
        </div>
        {msg&&<div style={{color:"#f87171",fontSize:12,marginBottom:8}}>{msg}</div>}
        <button data-testid="crm-pay-submit" onClick={submit} style={{...BTN("#16a34a"),width:"100%"}}>ثبت پرداخت</button>
      </>)}
    </CrmModalShell>
  );
}

function CrmMessageModal({customer,st,onClose}){
  const [shop]=useShopInfo();
  const nm=`${customer.firstName||""} ${customer.lastName||""}`.trim();
  const shopName=shop.name||"کافی‌نت";
  const tpls=[
    {k:"thanks",l:"🙏 تشکر از خرید",t:`${nm} عزیز، سلام 🌷\nاز اعتماد و خرید شما از ${shopName} سپاسگزاریم. منتظر دیدار دوباره‌ی شما هستیم.`},
    ...(st.debt>0?[{k:"debt",l:"📒 یادآوری بدهی",t:`${nm} عزیز، سلام\nیادآوری دوستانه: مانده‌ی حساب شما در ${shopName} مبلغ ${fmtM(st.debt)} است. لطفاً در اولین فرصت جهت تسویه اقدام فرمایید.${shop.cardNumber?`\nشماره کارت: ${shop.cardNumber}${shop.cardHolder?` (${shop.cardHolder})`:""}`:""}\nبا تشکر`}]:[]),
    {k:"offer",l:"🎁 پیشنهاد ویژه",t:`${nm} عزیز، سلام\nبه‌عنوان مشتری ارزشمند ${shopName}، یک پیشنهاد ویژه برای شما داریم. برای اطلاعات بیشتر به ما سر بزنید.`},
    {k:"custom",l:"✍️ متن دلخواه",t:`${nm} عزیز، سلام\n`},
  ];
  const [tpl,setTpl]=useState(tpls[0].k);
  const [text,setText]=useState(tpls[0].t);
  const [msg,setMsg]=useState("");
  const ph=phoneIntl(customer.phone);
  const pick=(t)=>{setTpl(t.k);setText(t.t);};
  const copy=async()=>{try{await navigator.clipboard.writeText(text);setMsg("✓ متن کپی شد");}catch{setMsg("کپی انجام نشد");}};
  const log=(ch)=>{logActivity("ارسال پیام به مشتری",`${nm} — ${ch}`);};
  return(
    <CrmModalShell title={`✉️ ارسال پیام — ${nm}`} onClose={onClose} testid="crm-msg-modal">
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {tpls.map(t=><button key={t.k} data-testid={`crm-tpl-${t.k}`} onClick={()=>pick(t)} style={{...BTN(tpl===t.k?"#2563eb":"var(--border)",tpl===t.k?"#fff":"var(--text-primary)"),padding:"6px 11px",fontSize:12}}>{t.l}</button>)}
      </div>
      <textarea data-testid="crm-msg-text" value={text} onChange={e=>setText(e.target.value)} rows={6} style={{...INP,marginTop:0,marginBottom:10,resize:"vertical",textAlign:"right"}}/>
      {!ph&&<div style={{fontSize:12,color:"#fbbf24",marginBottom:8}}>شماره‌ای برای این مشتری ثبت نشده؛ در واتساپ مخاطب را خودتان انتخاب کنید.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <a data-testid="crm-msg-wa" onClick={()=>log("واتساپ")} href={`https://wa.me/${ph}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" style={{...BTN("#16a34a"),textDecoration:"none",textAlign:"center"}}>💬 ارسال در واتساپ</a>
        <a data-testid="crm-msg-sms" onClick={()=>log("پیامک")} href={`sms:${ph?"+"+ph:""}?body=${encodeURIComponent(text)}`} style={{...BTN("var(--border)","var(--text-primary)"),textDecoration:"none",textAlign:"center"}}>✉️ ارسال پیامک</a>
        <button data-testid="crm-msg-copy" onClick={copy} style={BTN("var(--border)","var(--text-primary)")}>📋 کپی متن</button>
      </div>
      {msg&&<div style={{marginTop:8,fontSize:12,color:"#4ade80"}}>{msg}</div>}
    </CrmModalShell>
  );
}

function CrmProfile({customer,onSale,onHistory}){
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const [pay,setPay]=useState(false);
  const [msg,setMsg]=useState(false);
  const st=crmStats(customer);
  const card=(label,val,color,sub,tid)=>(
    <div data-testid={tid} style={{flex:"1 1 150px",background:"var(--bg-card)",borderRadius:14,padding:"13px 15px",borderTop:`3px solid ${color}`,minWidth:0}}>
      <div style={{fontSize:11,color:"var(--text-muted)"}}>{label}</div>
      <div style={{fontSize:17,fontWeight:800,color,marginTop:5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{val}</div>
      {sub&&<div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>{sub}</div>}
    </div>
  );
  const tenure=st.first?(st.days<30?`${toFA(st.days)} روز`:st.days<365?`${toFA(Math.floor(st.days/30))} ماه`:`${toFA(Math.floor(st.days/365))} سال`):"—";
  return(
    <div data-testid="crm-profile" style={{marginBottom:16}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>
        {card("💰 بدهی",fmtM(st.debt),st.debt>0?"#f87171":"#4ade80",st.debt>0?"تسویه نشده":"تسویه ✓","crm-debt")}
        {card("⭐ امتیاز",toFA(st.points),"#fbbf24",`سطح ${st.club.tier.name}`,"crm-points")}
        {card("🛒 تعداد خرید",toFA(st.count),"#a78bfa","","crm-count")}
        {card("💵 مجموع خرید",fmtM(st.spent),"#60a5fa","","crm-spent")}
        {card("آخرین مراجعه",st.last?relativeDay(st.last):"—","#14b8a6",st.last?jalaliLabel(st.last):"","crm-last")}
        {card("پرفروش‌ترین خدمت",st.topService?st.topService.name:"—","#f472b6",st.topService?`${toFA(st.topService.qty)} عدد · ${fmtM(st.topService.amount)}`:"","crm-top")}
        {card("📈 سود ایجادشده",fmtM(st.profit),st.profit>=0?"#22c55e":"#f87171","","crm-profit")}
        {card("🤝 مدت همکاری",tenure,"#94a3b8",st.first?`از ${jalaliLabel(st.first)}`:"","crm-tenure")}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <button data-testid="crm-act-sale" onClick={onSale} style={{...BTN("#2563eb"),padding:"9px 16px"}}>🧾 ثبت فروش</button>
        <button data-testid="crm-act-pay" onClick={()=>setPay(true)} style={{...BTN("#16a34a"),padding:"9px 16px"}}>💳 ثبت پرداخت</button>
        <button data-testid="crm-act-history" onClick={onHistory} style={{...BTN("var(--border)","var(--text-primary)"),padding:"9px 16px"}}>🕘 تاریخچه</button>
        <button data-testid="crm-act-msg" onClick={()=>setMsg(true)} style={{...BTN("#7c3aed"),padding:"9px 16px"}}>✉️ ارسال پیام</button>
        <GoldenBadge st={st}/>
        <span data-testid="crm-score" style={{fontSize:11,color:"var(--text-muted)"}}>امتیاز طلایی: {toFA(st.score)} از ۱۰۰</span>
      </div>
      {pay&&<CrmPayModal customer={customer} debt={st.debt} onClose={()=>setPay(false)}/>}
      {msg&&<CrmMessageModal customer={customer} st={st} onClose={()=>setMsg(false)}/>}
    </div>
  );
}

function CrmSettingsModal({onClose}){
  const [cfg,setCfg]=useState(()=>JSON.parse(JSON.stringify(getCrmConfig())));
  const num=v=>Math.max(0,Number(latinDigits(v).replace(/[^\d.]/g,""))||0);
  const setT=(k,v)=>setCfg(c=>({...c,targets:{...c.targets,[k]:v}}));
  const save=()=>{
    const d=defaultCrmConfig();
    const t={};Object.keys(d.targets).forEach(k=>{t[k]=num(cfg.targets[k])||d.targets[k];});
    lsWrite(CRM_KEY,{minScore:Math.min(100,Math.max(1,num(cfg.minScore)||d.minScore)),targets:t});
    logActivity("تنظیمات مشتریان طلایی","");emitDataChange();onClose();
  };
  const row=(l,k,u)=>(
    <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:8,fontSize:12,color:"var(--text-secondary)"}}>
      <span>{l}</span><span style={{display:"flex",alignItems:"center",gap:6}}><input data-testid={`golden-t-${k}`} inputMode="numeric" value={cfg.targets[k]} onChange={e=>setT(k,e.target.value)} style={{...INP,marginTop:0,width:130,padding:"6px 8px"}}/><span style={{width:34}}>{u}</span></span>
    </label>
  );
  return(
    <CrmModalShell title="⚙️ تنظیمات مشتریان طلایی" onClose={onClose} testid="golden-settings">
      <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:12,lineHeight:1.9}}>امتیاز هر معیار نسبت به «هدف» محاسبه می‌شود (وزن‌ها: مراجعه ۲۵٪، مبلغ خرید ۳۵٪، سود ۲۵٪، مدت همکاری ۱۵٪). مشتری با امتیاز کل برابر یا بیشتر از حد زیر، طلایی است.</div>
      {row("هدف تعداد مراجعه","visits","بار")}
      {row("هدف مبلغ خرید","spent","ریال")}
      {row("هدف سود ایجادشده","profit","ریال")}
      {row("هدف مدت همکاری","days","روز")}
      <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,margin:"12px 0",fontSize:12,color:"var(--text-secondary)"}}>
        <span>حداقل امتیاز برای «طلایی» (از ۱۰۰)</span>
        <input data-testid="golden-minscore" inputMode="numeric" value={cfg.minScore} onChange={e=>setCfg(c=>({...c,minScore:e.target.value}))} style={{...INP,marginTop:0,width:80,padding:"6px 8px"}}/>
      </label>
      <button data-testid="golden-save" onClick={save} style={{...BTN("#2563eb"),width:"100%"}}>ذخیره</button>
    </CrmModalShell>
  );
}

function GoldenOverview({customers,onOpen}){
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const [only,setOnly]=useState(false);
  const [settings,setSettings]=useState(false);
  const cfg=getCrmConfig(),agg=crmAggregate();
  const all=customers.map(c=>({c,s:crmStats(c,agg,cfg)})).filter(r=>r.s.count>0).sort((a,b)=>b.s.score-a.s.score||b.s.spent-a.s.spent);
  const rows=only?all.filter(r=>r.s.golden):all;
  const goldCount=all.filter(r=>r.s.golden).length;
  const goldSpent=all.filter(r=>r.s.golden).reduce((s,r)=>s+r.s.spent,0);
  const goldProfit=all.filter(r=>r.s.golden).reduce((s,r)=>s+r.s.profit,0);
  const tot=all.reduce((s,r)=>s+r.s.spent,0);
  const nm=c=>`${c.firstName||""} ${c.lastName||""}`.trim();
  const dur=d=>d<30?`${toFA(d)} روز`:d<365?`${toFA(Math.floor(d/30))} ماه`:`${toFA(Math.floor(d/365))} سال`;
  const sections=[{name:"مشتریان",head:["رتبه","مشتری","تلفن","تعداد مراجعه","مبلغ خرید","سود ایجادشده","مدت همکاری","امتیاز","طلایی"],money:[4,5],rows:rows.map((r,i)=>[String(i+1),nm(r.c),r.c.phone||"",r.s.count,r.s.spent,r.s.profit,dur(r.s.days),r.s.score,r.s.golden?"بله":"خیر"])}];
  const kpi=(l,v,c)=><div style={{flex:"1 1 150px",background:"var(--bg-card)",borderRadius:14,padding:"12px 15px",borderTop:`3px solid ${c}`}}><div style={{fontSize:11,color:"var(--text-muted)"}}>{l}</div><div style={{fontSize:17,fontWeight:800,color:c,marginTop:4}}>{v}</div></div>;
  return(
    <div data-testid="golden-overview">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:15,fontWeight:700,color:"#fbbf24"}}>⭐ مشتریان طلایی</div>
        <div style={{display:"flex",gap:8}}>
          <button data-testid="golden-only" onClick={()=>setOnly(o=>!o)} style={{...BTN(only?"#b45309":"var(--border)",only?"#fff":"var(--text-primary)"),padding:"8px 14px",fontSize:12}}>{only?"نمایش همه":"فقط طلایی‌ها"}</button>
          <button data-testid="golden-settings-btn" onClick={()=>setSettings(true)} style={{...BTN("var(--border)","var(--text-primary)"),padding:"8px 14px",fontSize:12}}>⚙️ تنظیمات</button>
        </div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        {kpi("مشتریان طلایی",`${toFA(goldCount)} از ${toFA(all.length)}`,"#fbbf24")}
        {kpi("خرید طلایی‌ها",fmtM(goldSpent),"#60a5fa")}
        {kpi("سود طلایی‌ها",fmtM(goldProfit),"#22c55e")}
        {kpi("سهم از کل فروش",tot>0?`${toFA(Math.round(goldSpent/tot*100))}٪`:"—","#a78bfa")}
      </div>
      <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:10}}>معیارها: تعداد مراجعه · مبلغ خرید · سود ایجادشده · مدت همکاری — حد طلایی شدن: امتیاز {toFA(cfg.minScore)} از ۱۰۰</div>
      <ExportBar title="مشتریان طلایی" fileBase="golden-customers" sections={sections}/>
      {rows.length===0?<div style={{textAlign:"center",color:"var(--text-muted)",padding:30}}>مشتری‌ای برای نمایش نیست.</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {rows.map((r,i)=>(
            <div key={r.c.id} data-testid="golden-row" data-golden={r.s.golden?"1":"0"} onClick={()=>onOpen(r.c.id)} style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",borderRight:r.s.golden?"4px solid #f59e0b":"4px solid transparent"}}>
              <div style={{width:26,textAlign:"center",fontWeight:800,color:"var(--text-muted)"}}>{toFA(i+1)}</div>
              <CustomerAvatar c={r.c}/>
              <div style={{flex:"1 1 150px",minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14}}>{nm(r.c)} <GoldenBadge st={r.s} small/></div>
                <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>{toFA(r.s.count)} مراجعه · همکاری {dur(r.s.days)}</div>
              </div>
              <div style={{fontSize:12,textAlign:"left"}}><div style={{color:"#60a5fa",fontWeight:700}}>{fmtM(r.s.spent)}</div><div style={{color:"#22c55e",fontSize:11}}>سود {fmtM(r.s.profit)}</div></div>
              <div style={{minWidth:70}}>
                <div style={{fontSize:11,color:"var(--text-muted)"}}>امتیاز {toFA(r.s.score)}</div>
                <div style={{height:6,background:"var(--border)",borderRadius:4,marginTop:4,overflow:"hidden"}}><div style={{width:`${r.s.score}%`,height:"100%",background:r.s.golden?"#f59e0b":"#64748b"}}/></div>
              </div>
            </div>
          ))}
        </div>
      )}
      {settings&&<CrmSettingsModal onClose={()=>setSettings(false)}/>}
    </div>
  );
}

function CustomerKpis({f,customer}){
  const kpi=(label,val,color,sub)=>(
    <div style={{flex:"1 1 140px",background:"var(--bg-card)",borderRadius:14,padding:"13px 15px",borderTop:`3px solid ${color}`}}>
      <div style={{fontSize:11,color:"var(--text-muted)"}}>{label}</div>
      <div style={{fontSize:18,fontWeight:800,color,marginTop:5,whiteSpace:"nowrap"}}>{val}</div>
      {sub&&<div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>{sub}</div>}
    </div>
  );
  return(
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}} data-testid="customer-kpis">
      {kpi("مجموع خرید",fmtM(f.purchases),"#60a5fa",`${toFA(f.services)} خدمت`)}
      {kpi("پرداخت‌شده",fmtM(f.paid),"#4ade80",f.purchases>0?`${toFA(Math.round(f.paid/f.purchases*100))}٪ از خرید`:"")}
      {kpi("بدهی",fmtM(f.debt),f.debt>0?"#f87171":"#4ade80",f.debt>0?"تسویه نشده":"تسویه ✓")}
      {kpi("تعداد مراجعه",`${toFA(f.visits)} بار`,"#a78bfa")}
      {kpi("آخرین مراجعه",relativeDay(f.lastVisit),"#fbbf24",f.lastVisit?jalaliLabel(f.lastVisit):"")}
      {kpi("اعتبار کیف پول",fmtM((customer&&customer.wallet)||0),"#14b8a6")}
    </div>
  );
}

export function CustomerFinancePanel({customer,customerId,full}){
  const [,setTick]=useState(0);
  useDataSync(()=>setTick(t=>t+1));
  const [desc,setDesc]=useState(true);
  const [showAll,setShowAll]=useState(false);
  const [flt,setFlt]=useState("all");
  const id=customerId!=null?customerId:customer&&customer.id;
  const f=buildCustomerFinance(id,customer);
  const name=customer?`${customer.firstName||""} ${customer.lastName||""}`.trim():"";
  const fdef=TL_FILTERS.find(x=>x.key===flt)||TL_FILTERS[0];
  const base=fdef.types?f.events.filter(e=>fdef.types.includes(e.type)):f.events;
  const list=desc?[...base].reverse():base;
  const LIM=15;
  const shown=showAll?list:list.slice(0,LIM);
  const countOf=(x)=>x.types?f.events.filter(e=>x.types.includes(e.type)).length:f.events.length;
  const stat=(label,val,color,money=true)=>(
    <div style={{flex:"1 1 130px",background:"var(--bg-app)",borderRadius:11,padding:"11px 13px",borderTop:`3px solid ${color}`}}>
      <div style={{fontSize:11,color:"var(--text-muted)"}}>{label}</div>
      <div style={{fontSize:17,fontWeight:800,color,marginTop:4}}>{money?fmtM(val):`${toFA(val)} مورد`}</div>
    </div>
  );
  return(
    <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}} data-testid="customer-finance">
      {!full&&(<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>💼 حساب مالی مشتری{name?` — ${name}`:""}</div>
          {f.debt>0
            ?<span style={{background:"#450a0a",color:"#f87171",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:700}}>بدهکار: {fmtM(f.debt)}</span>
            :<span style={{background:"#052e16",color:"#4ade80",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:700}}>تسویه ✓</span>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          {stat("خدمات",f.services,"#60a5fa",false)}
          {stat("جمع خرید",f.purchases,"var(--text-primary)")}
          {stat("پرداخت‌شده",f.paid,"#4ade80")}
          {stat("بدهی",f.debt,f.debt>0?"#f87171":"#4ade80")}
        </div>
      </>)}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
        <div style={{fontSize:full?14:12,fontWeight:700,color:full?"var(--accent-light)":"var(--text-secondary)"}}>🕒 تاریخچه کامل ({toFA(f.events.length)} رویداد)</div>
        {f.events.length>1&&<button onClick={()=>setDesc(d=>!d)} style={{...BTN("var(--border)","var(--accent-light)"),padding:"4px 10px",fontSize:11}}>{desc?"قدیمی‌ترین اول":"جدیدترین اول"}</button>}
      </div>
      {full&&f.events.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {TL_FILTERS.map((x,i)=>{
            const n=countOf(x);if(x.key!=="all"&&n===0)return null;
            return<button key={x.key} onClick={()=>{setFlt(x.key);setShowAll(false);}} style={{...BTN(flt===x.key?"#2563eb":"var(--bg-app)",flt===x.key?"#fff":"var(--text-secondary)"),padding:"5px 12px",fontSize:12}}>{x.label} <span style={{opacity:0.7}}>{toFA(n)}</span></button>;
          })}
        </div>
      )}
      {list.length===0
        ?<div style={{textAlign:"center",color:"var(--text-dim)",fontSize:13,padding:"18px 0"}}>هنوز رویدادی برای این مشتری ثبت نشده</div>
        :(
        <div style={{position:"relative",paddingRight:22}}>
          <div style={{position:"absolute",right:9,top:6,bottom:6,width:2,background:"var(--border)"}}/>
          {shown.map(ev=>{
            const st=TL_STYLE[ev.type]||TL_STYLE.note;
            const amtColor=ev.sign>0?"#4ade80":ev.sign<0?"#fbbf24":ev.type==="debt"?"#f87171":"var(--text-primary)";
            return(
              <div key={ev.key} style={{position:"relative",display:"flex",gap:10,alignItems:"flex-start",padding:"7px 0"}}>
                <div style={{position:"absolute",right:-22,top:9,width:20,height:20,borderRadius:"50%",background:"var(--bg-card)",border:`2px solid ${st.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>{st.icon}</div>
                <div style={{minWidth:52,marginRight:8,fontSize:11,color:"var(--text-muted)",paddingTop:3,fontWeight:600}}>{jalaliShort(ev.date)}</div>
                <div style={{flex:1,minWidth:0,background:"var(--bg-app)",borderRadius:9,padding:"7px 11px",borderRight:`3px solid ${st.color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:13,color:"var(--text-primary)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title}</span>
                    {ev.amount>0&&<span style={{fontSize:12,fontWeight:700,color:amtColor,whiteSpace:"nowrap"}}>{ev.sign>0?"+":ev.sign<0?"−":""}{fmtCompact(ev.amount)}</span>}
                  </div>
                  {ev.sub&&<div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>{ev.sub}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {list.length>LIM&&<button onClick={()=>setShowAll(s=>!s)} style={{...BTN("var(--border)","var(--accent-light)"),width:"100%",marginTop:8,padding:"7px",fontSize:12}}>{showAll?"نمایش کمتر":`نمایش همه (${toFA(list.length)})`}</button>}
    </div>
  );
}

export function CustomersSection({pendingAction,clearPendingAction,onNavigate,forceMode,clearForceMode,voicePrefill,clearVoicePrefill}){
  const [customers,setCustomers]=useCustomers();
  const [tariffData]=useTariffData();
  const INCOME_CATEGORY_OPTIONS=deriveIncomeCategoryOptions(tariffData);
  const [view,setView]=useState("list"); // list | detail
  const [activeId,setActiveId]=useState(null);
  useEffect(()=>{const f=takeSearchFocus("customers",["customer"]);if(f&&f.id!=null){setActiveId(f.id);setView("detail");}},[]); // از نتیجهٔ جستجوی «کافیند»
  const [showAdd,setShowAdd]=useState(false);
  const [editMode,setEditMode]=useState(false);
  const [form,setForm]=useState({firstName:"",lastName:"",phone:"",note:"",nationalId:"",birthDate:"",postalCode:"",address:""});
  const [delConfirm,setDelConfirm]=useState(null);
  const [search,setSearch]=useState("");
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef();

  // ── Wallet / discount / service history ──
  const [walletModal,setWalletModal]=useState(null); // "charge" | "use" | null
  const [walletAmount,setWalletAmount]=useState("");
  const [walletNote,setWalletNote]=useState("");
  const [discountForm,setDiscountForm]=useState(null); // {enabled,threshold,percent} while editing
  const [svcForm,setSvcForm]=useState({category:"",amount:"",date:todayIso()});
  const [docName,setDocName]=useState("");
  const [orders,setOrders]=useOrders();
  const [quickOrderTitle,setQuickOrderTitle]=useState("");
  const [custTab,setCustTab]=useState("history");
  const [listMode,setListMode]=useState("people"); // people | club | followups | golden | sms
  useEffect(()=>{if(forceMode){setListMode(forceMode);setView("list");clearForceMode&&clearForceMode();}},[forceMode]);  
  const [shopInfo]=useShopInfo();
  const photoRef=useRef();
  const onPhotoPick=async(e)=>{
    const file=e.target.files&&e.target.files[0];e.target.value="";
    if(!file||!activeId)return;
    if(!/^image\//.test(file.type)){alert("فقط فایل تصویری انتخاب کنید.");return;}
    try{
      const url=await compressImage(file,256),st=vault();
      let value=url;
      if(st){try{const id=`ph_${activeId}_${Date.now().toString(36)}`;await st.put(id,dataUrlToBlob(url),{name:"photo.jpg",type:"image/jpeg",ownerId:activeId});value=makePhotoRef(id);}catch{value=url;}}
      const old=customers.find(x=>x.id===activeId);
      setCustomers(prev=>prev.map(x=>x.id===activeId?{...x,photo:value}:x));
      if(old&&isPhotoRef(old.photo)&&st)st.remove(photoRefId(old.photo)).catch(()=>{});
      logActivity("تغییر عکس مشتری","");
    }catch{alert("خواندن تصویر ممکن نشد.");}
  };
  const printStatement=()=>{
    const cu=customers.find(x=>x.id===activeId);if(!cu)return;
    const w=window.open("","_blank");
    if(!w){alert("مرورگر بازکردن پنجره‌ی جدید را مسدود کرد. لطفاً پاپ‌آپ را برای این سایت مجاز کنید.");return;}
    (async()=>{
      let cu2=cu;
      if(isPhotoRef(cu.photo)){try{const b=await vault().get(photoRefId(cu.photo));if(b)cu2={...cu,photo:await blobToDataUrl(b)};else cu2={...cu,photo:""};}catch{cu2={...cu,photo:""};}}
      w.document.write(buildCustomerStatementHtml(cu2,shopInfo));w.document.close();
      printWhenReady(w);
    })();
  };
  const [saleOpen,setSaleOpen]=useState(false);
  const [,setDataTick]=useState(0);
  useDataSync(()=>setDataTick(t=>t+1));
  const remoteCustomerSync=useRef({ready:false,snapshot:null,active:false,remoteIds:new Set()});
  const [customerSyncError,setCustomerSyncError]=useState("");
  const [legacyCustomerCount,setLegacyCustomerCount]=useState(0);
  const remoteCustomersEnabled=isApiConnected()&&!!getAuthenticatedUser();
  useEffect(()=>{
    if(!remoteCustomersEnabled)return;
    let alive=true;
    Promise.resolve(syncQueue.flush()).catch(()=>{}).then(()=>apiResources.customers.listAll()).then(result=>{
      if(!alive)return;
      const serverRows=Array.isArray(result)?result:Array.isArray(result?.customers)?result.customers:[];
      let local=[];try{local=JSON.parse(localStorage.getItem(CUSTOMERS_STORAGE_KEY)||"[]");}catch{}
      const remoteIds=new Set(serverRows.map(row=>String(row.id)));
      const legacy=Array.isArray(local)?local.filter(row=>!remoteIds.has(String(row.id))):[];
      const combined=hasPendingFor("customers")?local:[...serverRows,...legacy];
      if(alive){remoteCustomerSync.current={ready:true,snapshot:combined,active:true,remoteIds};setCustomers(combined);setLegacyCustomerCount(legacy.length);setCustomerSyncError("");}
      saveRemoteIds("customers",remoteIds);
    }).catch(error=>{
      if(!alive)return;
      // Offline (or server down): keep working from the local copy. Changes are queued and delivered later.
      let local=[];try{local=JSON.parse(localStorage.getItem(CUSTOMERS_STORAGE_KEY)||"[]");}catch{}
      remoteCustomerSync.current={ready:true,snapshot:Array.isArray(local)?local:[],active:true,remoteIds:loadRemoteIds("customers")};
      setCustomerSyncError("");
    });
    return()=>{alive=false;};
  },[remoteCustomersEnabled]);  
  useEffect(()=>{
    const sync=remoteCustomerSync.current;if(!remoteCustomersEnabled||!sync.ready||!sync.active)return;
    const previous=Array.isArray(sync.snapshot)?sync.snapshot:[],before=new Map(previous.map(row=>[String(row.id),row])),after=new Map(customers.map(row=>[String(row.id),row]));
    for(const [id,row] of after){
      const old=before.get(id);
      if(!old){queueOp({resource:"customers",action:"create",entityId:id,body:serverCustomerBody(row),idem:`customer-${id}`,label:`مشتری: ${[row.firstName,row.lastName].filter(Boolean).join(" ")||id}`});sync.remoteIds.add(id);saveRemoteIds("customers",sync.remoteIds);}
      else if(JSON.stringify(old)!==JSON.stringify(row)){
        if(!sync.remoteIds.has(id))continue;
        const protectedKeys=["wallet","walletHistory","serviceHistory","debt","balance"];
        const protectedChanged=protectedKeys.some(key=>JSON.stringify(old[key])!==JSON.stringify(row[key]));
        const patch=Object.fromEntries(Object.entries(row).filter(([key,value])=>!protectedKeys.includes(key)&&JSON.stringify(old[key])!==JSON.stringify(value)));
        if(Object.keys(serverCustomerBody(patch)).length)queueOp({resource:"customers",action:"update",entityId:id,body:serverCustomerBody(patch),label:`ویرایش مشتری: ${[row.firstName,row.lastName].filter(Boolean).join(" ")||id}`});
        if(protectedChanged)setCustomerSyncError("کیف پول و سوابق مالی مشتری از طریق فاکتورها همگام می‌شوند؛ تغییر مستقیم آن‌ها روی سرور ارسال نمی‌شود.");
      }
    }
    for(const id of before.keys())if(!after.has(id)&&sync.remoteIds.has(id)){queueOp({resource:"customers",action:"remove",entityId:id,label:"حذف مشتری"});sync.remoteIds.delete(id);saveRemoteIds("customers",sync.remoteIds);}
    sync.snapshot=customers;
  },[customers,remoteCustomersEnabled]);

  // ── Follow-ups / reminders (یادآوری و پیگیری) ──
  const [followText,setFollowText]=useState("");
  const [followDate,setFollowDate]=useState("");
  const [followService,setFollowService]=useState("");
  const [followStatus,setFollowStatus]=useState("");

  const activeCust=customers.find(c=>c.id===activeId)||null;

  const openAdd=()=>{setForm({firstName:"",lastName:"",phone:"",note:"",nationalId:"",birthDate:"",postalCode:"",address:""});setShowAdd(false);setEditMode(false);setView("new");};
  const openEdit=(c)=>{setForm({firstName:c.firstName,lastName:c.lastName,phone:c.phone||"",note:c.note||"",nationalId:c.nationalId||"",birthDate:c.birthDate||"",postalCode:c.postalCode||"",address:c.address||""});setShowAdd(true);setEditMode(true);};
  useEffect(()=>{
    if(pendingAction==="new_customer"){openAdd();clearPendingAction&&clearPendingAction();}
  },[pendingAction]);  
  useEffect(()=>{
    if(!voicePrefill)return;
    setForm({firstName:voicePrefill.firstName||"",lastName:voicePrefill.lastName||"",phone:voicePrefill.phone||"",note:voicePrefill.note||"",nationalId:"",birthDate:"",postalCode:"",address:""});
    setEditMode(false);setShowAdd(false);setView("new");clearVoicePrefill&&clearVoicePrefill();
  },[voicePrefill]);  

  const saveCustomer=()=>{
    const f=form.firstName.trim(),l=form.lastName.trim();
    if(!f&&!l)return;
    if(editMode){
      setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,...form,firstName:f,lastName:l,postalCode:(form.postalCode||"").trim(),address:(form.address||"").trim()}:c));
      logActivity("ویرایش مشتری",`${f} ${l}`.trim());
    } else {
      const nc={id:createId("rec"),firstName:f,lastName:l,phone:form.phone.trim(),note:form.note.trim(),nationalId:(form.nationalId||"").trim(),birthDate:form.birthDate||"",postalCode:(form.postalCode||"").trim(),address:(form.address||"").trim(),files:[]};
      setCustomers(prev=>[...prev,nc]);
      logActivity("افزودن مشتری",`${f} ${l}`.trim());
    }
    setShowAdd(false);
    if(!editMode)setView("list");
  };

  const deleteCustomer=async(id)=>{
    const c=customers.find(c=>c.id===id);
    setDelConfirm(null);
    const nm=c?`${c.firstName} ${c.lastName}`.trim():"";
    const owes=(()=>{try{const a=JSON.parse(localStorage.getItem("cafenet_ledger2")||"[]").find(x=>String(x.customerId)===String(id));return a?(a.entries||[]).reduce((t,e)=>t+(e.category==="بدهکار"?Number(e.amount)||0:-(Number(e.amount)||0)),0):0;}catch{return 0;}})();
    const reason=await askReason({online:true,title:`حذف مشتری «${nm||"—"}»`,desc:owes>0?`⚠️ این مشتری حدود ${fmtM(owes)} مانده حساب دارد.`:"پروندهٔ مشتری و فایل‌های او حذف می‌شود.",presets:["ثبت تکراری","مشتری نامعتبر","درخواست خود مشتری"],danger:true,confirmLabel:"حذف مشتری",icon:"🗑️"});
    if(reason===null)return;
    if(c)wipeCustomerMedia(c);
    setCustomers(prev=>prev.filter(c=>c.id!==id));
    audit({action:"customer_delete",entityType:"مشتری",entityId:id,entityLabel:nm,amount:owes>0?owes:null,reason,before:{wallet:c&&c.wallet||0,balanceDue:owes},details:owes>0?"با مانده حساب باز":""});
    setView("list");
  };

  const handleFileUpload=async(e)=>{
    const files=Array.from(e.target.files||[]);
    e.target.value="";
    if(!files.length)return;
    setUploading(true);
    try{
      const st=vault();
      const owner=customers.find(c=>c.id===activeId);
      let count=(owner&&owner.files||[]).length,total=0;
      try{total=st?await st.totalSize():0;}catch{}
      const added=[];
      for(const file of files){
        const problem=validateUpload(file,{existingCount:count,totalBytes:total});
        if(problem){alert(`${file.name}: ${problem}`);continue;}
        const id=createId("file");
        if(st){
          try{await st.put(id,file,{name:file.name,type:file.type,ownerId:activeId});added.push({id,name:file.name,type:file.type,size:file.size,uploadedAt:todayIso(),stored:"idb"});count++;total+=file.size;continue;}
          catch(err){reportError(err,"privacy",{stage:"vault-put"});}
        }
        // vault unavailable (e.g. private window): fall back to the legacy inline copy; it is moved into the vault on the next start
        added.push({id,name:file.name,type:file.type,size:file.size,uploadedAt:todayIso(),data:await fileToBase64(file)});count++;
      }
      if(added.length)setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,files:[...(c.files||[]),...added]}:c));
    }catch(err){reportError(err,"privacy",{stage:"upload"});}
    setUploading(false);
  };

  const deleteFile=(custId,fileId)=>{
    if(vault())vault().remove(fileId).catch(()=>{});   // secure delete of the bytes, then the metadata
    setCustomers(prev=>prev.map(c=>c.id===custId?{...c,files:(c.files||[]).filter(f=>f.id!==fileId)}:c));
  };

  // ── Wallet ──
  const submitWallet=()=>{
    const amt=Number(walletAmount);
    if(!amt||amt<=0)return;
    setCustomers(prev=>prev.map(c=>{
      if(c.id!==activeId)return c;
      const bal=(c.wallet||0);
      const newBal=walletModal==="charge"?bal+amt:Math.max(0,bal-amt);
      const entry={id:createId("rec"),type:walletModal,amount:amt,note:walletNote.trim(),date:todayIso()};
      return{...c,wallet:newBal,walletHistory:[...(c.walletHistory||[]),entry]};
    }));
    setWalletModal(null);setWalletAmount("");setWalletNote("");
  };

  // ── Auto discount rule ──
  const openDiscountForm=()=>setDiscountForm(activeCust.discountRule||{enabled:false,threshold:10,percent:10});
  const saveDiscountRule=()=>{
    setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,discountRule:discountForm}:c));
    setDiscountForm(null);
  };

  // ── Service history (synced with tariff & category selector) ──
  const addService=()=>{
    const opt=INCOME_CATEGORY_OPTIONS.find(o=>o.value===svcForm.category);
    const name=opt?opt.plainLabel:svcForm.category.trim();
    const amount=Number(svcForm.amount);
    if(!name||!amount)return;
    const entry={id:createId("rec"),name,category:svcForm.category,amount,date:svcForm.date||todayIso()};
    setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,serviceHistory:[...(c.serviceHistory||[]),entry]}:c));
    setSvcForm({category:"",amount:"",date:todayIso()});
  };
  const delService=(svcId)=>{
    setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,serviceHistory:(c.serviceHistory||[]).filter(s=>s.id!==svcId)}:c));
  };

  // ── Documents checklist (مدارک تحویلی) ──
  const addDoc=()=>{
    const name=docName.trim();
    if(!name)return;
    const entry={id:createId("rec"),name,received:false};
    setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,documents:[...(c.documents||[]),entry]}:c));
    setDocName("");
  };
  const toggleDoc=(docId)=>{
    setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,documents:(c.documents||[]).map(d=>d.id===docId?{...d,received:!d.received}:d)}:c));
  };
  const delDoc=(docId)=>{
    setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,documents:(c.documents||[]).filter(d=>d.id!==docId)}:c));
  };
  const addQuickOrder=()=>{
    const title=quickOrderTitle.trim();
    if(!title||!activeId)return;
    setOrders(prev=>[...prev,{id:createId("rec"),customerId:String(activeId),title,notes:"",status:"new",createdAt:todayIso()}]);
    setQuickOrderTitle("");
  };

  // ── Follow-ups / reminders ──
  const addFollowUp=()=>{
    const text=followText.trim();
    if(!text&&!followService.trim())return;
    const entry={id:createId("rec"),text,service:followService.trim(),status:followStatus,dueDate:followDate||"",done:false,createdAt:todayIso()};
    setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,followUps:[...(c.followUps||[]),entry]}:c));
    setFollowText("");setFollowDate("");setFollowService("");setFollowStatus("");
  };
  const toggleFollowUp=(custId,fid)=>{
    setCustomers(prev=>prev.map(c=>c.id===custId?{...c,followUps:(c.followUps||[]).map(f=>f.id===fid?{...f,done:!f.done}:f)}:c));
  };
  const delFollowUp=(fid)=>{
    setCustomers(prev=>prev.map(c=>c.id===activeId?{...c,followUps:(c.followUps||[]).filter(f=>f.id!==fid)}:c));
  };
  const followUpStatus=(dueDate)=>{
    if(!dueDate)return null;
    const today=todayIso();
    if(dueDate<today)return "overdue";
    const soonLimit=new Date(); soonLimit.setDate(soonLimit.getDate()+2);
    if(dueDate<=soonLimit.toISOString().split("T")[0])return "soon";
    return "future";
  };
  // Global pending follow-ups across all customers (for the list-view banner)
  const allPendingFollowUps=customers.flatMap(c=>(c.followUps||[])
    .filter(f=>!f.done)
    .map(f=>({...f,custId:c.id,custName:`${c.firstName} ${c.lastName}`.trim()||"—"}))
  ).sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));

  const clubCfgL=getClubConfig();const clubAggL=clubAggregate();const crmCfgL=getCrmConfig();const crmAggL=crmAggregate();
  const filtered=customers.filter(c=>{
    if(!search)return true;
    return(c.firstName+c.lastName+c.phone).includes(search);
  });
  const customerSyncNotice=remoteCustomersEnabled&&(customerSyncError||legacyCustomerCount>0)?<div style={{background:customerSyncError?"#451a03":"#172554",color:customerSyncError?"#fcd34d":"#bfdbfe",border:"1px solid var(--border)",borderRadius:10,padding:"9px 12px",fontSize:12,lineHeight:1.8,marginBottom:12}}>{customerSyncError||`${toFA(legacyCustomerCount)} مشتری قدیمی هنوز فقط روی این دستگاه است؛ از بخش پشتیبان‌گیری فایل JSON بگیرید و انتقال را طبق راهنمای استقرار انجام دهید.`}</div>:null;

  // ── NEW CUSTOMER VIEW ──
  if(view==="new"){
    return(
      <div>
        {customerSyncNotice}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:700,color:"var(--accent-light)"}}>مشتری جدید</div>
          <button onClick={()=>setView("list")} style={{...BTN("var(--border)","var(--text-primary)"),padding:"8px 14px"}}>بازگشت به مشتریان</button>
        </div>
        <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:14,padding:20,maxWidth:760}}>
          <CustomerForm form={form} setForm={setForm}/>
          <div style={{display:"flex",gap:10,marginTop:18}}>
            <button onClick={saveCustomer} style={{...BTN("#2563eb"),flex:1,padding:11}}>ثبت مشتری</button>
            <button onClick={()=>setView("list")} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>انصراف</button>
          </div>
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if(view==="detail"&&activeCust){
    return(
      <div>
        {customerSyncNotice}
        {(()=>{
          const fin=buildCustomerFinance(activeCust.id,activeCust);
          const ini=((activeCust.firstName||"").trim()[0]||"")+((activeCust.lastName||"").trim()[0]||"");
          const rule=activeCust.discountRule;
          const discOn=rule&&rule.enabled&&(activeCust.serviceHistory||[]).length>=rule.threshold;
          const tag=(txt,bg,fg)=><span style={{background:bg,color:fg,borderRadius:20,padding:"3px 11px",fontSize:11,fontWeight:700}}>{txt}</span>;
          return(<>
            <div style={{marginBottom:12}}><button onClick={()=>setView("list")} style={{...BTN("var(--border)","var(--accent-light)"),padding:"7px 14px",fontSize:13}}>← بازگشت به مشتریان</button></div>
            <div style={{background:"linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2,var(--header-grad-1)))",borderRadius:18,padding:"20px 22px",marginBottom:14,display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}} data-testid="customer-hero">
              <div style={{position:"relative",flexShrink:0}}>
                <div onClick={()=>photoRef.current&&photoRef.current.click()} title="تغییر عکس پروفایل" style={{width:72,height:72,borderRadius:"50%",background:"#ffffff22",border:"2px solid #ffffff55",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:800,color:"#fff",overflow:"hidden",cursor:"pointer"}} data-testid="customer-avatar">
                  {activeCust.photo?<PhotoImg photo={activeCust.photo} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:(ini||"👤")}
                </div>
                <button onClick={()=>photoRef.current&&photoRef.current.click()} title="آپلود عکس" style={{position:"absolute",bottom:-2,left:-2,width:26,height:26,borderRadius:"50%",border:"2px solid var(--bg-app)",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:12,padding:0}}>📷</button>
                {activeCust.photo&&<button onClick={()=>{if(isPhotoRef(activeCust.photo)&&vault())vault().remove(photoRefId(activeCust.photo)).catch(()=>{});setCustomers(prev=>prev.map(x=>x.id===activeCust.id?{...x,photo:""}:x));}} title="حذف عکس" style={{position:"absolute",top:-2,right:-2,width:22,height:22,borderRadius:"50%",border:"2px solid var(--bg-app)",background:"#dc2626",color:"#fff",cursor:"pointer",fontSize:10,padding:0}}>✕</button>}
                <input ref={photoRef} type="file" accept="image/*" style={{display:"none"}} onChange={onPhotoPick}/>
              </div>
              <div style={{flex:"1 1 220px",minWidth:0}}>
                <div style={{fontSize:22,fontWeight:800,color:"#fff"}}>{activeCust.firstName} {activeCust.lastName}</div>
                <div style={{display:"flex",gap:14,marginTop:6,flexWrap:"wrap",fontSize:12,color:"#ffffffcc"}}>
                  {activeCust.phone&&<span>📞 {toFA(activeCust.phone)}<CopyBtn light label="شماره تماس" text={activeCust.phone}/></span>}
                  {activeCust.nationalId&&<span>🪪 {toFA(activeCust.nationalId)}<CopyBtn light label="کد ملی" text={activeCust.nationalId}/></span>}
                  {activeCust.postalCode&&<span>📮 {toFA(activeCust.postalCode)}<CopyBtn light label="کدپستی" text={activeCust.postalCode}/></span>}
                  {activeCust.birthDate&&<span>🎂 {jalaliLabel(activeCust.birthDate)}</span>}
                </div>
                {activeCust.address&&<div style={{marginTop:8,fontSize:12,color:"#ffffffcc",lineHeight:1.8,maxWidth:560}} data-testid="cust-address">📍 {activeCust.address}<CopyBtn light label="آدرس" text={activeCust.address}/></div>}
                <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                  {fin.debt>0?tag(`بدهکار ${fmtCompact(fin.debt)}`,"#450a0a","#fca5a5"):tag("بدون بدهی","#052e16","#86efac")}
                  {fin.visits>=5&&tag("مشتری ثابت","#1e1b4b","#c4b5fd")}
                  {<ClubBadge info={clubInfo(activeCust)}/>}<GoldenBadge st={crmStats(activeCust)}/>
                  {discOn&&tag(`تخفیف ${toFA(rule.percent)}٪ فعال`,"#422006","#fcd34d")}
                  {(activeCust.followUps||[]).some(x=>!x.done)&&tag("پیگیری باز","#431407","#fdba74")}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>setSaleOpen(true)} style={{...BTN("#fff","#4c1d95"),padding:"9px 16px",fontSize:13}}>＋ فروش جدید</button>
                <button onClick={async()=>{const c=activeCust;const t=[`${c.firstName||""} ${c.lastName||""}`.trim(),c.phone?`تلفن: ${c.phone}`:"",c.postalCode?`کدپستی: ${c.postalCode}`:"",c.address?`آدرس: ${c.address}`:""].filter(Boolean).join("\n");await copyText(t);}} title="کپی نام، تلفن، کدپستی و آدرس" style={{...BTN("#ffffff22","#fff"),padding:"9px 14px",fontSize:12}}>📋 کپی مشخصات</button>
                <button onClick={()=>printStatement(false)} style={{...BTN("#ffffff22","#fff"),padding:"9px 14px",fontSize:12}}>🖨️ چاپ / PDF حساب</button>
                <button onClick={()=>openEdit(activeCust)} style={{...BTN("#ffffff22","#fff"),padding:"9px 14px",fontSize:12}}>✏️ ویرایش</button>
                <button onClick={()=>setDelConfirm(activeCust.id)} style={{...BTN("#450a0a","#f87171"),padding:"9px 14px",fontSize:12}}>🗑️</button>
              </div>
            </div>
            <CrmProfile customer={activeCust} onSale={()=>setSaleOpen(true)} onHistory={()=>{setCustTab("history");setTimeout(()=>{const e=document.querySelector('[data-testid="cust-tab-history"]');if(e&&e.scrollIntoView)e.scrollIntoView({behavior:"smooth",block:"center"});},50);}}/>
          </>);
        })()}

        {/* Note */}
        {activeCust.note&&(
          <div style={{background:"var(--header-grad-1)",borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#fff",lineHeight:1.7,whiteSpace:"pre-wrap"}}>
            📝 {activeCust.note}
          </div>
        )}

        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16,borderBottom:"1px solid var(--border)",paddingBottom:10}}>
          {[["history","🕒 تاریخچه کامل"],["chart","📊 نمودار ماهانه"],["club","🏅 باشگاه"],["wallet","👛 کیف پول و تخفیف"],["services","🧾 خدمات"],["docs","📎 مدارک و فایل‌ها"],["follow","📋 سفارش و پیگیری"]].map(([k,l])=>
            <button key={k} data-testid={`cust-tab-${k}`} onClick={()=>setCustTab(k)} style={{...BTN(custTab===k?"#2563eb":"var(--bg-card)",custTab===k?"#fff":"var(--text-secondary)"),padding:"7px 14px",fontSize:12}}>{l}</button>)}
        </div>
        {custTab==="history"&&<CustomerFinancePanel customer={activeCust} full/>}
        {custTab==="chart"&&<CustomerMonthlyChart customerId={activeCust.id}/>}
        {custTab==="club"&&<ClubDetailTab customer={activeCust}/>}

        {custTab==="docs"&&(<>
        {/* Files */}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>📎 فایل‌ها ({toFA((activeCust.files||[]).length)})</div>
            <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{...BTN("#2563eb"),padding:"6px 14px",fontSize:12}}>
              {uploading?"در حال آپلود...":"+ افزودن فایل"}
            </button>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.pdf" multiple onChange={handleFileUpload} style={{display:"none"}}/>
          </div>
          {(activeCust.files||[]).length===0
            ?<div style={{textAlign:"center",padding:"20px 0",color:"var(--text-dim)",fontSize:13}}>📭 هنوز فایلی آپلود نشده · فقط JPG و PDF</div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(activeCust.files||[]).map(f=>(
                <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-app)",borderRadius:8,padding:"10px 14px"}}>
                  <span style={{fontSize:20}}>{f.type==="application/pdf"?"📄":"🖼️"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>{jalaliLabel(f.uploadedAt)} · {toFA(Math.round(f.size/1024))} KB</div>
                  </div>
                  <button data-testid="file-download" onClick={()=>downloadCustomerFile(f).catch(e=>alert(e.message))} style={{...BTN("var(--border)","var(--accent-light)"),padding:"4px 10px",fontSize:11}}>⬇ دانلود</button>
                  <button data-testid="file-preview" onClick={()=>previewCustomerFile(f)} style={{...BTN("var(--header-grad-1)","var(--accent-light)"),padding:"4px 10px",fontSize:11}}>👁 نمایش</button>
                  <button onClick={()=>deleteFile(activeCust.id,f.id)} style={{...BTN("#450a0a","#f87171"),padding:"4px 9px",fontSize:11}}>🗑️</button>
                </div>
              ))}
            </div>
          }
        </div>

        </>)}

        {custTab==="wallet"&&(<>
        {/* Wallet */}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>👛 کیف پول مشتری</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setWalletModal("charge")} style={{...BTN("#16a34a"),padding:"6px 14px",fontSize:12}}>+ شارژ اعتبار</button>
              <button onClick={()=>setWalletModal("use")} disabled={!(activeCust.wallet>0)} style={{...BTN("#7c2d12","#fff"),padding:"6px 14px",fontSize:12,opacity:activeCust.wallet>0?1:0.5}}>− استفاده از اعتبار</button>
            </div>
          </div>
          <div style={{fontSize:24,fontWeight:800,color:(activeCust.wallet||0)>0?"#4ade80":"var(--text-primary)",marginBottom:14}}>{fmtM(activeCust.wallet||0)}</div>
          {(activeCust.walletHistory||[]).length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto"}}>
              {[...(activeCust.walletHistory||[])].reverse().map(h=>(
                <div key={h.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-app)",borderRadius:8,padding:"8px 12px",fontSize:12}}>
                  <div><span style={{color:h.type==="charge"?"#4ade80":"#f87171"}}>{h.type==="charge"?"➕ شارژ":"➖ استفاده"}</span>{h.note&&<span style={{color:"var(--text-muted)"}}> · {h.note}</span>}</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{color:"var(--text-muted)"}}>{jalaliLabel(h.date)}</span>
                    <span style={{fontWeight:700,color:h.type==="charge"?"#4ade80":"#f87171"}}>{h.type==="charge"?"+":"-"}{fmtM(h.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto discount */}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:10}}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>🏷️ تخفیف خودکار</div>
            <button onClick={openDiscountForm} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"6px 14px",fontSize:12}}>⚙️ تنظیم قانون تخفیف</button>
          </div>
          {activeCust.discountRule&&activeCust.discountRule.enabled?(
            (activeCust.serviceHistory||[]).length>=activeCust.discountRule.threshold
              ?<div style={{fontSize:13,color:"#4ade80"}}>🎉 تخفیف {toFA(activeCust.discountRule.percent)}٪ برای این مشتری فعال است (پس از {toFA(activeCust.discountRule.threshold)} خدمت)</div>
              :<div style={{fontSize:13,color:"var(--text-secondary)"}}>تخفیف {toFA(activeCust.discountRule.percent)}٪ تنظیم شده — پس از {toFA(activeCust.discountRule.threshold-(activeCust.serviceHistory||[]).length)} خدمت دیگر فعال می‌شود ({toFA((activeCust.serviceHistory||[]).length)}/{toFA(activeCust.discountRule.threshold)})</div>
          ):(
            <div style={{fontSize:13,color:"var(--text-muted)"}}>قانون تخفیفی برای این مشتری تنظیم نشده</div>
          )}
        </div>

        </>)}

        {custTab==="services"&&(<>
        {/* Service history */}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>🧾 تاریخچه کامل خدمات ({toFA((activeCust.serviceHistory||[]).length)})</div>
          <div style={{background:"var(--bg-app)",borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <div style={{flex:2,minWidth:160}}>
                <SearchableSelect
                  options={INCOME_CATEGORY_OPTIONS}
                  value={svcForm.category}
                  placeholder="جستجوی خدمت (همگام با تعرفه و دسته‌بندی)..."
                  onChange={val=>{
                    const opt=INCOME_CATEGORY_OPTIONS.find(o=>o.value===val);
                    setSvcForm(f=>({...f,category:val,amount: opt&&opt.price>0?String(opt.price):f.amount}));
                  }}
                />
              </div>
              <input value={svcForm.amount} onChange={e=>setSvcForm(f=>({...f,amount:e.target.value}))} type="number" placeholder="مبلغ (ریال)" style={{...INP,marginTop:0,flex:1,minWidth:100}}/>
              <button onClick={addService} style={{...BTN("#2563eb"),flexShrink:0}}>+ ثبت خدمت</button>
            </div>
          </div>
          {(activeCust.serviceHistory||[]).length===0
            ?<Empty text="هنوز خدمتی ثبت نشده" sub="از فرم بالا اضافه کنید"/>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...(activeCust.serviceHistory||[])].map((s,idx)=>{
                const rule=activeCust.discountRule;
                const discounted=rule&&rule.enabled&&(idx+1)>rule.threshold;
                const finalAmt=discounted?s.amount*(1-rule.percent/100):s.amount;
                return(
                  <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-app)",borderRadius:8,padding:"10px 14px"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{s.name}{discounted&&<span style={{marginRight:8,fontSize:10,background:"#166534",color:"#fff",borderRadius:5,padding:"1px 6px"}}>تخفیف {toFA(rule.percent)}٪</span>}</div>
                      <div style={{fontSize:11,color:"var(--text-muted)"}}>{jalaliLabel(s.date)}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{textAlign:"left"}}>
                        {discounted&&<div style={{fontSize:11,color:"var(--text-dim)",textDecoration:"line-through"}}>{fmtM(s.amount)}</div>}
                        <div style={{fontSize:13,fontWeight:700,color:"var(--text-primary)"}}>{fmtM(finalAmt)}</div>
                      </div>
                      <button onClick={()=>delService(s.id)} style={{...BTN("#450a0a","#f87171"),padding:"4px 9px",fontSize:11}}>🗑️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>

        </>)}

        {custTab==="docs"&&(<>
        {/* Documents checklist / مدارک تحویلی */}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>📎 مدارک تحویلی ({toFA((activeCust.documents||[]).filter(d=>d.received).length)}/{toFA((activeCust.documents||[]).length)})</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input value={docName} onChange={e=>setDocName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addDoc()} placeholder="نام مدرک... (مثلاً کپی کارت ملی، عکس پرسنلی)" style={{...INP,marginTop:0,flex:1}}/>
            <button onClick={addDoc} style={{...BTN("#2563eb"),flexShrink:0}}>+ افزودن</button>
          </div>
          {(activeCust.documents||[]).length===0
            ?<Empty text="مدرکی ثبت نشده" sub="از فرم بالا اضافه کنید"/>
            :<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(activeCust.documents||[]).map(d=>(
                <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-app)",borderRadius:8,padding:"9px 14px"}}>
                  <input type="checkbox" checked={d.received} onChange={()=>toggleDoc(d.id)} style={{width:17,height:17,cursor:"pointer",flexShrink:0}}/>
                  <span style={{flex:1,fontSize:13,textDecoration:d.received?"line-through":"none",color:d.received?"var(--text-muted)":"var(--text-primary)"}}>{d.name}</span>
                  <span style={{fontSize:11,color:d.received?"#4ade80":"#f59e0b",fontWeight:600}}>{d.received?"✓ دریافت شد":"⏳ در انتظار"}</span>
                  <button onClick={()=>delDoc(d.id)} style={{...BTN("#450a0a","#f87171"),padding:"4px 9px",fontSize:11,flexShrink:0}}>🗑️</button>
                </div>
              ))}
            </div>
          }
        </div>

        </>)}

        {custTab==="follow"&&(<>
        {/* Orders / وضعیت سفارش (linked to Kanban) */}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}><Icon name="ClipboardList" size={17}/>سفارش‌های این مشتری ({toFA(orders.filter(o=>String(o.customerId)===String(activeId)).length)})</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input value={quickOrderTitle} onChange={e=>setQuickOrderTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addQuickOrder()} placeholder="عنوان سفارش جدید..." style={{...INP,marginTop:0,flex:1}}/>
            <button onClick={addQuickOrder} style={{...BTN("#2563eb"),flexShrink:0}}>+ افزودن</button>
          </div>
          {orders.filter(o=>String(o.customerId)===String(activeId)).length===0
            ?<Empty text="سفارشی برای این مشتری ثبت نشده" sub="از فرم بالا اضافه کنید"/>
            :<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {orders.filter(o=>String(o.customerId)===String(activeId)).map(o=>{
                const st=ORDER_STATUSES.find(s=>s.key===o.status);
                return(
                  <div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-app)",borderRadius:8,padding:"9px 14px"}}>
                    <span style={{fontSize:13}}>{o.title}</span>
                    <span style={{fontSize:11,fontWeight:700,color:"#fff",background:st?st.color:"#64748b",borderRadius:6,padding:"3px 10px"}}>{st?st.label:o.status}</span>
                  </div>
                );
              })}
            </div>
          }
          <div style={{fontSize:11,color:"var(--text-dim)",marginTop:10}}>💡 برای جابه‌جایی بین مراحل (در حال انجام، منتظر مدارک، تکمیل‌شده و...) به تب «سفارش‌ها» بروید.</div>
        </div>

        {/* Follow-ups / یادآوری و پیگیری */}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#fbbf24",marginBottom:14}}>🔔 یادآوری و پیگیری ({toFA((activeCust.followUps||[]).filter(f=>!f.done).length)})</div>
          <div style={{background:"var(--bg-app)",borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-start"}}>
              <input value={followText} onChange={e=>setFollowText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addFollowUp()} placeholder='مثلاً: "فردا برای تکمیل ثبت‌نام مراجعه کند"، "منتظر جواب سامانه است"، "مدرک کم دارد"...' style={{...INP,marginTop:0,flex:2,minWidth:200}}/>
              <div style={{flex:1,minWidth:150}}>
                <JalaliPicker value={followDate} onChange={setFollowDate} placeholder="تاریخ پیگیری (اختیاری)"/>
              </div>
              <button onClick={addFollowUp} style={{...BTN("#f59e0b","#1e1300"),flexShrink:0}}>+ افزودن</button>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
              <input value={followService} onChange={e=>setFollowService(e.target.value)} placeholder="خدمت (مثلاً ثبت‌نام دانشگاه)" style={{...INP,marginTop:0,flex:1,minWidth:170}}/>
              <select value={followStatus} onChange={e=>setFollowStatus(e.target.value)} style={{...INP,marginTop:0,flex:1,minWidth:150}}><option value="">وضعیت (اختیاری)</option>{FU_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
            </div>
          </div>
          {(activeCust.followUps||[]).length===0
            ?<Empty text="یادآوری‌ای ثبت نشده" sub="از فرم بالا اضافه کنید"/>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...(activeCust.followUps||[])].sort((a,b)=>(a.done===b.done?0:a.done?1:-1)).map(f=>{
                const st=followUpStatus(f.dueDate);
                const badge=st==="overdue"?{c:"#f87171",l:"⏰ سررسید گذشته"}:st==="soon"?{c:"#fbbf24",l:"⏰ نزدیک"}:st==="future"?{c:"var(--text-muted)",l:"⏰"}:null;
                return(
                  <div key={f.id} style={{display:"flex",alignItems:"flex-start",gap:10,background:"var(--bg-app)",borderRadius:8,padding:"10px 14px",opacity:f.done?0.55:1}}>
                    <input type="checkbox" checked={f.done} onChange={()=>toggleFollowUp(activeId,f.id)} style={{width:17,height:17,marginTop:2,cursor:"pointer",flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,textDecoration:f.done?"line-through":"none"}}>{f.service&&<b>{f.service}</b>}{f.service&&f.text?" — ":""}{f.text}</div>
                      {f.status&&<div style={{fontSize:11,color:"var(--text-secondary)",marginTop:2}}>وضعیت: {f.status}</div>}
                      <div style={{display:"flex",gap:8,marginTop:4,alignItems:"center",flexWrap:"wrap"}}>
                        {f.dueDate&&badge&&<span style={{fontSize:11,color:badge.c,fontWeight:700}}>{badge.l} {jalaliLabel(f.dueDate)}</span>}
                        <span style={{fontSize:10,color:"var(--text-dim)"}}>ثبت‌شده: {jalaliLabel(f.createdAt)}</span>
                      </div>
                    </div>
                    <button onClick={()=>delFollowUp(f.id)} style={{...BTN("#450a0a","#f87171"),padding:"4px 9px",fontSize:11,flexShrink:0}}>🗑️</button>
                  </div>
                );
              })}
            </div>
          }
        </div>

        </>)}

        {saleOpen&&<SaleWizard initialCustomerId={activeCust.id} onClose={()=>setSaleOpen(false)} onNavigate={onNavigate}/>}

        {/* Wallet modal */}
        {walletModal&&(
          <div style={{position:"relative",background:"transparent",display:"block",padding:"0 0 14px"}}>
            <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:560,boxSizing:"border-box"}}>
              <div style={{fontSize:16,fontWeight:700,marginBottom:18,color:"var(--accent-light)"}}>{walletModal==="charge"?"➕ شارژ اعتبار":"➖ استفاده از اعتبار"}</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>مبلغ (ریال)
                  <input value={walletAmount} onChange={e=>setWalletAmount(e.target.value)} type="number" placeholder="۰" style={INP} autoFocus/>
                </label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>توضیحات (اختیاری)
                  <input value={walletNote} onChange={e=>setWalletNote(e.target.value)} placeholder="مثلاً: شارژ نقدی، بابت خدمت..." style={INP}/>
                </label>
              </div>
              <div style={{display:"flex",gap:10,marginTop:18}}>
                <button onClick={submitWallet} style={{...BTN(walletModal==="charge"?"#16a34a":"#7c2d12"),flex:1,padding:11}}>ثبت</button>
                <button onClick={()=>{setWalletModal(null);setWalletAmount("");setWalletNote("");}} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>انصراف</button>
              </div>
            </div>
          </div>
        )}

        {/* Discount rule modal */}
        {discountForm&&(
          <div style={{position:"relative",background:"transparent",display:"block",padding:"0 0 14px"}}>
            <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:560,boxSizing:"border-box"}}>
              <div style={{fontSize:16,fontWeight:700,marginBottom:18,color:"var(--accent-light)"}}>🏷️ تنظیم قانون تخفیف خودکار</div>
              <label style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:"var(--text-secondary)",marginBottom:16,cursor:"pointer"}}>
                <input type="checkbox" checked={discountForm.enabled} onChange={e=>setDiscountForm(f=>({...f,enabled:e.target.checked}))} style={{width:16,height:16}}/>
                فعال‌سازی تخفیف خودکار برای این مشتری
              </label>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>پس از چند خدمت فعال شود؟
                  <input value={discountForm.threshold} onChange={e=>setDiscountForm(f=>({...f,threshold:Number(e.target.value)||0}))} type="number" style={INP}/>
                </label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>درصد تخفیف
                  <input value={discountForm.percent} onChange={e=>setDiscountForm(f=>({...f,percent:Number(e.target.value)||0}))} type="number" style={INP}/>
                </label>
              </div>
              <div style={{fontSize:11,color:"var(--text-dim)",marginTop:10}}>مثال: با تنظیم «۱۰ خدمت» و «۱۰٪»، از خدمت یازدهم به بعد ۱۰٪ تخفیف روی خدمات ثبت‌شده اعمال می‌شود.</div>
              <div style={{display:"flex",gap:10,marginTop:18}}>
                <button onClick={saveDiscountRule} style={{...BTN("#2563eb"),flex:1,padding:11}}>ذخیره</button>
                <button onClick={()=>setDiscountForm(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>انصراف</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {delConfirm&&(
          <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
            <div style={{background:"var(--bg-card)",borderRadius:16,padding:28,width:320,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:10}}>⚠️</div>
              <div style={{fontWeight:700,marginBottom:6}}>حذف مشتری</div>
              <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:18}}>اطلاعات و فایل‌های این مشتری حذف می‌شوند.</div>
              <div style={{display:"flex",gap:10}}><button onClick={()=>deleteCustomer(delConfirm)} style={{...BTN("#dc2626"),flex:1}}>حذف</button><button onClick={()=>setDelConfirm(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button></div>
            </div>
          </div>
        )}

        {/* Edit modal */}
        {showAdd&&(
          <div style={{position:"relative",background:"transparent",display:"block",padding:"0 0 14px"}}>
            <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:640,boxSizing:"border-box"}}>
              <div style={{fontSize:16,fontWeight:700,marginBottom:18,color:"var(--accent-light)"}}>✏️ ویرایش مشتری</div>
              <CustomerForm form={form} setForm={setForm}/>
              <div style={{display:"flex",gap:10,marginTop:18}}>
                <button onClick={saveCustomer} style={{...BTN("#2563eb"),flex:1,padding:11}}>ذخیره</button>
                <button onClick={()=>setShowAdd(false)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>انصراف</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LIST VIEW ──
  return(
    <div>
      {customerSyncNotice}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[["people",`👥 مشتریان (${toFA(customers.length)})`],["followups","🔔 پیگیری مشتریان"],["club","🏅 باشگاه مشتریان"],["golden","⭐ مشتریان طلایی"],["sms","📩 پیامک"]].map(([k,l])=><button key={k} onClick={()=>setListMode(k)} data-testid={`mode-${k}`} style={{...BTN(listMode===k?"#2563eb":"var(--bg-card)",listMode===k?"#fff":"var(--text-secondary)"),padding:"8px 14px",fontSize:13}}>{l}</button>)}
        </div>
        <button onClick={openAdd} style={BTN("#2563eb")}>+ مشتری جدید</button>
      </div>

      {listMode==="followups"?<FollowUpsSection/>:listMode==="club"?<ClubOverview customers={customers} onOpen={(id)=>{setActiveId(id);setCustTab("club");setView("detail");}}/>:listMode==="sms"?<SmsCustomersPage customers={customers}/>:listMode==="golden"?<GoldenOverview customers={customers} onOpen={(id)=>{setActiveId(id);setCustTab("history");setView("detail");}}/>:<>

      {allPendingFollowUps.length>0&&(
        <div style={{background:"#1e2a0a",border:"1px solid #a3a30a44",borderRadius:12,padding:"14px 18px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <span style={{fontSize:22}}>🔔</span>
            <div style={{fontSize:14,fontWeight:700,color:"#fbbf24"}}>یادآوری و پیگیری ({toFA(allPendingFollowUps.length)})</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {allPendingFollowUps.map(f=>{
              const st=followUpStatus(f.dueDate);
              return(
                <div key={f.id} onClick={()=>{setActiveId(f.custId);setView("detail");}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-app)",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",gap:10}}>
                  <div><b style={{color:"var(--text-primary)"}}>{f.custName}</b><span style={{color:"var(--text-muted)"}}> · {f.text}</span></div>
                  {f.dueDate&&<span style={{color:st==="overdue"?"#f87171":st==="soon"?"#fbbf24":"var(--text-muted)",fontWeight:700,whiteSpace:"nowrap"}}>{st==="overdue"?"⏰ گذشته":st==="soon"?"⏰ نزدیک":""} {jalaliLabel(f.dueDate)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{position:"relative",marginBottom:16}}>
        <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"var(--text-muted)"}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جستجو بر اساس نام یا تلفن..." style={{...INP,marginTop:0,paddingRight:38}}/>
      </div>

      {filtered.length===0
        ?<Empty text={search?"نتیجه‌ای یافت نشد":"هنوز مشتری‌ای ثبت نشده"} sub={search?"جستجو را تغییر دهید":"از دکمه «مشتری جدید» اضافه کنید"}/>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))",gap:12}}>
          {filtered.map(c=>{
            const custOrders=orders.filter(o=>String(o.customerId)===String(c.id));
            const activeOrder=custOrders.find(o=>o.status!=="delivered");
            const activeOrderSt=activeOrder?ORDER_STATUSES.find(s=>s.key===activeOrder.status):null;
            const pendingFollowCount=(c.followUps||[]).filter(f=>!f.done).length;
            const clubBadgeFor=(c)=>{const i=clubInfo(c,clubCfgL,clubAggL);return i.count>0?<ClubBadge info={i} small/>:null;};
            return(
              <div key={c.id} onClick={()=>{setActiveId(c.id);setView("detail");}} style={{background:"var(--bg-card)",borderRadius:14,padding:16,cursor:"pointer",borderTop:"3px solid #2563eb",transition:"transform .15s, background .15s",display:"flex",flexDirection:"column",gap:10}}
                onMouseEnter={e=>{e.currentTarget.style.background="#243447";e.currentTarget.style.transform="translateY(-2px)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="var(--bg-card)";e.currentTarget.style.transform="translateY(0)";}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <CustomerAvatar c={c}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.firstName} {c.lastName}</div>
                    {c.phone&&<div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>📞 {c.phone}</div>}
                  </div>
                </div>

                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {clubBadgeFor(c)}{(()=>{const g=crmStats(c,crmAggL,crmCfgL,clubCfgL,clubAggL);return g.golden?<GoldenBadge st={g} small/>:null;})()}
                  {(c.wallet||0)>0&&<span style={{fontSize:10,background:"#052e16",color:"#4ade80",borderRadius:6,padding:"2px 8px",fontWeight:600}}>👛 {fmtM(c.wallet)}</span>}
                  {activeOrderSt&&<span style={{fontSize:10,background:activeOrderSt.color,color:"#fff",borderRadius:6,padding:"2px 8px",fontWeight:600}}>📋 {activeOrderSt.label}</span>}
                  {pendingFollowCount>0&&<span style={{fontSize:10,background:"#78350f",color:"#fbbf24",borderRadius:6,padding:"2px 8px",fontWeight:600}}>🔔 {toFA(pendingFollowCount)}</span>}
                  {(c.files||[]).length>0&&<span style={{fontSize:10,background:"var(--bg-app)",color:"var(--text-muted)",borderRadius:6,padding:"2px 8px"}}>📎 {toFA((c.files||[]).length)}</span>}
                  {c.note&&<span style={{fontSize:10,background:"var(--bg-app)",color:"var(--text-muted)",borderRadius:6,padding:"2px 8px"}}>📝</span>}
                </div>

                <div style={{fontSize:11,color:"var(--accent-light)",marginTop:"auto",textAlign:"left"}}>مشاهده ←</div>
              </div>
            );
          })}
        </div>
      }
      </>}

      {/* Add modal */}
      {showAdd&&(
        <div style={{position:"relative",background:"transparent",display:"block",padding:"0 0 14px"}}>
          <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:640,boxSizing:"border-box"}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:18,color:"var(--accent-light)"}}>👤 مشتری جدید</div>
            <CustomerForm form={form} setForm={setForm}/>
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button onClick={saveCustomer} style={{...BTN("#2563eb"),flex:1,padding:11}}>ذخیره</button>
              <button onClick={()=>setShowAdd(false)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>انصراف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerForm({form,setForm}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:13}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <label style={{fontSize:13,color:"var(--text-secondary)"}}>نام
          <input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="نام..." style={INP}/>
        </label>
        <label style={{fontSize:13,color:"var(--text-secondary)"}}>نام خانوادگی
          <input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="نام خانوادگی..." style={INP}/>
        </label>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <label style={{fontSize:13,color:"var(--text-secondary)"}}>کد ملی
          <input value={form.nationalId||""} onChange={e=>setForm(f=>({...f,nationalId:e.target.value.replace(/[^0-9]/g,"").slice(0,10)}))} placeholder="۰۰۱۲۳۴۵۶۷۸" style={INP}/>
        </label>
        <label style={{fontSize:13,color:"var(--text-secondary)"}}>تاریخ تولد (اختیاری)
          <JalaliPicker value={form.birthDate||""} onChange={d=>setForm(f=>({...f,birthDate:d}))} placeholder="انتخاب تاریخ تولد"/>
        </label>
      </div>
      <label style={{fontSize:13,color:"var(--text-secondary)"}}>شماره تماس
        <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="۰۹۱۲..." style={INP}/>
      </label>
      <label style={{fontSize:13,color:"var(--text-secondary)"}}>کدپستی (اختیاری)
        <input value={form.postalCode||""} onChange={e=>setForm(f=>({...f,postalCode:faDigitsToEn(e.target.value).replace(/[^0-9]/g,"").slice(0,10)}))} inputMode="numeric" placeholder="۱۰ رقم" style={INP} data-testid="f-postal"/>
      </label>
      <label style={{fontSize:13,color:"var(--text-secondary)"}}>آدرس (اختیاری)
        <textarea value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} rows={3} placeholder="استان، شهر، خیابان، پلاک، واحد..." style={{...INP,resize:"vertical",lineHeight:1.8}} data-testid="f-address"/>
      </label>
      <label style={{fontSize:13,color:"var(--text-secondary)"}}>یادداشت
        <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="توضیحات، سوابق، نکات مهم..." rows={4} style={{...INP,resize:"vertical",lineHeight:1.7}}/>
      </label>
    </div>
  );
}
