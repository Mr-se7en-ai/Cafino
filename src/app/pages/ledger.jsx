// Generated from App.jsx by the module split (v1.50.0). Section: ledger
import { PRINT_FONT_FAMILY, printFontCss, printWhenReady } from "../core/printFont.js";
import { audit } from "../../audit/auditTrail.js";
import { askReason } from "../../audit/ReasonDialog.jsx";
import { logActivity } from "../core/activity.js";
import React, { useState, useEffect, useRef } from "react";
import { escapeHtml, safeImgSrc, fmtM, toFA } from "../core/format.js";
import { jalaliLabel } from "../domain/backup.js";
import { BTN, INP, LEDGER_STORAGE } from "../core/constants.js";
import { JalaliPicker, SearchableSelect } from "../components/controls.jsx";
import { CustomerFinancePanel, useCustomers } from "./customers.jsx";
import { todayIso } from "../core/jalali.js";
import { ReceivePaymentModal } from "./saleWizard.jsx";
import { peekSearchFocus, clearSearchFocus } from "../domain/search.js";
import { createId, getSale, lsRead, lsWrite, payLabel, saleRemaining, useDataSync } from "../domain/sales.jsx";
import { Empty } from "../components/ui.jsx";
import { VoidModal, VoidedPanel, voidEntry } from "../domain/voids.jsx";


// ══════════════════════════════════════════════════════════════════
// LEDGER SECTION (حساب دفتری) — synced with Customers
// ══════════════════════════════════════════════════════════════════
const LEDGER_ENTRY_CATS=["بدهکار","بستانکار","قرض","امانت","چک","سفارش","سایر"];

