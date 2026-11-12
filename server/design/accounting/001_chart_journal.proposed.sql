-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- پیشنهاد مرحله‌ای: حسابداری پیشرفته (Chart of Accounts / Journal / Trial Balance / P&L / Balance Sheet / Cash Flow)
-- وضعیت: «طراحی» — در server/migrations نیست و هیچ‌جا اجرا نمی‌شود. به هیچ جدول/تریگر موجود (invoices, payments, ledger_entries…) وصل نیست.
-- اتصال به سیستم مالی فعلی فقط با تأیید صریح مدیر و طبق design/accounting/README-fa.md (مرحلهٔ ۳) انجام می‌شود.
-- اعتبارسنجی: test/accountingDesign.test.js همین فایل را روی PostgreSQL واقعی اعمال و ترازنامه/سود و زیان را با دادهٔ نمونه می‌سنجد.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE coa_accounts (
  cafe_id    uuid    NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  code       text    NOT NULL CHECK (code ~ '^[0-9]{1,12}$'),
  name       text    NOT NULL CHECK (char_length(btrim(name)) > 0),
  type       text    NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  parent     text,
  is_cash    boolean NOT NULL DEFAULT false,            -- حساب‌های «وجه نقد و بانک» برای صورت جریان وجوه نقد
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, code),
  FOREIGN KEY (cafe_id, parent) REFERENCES coa_accounts(cafe_id, code) ON DELETE RESTRICT
);

CREATE TABLE journal_entries (
  cafe_id     uuid   NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  id          text   NOT NULL,
  seq         bigint GENERATED ALWAYS AS IDENTITY,       -- شمارهٔ پیوستهٔ سند
  entry_date  date   NOT NULL,
  memo        text   NOT NULL DEFAULT '',
  source_type text   NOT NULL DEFAULT 'manual',          -- manual | invoice | payment | expense | adjustment (فقط برچسب؛ بدون FK به جدول‌های فعلی)
  source_id   text   NOT NULL DEFAULT '',
  status      text   NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  reversal_of text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, id),
  UNIQUE (cafe_id, source_type, source_id, reversal_of),  -- یک منبع دوبار پست نمی‌شود
  FOREIGN KEY (cafe_id, reversal_of) REFERENCES journal_entries(cafe_id, id)
);

CREATE TABLE journal_lines (
  cafe_id   uuid   NOT NULL,
  entry_id  text   NOT NULL,
  line_no   int    NOT NULL,
  account   text   NOT NULL,
  debit     bigint NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit    bigint NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo      text   NOT NULL DEFAULT '',
  PRIMARY KEY (cafe_id, entry_id, line_no),
  FOREIGN KEY (cafe_id, entry_id) REFERENCES journal_entries(cafe_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (cafe_id, account)  REFERENCES coa_accounts(cafe_id, code) ON DELETE RESTRICT,
  CHECK ((debit = 0) <> (credit = 0))                    -- هر خط دقیقاً یک طرف
);
CREATE INDEX journal_lines_account_idx ON journal_lines(cafe_id, account);

-- تراز بودن هر سند: جمع بدهکار = جمع بستانکار (بررسی در انتهای تراکنش، پس خطوط می‌توانند پشت‌سرهم درج شوند)
CREATE FUNCTION journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d bigint; c bigint; n int;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*) INTO d, c, n FROM journal_lines WHERE cafe_id = NEW.cafe_id AND entry_id = NEW.entry_id;
  IF n < 2 OR d <> c THEN RAISE EXCEPTION 'سند حسابداری تراز نیست (بدهکار=% بستانکار=% خط=%)', d, c, n USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balanced_trg AFTER INSERT ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_balanced();

-- اسناد پست‌شده تغییرناپذیرند؛ اصلاح فقط با سند معکوس (مثل جدول پرداخت‌ها)
CREATE FUNCTION journal_lines_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'journal_immutable: خط سند حسابداری تغییر یا حذف نمی‌شود؛ سند معکوس بزنید' USING ERRCODE = '23001'; END $$;
CREATE FUNCTION journal_entries_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- تنها تغییر مجاز: posted → reversed (پس از ثبت سند معکوس)، بدون دست‌زدن به شناسه/تاریخ/شرح
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND NEW.status = 'reversed' AND NEW.id = OLD.id AND NEW.entry_date = OLD.entry_date AND NEW.memo = OLD.memo THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'journal_immutable: سند حسابداری تغییر یا حذف نمی‌شود؛ سند معکوس بزنید' USING ERRCODE = '23001';
END $$;
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION journal_entries_immutable();
CREATE TRIGGER journal_lines_immutable   BEFORE UPDATE OR DELETE ON journal_lines   FOR EACH ROW EXECUTE FUNCTION journal_lines_immutable();

