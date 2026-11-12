// Generated from App.jsx by the module split (v1.50.0). Section: pos
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { logActivity } from "../core/activity.js";
import { fmtCompact, fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { clubInfo } from "../domain/club.js";
import { BTN, INP, PRINT_TARIFF_CAT, TOPUP_CAT, TX_KEY, isRealCashTx, txMethod } from "../core/constants.js";
import { SearchableSelect } from "../components/controls.jsx";
import { useCustomers } from "./customers.jsx";
import { getInvCats, useInventory } from "./inventory.jsx";
import { todayIso } from "../core/jalali.js";
import { getRecipes, recipesForLine } from "../domain/recipes.jsx";
import { ExportBar } from "../components/reportExport.jsx";
import { PAY_METHODS, createSale, emitDataChange, getSales, lsRead, lsWrite, payLabel, uid, useDataSync } from "../domain/sales.jsx";
import { useTariffData } from "./tariff.jsx";
import { getTopupCatalog } from "../domain/topup.jsx";
import { useSkin } from "../../skins/useSkin.js";
import { QuickSteps } from "../../skins/orange/QuickSteps.jsx";


// ══════════════════════════════════════════════════════════════════
// فروش سریع محصول (متصل به انبار کالا)
// ══════════════════════════════════════════════════════════════════
export function ProductSaleModal({onClose,onNavigate}){
  const [items]=useInventory();
  const [customers]=useCustomers();
  const [itemId,setItemId]=useState("");
  const [qty,setQty]=useState("1");
  const [price,setPrice]=useState("");
  const [customerId,setCustomerId]=useState("");
  const [method,setMethod]=useState("cash");
  const [err,setErr]=useState("");
  const [res,setRes]=useState(null);
  const cats=getInvCats();
  const it=items.find(x=>String(x.id)===String(itemId));
  const q=Math.max(0,Number(qty)||0),p=Math.max(0,Number(price)||0);
  const unitCost=it?Number(it.unitCost)||0:0;
  const total=q*p,profit=q*(p-unitCost);
  const options=[...items].sort((a,b)=>(Number(b.qty)>0)-(Number(a.qty)>0)).map(x=>{const c=cats.find(k=>k.key===x.cat);return{value:String(x.id),label:`${x.name} — موجودی ${toFA(x.qty)} ${x.unit||""}${Number(x.salePrice)>0?" — "+fmtCompact(x.salePrice):""}`,group:c?`${c.icon} ${c.label}`:"انبار"};});
  const pick=(v)=>{setItemId(v);const x=items.find(y=>String(y.id)===String(v));setPrice(x&&Number(x.salePrice)>0?String(x.salePrice):"");setErr("");};
  const submit=()=>{
    setErr("");
    if(!it){setErr("کالا را انتخاب کنید");return;}
    if(!(q>0)||!(p>0)){setErr("تعداد و قیمت فروش باید بیشتر از صفر باشد");return;}
    if(q>(Number(it.qty)||0)){setErr(`موجودی کافی نیست (موجودی: ${toFA(it.qty)} ${it.unit||""})`);return;}
    if(!customerId&&(method==="credit"||method==="wallet")){setErr("برای نسیه یا کیف پول، مشتری را انتخاب کنید");return;}
    const c=cats.find(k=>k.key===it.cat);
    const r=createSale({customerId:customerId||undefined,walkIn:!customerId,kind:"product",skipOrder:true,
      items:[{desc:it.name,title:it.name,qty:q,price:p,category:c?c.label:it.name,stockId:String(it.id),stockQty:q,cost:0,buy:unitCost}],
      payments:method==="credit"?[]:[{method,amount:total}]});
    if(!r.ok){setErr(r.error||"ثبت انجام نشد");return;}
    setRes({sale:r.sale,warnings:r.warnings||[],profit});
  };
  const lbl={fontSize:12,color:"var(--text-secondary)"};
  return createPortal(
    <div data-testid="product-sale-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!res)onClose();}} style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:12}}>
      <div data-testid="product-sale" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:560,maxHeight:"94vh",overflowY:"auto",boxSizing:"border-box",boxShadow:"0 25px 60px #000a"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)"}}>📦 فروش محصول از انبار</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        {res?(<div>
          <div style={{textAlign:"center",marginBottom:12}}><div style={{fontSize:38}}>✅</div>
            <div style={{fontSize:15,fontWeight:700,color:"#4ade80"}}>فروش ثبت شد — فاکتور #{toFA(res.sale.number)}</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:4}}>{fmtM(res.sale.total)} · سود {fmtM(res.profit)}</div></div>
          <div style={{background:"var(--bg-app)",borderRadius:10,padding:12,fontSize:12,lineHeight:2,marginBottom:12}}>
            <div>✓ فاکتور و درآمد ثبت شد</div><div>✓ از موجودی انبار کسر شد</div>
            {res.warnings.map((w,i)=><div key={i} style={{color:"#fbbf24"}}>⚠️ {w}</div>)}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setRes(null);setItemId("");setQty("1");setPrice("");}} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>فروش بعدی</button>
            <button onClick={onClose} style={{...BTN("#2563eb"),flex:1}}>بستن</button>
          </div>
        </div>):(<div style={{display:"flex",flexDirection:"column",gap:10}}>
          <label style={lbl}>کالا (از انبار)
            <SearchableSelect options={options} value={itemId} placeholder="جستجوی کالا..." onChange={pick}/>
          </label>
          {it&&<div style={{fontSize:11,color:Number(it.qty)<=Number(it.minQty)?"#fbbf24":"var(--text-muted)"}}>موجودی: {toFA(it.qty)} {it.unit||""} · قیمت خرید: {fmtM(unitCost)}{Number(it.qty)<=Number(it.minQty)?" · ⚠️ رو به اتمام":""}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10}}>
            <label style={lbl}>تعداد<input data-testid="ps-qty" type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} style={INP}/></label>
            <label style={lbl}>قیمت فروش واحد (ریال)<input data-testid="ps-price" type="number" value={price} onChange={e=>setPrice(e.target.value)} style={INP}/></label>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <label style={lbl}>مشتری (خالی = نقدی)
              <select value={customerId} onChange={e=>setCustomerId(e.target.value)} style={INP}>
                <option value="">مشتری نقدی</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
            </label>
            <label style={lbl}>روش پرداخت
              <select value={method} onChange={e=>setMethod(e.target.value)} style={INP}>
                {PAY_METHODS.filter(m=>m.key!=="free"&&(customerId||(m.key!=="credit"&&m.key!=="wallet"))).map(m=><option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
              </select>
            </label>
          </div>
          <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px",fontSize:12,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <span>مبلغ: <b>{fmtM(total)}</b></span><span style={{color:profit>=0?"#4ade80":"#f87171"}}>سود: <b data-testid="ps-profit">{fmtM(profit)}</b></span>
          </div>
          {err&&<div style={{color:"#f87171",fontSize:12}}>{err}</div>}
          <button data-testid="ps-submit" onClick={submit} style={{...BTN("#16a34a"),padding:12}}>ثبت فروش</button>
          {items.length===0&&<div style={{fontSize:11,color:"var(--text-muted)"}}>انبار خالی است. ابتدا کالا را در بخش انبار اضافه کنید{onNavigate&&<> — <span onClick={()=>{onClose();onNavigate("inventory");}} style={{color:"var(--accent-light)",cursor:"pointer"}}>رفتن به انبار</span></>}.</div>}
        </div>)}
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════════════════════════
// صندوق فروش (POS) + بستن صندوق پایان روز
// ══════════════════════════════════════════════════════════════════
const POS_KEY="cafenet_pos_config";

