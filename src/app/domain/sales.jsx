// Generated from App.jsx by the module split (v1.50.0). Section: sales
import React, { useState, useEffect, useRef } from "react";
import { readJsonValue, readJsonResult, writeJsonValue } from "../../data/localRepository.js";
import { settleSale, calculateSaleProfit } from "../../domain/saleSettlement.js";
import { getApiConfig, saveApiConfig, isApiConnected, apiResources, apiRequest } from "../../services/api/client.js";
import { serverGrant } from "../../services/auth/session.js";
import { queueOp, syncQueue, startAutoSync, getSyncConfig, mappers as syncMappers } from "../../sync/index.js";
import { runTransaction, afterCommit, inTransaction, recordBeforeWrite } from "../../data/transaction.js";
import { reportError } from "../../diagnostics/index.js";
import { logActivity } from "../core/activity.js";
import { audit } from "../../audit/auditTrail.js";
import { fmtM, toFA } from "../core/format.js";
import { syncClubRewards } from "./club.js";
import { COST_CATEGORY, ONLINE_FEE_CAT, ONLINE_SHIP_CAT, ONLINE_STATUSES, CUSTOMERS_STORAGE_KEY, DEFAULT_INVENTORY, INV_STORAGE, INV_STORAGE_KEY, LEDGER_STORAGE, ORDERS_STORAGE_KEY, ORDER_STATUSES, PAYMENT_ACCOUNTS_KEY, TOPUP_CAT, TX_KEY, isRealCashTx, txMethod } from "../core/constants.js";
import { currentActor } from "../core/identity.js";
import { normalizeOnline } from "./onlineSales.js";
import { todayIso } from "../core/jalali.js";
import { nextInvNum } from "../pages/printScan.jsx";
import { fmtQty, getRecipes, recipesForLine } from "./recipes.jsx";
import { archiveVoid } from "./voids.jsx";


const SALES_KEY="cafenet_sales";

const DATA_EVENT="cafenet:data";

const DIRECT_CATS_KEY="cafenet_direct_cats";

export function directCats(){const v=lsRead(DIRECT_CATS_KEY,null);const l=Array.isArray(v)?v:[];return[...new Set([COST_CATEGORY,ONLINE_SHIP_CAT,ONLINE_FEE_CAT,...l])];}

export function setDirectCats(l){lsWrite(DIRECT_CATS_KEY,l);}

// درآمد = مجموع فروش | سود ناخالص = فروش − هزینه مستقیم | سود خالص = سود ناخالص − هزینه‌های جاری
export function financeOf(match,txs,salesList){
  const sales=(salesList||getSales()).filter(x=>!x.cancelled&&match(x.date));
  const T=txs.filter(t=>match(t.date));const dc=directCats();
  const num=t=>Number(t.amount)||0;
  const salesTotal=sales.reduce((a,x)=>a+(Number(x.total)||0)-(Number(x.waived)||0),0);
  const otherIncome=T.filter(t=>t.type==="income"&&!t.saleId).reduce((a,t)=>a+num(t),0);
  const revenue=salesTotal+otherIncome;
  const received=T.filter(t=>t.type==="income").reduce((a,t)=>a+num(t),0);
  const direct=T.filter(t=>t.type==="expense"&&dc.includes(t.category)).reduce((a,t)=>a+num(t),0);
  const operating=T.filter(t=>t.type==="expense"&&!dc.includes(t.category)).reduce((a,t)=>a+num(t),0);
  const gross=revenue-direct,net=gross-operating;
  return{revenue,received,direct,operating,gross,net,count:sales.length};
}

export const fmtPct=(a,b)=>b>0?toFA(Math.round(a/b*100))+"٪":"—";

export function getPaymentAccounts(){return lsRead(PAYMENT_ACCOUNTS_KEY,[]);}

const BASE_PAY_METHODS=[
  {key:"cash",label:"نقدی",icon:"💵",real:true},
  {key:"pos",label:"کارتخوان",icon:"💳",real:true},
  {key:"transfer",label:"کارت به کارت",icon:"🔁",real:true},
  {key:"wallet",label:"کیف پول مشتری",icon:"👛",real:true},
  {key:"credit",label:"اعتباری / بدهکار",icon:"📒",real:false},
  {key:"free",label:"رایگان",icon:"🎁",real:false},
  {key:"other",label:"سایر",icon:"•••",real:true},
];

export let PAY_METHODS=[...BASE_PAY_METHODS];

export let TX_METHODS=["cash","pos","transfer","other"];

export function refreshPaymentMethods(accounts=getPaymentAccounts()){
  const custom=accounts.map(a=>({key:a.key,label:a.label,icon:a.kind==="pos"?"💳":"🏦",real:true,channelType:a.kind,accountId:a.key}));
  PAY_METHODS=[...BASE_PAY_METHODS,...custom];
  TX_METHODS=["cash","pos","transfer","other",...custom.map(m=>m.key)];
}

refreshPaymentMethods();
export function payLabel(k){const m=PAY_METHODS.find(x=>x.key===k);return m?m.label:"نقدی";}

export const payIcon=k=>{const m=PAY_METHODS.find(x=>x.key===k);return m?m.icon:"💵";};

export function methodSummary(txs){
  const m={};
  txs.filter(isRealCashTx).forEach(t=>{const k=txMethod(t);const r=m[k]||(m[k]={key:k,inc:0,out:0});const a=Number(t.amount)||0;if(t.type==="income")r.inc+=a;else r.out+=a;});
  return PAY_METHODS.filter(p=>m[p.key]).map(p=>({...m[p.key],net:m[p.key].inc-m[p.key].out,label:p.label,icon:p.icon}));
}

