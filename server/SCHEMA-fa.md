# نمودار پایگاه‌داده

```
organizations 1─* cafes 1─* users(owner|manager|staff)         platform_admin: users.cafe_id = NULL
cafes 1─* customers | inventory | inventory_movements | orders | invoices | payments | accounts | transactions | expenses | obligations | settings
cafes 1─* tickets 1─* ticket_messages          announcements (target_cafes[] خالی = همه)
users 1─* refresh_tokens(family) | password_resets          idempotency_keys(scope,key)          audit_log(hash chain per cafe)
```
```
accounts 1─* ledger_entries(opening|invoice|payment|reversal|adjustment|refund; تغییرناپذیر)      balance = Σ ledger_entries.amount
payments(kind=payment, amount>0) ◄─ payments(kind=reversal, amount<0, reversal_of→payment)     هر پرداخت حداکثر یک برگشت
inventory.qty = inventory.opening_qty + Σ inventory_movements.qty_delta                          (rebuild: POST /api/inventory/rebuild)
invoices.paid_amount = Σ payments.amount (بدون حذف‌شده)                                           remaining/status مشتق
```
جزئیات ستون‌ها و ایندکس‌ها: `migrations/001_init.sql` و `migrations/002_financial_integrity.sql` (با توضیح فارسی کنار هر جدول).