const POS_CLOSE_KEY="cafenet_register_closings";

const normFa=s=>String(s||"").replace(/ي/g,"ی").replace(/ك/g,"ک");

function getPosCfg(){const v=lsRead(POS_KEY,null);return{fav:Array.isArray(v&&v.fav)?v.fav:[],custom:Array.isArray(v&&v.custom)?v.custom:[],costs:(v&&v.costs&&typeof v.costs==="object")?v.costs:{}};}

export function getClosings(){const v=lsRead(POS_CLOSE_KEY,[]);return Array.isArray(v)?v:[];}

function buildPosCatalog(tariff,stock,topups,cfg){
  const cats=getInvCats(),out=[];
  tariff.forEach(g=>g.items.forEach(it=>{const key="s:"+g.cat+">"+it.name;out.push({key,kind:g.cat===PRINT_TARIFF_CAT?"print":"service",name:it.name,price:Number(it.price)||0,cost:Number(cfg.costs[key])||0,group:g.cat,match:it.name});}));
  cfg.custom.forEach(c=>out.push({key:"c:"+c.id,kind:"custom",name:c.name,price:Number(c.price)||0,cost:Number(c.cost)||0,group:"⚡ خدمات سریع من",match:c.name}));
  stock.forEach(it=>{const c=cats.find(k=>k.key===it.cat);out.push({key:"p:"+it.id,kind:"product",name:it.name,price:Number(it.salePrice)||0,cost:Number(it.unitCost)||0,group:c?`${c.icon} ${c.label}`:"انبار",stockId:String(it.id),stock:Number(it.qty)||0,unit:it.unit||"",match:it.name,category:c?c.label:it.name});});
  topups.forEach(t=>out.push({key:"t:"+t.id,kind:"topup",name:`${t.title} — ${t.operator}`,title:t.title,op:t.operator,price:Number(t.sell)||0,cost:Number(t.buy)||0,group:t.type==="charge"?"📱 شارژ":"🌐 بسته اینترنت",match:t.operator+"|"+t.title}));
  return out;
}

function posSoldCounts(){const m={};getSales().forEach(s=>{if(s.cancelled)return;(s.lines||[]).forEach(l=>{const k=(l.op?l.op+"|":"")+(l.title||l.desc);m[k]=(m[k]||0)+(Number(l.qty)||1);});});return m;}

// خلاصه یک روز: فروش‌های همان روز + وصول بدهی‌های قبلی + نقد صندوق
function registerDaySummary(day){
  const sales=getSales().filter(s=>!s.cancelled&&s.date===day);
  const methods=Object.fromEntries(PAY_METHODS.filter(m=>m.real).map(m=>[m.key,0]));methods.posTotal=0;
  let total=0,debt=0,waived=0,cost=0,discount=0;
  const cust=new Set();let walk=0;const top={};const invoices=[];
  sales.forEach(s=>{
    total+=s.total||0;waived+=s.waived||0;cost+=s.costTotal||0;discount+=s.discount||0;
    let paidToday=0;const ms=new Set();
    (s.payments||[]).forEach(p=>{if(p.method==="free"||p.date!==day)return;methods[p.method]=(methods[p.method]||0)+p.amount;const payMethod=PAY_METHODS.find(m=>m.key===p.method);if(p.method==="pos"||payMethod?.channelType==="pos")methods.posTotal+=p.amount;paidToday+=p.amount;ms.add(payLabel(p.method));});
    const rem=Math.max(0,(s.total||0)-(s.waived||0)-paidToday);debt+=rem;
    if(s.customerId!=null&&s.customerId!=="")cust.add(String(s.customerId));else walk++;
    (s.lines||[]).forEach(l=>{const k=l.title||l.desc;const o=top[k]||(top[k]={name:k,qty:0,amount:0});o.qty+=Number(l.qty)||0;o.amount+=(Number(l.qty)||0)*(Number(l.price)||0);});
    invoices.push({number:s.number,customer:s.customerName,total:s.total||0,paid:paidToday,remaining:rem,methods:[...ms].join("، ")||(rem>0?"نسیه":"—")});
  });
  const old={cash:0,pos:0,transfer:0,wallet:0,other:0};let oldTotal=0;
  getSales().forEach(s=>{if(s.cancelled||s.date>=day)return;(s.payments||[]).forEach(p=>{if(p.method==="free"||p.date!==day)return;old[p.method]=(old[p.method]||0)+p.amount;oldTotal+=p.amount;});});
  const txs=lsRead(TX_KEY,[]).filter(t=>t.date===day&&isRealCashTx(t)&&txMethod(t)==="cash");
  const cashOut=txs.filter(t=>t.type==="expense").reduce((a,t)=>a+(Number(t.amount)||0),0);
  const otherCashIn=txs.filter(t=>t.type==="income"&&t.saleId==null).reduce((a,t)=>a+(Number(t.amount)||0),0);
  return{day,count:sales.length,customers:cust.size+walk,total,discount,cost,profit:total-cost,methods,debt,waived,old,oldTotal,oldCash:old.cash||0,otherCashIn,cashOut,
    top:Object.values(top).sort((a,b)=>b.amount-a.amount).slice(0,8),invoices:invoices.sort((a,b)=>a.number-b.number)};
}

