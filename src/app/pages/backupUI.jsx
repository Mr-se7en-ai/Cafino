// Generated from App.jsx by the module split (v1.50.0). Section: backupUI
import { PRINT_FONT_FAMILY, printFontCss, printWhenReady } from "../core/printFont.js";
import React, { useState, useEffect, useRef } from "react";
import { readJsonValue, readJsonResult, writeJsonValue } from "../../data/localRepository.js";
import { vault, getPrivacyConfig, setPrivacyConfig, isPhotoRef, photoRefId, makePhotoRef, migrateInlineMedia, applyReplacements, inlineMediaForBackup, sweepVault, dropMissingRefs, referencedIds } from "../../data/customerFiles.js";
import { dataUrlToBlob, blobToDataUrl, validateUpload, MAX_FILE_BYTES, MAX_FILES_PER_OWNER, MAX_TOTAL_BYTES } from "../../data/fileStore.js";
import { logActivity } from "../core/activity.js";
import { audit } from "../../audit/auditTrail.js";
import { askReason } from "../../audit/ReasonDialog.jsx";
import { toFA } from "../core/format.js";
import { storageUsage } from "../../data/storageUsage.js";
import { backupFileName, bkAll, bkDel, createSnapshot, dataExportSections, daysSinceLastBackup, downloadText, exportBackup, fmtBytes, fmtWhen, getBackupCfg, getBackupStatus, hasPreRestoreSnapshot, isoToJKey, parseBackupFile, restoreBackup, saveBackupCfg, undoRestoreFromSnapshot } from "../domain/backup.js";
import { BACKUP_STATUS_KEY, BTN, CUSTOMERS_STORAGE_KEY, INP } from "../core/constants.js";
import { useShopInfo } from "../domain/invoiceData.js";
import { sectionsToExcel, sectionsToHtml } from "../components/reportExport.jsx";
import { emitDataChange, lsWrite } from "../domain/sales.jsx";


