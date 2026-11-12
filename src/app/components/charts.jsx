// Generated from App.jsx by the module split (v1.50.0). Section: charts
import { fmtCompact } from "../core/format.js";


// ══════════════════════════════════════════════════════════════════
// SVG CHARTS
// ══════════════════════════════════════════════════════════════════
export function LineChart({data,width=600,height=220}){
  if(!data||data.length===0)return <div style={{color:"var(--text-dim)",textAlign:"center",padding:40,fontSize:13}}>داده‌ای برای نمایش وجود ندارد</div>;
  const pad={top:16,right:12,bottom:48,left:20};
  const W=width-pad.left-pad.right,H=height-pad.top-pad.bottom;
  const maxVal=Math.max(...data.map(d=>Math.max(d.income,d.expense,1)));
  const x=(i)=>pad.left+(i/(data.length-1||1))*W;
  const y=(v)=>pad.top+H-(v/maxVal)*H;
  const pathLine=(key,col)=>{const pts=data.map((d,i)=>`${x(i)},${y(d[key])}`).join(" L ");return <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>;};
  const areaPath=(key,col)=>{if(data.length<2)return null;const pts=data.map((d,i)=>`${x(i)},${y(d[key])}`).join(" L ");return <path d={`M ${x(0)},${y(data[0][key])} L ${pts} L ${x(data.length-1)},${pad.top+H} L ${x(0)},${pad.top+H} Z`} fill={col} fillOpacity="0.12"/>;};
  return(
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",maxHeight:height,overflow:"visible"}}>
      <defs>
        <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity="0.3"/><stop offset="100%" stopColor="#16a34a" stopOpacity="0"/></linearGradient>
        <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dc2626" stopOpacity="0.3"/><stop offset="100%" stopColor="#dc2626" stopOpacity="0"/></linearGradient>
      </defs>
      {[0,0.25,0.5,0.75,1].map(f=><line key={f} x1={pad.left} y1={pad.top+H*f} x2={pad.left+W} y2={pad.top+H*f} stroke="var(--bg-card)" strokeWidth="1"/>)}
      {areaPath("income","url(#gi)")}{areaPath("expense","url(#ge)")}
      {pathLine("income","#16a34a")}{pathLine("expense","#dc2626")}
      {data.map((d,i)=>{const prf=d.income-d.expense;return <circle key={i} cx={x(i)} cy={y(Math.max(0,prf))} r="3" fill={prf>=0?"#22d3ee":"#f97316"}/>;  })}
      {data.map((d,i)=>{if(data.length>12&&i%Math.ceil(data.length/8)!==0)return null;return <text key={i} x={x(i)} y={height-8} textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="inherit">{d.label}</text>;})}
      <circle cx={pad.left+8} cy={12} r="5" fill="#16a34a"/><text x={pad.left+16} y={16} fill="var(--text-secondary)" fontSize="10" fontFamily="inherit">درآمد</text>
      <circle cx={pad.left+70} cy={12} r="5" fill="#dc2626"/><text x={pad.left+78} y={16} fill="var(--text-secondary)" fontSize="10" fontFamily="inherit">هزینه</text>
      <circle cx={pad.left+134} cy={12} r="5" fill="#22d3ee"/><text x={pad.left+142} y={16} fill="var(--text-secondary)" fontSize="10" fontFamily="inherit">سود/ضرر</text>
    </svg>
  );
}

export function DonutChart({slices,size=160}){
  const total=slices.reduce((s,sl)=>s+sl.value,0);
  if(!total)return <div style={{color:"var(--text-dim)",textAlign:"center",padding:20,fontSize:12}}>بدون داده</div>;
  let cum=0;
  const cx=size/2,cy=size/2,r=size*0.36,inner=size*0.22;
  const arcs=slices.map(sl=>{
    const start=cum/total*Math.PI*2-Math.PI/2; cum+=sl.value;
    const end=cum/total*Math.PI*2-Math.PI/2;
    const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start);
    const x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end);
    const xi1=cx+inner*Math.cos(start),yi1=cy+inner*Math.sin(start);
    const xi2=cx+inner*Math.cos(end),yi2=cy+inner*Math.sin(end);
    const large=end-start>Math.PI?1:0;
    return{...sl,d:`M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`};
  });
  return(<svg viewBox={`0 0 ${size} ${size}`} style={{width:size,height:size}}>{arcs.map((a,i)=><path key={i} d={a.d} fill={a.color} opacity="0.9"/>)}</svg>);
}

export function MonthlyIncomeChart({data,height=180}){
  if(!data||data.length===0)return <div style={{color:"var(--text-dim)",textAlign:"center",padding:30,fontSize:13}}>داده‌ای وجود ندارد</div>;
  const max=Math.max(...data.map(d=>d.income||0),1);
  const bw=Math.max(20,Math.min(48,420/data.length));
  const gap=bw*0.6;
  const totalW=data.length*(bw+gap)+gap;
  return(
    <svg viewBox={`0 0 ${totalW} ${height+34}`} style={{width:"100%",maxHeight:height+34}}>
      <defs>
        <linearGradient id="miGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a"/><stop offset="100%" stopColor="#22c55e"/></linearGradient>
      </defs>
      {data.map((d,i)=>{
        const bx=i*(bw+gap)+gap;
        const bh=(d.income/max)*(height-24);
        return(
          <g key={i}>
            <text x={bx+bw/2} y={height-bh-8} textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="inherit" fontWeight="700">{d.income>0?fmtCompact(d.income):""}</text>
            <rect x={bx} y={height-bh} width={bw} height={Math.max(bh,2)} fill="url(#miGrad)" rx="4"/>
            <text x={bx+bw/2} y={height+16} textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="inherit">{d.label}</text>
          </g>
        );
      })}
      <line x1="0" y1={height} x2={totalW} y2={height} stroke="var(--bg-card)" strokeWidth="1"/>
    </svg>
  );
}

export function BarChart({data,height=180}){
  if(!data||data.length===0)return <div style={{color:"var(--text-dim)",textAlign:"center",padding:30,fontSize:13}}>داده‌ای وجود ندارد</div>;
  const max=Math.max(...data.map(d=>Math.max(d.income||0,d.expense||0)),1);
  const bw=Math.max(8,Math.min(28,400/(data.length*2+2)));
  const gap=bw*0.5;
  const totalW=data.length*(bw*2+gap)+gap;
  return(
    <svg viewBox={`0 0 ${totalW} ${height+30}`} style={{width:"100%",maxHeight:height+30}}>
      {data.map((d,i)=>{const bx=i*(bw*2+gap)+gap;const ih=(d.income/max)*(height-10);const eh=(d.expense/max)*(height-10);return(<g key={i}><rect x={bx} y={height-ih} width={bw} height={ih} fill="#16a34a" rx="2" opacity="0.85"/><rect x={bx+bw+2} y={height-eh} width={bw} height={eh} fill="#dc2626" rx="2" opacity="0.85"/><text x={bx+bw} y={height+14} textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontFamily="inherit">{d.label}</text></g>);})}
      <line x1="0" y1={height} x2={totalW} y2={height} stroke="var(--bg-card)" strokeWidth="1"/>
    </svg>
  );
}
