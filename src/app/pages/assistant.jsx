// Generated from App.jsx by the module split (v1.50.0). Section: assistant
import React, { useState, useEffect, useRef } from "react";
import { getCurrencyUnit, toFA } from "../core/format.js";
import { isoToJKey, jalaliLabel, p2 } from "../domain/backup.js";
import { bizLineStats, jMonthShift } from "./bizReports.jsx";
import { BE_KEY, BTN, CURRENCY_KEY, CUSTOMERS_STORAGE_KEY, DEFAULT_INVENTORY, INP, INV_STORAGE_KEY, JM } from "../core/constants.js";
import { buildCustomerFinance } from "./customers.jsx";
import { computeDebtors, isoDaysAgo } from "./dashboard.jsx";
import { jalaliMonthDays, jalaliToIso, todayIso, todayJalali } from "../core/jalali.js";
import { daysUntil } from "../domain/obligations.jsx";
import { directCats, emitDataChange, financeOf, getSales, lsRead, useDataSync } from "../domain/sales.jsx";


function aiNorm(q){return String(q||"").replace(/ي/g,"ی").replace(/ك/g,"ک").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[‌]/g," ").replace(/\s+/g," ").trim();}

function aiAmt(n,unit){
  const v=Math.abs(unit==="toman"?n/10:n);const u=unit==="toman"?"تومان":"ریال";const sign=n<0?"−":"";
  const f=x=>toFA(String(Math.round(x*10)/10).replace(".","٫"));
  if(v>=1e9)return `${sign}${f(v/1e9)} میلیارد ${u}`;
  if(v>=1e6)return `${sign}${f(v/1e6)} میلیون ${u}`;
  if(v>=1e3)return `${sign}${toFA(Math.round(v/1e3))} هزار ${u}`;
  return `${sign}${toFA(Math.round(v))} ${u}`;
}

function aiPct(cur,prev){if(!(prev>0))return null;return Math.round((cur-prev)/prev*100);}

function aiCmp(cur,prev,prevLabel){
  const p=aiPct(cur,prev);if(p==null)return prev===0&&cur>0?`؛ در ${prevLabel} موردی ثبت نشده بود`:"";
  if(p===0)return `؛ تقریباً برابر ${prevLabel}`;
  return `؛ ${toFA(Math.abs(p))}٪ ${p>0?"بیشتر":"کمتر"} از ${prevLabel}`;
}

function aiPeriod(q){
  const [tjy,tjm,tjd]=todayJalali();const t=todayIso();
  const mEnd=(y,m)=>jalaliToIso(y,m,jalaliMonthDays(y,m));
  const addDays=(iso,n)=>{const d=new Date(iso+"T00:00:00");d.setDate(d.getDate()+n);return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;};
  const prevMonth=(y,m)=>m===1?[y-1,12]:[y,m-1];
  if(/دیروز/.test(q)){const d=addDays(t,-1);return{label:"دیروز",from:d,to:d,pFrom:addDays(d,-1),pTo:addDays(d,-1),pLabel:"روز قبل از آن"};}
  if(/امروز/.test(q)){return{label:"امروز",from:t,to:t,pFrom:addDays(t,-1),pTo:addDays(t,-1),pLabel:"دیروز"};}
  if(/هفته/.test(q)){const dow=(new Date(t+"T00:00:00").getDay()+1)%7;const ws=addDays(t,-dow);return{label:"این هفته",from:ws,to:t,pFrom:addDays(ws,-7),pTo:addDays(ws,-7+dow),pLabel:"هفته قبل"};}
  if(/ماه قبل|ماه گذشته|ماه پیش/.test(q)){const [y,m]=prevMonth(tjy,tjm);const [py,pm]=prevMonth(y,m);return{label:`${JM[m-1]} (ماه قبل)`,from:jalaliToIso(y,m,1),to:mEnd(y,m),pFrom:jalaliToIso(py,pm,1),pTo:mEnd(py,pm),pLabel:JM[pm-1]};}
  if(/کل|همه|از ابتدا|از اول|سال/.test(q)&&!/ماه/.test(q))return{label:"کل دوران",from:"",to:t,pFrom:null,pTo:null,pLabel:""};
  const named=JM.findIndex(n=>q.includes(n));
  if(named>=0&&!/این ماه|ماه جاری/.test(q)){const m=named+1;const y=m<=tjm?tjy:tjy-1;const [py,pm]=prevMonth(y,m);const cur=(y===tjy&&m===tjm);return{label:cur?`${JM[m-1]} تاکنون`:`${JM[m-1]} ${toFA(y)}`,from:jalaliToIso(y,m,1),to:cur?t:mEnd(y,m),pFrom:jalaliToIso(py,pm,1),pTo:cur?addDays(jalaliToIso(py,pm,1),Math.min(tjd,jalaliMonthDays(py,pm))-1):mEnd(py,pm),pLabel:JM[pm-1]};}
  const [py,pm]=prevMonth(tjy,tjm);
  return{label:`${JM[tjm-1]} تاکنون`,from:jalaliToIso(tjy,tjm,1),to:t,pFrom:jalaliToIso(py,pm,1),pTo:addDays(jalaliToIso(py,pm,1),Math.min(tjd,jalaliMonthDays(py,pm))-1),pLabel:`همین بازه از ${JM[pm-1]}`};
}

