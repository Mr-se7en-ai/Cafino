// Generated from App.jsx by the module split (v1.50.0). Section: club
import { logActivity } from "../core/activity.js";
import { fmtM, toFA } from "../core/format.js";
import { CLUB_KEY, CRM_KEY, CUSTOMERS_STORAGE_KEY, LEDGER_STORAGE } from "../core/constants.js";
import { todayIso } from "../core/jalali.js";
import { daysUntil } from "./obligations.jsx";
import { emitDataChange, getSales, lsRead, lsWrite, receiveSalePayment, saleRemaining, uid } from "./sales.jsx";


function defaultClubConfig(){
  return{enabled:true,pointRate:100000,rewardsFrom:todayIso(),
    tiers:[
      {key:"normal",name:"عادی",icon:"🥉",min:0,percent:0},
      {key:"silver",name:"نقره‌ای",icon:"🥈",min:10000000,percent:2},
      {key:"gold",name:"طلایی",icon:"🥇",min:50000000,percent:5},
      {key:"vip",name:"ویژه",icon:"💎",min:150000000,percent:8},
    ],
    reward:{enabled:true,every:10,amount:500000}};
}

export function getClubConfig(){
  const d=defaultClubConfig();const v=lsRead(CLUB_KEY,null);
  if(!v||typeof v!=="object"){lsWrite(CLUB_KEY,d);return d;}
  const tiers=(Array.isArray(v.tiers)&&v.tiers.length?v.tiers:d.tiers).map((t,i)=>({key:t.key||`t${i}`,name:t.name||"",icon:t.icon||"⭐",min:i===0?0:Math.max(0,Number(t.min)||0),percent:Math.min(100,Math.max(0,Number(t.percent)||0))})).sort((a,b)=>a.min-b.min);
  return{...d,...v,tiers,reward:{...d.reward,...(v.reward||{})},rewardsFrom:v.rewardsFrom===undefined?d.rewardsFrom:v.rewardsFrom};
}

export function clubAggregate(sales){
  const m={};
  (sales||getSales()).forEach(s=>{
    if(!s||s.cancelled||s.customerId==null)return;
    const k=String(s.customerId);
    const o=m[k]||(m[k]={count:0,spent:0,dates:[],last:""});
    o.count++;o.spent+=Math.max(0,(Number(s.total)||0)-(Number(s.waived)||0));o.dates.push(s.date||"");
    if((s.date||"")>o.last)o.last=s.date||"";
  });
  return m;
}

export function clubInfo(customer,cfg,agg){
  cfg=cfg||getClubConfig();
  const a=(agg||clubAggregate())[String(customer.id)]||{count:0,spent:0,dates:[],last:""};
  let idx=0;cfg.tiers.forEach((t,i)=>{if(a.spent>=t.min)idx=i;});
  const tier=cfg.tiers[idx],next=cfg.tiers[idx+1]||null;
  const points=Math.floor(a.spent/Math.max(1,Number(cfg.pointRate)||1));
  const r=cfg.reward||{};
  const rewardCount=a.dates.filter(d=>!cfg.rewardsFrom||d>=cfg.rewardsFrom).length;
  const every=Math.max(0,Number(r.every)||0);
  const earned=r.enabled&&every>0?Math.floor(rewardCount/every)*(Number(r.amount)||0):0;
  const issued=Number(customer.clubIssued)||0;
  return{count:a.count,spent:a.spent,last:a.last,points,tier,next,idx,percent:cfg.enabled?tier.percent:0,
    toNext:next?Math.max(0,next.min-a.spent):0,
    progress:next?Math.min(1,Math.max(0,(a.spent-tier.min)/Math.max(1,next.min-tier.min))):1,
    rewardCount,every,earned,issued,pending:Math.max(0,earned-issued),
    toNextReward:every>0?every-(rewardCount%every):0,rewardOn:!!(r.enabled&&every>0)};
}

// Credits the wallet with any reward not yet paid out. Idempotent: `clubIssued` only ever grows to match what the sales justify.
export function syncClubRewards(customerId){
  const cfg=getClubConfig();
  if(!cfg.enabled||!cfg.reward.enabled||customerId==null)return 0;
  const customers=lsRead(CUSTOMERS_STORAGE_KEY,[]);
  const c=customers.find(x=>String(x.id)===String(customerId));
  if(!c)return 0;
  const info=clubInfo(c,cfg);
  if(info.pending<=0)return 0;
  const date=todayIso();
  lsWrite(CUSTOMERS_STORAGE_KEY,customers.map(x=>String(x.id)!==String(c.id)?x:{...x,clubIssued:info.earned,wallet:(Number(x.wallet)||0)+info.pending,
    walletHistory:[...(x.walletHistory||[]),{id:uid(),type:"charge",amount:info.pending,note:`🎁 پاداش باشگاه مشتریان (${toFA(info.rewardCount)} خرید)`,date,club:true}]}));
  logActivity("پاداش باشگاه",`${c.firstName} ${c.lastName} — ${fmtM(info.pending)}`);
  return info.pending;
}

