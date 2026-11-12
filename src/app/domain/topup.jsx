// Generated from App.jsx by the module split (v1.50.0). Section: topup
import OperatorLogo, { OperatorLogoManager } from "../components/OperatorLogo.jsx";
import { OPERATOR_NAMES } from "./operatorLogos.js";
import React, { useState, useEffect, useRef } from "react";
import { fmtCompact, fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "./backup.js";
import { BTN, INP, INV_PERIODS, TOPUP_CAT } from "../core/constants.js";
import { useCustomers } from "../pages/customers.jsx";
import { isoDaysAgo } from "../pages/dashboard.jsx";
import { ExportBar } from "../components/reportExport.jsx";
import { PAY_METHODS, createSale, getSales, lsRead, lsWrite, uid, useDataSync } from "./sales.jsx";


// ══════════════════════════════════════════════════════════════════
// شارژ و بسته اینترنت + گزارش سود واقعی (قیمت خرید و فروش)
// ══════════════════════════════════════════════════════════════════
const TOPUP_KEY="cafenet_topup_catalog";

const TOPUP_OPS=OPERATOR_NAMES;                     // همراه اول، ایرانسل، رایتل، شاتل موبایل، آپتل، سامانتل، لوتوس‌تل، انارستان، آذرتل، سایر

function defaultTopupCatalog(){
  const items=[];
  ["همراه اول","ایرانسل","رایتل"].forEach(op=>[100000,200000,500000,1000000].forEach(face=>
    items.push({id:uid(),type:"charge",operator:op,title:`شارژ ${toFA((face/10).toLocaleString("en-US"))} تومانی`,buy:Math.round(face*0.97),sell:sellFromBuy(Math.round(face*0.97),10)})));
  [["همراه اول","بسته ۳ گیگ ۳۰ روزه (نمونه)",900000,1000000],["ایرانسل","بسته ۵ گیگ ۳۰ روزه (نمونه)",1300000,1450000],["رایتل","بسته ۱۰ گیگ ۳۰ روزه (نمونه)",2300000,2500000]]
    .forEach(([operator,title,buy])=>items.push({id:uid(),type:"package",operator,title,buy,sell:sellFromBuy(buy,10)}));
  return items;
}

const TOPUP_MARGIN_KEY="cafenet_topup_margin";

function getTopupMargin(){const v=Number(lsRead(TOPUP_MARGIN_KEY,10));return Number.isFinite(v)&&v>=0?v:10;}

const sellFromBuy=(buy,pct)=>Math.round((Number(buy)||0)*(1+(Number(pct)||0)/100));

const pctFromPrices=(buy,sell)=>Number(buy)>0?Math.round((Number(sell)-Number(buy))/Number(buy)*1000)/10:0;

export function getTopupCatalog(){
  const v=lsRead(TOPUP_KEY,null);
  if(Array.isArray(v))return v;
  const d=defaultTopupCatalog();lsWrite(TOPUP_KEY,d);return d;
}

export function ReportTable({s}){
  return(
    <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>{s.name} <span style={{fontSize:11,color:"var(--text-muted)"}}>({toFA(s.rows.length)})</span></div>
      {s.rows.length===0?<div style={{fontSize:12,color:"var(--text-dim)",padding:"10px 0"}}>موردی وجود ندارد</div>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:560}}>
        <thead><tr>{s.head.map(h=><th key={h} style={{textAlign:"right",padding:"7px 8px",borderBottom:"1px solid var(--border)",color:"var(--text-muted)",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
        <tbody>{s.rows.map((r,ri)=><tr key={ri}>{r.map((c,i)=><td key={i} style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap",color:s.signed&&s.signed.includes(i)&&typeof c==="number"?(c>=0?"#4ade80":"#f87171"):"var(--text-primary)"}}>{typeof c==="number"?(s.money&&s.money.includes(i)?fmtM(c):toFA(Math.round(c*100)/100)):c}</td>)}</tr>)}</tbody>
      </table></div>}
    </div>);
}

// Per-line real profit: net sale value (after discount) − purchase cost.
function realProfitLines(from,onlyTopup){
  const out=[];
  getSales().forEach(s=>{
    if(s.cancelled||(from&&(s.date||"")<from))return;
    const lines=s.lines||[];
    const sub=lines.reduce((a,l)=>a+l.qty*l.price,0)||1;
    const own=lines.map(l=>(Number(l.cost)||0)+(Number(l.autoCost)||0));
    const nets=lines.map(l=>l.qty*l.price*((s.total||0)/sub));
    const sumNet=nets.reduce((a,b)=>a+b,0)||1;
    const rest=Math.max(0,(Number(s.costTotal)||0)-own.reduce((a,b)=>a+b,0));
    lines.forEach((l,i)=>{
      if(onlyTopup&&s.kind!=="topup"&&l.category!==TOPUP_CAT)return;
      const cost=own[i]+rest*nets[i]/sumNet,net=nets[i],profit=net-cost;
      out.push({date:s.date,number:s.number,customer:s.customerName,item:l.title||l.desc,category:l.category||"—",op:l.op||"",qty:l.qty,buyUnit:l.qty?cost/l.qty:0,sellUnit:l.qty?net/l.qty:0,sell:net,cost,profit,margin:net>0?profit/net*100:0});
    });
  });
  return out.sort((a,b)=>(b.date||"").localeCompare(a.date||"")||b.number-a.number);
}

function realProfitSections(rows,periodLabel){
  const sum=(arr,k)=>arr.reduce((s,r)=>s+r[k],0);
  const group=(keyFn)=>{const m={};rows.forEach(r=>{const k=keyFn(r);const o=m[k]||(m[k]={qty:0,sell:0,cost:0,profit:0});o.qty+=r.qty;o.sell+=r.sell;o.cost+=r.cost;o.profit+=r.profit;});return Object.entries(m).sort((a,b)=>b[1].profit-a[1].profit);};
  const gRow=([k,o])=>[k,o.qty,o.cost,o.sell,o.profit,o.sell>0?Math.round(o.profit/o.sell*1000)/10:0];
  const gHead=(f)=>[f,"تعداد","قیمت خرید (ریال)","قیمت فروش (ریال)","سود واقعی (ریال)","حاشیه سود ٪"];
  return[
    {name:`خلاصه به تفکیک محصول — ${periodLabel}`,head:gHead("محصول / خدمت"),rows:group(r=>r.item).map(gRow),money:[2,3,4],signed:[4]},
    {name:"خلاصه به تفکیک اپراتور / دسته",head:gHead("اپراتور / دسته"),rows:group(r=>r.op||r.category).map(gRow),money:[2,3,4],signed:[4]},
    {name:"ریز فروش‌ها",head:["تاریخ","فاکتور","مشتری","محصول / خدمت","تعداد","خرید واحد (ریال)","فروش واحد (ریال)","جمع خرید (ریال)","جمع فروش (ریال)","سود واقعی (ریال)","حاشیه ٪"],
      rows:rows.map(r=>[jalaliLabel(r.date),r.number,r.customer,r.item,r.qty,Math.round(r.buyUnit),Math.round(r.sellUnit),Math.round(r.cost),Math.round(r.sell),Math.round(r.profit),Math.round(r.margin*10)/10]),money:[5,6,7,8,9],signed:[9]},
  ];
}

export function RealProfitReport({defaultOnlyTopup=false}){
  const [period,setPeriod]=useState("30");
  const [onlyTopup,setOnlyTopup]=useState(defaultOnlyTopup);
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const from=period==="all"?"":isoDaysAgo(Number(period));
  const periodLabel=(INV_PERIODS.find(p=>p[0]===period)||[])[1];
  const rows=realProfitLines(from,onlyTopup);
  const sell=rows.reduce((s,r)=>s+r.sell,0),cost=rows.reduce((s,r)=>s+r.cost,0),profit=sell-cost;
  const margin=sell>0?Math.round(profit/sell*1000)/10:0;
  const secs=realProfitSections(rows,periodLabel);
  const kp=(l,v,c)=><div style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>{l}</div><div style={{fontSize:16,fontWeight:800,marginTop:4,color:c||"var(--text-primary)"}}>{v}</div></div>;
  return(
    <div data-testid="real-profit">
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {INV_PERIODS.map(([k,l])=><button key={k} onClick={()=>setPeriod(k)} style={{...BTN(period===k?"#2563eb":"var(--bg-card)",period===k?"#fff":"var(--text-secondary)"),padding:"7px 12px",fontSize:12}}>{l}</button>)}
        <span style={{width:10}}/>
        {[[false,"همه فروش‌ها"],[true,"فقط شارژ و اینترنت"]].map(([v,l])=><button key={l} onClick={()=>setOnlyTopup(v)} style={{...BTN(onlyTopup===v?"#7c3aed":"var(--bg-card)",onlyTopup===v?"#fff":"var(--text-secondary)"),padding:"7px 12px",fontSize:12}}>{l}</button>)}
      </div>
      <ExportBar title={`گزارش سود واقعی (${onlyTopup?"شارژ و اینترنت":"همه فروش‌ها"}) — ${periodLabel}`} fileBase="real-profit" sections={secs} kpis={[["قیمت فروش",fmtM(sell)],["قیمت خرید",fmtM(cost)],["سود واقعی",fmtM(profit)],["حاشیه سود",`${toFA(margin)}٪`]]}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:14}}>
        {kp("جمع قیمت فروش",fmtM(sell),"#60a5fa")}
        {kp("جمع قیمت خرید",fmtM(cost),"#fdba74")}
        {kp("سود واقعی",fmtM(profit),profit>=0?"#4ade80":"#f87171")}
        {kp("حاشیه سود",`${toFA(margin)}٪`,"#22d3ee")}
      </div>
      {secs.map(s=><ReportTable key={s.name} s={s}/>)}
      <div style={{fontSize:11,color:"var(--text-dim)",lineHeight:1.9}}>سود واقعی = قیمت فروش (پس از تخفیف) − قیمت خرید (هزینه مستقیم ثبت‌شده در فروش، شامل مواد مصرفی انبار). فروش نسیه هم هنگام ثبت فاکتور در سود حساب می‌شود.</div>
    </div>);
}

export function TopupSection({onNavigate}){
  const [tab,setTab]=useState("sell");
  const [catalog,setCatalog]=useState(()=>getTopupCatalog());
  useEffect(()=>{lsWrite(TOPUP_KEY,catalog);},[catalog]);
  const [customers]=useCustomers();
  const [type,setType]=useState("charge");
  const [operator,setOperator]=useState("همراه اول");
  const [itemId,setItemId]=useState("");
  const [title,setTitle]=useState("");
  const [qty,setQty]=useState("1");
  const [buy,setBuy]=useState("");
  const [sell,setSell]=useState("");
  const [margin,setMargin]=useState(()=>getTopupMargin());
  const [pct,setPct]=useState(()=>String(getTopupMargin()));
  const [phone,setPhone]=useState("");
  const [customerId,setCustomerId]=useState("");
  const [method,setMethod]=useState("cash");
  const [err,setErr]=useState("");
  const [done,setDone]=useState(null);
  const [,setTick]=useState(0);useDataSync(()=>setTick(t=>t+1));
  const opts=catalog.filter(c=>c.type===type&&c.operator===operator);
  const saveMargin=(v)=>{setMargin(v);lsWrite(TOPUP_MARGIN_KEY,Math.max(0,Number(v)||0));};
  const pick=(id)=>{setItemId(id);const it=catalog.find(c=>String(c.id)===String(id));if(it){setTitle(it.title);setBuy(String(it.buy));setSell(String(it.sell));setPct(String(pctFromPrices(it.buy,it.sell)));}};
  const onBuy=(v)=>{setBuy(v);if(Number(v)>0)setSell(String(sellFromBuy(v,pct)));};
  const onPct=(v)=>{setPct(v);if(Number(buy)>0&&v!=="")setSell(String(sellFromBuy(buy,v)));};
  const onSell=(v)=>{setSell(v);if(Number(buy)>0&&v!=="")setPct(String(pctFromPrices(buy,v)));};
  const q=Math.max(0,Number(qty)||0),b=Math.max(0,Number(buy)||0),s=Math.max(0,Number(sell)||0);
  const total=q*s,profit=q*(s-b);
  const submit=()=>{
    setErr("");
    if(!title.trim()){setErr("نام محصول را انتخاب یا وارد کنید");return;}
    if(!(q>0)||!(s>0)){setErr("تعداد و قیمت فروش باید بیشتر از صفر باشد");return;}
    if(!customerId&&(method==="credit"||method==="wallet")){setErr("برای نسیه یا کیف پول، مشتری را انتخاب کنید");return;}
    const r=createSale({customerId:customerId||undefined,walkIn:!customerId,kind:"topup",skipOrder:true,notes:phone?`شماره: ${phone}`:"",
      items:[{desc:`${title.trim()} — ${operator}${phone?` (${phone})`:""}`,title:title.trim(),op:operator,qty:q,price:s,buy:b,cost:b*q,category:TOPUP_CAT}],
      payments:method==="credit"?[]:[{method,amount:total}]});
    if(!r.ok){setErr(r.error||"ثبت انجام نشد");return;}
    setDone({sale:r.sale,profit});setPhone("");setQty("1");
  };
  const upd=(id,patch)=>setCatalog(cs=>cs.map(c=>c.id===id?{...c,...patch}:c));
  const addItem=(t)=>setCatalog(cs=>[...cs,{id:uid(),type:t,operator:"همراه اول",title:t==="charge"?"شارژ جدید":"بسته جدید",buy:0,sell:0}]);
  const applyMargin=()=>{if(window.confirm(`قیمت فروش همه محصولات = قیمت خرید + ${toFA(margin)}٪ می‌شود. ادامه می‌دهید؟`))setCatalog(cs=>cs.map(c=>({...c,sell:sellFromBuy(c.buy,margin)})));};
  const recent=getSales().filter(x=>x.kind==="topup"&&!x.cancelled).slice(0,8);
  const lbl={fontSize:12,color:"var(--text-secondary)"};
  const chip=(on,col="#2563eb")=>({...BTN(on?col:"var(--bg-card)",on?"#fff":"var(--text-secondary)"),padding:"8px 14px",fontSize:13});
  return(
    <div data-testid="topup">
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {[["sell","🛒 فروش شارژ و بسته"],["catalog","📋 محصولات و قیمت‌ها"],["profit","💰 سود واقعی"],["logos","🖼️ لوگوی اپراتورها"]].map(([k,l])=><button key={k} data-testid={"topup-tab-"+k} onClick={()=>setTab(k)} style={chip(tab===k)}>{l}</button>)}
      </div>

      {tab==="sell"&&(<div>
        <div style={{background:"var(--bg-card)",borderRadius:14,padding:18,marginBottom:14,maxWidth:640}}>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {[["charge","📱 شارژ"],["package","🌐 بسته اینترنت"]].map(([k,l])=><button key={k} onClick={()=>{setType(k);setItemId("");setTitle("");setBuy("");setSell("");setPct(String(margin));}} style={chip(type===k,"#7c3aed")}>{l}</button>)}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {TOPUP_OPS.map(o=><button key={o} data-testid={"topup-op-"+o} onClick={()=>{setOperator(o);setItemId("");}} style={{...BTN(operator===o?"#0e7490":"var(--bg-app)",operator===o?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12,display:"inline-flex",alignItems:"center",gap:7}}><OperatorLogo name={o} size={22}/>{o}</button>)}
          </div>
          <label style={lbl}>محصول (از لیست)
            <select data-testid="topup-item" value={itemId} onChange={e=>pick(e.target.value)} style={INP}>
              <option value="">— انتخاب کنید یا پایین دستی وارد کنید —</option>
              {opts.map(c=><option key={c.id} value={c.id}>{c.title} — فروش {fmtCompact(c.sell)}</option>)}
            </select>
          </label>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginTop:10}}>
            <label style={lbl}>عنوان<input data-testid="topup-title" value={title} onChange={e=>setTitle(e.target.value)} style={INP}/></label>
            <label style={lbl}>تعداد<input type="number" value={qty} onChange={e=>setQty(e.target.value)} style={INP}/></label>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 90px 1fr",gap:10,marginTop:10}}>
            <label style={lbl}>قیمت خرید واحد (ریال)<input data-testid="topup-buy" type="number" value={buy} onChange={e=>onBuy(e.target.value)} style={INP}/></label>
            <label style={lbl}>سود ٪<input data-testid="topup-pct" type="number" value={pct} onChange={e=>onPct(e.target.value)} style={INP}/></label>
            <label style={lbl}>قیمت فروش واحد (ریال)<input data-testid="topup-sell" type="number" value={sell} onChange={e=>onSell(e.target.value)} style={INP}/></label>
          </div>
          <div style={{fontSize:10,color:"var(--text-dim)",marginTop:4}}>سود پیش‌فرض {toFA(margin)}٪ روی قیمت خرید است؛ با تغییر خرید یا درصد، قیمت فروش خودکار حساب می‌شود و هر دو قابل ویرایش‌اند.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
            <label style={lbl}>شماره موبایل مقصد (اختیاری)<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="۰۹۱۲..." style={INP}/></label>
            <label style={lbl}>مشتری (اختیاری — خالی = نقدی)
              <select value={customerId} onChange={e=>setCustomerId(e.target.value)} style={INP}>
                <option value="">مشتری نقدی</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
            </label>
          </div>
          <label style={{...lbl,display:"block",marginTop:10}}>روش پرداخت
            <select value={method} onChange={e=>setMethod(e.target.value)} style={INP}>
              {PAY_METHODS.filter(m=>m.key!=="free"&&(customerId||(m.key!=="credit"&&m.key!=="wallet"))).map(m=><option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
            </select>
          </label>
          <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px",marginTop:12,fontSize:12,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <span>مبلغ دریافتی: <b>{fmtM(total)}</b></span>
            <span>هزینه خرید: <b>{fmtM(q*b)}</b></span>
            <span style={{color:profit>=0?"#4ade80":"#f87171"}}>سود: <b data-testid="topup-profit">{fmtM(profit)}</b></span>
          </div>
          {err&&<div style={{color:"#f87171",fontSize:12,marginTop:8}}>{err}</div>}
          <button data-testid="topup-submit" onClick={submit} style={{...BTN("#16a34a"),width:"100%",padding:12,marginTop:12}}>ثبت فروش</button>
          {done&&<div data-testid="topup-done" style={{marginTop:10,fontSize:12,color:"#4ade80"}}>✅ فروش ثبت شد — فاکتور #{toFA(done.sale.number)} · سود {fmtM(done.profit)}</div>}
        </div>
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,maxWidth:640}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>آخرین فروش‌ها</div>
          {recent.length===0?<div style={{fontSize:12,color:"var(--text-dim)"}}>هنوز فروشی ثبت نشده</div>:recent.map(x=>{
            const l=(x.lines||[])[0]||{};const c=(Number(x.costTotal)||0);
            return <div key={x.id} style={{display:"flex",justifyContent:"space-between",gap:8,background:"var(--bg-app)",borderRadius:9,padding:"8px 11px",marginBottom:6,fontSize:12}}><span style={{display:"inline-flex",alignItems:"center",gap:8}}><OperatorLogo name={l.op||l.desc} size={20}/>{l.desc} · {jalaliLabel(x.date)}</span><span style={{whiteSpace:"nowrap"}}>{fmtCompact(x.total)} · <b style={{color:"#4ade80"}}>سود {fmtCompact(x.total-c)}</b></span></div>;})}
        </div>
      </div>)}

      {tab==="catalog"&&(<div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={()=>addItem("charge")} style={{...BTN("#2563eb"),padding:"8px 14px",fontSize:12}}>＋ شارژ جدید</button>
          <button onClick={()=>addItem("package")} style={{...BTN("#7c3aed"),padding:"8px 14px",fontSize:12}}>＋ بسته اینترنت جدید</button>
          <button onClick={()=>{if(window.confirm("همه محصولات به حالت پیش‌فرض برمی‌گردد. ادامه می‌دهید؟"))setCatalog(defaultTopupCatalog());}} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"8px 14px",fontSize:12}}>بازگشت به پیش‌فرض</button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",background:"var(--bg-card)",borderRadius:10,padding:"10px 12px",marginBottom:10,fontSize:12}}>
          <span>سود پیش‌فرض فروش:</span>
          <input data-testid="topup-margin" type="number" value={margin} onChange={e=>saveMargin(e.target.value)} style={{...INP,marginTop:0,width:80,padding:"6px 8px"}}/>
          <span>٪ روی قیمت خرید</span>
          <button data-testid="topup-apply-margin" onClick={applyMargin} style={{...BTN("#2563eb"),padding:"6px 12px",fontSize:12}}>اعمال روی همه محصولات</button>
        </div>
        <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:10,lineHeight:1.9}}>قیمت‌ها به ریال و قابل ویرایش‌اند؛ قیمت‌های بسته‌ها فقط نمونه‌اند — طبق نرخ واقعی خودتان تنظیم کنید.</div>
        {["charge","package"].map(t=>(
          <div key={t} style={{background:"var(--bg-card)",borderRadius:12,padding:14,marginBottom:12,overflowX:"auto"}}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>{t==="charge"?"📱 شارژ":"🌐 بسته‌های اینترنت"}</div>
            {catalog.filter(c=>c.type===t).map(c=>(
              <div key={c.id} style={{display:"grid",gridTemplateColumns:"110px 2fr 1fr 1fr 70px 34px",gap:6,alignItems:"center",marginBottom:6,minWidth:560}}>
                <select value={c.operator} onChange={e=>upd(c.id,{operator:e.target.value})} style={{...INP,marginTop:0,padding:"7px 6px",fontSize:12}}>{TOPUP_OPS.map(o=><option key={o}>{o}</option>)}</select>
                <input value={c.title} onChange={e=>upd(c.id,{title:e.target.value})} style={{...INP,marginTop:0,padding:"7px 8px",fontSize:12}}/>
                <input type="number" value={c.buy} onChange={e=>{const b=Number(e.target.value)||0;upd(c.id,{buy:b,sell:sellFromBuy(b,margin)});}} title="قیمت خرید (با تغییر، فروش = خرید + سود پیش‌فرض)" style={{...INP,marginTop:0,padding:"7px 8px",fontSize:12}}/>
                <input type="number" value={c.sell} onChange={e=>upd(c.id,{sell:Number(e.target.value)||0})} title="قیمت فروش" style={{...INP,marginTop:0,padding:"7px 8px",fontSize:12}}/>
                <span style={{fontSize:11,color:c.sell-c.buy>=0?"#4ade80":"#f87171",textAlign:"center"}}>{c.buy>0?toFA(pctFromPrices(c.buy,c.sell))+"٪":"—"}</span>
                <button onClick={()=>setCatalog(cs=>cs.filter(x=>x.id!==c.id))} style={{...BTN("#450a0a","#f87171"),padding:"6px 0",fontSize:12}}>✕</button>
              </div>))}
            <div style={{fontSize:10,color:"var(--text-dim)",marginTop:4}}>ستون‌ها: اپراتور · عنوان · قیمت خرید · قیمت فروش · سود ٪ (روی قیمت خرید)</div>
          </div>))}
      </div>)}

      {tab==="profit"&&<RealProfitReport defaultOnlyTopup/>}
      {tab==="logos"&&<OperatorLogoManager/>}
    </div>
  );
}
