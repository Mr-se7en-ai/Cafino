-- 006: مدیریت شیفت صندوق + درخواست اصلاح مالی با تأیید مدیر (افزودنی؛ مهاجرت‌های قبلی دست‌نخورده).
-- هیچ جدول مالی موجود تغییر نمی‌کند؛ شیفت فقط «پنجرهٔ زمانی + شمارش نقدی» است و ارقام را از پرداخت‌ها/هزینه‌ها محاسبه می‌کند.

CREATE TABLE cash_shifts (
  cafe_id        uuid        NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  id             text        NOT NULL,
  status         text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_by      uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opened_by_name text        NOT NULL DEFAULT '',
  opened_at      timestamptz NOT NULL DEFAULT now(),
  opening_cash   bigint      NOT NULL CHECK (opening_cash >= 0),
  closed_by      uuid        REFERENCES users(id) ON DELETE RESTRICT,
  closed_by_name text        NOT NULL DEFAULT '',
  closed_at      timestamptz,
  expected_cash  bigint,
  counted_cash   bigint      CHECK (counted_cash >= 0),
  difference     bigint,                                  -- شمارش − مورد انتظار (منفی = کسری، مثبت = اضافه)
  totals         jsonb       NOT NULL DEFAULT '{}',       -- عکس لحظهٔ بستن (دریافت‌ها به تفکیک روش، برگشت‌ها، هزینه‌ها…)
  note           text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, id),
  CONSTRAINT cash_shifts_closed_shape CHECK ((status = 'open') = (closed_at IS NULL) AND (status = 'open') = (counted_cash IS NULL))
);
CREATE UNIQUE INDEX cash_shifts_one_open_idx ON cash_shifts(cafe_id) WHERE status = 'open';     -- هر کافی‌نت هم‌زمان فقط یک شیفت باز (صندوق یکی است)
CREATE INDEX cash_shifts_opened_idx ON cash_shifts(cafe_id, opened_at DESC);

CREATE FUNCTION cash_shifts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'closed' THEN RAISE EXCEPTION 'cash_shifts_guard: شیفت بسته‌شده تغییرناپذیر است' USING ERRCODE = '23001'; END IF;
  IF NEW.opened_at <> OLD.opened_at OR NEW.opened_by <> OLD.opened_by OR NEW.opening_cash <> OLD.opening_cash THEN
    RAISE EXCEPTION 'cash_shifts_guard: زمان/مسئول/موجودی آغازین شیفت تغییر نمی‌کند' USING ERRCODE = '23001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cash_shifts_guard_trg BEFORE UPDATE ON cash_shifts FOR EACH ROW EXECUTE FUNCTION cash_shifts_guard();
CREATE TRIGGER cash_shifts_no_delete_trg BEFORE DELETE ON cash_shifts FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
CREATE TRIGGER cash_shifts_no_truncate_trg BEFORE TRUNCATE ON cash_shifts FOR EACH STATEMENT EXECUTE FUNCTION financial_no_delete();

CREATE TABLE correction_requests (
  cafe_id       uuid        NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  id            text        NOT NULL,
  scope         text[]      NOT NULL CHECK (cardinality(scope) > 0),
  reason        text        NOT NULL CHECK (char_length(btrim(reason)) >= 5),
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','failed')),
  requested_by  uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_by    uuid        REFERENCES users(id) ON DELETE RESTRICT,
  decided_at    timestamptz,
  decision_note text        NOT NULL DEFAULT '',
  preview       jsonb       NOT NULL DEFAULT '{}',        -- نتیجهٔ dry-run لحظهٔ درخواست (چه چیزی تغییر می‌کرد)
  result        jsonb,                                    -- نتیجهٔ اجرای واقعی پس از تأیید (پیش/پس از)
  PRIMARY KEY (cafe_id, id),
  CONSTRAINT correction_requests_decided_shape CHECK ((status = 'pending') = (decided_at IS NULL))
);
CREATE INDEX correction_requests_status_idx ON correction_requests(cafe_id, status, requested_at DESC);
CREATE FUNCTION correction_requests_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'correction_requests_guard: درخواست تصمیم‌گرفته‌شده تغییرناپذیر است' USING ERRCODE = '23001'; END IF;
  IF NEW.scope <> OLD.scope OR NEW.reason <> OLD.reason OR NEW.requested_by <> OLD.requested_by THEN RAISE EXCEPTION 'correction_requests_guard: محتوای درخواست تغییر نمی‌کند' USING ERRCODE = '23001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER correction_requests_guard_trg BEFORE UPDATE ON correction_requests FOR EACH ROW EXECUTE FUNCTION correction_requests_guard();
CREATE TRIGGER correction_requests_no_delete_trg BEFORE DELETE ON correction_requests FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
CREATE TRIGGER correction_requests_no_truncate_trg BEFORE TRUNCATE ON correction_requests FOR EACH STATEMENT EXECUTE FUNCTION financial_no_delete();

-- نقش محدود API: دو جدول تازه هم «فقط افزودن/به‌روزرسانی» (بدون DELETE) — تعریف تابع با فهرست مالی گسترده‌شده جایگزین می‌شود
CREATE OR REPLACE FUNCTION cafino_apply_app_grants(app_role text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t text;
  fin text[] := ARRAY['payments','ledger_entries','invoices','accounts','transactions','expenses','obligations','inventory_movements','audit_log','cash_shifts','correction_requests'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN RAISE EXCEPTION 'نقش % وجود ندارد', app_role; END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', app_role);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', app_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO %I', app_role);
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT (tablename = ANY (fin)) AND tablename <> 'schema_migrations' LOOP
    EXECUTE format('GRANT DELETE ON %I TO %I', t, app_role);
  END LOOP;
  EXECUTE format('REVOKE INSERT, UPDATE ON schema_migrations FROM %I', app_role);
  EXECUTE format('REVOKE UPDATE ON ledger_entries FROM %I', app_role);
  EXECUTE format('REVOKE UPDATE ON audit_log FROM %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
END $$;
REVOKE ALL ON FUNCTION cafino_apply_app_grants(text) FROM PUBLIC;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cafino_app') THEN PERFORM cafino_apply_app_grants('cafino_app'); END IF; END $$;

-- ایندکس کمکی گزارش شیفت: دریافت‌ها/هزینه‌های نقدی بر پایهٔ زمان ثبت روی سرور
CREATE INDEX payments_created_idx ON payments(cafe_id, created_at) INCLUDE (amount, method, kind) WHERE deleted_at IS NULL;
CREATE INDEX expenses_created_idx ON expenses(cafe_id, created_at) INCLUDE (amount, method) WHERE deleted_at IS NULL;
CREATE INDEX transactions_created_idx ON transactions(cafe_id, created_at) INCLUDE (amount, method, type) WHERE deleted_at IS NULL;
