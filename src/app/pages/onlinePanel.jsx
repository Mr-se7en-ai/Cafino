// فروش آنلاین — فرم داخل ویزارد فروش + نشان/چیپ وضعیت برای فهرست‌ها
import React from "react";
import { fmtM, toFA } from "../core/format.js";
import { BTN, INP, ONLINE_CARRIERS, ONLINE_PLATFORMS, ONLINE_STATUSES } from "../core/constants.js";
import { onlineStatusInfo } from "../domain/onlineSales.js";

export const blankOnline=()=>({platform:ONLINE_PLATFORMS[1],orderRef:"",carrier:ONLINE_CARRIERS[0],trackingCode:"",address:"",shippingCost:"",platformFee:"",status:"new"});

const lbl={fontSize:11,color:"var(--text-muted)"};

export function OnlinePanel({value,onChange,onAddShippingLine,hasShippingLine,customerAddress}){
  const v=value;const set=(patch)=>onChange({...v,...patch});
  return(
    <div data-testid="online-panel" style={{background:"var(--bg-app)",border:"1px solid #2563eb55",borderRadius:12,padding:12,marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
      <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9}}>این فروش مثل فروش عادی فاکتور، درآمد، حساب مشتری و کسر انبار دارد؛ هزینهٔ ارسال و کارمزد هم به‌عنوان هزینهٔ مستقیم <b>همین فروش</b> ثبت می‌شود تا سود واقعی کانال آنلاین در گزارش‌ها معلوم باشد.</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <label style={{...lbl,flex:"1 1 150px"}}>کانال / پلتفرم
          <select data-testid="onl-platform" value={v.platform} onChange={e=>set({platform:e.target.value})} style={{...INP,marginTop:2}}>{ONLINE_PLATFORMS.map(p=><option key={p}>{p}</option>)}</select>
        </label>
        <label style={{...lbl,flex:"1 1 150px"}}>شماره سفارش / پیگیری در پلتفرم
          <input data-testid="onl-ref" value={v.orderRef} onChange={e=>set({orderRef:e.target.value})} style={{...INP,marginTop:2}} dir="ltr"/>
        </label>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <label style={{...lbl,flex:"1 1 150px"}}>روش ارسال
          <select data-testid="onl-carrier" value={v.carrier} onChange={e=>set({carrier:e.target.value})} style={{...INP,marginTop:2}}>{ONLINE_CARRIERS.map(p=><option key={p}>{p}</option>)}</select>
        </label>
        <label style={{...lbl,flex:"1 1 150px"}}>کد رهگیری مرسوله
          <input data-testid="onl-track" value={v.trackingCode} onChange={e=>set({trackingCode:e.target.value})} style={{...INP,marginTop:2}} dir="ltr"/>
        </label>
      </div>
      <label style={lbl}>آدرس تحویل
        <textarea data-testid="onl-address" value={v.address} onChange={e=>set({address:e.target.value})} rows={2} style={{...INP,marginTop:2,resize:"vertical"}}/>
      </label>
      {customerAddress&&!v.address&&<button type="button" onClick={()=>set({address:customerAddress})} style={{background:"transparent",border:"none",color:"var(--accent-light)",fontSize:11,cursor:"pointer",padding:0,fontFamily:"inherit",textAlign:"right"}}>استفاده از آدرس ثبت‌شدهٔ مشتری</button>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <label style={{...lbl,flex:"1 1 150px"}}>هزینهٔ ارسال که ما می‌پردازیم (ریال)
          <input data-testid="onl-ship-cost" type="number" min="0" value={v.shippingCost} onChange={e=>set({shippingCost:e.target.value})} placeholder="۰" style={{...INP,marginTop:2}}/>
        </label>
        <label style={{...lbl,flex:"1 1 150px"}}>کارمزد درگاه / پلتفرم (ریال)
          <input data-testid="onl-fee" type="number" min="0" value={v.platformFee} onChange={e=>set({platformFee:e.target.value})} placeholder="۰" style={{...INP,marginTop:2}}/>
        </label>
      </div>
      {onAddShippingLine&&!hasShippingLine&&<button data-testid="onl-add-ship-line" type="button" onClick={onAddShippingLine} style={{...BTN("var(--border)","var(--text-secondary)"),fontSize:12,padding:"6px 12px",alignSelf:"flex-start"}}>＋ افزودن «هزینه ارسال» به فاکتور مشتری</button>}
    </div>
  );
}

// نشان کوچک «🛒 آنلاین · پلتفرم» برای فهرست سفارش‌ها/فاکتورها
export function OnlineBadge({sale,style}){
  if(!sale||sale.channel!=="online")return null;
  const o=sale.online||{};
  return <span data-testid="online-badge" style={{display:"inline-block",fontSize:10,background:"#1e3a8a",color:"#bfdbfe",borderRadius:6,padding:"2px 7px",...style}}>🛒 آنلاین{o.platform?` · ${o.platform}`:""}</span>;
}

// چیپ‌های تغییر وضعیت پیگیری + کد رهگیری
export function OnlineStatusBar({sale,onChange}){
  if(!sale||sale.channel!=="online")return null;
  const o=sale.online||{};const cur=o.status||"new";
  return(
    <div data-testid="online-status-bar" style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",marginTop:6}}>
      {ONLINE_STATUSES.map(s=>{const on=cur===s.key;return(
        <button key={s.key} data-testid={`onl-st-${s.key}`} disabled={on} onClick={()=>onChange(s.key)} style={{background:on?s.color:"var(--bg-app)",color:on?"#fff":"var(--text-secondary)",border:`1px solid ${on?s.color:"var(--border)"}`,borderRadius:20,padding:"3px 10px",fontSize:11,cursor:on?"default":"pointer",fontFamily:"inherit"}}>{s.label}</button>);})}
      {(o.trackingCode||o.carrier)&&<span style={{fontSize:11,color:"var(--text-muted)"}}>{o.carrier}{o.trackingCode?<> · رهگیری <b dir="ltr">{o.trackingCode}</b></>:null}</span>}
    </div>
  );
}

export const onlineSummaryLine=(sale)=>{
  if(!sale||sale.channel!=="online")return "";
  const o=sale.online||{};
  const extra=[(o.shippingCost>0?`ارسال ${fmtM(o.shippingCost)}`:""),(o.platformFee>0?`کارمزد ${fmtM(o.platformFee)}`:"")].filter(Boolean).join(" + ");
  return `فروش آنلاین (${o.platform||"سایر"}${o.orderRef?` · سفارش ${toFA(o.orderRef)}`:""})${extra?` — هزینه مستقیم: ${extra}`:""}`;
};
export {onlineStatusInfo};
