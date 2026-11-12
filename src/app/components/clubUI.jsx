// Generated from App.jsx by the module split (v1.50.0). Section: clubUI
import React, { useState, useEffect, useRef } from "react";
import { logActivity } from "../core/activity.js";
import { fmtCompact, fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { clubAggregate, clubInfo, getClubConfig, syncAllClubRewards } from "../domain/club.js";
import { BTN, CLUB_KEY, INP } from "../core/constants.js";
import { CustomerAvatar } from "../pages/customers.jsx";
import { todayIso } from "../core/jalali.js";
import { emitDataChange, lsWrite } from "../domain/sales.jsx";
import { Empty } from "./ui.jsx";


// ══════════════════════════════════════════════════════════════════
// CUSTOMER CLUB — UI
// ══════════════════════════════════════════════════════════════════
const TIER_COLORS=["#b45309","#94a3b8","#f59e0b","#22d3ee"];

function tierColor(idx,total){return TIER_COLORS[Math.min(idx,TIER_COLORS.length-1)]||"#94a3b8";}

export function ClubBadge({info,small}){
  if(!info)return null;
  const col=tierColor(info.idx);
  return <span title={`سطح باشگاه: ${info.tier.name}`} style={{background:col+"22",color:col,border:`1px solid ${col}66`,borderRadius:20,padding:small?"1px 8px":"3px 11px",fontSize:small?10:11,fontWeight:700,whiteSpace:"nowrap"}}>{info.tier.icon} {info.tier.name}</span>;
}

function toman(r){return toFA(Math.round((Number(r)||0)/10).toLocaleString("fa-IR"));}

export function ClubDetailTab({customer}){
  const cfg=getClubConfig();
  const info=clubInfo(customer,cfg);
  const col=tierColor(info.idx);
  const cards=[["🛒","تعداد خرید",toFA(info.count)],["💰","مجموع خرید",fmtM(info.spent)],["⭐","امتیاز",toFA(info.points)],["🏷️","تخفیف سطح",toFA(info.percent)+"٪"]];
  const clubTx=(customer.walletHistory||[]).filter(h=>h.club);
  return(
    <div data-testid="club-detail">
      {!cfg.enabled&&<div style={{background:"#422006",color:"#fcd34d",borderRadius:10,padding:"10px 14px",fontSize:12,marginBottom:12}}>باشگاه مشتریان در تنظیمات غیرفعال است؛ تخفیف و پاداش اعمال نمی‌شود.</div>}
      <div style={{background:`linear-gradient(135deg,${col}33,var(--bg-card))`,border:`1px solid ${col}66`,borderRadius:16,padding:"18px 20px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{fontSize:46,lineHeight:1}}>{info.tier.icon}</div>
          <div style={{flex:"1 1 180px"}}>
            <div style={{fontSize:12,color:"var(--text-muted)"}}>سطح مشتری</div>
            <div style={{fontSize:22,fontWeight:800,color:col}} data-testid="club-tier-name">{info.tier.name}</div>
            <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:2}}>{info.percent>0?`در هر خرید ${toFA(info.percent)}٪ تخفیف خودکار`:"هنوز تخفیف سطح ندارد"}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:"var(--text-muted)"}}>امتیاز</div>
            <div style={{fontSize:28,fontWeight:800,color:"var(--text-primary)"}} data-testid="club-points">{toFA(info.points)}</div>
          </div>
        </div>
        <div style={{marginTop:14}}>
          {info.next?(<>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text-secondary)",marginBottom:5}}>
              <span>{info.tier.icon} {info.tier.name}</span><span>{info.next.icon} {info.next.name} ({toFA(info.next.percent)}٪ تخفیف)</span>
            </div>
            <div style={{height:10,background:"var(--bg-app)",borderRadius:6,overflow:"hidden"}}><div style={{width:`${Math.round(info.progress*100)}%`,height:"100%",background:col,borderRadius:6}}/></div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:5}}>{fmtM(info.toNext)} دیگر خرید تا سطح «{info.next.name}»</div>
          </>):<div style={{fontSize:12,color:col,fontWeight:700}}>🎉 این مشتری به بالاترین سطح باشگاه رسیده است</div>}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:14}}>
        {cards.map(([ic,l,v])=><div key={l} style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>{ic} {l}</div><div style={{fontSize:16,fontWeight:800,marginTop:4}}>{v}</div></div>)}
      </div>
      <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>🎁 پاداش اعتباری</div>
        {info.rewardOn?(<>
          <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9}}>قانون: هر {toFA(info.every)} خرید = {fmtM(cfg.reward.amount)} ({toman(cfg.reward.amount)} تومان) اعتبار کیف پول</div>
          <div style={{display:"flex",gap:5,margin:"10px 0",flexWrap:"wrap"}}>
            {Array.from({length:Math.min(info.every,20)},(_,i)=><span key={i} style={{width:22,height:22,borderRadius:"50%",background:i<(info.rewardCount%info.every)?col:"var(--bg-app)",border:"1px solid var(--border)",display:"inline-block"}}/>)}
          </div>
          <div style={{fontSize:12,color:"var(--text-muted)"}}>{toFA(info.toNextReward)} خرید دیگر تا پاداش بعدی · تا امروز {fmtM(info.issued)} اعتبار دریافت کرده</div>
          {info.pending>0&&<div style={{fontSize:12,color:"#fbbf24",marginTop:6}}>⏳ {fmtM(info.pending)} پاداش هنوز واریز نشده (با ثبت فروش بعدی یا دکمه «واریز پاداش‌های معوق» در تنظیمات باشگاه واریز می‌شود)</div>}
        </>):<div style={{fontSize:12,color:"var(--text-muted)"}}>پاداش اعتباری در تنظیمات باشگاه غیرفعال است.</div>}
        {clubTx.length>0&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:5}}>
          {[...clubTx].reverse().slice(0,6).map(h=><div key={h.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,background:"var(--bg-app)",borderRadius:8,padding:"6px 10px"}}><span>{h.note}</span><span style={{color:"#4ade80",fontWeight:700}}>+{fmtM(h.amount)} · {jalaliLabel(h.date)}</span></div>)}
        </div>}
      </div>
      <div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>🏅 سطح‌های باشگاه</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {cfg.tiers.map((t,i)=><div key={t.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:9,padding:"8px 12px",background:i===info.idx?tierColor(i)+"22":"var(--bg-app)",border:i===info.idx?`1px solid ${tierColor(i)}`:"1px solid transparent",fontSize:12}}>
            <span style={{fontWeight:700}}>{t.icon} {t.name}</span>
            <span style={{color:"var(--text-secondary)"}}>{t.min>0?`مجموع خرید از ${fmtCompact(t.min)}`:"شروع"} · {toFA(t.percent)}٪ تخفیف</span>
          </div>)}
        </div>
        <div style={{fontSize:11,color:"var(--text-dim)",marginTop:10,lineHeight:1.8}}>همه‌ی این اطلاعات خودکار از فروش‌های ثبت‌شده محاسبه می‌شود؛ فروش لغوشده از امتیاز و سطح کم می‌شود (پاداش واریزشده برگشت نمی‌خورد).</div>
      </div>
    </div>
  );
}