// ══════════════════════════════════════════════════════════════════
// BACKUP CENTER (امنیت و پشتیبان‌گیری) — used in Settings and in the quick-backup modal
// ══════════════════════════════════════════════════════════════════
function BackupCenter(){
  const [cfg,setCfg]=useState(()=>getBackupCfg());
  const [status,setStatus]=useState(()=>getBackupStatus());
  const [snaps,setSnaps]=useState([]);
  const [msg,setMsg]=useState(null);
  const [busy,setBusy]=useState(false);
  const [encOn,setEncOn]=useState(false);
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [fileText,setFileText]=useState(null);
  const [fileInfo,setFileInfo]=useState(null);
  const [needPw,setNeedPw]=useState(false);
  const [restorePw,setRestorePw]=useState("");
  const [confirm,setConfirm]=useState(null); // {payload,label}
  const [confirmUndo,setConfirmUndo]=useState(false);
  const [lastFileDays,setLastFileDays]=useState(()=>daysSinceLastBackup());
  const [canUndo]=useState(()=>hasPreRestoreSnapshot());
  const [shop]=useShopInfo();
  const refresh=async()=>{setStatus(getBackupStatus());setLastFileDays(daysSinceLastBackup());try{setSnaps(await bkAll());}catch{setSnaps([]);}};
  useEffect(()=>{refresh();},[]);  
  const ok=(text)=>setMsg({type:"ok",text});
  const err=(text)=>setMsg({type:"err",text});
  const setC=(patch)=>{const n={...cfg,...patch};setCfg(n);saveBackupCfg(n);};

  const doExport=async(type)=>{
    setMsg(null);
    if(encOn){
      if(pw.length<4){err("رمز بکاپ باید حداقل ۴ کاراکتر باشد");return;}
      if(pw!==pw2){err("تکرار رمز مطابقت ندارد");return;}
    }
    setBusy(true);
    try{
      const p=await exportBackup(type,encOn?pw:"");
      logActivity(type==="financial"?"بکاپ اطلاعات مالی":"بکاپ کامل",encOn?"رمزدار":"");
      ok(`✓ فایل ${backupFileName(type,encOn)} دانلود شد (${toFA(p.sections)} بخش)${encOn?" — برای بازیابی به همین رمز نیاز دارید؛ اگر آن را گم کنید فایل قابل بازگشایی نیست.":""}`);
      await refresh();
    }catch(e){err("خطا در تهیه فایل پشتیبان");}
    setBusy(false);
  };
  const runNow=async()=>{
    setBusy(true);setMsg(null);
    const r=await createSnapshot("auto","full");
    if(r.ok){lsWrite(BACKUP_STATUS_KEY,{...getBackupStatus(),autoAt:r.at});ok("✓ بکاپ خودکار همین حالا گرفته شد");}
    else if(r.skipped)err("هنوز داده‌ای برای پشتیبان‌گیری وجود ندارد");
    else err("بکاپ خودکار ناموفق بود: "+(r.error||""));
    await refresh();setBusy(false);
  };
  const pickFile=(e)=>{
    const f=e.target.files&&e.target.files[0];e.target.value="";
    if(!f)return;
    setMsg(null);setNeedPw(false);setRestorePw("");setFileInfo(null);
    const r=new FileReader();
    r.onload=()=>{setFileText(r.result);inspect(r.result,"");};
    r.onerror=()=>err("خطا در خواندن فایل");
    r.readAsText(f);
  };
  const inspect=async(text,password)=>{
    try{
      const p=await parseBackupFile(text,password);
      setNeedPw(false);setFileInfo({type:p.type||"full",at:p.exportedAt,sections:Object.keys(p.data).length,version:p.appVersion,checked:!!p.checksum});
      setConfirm({payload:p,label:"فایل انتخاب‌شده"});
    }catch(e){
      if(e.needPassword){setNeedPw(true);setMsg(null);}
      else{setNeedPw(!!(fileText&&/"encrypted"\s*:\s*true/.test(text)));err(e.message||"فایل پشتیبان نامعتبر است");}
    }
  };
  const doRestore=async()=>{
    if(!confirm)return;
    const reason=await askReason({online:true,title:"بازیابی از بکاپ",desc:"داده‌های فعلی با محتوای بکاپ جایگزین می‌شود (یک نسخهٔ قبل از بازیابی برای بازگشت نگه داشته می‌شود).",presets:["خرابی/از دست رفتن داده","انتقال به دستگاه جدید","بازگشت به نسخهٔ قبلی","تست"],danger:true,confirmLabel:"بازیابی",icon:"♻️"});
    if(reason===null){setConfirm(null);return;}
    setBusy(true);
    try{
      restoreBackup(JSON.stringify(confirm.payload));
      audit({action:"backup_restore",entityType:"بکاپ",entityLabel:confirm.label,reason,details:`${confirm.payload&&confirm.payload.exportedAt?"تاریخ بکاپ: "+confirm.payload.exportedAt:""}`,before:null,after:{sections:confirm.payload&&confirm.payload.data?Object.keys(confirm.payload.data).length:null}});
      ok("✓ بازیابی شد — صفحه در حال بارگذاری مجدد...");
      setTimeout(()=>window.location.reload(),1200);
    }catch(e){err(e.message||"بازیابی ممکن نشد");setBusy(false);}
    setConfirm(null);
  };
  const doUndo=()=>{
    setBusy(true);
    try{undoRestoreFromSnapshot();audit({action:"backup_undo",entityType:"بکاپ",entityLabel:"بازگشت به قبل از آخرین بازیابی"});ok("✓ به حالت قبل از آخرین بازیابی برگشت — بارگذاری مجدد...");setTimeout(()=>window.location.reload(),1200);}
    catch(e){err(e.message||"بازگردانی ممکن نشد");setBusy(false);}
    setConfirmUndo(false);
  };
  const delSnap=async(id)=>{try{await bkDel(id);await refresh();}catch{err("حذف نشد");}};
  const dlSnap=(s)=>downloadText(`backup-${s.type==="financial"?"financial-":""}${isoToJKey(new Date(s.at).toISOString().slice(0,10),"daily")}-${new Date(s.at).toTimeString().slice(0,5).replace(":","")}.json`,JSON.stringify(s.payload,null,2));
  const excel=()=>{sectionsToExcel("پشتیبان داده‌ها — "+(shop.name||"کافی‌نت"),dataExportSections("all"),"data-export");};
  const pdf=()=>{
    const w=window.open("","_blank");
    if(!w){alert("مرورگر بازکردن پنجره‌ی جدید را مسدود کرد. لطفاً پاپ‌آپ را مجاز کنید.");return;}
    w.document.write(sectionsToHtml("گزارش مالی کامل",dataExportSections("financial"),shop,[]));w.document.close();
    printWhenReady(w);
  };

  const card={background:"var(--bg-card)",borderRadius:12,padding:18};
  const h={fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:10};
  const sub={fontSize:12,color:"var(--text-secondary)",lineHeight:1.9,marginBottom:10};
  const sel={...INP,marginTop:4,width:"auto",minWidth:130,padding:"7px 10px",fontSize:13};
  const stOk=status.ok!==false&&!!status.at;
  return(
    <div data-testid="backup-center" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div data-testid="bk-status" style={{...card,borderRight:`4px solid ${!status.at?"#fbbf24":stOk?"#16a34a":"#dc2626"}`}}>
        <div style={h}>🛡️ وضعیت پشتیبان‌گیری</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
          <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:11,color:"var(--text-muted)"}}>آخرین بکاپ خودکار</div>
            <div data-testid="bk-last-auto" style={{fontSize:14,fontWeight:700,marginTop:3}}>{status.autoAt?fmtWhen(status.autoAt):"هنوز گرفته نشده"}</div>
            <div data-testid="bk-state" style={{fontSize:12,marginTop:3,color:!status.at?"#fbbf24":stOk?"#4ade80":"#f87171"}}>{!status.at?"⏳ در انتظار":stOk?"وضعیت: ✅ موفق":`وضعیت: ❌ ${status.error||"ناموفق"}`}</div>
          </div>
          <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:11,color:"var(--text-muted)"}}>آخرین فایل بکاپ دانلودشده</div>
            <div style={{fontSize:14,fontWeight:700,marginTop:3,color:lastFileDays>=7?"#fbbf24":"var(--text-primary)"}}>{lastFileDays===Infinity?"هنوز دانلود نشده":lastFileDays<1?"امروز":`${toFA(Math.floor(lastFileDays))} روز پیش`}</div>
            {lastFileDays>=7&&<div style={{fontSize:11,color:"#fbbf24",marginTop:3}}>⚠️ یک فایل بکاپ دانلود کنید</div>}
          </div>
          <div style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:11,color:"var(--text-muted)"}}>نسخه‌های خودکار ذخیره‌شده</div>
            <div style={{fontSize:14,fontWeight:700,marginTop:3}}>{toFA(snaps.filter(s=>s.kind==="auto").length)} نسخه</div>
          </div>
        </div>
      </div>

      {(()=>{const u=storageUsage();if(!u.ok||u.level==="ok")return null;const pct=Math.round(u.ratio*100);return(
        <div data-testid="storage-usage-warn" style={{...card,border:`1px solid ${u.level==="critical"?"#dc2626":"#f59e0b"}`}}>
          <div style={h}>{u.level==="critical"?"🚨":"⚠️"} حافظهٔ محلی مرورگر {toFA(pct)}٪ پر است</div>
          <div style={sub}>داده‌های این نسخه در حافظهٔ مرورگر نگه‌داری می‌شوند و سقف آن حدود ۵ مگابایت است. پیش از پر شدن، بکاپ بگیرید و (در صورت امکان) به حالت سرور بروید؛ ثبت‌های جدید بعد از پرشدن ذخیره نمی‌شوند. بزرگ‌ترین بخش‌ها: {u.top.slice(0,3).map(t=>`${t.key.replace("cafenet_","")} (${fmtBytes(t.chars*2)})`).join("، ")}</div>
        </div>);})()}

      <div style={card}>
        <div style={h}>📥 بکاپ دستی (دانلود فایل)</div>
        <div style={sub}>فایل JSON روی همین دستگاه دانلود می‌شود؛ نام آن مثل <b dir="ltr">{backupFileName("full",false)}</b> است. «بکاپ کامل» همه چیز را دارد؛ «فقط مالی» تراکنش‌ها، فاکتورها، فروش، حساب‌ها و بدهی‌ها، تعهدات، مشتریان (برای کیف پول)، بستن صندوق و ابطال‌ها را.</div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginBottom:8,cursor:"pointer"}}>
          <input type="checkbox" data-testid="bk-enc" checked={encOn} onChange={e=>setEncOn(e.target.checked)}/> 🔐 رمزگذاری فایل بکاپ (پیشنهاد می‌شود؛ فایل شامل اطلاعات مشتریان و رمزهای ورود است)
        </label>
        {encOn&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
          <input data-testid="bk-pw" type="password" dir="ltr" placeholder="رمز بکاپ" value={pw} onChange={e=>setPw(e.target.value)} style={{...INP,marginTop:0,flex:"1 1 150px"}}/>
          <input data-testid="bk-pw2" type="password" dir="ltr" placeholder="تکرار رمز" value={pw2} onChange={e=>setPw2(e.target.value)} style={{...INP,marginTop:0,flex:"1 1 150px"}}/>
        </div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button data-testid="bk-full" disabled={busy} onClick={()=>doExport("full")} style={{...BTN("#16a34a"),flex:"1 1 180px",padding:11}}>📦 بکاپ کامل</button>
          <button data-testid="bk-fin" disabled={busy} onClick={()=>doExport("financial")} style={{...BTN("#0d9488"),flex:"1 1 180px",padding:11}}>💰 بکاپ فقط اطلاعات مالی</button>
        </div>
      </div>

      <div style={card}>
        <div style={h}>⏱️ بکاپ خودکار</div>
        <div style={sub}>برنامه به‌صورت خودکار از داده‌ها نسخه می‌گیرد و چند نسخه آخر را داخل حافظه مرورگر/برنامه نگه می‌دارد. این نسخه‌ها از اشتباه‌های روزمره (حذف یا بازیابی اشتباه) محافظت می‌کنند؛ <b>اگر حافظه مرورگر پاک شود یا دستگاه از بین برود از بین می‌روند</b>، پس هر چند وقت یک فایل بکاپ هم دانلود کنید (یا گزینه دانلود خودکار فایل را روشن کنید).</div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginBottom:10,cursor:"pointer"}}>
          <input type="checkbox" data-testid="bk-auto-toggle" checked={cfg.auto} onChange={e=>setC({auto:e.target.checked})}/> بکاپ خودکار فعال باشد
        </label>
        {cfg.auto&&<div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:10}}>
          <label style={{fontSize:12,color:"var(--text-secondary)"}}>تکرار
            <select data-testid="bk-interval" value={cfg.everyHours} onChange={e=>setC({everyHours:Number(e.target.value)})} style={sel}>
              <option value={0}>هر بار که برنامه باز می‌شود</option><option value={6}>هر ۶ ساعت</option><option value={12}>هر ۱۲ ساعت</option><option value={24}>هر روز</option>
            </select></label>
          <label style={{fontSize:12,color:"var(--text-secondary)"}}>تعداد نسخه نگهداری‌شده
            <select data-testid="bk-keep" value={cfg.keep} onChange={e=>setC({keep:Number(e.target.value)})} style={sel}>
              <option value={3}>۳ نسخه</option><option value={7}>۷ نسخه</option><option value={14}>۱۴ نسخه</option><option value={30}>۳۰ نسخه</option>
            </select></label>
        </div>}
        {cfg.auto&&<label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,marginBottom:10,cursor:"pointer",color:"var(--text-secondary)"}}>
          <input type="checkbox" checked={cfg.autoDownload} onChange={e=>setC({autoDownload:e.target.checked})}/> همراه هر بکاپ خودکار، یک فایل هم دانلود شود (بدون رمز؛ ممکن است مرورگر اجازه دانلود‌های پیاپی را بپرسد)
        </label>}
        <button data-testid="bk-run-now" disabled={busy} onClick={runNow} style={{...BTN("var(--border)","var(--text-primary)"),padding:"9px 16px",fontSize:12}}>⚡ همین حالا بکاپ خودکار بگیر</button>

        {snaps.length>0&&<div data-testid="bk-snaps" style={{marginTop:14,display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text-secondary)"}}>نسخه‌های ذخیره‌شده در برنامه</div>
          {snaps.map(s=>(
            <div key={s.id} data-testid="bk-snap-row" style={{display:"flex",alignItems:"center",gap:8,background:"var(--bg-app)",borderRadius:10,padding:"8px 12px",flexWrap:"wrap"}}>
              <div style={{flex:"1 1 160px",fontSize:12}}><b>{fmtWhen(s.at)}</b><div style={{fontSize:10,color:"var(--text-dim)"}}>{s.kind==="auto"?"خودکار":"دستی"} · {s.type==="financial"?"مالی":"کامل"} · {fmtBytes(s.size)} · نسخه {toFA(s.appVersion||"")}</div></div>
              <button data-testid="bk-snap-restore" onClick={()=>setConfirm({payload:s.payload,label:`نسخه خودکار ${fmtWhen(s.at)}`})} style={{...BTN("#2563eb"),padding:"5px 10px",fontSize:11}}>↩️ بازیابی</button>
              <button onClick={()=>dlSnap(s)} style={{...BTN("var(--border)","var(--text-primary)"),padding:"5px 10px",fontSize:11}}>⬇️ دانلود</button>
              <button onClick={()=>delSnap(s.id)} style={{...BTN("#450a0a","#f87171"),padding:"5px 10px",fontSize:11}}>🗑️</button>
            </div>))}
        </div>}
      </div>

      <div style={card}>
        <div style={h}>📤 بازیابی از فایل</div>
        <div style={sub}>فایل بکاپ (کامل یا مالی، رمزدار یا بدون رمز) را انتخاب کنید. فایل قبل از هر تغییر بررسی و کنترل صحت می‌شود و یک نسخه از اطلاعات فعلی برای بازگشت نگه داشته می‌شود. بکاپ «فقط مالی» فقط بخش‌های مالی را جایگزین می‌کند و بقیه تنظیمات و انبار دست‌نخورده می‌ماند.</div>
        <label style={{...BTN("#2563eb"),display:"block",textAlign:"center",padding:11,cursor:"pointer",boxSizing:"border-box"}}>
          📂 انتخاب فایل بکاپ
          <input data-testid="bk-file" type="file" accept=".json,application/json" onChange={pickFile} style={{display:"none"}}/>
        </label>
        {needPw&&<div style={{display:"flex",gap:8,marginTop:10}}>
          <input data-testid="bk-restore-pw" type="password" dir="ltr" placeholder="رمز فایل" value={restorePw} onChange={e=>setRestorePw(e.target.value)} style={{...INP,marginTop:0,flex:1}}/>
          <button data-testid="bk-unlock" onClick={()=>inspect(fileText,restorePw)} style={{...BTN("#7c3aed"),padding:"8px 14px"}}>🔓 بازگشایی</button>
        </div>}
        {canUndo&&<div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:8}}>نسخه‌ای از قبل از آخرین بازیابی موجود است؛ در صورت اشتباه می‌توانید به آن برگردید.</div>
          <button onClick={()=>setConfirmUndo(true)} style={{...BTN("var(--border)","#fbbf24"),padding:"8px 14px",fontSize:12}}>↺ بازگشت به قبل از آخرین بازیابی</button>
        </div>}
      </div>

      <div style={card}>
        <div style={h}>📊 خروجی Excel و PDF</div>
        <div style={sub}>Excel شامل همه بخش‌ها در شیت‌های جدا (تراکنش‌ها، فاکتورها، فروش‌ها، بدهی‌ها، مشتریان، انبار، تعهدات، ابطال‌شده‌ها) است. PDF/چاپ شامل بخش‌های مالی است. خروجی‌های هر گزارش را هم می‌توانید از بخش «گزارش‌ها» بگیرید. این خروجی‌ها برای بررسی و ارائه‌اند و جایگزین بکاپ نیستند (قابل بازیابی نیستند).</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button data-testid="bk-excel" onClick={excel} style={{...BTN("#166534"),padding:"10px 16px",fontSize:13}}>📗 خروجی Excel (همه داده‌ها)</button>
          <button data-testid="bk-pdf" onClick={pdf} style={{...BTN("#b91c1c"),padding:"10px 16px",fontSize:13}}>📕 خروجی PDF / چاپ (مالی)</button>
        </div>
      </div>

      {msg&&<div data-testid="bk-msg" style={{background:msg.type==="ok"?"#052e16":"#2d0a0a",border:`1px solid ${msg.type==="ok"?"#16a34a44":"#dc262644"}`,borderRadius:8,padding:"10px 14px",fontSize:12,lineHeight:1.9,color:msg.type==="ok"?"#4ade80":"#f87171"}}>{msg.text}</div>}

      {confirm&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:330,padding:14}} onClick={()=>setConfirm(null)}>
          <div data-testid="bk-confirm" onClick={e=>e.stopPropagation()} style={{background:"var(--bg-card)",borderRadius:16,padding:24,width:"100%",maxWidth:360,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
            <div style={{fontWeight:700,marginBottom:8}}>تایید بازیابی اطلاعات</div>
            <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9,marginBottom:6}}>{confirm.label} — {confirm.payload.type==="financial"?"بکاپ مالی":"بکاپ کامل"} · {toFA(Object.keys(confirm.payload.data).length)} بخش{confirm.payload.exportedAt?` · ${fmtWhen(Date.parse(confirm.payload.exportedAt))}`:""}{confirm.payload.checksum?" · ✅ صحت تایید شد":""}</div>
            <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:18,lineHeight:1.9}}>اطلاعات فعلی {confirm.payload.type==="financial"?"بخش‌های مالی":"برنامه"} با این نسخه جایگزین می‌شود. قبل از آن یک نسخه از وضعیت فعلی برای بازگشت ذخیره می‌شود.</div>
            <div style={{display:"flex",gap:10}}>
              <button data-testid="bk-confirm-restore" onClick={doRestore} disabled={busy} style={{...BTN("#dc2626"),flex:1}}>بله، جایگزین شود</button>
              <button onClick={()=>setConfirm(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>انصراف</button>
            </div>
          </div>
        </div>)}
      {confirmUndo&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:330,padding:14}} onClick={()=>setConfirmUndo(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-card)",borderRadius:16,padding:24,width:"100%",maxWidth:340,textAlign:"center"}}>
            <div style={{fontSize:30,marginBottom:8}}>↺</div>
            <div style={{fontWeight:700,marginBottom:8}}>بازگشت به قبل از آخرین بازیابی</div>
            <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:18}}>اطلاعات فعلی با نسخه ذخیره‌شده پیش از بازیابی جایگزین می‌شود. ادامه می‌دهید؟</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={doUndo} disabled={busy} style={{...BTN("#dc2626"),flex:1}}>بله، برگردان</button>
              <button onClick={()=>setConfirmUndo(false)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>انصراف</button>
            </div>
          </div>
        </div>)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PRIVACY (حریم خصوصی فایل‌ها و عکس‌های مشتریان)
