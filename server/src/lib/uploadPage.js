// صفحهٔ عمومیِ ارسال فایل برای مشتری (QR → /u/<code>). یک HTML خودکفا؛ CSP با هش اسکریپت/استایل (بدون unsafe-inline برای اسکریپت و بدون style="").
// ویژگی‌ها: چند فایل، نام و حجم هر فایل، نوار پیشرفت، شمارش معکوس انقضای QR، کد پیگیری و «وضعیت ارسال» (دریافت‌شد/دیده‌شد/چاپ‌شد/انجام‌شد)
// که با رمز اختصاصی همان ارسال خوانده می‌شود؛ مشتری هیچ‌گاه فهرست یا فایل دیگران را نمی‌بیند.
import crypto from "node:crypto";

const CSS = String.raw`@font-face{font-family:Vazirmatn;font-style:normal;font-weight:400;font-display:swap;src:url(/u/assets/vazirmatn-400.woff2) format("woff2")}
@font-face{font-family:Vazirmatn;font-style:normal;font-weight:700;font-display:swap;src:url(/u/assets/vazirmatn-700.woff2) format("woff2")}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
:root{--bg:#fff7f0;--card:#fff;--ink:#2b1610;--mut:#7a5a4a;--bd:#f0d9c8;--ac:#e8590c;--ac2:#ff9a3c;--ok:#15803d;--err:#b91c1c;--warn:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#1c1109;--card:#2a1810;--ink:#fbeee2;--mut:#c9ab96;--bd:#4a3020;--ac:#ff9a3c;--ac2:#e8590c;--ok:#4ade80;--err:#f87171;--warn:#fbbf24}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Vazirmatn,Tahoma,"Segoe UI",system-ui,sans-serif;line-height:1.7;min-height:100vh;display:flex;justify-content:center;padding:16px}
main{width:100%;max-width:520px}
header{display:flex;align-items:center;gap:12px;margin:8px 4px 16px}
header svg,header .lg{width:52px;height:52px;flex:none}
header .lg{object-fit:contain;border-radius:12px;background:#fff;border:1px solid var(--bd);padding:3px}
.logos{display:flex;align-items:center;gap:8px;flex:none}.logos .sep{width:1px;height:34px;background:var(--bd)}
.shop{margin:-6px 4px 14px;font-size:13px;color:var(--mut);display:flex;flex-direction:column;gap:2px}.shop a{color:inherit;text-decoration:none;direction:ltr;unicode-bidi:plaintext}
body{font-weight:400}h1,.btn,.chip,.st,b{font-weight:700}
h1{font-size:19px;margin:0}header p{margin:0;color:var(--mut);font-size:13px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:18px;box-shadow:0 6px 24px #0001;margin-bottom:12px}
.notice{background:#fff3e6;color:#7c2d12;border:1px solid #fed7aa;border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:14px}
@media (prefers-color-scheme:dark){.notice{background:#3a2112;color:#fed7aa;border-color:#6b3a1e}}
.chip{display:inline-block;background:#ff9a3c22;color:var(--ac);border-radius:20px;padding:2px 12px;font-size:12.5px;font-weight:700;margin:0 0 10px}
label{display:block;font-size:13px;color:var(--mut);margin:12px 0 4px}
input[type=text],input[type=tel],textarea{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--bd);border-radius:12px;padding:10px 12px;min-height:44px}
textarea{min-height:64px;resize:vertical}
input:focus,textarea:focus,button:focus-visible{outline:3px solid #ff9a3c88;outline-offset:1px}
.drop{border:2px dashed var(--ac);border-radius:16px;padding:22px 12px;text-align:center;cursor:pointer;margin-top:6px;background:#ff9a3c14}
.drop.over{background:#ff9a3c33}.drop b{display:block;font-size:16px}.drop span{color:var(--mut);font-size:13px;white-space:pre-line}
.row{display:flex;gap:10px;margin-top:10px}
.btn{flex:1;font:inherit;font-weight:700;border:0;border-radius:14px;padding:12px 14px;min-height:48px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--ac2),var(--ac))}
.btn.alt{background:transparent;color:var(--ac);border:1.5px solid var(--ac)}
.btn:disabled{opacity:.5;cursor:not-allowed}
ul{list-style:none;margin:10px 0 0;padding:0}
li{display:flex;align-items:center;gap:8px;border:1px solid var(--bd);border-radius:12px;padding:8px 10px;margin-top:6px;font-size:14px}
li .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right}
li .s{color:var(--mut);font-size:12px;white-space:nowrap}
li button{border:0;background:transparent;color:var(--err);font-size:20px;line-height:1;cursor:pointer;min-width:32px;min-height:32px}
.st{font-size:11.5px;font-weight:700;border-radius:20px;padding:1px 9px;white-space:nowrap;background:#ff9a3c22;color:var(--warn)}
.st.seen{background:#60a5fa22;color:#2563eb}.st.printed{background:#a78bfa22;color:#7c3aed}.st.done{background:#34d39922;color:var(--ok)}.st.removed{background:#9ca3af22;color:var(--mut)}
@media (prefers-color-scheme:dark){.st.seen{color:#93c5fd}.st.printed{color:#c4b5fd}}
.bar{height:10px;border-radius:6px;background:var(--bd);overflow:hidden;margin-top:12px;display:none}.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--ac2),var(--ac));transition:width .15s}
.pct{font-size:12.5px;color:var(--mut);margin-top:4px;min-height:18px}
.msg{margin-top:12px;font-size:14px;min-height:20px}.msg.err{color:var(--err)}
.done{text-align:center;padding:10px 0}.done .tick{font-size:46px;color:var(--ok);line-height:1}.done .code{font-size:34px;font-weight:800;letter-spacing:4px;direction:ltr;margin:6px 0;color:var(--ac)}
.hide{display:none!important}.h2{margin:4px 0}.h3{margin:0 0 4px;font-size:15px}
.trk .code{font-size:20px;font-weight:800;letter-spacing:2px;direction:ltr;color:var(--ac)}
.trk .meta{color:var(--mut);font-size:12px}
footer{text-align:center;color:var(--mut);font-size:12px;margin:14px 0 4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`;

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="کافینو"><defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a3c"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="url(#ig)"/><g fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round"><path d="M219 171 A53 53 0 0 1 293 171"/><path d="M193 145 A89 89 0 0 1 319 145"/><path d="M168 120 A125 125 0 0 1 344 120"/></g><circle cx="256" cy="208" r="25" fill="#2b1610"/><path d="M286.9 472.8H247.0Q219.8 472.8 196.8 469.4Q173.7 466.0 156.8 457.5Q139.8 449.0 130.4 433.6Q121.0 418.2 121.0 394.2Q121.0 380.0 124.2 366.5Q127.3 353.0 132.1 341.4L170.1 355.8Q167.4 363.2 164.7 373.0Q161.9 382.8 161.9 391.7Q161.9 407.4 173.6 415.0Q185.3 422.6 204.6 424.9Q223.9 427.2 247.0 427.2H286.8Q312.1 427.2 324.7 423.6Q337.3 420.1 337.3 409.0Q337.3 403.8 329.6 396.9Q321.8 390.1 310.2 382.4Q298.6 374.8 286.6 367.3Q274.5 359.8 265.6 353.4Q259.2 348.7 255.7 340.8Q252.2 332.9 252.2 324.7Q252.2 315.9 256.3 308.1Q260.4 300.4 269.1 296.9L391.0 247.2V292.3L305.7 326.9Q326.9 339.6 343.2 351.6Q359.4 363.7 368.7 377.6Q378.1 391.5 378.1 409.7Q378.1 434.4 366.7 448.2Q355.3 461.9 334.8 467.4Q314.3 472.8 286.9 472.8Z" fill="#fff"/></svg>`;

const BODY = `<main>
<header><div class="logos"><img id="shopLogo" class="lg hide" alt="" width="52" height="52">${LOGO}</div><div><h1 id="cafe">…</h1><p id="sub">ارسال فایل برای چاپ یا کار روی آن — کافینو</p></div></header>
<div class="shop hide" id="shop"><div id="shopAddr" class="hide"></div><div id="shopTel" class="hide"></div></div>
<div class="card" id="mainCard">
<div id="closed" class="msg err hide" role="alert"></div>
<div id="notice" class="notice hide"></div>
<div id="exp" class="chip hide"></div>
<form id="form" class="hide" autocomplete="off" novalidate>
<div id="drop" class="drop" role="button" tabindex="0" aria-label="انتخاب فایل"><b>فایل‌ها را اینجا رها کنید یا برای انتخاب بزنید</b><span id="hint"></span></div>
<input id="pick" class="sr" type="file" multiple tabindex="-1" aria-hidden="true">
<input id="cam" class="sr" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true">
<div class="row"><button class="btn alt" id="camBtn" type="button">📷 عکس گرفتن</button></div>
<ul id="list" aria-live="polite"></ul>
<label for="name">نام شما (اختیاری)</label><input id="name" type="text" maxlength="60" autocomplete="name">
<label for="phone" id="phoneLbl">شمارهٔ موبایل (اختیاری)</label><input id="phone" type="tel" inputmode="tel" maxlength="16" autocomplete="tel" dir="ltr">
<label for="note">توضیح (مثلاً تعداد نسخه، رنگی/سیاه‌وسفید، دورو/یک‌رو)</label><textarea id="note" maxlength="300"></textarea>
<div class="bar" id="bar"><i></i></div><div class="pct" id="pct"></div>
<div id="msg" class="msg" role="alert"></div>
<div class="row"><button class="btn" id="send" type="submit" disabled>ارسال</button></div>
</form>
<div id="done" class="done hide"><div class="tick">✓</div><h2 class="h2">فایل‌ها ارسال شد</h2><div id="cnt" class="sr"></div><p>کد پیگیری شما را به کارمند نشان دهید:</p><div class="code" id="receipt"></div><div class="row"><button class="btn alt" id="again" type="button">ارسال فایل دیگر</button></div></div>
</div>
<div class="card trk hide" id="trk"><h3 class="h3">وضعیت ارسال‌های شما</h3><div id="trkList"></div></div>
<footer>فایل‌ها فقط برای همین کافی‌نت ارسال می‌شود و پس از مدتی خودکار پاک می‌شود.</footer>
</main>`;

const JS = String.raw`(function(){
"use strict";
var $=function(i){return document.getElementById(i)};
var code=location.pathname.split("/").filter(Boolean).pop()||"";
var API="/api/public/upload/"+encodeURIComponent(code);
var KEY="cafino-up:"+code;
var info=null,files=[],skew=0,sending=false;
var fa=function(n){return String(n).replace(/\d/g,function(d){return "۰۱۲۳۴۵۶۷۸۹"[d]})};
var ST={new:"دریافت شد",seen:"کارمند دید",printed:"چاپ شد",done:"انجام شد",removed:"حذف شد"};
function size(b){return b>=1048576?fa((b/1048576).toFixed(1))+" مگابایت":fa(Math.max(1,Math.round(b/1024)))+" کیلوبایت"}
function ext(n){var m=/\.([A-Za-z0-9]{1,6})$/.exec(n);return m?m[1].toLowerCase():""}
function show(id,on){$(id).classList.toggle("hide",!on)}
function err(t){var m=$("msg");m.textContent=t||"";m.className="msg"+(t?" err":"")}
function now(){return Date.now()+skew}
function render(){
  var ul=$("list");ul.textContent="";
  files.forEach(function(f,i){
    var li=document.createElement("li"),n=document.createElement("span"),s=document.createElement("span"),b=document.createElement("button");
    n.className="n";n.textContent=f.name;s.className="s";s.textContent=size(f.size);
    b.type="button";b.textContent="×";b.setAttribute("aria-label","حذف "+f.name);b.onclick=function(){if(sending)return;files.splice(i,1);render()};
    li.appendChild(n);li.appendChild(s);li.appendChild(b);ul.appendChild(li);
  });
  $("send").disabled=!files.length||sending;
  $("send").textContent=files.length?"ارسال "+fa(files.length)+" فایل":"ارسال";
}
function add(list){
  err("");
  for(var i=0;i<list.length;i++){
    var f=list[i];
    if(files.length>=info.maxFiles){err("حداکثر "+fa(info.maxFiles)+" فایل در هر ارسال.");break}
    if(info.allowedExts.indexOf(ext(f.name))<0){err("«"+f.name+"» پذیرفته نمی‌شود. فرمت‌های مجاز: "+info.allowedExts.join("، "));continue}
    if(f.size>info.maxFileMb*1048576){err("«"+f.name+"» بزرگ‌تر از "+fa(info.maxFileMb)+" مگابایت است.");continue}
    if(f.size===0){err("«"+f.name+"» خالی است.");continue}
    files.push(f);
  }
  render();
}
function closed(t){show("form",false);show("done",false);show("exp",false);var c=$("closed");c.textContent=t;show("closed",true)}
function left(){
  if(!info||!info.expiresAt)return;
  var ms=Date.parse(info.expiresAt)-now();
  if(ms<=0){closed("مهلت این QR تمام شد. از کارمند یک QR تازه بگیرید.");return}
  var m=Math.ceil(ms/60000),h=Math.floor(m/60),d=Math.floor(h/24),t;
  if(d>=1)t=fa(d)+" روز";else if(h>=1)t=fa(h)+" ساعت"+(m%60?" و "+fa(m%60)+" دقیقه":"");else t=fa(m)+" دقیقه";
  var e=$("exp");e.textContent="مهلت ارسال با این QR: "+t+" دیگر";show("exp",true);
}
function loadTok(){try{var a=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(a)?a.filter(function(x){return x&&x.t&&now()-x.ts<3*864e5}):[]}catch(_){return[]}}
function saveTok(a){try{localStorage.setItem(KEY,JSON.stringify(a.slice(0,5)))}catch(_){}}
function renderTrack(items){
  var box=$("trkList");box.textContent="";
  items.forEach(function(it){
    var w=document.createElement("div");w.className="trk-item";
    var c=document.createElement("div");c.className="code";c.textContent="#"+fa(it.batchCode);w.appendChild(c);
    var ul=document.createElement("ul");
    it.files.forEach(function(f){
      var li=document.createElement("li"),n=document.createElement("span"),s=document.createElement("span"),t=document.createElement("span");
      n.className="n";n.textContent=f.name||"(حذف‌شده)";s.className="s";s.textContent=f.size?size(f.size):"";
      t.className="st "+f.status;t.textContent=ST[f.status]||"";
      li.appendChild(n);li.appendChild(s);li.appendChild(t);ul.appendChild(li);
    });
    w.appendChild(ul);box.appendChild(w);
  });
  show("trk",items.length>0);
}
function pollTrack(){
  var toks=loadTok();if(!toks.length){renderTrack([]);return}
  var out=[],keep=[],left=toks.length;
  toks.forEach(function(x,i){
    fetch(API+"/status/"+encodeURIComponent(x.t),{headers:{accept:"application/json"},cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(j){
      if(j&&j.data){out[i]=j.data;keep[i]=x}
    }).catch(function(){keep[i]=x}).then(function(){
      if(--left===0){renderTrack(out.filter(Boolean));saveTok(keep.filter(Boolean))}
    });
  });
}
fetch(API,{headers:{accept:"application/json"},cache:"no-store"}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){
  if(!x.ok){closed(x.j&&x.j.error&&x.j.error.message||"این صفحه معتبر نیست.");pollTrack();return}
  info=x.j.data;if(info.serverTime)skew=Date.parse(info.serverTime)-Date.now();
  $("cafe").textContent=info.cafeName;document.title="ارسال فایل به "+info.cafeName;
  if(info.label){$("sub").textContent=info.label}
  var sh=info.shop;if(sh){
    if(sh.logo){var lg=$("shopLogo");lg.onload=function(){show("shopLogo",true)};lg.onerror=function(){show("shopLogo",false)};lg.alt=info.cafeName;lg.src="/u/"+encodeURIComponent(code)+"/"+sh.logo}
    if(sh.address){$("shopAddr").textContent="📍 "+sh.address;show("shopAddr",true)}
    var tels=[sh.phone,sh.mobile].filter(Boolean);
    if(tels.length){var t=$("shopTel");t.textContent="📞 ";tels.forEach(function(v,i){
      if(i)t.appendChild(document.createTextNode(" — "));
      var a=document.createElement("a");a.textContent=v;
      var d=String(v).replace(/[۰-۹]/g,function(c){return "۰۱۲۳۴۵۶۷۸۹".indexOf(c)}).replace(/[\s\-()]/g,"");
      if(/^\+?[0-9]{5,15}$/.test(d))a.href="tel:"+d;
      t.appendChild(a)});show("shopTel",true)}
    if(sh.address||tels.length)show("shop",true)
  }
  if(info.notice){var n=$("notice");n.textContent=info.notice;show("notice",true)}
  $("hint").textContent="هر فایل تا "+fa(info.maxFileMb)+" مگابایت\nفرمت‌های مجاز: "+info.allowedExts.join("، ");
  if(info.requirePhone){$("phoneLbl").textContent="شمارهٔ موبایل (لازم)";}
  show("form",true);left();setInterval(left,30000);pollTrack();
  setInterval(function(){if(document.visibilityState==="visible")pollTrack()},15000);
}).catch(function(){closed("اتصال برقرار نشد. اینترنت را بررسی کنید و صفحه را دوباره باز کنید.")});
var drop=$("drop"),pick=$("pick"),cam=$("cam");
drop.onclick=function(){pick.click()};
drop.onkeydown=function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();pick.click()}};
pick.onchange=function(){add(pick.files);pick.value=""};
cam.onchange=function(){add(cam.files);cam.value=""};
$("camBtn").onclick=function(){cam.click()};
["dragenter","dragover"].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.add("over")})});
["dragleave","drop"].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.remove("over")})});
drop.addEventListener("drop",function(e){if(e.dataTransfer&&e.dataTransfer.files)add(e.dataTransfer.files)});
$("form").onsubmit=function(e){
  e.preventDefault();err("");
  if(!files.length||sending)return;
  var phone=$("phone").value.trim();
  if(info.requirePhone&&!/^[0-9۰-۹]{10,13}$/.test(phone.replace(/[\s-]/g,""))){err("شمارهٔ موبایل را درست وارد کنید.");return}
  var fd=new FormData();
  fd.append("name",$("name").value.trim());fd.append("phone",phone);fd.append("note",$("note").value.trim());
  files.forEach(function(f){fd.append("files",f,f.name)});
  var x=new XMLHttpRequest();x.open("POST",API);x.setRequestHeader("accept","application/json");
  sending=true;render();show("bar",true);$("bar").style.display="block";$("bar").firstChild.style.width="0";$("pct").textContent="در حال ارسال…";
  x.upload.onprogress=function(p){if(p.lengthComputable){var pc=Math.round(p.loaded/p.total*100);$("bar").firstChild.style.width=pc+"%";$("pct").textContent=pc<100?"در حال ارسال: "+fa(pc)+"٪ ("+size(p.loaded)+" از "+size(p.total)+")":"ارسال کامل شد؛ در حال بررسی فایل‌ها…"}};
  x.onload=function(){
    sending=false;$("bar").style.display="none";$("pct").textContent="";var j=null;try{j=JSON.parse(x.responseText)}catch(_){}
    if(x.status>=200&&x.status<300&&j&&j.data){
      $("receipt").textContent=fa(j.data.batchCode);$("cnt").textContent=fa(j.data.count);
      if(j.data.statusToken){var a=loadTok();a.unshift({t:j.data.statusToken,ts:now()});saveTok(a)}
      files=[];render();$("name").value="";$("note").value="";show("form",false);show("done",true);pollTrack();
    }else{err(j&&j.error&&j.error.message||"ارسال ناموفق بود. دوباره تلاش کنید.");render()}
  };
  x.onerror=function(){sending=false;$("bar").style.display="none";$("pct").textContent="";err("اتصال قطع شد. دوباره تلاش کنید.");render()};
  x.send(fd);
};
$("again").onclick=function(){show("done",false);show("form",true)};
render();
})();`;

const HTML = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#e8590c"><title>ارسال فایل</title><style>${CSS}</style></head><body>${BODY}<script>${JS}</script></body></html>`;

const hash = (s) => `'sha256-${crypto.createHash("sha256").update(s, "utf8").digest("base64")}'`;
export const UPLOAD_PAGE_HTML = HTML;
export const UPLOAD_PAGE_CSP = [
  "default-src 'none'", `script-src ${hash(JS)}`, `style-src ${hash(CSS)}`,
  "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "form-action 'none'", "base-uri 'none'", "frame-ancestors 'none'",
].join("; ");
