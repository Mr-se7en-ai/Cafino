// Generated from App.jsx by the module split (v1.50.0). Section: inventory
import React, { useState, useEffect, useRef } from "react";
import { getApiConfig, saveApiConfig, isApiConnected, apiResources, apiRequest } from "../../services/api/client.js";
import { clearAuthSession, discardLegacyLocalCredentials, getAuthenticatedUser, normalizeAuthUser, setAuthSession, setAuthenticatedUser } from "../../services/auth/session.js";
import { queueOp, syncQueue, startAutoSync, getSyncConfig, mappers as syncMappers } from "../../sync/index.js";
import { logActivity } from "../core/activity.js";
import { audit } from "../../audit/auditTrail.js";
import { askReason } from "../../audit/ReasonDialog.jsx";
import { fmtM, toFA } from "../core/format.js";
import { BTN, DEFAULT_INVENTORY, INP, INV_STORAGE, INV_STORAGE_KEY } from "../core/constants.js";
import { InventoryReportView } from "./inventoryReports.jsx";
import { ConsumablesSection } from "../domain/recipes.jsx";
import { createId, getSales, hasPendingFor, lsRead, lsWrite, uid, useDataSync } from "../domain/sales.jsx";
import { Empty } from "../components/ui.jsx";


export function InventorySection(){
  const [view,setView]=useState("items");
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["items","📦 کالاها"],["consumables","🧪 اقلام مصرفی خدمات"],["report","📊 گزارش انبار"]].map(([k,l])=>
          <button key={k} onClick={()=>setView(k)} style={{...BTN(view===k?"#2563eb":"var(--bg-card)",view===k?"#fff":"var(--text-secondary)"),padding:"7px 16px",fontSize:13}}>{l}</button>)}
      </div>
      {view==="items"?<InventoryItemsView/>:view==="report"?<InventoryReportView/>:<ConsumablesSection/>}
    </div>
  );
}