export function MethodSummary({txs,title}){
  const rows=methodSummary(txs);
  const tin=rows.reduce((a,r)=>a+r.inc,0),tout=rows.reduce((a,r)=>a+r.out,0);
  return(
    <div data-testid="method-summary" style={{background:"var(--bg-card)",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>{title||"🏧 به تفکیک روش پرداخت"}</div>
      {rows.length===0?<div style={{textAlign:"center",color:"var(--text-dim)",fontSize:12,padding:"10px 0"}}>تراکنشی نیست</div>:(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}>
        {rows.map(r=>(
          <div key={r.key} data-testid={"ms-"+r.key} style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>{r.icon} {r.label}</div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:"var(--text-muted)"}}>دریافتی</span><b style={{color:"#4ade80"}}>{fmtM(r.inc)}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,margin:"2px 0"}}><span style={{color:"var(--text-muted)"}}>پرداختی</span><b style={{color:"#f87171"}}>{fmtM(r.out)}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,borderTop:"1px dashed var(--border)",paddingTop:4,marginTop:4}}><span style={{color:"var(--text-muted)"}}>مانده</span><b style={{color:r.net>=0?"#22d3ee":"#fb923c"}}>{fmtM(r.net)}</b></div>
          </div>))}
      </div>)}
      {rows.length>0&&<div style={{fontSize:10,color:"var(--text-dim)",marginTop:8}}>جمع دریافتی {fmtM(tin)} · جمع پرداختی {fmtM(tout)}. تراکنش‌های قدیمی بدون روش، «نقدی» حساب می‌شوند. هزینه‌ی خودکار مصرف مواد انبار (پرداخت واقعی نیست) در این جدول نمی‌آید.</div>}
    </div>);
}

let _uidLast=0;

// Keep this numeric ID generator for legacy records until each feature has an
// explicit migration that can update its references atomically.
// v1.58: اکیداً صعودی و یکتا در هر دستگاه — حتی اگر در یک میلی‌ثانیه بیش از ۱۰۰۰ شناسه ساخته شود (نسخهٔ قبل با پیمانهٔ ۱۰۰۰ تکراری می‌ساخت).
export function uid(){const t=Date.now()*1000;_uidLast=t>_uidLast?t:_uidLast+1;return _uidLast;}

// The ONE place new record ids come from. `kind` documents the entity ("customer","sale","payment",…) and is reserved for a future
// prefixed/UUID scheme; today ids stay numeric (monotonic, collision-free within a device) so every existing record, report and backup keeps working.
export function createId(kind){void kind;return uid();}

export function lsRead(key,fb){const v=readJsonValue(key,fb);return v==null?fb:v;}

export function lsWrite(key,val){
  const result=writeJsonValue(key,val);
  if(!result.ok){
    // inside a transaction a failed write aborts the whole operation (everything is rolled back); outside it is only reported
    if(inTransaction())throw result.error||new Error("Local data could not be saved: "+key);
    console.warn("Local data could not be saved",{key,code:result.error?.code});
    reportError(result.error||new Error("Local data could not be saved"),"storage",{key,code:result.error?.code});   // visible toast with an Error ID
  }
}

export function fireDataChange(){try{window.dispatchEvent(new Event(DATA_EVENT));}catch{}}

export function emitDataChange(){afterCommit(fireDataChange);}
  // during a transaction the refresh waits for the commit
// Runs a multi-record operation all-or-nothing. Business refusals ({ok:false}) and exceptions both restore every key that was touched.
export function atomic(name,fn){
  if(inTransaction())return fn();           // nested call: the outermost operation owns commit / rollback
  const r=runTransaction(name,fn,{onRollback:fireDataChange});
  if(r.ok)return r.value;                   // committed, or refused with {ok:false,error} (then rolled back)
  const entry=reportError(r.error,"transaction",{name,restoreFailed:(r.restoreFailed||[]).join(",")});
  return{ok:false,error:`عملیات انجام نشد و هیچ تغییری ذخیره نشد${entry&&entry.id?` (کد خطا ${entry.id})`:""}`,errorId:entry&&entry.id};
}

export function useDataSync(reload){
  useEffect(()=>{const h=()=>{try{reload();}catch{}};window.addEventListener(DATA_EVENT,h);return()=>window.removeEventListener(DATA_EVENT,h);},[]);  
}

export function getSales(){return lsRead(SALES_KEY,[]);}

export function getSale(id){return getSales().find(s=>String(s.id)===String(id))||null;}

export function saleRemaining(s){return Math.max(0,(s.total||0)-(s.paid||0)-(s.waived||0));}

// Splits an amount across the sale's lines in proportion to each line's net value,
// so per-service income reports stay accurate even for partial payments.
function allocateAcrossLines(sale,amount){
  const sub=sale.lines.reduce((s,l)=>s+l.qty*l.price,0)||1;
  const nets=sale.lines.map(l=>Math.round(l.qty*l.price*(sale.total/sub)));
  const sumNet=nets.reduce((a,b)=>a+b,0)||1;
  let rest=amount;const out=[];
  sale.lines.forEach((l,i)=>{
    const part=i===sale.lines.length-1?rest:Math.min(rest,Math.round(amount*nets[i]/sumNet));
    rest-=part;
    if(part>0)out.push({line:l,amount:part});
  });
  return out;
}

function paymentAccountId(method){
  const meta=PAY_METHODS.find(m=>m.key===method);
  return meta?.accountId||(["cash","pos","transfer","wallet","other"].includes(method)?method:null);
}

function incomeTxsFor(sale,payment){
  return allocateAcrossLines(sale,payment.amount).map(({line,amount})=>({id:uid(),type:"income",category:line.category||line.desc,amount,desc:`${line.desc} — ${sale.customerName}`,date:payment.date||sale.date,saleId:sale.id,invoiceId:sale.invoiceId,paymentId:payment.id,customerId:sale.customerId,accountId:payment.accountId||null,method:payment.method||"cash"}));
}

