// Generated from App.jsx by the module split (v1.50.0). Section: orders
import React, { useState, useEffect, useRef } from "react";
import Icon, { ICONS } from "../../components/Icon.jsx";
import { getApiConfig, saveApiConfig, isApiConnected, apiResources, apiRequest } from "../../services/api/client.js";
import { queueOp, syncQueue, startAutoSync, getSyncConfig, mappers as syncMappers } from "../../sync/index.js";
import { fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { BTN, INP, ORDERS_STORAGE_KEY, ORDER_STATUSES, ONLINE_STATUSES } from "../core/constants.js";
import { OnlineBadge } from "./onlinePanel.jsx";
import { useCustomers } from "./customers.jsx";
import { useInvoices } from "../domain/invoiceData.js";
import { todayIso } from "../core/jalali.js";
import { nextInvNum } from "./printScan.jsx";
import { ReceivePaymentModal, SaleEconomics, SaleWizard, savedSaleEconomics } from "./saleWizard.jsx";
import { cancelSale, updateOnlineSale, createId, getSale, getSales, loadRemoteIds, lsRead, lsWrite, saleRemaining, saveRemoteIds, useDataSync } from "../domain/sales.jsx";
import { Empty } from "../components/ui.jsx";


export function useOrders(){
  const [orders,setOrders]=useState(()=>{
    try{return JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY)||"[]");}catch{return[];}
  });
  useEffect(()=>{lsWrite(ORDERS_STORAGE_KEY,orders);},[orders]);
  useDataSync(()=>setOrders(lsRead(ORDERS_STORAGE_KEY,[])));
  return [orders,setOrders];
}