function closingSections(sum,rec){
  const m=sum.methods;
  const rows=[["فروش کل (ریال)",sum.total],["تعداد فاکتور",sum.count],["تعداد مشتری",sum.customers],["نقدی (ریال)",m.cash||0],["کارتخوان‌ها (جمع کل، ریال)",m.posTotal||m.pos||0],["کارت به کارت (ریال)",m.transfer||0],["کیف پول مشتری (ریال)",m.wallet||0],["سایر (ریال)",m.other||0],["بدهکار / نسیه (ریال)",sum.debt],["تخفیف (ریال)",sum.discount],["قیمت خرید / هزینه مستقیم (ریال)",sum.cost],["سود ناخالص (ریال)",sum.profit],["وصول بدهی‌های قبلی (ریال)",sum.oldTotal]];
  PAY_METHODS.filter(m=>m.channelType==="pos"||m.channelType==="bank").forEach(m=>{if((sum.methods[m.key]||0)>0)rows.push([`${m.label} (ریال)`,sum.methods[m.key]]);});
  if(rec){rows.push(["موجودی اول روز صندوق (ریال)",rec.opening],["نقد مورد انتظار صندوق (ریال)",rec.expected]);if(rec.counted!=null)rows.push(["نقد شمارش‌شده (ریال)",rec.counted],["کسری / اضافه (ریال)",rec.diff]);}
  return[
    {name:`بستن صندوق — ${jalaliLabel(sum.day)}`,head:["شرح","مقدار"],rows:rows,money:[],signed:[]},
    {name:"فاکتورهای روز",head:["فاکتور","مشتری","مبلغ (ریال)","پرداخت (ریال)","مانده (ریال)","روش پرداخت"],rows:sum.invoices.map(i=>[i.number,i.customer,i.total,i.paid,i.remaining,i.methods]),money:[2,3,4]},
    {name:"پرفروش‌های روز",head:["مورد","تعداد","مبلغ (ریال)"],rows:sum.top.map(t=>[t.name,t.qty,t.amount]),money:[2]},
  ];
}

function RegisterCloseModal({day,existing,onClose}){
  const [sum]=useState(()=>existing?existing.summary:registerDaySummary(day));
  const prev=getClosings().filter(c=>c.date<day).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const [opening,setOpening]=useState(existing?String(existing.opening):String(prev&&prev.counted!=null?prev.counted:0));
  const [counted,setCounted]=useState(existing&&existing.counted!=null?String(existing.counted):"");
  const [note,setNote]=useState(existing?existing.note||"":"");
  const [saved,setSaved]=useState(existing||null);
  const ro=!!existing;
  const m=sum.methods;
  const op=Number(opening)||0;
  const expected=op+(m.cash||0)+(sum.oldCash||0)+(sum.otherCashIn||0)-(sum.cashOut||0);
  const hasCount=counted!=="";
  const diff=hasCount?(Number(counted)||0)-expected:null;
  const had=!ro&&getClosings().some(c=>c.date===day);
  const rec=saved||{opening:op,expected,counted:hasCount?Number(counted):null,diff};
  const close=()=>{
    const r={id:uid(),date:day,closedAt:Date.now(),summary:sum,opening:op,expected,counted:hasCount?Number(counted):null,diff,note:note.trim()};
    lsWrite(POS_CLOSE_KEY,[r,...getClosings().filter(c=>c.date!==day)]);
    logActivity("بستن صندوق",`${jalaliLabel(day)} — فروش ${fmtM(sum.total)} · نقدی ${fmtM(m.cash||0)} · کارتخوان ${fmtM(m.posTotal||m.pos||0)} · بدهکار ${fmtM(sum.debt)}`);
    emitDataChange();setSaved(r);
  };
  const box=(label,val,color,tid)=><div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>{label}</div><div data-testid={tid} style={{fontSize:15,fontWeight:800,marginTop:3,color:color||"var(--text-primary)"}}>{val}</div></div>;
  const lbl={fontSize:12,color:"var(--text-secondary)"};
  const kp=[["فروش کل",fmtM(sum.total)],["نقدی",fmtM(m.cash||0)],["کارتخوان",fmtM(m.posTotal||m.pos||0)],["بدهکار",fmtM(sum.debt)],["تعداد مشتری",toFA(sum.customers)]];
  return(
    <div style={{position:"relative",inset:"auto",background:"transparent",display:"block",zIndex:"auto",padding:"0 0 14px"}}>
      <div data-testid="register-close" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:20,width:"100%",maxWidth:900,boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)"}}>🧮 {ro?"گزارش صندوق":"بستن صندوق"} — {jalaliLabel(day)}</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        {saved&&!ro&&<div data-testid="rc-saved" style={{background:"#14532d",color:"#bbf7d0",borderRadius:10,padding:"10px 12px",fontSize:13,marginBottom:12}}>✅ صندوق این روز بسته و گزارش ذخیره شد.</div>}
        {had&&!saved&&<div style={{background:"#422006",color:"#fcd34d",borderRadius:10,padding:"9px 12px",fontSize:12,marginBottom:12}}>⚠️ برای این روز قبلاً صندوق بسته شده؛ بستن دوباره، گزارش قبلی را جایگزین می‌کند.</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,marginBottom:12}}>
          {box("فروش کل",fmtM(sum.total),"#60a5fa","rc-total")}
          {box("تعداد فاکتور",toFA(sum.count),null,"rc-count")}
          {box("تعداد مشتری",toFA(sum.customers),null,"rc-customers")}
          {box("💵 نقدی",fmtM(m.cash||0),"#4ade80","rc-cash")}
          {box("💳 کارتخوان",fmtM(m.posTotal||m.pos||0),"#4ade80","rc-pos")}
          {box("🔁 کارت به کارت",fmtM(m.transfer||0),"#4ade80","rc-transfer")}
          {(m.wallet||0)>0&&box("👛 کیف پول مشتری",fmtM(m.wallet),"#4ade80","rc-wallet")}
          {(m.other||0)>0&&box("سایر",fmtM(m.other),"#4ade80","rc-other")}
          {box("📒 بدهکار (نسیه)",fmtM(sum.debt),sum.debt>0?"#fb923c":null,"rc-debt")}
          {box("سود ناخالص",fmtM(sum.profit),sum.profit>=0?"#4ade80":"#f87171","rc-profit")}
          {sum.discount>0&&box("تخفیف داده‌شده",fmtM(sum.discount))}
          {sum.oldTotal>0&&box("وصول بدهی‌های قبلی",fmtM(sum.oldTotal),"#22d3ee","rc-old")}
        </div>
        <div style={{background:"var(--bg-app)",borderRadius:12,padding:12,marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>💰 تطبیق نقد صندوق</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <label style={lbl}>موجودی اول روز (ریال)<input data-testid="rc-opening" type="number" disabled={ro} value={opening} onChange={e=>setOpening(e.target.value)} style={INP}/></label>
            <label style={lbl}>نقد شمارش‌شده در کشو (ریال)<input data-testid="rc-counted" type="number" disabled={ro} value={counted} onChange={e=>setCounted(e.target.value)} placeholder="اختیاری" style={INP}/></label>
          </div>
          <div style={{fontSize:12,lineHeight:2,marginTop:8,color:"var(--text-secondary)"}}>
            نقد مورد انتظار = اول روز {fmtM(op)} + نقدی فروش {fmtM(m.cash||0)}{sum.oldCash>0?` + وصول بدهی ${fmtM(sum.oldCash)}`:""}{sum.otherCashIn>0?` + سایر درآمد نقدی ${fmtM(sum.otherCashIn)}`:""}{sum.cashOut>0?` − هزینه نقدی ${fmtM(sum.cashOut)}`:""} = <b data-testid="rc-expected" style={{color:"var(--text-primary)"}}>{fmtM(expected)}</b>
            {diff!=null&&<div>اختلاف: <b data-testid="rc-diff" style={{color:diff===0?"#4ade80":diff>0?"#22d3ee":"#f87171"}}>{diff===0?"بدون اختلاف ✓":(diff>0?"اضافه ":"کسری ")+fmtM(Math.abs(diff))}</b></div>}
          </div>
        </div>
        {sum.top.length>0&&<div style={{marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>🏆 پرفروش‌های امروز</div>
          {sum.top.slice(0,5).map(t=><div key={t.name} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:"1px dashed var(--border)"}}><span>{t.name} × {toFA(t.qty)}</span><span>{fmtM(t.amount)}</span></div>)}
        </div>}
        <label style={{...lbl,display:"block",marginBottom:12}}>یادداشت<input disabled={ro} value={note} onChange={e=>setNote(e.target.value)} placeholder="مثلاً: ۵۰ هزار تومان برای خرید کاغذ برداشت شد" style={INP}/></label>
        <ExportBar title={`بستن صندوق — ${jalaliLabel(day)}`} fileBase="register" sections={closingSections(sum,rec)} kpis={kp}/>
        <div style={{display:"flex",gap:8}}>
          {!ro&&!saved&&<button data-testid="rc-confirm" onClick={close} style={{...BTN("#16a34a"),flex:2,padding:12}}>🔒 بستن صندوق</button>}
          <button onClick={onClose} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:12}}>{saved||ro?"بستن پنجره":"انصراف"}</button>
        </div>
        <div style={{fontSize:10,color:"var(--text-dim)",marginTop:8,lineHeight:1.8}}>فقط فروش‌های ثبت‌شده در همین روز در جمع «فروش کل» می‌آید. بدهی = مانده فاکتورهای امروز. هزینه‌های پرداختی نقدی از نقد مورد انتظار کم می‌شود.</div>
      </div>
    </div>);
}

