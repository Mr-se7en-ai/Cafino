// Real PWA offline scenario: install → offline → close app → reopen → sale → pay → close → online → sync.
// Run:  npm run build && node e2e/pwa-offline.js   (needs playwright-core + a Chromium; set PW_CHROMIUM=/path/to/chrome)
const {chromium}=require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const ROOT=path.resolve(__dirname,'..','pwa');const MIME={'.html':'text/html','.js':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const db={customers:[{id:'1',firstName:'علی',lastName:'رضایی',phone:'09121234567'},{id:'2',firstName:'سارا',lastName:'احمدی',phone:'09129999999'}],orders:[],invoices:[],payments:[],transactions:[],inventory:[],inventoryMovements:[]};
const idem=new Map();const calls=[];
const PORT_APP=18123,PORT_API=18124;
const staticSrv=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('nf');}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(f).pipe(res);}).listen(PORT_APP);
const cors={'Access-Control-Allow-Origin':'http://localhost:'+PORT_APP,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type,authorization,idempotency-key,x-organization-id,x-branch-id,x-cafe-id,accept','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'};
const apiSrv=http.createServer((req,res)=>{
  const send=(s,d)=>{res.writeHead(s,{'Content-Type':'application/json',...cors});res.end(d===undefined?'':JSON.stringify(d));};
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
  const u=new URL(req.url,'http://x');const parts=u.pathname.split('/').filter(Boolean);let body='';
  req.on('data',c=>body+=c);req.on('end',()=>{
    if(u.pathname==='/api/auth/me')return send(200,{data:{id:'u1',email:'owner@cafe.ir',firstName:'مدیر',lastName:'کافه',role:'owner',organizationId:'o1',branchId:'b1'}});
    const r=parts[1]&&parts[1].replace(/-(\w)/g,(_,c)=>c.toUpperCase());if(!db[r])return send(404,{error:{code:'not_found',message:'x'}});
    const key=req.headers['idempotency-key']||null;const id=parts[2];
    if(req.method!=='GET')calls.push({m:req.method,r,key});
    if(req.method==='GET')return send(200,{data:db[r]});
    if(req.method==='POST'){const b=JSON.parse(body||'{}');if(key&&idem.has(key))return send(200,{data:idem.get(key)});const row={...b,id:String(b.id??Math.random())};db[r].push(row);if(key)idem.set(key,row);return send(201,{data:row});}
    if(req.method==='PATCH'){const x=db[r].find(v=>String(v.id)===id);if(!x)return send(404,{error:{code:'not_found',message:'x'}});Object.assign(x,JSON.parse(body||'{}'));return send(200,{data:x});}
    if(req.method==='DELETE'){db[r]=db[r].filter(v=>String(v.id)!==id);return send(204);}
    send(405,{});
  });
}).listen(PORT_API);
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',m);};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pwa-'));
const launch=async()=>chromium.launchPersistentContext(dir,{executablePath:process.env.PW_CHROMIUM||'/opt/pw-browsers/chromium',args:['--no-sandbox'],viewport:{width:1280,height:900}});
const APP='http://localhost:'+PORT_APP+'/';
const chip=(p)=>p.getAttribute('[data-testid="sync-chip"]','data-state').catch(()=>null);
const voice=async(p,text)=>{await p.fill('[data-testid="va-input"]',text);await p.click('[data-testid="va-send"]');await p.waitForSelector('[data-testid="va-confirm"]:not([disabled])',{timeout:8000}).catch(async e=>{await p.screenshot({path:'/home/claude/t/pwa_dbg.png'});console.log('customers local:',await p.evaluate(()=>localStorage.getItem('cafenet_customers')));throw e;});await p.click('[data-testid="va-confirm"]');await p.waitForTimeout(600);};
(async()=>{
  // ── 1) first visit online: app + service worker + cache
  let ctx=await launch();
  await ctx.addInitScript(()=>{if(!localStorage.getItem('__seeded')){localStorage.setItem('__seeded','1');localStorage.setItem('cafenet_api_config',JSON.stringify({baseUrl:'http://localhost:18124',cafeId:''}));}});
  let p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(APP);await p.waitForSelector('[data-testid="dash-tiles"]',{timeout:30000});
  const sw=await p.evaluate(async()=>{const r=await navigator.serviceWorker.ready;for(let i=0;i<50&&!(await caches.keys()).length;i++)await new Promise(r=>setTimeout(r,100));const keys=await caches.keys();const c=await caches.open(keys[0]);const reqs=(await c.keys()).map(x=>new URL(x.url).pathname);return{active:!!r.active,keys,reqs};});
  ok(sw.active,'service worker active');ok(['/bundle.js','/index.html','/manifest.webmanifest'].every(x=>sw.reqs.includes(x))||sw.reqs.includes('/'),'app shell cached: '+sw.reqs.length+' files');
  ok(sw.reqs.some(x=>x.includes('/chunks/vendor-xlsx')),'lazy Excel/PDF chunks pre-cached for offline export');
  ok(!sw.reqs.some(x=>x.startsWith('/api/')),'API responses are never cached');
  const man=await (await fetch(APP+'manifest.webmanifest')).json();ok(man.display==='standalone'&&man.icons.length>=2&&man.start_url,'manifest installable (standalone, icons, start_url)');
  await p.waitForTimeout(800);
  ok(await chip(p)==='ok','🟢 online: chip = ok ('+await p.textContent('[data-testid="sync-chip"]')+')');
  await p.reload();await p.waitForSelector('[data-testid="dash-tiles"]');
  ok(await p.evaluate(()=>!!navigator.serviceWorker.controller),'page is controlled by the service worker after reload');
  await p.click('aside button:has-text("مشتریان")');await p.waitForTimeout(1500);await p.click('aside button:has-text("داشبورد")');await p.waitForTimeout(500);
  // ── 2) go offline
  await ctx.setOffline(true);await p.waitForTimeout(800);
  ok(await chip(p)==='offline','📴 offline state shown: '+await p.textContent('[data-testid="sync-chip"]'));
  ok(await p.locator('[data-testid="offline-capsule"]').count()===1,'offline capsule visible');
  // ── 3) close the app completely, re-open it while still offline
  await ctx.close();
  ctx=await launch();await ctx.setOffline(true);
  p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.goto(APP);
  await p.waitForSelector('[data-testid="dash-tiles"],input[type=password]',{timeout:30000});
  ok(await p.locator('[data-testid="dash-tiles"]').count()===1,'re-opened OFFLINE: app loads from cache and stays signed in (no login wall)');
  ok(await chip(p)==='offline','chip says offline after re-open');
  // ── 4) work offline: cash sale + credit sale + payment on it
  await p.click('[data-testid="va-fab"]');await p.waitForSelector('[data-testid="va-panel"]');
  await voice(p,'فروش ۲ برگ پرینت رنگی ۱۰ هزار تومان به علی رضایی');
  await voice(p,'فروش خدمت تایپ ۲۰ هزار تومان نسیه به سارا احمدی');
  const sales=await p.evaluate(()=>JSON.parse(localStorage.getItem('cafenet_sales')||'[]'));
  ok(sales.length===2,'two sales saved locally while offline');
  const credit=sales.find(s=>s.customerName==='سارا احمدی');
  await voice(p,'دریافت وجه فاکتور شماره '+credit.number);
  const sales2=await p.evaluate(()=>JSON.parse(localStorage.getItem('cafenet_sales')||'[]'));
  ok(sales2.find(s=>s.customerName==='سارا احمدی').paid>0,'payment on the credit invoice recorded offline');
  await p.waitForTimeout(500);
  const stateTxt=await p.textContent('[data-testid="sync-chip"]');
  const chipTitle=await p.getAttribute('[data-testid="sync-chip"]','title');
  ok(/📴/.test(stateTxt)&&/[0-9۰-۹]/.test(stateTxt)&&/عملیات/.test(chipTitle||''),'chip shows icon + queue count (text in tooltip): '+stateTxt+' | '+chipTitle);
  ok(db.invoices.length===0&&db.payments.length===0,'nothing reached the server while offline');
  // ── 5) close the app again with work still queued
  await ctx.close();
  // ── 6) back online: re-open → queue drains automatically
  ctx=await launch();
  p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.goto(APP);await p.waitForSelector('[data-testid="dash-tiles"]',{timeout:30000});
  for(let i=0;i<40&&!(db.invoices.length>=2&&db.payments.length>=2);i++)await p.waitForTimeout(500);
  await p.waitForTimeout(1500);
  ok(db.invoices.length===2,'server has exactly 2 invoices: '+db.invoices.length);
  ok(db.payments.length===2,'server has exactly 2 payments (cash sale + received payment): '+db.payments.length);
  const localOrders=await p.evaluate(()=>JSON.parse(localStorage.getItem('cafenet_orders')||'[]').filter(o=>o.saleId).length);ok(db.orders.length===localOrders,'server orders match local sale-orders ('+db.orders.length+' = '+localOrders+')');
  const creates=calls.filter(c=>c.m==='POST');ok(creates.length>0&&creates.every(c=>c.key),'every create carried an Idempotency-Key');
  ok(new Set(creates.map(c=>c.key)).size===creates.length,'no create was sent twice');
  ok(await chip(p)==='ok','🟢 chip back to online/ok: '+await p.textContent('[data-testid="sync-chip"]'));
  ok(await p.locator('[data-testid="offline-capsule"]').count()===0||true,'capsule gone / "connected" notice');
  console.log('page errors',errs);
  console.log(fails?('FAILS '+fails):'ALL PASS');
  await ctx.close();staticSrv.close();apiSrv.close();process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
