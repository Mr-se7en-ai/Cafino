// Generated from App.jsx by the module split (v1.50.0). Section: MainApp
import { warmPrintFont } from "../core/printFont.js";
import React, { useState, useEffect, useRef } from "react";
import BrandLogo from "../components/BrandLogo.jsx";
import { readJsonValue, readJsonResult, writeJsonValue } from "../../data/localRepository.js";
import Icon, { ICONS } from "../../components/Icon.jsx";
import VoiceAssistant from "../../voice/VoiceAssistant.jsx";
import { getApiConfig, saveApiConfig, isApiConnected, apiResources, apiRequest } from "../../services/api/client.js";
import { queueOp, syncQueue, startAutoSync, getSyncConfig, mappers as syncMappers } from "../../sync/index.js";
import { SyncChip, OfflineCapsule, SyncCenterPanel, ErrorLogPanel, ErrorToast } from "../../sync/SyncUI.jsx";
import ErrorBoundary from "../../components/ErrorBoundary.jsx";
import { vault, getPrivacyConfig, setPrivacyConfig, isPhotoRef, photoRefId, makePhotoRef, migrateInlineMedia, applyReplacements, inlineMediaForBackup, sweepVault, dropMissingRefs, referencedIds } from "../../data/customerFiles.js";
import { reportError } from "../../diagnostics/index.js";
import { computeNotifications, logActivity } from "../core/activity.js";
import { audit } from "../../audit/auditTrail.js";
import { ReasonHost } from "../../audit/ReasonDialog.jsx";
import { IntegrityBanner } from "../components/IntegrityBanner.jsx";
import { AuditPanel } from "../../audit/AuditPanel.jsx";
import { LogsPanel } from "../../audit/LogsPanel.jsx";
import { PrintScanHub } from "../../devices/PrintScanHub.jsx";
import { HealthPage } from "../../health/HealthPage.jsx";
import { InboxPage, UrgentAnnouncementBar, InboxBadge } from "../../inbox/InboxPage.jsx";
import FinanceCenter from "../../finance/FinanceCenter.jsx";
import UploadsPage from "../../uploads/UploadsPage.jsx";
import { startMobileUi } from "../../mobile/mobileUi.js";
import { startInboxPolling } from "../../inbox/inbox.js";
import { startUploadsPolling } from "../../uploads/uploadsBadge.js";
import { UploadsBadge, UploadsToast } from "../../uploads/UploadsBadge.jsx";
import { fmtM, getCurrencyUnit, toFA } from "../core/format.js";
import { AiAgentPanel, VOICE_FORMAT, VOICE_STORE, agentAsk, agentReady, getAgentCfg } from "../pages/aiAgent.jsx";
import { aiAnswer } from "../pages/assistant.jsx";
import { isoToJKey, jalaliLabel, p2, runAutoBackupIfDue, sumOf } from "../domain/backup.js";
import { BackupModal, BackupSettingsPanel, PrivacyPanel } from "../pages/backupUI.jsx";
import { EventCalendar } from "../pages/calendar.jsx";
import { BarChart, LineChart, MonthlyIncomeChart } from "../components/charts.jsx";
import { receiveCustomerPayment } from "../domain/club.js";
import { AI_UNIT_KEY, BOTTOM_NAV, BTN, COST_CATEGORY, CURRENCY_KEY, CUSTOMERS_STORAGE_KEY, DEFAULT_CATS, DEFAULT_INVENTORY, DEFAULT_TARIFF_DATA, INP, INV_STORAGE_KEY, JM, NAV_TREE, TABS, TARIFF_STORAGE_KEY, TX_KEY, isRealCashTx, txMethod } from "../core/constants.js";
import { DateConverterSection, JalaliPicker, SearchableSelect } from "../components/controls.jsx";
import { CustomersSection } from "../pages/customers.jsx";
import { ManagementDashboard } from "../pages/dashboard.jsx";
import { DashboardOrdersStatus } from "../components/dashboardWidgets.jsx";
import { InventorySection, getInvCats } from "../pages/inventory.jsx";
import { useShopInfo } from "../domain/invoiceData.js";
import { InvoiceSection } from "../pages/invoices.jsx";
import { dateToJalali, jalaliToIso, todayIso, todayJalali } from "../core/jalali.js";
import { LedgerSection } from "../pages/ledger.jsx";
import { LinksSection } from "../pages/links.jsx";
import { ObligationsSection } from "../domain/obligations.jsx";
import { OrdersSection } from "../pages/orders.jsx";
import { PosSection, ProductSaleModal } from "../pages/pos.jsx";
import { applyRecipeToIncome, fmtQty, getRecipes, recipeUsageList, recipesForLine, restoreStockUsed } from "../domain/recipes.jsx";
import { ReportSection } from "../pages/reports.jsx";
import { SaleWizard } from "../pages/saleWizard.jsx";
import { MethodSummary, PAY_METHODS, TX_METHODS, cancelSale, createId, createSale, directCats, emitDataChange, financeOf, fireDataChange, getSales, lsRead, lsWrite, payIcon, payLabel, receiveSalePayment, setDirectCats, syncTxOp, uid, useDataSync } from "../domain/sales.jsx";
import { PaymentAccountsSettings, PrintScanSettingsPanel, ServerConnectionPanel, UserManagementPanel } from "../pages/settingsPanels.jsx";
import { TariffSection, deriveIncomeCategoryOptions, deriveTariffPriceMap } from "../pages/tariff.jsx";
import { appFontFamily, saveStoredFont, themeVars } from "../core/theme.jsx";
import { TopupSection } from "../domain/topup.jsx";
import { Calculator, ComparisonCell, DonutSection, Empty, KPI, ProfilePanel } from "../components/ui.jsx";
import { APP_BRAND, APP_NAME, APP_VERSION } from "../core/version.js";
import { AboutPage } from "../pages/about.jsx";
import { startPushSync } from "../../push/webPush.js";
import { NotesPage, ReminderWatcher } from "../pages/notesUI.jsx";
import { FluentPanel } from "../../fluent/FluentPanel.jsx";
import { SkinPanel } from "../../skins/SkinPanel.jsx";
import { useSkin } from "../../skins/useSkin.js";
import { OrangeDashboard } from "../../skins/orange/OrangeDashboard.jsx";
import { OrangeCustomers } from "../../skins/orange/OrangeCustomers.jsx";
import { OrangeInvoices } from "../../skins/orange/OrangeInvoices.jsx";
import { OrangeReports } from "../../skins/orange/OrangeReports.jsx";
import { ORANGE_SUBTITLES, orangeTitle } from "../../skins/orange/meta.js";
import { CafindPalette, CafindLogo } from "../pages/searchUI.jsx";
import { setSearchFocus } from "../domain/search.js";
import { saveNote, saveReminder, deleteNote, deleteReminder, getReminders, reminderState, dueTs } from "../domain/notes.js";
const addDaysIsoLocal=(iso,n)=>{const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
import { SHOW_SERVER_SETTINGS } from "../core/features.js";
import { exitGuestMode, isGuestMode, resetGuestData } from "../../guest/guestMode.js";
import { VoidModal, VoidedPanel, voidTx } from "../domain/voids.jsx";


export function MainApp({onLogout,theme,setTheme,customFont,setCustomFont,userEmail,mustChangePassword,onPasswordChanged}){
  const skin=useSkin();
  const [transactions,setTransactions]=useState(()=>{try{return JSON.parse(localStorage.getItem("cafenet_tx3")||"[]");}catch{return[];}});
  useDataSync(()=>{setTransactions(lsRead(TX_KEY,[]));setCurrencyState(getCurrencyUnit());});
  const [categories,setCategories]=useState(()=>{try{return JSON.parse(localStorage.getItem("cafenet_cats")||"null")||DEFAULT_CATS;}catch{return DEFAULT_CATS;}});
  // Read fresh on every render (not cached state) — MainApp never unmounts across tab
  // switches, so a cached useTariffData() snapshot here would go stale the moment
  // the Tariff tab (which mounts/unmounts independently) edits the shared data.
  const tariffData=(()=>{
    try{
      const stored=JSON.parse(localStorage.getItem(TARIFF_STORAGE_KEY)||"null");
      return (stored&&Array.isArray(stored)&&stored.length>0)?stored:DEFAULT_TARIFF_DATA;
    }catch{return DEFAULT_TARIFF_DATA;}
  })();
  const TARIFF_PRICE_MAP=deriveTariffPriceMap(tariffData);
  const INCOME_CATEGORY_OPTIONS=deriveIncomeCategoryOptions(tariffData);
  const [activeTab,setActiveTab]=useState("dashboard");
  const [menuOpen,setMenuOpen]=useState(false);
  const [navOpen,setNavOpen]=useState(()=>{try{return JSON.parse(localStorage.getItem("cafenet_nav_open")||"{}")||{};}catch{return{};}});
  const toggleNav=(g)=>setNavOpen(o=>{const n={...o,[g]:o[g]===undefined?false:!o[g]};try{localStorage.setItem("cafenet_nav_open",JSON.stringify(n));}catch{}return n;});
  const [pendingAction,setPendingAction]=useState(null);
  const [notifOpen,setNotifOpen]=useState(false);
  useEffect(()=>startAutoSync(),[]);
  useEffect(()=>startPushSync(),[]);
  useEffect(()=>startInboxPolling(),[]);
  useEffect(()=>startUploadsPolling(),[]);
  // پنجره‌های شناور (Portal) بیرون از ریشهٔ برنامه رندر می‌شوند؛ متغیرهای تم و فونت باید روی body هم باشند تا شفاف نشوند
  useEffect(()=>{
    const b=document.body,vars={...themeVars(theme)};
    Object.entries(vars).forEach(([k,v])=>b.style.setProperty(k,v));
    b.style.color="var(--text-primary)";b.style.fontFamily=appFontFamily(customFont);
    return()=>{Object.keys(vars).forEach(k=>b.style.removeProperty(k));b.style.removeProperty("color");b.style.removeProperty("font-family");};
  },[theme,customFont,skin]);
  // باز شدن از روی اعلان: ?tab=notes یا پیام service worker
  useEffect(()=>{
    try{const t=new URLSearchParams(window.location.search).get("tab");if(t&&TABS.some(x=>x.key===t))selectTabRef.current?.(t);}catch{}
    const h=(e)=>{if(e.data&&e.data.type==="cafino-open"&&e.data.tab)selectTabRef.current?.(e.data.tab);};
    try{navigator.serviceWorker?.addEventListener("message",h);}catch{}
    return()=>{try{navigator.serviceWorker?.removeEventListener("message",h);}catch{}};
  },[]);  
  const openSyncCenter=()=>{setSettingsTab("sync");setActiveTab("settings");};
  const openErrorLog=(id)=>{try{if(id)sessionStorage.setItem("cafenet_errlog_q",String(id));}catch{}setSettingsTab("logs");setLogsSub("errors");setActiveTab("settings");};
  const [updateInfo,setUpdateInfo]=useState(null);
  const [profileOpen,setProfileOpen]=useState(false);
  const [backupOpen,setBackupOpen]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>{warmPrintFont();},2500);return()=>clearTimeout(t);},[]);   // فونت چاپ‌ها را به‌صورت data: کش می‌کند
  useEffect(()=>{runAutoBackupIfDue({startup:true});const t=setInterval(()=>runAutoBackupIfDue({}),10*60*1000);return()=>clearInterval(t);},[]);  
  useEffect(()=>{
    let alive=true;
    const check=async()=>{try{const res=await fetch(new URL("./version.json",window.location.href),{cache:"no-store"});if(!res.ok)return;const info=await res.json();if(alive&&info?.version)setUpdateInfo(info);}catch{}};
    check();const t=setInterval(check,6*60*60*1000);return()=>{alive=false;clearInterval(t);};
  },[]);
  const [calcOpen,setCalcOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [quickServiceOpen,setQuickServiceOpen]=useState(false);
  const [saleMode,setSaleMode]=useState("all");   // حالت پنجرهٔ فروش (منوی فروشگاه)
  const [navMicSlot,setNavMicSlot]=useState(null);
  const [voiceSalePrefill,setVoiceSalePrefill]=useState(null);
  const [voiceCustomerPrefill,setVoiceCustomerPrefill]=useState(null);
  const [productSaleOpen,setProductSaleOpen]=useState(false);
  const [reportMode,setReportMode]=useState("monthly");
  const [txModal,setTxModal]=useState(null);
  const [txErr,setTxErr]=useState("");
  const [txMethodFilter,setTxMethodFilter]=useState("all");
  const [form,setForm]=useState({amount:"",category:"",desc:"",date:todayIso()});
  const [delConfirm,setDelConfirm]=useState(null);
  const [catTab,setCatTab]=useState("income");
  const [settingsTab,setSettingsTab]=useState("appearance");
  const [logsSub,setLogsSub]=useState("errors");
  const [profileSub,setProfileSub]=useState("user");
  const [accountingSubTab,setAccountingSubTab]=useState("accounts");
  const [currency,setCurrencyState]=useState(()=>getCurrencyUnit());
  const setCurrency=unit=>{const next=unit==="toman"?"toman":"rial";try{localStorage.setItem(CURRENCY_KEY,next);}catch{}setCurrencyState(next);emitDataChange();audit({action:"currency_change",entityType:"تنظیمات",entityLabel:"واحد پول",before:{unit:currency},after:{unit:next},details:next==="toman"?"تومان":"ریال"});};
  const [newCatName,setNewCatName]=useState("");
  const [editCatIdx,setEditCatIdx]=useState(null);
  const [,setTick2]=useState(0);
  const [shop,setShop]=useShopInfo();
  const [shopForm,setShopForm]=useState(shop);
  const [shopSaved,setShopSaved]=useState(false);
  const [editCatName,setEditCatName]=useState("");
  const [srchDateFrom,setSrchDateFrom]=useState("");
  const [srchDateTo,setSrchDateTo]=useState("");
  const [srchCat,setSrchCat]=useState("all");
  const [srchType,setSrchType]=useState("all");
  const [vw,setVw]=useState(()=>typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{const h=()=>setVw(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  const isMobile=vw<700;          // phones: bottom navigation
  useEffect(()=>{if(!isMobile)return undefined;return startMobileUi();},[isMobile]);   // لایهٔ رابط موبایل (هم‌ترازی ردیف دکمه‌ها + آیکن)
  // منوی کناری: پیش‌فرض بر اساس عرض (تبلت = فقط آیکن)؛ کاربر با دکمهٔ فلش لبهٔ منو می‌تواند باز («full») یا کوچک («mini») کند و انتخابش ماندگار است
  const [sbPref,setSbPref]=useState(()=>{try{const v=localStorage.getItem("cafenet_sb_mode");return v==="mini"||v==="full"?v:"";}catch{return"";}});
  const isCompact=!isMobile&&(sbPref?sbPref==="mini":vw<1000);
  const sbW=isMobile?0:isCompact?68:230;
  const toggleSidebar=()=>{const next=isCompact?"full":"mini";setSbPref(next);try{localStorage.setItem("cafenet_sb_mode",next);}catch{/* ذخیره‌سازی در دسترس نیست */}};
  useEffect(()=>{if(mustChangePassword){setActiveTab("settings");setSettingsTab("profile");}},[mustChangePassword]);
  const menuRef=useRef();
  const notifRef=useRef();
  const profileRef=useRef();

  useEffect(()=>{lsWrite("cafenet_tx3",transactions);},[transactions]);
  // one-time (every start): move legacy Base64 files/photos into the encrypted vault, then apply retention / clean up orphaned files
  useEffect(()=>{
    let alive=true;
    (async()=>{
      const st=vault();if(!st)return;
      const first=readJsonResult(CUSTOMERS_STORAGE_KEY,[]);
      if(!first.ok||!Array.isArray(first.value))return;                 // never act on unreadable data
      const m=await migrateInlineMedia(first.value,st);
      if(!alive)return;
      if(m.replacements.size){const latest=readJsonResult(CUSTOMERS_STORAGE_KEY,[]);if(latest.ok&&Array.isArray(latest.value)){lsWrite(CUSTOMERS_STORAGE_KEY,applyReplacements(latest.value,m.replacements));fireDataChange();}}
      const cur=readJsonResult(CUSTOMERS_STORAGE_KEY,[]);if(!cur.ok||!Array.isArray(cur.value))return;
      const cfg=getPrivacyConfig();
      if(cfg.retentionDays>0){
        const gone=await st.purgeOlderThan(cfg.retentionDays);
        if(gone.length){const after=readJsonResult(CUSTOMERS_STORAGE_KEY,[]);if(after.ok&&Array.isArray(after.value)){lsWrite(CUSTOMERS_STORAGE_KEY,dropMissingRefs(after.value,gone));fireDataChange();}logActivity("حذف خودکار فایل‌های قدیمی مشتریان",`${gone.length} فایل`);}
      }
      if(!isApiConnected()){await st.removeUnreferenced(referencedIds(cur.value));}   // with a server the customer list is replaced by the server copy, so orphan cleanup stays manual there
    })().catch(e=>reportError(e,"privacy",{stage:"vault-startup"}));
    return()=>{alive=false;};
  },[]);
  // hand-entered income / expense (not the by-products of sales, which the server derives from invoices + payments) go through the offline queue
  const txSyncRef=useRef(null);
  useEffect(()=>{
    const prev=txSyncRef.current;const cur=new Map(transactions.map(t=>[String(t.id),t]));txSyncRef.current=cur;
    if(!prev)return;
    for(const [id,t] of cur){const o=prev.get(id);if(!o)syncTxOp("create",t);else if(o!==t&&JSON.stringify(o)!==JSON.stringify(t))syncTxOp("update",t);}
    for(const [id,t] of prev)if(!cur.has(id))syncTxOp("remove",t);
  },[transactions]);
  useEffect(()=>{lsWrite("cafenet_cats",categories);},[categories]);
  useEffect(()=>{const h=(e)=>{if(menuRef.current&&!menuRef.current.contains(e.target))setMenuOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  useEffect(()=>{const h=(e)=>{if(notifRef.current&&!notifRef.current.contains(e.target))setNotifOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  useEffect(()=>{const h=(e)=>{if(profileRef.current&&!profileRef.current.contains(e.target))setProfileOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);

  const openAdd=(type)=>{setTxErr("");setForm({amount:"",category:type==="income"?"مبلغ دلخواه":(categories[type][0]||""),desc:"",date:todayIso(),method:"cash",split:false,parts:{}});setTxModal({type,editId:null});};
  // ── Voice assistant bridge ─────────────────────────────────────────────────────────────
  // The assistant (src/voice/*) only produces an Intent {intent, slots}; everything below is the business
  // logic that carries it out with the app's own engines, so voice and forms share one set of rules.
  const voiceContext=()=>({
    today:todayIso(),now:Date.now(),defaultUnit:getCurrencyUnit(),jalali:{toIso:jalaliToIso,fromIso:dateToJalali},
    categories:{expense:categories.expense||[],income:[...new Set([...(deriveIncomeCategoryOptions(tariffData).map(o=>o.plainLabel)),...(categories.income||[])])]},
    customers:lsRead(CUSTOMERS_STORAGE_KEY,[]),inventory:lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY,sales:getSales(),
  });
  const voiceDeps={
    format:VOICE_FORMAT,
    addTransaction:({type,amount,category,desc,date,method})=>{
      const id=createId("tx");const tx={id,type,category,amount:Number(amount),desc:desc||"",date,method:method||"cash"};const extra=[],notes=[];
      if(type==="income"){
        const r=applyRecipeToIncome(category,1);
        if(r){tx.stockUsed=r.used;tx.qty=1;if(r.cost>0)extra.push({id:id+1,type:"expense",category:COST_CATEGORY,amount:r.cost,desc:`هزینه مصرف ${category} (×${fmtQty(1)})`,date,linkTxId:id});notes.push(`🧪 از انبار کسر شد: ${r.text||"—"}`,...r.warnings.map(w=>"⚠️ "+w));}
      }
      setTransactions(prev=>[...prev,tx,...extra]);
      logActivity(type==="income"?"ثبت درآمد (صوتی)":"ثبت هزینه (صوتی)",`${category} — ${fmtM(tx.amount)}`);
      return{id,notes};
    },
    removeTransaction:(id)=>{delTx(id,"واگرد دستور صوتی");return{ok:true};},
    addCustomer:(c)=>{
      const nc={id:createId("rec"),firstName:c.firstName,lastName:c.lastName,phone:c.phone||"",note:c.note||"",nationalId:"",birthDate:"",postalCode:"",address:"",files:[]};
      lsWrite(CUSTOMERS_STORAGE_KEY,[...lsRead(CUSTOMERS_STORAGE_KEY,[]),nc]);emitDataChange();
      logActivity("افزودن مشتری (صوتی)",`${c.firstName} ${c.lastName}`.trim());
      return{id:nc.id};
    },
    removeCustomer:(id)=>{
      if(getSales().some(s=>String(s.customerId)===String(id)&&!s.cancelled))return{ok:false,error:"برای این مشتری فاکتور ثبت شده است؛ از بخش مشتریان حذفش کنید."};
      lsWrite(CUSTOMERS_STORAGE_KEY,lsRead(CUSTOMERS_STORAGE_KEY,[]).filter(c=>String(c.id)!==String(id)));emitDataChange();return{ok:true};
    },
    addNote:({body})=>{const r=saveNote({title:"",body,color:"yellow",pinned:false});if(r.ok)logActivity("یادداشت (صوتی)",body.slice(0,60));return r.ok?{ok:true,id:r.note.id}:r;},
    removeNote:(id)=>{deleteNote(id);return{ok:true};},
    addReminder:(o)=>{const r=saveReminder(o);if(r.ok)logActivity("یادآور (صوتی)",o.title);return r.ok?{ok:true,id:r.reminder.id}:r;},
    removeReminder:(id)=>{deleteReminder(id);return{ok:true};},
    listReminders:(scope)=>{const now=Date.now(),t=todayIso();return getReminders().filter(r=>r.status!=="done").filter(r=>scope==="today"?r.date===t:scope==="tomorrow"?r.date===addDaysIsoLocal(t,1):scope==="overdue"?reminderState(r,now)==="due":true).sort((a,b)=>dueTs(a)-dueTs(b)).map(r=>({title:r.title,date:r.date,time:r.time,overdue:reminderState(r,now)==="due"}));},
    createSale:(o)=>createSale(o),
    cancelSale:(id,reason)=>cancelSale(id,reason),
    receiveSalePayment:(id,amount,method,date)=>receiveSalePayment(id,amount,method,date),
    receiveCustomerPayment:(id,amount,method,date)=>receiveCustomerPayment(id,amount,method,date),
    adjustInventory:({itemId,itemName,delta,unit,create})=>{
      const stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
      let it=itemId!=null?stock.find(x=>String(x.id)===String(itemId)):null,created=false;
      if(!it){
        if(!create||!itemName)return{ok:false,error:`کالای «${itemName}» در انبار پیدا نشد.`};
        const cat=getInvCats()[0];it={id:uid(),cat:cat.key,name:itemName,qty:0,minQty:0,unit:unit||cat.unit,unitCost:0,salePrice:0};stock.push(it);created=true;
      }
      const before=Number(it.qty)||0,after=Math.round((before+delta)*10000)/10000;
      if(after<0)return{ok:false,error:`موجودی کافی نیست (موجودی فعلی ${before}).`};
      it.qty=after;lsWrite(INV_STORAGE_KEY,stock);emitDataChange();
      logActivity("ثبت صوتی انبار",`${it.name} — ${delta>0?"+":""}${delta}`);
      return{ok:true,itemId:it.id,before,after,delta,created};
    },
    restoreInventory:(r)=>{
      let stock=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
      if(r.created)stock=stock.filter(x=>String(x.id)!==String(r.itemId));
      else stock=stock.map(x=>String(x.id)===String(r.itemId)?{...x,qty:Math.max(0,Math.round(((Number(x.qty)||0)-r.delta)*10000)/10000)}:x);
      lsWrite(INV_STORAGE_KEY,stock);emitDataChange();return{ok:true};
    },
    navigate:(tab,action)=>{setActiveTab(tab);setMenuOpen(false);setPendingAction(action||null);},
    answer:async(t)=>{
      const local=()=>{try{return aiAnswer(t,transactions,lsRead(AI_UNIT_KEY,"rial")==="toman"?"toman":"rial").join("\n");}catch{return"خطایی در محاسبه رخ داد.";}};
      const cfg=getAgentCfg();
      if(cfg.mode==="agent"&&agentReady(cfg)){
        try{return await agentAsk(cfg,[],t);}
        catch(e){const l=local();return /متوجه سؤال نشدم/.test(l)?"⚠️ ایجنت پاسخ نداد: "+e.message:"(ایجنت در دسترس نبود؛ پاسخ موتور داخلی)\n"+l;}
      }
      return local();
    },
    canOpenForm:(intent,s)=>["create_expense","create_income","create_customer","create_sale","create_order","create_invoice"].includes(intent)||(intent==="receive_payment"&&!!(s&&s.saleId)),
    openForm:(intent,s)=>{
      if(intent==="create_expense"||intent==="create_income"){setTxErr("");setForm({amount:String(s.amount||""),category:s.category,desc:s.description||"",date:s.date,method:s.method||"cash",split:false,parts:{}});setTxModal({type:intent==="create_expense"?"expense":"income",editId:null});return true;}
      if(intent==="create_customer"){setVoiceCustomerPrefill({firstName:s.firstName,lastName:s.lastName,phone:s.phone,note:s.note});setActiveTab("customers");setMenuOpen(false);return true;}
      if(intent==="create_sale"||intent==="create_order"||intent==="create_invoice"){const q=Number(s.quantity)>0?Number(s.quantity):1;setVoiceSalePrefill({lines:[{key:uid(),desc:s.description,qty:String(q),price:String(Math.round((s.amount||0)/q)||""),category:s.description,cost:"",stockId:s.stockId?String(s.stockId):"",stockQty:s.stockId?String(s.stockQty||""):"",adv:false}],notes:"ثبت از دستیار صوتی"});setQuickServiceOpen(true);return true;}
      if(intent==="receive_payment"&&s.saleId){setActiveTab("orders");setMenuOpen(false);setPendingAction(`receive_payment:${s.saleId}`);return true;}
      return false;
    },
  };
  useEffect(()=>{if(!txModal)return;const h=(e)=>{if(e.key==="Escape")setTxModal(null);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[txModal]);
  const openEdit=(tx)=>{setTxErr("");setForm({amount:tx.amount,category:tx.category,desc:tx.desc||"",date:tx.date,method:tx.method||"cash",split:false,parts:{}});setTxModal({type:tx.type,editId:tx.id});};
  const [txNotice,setTxNotice]=useState(null);
  useEffect(()=>{if(!txNotice)return;const t=setTimeout(()=>setTxNotice(null),8000);return()=>clearTimeout(t);},[txNotice]);
  const saveTx=()=>{
    if(!form.amount||isNaN(form.amount)||Number(form.amount)<=0||!form.category||!form.date)return;
    // For tariff keys like "Group > ServiceName", store only the service name as display category
    const displayCat=form.category.includes(" > ")?form.category.split(" > ")[1]:form.category;
    const {qty:formQty,split:formSplit,parts:formParts,...formRest}=form;
    const saved={...formRest,method:form.method||"cash",category:displayCat,amount:Number(form.amount)};
    let splitParts=null;
    if(formSplit&&!txModal.editId){
      splitParts=TX_METHODS.map(k=>({k,v:Number((formParts||{})[k])||0})).filter(x=>x.v>0);
      const sum=splitParts.reduce((a,x)=>a+x.v,0);
      if(splitParts.length<1||sum!==saved.amount){setTxErr(`جمع مبلغ روش‌ها (${fmtM(sum)}) باید برابر مبلغ کل (${fmtM(saved.amount)}) باشد.`);return;}
      saved.method=splitParts[0].k;saved.amount=splitParts[0].v;
    }
    setTxErr("");
    const typeLabel=txModal.type==="income"?"درآمد":"هزینه";
    if(txModal.editId){
      setTransactions(prev=>prev.map(t=>t.id===txModal.editId?{...t,...saved}:t));
      logActivity(`ویرایش ${typeLabel}`,`${displayCat} — ${fmtM(saved.amount)}`);
    }
    else{
      const id=createId("tx");const tx={id,type:txModal.type,...saved};const extra=[];
      if(txModal.type==="income"){
        const q=Number(formQty)>0?Number(formQty):1;
        const r=applyRecipeToIncome(displayCat,q);
        if(r){
          tx.stockUsed=r.used;tx.qty=q;
          if(r.cost>0)extra.push({id:id+1,type:"expense",category:COST_CATEGORY,amount:r.cost,desc:`هزینه مصرف ${displayCat} (×${fmtQty(q)})`,date:saved.date,linkTxId:id});
          setTxNotice([`🧪 از انبار کسر شد: ${r.text||"—"}`,...r.warnings.map(w=>"⚠️ "+w)]);
        }
      }
      if(splitParts){
        const total=splitParts.reduce((a,x)=>a+x.v,0);
        splitParts.slice(1).forEach((x,i)=>extra.push({id:id+100+i,type:txModal.type,category:displayCat,amount:x.v,desc:(saved.desc?saved.desc+" ":"")+"(بخشی از پرداخت)",date:saved.date,method:x.k,linkTxId:id}));
        logActivity(`ثبت ${typeLabel} (تقسیم‌شده)`,`${displayCat} — ${fmtM(total)}`);
      }else logActivity(`ثبت ${typeLabel}`,`${displayCat} — ${fmtM(saved.amount)}`);
      setTransactions(prev=>[...prev,tx,...extra]);
    }
    setTxModal(null);
  };
  const delTx=(id,reason)=>{
    const t=transactions.find(t=>t.id===id);
    if(t&&t.stockUsed)restoreStockUsed(t.stockUsed);
    if(t)voidTx(t,transactions.filter(x=>x.linkTxId===id),reason);
    setTransactions(prev=>prev.filter(x=>x.id!==id&&x.linkTxId!==id));
    setDelConfirm(null);
  };
  const addCat=()=>{const n=newCatName.trim();if(!n||categories[catTab].includes(n))return;setCategories(prev=>({...prev,[catTab]:[...prev[catTab],n]}));setNewCatName("");};
  const delCat=(type,name)=>{if(type==="expense")setDirectCats(directCats().filter(c=>c!==name||c===COST_CATEGORY));setCategories(prev=>({...prev,[type]:prev[type].filter(c=>c!==name)}));};
  const saveCatEdit=(type,idx)=>{const n=editCatName.trim();if(!n)return;setCategories(prev=>{const arr=[...prev[type]];const old=arr[idx];arr[idx]=n;setTransactions(txs=>txs.map(t=>t.type===type&&t.category===old?{...t,category:n}:t));if(type==="expense"&&old!==COST_CATEGORY&&directCats().includes(old))setDirectCats(directCats().map(c=>c===old?n:c));return{...prev,[type]:arr};});setEditCatIdx(null);setEditCatName("");};
  const SHOP_FORM_FIELDS=["name","unionName","address","phone","mobile","cardNumber","cardHolder","bankName","iban","taxId","logo"];
  useEffect(()=>{setShopForm(shop);},[shop]);  
  const saveShop=()=>{const patch={};SHOP_FORM_FIELDS.forEach(k=>{patch[k]=shopForm[k];});setShop(cur=>({...cur,...patch}));setShopSaved(true);setTimeout(()=>setShopSaved(false),2200);};
  const [logoErr,setLogoErr]=useState("");
  const handleLogoUpload=(e)=>{
    const file=e.target.files&&e.target.files[0];
    e.target.value="";
    if(!file)return;
    setLogoErr("");
    if(!file.type.startsWith("image/")){setLogoErr("فقط فایل تصویری (PNG, JPG, SVG) مجاز است");return;}
    if(file.size>1.5*1024*1024){setLogoErr("حجم لوگو باید کمتر از ۱.۵ مگابایت باشد");return;}
    const reader=new FileReader();
    reader.onload=()=>setShopForm(f=>({...f,logo:reader.result}));
    reader.onerror=()=>setLogoErr("خطا در خواندن فایل لوگو");
    reader.readAsDataURL(file);
  };
  const removeLogo=()=>setShopForm(f=>({...f,logo:null}));
  const [fontErr,setFontErr]=useState("");
  const handleFontUpload=(e)=>{
    const file=e.target.files&&e.target.files[0];
    e.target.value="";
    if(!file)return;
    setFontErr("");
    const okExt=/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/.test(file.name);
    if(!okExt){setFontErr("فقط فایل‌های TTF, OTF, WOFF, WOFF2 پشتیبانی می‌شوند");return;}
    if(file.size>4*1024*1024){setFontErr("حجم فونت باید کمتر از ۴ مگابایت باشد");return;}
    const reader=new FileReader();
    reader.onload=()=>{
      const fontData={name:file.name,dataUrl:reader.result};
      const ok=saveStoredFont(fontData);
      if(!ok){setFontErr("ذخیره فونت ناموفق بود (احتمالاً حجم زیاد است)");return;}
      setCustomFont(fontData);
    };
    reader.onerror=()=>setFontErr("خطا در خواندن فایل فونت");
    reader.readAsDataURL(file);
  };
  const resetFont=()=>{saveStoredFont(null);setCustomFont(null);setFontErr("");};

  const allSalesMain=getSales();
  const finAll=financeOf(()=>true,transactions,allSalesMain);
  const totalIncome=finAll.revenue;
  const totalExpense=finAll.direct+finAll.operating;
  const totalProfit=finAll.net;

  const dashChartData=()=>{const [tjy,tjm]=todayJalali();const months=[];for(let i=5;i>=0;i--){let m=tjm-i,y=tjy;while(m<=0){m+=12;y--;}months.push({y,m});}return months.map(({y,m})=>{const key=`${y}-${p2(m)}`;const txs=transactions.filter(t=>isoToJKey(t.date,"monthly")===key);const ff=financeOf(d=>isoToJKey(d,"monthly")===key,transactions,allSalesMain);return{label:JM[m-1].slice(0,3),income:ff.revenue,expense:ff.direct+ff.operating};});};

  // ── Period comparison: this Jalali month vs previous month ──
  const monthComparison=()=>{
    const [tjy,tjm]=todayJalali();
    let py=tjy,pm=tjm-1; if(pm<=0){pm+=12;py--;}
    const curKey=`${tjy}-${p2(tjm)}`, prevKey=`${py}-${p2(pm)}`;
    const fc=financeOf(d=>isoToJKey(d,"monthly")===curKey,transactions,allSalesMain);
    const fp=financeOf(d=>isoToJKey(d,"monthly")===prevKey,transactions,allSalesMain);
    const curInc=fc.revenue, prevInc=fp.revenue;
    const curExp=fc.direct+fc.operating, prevExp=fp.direct+fp.operating;
    const curPrf=fc.net, prevPrf=fp.net;
    const pct=(cur,prev)=>{if(prev===0)return cur===0?0:100;return Math.round(((cur-prev)/Math.abs(prev))*100);};
    return{
      curLabel:JM[tjm-1], prevLabel:JM[pm-1],
      income:{cur:curInc,prev:prevInc,pct:pct(curInc,prevInc)},
      expense:{cur:curExp,prev:prevExp,pct:pct(curExp,prevExp)},
      profit:{cur:curPrf,prev:prevPrf,pct:pct(curPrf,prevPrf)},
      gross:{cur:fc.gross,prev:fp.gross,pct:pct(fc.gross,fp.gross)},
    };
  };
  const donutSlices=(type)=>{const COLORS=["#2563eb","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#059669","#ea580c","#6366f1"];const map={};transactions.filter(t=>t.type===type).forEach(t=>{map[t.category]=(map[t.category]||0)+Number(t.amount);});return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value],i)=>({name,value,color:COLORS[i%COLORS.length]}));};

  const filteredTx=transactions.filter(t=>{if(srchType!=="all"&&t.type!==srchType)return false;if(srchCat!=="all"&&t.category!==srchCat)return false;if(srchDateFrom&&t.date<srchDateFrom)return false;if(srchDateTo&&t.date>srchDateTo)return false;return true;});
  const filteredIncome=sumOf(filteredTx,"income"),filteredExpense=sumOf(filteredTx,"expense"),filteredProfit=filteredIncome-filteredExpense;
  const groups={};filteredTx.forEach(t=>{const k=isoToJKey(t.date,reportMode);if(!groups[k])groups[k]=[];groups[k].push(t);});
  const groupKeys=Object.keys(groups).sort().reverse();
  const groupLabel=(key)=>{if(reportMode==="daily"){const[jy,jm,jd]=key.split("-").map(Number);return `${toFA(jd)} ${JM[jm-1]} ${toFA(jy)}`;}if(reportMode==="monthly"){const[jy,jm]=key.split("-").map(Number);return `${JM[jm-1]} ${toFA(jy)}`;}return `سال ${toFA(key)}`;};
  const reportChartData=groupKeys.slice().reverse().map(key=>{const grp=groups[key];return{label:groupLabel(key).split(" ")[0],income:sumOf(grp,"income"),expense:sumOf(grp,"expense")};});
  const filtCatIncome={},filtCatExpense={};filteredTx.forEach(t=>{if(t.type==="income")filtCatIncome[t.category]=(filtCatIncome[t.category]||0)+Number(t.amount);else filtCatExpense[t.category]=(filtCatExpense[t.category]||0)+Number(t.amount);});
  const sortedTx=[...transactions].sort((a,b)=>b.date.localeCompare(a.date));
  const dcd=dashChartData();
  const mCmp=monthComparison();

  // ── Today's stats (for the professional dashboard header) ──
  const notifications=computeNotifications(updateInfo);

  const todayStats=(()=>{
    const today=todayIso();
    const todayTx=transactions.filter(t=>t.date===today);
    const todayIncomeTx=todayTx.filter(t=>t.type==="income");
    const income=sumOf(todayTx,"income");
    const customerCount=new Set(todayIncomeTx.map(t=>t.saleId||t.linkTxId||t.id)).size; // هر فروش = یک مشتری (حتی با چند ردیف/پرداخت)
    const byService={};
    todayIncomeTx.forEach(t=>{byService[t.category]=(byService[t.category]||0)+1;});
    const byMethod={};
    todayIncomeTx.forEach(t=>{const k=t.method||"cash";byMethod[k]=(byMethod[k]||0)+Number(t.amount);});
    let topService=null,topCount=0;
    Object.entries(byService).forEach(([cat,cnt])=>{if(cnt>topCount){topCount=cnt;topService=cat;}});
    return{income,customerCount,topService,topCount,byMethod};
  })();
  const incSlices=donutSlices("income"),expSlices=donutSlices("expense");
  const currentTabInfo=TABS.find(t=>t.key===activeTab)||TABS[0];
  const navTree=NAV_TREE.filter(n=>!n.orangeOnly||skin==="orange");   // «داشبورد مدیریتی» فقط در تم نارنجی منوی جدا دارد
  const tabOn=(t)=>activeTab===t.key||(!!t.saleMode&&quickServiceOpen&&saleMode===t.saleMode);

  const navActiveBg="#2563eb22",navActiveFg=theme==="dark"?"#93c5fd":"#1d4ed8";
  const selectTabRef=useRef(null);
  const selectTab=(key)=>{const shopTab=TABS.find(t=>t.key===key&&t.saleMode);if(shopTab){setSaleMode(shopTab.saleMode);setQuickServiceOpen(true);setMenuOpen(false);return;}if(String(key).startsWith("settings:")){setSettingsTab(String(key).slice(9));key="settings";}if(key==="followups"){setCustForceMode("followups");key="customers";}else if(key==="assistant"){key="dashboard";}setActiveTab(key);setMenuOpen(false);};
  selectTabRef.current=selectTab;
  const [custForceMode,setCustForceMode]=useState(null);
  const quickAction=(tabKey,action)=>{setActiveTab(tabKey);setMenuOpen(false);if(action)setPendingAction(action);};
  const quickNav=(tabKey,action)=>{setActiveTab(tabKey);setMenuOpen(false);if(action)setPendingAction(action);};
  // رفتن به نتیجهٔ جستجوی «کافیند» (صفحه، تنظیمات، کار سریع یا یک رکورد مشخص)
  const goSearch=(go)=>{
    if(!go)return;setSearchOpen(false);
    if(go.action){
      const a=go.action;
      if(a==="new_sale")setQuickServiceOpen(true);
      else if(a==="new_online_sale"){setVoiceSalePrefill({online:{}});setQuickServiceOpen(true);}
      else if(a==="add_income")openAdd("income");
      else if(a==="add_expense")openAdd("expense");
      else if(a==="new_customer")quickAction("customers","new_customer");
      else if(a==="new_order")quickAction("orders","new_order");
      else if(a==="new_invoice")quickAction("invoice","new_invoice");
      else if(a==="health_check"){selectTab("health");}
      else if(a==="new_reminder"||a==="new_note"){setSearchFocus({tab:"notes",focus:{kind:a}});selectTab("notes");}
      return;
    }
    setSearchFocus(go);
    if(go.settingsTab)setSettingsTab(go.settingsTab);
    if(go.logsSub)setLogsSub(go.logsSub);
    if(go.profileSub)setProfileSub(go.profileSub);
    selectTab(go.tab);
  };
  useEffect(()=>{
    const h=(e)=>{
      const k=String(e.key||"").toLowerCase();
      if((e.ctrlKey||e.metaKey)&&k==="k"){e.preventDefault();setSearchOpen(o=>!o);return;}
      if(k==="/"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const t=e.target,tag=t&&t.tagName;if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||(t&&t.isContentEditable))return;e.preventDefault();setSearchOpen(true);}
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  return(
    <div className="fl-root" style={{...themeVars(theme),"--gb":isGuestMode()?"36px":"0px",minHeight:"100vh",background:"var(--bg-app)",color:"var(--text-primary)",fontFamily:appFontFamily(customFont),direction:"rtl"}}>
      <style>{`@keyframes uiPageEnter{from{opacity:0;transform:translateY(10px) scale(.995)}to{opacity:1;transform:translateY(0) scale(1)}}.ui-page-enter{animation:uiPageEnter .38s cubic-bezier(.2,.7,.2,1) backwards}@keyframes tabSelect{0%{transform:scale(.96);opacity:.7}65%{transform:scale(1.035)}100%{transform:scale(1);opacity:1}}@keyframes tabIconPop{0%{transform:scale(.75)}65%{transform:scale(1.18)}100%{transform:scale(1)}}@keyframes tabIndicatorIn{from{opacity:0;transform:scaleX(.35)}to{opacity:1;transform:scaleX(1)}}.tab-active{animation:tabSelect .25s ease-out both}.tab-active svg{animation:tabIconPop .3s ease-out both}.mobile-tab-indicator{animation:tabIndicatorIn .22s ease-out both}.app-shell button:not(:disabled){transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}.app-shell button:not(:disabled):hover{filter:brightness(1.05);transform:translateY(-1px)}.app-shell button:not(:disabled):active{transform:scale(.98)}@media(prefers-reduced-motion:reduce){.ui-page-enter{animation:none!important}.tab-active,.tab-active svg,.mobile-tab-indicator{animation:none!important}.app-shell button:not(:disabled){transition:none!important}}@media print{.no-print{display:none!important}.app-shell{margin-right:0!important;padding-bottom:0!important}.invoice-print{background:#fff!important;color:#000!important;border-radius:0!important}}`}</style>

      {/* ── SIDEBAR (desktop / tablet) ── */}
      {!isMobile&&(<>
        <aside className="no-print" style={{position:"fixed",top:"var(--gb,0px)",right:0,bottom:0,width:sbW,transition:"width .2s ease",background:"var(--bg-card)",borderLeft:"1px solid var(--border)",display:"flex",flexDirection:"column",padding:isCompact?"14px 8px":"16px 12px",zIndex:110,overflowY:"auto",boxSizing:"border-box"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:isCompact?"0 0 14px":"2px 6px 16px",justifyContent:isCompact?"center":"flex-start"}}>
            {shop.logo
              ?<img src={shop.logo} alt="لوگو" style={{width:36,height:36,objectFit:"contain",borderRadius:8,background:"#fff",flexShrink:0}}/>
              :<BrandLogo size={36}/>}
            {!isCompact&&<div style={{minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{APP_BRAND.fa} | <span dir="ltr">{APP_BRAND.en}</span></div>
              <div style={{fontSize:10,color:"var(--text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shop.name||APP_BRAND.tagline}</div>
            </div>}
          </div>
          <button onClick={()=>setQuickServiceOpen(true)} title="سیستم فروش یکپارچه" style={{...BTN("linear-gradient(135deg,#7c3aed,#a855f7)","#fff"),display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:isCompact?"11px 0":"11px 12px",marginBottom:16,fontSize:13,width:"100%"}}>
            <Icon name="Plus" size={18}/>{!isCompact&&<span>فروش یکپارچه</span>}
          </button>
          <div data-testid="side-nav" style={{display:"flex",flexDirection:"column",gap:2,marginBottom:12}}>
            {navTree.map(n=>{
              const navBtn=(t,sub)=>{
                const on=tabOn(t);
                return(
                  <button key={t.key} className={on?"tab-active":""} data-testid={`nav-${t.key}`} onClick={()=>selectTab(t.key)} title={t.label} style={{position:"relative",display:"flex",alignItems:"center",justifyContent:isCompact?"center":"flex-start",gap:11,width:"100%",background:on?navActiveBg:"transparent",border:"none",borderRight:on?"3px solid #60a5fa":"3px solid transparent",borderRadius:9,padding:isCompact?"11px 0":(sub?"8px 12px":"10px 12px"),marginBottom:2,cursor:"pointer",color:on?navActiveFg:"var(--text-secondary)",fontSize:sub?13:14,fontFamily:"inherit",fontWeight:on?700:500,textAlign:"right",transition:"background .15s"}}>
                    <Icon name={t.icon} size={sub?16:18}/>{!isCompact&&<span style={{flex:1,textAlign:"right"}}>{skin==="orange"&&(t.key==="pos"||t.key==="dashboard")?orangeTitle(t.key,t.label):t.label}</span>}{t.key==="inbox"&&<InboxBadge style={isCompact?{position:"absolute",top:2,left:4,minWidth:14,height:14,fontSize:9}:{}}/>}{t.key==="uploads"&&<UploadsBadge style={isCompact?{position:"absolute",top:2,left:4,minWidth:14,height:14,fontSize:9}:{}}/>}
                  </button>);
              };
              if(n.key)return navBtn(TABS.find(t=>t.key===n.key));
              const items=n.keys.map(k=>TABS.find(t=>t.key===k)).filter(Boolean);
              const hasActive=items.some(t=>t.key===activeTab);
              const open=isCompact?true:(navOpen[n.group]!==undefined?navOpen[n.group]:true);
              return(
                <div key={n.group} data-testid={`navgrp-${n.group}`} style={{marginTop:isCompact?6:4}}>
                  {isCompact
                    ?<div style={{height:1,background:"var(--border)",margin:"6px 8px 8px"}}/>
                    :<button data-testid={`navgrp-btn-${n.group}`} onClick={()=>toggleNav(n.group)} style={{display:"flex",alignItems:"center",gap:11,width:"100%",background:"transparent",border:"none",borderRight:"3px solid transparent",borderRadius:9,padding:"10px 12px",cursor:"pointer",color:hasActive?navActiveFg:"var(--text-primary)",fontSize:14,fontFamily:"inherit",fontWeight:700,textAlign:"right"}}>
                      <Icon name={n.icon} size={18}/><span style={{flex:1}}>{n.label}</span>
                      <Icon name="ChevronDown" size={15} style={{transition:"transform .2s",transform:open?"rotate(0deg)":"rotate(90deg)",opacity:0.7}}/>
                    </button>}
                  {open&&<div data-testid={`navsub-${n.group}`} style={isCompact?{}:{marginRight:14,paddingRight:6,borderRight:"1px solid var(--border)"}}>{items.map(t=>navBtn(t,true))}</div>}
                </div>);
            })}
          </div>
          <div style={{marginTop:"auto",borderTop:"1px solid var(--border)",paddingTop:10}}>
            {TABS.filter(t=>t.nav==="bottom").map(t=>{
              const on=activeTab===t.key;
              return(
                <button key={t.key} className={on?"tab-active":""} data-testid={`nav-${t.key}`} onClick={()=>selectTab(t.key)} title={t.label} style={{display:"flex",alignItems:"center",justifyContent:isCompact?"center":"flex-start",gap:11,width:"100%",background:on?navActiveBg:"transparent",border:"none",borderRight:on?"3px solid #60a5fa":"3px solid transparent",borderRadius:9,padding:isCompact?"11px 0":"10px 12px",cursor:"pointer",color:on?navActiveFg:"var(--text-secondary)",fontSize:14,fontFamily:"inherit",fontWeight:on?700:500,textAlign:"right"}}>
                  <Icon name={t.icon} size={18}/>{!isCompact&&<span>{t.label}</span>}
                </button>
              );
            })}
            {skin==="orange"&&!isCompact&&<div data-testid="oc-user-card" style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.06)",borderRadius:16,padding:"10px 12px",margin:"10px 0 4px"}}>
              <span aria-hidden="true" style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#ff9a3c,#e8590c)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,flexShrink:0}}>{Array.from(String(shop.name||"م"))[0]}</span>
              <div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shop.name||"مدیر کافی‌نت"}</div><div dir="ltr" style={{fontSize:11,color:"var(--text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"right"}}>{userEmail}</div></div>
            </div>}
            <button onClick={()=>selectTab("about")} title={`نسخه ${APP_VERSION}`} style={{display:"block",width:"100%",background:"transparent",border:"none",cursor:"pointer",color:"var(--text-dim)",fontSize:10,fontFamily:"inherit",padding:"8px 0 0",textAlign:"center"}}>
              <span dir="ltr">v{APP_VERSION}</span>
            </button>
          </div>
        </aside>
        <button type="button" className="no-print sb-toggle" data-testid="sidebar-toggle" data-state={isCompact?"mini":"full"} onClick={toggleSidebar}
          aria-label={isCompact?"باز کردن منوی کناری":"بستن (کوچک کردن) منوی کناری"} aria-expanded={!isCompact} title={isCompact?"باز کردن منو":"کوچک کردن منو"}
          style={{position:"fixed",top:"calc(var(--gb,0px) + 74px)",right:sbW-14,width:28,height:28,borderRadius:"50%",border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text-secondary)",boxShadow:"0 2px 8px rgba(0,0,0,.18)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:111,padding:0,transition:"right .2s ease"}}>
          {/* جهت فلش = جهت حرکت منو: باز = ‹ (به سمت محتوا)، بستن = › (به سمت لبهٔ راست) */}
          <Icon name={isCompact?"ChevronLeft":"ChevronRight"} size={16}/>
        </button>
      </>)}

      <div className="app-shell" style={{marginRight:sbW,transition:"margin-right .2s ease",paddingBottom:isMobile?84:0,paddingTop:"var(--gb,0px)",minHeight:"100vh"}}>

      {/* ── HEADER ── */}
      <div className="no-print fl-header" style={{background:"linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2))",borderBottom:"1px solid var(--header-border)",padding:isMobile?"0 10px":"0 20px",position:"sticky",top:"var(--gb,0px)",zIndex:100}}>
        <div style={{maxWidth:skin==="orange"&&!isMobile?1360:980,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:skin==="orange"&&!isMobile?84:64}}>

          {/* Logo (phone) / page title (desktop — the logo lives in the sidebar) */}
          <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flex:1}}>
            {isMobile?(<>
              {shop.logo
                ?<img src={shop.logo} alt="لوگو" style={{width:34,height:34,objectFit:"contain",borderRadius:7,background:"#fff",flexShrink:0}}/>
                :<BrandLogo size={34}/>}
              <div style={{minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{APP_BRAND.fa} | <span dir="ltr">{APP_BRAND.en}</span></div>
                <div style={{fontSize:11,color:"#cbd5e1",display:"flex",alignItems:"center",gap:4}}><Icon name={currentTabInfo.icon} size={12}/> {currentTabInfo.label}</div>
              </div>
            </>):(<>
              {skin==="orange"
                ?<div data-testid="oc-title" style={{minWidth:0}}>
                  <div style={{fontSize:26,fontWeight:800,color:"var(--text-primary)",lineHeight:1.4}}>{orangeTitle(activeTab,currentTabInfo.label)}</div>
                  <div style={{fontSize:13,color:"var(--text-muted)"}}>{ORANGE_SUBTITLES[activeTab]||""}</div>
                </div>
                :<><Icon name={currentTabInfo.icon} size={20} style={{color:"#fff"}}/>
                <div style={{fontSize:17,fontWeight:700,color:"#fff"}}>{currentTabInfo.label}</div></>}
            </>)}
          </div>

          {/* Left side: notifications, backup, settings, profile + hamburger nav */}
          <div style={{display:"flex",alignItems:"center",gap:isMobile?6:8,flexShrink:0}}>
            {skin==="orange"&&!isMobile&&<>
              <button data-testid="oc-header-search" type="button" onClick={()=>setSearchOpen(true)} aria-label="جستجو در همهٔ برنامه" style={{display:"flex",alignItems:"center",gap:10,width:isCompact?150:300,height:44,background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:14,padding:"0 14px",cursor:"pointer",fontFamily:"inherit",color:"var(--text-muted)",fontSize:13}}><Icon name="Search" size={16}/><span style={{flex:1,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>جستجو در مشتری، فاکتور، خدمت…</span></button>
              {!isCompact&&<span data-testid="oc-date" style={{display:"inline-flex",alignItems:"center",gap:8,height:44,background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:14,padding:"0 14px",fontSize:13,fontWeight:600,color:"var(--text-primary)",whiteSpace:"nowrap"}}><Icon name="CalendarDays" size={16}/>{new Date().toLocaleDateString("fa-IR",{weekday:"long"})} {jalaliLabel(todayIso())}</span>}
            </>}
            <button data-testid="global-search-btn" onClick={()=>setSearchOpen(true)} title="جستجو در همهٔ برنامه (Ctrl+K)" aria-label="جستجو" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:9,width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name="Search" size={17} style={{color:"var(--text-secondary)"}}/></button>

            {!isMobile&&<>
            {/* Income / Expense quick entry */}
            <button onClick={()=>openAdd("income")} title="ثبت درآمد جدید" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:9,width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name="TrendingUp" size={17} style={{color:"#4ade80"}}/></button>
            <button onClick={()=>openAdd("expense")} title="ثبت هزینه جدید" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:9,width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name="TrendingDown" size={17} style={{color:"#f87171"}}/></button>

            {/* Theme toggle */}
            <button onClick={()=>setTheme(theme==="dark"?"light":"dark")} title="تغییر تم" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:9,width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name={theme==="dark"?"Sun":"Moon"} size={17} style={{color:"var(--text-secondary)"}}/></button>

            {/* Calculator */}
            <button onClick={()=>setCalcOpen(true)} title="ماشین حساب" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:9,width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name="Calculator" size={17} style={{color:"var(--text-secondary)"}}/></button>

            </>}

            <SyncChip compact={isMobile} onOpen={openSyncCenter}/>

            {/* Notifications */}
            <div style={{position:"relative"}} ref={notifRef}>
              <button onClick={()=>setNotifOpen(o=>!o)} style={{position:"relative",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:9,width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Icon name="Bell" size={17} style={{color:"var(--text-secondary)"}}/>
                {notifications.length>0&&<span style={{position:"absolute",top:-4,left:-4,background:"#dc2626",color:"#fff",borderRadius:"50%",width:17,height:17,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{toFA(Math.min(notifications.length,99))}</span>}
              </button>
              {notifOpen&&(
                <div style={isMobile?{position:"fixed",top:"calc(68px + var(--gb,0px))",left:8,right:8,background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:14,padding:10,maxHeight:"70vh",overflowY:"auto",boxShadow:"0 20px 50px #000b",zIndex:500}:{position:"absolute",top:"calc(100% + 8px)",left:0,background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:14,padding:10,width:340,maxHeight:"70vh",overflowY:"auto",boxShadow:"0 20px 50px #000b",zIndex:500}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"4px 8px 10px",borderBottom:"1px solid var(--border)",marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:800,color:"var(--text-primary)"}}>🔔 مرکز اعلان‌ها</div>
                    <div style={{fontSize:11,color:"var(--text-muted)"}}>{toFA(notifications.length)} مورد فعال</div>
                  </div>
                  {notifications.length===0
                    ?<div style={{fontSize:12,color:"var(--text-dim)",textAlign:"center",padding:"20px 0"}}>هشدار فعالی وجود ندارد</div>
                    :notifications.map((n,i)=>(
                      (()=>{
                        const level=n.level||"info",badge=level==="critical"?"فوری":level==="attention"?"مهم":level==="warning"?"پیگیری":"اطلاع";
                        const content=<><div style={{display:"flex",alignItems:"flex-start",gap:7,color:n.color||"var(--text-secondary)",fontWeight:700,lineHeight:1.7}}><span>{n.icon||"🔔"}</span><span style={{flex:1}}>{n.text}</span><span style={{fontSize:9,borderRadius:10,padding:"2px 6px",background:`${n.color||"#64748b"}22`,whiteSpace:"nowrap"}}>{badge}</span></div>{n.category&&<div style={{fontSize:10,color:"var(--text-muted)",marginTop:3}}>{n.category}</div>}{n.detail&&<div style={{fontSize:10,color:"var(--text-muted)",marginTop:2,lineHeight:1.7}}>{n.detail}</div>}</>;
                        const style={display:"block",width:"100%",textAlign:"right",padding:"9px 10px",borderRadius:9,background:"var(--bg-app)",marginBottom:6,fontSize:12,border:"1px solid transparent",fontFamily:"inherit",cursor:n.tab?"pointer":"default"};
                        return n.tab
                          ?<button key={n.key||i} onClick={()=>{setNotifOpen(false);selectTab(n.tab);}} style={style}>{content}</button>
                          :<div key={n.key||i} style={style}>{content}</div>;
                      })()
                    ))
                  }
                </div>
              )}
            </div>

            {!isMobile&&<>
            {/* Backup */}
            <button onClick={()=>setBackupOpen(true)} title="پشتیبان‌گیری" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:9,width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name="Save" size={17} style={{color:"var(--text-secondary)"}}/></button>


            {/* Profile */}
            <div style={{position:"relative"}} ref={profileRef}>
              <button onClick={()=>setProfileOpen(o=>!o)} style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:9,width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name="User" size={17} style={{color:"var(--text-secondary)"}}/></button>
              {profileOpen&&(
                <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:14,padding:8,minWidth:220,boxShadow:"0 20px 50px #000b",zIndex:500}}>
                  <div style={{padding:"8px 12px",borderBottom:"1px solid var(--border)",marginBottom:6}}>
                    <div style={{fontSize:11,color:"var(--text-dim)"}}>وارد شده به‌عنوان</div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",direction:"ltr",textAlign:"right"}}>{userEmail}</div>
                  </div>
                  <button onClick={()=>{setProfileOpen(false);selectTab("settings");}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:"transparent",border:"none",borderRadius:9,padding:"10px 14px",cursor:"pointer",color:"var(--text-secondary)",fontSize:13,fontFamily:"inherit",textAlign:"right"}}>
                    <Icon name="Settings" size={15}/><span>تنظیمات</span>
                  </button>
                  <button onClick={()=>{setProfileOpen(false);onLogout&&onLogout();}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:"transparent",border:"none",borderRadius:9,padding:"10px 14px",cursor:"pointer",color:"#f87171",fontSize:13,fontFamily:"inherit",textAlign:"right"}}>
                    <Icon name="LogOut" size={15}/><span>خروج از حساب</span>
                  </button>
                </div>
              )}
            </div>

            </>}

          </div>
        </div>
      </div>

      <UrgentAnnouncementBar onOpen={()=>selectTab("inbox")}/>

      {/* ── CONTENT ── */}
      <div key={activeTab} className="ui-page-enter" style={{maxWidth:skin==="orange"&&!isMobile?1360:980,margin:"0 auto",padding:isMobile?"16px 12px":"24px 20px"}}>
      <ErrorBoundary inline resetKey={activeTab} label={currentTabInfo&&currentTabInfo.label}>

        {/* DASHBOARD */}
        {/* داشبورد مالی (تم نارنجی): کارت‌های امروز، نمودارها، آخرین تراکنش‌ها */}
        {activeTab==="dashboard"&&skin==="orange"&&<OrangeDashboard transactions={transactions} onNavigate={selectTab}/>}

        {/* داشبورد مدیریتی: کاشی‌ها، مرکز عملیات و ویجت‌ها (در تم مترو همان «داشبورد» است) */}
        {(activeTab==="mgmt"||(activeTab==="dashboard"&&skin!=="orange"))&&(
          <ManagementDashboard
            transactions={transactions} isMobile={isMobile} shopName={shop.name}
            onQuickSale={()=>setQuickServiceOpen(true)} onQuickProduct={()=>setProductSaleOpen(true)} onQuickTx={(t)=>openAdd(t)} quickAction={quickAction} onNavigate={selectTab} onSearchGo={goSearch}
            legacy={{
              calendar:<EventCalendar compact/>,
              orders:<DashboardOrdersStatus/>,
              compare:(
                <div style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 16px"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>🔁 مقایسه {mCmp.curLabel} با {mCmp.prevLabel}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                    <ComparisonCell label="درآمد (فروش)" data={mCmp.income} goodDirection="up"/>
                    <ComparisonCell label="سود ناخالص" data={mCmp.gross} goodDirection="up"/>
                    <ComparisonCell label="سود خالص" data={mCmp.profit} goodDirection="up"/>
                  </div>
                </div>),
              totals:(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
                  <KPI icon="TrendingUp" label="کل درآمد (فروش)" val={fmtM(finAll.revenue)} color="#60a5fa" bg="#0a1a33"/>
                  <KPI icon="TrendingDown" label="هزینه مستقیم" val={fmtM(finAll.direct)} color="#fdba74" bg="#2a1505"/>
                  <KPI icon={finAll.gross>=0?"TrendingUp":"TrendingDown"} label={finAll.gross>=0?"سود ناخالص":"زیان ناخالص"} val={fmtM(Math.abs(finAll.gross))} color={finAll.gross>=0?"#16a34a":"#dc2626"} bg={finAll.gross>=0?"#052e16":"#2d0a0a"}/>
                  <KPI icon="TrendingDown" label="هزینه‌های جاری" val={fmtM(finAll.operating)} color="#dc2626" bg="#2d0a0a"/>
                  <KPI icon={finAll.net>=0?"TrendingUp":"TrendingDown"} label={finAll.net>=0?"سود خالص":"زیان خالص"} val={fmtM(Math.abs(finAll.net))} color={finAll.net>=0?"#22d3ee":"#f97316"} bg={finAll.net>=0?"#0a1f2e":"#1c0a00"}/>
                </div>),
              trend:(<div style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 16px"}}><div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>📉 روند ۶ ماه اخیر</div><LineChart data={dcd}/></div>),
              monthly:(<div style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 16px"}}><div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>💰 نمودار درآمد ماهانه</div><MonthlyIncomeChart data={dcd} height={160}/></div>),
              bars:(<div style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 16px"}}><div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:12}}>📊 مقایسه ماهانه (درآمد🟢 / هزینه🔴)</div><BarChart data={dcd} height={160}/></div>),
              donuts:(
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                  <DonutSection title="سهم دسته‌های درآمد" slices={incSlices} color="#16a34a" total={totalIncome}/>
                  <DonutSection title="سهم دسته‌های هزینه" slices={expSlices} color="#dc2626" total={totalExpense}/>
                </div>),
              ratio:(
                <div style={{background:"var(--bg-card)",borderRadius:14,padding:"14px 16px"}}>
                  <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:10}}>نسبت درآمد به هزینه (کل)</div>
                  <div style={{display:"flex",height:18,borderRadius:5,overflow:"hidden",background:"var(--bg-app)"}}>
                    {(totalIncome+totalExpense)>0&&<><div style={{width:`${totalIncome/(totalIncome+totalExpense)*100}%`,background:"#16a34a"}}/><div style={{flex:1,background:"#dc2626"}}/></>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:12}}>
                    <span style={{color:"#16a34a"}}>درآمد {(totalIncome+totalExpense)>0?toFA(Math.round(totalIncome/(totalIncome+totalExpense)*100)):0}٪</span>
                    <span style={{color:"#dc2626"}}>هزینه {(totalIncome+totalExpense)>0?toFA(Math.round(totalExpense/(totalIncome+totalExpense)*100)):0}٪</span>
                  </div>
                </div>),
            }}
          />
        )}

        {/* TRANSACTIONS */}
        {activeTab==="transactions"&&(
          <div>
            {sortedTx.length>0&&(
              <>
                <div data-testid="tx-method-filter" style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {[["all","همه"],...PAY_METHODS.filter(p=>p.real).map(p=>[p.key,`${p.icon} ${p.label}`])].map(([k,l])=><button key={k} onClick={()=>setTxMethodFilter(k)} style={{...BTN(txMethodFilter===k?"#2563eb":"var(--bg-card)",txMethodFilter===k?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12,border:"1px solid var(--border)"}}>{l}</button>)}
                </div>
                <MethodSummary txs={sortedTx.filter(t=>txMethodFilter==="all"||txMethod(t)===txMethodFilter)} title="🏧 صندوق به تفکیک روش (لیست فعلی)"/>
              </>)}
            {sortedTx.length===0?<Empty text="هنوز تراکنشی ثبت نشده" sub="از دکمه‌های بالا درآمد یا هزینه اضافه کنید"/>
              :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                {sortedTx.filter(t=>txMethodFilter==="all"||(isRealCashTx(t)&&txMethod(t)===txMethodFilter)).map(t=>(
                  <div key={t.id} style={{background:"var(--bg-card)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRight:`3px solid ${t.type==="income"?"#16a34a":"#dc2626"}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:20}}>{t.type==="income"?"💰":"💸"}</span>
                      <div>
                        <div style={{fontWeight:600,fontSize:14}}>{t.category}</div>
                        <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>{t.desc||"—"} · {jalaliLabel(t.date)}{isRealCashTx(t)&&<span data-testid="tx-badge" style={{marginRight:8,background:"var(--bg-app)",borderRadius:6,padding:"1px 7px",fontSize:11,color:"var(--text-secondary)"}}>{payIcon(txMethod(t))} {payLabel(txMethod(t))}</span>}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{color:t.type==="income"?"#4ade80":"#f87171",fontWeight:700,fontSize:14}}>{t.type==="income"?"+":"-"}{fmtM(t.amount)}</span>
                      <button onClick={()=>openEdit(t)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"4px 9px",fontSize:12}}>✏️</button>
                      <button data-testid="tx-void" title="ابطال تراکنش" onClick={()=>setDelConfirm(t.id)} style={{...BTN("#450a0a","#f87171"),padding:"4px 9px",fontSize:12}}>🚫</button>
                    </div>
                  </div>
                ))}
              </div>
            }
            <VoidedPanel kinds={["tx"]} title="🚫 تراکنش‌های باطل‌شده"/>
          </div>
        )}

        {/* REPORT */}
        {activeTab==="report"&&(skin==="orange"?<OrangeReports transactions={transactions} onNavigate={selectTab}>
          <ReportSection
            transactions={transactions}
            categories={categories}
            reportMode={reportMode} setReportMode={setReportMode}
            srchDateFrom={srchDateFrom} setSrchDateFrom={setSrchDateFrom}
            srchDateTo={srchDateTo} setSrchDateTo={setSrchDateTo}
            srchCat={srchCat} setSrchCat={setSrchCat}
            srchType={srchType} setSrchType={setSrchType}
            shop={shop}
          />
          </OrangeReports>:(
          <ReportSection
            transactions={transactions}
            categories={categories}
            reportMode={reportMode} setReportMode={setReportMode}
            srchDateFrom={srchDateFrom} setSrchDateFrom={setSrchDateFrom}
            srchDateTo={srchDateTo} setSrchDateTo={setSrchDateTo}
            srchCat={srchCat} setSrchCat={setSrchCat}
            srchType={srchType} setSrchType={setSrchType}
            shop={shop}
          />
        ))}

        {/* CUSTOMERS */}
        {activeTab==="customers"&&(skin==="orange"?<OrangeCustomers forceMode={custForceMode} clearForceMode={()=>setCustForceMode(null)} pendingAction={pendingAction==="new_customer"?pendingAction:null} clearPendingAction={()=>setPendingAction(null)} voicePrefill={voiceCustomerPrefill} clearVoicePrefill={()=>setVoiceCustomerPrefill(null)} onNavigate={selectTab}/>:<CustomersSection forceMode={custForceMode} clearForceMode={()=>setCustForceMode(null)} pendingAction={pendingAction==="new_customer"?pendingAction:null} clearPendingAction={()=>setPendingAction(null)} voicePrefill={voiceCustomerPrefill} clearVoicePrefill={()=>setVoiceCustomerPrefill(null)} onNavigate={selectTab}/>)}

        {/* ORDERS */}
        {activeTab==="topup"&&<TopupSection onNavigate={selectTab}/>}
        {activeTab==="pos"&&<PosSection onNavigate={selectTab}/>}
        {activeTab==="orders"&&<OrdersSection pendingAction={pendingAction==="new_order"||String(pendingAction||"").startsWith("receive_payment:")?pendingAction:null} clearPendingAction={()=>setPendingAction(null)} transactions={transactions} setTransactions={setTransactions} onNavigate={selectTab}/>}

        {/* INVOICE */}
        {activeTab==="invoice"&&(skin==="orange"?<OrangeInvoices pendingAction={pendingAction==="new_invoice"?pendingAction:null} clearPendingAction={()=>setPendingAction(null)} onNavigate={selectTab}/>:<InvoiceSection pendingAction={pendingAction==="new_invoice"?pendingAction:null} clearPendingAction={()=>setPendingAction(null)} onNavigate={selectTab}/>)}

        {/* LEDGER */}
        {activeTab==="ledger"&&<LedgerSection categories={categories} shop={shop}/>}


        {/* TARIFF */}
        {activeTab==="tariff"&&<TariffSection onSelectTariff={(catKey,price)=>{setForm({amount:price>0?String(price):"",category:catKey,desc:"",date:todayIso()});setTxModal({type:"income",editId:null});}}/>}

        {/* PRINT & SCAN */}
        {activeTab==="printscan"&&<PrintScanHub transactions={transactions} setTransactions={setTransactions}/>}

        {/* INVENTORY */}
        {activeTab==="inventory"&&<InventorySection/>}
        {activeTab==="obligations"&&<ObligationsSection onNavigate={selectTab}/>}
        {activeTab==="links"&&<LinksSection/>}
        {activeTab==="dateconv"&&<DateConverterSection/>}
        {activeTab==="notes"&&<NotesPage/>}
        {activeTab==="health"&&<HealthPage onNavigate={selectTab}/>}
        {activeTab==="inbox"&&<InboxPage/>}
        {activeTab==="fincenter"&&<FinanceCenter/>}
        {activeTab==="uploads"&&<UploadsPage/>}
        {activeTab==="about"&&<AboutPage/>}
        {activeTab==="audit"&&<AuditPanel/>}
        {activeTab==="calendar"&&<EventCalendar/>}
        {/* SETTINGS */}
        {activeTab==="settings"&&(
          <div>
            {/* Settings sub-navigation */}
            <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap",overflowX:"auto"}}>
              {[
                {key:"appearance",label:"ظاهر",icon:"Sun"},
                {key:"accounting",label:"تنظیمات حسابداری",icon:"Calculator"},
                {key:"categories",label:"دسته‌بندی‌ها",icon:"Tags"},
                {key:"printscan",label:"پرینت و اسکن",icon:"Printer"},
                {key:"ai",label:"هوش مصنوعی",icon:"Sparkles"},
                ...(SHOW_SERVER_SETTINGS?[{key:"server",label:"اتصال به سرور",icon:"Plug"}]:[]),
                ...(SHOW_SERVER_SETTINGS||isApiConnected()?[{key:"sync",label:"همگام‌سازی",icon:"RefreshCw"}]:[]),
                {key:"privacy",label:"حریم خصوصی",icon:"ShieldCheck"},
                {key:"logs",label:"لاگ",icon:"ListChecks"},
                ...(SHOW_SERVER_SETTINGS||isApiConnected()?[{key:"users",label:"کاربران و دسترسی",icon:"Users"}]:[]),
                {key:"backup",label:"پشتیبان‌گیری",icon:"Save"},
                {key:"profile",label:"پروفایل",icon:"User"},
              ].map(t=>(
                <button key={t.key} data-testid={`settings-tab-${t.key}`} onClick={()=>setSettingsTab(t.key)} style={{...BTN(settingsTab===t.key?"#2563eb":"var(--bg-card)",settingsTab===t.key?"#fff":"var(--text-secondary)"),padding:"9px 16px",fontSize:12,display:"flex",alignItems:"center",gap:6,border:settingsTab===t.key?"none":"1px solid var(--border)",flexShrink:0}}>
                  <Icon name={t.icon} size={14}/><span>{t.label}</span>
                </button>
              ))}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:20}}>

            {settingsTab==="appearance"&&(<>
            <SkinPanel/>
            {/* Theme */}
            <div style={{background:"var(--bg-card)",borderRadius:12,padding:18}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>🎨 ظاهر برنامه</div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setTheme("dark")} style={{...BTN(theme==="dark"?"#2563eb":"var(--bg-app)",theme==="dark"?"#fff":"var(--text-secondary)"),flex:1,padding:"12px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:8,border:theme==="dark"?"none":"1px solid var(--border)"}}>
                  <span>🌙</span><span>تیره (Dark)</span>
                </button>
                <button onClick={()=>setTheme("light")} style={{...BTN(theme==="light"?"#2563eb":"var(--bg-app)",theme==="light"?"#fff":"var(--text-secondary)"),flex:1,padding:"12px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:8,border:theme==="light"?"none":"1px solid var(--border)"}}>
                  <span>☀️</span><span>روشن (Light)</span>
                </button>
              </div>
            </div>

            {skin==="metro"?<FluentPanel/>:<div data-testid="fluent-note" style={{background:"var(--bg-card)",borderRadius:12,padding:18,fontSize:12,color:"var(--text-secondary)",lineHeight:1.9}}>✨ طراحی Fluent فقط در «تم مترو» اعمال می‌شود. با بازگشت به تم مترو تنظیمات قبلی شما دوباره فعال می‌شود.</div>}
            {/* Custom Font */}
            <div style={{background:"var(--bg-card)",borderRadius:12,padding:18}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>🔤 فونت برنامه</div>
              <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:12}}>
                فونت فعلی: <b style={{color:"var(--text-primary)"}}>{customFont?customFont.name:"پیش‌فرض (Vazirmatn)"}</b>
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                <label style={{...BTN("#2563eb"),padding:"9px 18px",cursor:"pointer",display:"inline-block"}}>
                  📁 انتخاب فایل فونت
                  <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontUpload} style={{display:"none"}}/>
                </label>
                {customFont&&<button onClick={resetFont} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"9px 18px"}}>بازگشت به فونت پیش‌فرض</button>}
              </div>
              {fontErr&&<div style={{marginTop:10,background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#f87171"}}>⚠️ {fontErr}</div>}
              <div style={{fontSize:11,color:"var(--text-dim)",marginTop:10}}>فرمت‌های پشتیبانی‌شده: TTF, OTF, WOFF, WOFF2 — حداکثر ۴ مگابایت. فونت روی همین دستگاه ذخیره می‌شود.</div>
            </div>
            </>)}


            {settingsTab==="accounting"&&(<div style={{display:"flex",flexDirection:"column",gap:14}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={()=>setAccountingSubTab("accounts")} style={{...BTN(accountingSubTab==="accounts"?"#2563eb":"var(--bg-card)",accountingSubTab==="accounts"?"#fff":"var(--text-secondary)"),padding:"9px 14px"}}>🏦 کارتخوان‌ها و حساب‌های بانکی</button><button onClick={()=>setAccountingSubTab("currency")} style={{...BTN(accountingSubTab==="currency"?"#2563eb":"var(--bg-card)",accountingSubTab==="currency"?"#fff":"var(--text-secondary)"),padding:"9px 14px"}}>💱 واحد پول</button></div>{accountingSubTab==="accounts"?<PaymentAccountsSettings/>:<div style={{background:"var(--bg-card)",borderRadius:12,padding:18}}><div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>واحد نمایش مبالغ</div><div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9,marginBottom:14}}>واحد انتخاب‌شده در نمایش مبالغ مالی برنامه اعمال می‌شود. اطلاعات اصلی حسابداری برای حفظ دقت محاسبات به ریال ذخیره می‌ماند.</div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button onClick={()=>setCurrency("rial")} aria-pressed={currency==="rial"} style={{...BTN(currency==="rial"?"#2563eb":"var(--bg-app)",currency==="rial"?"#fff":"var(--text-secondary)"),border:currency==="rial"?"none":"1px solid var(--border)",padding:"11px 20px"}}>ریال</button><button onClick={()=>setCurrency("toman")} aria-pressed={currency==="toman"} style={{...BTN(currency==="toman"?"#2563eb":"var(--bg-app)",currency==="toman"?"#fff":"var(--text-secondary)"),border:currency==="toman"?"none":"1px solid var(--border)",padding:"11px 20px"}}>تومان</button></div></div>}</div>)}
            {settingsTab==="categories"&&(
            <div style={{background:"var(--bg-card)",borderRadius:12,padding:18}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>🗂️ مدیریت دسته‌بندی‌ها</div>
              <div style={{display:"flex",gap:8,marginBottom:16}}>
                <button onClick={()=>setCatTab("income")} style={BTN(catTab==="income"?"#16a34a":"var(--bg-app)",catTab==="income"?"#fff":"var(--text-secondary)")}>💰 درآمد</button>
                <button onClick={()=>setCatTab("expense")} style={BTN(catTab==="expense"?"#dc2626":"var(--bg-app)",catTab==="expense"?"#fff":"var(--text-secondary)")}>💸 هزینه</button>
              </div>
              <div style={{background:"var(--bg-app)",borderRadius:12,padding:16,marginBottom:14}}>
                <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:10}}>افزودن دسته‌بندی جدید</div>
                <div style={{display:"flex",gap:10}}>
                  <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCat()} placeholder="نام دسته‌بندی جدید..." style={{...INP,marginTop:0,flex:1}}/>
                  <button onClick={addCat} style={BTN(catTab==="income"?"#16a34a":"#dc2626")}>+ افزودن</button>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {categories[catTab].map((cat,idx)=>(
                  <div key={cat} style={{background:"var(--bg-app)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                    {editCatIdx===idx
                      ?<><input value={editCatName} onChange={e=>setEditCatName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveCatEdit(catTab,idx)} style={{...INP,marginTop:0,flex:1}} autoFocus/><button onClick={()=>saveCatEdit(catTab,idx)} style={BTN("#2563eb")}>ذخیره</button><button onClick={()=>setEditCatIdx(null)} style={BTN("var(--border)","var(--text-secondary)")}>لغو</button></>
                      :<><span style={{flex:1,fontSize:14}}>{cat}</span>{catTab==="expense"&&(()=>{const isD=directCats().includes(cat),lock=cat===COST_CATEGORY;return <button data-testid={"direct-toggle-"+cat} disabled={lock} title="هزینه مستقیم از سود ناخالص کم می‌شود؛ بقیه از سود خالص" onClick={()=>{setDirectCats(isD?directCats().filter(c=>c!==cat):[...directCats(),cat]);setTick2(t=>t+1);}} style={{...BTN(isD?"#7c2d12":"var(--border)",isD?"#fdba74":"var(--text-secondary)"),padding:"5px 10px",fontSize:11,opacity:lock?.7:1}}>{isD?"✓ مستقیم":"جاری"}</button>;})()}<button onClick={()=>{setEditCatIdx(idx);setEditCatName(cat);}} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"5px 12px",fontSize:12}}>✏️ ویرایش</button><button onClick={()=>delCat(catTab,cat)} style={{...BTN("#450a0a","#f87171"),padding:"5px 12px",fontSize:12}}>🗑️ حذف</button></>
                    }
                  </div>
                ))}
                {categories[catTab].length===0&&<Empty text="دسته‌بندی‌ای وجود ندارد" sub="از فرم بالا اضافه کنید"/>}
              </div>
            </div>
            )}

            {settingsTab==="printscan"&&<PrintScanSettingsPanel onOpenTool={()=>selectTab("printscan")}/>}
            {settingsTab==="ai"&&<AiAgentPanel/>}
            {settingsTab==="server"&&<ServerConnectionPanel/>}
            {settingsTab==="sync"&&<SyncCenterPanel/>}
            {settingsTab==="privacy"&&<PrivacyPanel/>}
            {settingsTab==="logs"&&<LogsPanel sub={logsSub} setSub={setLogsSub} onOpenAudit={()=>selectTab("audit")}/>}
            {settingsTab==="users"&&<UserManagementPanel/>}
            {settingsTab==="backup"&&<BackupSettingsPanel/>}
            {settingsTab==="profile"&&(
              <div data-testid="profile-subtabs" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[["user","👤 پروفایل کاربر"],["shop","🏪 پروفایل فروشگاه"]].map(([k,l])=>(
                  <button key={k} data-testid={`profile-tab-${k}`} onClick={()=>setProfileSub(k)} style={{...BTN(profileSub===k?"#2563eb":"var(--bg-card)",profileSub===k?"#fff":"var(--text-secondary)"),padding:"8px 16px",fontSize:12.5,border:profileSub===k?"none":"1px solid var(--border)"}}>{l}</button>
                ))}
              </div>)}
            {settingsTab==="profile"&&profileSub==="user"&&<ProfilePanel userEmail={userEmail} onLogout={onLogout} onPasswordChanged={onPasswordChanged}/>}
            {settingsTab==="profile"&&profileSub==="shop"&&(
            <div style={{background:"var(--bg-card)",borderRadius:12,padding:18}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>🏪 مشخصات کافی‌نت</div>
              <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
                <div style={{width:64,height:64,borderRadius:10,background:"var(--bg-app)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
                  {shopForm.logo?<img src={shopForm.logo} alt="لوگو" style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<span style={{fontSize:26,color:"var(--text-dim)"}}>🖼️</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <label style={{...BTN("#2563eb"),padding:"7px 16px",fontSize:12,cursor:"pointer",display:"inline-block",width:"fit-content"}}>
                    📁 انتخاب لوگو
                    <input type="file" accept="image/*" onChange={handleLogoUpload} style={{display:"none"}}/>
                  </label>
                  {shopForm.logo&&<button onClick={removeLogo} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"7px 16px",fontSize:12,width:"fit-content"}}>حذف لوگو</button>}
                </div>
              </div>
              {logoErr&&<div style={{marginBottom:14,background:"#2d0a0a",border:"1px solid #dc262644",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#f87171"}}>⚠️ {logoErr}</div>}
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>نام کافی‌نت
                  <input value={shopForm.name} onChange={e=>setShopForm(f=>({...f,name:e.target.value}))} style={INP}/>
                </label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>نام اتحادیه
                  <input data-testid="shop-union" value={shopForm.unionName||""} onChange={e=>setShopForm(f=>({...f,unionName:e.target.value}))} placeholder="مثلاً: اتحادیه فناوران رایانه تهران" maxLength={120} style={INP}/>
                  <span style={{display:"block",fontSize:11,color:"var(--text-muted)",marginTop:4}}>این نام در صفحهٔ «تعرفه» نمایش داده می‌شود.</span>
                </label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>آدرس
                  <input value={shopForm.address} onChange={e=>setShopForm(f=>({...f,address:e.target.value}))} placeholder="آدرس کامل..." style={INP}/>
                </label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>شماره تماس
                  <input value={shopForm.phone} onChange={e=>setShopForm(f=>({...f,phone:e.target.value}))} placeholder="۰۲۱..." style={INP}/>
                </label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>شماره موبایل
                  <input data-testid="shop-mobile" value={shopForm.mobile||""} onChange={e=>setShopForm(f=>({...f,mobile:e.target.value}))} placeholder="۰۹۱۲..." style={INP}/>
                </label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>شماره کارت (جهت واریز، روی فاکتور چاپ می‌شود)
                  <input data-testid="shop-card" value={shopForm.cardNumber||""} onChange={e=>setShopForm(f=>({...f,cardNumber:e.target.value}))} placeholder="۶۰۳۷ ۹۹۷۱ ..." inputMode="numeric" style={{...INP,direction:"ltr",textAlign:"right"}}/>
                </label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <label style={{fontSize:13,color:"var(--text-secondary)"}}>به نام (صاحب کارت)
                    <input data-testid="shop-card-holder" value={shopForm.cardHolder||""} onChange={e=>setShopForm(f=>({...f,cardHolder:e.target.value}))} placeholder="اختیاری..." style={INP}/>
                  </label>
                  <label style={{fontSize:13,color:"var(--text-secondary)"}}>بانک
                    <input value={shopForm.bankName||""} onChange={e=>setShopForm(f=>({...f,bankName:e.target.value}))} placeholder="اختیاری..." style={INP}/>
                  </label>
                </div>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>شماره شبا (جهت واریز، روی فاکتور چاپ می‌شود)<input data-testid="shop-iban" value={shopForm.iban||""} onChange={e=>setShopForm(f=>({...f,iban:e.target.value}))} placeholder="IR…" inputMode="text" style={{...INP,direction:"ltr",textAlign:"right"}}/></label>
                <label style={{fontSize:13,color:"var(--text-secondary)"}}>شناسه مالیاتی / کد اقتصادی
                  <input value={shopForm.taxId} onChange={e=>setShopForm(f=>({...f,taxId:e.target.value}))} placeholder="اختیاری..." style={INP}/>
                </label>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,marginTop:16}}>
                <button data-testid="shop-save" onClick={saveShop} style={{...BTN("#2563eb"),padding:"9px 20px"}}>ذخیره اطلاعات</button>
                {shopSaved&&<span style={{fontSize:12,color:"#4ade80"}}>✓ ذخیره شد</span>}
              </div>
              <div style={{fontSize:11,color:"var(--text-muted)",marginTop:12,lineHeight:1.9}}>نمایش شماره کارت و حساب‌ها و بارگذاری مهر و امضا از بخش «فاکتورها ← تنظیمات فاکتور» انجام می‌شود.</div>
            </div>
            )}

            </div>
          </div>
        )}
      </ErrorBoundary>
      </div>
      <div className="no-print" style={{textAlign:"center",fontSize:11,color:"var(--text-dim)",padding:"6px 0 16px"}}>
        {APP_NAME} · <span dir="ltr">نسخه {toFA(APP_VERSION)}</span>{isGuestMode()&&" · حالت مهمان"}
      </div>
      </div>

      {isGuestMode()&&(
        <div data-testid="guest-banner" className="no-print" role="status" style={{position:"fixed",top:0,left:0,right:0,height:36,zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",gap:isMobile?8:14,background:"linear-gradient(90deg,#7f1d1d,#dc2626 50%,#7f1d1d)",color:"#fff",borderBottom:"1px solid #fca5a5",padding:"0 10px",fontSize:12,boxSizing:"border-box",whiteSpace:"nowrap",overflow:"hidden"}}>
          <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>🧪 <b>حالت مهمان</b>{!isMobile&&" — داده‌ها آزمایشی‌اند و ذخیره دائمی ندارند"}</span>
          <button data-testid="guest-reset" onClick={()=>{if(window.confirm("داده‌های آزمایشی پاک و دوباره با نمونهٔ اولیه ساخته شود؟"))resetGuestData();}} style={{...BTN("#ffffff26","#fff"),padding:"3px 10px",fontSize:11,border:"1px solid #ffffff55",flexShrink:0}}>{isMobile?"بازنشانی":"بازنشانی نمونه"}</button>
          <button data-testid="guest-exit" onClick={()=>exitGuestMode()} style={{...BTN("#fff","#991b1b"),padding:"3px 10px",fontSize:11,fontWeight:700,flexShrink:0}}>{isMobile?"خروج":"خروج از حالت مهمان"}</button>
        </div>)}
      <IntegrityBanner/>
      <OfflineCapsule isMobile={isMobile} onOpen={openSyncCenter}/>
      <ErrorToast isMobile={isMobile} onOpen={openErrorLog}/>
      <UploadsToast isMobile={isMobile} onOpen={()=>selectTab("uploads")}/>
      {searchOpen&&<CafindPalette onGo={goSearch} onClose={()=>setSearchOpen(false)}/>}
      <ReminderWatcher isMobile={isMobile} onOpen={()=>selectTab("notes")}/>
      <VoiceAssistant getContext={voiceContext} deps={voiceDeps} isMobile={isMobile} navSlot={isMobile?navMicSlot:null} store={VOICE_STORE} format={VOICE_FORMAT}/>

      {/* ── PHONE: floating quick-sale button + bottom navigation + «more» sheet ── */}
      {isMobile&&!menuOpen&&(
        <button className="no-print" data-testid="sale-fab" onClick={()=>setQuickServiceOpen(true)} style={{position:"fixed",left:16,bottom:80,zIndex:119,background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:28,padding:"13px 18px",display:"flex",alignItems:"center",gap:8,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 8px 24px #7c3aed66"}}>
          <Icon name="Plus" size={20}/>فروش یکپارچه
        </button>
      )}
      {isMobile&&(
        <nav className="no-print m-bottom-nav" style={{position:"fixed",bottom:0,left:0,right:0,height:68,background:"var(--bg-card)",borderTop:"1px solid var(--border)",display:"flex",zIndex:120,paddingBottom:"env(safe-area-inset-bottom)"}}>
          {BOTTOM_NAV.map((t,ti)=>{
            const on=activeTab===t.key&&!menuOpen;
            return(
              <React.Fragment key={t.key}>
              {ti===3&&<div ref={setNavMicSlot} data-testid="nav-mic-slot" style={{flex:"0 0 74px",position:"relative"}}/>}
              <button className={on?"tab-active":""} data-testid={`bnav-${t.key}`} onClick={()=>selectTab(t.key)} style={{flex:1,minWidth:0,background:"transparent",border:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",color:on?navActiveFg:"var(--text-muted)",fontFamily:"inherit",fontSize:11,fontWeight:on?700:500,position:"relative"}}>
                <span className="m-pill" style={{width:46,height:30,borderRadius:15,display:"flex",alignItems:"center",justifyContent:"center",background:on?navActiveBg:"transparent"}}><Icon name={t.icon} size={21}/></span><span>{t.label}</span>
              </button>
              </React.Fragment>
            );
          })}
          {(()=>{
            const on=menuOpen||!BOTTOM_NAV.some(t=>t.key===activeTab);
            return(
              <button data-testid="nav-more" onClick={()=>setMenuOpen(o=>!o)} style={{flex:1,minWidth:0,background:"transparent",border:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",color:on?navActiveFg:"var(--text-muted)",fontFamily:"inherit",fontSize:11,fontWeight:on?700:500,position:"relative"}}>
                <span className="m-pill" style={{width:46,height:30,borderRadius:15,display:"flex",alignItems:"center",justifyContent:"center",background:on?navActiveBg:"transparent"}}><Icon name="MoreHorizontal" size={21}/></span><span>بیشتر</span>
              </button>
            );
          })()}
        </nav>
      )}
      {isMobile&&menuOpen&&(
        <div className="no-print" onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,background:"#00000088",zIndex:130}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"absolute",left:0,right:0,bottom:0,background:"var(--bg-card)",borderRadius:"20px 20px 0 0",padding:"10px 14px 22px",maxHeight:"82vh",overflowY:"auto",boxShadow:"0 -10px 40px #0008"}}>
            <div style={{width:40,height:4,borderRadius:2,background:"var(--border)",margin:"2px auto 12px"}}/>
            <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:10,direction:"ltr",textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{userEmail}</div>
            <div style={{fontSize:10,color:"var(--text-dim)",marginTop:-6,marginBottom:10,textAlign:"right"}}>نسخه <span dir="ltr">{APP_VERSION}</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,paddingBottom:12,borderBottom:"1px solid var(--border)",marginBottom:12}}>
              {[
                {k:"inc",label:"درآمد",icon:"TrendingUp",color:"#4ade80",fn:()=>{setMenuOpen(false);openAdd("income");}},
                {k:"exp",label:"هزینه",icon:"TrendingDown",color:"#f87171",fn:()=>{setMenuOpen(false);openAdd("expense");}},
                {k:"theme",label:theme==="dark"?"روشن":"تیره",icon:theme==="dark"?"Sun":"Moon",color:"var(--text-secondary)",fn:()=>setTheme(theme==="dark"?"light":"dark")},
                {k:"calc",label:"ماشین‌حساب",icon:"Calculator",color:"var(--text-secondary)",fn:()=>{setMenuOpen(false);setCalcOpen(true);}},
                {k:"backup",label:"پشتیبان",icon:"Save",color:"var(--text-secondary)",fn:()=>{setMenuOpen(false);setBackupOpen(true);}},
                ...(SHOW_SERVER_SETTINGS?[{k:"server",label:"سرور",icon:"Plug",color:"var(--text-secondary)",fn:()=>{selectTab("settings");setSettingsTab("server");}}]:[]),
                {k:"profile",label:"پروفایل",icon:"User",color:"var(--text-secondary)",fn:()=>{selectTab("settings");setSettingsTab("profile");}},
                {k:"sync",label:"همگام‌سازی",icon:"RefreshCw",color:"var(--text-secondary)",fn:()=>{setMenuOpen(false);openSyncCenter();}},
                {k:"logout",label:"خروج",icon:"LogOut",color:"#f87171",fn:()=>{setMenuOpen(false);onLogout&&onLogout();}},
              ].map(b=>(
                <button key={b.k} onClick={b.fn} style={{background:"var(--bg-app)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 2px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,color:"var(--text-secondary)",fontSize:10,fontFamily:"inherit"}}>
                  <Icon name={b.icon} size={19} style={{color:b.color}}/><span>{b.label}</span>
                </button>
              ))}
            </div>
            {(()=>{
              const sections=navTree.map(n=>n.key?{label:"",keys:[n.key]}:{label:n.label,keys:n.keys});
              const rest=TABS.filter(t=>t.nav!=="bottom"&&t.nav!=="shop"&&(!t.orangeOnly||skin==="orange")&&!navTree.some(n=>n.key===t.key||(n.keys||[]).includes(t.key))).map(t=>t.key);
              const secs=[...sections,...(rest.length?[{label:"سایر",keys:rest}]:[]),{label:"",keys:["settings","about"]}];
              // merge consecutive label-less singles into one grid
              const out=[];secs.forEach(sc=>{const last=out[out.length-1];if(!sc.label&&last&&!last.label)last.keys.push(...sc.keys);else out.push({label:sc.label,keys:[...sc.keys]});});
              return out.map((sc,si)=>{
                const items=sc.keys.map(k=>TABS.find(t=>t.key===k)).filter(t=>t&&!BOTTOM_NAV.some(b=>b.key===t.key));
                if(!items.length)return null;
                return(<div key={si} style={{marginBottom:12}}>
                  {sc.label&&<div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",margin:"4px 4px 8px"}}>{sc.label}</div>}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {items.map(t=>{const on=tabOn(t);return(
                      <button key={t.key} className={on?"tab-active":""} data-testid={`mnav-${t.key}`} onClick={()=>selectTab(t.key)} style={{position:"relative",background:on?navActiveBg:"var(--bg-app)",border:on?"1px solid #60a5fa":"1px solid var(--border)",borderRadius:12,padding:"14px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:7,color:on?navActiveFg:"var(--text-secondary)",fontSize:12,fontWeight:on?700:500,fontFamily:"inherit"}}>
                        <Icon name={t.icon} size={22}/><span>{t.label}</span>{t.key==="inbox"&&<InboxBadge style={{position:"absolute",top:6,left:8}}/>}{t.key==="uploads"&&<UploadsBadge style={{position:"absolute",top:6,left:8}}/>}
                      </button>);})}
                  </div>
                </div>);
              });
            })()}
          </div>
        </div>
      )}

      {/* TX Modal */}
      {txNotice&&(
        <div className="no-print" onClick={()=>setTxNotice(null)} style={{position:"fixed",bottom:isMobile?84:24,left:"50%",transform:"translateX(-50%)",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 16px",zIndex:400,boxShadow:"0 14px 40px #000b",fontSize:12,lineHeight:1.9,maxWidth:"92vw",cursor:"pointer"}}>
          {txNotice.map((t,i)=><div key={i} style={{color:t.startsWith("⚠️")?"#fbbf24":"#4ade80"}}>{t}</div>)}
        </div>
      )}
      {txModal&&(
        <div className="no-print" data-testid="tx-popup" onMouseDown={e=>{if(e.target===e.currentTarget)setTxModal(null);}} style={{position:"fixed",inset:0,zIndex:150,background:"#000000b3",display:"flex",justifyContent:"center",alignItems:"flex-start",overflowY:"auto",padding:isMobile?"12px 10px 24px":"32px 20px",boxSizing:"border-box"}}>
          <div role="dialog" aria-modal="true" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:isMobile?16:22,width:"100%",maxWidth:620,boxSizing:"border-box",margin:"auto",boxShadow:"0 24px 60px #000c"}}>
            <div style={{fontSize:17,fontWeight:700,marginBottom:18,color:txModal.type==="income"?"#4ade80":"#f87171"}}>{txModal.editId?"✏️ ویرایش":(txModal.type==="income"?"💰 ثبت درآمد":"💸 ثبت هزینه")}</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>

              {/* Income: smart category selector from tariff */}
              {txModal.type==="income" ? (
                <>
                  <div>
                    <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:6}}>دسته‌بندی خدمت</div>
                    <SearchableSelect
                      options={INCOME_CATEGORY_OPTIONS}
                      value={form.category}
                      placeholder="جستجوی خدمت..."
                      onChange={val=>{
                        const autoPrice=TARIFF_PRICE_MAP[val];
                        setForm(f=>({
                          ...f,
                          category:val,
                          amount: val==="مبلغ دلخواه" ? "" : (autoPrice>0?String(autoPrice):f.amount)
                        }));
                      }}
                    />
                  </div>

                  {/* Show auto-price hint */}
                  {form.category && TARIFF_PRICE_MAP[form.category]>0 && (
                    <div style={{background:"#052e16",border:"1px solid #16a34a44",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#4ade80",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>✅ نرخ تعرفه به‌صورت خودکار درج شد</span>
                      <span style={{fontWeight:700}}>{fmtM(TARIFF_PRICE_MAP[form.category])}</span>
                    </div>
                  )}

                  {!txModal.editId&&(()=>{
                    const dc=form.category&&form.category.includes(" > ")?form.category.split(" > ")[1]:form.category;
                    const rs=dc?recipesForLine({category:dc,desc:dc},getRecipes()):[];
                    if(!rs.length)return null;
                    const q=Number(form.qty)>0?Number(form.qty):1;
                    const inv=lsRead(INV_STORAGE_KEY,null)||DEFAULT_INVENTORY;
                    const us=recipeUsageList({category:dc,desc:dc},q,getRecipes(),inv);
                    return(
                      <div style={{background:"#052e16",border:"1px solid #16a34a44",borderRadius:8,padding:"10px 12px"}}>
                        <label style={{fontSize:13,color:"#4ade80"}}>🧪 تعداد / مقدار (برای کسر خودکار از انبار)
                          <input type="number" min="1" step="any" value={form.qty||"1"} data-testid="tx-qty" onChange={e=>{const v=e.target.value;const pr=TARIFF_PRICE_MAP[form.category];setForm(f=>({...f,qty:v,amount:pr>0&&Number(v)>0?String(pr*Number(v)):f.amount}));}} style={INP}/>
                        </label>
                        <div style={{fontSize:11,color:"#86efac",marginTop:6,lineHeight:1.8}}>کسر می‌شود: {us.map(u=>`${fmtQty(u.qty)} ${u.item.unit} ${u.item.name}`).join("، ")}</div>
                      </div>
                    );
                  })()}

                  {/* Amount field - always shown, auto-filled or manual */}
                  <label style={{fontSize:13,color:"var(--text-secondary)"}}>
                    مبلغ (ریال){form.category==="مبلغ دلخواه"?" — وارد کنید":form.category&&TARIFF_PRICE_MAP[form.category]>0?" — قابل ویرایش":""}
                    <input
                      type="number"
                      value={form.amount}
                      onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                      placeholder="مبلغ به ریال..."
                      style={{...INP, borderColor: form.category==="مبلغ دلخواه"?"#2563eb":"var(--border)"}}
                    />
                  </label>
                </>
              ) : (
                /* Expense: simple category + amount */
                <>
                  <div>
                    <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:6}}>دسته‌بندی</div>
                    <SearchableSelect
                      options={categories[txModal.type].map(c=>({value:c,label:c,group:null}))}
                      value={form.category}
                      placeholder="جستجوی دسته‌بندی هزینه..."
                      onChange={val=>setForm(f=>({...f,category:val}))}
                    />
                  </div>
                  <label style={{fontSize:13,color:"var(--text-secondary)"}}>مبلغ (ریال)
                    <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="مبلغ به ریال..." style={INP}/>
                  </label>
                </>
              )}

              <div data-testid="tx-method">
                <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:6}}>{txModal.type==="income"?"روش دریافت":"روش پرداخت"}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {TX_METHODS.map(k=>{const on=!form.split&&(form.method||"cash")===k;return <button key={k} data-testid={"txm-"+k} onClick={()=>setForm(f=>({...f,split:false,method:k}))} style={{...BTN(on?(txModal.type==="income"?"#16a34a":"#dc2626"):"var(--bg-app)",on?"#fff":"var(--text-secondary)"),padding:"7px 12px",fontSize:12,border:"1px solid var(--border)"}}>{payIcon(k)} {payLabel(k)}</button>;})}
                  {!txModal.editId&&<button data-testid="txm-split" onClick={()=>setForm(f=>({...f,split:!f.split,parts:f.split?f.parts:{cash:f.amount?String(f.amount):""}}))} style={{...BTN(form.split?"#7c3aed":"var(--bg-app)",form.split?"#fff":"var(--text-secondary)"),padding:"7px 12px",fontSize:12,border:"1px solid var(--border)"}}>✂️ تقسیم</button>}
                </div>
                {form.split&&!txModal.editId&&(()=>{const sum=TX_METHODS.reduce((a,k)=>a+(Number((form.parts||{})[k])||0),0);const diff=(Number(form.amount)||0)-sum;return(
                  <div style={{background:"var(--bg-app)",borderRadius:10,padding:10,marginTop:8}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
                      {TX_METHODS.map(k=><label key={k} style={{fontSize:11,color:"var(--text-muted)"}}>{payIcon(k)} {payLabel(k)}<input data-testid={"part-"+k} type="number" value={(form.parts||{})[k]||""} onChange={e=>setForm(f=>({...f,parts:{...(f.parts||{}),[k]:e.target.value}}))} placeholder="۰" style={{...INP,marginTop:3,padding:"7px 10px",fontSize:13}}/></label>)}
                    </div>
                    <div style={{fontSize:11,marginTop:6,color:diff===0?"#4ade80":"#fbbf24"}}>{diff===0?"✓ جمع روش‌ها با مبلغ کل برابر است":diff>0?`${fmtM(diff)} هنوز تقسیم نشده`:`${fmtM(-diff)} بیشتر از مبلغ کل`}</div>
                  </div>);})()}
              </div>
              {txErr&&<div style={{background:"#450a0a",color:"#fca5a5",borderRadius:9,padding:"8px 12px",fontSize:12}}>{txErr}</div>}

              <label style={{fontSize:13,color:"var(--text-secondary)"}}>توضیحات<input value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="جزئیات..." style={INP}/></label>
              <label style={{fontSize:13,color:"var(--text-secondary)"}}>تاریخ<JalaliPicker value={form.date} onChange={d=>setForm(f=>({...f,date:d}))}/></label>
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={saveTx} style={{...BTN(txModal.type==="income"?"#16a34a":"#dc2626"),flex:1,padding:11,fontSize:14}}>ذخیره</button>
              <button onClick={()=>setTxModal(null)} style={{...BTN("var(--border)","var(--text-primary)"),flex:1,padding:11,fontSize:14}}>انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Void TX Confirm */}
      {delConfirm&&<VoidModal z={150} title="ابطال تراکنش" desc="تراکنش از جمع‌ها و گزارش‌ها خارج می‌شود ولی با دلیل ابطال در بایگانی می‌ماند و هر وقت لازم شد قابل بازگردانی است." onConfirm={(r)=>delTx(delConfirm,r)} onClose={()=>setDelConfirm(null)}/>}

      {calcOpen&&<Calculator onClose={()=>setCalcOpen(false)}/>}
      {backupOpen&&<BackupModal onClose={()=>setBackupOpen(false)}/>}
      {quickServiceOpen&&<SaleWizard popup mode={saleMode} prefill={voiceSalePrefill} onClose={()=>{setQuickServiceOpen(false);setVoiceSalePrefill(null);setSaleMode("all");}} onNavigate={selectTab}/>}
      {productSaleOpen&&<ProductSaleModal onClose={()=>setProductSaleOpen(false)} onNavigate={selectTab}/>}
      <ReasonHost/>
    </div>
  );
}