export function RegisterHistory(){
  const [list,setList]=useState(getClosings);
  useDataSync(()=>setList(getClosings()));
  const [view,setView]=useState(null);
  const rows=[...list].sort((a,b)=>b.date.localeCompare(a.date));
  const sec={name:"سوابق بستن صندوق",head:["تاریخ","فروش کل (ریال)","تعداد فاکتور","تعداد مشتری","نقدی (ریال)","کارتخوان (ریال)","کارت به کارت (ریال)","بدهکار (ریال)","سود ناخالص (ریال)","اختلاف نقد (ریال)"],
    rows:rows.map(r=>[jalaliLabel(r.date),r.summary.total,r.summary.count,r.summary.customers,r.summary.methods.cash||0,r.summary.methods.posTotal||r.summary.methods.pos||0,r.summary.methods.transfer||0,r.summary.debt,r.summary.profit,r.diff==null?"—":r.diff]),money:[1,4,5,6,7,8,9],signed:[8]};
  return(
    <div data-testid="register-history">
      <ExportBar title="سوابق بستن صندوق" fileBase="register-history" sections={[sec]} kpis={[["تعداد روز بسته‌شده",toFA(rows.length)],["جمع فروش",fmtM(rows.reduce((a,r)=>a+r.summary.total,0))]]}/>
      {rows.length===0?<div style={{textAlign:"center",color:"var(--text-dim)",fontSize:13,padding:30}}>هنوز صندوقی بسته نشده است.</div>:
      <div style={{overflowX:"auto",background:"var(--bg-card)",borderRadius:12,padding:12}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:640}}>
        <thead><tr>{["تاریخ","فروش کل","مشتری","نقدی","کارتخوان","بدهکار","اختلاف نقد",""].map(h=><th key={h} style={{textAlign:"right",padding:"7px 8px",borderBottom:"1px solid var(--border)",color:"var(--text-muted)"}}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(r=><tr key={r.id} data-testid="rh-row">
          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)"}}>{jalaliLabel(r.date)}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)"}}>{fmtM(r.summary.total)}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)"}}>{toFA(r.summary.customers)}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)"}}>{fmtM(r.summary.methods.cash||0)}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)"}}>{fmtM(r.summary.methods.posTotal||r.summary.methods.pos||0)}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",color:r.summary.debt>0?"#fb923c":undefined}}>{fmtM(r.summary.debt)}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",color:r.diff==null?undefined:r.diff===0?"#4ade80":r.diff>0?"#22d3ee":"#f87171"}}>{r.diff==null?"—":r.diff===0?"✓":fmtM(r.diff)}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)"}}><button onClick={()=>setView(r)} style={{...BTN("#2563eb"),padding:"4px 10px",fontSize:11}}>مشاهده</button></td>
        </tr>)}</tbody></table></div>}
      {view&&<RegisterCloseModal day={view.date} existing={view} onClose={()=>setView(null)}/>}
    </div>);
}