// ══════════════════════════════════════════════════════════════════
export function PrivacyPanel(){
  const [stats,setStats]=useState(null);
  const [cfg,setCfg]=useState(()=>getPrivacyConfig());
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const readCustomers=()=>{const r=readJsonResult(CUSTOMERS_STORAGE_KEY,[]);return r.ok&&Array.isArray(r.value)?r.value:null;};
  const refresh=async()=>{
    const st=vault();const custs=readCustomers()||[];
    const inline=custs.reduce((n,c)=>n+(c.files||[]).filter(f=>f&&typeof f.data==="string").length+(typeof c.photo==="string"&&c.photo.startsWith("data:")?1:0),0);
    if(!st){setStats({available:false,inline});return;}
    try{const list=await st.list();const refs=new Set(referencedIds(custs).map(String));setStats({available:true,count:list.length,bytes:list.reduce((a,m)=>a+(Number(m.size)||0),0),orphans:list.filter(m=>!refs.has(String(m.id))).length,unencrypted:list.filter(m=>m.enc===false).length,inline});}
    catch{setStats({available:false,inline});}
  };
  useEffect(()=>{refresh();},[]);  
  const mb=(b)=>toFA((b/1048576).toFixed(1));
  const run=async(fn)=>{setBusy(true);setMsg("");try{await fn();}catch(e){setMsg("⚠️ "+(e&&e.message||"انجام نشد"));}setBusy(false);refresh();};
  const setRetention=(days)=>{setPrivacyConfig({retentionDays:days});setCfg(getPrivacyConfig());};
  const applyRetention=()=>run(async()=>{
    const st=vault();const custs=readCustomers();if(!st||!custs||!(cfg.retentionDays>0)){setMsg("ابتدا مدت نگهداری را انتخاب کنید");return;}
    const gone=await st.purgeOlderThan(cfg.retentionDays);
    if(gone.length){lsWrite(CUSTOMERS_STORAGE_KEY,dropMissingRefs(readCustomers()||custs,gone));emitDataChange();logActivity("حذف فایل‌های قدیمی مشتریان",`${gone.length} فایل`);}
    setMsg(gone.length?`✓ ${toFA(gone.length)} فایل قدیمی‌تر از ${toFA(cfg.retentionDays)} روز حذف امن شد`:"فایل قدیمی‌ای برای حذف وجود نداشت");
  });
  const cleanOrphans=()=>run(async()=>{
    const st=vault();const custs=readCustomers();if(!st||!custs)return;
    if(!window.confirm("فایل‌هایی که به هیچ مشتری‌ای وصل نیستند برای همیشه حذف می‌شوند. ادامه می‌دهید؟"))return;
    const gone=await st.removeUnreferenced(referencedIds(custs),{graceMs:0});
    setMsg(gone.length?`✓ ${toFA(gone.length)} فایل بی‌صاحب حذف امن شد`:"فایل بی‌صاحبی پیدا نشد");
  });
  const migrateNow=()=>run(async()=>{
    const st=vault();const custs=readCustomers();if(!st||!custs)return;
    const m=await migrateInlineMedia(custs,st);
    if(m.replacements.size){lsWrite(CUSTOMERS_STORAGE_KEY,applyReplacements(readCustomers()||custs,m.replacements));emitDataChange();}
    setMsg(`✓ ${toFA(m.moved)} مورد به گاوصندوق رمزگذاری‌شده منتقل شد${m.failed?` (${toFA(m.failed)} مورد ناموفق)`:""}`);
  });
  const card={background:"var(--bg-card)",borderRadius:12,padding:18};
  const row={display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",padding:"8px 0",borderBottom:"1px solid var(--border)",fontSize:13};
  return(
    <div data-testid="privacy-panel" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={card}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>🔒 فایل‌ها و عکس‌های مشتریان</div>
        <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:2}}>
          اسناد و عکس مشتریان دیگر به‌صورت متن Base64 داخل داده‌های برنامه ذخیره نمی‌شوند؛ هر فایل جداگانه با یک کلید تصادفی (AES-GCM) رمزگذاری و در IndexedDB نگه‌داری می‌شود. فایل‌ها در همگام‌سازی با سرور فرستاده نمی‌شوند و در پشتیبان خودکار نیستند؛ فقط در پشتیبان دستی (بهتر است با رمز) همراه‌اند.
          حذف فایل «حذف امن» است: ابتدا کلید و محتوا بازنویسی و سپس رکورد پاک می‌شود.
        </div>
        {stats&&!stats.available&&<div style={{marginTop:10,fontSize:12,color:"#fbbf24"}}>⚠️ ذخیره‌سازی امن در این مرورگر در دسترس نیست (مثلاً حالت ناشناس)؛ فایل‌ها به‌صورت قدیمی نگه‌داری می‌شوند.</div>}
        {stats&&stats.available&&<div style={{marginTop:10}}>
          <div style={row}><span>تعداد فایل‌ها و عکس‌ها</span><b data-testid="privacy-count">{toFA(stats.count)}</b></div>
          <div style={row}><span>حجم مصرفی (سقف {mb(MAX_TOTAL_BYTES)} مگابایت)</span><b>{mb(stats.bytes)} مگابایت</b></div>
          <div style={row}><span>محدودیت هر فایل / هر مشتری</span><b>{mb(MAX_FILE_BYTES)} مگابایت · {toFA(MAX_FILES_PER_OWNER)} فایل</b></div>
          {stats.unencrypted>0&&<div style={{...row,color:"#fbbf24"}}><span>فایل‌های بدون رمزگذاری (مرورگر WebCrypto را پشتیبانی نمی‌کند)</span><b>{toFA(stats.unencrypted)}</b></div>}
        </div>}
        {stats&&stats.inline>0&&<div style={{marginTop:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:12,color:"#fbbf24"}}>
          <span>⚠️ {toFA(stats.inline)} مورد قدیمی هنوز به‌صورت Base64 داخل داده‌ها است.</span>
          <button disabled={busy||!stats.available} onClick={migrateNow} data-testid="privacy-migrate" style={{...BTN("#2563eb"),padding:"5px 12px",fontSize:12}}>انتقال به گاوصندوق</button>
        </div>}
      </div>
      <div style={card}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>🗓️ حذف خودکار فایل‌های قدیمی</div>
        <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9,marginBottom:10}}>فایل‌هایی که قدیمی‌تر از مدت انتخابی باشند هنگام اجرای برنامه به‌طور امن حذف می‌شوند. پیش‌فرض: غیرفعال.</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <select data-testid="privacy-retention" value={cfg.retentionDays||0} onChange={e=>setRetention(Number(e.target.value))} style={{background:"var(--bg-app)",color:"var(--text-primary)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:13}}>
            <option value={0}>غیرفعال</option><option value={90}>۹۰ روز</option><option value={180}>۱۸۰ روز</option><option value={365}>یک سال</option><option value={730}>دو سال</option>
          </select>
          <button disabled={busy||!(cfg.retentionDays>0)} onClick={applyRetention} data-testid="privacy-apply" style={{...BTN("#dc2626"),padding:"7px 14px",fontSize:12,opacity:cfg.retentionDays>0?1:.5}}>اعمال همین حالا</button>
          <button disabled={busy||!stats||!stats.available||!(stats.orphans>0)} onClick={cleanOrphans} data-testid="privacy-orphans" style={{...BTN("var(--border)","var(--text-secondary)"),padding:"7px 14px",fontSize:12}}>پاکسازی فایل‌های بی‌صاحب{stats&&stats.orphans>0?` (${toFA(stats.orphans)})`:""}</button>
        </div>
        {msg&&<div data-testid="privacy-msg" style={{marginTop:10,fontSize:12,color:msg.startsWith("⚠️")?"#f87171":"#4ade80"}}>{msg}</div>}
      </div>
      <div style={card}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>🔑 حساب کاربری محلی</div>
        <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:2}}>
          ورود محلی فقط برای حالت آزمایشی/آفلاین روی یک دستگاه است و منبع اصلی هویت نیست؛ با تنظیم سرور، ورود و کاربران از سرور می‌آیند. رمزهای محلی با PBKDF2-SHA256 (۶۰۰٬۰۰۰ تکرار) و salt تصادفی ذخیره می‌شوند؛ نشست ورود پس از ۲ ساعت بی‌کاری یا ۱۲ ساعت منقضی می‌شود، پنج رمز اشتباه ورود را موقتاً قفل می‌کند و تغییر رمز همهٔ نشست‌های دیگر را باطل می‌کند.
        </div>
      </div>
    </div>
  );
}

export function BackupSettingsPanel(){return <BackupCenter/>;}

export function BackupModal({onClose}){
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:300,padding:14,overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-app)",borderRadius:16,padding:16,width:"100%",maxWidth:640,margin:"20px 0",boxShadow:"0 25px 60px #000a"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)"}}>💾 امنیت و پشتیبان‌گیری</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <BackupCenter/>
      </div>
    </div>
  );
}