function InventoryItemsView(){
  const [items,setItems]=useInventory();
  const [invCats,setInvCats]=useInvCats();
  const [cat,setCat]=useState(()=>getInvCats()[0].key);
  const [form,setForm]=useState({name:"",qty:"",minQty:"",unit:getInvCats()[0].unit});
  const [catModal,setCatModal]=useState(null); // {mode:"add"|"edit",key,label,icon,unit}
  const [catDel,setCatDel]=useState(null); // category being deleted
  const [catDelTarget,setCatDelTarget]=useState("");
  const [sold,setSold]=useState(()=>soldByItem());
  useDataSync(()=>setSold(soldByItem()));
  const [editId,setEditId]=useState(null);
  const [editForm,setEditForm]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);

  const catInfo=invCats.find(c=>c.key===cat)||invCats[0];
  const catItems=items.filter(i=>i.cat===cat);
  const lowStockAll=items.filter(i=>Number(i.qty)<=Number(i.minQty));

  const addItem=()=>{
    const name=form.name.trim();
    if(!name)return;
    const qty=Number(form.qty)||0, minQty=Number(form.minQty)||0;
    setItems(prev=>[...prev,{id:createId("rec"),cat:catInfo.key,name,qty,minQty,unit:form.unit||catInfo.unit,unitCost:Number(form.unitCost)||0,salePrice:Number(form.salePrice)||0}]);
    setForm({name:"",qty:"",minQty:"",unit:catInfo.unit,unitCost:"",salePrice:""});
  };
  const saveCat=()=>{
    const label=(catModal.label||"").trim();if(!label)return;
    const icon=(catModal.icon||"").trim()||"📦",unit=(catModal.unit||"").trim()||"عدد";
    if(catModal.mode==="edit"){
      setInvCats(prev=>prev.map(c=>c.key===catModal.key?{...c,label,icon,unit}:c));
      logActivity("ویرایش دسته انبار",label);
    }else{
      const key="c"+uid();
      setInvCats(prev=>[...prev,{key,label,icon,unit}]);setCat(key);setForm({name:"",qty:"",minQty:"",unit});
      logActivity("افزودن دسته انبار",label);
    }
    setCatModal(null);
  };
  const askDelCat=(c)=>{
    const n=items.filter(i=>i.cat===c.key).length;
    if(invCats.length<=1)return;
    if(n===0){confirmDelCat(c,"");return;}
    setCatDel(c);setCatDelTarget((invCats.find(x=>x.key!==c.key)||{}).key||"");
  };
  const confirmDelCat=(c,target)=>{
    if(target==="__delete__")setItems(prev=>prev.filter(i=>i.cat!==c.key));
    else if(target)setItems(prev=>prev.map(i=>i.cat===c.key?{...i,cat:target}:i));
    const rest=invCats.filter(x=>x.key!==c.key);
    setInvCats(rest);
    if(cat===c.key){setCat(rest[0].key);setForm({name:"",qty:"",minQty:"",unit:rest[0].unit});}
    logActivity("حذف دسته انبار",c.label);
    setCatDel(null);
  };
  // تغییر دستی موجودی/قیمت/حذف کالا = عملیات حساس: دلیل می‌پرسیم و در Audit Trail ثبت می‌کنیم (فروش و ابطال خودکار جدا ثبت می‌شوند).
  const STOCK_REASONS=["شمارش انبار","ضایعات/خرابی","خرید/ورود کالا","اصلاح اشتباه ثبت","مصرف داخلی"];
  const delItem=async(id)=>{
    const it=items.find(i=>i.id===id);setDelConfirm(null);if(!it)return;
    const reason=await askReason({title:`حذف «${it.name}» از انبار`,desc:`موجودی فعلی: ${toFA(it.qty)} ${it.unit||""}`,presets:["کالا دیگر فروخته نمی‌شود","ثبت تکراری","اشتباه در ثبت"],danger:true,confirmLabel:"حذف کالا",icon:"🗑️"});
    if(reason===null)return;
    audit({action:"stock_delete",entityType:"کالا",entityId:it.id,entityLabel:it.name,amount:(Number(it.qty)||0)*(Number(it.unitCost)||0),reason,before:{qty:it.qty,unitCost:it.unitCost,salePrice:it.salePrice},after:null,details:`${toFA(it.qty)} ${it.unit||""}`});
    setItems(prev=>prev.filter(i=>i.id!==id));
  };
  const adjustQty=async(id,delta)=>{
    const it=items.find(i=>i.id===id);if(!it)return;
    const next=Math.max(0,Number(it.qty)+delta);if(next===Number(it.qty))return;
    const reason=await askReason({title:`تغییر موجودی «${it.name}»`,desc:`${toFA(it.qty)} ← ${toFA(next)} ${it.unit||""}`,presets:STOCK_REASONS});
    if(reason===null)return;
    audit({action:"stock_adjust",entityType:"کالا",entityId:it.id,entityLabel:it.name,amount:Math.abs(delta)*(Number(it.unitCost)||0),reason,before:{qty:it.qty},after:{qty:next},details:`${delta>0?"+":""}${delta} ${it.unit||""}`});
    setItems(prev=>prev.map(i=>i.id===id?{...i,qty:Math.max(0,Number(i.qty)+delta)}:i));
  };
  const openEdit=(item)=>{setEditId(item.id);setEditForm({...item});};
  const saveEdit=async()=>{
    const old=items.find(i=>i.id===editId);if(!old)return;
    const nf={...editForm,qty:Number(editForm.qty)||0,minQty:Number(editForm.minQty)||0,unitCost:Number(editForm.unitCost)||0,salePrice:Number(editForm.salePrice)||0};
    const qtyChanged=Number(old.qty)!==nf.qty,priceChanged=(Number(old.salePrice)||0)!==nf.salePrice||(Number(old.unitCost)||0)!==nf.unitCost;
    let reason="";
    if(qtyChanged||priceChanged){
      reason=await askReason({title:`ثبت تغییرات «${old.name}»`,desc:[qtyChanged&&`موجودی ${toFA(old.qty)} ← ${toFA(nf.qty)}`,priceChanged&&`قیمت فروش ${fmtM(old.salePrice||0)} ← ${fmtM(nf.salePrice)} · بهای تمام‌شده ${fmtM(old.unitCost||0)} ← ${fmtM(nf.unitCost)}`].filter(Boolean).join(" — "),presets:qtyChanged?STOCK_REASONS:["تغییر قیمت تأمین‌کننده","تورم","اصلاح اشتباه","تخفیف دائمی"]});
      if(reason===null)return;
    }
    if(qtyChanged)audit({action:"stock_adjust",entityType:"کالا",entityId:old.id,entityLabel:old.name,amount:Math.abs(nf.qty-(Number(old.qty)||0))*(nf.unitCost||0),reason,before:{qty:old.qty},after:{qty:nf.qty},details:`ویرایش کالا: ${toFA(old.qty)} ← ${toFA(nf.qty)}`});
    if(priceChanged)audit({action:"price_change",entityType:"قیمت کالا",entityId:old.id,entityLabel:old.name,amount:nf.salePrice,reason,before:{salePrice:old.salePrice||0,unitCost:old.unitCost||0},after:{salePrice:nf.salePrice,unitCost:nf.unitCost}});
    setItems(prev=>prev.map(i=>i.id===editId?nf:i));
    setEditId(null);setEditForm(null);
  };

  return(
    <div>
      {lowStockAll.length>0&&(
        <div style={{background:"#2d0a0a",border:"1px solid #dc262666",borderRadius:12,padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:24}}>⚠️</span>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:"#f87171"}}>هشدار کمبود موجودی</div>
            <div style={{fontSize:12,color:"#fca5a5",marginTop:2}}>
              {toFA(lowStockAll.length)} قلم کالا به حد سفارش مجدد رسیده یا کمتره: {lowStockAll.map(i=>i.name).join("، ")}
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
        {invCats.map(c=>{
          const lowCount=items.filter(i=>i.cat===c.key&&Number(i.qty)<=Number(i.minQty)).length;
          return(
            <button key={c.key} onClick={()=>{setCat(c.key);setForm({name:"",qty:"",minQty:"",unit:c.unit});}} style={{...BTN(cat===c.key?"#2563eb":"var(--bg-card)",cat===c.key?"#fff":"var(--text-secondary)"),position:"relative",display:"flex",alignItems:"center",gap:6}}>
              <span>{c.icon}</span><span>{c.label}</span>
              {lowCount>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{toFA(lowCount)}</span>}
            </button>
          );
        })}
        <button onClick={()=>setCatModal({mode:"add",label:"",icon:"📦",unit:"عدد"})} style={{...BTN("transparent","var(--accent-light)"),border:"1px dashed var(--accent-light)"}}>＋ دسته جدید</button>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontSize:13,color:"var(--text-secondary)"}}>دسته «{catInfo.icon} {catInfo.label}» — {toFA(catItems.length)} کالا</span>
        <button onClick={()=>setCatModal({mode:"edit",key:catInfo.key,label:catInfo.label,icon:catInfo.icon,unit:catInfo.unit})} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"5px 12px",fontSize:12}}>✏️ ویرایش دسته</button>
        {invCats.length>1&&<button onClick={()=>askDelCat(catInfo)} style={{...BTN("#450a0a","#f87171"),padding:"5px 12px",fontSize:12}}>🗑️ حذف دسته</button>}
      </div>

      <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:10}}>افزودن کالای جدید به «{catInfo.label}»</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="نام کالا..." style={{...INP,marginTop:0,flex:2,minWidth:140}}/>
          <input value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} type="number" placeholder="موجودی" style={{...INP,marginTop:0,flex:1,minWidth:90}}/>
          <input value={form.minQty} onChange={e=>setForm(f=>({...f,minQty:e.target.value}))} type="number" placeholder="حد هشدار" style={{...INP,marginTop:0,flex:1,minWidth:90}}/>
          <input value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} placeholder="واحد (عدد/بسته...)" style={{...INP,marginTop:0,flex:1,minWidth:100}}/>
          <input value={form.unitCost||""} onChange={e=>setForm(f=>({...f,unitCost:e.target.value}))} type="number" placeholder="هزینه هر واحد (ریال)" style={{...INP,marginTop:0,flex:1,minWidth:130}}/>
          <input value={form.salePrice||""} onChange={e=>setForm(f=>({...f,salePrice:e.target.value}))} type="number" placeholder="قیمت فروش هر واحد (ریال)" style={{...INP,marginTop:0,flex:1,minWidth:140}}/>
          <button onClick={addItem} style={{...BTN("#16a34a"),flexShrink:0}}>+ افزودن</button>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {catItems.map(item=>{
          const isLow=Number(item.qty)<=Number(item.minQty);
          const isEditing=editId===item.id;
          return(
            <div key={item.id} style={{background:"var(--bg-card)",borderRadius:10,padding:"12px 16px",border:isLow?"1px solid #dc262688":"1px solid transparent"}}>
              {isEditing?(
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} style={{...INP,marginTop:0,flex:2,minWidth:120}}/>
                  <input value={editForm.qty} onChange={e=>setEditForm(f=>({...f,qty:e.target.value}))} type="number" style={{...INP,marginTop:0,flex:1,minWidth:80}}/>
                  <input value={editForm.minQty} onChange={e=>setEditForm(f=>({...f,minQty:e.target.value}))} type="number" style={{...INP,marginTop:0,flex:1,minWidth:80}}/>
                  <input value={editForm.unit} onChange={e=>setEditForm(f=>({...f,unit:e.target.value}))} style={{...INP,marginTop:0,flex:1,minWidth:80}}/>
                  <input value={editForm.unitCost||""} onChange={e=>setEditForm(f=>({...f,unitCost:e.target.value}))} type="number" placeholder="هزینه واحد" style={{...INP,marginTop:0,flex:1,minWidth:90}}/>
                  <input value={editForm.salePrice||""} onChange={e=>setEditForm(f=>({...f,salePrice:e.target.value}))} type="number" placeholder="قیمت فروش" style={{...INP,marginTop:0,flex:1,minWidth:90}}/>
                  <button onClick={saveEdit} style={BTN("#2563eb")}>ذخیره</button>
                  <button onClick={()=>{setEditId(null);setEditForm(null);}} style={BTN("var(--border)","var(--text-secondary)")}>لغو</button>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:120}}>
                    <div style={{fontSize:14,fontWeight:600}}>{item.name}{isLow&&<span style={{marginRight:8,fontSize:11,color:"#f87171"}}>⚠️ کمبود</span>}</div>
                    <div style={{fontSize:11,color:"var(--text-muted)"}}>حد هشدار: {toFA(item.minQty)} {item.unit}{Number(item.unitCost)>0?` · هزینه واحد: ${fmtM(item.unitCost)}`:""}{Number(item.salePrice)>0?` · قیمت فروش: ${fmtM(item.salePrice)}`:""}</div>
                    {sold[item.id]>0&&<div style={{fontSize:11,color:"#4ade80",marginTop:2}}>🛒 فروخته‌شده از طریق فروش: {toFA(sold[item.id])} {item.unit}</div>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>adjustQty(item.id,-1)} style={{...BTN("var(--bg-app)","var(--text-primary)"),padding:"4px 10px",fontSize:14}}>−</button>
                    <div style={{minWidth:70,textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:700,color:isLow?"#f87171":"var(--text-primary)"}}>{toFA(item.qty)}</div>
                      <div style={{fontSize:10,color:"var(--text-muted)"}}>{item.unit}</div>
                    </div>
                    <button onClick={()=>adjustQty(item.id,1)} style={{...BTN("var(--bg-app)","var(--text-primary)"),padding:"4px 10px",fontSize:14}}>+</button>
                  </div>
                  <button onClick={()=>openEdit(item)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"5px 12px",fontSize:12}}>✏️ ویرایش</button>
                  <button onClick={()=>setDelConfirm(item.id)} style={{...BTN("#450a0a","#f87171"),padding:"5px 12px",fontSize:12}}>🗑️ حذف</button>
                </div>
              )}
            </div>
          );
        })}
        {catItems.length===0&&<Empty text="کالایی در این دسته ثبت نشده" sub="از فرم بالا اضافه کنید"/>}
      </div>

      {catModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:22,width:340,maxWidth:"100%"}}>
            <div style={{fontWeight:700,marginBottom:12}}>{catModal.mode==="edit"?"ویرایش دسته":"دسته جدید انبار"}</div>
            <label style={{fontSize:11,color:"var(--text-muted)"}}>نام دسته<input autoFocus value={catModal.label} onChange={e=>setCatModal(m=>({...m,label:e.target.value}))} placeholder="مثلاً: پوشه و کیف" style={INP}/></label>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <label style={{flex:1,fontSize:11,color:"var(--text-muted)"}}>آیکون (ایموجی)<input value={catModal.icon} onChange={e=>setCatModal(m=>({...m,icon:e.target.value}))} style={INP}/></label>
              <label style={{flex:1,fontSize:11,color:"var(--text-muted)"}}>واحد پیش‌فرض<input value={catModal.unit} onChange={e=>setCatModal(m=>({...m,unit:e.target.value}))} style={INP}/></label>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={saveCat} style={{...BTN("#2563eb"),flex:1}}>ذخیره</button>
              <button onClick={()=>setCatModal(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button>
            </div>
          </div>
        </div>
      )}
      {catDel&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:22,width:360,maxWidth:"100%"}}>
            <div style={{fontWeight:700,marginBottom:8}}>حذف دسته «{catDel.label}»</div>
            <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:10,lineHeight:1.9}}>این دسته {toFA(items.filter(i=>i.cat===catDel.key).length)} کالا دارد. با کالاها چه شود؟</div>
            <select value={catDelTarget} onChange={e=>setCatDelTarget(e.target.value)} style={INP}>
              {invCats.filter(c=>c.key!==catDel.key).map(c=><option key={c.key} value={c.key}>انتقال به «{c.label}»</option>)}
              <option value="__delete__">حذف کالاها همراه دسته</option>
            </select>
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={()=>confirmDelCat(catDel,catDelTarget)} style={{...BTN("#dc2626"),flex:1}}>حذف دسته</button>
              <button onClick={()=>setCatDel(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button>
            </div>
          </div>
        </div>
      )}

      {delConfirm&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:28,width:300,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,marginBottom:8}}>حذف کالا از انبار</div>
            <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:20}}>این عمل قابل برگشت نیست.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>delItem(delConfirm)} style={{...BTN("#dc2626"),flex:1}}>حذف</button>
              <button onClick={()=>setDelConfirm(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const INV_CATS=[
  {key:"paper",label:"کاغذ",icon:"📄",unit:"بسته"},
  {key:"cartridge",label:"کارتریج و تونر",icon:"🖨️",unit:"عدد"},
  {key:"accessories",label:"فلش و لوازم جانبی",icon:"💾",unit:"عدد"},
];

function soldByItem(){
  const m={};
  getSales().forEach(sl=>{if(sl.cancelled)return;(sl.stockUsed||[]).forEach(u=>{m[u.itemId]=(m[u.itemId]||0)+(Number(u.qty)||0);});});
  lsRead(INV_STORAGE,[]).filter(iv=>!iv.saleId&&iv.status!=="draft").forEach(iv=>(iv.stockUsed||[]).forEach(u=>{m[u.itemId]=(m[u.itemId]||0)+(Number(u.qty)||0);}));
  return m;
}

const INV_CATS_KEY="cafenet_inv_cats";

export function getInvCats(){const v=lsRead(INV_CATS_KEY,null);return Array.isArray(v)&&v.length?v:INV_CATS;}

function useInvCats(){
  const [cats,setCats]=useState(()=>getInvCats());
  useEffect(()=>{lsWrite(INV_CATS_KEY,cats);},[cats]);
  useDataSync(()=>setCats(getInvCats()));
  return [cats,setCats];
}

export function useInventory(){
  const [items,setItems]=useState(()=>{try{return JSON.parse(localStorage.getItem(INV_STORAGE_KEY)||"null")||DEFAULT_INVENTORY;}catch{return DEFAULT_INVENTORY;}});
  const serverSync=useRef({ready:false,rows:new Map(),busy:false});
  useEffect(()=>{lsWrite(INV_STORAGE_KEY,items);},[items]);
  useDataSync(()=>setItems(lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY));
  useEffect(()=>{
    if(!isApiConnected()||!getAuthenticatedUser())return;
    let alive=true;
    const useLocal=()=>{
      // offline / server unreachable / local changes still queued → keep working from the local copy
      const local=lsRead(INV_STORAGE_KEY,DEFAULT_INVENTORY)||[];
      serverSync.current={ready:true,rows:new Map(local.map(row=>[String(row.id),{...row}])),busy:false};
    };
    (async()=>{
      try{
        try{await syncQueue.flush();}catch{}
        if(hasPendingFor("inventory","inventoryMovements")){useLocal();return;}
        const remote=await apiResources.inventory.listAll();
        if(!alive)return;
        const remoteIds=new Set(remote.map(row=>String(row.id)));
        const local=lsRead(INV_STORAGE_KEY,DEFAULT_INVENTORY)||[];
        // Preserve previously local-only catalog rows by importing their stable IDs through the queue.
        for(const row of local)if(!remoteIds.has(String(row.id))){
          queueOp({resource:"inventory",action:"create",entityId:String(row.id),body:{...row,id:String(row.id)},idem:`inventory-${row.id}`,label:`کالا: ${row.name||row.id}`});
          remote.push({...row,id:String(row.id)});remoteIds.add(String(row.id));
        }
        const normalized=remote.map(row=>({...row,id:row.id,qty:Number(row.qty??row.quantity)||0}));
        serverSync.current={ready:true,rows:new Map(normalized.map(row=>[String(row.id),row])),busy:false};
        setItems(normalized.length?normalized:[]);
      }catch(error){if(alive)useLocal();}
    })();
    return()=>{alive=false;};
  },[]);
  useEffect(()=>{
    const sync=serverSync.current;
    if(!sync.ready||!isApiConnected()||!getAuthenticatedUser())return;
    const before=sync.rows,after=new Map(items.map(row=>[String(row.id),row]));
    for(const [id,row] of after){
      const old=before.get(id);
      if(!old){queueOp({resource:"inventory",action:"create",entityId:id,body:{...row,id},idem:`inventory-${id}`,label:`کالا: ${row.name||id}`});before.set(id,{...row});continue;}
      const oldQty=Number(old.qty??old.quantity)||0,newQty=Number(row.qty??row.quantity)||0;
      const patch=Object.fromEntries(Object.entries(row).filter(([key,value])=>!['id','qty','quantity','organizationId','branchId','version','createdAt','updatedAt'].includes(key)&&JSON.stringify(old[key])!==JSON.stringify(value)));
      if(Object.keys(patch).length)queueOp({resource:"inventory",action:"update",entityId:id,body:patch,label:`ویرایش کالا: ${row.name||id}`});
      if(newQty!==oldQty){
        const mid=String(createId("movement"));
        queueOp({resource:"inventoryMovements",action:"create",entityId:mid,body:{inventoryItemId:id,quantity:newQty-oldQty,kind:"adjustment",note:"تغییر موجودی (فروش/اصلاح)"},idem:`inventory-movement-${mid}`,dependsOn:[`inventory:${id}`],label:`موجودی ${row.name||id}: ${newQty-oldQty>0?"+":""}${newQty-oldQty}`});
      }
      before.set(id,{...row});
    }
    for(const [id] of [...before])if(!after.has(id)){queueOp({resource:"inventory",action:"remove",entityId:id,label:"حذف کالا"});before.delete(id);}
  },[items]);
  return [items,setItems];
}
