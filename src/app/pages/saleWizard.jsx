// Generated from App.jsx by the module split (v1.50.0). Section: saleWizard
import { ReasonChips } from "../../audit/ReasonDialog.jsx";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon, { ICONS } from "../../components/Icon.jsx";
import { fmtCompact, fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { clubInfo, getClubConfig } from "../domain/club.js";
import { ClubBadge } from "../components/clubUI.jsx";
import { BTN, CUSTOMERS_STORAGE_KEY, INP, INV_STORAGE, ORDERS_STORAGE_KEY, ORDER_STATUSES, PRINT_TARIFF_CAT, SALE_MODES, TOPUP_CAT } from "../core/constants.js";
import { JalaliPicker, SearchableSelect } from "../components/controls.jsx";
import { useCustomers } from "./customers.jsx";
import { getInvCats, useInventory } from "./inventory.jsx";
import { todayIso } from "../core/jalali.js";
import { nextInvNum } from "./printScan.jsx";
import { fmtQty, getRecipes, recipeUsageList } from "../domain/recipes.jsx";
import { PAY_METHODS, createSale, getSale, getSales, lsRead, lsWrite, payLabel, receiveSalePayment, reviseSale, saleLinesToWizard, saleRemaining, saveInvoiceDraft, setPendingInvoiceOpen, uid } from "../domain/sales.jsx";
import { deriveIncomeCategoryOptions, useTariffData } from "./tariff.jsx";
import { getTopupCatalog } from "../domain/topup.jsx";
import { Empty } from "../components/ui.jsx";
import { OnlinePanel, blankOnline, onlineSummaryLine } from "./onlinePanel.jsx";


// ══════════════════════════════════════════════════════════════════
// SALE WIZARD (ثبت فروش یکپارچه) — customer → items → payment → confirm
// One confirmation creates order, invoice, income, ledger debt, stock & cost.
// ══════════════════════════════════════════════════════════════════
const SALE_STEPS=["مشتری","اقلام","پرداخت","تأیید"];

// ───────── Per-line real cost & gross profit (stock → cost → profit) ─────────
function previewSaleEconomics(lines,stockItems,recipes){
  const qtyMap={};stockItems.forEach(i=>{qtyMap[String(i.id)]=Number(i.qty)||0;});
  const itemOf=id=>stockItems.find(i=>String(i.id)===String(id));
  return lines.map(l=>{
    const qty=Number(l.qty)||0,price=Number(l.price)||0;
    const direct=l.unitBuy!==undefined?(Number(l.unitBuy)||0)*qty:(Number(l.cost)||0);
    const consumed=[];
    const take=(it,need,auto)=>{
      const k=String(it.id),have=qtyMap[k],t=Math.min(have,need);
      qtyMap[k]=Math.round((have-t)*10000)/10000;
      consumed.push({itemId:it.id,name:it.name,unit:it.unit||"",qty:t,need,before:have,after:qtyMap[k],unitCost:Number(it.unitCost)||0,cost:(Number(it.unitCost)||0)*t,auto});
    };
    if(l.stockId&&Number(l.stockQty)>0){const it=itemOf(l.stockId);if(it)take(it,Number(l.stockQty),false);}
    recipeUsageList(l,qty,recipes,stockItems).forEach(u=>take(u.item,u.qty,true));
    const costTotal=direct+consumed.reduce((a,c)=>a+c.cost,0);
    return{desc:l.desc,qty,revenue:qty*price,direct,consumed,costTotal,profit:qty*price-costTotal};
  });
}

export function savedSaleEconomics(sale){
  return (sale.lines||[]).map(l=>{
    const qty=Number(l.qty)||0,revenue=qty*(Number(l.price)||0);
    const consumed=l.consumed||[];
    const costTotal=l.costTotal!=null?Number(l.costTotal)||0:(Number(l.cost)||0)+(Number(l.autoCost)||0);
    return{desc:l.desc,qty,revenue,direct:Number(l.cost)||0,consumed,costTotal,profit:revenue-costTotal};
  });
}

export function SaleEconomics({rows,total,discount,preview}){
  const cost=rows.reduce((a,r)=>a+r.costTotal,0);
  const hasAny=rows.some(r=>r.costTotal>0||r.consumed.length);
  if(!rows.length||!hasAny)return null;
  const gross=total-cost;
  return(
    <div data-testid="sale-economics" style={{background:"var(--bg-app)",borderRadius:10,padding:12,fontSize:12,color:"var(--text-secondary)"}}>
      <div style={{fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>🧮 هزینه واقعی و سود هر خدمت{preview?" (پیش‌نمایش)":""}</div>
      {rows.map((r,i)=>(
        <div key={i} style={{padding:"7px 0",borderTop:i?"1px dashed var(--border)":"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8,fontWeight:700,color:"var(--text-primary)"}}><span>{r.desc} × {toFA(r.qty)}</span><span>{fmtM(r.revenue)}</span></div>
          {r.consumed.map((c,j)=>(
            <div key={j} data-testid="eco-consumed" style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:3,fontSize:11}}>
              <span>📦 {c.name}: <b style={{color:"var(--text-primary)"}}>{fmtQty(c.before)} ← {fmtQty(c.after)}</b> <span style={{color:"var(--text-muted)"}}>({fmtQty(c.qty)} {c.unit}{c.unitCost>0?` × ${fmtM(c.unitCost)}`:""}){c.auto?" · خودکار":""}</span></span>
              <span style={{color:"#fbbf24"}}>−{fmtM(Math.round(c.cost))}</span>
            </div>
          ))}
          {r.direct>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:11}}><span>هزینه مستقیم ثبت‌شده</span><span style={{color:"#fbbf24"}}>−{fmtM(Math.round(r.direct))}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11}}><span>هزینه کل این خدمت: {fmtM(Math.round(r.costTotal))}</span><b data-testid="eco-line-profit" style={{color:r.profit>=0?"#4ade80":"#f87171"}}>سود ناخالص: {fmtM(Math.round(r.profit))}</b></div>
        </div>
      ))}
      <div style={{borderTop:"1px solid var(--border)",marginTop:6,paddingTop:8,display:"flex",flexDirection:"column",gap:3}}>
        {discount>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>تخفیف فاکتور</span><span>−{fmtM(discount)}</span></div>}
        <div style={{display:"flex",justifyContent:"space-between"}}><span>جمع فروش</span><b>{fmtM(total)}</b></div>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>جمع هزینه مستقیم</span><b style={{color:"#fbbf24"}}>{fmtM(Math.round(cost))}</b></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14}}><span style={{fontWeight:700,color:"var(--text-primary)"}}>سود ناخالص</span><b data-testid="eco-gross" style={{color:gross>=0?"#4ade80":"#f87171"}}>{fmtM(Math.round(gross))}</b></div>
      </div>
    </div>
  );
}

