// Generated from App.jsx by the module split (v1.50.0). Section: constants



export const JM=["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];

export const JD=["ش","ی","د","س","چ","پ","ج"];

export const CURRENCY_KEY="cafenet_currency";

export const TX_KEY="cafenet_tx3";
export const OBL_KEY="cafenet_obligations";
export const EMP_KEY="cafenet_employees";
export const NOTES_KEY="cafenet_notes";
export const REMINDERS_KEY="cafenet_reminders";
export const REMINDERS_NOTIFIED_KEY="cafenet_reminders_notified";

export const COST_CATEGORY="هزینه مستقیم خدمات";

// ── فروش آنلاین ──────────────────────────────────────────────────
export const ONLINE_SHIP_CAT="هزینه ارسال (فروش آنلاین)";
export const ONLINE_FEE_CAT="کارمزد فروش آنلاین";
export const ONLINE_PLATFORMS=["سایت / فروشگاه اینترنتی","اینستاگرام","تلگرام","واتس‌اپ","ایتا / روبیکا","دیوار","باسلام","دیجی‌کالا","تماس تلفنی","سایر"];
export const ONLINE_CARRIERS=["پست","تیپاکس","چاپار","پیک موتوری","اسنپ‌باکس / اسنپ","ماهکس","تحویل حضوری","سایر"];
// وضعیت پیگیری سفارش آنلاین؛ «برگشت خورده» فروش را ابطال و موجودی را برمی‌گرداند
export const ONLINE_STATUSES=[
  {key:"new",label:"جدید",color:"#2563eb",order:"new"},
  {key:"preparing",label:"در حال آماده‌سازی",color:"#f59e0b",order:"inprogress"},
  {key:"shipped",label:"ارسال شد",color:"#8b5cf6",order:"completed"},
  {key:"delivered",label:"تحویل شد",color:"#16a34a",order:"delivered"},
  {key:"returned",label:"برگشت خورده",color:"#dc2626",order:null},
];

// Payment methods. "real" ones move money in (income); "credit" leaves the amount as customer debt;
// "free" waives the amount (no income, no debt).
export const PAYMENT_ACCOUNTS_KEY="cafenet_payment_accounts";

export const txMethod=t=>t.method||"cash";

// هزینه‌های خودکار مصرف مواد (کسر از انبار) پرداخت واقعی نیستند و در صندوق حساب نمی‌شوند
export const isRealCashTx=t=>!(t.type==="expense"&&(t.category==="هزینه مستقیم خدمات"||t.saleId!=null));

export const VOID_KINDS={sale:"فروش (فاکتور و درآمد)",tx:"تراکنش",invoice:"فاکتور",entry:"سند حسابداری"};

// ══════════════════════════════════════════════════════════════════
// CUSTOMER CLUB (باشگاه مشتریان) — everything is derived from recorded sales
// ══════════════════════════════════════════════════════════════════
export const CLUB_KEY="cafenet_club_config";

// ───────── CRM: customer profile statistics + golden customers ─────────
export const CRM_KEY="cafenet_crm_config";

export const BACKUP_STATUS_KEY="cafenet_backup_status";

// Flat map: category name -> default price (from TARIFF_DATA, built after TARIFF_DATA definition)
// We define it after TARIFF_DATA. Here we just note the base income cats.
export const BASE_INCOME_CATS=["اینترنت و کامپیوتر","پرینت و کپی","اسکن","فروش نوشیدنی","شارژ حساب","سایر درآمد","مبلغ دلخواه"];

export const DEFAULT_CATS={
  income:[...BASE_INCOME_CATS],
  expense:["برق","اینترنت (ISP)","اجاره","حقوق کارمند","تعمیر و نگهداری","خرید تجهیزات","نوشیدنی و مواد مصرفی","سایر هزینه"],
};

export const INP={display:"block",width:"100%",marginTop:6,background:"var(--bg-app)",color:"var(--text-primary)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box",fontFamily:"inherit"};

export const BTN=(bg,col="#fff",extra={})=>({background:bg,color:col,border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit",...extra});

export const WEEKDAYS_FA=["یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه"];

// ══════════════════════════════════════════════════════════════════
// CUSTOMERS SECTION (مشتریان)
// Shared storage key: "cafenet_customers" — also used by LedgerSection
// ══════════════════════════════════════════════════════════════════
export const CUSTOMERS_STORAGE_KEY = "cafenet_customers";

// ══════════════════════════════════════════════════════════════════
// ORDERS (سفارش‌ها) — mini CRM Kanban board
// ══════════════════════════════════════════════════════════════════
export const ORDERS_STORAGE_KEY="cafenet_orders";

export const ORDER_STATUSES=[
  {key:"new",label:"سفارش جدید",color:"#2563eb"},
  {key:"inprogress",label:"در حال انجام",color:"#f59e0b"},
  {key:"waiting_docs",label:"منتظر مدارک مشتری",color:"#dc2626"},
  {key:"completed",label:"تکمیل شده",color:"#16a34a"},
  {key:"delivered",label:"تحویل داده شده",color:"#64748b"},
];

export const LEDGER_STORAGE="cafenet_ledger2";

export const INV_PERIODS=[["7","۷ روز اخیر"],["30","۳۰ روز اخیر"],["90","۹۰ روز اخیر"],["all","کل دوره"]];

export const TOPUP_CAT="شارژ و اینترنت";

// ══════════════════════════════════════════════════════════════════
// گزارش‌های کاربردی کافی‌نت (فروش، سود، مشتری، خدمات، هزینه، سربه‌سر)
// ══════════════════════════════════════════════════════════════════
export const BE_KEY="cafenet_breakeven";

export const LINK_CAT_ICON={"خدمات دولتی":"🏛️","مالیات و کسب‌وکار":"🧾","قضایی و انتظامی":"⚖️","پست و حمل":"📮","آموزش و آزمون":"🎓","ابزار روزانه":"🧰","ارتباطات و اینترنت":"📡","بانک و پرداخت":"🏦","سلامت و بیمه":"🩺","بازار و اقتصاد":"🛒","امنیت و فناوری":"🛡️"};

// ══════════════════════════════════════════════════════════════════
// دستیار هوشمند — پاسخ به سؤال‌های فارسی روی داده‌های خود برنامه (بدون اینترنت)
// ══════════════════════════════════════════════════════════════════
export const AI_UNIT_KEY="cafenet_ai_unit";

// ══════════════════════════════════════════════════════════════════
// سیستم پیگیری هوشمند مشتری
// ══════════════════════════════════════════════════════════════════
export const FU_STATUSES=["منتظر مدرک","منتظر پاسخ سامانه","منتظر پرداخت","منتظر تماس مشتری","آماده تحویل","در حال انجام","سایر"];

export const FU_COL={overdue:"#f87171",today:"#fbbf24",future:"#4ade80",none:"#94a3b8",done:"#64748b"};

// ══════════════════════════════════════════════════════════════════
// INVOICE SECTION (فاکتور)
// ══════════════════════════════════════════════════════════════════
export const INV_STORAGE = "cafenet_invoices";

// ══════════════════════════════════════════════════════════════════
// INVENTORY (انبارداری)
// ══════════════════════════════════════════════════════════════════
export const INV_STORAGE_KEY="cafenet_inventory";

export const DEFAULT_INVENTORY=[
  {id:1,cat:"paper",name:"کاغذ A4 معمولی",qty:8,minQty:3,unit:"بسته"},
  {id:2,cat:"paper",name:"کاغذ A4 گلاسه",qty:2,minQty:2,unit:"بسته"},
  {id:3,cat:"cartridge",name:"کارتریج مشکی",qty:2,minQty:1,unit:"عدد"},
  {id:4,cat:"cartridge",name:"کارتریج رنگی",qty:1,minQty:1,unit:"عدد"},
  {id:5,cat:"accessories",name:"فلش ۳۲ گیگ",qty:5,minQty:2,unit:"عدد"},
];

export const DEFAULT_PRINT_COSTS={paperPerPage:8000,inkBWPerPage:15000,inkColorPerPage:45000,servicePerPage:10000};

// Best-effort tariff-based price suggestion for common combos (ریال per page)
export const PRINT_TARIFF_CAT="پرینت - اسکن - نمابر - تایپ - ایمیل";

export const INV_DASH_PERIODS=[["today","امروز"],["7","۷ روز اخیر"],["month","این ماه"],["all","کل دوره"]];

export const latinDigits=v=>String(v||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));

// ══════════════════════════════════════════════════════════════════
// وضعیت پرداخت، متن اشتراک‌گذاری، PDF
// ══════════════════════════════════════════════════════════════════
export const INV_STATE={
  draft:{label:"پیش‌نویس",color:"#64748b"},
  paid:{label:"پرداخت شده",color:"#16a34a"},
  partial:{label:"نیمه‌پرداخت",color:"#d97706"},
  unpaid:{label:"پرداخت نشده",color:"#dc2626"},
};

// ══════════════════════════════════════════════════════════════════
// TARIFF DATA (نرخنامه اتحادیه × ۰.۸۵) — DEFAULT / factory data.
// The live, user-editable copy is stored separately (see useTariffData
// below); this array is only the fallback used the first time the app
// runs, or after an explicit "reset to defaults".
// ══════════════════════════════════════════════════════════════════
export const DEFAULT_TARIFF_DATA=[
  {cat:"خدمات سیستم",items:[
    {id:1,name:"اینترنت - یک ربع",price:595000,note:"بدون احتساب حجم دانلود"},
    {id:2,name:"اینترنت - نیم ساعت",price:1020000,note:"بدون احتساب حجم دانلود"},
    {id:3,name:"اینترنت - یک ساعت",price:2040000,note:"بدون احتساب حجم دانلود"},
  ]},
  {cat:"ثبت‌نام اینترنتی",items:[
    {id:4,name:"ثبت‌نام اینترنتی (تا ۱۰ دقیقه)",price:3188000,note:"بعد از ۱۰ دقیقه هر ۱۰ دقیقه ۵۵۲،۵۰۰ ریال"},
  ]},
  {cat:"امور قضائی",items:[
    {id:5,name:"دریافت ابلاغیه قضایی",price:468000,note:"بدون احتساب پرینت"},
    {id:6,name:"نوبت‌دهی قضایی",price:1233000,note:"ناموفق: ۵۱۰،۰۰۰ ریال"},
    {id:7,name:"بازیابی رمز شخصی",price:468000},
    {id:8,name:"ثبت عدم سوء پیشینه",price:1190000,note:"پاسخ استعلام ۵۱۰،۰۰۰ ریال"},
    {id:9,name:"ثبت ثنا و احراز هویت",price:3188000,note:"بدون احتساب پرداخت"},
    {id:10,name:"پرداخت هزینه‌های آنلاین",price:680000,note:"بدون احتساب پرینت"},
    {id:11,name:"پیگیری پرونده قضایی آنلاین",price:978000},
  ]},
  {cat:"امور بیمه",items:[
    {id:12,name:"ثبت‌نام پروفایل تأمین اجتماعی",price:1020000},
    {id:13,name:"نامه کسر از اقساط بازنشستگان",price:1190000,note:"بدون احتساب پرینت"},
    {id:14,name:"انعقاد قرارداد بیمه تأمین اجتماعی",price:1615000,note:"بدون احتساب پرینت"},
    {id:15,name:"دریافت سوابق تأمین اجتماعی",price:510000,note:"بدون احتساب پرینت"},
    {id:16,name:"دریافت فیش حقوق / حکم بازنشستگی",price:510000,note:"بدون احتساب پرینت"},
    {id:17,name:"ثبت درخواست بیمه بیکاری",price:3400000,note:"بدون احتساب پرینت"},
    {id:18,name:"احراز هویت سامانه جامع کار",price:1360000,note:"بدون احتساب پرینت"},
    {id:19,name:"نام‌نویسی کارفرما در کارگاه (اولیه)",price:2550000,note:"بدون احتساب پرینت و اسکن"},
    {id:20,name:"نام‌نویسی نیروی کار با ثبت اولیه",price:1360000,note:"بدون احتساب پرینت و اسکن"},
    {id:21,name:"نام‌نویسی نیروی کار با سابقه بیمه",price:680000,note:"بدون احتساب پرینت و اسکن"},
    {id:22,name:"ارسال لیست بیمه تا دو نفر",price:2465000,note:"بدون احتساب پرینت"},
    {id:23,name:"ارسال لیست بیمه بالای ۱۰ نیرو",price:0,note:"توافقی"},
    {id:25,name:"پرداخت حق بیمه آنلاین",price:680000,note:"بدون احتساب پرینت"},
    {id:27,name:"اعتراض به بدهی‌های کارگاهی",price:2720000,note:"بدون احتساب پرینت و اسکن"},
    {id:28,name:"درخواست بازرسی مجدد",price:2040000,note:"بدون احتساب پرینت و اسکن"},
    {id:29,name:"هزینه ثبت بازرسی دفاتر قانونی",price:5440000,note:"بدون احتساب پرینت و اسکن"},
    {id:30,name:"ثبت درخواست بازنشستگی",price:2040000,note:"بدون احتساب پرینت و اسکن"},
    {id:31,name:"ثبت هدیه ازدواج / کمک هزینه ترحیم",price:1700000,note:"بدون احتساب پرینت و اسکن"},
    {id:35,name:"افزودن افراد تبعی (هر نفر)",price:808000,note:"بدون احتساب پرینت و اسکن"},
    {id:36,name:"ثبت کمیسیون پزشکی بازنشستگی",price:2720000,note:"بدون احتساب پرینت و اسکن"},
    {id:37,name:"کمک هزینه عینک / سمعک",price:1360000,note:"بدون احتساب پرینت و اسکن"},
  ]},
  {cat:"پرینت - اسکن - نمابر - تایپ - ایمیل",items:[
    {id:38,name:"پرینت لیزری سیاه‌وسفید A4",price:128000,note:"کاغذ معمولی"},
    {id:39,name:"پرینت لیزری سیاه‌وسفید A4 (دو رو)",price:170000,note:"کاغذ معمولی"},
    {id:40,name:"پرینت لیزری سیاه‌وسفید A5",price:81000,note:"کاغذ معمولی"},
    {id:41,name:"پرینت لیزری سیاه‌وسفید A3",price:255000,note:"کاغذ معمولی"},
    {id:42,name:"پرینت رنگی متن A4",price:213000,note:"کاغذ معمولی"},
    {id:43,name:"پرینت رنگی عکس A4",price:340000,note:"کاغذ معمولی"},
    {id:44,name:"پرینت رنگی عکس A5",price:298000,note:"کاغذ معمولی"},
    {id:45,name:"اسکن سیاه‌وسفید یا رنگی A4",price:170000,note:"A3 هر برگ ۲۳۸،۰۰۰"},
    {id:47,name:"ارسال نمابر بین‌شهری",price:255000,note:"از برگ دوم هر برگ ۱۲۷،۵۰۰"},
    {id:48,name:"ارسال نمابر شهری",price:170000,note:"از برگ دوم هر برگ ۱۲۷،۵۰۰"},
    {id:49,name:"دریافت نمابر",price:170000},
    {id:50,name:"تایپ ساده فوری (هر برگ ۱۸ سطر)",price:850000,note:"ویرایش توافقی"},
    {id:51,name:"تایپ تیتر مشکی A4 + پرینت",price:425000,note:"رنگی ۶۳۷،۵۰۰ ریال"},
    {id:52,name:"ایجاد ایمیل توسط اپراتور",price:850000},
    {id:53,name:"ارسال و دریافت ایمیل",price:468000,note:"بدون آپلود و دانلود فایل"},
    {id:54,name:"ایجاد هر صفحه پاورپوینت",price:340000,note:"ساده بدون محتواسازی"},
  ]},
  {cat:"ثبت‌نام‌های تخصصی",items:[
    {id:55,name:"ثبت‌نام سامانه میخک",price:3400000},
    {id:57,name:"ثبت‌نام دانشگاه آزاد (آموزشیار)",price:4080000,note:"بدون پرینت و اسکن و پرداخت"},
    {id:58,name:"ثبت‌نام دانشگاه پیام نور",price:4080000,note:"بدون پرینت و اسکن و پرداخت"},
    {id:59,name:"ثبت‌نام دانشگاه‌های دولتی (غیرحضوری)",price:7140000,note:"بدون پرینت و اسکن و پرداخت"},
    {id:60,name:"ثبت‌نام دانشگاه بر اساس سوابق تحصیلی",price:4080000},
    {id:61,name:"انتخاب رشته کنکور (تا ۲۵ کد)",price:2720000,note:"هر ۲۵ کد اضافه ۶۸۰،۰۰۰"},
    {id:62,name:"ویرایش کد انتخاب رشته",price:1360000},
    {id:63,name:"ثبت‌نام اولیه سامانه سخا",price:1360000,note:"بدون پرینت و پرداخت"},
    {id:64,name:"احراز نشانی پست",price:1615000},
    {id:65,name:"ثبت هر خدمت سخا",price:2040000,note:"بدون پرینت و پرداخت"},
    {id:66,name:"ثبت‌نام سامانه GICA",price:4080000},
    {id:67,name:"ثبت‌نام اولیه ستاد ایران",price:5440000},
    {id:68,name:"ثبت مزایده",price:5440000},
    {id:69,name:"ثبت مناقصه",price:10200000},
    {id:70,name:"ثبت خرید",price:4080000},
    {id:71,name:"ثبت‌نام پلمپ دفاتر قانونی",price:4080000},
    {id:72,name:"امضا با توکن (سایت ثبت من)",price:2720000,note:"هر امضا اضافه ۱،۴۴۵،۰۰۰"},
    {id:73,name:"امضا با پلتفرم نرم‌افزاری",price:6800000},
    {id:74,name:"راه‌اندازی توکن",price:6800000},
    {id:75,name:"درخواست انحصار وراثت",price:3188000},
  ]},
  {cat:"ثبت‌نام‌های عمومی",items:[
    {id:77,name:"ثبت‌نام وام ازدواج (هر نفر)",price:3400000},
    {id:78,name:"ثبت‌نام اولیه ایران‌خودرو / سایپا",price:3230000,note:"بدون پرینت و پرداخت"},
    {id:79,name:"انتخاب خودرو ایران‌خودرو / سایپا",price:1360000},
    {id:80,name:"ثبت‌نام مالیات نقل و انتقال خودرو",price:1700000},
    {id:81,name:"پرداخت خلافی",price:808000},
    {id:82,name:"احراز نشانی پست",price:1615000},
    {id:83,name:"نوبت‌دهی تعویض پلاک",price:2040000},
    {id:84,name:"تأییدیه تحصیلی",price:2210000},
    {id:85,name:"تأییدیه پستی",price:1148000},
    {id:86,name:"ثبت‌نام مسکن ملی",price:2720000,note:"هر فرد زیرمجموعه ۴۲۵،۰۰۰"},
    {id:87,name:"ثبت‌نام وام ودیعه مسکن",price:2720000},
    {id:88,name:"ثبت‌نام سامانه اسکان و املاک",price:2720000,note:"هر ملک اضافه ۱،۳۶۰،۰۰۰"},
    {id:89,name:"سامانه خودنویس (ثبت قرارداد مالک و مستأجر)",price:13600000},
    {id:90,name:"ثبت‌نام سند ملکی",price:6800000,note:"بدون اسکن و پرینت و پرداخت"},
    {id:91,name:"ثبت‌نام سجام",price:2040000},
    {id:92,name:"ثبت‌نام تهران من خودرو",price:2040000},
    {id:93,name:"ثبت‌نام یارانه سوخت وانت‌بار",price:4080000},
    {id:94,name:"بازیابی نام کاربری و رمز عبور",price:425000},
    {id:95,name:"ثبت‌نام کتب درسی",price:935000,note:"پرداخت با کارت مشتری"},
    {id:96,name:"ثبت‌نام مدارس نمونه دولتی",price:2040000},
    {id:97,name:"ثبت‌نام کارت ملی هوشمند",price:1615000,note:"پرداخت با کارت مشتری"},
    {id:98,name:"خرید و پرداخت اینترنتی",price:680000},
    {id:99,name:"دریافت فیش / قبوض / استعلام ساده",price:425000,note:"بدون پرینت"},
    {id:101,name:"استخراج مطلب از اینترنت (تا ۱۰ دقیقه)",price:1360000},
    {id:102,name:"دریافت فایل از شبکه اجتماعی",price:255000,note:"هر فایل اضافه ۶۸،۰۰۰"},
    {id:104,name:"رایت CD",price:468000,note:"بدون CD خام"},
    {id:105,name:"رایت DVD",price:680000,note:"بدون DVD خام"},
    {id:106,name:"ثبت‌نام کارت منزلت",price:2040000},
    {id:107,name:"ثبت‌نام وام بازنشستگان",price:1360000},
    {id:108,name:"ثبت اعتراض یارانه",price:1190000},
    {id:109,name:"ثبت‌نام بیمه ورزشی",price:2040000},
    {id:110,name:"سامانه ثبت من (هر خدمت)",price:2040000},
  ]},
  {cat:"خدمات مالیات",items:[
    {id:111,name:"ثبت‌نام درگاه ملی مالیاتی",price:680000},
    {id:112,name:"فراموشی رمز سامانه مالیاتی",price:468000},
    {id:113,name:"ثبت اعتراض مالیاتی (my.tax)",price:2040000},
    {id:115,name:"اظهارنامه گروه ۲",price:10200000},
    {id:116,name:"اظهارنامه عادی ماده ۹۵",price:7480000},
    {id:117,name:"اظهارنامه تبصره ۱۰۰ (بدون عملکرد)",price:2720000},
    {id:118,name:"اظهارنامه تبصره ۱۰۰",price:4845000},
    {id:119,name:"هر شریک در اظهارنامه",price:510000},
    {id:120,name:"اظهارنامه مستغلات (هر مالک)",price:5525000,note:"ملک اضافه ۲،۵۵۰،۰۰۰ - مستأجر اضافه ۹۳۵،۰۰۰"},
    {id:121,name:"اظهارنامه حقوقی غیرفعال",price:6800000},
    {id:124,name:"صدور فیش اظهارنامه",price:340000},
    {id:125,name:"اظهارنامه ارث (تا ۳ مورد ماترک)",price:4463000,note:"هر ماترک اضافه ۷۶۵،۰۰۰"},
    {id:127,name:"پرداخت قبض مالیات",price:553000},
    {id:128,name:"ثبت‌نام کد اقتصادی (کامل)",price:4760000},
    {id:129,name:"افزودن هر شریک در ثبت‌نام",price:893000},
    {id:131,name:"ثبت‌نام سامانه مودیان و کد یکتا",price:10200000},
    {id:132,name:"ارسال اظهارنامه ارزش افزوده",price:2380000},
    {id:133,name:"ارسال لیست معاملات فصلی (یک رکورد)",price:1615000},
    {id:134,name:"ثبت رکورد معاملات فصلی (مازاد)",price:595000},
    {id:135,name:"ارسال لیست مالیات حقوق (تا ۴ نفر)",price:2040000,note:"هر پرسنل اضافه ۶۸۰،۰۰۰"},
    {id:137,name:"ثبت و پرداخت مالیات خودرو / خانه لوکس",price:1828000},
    {id:138,name:"اعتراض به مالیات خودرو / خانه",price:1828000},
    {id:139,name:"ابلاغیه مالیاتی (هر ابلاغ)",price:723000},
    {id:141,name:"اظهارنامه مشاغل خودرویی",price:2040000},
    {id:142,name:"اظهارنامه ماده ۹۵ عدم فعالیت",price:4165000},
  ]},
  {cat:"خدمات بانکی",items:[
    {id:144,name:"ثبت‌نام سامانه بام",price:2168000},
    {id:145,name:"ثبت‌نام حساب ارزی",price:2635000},
    {id:147,name:"ثبت چک صیادی با پرینت",price:1020000},
    {id:148,name:"تأیید چک صیادی با پرینت",price:1020000},
    {id:149,name:"ثبت‌نام سامانه شمس",price:6120000},
    {id:150,name:"خرید و پرداخت اینترنتی",price:680000},
    {id:151,name:"افتتاح حساب مرآت رسالت",price:4080000},
    {id:152,name:"سفته الکترونیکی",price:2040000},
    {id:153,name:"ضمانت سفته الکترونیکی",price:2040000},
  ]},
  {cat:"خدمات مجوز فعالیت و پروانه کسب",items:[
    {id:154,name:"ورود به سامانه ملی مجوزها",price:1360000},
    {id:155,name:"درخواست احراز نشانی",price:1700000},
    {id:156,name:"استعلام گواهی ۱۸۶ / کارت پایان خدمت",price:1020000},
    {id:157,name:"درخواست بازدید اماکن (پلیس من)",price:2720000,note:"ثبت اعتراض ۱،۰۲۰،۰۰۰"},
    {id:158,name:"نوین اصناف - اشخاص حقیقی",price:4080000},
    {id:159,name:"هر شریک و مباشر",price:1700000},
    {id:160,name:"نوین اصناف - اشخاص حقوقی",price:6800000},
    {id:162,name:"ثبت‌نام کلاس اصناف تهران",price:3230000},
    {id:163,name:"ثبت‌نام صلاحیت بهداشتی (سامح)",price:4760000},
    {id:164,name:"تکمیل اطلاعات آموزش مداوم پزشکی",price:4080000},
    {id:165,name:"سامانه پاتمک",price:6375000},
    {id:166,name:"سامانه سپامک",price:8500000},
    {id:167,name:"عضویت نظام مهندسی",price:3400000},
    {id:168,name:"دریافت شناسه یکتا مجوزهای قدیمی",price:1615000},
    {id:171,name:"کارت سوخت",price:1700000},
  ]},
];

// ── Editable tariff data: persisted in localStorage, defaults to DEFAULT_TARIFF_DATA ──
export const TARIFF_STORAGE_KEY="cafenet_tariff_data";

export const TABS=[
  {key:"dashboard",icon:"LayoutDashboard",label:"داشبورد",nav:"main"},
  {key:"mgmt",icon:"LayoutGrid",label:"داشبورد مدیریتی",nav:"main",orangeOnly:true},
  // منوی «فروشگاه»: صفحه نیستند؛ هرکدام پنجرهٔ فروش را با حالت مشخص باز می‌کنند (saleMode)
  {key:"shop-all",icon:"Layers",label:"فروش یکپارچه",nav:"shop",saleMode:"all"},
  {key:"shop-services",icon:"Wrench",label:"فروش خدمات",nav:"shop",saleMode:"services"},
  {key:"shop-inperson",icon:"Store",label:"فروش حضوری",nav:"shop",saleMode:"inperson"},
  {key:"shop-online",icon:"Globe",label:"فروش آنلاین",nav:"shop",saleMode:"online"},
  {key:"miniapp-orders",icon:"Smartphone",label:"سفارش‌های مینی‌اپ",nav:"shop"},
  {key:"pos",icon:"Calculator",label:"صندوق",nav:"shop"},
  {key:"orders",icon:"ShoppingCart",label:"فروش",nav:"main"},
  {key:"topup",icon:"Smartphone",label:"فروش شارژ و اینترنت",nav:"shop"},
  {key:"invoice",icon:"FileText",label:"فاکتورها",nav:"main"},
  {key:"customers",icon:"Users",label:"مشتریان",nav:"main"},
  {key:"ledger",icon:"BookOpen",label:"حساب‌ها",nav:"main"},
  {key:"obligations",icon:"CalendarClock",label:"تعهدات",nav:"main"},
  {key:"audit",icon:"ShieldCheck",label:"حسابرسی و مرکز مالی",nav:"main"},
  {key:"calendar",icon:"CalendarDays",label:"تقویم رویدادها",nav:"main"},
  {key:"inbox",icon:"Megaphone",label:"اطلاعیه و تیکت",nav:"main"},
  {key:"uploads",icon:"QrCode",label:"دریافت فایل از مشتری",nav:"main"},
  {key:"notes",icon:"Bell",label:"یادداشت و یادآوری",nav:"main"},
  {key:"health",icon:"Activity",label:"سلامت کسب‌وکار",nav:"main"},
  {key:"inventory",icon:"Package",label:"انبار",nav:"main"},
  {key:"report",icon:"BarChart3",label:"گزارش‌ها",nav:"main"},
  {key:"transactions",icon:"ListChecks",label:"تراکنش‌ها",nav:"tools"},
  {key:"printscan",icon:"Printer",label:"فروش کپی و اسکن",nav:"shop"},
  {key:"tariff",icon:"Tags",label:"تعرفه",nav:"tools"},
  {key:"links",icon:"Link2",label:"لینک‌های کاربردی",nav:"tools"},
  {key:"dateconv",icon:"CalendarDays",label:"تبدیل تاریخ",nav:"tools"},
  {key:"settings",icon:"Settings",label:"تنظیمات",nav:"bottom"},
  {key:"about",icon:"Info",label:"درباره من",nav:"bottom"},
];

// Sidebar structure: top-level items and collapsible groups (menu → submenu)
// حالت‌های پنجرهٔ فروش (منوی فروشگاه):
//  all      — همهٔ اقلام (خدمات، چاپ/اسکن، شارژ و اینترنت، کالای انبار) + گزینهٔ فروش آنلاین
//  services — فقط خدمات، پرینت/کپی/اسکن، شارژ و بستهٔ اینترنت (بدون انبار)
//  inperson — فقط کالای انبار، فروش حضوری
//  online   — فقط کالای متصل به انبار، فروش آنلاین (پنل آنلاین همیشه فعال)
const _SM=({
  all:{label:"فروش یکپارچه",hint:"خدمات، چاپ و اسکن، شارژ و اینترنت و کالای انبار",pickers:["service","print","topup","stock"],manual:true,online:"optional"},
  services:{label:"فروش خدمات",hint:"فقط خدمات، شارژ و اینترنت، کپی و اسکن",pickers:["service","print","topup"],manual:true,online:"off"},
  inperson:{label:"فروش حضوری",hint:"فقط کالاهای انبار",pickers:["stock"],manual:false,online:"off"},
  online:{label:"فروش آنلاین",hint:"فقط کالاهای متصل به انبار",pickers:["stock"],manual:false,online:"forced"},
});
export const SALE_MODES=Object.freeze(Object.fromEntries(Object.entries(_SM).map(([k,v])=>[k,Object.freeze({...v,pickers:Object.freeze([...v.pickers])})])));
export const NAV_TREE=[
  {key:"dashboard"},
  {key:"mgmt",orangeOnly:true},
  {group:"shop",label:"فروشگاه",icon:"Store",keys:["shop-all","shop-services","shop-inperson","shop-online","miniapp-orders","pos","topup","printscan"]},
  {group:"accounting",label:"حسابداری",icon:"Wallet",keys:["orders","invoice","transactions","ledger","obligations","audit"]},
  {group:"manage",label:"مدیریت",icon:"Briefcase",keys:["customers","calendar","inbox","uploads","notes","health","inventory","report"]},
  {group:"tools",label:"ابزارها",icon:"Printer",keys:["tariff","links","dateconv"]},
];

// Bottom navigation on phones (the rest lives under «بیشتر»)
export const BOTTOM_NAV=[
  {key:"dashboard",icon:"LayoutDashboard",label:"خانه"},
  {key:"pos",icon:"Calculator",label:"صندوق"},
  {key:"orders",icon:"ShoppingCart",label:"فروش"},
  {key:"customers",icon:"Users",label:"مشتری"},
  {key:"report",icon:"BarChart3",label:"گزارش"},
];
