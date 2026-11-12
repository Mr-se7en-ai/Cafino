-- 003: سخت‌سازی مالی (نسخهٔ 1.75.0) — «حذف فیزیکی هرگز تاریخچهٔ مالی را پاک نمی‌کند».
-- مهاجرت‌های 001 و 002 دست‌نخورده‌اند؛ هرچه اینجا هست افزوده/جایگزین‌شده است و داده‌ای را تغییر یا حذف نمی‌کند.
--   1) ON DELETE CASCADE روی اسناد مالی و داده‌های کسب‌وکار → RESTRICT (حذف کافی‌نت/حساب دیگر دفتر کل و پرداخت‌ها را پاک نمی‌کند)
--   2) ممنوعیت DELETE و TRUNCATE روی پرداخت، دفتر کل، فاکتور، حساب، تراکنش، هزینه، تعهد، حرکت انبار و گزارش حسابرسی (تریگر — برای همهٔ نقش‌ها)
--   3) تغییرناپذیری ردیف پرداخت ثبت‌شده (مبلغ/نوع/فاکتور/مشتری/حساب؛ روش و تاریخ طبق رفتار موجود فقط با دلیل توسط مدیر) و غیرقابل‌ویرایش بودن گزارش حسابرسی؛ اصلاح فقط با سند اصلاحی/برگشت (INSERT)
--   4) تابع cafino_apply_app_grants(role): نقش پایگاه‌دادهٔ API فقط SELECT/INSERT/UPDATE روی جدول‌های مالی دارد (نه DELETE/TRUNCATE/DDL)

-- ── ۱) کلیدهای خارجی ──────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.contype = 'f' AND c.confdeltype = 'c'
       AND c.conrelid::regclass::text IN ('customers','inventory','inventory_movements','orders','invoices','payments','accounts','transactions','expenses','obligations','ledger_entries')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s NOT VALID', r.tbl, r.conname, replace(r.def, 'ON DELETE CASCADE', 'ON DELETE RESTRICT'));
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- ── ۲) حذف فیزیکی/TRUNCATE ممنوع ───────────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION financial_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'financial_no_delete: حذف فیزیکی از «%» ممنوع است؛ تاریخچهٔ مالی پاک نمی‌شود (حذف نرم/برگشت/سند اصلاحی)', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payments','ledger_entries','invoices','accounts','transactions','expenses','obligations','inventory_movements','audit_log'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION financial_no_delete()', t || '_no_delete_trg', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION financial_no_delete()', t || '_no_truncate_trg', t);
  END LOOP;
END $$;

-- ── ۳) تغییرناپذیری ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- پرداخت: مبلغ/نوع/فاکتور/مشتری/حساب/شناسه پس از ثبت تغییر نمی‌کند. «روش» و «تاریخ» همچنان با رفتار موجود (فقط مدیر، با دلیل، با حسابرسی) قابل اصلاح‌اند — تصمیم تجاری؛ اصلاح مبلغ = برگشت + پرداخت تازه.
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cafe_id IS DISTINCT FROM OLD.cafe_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.reversal_of IS DISTINCT FROM OLD.reversal_of
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR (OLD.void_reason <> '' AND NEW.void_reason IS DISTINCT FROM OLD.void_reason) THEN
    RAISE EXCEPTION 'payments_immutable: پرداخت ثبت‌شده تغییر نمی‌کند (مبلغ/فاکتور/مشتری/حساب)؛ از برگشت (void) و ثبت پرداخت تازه استفاده کنید' USING ERRCODE = '23514';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'payments_no_delete: پرداخت حذف نمی‌شود؛ از برگشت (void) استفاده کنید' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- گزارش حسابرسی (زنجیرهٔ هش): فقط افزودن
CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log_immutable: گزارش حسابرسی تغییر نمی‌کند' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER audit_log_immutable_trg BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- ── ۴) دسترسی نقش پایگاه‌دادهٔ API ─────────────────────────────────────────────────────────────────────────────────────────
-- نقش اجرای برنامه (مثلاً cafino_app) نباید مالک جدول‌ها باشد (مالک می‌تواند تریگر را غیرفعال کند). مهاجرت‌ها با نقش مالک اجرا می‌شوند
-- (MIGRATION_DATABASE_URL) و برنامه با DATABASE_URL نقش محدود؛ پس از هر مهاجرت دسترسی‌ها دوباره اعمال می‌شود (APP_DB_ROLE).
CREATE FUNCTION cafino_apply_app_grants(app_role text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t text;
  fin text[] := ARRAY['payments','ledger_entries','invoices','accounts','transactions','expenses','obligations','inventory_movements','audit_log'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN RAISE EXCEPTION 'نقش % وجود ندارد', app_role; END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', app_role);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', app_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO %I', app_role);
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT (tablename = ANY (fin)) AND tablename <> 'schema_migrations' LOOP
    EXECUTE format('GRANT DELETE ON %I TO %I', t, app_role);            -- فقط داده‌های موقت/غیرمالی (توکن، کلید Idempotency، تیکت، تنظیمات…)
  END LOOP;
  EXECUTE format('REVOKE INSERT, UPDATE ON schema_migrations FROM %I', app_role);
  EXECUTE format('REVOKE UPDATE ON ledger_entries FROM %I', app_role);   -- دفتر کل: فقط افزودن
  EXECUTE format('REVOKE UPDATE ON audit_log FROM %I', app_role);        -- حسابرسی: فقط افزودن
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
END $$;
REVOKE ALL ON FUNCTION cafino_apply_app_grants(text) FROM PUBLIC;

-- اگر نقش پیش‌فرض cafino_app از قبل ساخته شده، دسترسی‌ها همین‌جا اعمال می‌شود (نبودن نقش خطا نیست)
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cafino_app') THEN PERFORM cafino_apply_app_grants('cafino_app'); END IF; END $$;
