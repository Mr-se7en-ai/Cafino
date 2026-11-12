// تب «درباره من» — معرفی کوتاه کافینو (CAFINO)
import React, { useState } from "react";
import Icon from "../../components/Icon.jsx";
import { BTN } from "../core/constants.js";
import { APP_BRAND, APP_BUILD_DATE, APP_CHANGELOG, APP_NAME, APP_VERSION } from "../core/version.js";

const PARTS=[
  {k:"CAFE",fa:"کافی‌نت",color:"#38bdf8",text:"صندوق، سفارش و فروش، شارژ و اینترنت، پرینت و اسکن، تعرفهٔ خدمات و تقویم رویدادها."},
  {k:"FINANCE",fa:"مالی",color:"#4ade80",text:"درآمد و هزینه، فاکتور، دفتر حساب و بدهکار/بستانکار، چک و تعهدات، سود و زیان."},
  {k:"INFO",fa:"اطلاعات",color:"#fbbf24",text:"باشگاه و پیگیری مشتریان، انبار و موجودی، گزارش‌های مدیریتی و داشبورد زنده."},
];

const FEATURES=[
  ["🧾","فروش یکپارچه","یک فروش، همزمان سفارش، فاکتور، درآمد، حساب مشتری و کسر موجودی انبار را ثبت می‌کند."],
  ["📊","داشبورد مدیریتی","ویجت‌های قابل چیدمان از فروش، هزینه، سود امروز، مانده صندوق، بدهکاران و هشدارها."],
  ["🎙️","دستیار صوتی","ثبت سفارش یا فاکتور و پرسش از وضعیت کار با دستور صوتی فارسی."],
  ["👥","مشتریان و باشگاه","پروندهٔ مشتری، خلاصهٔ حساب، یادآور پیگیری و امتیاز باشگاه."],
  ["🔍","کافیند — جستجوی سراسری","یک جعبهٔ جستجو برای همهٔ برنامه: مشتری، فاکتور، انبار، حساب‌ها، تعهدات، یادآورها و حتی صفحه‌ها و تنظیمات. میانبر Ctrl+K."],
  ["✨","طراحی Fluent","ظاهر شیشه‌ای اکریلیک، نور Reveal و حرکت نرم به سبک مایکروسافت؛ از تنظیمات ظاهر قابل خاموش‌کردن است."],
  ["⏰","یادداشت و یادآوری","یادداشت‌های رنگی و یادآور با تاریخ شمسی، تکرار و تعویق؛ ثبت با دستور صوتی، ویجت داشبورد و اعلان حتی وقتی برنامه بسته است (با راه‌اندازی سرویس اعلان)."],
  ["📴","کار بدون اینترنت","همه‌چیز روی همین دستگاه ثبت می‌شود و با وصل شدن اینترنت، بدون تکرار، همگام می‌شود."],
  ["💾","پشتیبان‌گیری","خروجی کامل داده با بررسی صحت فایل، و بازیابی هر زمان لازم باشد."],
];

