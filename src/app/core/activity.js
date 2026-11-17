// Generated from App.jsx by the module split (v1.50.0). Section: activity
import { audit, getInfoLog } from "../../audit/auditTrail.js";
import { clearAuthSession, discardLegacyLocalCredentials, getAuthenticatedUser, normalizeAuthUser, setAuthSession, setAuthenticatedUser } from "../../services/auth/session.js";
import { runTransaction, afterCommit, inTransaction, recordBeforeWrite } from "../../data/transaction.js";
import { dateReminderStatus, fmtM, toFA } from "./format.js";
import { daysSinceLastBackup, jalaliLabel } from "../domain/backup.js";
import { calNotifications } from "../pages/calendar.jsx";
import { CUSTOMERS_STORAGE_KEY, DEFAULT_INVENTORY, JM } from "./constants.js";
import { computeDebtors } from "../pages/dashboard.jsx";
import { gregorianToJalali, todayIso } from "./jalali.js";
import { daysUntil, getObligations, oblKind, oblStatus } from "../domain/obligations.jsx";
import { getClosings } from "../pages/pos.jsx";
import { fmtQty } from "../domain/recipes.jsx";
import { getSales, lsRead } from "../domain/sales.jsx";
import { APP_VERSION } from "./version.js";
import { reminderNotifications } from "../domain/notes.js";
import { inboxNotifications } from "../../inbox/inbox.js";


// ── Notifications aggregator — reads localStorage directly (no cached state) so it
// always reflects the latest data, no matter which tab last modified it. ──
// ══════════════════════════════════════════════════════════════════
// ACTIVITY LOG (لاگ فعالیت کاربران) — lightweight local audit trail.
// Captures who did what and when, for accountability and troubleshooting.
// Capped at a fixed length so it can never grow unbounded.
// ══════════════════════════════════════════════════════════════════
const ACTIVITY_LOG_KEY="cafenet_activity_log";

const ACTIVITY_LOG_MAX=500;

// v1.58: لاگ فعالیت اکنون روی «Audit Trail» (src/audit/auditTrail.js) سوار است. این تابع فقط رویدادهای عادی (info) را ثبت می‌کند؛
// عملیات حساس با audit({action:"<کد>",…}) ثبت می‌شوند (زنجیرهٔ هش‌شده + دلیل + دستگاه).
export function logActivity(action,details){
  try{audit({action:"activity",label:String(action||"").slice(0,120),details:details||""});}catch{}
}

export function getActivityLog(){return getInfoLog();}

export function formatLogTimestamp(iso){
  try{
    const d=new Date(iso);
    const [jy,jm,jd]=gregorianToJalali(d.getFullYear(),d.getMonth()+1,d.getDate());
    const hh=String(d.getHours()).padStart(2,"0"), mm=String(d.getMinutes()).padStart(2,"0");
    return `${toFA(jd)} ${JM[jm-1]} ${toFA(jy)} · ${toFA(hh)}:${toFA(mm)}`;
  }catch{return "—";}
}

function compareAppVersions(a,b){
  const parse=v=>String(v||"").split(".").map(x=>Number.parseInt(x,10)||0);
  const x=parse(a),y=parse(b);
  for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d;}
  return 0;
}