export function syncAllClubRewards(){
  let n=0,sum=0;
  lsRead(CUSTOMERS_STORAGE_KEY,[]).forEach(c=>{const p=syncClubRewards(c.id);if(p>0){n++;sum+=p;}});
  if(n)emitDataChange();
  return{n,sum};
}

export function defaultCrmConfig(){return{minScore:60,targets:{visits:10,spent:20000000,profit:4000000,days:180},weights:{visits:25,spent:35,profit:25,days:15}};}

export function getCrmConfig(){
  const d=defaultCrmConfig(),v=lsRead(CRM_KEY,null);
  if(!v||typeof v!=="object")return d;
  return{minScore:Number(v.minScore)>0?Number(v.minScore):d.minScore,targets:{...d.targets,...(v.targets||{})},weights:d.weights};
}

// One pass over sales + ledger → stats for every customer.
export function crmAggregate(sales,ledger){
  const m={};
  const get=(k)=>m[k]||(m[k]={count:0,spent:0,profit:0,debt:0,first:"",last:"",svc:{}});
  (sales||getSales()).forEach(s=>{
    if(!s||s.cancelled||s.customerId==null)return;
    const o=get(String(s.customerId));
    const net=Math.max(0,(Number(s.total)||0)-(Number(s.waived)||0));
    o.count++;o.spent+=net;o.profit+=net-(Number(s.costTotal)||0);o.debt+=saleRemaining(s);
    const d=s.date||"";
    if(d&&(!o.first||d<o.first))o.first=d;
    if(d>o.last)o.last=d;
    (s.lines||[]).forEach(l=>{
      const k=(l.title||l.desc||"").trim()||l.desc;if(!k)return;
      const e=o.svc[k]||(o.svc[k]={name:k,qty:0,amount:0,n:0});
      e.qty+=Number(l.qty)||0;e.amount+=(Number(l.qty)||0)*(Number(l.price)||0);e.n++;
    });
  });
  (ledger||lsRead(LEDGER_STORAGE,[])).forEach(a=>{
    if(!a||a.customerId==null)return;
    const extra=(a.entries||[]).filter(e=>e.saleId==null&&e.category==="بدهکار").reduce((s,e)=>s+(Number(e.amount)||0),0);
    if(extra>0)get(String(a.customerId)).debt+=extra;
  });
  return m;
}

function crmGolden(a,cfg){
  const t=cfg.targets,w=cfg.weights;
  const days=a.first?Math.max(0,-daysUntil(a.first)):0;
  const part=(v,target)=>Math.min(1,Math.max(0,v/Math.max(1,Number(target)||1)));
  const p={visits:part(a.count,t.visits),spent:part(a.spent,t.spent),profit:part(a.profit,t.profit),days:part(days,t.days)};
  const score=Math.round(p.visits*w.visits+p.spent*w.spent+p.profit*w.profit+p.days*w.days);
  return{score,days,parts:p,golden:a.count>0&&score>=cfg.minScore};
}

export function crmStats(customer,agg,cfg,clubCfg,clubAgg){
  const a=(agg||crmAggregate())[String(customer.id)]||{count:0,spent:0,profit:0,debt:0,first:"",last:"",svc:{}};
  const g=crmGolden(a,cfg||getCrmConfig());
  const club=clubInfo(customer,clubCfg,clubAgg);
  const svcs=Object.values(a.svc).sort((x,y)=>y.qty-x.qty||y.amount-x.amount);
  return{...a,...g,points:club.points,club,topService:svcs[0]||null,services:svcs};
}

// Receive money from a customer against their open sales, oldest first.
export function receiveCustomerPayment(customerId,amount,method,date){
  let left=Math.max(0,Number(amount)||0);
  if(!(left>0))return{ok:false,error:"مبلغ را وارد کنید"};
  const open=getSales().filter(s=>!s.cancelled&&String(s.customerId)===String(customerId)&&saleRemaining(s)>0)
    .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))||(a.createdTs||0)-(b.createdTs||0));
  if(!open.length)return{ok:false,error:"این مشتری فاکتور بدهکار ندارد"};
  let got=0,n=0;
  for(const s of open){
    if(left<=0)break;
    const r=receiveSalePayment(s.id,Math.min(left,saleRemaining(s)),method,date);
    if(!r.ok){if(!got)return r;break;}
    got+=r.received;left-=r.received;n++;
  }
  return{ok:true,received:got,invoices:n,unused:left};
}
