import React from "react";

export default function InvoiceDashboard({invoices,period,setPeriod,d,allDebt,paymentMethods,periods,formatMoney,formatNumber,buttonStyle}){
  const methods=paymentMethods.filter(m=>m.key!=="credit"&&m.key!=="free"&&(d.by[m.key]>0||m.key==="cash"||m.key==="pos"));
  const box=(l,v,c,id)=><div data-testid={id} style={{background:"var(--bg-card)",borderRadius:12,padding:"12px 14px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>{l}</div><div style={{fontSize:16,fontWeight:800,marginTop:4,color:c||"var(--text-primary)"}}>{v}</div></div>;
  return(
    <div data-testid="inv-dash" style={{marginBottom:16}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {periods.map(([k,l])=><button key={k} onClick={()=>setPeriod(k)} data-testid={"invp-"+k} style={{...buttonStyle(period===k?"#2563eb":"var(--bg-card)",period===k?"#fff":"var(--text-secondary)"),padding:"6px 12px",fontSize:12}}>{l}</button>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
        {box(period==="today"?"فروش امروز":`فروش ${(periods.find(p=>p[0]===period)||[])[1]}`,formatMoney(d.sales),"#60a5fa","invd-sales")}
        {box("تعداد فاکتور",formatNumber(d.count),"var(--text-primary)","invd-count")}
        {methods.map(m=>box(`${m.icon} ${m.label}`,formatMoney(d.by[m.key]||0),"#4ade80","invd-"+m.key))}
        {box("بدهی (مانده فاکتورها)",formatMoney(d.debt),d.debt>0?"#f87171":"#4ade80","invd-debt")}
      </div>
      {allDebt>0&&period!=="all"&&<div style={{fontSize:11,color:"var(--text-muted)",marginTop:6}}>کل بدهی باز فاکتورها (همه دوره): <b style={{color:"#fbbf24"}}>{formatMoney(allDebt)}</b></div>}
    </div>
  );
}