export function computeNotifications(updateInfo=null){
  const notifs=[];
  try{
    const n=Number(localStorage.getItem("cafino_miniapp_req_new"))||0;   // شمار درخواست‌های «جدید» مینی‌اپ (توسط src/uploads/miniReqState.js ذخیره می‌شود)
    if(n>0)notifs.push({icon:"📱",color:"#f59e0b",level:"attention",category:"سفارش‌ها",tab:"miniapp-orders",text:`${n.toLocaleString("fa-IR")} سفارش تازه از مینی‌اپ`,detail:"پذیرفتن یا رد کنید"});
    const np=Number(localStorage.getItem("cafino_miniapp_pay_pending"))||0, nc=Number(localStorage.getItem("cafino_miniapp_chat_unread"))||0;   // رسید در انتظار تأیید / پیام خوانده‌نشدهٔ مینی‌اپ
    if(np>0)notifs.push({icon:"🧾",color:"#f59e0b",level:"attention",category:"سفارش‌ها",tab:"miniapp-orders",text:`${np.toLocaleString("fa-IR")} رسید پرداخت مینی‌اپ در انتظار تأیید`,detail:"رسید را بررسی و تأیید یا رد کنید"});
    if(nc>0)notifs.push({icon:"💬",color:"#38bdf8",level:"attention",category:"سفارش‌ها",tab:"miniapp-orders",text:`${nc.toLocaleString("fa-IR")} پیام خوانده‌نشده از مشتریان مینی‌اپ`,detail:"در «سفارش‌های مینی‌اپ ← گفتگوها» پاسخ دهید"});
  }catch{}
  try{
    const accounts=JSON.parse(localStorage.getItem("cafenet_ledger2")||"[]");
    accounts.forEach(a=>{
      (a.entries||[]).forEach(e=>{
        if(e.reminderDate){
          const st=dateReminderStatus(e.reminderDate);
          if(st==="overdue"||st==="soon"){
            let nm=`${a.firstName||""} ${a.lastName||""}`.trim();
            if(!nm&&a.customerId!=null){try{const cu=JSON.parse(localStorage.getItem("cafenet_customers")||"[]").find(c=>String(c.id)===String(a.customerId));if(cu)nm=`${cu.firstName} ${cu.lastName}`.trim();}catch{}}
            nm=nm||"—";
            notifs.push({icon:"⏰",color:st==="overdue"?"#f87171":"#fbbf24",level:st==="overdue"?"critical":"warning",category:"مشتریان",tab:"customers",text:`یادآوری بدهی: ${nm} — ${e.category}`,detail:jalaliLabel(e.reminderDate)});
          }
        }
      });
    });
  }catch{}
  try{
    const customers=JSON.parse(localStorage.getItem("cafenet_customers")||"[]");
    customers.forEach(c=>{
      (c.followUps||[]).forEach(f=>{
        if(!f.done&&f.dueDate){
          const st=dateReminderStatus(f.dueDate);
          if(st==="overdue"||st==="soon"){
            const nm=`${c.firstName||""} ${c.lastName||""}`.trim()||"—";
            notifs.push({icon:"🔔",color:st==="overdue"?"#f87171":"#fbbf24",level:st==="overdue"?"critical":"warning",category:"مشتریان",tab:"customers",text:`پیگیری: ${nm} — ${f.service?f.service+(f.status?` (${f.status})`:"")+(f.text?" · "+f.text:""):f.text}`,detail:jalaliLabel(f.dueDate)});
          }
        }
      });
    });
  }catch{}
  try{
    getObligations().filter(o=>o.status!=="done").forEach(o=>{
      const st=oblStatus(o);
      if(st==="overdue"||st==="soon"){
        const k=oblKind(o.kind);const d=daysUntil(o.dueDate);
        notifs.push({icon:k.icon,color:st==="overdue"?"#f87171":"#fbbf24",level:st==="overdue"?"critical":"warning",category:"تعهدات",tab:"obligations",text:`${k.label} ${o.dir==="receive"?"دریافتی":"پرداختی"}: ${o.title}${o.seq?` (${toFA(o.seq)}/${toFA(o.total)})`:""} — ${fmtM(o.amount)}`,detail:`${jalaliLabel(o.dueDate)} · ${d<0?`${toFA(-d)} روز گذشته`:d===0?"امروز":`${toFA(d)} روز دیگر`}`});
      }
    });
  }catch{}
  try{
    const inv=JSON.parse(localStorage.getItem("cafenet_inventory")||"null")||DEFAULT_INVENTORY;
    inv.forEach(it=>{
      const qty=Number(it.qty)||0,min=Math.max(0,Number(it.minQty)||0);
      if(qty<=0){
        notifs.push({icon:"📦",color:"#f87171",level:"critical",category:"انبار",tab:"inventory",text:`موجودی ${it.name} تمام شده`,detail:`موجودی: ${fmtQty(qty)} ${it.unit||""}`});
      }else if(qty<=min){
        notifs.push({icon:"📦",color:"#fbbf24",level:"warning",category:"انبار",tab:"inventory",text:`موجودی ${it.name} رو به اتمام است`,detail:`موجودی: ${fmtQty(qty)} ${it.unit||""} · حد هشدار: ${fmtQty(min)}`});
      }
    });
  }catch{}
  try{
    const debtors=computeDebtors();
    debtors.slice(0,20).forEach(d=>notifs.push({icon:"👤",color:"#fb923c",level:"attention",category:"مشتریان",tab:"customers",text:`مشتری بدهکار: ${d.name}`,detail:`مانده بدهی: ${fmtM(d.amount)}`}));
  }catch{}
  try{
    const closing=getClosings().find(c=>c.date===todayIso()&&c.counted!=null&&Number(c.diff)!==0);
    if(closing)notifs.push({icon:"🧮",color:"#fb923c",level:"attention",category:"صندوق",tab:"pos",text:"صندوق با مبلغ شمارش‌شده مغایرت دارد",detail:`اختلاف: ${fmtM(Math.abs(Number(closing.diff)||0))}`});
  }catch{}
  try{
    const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
    const lastVisits={};
    getSales().filter(s=>!s.cancelled&&s.customerId!=null&&s.date).forEach(s=>{const id=String(s.customerId);if(!lastVisits[id]||s.date>lastVisits[id])lastVisits[id]=s.date;});
    customers.forEach(c=>(c.serviceHistory||[]).filter(h=>h.saleId==null&&h.date).forEach(h=>{const id=String(c.id);if(!lastVisits[id]||h.date>lastVisits[id])lastVisits[id]=h.date;}));
    customers.map(c=>{
      const lastVisit=lastVisits[String(c.id)]||"";
      const inactiveDays=lastVisit?daysUntil(lastVisit):null;
      return inactiveDays!=null&&inactiveDays<=-90?{days:-inactiveDays,notification:{icon:"🕰️",color:"#fbbf24",level:"warning",category:"مشتریان",tab:"customers",text:`مشتری غیرفعال: ${`${c.firstName||""} ${c.lastName||""}`.trim()||"بدون نام"}`,detail:`آخرین مراجعه: ${jalaliLabel(lastVisit)} · ${toFA(-inactiveDays)} روز پیش`}}:null;
    }).filter(Boolean).sort((a,b)=>b.days-a.days).slice(0,20).forEach(x=>notifs.push(x.notification));
  }catch{}
  if(updateInfo?.version&&compareAppVersions(updateInfo.version,APP_VERSION)>0){
    notifs.push({icon:"🔵",color:"#60a5fa",level:"info",category:"به‌روزرسانی",tab:"about",text:`نسخه جدید برنامه موجود است · ${updateInfo.version}`,detail:updateInfo.notes||"برای مشاهده جزئیات نسخه باز کنید"});
  }
  try{
    const days=daysSinceLastBackup();
    if(days>=7){
      const text=days===Infinity?"هنوز هیچ پشتیبانی تهیه نشده":`${toFA(Math.floor(days))} روز از آخرین پشتیبان‌گیری گذشته`;
      notifs.push({icon:"💾",color:"#fbbf24",level:"warning",category:"پشتیبان‌گیری",text:`یادآوری پشتیبان‌گیری: ${text}`,detail:"برای جلوگیری از دست رفتن اطلاعات، یک نسخه پشتیبان دانلود کنید"});
    }
  }catch{}
  try{notifs.push(...inboxNotifications());}catch{}
  try{notifs.push(...calNotifications().map(n=>({...n,level:"info",category:"تقویم",tab:"calendar"})));}catch{}
  try{notifs.push(...reminderNotifications());}catch{}
  const ranks={critical:0,attention:1,warning:2,info:3};
  return notifs.sort((a,b)=>(ranks[a.level]??4)-(ranks[b.level]??4));
}