export function ClubOverview({onOpen,customers}){
  const [settings,setSettings]=useState(false);
  const cfg=getClubConfig();
  const agg=clubAggregate();
  const rows=customers.map(c=>({c,i:clubInfo(c,cfg,agg)})).sort((a,b)=>b.i.spent-a.i.spent);
  const members=rows.filter(r=>r.i.count>0);
  const byTier=cfg.tiers.map((t,idx)=>({t,idx,n:members.filter(r=>r.i.idx===idx).length}));
  const totalIssued=customers.reduce((s,c)=>s+(Number(c.clubIssued)||0),0);
  return(
    <div data-testid="club-overview">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>🏅 باشگاه مشتریان</div>
        <button onClick={()=>setSettings(true)} data-testid="club-settings-btn" style={{...BTN("var(--border)","var(--text-primary)"),padding:"8px 14px",fontSize:12}}>⚙️ تنظیمات باشگاه</button>
      </div>
      {!cfg.enabled&&<div style={{background:"#422006",color:"#fcd34d",borderRadius:10,padding:"10px 14px",fontSize:12,marginBottom:12}}>باشگاه غیرفعال است؛ تخفیف و پاداش اعمال نمی‌شود (سطح‌ها همچنان نمایش داده می‌شوند).</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:14}}>
        {byTier.map(({t,idx,n})=><div key={t.key} style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px",borderTop:`3px solid ${tierColor(idx)}`}}>
          <div style={{fontSize:13,fontWeight:700}}>{t.icon} {t.name}</div>
          <div style={{fontSize:22,fontWeight:800,marginTop:4}} data-testid={`club-count-${t.key}`}>{toFA(n)}</div>
          <div style={{fontSize:10,color:"var(--text-muted)"}}>{t.percent>0?`${toFA(t.percent)}٪ تخفیف`:"بدون تخفیف"}{t.min>0?` · از ${fmtCompact(t.min)}`:""}</div>
        </div>)}
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px",borderTop:"3px solid #22c55e"}}>
          <div style={{fontSize:13,fontWeight:700}}>🎁 پاداش واریزشده</div>
          <div style={{fontSize:15,fontWeight:800,marginTop:8}}>{fmtM(totalIssued)}</div>
        </div>
      </div>
      <div style={{background:"var(--bg-card)",borderRadius:12,padding:16}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>🏆 رتبه‌بندی مشتریان بر اساس خرید</div>
        {rows.length===0?<Empty text="هنوز مشتری‌ای ثبت نشده"/>:
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {rows.map(({c,i},n)=>(
            <div key={c.id} onClick={()=>onOpen(c.id)} data-testid="club-row" style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-app)",borderRadius:10,padding:"9px 12px",cursor:"pointer",flexWrap:"wrap"}}>
              <span style={{width:24,textAlign:"center",fontSize:12,color:"var(--text-muted)",fontWeight:700}}>{toFA(n+1)}</span>
              <CustomerAvatar c={c} size={32} fontSize={13}/>
              <div style={{flex:"1 1 120px",minWidth:0,fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.firstName} {c.lastName}</div>
              <ClubBadge info={i} small/>
              <span style={{fontSize:11,color:"var(--text-secondary)"}}>{toFA(i.count)} خرید</span>
              <span style={{fontSize:11,color:"var(--text-secondary)"}}>⭐ {toFA(i.points)}</span>
              <b style={{fontSize:12,minWidth:90,textAlign:"left"}}>{fmtCompact(i.spent)}</b>
            </div>
          ))}
        </div>}
      </div>
      {settings&&<ClubSettingsModal onClose={()=>setSettings(false)}/>}
    </div>
  );
}

