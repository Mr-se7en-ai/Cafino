// دیتاست بزرگ و «واقع‌نما» برای سنجش کارایی. فقط با generate_series در خود PostgreSQL ساخته می‌شود.
// استفاده: await seed(pool, { scale: 1 })  → کافی‌نت بزرگ: ۱۰هزار مشتری، ۱۰۰هزار فاکتور، ۱۵۰هزار پرداخت، ۲۵۰هزار ردیف دفتر کل…
// یک کافی‌نت «نویز» (۲۰٪ حجم) هم ساخته می‌شود تا ایزوله‌سازی tenant در برنامهٔ اجرا دیده شود.
export async function seed(pool, { scale = 1, mainCafeId = "" } = {}) {   // mainCafeId: کافی‌نتِ از پیش ثبت‌شده (برای ورود واقعی با API)
  const out = {};
  for (const [key, name, mult] of [["main", "بزرگ", 1], ["noise", "نویز", 0.2]]) {
    let cafe;
    if (key === "main" && mainCafeId) cafe = mainCafeId;
    else {
      const org = (await pool.query("INSERT INTO organizations(name) VALUES ($1) RETURNING id", [`org-${key}`])).rows[0].id;
      cafe = (await pool.query("INSERT INTO cafes(org_id,name) VALUES ($1,$2) RETURNING id", [org, `cafe-${key}-${name}`])).rows[0].id;
    }
    out[key] = cafe;
    const N = (n) => Math.max(10, Math.round(n * scale * mult));
    const nCust = N(10000), nInv = N(100000), nItems = N(3000);
    // مشتری + حساب
    await pool.query(`INSERT INTO customers(cafe_id,id,first_name,last_name,phone,created_at,updated_at)
      SELECT $1, 'c'||g, 'نام'||g, 'خانوادگی'||(g%500), '0912'||lpad(g::text,7,'0'), now()-(g%700||' days')::interval, now()-(g%700||' days')::interval FROM generate_series(1,$2) g`, [cafe, nCust]);
    await pool.query(`INSERT INTO accounts(cafe_id,id,customer_id,name,created_at,updated_at) SELECT $1,'a'||g,'c'||g,'نام'||g,now(),now() FROM generate_series(1,$2) g`, [cafe, nCust]);
    // فاکتور: ۷۰۰ روز، ~۹۰٪ پرداخت‌شده، بقیه باز/نیمه
    await pool.query(`INSERT INTO invoices(cafe_id,id,number,customer_id,customer_name,date,items,subtotal,discount,total_amount,paid_amount,remaining_amount,status,created_at,updated_at)
      SELECT $1,'i'||g,'F-'||g,'c'||(1+(g*7919)%$3),'نام',(current_date-(g%700)),'[{"n":"x","q":1}]'::jsonb,
        t,0,t, CASE WHEN g%10=0 THEN 0 WHEN g%10=1 THEN t/2 ELSE t END, CASE WHEN g%10=0 THEN t WHEN g%10=1 THEN t-t/2 ELSE 0 END,
        CASE WHEN g%10=0 THEN 'unpaid' WHEN g%10=1 THEN 'partial' ELSE 'paid' END,
        now()-((g%700)||' days')::interval - ((g%86400)||' seconds')::interval, now()-((g%700)||' days')::interval - ((g%86400)||' seconds')::interval
      FROM (SELECT g, (10000 + (g*37)%490000)::bigint AS t FROM generate_series(1,$2) g) s`, [cafe, nInv, nCust]);
    // پرداخت‌ها (۱ برای هر فاکتورِ پرداخت‌شده/نیمه) + دفتر کل
    await pool.query(`INSERT INTO payments(cafe_id,id,invoice_id,customer_id,amount,method,date,account_id,created_at,updated_at)
      SELECT $1,'p'||i.id,i.id,i.customer_id,i.paid_amount,(ARRAY['cash','card','transfer'])[1+(row_number() OVER ())%3],i.date,'a'||substr(i.customer_id,2),i.created_at,i.created_at
      FROM invoices i WHERE i.cafe_id=$1 AND i.paid_amount>0`, [cafe]);
    await pool.query(`INSERT INTO ledger_entries(cafe_id,id,account_id,kind,amount,ref_type,ref_id,date,created_at)
      SELECT $1,'li'||id,'a'||substr(customer_id,2),'invoice',total_amount,'invoice',id,date,created_at FROM invoices WHERE cafe_id=$1`, [cafe]);
    await pool.query(`INSERT INTO ledger_entries(cafe_id,id,account_id,kind,amount,ref_type,ref_id,date,created_at)
      SELECT $1,'lp'||id,account_id,'payment',-amount,'payment',id,date,created_at FROM payments WHERE cafe_id=$1`, [cafe]);
    await pool.query(`UPDATE accounts a SET balance=COALESCE((SELECT SUM(amount) FROM ledger_entries e WHERE e.cafe_id=a.cafe_id AND e.account_id=a.id),0) WHERE a.cafe_id=$1`, [cafe]);
    // انبار + حرکت
    await pool.query(`INSERT INTO inventory(cafe_id,id,name,cat,qty,min_qty,unit,unit_cost,sale_price,opening_qty,created_at,updated_at)
      SELECT $1,'s'||g,'کالا '||g,'c'||(g%20),0,10,'عدد',1000,2000,0,now(),now() FROM generate_series(1,$2) g`, [cafe, nItems]);
    await pool.query(`INSERT INTO inventory_movements(cafe_id,id,item_id,qty_delta,reason,date,created_at,updated_at)
      SELECT $1,'m'||g,'s'||(1+g%$3),(CASE WHEN g%3=0 THEN 50 ELSE -2 END),'sale',current_date-(g%700),now()-((g%700)||' days')::interval,now()-((g%700)||' days')::interval FROM generate_series(1,$2) g`, [cafe, N(60000), nItems]);
    await pool.query(`UPDATE inventory i SET qty=i.opening_qty+COALESCE((SELECT SUM(qty_delta) FROM inventory_movements m WHERE m.cafe_id=i.cafe_id AND m.item_id=i.id),0) WHERE i.cafe_id=$1`, [cafe]);
    // تراکنش‌ها/هزینه‌ها
    await pool.query(`INSERT INTO transactions(cafe_id,id,type,amount,date,category,created_at,updated_at)
      SELECT $1,'t'||g,(CASE WHEN g%4=0 THEN 'expense' ELSE 'income' END),5000+(g*13)%90000,current_date-(g%700),'cat'||(g%12),now()-((g%700)||' days')::interval,now()-((g%700)||' days')::interval FROM generate_series(1,$2) g`, [cafe, N(50000)]);
    await pool.query(`INSERT INTO expenses(cafe_id,id,amount,date,category,created_at,updated_at)
      SELECT $1,'e'||g,5000+(g*17)%80000,current_date-(g%700),'cat'||(g%12),now()-((g%700)||' days')::interval,now()-((g%700)||' days')::interval FROM generate_series(1,$2) g`, [cafe, N(30000)]);
    await pool.query(`INSERT INTO orders(cafe_id,id,customer_id,title,status,amount,invoice_id,created_at,updated_at)
      SELECT $1,'o'||g,'c'||(1+g%$3),'سفارش',(ARRAY['new','done','done','done'])[1+g%4],10000,'i'||(1+g%$4),now()-((g%700)||' days')::interval,now()-((g%700)||' days')::interval FROM generate_series(1,$2) g`, [cafe, N(40000), nCust, nInv]);
  }
  await pool.query("VACUUM ANALYZE");   // مثل autovacuum در محیط واقعی (نقشهٔ دیده‌شدن برای index-only scan)
  const counts = {};
  for (const t of ["customers", "accounts", "invoices", "payments", "ledger_entries", "inventory", "inventory_movements", "transactions", "expenses", "orders"]) counts[t] = (await pool.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
  return { ...out, counts };
}