export function OrdersSection({pendingAction,clearPendingAction,transactions,setTransactions,onNavigate}){
  const [orders,setOrders]=useOrders();
  const [customers,setCustomers]=useCustomers();
  const [invoices,setInvoices]=useInvoices();
  const [wizard,setWizard]=useState(false);
  const [wizardOnline,setWizardOnline]=useState(false);
  const [payFor,setPayFor]=useState(null);
  const [editOrder,setEditOrder]=useState(null); // order being edited
  const [editForm,setEditForm]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const [linkMsg,setLinkMsg]=useState(null);
  const [connected]=useState(()=>isApiConnected());
  const [syncing,setSyncing]=useState(false);
  const [syncErr,setSyncErr]=useState("");
  const [lastSyncAt,setLastSyncAt]=useState(null);

  // Orders: the local list is the source of truth; every change is queued (src/sync). Pulling from the server only ADDS
  // portal orders / updates the status of rows we already know — and never touches a row that still has queued changes.
  const syncOrders=async()=>{
    if(!isApiConnected())return;
    setSyncing(true);setSyncErr("");
    try{
      await syncQueue.flush();
      const data=await apiResources.orders.listAll();
      const list=Array.isArray(data)?data:(data&&Array.isArray(data.orders)?data.orders:[]);
      const known=loadRemoteIds("orders");
      setOrders(prev=>{
        const byServer=new Map(prev.filter(o=>o.serverId!=null).map(o=>[String(o.serverId),o]));
        const byLocalId=new Map(prev.map(o=>[String(o.id),o]));
        const merged=[...prev];
        for(const r of list){
          const sid=String(r.id);
          const old=byServer.get(sid)||byLocalId.get(sid);          // our own orders are created on the server with the SAME id
          const norm={
            serverId:r.id,customerName:r.customerName||r.customer_name||"",
            title:r.title||r.serviceName||r.service||"سفارش پورتال",notes:r.notes||r.description||"",amount:Number(r.amount||r.price||0),
            status:ORDER_STATUSES.some(s=>s.key===r.status)?r.status:"new",createdAt:(r.createdAt||r.created_at||todayIso()).slice(0,10),source:r.source||"portal",
          };
          if(old){
            const i=merged.findIndex(o=>o===old);
            const busy=syncQueue.hasPending("orders",String(old.id));
            if(i>=0)merged[i]={...old,serverId:r.id,...(busy?{}:{status:norm.status})};
          }else if(!known.has(sid)){
            merged.push({id:createId("order"),customerId:r.customerId||r.customer_id||"",linkedInvoiceId:null,linkedTxId:null,...norm});
          }
          known.add(sid);
        }
        return merged;
      });
      saveRemoteIds("orders",known);
      setLastSyncAt(new Date());
    }catch(e){setSyncErr(e.message||"اتصال به سرور برقرار نشد");}
    setSyncing(false);
  };
  useEffect(()=>{if(connected)syncOrders();},[]);  

  const custOptions=customers.map(c=>({value:String(c.id),label:`${c.firstName} ${c.lastName}`.trim()+(c.phone?` · ${c.phone}`:""),group:null}));
  const custName=(id,o)=>{const c=customers.find(c=>String(c.id)===String(id));return c?`${c.firstName} ${c.lastName}`.trim():((o&&o.customerName)||"مشتری حذف‌شده");};

  const openNew=()=>setWizard(true);
  const salesById=Object.fromEntries(getSales().map(x=>[String(x.id),x]));
  const saleBadge=(o)=>{
    const sl=o.saleId?salesById[String(o.saleId)]:null;
    if(!sl)return null;
    const rem=saleRemaining(sl);
    return rem<=0
      ?<div style={{display:"inline-block",fontSize:10,background:"#052e16",color:"#4ade80",borderRadius:6,padding:"2px 7px",marginBottom:5}}>✓ تسویه‌شده · فاکتور #{toFA(sl.number)}</div>
      :<div style={{display:"inline-block",fontSize:10,background:"#451a03",color:"#fbbf24",borderRadius:6,padding:"2px 7px",marginBottom:5}}>مانده {fmtM(rem)} · فاکتور #{toFA(sl.number)}</div>;
  };
  useEffect(()=>{
    if(pendingAction==="new_order"){openNew();clearPendingAction&&clearPendingAction();}
    else if(typeof pendingAction==="string"&&pendingAction.startsWith("receive_payment:")){setPayFor(pendingAction.slice("receive_payment:".length));clearPendingAction&&clearPendingAction();}
  },[pendingAction]);  
  const moveOrder=(id,dir)=>{
    const cur=orders.find(o=>o.id===id);
    if(!cur)return;
    const idx=ORDER_STATUSES.findIndex(s=>s.key===cur.status);
    const nextKey=ORDER_STATUSES[Math.max(0,Math.min(ORDER_STATUSES.length-1,idx+dir))].key;
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:nextKey}:o));
    queueOp({resource:"orders",action:"update",entityId:String(cur.serverId??cur.id),body:{status:nextKey},label:`وضعیت سفارش «${cur.title}»`});
    // سفارش آنلاین: وضعیت پیگیری هم‌گام با ستون کانبان
    const sl=cur.saleId?getSale(cur.saleId):null;
    if(sl&&sl.channel==="online"){const m={new:"new",inprogress:"preparing",completed:"shipped",delivered:"delivered"}[nextKey];if(m&&m!==(sl.online||{}).status)updateOnlineSale(sl.id,{status:m});}
  };
  const setOnlineStatus=(o,key)=>{
    const sl=o.saleId?getSale(o.saleId):null;if(!sl)return;
    if(key==="returned"&&!window.confirm("برگشت سفارش آنلاین: فروش ابطال، موجودی انبار برگردانده و درآمد/هزینه‌های آن حذف می‌شود. ادامه می‌دهید؟"))return;
    const r=updateOnlineSale(sl.id,{status:key},key==="returned"?"برگشت سفارش آنلاین":undefined);
    if(!r.ok)window.alert(r.error||"تغییر وضعیت انجام نشد");
    else if(!r.returned)setOrders(lsRead(ORDERS_STORAGE_KEY,[]));
  };
  const openEdit=(o)=>{setEditOrder(o);setEditForm({title:o.title,notes:o.notes||"",status:o.status,amount:String(o.amount||"")});setLinkMsg(null);};
  const saveEdit=()=>{
    setOrders(prev=>prev.map(o=>o.id===editOrder.id?{...o,...editForm,amount:Number(editForm.amount)||0}:o));
    queueOp({resource:"orders",action:"update",entityId:String(editOrder.serverId??editOrder.id),body:{title:editForm.title,notes:editForm.notes,status:editForm.status,amount:Number(editForm.amount)||0},label:`ویرایش سفارش «${editForm.title}»`});
    setEditOrder(null);setEditForm(null);
  };
  const delOrder=(id)=>{
    const o=orders.find(x=>x.id===id);
    if(o&&o.saleId)cancelSale(o.saleId,"ابطال از بخش سفارش‌ها"); // voids invoice, income, ledger debt, stock usage, history together (archived)
    else if(o)queueOp({resource:"orders",action:"remove",entityId:String(o.serverId??o.id),label:`حذف سفارش «${o.title}»`});
    setOrders(prev=>prev.filter(x=>x.id!==id));
    setDelConfirm(null);setEditOrder(null);
  };

  // ── Link order to customer's draft invoice ──
  const linkOrderToInvoice=()=>{
    const amt=Number(editForm.amount)||0;
    if(amt<=0){setLinkMsg({ok:false,text:"برای اتصال به فاکتور، ابتدا مبلغ سفارش را وارد کنید"});return;}
    const c=customers.find(c=>String(c.id)===String(editOrder.customerId));
    if(!c)return;
    const newItem={id:createId("rec"),desc:editForm.title,qty:1,unit:"عدد",price:amt};
    let invId=null;
    setInvoices(prev=>{
      const draftIdx=prev.findIndex(iv=>String(iv.customerId)===String(editOrder.customerId)&&iv.status==="draft");
      if(draftIdx>=0){
        const updated=[...prev];
        updated[draftIdx]={...updated[draftIdx],items:[...updated[draftIdx].items.filter(it=>it.desc||it.price),newItem]};
        invId=updated[draftIdx].id;
        return updated;
      }
      const inv={
        id:createId("rec"),number:nextInvNum(prev),date:todayIso(),
        customerId:editOrder.customerId,customerName:`${c.firstName} ${c.lastName}`.trim(),customerPhone:c.phone||"",customerAddress:"",
        items:[newItem],tax:0,discount:0,note:"",status:"draft",createdAt:todayIso(),
      };
      invId=inv.id;
      return [inv,...prev];
    });
    setOrders(prev=>prev.map(o=>o.id===editOrder.id?{...o,linkedInvoiceId:invId}:o));
    setEditOrder(prev=>prev?{...prev,linkedInvoiceId:invId}:prev);
    setLinkMsg({ok:true,text:"✓ به فاکتور پیش‌نویس این مشتری اضافه شد — از تب «فاکتور» قابل مشاهده است"});
  };

  // ── Register order completion as an income transaction (+ customer service history) ──
  const registerOrderAsTransaction=()=>{
    const amt=Number(editForm.amount)||0;
    if(amt<=0){setLinkMsg({ok:false,text:"برای ثبت تراکنش، ابتدا مبلغ سفارش را وارد کنید"});return;}
    const txId=createId("tx");
    setTransactions(prev=>[...prev,{id:txId,type:"income",category:"سفارش",amount:amt,desc:`${editForm.title} — ${custName(editOrder.customerId)}`,date:todayIso()}]);
    setCustomers(prev=>prev.map(c=>String(c.id)===String(editOrder.customerId)?{...c,serviceHistory:[...(c.serviceHistory||[]),{id:txId+1,name:editForm.title,category:"سفارش",amount:amt,date:todayIso()}]}:c));
    setOrders(prev=>prev.map(o=>o.id===editOrder.id?{...o,linkedTxId:txId}:o));
    setEditOrder(prev=>prev?{...prev,linkedTxId:txId}:prev);
    setLinkMsg({ok:true,text:"✓ به‌عنوان درآمد ثبت شد و به تاریخچه خدمات مشتری اضافه شد"});
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)",display:"flex",alignItems:"center",gap:8}}><Icon name="ClipboardList" size={18}/>سفارش‌ها ({toFA(orders.length)})</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {connected&&<button onClick={syncOrders} disabled={syncing} style={{...BTN("var(--bg-card)","var(--text-secondary)"),border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:6,opacity:syncing?0.6:1}}><Icon name="RefreshCw" size={14}/>{syncing?"در حال همگام‌سازی...":"همگام‌سازی با پورتال"}</button>}
          <button onClick={openNew} style={{...BTN("#2563eb"),display:"flex",alignItems:"center",gap:6}}><Icon name="Plus" size={15}/>سفارش جدید</button>
          <button data-testid="new-online-sale" onClick={()=>{setWizardOnline(true);setWizard(true);}} style={{...BTN("#1e40af"),display:"flex",alignItems:"center",gap:6}}>🛒 فروش آنلاین جدید</button>
        </div>
      </div>
      {syncErr&&<div style={{background:"#7f1d1d",color:"#fecaca",borderRadius:9,padding:"9px 12px",fontSize:12,marginBottom:12}}>⚠️ {syncErr}</div>}
      {connected&&lastSyncAt&&!syncErr&&<div style={{fontSize:11,color:"var(--text-dim)",marginBottom:10}}>آخرین همگام‌سازی: {lastSyncAt.toLocaleTimeString("fa-IR")}</div>}

      {customers.length===0&&orders.length===0
        ?<Empty text="ابتدا یک مشتری ثبت کنید" sub="از تب «مشتریان» مشتری جدید اضافه کنید"/>
        :(
        <div data-testid="orders-board" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12,alignItems:"start",width:"100%",minWidth:0}}>
          {ORDER_STATUSES.map((st,stIdx)=>{
            const colOrders=orders.filter(o=>o.status===st.key);
            return(
              <div key={st.key} style={{minWidth:0,background:"var(--bg-card)",borderRadius:12,padding:12,boxSizing:"border-box"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,paddingBottom:10,borderBottom:`2px solid ${st.color}`}}>
                  <span style={{width:9,height:9,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                  <div style={{fontSize:13,fontWeight:700}}>{st.label}</div>
                  <span style={{marginRight:"auto",fontSize:11,color:"var(--text-muted)",background:"var(--bg-app)",borderRadius:6,padding:"1px 8px"}}>{toFA(colOrders.length)}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8,minHeight:40}}>
                  {colOrders.map(o=>(
                    <div key={o.id} style={{background:"var(--bg-app)",borderRadius:9,padding:"10px 12px"}}>
                      <div onClick={()=>openEdit(o)} style={{cursor:"pointer"}}>
                        <div style={{fontSize:13,fontWeight:600,marginBottom:3}}>{custName(o.customerId,o)}</div>
                        <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:5}}>{o.title}</div>
                        {o.source==="portal"&&<div style={{display:"inline-block",fontSize:10,background:"#4c1d95",color:"#ddd6fe",borderRadius:6,padding:"2px 7px",marginBottom:5}}>🛍️ ثبت‌شده از پورتال مشتری</div>}
                        {saleBadge(o)}
                        {(()=>{const sl=o.saleId?salesById[String(o.saleId)]:null;return sl&&sl.channel==="online"?<div><OnlineBadge sale={sl} style={{marginBottom:5}}/></div>:null;})()}
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:10,color:"var(--text-dim)"}}>{jalaliLabel(o.createdAt)}</span>
                          {o.amount>0&&<span style={{fontSize:10,color:"#4ade80",fontWeight:600}}>{fmtM(o.amount)}</span>}
                          {o.linkedInvoiceId&&<Icon name="FileText" size={12} style={{color:"#60a5fa"}}/>}
                          {o.linkedTxId&&<Icon name="TrendingUp" size={12} style={{color:"#4ade80"}}/>}
                        </div>
                      </div>
                      {(()=>{const sl=o.saleId?salesById[String(o.saleId)]:null;if(!sl||sl.channel!=="online")return null;const ol=sl.online||{};return(
                        <div data-testid="order-online" style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                          <select data-testid="order-online-status" value={ol.status||"new"} onChange={e=>setOnlineStatus(o,e.target.value)} style={{...INP,marginTop:0,padding:"4px 8px",fontSize:11}}>{ONLINE_STATUSES.map(x=><option key={x.key} value={x.key}>پیگیری: {x.label}</option>)}</select>
                          {(ol.carrier||ol.trackingCode)&&<div style={{fontSize:10,color:"var(--text-muted)"}}>{ol.carrier}{ol.trackingCode?<> · رهگیری <b dir="ltr">{ol.trackingCode}</b></>:null}</div>}
                        </div>);})()}
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                        <button onClick={()=>moveOrder(o.id,-1)} disabled={stIdx===0} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"3px 9px",fontSize:11,opacity:stIdx===0?0.3:1,display:"flex",alignItems:"center",gap:3}}><Icon name="ChevronRight" size={13}/>قبل</button>
                        <button onClick={()=>moveOrder(o.id,1)} disabled={stIdx===ORDER_STATUSES.length-1} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"3px 9px",fontSize:11,opacity:stIdx===ORDER_STATUSES.length-1?0.3:1,display:"flex",alignItems:"center",gap:3}}>بعد<Icon name="ChevronLeft" size={13}/></button>
                      </div>
                    </div>
                  ))}
                  {colOrders.length===0&&<div style={{fontSize:11,color:"var(--text-dim)",textAlign:"center",padding:"14px 0"}}>خالی</div>}
                </div>
              </div>
            );
          })}
        </div>
        )
      }

      {wizard&&<SaleWizard prefill={wizardOnline?{online:{}}:null} onClose={()=>{setWizard(false);setWizardOnline(false);}} onNavigate={onNavigate}/>}
      {payFor&&<ReceivePaymentModal saleId={payFor} onClose={()=>setPayFor(null)}/>}

      {/* Edit order modal */}
      {editOrder&&editForm&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:26,width:"100%",maxWidth:420,boxShadow:"0 25px 60px #000a"}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:6,color:"var(--accent-light)"}}>ویرایش سفارش</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:16}}>مشتری: {custName(editOrder.customerId)}</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <label style={{fontSize:13,color:"var(--text-secondary)"}}>عنوان سفارش
                <input value={editForm.title} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))} style={INP}/>
              </label>
              <label style={{fontSize:13,color:"var(--text-secondary)"}}>توضیحات
                <textarea value={editForm.notes} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))} rows={3} style={{...INP,resize:"vertical"}}/>
              </label>
              <label style={{fontSize:13,color:"var(--text-secondary)"}}>وضعیت
                <select value={editForm.status} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))} style={INP}>
                  {ORDER_STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label style={{fontSize:13,color:"var(--text-secondary)"}}>مبلغ سفارش (ریال)
                <input type="number" value={editForm.amount} disabled={!!editOrder.saleId} onChange={e=>setEditForm(f=>({...f,amount:e.target.value}))} style={{...INP,opacity:editOrder.saleId?0.6:1}}/>
              </label>
            </div>

            {/* Unified sale panel (orders created through the sale flow) */}
            {editOrder.saleId&&(()=>{
              const sl=getSale(editOrder.saleId);
              if(!sl)return <div style={{marginTop:16,fontSize:12,color:"var(--text-muted)"}}>اطلاعات فروش مرتبط پیدا نشد.</div>;
              const rem=saleRemaining(sl);
              return(
                <div style={{background:"var(--bg-app)",borderRadius:10,padding:14,marginTop:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--text-secondary)",marginBottom:8}}>فروش متصل — فاکتور #{toFA(sl.number)}</div>
                  <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:2}}>
                    <div>مبلغ کل: <b style={{color:"var(--text-primary)"}}>{fmtM(sl.total)}</b> · دریافت‌شده: <b style={{color:"#4ade80"}}>{fmtM(sl.paid)}</b></div>
                    <div>{rem>0?<>مانده (بدهی مشتری): <b style={{color:"#fbbf24"}}>{fmtM(rem)}</b>{sl.dueDate?` · سررسید ${jalaliLabel(sl.dueDate)}`:""}</>:<span style={{color:"#4ade80"}}>✓ تسویه کامل</span>}</div>
                    {(sl.stockUsed||[]).length>0&&<div>📦 کسر از انبار: {toFA(sl.stockUsed.length)} قلم</div>}
                    {sl.costTotal>0&&<div>هزینه مستقیم: {fmtM(sl.costTotal)} · سود ناخالص: <b style={{color:"#4ade80"}}>{fmtM(sl.total-sl.costTotal)}</b></div>}
                  </div>
                  <div style={{marginTop:8}}><SaleEconomics rows={savedSaleEconomics(sl)} total={sl.total} discount={sl.discount||0}/></div>
                  <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                    {rem>0&&<button onClick={()=>setPayFor(sl.id)} style={{...BTN("#16a34a"),flex:1,fontSize:12,padding:9}}>💵 دریافت وجه</button>}
                    {onNavigate&&<button onClick={()=>onNavigate("invoice")} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,fontSize:12,padding:9}}>🧾 فاکتور</button>}
                  </div>
                  <div style={{fontSize:10,color:"var(--text-dim)",marginTop:8}}>برای اصلاح اقلام یا مبلغ، سفارش را حذف (لغو کامل فروش) و دوباره ثبت کنید.</div>
                </div>
              );
            })()}

            {/* Link to invoice / transaction (legacy orders without a sale) */}
            {!editOrder.saleId&&<div style={{background:"var(--bg-app)",borderRadius:10,padding:14,marginTop:16}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--text-secondary)",marginBottom:10}}>اتصال سفارش به فاکتور و تراکنش</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={linkOrderToInvoice} style={{...BTN(editOrder.linkedInvoiceId?"#166534":"#2563eb","#fff"),flex:1,padding:9,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6,minWidth:150}}>
                  <Icon name="FileText" size={15}/><span>{editOrder.linkedInvoiceId?"✓ متصل به فاکتور":"اتصال به فاکتور"}</span>
                </button>
                <button onClick={registerOrderAsTransaction} style={{...BTN(editOrder.linkedTxId?"#166534":"#16a34a","#fff"),flex:1,padding:9,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6,minWidth:150}}>
                  <Icon name="TrendingUp" size={15}/><span>{editOrder.linkedTxId?"✓ ثبت شده در درآمد":"ثبت به‌عنوان درآمد"}</span>
                </button>
              </div>
              {linkMsg&&<div style={{marginTop:10,fontSize:11,color:linkMsg.ok?"#4ade80":"#f87171"}}>{linkMsg.text}</div>}
            </div>}
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button onClick={saveEdit} style={{...BTN("#2563eb"),flex:1,padding:11}}>ذخیره</button>
              <button onClick={()=>setDelConfirm(editOrder.id)} style={{...BTN("#450a0a","#f87171"),padding:11,display:"flex",alignItems:"center",gap:6}}><Icon name="Trash2" size={15}/>حذف</button>
              <button onClick={()=>{setEditOrder(null);setEditForm(null);}} style={{...BTN("var(--border)","var(--text-primary)"),padding:11}}>انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delConfirm&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:210}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:28,width:300,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,marginBottom:8}}>{(orders.find(x=>x.id===delConfirm)||{}).saleId?"ابطال فروش":"حذف سفارش"}</div>
            <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:20,lineHeight:1.9}}>{(orders.find(x=>x.id===delConfirm)||{}).saleId?"این سفارش از جریان فروش ساخته شده؛ ابطال آن کل فروش را باطل می‌کند: فاکتور، درآمد، بدهی دفتری و تاریخچه خدمات برمی‌گردد و موجودی انبار بازگردانده می‌شود (سابقه در بایگانی «ابطال‌شده‌ها» می‌ماند).":"این عمل قابل برگشت نیست."}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>delOrder(delConfirm)} style={{...BTN("#dc2626"),flex:1}}>{(orders.find(x=>x.id===delConfirm)||{}).saleId?"ابطال":"حذف"}</button>
              <button onClick={()=>setDelConfirm(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
