// Generated from App.jsx by the module split (v1.50.0). Section: tariff
import { audit } from "../../audit/auditTrail.js";
import { askReason } from "../../audit/ReasonDialog.jsx";
import React, { useState, useEffect, useRef } from "react";
import Icon, { ICONS } from "../../components/Icon.jsx";
import { toFA } from "../core/format.js";
import { BASE_INCOME_CATS, BTN, DEFAULT_TARIFF_DATA, INP, TARIFF_STORAGE_KEY } from "../core/constants.js";
import { lsRead, lsWrite } from "../domain/sales.jsx";
import { Empty } from "../components/ui.jsx";
import { useShopInfo } from "../domain/invoiceData.js";
import { getTariffFileMeta, loadTariffFileBlob, removeTariffFile, saveTariffFile, setTariffFileActive } from "../domain/tariffFile.js";
import ZoomImage from "../components/ZoomImage.jsx";
import { loadVendor } from "../../vendor/loader.js";
import { importWorkbookSheets } from "../domain/xlsxImport.js";
import { IMPORT_FILE_RE, IMPORT_MAX_BYTES, TARIFF_IMPORT_UNDO_KEY, buildTariffFromSheets, decodeCsvBuffer, diffTariffs, parseCsv, tariffToAoa } from "../domain/tariffImport.js";
import { planRounding, ROUND_MODES, ROUND_UNITS, ROUND_UNIT_LABEL, TARIFF_ROUND_CFG_KEY, TARIFF_ROUND_UNDO_KEY } from "../domain/tariffRound.js";



export function useTariffData(){
  const [data,setData]=useState(()=>{
    try{
      const stored=JSON.parse(localStorage.getItem(TARIFF_STORAGE_KEY)||"null");
      return (stored&&Array.isArray(stored)&&stored.length>0)?stored:DEFAULT_TARIFF_DATA;
    }catch{return DEFAULT_TARIFF_DATA;}
  });
  useEffect(()=>{lsWrite(TARIFF_STORAGE_KEY,data);},[data]);
  return [data,setData];
}

// ── Pure derivations from whatever tariff data is currently active (default or user-edited) ──
export function deriveTariffPriceMap(tariffData){
  const map={};
  tariffData.forEach(g=>{g.items.forEach(it=>{map[g.cat+" > "+it.name]=it.price;});});
  return map;
}

function deriveTariffIncomeCats(tariffData){
  return tariffData.map(g=>({
    group:g.cat,
    items:g.items.map(it=>({label:it.name,price:it.price,key:g.cat+" > "+it.name}))
  }));
}

export function deriveIncomeCategoryOptions(tariffData){
  const tariffIncomeCats=deriveTariffIncomeCats(tariffData);
  return [
    {value:"مبلغ دلخواه",label:"💵 مبلغ دلخواه (دستی)",plainLabel:"مبلغ دلخواه",price:0,group:null},
    ...BASE_INCOME_CATS.filter(c=>c!=="مبلغ دلخواه").map(c=>({value:c,label:c,plainLabel:c,price:0,group:"خدمات پایه"})),
    ...tariffIncomeCats.flatMap(g=>g.items.map(it=>({
      value:it.key,
      label:it.label+(it.price>0?" · "+toFA(it.price.toLocaleString("fa-IR"))+" ریال":""),
      plainLabel:it.label,
      price:it.price,
      group:g.group
    }))),
  ];
}

const fmtSize=(n)=>n>=1048576?toFA((n/1048576).toFixed(1))+" مگابایت":toFA(Math.max(1,Math.round(n/1024)))+" کیلوبایت";