function SaleChecklist({sale,done,statusLabel,stockNames,warnings}){
  const remaining=saleRemaining(sale);
  const real=(sale.payments||[]).filter(p=>p.method!=="free");
  const breakdown=real.map(p=>`${payLabel(p.method)} ${fmtM(p.amount)}`).join("، ");
  const v=done?" شد":" می‌شود";
  const rows=[
    `سفارش «${sale.title}» ایجاد${v} — وضعیت: ${statusLabel}`,
    `فاکتور #${toFA(sale.number)} به مبلغ ${fmtM(sale.total)} صادر${v}${remaining<=0?" (تسویه‌شده)":` — پرداخت ${fmtM(sale.paid||0)} · مانده ${fmtM(remaining)}`}`,
  ];
  {const ol=onlineSummaryLine(sale);if(ol)rows.push(ol);}
  if(sale.paid>0)rows.push(`درآمد ${fmtM(sale.paid)} ثبت${v} — ${breakdown}`);
  if(sale.waived>0)rows.push(`${fmtM(sale.waived)} رایگان/بخشیده حساب${v} (بدون درآمد و بدون بدهی)`);
  if(remaining>0)rows.push(`مشتری بدهکار${done?" شد":" می‌شود"}: ${fmtM(remaining)} در حساب دفتری${sale.dueDate?` — سررسید ${jalaliLabel(sale.dueDate)}`:""}`);
  rows.push(`تاریخچه خدمات و حساب مشتری به‌روز${v}`);
  if(stockNames.length)rows.push(`انبار: ${stockNames.join("، ")} کسر${v}`);
  if(sale.costTotal>0)rows.push(`هزینه مستقیم ${fmtM(sale.costTotal)} ثبت${v} — سود ناخالص این فروش ≈ ${fmtM(sale.total-sale.costTotal)}`);
  rows.push("گزارش سود و زیان و داشبورد به‌صورت خودکار به‌روز می‌شوند");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {rows.map((t,i)=>(
        <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:12,color:"var(--text-secondary)",lineHeight:1.7}}>
          <span style={{color:"#4ade80",flexShrink:0}}>{done?"✓":"○"}</span><span>{t}</span>
        </div>
      ))}
      {(warnings||[]).map((w,i)=><div key={"w"+i} style={{fontSize:12,color:"#fbbf24"}}>⚠️ {w}</div>)}
    </div>
  );
}

