// Generated from App.jsx by the module split (v1.50.0). Section: dashTiles
import React, { useState, useEffect, useRef } from "react";
import Icon, { ICONS } from "../../components/Icon.jsx";
import { currencyLabel, fmtCompact, toFA } from "../core/format.js";
import { BTN } from "../core/constants.js";
import { lockOverscroll } from "./dashboard.jsx";
import { lsRead, lsWrite, useDataSync } from "../domain/sales.jsx";


// ══════════════════════════════════════════════════════════════════
// DASHBOARD TILES (کاشی‌های دسترسی سریع — Windows 10 style)
// ══════════════════════════════════════════════════════════════════
const TILES_KEY="cafenet_dash_tiles";

const TILES_VER=2;

const TILE_SIZES={s:{c:2,r:1,label:"کوچک"},m:{c:2,r:2,label:"متوسط"},l:{c:4,r:2,label:"بزرگ"}};

const TILE_SIZE_LEGACY={w:"l"};
 // نسخه‌های قبلی: «عریض» ← «بزرگ»
// go: {fn} runs a dashboard callback; {tab,action} navigates (optionally triggering a "new …" action)
const TILE_CATALOG=[
  {id:"sale",label:"سیستم فروش یکپارچه",icon:"Zap",color:"#7c3aed",go:{fn:"sale"},live:c=>({big:toFA(c.salesCount),sub:"فروش ثبت‌شده امروز"})},
  {id:"income",tid:"qa-income",label:"ثبت درآمد",icon:"TrendingUp",color:"#047857",go:{fn:"income"},live:c=>({big:fmtCompact(c.receivedToday),sub:`دریافتی امروز (${currencyLabel()})`})},
  {id:"expense",tid:"qa-expense",label:"ثبت هزینه",icon:"TrendingDown",color:"#b91c1c",go:{fn:"expense"},live:c=>({big:fmtCompact(c.expenseToday),sub:`هزینهٔ امروز (${currencyLabel()})`})},
  {id:"pos",tid:"qa-pos",label:"صندوق فروش",icon:"Calculator",color:"#be123c",go:{tab:"pos"},live:c=>({big:fmtCompact(c.salesToday),sub:`فروش امروز (${currencyLabel()})`})},
  {id:"topup",tid:"qa-topup",label:"شارژ و بسته اینترنت",icon:"Smartphone",color:"#0e7490",go:{tab:"topup"}},
  {id:"product",tid:"qa-product",label:"فروش محصول",icon:"Package",color:"#d97706",go:{fn:"product"},live:c=>({big:toFA(c.lowStock),sub:"کالای رو به اتمام"})},
  {id:"order",label:"سفارش جدید",icon:"ClipboardPlus",color:"#2563eb",go:{tab:"orders",action:"new_order"},live:c=>({big:toFA(c.orders),sub:"سفارش باز"})},
  {id:"invoice",label:"فاکتور جدید",icon:"FileText",color:"#9a3412",go:{tab:"invoice",action:"new_invoice"}},
  {id:"customer",label:"مشتری جدید",icon:"UserPlus",color:"#15803d",go:{tab:"customers",action:"new_customer"},live:c=>({big:toFA(c.customers),sub:"مشتری ثبت‌شده"})},
  {id:"report",label:"گزارش",icon:"BarChart3",color:"#475569",go:{tab:"report"},live:c=>({big:fmtCompact(c.monthNet),sub:`سود خالص این ماه (${currencyLabel()})`})},
  // ── extra tiles (hidden by default, can be added) ──
  {id:"customers",label:"مشتریان",icon:"Users",color:"#0f766e",go:{tab:"customers"},live:c=>({big:toFA(c.customers),sub:"مشتری"})},
  {id:"debtors",label:"بدهکاران",icon:"Wallet",color:"#b91c1c",go:{tab:"customers"},live:c=>({big:fmtCompact(c.totalDebt),sub:`جمع بدهی مشتریان (${currencyLabel()})`})},
  {id:"inventory",label:"انبار",icon:"Package",color:"#a16207",go:{tab:"inventory"},live:c=>({big:toFA(c.lowStock),sub:"کالای رو به اتمام"})},
  {id:"obligations",label:"تعهدات",icon:"CalendarClock",color:"#6d28d9",go:{tab:"obligations"},live:c=>({big:toFA(c.obls),sub:"تعهد نزدیک/عقب‌افتاده"})},
  {id:"transactions",label:"تراکنش‌ها",icon:"ListChecks",color:"#0369a1",go:{tab:"transactions"}},
  {id:"ledger",label:"حساب‌ها",icon:"BookOpen",color:"#1d4ed8",go:{tab:"ledger"}},
  {id:"orders",label:"سفارش‌ها / فروش",icon:"ShoppingCart",color:"#c2410c",go:{tab:"orders"},live:c=>({big:toFA(c.orders),sub:"سفارش باز"})},
  {id:"invoices",label:"فاکتورها",icon:"FileText",color:"#854d0e",go:{tab:"invoice"}},
  {id:"calendar",label:"تقویم رویدادها",icon:"CalendarDays",color:"#be185d",go:{tab:"calendar"}},
  {id:"printscan",label:"پرینت و اسکن",icon:"Printer",color:"#4d7c0f",go:{tab:"printscan"}},
  {id:"tariff",label:"تعرفه",icon:"Tags",color:"#0891b2",go:{tab:"tariff"}},
  {id:"links",label:"لینک‌های کاربردی",icon:"Link2",color:"#4338ca",go:{tab:"links"}},
  {id:"dateconv",label:"تبدیل تاریخ",icon:"CalendarDays",color:"#9333ea",go:{tab:"dateconv"}},
  {id:"notes",label:"یادداشت و یادآوری",icon:"Bell",color:"#d97706",go:{tab:"notes"},live:c=>({big:toFA(c.reminders||0),sub:"یادآور باز"})},
  {id:"settings",label:"تنظیمات",icon:"Settings",color:"#374151",go:{tab:"settings"}},
];