// Pushes the sale's paid / remaining state into its invoice and ledger entry.
function syncSaleViews(sale){
  const remaining=saleRemaining(sale);
  const status=remaining<=0?"paid":(Number(sale.paid)||0)>0?"partial":"unpaid";
  lsWrite(INV_STORAGE,lsRead(INV_STORAGE,[]).map(iv=>String(iv.id)===String(sale.invoiceId)?{...iv,paidAmount:sale.paid||0,waivedAmount:sale.waived||0,remainingAmount:remaining,payments:sale.payments||[],paymentMethods:[...new Set((sale.payments||[]).filter(p=>p.method!=="free").map(p=>p.method))],status}:iv));
  if(sale.ledgerAccId){
    lsWrite(LEDGER_STORAGE,lsRead(LEDGER_STORAGE,[]).map(a=>String(a.id)!==String(sale.ledgerAccId)?a:{...a,entries:(a.entries||[]).map(e=>String(e.id)!==String(sale.ledgerEntryId)?e:{...e,amount:remaining,reminderDate:remaining>0?e.reminderDate:"",desc:remaining>0?e.desc:(String(e.desc||"").includes("تسویه شد")?e.desc:`${e.desc} ✓ تسویه شد`)})}));
  }
}

export function createSale(o){return atomic("createSale",()=>createSaleCore(o));}