export function LedgerSection({categories,shop}){
  // Ledger accounts: each linked to a customer id OR standalone
  const [accounts,setAccounts]=useState(()=>{try{return JSON.parse(localStorage.getItem(LEDGER_STORAGE)||"[]");}catch{return[];}});
  const [customers]=useCustomers();
  const [view,setView]=useState("list");
  const [activeAccId,setActiveAccId]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  // new account form: can pick existing customer or enter manually
  const [accForm,setAccForm]=useState({customerId:"",firstName:"",lastName:"",phone:"",note:""});
  const [delAccConfirm,setDelAccConfirm]=useState(null);
  const [entryModal,setEntryModal]=useState(null);
  const [entryForm,setEntryForm]=useState({date:todayIso(),category:LEDGER_ENTRY_CATS[0],amount:"",desc:"",reminderDate:""});
  const [delEntryConfirm,setDelEntryConfirm]=useState(null);
  const [ledgerSearch,setLedgerSearch]=useState(()=>{const f=peekSearchFocus("ledger",["ledger"]);return f&&f.q?String(f.q):"";}); // از نتیجهٔ جستجوی «کافیند»
  useEffect(()=>{clearSearchFocus();},[]);

  useEffect(()=>{lsWrite(LEDGER_STORAGE,accounts);},[accounts]);
  useDataSync(()=>setAccounts(lsRead(LEDGER_STORAGE,[])));
  const [payFor,setPayFor]=useState(null);

  const activeAcc=accounts.find(a=>a.id===activeAccId)||null;

  const reminderStatus=(dateStr)=>{
    if(!dateStr)return null;
    const today=todayIso();
    if(dateStr<today)return "overdue";
    const soonLimit=new Date(); soonLimit.setDate(soonLimit.getDate()+7);
    if(dateStr<=soonLimit.toISOString().split("T")[0])return "soon";
    return "future";
  };

  // ── Print / PDF export of a ledger account statement ──
  const buildLedgerHtml=(acc)=>{
    const {firstName,lastName,phone}=accName(acc);
    const entries=[...acc.entries].sort((a,b)=>a.date.localeCompare(b.date));
    const total=acc.entries.reduce((s,e)=>s+Number(e.amount||0),0);
    const rows=entries.map(e=>`<tr><td>${jalaliLabel(e.date)}</td><td>${escapeHtml(e.category)}</td><td>${e.amount>0?fmtM(e.amount):"—"}</td><td>${escapeHtml(e.desc||"")}</td><td>${e.reminderDate?jalaliLabel(e.reminderDate):"—"}</td></tr>`).join("");
    return `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>صورت‌حساب دفتری</title>
      <style>
${printFontCss()}        body{font-family:${PRINT_FONT_FAMILY};color:#1e293b;padding:24px;}
        h1{font-size:18px;margin:0;} .sub{font-size:12px;color:#64748b;margin-bottom:4px;}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:right;}
        th{background:#f1f5f9;}
        .total{font-size:15px;font-weight:700;margin-top:14px;color:#0369a1;}
        @media print{ .no-print{display:none} }
      </style></head><body>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px;">
        ${safeImgSrc(shop&&shop.logo)?`<img src="${safeImgSrc(shop.logo)}" style="width:48px;height:48px;object-fit:contain;border-radius:8px;">`:""}
        <div><h1>صورت‌حساب دفتری — ${escapeHtml(shop&&shop.name?shop.name:"کافینو | CAFINO")}</h1></div>
      </div>
      <div class="sub">نام: ${escapeHtml(firstName)} ${escapeHtml(lastName)}${phone?" · تلفن: "+escapeHtml(phone):""}</div>
      <div class="sub">تاریخ تهیه: ${jalaliLabel(todayIso())}</div>
      <table><thead><tr><th>تاریخ</th><th>دسته‌بندی</th><th>مبلغ</th><th>توضیحات</th><th>یادآوری</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="total">جمع کل: ${fmtM(total)}</div>
      <button class="no-print" onclick="window.print()" style="margin-top:16px;padding:10px 18px;font-size:14px;cursor:pointer">🖨️ چاپ / ذخیره PDF</button>
      </body></html>`;
  };
  const previewPrintLedger=()=>{
    const w=window.open("","_blank");
    if(!w){alert("مرورگر بازکردن پنجره‌ی جدید را مسدود کرد. لطفاً پاپ‌آپ را برای این سایت مجاز کنید.");return;}
    w.document.write(buildLedgerHtml(activeAcc)); w.document.close();
  };
  const printLedger=()=>{
    const w=window.open("","_blank");
    if(!w){alert("مرورگر بازکردن پنجره‌ی جدید را مسدود کرد. لطفاً پاپ‌آپ را برای این سایت مجاز کنید.");return;}
    w.document.write(buildLedgerHtml(activeAcc)); w.document.close();
    printWhenReady(w);
  };

  // Resolve display name: from linked customer or stored name
  const accName=(a)=>{
    if(a.customerId){
      const c=customers.find(c=>c.id===a.customerId);
      if(c) return {firstName:c.firstName,lastName:c.lastName,phone:c.phone||""};
    }
    return {firstName:a.firstName||"",lastName:a.lastName||"",phone:a.phone||""};
  };

  const openAdd=()=>{setAccForm({customerId:"",firstName:"",lastName:"",phone:"",note:""});setShowAdd(true);};

  const saveAccount=()=>{
    if(accForm.customerId){
      const c=customers.find(c=>c.id===Number(accForm.customerId));
      if(!c)return;
      const exists=accounts.find(a=>a.customerId===Number(accForm.customerId));
      if(exists){setShowAdd(false);setActiveAccId(exists.id);setView("person");return;}
      const na={id:createId("rec"),customerId:Number(accForm.customerId),note:accForm.note.trim(),entries:[]};
      setAccounts(prev=>[...prev,na]);
      setShowAdd(false);
    } else {
      const f=accForm.firstName.trim(),l=accForm.lastName.trim();
      if(!f&&!l)return;
      const na={id:createId("rec"),customerId:null,firstName:f,lastName:l,phone:accForm.phone.trim(),note:accForm.note.trim(),entries:[]};
      setAccounts(prev=>[...prev,na]);
      setShowAdd(false);
    }
  };

  const deleteAccount=async(id)=>{
    const a=accounts.find(x=>x.id===id);setDelAccConfirm(null);
    const bal=(a&&a.entries||[]).reduce((t,e)=>t+(e.category==="بدهکار"?Number(e.amount)||0:-(Number(e.amount)||0)),0);
    const reason=await askReason({online:true,title:`حذف حساب «${accLabel(a)}»`,desc:`${(a&&a.entries||[]).length} سند${bal?` · مانده ${fmtM(Math.abs(bal))}`:""} همراه حساب حذف می‌شود.`,presets:["حساب تکراری","تسویه نهایی","اشتباه در ایجاد حساب"],danger:true,confirmLabel:"حذف حساب",icon:"🗑️"});
    if(reason===null)return;
    audit({action:"ledger_adjust",label:"حذف حساب مشتری",entityType:"حساب مشتری",entityId:id,entityLabel:accLabel(a),amount:Math.abs(bal)||null,reason,before:{entries:(a&&a.entries||[]).length,balance:bal},after:null});
    setAccounts(prev=>prev.filter(x=>x.id!==id));if(activeAccId===id)setView("list");
  };

  const openAddEntry=()=>{setEntryForm({date:todayIso(),category:LEDGER_ENTRY_CATS[0],amount:"",desc:"",reminderDate:""});setEntryModal({editId:null});};
  const openEditEntry=(e)=>{setEntryForm({date:e.date,category:e.category,amount:e.amount,desc:e.desc||"",reminderDate:e.reminderDate||""});setEntryModal({editId:e.id});};
  const accLabel=(a)=>{if(!a)return"—";if(a.customerId!=null){try{const c=JSON.parse(localStorage.getItem("cafenet_customers")||"[]").find(x=>String(x.id)===String(a.customerId));if(c)return`${c.firstName} ${c.lastName}`.trim();}catch{}}return`${a.firstName||""} ${a.lastName||""}`.trim()||"—";};
  const saveEntry=async()=>{
    if(!entryForm.date||!entryForm.category)return;
    const acc=accounts.find(a=>a.id===activeAccId);
    if(entryModal.editId){
      const old=(acc&&acc.entries||[]).find(e=>e.id===entryModal.editId);
      const newAmt=Number(entryForm.amount)||0;
      if(old&&(Number(old.amount)!==newAmt||old.category!==entryForm.category||old.date!==entryForm.date)){
        const reason=await askReason({online:true,title:"اصلاح سند حساب مشتری",desc:`${accLabel(acc)}: ${old.category} ${fmtM(old.amount)} ← ${entryForm.category} ${fmtM(newAmt)}`,presets:["اشتباه در مبلغ","اشتباه در تاریخ","اصلاح نوع سند"]});
        if(reason===null)return;
        audit({action:"ledger_adjust",entityType:"حساب مشتری",entityId:activeAccId,entityLabel:`${accLabel(acc)} — ${old.desc||old.category}`,amount:newAmt,reason,before:{amount:old.amount,category:old.category,date:old.date},after:{amount:newAmt,category:entryForm.category,date:entryForm.date}});
      }
      setAccounts(prev=>prev.map(a=>a.id===activeAccId?{...a,entries:a.entries.map(e=>e.id===entryModal.editId?{...e,...entryForm,amount:newAmt}:e)}:a));
    } else {
      setAccounts(prev=>prev.map(a=>a.id===activeAccId?{...a,entries:[...a.entries,{id:createId("rec"),...entryForm,amount:Number(entryForm.amount)||0}]}:a));
      logActivity("ثبت سند حساب مشتری",`${accLabel(acc)} — ${entryForm.category} ${fmtM(Number(entryForm.amount)||0)}`);
    }
    setEntryModal(null);
  };
  const deleteEntry=(eid,reason)=>{const en=(accounts.find(a=>a.id===activeAccId)||{entries:[]}).entries.find(e=>e.id===eid);if(en)voidEntry(activeAccId,en,reason);setAccounts(prev=>prev.map(a=>a.id===activeAccId?{...a,entries:a.entries.filter(e=>e.id!==eid)}:a));setDelEntryConfirm(null);};

  const debtOf=(a)=>(a.entries||[]).filter(e=>e.category==="بدهکار").reduce((s,e)=>s+Number(e.amount||0),0);
  const filteredAccs=accounts.filter(a=>{
    if(!ledgerSearch)return true;
    const {firstName,lastName,phone}=accName(a);
    return(firstName+lastName+phone).includes(ledgerSearch);
  }).sort((a,b)=>debtOf(b)-debtOf(a));
  const debtors=accounts.filter(a=>debtOf(a)>0);
  const totalReceivable=debtors.reduce((s,a)=>s+debtOf(a),0);

  // Global debt reminders (overdue + upcoming within 7 days), across all accounts
  const allReminders=accounts.flatMap(a=>(a.entries||[])
    .filter(e=>e.reminderDate&&reminderStatus(e.reminderDate)!=="future")
    .map(e=>({...e,accId:a.id,accName:accName(a)}))
  ).sort((a,b)=>a.reminderDate.localeCompare(b.reminderDate));

  // ── PERSON VIEW ──
  if(view==="person"&&activeAcc){
    const {firstName,lastName,phone}=accName(activeAcc);
    const entries=[...activeAcc.entries].sort((a,b)=>b.date.localeCompare(a.date));
    const totalAmt=activeAcc.entries.reduce((s,e)=>s+Number(e.amount||0),0);
    const linkedCust=activeAcc.customerId?customers.find(c=>c.id===activeAcc.customerId):null;

    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <button onClick={()=>setView("list")} style={{...BTN("var(--border)","var(--accent-light)"),padding:"7px 14px",fontSize:13}}>← بازگشت</button>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:700}}>{firstName} {lastName}</div>
            {phone&&<div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>📞 {phone}</div>}
            {linkedCust&&<div style={{fontSize:11,color:"#2563eb",marginTop:2}}>🔗 متصل به مشتریان</div>}
          </div>
          <button onClick={previewPrintLedger} style={{...BTN("var(--border)","var(--text-primary)"),padding:"7px 14px",fontSize:12}}>🔍 پیش‌نمایش چاپ</button>
          <button onClick={printLedger} style={{...BTN("#7c2d12","#fff"),padding:"7px 14px",fontSize:12}}>🖨️ چاپ</button>
          <button onClick={()=>setDelAccConfirm(activeAcc.id)} style={{...BTN("#450a0a","#f87171"),padding:"7px 14px",fontSize:12}}>🗑️ حذف</button>
        </div>

        {activeAcc.note&&<div style={{background:"var(--header-grad-1)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"var(--accent-light)",marginBottom:16}}>📝 {activeAcc.note}</div>}

        <div style={{background:"var(--bg-card)",borderRadius:10,padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"var(--text-secondary)"}}>{toFA(entries.length)} رکورد</span>
          <span style={{fontSize:15,fontWeight:700,color:"#22d3ee"}}>جمع: {fmtM(totalAmt)}</span>
        </div>

        {activeAcc.customerId!=null&&<CustomerFinancePanel customerId={activeAcc.customerId}/>}

        <div style={{marginBottom:16}}>
          <button onClick={openAddEntry} style={{...BTN("#2563eb"),width:"100%",padding:11,fontSize:14}}>+ افزودن رکورد جدید</button>
        </div>
        {payFor&&<ReceivePaymentModal saleId={payFor} onClose={()=>setPayFor(null)}/>}

        {entries.length===0
          ?<Empty text="رکوردی ثبت نشده" sub="از دکمه بالا رکورد جدید اضافه کنید"/>
          :<div style={{display:"flex",flexDirection:"column",gap:8}}>
            {entries.map(e=>(
              <div key={e.id} style={{background:"var(--bg-card)",borderRadius:10,padding:"14px 16px",borderRight:"3px solid #2563eb"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                      <span style={{background:"var(--header-grad-1)",color:"var(--accent-light)",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:600}}>{e.category}</span>
                      <span style={{fontSize:12,color:"var(--text-muted)"}}>{jalaliLabel(e.date)}</span>
                      {e.reminderDate&&(()=>{const st=reminderStatus(e.reminderDate);const cfg={overdue:{bg:"#dc2626",label:"⏰ سررسید گذشته"},soon:{bg:"#f59e0b",label:"⏰ یادآوری نزدیک"},future:{bg:"#334155",label:"⏰ یادآوری"}}[st];return<span style={{background:cfg.bg,color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:600}}>{cfg.label}: {jalaliLabel(e.reminderDate)}</span>;})()}
                    </div>
                    {e.amount>0&&<div style={{fontSize:15,fontWeight:700,color:e.saleId?"#f87171":"#22d3ee"}}>{e.saleId?"مانده: ":""}{fmtM(e.amount)}</div>}
                    {e.saleId&&(()=>{
                      const sl=getSale(e.saleId);
                      if(!sl)return null;
                      return(
                        <div style={{fontSize:11,color:"var(--text-muted)",marginTop:6,lineHeight:1.9}}>
                          فاکتور #{toFA(sl.number)}: مبلغ <b style={{color:"var(--text-secondary)"}}>{fmtM(sl.total)}</b> · پرداخت <b style={{color:"#4ade80"}}>{fmtM(sl.paid||0)}</b>{sl.waived>0?<> · بخشیده <b>{fmtM(sl.waived)}</b></>:null}
                          {(sl.payments||[]).filter(p=>p.method!=="free").map(p=><div key={p.id}>↳ {payLabel(p.method)} {fmtM(p.amount)} — {jalaliLabel(p.date)}</div>)}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {e.saleId&&getSale(e.saleId)&&saleRemaining(getSale(e.saleId))>0&&<button onClick={()=>setPayFor(e.saleId)} style={{...BTN("#16a34a"),padding:"4px 9px",fontSize:12}}>💵 دریافت</button>}
                    <button onClick={()=>openEditEntry(e)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"4px 9px",fontSize:12}}>✏️</button>
                    <button data-testid="entry-void" title="ابطال سند" onClick={()=>setDelEntryConfirm(e.id)} style={{...BTN("#450a0a","#f87171"),padding:"4px 9px",fontSize:12}}>🚫</button>
                  </div>
                </div>
                {e.desc&&<div style={{fontSize:13,color:"var(--text-secondary)",background:"var(--bg-app)",borderRadius:7,padding:"8px 12px",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{e.desc}</div>}
              </div>
            ))}
          </div>
        }

        {entryModal&&(
          <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
            <div style={{background:"var(--bg-card)",borderRadius:16,padding:26,width:"100%",maxWidth:460,boxShadow:"0 25px 60px #000a",maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{fontSize:16,fontWeight:700,marginBottom:18,color:"var(--accent-light)"}}>{entryModal.editId?"✏️ ویرایش رکورد":"📋 رکورد جدید"}</div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>تاریخ<JalaliPicker value={entryForm.date} onChange={d=>setEntryForm(f=>({...f,date:d}))}/></label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>دسته‌بندی<select value={entryForm.category} onChange={e=>setEntryForm(f=>({...f,category:e.target.value}))} style={INP}>{LEDGER_ENTRY_CATS.map(c=><option key={c}>{c}</option>)}</select></label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>مبلغ (ریال — اختیاری)<input type="number" value={entryForm.amount} onChange={e=>setEntryForm(f=>({...f,amount:e.target.value}))} placeholder="مثال: ۱۰۰۰۰۰" style={INP}/></label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>
                  ⏰ یادآوری بدهی (اختیاری)
                  <JalaliPicker value={entryForm.reminderDate} onChange={d=>setEntryForm(f=>({...f,reminderDate:d}))}/>
                  {entryForm.reminderDate&&<button onClick={()=>setEntryForm(f=>({...f,reminderDate:""}))} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"4px 10px",fontSize:11,marginTop:6}}>حذف یادآوری</button>}
                </label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>توضیحات<textarea value={entryForm.desc} onChange={e=>setEntryForm(f=>({...f,desc:e.target.value}))} placeholder="جزئیات..." rows={5} style={{...INP,resize:"vertical",lineHeight:1.7}}/></label>
              </div>
              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={saveEntry} style={{...BTN("#2563eb"),flex:1,padding:11}}>ذخیره</button>
                <button onClick={()=>setEntryModal(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>انصراف</button>
              </div>
            </div>
          </div>
        )}
        {activeAccId&&<VoidedPanel kinds={["entry"]} accId={activeAccId} title="🚫 اسناد باطل‌شده این حساب"/>}
        {delEntryConfirm&&<VoidModal title="ابطال سند" desc="سند از حساب و مانده‌ها خارج می‌شود ولی با دلیل ابطال در بایگانی می‌ماند و قابل بازگردانی است." onConfirm={(r)=>deleteEntry(delEntryConfirm,r)} onClose={()=>setDelEntryConfirm(null)}/>}
        {delAccConfirm&&(<div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}><div style={{background:"var(--bg-card)",borderRadius:16,padding:28,width:320,textAlign:"center"}}><div style={{fontSize:32,marginBottom:10}}>⚠️</div><div style={{fontWeight:700,marginBottom:6}}>حذف حساب</div><div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:18}}>تمام رکوردهای این حساب حذف می‌شوند.</div><div style={{display:"flex",gap:10}}><button onClick={()=>deleteAccount(delAccConfirm)} style={{...BTN("#dc2626"),flex:1}}>حذف</button><button onClick={()=>setDelAccConfirm(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button></div></div></div>)}
      </div>
    );
  }

  // ── LIST VIEW ──
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>📒 حساب‌های دفتری ({toFA(accounts.length)})</div>
        <button onClick={openAdd} data-testid="ledger-new-account" style={BTN("#2563eb")}>+ حساب جدید</button>
      </div>

      {/* Add account — inline form (no popup), same pattern as تعهدات */}
      {showAdd&&(
        <div data-testid="ledger-account-form" ref={el=>{if(el&&!el.dataset.sc){el.dataset.sc="1";try{el.scrollIntoView({behavior:"smooth",block:"nearest"});}catch{}}}}
          style={{background:"var(--bg-card)",borderRadius:12,padding:18,marginBottom:16,border:"1px solid var(--border)"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:14,color:"var(--accent-light)"}}>📒 حساب جدید</div>

            {/* Customer picker */}
            {customers.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:6}}>انتخاب از مشتریان ثبت‌شده (جستجو کنید)</div>
                <SearchableSelect
                  options={[{value:"",label:"— ورود دستی —",group:null},...customers.map(c=>({value:String(c.id),label:`${c.firstName} ${c.lastName}`.trim()+(c.phone?` (${c.phone})`:""),group:null}))]}
                  value={accForm.customerId}
                  placeholder="جستجوی مشتری..."
                  onChange={val=>setAccForm(f=>({...f,customerId:val}))}
                />
              </div>
            )}

            {/* Manual fields if no customer selected */}
            {!accForm.customerId&&(
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <label style={{fontSize:13,color:"var(--text-secondary)"}}>نام<input value={accForm.firstName} onChange={e=>setAccForm(f=>({...f,firstName:e.target.value}))} placeholder="نام..." style={INP}/></label>
                  <label style={{fontSize:13,color:"var(--text-secondary)"}}>نام خانوادگی<input value={accForm.lastName} onChange={e=>setAccForm(f=>({...f,lastName:e.target.value}))} placeholder="نام خانوادگی..." style={INP}/></label>
                </div>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>شماره تماس<input value={accForm.phone} onChange={e=>setAccForm(f=>({...f,phone:e.target.value}))} placeholder="۰۹۱۲..." style={INP}/></label>
              </div>
            )}

            <label style={{fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:16}}>یادداشت (اختیاری)
              <textarea value={accForm.note} onChange={e=>setAccForm(f=>({...f,note:e.target.value}))} placeholder="توضیح درباره این حساب..." rows={3} style={{...INP,resize:"vertical"}}/>
            </label>

            <div style={{display:"flex",gap:10}}>
              <button onClick={saveAccount} style={{...BTN("#2563eb"),flex:1,padding:11}}>ایجاد</button>
              <button onClick={()=>setShowAdd(false)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11}}>انصراف</button>
            </div>
          </div>
        </div>
      )}

      {allReminders.length>0&&(
        <div style={{background:"#2d0a0a",border:"1px solid #dc262666",borderRadius:12,padding:"14px 18px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <span style={{fontSize:22}}>⏰</span>
            <div style={{fontSize:14,fontWeight:700,color:"#f87171"}}>یادآوری بدهی ({toFA(allReminders.length)})</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {allReminders.map(r=>{
              const st=reminderStatus(r.reminderDate);
              const nm=`${r.accName.firstName} ${r.accName.lastName}`.trim()||"—";
              return(
                <div key={r.id} onClick={()=>{setActiveAccId(r.accId);setView("person");}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-app)",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer"}}>
                  <div><b style={{color:"var(--text-primary)"}}>{nm}</b><span style={{color:"var(--text-muted)"}}> · {r.category}{r.amount>0?` · ${fmtM(r.amount)}`:""}</span></div>
                  <span style={{color:st==="overdue"?"#f87171":"#f59e0b",fontWeight:700}}>{st==="overdue"?"⏰ گذشته":"⏰ نزدیک"} · {jalaliLabel(r.reminderDate)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalReceivable>0&&(
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:150,background:"#2d0a0a",border:"1px solid #dc262655",borderRadius:12,padding:"12px 16px"}}>
            <div style={{fontSize:11,color:"#fca5a5"}}>کل مطالبات (بدهی مشتریان)</div>
            <div style={{fontSize:17,fontWeight:800,color:"#f87171",marginTop:4}}>{fmtM(totalReceivable)}</div>
          </div>
          <div style={{flex:1,minWidth:150,background:"var(--bg-card)",borderRadius:12,padding:"12px 16px"}}>
            <div style={{fontSize:11,color:"var(--text-muted)"}}>تعداد بدهکاران</div>
            <div style={{fontSize:17,fontWeight:800,marginTop:4}}>{toFA(debtors.length)} نفر</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{position:"relative",marginBottom:14}}>
        <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"var(--text-muted)"}}>🔍</span>
        <input value={ledgerSearch} onChange={e=>setLedgerSearch(e.target.value)} placeholder="جستجو بر اساس نام..." style={{...INP,marginTop:0,paddingRight:38}}/>
      </div>

      {filteredAccs.length===0
        ?<Empty text="هنوز حسابی ثبت نشده" sub="روی «حساب جدید» کلیک کنید"/>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filteredAccs.map(a=>{
            const {firstName,lastName,phone}=accName(a);
            const total=a.entries.reduce((s,e)=>s+Number(e.amount||0),0);
            const linked=!!a.customerId;
            return(
              <div key={a.id} onClick={()=>{setActiveAccId(a.id);setView("person");}} style={{background:"var(--bg-card)",borderRadius:12,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",borderRight:`3px solid ${linked?"#2563eb":"#7c3aed"}`,transition:"background .15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#243447"}
                onMouseLeave={e=>e.currentTarget.style.background="var(--bg-card)"}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:"50%",background:linked?"var(--header-grad-1)":"#1e1040",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,fontWeight:700,color:linked?"var(--accent-light)":"#a78bfa"}}>
                    {firstName?firstName[0]:lastName?lastName[0]:"؟"}
                  </div>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontWeight:700,fontSize:14}}>{firstName} {lastName}</span>
                      {linked&&<span style={{fontSize:10,background:"var(--header-grad-1)",color:"#60a5fa",borderRadius:4,padding:"1px 6px"}}>🔗 مشتری</span>}
                    </div>
                    <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>{toFA(a.entries.length)} رکورد{phone?` · ${phone}`:""}</div>
                  </div>
                </div>
                <div style={{textAlign:"left"}}>
                  {debtOf(a)>0
                    ?<div style={{fontWeight:700,color:"#f87171",fontSize:13}}>بدهکار: {fmtM(debtOf(a))}</div>
                    :total>0&&<div style={{fontWeight:700,color:"#22d3ee",fontSize:13}}>{fmtM(total)}</div>}
                  <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>مشاهده ←</div>
                </div>
              </div>
            );
          })}
        </div>
      }

    </div>
  );
}
