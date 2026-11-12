// Generated from App.jsx by the module split (v1.50.0). Section: links
import React, { useState, useEffect, useRef } from "react";
import { toFA } from "../core/format.js";
import { BTN, INP, LINK_CAT_ICON } from "../core/constants.js";
import { createId, emitDataChange, lsRead, lsWrite } from "../domain/sales.jsx";
import { Empty } from "../components/ui.jsx";


// ══════════════════════════════════════════════════════════════════
// لینک‌های کاربردی (سامانه‌های دولتی و ابزارهای روزانه کافی‌نت)
// ══════════════════════════════════════════════════════════════════
const LINKS_KEY="cafenet_links";

const LINK_CATS=["خدمات دولتی","مالیات و کسب‌وکار","قضایی و انتظامی","پست و حمل","آموزش و آزمون","ارتباطات و اینترنت","بانک و پرداخت","سلامت و بیمه","بازار و اقتصاد","امنیت و فناوری","ابزار روزانه"];

const DEFAULT_LINKS=[
  {id:"d_iran",title:"پورتال ملی ایران (iran.ir)",url:"https://iran.ir",desc:"درگاه ملی خدمات و اطلاعات",cat:"خدمات دولتی"},
  {id:"d_mygov",title:"میز خدمت دولت",url:"https://my.gov.ir",desc:"ورود یکپارچه به خدمات الکترونیک دولت",cat:"خدمات دولتی"},
  {id:"d_sabt",title:"سازمان ثبت احوال",url:"https://www.sabteahval.ir",desc:"شناسنامه، کارت ملی و استعلام‌ها",cat:"خدمات دولتی"},
  {id:"d_tamin",title:"تأمین اجتماعی",url:"https://www.tamin.ir",desc:"خدمات بیمه و بازنشستگی",cat:"خدمات دولتی"},
  {id:"d_rrk",title:"روزنامه رسمی",url:"https://www.rrk.ir",desc:"آگهی‌های ثبت شرکت و قوانین",cat:"خدمات دولتی"},
  {id:"d_tax",title:"سازمان امور مالیاتی",url:"https://tax.gov.ir",desc:"اظهارنامه و خدمات مالیاتی",cat:"مالیات و کسب‌وکار"},
  {id:"d_moadian",title:"سامانه مودیان مالیاتی",url:"https://tp.tax.gov.ir",desc:"صورتحساب الکترونیک و کارپوشه مودیان",cat:"مالیات و کسب‌وکار"},
  {id:"d_enamad",title:"اینماد",url:"https://enamad.ir",desc:"نماد اعتماد الکترونیکی",cat:"مالیات و کسب‌وکار"},
  {id:"d_shaparak",title:"شاپرک",url:"https://www.shaparak.ir",desc:"پذیرندگان و کارتخوان",cat:"مالیات و کسب‌وکار"},
  {id:"d_nic",title:"ثبت دامنه ir",url:"https://www.nic.ir",desc:"ثبت و تمدید دامنه",cat:"مالیات و کسب‌وکار"},
  {id:"d_epolice",title:"پلیس +۱۰",url:"https://www.epolice.ir",desc:"خدمات الکترونیک پلیس",cat:"قضایی و انتظامی"},
  {id:"d_cyber",title:"پلیس فتا",url:"https://www.cyberpolice.ir",desc:"گزارش جرائم رایانه‌ای",cat:"قضایی و انتظامی"},
  {id:"d_adl",title:"قوه قضاییه",url:"https://www.adliran.ir",desc:"درگاه خدمات قضایی",cat:"قضایی و انتظامی"},
  {id:"d_sana",title:"سامانه ثنا",url:"https://sana.adliran.ir",desc:"ابلاغ الکترونیک قضایی",cat:"قضایی و انتظامی"},
  {id:"d_rahvar",title:"راهور ۱۲۰",url:"https://www.rahvar120.ir",desc:"خلافی و خدمات راهنمایی و رانندگی",cat:"قضایی و انتظامی"},
  {id:"d_post",title:"شرکت ملی پست",url:"https://post.ir",desc:"خدمات پستی",cat:"پست و حمل"},
  {id:"d_track",title:"رهگیری مرسوله پستی",url:"https://tracking.post.ir",desc:"پیگیری با کد رهگیری",cat:"پست و حمل"},
  {id:"d_zip",title:"استعلام کدپستی",url:"https://map.post.ir",desc:"جستجوی کدپستی و آدرس",cat:"پست و حمل"},
  {id:"d_sanjesh",title:"سازمان سنجش",url:"https://www.sanjesh.org",desc:"کنکور و آزمون‌های سراسری",cat:"آموزش و آزمون"},
  {id:"d_azmoon",title:"دانشگاه آزاد (آزمون)",url:"https://azmoon.org",desc:"ثبت‌نام آزمون‌های دانشگاه آزاد",cat:"آموزش و آزمون"},
  {id:"d_pnu",title:"دانشگاه پیام نور",url:"https://www.pnu.ac.ir",desc:"ثبت‌نام و خدمات آموزشی",cat:"آموزش و آزمون"},
  {id:"d_uast",title:"دانشگاه جامع علمی‌کاربردی",url:"https://www.uast.ac.ir",desc:"ثبت‌نام و خدمات آموزشی",cat:"آموزش و آزمون"},
  {id:"d_medu",title:"وزارت آموزش و پرورش",url:"https://www.medu.ir",desc:"خدمات دانش‌آموزی و فرهنگیان",cat:"آموزش و آزمون"},
  {id:"d_msrt",title:"وزارت علوم",url:"https://www.msrt.ir",desc:"خدمات آموزش عالی",cat:"آموزش و آزمون"},
  {id:"d_time",title:"تقویم و تبدیل تاریخ (time.ir)",url:"https://www.time.ir",desc:"تقویم شمسی، مناسبت‌ها و تبدیل تاریخ",cat:"ابزار روزانه"},
  {id:"d_tgju",title:"قیمت ارز و طلا (tgju)",url:"https://www.tgju.org",desc:"نرخ لحظه‌ای ارز، سکه و طلا",cat:"ابزار روزانه"},
  {id:"d_ilovepdf",title:"ابزار PDF (iLovePDF)",url:"https://www.ilovepdf.com",desc:"ادغام، تقسیم و تبدیل PDF",cat:"ابزار روزانه"},
  {id:"d_speed",title:"تست سرعت اینترنت",url:"https://www.speedtest.net",desc:"سنجش سرعت خط کافی‌نت",cat:"ابزار روزانه"},
  {id:"d_ict",title:"وزارت ارتباطات و فناوری اطلاعات",url:"https://ict.gov.ir",desc:"مقررات و خدمات حوزه ICT",cat:"ارتباطات و اینترنت"},
  {id:"d_cra",title:"سازمان تنظیم مقررات و ارتباطات رادیویی",url:"https://cra.ir",desc:"مجوزها و مقررات اپراتورها",cat:"ارتباطات و اینترنت"},
  {id:"d_tci",title:"مخابرات ایران",url:"https://tci.ir",desc:"خدمات تلفن ثابت و ADSL",cat:"ارتباطات و اینترنت"},
  {id:"d_shatel",title:"شاتل",url:"https://shatel.ir",desc:"اینترنت پرسرعت و سرویس‌های سازمانی",cat:"ارتباطات و اینترنت"},
  {id:"d_asiatech",title:"آسیاتک",url:"https://www.asiatech.ir",desc:"اینترنت و فیبر نوری",cat:"ارتباطات و اینترنت"},
  {id:"d_mci",title:"همراه اول",url:"https://mci.ir",desc:"شارژ، بسته اینترنت و خدمات سیم‌کارت",cat:"ارتباطات و اینترنت"},
  {id:"d_irancell",title:"ایرانسل",url:"https://irancell.ir",desc:"شارژ، بسته اینترنت و خدمات سیم‌کارت",cat:"ارتباطات و اینترنت"},
  {id:"d_rightel",title:"رایتل",url:"https://rightel.ir",desc:"شارژ و خدمات سیم‌کارت",cat:"ارتباطات و اینترنت"},
  {id:"d_bmi",title:"بانک ملی ایران",url:"https://bmi.ir",desc:"اینترنت‌بانک و خدمات بانکی",cat:"بانک و پرداخت"},
  {id:"d_mellat",title:"بانک ملت",url:"https://www.bankmellat.ir",desc:"اینترنت‌بانک و خدمات بانکی",cat:"بانک و پرداخت"},
  {id:"d_saderat",title:"بانک صادرات",url:"https://bsi.ir",desc:"اینترنت‌بانک و خدمات بانکی",cat:"بانک و پرداخت"},
  {id:"d_tejarat",title:"بانک تجارت",url:"https://tejaratbank.ir",desc:"اینترنت‌بانک و خدمات بانکی",cat:"بانک و پرداخت"},
  {id:"d_parsian",title:"بانک پارسیان",url:"https://www.parsian-bank.ir",desc:"اینترنت‌بانک و خدمات بانکی",cat:"بانک و پرداخت"},
  {id:"d_pasargad",title:"بانک پاسارگاد",url:"https://bpi.ir",desc:"اینترنت‌بانک و خدمات بانکی",cat:"بانک و پرداخت"},
  {id:"d_keshavarzi",title:"بانک کشاورزی",url:"https://bki.ir",desc:"اینترنت‌بانک و خدمات بانکی",cat:"بانک و پرداخت"},
  {id:"d_zarinpal",title:"زرین‌پال",url:"https://www.zarinpal.com",desc:"درگاه پرداخت اینترنتی",cat:"بانک و پرداخت"},
  {id:"d_idpay",title:"آیدی‌پی",url:"https://idpay.ir",desc:"درگاه پرداخت و کیف پول",cat:"بانک و پرداخت"},
  {id:"d_sejam",title:"سجام",url:"https://www.sejam.ir",desc:"ثبت‌نام و کد سهامداری بازار سرمایه",cat:"بانک و پرداخت"},
  {id:"d_codal",title:"کدال",url:"https://codal.ir",desc:"اطلاعات شرکت‌های بورسی",cat:"بانک و پرداخت"},
  {id:"d_tsetmc",title:"مدیریت فناوری بورس تهران",url:"http://www.tsetmc.com",desc:"قیمت لحظه‌ای بورس",cat:"بانک و پرداخت"},
  {id:"d_ihio",title:"بیمه سلامت ایران",url:"https://www.ihio.gov.ir",desc:"خدمات بیمه سلامت",cat:"سلامت و بیمه"},
  {id:"d_salamat",title:"سامانه سلامت وزارت بهداشت",url:"https://salamat.gov.ir",desc:"خدمات الکترونیک سلامت",cat:"سلامت و بیمه"},
  {id:"d_nobat",title:"نوبت‌دهی اینترنتی",url:"https://nobat.ir",desc:"نوبت پزشک و مراکز درمانی",cat:"سلامت و بیمه"},
  {id:"d_irimc",title:"سازمان نظام پزشکی",url:"https://irimc.org",desc:"استعلام پزشکان و مراکز",cat:"سلامت و بیمه"},
  {id:"d_mcls",title:"وزارت تعاون، کار و رفاه اجتماعی",url:"https://mcls.gov.ir",desc:"خدمات کار و بیمه‌بیکاری",cat:"خدمات دولتی"},
  {id:"d_ilenc",title:"ثبت شرکت‌ها",url:"https://ilenc.ir",desc:"ثبت و تغییرات شرکت",cat:"مالیات و کسب‌وکار"},
  {id:"d_ssaa",title:"سازمان ثبت اسناد و املاک",url:"https://www.ssaa.ir",desc:"اسناد، املاک و استعلام‌ها",cat:"مالیات و کسب‌وکار"},
  {id:"d_ntsw",title:"سامانه جامع تجارت",url:"https://www.ntsw.ir",desc:"کارت بازرگانی و ثبت سفارش",cat:"مالیات و کسب‌وکار"},
  {id:"d_mimt",title:"وزارت صنعت، معدن و تجارت",url:"https://www.mimt.gov.ir",desc:"مجوزها و خدمات صنفی",cat:"مالیات و کسب‌وکار"},
  {id:"d_isiri",title:"سازمان ملی استاندارد",url:"https://www.isiri.gov.ir",desc:"استاندارد و علامت کیفیت",cat:"مالیات و کسب‌وکار"},
  {id:"d_irimo",title:"سازمان هواشناسی",url:"https://www.irimo.ir",desc:"پیش‌بینی وضعیت جوی",cat:"ابزار روزانه"},
  {id:"d_irantvto",title:"سازمان آموزش فنی‌وحرفه‌ای",url:"https://www.irantvto.ir",desc:"دوره‌ها و گواهینامه مهارت",cat:"آموزش و آزمون"},
  {id:"d_tvu",title:"دانشگاه فنی‌وحرفه‌ای",url:"https://www.tvu.ac.ir",desc:"ثبت‌نام و خدمات آموزشی",cat:"آموزش و آزمون"},
  {id:"d_cfu",title:"دانشگاه فرهنگیان",url:"https://www.cfu.ac.ir",desc:"ثبت‌نام و خدمات آموزشی",cat:"آموزش و آزمون"},
  {id:"d_saorg",title:"سازمان امور دانشجویان",url:"https://www.saorg.ir",desc:"دانشجویان خارج از کشور و معادل‌سازی",cat:"آموزش و آزمون"},
  {id:"d_afta",title:"مرکز افتا",url:"https://afta.gov.ir",desc:"آگاهی‌رسانی امنیت فضای تبادل اطلاعات",cat:"امنیت و فناوری"},
  {id:"d_certcc",title:"مرکز ماهر",url:"https://www.certcc.ir",desc:"اطلاع‌رسانی و مقابله با حوادث سایبری",cat:"امنیت و فناوری"},
  {id:"d_virustotal",title:"VirusTotal",url:"https://www.virustotal.com",desc:"بررسی فایل و لینک مشکوک با چندین آنتی‌ویروس",cat:"امنیت و فناوری"},
  {id:"d_hibp",title:"Have I Been Pwned",url:"https://haveibeenpwned.com",desc:"بررسی لو رفتن ایمیل و رمز",cat:"امنیت و فناوری"},
  {id:"d_fast",title:"Fast.com",url:"https://fast.com",desc:"تست سریع سرعت دانلود",cat:"امنیت و فناوری"},
  {id:"d_p30",title:"پی‌سی‌دانلود (p30download)",url:"https://p30download.ir",desc:"نرم‌افزار و آموزش",cat:"امنیت و فناوری"},
  {id:"d_soft98",title:"سافت۹۸",url:"https://soft98.ir",desc:"دانلود نرم‌افزار",cat:"امنیت و فناوری"},
  {id:"d_bonbast",title:"بن‌بست",url:"https://bonbast.com",desc:"نرخ ارز بازار آزاد",cat:"بازار و اقتصاد"},
  {id:"d_alanchand",title:"علان‌چند",url:"https://alanchand.com",desc:"قیمت ارز، طلا و سکه",cat:"بازار و اقتصاد"},
  {id:"d_torob",title:"ترب",url:"https://torob.com",desc:"مقایسه قیمت لوازم و تجهیزات",cat:"بازار و اقتصاد"},
  {id:"d_digikala",title:"دیجی‌کالا",url:"https://www.digikala.com",desc:"خرید تجهیزات و لوازم مصرفی",cat:"بازار و اقتصاد"},
  {id:"d_emalls",title:"ایمالز",url:"https://emalls.ir",desc:"مقایسه قیمت فروشگاه‌ها",cat:"بازار و اقتصاد"},
  {id:"d_divar",title:"دیوار",url:"https://divar.ir",desc:"خرید و فروش تجهیزات دست‌دوم",cat:"بازار و اقتصاد"},
  {id:"d_virastar",title:"ویراستار",url:"https://virastar.ir",desc:"ویرایش خودکار متن فارسی",cat:"ابزار روزانه"},
  {id:"d_vajehyab",title:"واژه‌یاب",url:"https://www.vajehyab.com",desc:"فرهنگ لغت فارسی و انگلیسی",cat:"ابزار روزانه"},
  {id:"d_translate",title:"مترجم گوگل",url:"https://translate.google.com",desc:"ترجمه متن و سند",cat:"ابزار روزانه"},
  {id:"d_photopea",title:"Photopea",url:"https://www.photopea.com",desc:"ویرایش عکس آنلاین (شبیه فتوشاپ)",cat:"ابزار روزانه"},
  {id:"d_removebg",title:"Remove.bg",url:"https://www.remove.bg",desc:"حذف پس‌زمینه عکس (عکس پرسنلی)",cat:"ابزار روزانه"},
  {id:"d_iloveimg",title:"iLoveIMG",url:"https://www.iloveimg.com",desc:"فشرده‌سازی و تغییر اندازه عکس",cat:"ابزار روزانه"},
  {id:"d_convertio",title:"Convertio",url:"https://convertio.co",desc:"تبدیل فرمت فایل‌ها",cat:"ابزار روزانه"},
  {id:"d_canva",title:"Canva",url:"https://www.canva.com",desc:"طراحی کارت ویزیت، بنر و پوستر",cat:"ابزار روزانه"},
  {id:"d_neshan",title:"نشان",url:"https://neshan.org",desc:"نقشه و مسیریابی",cat:"ابزار روزانه"},
  {id:"d_balad",title:"بلد",url:"https://balad.ir",desc:"نقشه و مسیریابی",cat:"ابزار روزانه"},
  {id:"d_bale",title:"بله",url:"https://bale.ai",desc:"پیام‌رسان",cat:"ابزار روزانه"},
  {id:"d_rubika",title:"روبیکا",url:"https://rubika.ir",desc:"پیام‌رسان",cat:"ابزار روزانه"},
  {id:"d_eitaa",title:"ایتا",url:"https://eitaa.com",desc:"پیام‌رسان",cat:"ابزار روزانه"},
  {id:"d_aparat",title:"آپارات",url:"https://www.aparat.com",desc:"ویدیو و آموزش",cat:"ابزار روزانه"},
];

