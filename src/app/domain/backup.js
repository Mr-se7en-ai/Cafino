// Generated from App.jsx by the module split (v1.50.0). Section: backup
import { vault, getPrivacyConfig, setPrivacyConfig, isPhotoRef, photoRefId, makePhotoRef, migrateInlineMedia, applyReplacements, inlineMediaForBackup, sweepVault, dropMissingRefs, referencedIds } from "../../data/customerFiles.js";
import { toFA } from "../core/format.js";
import { BACKUP_STATUS_KEY, CUSTOMERS_STORAGE_KEY, INV_STATE, INV_STORAGE, INV_STORAGE_KEY, JM, LEDGER_STORAGE, TX_KEY, VOID_KINDS } from "../core/constants.js";
import { sha256Hex } from "../core/identity.js";
import { invState } from "../pages/invoices.jsx";
import { dateToJalali, todayIso } from "../core/jalali.js";
import { getObligations, oblKind } from "./obligations.jsx";
import { invoicePayInfo } from "../pages/printScan.jsx";
import { emitDataChange, getSales, lsRead, lsWrite, payLabel } from "./sales.jsx";
import { APP_VERSION } from "../core/version.js";
import { getVoided } from "./voids.jsx";


const BACKUP_KEYS=["cafenet_sales","cafenet_crm_config","cafenet_alert_cfg","cafenet_sw_hidden_pickers","cafenet_theme","cafenet_customfont","cafenet_cats","cafenet_customers","cafenet_orders","cafenet_ledger2","cafenet_inventory","cafenet_inv_cats","cafenet_recipes","cafenet_obligations","cafenet_employees","cafenet_notes","cafenet_reminders","cafenet_dash_layout","cafenet_dash_tiles","cafenet_voice_cfg","cafenet_print_costs","cafenet_devices","cafenet_device_jobs","cafenet_device_meters","cafenet_shop","cafenet_tx3","cafenet_invoices","cafenet_tariff_data","cafenet_operator_logos","cafenet_direct_cats","cafenet_breakeven","cafenet_links","cafenet_cal_events","cafenet_ai_unit","cafenet_club_config","cafenet_topup_catalog","cafenet_pos_config","cafenet_register_closings","cafenet_payment_accounts","cafenet_currency","cafenet_topup_margin","cafenet_voided","cafenet_tenant_scope","cafenet_organizations","cafenet_branches","cafenet_data_schema_version"];

// Keys whose stored value is expected to be JSON (everything except the plain-string theme).
const BACKUP_JSON_KEYS=BACKUP_KEYS.filter(k=>k!=="cafenet_theme");

const LAST_BACKUP_KEY="cafenet_last_backup_at";

const PRERESTORE_SNAPSHOT_KEY="cafenet_prerestore_snapshot";

export function daysSinceLastBackup(){
  try{
    const last=localStorage.getItem(LAST_BACKUP_KEY);
    if(!last)return Infinity;
    const diffMs=Date.now()-new Date(last).getTime();
    return diffMs/(1000*60*60*24);
  }catch{return Infinity;}
}

// Validates a backup file's structure and authenticity before anything is written to
// localStorage. Throws a descriptive error on any problem — restoreBackup only ever
// applies changes after this fully passes, so a bad file can never partially corrupt data.
function validateBackupPayload(fileText){
  let payload;
  try{payload=JSON.parse(fileText);}
  catch{throw new Error("این فایل یک JSON معتبر نیست.");}
  if(!payload||typeof payload!=="object")throw new Error("ساختار فایل پشتیبان نامعتبر است.");
  if(payload.app!=="cafenet-accounting")throw new Error("این فایل، پشتیبان برنامه حسابداری کافی‌نت نیست.");
  if(!payload.data||typeof payload.data!=="object")throw new Error("فایل پشتیبان فاقد داده معتبر است.");
  // Every JSON-expected key that IS present in the file must itself parse as valid JSON,
  // otherwise a corrupted/edited file could silently break the app after restore.
  for(const k of BACKUP_JSON_KEYS){
    const v=payload.data[k];
    if(v==null)continue; // absent key is fine (older backups, or a section never used)
    try{JSON.parse(v);}
    catch{throw new Error(`بخش «${k}» در فایل پشتیبان خراب است.`);}
  }
  return payload;
}