function createSaleCore(o){
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  let cust=customers.find(c=>String(c.id)===String(o.customerId));
  const walkIn=!cust&&!!o.walkIn; // cash customer without a customer record (e.g. a quick print job)
  if(!cust&&!walkIn)return{ok:false,error:"مشتری انتخاب نشده است"};
  if(walkIn)cust={id:null,firstName:"مشتری",lastName:"نقدی",wallet:0,phone:""};
  const name=`${cust.firstName} ${cust.lastName}`.trim();
  const date=o.date||todayIso();
  const lines=(o.items||[]).map(i=>({
    id:uid(),desc:String(i.desc||"").trim(),qty:Number(i.qty)||0,unit:i.unit||"عدد",price:Number(i.price)||0,
    category:i.category||"",title:i.title||"",op:i.op||"",buy:Math.max(0,Number(i.buy)||0),cost:Math.max(0,Number(i.cost)||0),stockId:i.stockId||null,stockQty:Math.max(0,Number(i.stockQty)||0),recipeKeys:i.recipeKeys||undefined,
  })).filter(l=>l.desc&&l.qty>0);
  if(!lines.length)return{ok:false,error:"حداقل یک خدمت یا کالا اضافه کنید"};
  const subtotal=lines.reduce((s,l)=>s+l.qty*l.price,0);
  let settlement;
  try{settlement=settleSale({subtotal,discount:o.discount,payments:o.payments,walletBalance:cust.wallet,walkIn});}
  catch(error){
    if(error?.issues?.includes("total must be positive"))return{ok:false,error:"مبلغ فروش باید بیشتر از صفر باشد"};
    if(error?.issues?.includes("walk-in sales must be fully settled"))return{ok:false,error:"فروش به مشتری نقدی باید کامل پرداخت شود (برای نسیه، مشتری انتخاب کنید)"};
    return{ok:false,error:"مبلغ فروش نامعتبر است"};
  }
  const {discount,total,paid,waived,walletUsed,remaining}=settlement;
  const real=settlement.payments;
  const invId=o.invoiceId||uid();
  const invoices=lsRead(INV_STORAGE,[]);
  const number=(o.number&&!invoices.some(iv=>String(iv.number)===String(o.number)))?String(o.number):nextInvNum(invoices);
  const saleId=o.id||uid();
  const nowD=new Date(),pad2=n=>String(n).padStart(2,"0");
  const time=o.time||`${pad2(nowD.getHours())}:${pad2(nowD.getMinutes())}`;
  const createdTs=o.createdTs||Date.now();
  const paymentRecords=real.map(p=>({id:uid(),saleId,invoiceId:invId,customerId:cust.id,accountId:paymentAccountId(p.method),amount:p.amount,method:p.method,date:p.date||date}));
  const actor=o.createdBy||currentActor();
  const online=o.channel==="online"?normalizeOnline(o.online):null;
  const sale={id:saleId,number,time,createdTs,customerId:cust.id,customerName:name,date,createdAt:date,lines,subtotal,discount,total,paid,waived,walletUsed,
    kind:o.kind||"",source:o.source||(online?"online":""),channel:online?"online":"store",online,notes:String(o.notes||"").trim(),dueDate:remaining>0?(o.dueDate||""):"",invoiceId:invId,payments:paymentRecords,stockUsed:[],createdBy:actor,cancelled:false};
  if(waived>0)sale.payments.push({id:uid(),saleId,invoiceId:invId,customerId:cust.id,accountId:null,amount:waived,method:"free",date});

  // — income (only what was actually received), tagged with the payment method
  const newTx=[];
  paymentRecords.forEach(p=>incomeTxsFor(sale,p).forEach(t=>newTx.push(t)));
  // — stock + direct costs
  const warnings=[];
  const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
  const recipes=getRecipes();
  const touched=new Set();
  let stockChanged=false;
  lines.forEach(l=>{
    let cost=l.cost;
    const moves=[];
    if(l.stockId&&l.stockQty>0){
      const it=stock.find(s=>String(s.id)===String(l.stockId));
      if(it){
        const take=Math.min(Number(it.qty)||0,l.stockQty);
        if(take<l.stockQty)warnings.push(`موجودی «${it.name}» کافی نبود (${toFA(take)} از ${toFA(l.stockQty)} کسر شد)`);
        const before=Number(it.qty)||0;
        it.qty=(Number(it.qty)||0)-take;stockChanged=true;touched.add(String(it.id));
        if(take>0)sale.stockUsed.push({itemId:it.id,qty:take,saleId,invoiceId:invId});
        cost+=(Number(it.unitCost)||0)*take;
        moves.push({itemId:it.id,name:it.name,unit:it.unit||"",qty:take,before,after:Number(it.qty)||0,unitCost:Number(it.unitCost)||0,cost:(Number(it.unitCost)||0)*take});
      }
    }
    // — automatic consumables defined for this service (e.g. 1 sheet of A4 per print)
    let autoCost=0;
    recipesForLine(l,recipes).forEach(r=>(r.components||[]).forEach(c=>{
      const it=stock.find(s=>String(s.id)===String(c.itemId));if(!it)return;
      const need=(Number(c.qty)||0)*l.qty;if(!(need>0))return;
      const have=Number(it.qty)||0,take=Math.min(have,need);
      if(take<need-1e-9)warnings.push(`موجودی «${it.name}» برای «${l.desc}» کافی نبود (${fmtQty(take)} از ${fmtQty(need)} ${it.unit} کسر شد)`);
      it.qty=Math.round((have-take)*10000)/10000;stockChanged=true;touched.add(String(it.id));
      if(take>0)sale.stockUsed.push({itemId:it.id,qty:take,auto:true,saleId,invoiceId:invId});
      autoCost+=(Number(it.unitCost)||0)*take;
      moves.push({itemId:it.id,name:it.name,unit:it.unit||"",qty:take,before:have,after:it.qty,unitCost:Number(it.unitCost)||0,cost:(Number(it.unitCost)||0)*take,auto:true});
    }));
    if(autoCost>0){l.autoCost=autoCost;cost+=autoCost;}
    l.consumed=moves;l.costTotal=cost;
    if(cost>0)newTx.push({id:uid(),type:"expense",category:COST_CATEGORY,amount:cost,desc:`هزینه ${l.desc} — ${name}`,date,saleId,invoiceId:invId,customerId:cust.id});
  });
  // — online channel: courier cost and platform / gateway fee are direct costs of THIS sale (so profit per sale and in reports is real)
  if(online){
    if(online.shippingCost>0)newTx.push({id:uid(),type:"expense",category:ONLINE_SHIP_CAT,amount:online.shippingCost,desc:`هزینه ارسال${online.carrier?` (${online.carrier})`:""} — ${name}${online.trackingCode?` — رهگیری ${online.trackingCode}`:""}`,date,saleId,invoiceId:invId,customerId:cust.id});
    if(online.platformFee>0)newTx.push({id:uid(),type:"expense",category:ONLINE_FEE_CAT,amount:online.platformFee,desc:`کارمزد ${online.platform} — ${name}${online.orderRef?` — سفارش ${online.orderRef}`:""}`,date,saleId,invoiceId:invId,customerId:cust.id});
  }
  touched.forEach(id=>{const it=stock.find(s=>String(s.id)===id);if(it&&Number(it.qty)<=Number(it.minQty))warnings.push(`${it.name} رو به اتمام است — موجودی: ${fmtQty(it.qty)} ${it.unit}`);});
  if(stockChanged)lsWrite(INV_STORAGE_KEY,stock);
  sale.costTotal=newTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  sale.profit=calculateSaleProfit({revenue:total,directCost:sale.costTotal});

  // — invoice
  const waivedNote=waived>0?`مبلغ ${fmtM(waived)} رایگان/بخشیده شد.`:"";
  lsWrite(INV_STORAGE,[{
    id:invId,number,date,time,createdTs,customerId:walkIn?"":String(cust.id),customerName:name,customerPhone:cust.phone||"",customerAddress:o.customerAddress||(online?online.address:"")||"",channel:online?"online":"store",online,
    items:lines.map(l=>({id:l.id,desc:l.desc,qty:l.qty,unit:l.unit,price:l.price})),
    tax:0,discount,note:[sale.notes,waivedNote].filter(Boolean).join(" — "),status:remaining<=0?"paid":paid>0?"partial":"unpaid",createdAt:date,createdBy:actor,
    subtotal,taxAmount:0,totalAmount:total,paidAmount:paid,waivedAmount:waived,remainingAmount:remaining,payments:sale.payments,paymentMethods:[...new Set(sale.payments.filter(p=>p.method!=="free").map(p=>p.method))],saleId,
  },...invoices]);
  sale.invoiceId=invId;

  // — order
  const title=lines[0].desc+(lines.length>1?` و ${toFA(lines.length-1)} مورد دیگر`:"");
  const orderId=o.skipOrder?null:uid();
  const firstIncome=newTx.find(t=>t.type==="income");
  if(!o.skipOrder)lsWrite(ORDERS_STORAGE_KEY,[...lsRead(ORDERS_STORAGE_KEY,[]),{
    id:orderId,customerId:String(cust.id),title,notes:sale.notes,amount:total,
    status:ORDER_STATUSES.some(s=>s.key===o.status)?o.status:"new",
    createdAt:date,linkedInvoiceId:invId,linkedTxId:firstIncome?firstIncome.id:null,source:"admin",saleId,
  }]);
  sale.orderId=orderId;sale.title=title;

  // — the customer becomes a debtor for whatever is left
  if(remaining>0){
    const accounts=lsRead(LEDGER_STORAGE,[]);
    let acc=accounts.find(a=>a.customerId!=null&&String(a.customerId)===String(cust.id));
    if(!acc){acc={id:uid(),customerId:cust.id,note:"",entries:[]};accounts.push(acc);}
    const entry={id:uid(),date,category:"بدهکار",amount:remaining,desc:`${title} — فاکتور #${number}`,reminderDate:sale.dueDate||"",saleId,invoiceId:invId,customerId:cust.id};
    acc.entries=[...(acc.entries||[]),entry];
    sale.ledgerAccId=acc.id;sale.ledgerEntryId=entry.id;
    lsWrite(LEDGER_STORAGE,accounts);
  }

  // — customer account (service history + wallet)
  lsWrite(CUSTOMERS_STORAGE_KEY,customers.map(c=>{
    if(String(c.id)!==String(cust.id))return c;
    const net=allocateAcrossLines(sale,total);
    const hist=[...(c.serviceHistory||[]),...lines.map(l=>({id:uid(),name:l.desc,category:l.category||"سفارش",amount:(net.find(n=>n.line.id===l.id)||{amount:l.qty*l.price}).amount,date,saleId,invoiceId:invId}))];
    const upd={...c,serviceHistory:hist};
    if(walletUsed>0){
      upd.wallet=Math.max(0,(Number(c.wallet)||0)-walletUsed);
      upd.walletHistory=[...(c.walletHistory||[]),{id:uid(),type:"use",amount:walletUsed,note:`فروش — فاکتور #${number}`,date,saleId}];
    }
    return upd;
  }));

  lsWrite(TX_KEY,[...lsRead(TX_KEY,[]),...newTx]);
  lsWrite(SALES_KEY,[sale,...getSales()]);
  const clubReward=walkIn?0:syncClubRewards(cust.id);
  logActivity(o.logAction||"ثبت فروش",`${name} — ${title} — ${fmtM(total)}${remaining>0?` (مانده ${fmtM(remaining)})`:""}`);
  emitDataChange();
  syncAfterSale(sale,{orderId:o.skipOrder?null:orderId,revision:!!o.syncRevision});
  return{ok:true,sale,warnings,clubReward};
}