function ClubSettingsModal({onClose}){
  const [cfg,setCfg]=useState(()=>JSON.parse(JSON.stringify(getClubConfig())));
  const [msg,setMsg]=useState("");
  const setTier=(i,patch)=>setCfg(c=>({...c,tiers:c.tiers.map((t,j)=>j===i?{...t,...patch}:t)}));
  const num=(v)=>Math.max(0,Number(v)||0);
  const save=()=>{
    const tiers=cfg.tiers.map((t,i)=>({...t,name:String(t.name||"").trim()||`سطح ${toFA(i+1)}`,min:i===0?0:num(t.min),percent:Math.min(100,num(t.percent))})).sort((a,b)=>a.min-b.min);
    const out={...cfg,tiers,pointRate:Math.max(1,num(cfg.pointRate)),reward:{...cfg.reward,every:Math.floor(num(cfg.reward.every)),amount:num(cfg.reward.amount)}};
    lsWrite(CLUB_KEY,out);logActivity("تنظیمات باشگاه مشتریان","");emitDataChange();onClose();
  };
  const sync=()=>{
    lsWrite(CLUB_KEY,{...cfg,pointRate:Math.max(1,num(cfg.pointRate)),reward:{...cfg.reward,every:Math.floor(num(cfg.reward.every)),amount:num(cfg.reward.amount)}});
    const r=syncAllClubRewards();
    setMsg(r.n?`پاداش ${toFA(r.n)} مشتری به مبلغ ${fmtM(r.sum)} به کیف پول واریز شد.`:"پاداش معوقی وجود نداشت.");
  };
  const lbl={fontSize:12,color:"var(--text-secondary)"};
  const mini={...INP,marginTop:4,padding:"8px 10px",fontSize:13};
  return(
    <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:12}}>
      <div style={{background:"var(--bg-card)",borderRadius:16,padding:22,width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 25px 60px #000a"}} data-testid="club-settings">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)"}}>⚙️ تنظیمات باشگاه مشتریان</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,marginBottom:14}}><input type="checkbox" checked={cfg.enabled} onChange={e=>setCfg(c=>({...c,enabled:e.target.checked}))}/> باشگاه مشتریان فعال باشد (اعمال خودکار تخفیف و پاداش)</label>
        <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>سطح‌ها و تخفیف (بر اساس مجموع خرید، به ریال)</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
          {cfg.tiers.map((t,i)=>(
            <div key={t.key} style={{display:"grid",gridTemplateColumns:"34px 1fr 1.3fr 80px",gap:6,alignItems:"end",background:"var(--bg-app)",borderRadius:10,padding:8}}>
              <div style={{fontSize:24,textAlign:"center",paddingBottom:4}}>{t.icon}</div>
              <label style={lbl}>نام<input value={t.name} onChange={e=>setTier(i,{name:e.target.value})} style={mini}/></label>
              <label style={lbl}>حداقل مجموع خرید{i>0&&<span style={{color:"var(--text-dim)"}}> ({toman(t.min)} تومان)</span>}<input type="number" disabled={i===0} value={i===0?0:t.min} onChange={e=>setTier(i,{min:e.target.value})} style={{...mini,opacity:i===0?.5:1}}/></label>
              <label style={lbl}>تخفیف ٪<input type="number" value={t.percent} onChange={e=>setTier(i,{percent:e.target.value})} style={mini}/></label>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:14}}>
          <label style={lbl}>امتیاز: هر چند ریال خرید = ۱ امتیاز <span style={{color:"var(--text-dim)"}}>({toman(cfg.pointRate)} تومان)</span><input type="number" value={cfg.pointRate} onChange={e=>setCfg(c=>({...c,pointRate:e.target.value}))} style={mini}/></label>
        </div>
        <div style={{background:"var(--bg-app)",borderRadius:10,padding:12,marginBottom:12}}>
          <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,fontWeight:700,marginBottom:8}}><input type="checkbox" checked={cfg.reward.enabled} onChange={e=>setCfg(c=>({...c,reward:{...c.reward,enabled:e.target.checked}}))}/> 🎁 پاداش اعتباری</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:8}}>
            <label style={lbl}>هر چند خرید<input type="number" value={cfg.reward.every} onChange={e=>setCfg(c=>({...c,reward:{...c.reward,every:e.target.value}}))} style={mini}/></label>
            <label style={lbl}>مبلغ اعتبار (ریال) <span style={{color:"var(--text-dim)"}}>({toman(cfg.reward.amount)} تومان)</span><input type="number" value={cfg.reward.amount} onChange={e=>setCfg(c=>({...c,reward:{...c.reward,amount:e.target.value}}))} style={mini}/></label>
          </div>
          <div style={{fontSize:11,color:"var(--text-muted)",marginTop:10,lineHeight:1.9}}>
            شمارش خریدها برای پاداش: {cfg.rewardsFrom?`از ${jalaliLabel(cfg.rewardsFrom)}`:"از ابتدا (همه خریدهای قبلی)"}
          </div>
          <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
            <button onClick={()=>setCfg(c=>({...c,rewardsFrom:todayIso()}))} style={{...BTN("var(--border)","var(--text-primary)"),padding:"6px 10px",fontSize:11}}>فقط از امروز</button>
            <button onClick={()=>setCfg(c=>({...c,rewardsFrom:""}))} style={{...BTN("var(--border)","var(--text-primary)"),padding:"6px 10px",fontSize:11}}>از ابتدا</button>
            <button onClick={sync} data-testid="club-sync" style={{...BTN("#166534"),padding:"6px 10px",fontSize:11}}>واریز پاداش‌های معوق</button>
          </div>
          {msg&&<div style={{fontSize:12,color:"#4ade80",marginTop:8}}>{msg}</div>}
        </div>
        <div style={{fontSize:11,color:"var(--text-dim)",lineHeight:1.9,marginBottom:14}}>تخفیف سطح به‌صورت خودکار در «ثبت فروش» اعمال می‌شود. اگر برای مشتری «تخفیف وفاداری» جداگانه هم تنظیم شده باشد، فقط بیشترین مقدار اعمال می‌شود (جمع نمی‌شوند).</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={save} data-testid="club-save" style={{...BTN("#2563eb"),flex:1,padding:11}}>ذخیره</button>
          <button onClick={onClose} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