// Snapshots the CURRENT localStorage data before a restore overwrites it, so the person
// can undo an accidental or mistaken restore. Only one snapshot is kept (the most recent).
function savePreRestoreSnapshot(){
  const data={};
  BACKUP_KEYS.forEach(k=>{try{data[k]=localStorage.getItem(k);}catch{}});
  try{localStorage.setItem(PRERESTORE_SNAPSHOT_KEY,JSON.stringify({savedAt:new Date().toISOString(),data}));}catch{}
}

export function hasPreRestoreSnapshot(){
  try{return !!localStorage.getItem(PRERESTORE_SNAPSHOT_KEY);}catch{return false;}
}

export function undoRestoreFromSnapshot(){
  const raw=localStorage.getItem(PRERESTORE_SNAPSHOT_KEY);
  if(!raw)throw new Error("نسخه‌ی قبل از بازیابی موجود نیست.");
  const snap=JSON.parse(raw);
  BACKUP_KEYS.forEach(k=>{
    if(snap.data[k]!=null)localStorage.setItem(k,snap.data[k]);
    else localStorage.removeItem(k);
  });
}

export function restoreBackup(fileText){
  const payload=validateBackupPayload(fileText); // throws first — nothing is written until this passes
  savePreRestoreSnapshot(); // safety copy of what's about to be overwritten
  BACKUP_KEYS.forEach(k=>{
    if(payload.data[k]!=null) localStorage.setItem(k,payload.data[k]);
  });
}

// ══════════════════════════════════════════════════════════════════
// امنیت و پشتیبان‌گیری — بکاپ کامل / مالی، رمزگذاری، کنترل صحت، بکاپ خودکار (IndexedDB)
// ══════════════════════════════════════════════════════════════════
const BACKUP_CFG_KEY="cafenet_backup_cfg";

const FINANCIAL_KEYS=["cafenet_sales","cafenet_devices","cafenet_device_jobs","cafenet_device_meters","cafenet_tx3","cafenet_invoices","cafenet_ledger2","cafenet_obligations","cafenet_employees","cafenet_customers","cafenet_register_closings","cafenet_payment_accounts","cafenet_currency","cafenet_voided","cafenet_topup_margin"];

export function getBackupCfg(){return{auto:true,everyHours:24,keep:7,autoDownload:false,...lsRead(BACKUP_CFG_KEY,{})};}

export function saveBackupCfg(c){lsWrite(BACKUP_CFG_KEY,c);}

export function getBackupStatus(){return lsRead(BACKUP_STATUS_KEY,{})||{};}

function jalaliDaily(){return isoToJKey(todayIso(),"daily");}

export function backupFileName(type,enc){return `backup-${type==="financial"?"financial-":""}${jalaliDaily()}${enc?"-enc":""}.json`;}

export function downloadText(name,text,mime="application/json"){
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}

export async function buildBackupPayload(type="full",{withFiles=true}={}){
  const keys=type==="financial"?FINANCIAL_KEYS:BACKUP_KEYS;
  const data={};
  keys.forEach(k=>{try{const v=localStorage.getItem(k);if(v!=null)data[k]=v;}catch{}});
  // customer files / photos are stored encrypted in IndexedDB; a manual backup file must be self-contained, so the bytes are put back inline
  if(withFiles&&data[CUSTOMERS_STORAGE_KEY])data[CUSTOMERS_STORAGE_KEY]=await inlineMediaForBackup(data[CUSTOMERS_STORAGE_KEY]);
  const checksum=await sha256Hex(JSON.stringify(data));
  return{app:"cafenet-accounting",version:2,appVersion:APP_VERSION,type,exportedAt:new Date().toISOString(),sections:Object.keys(data).length,checksum,data};
}

function toB64(buf){const u=new Uint8Array(buf);let s="";for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}

function fromB64(b){const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;}

async function deriveBackupKey(pw,salt){
  const km=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:200000,hash:"SHA-256"},km,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}

export async function encryptBackupPayload(payload,pw){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveBackupKey(pw,salt);
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(payload)));
  return{app:"cafenet-accounting",encrypted:true,version:2,type:payload.type,appVersion:payload.appVersion,exportedAt:payload.exportedAt,kdf:"PBKDF2-SHA256-200000",salt:toB64(salt),iv:toB64(iv),ct:toB64(ct)};
}

export async function decryptBackupEnvelope(env,pw){
  try{
    const key=await deriveBackupKey(pw,fromB64(env.salt));
    const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(env.iv)},key,fromB64(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }catch{throw new Error("رمز فایل اشتباه است یا فایل خراب شده.");}
}