// ── Offline queue (src/sync): every server-bound mutation is written locally first, then queued with a unique
//    operation id + Idempotency-Key, and delivered when the connection allows (see «تنظیمات › همگام‌سازی»). ──
export function hasPendingFor(...resources){try{return syncQueue.list().some(o=>resources.includes(o.resource));}catch{return false;}}

export function loadRemoteIds(name){try{return new Set(JSON.parse(localStorage.getItem("cafenet_remote_ids_"+name)||"[]").map(String));}catch{return new Set();}}

export function saveRemoteIds(name,set){try{localStorage.setItem("cafenet_remote_ids_"+name,JSON.stringify([...set]));}catch{}}

// Queue operations are registered only once the surrounding transaction has committed.
const qop=(input)=>afterCommit(()=>queueOp(input));

function syncFinanceOn(){return isApiConnected()&&getSyncConfig().finance!==false;}

function syncAfterSale(sale,{orderId=null,revision=false}={}){
  try{
    if(!isApiConnected())return;
    const custDep=sale.customerId!=null?[`customers:${sale.customerId}`]:[];
    const fin=syncFinanceOn();
    if(fin){
      const inv=syncMappers.invoiceBody(sale);
      if(revision)qop({resource:"invoices",action:"update",entityId:sale.invoiceId,body:inv,dependsOn:custDep,label:`ویرایش فاکتور #${sale.number}`});
      else qop({resource:"invoices",action:"create",entityId:sale.invoiceId,body:inv,idem:`invoice-${sale.invoiceId}`,dependsOn:custDep,label:`فاکتور #${sale.number} — ${sale.customerName}`});
    }
    if(revision)return;
    if(orderId!=null){
      const od=lsRead(ORDERS_STORAGE_KEY,[]).find(x=>String(x.id)===String(orderId));
      if(od)qop({resource:"orders",action:"create",entityId:od.id,body:syncMappers.orderBody({...od,customerName:sale.customerName}),idem:`order-${od.id}`,dependsOn:[...custDep,...(fin?[`invoices:${sale.invoiceId}`]:[])],label:`سفارش: ${od.title}`});
    }
    if(fin)(sale.payments||[]).filter(p=>p.method!=="free").forEach(p=>qop({resource:"payments",action:"create",entityId:p.id,body:syncMappers.paymentBody(p,sale),idem:`payment-${p.id}`,dependsOn:[`invoices:${sale.invoiceId}`],label:`پرداخت ${fmtM(p.amount)} — فاکتور #${sale.number}`}));
  }catch(e){reportError(e,"sync",{stage:"sale"});}
}

// A revised invoice re-creates its payments and order with new local ids: retire the old server rows, send the new ones.
function syncAfterRevision(sale,oldPays,oldOrder){
  try{
    if(!isApiConnected())return;
    const fin=syncFinanceOn();
    if(fin){
      // پرداخت روی سرور حذف نمی‌شود؛ با ردیف برگشت (منفی) خنثی می‌شود تا تاریخچهٔ مالی سوراخ نشود
      oldPays.filter(p=>p.method!=="free").forEach(p=>qop({resource:"payments",action:"command",entityId:p.id,body:{reason:`جایگزینی پرداخت در ویرایش فاکتور #${sale.number}`},meta:{path:`/api/payments/${encodeURIComponent(String(p.id))}/void`},dependsOn:[`payments:${p.id}`],idem:`payment-void-${p.id}`,label:`برگشت پرداخت — فاکتور #${sale.number}`}));
      (sale.payments||[]).filter(p=>p.method!=="free").forEach(p=>qop({resource:"payments",action:"create",entityId:p.id,body:syncMappers.paymentBody(p,sale),idem:`payment-${p.id}`,dependsOn:[`invoices:${sale.invoiceId}`],label:`پرداخت ${fmtM(p.amount)} — فاکتور #${sale.number}`}));
    }
    if(oldOrder)qop({resource:"orders",action:"remove",entityId:oldOrder.id,label:`جایگزینی سفارش — فاکتور #${sale.number}`});
    if(sale.orderId!=null){
      const od=lsRead(ORDERS_STORAGE_KEY,[]).find(x=>String(x.id)===String(sale.orderId));
      if(od)qop({resource:"orders",action:"create",entityId:od.id,body:syncMappers.orderBody({...od,customerName:sale.customerName}),idem:`order-${od.id}`,dependsOn:sale.customerId!=null?[`customers:${sale.customerId}`]:[],label:`سفارش: ${od.title}`});
    }
  }catch(e){reportError(e,"sync",{stage:"revision"});}
}

