-- 005: ایندکس‌های کارایی (فقط افزودنی؛ داده و مهاجرت‌های قبلی دست‌نخورده‌اند).
-- هر ایندکس با اندازه‌گیری واقعی (EXPLAIN ANALYZE روی ۱۰۰هزار فاکتور) انتخاب شده؛ نتیجه در گزارش کارایی نسخهٔ 1.75.0 آمده است.
-- توجه: ساخت ایندکس روی جدول بزرگ برای لحظاتی نوشتن را قفل می‌کند (مهاجرت‌ها داخل تراکنش‌اند و CONCURRENTLY ممکن نیست)؛ راهنمای استقرار را ببینید.

-- ۱) فهرست‌ها و همگام‌سازی: ORDER BY updated_at DESC, id با (cafe_id) ثابت → بدون مرتب‌سازی؛ پایهٔ صفحه‌بندی کلیدی (cursor) هم هست.
CREATE INDEX IF NOT EXISTS customers_upd_idx            ON customers(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_upd_idx             ON invoices(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payments_upd_idx             ON payments(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_upd_idx               ON orders(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS inventory_upd_idx            ON inventory(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS inventory_movements_upd_idx  ON inventory_movements(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_upd_idx         ON transactions(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_upd_idx             ON expenses(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS accounts_upd_idx             ON accounts(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS obligations_upd_idx          ON obligations(cafe_id, updated_at DESC, id) WHERE deleted_at IS NULL;

-- ۲) مطالبات باز (داشبورد/گزارش): فقط فاکتورهای unpaid/partial؛ index-only
CREATE INDEX IF NOT EXISTS invoices_open_idx ON invoices(cafe_id) INCLUDE (remaining_amount) WHERE deleted_at IS NULL AND status IN ('unpaid','partial');

-- ۳) گزارش‌های بازه‌ای: جمع فروش/تخفیف/برترین مشتریان بدون خواندن جدول
CREATE INDEX IF NOT EXISTS invoices_report_idx ON invoices(cafe_id, date) INCLUDE (total_amount, discount, customer_id, customer_name) WHERE deleted_at IS NULL AND status <> 'void';
CREATE INDEX IF NOT EXISTS expenses_date_idx   ON expenses(cafe_id, date) INCLUDE (amount) WHERE deleted_at IS NULL;

-- ۴) پرداخت‌های هر مشتری (فیلتر ?customerId= و بررسی‌های تطبیق)
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments(cafe_id, customer_id) WHERE deleted_at IS NULL;

-- ۵) بررسی شمارهٔ فاکتور تکراری (گزارش خلاصه + تطبیق مالی): GROUP BY روی ایندکس مرتب، بدون Hash/Sort روی کل جدول
CREATE INDEX IF NOT EXISTS invoices_number_live_idx ON invoices(cafe_id, number) WHERE deleted_at IS NULL AND number <> '';