const AI_SUGGESTIONS=["فروش این ماه چطور بوده؟","کدوم خدمات رو گرون کنم؟","سود امروز چقدر بود؟","پرسودترین و کم‌سودترین خدمات کدومند؟","بدهکارها کی هستند؟","چه چیزهایی رو به اتمام است؟","هزینه‌های این ماه چطور بوده؟","نقطه سربه‌سر چقدر است؟","مشتری‌های غیرفعال رو بگو","بهترین مشتری‌ها کی‌اند؟"];

export function aiAnswer(raw,transactions,unit){
  const q=aiNorm(raw);const A=n=>aiAmt(n,unit);const sales=getSales();
  const fin=(from,to)=>financeOf(d=>(!from||d>=from)&&(!to||d<=to),transactions,sales);
  const svc=(from,to,mode)=>bizLineStats(from,to,mode||"category");
  const out=[];
  // ── پیشنهاد افزایش قیمت ──
  if(/گرون|گران|ارزون|ارزان|افزایش قیمت|قیمت.*(بالا|اضافه|کم)|تعرفه.*(بالا|افزایش)|چه قیمتی/.test(q)){
    const from=isoDaysAgo(90);let st=svc(from,"","service").filter(r=>r.qty>0);let span="۹۰ روز اخیر";
    if(st.length===0){st=svc("","","service").filter(r=>r.qty>0);span="کل دوران";}
    if(st.length===0)return["هنوز فروشی ثبت نشده که بتوانم بر پایه‌ی آن قیمت پیشنهاد بدهم. چند فروش با هزینه‌ی واقعی ثبت کنید و دوباره بپرسید."];
    const TARGET=0.4;
    const rows=st.map(r=>{const up=r.revenue/r.qty,uc=(r.revenue-r.profit)/r.qty;return{...r,up,uc,margin:r.margin};});
    const cand=rows.filter(r=>r.margin<TARGET&&r.revenue>0).map(r=>{
      const needed=r.uc/(1-TARGET)/r.up-1;const rise=Math.min(0.15,Math.max(0.05,needed));
      const np=Math.max(1000,Math.round(r.up*(1+rise)/1000)*1000);
      return{...r,rise:np/r.up-1,np,extra:Math.round((np-r.up)*r.qty),underCost:r.up<r.uc,lowData:r.count<3};
    }).sort((a,b)=>(b.underCost-a.underCost)||(b.extra-a.extra));
    out.push(`بر اساس فروش و هزینه‌ی واقعی ${span}:`);
    if(cand.length===0)out.push("همه‌ی خدمات حاشیه‌ی سود بالای ۴۰٪ دارند؛ فعلاً دلیل قوی برای گران‌کردن نیست.");
    else{
      out.push("این خدمات بهترین گزینه برای افزایش قیمت‌اند:");
      cand.slice(0,3).forEach((r,i)=>out.push(`${toFA(i+1)}. ${r.name} — قیمت متوسط ${A(r.up)}، هزینه‌ی هر واحد ${A(r.uc)}، حاشیه ${toFA(Math.round(r.margin*100))}٪${r.underCost?" (زیر قیمت تمام‌شده می‌فروشید!)":""}. پیشنهاد: حدود ${toFA(Math.round(r.rise*100))}٪ افزایش به ${A(r.np)}؛ با همین حجم فروش حدود ${A(r.extra)} سود بیشتر در همین بازه.${r.lowData?" (داده‌ی کم: فقط "+toFA(r.count)+" فروش)":""}`));
    }
    const keep=rows.filter(r=>r.margin>=0.6&&r.qty>0).sort((a,b)=>b.revenue-a.revenue)[0];
    if(keep)out.push(`«${keep.name}» حاشیه‌ی عالی (${toFA(Math.round(keep.margin*100))}٪) دارد؛ قیمتش را دست نزنید تا مشتری حفظ شود.`);
    out.push("⚠️ پیشنهادها فقط از روی فروش و هزینه‌ی ثبت‌شده‌اند؛ حساسیت مشتری به قیمت و نرخ رقبا را خودتان بسنجید و بهتر است افزایش را اول روی یکی دو خدمت امتحان کنید.");
    return out;
  }
  // ── سربه‌سر ──
  if(/سر ?به ?سر|بریک ?ایون/.test(q)){
    const be=lsRead(BE_KEY,null)||{};
    const m3=[1,2,3].map(i=>jMonthShift(i));
    const ops=m3.map(mm=>financeOf(x=>isoToJKey(x,"monthly")===mm.key,transactions,sales).operating).filter(v=>v>0);
    const autoFixed=ops.length?Math.round(ops.reduce((a,b)=>a+b,0)/ops.length):0;
    let win=sales.filter(s=>!s.cancelled&&s.date>=isoDaysAgo(90));if(!win.length)win=sales.filter(s=>!s.cancelled);
    const ids=new Set(win.map(s=>s.id));
    const rev=win.reduce((a,s)=>a+(s.total||0)-(s.waived||0),0);
    const dc=directCats();
    const cost=transactions.filter(t=>t.type==="expense"&&dc.includes(t.category)&&ids.has(t.saleId)).reduce((a,t)=>a+Number(t.amount||0),0);
    const autoAvg=win.length?Math.round((rev-cost)/win.length):0;
    const fixed=be.fixed!==""&&be.fixed!=null&&be.fixed!==undefined?Number(be.fixed):autoFixed;
    const avg=be.avg!==""&&be.avg!=null&&be.avg!==undefined?Number(be.avg):autoAvg;
    if(!(fixed>0&&avg>0))return["برای محاسبه‌ی سربه‌سر، هزینه‌ی ثابت ماهانه و سود متوسط هر خدمت لازم است. در «گزارش‌ها ← گزارش‌های کاربردی ← سربه‌سر» وارد کنید یا کمی فروش و هزینه‌ی جاری ثبت شود."];
    const need=Math.ceil(fixed/avg);const [,tjm]=todayJalali();const cur=fin(jalaliToIso(...(()=>{const [y,m]=todayJalali();return[y,m,1];})()),todayIso());
    return[`هزینه‌ی ثابت ماهانه ${A(fixed)} و سود متوسط هر خدمت ${A(avg)} است.`,`برای سربه‌سر شدن باید ماهی ${toFA(need)} خدمت بفروشید.`,`${JM[tjm-1]} تاکنون ${toFA(cur.count)} فروش داشته‌اید (${toFA(Math.min(100,Math.round(cur.count/need*100)))}٪ از هدف).`];
  }
  // ── بدهکاران ──
  if(/بدهکار|بدهی|طلب|نسیه/.test(q)){
    const d=computeDebtors();if(!d.length)return["الان هیچ مشتری بدهکاری ندارید 🎉"];
    const tot=d.reduce((a,x)=>a+x.amount,0);
    return[`${toFA(d.length)} بدهکار با جمع ${A(tot)} دارید.`,...d.slice(0,5).map((x,i)=>`${toFA(i+1)}. ${x.name} — ${A(x.amount)}${x.oldest?` (از ${jalaliLabel(x.oldest)})`:""}`),d.length>5?`و ${toFA(d.length-5)} نفر دیگر.`:""].filter(Boolean);
  }
  // ── موجودی ──
  if(/موجودی|انبار|بخرم|تمام شد|اتمام|کم شد/.test(q)){
    const inv=(lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY).filter(i=>Number(i.qty)<=Number(i.minQty)).sort((a,b)=>(a.qty-a.minQty)-(b.qty-b.minQty));
    if(!inv.length)return["موجودی همه‌ی اقلام انبار بالاتر از حد هشدار است ✓"];
    return[`${toFA(inv.length)} قلم به حد هشدار رسیده یا تمام شده:`,...inv.slice(0,8).map(i=>`• ${i.name}: ${toFA(i.qty)} ${i.unit||""} (حد هشدار ${toFA(i.minQty)})${Number(i.qty)<=0?" — تمام شده!":""}`)];
  }
  // ── مشتریان ──
  if(/مشتری/.test(q)){
    const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);const nm=c=>`${c.firstName||""} ${c.lastName||""}`.trim()||"—";
    if(/غیرفعال|نیامد|نمیاد|نمی ?آید|مراجعه/.test(q)){
      const idle=customers.map(c=>{const f=buildCustomerFinance(c.id,c);return{c,d:f.lastVisit?-daysUntil(f.lastVisit):null};}).filter(x=>x.d!=null&&x.d>=30).sort((a,b)=>b.d-a.d);
      if(!idle.length)return["مشتری غیرفعالی (بیش از ۳۰ روز بدون مراجعه) ندارید."];
      return[`${toFA(idle.length)} مشتری بیش از ۳۰ روز است مراجعه نکرده‌اند. چند نفر اول:`,...idle.slice(0,6).map(x=>`• ${nm(x.c)} — ${toFA(x.d)} روز پیش${x.c.phone?` (${x.c.phone})`:""}`),"پیشنهاد: یک پیامک تخفیف یا یادآوری برایشان بفرستید."];
    }
    const p=aiPeriod(q);const by={};
    sales.filter(s=>!s.cancelled&&s.customerId!=null&&(!p.from||s.date>=p.from)&&s.date<=p.to).forEach(s=>{const r=by[s.customerId]||(by[s.customerId]={id:s.customerId,total:0,n:0});r.total+=(s.total||0)-(s.waived||0);r.n++;});
    const top=Object.values(by).sort((a,b)=>b.total-a.total).slice(0,5);
    if(!top.length)return[`در ${p.label} فروشی به مشتری ثبت‌شده نیست.`];
    return[`بهترین مشتری‌ها در ${p.label}:`,...top.map((r,i)=>{const c=customers.find(x=>String(x.id)===String(r.id));return `${toFA(i+1)}. ${c?nm(c):"—"} — ${A(r.total)} (${toFA(r.n)} خرید)`;})];
  }
  // ── رتبه‌بندی خدمات ──
  if(/پرفروش|پر ?سود|کم ?سود|بدترین خدمت|بهترین خدمت|خدمات|خدمت/.test(q)&&!/فروش (این|امروز|دیروز)/.test(q)){
    const p=aiPeriod(q);const st=svc(p.from,p.to,"category").filter(r=>r.qty>0);
    if(!st.length)return[`در ${p.label} فروشی ثبت نشده.`];
    const top=(arr,f)=>arr.slice(0,3).map((r,i)=>`${toFA(i+1)}. ${r.name} — ${f(r)}`);
    return[`خدمات در ${p.label}:`,"🏆 پرفروش‌ترین:",...top([...st].sort((a,b)=>b.qty-a.qty),r=>`${toFA(r.qty)} عدد، فروش ${A(r.revenue)}`),"💎 پرسودترین:",...top([...st].sort((a,b)=>b.profit-a.profit),r=>`سود ${A(r.profit)} (حاشیه ${toFA(Math.round(r.margin*100))}٪)`),"⚠️ کم‌سودترین:",...top([...st].sort((a,b)=>a.profit-b.profit),r=>`سود ${A(r.profit)} (حاشیه ${toFA(Math.round(r.margin*100))}٪)`)];
  }
  // ── هزینه‌ها ──
  if(/هزینه|خرج|مخارج/.test(q)){
    const p=aiPeriod(q);const ex=transactions.filter(t=>t.type==="expense"&&(!p.from||t.date>=p.from)&&t.date<=p.to);
    const tot=ex.reduce((a,t)=>a+Number(t.amount||0),0);if(!tot)return[`در ${p.label} هزینه‌ای ثبت نشده.`];
    const by={};ex.forEach(t=>{by[t.category]=(by[t.category]||0)+Number(t.amount||0);});
    const prev=p.pFrom?transactions.filter(t=>t.type==="expense"&&t.date>=p.pFrom&&t.date<=p.pTo).reduce((a,t)=>a+Number(t.amount||0),0):0;
    const f=fin(p.from,p.to);
    return[`هزینه‌ی ${p.label}: ${A(tot)}${p.pFrom?aiCmp(tot,prev,p.pLabel):""}.`,...Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([c,v],i)=>`${toFA(i+1)}. ${c} — ${A(v)} (${toFA(Math.round(v/tot*100))}٪)`),`از این مقدار، هزینه‌ی مستقیم ${A(f.direct)} و هزینه‌ی جاری ${A(f.operating)} است.`];
  }
  // ── سود ──
  if(/سود|ضرر|زیان|منفعت/.test(q)){
    const p=aiPeriod(q);const f=fin(p.from,p.to);const pf=p.pFrom?fin(p.pFrom,p.pTo):null;
    if(!f.revenue&&!f.direct&&!f.operating)return[`در ${p.label} تراکنشی ثبت نشده.`];
    out.push(`${p.label}: درآمد (فروش) ${A(f.revenue)}، هزینه‌ی مستقیم ${A(f.direct)} ← سود ناخالص ${A(f.gross)}${f.revenue>0?` (حاشیه ${toFA(Math.round(f.gross/f.revenue*100))}٪)`:""}.`);
    out.push(`بعد از کسر هزینه‌های جاری (${A(f.operating)}) سود خالص ${A(f.net)} ${f.net>=0?"می‌شود":"است (زیان)"}${pf?aiCmp(f.net,pf.net,p.pLabel):""}.`);
    if(f.net<0&&f.gross>0)out.push("فروش و سود ناخالص مثبت است ولی هزینه‌های جاری آن را خورده؛ شاید فروش به نقطه‌ی سربه‌سر نرسیده (بپرسید «نقطه سربه‌سر»).");
    return out;
  }
  // ── فروش / وضعیت (پیش‌فرض) ──
  if(/فروش|درآمد|وضع|چطور|گزارش|خلاصه|چه خبر|حال/.test(q)||true){
    if(!/فروش|درآمد|وضع|چطور|گزارش|خلاصه|چه خبر|حال|امروز|دیروز|ماه|هفته/.test(q)&&q.length>0)return["متوجه سؤال نشدم 🤔 می‌توانم درباره‌ی فروش، سود، هزینه‌ها، بدهکاران، موجودی انبار، مشتریان، پرفروش/پرسود بودن خدمات، سربه‌سر و پیشنهاد قیمت جواب بدهم. مثلاً یکی از پیشنهادهای زیر را بزنید."];
    const p=aiPeriod(q);const f=fin(p.from,p.to);const pf=p.pFrom?fin(p.pFrom,p.pTo):null;
    if(!f.count&&!f.revenue)return[`در ${p.label} فروشی ثبت نشده.`];
    out.push(`فروش ${p.label} ${A(f.revenue)} بوده (${toFA(f.count)} فروش)${pf?aiCmp(f.revenue,pf.revenue,p.pLabel):""}.`);
    out.push(`سود ناخالص ${A(f.gross)}${f.revenue>0?` (حاشیه ${toFA(Math.round(f.gross/f.revenue*100))}٪)`:""} و سود خالص ${A(f.net)}.`);
    const cur=svc(p.from,p.to,"category").filter(r=>r.revenue>0).sort((a,b)=>b.revenue-a.revenue);
    if(cur.length)out.push(`بیشترین درآمد از ${cur.slice(0,2).map(r=>r.name).join(" و ")} بوده${cur[0]?` (${toFA(Math.round(cur[0].revenue/cur.reduce((a,r)=>a+r.revenue,0)*100))}٪ سهم اولی)`:""}.`);
    if(p.pFrom){
      const prev=svc(p.pFrom,p.pTo,"category");const pm={};prev.forEach(r=>pm[r.name]=r.revenue);
      const drops=Object.keys(pm).map(n=>{const c=cur.find(r=>r.name===n);return{name:n,prev:pm[n],cur:c?c.revenue:0,diff:(c?c.revenue:0)-pm[n]};}).filter(r=>r.diff<0).sort((a,b)=>a.diff-b.diff);
      if(drops.length){const d=drops[0];out.push(`بیشترین افت مربوط به ${d.name} است: از ${A(d.prev)} به ${A(d.cur)} (${A(d.diff)}).`);}
      else if(prev.length)out.push("هیچ خدمتی نسبت به دوره‌ی قبل افت درآمد نداشته 👌");
    }
    const debt=computeDebtors().reduce((a,x)=>a+x.amount,0);
    if(debt>0)out.push(`یادآوری: ${A(debt)} از مشتریان طلب دارید.`);
    return out;
  }
}