function syncAfterPayment(payment,sale){
  try{
    if(!syncFinanceOn()||!sale.invoiceId)return;
    if(payment.method==="free")qop({resource:"invoices",action:"update",entityId:sale.invoiceId,body:{waivedAmount:Number(sale.waived)||0},label:`بخشودگی — فاکتور #${sale.number}`});
    else qop({resource:"payments",action:"create",entityId:payment.id,body:syncMappers.paymentBody(payment,sale),idem:`payment-${payment.id}`,dependsOn:[`invoices:${sale.invoiceId}`],label:`دریافت ${fmtM(payment.amount)} — فاکتور #${sale.number}`});
  }catch(e){reportError(e,"sync",{stage:"payment"});}
}

function syncAfterVoid(sale,reason){
  try{
    if(!isApiConnected())return;
    if(syncFinanceOn()&&sale.invoiceId)qop({resource:"invoices",action:"command",entityId:sale.invoiceId,body:{reason:String(reason||"").trim()||"ابطال از برنامه (بدون توضیح)"},meta:{path:`/api/invoices/${encodeURIComponent(String(sale.invoiceId))}/void`},idem:`invoice-void-${sale.invoiceId}`,label:`ابطال فاکتور #${sale.number}`});
    if(sale.orderId!=null)qop({resource:"orders",action:"remove",entityId:sale.orderId,label:`حذف سفارش (ابطال فاکتور #${sale.number})`});
  }catch(e){reportError(e,"sync",{stage:"void"});}
}

export function syncTxOp(action,tx,{force=false}={}){
  try{
    if(!syncFinanceOn()||!tx||(!force&&!syncMappers.isManualTransaction(tx)))return;
    const label=`${tx.type==="income"?"درآمد":"هزینه"}: ${tx.category} — ${fmtM(tx.amount)}`;
    if(action==="create")qop({resource:"transactions",action:"create",entityId:tx.id,body:syncMappers.transactionBody(tx),idem:`transaction-${tx.id}`,label});
    else if(action==="update")qop({resource:"transactions",action:"update",entityId:tx.id,body:syncMappers.transactionBody(tx),label:"ویرایش "+label});
    else qop({resource:"transactions",action:"remove",entityId:tx.id,label:"حذف "+label});
  }catch(e){reportError(e,"sync",{stage:"tx"});}
}

// Collect (or waive, with method "free") part of a sale's remaining balance.
export function receiveSalePayment(saleId,amount,method="cash",date,reason){return atomic("receiveSalePayment",()=>receiveSalePaymentCore(saleId,amount,method,date,reason));}

function receiveSalePaymentCore(saleId,amount,method="cash",date,reason){
  const sales=getSales();
  const sale=sales.find(s=>String(s.id)===String(saleId));
  if(!sale)return{ok:false,error:"فروش پیدا نشد"};
  const day=date||todayIso();
  let amt=Math.min(Math.max(0,Number(amount)||0),saleRemaining(sale));
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  if(method==="wallet"){
    const c=customers.find(c=>String(c.id)===String(sale.customerId));
    amt=Math.min(amt,Number(c&&c.wallet)||0);
  }
  if(amt<=0)return{ok:false,error:method==="wallet"?"موجودی کیف پول کافی نیست":"مبلغ نامعتبر است"};
  const payment={id:uid(),saleId:sale.id,invoiceId:sale.invoiceId||null,customerId:sale.customerId,accountId:method==="free"?null:paymentAccountId(method),amount:amt,method,date:day};
  if(method==="free"){
    sale.waived=(sale.waived||0)+amt;
  }else{
    if(method==="wallet"){
      lsWrite(CUSTOMERS_STORAGE_KEY,customers.map(c=>String(c.id)!==String(sale.customerId)?c:{...c,wallet:Math.max(0,(Number(c.wallet)||0)-amt),walletHistory:[...(c.walletHistory||[]),{id:uid(),type:"use",amount:amt,note:`تسویه فاکتور #${sale.number}`,date:day,saleId}]}));
      sale.walletUsed=(sale.walletUsed||0)+amt;
    }
    lsWrite(TX_KEY,[...lsRead(TX_KEY,[]),...incomeTxsFor(sale,payment)]);
    sale.paid=(sale.paid||0)+amt;
  }
  sale.payments=[...(sale.payments||[]),payment];
  const remaining=saleRemaining(sale);
  syncSaleViews(sale);
  lsWrite(SALES_KEY,sales);
  if(method==="free")audit({action:"payment_waive",entityType:"فاکتور",entityId:sale.number,entityLabel:`فاکتور ${sale.number} — ${sale.customerName||"—"}`,amount:amt,reason,before:{remaining:remaining+amt},after:{remaining},details:`مانده ${fmtM(remaining)}`});
  else   logActivity("دریافت وجه فروش",`${sale.customerName} — ${fmtM(amt)} (${payLabel(method)})${remaining>0?` — مانده ${fmtM(remaining)}`:" — تسویه کامل"}`);
  emitDataChange();
  syncAfterPayment(payment,sale);
  return{ok:true,received:amt,remaining,waived:method==="free"};
}

// Removes every effect of a sale (order, invoice, income/cost txs, ledger debt, stock, customer history, wallet use).
// `quiet` is used while editing a sale: the wallet refund leaves no history note because the sale is re-created straight away.
function reverseSale(sale,{quiet=false}={}){
  lsWrite(ORDERS_STORAGE_KEY,lsRead(ORDERS_STORAGE_KEY,[]).filter(o=>String(o.saleId)!==String(sale.id)));
  lsWrite(INV_STORAGE,lsRead(INV_STORAGE,[]).filter(iv=>String(iv.saleId)!==String(sale.id)));
  lsWrite(TX_KEY,lsRead(TX_KEY,[]).filter(t=>String(t.saleId)!==String(sale.id)));
  if(sale.ledgerAccId){
    lsWrite(LEDGER_STORAGE,lsRead(LEDGER_STORAGE,[]).map(a=>String(a.id)!==String(sale.ledgerAccId)?a:{...a,entries:(a.entries||[]).filter(e=>String(e.saleId)!==String(sale.id))}));
  }
  if((sale.stockUsed||[]).length){
    const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
    sale.stockUsed.forEach(u=>{const it=stock.find(s=>String(s.id)===String(u.itemId));if(it)it.qty=Math.round(((Number(it.qty)||0)+u.qty)*10000)/10000;});
    lsWrite(INV_STORAGE_KEY,stock);
  }
  lsWrite(CUSTOMERS_STORAGE_KEY,lsRead(CUSTOMERS_STORAGE_KEY,[]).map(c=>{
    if(String(c.id)!==String(sale.customerId))return c;
    const upd={...c,serviceHistory:(c.serviceHistory||[]).filter(h=>String(h.saleId)!==String(sale.id))};
    if((sale.walletUsed||0)>0){
      upd.wallet=(Number(c.wallet)||0)+sale.walletUsed;
      upd.walletHistory=[...(c.walletHistory||[]).filter(h=>String(h.saleId)!==String(sale.id)),...(quiet?[]:[{id:uid(),type:"charge",amount:sale.walletUsed,note:`بازگشت اعتبار — لغو فاکتور #${sale.number}`,date:todayIso()}])];
    }
    return upd;
  }));
  lsWrite(SALES_KEY,getSales().filter(s=>String(s.id)!==String(sale.id)));
}