const TILE_DEFAULT_IDS=["sale","income","expense","pos","topup","product","order","invoice","customer","report"];

function defaultTileLayout(){return{ver:TILES_VER,items:TILE_DEFAULT_IDS.map(id=>({id,size:id==="sale"?"l":"m"}))};}

function getTileLayout(){
  const v=lsRead(TILES_KEY,null);
  if(!v||!Array.isArray(v.items))return defaultTileLayout();
  const seen=new Set();const items=[];
  v.items.forEach(it=>{if(it&&TILE_CATALOG.some(t=>t.id===it.id)&&!seen.has(it.id)){seen.add(it.id);const sz=TILE_SIZE_LEGACY[it.size]||it.size;items.push({id:it.id,size:TILE_SIZES[sz]?sz:"m"});}});
  // نسخهٔ ۲: کاشی‌های «ثبت درآمد/هزینه» یک‌بار به چیدمان ذخیره‌شدهٔ قبلی اضافه می‌شوند
  if((v.ver||1)<2)["income","expense"].forEach(id=>{if(!seen.has(id))items.push({id,size:"m"});});
  return{ver:TILES_VER,items};
}

export function DashTiles({isMobile,live,onQuickSale,onQuickProduct,onQuickTx,quickAction,onEditChange}){
  const [layout,setLayout]=useState(()=>getTileLayout());
  const [edit,setEdit]=useState(false);
  const [sel,setSel]=useState(null);
  useEffect(()=>{if(onEditChange)onEditChange(edit);return()=>{if(onEditChange)onEditChange(false);};},[edit]);  
  const [drag,setDrag]=useState(null); // {id,dx,dy,over}
  const dragRef=useRef(null);
  const justDragged=useRef(false);
  const [w,setW]=useState(0);
  const boxRef=useRef(null);
  useDataSync(()=>setLayout(getTileLayout()));
  useEffect(()=>{
    const el=boxRef.current;if(!el)return;
    const measure=()=>setW(el.clientWidth||0);measure();
    let ro=null;
    if(typeof ResizeObserver!=="undefined"){ro=new ResizeObserver(measure);ro.observe(el);}
    window.addEventListener("resize",measure);
    return()=>{if(ro)ro.disconnect();window.removeEventListener("resize",measure);};
  },[]);
  const save=(items)=>{const l={ver:TILES_VER,items};setLayout(l);lsWrite(TILES_KEY,l);};
  const GAP=6;
  const cols=Math.max(4,Math.floor(((w||340)+GAP)/(84+GAP)));
  const unit=Math.floor((((w||340)-(cols-1)*GAP)/cols)*100)/100;
  const cat=(id)=>TILE_CATALOG.find(t=>t.id===id);
  const items=layout.items;
  const removed=TILE_CATALOG.filter(t=>!items.some(i=>i.id===t.id));
  const run=(t)=>{
    if(t.go.fn==="sale")return onQuickSale();
    if(t.go.fn==="product")return onQuickProduct();
    if(t.go.fn==="income"||t.go.fn==="expense")return onQuickTx&&onQuickTx(t.go.fn);
    quickAction(t.go.tab,t.go.action||null);
  };
  const setSize=(id,size)=>save(items.map(i=>i.id===id?{...i,size}:i));
  const remove=(id)=>{save(items.filter(i=>i.id!==id));if(sel===id)setSel(null);};
  const add=(id)=>{save([...items,{id,size:"m"}]);setSel(id);};
  const shift=(id,dir)=>{
    const i=items.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=items.length)return;
    const a=[...items];[a[i],a[j]]=[a[j],a[i]];save(a);
  };
  const moveTo=(id,targetId)=>{
    if(!targetId||id===targetId)return;
    const from=items.findIndex(i=>i.id===id),to=items.findIndex(i=>i.id===targetId);
    if(from<0||to<0)return;
    const a=[...items];const [m]=a.splice(from,1);a.splice(to,0,m);save(a);
  };
  // Pointer-based drag (mouse + touch): press on a tile in edit mode, move, release over another tile
  const onTileDown=(e,id)=>{
    if(!edit||(e.pointerType==="mouse"&&e.button!==0))return;
    if(e.target.closest&&e.target.closest("button"))return;
    const st={id,x:e.clientX,y:e.clientY,cx:e.clientX,cy:e.clientY,scrolled:0,sp:0,timer:null,moved:false,over:null};
    dragRef.current=st;
    const unlock=lockOverscroll();
    const refresh=()=>{
      let over=null;
      for(const el of document.elementsFromPoint(st.cx,st.cy)){const t=el.closest&&el.closest("[data-tile]");if(t&&t.dataset.tile!==id&&t.closest('[data-testid="tile-grid"]')){over=t.dataset.tile;break;}}
      st.over=over;setDrag({id,dx:st.cx-st.x,dy:st.cy-st.y+st.scrolled,over});
    };
    const scroller=()=>{let n=boxRef.current;while(n&&n!==document.body&&n!==document.documentElement){const o=getComputedStyle(n).overflowY;if((o==="auto"||o==="scroll")&&n.scrollHeight>n.clientHeight)return n;n=n.parentElement;}return null;};
    const move=(ev)=>{
      st.cx=ev.clientX;st.cy=ev.clientY;
      if(!st.moved&&Math.hypot(st.cx-st.x,st.cy-st.y)<7)return;
      st.moved=true;
      if(ev.cancelable)ev.preventDefault();
      refresh();
      // edge auto-scroll so far-away targets are reachable
      const edge=70;
      st.sp=st.cy<edge?-14:st.cy>window.innerHeight-edge?14:0;
      if(st.sp&&!st.timer){
        st.timer=setInterval(()=>{
          if(!st.sp)return;
          const n=scroller();const before=n?n.scrollTop:window.scrollY;
          if(n)n.scrollTop+=st.sp;else window.scrollBy(0,st.sp);
          const after=n?n.scrollTop:window.scrollY;
          st.scrolled+=after-before;refresh();
        },16);
      }
      if(!st.sp&&st.timer){clearInterval(st.timer);st.timer=null;}
    };
    const up=()=>{
      window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",up);
      const d=dragRef.current;dragRef.current=null;if(d&&d.timer)clearInterval(d.timer);unlock();
      if(d&&d.moved){justDragged.current=true;setTimeout(()=>{justDragged.current=false;},0);if(d.over)moveTo(id,d.over);}
      setDrag(null);
    };
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",up);window.addEventListener("pointercancel",up);
  };
  const selItem=items.find(i=>i.id===sel);
  const chip=(label,fn,extra,testid)=><button onClick={fn} data-testid={testid} style={{background:"var(--bg-app)",color:"var(--text-primary)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit",...extra}}>{label}</button>;

  const face=(t,size)=>{
    const lv=t.live?t.live(live):null;
    if(size==="s")return(
      <div style={{display:"flex",alignItems:"center",gap:10,height:"100%",padding:"0 12px",boxSizing:"border-box"}}>
        <span className="wt-ic"><Icon name={t.icon} size={26}/></span>
        <div style={{fontSize:12,fontWeight:700,lineHeight:1.35,minWidth:0}}>{t.label}</div>
      </div>);
    if(size==="m")return(
      <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",height:"100%",padding:"10px 11px",boxSizing:"border-box"}}>
        <span className="wt-ic"><Icon name={t.icon} size={30}/></span>
        <div>
          {lv&&<div style={{fontSize:lv.big.length>6?15:19,fontWeight:800,lineHeight:1.2}}>{lv.big}</div>}
          {lv&&<div style={{fontSize:10,opacity:.85,lineHeight:1.4,marginBottom:2}}>{lv.sub}</div>}
          <div style={{fontSize:12.5,fontWeight:700,lineHeight:1.4}}>{t.label}</div>
        </div>
      </div>);
    return(
      <div style={{display:"flex",alignItems:"center",gap:14,height:"100%",padding:"10px 16px",boxSizing:"border-box"}}>
        <span className="wt-ic"><Icon name={t.icon} size={44}/></span>
        <div style={{minWidth:0}}>
          <div style={{fontSize:15,fontWeight:700}}>{t.label}</div>
          {lv&&<><div style={{fontSize:22,fontWeight:800,lineHeight:1.3}}>{lv.big}</div><div style={{fontSize:11.5,opacity:.85}}>{lv.sub}</div></>}
        </div>
      </div>);
  };

  return(
    <div style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",boxSizing:"border-box"}} data-testid="dash-tiles">
      <style>{`.wt-ic{display:inline-flex;align-self:flex-start;line-height:0;flex:none}
.wtile{transition:transform .12s ease,box-shadow .15s ease,filter .15s ease;user-select:none;-webkit-user-select:none}
.wtile:hover{filter:brightness(1.12);box-shadow:inset 0 0 0 2px #ffffff55}
.wtile:active{transform:scale(.96)}
@media (prefers-reduced-motion:reduce){.wtile{transition:none}}`}</style>
      <div style={{display:"flex",justifyContent:"flex-start",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}} data-testid="ops-header">⚡ مرکز عملیات</div>
        <button onClick={()=>{setEdit(e=>!e);setSel(null);}} data-testid="tile-edit" style={{...BTN(edit?"#16a34a":"var(--bg-app)",edit?"#fff":"var(--text-secondary)"),border:edit?"none":"1px solid var(--border)",padding:"5px 12px",fontSize:12}}>{edit?"✓ پایان ویرایش کاشی‌ها":"✎ ویرایش کاشی‌ها"}</button>
      </div>

      {edit&&(
        <div data-testid="tile-toolbar" style={{position:"sticky",top:"calc(72px + var(--gb,0px))",zIndex:6,background:"var(--bg-app)",border:"1px dashed var(--accent-light)",borderRadius:10,padding:"10px 12px",marginBottom:10,boxShadow:"0 6px 16px #0006"}}>
          {!selItem?(
            <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9}}>روی یک کاشی کلیک کنید تا انتخاب شود؛ سپس یکی از سه اندازه‌ی کوچک، متوسط یا بزرگ را بزنید. برای جابه‌جایی، کاشی را (با ماوس یا انگشت) بکشید و روی کاشی مقصد رها کنید، یا از دکمه‌های «جلوتر/عقب‌تر» استفاده کنید.</div>
          ):(
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:12,fontWeight:700,color:"var(--accent-light)"}}>{cat(selItem.id).label}</span>
              <span style={{display:"flex",gap:4}}>
                {Object.entries(TILE_SIZES).map(([k,s])=>chip(s.label,()=>setSize(selItem.id,k),selItem.size===k?{background:"var(--accent)",color:"#fff",borderColor:"transparent",fontWeight:700}:{},"tile-size-"+k))}
              </span>
              <span style={{display:"flex",gap:4}}>
                {chip("→ جلوتر",()=>shift(selItem.id,-1),{},"tile-prev")}
                {chip("عقب‌تر ←",()=>shift(selItem.id,1),{},"tile-next")}
              </span>
              {chip("✕ حذف",()=>remove(selItem.id),{color:"#f87171"},"tile-remove")}
            </div>
          )}
        </div>
      )}

      <div ref={boxRef} data-testid="tile-grid" data-cols={cols}
        style={{display:"grid",gridTemplateColumns:`repeat(${cols}, ${unit}px)`,gridAutoRows:`${unit}px`,gridAutoFlow:"row dense",gap:GAP,justifyContent:"start",minHeight:unit}}>
        {items.map(it=>{
          const t=cat(it.id);const sz=TILE_SIZES[it.size];
          const c=Math.min(sz.c,cols);
          const picked=edit&&sel===it.id;
          const isDrag=!!drag&&drag.id===it.id,isOver=!!drag&&drag.over===it.id;
          return(
            <div key={it.id} role="button" tabIndex={0} data-tile={it.id} data-size={it.size} data-testid={t.tid||"tile-"+it.id} title={t.label} aria-label={t.label}
              className="wtile"
              onPointerDown={e=>onTileDown(e,it.id)}
              onClick={()=>{if(justDragged.current)return;edit?setSel(it.id):run(t);}}
              onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();edit?setSel(it.id):run(t);}}}
              style={{"--tc":t.color,gridColumn:`span ${c}`,gridRow:`span ${sz.r}`,background:t.color,color:"#fff",borderRadius:3,position:"relative",overflow:"hidden",cursor:edit?(isDrag?"grabbing":"grab"):"pointer",touchAction:edit?"none":"auto",opacity:isDrag?0.85:1,zIndex:isDrag?20:1,pointerEvents:isDrag?"none":"auto",transform:isDrag?`translate(${drag.dx}px,${drag.dy}px) scale(1.03)`:"none",transition:isDrag?"none":undefined,boxShadow:isDrag?"0 12px 30px #0009":isOver?"0 0 0 3px #fbbf24":picked?"0 0 0 3px #fff, 0 0 0 5px var(--accent)":"none",minWidth:0}}>
              {face(t,it.size)}
              {edit&&<button onClick={e=>{e.stopPropagation();remove(it.id);}} data-testid={"tile-x-"+it.id} title="حذف کاشی" style={{position:"absolute",top:3,left:3,width:20,height:20,lineHeight:"18px",padding:0,borderRadius:10,border:"none",background:"#000a",color:"#fff",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕</button>}
            </div>
          );
        })}
      </div>
      {items.length===0&&<div style={{textAlign:"center",color:"var(--text-dim)",fontSize:12,padding:"18px 0"}}>هیچ کاشی‌ای نمایش داده نمی‌شود{edit?"؛ از پایین کاشی اضافه کنید.":" — «ویرایش کاشی‌ها» را بزنید."}</div>}

      {edit&&(
        <div style={{marginTop:12}}>
          <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:6}}>کاشی‌های قابل افزودن ({toFA(removed.length)}) — برای افزودن کلیک کنید:</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {removed.length===0&&<span style={{fontSize:11,color:"var(--text-dim)"}}>همه کاشی‌ها روی صفحه هستند</span>}
            {removed.map(t=><button key={t.id} data-addtile={t.id} onClick={()=>add(t.id)} className="wtile-add" style={{"--tc":t.color,display:"flex",alignItems:"center",gap:6,background:t.color,color:"#fff",border:"none",borderRadius:3,padding:"6px 11px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}><Icon name={t.icon} size={14}/>＋ {t.label}</button>)}
            <button onClick={()=>{save(defaultTileLayout().items);setSel(null);}} data-testid="tile-reset" style={{...BTN("var(--bg-app)","var(--text-secondary)"),border:"1px solid var(--border)",padding:"5px 12px",fontSize:12,marginInlineStart:"auto"}}>↺ بازنشانی کاشی‌ها</button>
          </div>
        </div>
      )}
    </div>
  );
}