// Reads a backup file (plain or encrypted), verifies structure + checksum, returns the payload. Writes nothing.
export async function parseBackupFile(text,password){
  let env;
  try{env=JSON.parse(text);}catch{throw new Error("این فایل یک JSON معتبر نیست.");}
  if(env&&env.app==="cafenet-accounting"&&env.encrypted){
    if(!password){const e=new Error("این فایل رمزدار است؛ رمز را وارد کنید.");e.needPassword=true;throw e;}
    env=await decryptBackupEnvelope(env,password);
  }
  const payload=validateBackupPayload(JSON.stringify(env));
  if(payload.checksum){
    const sum=await sha256Hex(JSON.stringify(payload.data));
    if(sum!==payload.checksum)throw new Error("کنترل صحت ناموفق بود: محتوای فایل تغییر کرده یا خراب است.");
  }
  return payload;
}

export async function exportBackup(type="full",password=""){
  const payload=await buildBackupPayload(type);
  const out=password?await encryptBackupPayload(payload,password):payload;
  downloadText(backupFileName(type,!!password),JSON.stringify(out,null,password?0:2));
  try{localStorage.setItem(LAST_BACKUP_KEY,new Date().toISOString());}catch{}
  return payload;
}

// — internal snapshots (IndexedDB) used by the automatic backup
const BK_DB="cafenet_backups_db",BK_STORE="snapshots";