export function AboutPage(){
  const [open,setOpen]=useState(false);
  const row=(k,v)=><div style={{display:"flex",justifyContent:"space-between",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",fontSize:13}}><span style={{color:"var(--text-muted)"}}>{k}</span><span style={{fontWeight:600}}>{v}</span></div>;
  const card={background:"var(--bg-card)",borderRadius:14,padding:20};
  const h={fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:12,display:"flex",alignItems:"center",gap:8};
  return(
    <div data-testid="about-page" style={{display:"flex",flexDirection:"column",gap:14,maxWidth:920}}>
      <div style={{background:"linear-gradient(135deg,#1e3a8a,#2563eb 55%,#0ea5e9)",color:"#fff",borderRadius:16,padding:"22px 22px 18px"}}>
        <div style={{fontSize:26,fontWeight:800}}>{APP_BRAND.fa} <span style={{opacity:.6,fontWeight:400}}>|</span> <span dir="ltr" style={{display:"inline-block",letterSpacing:2}}>{APP_BRAND.en}</span></div>
        <div style={{fontSize:14,marginTop:4,opacity:.95}}>{APP_BRAND.tagline}</div>
        <div dir="ltr" style={{display:"inline-block",marginTop:12,fontSize:12,fontWeight:700,letterSpacing:1.4,background:"#ffffff24",borderRadius:20,padding:"4px 14px"}}>{APP_BRAND.meaning}</div>
      </div>

      <div style={card}>
        <div style={h}><Icon name="Info" size={17}/>کافینو چیست؟</div>
        <div style={{fontSize:13,lineHeight:2.1,color:"var(--text-secondary)"}}>
          کافینو یک برنامهٔ فارسی برای اداره‌کردن کافی‌نت از اول تا آخر است: از ثبت فروش روی صندوق تا فاکتور، حساب مشتری، انبار و گزارش سود و زیان. هدف ساده است؛ هر کاری فقط یک بار ثبت شود و بقیهٔ بخش‌ها خودکار به‌روز شوند.
        </div>
      </div>

      <div style={card}>
        <div style={h}>🔤 معنی نام</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:10}}>
          {PARTS.map(p=>(
            <div key={p.k} style={{background:"var(--bg-app)",borderRadius:12,padding:"12px 14px",borderTop:`3px solid ${p.color}`}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:6}}>
                <span dir="ltr" style={{fontSize:16,fontWeight:800,letterSpacing:1,color:p.color}}>{p.k}</span>
                <span style={{fontSize:12,color:"var(--text-muted)"}}>{p.fa}</span>
              </div>
              <div style={{fontSize:12,lineHeight:1.95,color:"var(--text-secondary)"}}>{p.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={h}>✨ امکانات اصلی</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10}}>
          {FEATURES.map(([ic,t,d])=>(
            <div key={t} style={{display:"flex",gap:10,background:"var(--bg-app)",borderRadius:12,padding:"11px 13px"}}>
              <span style={{fontSize:22,lineHeight:1.4}}>{ic}</span>
              <div><div style={{fontSize:13,fontWeight:700,marginBottom:3}}>{t}</div><div style={{fontSize:12,lineHeight:1.9,color:"var(--text-secondary)"}}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={h}>🔒 داده‌ها و امنیت</div>
        <ul style={{margin:0,paddingRight:18,fontSize:12.5,lineHeight:2.1,color:"var(--text-secondary)"}}>
          <li>داده‌ها روی همین دستگاه ذخیره می‌شوند و برنامه بدون اینترنت هم کار می‌کند.</li>
          <li>فایل‌ها و مدارک مشتریان رمزگذاری‌شده و با محدودیت حجم و مدت نگهداری ذخیره می‌شوند.</li>
          <li>برای امنیت بیشتر، به‌طور منظم از «پشتیبان‌گیری» فایل بگیرید و آن را بیرون از دستگاه نگه دارید.</li>
        </ul>
      </div>

      <div data-testid="about-version" style={card}>
        <div style={h}><Icon name="Info" size={17}/>درباره برنامه و نسخه</div>
        {row("نام برنامه",APP_NAME)}
        {row("معنی نام","CAFE + FINANCE + INFO")}
        {row("نسخه",<span dir="ltr">v{APP_VERSION}</span>)}
        {row("تاریخ انتشار",APP_BUILD_DATE)}
        {row("محل ذخیره داده‌ها","مرورگر / همین دستگاه (localStorage)")}
        <button data-testid="about-changelog" onClick={()=>setOpen(o=>!o)} style={{...BTN("var(--border)","var(--text-secondary)"),fontSize:12,marginTop:14}}>{open?"▾":"◂"} تغییرات نسخه‌ها</button>
        {open&&(
          <div data-testid="about-changelog-list" style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>
            {APP_CHANGELOG.map(c=>(
              <div key={c.v} style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 12px"}}>
                <div dir="ltr" style={{fontSize:12,fontWeight:700,textAlign:"right",marginBottom:4}}>v{c.v}</div>
                {c.items.map((t,i)=><div key={i} style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.9}}>• {t}</div>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
