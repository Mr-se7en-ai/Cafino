// Generated from App.jsx by the module split (v1.50.0). Section: dashboardWidgets
import { toFA } from "../core/format.js";
import { ORDER_STATUSES } from "../core/constants.js";
import { useCustomers } from "../pages/customers.jsx";
import { useOrders } from "../pages/orders.jsx";
import { Empty } from "./ui.jsx";


// ══════════════════════════════════════════════════════════════════
// DASHBOARD SOLAR CALENDAR (تقویم خورشیدی) — read-only month view
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// DASHBOARD ORDERS STATUS (وضعیت سفارش‌ها) — mini CRM summary
// ══════════════════════════════════════════════════════════════════
export function DashboardOrdersStatus(){
  const [orders]=useOrders();
  const [customers]=useCustomers();
  const custName=(id)=>{const c=customers.find(c=>String(c.id)===String(id));return c?`${c.firstName} ${c.lastName}`.trim():"—";};
  const active=orders.filter(o=>o.status!=="delivered");

  if(orders.length===0){
    return(
      <div style={{background:"var(--bg-card)",borderRadius:12,padding:20,marginBottom:20}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:10}}>📋 وضعیت سفارش‌ها</div>
        <Empty text="سفارشی ثبت نشده" sub="از تب «سفارش‌ها» شروع کنید"/>
      </div>
    );
  }

  return(
    <div style={{background:"var(--bg-card)",borderRadius:12,padding:20,marginBottom:20}}>
      <div style={{fontSize:14,fontWeight:700,color:"var(--accent-light)",marginBottom:14}}>📋 وضعیت سفارش‌ها ({toFA(active.length)} در جریان)</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:14}}>
        {ORDER_STATUSES.map(st=>{
          const count=orders.filter(o=>o.status===st.key).length;
          return(
            <div key={st.key} style={{background:"var(--bg-app)",borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:st.color,margin:"0 auto 6px"}}/>
              <div style={{fontSize:17,fontWeight:700}}>{toFA(count)}</div>
              <div style={{fontSize:9,color:"var(--text-muted)",marginTop:2}}>{st.label}</div>
            </div>
          );
        })}
      </div>
      {active.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {active.slice(-4).reverse().map(o=>{
            const st=ORDER_STATUSES.find(s=>s.key===o.status);
            return(
              <div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--bg-app)",borderRadius:8,padding:"8px 12px",fontSize:12}}>
                <div><b>{custName(o.customerId)}</b><span style={{color:"var(--text-muted)"}}> · {o.title}</span></div>
                <span style={{fontSize:10,fontWeight:700,color:"#fff",background:st?st.color:"#64748b",borderRadius:6,padding:"2px 9px",flexShrink:0}}>{st?st.label:o.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
