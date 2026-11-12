// Generated from App.jsx by the module split (v1.50.0). Section: recipes
import React, { useState, useEffect, useRef } from "react";
import { logActivity } from "../core/activity.js";
import { fmtM, toFA } from "../core/format.js";
import { BTN, DEFAULT_INVENTORY, INP, INV_STORAGE_KEY } from "../core/constants.js";
import { useInventory } from "../pages/inventory.jsx";
import { lsRead, lsWrite, uid, useDataSync } from "./sales.jsx";
import { deriveIncomeCategoryOptions, useTariffData } from "../pages/tariff.jsx";
import { Empty } from "../components/ui.jsx";


// ══════════════════════════════════════════════════════════════════
// REPORT SECTION
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// SERVICE CONSUMABLES (اقلام مصرفی خدمات) — per-unit usage recipes
// ══════════════════════════════════════════════════════════════════
const RECIPES_KEY="cafenet_recipes";

export function getRecipes(){const v=lsRead(RECIPES_KEY,[]);return Array.isArray(v)?v:[];}

function useRecipes(){
  const [recipes,setRecipes]=useState(()=>getRecipes());
  useEffect(()=>{lsWrite(RECIPES_KEY,recipes);},[recipes]);
  useDataSync(()=>setRecipes(getRecipes()));
  return [recipes,setRecipes];
}

export function fmtQty(n){return toFA(Math.round((Number(n)||0)*100)/100);}

export function recipesForLine(l,recipes){
  // keys are tried in order of specificity; the first key that has a recipe wins
  const keys=[...(l.recipeKeys||[]),l.category,l.desc].map(x=>String(x||"").trim()).filter(Boolean);
  for(const k of keys){
    const hit=recipes.filter(r=>String(r.service||"").trim()===k&&(r.components||[]).length);
    if(hit.length)return hit;
  }
  return [];
}

export function recipeUsageList(l,qty,recipes,inv){
  const out=[];
  recipesForLine(l,recipes).forEach(r=>r.components.forEach(c=>{
    const it=inv.find(x=>String(x.id)===String(c.itemId));
    if(it)out.push({item:it,qty:(Number(c.qty)||0)*qty});
  }));
  return out;
}