-- ── گزارش‌ها (View روی اسناد پست‌شده؛ سند معکوس‌شده و معکوس آن هر دو در جمع می‌آیند و اثرشان خنثی است) ──
CREATE VIEW v_trial_balance AS
SELECT a.cafe_id, a.code, a.name, a.type, COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit,
       COALESCE(SUM(l.debit - l.credit),0) AS balance            -- مثبت = مانده بدهکار
FROM coa_accounts a LEFT JOIN journal_lines l ON l.cafe_id = a.cafe_id AND l.account = a.code
GROUP BY a.cafe_id, a.code, a.name, a.type;

-- سود و زیان بازه‌ای: تابع (چون به بازهٔ تاریخ نیاز دارد)
CREATE FUNCTION fn_income_statement(p_cafe uuid, p_from date, p_to date)
RETURNS TABLE(code text, name text, type text, amount bigint) LANGUAGE sql STABLE AS $$
  SELECT a.code, a.name, a.type, CASE WHEN a.type = 'revenue' THEN SUM(l.credit - l.debit) ELSE SUM(l.debit - l.credit) END
  FROM journal_lines l JOIN journal_entries e ON e.cafe_id = l.cafe_id AND e.id = l.entry_id JOIN coa_accounts a ON a.cafe_id = l.cafe_id AND a.code = l.account
  WHERE l.cafe_id = p_cafe AND a.type IN ('revenue','expense') AND e.entry_date BETWEEN p_from AND p_to GROUP BY a.code, a.name, a.type
$$;
-- ترازنامه در یک تاریخ: دارایی = بدهی + حقوق صاحبان سرمایه + (سود/زیان انباشتهٔ تا آن تاریخ)
CREATE FUNCTION fn_balance_sheet(p_cafe uuid, p_asof date)
RETURNS TABLE(section text, code text, name text, amount bigint) LANGUAGE sql STABLE AS $$
  WITH b AS (SELECT a.code, a.name, a.type, SUM(l.debit - l.credit) AS bal FROM journal_lines l JOIN journal_entries e ON e.cafe_id = l.cafe_id AND e.id = l.entry_id JOIN coa_accounts a ON a.cafe_id = l.cafe_id AND a.code = l.account WHERE l.cafe_id = p_cafe AND e.entry_date <= p_asof GROUP BY a.code, a.name, a.type)
  SELECT 'asset', code, name, bal FROM b WHERE type = 'asset'
  UNION ALL SELECT 'liability', code, name, -bal FROM b WHERE type = 'liability'
  UNION ALL SELECT 'equity', code, name, -bal FROM b WHERE type = 'equity'
  UNION ALL SELECT 'equity', '—', 'سود/زیان انباشته', -COALESCE(SUM(bal) FILTER (WHERE type IN ('revenue','expense')), 0) FROM b
$$;
-- جریان وجه نقد (روش مستقیم): حرکت حساب‌های is_cash، به تفکیک حساب مقابل
CREATE FUNCTION fn_cash_flow(p_cafe uuid, p_from date, p_to date)
RETURNS TABLE(counter_account text, name text, inflow bigint, outflow bigint) LANGUAGE sql STABLE AS $$
  SELECT o.account, ca.name, COALESCE(SUM(c.debit),0), COALESCE(SUM(c.credit),0)
  FROM journal_lines c JOIN coa_accounts cash ON cash.cafe_id = c.cafe_id AND cash.code = c.account AND cash.is_cash
  JOIN journal_entries e ON e.cafe_id = c.cafe_id AND e.id = c.entry_id
  JOIN journal_lines o ON o.cafe_id = c.cafe_id AND o.entry_id = c.entry_id AND o.account <> c.account
  JOIN coa_accounts ca ON ca.cafe_id = o.cafe_id AND ca.code = o.account AND NOT ca.is_cash
  WHERE c.cafe_id = p_cafe AND e.entry_date BETWEEN p_from AND p_to GROUP BY o.account, ca.name
$$;