function AssistantSection({transactions}){
  const [msgs,setMsgs]=useState([{from:"ai",lines:["سلام 👋 من دستیار کافی‌نت‌پنل هستم. از روی اطلاعات ثبت‌شده‌ی خودتان درباره‌ی فروش، سود، هزینه، بدهکارها، انبار، مشتری‌ها و قیمت‌گذاری جواب می‌دهم. یک سؤال بنویسید یا یکی از پیشنهادها را بزنید."]}]);
  const [q,setQ]=useState("");
  const [unit,setUnit]=useState(()=>getCurrencyUnit());
  useDataSync(()=>setUnit(getCurrencyUnit()));
  const endRef=useRef();
  useEffect(()=>{try{endRef.current&&endRef.current.scrollIntoView({block:"end"});}catch{}},[msgs]);
  const ask=(text)=>{
    const t=String(text||"").trim();if(!t)return;
    let lines;try{lines=aiAnswer(t,transactions,unit);}catch(e){lines=["متأسفانه هنگام محاسبه خطایی پیش آمد. دوباره امتحان کنید."];}
    setMsgs(m=>[...m,{from:"me",lines:[t]},{from:"ai",lines}]);setQ("");
  };
  const switchUnit=()=>{const n=unit==="rial"?"toman":"rial";setUnit(n);try{localStorage.setItem(CURRENCY_KEY,n);}catch{}emitDataChange();};
  return(
    <div data-testid="assistant" style={{maxWidth:820,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
        <div style={{fontSize:12,color:"var(--text-muted)"}}>پاسخ‌ها از داده‌های همین برنامه محاسبه می‌شوند (بدون اینترنت).</div>
        <button data-testid="ai-unit" onClick={switchUnit} style={{...BTN("var(--bg-card)","var(--accent-light)"),border:"1px solid var(--border)",padding:"5px 12px",fontSize:12}}>مبالغ به {unit==="rial"?"ریال":"تومان"} — تغییر به {unit==="rial"?"تومان":"ریال"}</button>
      </div>
      <div style={{background:"var(--bg-card)",borderRadius:14,padding:14,minHeight:320,maxHeight:"58vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
        {msgs.map((m,i)=>(
          <div key={i} data-testid={m.from==="ai"?"ai-msg":"me-msg"} style={{alignSelf:m.from==="me"?"flex-start":"flex-end",maxWidth:"88%",background:m.from==="me"?"#2563eb":"var(--bg-app)",color:m.from==="me"?"#fff":"var(--text-primary)",borderRadius:12,padding:"10px 14px",fontSize:13,lineHeight:1.9}}>
            {m.lines.map((l,j)=><div key={j}>{l}</div>)}
          </div>))}
        <div ref={endRef}/>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",margin:"12px 0"}}>
        {AI_SUGGESTIONS.map(s=><button key={s} onClick={()=>ask(s)} style={{...BTN("var(--bg-card)","var(--text-secondary)"),border:"1px solid var(--border)",padding:"6px 12px",fontSize:12}}>{s}</button>)}
      </div>
      <div style={{display:"flex",gap:8}}>
        <input data-testid="ai-input" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&ask(q)} placeholder="سؤال خود را بنویسید... مثلاً «فروش این ماه چطور بوده؟»" style={{...INP,marginTop:0,flex:1}}/>
        <button data-testid="ai-send" onClick={()=>ask(q)} style={{...BTN("#7c3aed"),padding:"0 22px"}}>ارسال</button>
      </div>
      <div style={{fontSize:11,color:"var(--text-dim)",marginTop:10}}>این دستیار مدل زبانی آزاد نیست؛ سؤال‌هایی را که بالا می‌بینید (و شکل‌های مشابهشان) می‌فهمد. پیشنهاد قیمت فقط بر پایه‌ی فروش و هزینه‌ی ثبت‌شده است و جایگزین بررسی بازار نیست.</div>
    </div>
  );
}