export function SaleWizard({onClose,onNavigate,initialCustomerId="",editSale=null,prefill=null,draft=null,popup=true,mode="all"}){
  // حالت فروش (منوی فروشگاه): تعیین می‌کند کدام انتخابگرهای اقلام دیده شوند. ویرایش فاکتور همیشه حالت کامل است.
  const SM=editSale||draft?SALE_MODES.all:(SALE_MODES[mode]||SALE_MODES.all);
  const modeKey=editSale||draft?"all":(SALE_MODES[mode]?mode:"all");
  const [customers]=useCustomers();
  const seed=editSale?{customerId:String(editSale.customerId),lines:saleLinesToWizard(editSale.lines),discount:editSale.discount?String(editSale.discount):"",notes:editSale.notes||"",
      payRows:(editSale.payments||[]).map(p=>({key:uid(),method:p.method,amount:String(p.amount),date:p.date||""})),dueDate:editSale.dueDate||"",date:editSale.date}
    :draft?{customerId:draft.customerId?String(draft.customerId):"",lines:(draft.wizardLines||[]).map(l=>({...l,key:uid()})),discount:draft.discount?String(draft.discount):"",notes:draft.note||"",payRows:(draft.draftPay||[]).map(p=>({...p,key:uid()})),dueDate:"",date:draft.date}
    :prefill?{customerId:prefill.customerId?String(prefill.customerId):"",lines:prefill.lines||[],discount:prefill.discount?String(prefill.discount):"",notes:prefill.notes||"",payRows:[],dueDate:"",date:""}
    :null;
  const oldOrder=editSale?lsRead(ORDERS_STORAGE_KEY,[]).find(x=>String(x.saleId)===String(editSale.id)):null;
  const busyRef=useRef(false);
  const [dupAsked,setDupAsked]=useState(false);
  const [invDate,setInvDate]=useState((seed&&seed.date)||todayIso());
  const [editReason,setEditReason]=useState("");
  const [tariffData]=useTariffData();
  const [stockItems]=useInventory();
  const SERVICE_OPTIONS=deriveIncomeCategoryOptions(tariffData);
  const [step,setStep]=useState(seed&&seed.customerId?2:initialCustomerId?2:1);
  const [customerId,setCustomerId]=useState(seed?seed.customerId:initialCustomerId?String(initialCustomerId):"");
  const [lines,setLines]=useState(seed?seed.lines:[]);
  const [hiddenPk,setHiddenPkRaw]=useState(()=>{const v=lsRead("cafenet_sw_hidden_pickers",[]);return Array.isArray(v)?v:[];});
  const setHiddenPk=(v)=>{setHiddenPkRaw(v);lsWrite("cafenet_sw_hidden_pickers",v);};
  const hidePk=(id)=>setHiddenPk([...hiddenPk,id]);
  const [discount,setDiscount]=useState(seed?seed.discount:"");
  const [discountAuto,setDiscountAuto]=useState(!!seed&&!!seed.discount);
  const [status,setStatus]=useState(oldOrder&&oldOrder.status?oldOrder.status:"new");
  const [payRows,setPayRows]=useState(seed?seed.payRows:[]); // [{key,method,amount,date?}] — split payments
  const [rowsTouched,setRowsTouched]=useState(!!editSale||!!(seed&&seed.payRows.length));
  const [dueDate,setDueDate]=useState(seed?seed.dueDate:"");
  const [notes,setNotes]=useState(seed?seed.notes:"");
  const [err,setErr]=useState("");
  const [result,setResult]=useState(null);
  // کانال فروش آنلاین: null = فروش حضوری
  const [onl,setOnl]=useState(()=>editSale&&editSale.channel==="online"?{...blankOnline(),...editSale.online,shippingCost:editSale.online&&editSale.online.shippingCost?String(editSale.online.shippingCost):"",platformFee:editSale.online&&editSale.online.platformFee?String(editSale.online.platformFee):""}
    :prefill&&prefill.online?{...blankOnline(),...(typeof prefill.online==="object"?prefill.online:{})}:SM.online==="forced"?blankOnline():null);

  const custOptions=customers.map(c=>({value:String(c.id),label:`${c.firstName} ${c.lastName}`.trim()+(c.phone?` · ${c.phone}`:""),group:null}));
  const cust=customers.find(c=>String(c.id)===String(customerId));
  const custName=cust?`${cust.firstName} ${cust.lastName}`.trim():"";

  const addLine=(val)=>{
    const opt=SERVICE_OPTIONS.find(o=>o.value===val);
    if(!opt)return;
    setLines(ls=>[...ls,{key:uid(),desc:opt.plainLabel,qty:"1",price:opt.price>0?String(opt.price):"",category:opt.plainLabel,cost:"",stockId:"",stockQty:"",adv:false}]);
  };
  const STOCK_OPTIONS=stockItems.map(it=>{const c=getInvCats().find(x=>x.key===it.cat);return{value:String(it.id),label:`${it.name} — موجودی ${toFA(it.qty)} ${it.unit||""}${Number(it.salePrice)>0?" — "+fmtCompact(it.salePrice):""}`,group:c?`${c.icon} ${c.label}`:"انبار"};});
  const addStockLine=(val)=>{
    const it=stockItems.find(s=>String(s.id)===String(val));
    if(!it)return;
    const c=getInvCats().find(x=>x.key===it.cat);
    setLines(ls=>[...ls,{key:uid(),desc:it.name,qty:"1",price:Number(it.salePrice)>0?String(it.salePrice):"",category:c?c.label:it.name,cost:"",stockId:String(it.id),stockQty:"1",stockSale:true,adv:false}]);
  };
  const PRINT_OPTIONS=SERVICE_OPTIONS.filter(o=>o.group===PRINT_TARIFF_CAT||o.value==="پرینت و کپی"||o.value==="اسکن");
  const TOPUP_ITEMS=getTopupCatalog();
  const TOPUP_OPTIONS=TOPUP_ITEMS.map(t=>({value:String(t.id),label:`${t.title} — ${t.operator} · ${fmtM(t.sell)}`,group:t.type==="charge"?"📱 شارژ":"🌐 بسته اینترنت"}));
  const addTopupLine=(val)=>{
    const t=TOPUP_ITEMS.find(x=>String(x.id)===String(val));if(!t)return;
    setLines(ls=>[...ls,{key:uid(),desc:`${t.title} — ${t.operator}`,title:t.title,op:t.operator,qty:"1",price:String(t.sell),category:TOPUP_CAT,cost:"",unitBuy:Number(t.buy)||0,stockId:"",stockQty:"",adv:false}]);
  };
  const addManual=()=>setLines(ls=>[...ls,{key:uid(),desc:"",qty:"1",price:"",category:"",cost:"",stockId:"",stockQty:"",adv:false}]);
  const setLine=(key,patch)=>setLines(ls=>ls.map(l=>{
    if(l.key!==key)return l;
    const n={...l,...patch};
    if(n.stockSale&&patch.qty!==undefined)n.stockQty=patch.qty;
    return n;
  }));
  const delLine=(key)=>setLines(ls=>ls.filter(l=>l.key!==key));

  const validLines=lines.filter(l=>l.desc.trim()&&Number(l.qty)>0);
  const subtotal=validLines.reduce((s,l)=>s+(Number(l.qty)||0)*(Number(l.price)||0),0);
  const disc=Math.min(Math.max(0,Number(discount)||0),subtotal);
  const total=subtotal-disc;
  const walletBal=(Number(cust&&cust.wallet)||0)+(editSale&&String(editSale.customerId)===String(customerId)?Number(editSale.walletUsed)||0:0);
  const amtOf=(r)=>Math.max(0,Number(r.amount)||0);
  const realRows=payRows.filter(r=>{const m=PAY_METHODS.find(x=>x.key===r.method);return m&&m.real;});
  const realPaid=realRows.reduce((s,r)=>s+amtOf(r),0);
  const freeAmt=payRows.filter(r=>r.method==="free").reduce((s,r)=>s+amtOf(r),0);
  const walletRowsAmt=payRows.filter(r=>r.method==="wallet").reduce((s,r)=>s+amtOf(r),0);
  const payError=realPaid+freeAmt>total?"مجموع پرداخت‌ها از مبلغ فاکتور بیشتر است":walletRowsAmt>walletBal?"مبلغ کیف پول از موجودی مشتری بیشتر است":"";
  const remaining=Math.max(0,total-realPaid-freeAmt);

  // Customer loyalty rule → suggest the automatic discount when entering the payment step.
  const loyaltyPct=cust&&cust.discountRule&&cust.discountRule.enabled&&(cust.serviceHistory||[]).length>=Number(cust.discountRule.threshold)?Number(cust.discountRule.percent)||0:0;
  const clubI=cust?clubInfo(cust):null;
  const clubPct=clubI?clubI.percent:0;
  const autoRule=Math.max(loyaltyPct,clubPct);
  const autoSrc=autoRule<=0?"":clubPct>=loyaltyPct?`باشگاه مشتریان — سطح ${clubI.tier.name} ${clubI.tier.icon}`:"تخفیف وفاداری مشتری";
  useEffect(()=>{
    if(step===3&&autoRule>0&&!discount&&!discountAuto&&subtotal>0){setDiscount(String(Math.round(subtotal*autoRule/100)));setDiscountAuto(true);}
  },[step]);  
  // Default payment: the full amount in cash — until the user edits the rows themselves.
  useEffect(()=>{
    if(step===3&&!rowsTouched)setPayRows([{key:uid(),method:"cash",amount:String(total)}]);
  },[step,total]);  

  const stockOf=(id)=>stockItems.find(s=>String(s.id)===String(id));
  const recipesAll=getRecipes();
  const usageOf=(l)=>recipeUsageList(l,Number(l.qty)||0,recipesAll,stockItems);
  const stockNames=[
    ...validLines.filter(l=>l.stockId&&Number(l.stockQty)>0).map(l=>{const s=stockOf(l.stockId);return s?`${s.name} ×${toFA(l.stockQty)}`:null;}).filter(Boolean),
    ...validLines.flatMap(l=>usageOf(l).map(u=>`${u.item.name} ×${fmtQty(u.qty)} ${u.item.unit}`)),
  ];
  const costTotal=validLines.reduce((s,l)=>{
    const st=l.stockId?stockOf(l.stockId):null;
    return s+(l.unitBuy!==undefined?(Number(l.unitBuy)||0)*(Number(l.qty)||0):(Number(l.cost)||0))+(st?(Number(st.unitCost)||0)*(Number(l.stockQty)||0):0)+usageOf(l).reduce((a,u)=>a+(Number(u.item.unitCost)||0)*u.qty,0);
  },0);
  const previewNumber=editSale?editSale.number:draft?draft.number:nextInvNum(lsRead(INV_STORAGE,[]));
  const previewSale={number:previewNumber,title:validLines.length?validLines[0].desc+(validLines.length>1?` و ${toFA(validLines.length-1)} مورد دیگر`:""):"",total,paid:realPaid,waived:freeAmt,payments:realRows.map(r=>({method:r.method,amount:amtOf(r)})).filter(p=>p.amount>0),dueDate:remaining>0?dueDate:"",costTotal};
  const statusLabel=(ORDER_STATUSES.find(s=>s.key===status)||{}).label;

  const canNext=step===1?!!customerId:step===2?(validLines.length>0&&subtotal>0):step===3?!payError:true;
  const next=()=>{setErr("");setStep(s=>Math.min(4,s+1));};
  const back=()=>{setErr("");setStep(s=>Math.max(1,s-1));};

  const setRow=(key,patch)=>{setRowsTouched(true);setPayRows(rs=>rs.map(r=>r.key===key?{...r,...patch}:r));};
  const addRow=()=>{setRowsTouched(true);setPayRows(rs=>[...rs,{key:uid(),method:"cash",amount:String(remaining)}]);};
  const delRow=(key)=>{setRowsTouched(true);setPayRows(rs=>rs.filter(r=>r.key!==key));};
  const fillRest=(key)=>{
    const others=payRows.filter(r=>r.key!==key&&r.method!=="credit").reduce((s,r)=>s+amtOf(r),0);
    setRow(key,{amount:String(Math.max(0,total-others))});
  };
  const saleInput=()=>({customerId,kind:validLines.length&&validLines.every(l=>l.unitBuy!==undefined)?"topup":"",items:validLines.map(l=>({desc:l.desc,qty:l.qty,unit:l.unit||"عدد",price:l.price,category:l.category,title:l.title||"",op:l.op||"",buy:l.unitBuy,cost:l.unitBuy!==undefined?(Number(l.unitBuy)||0)*(Number(l.qty)||0):l.cost,stockId:l.stockId||null,stockQty:l.stockQty})),discount:disc,status,payments:payRows.map(r=>({method:r.method,amount:r.amount,date:r.date||""})),dueDate,notes,date:invDate,channel:onl?"online":"store",online:onl||null,customerAddress:onl?onl.address:undefined});
  // The same customer, the same total and the same items seconds ago = almost surely a double click / double entry.
  const findDuplicate=()=>{
    const sig=validLines.map(l=>`${l.desc.trim()}×${Number(l.qty)}`).join("|");
    return getSales().find(x=>String(x.customerId)===String(customerId)&&Number(x.total)===total&&Date.now()-(x.createdTs||0)<5*60*1000&&(x.lines||[]).map(l=>`${l.desc}×${l.qty}`).join("|")===sig);
  };
  const submit=()=>{
    if(busyRef.current)return;
    if(!editSale&&!dupAsked){
      const dup=findDuplicate();
      if(dup){setDupAsked(true);setErr(`فاکتور مشابهی (شماره ${toFA(dup.number)}) همین چند لحظه پیش برای این مشتری ثبت شده است. اگر واقعاً فروش جدیدی است، دوباره «تأیید و ثبت نهایی» را بزنید.`);return;}
    }
    if(editSale&&editReason.trim().length<3){setErr("دلیل ویرایش فاکتور الزامی است (حداقل ۳ حرف) — در کادر نارنجی بنویسید.");return;}
    busyRef.current=true;
    let r;
    if(editSale){r=reviseSale(editSale.id,saleInput(),editReason.trim());}
    else if(draft){
      const all=lsRead(INV_STORAGE,[]);
      lsWrite(INV_STORAGE,all.filter(iv=>String(iv.id)!==String(draft.id)));
      r=createSale({...saleInput(),number:draft.number,createdTs:draft.createdTs});
      if(!r.ok)lsWrite(INV_STORAGE,all);
    }else r=createSale(saleInput());
    if(!r.ok){busyRef.current=false;setErr(r.error||"ثبت انجام نشد");return;}
    setResult(r);
  };
  const saveDraft=()=>{
    if(!customerId){setErr("برای ذخیره پیش‌نویس، مشتری را انتخاب کنید");return;}
    if(!validLines.length){setErr("حداقل یک ردیف اضافه کنید");return;}
    const r=saveInvoiceDraft({draftId:draft?draft.id:null,customerId,wizardLines:validLines,discount:disc,notes,date:invDate,draftPay:payRows.map(({method,amount})=>({method,amount}))});
    if(r.ok)setResult({draft:r.draft,warnings:[]});
  };

  const chip=(active,color="#2563eb")=>({padding:"10px 12px",borderRadius:9,border:active?`2px solid ${color}`:"1px solid var(--border)",background:active?"var(--bg-app)":"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:13,color:"var(--text-primary)",fontWeight:active?700:400,textAlign:"right"});

  const wrap=(node)=>popup&&typeof document!=="undefined"?createPortal(node,document.body):node; // پنجرهٔ شناور همیشه روی کل صفحه، حتی داخل عنصر دارای transform
  return wrap(
    <div style={popup?{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:12}:{position:"relative",inset:"auto",background:"transparent",display:"block",zIndex:"auto",padding:"0 0 14px"}}>
      <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:popup?540:900,maxHeight:popup?"94vh":undefined,overflowY:popup?"auto":undefined,boxSizing:"border-box",boxShadow:popup?"0 25px 60px #000a":undefined}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)",display:"flex",alignItems:"center",gap:8}}><Icon name="Zap" size={19}/>{editSale?`ویرایش فاکتور #${toFA(editSale.number)}`:draft?`صدور فاکتور از پیش‌نویس #${toFA(draft.number)}`:(modeKey==="all"?"سیستم فروش یکپارچه":SM.label)}{onl&&<span data-testid="online-badge" style={{fontSize:11,fontWeight:700,background:"#1e3a8a",color:"#bfdbfe",borderRadius:20,padding:"2px 10px"}}>🛒 فروش آنلاین</span>}</div>
          <button data-testid="sw-x" aria-label="بستن" onClick={()=>onClose()} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>

        {result?(
          <div>
            <div style={{textAlign:"center",marginBottom:14}}>
              <div style={{fontSize:40}}>✅</div>
              {result.draft?<>
                <div data-testid="sw-draft-done" style={{fontSize:15,fontWeight:700,color:"#fbbf24",marginTop:4}}>پیش‌نویس فاکتور #{toFA(result.draft.number)} ذخیره شد</div>
                <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>هنوز هیچ درآمد، بدهی یا کسر انبار ثبت نشده؛ از لیست فاکتورها می‌توانید آن را صادر کنید.</div>
              </>:<>
                <div data-testid="sw-done" style={{fontSize:15,fontWeight:700,color:"#4ade80",marginTop:4}}>{editSale?"فاکتور ویرایش شد":"فروش ثبت شد"} — فاکتور #{toFA(result.sale.number)}</div>
                <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>{custName} · {fmtM(result.sale.total)}</div>
              </>}
            </div>
            {result.sale&&<div style={{background:"var(--bg-app)",borderRadius:10,padding:14,marginBottom:14}}>
              <SaleChecklist sale={result.sale} done statusLabel={statusLabel} stockNames={stockNames} warnings={result.warnings}/>
              <div style={{marginTop:12}}><SaleEconomics rows={savedSaleEconomics(result.sale)} total={result.sale.total} discount={result.sale.discount||0}/></div>
            </div>}
            {result.sale&&(()=>{const c2=lsRead(CUSTOMERS_STORAGE_KEY,[]).find(x=>String(x.id)===String(customerId));if(!c2)return null;const ci=clubInfo(c2);if(!getClubConfig().enabled)return null;return(
              <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:12,lineHeight:1.9}} data-testid="club-result">
                🏅 باشگاه مشتریان: <ClubBadge info={ci} small/> · ⭐ {toFA(ci.points)} امتیاز · {toFA(ci.count)} خرید
                {result.clubReward>0&&<div style={{color:"#4ade80",fontWeight:700}}>🎁 {fmtM(result.clubReward)} پاداش اعتباری به کیف پول مشتری واریز شد!</div>}
              </div>);})()}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {onNavigate&&<button data-testid="sw-open-inv" onClick={()=>{setPendingInvoiceOpen(result.sale?result.sale.invoiceId:result.draft&&result.draft.id);onClose();onNavigate("invoice");}} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,minWidth:120,fontSize:12}}>مشاهده فاکتور</button>}
              {onNavigate&&result.sale&&!editSale&&<button onClick={()=>{onClose();onNavigate("orders");}} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,minWidth:120,fontSize:12}}>برد سفارش‌ها</button>}
              <button data-testid="sw-close" onClick={()=>onClose()} style={{...BTN("#2563eb"),flex:1,minWidth:120}}>بستن</button>
            </div>
          </div>
        ):(<>
          {/* progress */}
          <div data-testid="sale-progress" style={{display:"flex",justifyContent:"space-between",marginBottom:18,position:"relative",isolation:"isolate"}}>
            <div aria-hidden="true" style={{position:"absolute",top:12,right:12,left:12,height:2,zIndex:-1,background:`linear-gradient(to left,#2563eb 0%,#2563eb ${SALE_STEPS.length>1?((step-1)/(SALE_STEPS.length-1))*100:0}%,var(--border) ${SALE_STEPS.length>1?((step-1)/(SALE_STEPS.length-1))*100:0}%,var(--border) 100%)`}}/>
            {SALE_STEPS.map((label,i)=>{const n=i+1;return(
              <div key={n} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,position:"relative"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:step>=n?"#2563eb":"var(--bg-app)",color:step>=n?"#fff":"var(--text-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,zIndex:1,border:step>=n?"none":"1px solid var(--border)"}}>{toFA(n)}</div>
                <div style={{fontSize:10,color:step===n?"var(--accent-light)":"var(--text-dim)",marginTop:4,fontWeight:step===n?700:400}}>{label}</div>
              </div>
            );})}
          </div>

          {step===1&&(
            <div>
              <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:10}}>مشتری را انتخاب کنید</div>
              {customers.length===0
                ?<Empty text="هنوز مشتری‌ای ثبت نشده" sub="ابتدا از تب «مشتریان» یک مشتری اضافه کنید"/>
                :<SearchableSelect options={custOptions} value={customerId} placeholder="جستجوی مشتری..." onChange={setCustomerId}/>}
              {cust&&(
                <div style={{marginTop:12,background:"var(--bg-app)",borderRadius:9,padding:"10px 12px",fontSize:12,color:"var(--text-secondary)",display:"flex",gap:14,flexWrap:"wrap"}}>
                  <span>👛 اعتبار: <b style={{color:walletBal>0?"#4ade80":"var(--text-primary)"}}>{fmtM(walletBal)}</b></span>
                  <span>🧾 خدمات قبلی: <b style={{color:"var(--text-primary)"}}>{toFA((cust.serviceHistory||[]).length)}</b></span>
                  {autoRule>0&&<span style={{color:"#4ade80"}}>🏷️ تخفیف خودکار {toFA(autoRule)}٪ فعال است</span>}
                </div>
              )}
            </div>
          )}

          {step===2&&(
            <div>
              <div data-testid="sw-mode-hint" style={{fontSize:13,color:"var(--text-secondary)",marginBottom:8}}>{modeKey==="all"?"خدمت، کالا، پرینت و اسکن یا شارژ و اینترنت را انتخاب کنید (هر چند ردیف که لازم است)":`${SM.label}: ${SM.hint}`}</div>
              {SM.online==="optional"&&<label data-testid="online-toggle" style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700,color:onl?"#93c5fd":"var(--text-secondary)",cursor:"pointer",marginBottom:onl?0:8}}>
                <input type="checkbox" checked={!!onl} onChange={e=>setOnl(e.target.checked?blankOnline():null)}/>🛒 این یک فروش آنلاین است
              </label>}
              {onl&&<div style={{marginBottom:10}}><OnlinePanel value={onl} onChange={setOnl} customerAddress={cust&&(cust.address||"")}
                hasShippingLine={lines.some(l=>l.category==="ارسال")}
                onAddShippingLine={()=>setLines(ls=>[...ls,{key:uid(),desc:"هزینه ارسال",qty:"1",unit:"مورد",price:"",category:"ارسال",cost:"",stockId:"",stockQty:"",adv:false}])}/></div>}
              {(()=>{
                const pk=(id,node)=>(modeKey==="all"?hiddenPk.includes(id):!SM.pickers.includes(id))?null:(
                  <div key={id} data-testid={`sw-pk-${id}`} style={{display:"flex",gap:6,alignItems:"center",marginTop:id==="service"?0:8}}>
                    <div style={{flex:1,minWidth:0}}>{node}</div>
                    {modeKey==="all"&&<button data-testid={`sw-pk-del-${id}`} onClick={()=>hidePk(id)} title="حذف این فیلد" style={{...BTN("#450a0a","#f87171"),padding:"8px 10px"}}>✕</button>}
                  </div>);
                return(<>
                  {pk("service",<SearchableSelect options={SERVICE_OPTIONS} value="" placeholder="＋ جستجو و افزودن خدمت از تعرفه..." onChange={addLine}/>)}
                  {pk("print",<div data-testid="sw-print"><SearchableSelect options={PRINT_OPTIONS} value="" placeholder="🖨️ افزودن پرینت، کپی و اسکن..." onChange={addLine}/></div>)}
                  {pk("topup",<div data-testid="sw-topup"><SearchableSelect options={TOPUP_OPTIONS} value="" placeholder="📱 افزودن شارژ یا بسته اینترنت..." onChange={addTopupLine}/></div>)}
                  {STOCK_OPTIONS.length>0&&pk("stock",<SearchableSelect options={STOCK_OPTIONS} value="" placeholder="📦 افزودن کالا از انبار (کسر خودکار موجودی)..." onChange={addStockLine}/>)}
                  {!SM.manual&&STOCK_OPTIONS.length===0&&<div data-testid="sw-no-stock" style={{fontSize:12,color:"var(--text-muted)",textAlign:"center",padding:"14px 0"}}>هنوز کالایی در انبار تعریف نشده است؛ ابتدا از بخش «انبار» کالا اضافه کنید.</div>}
                  {modeKey==="all"&&hiddenPk.length>0&&<button data-testid="sw-pk-restore" onClick={()=>setHiddenPk([])} style={{background:"transparent",border:"none",color:"var(--accent-light)",fontSize:11,cursor:"pointer",marginTop:8,padding:0,fontFamily:"inherit",display:"block"}}>↺ بازگرداندن فیلدهای حذف‌شده ({toFA(hiddenPk.length)})</button>}
                </>);
              })()}
              {SM.manual&&<button onClick={addManual} style={{...BTN("var(--border)","var(--text-secondary)"),marginTop:8,fontSize:12,padding:"6px 12px"}}>＋ ردیف دستی</button>}
              <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:12}}>
                {lines.map(l=>(
                  <div key={l.key} style={{background:"var(--bg-app)",borderRadius:10,padding:10}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <input value={l.desc} onChange={e=>setLine(l.key,{desc:e.target.value})} placeholder="شرح خدمت" style={{...INP,marginTop:0,flex:1,minWidth:0}}/>
                      <button onClick={()=>delLine(l.key)} title="حذف ردیف" style={{...BTN("#450a0a","#f87171"),padding:"8px 10px"}}>✕</button>
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:6}}>
                      <label style={{flex:1,fontSize:10,color:"var(--text-muted)"}}>تعداد<input type="number" min="1" value={l.qty} onChange={e=>setLine(l.key,{qty:e.target.value})} style={{...INP,marginTop:2,padding:"8px 10px"}}/></label>
                      <label style={{flex:1,fontSize:10,color:"var(--text-muted)"}}>واحد<select data-testid="sw-unit" value={l.unit||"عدد"} onChange={e=>setLine(l.key,{unit:e.target.value})} style={{...INP,marginTop:2,padding:"8px 4px"}}>{["عدد","ساعت","برگ","نفر","بار","ماه","سرویس"].map(u=><option key={u}>{u}</option>)}</select></label>
                      <label style={{flex:2,fontSize:10,color:"var(--text-muted)"}}>قیمت واحد (ریال)<input type="number" value={l.price} onChange={e=>setLine(l.key,{price:e.target.value})} style={{...INP,marginTop:2,padding:"8px 10px"}}/></label>
                    </div>
                    {(()=>{const us=usageOf(l);if(!us.length)return null;return<div style={{marginTop:6,fontSize:11,color:"#4ade80",lineHeight:1.8}}>🧪 کسر خودکار از انبار: {us.map(u=>`${fmtQty(u.qty)} ${u.item.unit} ${u.item.name}${Number(u.item.qty)<u.qty?" (موجودی کافی نیست!)":""}`).join("، ")}</div>;})()}
                    <button onClick={()=>setLine(l.key,{adv:!l.adv})} style={{background:"transparent",border:"none",color:"var(--accent-light)",fontSize:11,cursor:"pointer",marginTop:6,padding:0,fontFamily:"inherit"}}>{l.adv?"▾":"◂"} هزینه و انبار (اختیاری)</button>
                    {l.adv&&(
                      <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:6}}>
                        <label style={{fontSize:10,color:"var(--text-muted)"}}>هزینه مستقیم این ردیف (ریال) — مثلاً مبلغی که از جیب کافی‌نت پرداخت می‌شود
                          <input type="number" value={l.cost} onChange={e=>setLine(l.key,{cost:e.target.value})} placeholder="۰" style={{...INP,marginTop:2,padding:"8px 10px"}}/>
                        </label>
                        <div style={{display:"flex",gap:6}}>
                          <label style={{flex:2,fontSize:10,color:"var(--text-muted)"}}>کسر از انبار
                            <select value={l.stockId} onChange={e=>setLine(l.key,{stockId:e.target.value,stockQty:e.target.value?(l.stockQty||"1"):""})} style={{...INP,marginTop:2,padding:"8px 10px"}}>
                              <option value="">— بدون کسر —</option>
                              {stockItems.map(s=><option key={s.id} value={s.id}>{s.name} (موجودی {toFA(s.qty)})</option>)}
                            </select>
                          </label>
                          <label style={{flex:1,fontSize:10,color:"var(--text-muted)"}}>مقدار<input type="number" min="0" value={l.stockQty} disabled={!l.stockId} onChange={e=>setLine(l.key,{stockQty:e.target.value})} style={{...INP,marginTop:2,padding:"8px 10px",opacity:l.stockId?1:0.5}}/></label>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {lines.length===0&&<div style={{fontSize:12,color:"var(--text-dim)",textAlign:"center",padding:"14px 0"}}>هنوز ردیفی اضافه نشده</div>}
              </div>
              {subtotal>0&&<div style={{marginTop:12,fontSize:13,fontWeight:700,textAlign:"left",color:"#22d3ee"}}>جمع اقلام: {fmtM(subtotal)}</div>}
            </div>
          )}

          {step===3&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div data-testid="sw-date">
                <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:6}}>تاریخ فاکتور{editSale&&editSale.time?` — ساعت ثبت ${toFA(editSale.time)}`:" (ساعت ثبت خودکار است)"}</div>
                <JalaliPicker value={invDate} onChange={setInvDate}/>
              </div>
              <div>
                <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:8}}>وضعیت سفارش</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {ORDER_STATUSES.map(s=>(
                    <button key={s.key} onClick={()=>setStatus(s.key)} style={{...chip(status===s.key,s.color),display:"flex",alignItems:"center",gap:6,fontSize:12,padding:"7px 10px"}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:s.color}}/>{s.label}
                    </button>
                  ))}
                </div>
              </div>
              <label style={{fontSize:13,color:"var(--text-secondary)"}}>تخفیف (ریال){discountAuto&&autoRule>0&&<span style={{color:"#4ade80",fontSize:11,marginRight:8}}>🏷️ {autoSrc}: {toFA(autoRule)}٪ تخفیف اعمال شد</span>}
                <input type="number" value={discount} onChange={e=>{setDiscount(e.target.value);setDiscountAuto(false);}} placeholder="۰" style={INP}/>
              </label>
              <div>
                <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:8}}>پرداخت — مبلغ فاکتور: <b style={{color:"var(--text-primary)"}}>{fmtM(total)}</b></div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {payRows.map(r=>(
                    <div key={r.key} style={{display:"flex",gap:6,alignItems:"center"}}>
                      <select value={r.method} onChange={e=>{const m=e.target.value;setRow(r.key,{method:m,amount:m==="credit"?"0":r.amount});}} style={{...INP,marginTop:0,flex:"1 1 130px",minWidth:0,padding:"9px 8px"}}>
                        {PAY_METHODS.filter(m=>m.key!=="wallet"||walletBal>0).map(m=><option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
                      </select>
                      {r.method==="credit"
                        ?<div style={{flex:"1 1 110px",fontSize:11,color:"#fbbf24",lineHeight:1.6}}>مانده به حساب بدهکاری می‌رود</div>
                        :<input type="number" value={r.amount} onChange={e=>setRow(r.key,{amount:e.target.value})} placeholder="مبلغ (ریال)" style={{...INP,marginTop:0,flex:"1 1 110px",minWidth:0,padding:"9px 8px"}}/>}
                      {r.method!=="credit"&&<button onClick={()=>fillRest(r.key)} title="باقی‌مانده فاکتور" style={{...BTN("var(--border)","var(--text-secondary)"),padding:"8px 9px",fontSize:11}}>مانده</button>}
                      <button onClick={()=>delRow(r.key)} title="حذف" style={{...BTN("#450a0a","#f87171"),padding:"8px 9px",fontSize:12}}>✕</button>
                    </div>
                  ))}
                  {payRows.length===0&&<div style={{fontSize:12,color:"#fbbf24"}}>هیچ پرداختی ثبت نشده — کل مبلغ به حساب بدهکاری مشتری می‌رود.</div>}
                  <button onClick={addRow} style={{...BTN("var(--border)","var(--text-secondary)"),fontSize:12,padding:"6px 12px",alignSelf:"flex-start"}}>＋ افزودن روش پرداخت (پرداخت ترکیبی)</button>
                </div>
                {walletBal>0&&<div style={{fontSize:11,color:"var(--text-dim)",marginTop:6}}>موجودی کیف پول مشتری: {fmtM(walletBal)}</div>}
                <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px",marginTop:10,fontSize:12,color:"var(--text-secondary)",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span>مبلغ فاکتور</span><b style={{color:"var(--text-primary)"}}>{fmtM(total)}</b></div>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span>پرداخت‌شده</span><b style={{color:"#4ade80"}}>{fmtM(realPaid)}</b></div>
                  {freeAmt>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>رایگان / بخشیده</span><b>{fmtM(freeAmt)}</b></div>}
                  <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid var(--border)",paddingTop:5,marginTop:2}}><span>باقی‌مانده</span><b style={{color:remaining>0?"#fbbf24":"#4ade80"}}>{fmtM(remaining)}</b></div>
                  {remaining>0&&<div style={{color:"#fbbf24",fontSize:11}}>⚠️ مشتری به‌طور خودکار به مبلغ {fmtM(remaining)} بدهکار می‌شود.</div>}
                </div>
                {payError&&<div style={{marginTop:8,fontSize:12,color:"#f87171"}}>{payError}</div>}
                {remaining>0&&(
                  <div style={{marginTop:10}}>
                    <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:6}}>تاریخ سررسید بدهی (اختیاری — برای یادآوری):</div>
                    <JalaliPicker value={dueDate} onChange={setDueDate} placeholder="انتخاب سررسید"/>
                  </div>
                )}
              </div>
              <label style={{fontSize:13,color:"var(--text-secondary)"}}>توضیحات (اختیاری)
                <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{...INP,resize:"vertical"}}/>
              </label>
            </div>
          )}

          {step===4&&(
            <div>
              <div style={{background:"var(--bg-app)",borderRadius:10,padding:14,marginBottom:12,fontSize:12,color:"var(--text-secondary)"}}>
                <div style={{marginBottom:6}}>👤 <b style={{color:"var(--text-primary)"}}>{custName}</b></div>
                {validLines.map(l=>(
                  <div key={l.key} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"3px 0"}}>
                    <span>{l.desc} × {toFA(l.qty)}</span><span>{fmtM((Number(l.qty)||0)*(Number(l.price)||0))}</span>
                  </div>
                ))}
                {disc>0&&<div style={{display:"flex",justifyContent:"space-between",color:"#4ade80",paddingTop:3}}><span>تخفیف</span><span>−{fmtM(disc)}</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid var(--border)",marginTop:6,paddingTop:6,fontWeight:700,color:"var(--text-primary)",fontSize:14}}><span>جمع کل</span><span>{fmtM(total)}</span></div>
              </div>
              {editSale&&<div style={{background:"#1c1917",border:"1px solid #f59e0b55",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#fbbf24",lineHeight:1.9}}>
                ✏️ با ثبت، اثر نسخه قبلی (درآمد، بدهی، انبار، حساب مشتری) برداشته و نسخه جدید با <b>همان شماره فاکتور</b> جایگزین می‌شود و سابقه ویرایش ثبت می‌ماند. (نسخه قبلی: {fmtM(editSale.total)})
                <input data-testid="sw-edit-reason" value={editReason} onChange={e=>setEditReason(e.target.value)} placeholder="دلیل ویرایش (الزامی)" maxLength={300} style={{...INP,marginTop:8,fontSize:12}}/>
              </div>}
              <div style={{fontSize:12,fontWeight:700,color:"var(--text-secondary)",marginBottom:8}}>با تأیید، این موارد به‌صورت خودکار انجام می‌شود:</div>
              <div style={{background:"var(--bg-app)",borderRadius:10,padding:14}}>
                <SaleChecklist sale={previewSale} done={false} statusLabel={statusLabel} stockNames={stockNames}/>
              </div>
              <div style={{marginTop:12}}><SaleEconomics preview rows={previewSaleEconomics(validLines,stockItems,recipesAll)} total={total} discount={disc}/></div>
            </div>
          )}

          {err&&<div style={{marginTop:12,background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"9px 12px",fontSize:12,color:"#f87171"}}>{err}</div>}

          <div style={{display:"flex",gap:10,marginTop:20}}>
            {step>1&&<button onClick={back} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Icon name="ArrowRight" size={15}/>قبلی</button>}
            {step<4
              ?<button onClick={next} disabled={!canNext} style={{...BTN("#2563eb"),flex:1,opacity:canNext?1:0.4,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>بعدی<Icon name="ArrowLeft" size={15}/></button>
              :<>
                {!editSale&&<button data-testid="sw-draft" onClick={saveDraft} style={{...BTN("var(--border)","#fbbf24"),flex:1,padding:12,fontSize:12}}>📝 پیش‌نویس</button>}
                <button data-testid="sw-submit" onClick={submit} style={{...BTN("#16a34a"),flex:2,padding:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Icon name="CheckCircle2" size={16}/>{editSale?"ثبت ویرایش":"تأیید و ثبت نهایی"}</button>
              </>}
          </div>
        </>)}
      </div>
    </div>
  );
}

// Collect a (partial) payment against a sale: income, invoice status, ledger debt all update together.
export function ReceivePaymentModal({saleId,onClose}){
  const sale=getSale(saleId);
  const [customers]=useCustomers();
  const [amount,setAmount]=useState(sale?String(saleRemaining(sale)):"");
  const [method,setMethod]=useState("cash");
  const [freeReason,setFreeReason]=useState("");
  const [msg,setMsg]=useState(null);
  if(!sale)return null;
  const cust=customers.find(c=>String(c.id)===String(sale.customerId));
  const walletBal=Number(cust&&cust.wallet)||0;
  const remaining=saleRemaining(sale);
  const submit=()=>{
    if(method==="free"&&freeReason.trim().length<3){setMsg({ok:false,text:"برای بخشودگی، دلیل الزامی است (حداقل ۳ حرف)"});return;}
    const r=receiveSalePayment(sale.id,amount,method,undefined,method==="free"?freeReason.trim():undefined);
    if(!r.ok){setMsg({ok:false,text:r.error});return;}
    setMsg({ok:true,text:(r.waived?`✓ ${fmtM(r.received)} بخشیده شد`:`✓ ${fmtM(r.received)} دریافت شد`)+(r.remaining>0?` — مانده ${fmtM(r.remaining)}`:" — فاکتور تسویه شد")});
    setTimeout(onClose,900);
  };
  return(
    <div style={{position:"relative",inset:"auto",background:"transparent",display:"block",zIndex:"auto",padding:"0 0 14px"}}>
      <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:640,boxSizing:"border-box"}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)",marginBottom:4}}>دریافت وجه — فاکتور #{toFA(sale.number)}</div>
        <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:14}}>{sale.customerName} · کل {fmtM(sale.total)} · دریافت‌شده {fmtM(sale.paid)} · <b style={{color:"#fbbf24"}}>مانده {fmtM(remaining)}</b></div>
        {remaining<=0?<div style={{fontSize:13,color:"#4ade80"}}>این فاکتور تسویه شده است.</div>:(
          <>
            <label style={{fontSize:13,color:"var(--text-secondary)"}}>مبلغ دریافتی (ریال)
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} style={INP} autoFocus/>
            </label>
            <label style={{fontSize:13,color:"var(--text-secondary)",display:"block",marginTop:10}}>روش دریافت
              <select value={method} onChange={e=>setMethod(e.target.value)} style={INP}>
                {PAY_METHODS.filter(m=>m.key!=="credit"&&(m.key!=="wallet"||walletBal>0)).map(m=><option key={m.key} value={m.key}>{m.icon} {m.label}{m.key==="wallet"?` (${fmtM(walletBal)})`:""}{m.key==="free"?" — بخشودگی مانده، بدون درآمد":""}</option>)}
              </select>
            </label>
            {method==="free"&&<div style={{marginTop:10}}>
              <ReasonChips presets={["مشتری ثابت","اشتباه در محاسبه","خسارت/نارضایتی","مبلغ ناچیز"]} onPick={setFreeReason}/>
              <input data-testid="pay-free-reason" value={freeReason} onChange={e=>setFreeReason(e.target.value)} placeholder="دلیل بخشودگی (الزامی)" maxLength={300} style={INP}/>
            </div>}
          </>
        )}
        {msg&&<div style={{marginTop:12,fontSize:12,color:msg.ok?"#4ade80":"#f87171"}}>{msg.text}</div>}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          {remaining>0&&<button onClick={submit} style={{...BTN("#16a34a"),flex:1,padding:11}}>ثبت دریافت</button>}
          <button onClick={onClose} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>بستن</button>
        </div>
      </div>
    </div>
  );
}
