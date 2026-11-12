// Generated from App.jsx by the module split (v1.50.0). Section: printScan
import React, { useState, useEffect, useRef } from "react";
import { fmtM, toFA } from "../core/format.js";
import { isoToJKey, jalaliLabel } from "../domain/backup.js";
import { BTN, DEFAULT_PRINT_COSTS, INP, PRINT_TARIFF_CAT } from "../core/constants.js";
import { SearchableSelect } from "../components/controls.jsx";
import { useCustomers } from "./customers.jsx";
import { isoDaysAgo } from "./dashboard.jsx";
import { useInventory } from "./inventory.jsx";
import { useInvoices } from "../domain/invoiceData.js";
import { todayIso } from "../core/jalali.js";
import { fmtQty, getRecipes, recipeUsageList } from "../domain/recipes.jsx";
import { PAY_METHODS, createId, createSale, getSale, lsWrite, payLabel, saleRemaining, useDataSync } from "../domain/sales.jsx";
import { getDevices, recordJob } from "../../devices/printCenter.js";
import { deriveTariffPriceMap, useTariffData } from "./tariff.jsx";
import { getVoided } from "../domain/voids.jsx";


// ══════════════════════════════════════════════════════════════════
// ORDERS KANBAN BOARD (سفارش‌ها) — mini CRM
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// PRINT & SCAN SECTION (پرینت و اسکن حرفه‌ای) — page-level cost breakdown,
// linked to Customers (service history) and Invoices (auto line-item)
// ══════════════════════════════════════════════════════════════════
export function PrintScanSection({transactions,setTransactions}){
  const [customers,setCustomers]=useCustomers();
  const [invoices,setInvoices]=useInvoices();
  const [costs,setCosts]=usePrintCosts();
  const [tariffData]=useTariffData();
  const [showCostSettings,setShowCostSettings]=useState(false);

  const [jobType,setJobType]=useState("print"); // print | copy | scan
  const [color,setColor]=useState(false);
  const [size,setSize]=useState("A4");
  const [qty,setQty]=useState("1");
  const [customerId,setCustomerId]=useState("");
  const [unitPrice,setUnitPrice]=useState(String(suggestPrintUnitPrice(tariffData,"print",false,"A4")||""));
  const [msg,setMsg]=useState(null);
  useEffect(()=>{if(!msg)return;const t=setTimeout(()=>setMsg(null),9000);return()=>clearTimeout(t);},[msg]);

  const custOptions=[{value:"",label:"👤 بدون مشتری (نقدی)",group:null},...customers.map(c=>({value:String(c.id),label:`${c.firstName} ${c.lastName}`.trim()+(c.phone?` · ${c.phone}`:""),group:null}))];

  const applyAutoPrice=(jt,col,sz)=>{
    const p=suggestPrintUnitPrice(tariffData,jt,col,sz);
    setUnitPrice(p!=null?String(p):"");
  };

  const n=(v)=>Number(v)||0;
  const count=n(qty);
  const mult=PRINT_SIZE_MULT[size]||1;
  const jobLabel=jobType==="print"?"پرینت":jobType==="copy"?"کپی":"اسکن";
  const descText=`${jobLabel} ${color?"رنگی":"سیاه‌وسفید"} ${size} — ${toFA(count)} برگ`;
  // consumables defined in the warehouse for this job (most specific recipe name wins)
  const [inventory]=useInventory();
  const [payMethod,setPayMethod]=useState("cash");
  const [deviceId,setDeviceId]=useState("");
  const [,setDevTick]=useState(0);
  useDataSync(()=>setDevTick(t=>t+1));
  const devList=getDevices().filter(d=>!d.archived&&d.kind===(jobType==="scan"?"scanner":"printer"));
  const recipeKeys=[`${jobLabel} ${color?"رنگی":"سیاه‌وسفید"} ${size}`,`${jobLabel} ${size}`,`${jobLabel} ${color?"رنگی":"سیاه‌وسفید"}`,jobLabel];
  const incomeCat=jobType==="scan"?"اسکن":"پرینت و کپی";
  const usage=recipeUsageList({recipeKeys,category:incomeCat,desc:descText},count,getRecipes(),inventory);
  const hasRecipe=usage.length>0;
  const recipeCost=usage.reduce((a,u)=>a+(Number(u.item.unitCost)||0)*u.qty,0);
  const paperCost=costs.paperPerPage*mult*count;
  const inkCost=(color?costs.inkColorPerPage:costs.inkBWPerPage)*mult*count;
  const serviceCost=costs.servicePerPage*mult*count;
  const totalCost=hasRecipe?recipeCost+serviceCost:paperCost+inkCost+serviceCost;
  const totalCharge=n(unitPrice)*count;
  const profit=totalCharge-totalCost;


  const resetForm=()=>{setQty("1");};

  const registerAsIncome=()=>{
    if(count<=0||totalCharge<=0)return;
    const method=(!customerId&&(payMethod==="credit"||payMethod==="wallet"))?"cash":payMethod;
    const r=createSale({
      customerId:customerId||null,walkIn:!customerId,skipOrder:true,
      items:[{desc:descText,qty:count,price:n(unitPrice),category:incomeCat,recipeKeys,cost:hasRecipe?serviceCost:totalCost}],
      payments:[{method,amount:totalCharge}],
    });
    if(!r.ok){setMsg({type:"error",text:r.error||"ثبت انجام نشد"});return;}
    // همین کار در «مرکز چاپ و اسکن» هم شمرده می‌شود (کنتور و گزارش روزانه/ماهانه)؛ فروش دوباره ثبت نمی‌شود
    try{recordJob({kind:jobType,deviceId:deviceId||undefined,customerId:customerId||undefined,requested:count,color,size,unitPrice:n(unitPrice),source:"manual",saleRef:{id:r.sale.id,number:r.sale.number,amount:totalCharge}});}catch{}
    const extra=(r.warnings||[]).map(w=>"⚠️ "+w).join(" — ");
    setMsg({type:"success",text:`✓ فروش ثبت شد (فاکتور #${toFA(r.sale.number)}) — درآمد، هزینه${hasRecipe?"، کسر از انبار":""}${customerId?" و تاریخچه مشتری":""} به‌روز شد.${extra?" "+extra:""}`});
    resetForm();
  };

  const addToCustomerInvoice=()=>{
    if(!customerId||count<=0||totalCharge<=0)return;
    const c=customers.find(c=>String(c.id)===String(customerId));
    if(!c)return;
    const newItem={id:createId("rec"),desc:descText,qty:count,unit:"برگ",price:n(unitPrice)};
    setInvoices(prev=>{
      const draftIdx=prev.findIndex(iv=>String(iv.customerId)===String(customerId)&&iv.status==="draft");
      if(draftIdx>=0){
        const updated=[...prev];
        updated[draftIdx]={...updated[draftIdx],items:[...updated[draftIdx].items.filter(it=>it.desc||it.price),newItem]};
        return updated;
      }
      const inv={
        number:nextInvNum(prev),
        date:todayIso(),
        customerId,
        customerName:`${c.firstName} ${c.lastName}`.trim(),
        customerPhone:c.phone||"",
        customerAddress:"",
        items:[newItem],
        tax:0,discount:0,note:"",status:"draft",
        id:createId("rec"),createdAt:todayIso(),
      };
      return [inv,...prev];
    });
    setMsg({type:"success",text:"✓ به فاکتور پیش‌نویس این مشتری اضافه شد — برای مشاهده به تب «فاکتور» بروید"});
    resetForm();
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>🖨️ پرینت و اسکن</div>
        <button onClick={()=>setShowCostSettings(s=>!s)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"6px 14px",fontSize:12}}>⚙️ تنظیم هزینه‌های تمام‌شده</button>
      </div>

      {showCostSettings&&(
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"var(--text-secondary)"}}>هزینه تمام‌شده به ازای هر برگ A4 (ریال) — برای اندازه‌های دیگر خودکار ضرب می‌شود (A5×۰.۶ ، A3×۲)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            <label style={{fontSize:12,color:"var(--text-muted)"}}>💵 هزینه کاغذ
              <input type="number" value={costs.paperPerPage} onChange={e=>setCosts(c=>({...c,paperPerPage:Number(e.target.value)||0}))} style={INP}/>
            </label>
            <label style={{fontSize:12,color:"var(--text-muted)"}}>⚫ هزینه جوهر/تونر سیاه‌وسفید
              <input type="number" value={costs.inkBWPerPage} onChange={e=>setCosts(c=>({...c,inkBWPerPage:Number(e.target.value)||0}))} style={INP}/>
            </label>
            <label style={{fontSize:12,color:"var(--text-muted)"}}>🌈 هزینه جوهر/تونر رنگی
              <input type="number" value={costs.inkColorPerPage} onChange={e=>setCosts(c=>({...c,inkColorPerPage:Number(e.target.value)||0}))} style={INP}/>
            </label>
            <label style={{fontSize:12,color:"var(--text-muted)"}}>🔧 هزینه سرویس دستگاه (استهلاک)
              <input type="number" value={costs.servicePerPage} onChange={e=>setCosts(c=>({...c,servicePerPage:Number(e.target.value)||0}))} style={INP}/>
            </label>
          </div>
        </div>
      )}

      <div style={{background:"var(--bg-card)",borderRadius:12,padding:20,marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
          {[["print","🖨️ پرینت"],["copy","📑 کپی"],["scan","📠 اسکن"]].map(([key,label])=>(
            <button key={key} onClick={()=>{setJobType(key);setDeviceId("");applyAutoPrice(key,color,size);}} style={BTN(jobType===key?"#2563eb":"var(--bg-app)",jobType===key?"#fff":"var(--text-secondary)")}>{label}</button>
          ))}
        </div>

        {jobType!=="scan"&&(
          <div style={{display:"flex",gap:10,marginBottom:14}}>
            <button onClick={()=>{setColor(false);applyAutoPrice(jobType,false,size);}} style={{...BTN(!color?"#334155":"var(--bg-app)",!color?"#fff":"var(--text-secondary)"),flex:1}}>⚫ سیاه‌وسفید</button>
            <button onClick={()=>{setColor(true);applyAutoPrice(jobType,true,size);}} style={{...BTN(color?"#7c3aed":"var(--bg-app)",color?"#fff":"var(--text-secondary)"),flex:1}}>🌈 رنگی</button>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <label style={{fontSize:13,color:"var(--text-secondary)"}}>اندازه کاغذ
            <select value={size} onChange={e=>{setSize(e.target.value);applyAutoPrice(jobType,color,e.target.value);}} style={INP}>
              <option value="A4">A4</option>
              <option value="A5">A5</option>
              <option value="A3">A3</option>
            </select>
          </label>
          <label style={{fontSize:13,color:"var(--text-secondary)"}}>تعداد برگ
            <input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} style={INP}/>
          </label>
        </div>

        {devList.length>0&&<label style={{fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:14}}>{jobType==="scan"?"اسکنر":"پرینتر"} (برای کنتور و گزارش)
          <select data-testid="qs-device" value={deviceId} onChange={e=>setDeviceId(e.target.value)} style={INP}>
            <option value="">— بدون انتخاب دستگاه —</option>
            {devList.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>}
        <label style={{fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:14}}>مشتری (اختیاری)
          <SearchableSelect options={custOptions} value={customerId} placeholder="جستجوی مشتری یا نقدی..." onChange={setCustomerId}/>
        </label>

        <label style={{fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:16}}>قیمت واحد هر برگ (ریال) {suggestPrintUnitPrice(tariffData,jobType,color,size)==null&&<span style={{color:"#f59e0b"}}>— برای این ترکیب تعرفه پایه ندارد، دستی وارد کنید</span>}
          <input type="number" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} style={INP}/>
        </label>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:6}}>روش پرداخت</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {PAY_METHODS.filter(m=>["cash","pos","transfer"].includes(m.key)||(customerId&&["wallet","credit"].includes(m.key))).map(m=>
              <button key={m.key} onClick={()=>setPayMethod(m.key)} style={{...BTN(payMethod===m.key?"#2563eb":"var(--bg-app)",payMethod===m.key?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12}}>{m.icon} {m.label}</button>)}
          </div>
        </div>
        {hasRecipe&&<div style={{background:"#052e16",border:"1px solid #16a34a44",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#4ade80",marginBottom:14,lineHeight:1.8}}>🧪 کسر خودکار از انبار: {usage.map(u=>`${fmtQty(u.qty)} ${u.item.unit} ${u.item.name}${Number(u.item.qty)<u.qty?" (موجودی کافی نیست!)":""}`).join("، ")}</div>}

        {/* Cost breakdown */}
        <div style={{background:"var(--bg-app)",borderRadius:10,padding:16,marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text-secondary)",marginBottom:10}}>💡 محاسبه هزینه تمام‌شده و سود</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,fontSize:12,marginBottom:10}}>
            {hasRecipe
              ?<div style={{color:"var(--text-muted)",gridColumn:"1 / -1"}}>🧪 هزینه مصرف انبار (کاغذ، تونر...): <b style={{color:"var(--text-primary)"}}>{fmtM(Math.round(recipeCost))}</b></div>
              :<><div style={{color:"var(--text-muted)"}}>💵 هزینه کاغذ: <b style={{color:"var(--text-primary)"}}>{fmtM(paperCost)}</b></div>
              <div style={{color:"var(--text-muted)"}}>{color?"🌈":"⚫"} هزینه جوهر/تونر: <b style={{color:"var(--text-primary)"}}>{fmtM(inkCost)}</b></div></>}
            <div style={{color:"var(--text-muted)"}}>🔧 هزینه سرویس دستگاه: <b style={{color:"var(--text-primary)"}}>{fmtM(serviceCost)}</b></div>
            <div style={{color:"var(--text-muted)"}}>📦 جمع هزینه تمام‌شده: <b style={{color:"#f87171"}}>{fmtM(totalCost)}</b></div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:"1px solid var(--border)"}}>
            <div style={{fontSize:13}}>مبلغ دریافتی از مشتری: <b>{fmtM(totalCharge)}</b></div>
            <div style={{fontSize:14,fontWeight:700,color:profit>=0?"#4ade80":"#f87171"}}>{profit>=0?"سود":"ضرر"}: {fmtM(Math.abs(profit))}</div>
          </div>
        </div>

        {msg&&<div style={{marginBottom:14,background:msg.type==="error"?"#2d0a0a":"#052e16",border:`1px solid ${msg.type==="error"?"#dc262666":"#16a34a44"}`,borderRadius:8,padding:"10px 14px",fontSize:12,lineHeight:1.9,color:msg.type==="error"?"#f87171":"#4ade80"}}>{msg.text}</div>}

        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button onClick={registerAsIncome} style={{...BTN("#16a34a"),flex:1,padding:12,minWidth:180}}>💰 ثبت فروش (فاکتور + درآمد + انبار)</button>
          <button onClick={addToCustomerInvoice} disabled={!customerId} style={{...BTN("#2563eb"),flex:1,padding:12,minWidth:180,opacity:customerId?1:0.4}}>🧾 افزودن به فاکتور مشتری</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PRINT & SCAN (پرینت و اسکن حرفه‌ای) — cost breakdown settings
// ══════════════════════════════════════════════════════════════════
const PRINT_COSTS_KEY="cafenet_print_costs";

const PRINT_SIZE_MULT={A4:1,A5:0.6,A3:2};

export function usePrintCosts(){
  const [costs,setCosts]=useState(()=>{try{return JSON.parse(localStorage.getItem(PRINT_COSTS_KEY)||"null")||DEFAULT_PRINT_COSTS;}catch{return DEFAULT_PRINT_COSTS;}});
  useEffect(()=>{lsWrite(PRINT_COSTS_KEY,costs);},[costs]);
  return [costs,setCosts];
}

export function suggestPrintUnitPrice(tariffData,jobType,color,size){
  const priceMap=deriveTariffPriceMap(tariffData);
  const lookup=(name)=>{
    const v=priceMap[PRINT_TARIFF_CAT+" > "+name];
    return v>0?v:null;
  };
  if(jobType==="scan"){
    if(size==="A3")return lookup("اسکن سیاه‌وسفید یا رنگی A4")!=null?238000:null; // A3 rate is noted, not a separate line item
    return lookup("اسکن سیاه‌وسفید یا رنگی A4");
  }
  // print or copy share the same physical output pricing in the tariff sheet
  if(!color){
    if(size==="A4")return lookup("پرینت لیزری سیاه‌وسفید A4");
    if(size==="A5")return lookup("پرینت لیزری سیاه‌وسفید A5");
    if(size==="A3")return lookup("پرینت لیزری سیاه‌وسفید A3");
  }else{
    if(size==="A4")return lookup("پرینت رنگی متن A4");
  }
  return null; // no direct tariff match — user enters manually
}

// Next invoice number
export function nextInvNum(invoices){
  const voidedNums=getVoided().filter(v=>v.number!=null).map(v=>parseInt(v.number,10)).filter(n=>!isNaN(n));
  if(!invoices.length&&!voidedNums.length) return "0001";
  const nums=[...invoices.map(iv=>parseInt(iv.number||"0",10)).filter(n=>!isNaN(n)),...voidedNums];
  return String(Math.max(0,...nums)+1).padStart(4,"0");
}

const C128="11011001100,11001101100,11001100110,10010011000,10010001100,10001001100,10011001000,10011000100,10001100100,11001001000,11001000100,11000100100,10110011100,10011011100,10011001110,10111001100,10011101100,10011100110,11001110010,11001011100,11001001110,11011100100,11001110100,11101101110,11101001100,11100101100,11100100110,11101100100,11100110100,11100110010,11011011000,11011000110,11000110110,10100011000,10001011000,10001000110,10110001000,10001101000,10001100010,11010001000,11000101000,11000100010,10110111000,10110001110,10001101110,10111011000,10111000110,10001110110,11101110110,11010001110,11000101110,11011101000,11011100010,11011101110,11101011000,11101000110,11100010110,11101101000,11101100010,11100011010,11101111010,11001000010,11110001010,10100110000,10100001100,10010110000,10010000110,10000101100,10000100110,10110010000,10110000100,10011010000,10011000010,10000110100,10000110010,11000010010,11001010000,11110111010,11000010100,10001111010,10100111100,10010111100,10010011110,10111100100,10011110100,10011110010,11110100100,11110010100,11110010010,11011011110,11011110110,11110110110,10101111000,10100011110,10001011110,10111101000,10111100010,11110101000,11110100010,10111011110,10111101110,11101011110,11110101110,11010000100,11010010000,11010011100".split(",");
const C128_STOP="11000111010";

// Code128-B barcode → inline SVG string (works on screen and in print windows)
export function code128Svg(text,{height=46,module=1.6}={}){
  const str=String(text==null?"":text).replace(/[^\x20-\x7e]/g,"");
  if(!str)return "";
  const vals=[104,...[...str].map(c=>c.charCodeAt(0)-32)];
  const sum=vals.reduce((s,v,i)=>s+(i===0?v:v*i),0)%103;
  vals.push(sum);
  const bits=vals.map(v=>C128[v]).join("")+C128_STOP+"11";
  const quiet=10;let x=quiet*module,rects="",i=0;
  while(i<bits.length){
    if(bits[i]==="1"){let j=i;while(j<bits.length&&bits[j]==="1")j++;rects+=`<rect x="${x}" y="0" width="${(j-i)*module}" height="${height}"/>`;x+=(j-i)*module;i=j;}
    else{x+=module;i++;}
  }
  const w=(bits.length+quiet*2)*module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${height}" width="${Math.round(w)}" height="${height}" fill="#000" shape-rendering="crispEdges">${rects}</svg>`;
}

export function invBarcodeValue(iv){const v=String(iv.number==null?"":iv.number).replace(/[^\x20-\x7e]/g,"");return /^\d+$/.test(v)?v.padStart(6,"0"):v;}

export function digitsOnly(v){return String(v||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g,"");}

// Payment / debt facts for one invoice (works for sale-linked and manually created invoices)
export function invoicePayInfo(iv){
  const total=Number(iv.totalAmount)||0;
  const sl=iv.saleId?getSale(iv.saleId):null;
  const by={};
  let paid=0,remaining=0;
  if(sl){
    (sl.payments||[]).filter(p=>p.method!=="free").forEach(p=>{by[p.method]=(by[p.method]||0)+(Number(p.amount)||0);paid+=Number(p.amount)||0;});
    remaining=saleRemaining(sl);
  }else if(iv.status==="paid"){by.other=total;paid=total;}
  else if(iv.status==="unpaid"||iv.status==="partial"){
    const rows=Array.isArray(iv.payments)?iv.payments:[];
    rows.filter(p=>p.method!=="free").forEach(p=>{const method=p.method||"other";by[method]=(by[method]||0)+(Number(p.amount)||0);});
    paid=Number(iv.paidAmount)||rows.filter(p=>p.method!=="free").reduce((s,p)=>s+(Number(p.amount)||0),0);
    if(!rows.length&&paid>0)by.other=paid;
    remaining=Math.max(0,total-paid-(Number(iv.waivedAmount)||0));
  }
  return{total,by,paid,remaining};
}

export function invoiceDashData(invoices,period){
  const today=todayIso(),from=period==="7"?isoDaysAgo(6):"";
  const cm=isoToJKey(today,"monthly");
  const inP=(d)=>period==="today"?d===today:period==="7"?d>=from:period==="month"?isoToJKey(d,"monthly")===cm:true;
  const list=invoices.filter(iv=>iv.status!=="draft"&&inP(iv.date||""));
  const by={};let sales=0,debt=0;
  list.forEach(iv=>{const i=invoicePayInfo(iv);sales+=i.total;debt+=i.remaining;Object.entries(i.by).forEach(([k,v])=>{by[k]=(by[k]||0)+v;});});
  return{list,sales,count:list.length,by,debt};
}

export function invoiceExportSections(list){
  const pm=(i)=>Object.entries(i.by).map(([k,v])=>`${payLabel(k)}: ${Math.round(v)}`).join(" | ");
  return[
    {name:"فهرست فاکتورها",head:["شماره","تاریخ","مشتری","تلفن","تعداد قلم","جمع کل (ریال)","پرداخت‌شده (ریال)","مانده (ریال)","وضعیت","روش‌های پرداخت"],
      rows:list.map(iv=>{const i=invoicePayInfo(iv);return[iv.number,jalaliLabel(iv.date),iv.customerName||"—",iv.customerPhone||"",(iv.items||[]).length,i.total,i.paid,i.remaining,i.remaining>0?"بدهکار":iv.status==="paid"?"پرداخت شده":iv.status==="draft"?"پیش‌نویس":"پرداخت شده",pm(i)||"—"];}),money:[5,6,7]},
    {name:"اقلام فاکتورها",head:["شماره","مشتری","شرح","تعداد","واحد","قیمت واحد (ریال)","جمع (ریال)"],
      rows:list.flatMap(iv=>(iv.items||[]).map(it=>[iv.number,iv.customerName||"—",it.desc||"—",Number(it.qty)||0,it.unit||"",Number(it.price)||0,(Number(it.qty)||0)*(Number(it.price)||0)])),money:[5,6]},
  ];
}