// ── پیگیری سفارش آنلاین ───────────────────────────────────────────────
// patch: {status?, trackingCode?, carrier?, orderRef?}. «returned» = برگشت خورده: کل فروش ابطال و موجودی برگردانده می‌شود (مثل ابطال فاکتور).
export function updateOnlineSale(saleId,patch,reason){return atomic("updateOnlineSale",()=>updateOnlineSaleCore(saleId,patch||{},reason));}

function updateOnlineSaleCore(saleId,patch,reason){
  const sale=getSale(saleId);
  if(!sale||sale.channel!=="online")return{ok:false,error:"این فروش آنلاین نیست"};
  const cur=sale.online||normalizeOnline({});
  const next=normalizeOnline({...cur,...patch});
  if(next.status==="returned"&&cur.status!=="returned"){
    const r=cancelSaleCore(saleId,reason||"برگشت سفارش آنلاین");
    return r.ok?{ok:true,returned:true}:r;
  }
  lsWrite(SALES_KEY,getSales().map(x=>String(x.id)===String(sale.id)?{...x,online:next}:x));
  lsWrite(INV_STORAGE,lsRead(INV_STORAGE,[]).map(iv=>String(iv.saleId)===String(sale.id)?{...iv,online:next}:iv));
  const st=ONLINE_STATUSES.find(x=>x.key===next.status);
  if(sale.orderId!=null&&st&&st.order&&next.status!==cur.status){
    lsWrite(ORDERS_STORAGE_KEY,lsRead(ORDERS_STORAGE_KEY,[]).map(o=>String(o.id)===String(sale.orderId)?{...o,status:st.order}:o));
    try{if(isApiConnected())qop({resource:"orders",action:"update",entityId:sale.orderId,body:{status:st.order},dependsOn:[`orders:${sale.orderId}`],label:`وضعیت سفارش آنلاین #${sale.number}`});}catch(e){reportError(e,"sync",{stage:"online-status"});}
  }
  if(next.status!==cur.status)logActivity("وضعیت سفارش آنلاین",`${sale.customerName} — فاکتور #${sale.number} — ${(st||{}).label||next.status}`);
  emitDataChange();
  return{ok:true};
}

export function cancelSale(saleId,reason){return atomic("cancelSale",()=>cancelSaleCore(saleId,reason));}

function cancelSaleCore(saleId,reason){
  const sale=getSale(saleId);
  if(!sale)return{ok:false};
  archiveVoid("sale",{sale,invoices:lsRead(INV_STORAGE,[]).filter(iv=>String(iv.saleId)===String(sale.id)),txs:lsRead(TX_KEY,[]).filter(t=>String(t.saleId)===String(sale.id)),orders:lsRead(ORDERS_STORAGE_KEY,[]).filter(o=>String(o.saleId)===String(sale.id))},reason,{title:`فاکتور ${sale.number} — ${sale.customerName}`,amount:sale.total,number:sale.number});
  reverseSale(sale);
  emitDataChange();
  syncAfterVoid(sale,reason);
  return{ok:true};
}

// Edit a sale-linked invoice: undo every effect of the old sale, then record the new version under the SAME
// invoice number / sale id / invoice id / creation time. Anything goes wrong → all data is rolled back untouched.
export function reviseSale(saleId,o,reason){return atomic("reviseSale",()=>reviseSaleCore(saleId,o,reason));}