const DEFAULT_FAVS=["d_iran","d_mygov","d_time","d_tax"];

export function getLinksState(){
  const v=lsRead(LINKS_KEY,null)||{};
  return{custom:Array.isArray(v.custom)?v.custom:[],favs:Array.isArray(v.favs)?v.favs:DEFAULT_FAVS,hidden:Array.isArray(v.hidden)?v.hidden:[]};
}

export function allLinks(){const st=getLinksState();return[...DEFAULT_LINKS.filter(l=>!st.hidden.includes(l.id)),...st.custom];}

export function normUrl(u){u=String(u||"").trim();if(!u)return"";return /^https?:\/\//i.test(u)?u:"https://"+u;}

export function hostOf(u){try{return new URL(u).hostname.replace(/^www\./,"");}catch{return u;}}

export function openLink(u){try{window.open(u,"_blank","noopener,noreferrer");}catch{}}

// ── وارد کردن بوکمارک مرورگرها (HTML نتاسکیپ: Chrome/Edge/Firefox/Safari — و JSON کروم/فایرفاکس) ──
const BM_ROOTS=["bookmarks bar","bookmarks toolbar","other bookmarks","mobile bookmarks","bookmarks menu","favorites","favorites bar","favourites","menu","toolbar","unfiled","mobile","root","نوار نشانک‌ها","سایر نشانک‌ها","نشانک‌های دیگر","نوار علاقه‌مندی‌ها"];

function bmCat(path){for(let i=path.length-1;i>=0;i--){const n=String(path[i]||"").trim();if(n&&!BM_ROOTS.includes(n.toLowerCase()))return n;}return"وارد شده";}

function parseBookmarks(text,fileName){
  const out=[];const push=(title,url,path)=>{url=String(url||"").trim();if(!/^https?:\/\//i.test(url))return;out.push({title:String(title||"").trim()||hostOf(url),url,cat:bmCat(path)});};
  const t=String(text||"").replace(/^\uFEFF/,"").trim();
  if(t.startsWith("{")||t.startsWith("[")){
    const data=JSON.parse(t);
    const walk=(n,path)=>{
      if(!n||typeof n!=="object")return;
      if(Array.isArray(n)){n.forEach(x=>walk(x,path));return;}
      if(n.children){const nm=n.name||n.title||"";walk(n.children,[...path,nm]);return;}
      if(n.roots){Object.values(n.roots).forEach(r=>walk(r,path));return;}
      const url=n.url||n.uri;if(url)push(n.name||n.title,url,path);
    };
    walk(data,[]);
  }else{
    const doc=new DOMParser().parseFromString(t,"text/html");
    const walk=(node,path,state)=>{
      Array.from(node.children).forEach(ch=>{
        const tag=ch.tagName;
        if(tag==="H3")state.name=ch.textContent.trim();
        else if(tag==="A")push(ch.textContent,ch.getAttribute("href"),path);
        else if(tag==="DL"){const nm=state.name;state.name="";walk(ch,nm?[...path,nm]:path,{name:""});}
        else walk(ch,path,state);
      });
    };
    walk(doc.body||doc,[],{name:""});
  }
  return out;
}

export function LinksSection(){
  const [st,setSt]=useState(()=>getLinksState());
  const [q,setQ]=useState("");
  const [cat,setCat]=useState("all");
  const [form,setForm]=useState(null); // {id?,title,url,cat,desc}
  const [copied,setCopied]=useState(null);
  const [imp,setImp]=useState(null); // {file,items:[{title,url,cat,dup,sel}]}
  const [impErr,setImpErr]=useState("");
  const fileRef=useRef();
  const save=(n)=>{setSt(n);lsWrite(LINKS_KEY,n);emitDataChange();};
  const links=[...DEFAULT_LINKS.filter(l=>!st.hidden.includes(l.id)),...st.custom];
  const cats=[...new Set([...LINK_CATS,...st.custom.map(l=>l.cat).filter(Boolean)])];
  const shown=links.filter(l=>(cat==="all"||(cat==="fav"?st.favs.includes(l.id):l.cat===cat))&&(!q.trim()||`${l.title} ${l.desc||""} ${l.url}`.toLowerCase().includes(q.trim().toLowerCase())));
  const toggleFav=id=>save({...st,favs:st.favs.includes(id)?st.favs.filter(x=>x!==id):[...st.favs,id]});
  const copy=async(l)=>{try{await navigator.clipboard.writeText(l.url);}catch{}setCopied(l.id);setTimeout(()=>setCopied(null),1200);};
  const remove=l=>{if(String(l.id).startsWith("d_"))save({...st,hidden:[...st.hidden,l.id],favs:st.favs.filter(x=>x!==l.id)});else save({...st,custom:st.custom.filter(x=>x.id!==l.id),favs:st.favs.filter(x=>x!==l.id)});};
  const submit=()=>{
    const url=normUrl(form.url),title=form.title.trim();
    if(!title||!url)return;
    const item={id:form.id||"c_"+createId("link"),title,url,desc:(form.desc||"").trim(),cat:form.cat||"سایر"};
    save({...st,custom:form.id?st.custom.map(x=>x.id===form.id?item:x):[...st.custom,item]});setForm(null);
  };
  const normKey=u=>String(u||"").toLowerCase().replace(/^https?:\/\/(www\.)?/,"").replace(/\/+$/,"");
  const onFile=async(e)=>{
    const f=e.target.files&&e.target.files[0];e.target.value="";if(!f)return;setImpErr("");
    try{
      const items=parseBookmarks(await f.text(),f.name);
      if(items.length===0){setImp(null);setImpErr("در این فایل لینک معتبری پیدا نشد. فایل باید خروجی بوکمارک مرورگر (HTML یا JSON) باشد.");return;}
      const have=new Set(links.map(l=>normKey(l.url)));
      const seen=new Set();
      setImp({file:f.name,items:items.map((x,i)=>{const k=normKey(x.url);const dup=have.has(k)||seen.has(k);seen.add(k);return{...x,i,dup,sel:!dup};})});
    }catch{setImp(null);setImpErr("خواندن فایل ممکن نشد. مطمئن شوید فایل خروجی بوکمارک مرورگر است.");}
  };
  const importNow=()=>{
    const picked=imp.items.filter(x=>x.sel).map((x,i)=>({id:"c_"+createId("link")+"_"+i,title:x.title.slice(0,120),url:x.url,desc:"",cat:x.cat}));
    if(picked.length)save({...st,custom:[...st.custom,...picked]});
    setImp(null);setCat("all");
  };
  const impSel=imp?imp.items.filter(x=>x.sel).length:0;
  const chip=(k,l)=><button key={k} onClick={()=>setCat(k)} style={{...BTN(cat===k?"#2563eb":"var(--bg-card)",cat===k?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12,border:"1px solid var(--border)"}}>{l}</button>;
  return(
    <div data-testid="links-section">
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
        <input data-testid="links-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="جستجو در لینک‌ها..." style={{...INP,marginTop:0,flex:1,minWidth:200}}/>
        <input ref={fileRef} data-testid="bm-file" type="file" accept=".html,.htm,.json,text/html,application/json" onChange={onFile} style={{display:"none"}}/>
        <button data-testid="bm-import" onClick={()=>fileRef.current&&fileRef.current.click()} style={BTN("#7c3aed")}>📥 وارد کردن بوکمارک</button>
        <button data-testid="links-add" onClick={()=>setForm({title:"",url:"",cat:cats[0],desc:""})} style={BTN("#16a34a")}>+ لینک جدید</button>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {chip("all","همه")}{chip("fav","⭐ مورد علاقه")}{cats.map(c=>chip(c,`${LINK_CAT_ICON[c]||"🔗"} ${c}`))}
      </div>
      {impErr&&<div style={{background:"#450a0a",color:"#fca5a5",borderRadius:10,padding:"10px 14px",fontSize:12,marginBottom:12}}>{impErr}</div>}
      {imp&&(
        <div data-testid="bm-preview" style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:4}}>📥 وارد کردن از «{imp.file}»</div>
          <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:8}}>{toFA(imp.items.length)} لینک پیدا شد · {toFA(imp.items.filter(x=>x.dup).length)} تکراری (پیش‌فرض انتخاب نشده) · {toFA(impSel)} انتخاب‌شده. نام پوشه‌ی بوکمارک به‌عنوان دسته استفاده می‌شود.</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            <button onClick={()=>setImp({...imp,items:imp.items.map(x=>({...x,sel:true}))})} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"4px 10px",fontSize:11,border:"1px solid var(--border)"}}>انتخاب همه</button>
            <button onClick={()=>setImp({...imp,items:imp.items.map(x=>({...x,sel:!x.dup}))})} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"4px 10px",fontSize:11,border:"1px solid var(--border)"}}>فقط جدیدها</button>
            <button onClick={()=>setImp({...imp,items:imp.items.map(x=>({...x,sel:false}))})} style={{...BTN("var(--bg-app)","var(--text-secondary)"),padding:"4px 10px",fontSize:11,border:"1px solid var(--border)"}}>هیچ‌کدام</button>
          </div>
          <div style={{maxHeight:260,overflowY:"auto",background:"var(--bg-app)",borderRadius:9,padding:6}}>
            {imp.items.map(x=>(
              <label key={x.i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 6px",fontSize:12,cursor:"pointer",opacity:x.dup?.55:1}}>
                <input type="checkbox" checked={x.sel} onChange={()=>setImp({...imp,items:imp.items.map(y=>y.i===x.i?{...y,sel:!y.sel}:y)})}/>
                <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.title}</span>
                <span dir="ltr" style={{color:"var(--text-dim)",fontSize:10,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{hostOf(x.url)}</span>
                <span style={{color:"var(--accent-light)",fontSize:10,whiteSpace:"nowrap"}}>{x.cat}{x.dup?" · تکراری":""}</span>
              </label>))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}><button data-testid="bm-confirm" onClick={importNow} disabled={impSel===0} style={{...BTN("#16a34a"),opacity:impSel?1:.5}}>افزودن {toFA(impSel)} لینک</button><button onClick={()=>setImp(null)} style={BTN("var(--border)","var(--text-secondary)")}>لغو</button></div>
        </div>)}
      {form&&(
        <div style={{background:"var(--bg-card)",borderRadius:12,padding:16,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--accent-light)",marginBottom:8}}>{form.id?"ویرایش لینک":"لینک جدید"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
            <input data-testid="link-title" placeholder="عنوان" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={{...INP,marginTop:0}}/>
            <input data-testid="link-url" dir="ltr" placeholder="آدرس (مثلاً example.ir)" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} style={{...INP,marginTop:0,textAlign:"left"}}/>
            <input data-testid="link-cat" list="link-cats" placeholder="دسته" value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})} style={{...INP,marginTop:0}}/>
            <datalist id="link-cats">{cats.map(c=><option key={c} value={c}/>)}</datalist>
            <input placeholder="توضیح کوتاه (اختیاری)" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} style={{...INP,marginTop:0}}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}><button data-testid="link-save" onClick={submit} style={BTN("#2563eb")}>ذخیره</button><button onClick={()=>setForm(null)} style={BTN("var(--border)","var(--text-secondary)")}>لغو</button></div>
        </div>)}
      {shown.length===0?<Empty text="لینکی پیدا نشد" sub="جستجو یا دسته را تغییر دهید"/>:(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:12}}>
        {shown.map(l=>{const fav=st.favs.includes(l.id);const custom=!String(l.id).startsWith("d_");return(
          <div key={l.id} data-testid="link-card" style={{background:"var(--bg-card)",borderRadius:12,padding:"13px 15px",display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
              <div style={{fontSize:14,fontWeight:700}}>{LINK_CAT_ICON[l.cat]||"🔗"} {l.title}</div>
              <button onClick={()=>toggleFav(l.id)} title="مورد علاقه" style={{background:"none",border:"none",cursor:"pointer",fontSize:16,padding:0,opacity:fav?1:.35}}>⭐</button>
            </div>
            {l.desc&&<div style={{fontSize:11,color:"var(--text-muted)"}}>{l.desc}</div>}
            <div dir="ltr" style={{fontSize:11,color:"var(--text-dim)",textAlign:"right"}}>{hostOf(l.url)}</div>
            <div style={{display:"flex",gap:6,marginTop:"auto",flexWrap:"wrap"}}>
              <button onClick={()=>openLink(l.url)} style={{...BTN("#2563eb"),padding:"6px 14px",fontSize:12,flex:1}}>باز کردن ↗</button>
              <button onClick={()=>copy(l)} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"6px 10px",fontSize:12}}>{copied===l.id?"✓":"کپی"}</button>
              {custom&&<button onClick={()=>setForm({id:l.id,title:l.title,url:l.url,cat:l.cat,desc:l.desc||""})} style={{...BTN("var(--border)","var(--text-secondary)"),padding:"6px 10px",fontSize:12}}>✏️</button>}
              <button onClick={()=>remove(l)} title={custom?"حذف":"مخفی کردن"} style={{...BTN("#450a0a","#f87171"),padding:"6px 10px",fontSize:12}}>🗑️</button>
            </div>
          </div>);})}
      </div>)}
      {st.hidden.length>0&&<div style={{marginTop:14}}><button onClick={()=>save({...st,hidden:[]})} style={{...BTN("var(--bg-card)","var(--accent-light)"),border:"1px solid var(--border)",fontSize:12}}>↺ بازگرداندن {toFA(st.hidden.length)} لینک پیش‌فرض مخفی‌شده</button></div>}
      <div style={{fontSize:11,color:"var(--text-dim)",marginTop:14}}>لینک‌ها در مرورگر پیش‌فرض سیستم باز می‌شوند و باید اینترنت وصل باشد. آدرس‌ها را می‌توانید ویرایش یا لینک خودتان را اضافه کنید.</div>
    </div>
  );
}