// تعرفهٔ شخصی (فایل آپلودشده): جایگزین جدول داخلی در همین صفحه
function TariffFileView({meta,inactive,onUseDefault,onActivate,onReplace,onRemove}){
  const [url,setUrl]=useState("");
  const [err,setErr]=useState("");
  const [confirmDel,setConfirmDel]=useState(false);
  useEffect(()=>{
    let alive=true,u="";
    setUrl("");setErr("");
    loadTariffFileBlob().then(b=>{
      if(!alive)return;
      if(!b){setErr("محتوای فایل پیدا نشد (ممکن است حافظهٔ مرورگر پاک شده باشد). فایل را دوباره آپلود کنید.");return;}
      u=URL.createObjectURL(b);setUrl(u);
    }).catch(()=>{if(alive)setErr("خواندن فایل ممکن نشد.");});
    return()=>{alive=false;if(u)setTimeout(()=>URL.revokeObjectURL(u),0);};
  },[meta.uploadedAt]);
  const isPdf=meta.type==="application/pdf";
  const download=()=>{if(!url)return;const a=document.createElement("a");a.href=url;a.download=meta.name||"tariff";document.body.appendChild(a);a.click();a.remove();};
  const open=()=>{if(url)window.open(url,"_blank");};
  return(
    <div data-testid="tariff-file-view" style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div style={{flex:1,minWidth:160}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)"}}>{inactive?"👁️ پیش‌نمایش فایل تعرفهٔ آپلودی (فعلاً غیرفعال)":"📎 تعرفهٔ شما (جایگزین تعرفهٔ اصلی)"}</div>
          <div data-testid="tariff-file-name" style={{fontSize:12,color:"var(--text-muted)",marginTop:3,wordBreak:"break-all"}}>{meta.name} · {isPdf?"PDF":"JPG"} · {fmtSize(meta.size||0)}</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button data-testid="tariff-file-download" onClick={download} disabled={!url} style={{...BTN("var(--border)","var(--text-primary)"),padding:"6px 12px",fontSize:12}}>⬇️ دانلود</button>
          <button data-testid="tariff-file-replace" onClick={onReplace} style={{...BTN("#2563eb"),padding:"6px 12px",fontSize:12}}>🔄 تعویض فایل</button>
          {inactive
            ?<button data-testid="tariff-file-activate2" onClick={onActivate} style={{...BTN("#16a34a"),padding:"6px 12px",fontSize:12}}>✓ نمایش این فایل به‌جای جدول</button>
            :<button data-testid="tariff-file-default" onClick={onUseDefault} style={{...BTN("var(--border)","var(--text-primary)"),padding:"6px 12px",fontSize:12}}>↩︎ استفاده از تعرفهٔ اصلی</button>}
          {!confirmDel
            ?<button data-testid="tariff-file-remove" onClick={()=>setConfirmDel(true)} style={{...BTN("#450a0a","#f87171"),padding:"6px 12px",fontSize:12}}>🗑️ حذف فایل</button>
            :<span style={{display:"inline-flex",gap:6,alignItems:"center",fontSize:12}}>حذف شود؟
              <button data-testid="tariff-file-remove-yes" onClick={()=>{setConfirmDel(false);onRemove();}} style={{...BTN("#dc2626"),padding:"6px 10px",fontSize:12}}>بله</button>
              <button onClick={()=>setConfirmDel(false)} style={{...BTN("var(--border)","var(--text-primary)"),padding:"6px 10px",fontSize:12}}>خیر</button></span>}
        </div>
      </div>
      {err&&<div data-testid="tariff-file-error" style={{background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#f87171"}}>⚠️ {err}</div>}
      {!err&&!isPdf&&url&&<ZoomImage src={url} alt="تعرفهٔ آپلودشده" testid="tariff-file-zoom"/>}
      {!err&&isPdf&&(
        <div style={{textAlign:"center",padding:"26px 10px",background:"var(--bg-app)",borderRadius:10}}>
          <div style={{fontSize:44,marginBottom:8}}>📄</div>
          <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:12}}>برای دیدن یا چاپ تعرفه، فایل PDF را باز کنید. (زوم داخل صفحه فقط برای عکس JPG است؛ PDF در نمایشگر خود مرورگر زوم می‌شود.)</div>
          <button data-testid="tariff-file-open" onClick={open} disabled={!url} style={{...BTN("#2563eb"),padding:"9px 22px",fontSize:13}}>باز کردن PDF</button>
        </div>
      )}
      <div style={{fontSize:11,color:"var(--text-muted)",marginTop:12,lineHeight:1.9}}>این فایل برای نمایش و چاپ است. قیمت خدمات هنگام ثبت فروش و فاکتور همچنان از «تعرفهٔ اصلی» (جدول داخلی) خوانده می‌شود؛ برای ویرایش آن گزینهٔ «استفاده از تعرفهٔ اصلی» را بزنید.</div>
    </div>
  );
}

// ورود تعرفه از Excel / CSV و جایگزینی تعرفهٔ فعلی (با پیش‌نمایش، دلیل، لاگ و بازگردانی)
function TariffImportPanel({tariffData,setTariffData,onClose,onImported}){
  const [parsed,setParsed]=useState(null);
  const [unit,setUnit]=useState("rial");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [undo,setUndo]=useState(()=>lsRead(TARIFF_IMPORT_UNDO_KEY,null));
  const input=useRef();
  const result=React.useMemo(()=>parsed?buildTariffFromSheets(parsed.sheets,{unit}):null,[parsed,unit]);
  const diff=result&&result.count?diffTariffs(tariffData,result.data):null;
  const pick=async(e)=>{
    const f=e.target.files&&e.target.files[0];e.target.value="";
    if(!f)return;
    setErr("");setMsg("");setParsed(null);
    if(!IMPORT_FILE_RE.test(f.name)){setErr("فقط فایل Excel (xlsx / xls) یا CSV پذیرفته می‌شود.");return;}
    if(f.size>IMPORT_MAX_BYTES){setErr(`حجم فایل بیشتر از ${toFA(IMPORT_MAX_BYTES/1048576)} مگابایت است.`);return;}
    setBusy(true);
    try{
      const buf=await f.arrayBuffer();
      let sheets;
      if(/\.csv$/i.test(f.name))sheets=[{name:"CSV",rows:parseCsv(decodeCsvBuffer(buf))}];
      else{
        sheets=await importWorkbookSheets(buf);          // بازرسی ظرف + Worker/محدودیت‌ها (domain/xlsxSafe.js)
      }
      const first=buildTariffFromSheets(sheets,{unit:"rial"});
      setUnit(first.detectedUnit==="toman"?"toman":"rial");
      setParsed({name:f.name,sheets});
    }catch(er){setErr("خواندن فایل ممکن نشد: "+(er&&er.message?er.message:"فایل خراب یا ناشناخته است"));}
    setBusy(false);
  };
  const apply=async()=>{
    if(!result||!result.count)return;
    const reason=await askReason({title:"جایگزینی تعرفه با فایل واردشده",desc:`تعرفهٔ فعلی (${toFA(diff.oldCount)} خدمت) با ${toFA(result.count)} خدمت از «${parsed.name}» جایگزین می‌شود. می‌توانید آخرین جایگزینی را بازگردانید.`,presets:["نرخنامهٔ جدید اتحادیه","به‌روزرسانی قیمت‌ها","ورود دسته‌جمعی"],danger:true,confirmLabel:"جایگزین شود"});
    if(reason===null)return;
    audit({action:"price_change",label:"جایگزینی تعرفه از فایل Excel/CSV",entityType:"تعرفه",entityLabel:parsed.name,reason,details:`${result.count} خدمت · ${diff.added} جدید · ${diff.changed} تغییر قیمت · ${diff.removed} حذف · واحد ${unit==="toman"?"تومان":"ریال"}`});
    const rec={at:Date.now(),file:parsed.name,count:result.count,before:tariffData};
    lsWrite(TARIFF_IMPORT_UNDO_KEY,rec);setUndo(rec);
    lsWrite(TARIFF_ROUND_UNDO_KEY,null);                  // بازگردانی گرد کردنِ قبلی دیگر معنا ندارد
    setTariffData(result.data);
    setMsg(`تعرفه جایگزین شد: ${toFA(result.count)} خدمت در ${toFA(result.data.length)} دسته.`);
    setParsed(null);
    onImported&&onImported();
  };
  const undoNow=async()=>{
    if(!undo)return;
    const reason=await askReason({title:"بازگردانی تعرفهٔ قبل از ورود فایل",desc:`تعرفه به حالت قبل از ورود «${undo.file}» برمی‌گردد؛ ویرایش‌های بعد از آن از بین می‌رود.`,presets:["فایل اشتباه بود"],danger:true,confirmLabel:"بازگردانی"});
    if(reason===null)return;
    audit({action:"price_change",label:"بازگردانی تعرفه به قبل از ورود فایل",entityType:"تعرفه",entityLabel:undo.file,reason,details:`${undo.before.reduce((n,g)=>n+g.items.length,0)} خدمت`});
    setTariffData(undo.before);lsWrite(TARIFF_IMPORT_UNDO_KEY,null);setUndo(null);setMsg("تعرفهٔ قبلی بازگردانده شد.");
  };
  const template=async()=>{
    try{
      const XLSX=await loadVendor("xlsx");
      const ws=XLSX.utils.aoa_to_sheet(tariffToAoa(tariffData));ws["!views"]=[{RTL:true}];ws["!cols"]=[{wch:24},{wch:44},{wch:16},{wch:40}];
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"تعرفه");XLSX.writeFile(wb,"tariff-template.xlsx");
    }catch(er){setErr("ساخت فایل نمونه ممکن نشد: "+(er&&er.message||""));}
  };
  const stat=(n,l,c)=><div style={{background:"var(--bg-app)",borderRadius:8,padding:"8px 12px",minWidth:84,textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:c||"var(--text-primary)"}}>{toFA(n)}</div><div style={{fontSize:11,color:"var(--text-muted)"}}>{l}</div></div>;
  const rowsShown=result?result.data.flatMap(g=>g.items.map(it=>({cat:g.cat,...it}))).slice(0,12):[];
  return(
    <div data-testid="tariff-import-panel" style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>📥 ورود تعرفه از Excel / CSV</div>
        <button onClick={onClose} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"4px 10px",fontSize:12}}>بستن</button>
      </div>
      <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:2,marginBottom:12}}>
        فایل باید ردیف عنوان ستون‌ها داشته باشد: <b>دسته</b> (اختیاری) · <b>خدمت</b> · <b>قیمت</b> · <b>توضیح</b> (اختیاری). اگر ستون «دسته» نباشد، ردیفی که فقط نام دارد (بدون قیمت) عنوان یک دسته حساب می‌شود. قیمت خالی یا «توافقی» = توافقی. پس از تأیید، تعرفهٔ فعلی به‌طور کامل با این فایل جایگزین می‌شود.
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <input ref={input} data-testid="tariff-import-input" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={pick} style={{display:"none"}}/>
        <button data-testid="import-choose" onClick={()=>input.current&&input.current.click()} disabled={busy} style={{...BTN("#2563eb"),padding:"8px 16px",fontSize:12}}>{busy?"در حال خواندن…":"انتخاب فایل Excel / CSV"}</button>
        <button data-testid="import-template" onClick={template} style={{...BTN("var(--border)","var(--text-primary)"),padding:"8px 16px",fontSize:12}}>⬇️ دانلود نمونه (تعرفهٔ فعلی)</button>
        {undo&&<button data-testid="import-undo" onClick={undoNow} style={{...BTN("#78350f","#fbbf24"),padding:"8px 16px",fontSize:12}}>↩︎ بازگردانی تعرفهٔ قبل از «{undo.file}»</button>}
      </div>
      {err&&<div data-testid="import-error" style={{background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#f87171",marginBottom:10}}>⚠️ {err}</div>}
      {msg&&<div data-testid="import-msg" style={{background:"#052e16",border:"1px solid #16a34a55",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#4ade80",marginBottom:10}}>✓ {msg}</div>}
      {result&&(
        <div data-testid="import-preview">
          <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:8}}>فایل: <b style={{wordBreak:"break-all"}}>{parsed.name}</b>{parsed.sheets.length>1&&` · ${toFA(parsed.sheets.length)} شیت`}</div>
          <div data-testid="import-summary" style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {stat(result.data.length,"دسته")}{stat(result.count,"خدمت","#4ade80")}{stat(result.errors.length,"ردیف ردشده",result.errors.length?"#f87171":undefined)}{stat(result.warnings.length,"هشدار",result.warnings.length?"#fbbf24":undefined)}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:10,fontSize:12}}>
            <span style={{color:"var(--text-muted)"}}>قیمت‌های فایل به:</span>
            {[["rial","ریال"],["toman","تومان (×۱۰ به ریال)"]].map(([k,l])=><button key={k} data-testid={`import-unit-${k}`} onClick={()=>setUnit(k)} style={{...BTN(unit===k?"#2563eb":"var(--bg-app)",unit===k?"#fff":"var(--text-secondary)"),padding:"5px 12px",fontSize:12,border:"1px solid var(--border)"}}>{l}</button>)}
            {result.detectedUnit&&<span style={{color:"var(--text-dim)"}}>(از عنوان ستون «{result.detectedUnit==="toman"?"تومان":"ریال"}» تشخیص داده شد)</span>}
          </div>
          {diff&&<div data-testid="import-diff" style={{fontSize:12,color:"var(--text-secondary)",marginBottom:10,lineHeight:2}}>
            نسبت به تعرفهٔ فعلی ({toFA(diff.oldCount)} خدمت): <b style={{color:"#4ade80"}}>{toFA(diff.added)} جدید</b> · <b style={{color:"#fbbf24"}}>{toFA(diff.changed)} تغییر قیمت</b> · <b style={{color:"#f87171"}}>{toFA(diff.removed)} حذف‌شده</b> · {toFA(diff.same)} بدون تغییر
          </div>}
          {rowsShown.length>0&&<div style={{overflowX:"auto",marginBottom:10}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{color:"var(--text-muted)",textAlign:"right"}}>{["دسته","خدمت","قیمت (ریال)","توضیح"].map(h=><th key={h} style={{padding:"6px 8px",borderBottom:"1px solid var(--border)",fontWeight:600}}>{h}</th>)}</tr></thead>
            <tbody>{rowsShown.map((r,i)=><tr key={i} data-testid="import-preview-row"><td style={{padding:"5px 8px",color:"var(--text-muted)"}}>{r.cat}</td><td style={{padding:"5px 8px"}}>{r.name}</td><td style={{padding:"5px 8px",whiteSpace:"nowrap"}}>{r.price===0?"توافقی":toFA(r.price.toLocaleString("fa-IR"))}</td><td style={{padding:"5px 8px",color:"var(--text-muted)"}}>{r.note||""}</td></tr>)}</tbody>
          </table>{result.count>rowsShown.length&&<div style={{fontSize:11,color:"var(--text-dim)",padding:"4px 8px"}}>و {toFA(result.count-rowsShown.length)} خدمت دیگر…</div>}</div>}
          {result.errors.length>0&&<div data-testid="import-errors" style={{background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#fca5a5",marginBottom:10,lineHeight:1.9}}>
            <b>ردیف‌هایی که وارد نمی‌شوند:</b>{result.errors.slice(0,8).map((e,i)=><div key={i}>{e.sheet&&`${e.sheet} · `}{e.row?`ردیف ${toFA(e.row)}: `:""}{e.msg}</div>)}{result.errors.length>8&&<div>و {toFA(result.errors.length-8)} مورد دیگر…</div>}
          </div>}
          {result.warnings.length>0&&<details data-testid="import-warnings" style={{fontSize:12,color:"#fbbf24",marginBottom:10}}><summary style={{cursor:"pointer"}}>{toFA(result.warnings.length)} هشدار</summary>
            <div style={{lineHeight:1.9,marginTop:4}}>{result.warnings.slice(0,10).map((e,i)=><div key={i}>{e.row?`ردیف ${toFA(e.row)}: `:""}{e.msg}</div>)}</div></details>}
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <button data-testid="import-apply" onClick={apply} disabled={!result.count} style={{...BTN(result.count?"#dc2626":"#334155"),padding:"9px 20px",fontSize:13,opacity:result.count?1:.5}}>جایگزین کردن تعرفهٔ فعلی با این فایل</button>
            <span style={{fontSize:11,color:"var(--text-muted)"}}>قبل از جایگزینی، دلیل پرسیده می‌شود و تعرفهٔ قبلی برای بازگردانی نگه داشته می‌شود.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// گرد کردن قیمت‌های جدول تعرفه
function TariffRoundPanel({tariffData,setTariffData,cats,onClose}){
  const saved=lsRead(TARIFF_ROUND_CFG_KEY,null)||{};
  const [mode,setMode]=useState(ROUND_MODES[saved.mode]?saved.mode:"up");
  const [unit,setUnit]=useState(ROUND_UNITS.includes(saved.unit)?saved.unit:10000);
  const [cat,setCat]=useState("all");
  const [undo,setUndo]=useState(()=>lsRead(TARIFF_ROUND_UNDO_KEY,null));
  const [msg,setMsg]=useState("");
  const plan=planRounding(tariffData,{mode,unit,cat});
  const apply=async()=>{
    if(!plan.changed.length)return;
    const reason=await askReason({title:"گرد کردن قیمت‌های تعرفه",desc:`${toFA(plan.changed.length)} خدمت · ${ROUND_MODES[mode]} · مضرب ${ROUND_UNIT_LABEL(unit)}`,presets:["سهولت در حساب‌وکتاب","هماهنگی با نرخ اتحادیه","تغییر نرخ‌ها"]});
    if(reason===null)return;
    audit({action:"price_change",label:"گرد کردن قیمت‌های تعرفه",entityType:"تعرفه",entityLabel:cat==="all"?"همهٔ تعرفه‌ها":cat,reason,details:`${plan.changed.length} خدمت · ${ROUND_MODES[mode]} · ${unit} ریال`});
    const rec={at:Date.now(),mode,unit,changed:plan.changed.map(c=>({cat:c.cat,id:c.id,before:c.before,after:c.after}))};
    lsWrite(TARIFF_ROUND_CFG_KEY,{mode,unit});lsWrite(TARIFF_ROUND_UNDO_KEY,rec);setUndo(rec);
    setTariffData(plan.data);
    setMsg(`${toFA(plan.changed.length)} قیمت گرد شد.`);
  };
  const undoNow=async()=>{
    if(!undo)return;
    const reason=await askReason({title:"بازگردانی آخرین گرد کردن",desc:`${toFA(undo.changed.length)} قیمت به مقدار قبل از گرد کردن برمی‌گردد (فقط قیمت‌هایی که از آن زمان دست نخورده‌اند).`,presets:["گرد کردن اشتباه بود"]});
    if(reason===null)return;
    let n=0;
    const map=new Map(undo.changed.map(c=>[c.cat+"|"+c.id,c]));
    const next=tariffData.map(g=>({...g,items:g.items.map(it=>{const c=map.get(g.cat+"|"+it.id);if(c&&(Number(it.price)||0)===c.after){n++;return {...it,price:c.before};}return it;})}));
    audit({action:"price_change",label:"بازگردانی گرد کردن قیمت‌های تعرفه",entityType:"تعرفه",entityLabel:"همهٔ تعرفه‌ها",reason,details:`${n} خدمت`});
    setTariffData(next);lsWrite(TARIFF_ROUND_UNDO_KEY,null);setUndo(null);setMsg(`${toFA(n)} قیمت بازگردانده شد.`);
  };
  const chip=(on,label,fn,tid)=><button data-testid={tid} onClick={fn} style={{...BTN(on?"#2563eb":"var(--bg-app)",on?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12,border:"1px solid var(--border)"}}>{label}</button>;
  return(
    <div data-testid="tariff-round-panel" style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)"}}>🔢 گرد کردن قیمت‌ها</div>
        <button onClick={onClose} aria-label="بستن" style={{background:"transparent",border:"none",color:"var(--text-secondary)",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
      <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:6}}>جهت گرد کردن</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{Object.entries(ROUND_MODES).map(([k,l])=>chip(mode===k,l,()=>setMode(k),"round-mode-"+k))}</div>
      <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:6}}>گرد شود به مضرب</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{ROUND_UNITS.map(u=>chip(unit===u,ROUND_UNIT_LABEL(u),()=>setUnit(u),"round-unit-"+u))}</div>
      <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:6}}>محدوده</div>
      <select data-testid="round-scope" value={cat} onChange={e=>setCat(e.target.value)} style={{...INP,marginTop:0,marginBottom:12}}>
        <option value="all">همهٔ دسته‌ها</option>
        {cats.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <div data-testid="round-summary" style={{background:"var(--bg-app)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--text-secondary)",lineHeight:1.9,marginBottom:12}}>
        <div>🔄 {toFA(plan.changed.length)} قیمت تغییر می‌کند · {toFA(plan.unchanged)} قیمت از قبل گرد است{plan.skipped.length>0&&` · ${toFA(plan.skipped.length)} قیمت کوچک‌تر از واحد است و دست نمی‌خورد`}</div>
        {plan.changed.slice(0,4).map(c=><div key={c.cat+c.id} style={{color:"var(--text-muted)"}}>{c.name} : {toFA(c.before.toLocaleString("fa-IR"))} ← <b style={{color:"var(--text-primary)"}}>{toFA(c.after.toLocaleString("fa-IR"))}</b></div>)}
        {plan.changed.length>4&&<div style={{color:"var(--text-muted)"}}>… و {toFA(plan.changed.length-4)} مورد دیگر</div>}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <button data-testid="round-apply" onClick={apply} disabled={!plan.changed.length} style={{...BTN("#16a34a"),padding:"8px 18px",fontSize:13,opacity:plan.changed.length?1:.5}}>اعمال گرد کردن</button>
        {undo&&<button data-testid="round-undo" onClick={undoNow} style={{...BTN("var(--border)","var(--text-primary)"),padding:"8px 14px",fontSize:12}}>↩︎ بازگردانی آخرین گرد کردن</button>}
        {msg&&<span data-testid="round-msg" style={{fontSize:12,color:"#4ade80"}}>✓ {msg}</span>}
      </div>
    </div>
  );
}

export function TariffSection({onSelectTariff}){
  const [tariffData,setTariffData]=useTariffData();
  const TARIFF_CATS=tariffData.map(g=>g.cat);
  const TARIFF_PRICE_MAP=deriveTariffPriceMap(tariffData);  
  const TARIFF_INCOME_CATS=deriveTariffIncomeCats(tariffData);  
  const INCOME_CATEGORY_OPTIONS=deriveIncomeCategoryOptions(tariffData);
  const [shop]=useShopInfo();
  const [fileMeta,setFileMeta]=useState(()=>getTariffFileMeta());
  const [fileErr,setFileErr]=useState("");
  const [roundOpen,setRoundOpen]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
  const [previewOpen,setPreviewOpen]=useState(false);
  const fileInput=useRef();
  const fileActive=!!(fileMeta&&fileMeta.active);
  const onPickFile=async(e)=>{
    const f=e.target.files&&e.target.files[0];e.target.value="";
    if(!f)return;
    setFileErr("");
    try{const m=await saveTariffFile(f);setFileMeta(m);setEditMode(false);setRoundOpen(false);}
    catch(er){setFileErr(er.message||"آپلود ممکن نشد");}
  };
  const [editMode,setEditMode]=useState(false);
  const [resetConfirm,setResetConfirm]=useState(false);
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("all");
  const ref=useRef();

  const disc=(p)=>p===0?"توافقی":toFA(p.toLocaleString("fa-IR"))+" ریال";

  const [editingItem,setEditingItem]=useState(null); // {cat,id}
  const [editForm,setEditForm]=useState({name:"",price:"",note:""});
  const [newItemCat,setNewItemCat]=useState(null); // category currently adding a new service to
  const [newItemForm,setNewItemForm]=useState({name:"",price:"",note:""});
  const [newCatName,setNewCatName]=useState("");
  const [addingCat,setAddingCat]=useState(false);
  const [delCatConfirm,setDelCatConfirm]=useState(null);

  const startEditItem=(cat,it)=>{setEditingItem({cat,id:it.id});setEditForm({name:it.name,price:String(it.price),note:it.note||""});};
  const saveEditItem=async()=>{
    const grp=tariffData.find(g=>g.cat===editingItem.cat),old=grp&&grp.items.find(it=>it.id===editingItem.id);
    const newPrice=Number(editForm.price)||0;
    if(old&&(Number(old.price)||0)!==newPrice){
      const reason=await askReason({title:`تغییر قیمت «${old.name}»`,desc:`${disc(Number(old.price)||0)} ← ${disc(newPrice)}`,presets:["تورم / افزایش هزینه","رقابت بازار","اصلاح اشتباه","تخفیف دائمی"]});
      if(reason===null)return;
      audit({action:"price_change",entityType:"تعرفه",entityId:old.id,entityLabel:`${old.name} (${editingItem.cat})`,amount:newPrice,reason,before:{price:Number(old.price)||0},after:{price:newPrice}});
    }
    setTariffData(prev=>prev.map(g=>g.cat!==editingItem.cat?g:{...g,items:g.items.map(it=>it.id!==editingItem.id?it:{...it,name:editForm.name.trim()||it.name,price:newPrice,note:editForm.note.trim()})}));
    setEditingItem(null);
  };
  const deleteItem=(cat,id)=>{
    setTariffData(prev=>prev.map(g=>g.cat!==cat?g:{...g,items:g.items.filter(it=>it.id!==id)}));
  };
  const startAddItem=(cat)=>{setNewItemCat(cat);setNewItemForm({name:"",price:"",note:""});};
  const saveAddItem=()=>{
    const name=newItemForm.name.trim();
    if(!name)return;
    const newId=Math.max(0,...tariffData.flatMap(g=>g.items.map(it=>it.id)))+1;
    setTariffData(prev=>prev.map(g=>g.cat!==newItemCat?g:{...g,items:[...g.items,{id:newId,name,price:Number(newItemForm.price)||0,note:newItemForm.note.trim()}]}));
    setNewItemCat(null);
  };
  const addCategory=()=>{
    const name=newCatName.trim();
    if(!name||tariffData.some(g=>g.cat===name))return;
    setTariffData(prev=>[...prev,{cat:name,items:[]}]);
    setNewCatName("");setAddingCat(false);
  };
  const deleteCategory=(cat)=>{
    setTariffData(prev=>prev.filter(g=>g.cat!==cat));
    setDelCatConfirm(null);
  };
  const resetToDefaults=async()=>{
    setResetConfirm(false);
    const reason=await askReason({title:"بازگشت تعرفه به پیش‌فرض",desc:"همهٔ قیمت‌های تعرفه به مقدار اولیه برمی‌گردد.",presets:["شروع دوباره","اشتباه در ویرایش‌ها"],danger:true,confirmLabel:"بازگردانی"});
    if(reason===null)return;
    audit({action:"price_change",label:"بازگشت تعرفه به پیش‌فرض",entityType:"تعرفه",entityLabel:"همهٔ تعرفه‌ها",reason,details:`${tariffData.reduce((n,g)=>n+g.items.length,0)} خدمت`});
    setTariffData(DEFAULT_TARIFF_DATA);
  };

  const filtered=tariffData.map(g=>({
    ...g,
    items:g.items.filter(it=>{
      const matchCat=filterCat==="all"||g.cat===filterCat;
      const matchSearch=!search||it.name.includes(search)||g.cat.includes(search);
      return matchCat&&matchSearch;
    })
  })).filter(g=>g.items.length>0);

  return(
    <div>
      {/* Header info */}
      <div style={{background:"linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2))",borderRadius:12,padding:"16px 20px",marginBottom:18,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <Icon name="Tags" size={28} style={{color:"#fff"}}/>
        <div style={{flex:1,minWidth:180}}>
          <div data-testid="tariff-title" style={{fontSize:14,fontWeight:700,color:"#fff"}}>{(shop.unionName||"").trim()?`نرخنامه ${shop.unionName.trim()}`:"تعرفه خدمات"}</div>
          <div style={{fontSize:12,color:"#cbd5e1",marginTop:3}}>قیمت‌ها به ریال{!(shop.unionName||"").trim()&&" · نام اتحادیه را در «تنظیمات ← پروفایل فروشگاه» وارد کنید"}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",maxWidth:"100%"}}>
          <input ref={fileInput} data-testid="tariff-upload" type="file" accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf" onChange={onPickFile} style={{display:"none"}}/>
          <button data-testid="tariff-upload-btn" onClick={()=>fileInput.current&&fileInput.current.click()} style={{...BTN("#ffffff22","#fff"),padding:"8px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            <Icon name="Paperclip" size={14}/><span>{fileMeta?"تعویض تعرفهٔ من":"آپلود تعرفهٔ من (JPG / PDF)"}</span>
          </button>
          <button data-testid="tariff-import-btn" onClick={()=>setImportOpen(o=>!o)} style={{...BTN(importOpen?"#f59e0b":"#ffffff22","#fff"),padding:"8px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><span>📥 ورود از Excel / CSV</span></button>
          {!fileActive&&<button data-testid="tariff-round-btn" onClick={()=>setRoundOpen(o=>!o)} style={{...BTN(roundOpen?"#f59e0b":"#ffffff22","#fff"),padding:"8px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><span>🔢 گرد کردن قیمت‌ها</span></button>}
          {!fileActive&&<button onClick={()=>setEditMode(m=>!m)} style={{...BTN(editMode?"#f59e0b":"#ffffff22","#fff"),padding:"8px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            <Icon name="Pencil" size={14}/><span>{editMode?"پایان ویرایش":"ویرایش خدمات و قیمت‌ها"}</span>
          </button>}
        </div>
      </div>
      {fileErr&&<div data-testid="tariff-upload-error" style={{marginBottom:14,background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#f87171"}}>⚠️ {fileErr}</div>}
      {fileMeta&&!fileActive&&<div data-testid="tariff-file-inactive" style={{marginBottom:14,background:"var(--bg-card)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"var(--text-secondary)",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{flex:1}}>📎 فایل تعرفهٔ شما ({fileMeta.name}) ذخیره است ولی غیرفعال.</span>
        <button data-testid="tariff-file-preview-toggle" onClick={()=>setPreviewOpen(o=>!o)} style={{...BTN(previewOpen?"#f59e0b":"var(--border)",previewOpen?"#fff":"var(--text-primary)"),padding:"5px 12px",fontSize:12}}>{previewOpen?"بستن پیش‌نمایش":"👁️ پیش‌نمایش"}</button>
        <button data-testid="tariff-file-activate" onClick={()=>setFileMeta(setTariffFileActive(true))} style={{...BTN("#2563eb"),padding:"5px 12px",fontSize:12}}>نمایش تعرفهٔ من</button>
      </div>}
      {fileMeta&&!fileActive&&previewOpen&&<TariffFileView inactive meta={fileMeta} onActivate={()=>setFileMeta(setTariffFileActive(true))} onReplace={()=>fileInput.current&&fileInput.current.click()} onRemove={async()=>{await removeTariffFile();setFileMeta(null);setPreviewOpen(false);}}/>}
      {importOpen&&<TariffImportPanel tariffData={tariffData} setTariffData={setTariffData} onClose={()=>setImportOpen(false)} onImported={()=>{if(fileActive)setFileMeta(setTariffFileActive(false));setEditMode(false);setRoundOpen(false);}}/>}
      {fileActive&&<TariffFileView meta={fileMeta} onUseDefault={()=>setFileMeta(setTariffFileActive(false))} onReplace={()=>fileInput.current&&fileInput.current.click()} onRemove={async()=>{await removeTariffFile();setFileMeta(null);}}/>}
      {!fileActive&&roundOpen&&<TariffRoundPanel tariffData={tariffData} setTariffData={setTariffData} cats={TARIFF_CATS} onClose={()=>setRoundOpen(false)}/>}

      {!fileActive&&(<>
      {editMode&&(
        <div style={{background:"#2d1a0a",border:"1px solid #f59e0b44",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div style={{fontSize:12,color:"#fbbf24"}}>⚠️ در حالت ویرایش هستید — تغییرات بلافاصله ذخیره می‌شوند</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setAddingCat(true)} style={{...BTN("#2563eb"),padding:"6px 14px",fontSize:12,display:"flex",alignItems:"center",gap:5}}><Icon name="Plus" size={13}/>دسته‌بندی جدید</button>
            <button onClick={()=>setResetConfirm(true)} style={{...BTN("#450a0a","#f87171"),padding:"6px 14px",fontSize:12}}>↺ بازگشت به پیش‌فرض</button>
          </div>
        </div>
      )}

      {addingCat&&(
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:16,display:"flex",gap:8}}>
          <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCategory()} placeholder="نام دسته‌بندی جدید..." style={{...INP,marginTop:0,flex:1}} autoFocus/>
          <button onClick={addCategory} style={BTN("#16a34a")}>افزودن</button>
          <button onClick={()=>{setAddingCat(false);setNewCatName("");}} style={BTN("var(--border)","var(--text-secondary)")}>انصراف</button>
        </div>
      )}

      {/* Search + filter */}
      <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:18}}>
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <div style={{position:"relative",flex:1}}>
            <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"var(--text-muted)",fontSize:16}}>🔍</span>
            <input
              ref={ref}
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="جستجوی خدمت..."
              style={{...INP,marginTop:0,paddingRight:38}}
            />
          </div>
          {search&&<button onClick={()=>setSearch("")} style={{...BTN("var(--border)","#f87171"),padding:"8px 14px",fontSize:12}}>× پاک</button>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>setFilterCat("all")} style={{...BTN(filterCat==="all"?"#2563eb":"var(--bg-app)",filterCat==="all"?"#fff":"var(--text-muted)"),padding:"5px 12px",fontSize:12,border:"1px solid var(--border)"}}>همه</button>
          {TARIFF_CATS.map(c=>(
            <button key={c} onClick={()=>setFilterCat(c===filterCat?"all":c)} style={{...BTN(filterCat===c?"#2563eb":"var(--bg-app)",filterCat===c?"#fff":"var(--text-muted)"),padding:"5px 10px",fontSize:11,border:"1px solid var(--border)"}}>{c}</button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div style={{fontSize:13,color:"var(--text-muted)",marginBottom:14}}>
        {toFA(filtered.reduce((s,g)=>s+g.items.length,0))} خدمت یافت شد
      </div>

      {/* Groups */}
      {filtered.length===0
        ?<Empty text="خدمتی یافت نشد" sub="عبارت جستجو را تغییر دهید"/>
        :<div style={{display:"flex",flexDirection:"column",gap:14}}>
          {filtered.map(g=>(
            <div key={g.cat} style={{background:"var(--bg-card)",borderRadius:12,overflow:"hidden"}}>
              <div style={{background:"var(--header-grad-1)",padding:"10px 16px",fontSize:13,fontWeight:700,color:"var(--accent-light)",borderRight:"3px solid #2563eb",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                <span>{g.cat} ({toFA(g.items.length)} خدمت)</span>
                {editMode&&(
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>startAddItem(g.cat)} style={{...BTN("#2563eb"),padding:"3px 10px",fontSize:11,display:"flex",alignItems:"center",gap:4}}><Icon name="Plus" size={12}/>خدمت</button>
                    <button onClick={()=>setDelCatConfirm(g.cat)} style={{...BTN("#450a0a","#f87171"),padding:"3px 10px",fontSize:11}}><Icon name="Trash2" size={12}/></button>
                  </div>
                )}
              </div>
              {editMode&&newItemCat===g.cat&&(
                <div style={{padding:"12px 16px",background:"var(--bg-app)",display:"flex",gap:8,flexWrap:"wrap"}}>
                  <input value={newItemForm.name} onChange={e=>setNewItemForm(f=>({...f,name:e.target.value}))} placeholder="نام خدمت..." style={{...INP,marginTop:0,flex:2,minWidth:120}}/>
                  <input value={newItemForm.price} onChange={e=>setNewItemForm(f=>({...f,price:e.target.value}))} type="number" placeholder="قیمت (۰=توافقی)" style={{...INP,marginTop:0,flex:1,minWidth:100}}/>
                  <input value={newItemForm.note} onChange={e=>setNewItemForm(f=>({...f,note:e.target.value}))} placeholder="توضیح (اختیاری)" style={{...INP,marginTop:0,flex:1,minWidth:100}}/>
                  <button onClick={saveAddItem} style={BTN("#16a34a")}>ذخیره</button>
                  <button onClick={()=>setNewItemCat(null)} style={BTN("var(--border)","var(--text-secondary)")}>انصراف</button>
                </div>
              )}
              <div>
                {g.items.map((it,i)=>(
                  <div key={it.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:i<g.items.length-1?"1px solid var(--bg-app)":"none",gap:12,transition:"background .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--bg-app)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {editMode&&editingItem&&editingItem.cat===g.cat&&editingItem.id===it.id?(
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",width:"100%"}}>
                        <input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} style={{...INP,marginTop:0,flex:2,minWidth:120}}/>
                        <input value={editForm.price} onChange={e=>setEditForm(f=>({...f,price:e.target.value}))} type="number" style={{...INP,marginTop:0,flex:1,minWidth:100}}/>
                        <input value={editForm.note} onChange={e=>setEditForm(f=>({...f,note:e.target.value}))} placeholder="توضیح" style={{...INP,marginTop:0,flex:1,minWidth:100}}/>
                        <button onClick={saveEditItem} style={BTN("#16a34a")}>ذخیره</button>
                        <button onClick={()=>setEditingItem(null)} style={BTN("var(--border)","var(--text-secondary)")}>انصراف</button>
                      </div>
                    ):(
                      <>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"var(--text-primary)",fontWeight:500,lineHeight:1.5}}>{it.name}</div>
                          {it.note&&<div style={{fontSize:11,color:"var(--text-muted)",marginTop:3}}>{it.note}</div>}
                        </div>
                        <div style={{flexShrink:0,textAlign:"left"}}>
                          {it.price===0
                            ?<span style={{fontSize:12,color:"#f97316",fontWeight:600,background:"#1c0a00",padding:"3px 8px",borderRadius:5}}>توافقی</span>
                            :<div style={{fontSize:14,fontWeight:700,color:"#22d3ee",whiteSpace:"nowrap"}}>{disc(it.price)}</div>
                          }
                        </div>
                        {editMode?(
                          <div style={{display:"flex",gap:6,flexShrink:0}}>
                            <button onClick={()=>startEditItem(g.cat,it)} title="ویرایش" style={{...BTN("var(--border)","#f59e0b"),padding:"7px 10px",fontSize:12}}><Icon name="Pencil" size={14}/></button>
                            <button onClick={()=>deleteItem(g.cat,it.id)} title="حذف" style={{...BTN("#450a0a","#f87171"),padding:"7px 10px",fontSize:12}}><Icon name="Trash2" size={14}/></button>
                          </div>
                        ):(
                          <button onClick={()=>onSelectTariff&&onSelectTariff(`${g.cat} > ${it.name}`,it.price)} title="انتخاب و ثبت درآمد" style={{...BTN("#2563eb"),padding:"7px 12px",fontSize:12,display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                            <Icon name="PlusCircle" size={15}/><span>انتخاب</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      }

      </>)}

      {/* Delete-category confirm */}
      {delCatConfirm&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:28,width:320,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,marginBottom:8}}>حذف دسته‌بندی «{delCatConfirm}»</div>
            <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:20}}>تمام خدمات این دسته هم حذف می‌شوند. این عمل قابل برگشت نیست.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>deleteCategory(delCatConfirm)} style={{...BTN("#dc2626"),flex:1}}>حذف</button>
              <button onClick={()=>setDelCatConfirm(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>لغو</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset-to-default confirm */}
      {resetConfirm&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:"var(--bg-card)",borderRadius:16,padding:28,width:320,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
            <div style={{fontWeight:700,marginBottom:8}}>بازگشت به تعرفه پیش‌فرض</div>
            <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:20}}>تمام تغییرات دستی شما روی خدمات و قیمت‌ها پاک شده و به نرخنامه اصلی برمی‌گردد. ادامه می‌دهید؟</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={resetToDefaults} style={{...BTN("#dc2626"),flex:1}}>بله، بازگردان</button>
              <button onClick={()=>setResetConfirm(false)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1}}>انصراف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