export function ConsumablesSection(){
  const [recipes,setRecipes]=useRecipes();
  const [items]=useInventory();
  const [tariffData]=useTariffData();
  const svcOptions=deriveIncomeCategoryOptions(tariffData).filter(o=>o.value!=="مبلغ دلخواه").map(o=>o.plainLabel);
  const [modal,setModal]=useState(null);
  const [del,setDel]=useState(null);
  const blank=()=>({id:null,service:"",components:[{itemId:items[0]?String(items[0].id):"",qty:"1"}]});
  const itemOf=(id)=>items.find(i=>String(i.id)===String(id));
  const costOf=(r)=>(r.components||[]).reduce((s,c)=>{const it=itemOf(c.itemId);return s+(it?(Number(it.unitCost)||0)*(Number(c.qty)||0):0);},0);
  const capacityOf=(r)=>{
    const caps=(r.components||[]).map(c=>{const it=itemOf(c.itemId);const q=Number(c.qty)||0;return it&&q>0?Math.floor((Number(it.qty)||0)/q+1e-9):null;}).filter(x=>x!=null);
    return caps.length?Math.min(...caps):null;
  };
  const save=()=>{
    const service=modal.service.trim();
    const comps=modal.components.filter(c=>c.itemId&&Number(c.qty)>0).map(c=>({itemId:c.itemId,qty:Number(c.qty)}));
    if(!service||!comps.length)return;
    if(modal.id)setRecipes(prev=>prev.map(r=>r.id===modal.id?{...r,service,components:comps}:r));
    else setRecipes(prev=>[...prev,{id:uid(),service,components:comps}]);
    logActivity(modal.id?"ویرایش اقلام مصرفی":"تعریف اقلام مصرفی",service);
    setModal(null);
  };
  const setComp=(i,patch)=>setModal(m=>({...m,components:m.components.map((c,j)=>j===i?{...c,...patch}:c)}));
  const [autoMsg,setAutoMsg]=useState("");
  // One-click setup: «پرینت/کپی A4» → 1 sheet of the matching paper (only paper counted in sheets)
  const autoSetup=()=>{
    const made=[];
    ["A3","A4","A5"].forEach(size=>{
      const paper=items.find(i=>/کاغذ/.test(i.name||"")&&new RegExp(size,"i").test(i.name||"")&&/برگ/.test(i.unit||""));
      if(!paper)return;
      ["پرینت","کپی"].forEach(job=>{
        const name=`${job} ${size}`;
        if(recipes.some(r=>String(r.service).trim()===name))return;
        made.push({id:uid(),service:name,components:[{itemId:String(paper.id),qty:1}]});
      });
    });
    if(!made.length){setAutoMsg("موردی ساخته نشد: کاغذی با واحد «برگ» و اندازه‌ی A3/A4/A5 در انبار پیدا نشد (یا قبلاً تعریف شده). موجودی کاغذ را به‌صورت برگ ثبت کنید، مثلاً «کاغذ A4 — ۵۰۰ برگ».");return;}
    setRecipes(prev=>[...prev,...made]);logActivity("تعریف خودکار اقلام مصرفی",made.map(m=>m.service).join("، "));
    setAutoMsg(`✓ ${toFA(made.length)} مصرف تعریف شد: ${made.map(m=>m.service).join("، ")}`);
  };
  return(
    <div>
      <div style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12,color:"var(--text-secondary)",lineHeight:1.9}}>
        برای هر خدمت مشخص کنید <b>در هر واحد</b> چه چیزی از انبار مصرف می‌شود (مثلاً پرینت A4: ۱ برگ کاغذ + ۰٫۵ گرم تونر). هنگام ثبت فروش، موجودی خودکار کم می‌شود و هزینه مصرف در سود و زیان می‌آید.
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
        <button data-testid="rc-auto" onClick={autoSetup} style={{...BTN("var(--border)","var(--text-primary)"),padding:"7px 14px",fontSize:12}}>⚡ تعریف خودکار پرینت و کپی</button>
        {autoMsg&&<span data-testid="rc-auto-msg" style={{fontSize:11,color:"var(--text-secondary)",flex:"1 1 200px"}}>{autoMsg}</span>}
        <button onClick={()=>items.length?setModal(blank()):alert("ابتدا در تب «کالاها» اقلام انبار را تعریف کنید.")} style={{...BTN("#16a34a"),padding:"7px 16px"}}>＋ تعریف مصرف خدمت</button>
      </div>
      {recipes.length===0
        ?<Empty text="هنوز مصرفی تعریف نشده" sub="مثلاً «پرینت A4» ← ۱ برگ کاغذ A4"/>
        :<div style={{display:"flex",flexDirection:"column",gap:10}}>
          {recipes.map(r=>{
            const cap=capacityOf(r);const cost=costOf(r);
            const low=(r.components||[]).some(c=>{const it=itemOf(c.itemId);return it&&Number(it.qty)<=Number(it.minQty);});
            return(
              <div key={r.id} style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 16px",border:low?"1px solid #dc262666":"1px solid transparent"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <div style={{fontSize:14,fontWeight:700}}>🧪 {r.service}{low&&<span style={{fontSize:11,color:"#f87171",marginRight:8}}>⚠️ کمبود موجودی</span>}</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setModal({id:r.id,service:r.service,components:r.components.map(c=>({itemId:String(c.itemId),qty:String(c.qty)}))})} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"4px 10px",fontSize:12}}>✏️</button>
                    <button onClick={()=>setDel(r)} style={{...BTN("#450a0a","#f87171"),padding:"4px 10px",fontSize:12}}>🗑️</button>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                  {r.components.map((c,i)=>{const it=itemOf(c.itemId);return(
                    <span key={i} style={{background:"var(--bg-app)",borderRadius:8,padding:"4px 10px",fontSize:12,color:it?"var(--text-primary)":"#f87171"}}>
                      {it?`${fmtQty(c.qty)} ${it.unit} ${it.name}`:"(کالا حذف شده)"}{it&&<span style={{color:Number(it.qty)<=Number(it.minQty)?"#f87171":"var(--text-muted)",fontSize:10}}> · موجودی {fmtQty(it.qty)}</span>}
                    </span>);})}
                </div>
                <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:8,fontSize:11,color:"var(--text-muted)"}}>
                  <span>هزینه مصرف هر واحد: <b style={{color:"var(--text-primary)"}}>{cost>0?fmtM(Math.round(cost)):"—"}</b></span>
                  {cap!=null&&<span>موجودی فعلی برای <b style={{color:cap<=5?"#f87171":"#4ade80"}}>{toFA(cap)}</b> واحد کافی است</span>}
                </div>
              </div>
            );
          })}
        </div>}

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:20,width:460,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{fontWeight:700,marginBottom:12}}>{modal.id?"ویرایش مصرف خدمت":"تعریف مصرف خدمت"}</div>
            <label style={{fontSize:11,color:"var(--text-muted)"}}>نام خدمت (از تعرفه انتخاب کنید یا بنویسید)
              <input list="svc-list" value={modal.service} onChange={e=>setModal(m=>({...m,service:e.target.value}))} placeholder="مثلاً: پرینت A4" style={INP} data-testid="rc-service"/>
              <datalist id="svc-list">{svcOptions.map(o=><option key={o} value={o}/>)}</datalist>
            </label>
            <div style={{fontSize:11,color:"var(--text-muted)",margin:"12px 0 6px"}}>مصرف <b>هر ۱ واحد</b> این خدمت:</div>
            {modal.components.map((c,i)=>{const it=itemOf(c.itemId);return(
              <div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                <select value={c.itemId} onChange={e=>setComp(i,{itemId:e.target.value})} style={{...INP,marginTop:0,flex:2,padding:"8px 10px"}} data-testid={`rc-item-${i}`}>
                  <option value="">— کالا —</option>
                  {items.map(x=><option key={x.id} value={x.id}>{x.name} (موجودی {fmtQty(x.qty)} {x.unit})</option>)}
                </select>
                <input type="number" min="0" step="any" value={c.qty} onChange={e=>setComp(i,{qty:e.target.value})} style={{...INP,marginTop:0,flex:1,padding:"8px 10px",minWidth:60}} data-testid={`rc-qty-${i}`}/>
                <span style={{fontSize:11,color:"var(--text-muted)",minWidth:34}}>{it?it.unit:""}</span>
                {modal.components.length>1&&<button onClick={()=>setModal(m=>({...m,components:m.components.filter((_,j)=>j!==i)}))} style={{...BTN("#450a0a","#f87171"),padding:"6px 9px"}}>✕</button>}
              </div>
            );})}
            <button onClick={()=>setModal(m=>({...m,components:[...m.components,{itemId:"",qty:"1"}]}))} style={{...BTN("var(--bg-app)","var(--accent-light)"),border:"1px solid var(--border)",padding:"5px 12px",fontSize:12}}>＋ قلم دیگر (مثلاً تونر)</button>
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={save} style={{...BTN("#2563eb"),flex:1}}>ذخیره</button>
              <button onClick={()=>setModal(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button>
            </div>
          </div>
        </div>
      )}
      {del&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:22,width:320,maxWidth:"100%",textAlign:"center"}}>
            <div style={{fontWeight:700,marginBottom:8}}>حذف مصرف «{del.service}»</div>
            <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:14}}>فروش‌های بعدی این خدمت دیگر از انبار کسر نمی‌کنند.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setRecipes(prev=>prev.filter(r=>r.id!==del.id));setDel(null);}} style={{...BTN("#dc2626"),flex:1}}>حذف</button>
              <button onClick={()=>setDel(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Direct income entry (no sale): deduct the service's consumables from the warehouse
export function applyRecipeToIncome(category,qty){
  const matches=recipesForLine({category,desc:category},getRecipes());
  if(!matches.length)return null;
  const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
  const used=[],warnings=[],touched=new Set();let cost=0;
  matches.forEach(r=>(r.components||[]).forEach(c=>{
    const it=stock.find(x=>String(x.id)===String(c.itemId));if(!it)return;
    const need=(Number(c.qty)||0)*qty;if(!(need>0))return;
    const have=Number(it.qty)||0,take=Math.min(have,need);
    if(take<need-1e-9)warnings.push(`موجودی «${it.name}» کافی نبود (${fmtQty(take)} از ${fmtQty(need)} ${it.unit} کسر شد)`);
    it.qty=Math.round((have-take)*10000)/10000;touched.add(String(it.id));
    if(take>0)used.push({itemId:it.id,qty:take});
    cost+=(Number(it.unitCost)||0)*take;
  }));
  touched.forEach(id=>{const it=stock.find(x=>String(x.id)===id);if(it&&Number(it.qty)<=Number(it.minQty))warnings.push(`${it.name} رو به اتمام است — موجودی: ${fmtQty(it.qty)} ${it.unit}`);});
  lsWrite(INV_STORAGE_KEY,stock);
  const text=used.map(u=>{const it=stock.find(x=>String(x.id)===String(u.itemId));return it?`${fmtQty(u.qty)} ${it.unit} ${it.name}`:"";}).filter(Boolean).join("، ");
  return{used,cost,warnings,text};
}

export function restoreStockUsed(used){
  if(!(used||[]).length)return;
  const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
  used.forEach(u=>{const it=stock.find(x=>String(x.id)===String(u.itemId));if(it)it.qty=Math.round(((Number(it.qty)||0)+u.qty)*10000)/10000;});
  lsWrite(INV_STORAGE_KEY,stock);
}