export function PosSection({onNavigate}){
  const skin=useSkin();
  const [tariff]=useTariffData();
  const [stock]=useInventory();
  const [customers]=useCustomers();
  const [cfg,setCfg]=useState(getPosCfg);
  const saveCfg=(n)=>{setCfg(n);lsWrite(POS_KEY,n);};
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const [view,setView]=useState("sell");
  const [tab,setTab]=useState("fav");
  const [q,setQ]=useState("");
  const [cart,setCart]=useState([]);
  const [customerId,setCustomerId]=useState("");
  const [discount,setDiscount]=useState("");
  const [pm,setPm]=useState("cash");
  const [split,setSplit]=useState(false);
  const [rows,setRows]=useState([]);
  const [dueDate,setDueDate]=useState("");
  const [notes,setNotes]=useState("");
  const [err,setErr]=useState("");
  const [done,setDone]=useState(null);
  const [closeOpen,setCloseOpen]=useState(false);
  const [nc,setNc]=useState({name:"",price:"",cost:""});
  const [costQ,setCostQ]=useState("");

  const catalog=buildPosCatalog(tariff,stock,getTopupCatalog(),cfg);
  const today=todayIso();
  const day=registerDaySummary(today);
  const closing=getClosings().find(c=>c.date===today);
  const afterClose=closing?getSales().filter(s=>!s.cancelled&&s.date===today&&Math.floor(s.id/1000)>closing.closedAt).length:0;
  const cust=customers.find(c=>String(c.id)===String(customerId));
  const avail=PAY_METHODS.filter(m=>m.key!=="free"&&(customerId||(m.key!=="credit"&&m.key!=="wallet")));
  const pmEff=avail.some(m=>m.key===pm)?pm:"cash";

  // — catalog list
  const sold=posSoldCounts();
  const term=normFa(q.trim());
  let list;
  if(term)list=catalog.filter(i=>normFa(i.name).includes(term)||normFa(i.group).includes(term));
  else if(tab==="fav"){
    const pinned=cfg.fav.map(k=>catalog.find(i=>i.key===k)).filter(Boolean);
    const top=catalog.filter(i=>!cfg.fav.includes(i.key)&&(sold[i.match]||0)>0).sort((a,b)=>(sold[b.match]||0)-(sold[a.match]||0)).slice(0,Math.max(0,12-pinned.length));
    list=[...pinned,...top];
  }else list=catalog.filter(i=>i.kind===tab);
  const groups=[];list.forEach(i=>{let g=groups.find(x=>x.name===i.group);if(!g){g={name:i.group,items:[]};groups.push(g);}g.items.push(i);});
  const toggleFav=(k)=>saveCfg({...cfg,fav:cfg.fav.includes(k)?cfg.fav.filter(x=>x!==k):[...cfg.fav,k]});

  // — cart
  const add=(it)=>{setDone(null);setErr("");setCart(c=>{const ex=c.find(l=>l.key===it.key);if(ex)return c.map(l=>l===ex?{...l,qty:l.qty+1}:l);return[...c,{id:uid(),key:it.key,kind:it.kind,name:it.name,title:it.title||"",op:it.op||"",qty:1,price:it.price,cost:it.cost,stockId:it.stockId||"",category:it.category||it.name}];});};
  const addOpen=()=>{setDone(null);setCart(c=>[...c,{id:uid(),key:"o:"+uid(),open:true,kind:"custom",name:"",qty:1,price:"",cost:0}]);};
  const setLine=(id,patch)=>setCart(c=>c.map(l=>l.id===id?{...l,...patch}:l));
  const delLine=(id)=>setCart(c=>c.filter(l=>l.id!==id));
  const recipes=getRecipes();
  const lineCost=(l)=>{let c=(Number(l.cost)||0)*(Number(l.qty)||0);recipesForLine({category:l.name,desc:l.name},recipes).forEach(r=>(r.components||[]).forEach(cp=>{const it=stock.find(s=>String(s.id)===String(cp.itemId));if(it)c+=(Number(it.unitCost)||0)*(Number(cp.qty)||0)*(Number(l.qty)||0);}));return c;};
  const subtotal=cart.reduce((s,l)=>s+(Number(l.qty)||0)*(Number(l.price)||0),0);
  const disc=Math.min(Math.max(0,Number(discount)||0),subtotal);
  const total=subtotal-disc;
  const cost=cart.reduce((s,l)=>s+lineCost(l),0);
  const profit=total-cost;
  const payments=split?rows.map(r=>({method:r.method,amount:Number(r.amount)||0})):(pmEff==="credit"?[]:[{method:pmEff,amount:total}]);
  const paidSum=payments.filter(p=>p.method!=="credit").reduce((s,p)=>s+p.amount,0);
  const remaining=Math.max(0,total-paidSum);
  const stockOf=(l)=>{const it=stock.find(s=>String(s.id)===l.stockId);return it?Number(it.qty)||0:0;};
  const clubI=cust?clubInfo(cust):null;
  const loyal=cust&&cust.discountRule&&cust.discountRule.enabled&&(cust.serviceHistory||[]).length>=Number(cust.discountRule.threshold)?Number(cust.discountRule.percent)||0:0;
  const autoPct=Math.max(loyal,clubI?clubI.percent:0);

  const reset=()=>{setCart([]);setDiscount("");setCustomerId("");setPm("cash");setSplit(false);setRows([]);setDueDate("");setNotes("");setErr("");setQ("");};
  const submit=()=>{
    setErr("");
    if(!cart.length){setErr("سبد خالی است — از لیست روبه‌رو مورد را انتخاب کنید");return;}
    const bad=cart.find(l=>!String(l.name).trim()||!(Number(l.qty)>0)||!(Number(l.price)>0));
    if(bad){setErr(!String(bad.name).trim()?"نام مورد دلخواه را وارد کنید":`قیمت و تعداد «${bad.name}» را کامل کنید`);return;}
    const over=cart.find(l=>l.kind==="product"&&l.qty>stockOf(l));
    if(over){setErr(`موجودی «${over.name}» کافی نیست (موجودی: ${toFA(stockOf(over))})`);return;}
    if(!customerId&&(remaining>0||payments.some(p=>p.method==="wallet"||p.method==="credit"))){setErr("برای نسیه، کیف پول یا پرداخت ناقص، مشتری را انتخاب کنید");return;}
    if(split&&paidSum>total){setErr("مجموع پرداخت‌ها از مبلغ فاکتور بیشتر است");return;}
    const kinds=[...new Set(cart.map(l=>l.kind==="topup"?"topup":l.kind==="product"?"product":"service"))];
    const kind=kinds.length===1&&kinds[0]!=="service"?kinds[0]:"pos";
    const items=cart.map(l=>{
      const base={desc:String(l.name).trim(),qty:Number(l.qty),price:Number(l.price)};
      if(l.kind==="product")return{...base,title:base.desc,category:l.category,stockId:l.stockId,stockQty:Number(l.qty),cost:0,buy:Number(l.cost)||0};
      if(l.kind==="topup")return{...base,title:l.title,op:l.op,category:TOPUP_CAT,cost:(Number(l.cost)||0)*Number(l.qty),buy:Number(l.cost)||0};
      return{...base,category:base.desc,cost:(Number(l.cost)||0)*Number(l.qty),buy:Number(l.cost)||0};
    });
    const r=createSale({customerId:customerId||undefined,walkIn:!customerId,kind,source:"pos",skipOrder:true,discount:disc,notes,dueDate,items,payments});
    if(!r.ok){setErr(r.error||"ثبت انجام نشد");return;}
    setDone({sale:r.sale,profit:r.sale.total-(r.sale.costTotal||0),warnings:r.warnings||[],reward:r.clubReward||0,customer:!!customerId});
    reset();
  };

  const chip=(on,col="#2563eb")=>({...BTN(on?col:"var(--bg-card)",on?"#fff":"var(--text-secondary)"),padding:"7px 13px",fontSize:12});
  const lbl={fontSize:12,color:"var(--text-secondary)"};
  const TABS_=[["fav","⭐ پرکاربرد"],["service","🛠️ خدمات"],["print","🖨️ پرینت و اسکن"],["product","📦 کالا"],["topup","📱 شارژ و بسته"],["custom","⚡ خدمات من"]];
  const stat=(l,v,c,t)=><div style={{background:"var(--bg-card)",borderRadius:11,padding:"9px 12px",minWidth:120,flex:"1 1 120px"}}><div style={{fontSize:10,color:"var(--text-muted)"}}>{l}</div><div data-testid={t} style={{fontSize:14,fontWeight:800,color:c||"var(--text-primary)",marginTop:2}}>{v}</div></div>;
  const rowInp={...INP,marginTop:0,padding:"6px 8px",fontSize:13};

  return(
    <div data-testid="pos">
      {skin==="orange"&&<QuickSteps hasItems={cart.length>0} hasCustomer={!!customerId}/>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"stretch"}}>
        {stat("فروش امروز",fmtM(day.total),"#60a5fa","pos-today")}
        {stat("تعداد فاکتور",toFA(day.count),null,"pos-count")}
        {stat("نقد دریافتی",fmtM(day.methods.cash||0),"#4ade80","pos-cash")}
        {stat("کارتخوان",fmtM(day.methods.posTotal||day.methods.pos||0),"#4ade80","pos-pos")}
        {stat("بدهکار",fmtM(day.debt),day.debt>0?"#fb923c":null,"pos-debt")}
        <button data-testid="pos-close-btn" onClick={()=>setCloseOpen(true)} style={{...BTN("linear-gradient(135deg,#be123c,#f43f5e)"),padding:"10px 18px",fontSize:14,flex:"0 0 auto"}}>🧮 بستن صندوق</button>
      </div>
      {closing&&<div style={{background:afterClose>0?"#422006":"#052e16",color:afterClose>0?"#fcd34d":"#86efac",borderRadius:10,padding:"8px 12px",fontSize:12,marginBottom:10}}>{afterClose>0?`⚠️ صندوق امروز بسته شده بود و بعد از آن ${toFA(afterClose)} فروش ثبت شده — برای دقیق‌بودن گزارش، دوباره صندوق را ببندید.`:"🔒 صندوق امروز بسته شده است."}</div>}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {[["sell","🛒 فروش"],["history","📜 سوابق بستن صندوق"],["settings","⚙️ تنظیمات صندوق"]].map(([k,l])=><button key={k} data-testid={"pos-view-"+k} onClick={()=>setView(k)} style={chip(view===k,"#7c3aed")}>{l}</button>)}
      </div>

      {view==="sell"&&(<div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-start"}}>
        <div style={{flex:"2 1 380px",minWidth:0}}>
          <input data-testid="pos-search" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&list[0]){e.preventDefault();add(list[0]);setQ("");}}} placeholder="🔍 جستجوی خدمت، کالا یا شارژ… (Enter = افزودن اولین نتیجه)" style={{...INP,marginTop:0,marginBottom:10}}/>
          {!term&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {TABS_.map(([k,l])=><button key={k} data-testid={"pos-tab-"+k} onClick={()=>setTab(k)} style={chip(tab===k)}>{l}</button>)}
          </div>}
          {list.length===0&&<div style={{textAlign:"center",color:"var(--text-dim)",fontSize:12,padding:"26px 10px",background:"var(--bg-card)",borderRadius:12,lineHeight:2}}>
            {term?"موردی پیدا نشد.":tab==="fav"?"هنوز مورد پرکاربردی نیست. با ⭐ روی هر مورد آن را سنجاق کنید؛ پرفروش‌ها هم بعد از چند فروش خودکار اینجا می‌آیند.":tab==="custom"?"خدمت سریعی تعریف نشده — از «تنظیمات صندوق» مثلاً «ثبت‌نام دانشگاه آزاد» را اضافه کنید.":tab==="product"?"انبار خالی است.":"موردی نیست."}</div>}
          {groups.map(g=>(
            <div key={g.name} style={{marginBottom:12}}>
              {(groups.length>1||term)&&<div style={{fontSize:12,fontWeight:700,color:"var(--accent-light)",margin:"4px 0 6px"}}>{g.name}</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
                {g.items.map(it=>{
                  const out=it.kind==="product"&&it.stock<=0;const fav=cfg.fav.includes(it.key);
                  return(
                  <div key={it.key} style={{position:"relative"}}>
                    <button data-testid="pos-item" data-name={it.name} onClick={()=>add(it)} style={{width:"100%",height:"100%",textAlign:"right",background:"var(--bg-card)",color:"var(--text-primary)",border:"1px solid var(--border)",borderRadius:11,padding:"10px 10px 9px",cursor:"pointer",fontFamily:"inherit",opacity:out?0.5:1,display:"flex",flexDirection:"column",gap:5,justifyContent:"space-between"}}>
                      <span style={{fontSize:12,fontWeight:600,lineHeight:1.6,paddingLeft:18}}>{it.name}</span>
                      <span style={{fontSize:12,color:it.price>0?"#4ade80":"#fbbf24",fontWeight:700}}>{it.price>0?fmtM(it.price):"قیمت را وارد کنید"}</span>
                      {it.kind==="product"&&<span style={{fontSize:10,color:it.stock<=0?"#f87171":"var(--text-muted)"}}>موجودی: {toFA(it.stock)} {it.unit}</span>}
                    </button>
                    <button title="سنجاق به پرکاربردها" onClick={()=>toggleFav(it.key)} style={{position:"absolute",top:5,left:5,background:"transparent",border:"none",cursor:"pointer",fontSize:13,padding:2,opacity:fav?1:0.35}}>{fav?"⭐":"☆"}</button>
                  </div>);})}
              </div>
            </div>))}
        </div>

        <div data-testid="pos-cart" style={{flex:"1 1 320px",minWidth:0,background:"var(--bg-card)",borderRadius:14,padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>🧾 فاکتور جاری</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={addOpen} data-testid="pos-open-line" style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"5px 10px",fontSize:11}}>＋ مبلغ دلخواه</button>
              {cart.length>0&&<button onClick={reset} style={{...BTN("#450a0a","#f87171"),padding:"5px 10px",fontSize:11}}>خالی‌کردن</button>}
            </div>
          </div>
          {done&&<div data-testid="pos-done" style={{background:"#052e16",borderRadius:11,padding:"10px 12px",marginBottom:10,fontSize:12,lineHeight:2,color:"#bbf7d0"}}>
            <div style={{fontWeight:800,fontSize:13}}>✅ فروش ثبت شد — فاکتور شماره {toFA(done.sale.number)} · {fmtM(done.sale.total)}</div>
            <div>✓ فاکتور ساخته شد &nbsp; ✓ درآمد ثبت شد &nbsp; ✓ نقد/کارتخوان صندوق به‌روز شد</div>
            <div>✓ سود ناخالص {fmtM(done.profit)} &nbsp; ✓ در گزارش فروش حساب شد{done.customer?" · ✓ سابقه و حساب مشتری ثبت شد":""}</div>
            {done.reward>0&&<div>🎁 اعتبار باشگاه مشتریان: {fmtM(done.reward)}</div>}
            {done.warnings.map((w,i)=><div key={i} style={{color:"#fcd34d"}}>⚠️ {w}</div>)}
            <button onClick={()=>onNavigate&&onNavigate("invoice")} style={{...BTN("transparent","#86efac"),padding:0,fontSize:11,textDecoration:"underline"}}>مشاهده / چاپ فاکتور</button>
          </div>}
          {cart.length===0?<div style={{textAlign:"center",color:"var(--text-dim)",fontSize:12,padding:"22px 0"}}>سبد خالی است</div>:
          cart.map(l=>(
            <div key={l.id} data-testid="pos-line" style={{background:"var(--bg-app)",borderRadius:10,padding:"8px 10px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:6,alignItems:"center"}}>
                {l.open?<input data-testid="pos-line-name" value={l.name} onChange={e=>setLine(l.id,{name:e.target.value})} placeholder="شرح خدمت" style={{...rowInp,flex:1}}/>:<span style={{fontSize:12,fontWeight:600,lineHeight:1.6}}>{l.name}</span>}
                <button onClick={()=>delLine(l.id)} style={{background:"transparent",border:"none",color:"#f87171",cursor:"pointer",fontSize:14}}>✕</button>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",marginTop:6}}>
                <button onClick={()=>setLine(l.id,{qty:Math.max(1,(Number(l.qty)||1)-1)})} style={{...BTN("var(--border)","var(--text-primary)"),padding:"2px 9px"}}>−</button>
                <input data-testid="pos-line-qty" type="number" min="1" value={l.qty} onChange={e=>setLine(l.id,{qty:e.target.value===""?"":Number(e.target.value)})} style={{...rowInp,width:54,textAlign:"center"}}/>
                <button onClick={()=>setLine(l.id,{qty:(Number(l.qty)||0)+1})} style={{...BTN("var(--border)","var(--text-primary)"),padding:"2px 9px"}}>＋</button>
                <span style={{fontSize:11,color:"var(--text-muted)"}}>×</span>
                <input data-testid="pos-line-price" type="number" value={l.price} onChange={e=>setLine(l.id,{price:e.target.value})} placeholder="قیمت" style={{...rowInp,flex:1,minWidth:0}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:5,color:"var(--text-muted)"}}>
                <span>{l.kind==="product"&&Number(l.qty)>stockOf(l)?<b style={{color:"#f87171"}}>⚠️ موجودی {toFA(stockOf(l))}</b>:l.kind==="product"?`موجودی ${toFA(stockOf(l))}`:""}</span>
                <b style={{color:"var(--text-primary)"}}>{fmtM((Number(l.qty)||0)*(Number(l.price)||0))}</b>
              </div>
            </div>))}

          <label style={{...lbl,display:"block",marginTop:8}}>مشتری (خالی = مشتری نقدی)
            <select data-testid="pos-customer" value={customerId} onChange={e=>{setCustomerId(e.target.value);setDiscount("");}} style={INP}>
              <option value="">مشتری نقدی</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.phone?` · ${c.phone}`:""}</option>)}
            </select>
          </label>
          {cust&&autoPct>0&&subtotal>0&&<button onClick={()=>setDiscount(String(Math.round(subtotal*autoPct/100)))} style={{...BTN("#14532d","#bbf7d0"),padding:"5px 10px",fontSize:11,marginTop:6}}>🏅 اعمال تخفیف {toFA(autoPct)}٪ مشتری ({clubI&&clubI.percent>=loyal?clubI.tier.name:"وفاداری"})</button>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
            <label style={lbl}>تخفیف (ریال)<input data-testid="pos-discount" type="number" value={discount} onChange={e=>setDiscount(e.target.value)} style={INP}/></label>
            <label style={lbl}>توضیحات / شماره موبایل<input value={notes} onChange={e=>setNotes(e.target.value)} style={INP}/></label>
          </div>

          <div style={{fontSize:12,color:"var(--text-secondary)",margin:"10px 0 6px"}}>روش پرداخت</div>
          {!split?<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {avail.map(m=><button key={m.key} data-testid={"pos-pm-"+m.key} onClick={()=>setPm(m.key)} style={{...BTN(pmEff===m.key?"#16a34a":"var(--bg-app)",pmEff===m.key?"#fff":"var(--text-secondary)"),padding:"7px 11px",fontSize:12}}>{m.icon} {m.label}</button>)}
            <button onClick={()=>{setSplit(true);setRows([{key:uid(),method:pmEff==="credit"?"cash":pmEff,amount:String(total)}]);}} style={{...BTN("transparent","var(--accent-light)"),padding:"7px 8px",fontSize:11}}>تقسیم پرداخت</button>
          </div>:<div>
            {rows.map(r=><div key={r.key} style={{display:"flex",gap:6,marginBottom:6}}>
              <select value={r.method} onChange={e=>setRows(rs=>rs.map(x=>x.key===r.key?{...x,method:e.target.value}:x))} style={{...rowInp,flex:1}}>{avail.filter(m=>m.key!=="credit").map(m=><option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}</select>
              <input data-testid="pos-split-amt" type="number" value={r.amount} onChange={e=>setRows(rs=>rs.map(x=>x.key===r.key?{...x,amount:e.target.value}:x))} style={{...rowInp,flex:1}}/>
              <button onClick={()=>setRows(rs=>rs.filter(x=>x.key!==r.key))} style={{background:"transparent",border:"none",color:"#f87171",cursor:"pointer"}}>✕</button>
            </div>)}
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setRows(rs=>[...rs,{key:uid(),method:"pos",amount:String(Math.max(0,total-paidSum))}])} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"5px 10px",fontSize:11}}>＋ ردیف پرداخت</button>
              <button onClick={()=>setSplit(false)} style={{...BTN("transparent","var(--accent-light)"),padding:"5px 8px",fontSize:11}}>بازگشت به پرداخت ساده</button>
            </div>
          </div>}
          {remaining>0&&<label style={{...lbl,display:"block",marginTop:8}}>مانده {fmtM(remaining)} بدهی ثبت می‌شود — سررسید (اختیاری)
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={INP}/></label>}

          <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px",marginTop:10,fontSize:12,lineHeight:2}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>جمع</span><b>{fmtM(subtotal)}</b></div>
            {disc>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>تخفیف</span><b>− {fmtM(disc)}</b></div>}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:15}}><span>قابل پرداخت</span><b data-testid="pos-total" style={{color:"#4ade80"}}>{fmtM(total)}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",color:"var(--text-muted)"}}><span>قیمت خرید / هزینه</span><span>{fmtM(cost)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",color:profit>=0?"#4ade80":"#f87171"}}><span>سود ناخالص</span><b data-testid="pos-profit">{fmtM(profit)}</b></div>
          </div>
          {err&&<div data-testid="pos-err" style={{color:"#f87171",fontSize:12,marginTop:8}}>{err}</div>}
          <button data-testid="pos-submit" onClick={submit} style={{...BTN("#16a34a"),width:"100%",padding:13,fontSize:15,marginTop:10}}>✅ ثبت فروش{total>0?` — ${fmtM(total)}`:""}</button>
        </div>
      </div>)}

      {view==="history"&&<RegisterHistory/>}

      {view==="settings"&&(<div style={{maxWidth:760}}>
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:6}}>⚡ خدمات سریع من</div>
          <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:10,lineHeight:1.9}}>خدماتی که در تعرفه نیستند، مثل «ثبت‌نام دانشگاه آزاد». قیمت‌ها به ریال است. «قیمت خرید» همان هزینه‌ای است که برای هر بار انجام خدمت می‌پردازید (اگر ندارد صفر بگذارید).</div>
          {cfg.custom.map(c=><div key={c.id} data-testid="pos-custom-row" style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 34px",gap:6,marginBottom:6}}>
            <input value={c.name} onChange={e=>saveCfg({...cfg,custom:cfg.custom.map(x=>x.id===c.id?{...x,name:e.target.value}:x)})} style={rowInp}/>
            <input type="number" value={c.price} onChange={e=>saveCfg({...cfg,custom:cfg.custom.map(x=>x.id===c.id?{...x,price:Number(e.target.value)||0}:x)})} style={rowInp}/>
            <input type="number" value={c.cost} onChange={e=>saveCfg({...cfg,custom:cfg.custom.map(x=>x.id===c.id?{...x,cost:Number(e.target.value)||0}:x)})} style={rowInp}/>
            <button onClick={()=>saveCfg({...cfg,custom:cfg.custom.filter(x=>x.id!==c.id),fav:cfg.fav.filter(k=>k!=="c:"+c.id)})} style={{...BTN("#450a0a","#f87171"),padding:"4px 0"}}>✕</button>
          </div>)}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 80px",gap:6,marginTop:8}}>
            <input data-testid="pos-nc-name" value={nc.name} onChange={e=>setNc({...nc,name:e.target.value})} placeholder="نام خدمت" style={rowInp}/>
            <input data-testid="pos-nc-price" type="number" value={nc.price} onChange={e=>setNc({...nc,price:e.target.value})} placeholder="قیمت فروش" style={rowInp}/>
            <input data-testid="pos-nc-cost" type="number" value={nc.cost} onChange={e=>setNc({...nc,cost:e.target.value})} placeholder="قیمت خرید" style={rowInp}/>
            <button data-testid="pos-nc-add" onClick={()=>{if(!nc.name.trim()||!(Number(nc.price)>0))return;const id=uid();saveCfg({...cfg,custom:[...cfg.custom,{id,name:nc.name.trim(),price:Number(nc.price),cost:Number(nc.cost)||0}],fav:[...cfg.fav,"c:"+id]});setNc({name:"",price:"",cost:""});}} style={{...BTN("#2563eb"),padding:"6px 0",fontSize:12}}>＋ افزودن</button>
          </div>
          <div style={{fontSize:10,color:"var(--text-dim)",marginTop:6}}>ستون‌ها: نام · قیمت فروش · قیمت خرید</div>
        </div>
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:6}}>💲 قیمت خرید خدمات تعرفه</div>
          <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:10,lineHeight:1.9}}>اگر برای خدمتی هزینه مستقیم دارید (مثلاً کارمزد سامانه)، اینجا بنویسید تا سود ناخالص درست حساب شود. مواد مصرفی انبار جدا و خودکار کسر می‌شود.</div>
          <input value={costQ} onChange={e=>setCostQ(e.target.value)} placeholder="جستجوی خدمت…" style={{...rowInp,marginBottom:8,width:"100%",boxSizing:"border-box"}}/>
          {catalog.filter(i=>(i.kind==="service"||i.kind==="print")&&(!costQ.trim()||normFa(i.name).includes(normFa(costQ.trim())))).slice(0,25).map(i=><div key={i.key} style={{display:"grid",gridTemplateColumns:"3fr 1fr 1fr",gap:6,alignItems:"center",marginBottom:5,fontSize:12}}>
            <span>{i.name}</span><span style={{color:"var(--text-muted)"}}>{fmtM(i.price)}</span>
            <input type="number" value={cfg.costs[i.key]||""} placeholder="خرید" onChange={e=>saveCfg({...cfg,costs:{...cfg.costs,[i.key]:Number(e.target.value)||0}})} style={rowInp}/>
          </div>)}
        </div>
      </div>)}

      {closeOpen&&<RegisterCloseModal day={today} onClose={()=>setCloseOpen(false)}/>}
    </div>
  );
}