function reviseSaleCore(saleId,o,reason){
  const sale=getSale(saleId);
  if(!sale)return{ok:false,error:"فروش مرتبط با این فاکتور پیدا نشد"};
  const oldInv=lsRead(INV_STORAGE,[]).find(iv=>String(iv.saleId)===String(sale.id))||{};
  const oldOrder=lsRead(ORDERS_STORAGE_KEY,[]).find(x=>String(x.saleId)===String(sale.id));
  const oldPays=(sale.payments||[]).slice();
  // ویرایش فاکتورِ دارای پرداخت در حالت سرور، پرداخت‌های قبلی را «برگشت» می‌زند؛ بدون مجوز payment.void سرور آن را رد می‌کرد و داده‌ی محلی و سرور ناهمگون می‌شد
  if(syncFinanceOn()&&oldPays.some(p=>p.method!=="free")&&serverGrant("payment.void")===false)return{ok:false,error:"ویرایش فاکتورِ دارای پرداخت نیاز به مجوز «برگشت پرداخت» دارد؛ از مدیر بخواهید فاکتور را ویرایش کند یا مجوز را به شما بدهد."};
  const snap={};
  [INV_STORAGE,TX_KEY,SALES_KEY,ORDERS_STORAGE_KEY,LEDGER_STORAGE,CUSTOMERS_STORAGE_KEY,INV_STORAGE_KEY].forEach(k=>{try{snap[k]=localStorage.getItem(k);}catch{}});
  const rollback=()=>{Object.entries(snap).forEach(([k,v])=>{try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch{}});emitDataChange();};
  try{
    reverseSale(sale,{quiet:true});
    const r=createSale({...o,id:sale.id,invoiceId:oldInv.id,number:sale.number,time:sale.time||oldInv.time,createdTs:sale.createdTs||oldInv.createdTs,createdBy:sale.createdBy||oldInv.createdBy,
      kind:sale.kind,source:sale.source,channel:o.channel!==undefined?o.channel:sale.channel,online:o.online!==undefined?o.online:sale.online,status:o.status||(oldOrder?oldOrder.status:undefined),skipOrder:!oldOrder,logAction:"ویرایش فاکتور",syncRevision:true});
    if(!r.ok){rollback();return r;}
    const rev={at:Date.now(),prevTotal:Number(sale.total)||0,newTotal:Number(r.sale.total)||0,prevPaid:Number(sale.paid)||0,newPaid:Number(r.sale.paid)||0,reason:String(reason||"").trim()};
    const revisions=[...(oldInv.revisions||[]),rev];
    const editor=currentActor();
    lsWrite(INV_STORAGE,lsRead(INV_STORAGE,[]).map(iv=>String(iv.saleId)===String(r.sale.id)?{...iv,revisions,editedAt:rev.at,lastEditedBy:editor}:iv));
    lsWrite(SALES_KEY,getSales().map(x=>String(x.id)===String(r.sale.id)?{...x,revisions,editedAt:rev.at,lastEditedBy:editor}:x));
    r.sale.revisions=revisions;
    audit({action:"sale_revise",entityType:"فاکتور",entityId:sale.number,entityLabel:`فاکتور ${sale.number} — ${r.sale.customerName||sale.customerName||"—"}`,amount:rev.newTotal,reason:rev.reason,before:{total:rev.prevTotal,paid:rev.prevPaid},after:{total:rev.newTotal,paid:rev.newPaid},details:rev.prevTotal!==rev.newTotal?`مبلغ از ${fmtM(rev.prevTotal)} به ${fmtM(rev.newTotal)}`:"مبلغ بدون تغییر"});
    emitDataChange();
    syncAfterRevision(r.sale,oldPays,oldOrder);
    return r;
  }catch(e){rollback();return{ok:false,error:"ویرایش انجام نشد؛ داده‌ها بدون تغییر ماندند"};}
}

// "Show me the invoice I just created" — remembered across the tab switch
let _pendingInvoiceOpen=null;

export function setPendingInvoiceOpen(id){_pendingInvoiceOpen=id==null?null:id;}

export function takePendingInvoiceOpen(){const v=_pendingInvoiceOpen;_pendingInvoiceOpen=null;return v;}

// Sale lines → wizard rows (used by "edit" and "reissue")
export function saleLinesToWizard(lines){
  return (lines||[]).map(l=>{
    const topup=l.category===TOPUP_CAT;
    return{key:uid(),desc:l.desc||"",qty:String(l.qty),unit:l.unit||"عدد",price:String(l.price),category:l.category||"",title:l.title||"",op:l.op||"",
      cost:topup?"":(l.cost?String(l.cost):""),unitBuy:topup?(Number(l.buy)||0):undefined,
      stockId:l.stockId?String(l.stockId):"",stockQty:l.stockQty?String(l.stockQty):"",stockSale:!!l.stockId&&Number(l.stockQty)===Number(l.qty),
      adv:!topup&&!!(l.cost||l.stockId)};
  });
}

// Plain (legacy / manual) invoice items → wizard rows
export function invoiceItemsToWizard(items){
  return (items||[]).map(i=>({key:uid(),desc:i.desc||"",qty:String(i.qty||1),unit:i.unit||"عدد",price:String(i.price||0),category:"",cost:"",stockId:i.stockId?String(i.stockId):"",stockQty:i.stockQty?String(i.stockQty):"",adv:!!i.stockId}));
}

// Draft invoices change nothing in the books — they only reserve a number and keep the wizard rows.
export function saveInvoiceDraft(o){
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  const c=customers.find(x=>String(x.id)===String(o.customerId));
  const invoices=lsRead(INV_STORAGE,[]);
  const old=o.draftId?invoices.find(iv=>String(iv.id)===String(o.draftId)):null;
  const rows=(o.wizardLines||[]).filter(l=>String(l.desc||"").trim()&&Number(l.qty)>0);
  const subtotal=rows.reduce((t,l)=>t+(Number(l.qty)||0)*(Number(l.price)||0),0);
  const discount=Math.min(Math.max(0,Number(o.discount)||0),subtotal);
  const d=new Date(),p=n=>String(n).padStart(2,"0");
  const draft={id:old?old.id:uid(),number:old?old.number:nextInvNum(invoices),date:o.date||todayIso(),time:old?old.time:`${p(d.getHours())}:${p(d.getMinutes())}`,createdTs:old?old.createdTs:Date.now(),
    customerId:c?String(c.id):"",customerName:c?`${c.firstName} ${c.lastName}`.trim():"",customerPhone:c?c.phone||"":"",customerAddress:"",
    items:rows.map(l=>({id:l.key,desc:l.desc,qty:Number(l.qty),unit:l.unit||"عدد",price:Number(l.price)||0})),tax:0,discount,note:String(o.notes||"").trim(),status:"draft",createdAt:old?.createdAt||todayIso(),createdBy:old?.createdBy||currentActor(),
    subtotal,taxAmount:0,totalAmount:subtotal-discount,wizardLines:rows,draftPay:o.draftPay||[]};
  lsWrite(INV_STORAGE,old?invoices.map(iv=>String(iv.id)===String(old.id)?draft:iv):[draft,...invoices]);
  logActivity(old?"ویرایش پیش‌نویس فاکتور":"پیش‌نویس فاکتور",`${draft.customerName||"—"} — ${fmtM(draft.totalAmount)}`);
  emitDataChange();
  return{ok:true,draft};
}