function bkDb(){return new Promise((res,rej)=>{const r=indexedDB.open(BK_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(BK_STORE,{keyPath:"id"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}

export async function bkAll(){const db=await bkDb();return new Promise((res,rej)=>{const q=db.transaction(BK_STORE).objectStore(BK_STORE).getAll();q.onsuccess=()=>res((q.result||[]).sort((a,b)=>b.at-a.at));q.onerror=()=>rej(q.error);});}

async function bkPut(rec){const db=await bkDb();return new Promise((res,rej)=>{const t=db.transaction(BK_STORE,"readwrite");t.objectStore(BK_STORE).put(rec);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}

export async function bkDel(id){const db=await bkDb();return new Promise((res,rej)=>{const t=db.transaction(BK_STORE,"readwrite");t.objectStore(BK_STORE).delete(id);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}

export async function createSnapshot(kind="auto",type="full"){
  const cfg=getBackupCfg();
  try{
    const payload=await buildBackupPayload(type,{withFiles:kind!=="auto"});   // automatic snapshots keep references only (no plaintext copy of private files)
    if(!payload.sections)return{ok:false,skipped:true};
    const at=Date.now();
    await bkPut({id:at,at,kind,type,appVersion:APP_VERSION,size:JSON.stringify(payload.data).length,payload});
    if(kind==="auto"){
      const autos=(await bkAll()).filter(s=>s.kind==="auto");
      for(const s of autos.slice(Math.max(1,Number(cfg.keep)||7)))await bkDel(s.id);
      if(cfg.autoDownload)downloadText(backupFileName(type,false),JSON.stringify(payload,null,2));
    }
    lsWrite(BACKUP_STATUS_KEY,{...getBackupStatus(),at,ok:true,kind,error:""});
    return{ok:true,at};
  }catch(e){
    lsWrite(BACKUP_STATUS_KEY,{...getBackupStatus(),at:Date.now(),ok:false,kind,error:String((e&&e.message)||e)});
    return{ok:false,error:String((e&&e.message)||e)};
  }
}

let _autoBackupBusy=false;

export async function runAutoBackupIfDue({startup=false}={}){
  if(_autoBackupBusy)return;
  const cfg=getBackupCfg();if(!cfg.auto)return;
  const st=getBackupStatus();
  const due=cfg.everyHours===0?startup:(Date.now()-(Number(st.autoAt)||0)>=cfg.everyHours*3600*1000);
  if(!due)return;
  _autoBackupBusy=true;
  try{
    const r=await createSnapshot("auto","full");
    if(r.ok)lsWrite(BACKUP_STATUS_KEY,{...getBackupStatus(),autoAt:r.at});
    emitDataChange();
  }finally{_autoBackupBusy=false;}
}

export function fmtWhen(ts){
  if(!ts)return"—";
  const d=new Date(ts),n=new Date(),pad=x=>String(x).padStart(2,"0");
  const hm=toFA(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  const dayKey=x=>`${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if(dayKey(d)===dayKey(n))return`امروز ${hm}`;
  const y=new Date(n);y.setDate(n.getDate()-1);
  if(dayKey(d)===dayKey(y))return`دیروز ${hm}`;
  const iso=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return`${jalaliLabel(iso)} ${hm}`;
}

export function fmtBytes(n){return n>1048576?`${toFA((n/1048576).toFixed(1))} مگابایت`:`${toFA(Math.max(1,Math.round(n/1024)))} کیلوبایت`;}

// Spreadsheet / print sections for the "export" buttons of the backup page
export function dataExportSections(scope="all"){
  const jl=jalaliLabel;
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  const cname=(id)=>{const c=customers.find(x=>String(x.id)===String(id));return c?`${c.firstName} ${c.lastName}`.trim():"—";};
  const secs=[];
  const txs=lsRead(TX_KEY,[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  secs.push({name:"تراکنش‌ها",head:["تاریخ","نوع","دسته","مبلغ (ریال)","روش پرداخت","شرح"],money:[3],rows:txs.map(t=>[jl(t.date),t.type==="income"?"درآمد":"هزینه",t.category||"",Number(t.amount)||0,payLabel(t.method||"cash"),t.desc||""])});
  secs.push({name:"فاکتورها",head:["شماره","تاریخ","مشتری","مبلغ کل","پرداخت‌شده","مانده","وضعیت"],money:[3,4,5],rows:lsRead(INV_STORAGE,[]).map(iv=>{const i=invoicePayInfo(iv);return[String(iv.number),jl(iv.date),iv.customerName||"",i.total,i.paid,i.remaining,INV_STATE[invState(iv)].label];})});
  secs.push({name:"فروش‌ها",head:["شماره","تاریخ","مشتری","جمع فروش","پرداخت‌شده","هزینه مستقیم","سود ناخالص"],money:[3,4,5,6],rows:getSales().map(s=>[String(s.number),jl(s.date),s.customerName||"",Number(s.total)||0,Number(s.paid)||0,Number(s.costTotal)||0,(Number(s.total)||0)-(Number(s.costTotal)||0)])});
  const dbt=[];lsRead(LEDGER_STORAGE,[]).forEach(a=>{(a.entries||[]).forEach(e=>dbt.push([a.name||cname(a.customerId),jl(e.date),e.category||"",Number(e.amount)||0,e.desc||"",e.reminderDate?jl(e.reminderDate):""]));});
  secs.push({name:"حساب‌ها و بدهی‌ها",head:["حساب","تاریخ","نوع","مبلغ (ریال)","شرح","سررسید"],money:[3],rows:dbt});
  if(scope==="all"){
    secs.push({name:"مشتریان",head:["نام","تلفن","کیف پول (ریال)"],money:[2],rows:customers.map(c=>[`${c.firstName} ${c.lastName}`.trim(),c.phone||"",Number(c.wallet)||0])});
    secs.push({name:"انبار",head:["کالا","موجودی","واحد","قیمت خرید","قیمت فروش"],money:[3,4],rows:(lsRead(INV_STORAGE_KEY,null)||[]).map(i=>[i.name,Number(i.qty)||0,i.unit||"",Number(i.unitCost)||0,Number(i.salePrice)||0])});
    secs.push({name:"تعهدات",head:["نوع","عنوان","طرف حساب","مبلغ (ریال)","سررسید"],money:[3],rows:getObligations().map(o=>[oblKind(o.kind).label+(o.dir==="receive"?" (دریافتنی)":" (پرداختنی)"),o.title||"",o.party||"",Number(o.amount)||0,o.dueDate?jl(o.dueDate):""])});
    secs.push({name:"ابطال‌شده‌ها",head:["تاریخ","نوع","عنوان","مبلغ (ریال)","دلیل"],money:[3],rows:getVoided().map(v=>[jl(v.date),VOID_KINDS[v.kind]||v.kind,v.title||"",Number(v.amount)||0,v.reason||""])});
  }
  return secs;
}

export function p2(n){return String(n).padStart(2,"0");}

export function jalaliLabel(iso){if(!iso)return"—";const[jy,jm,jd]=dateToJalali(iso);return `${toFA(jd)} ${JM[jm-1]} ${toFA(jy)}`;}

export function isoToJKey(iso,mode){const[jy,jm,jd]=dateToJalali(iso);if(mode==="daily")return `${jy}-${p2(jm)}-${p2(jd)}`;if(mode==="monthly")return `${jy}-${p2(jm)}`;return `${jy}`;}

export function sumOf(txs,type){return txs.filter(t=>t.type===type).reduce((s,t)=>s+Number(t.amount),0);}

const LEDGER_CATS=["بدهکار","بستانکار","قرض","امانت","چک","سایر"];
