-- 002: یکپارچگی مالی — پرداخت تغییرناپذیر با «برگشت»، دفتر کل حساب‌ها، دفتر انبار با موجودی اولیه، کلیدهای خارجی هم‌مستأجر.
-- مبلغ‌های مشتق (paid/remaining/status/balance/qty) فقط توسط سرور از منبع حقیقت ساخته می‌شوند؛ این مهاجرت قفل پایگاه‌داده‌ای هم می‌گذارد.

-- ── پرداخت‌ها: فقط «پرداخت» (مبلغ مثبت) یا «برگشت» (مبلغ منفی که به پرداخت اصلی اشاره می‌کند)؛ حذف/ویرایش مبلغ ممنوع ────────────────
ALTER TABLE payments ADD COLUMN kind        text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','reversal'));
ALTER TABLE payments ADD COLUMN reversal_of text;
ALTER TABLE payments ADD COLUMN void_reason text NOT NULL DEFAULT '';
ALTER TABLE payments ADD CONSTRAINT payments_amount_sign CHECK ((kind = 'payment' AND amount > 0) OR (kind = 'reversal' AND amount < 0));
ALTER TABLE payments ADD CONSTRAINT payments_reversal_shape CHECK ((kind = 'reversal') = (reversal_of IS NOT NULL));
ALTER TABLE payments ADD CONSTRAINT payments_reversal_fk FOREIGN KEY (cafe_id, reversal_of) REFERENCES payments(cafe_id, id);
CREATE UNIQUE INDEX payments_one_reversal_idx ON payments(cafe_id, reversal_of) WHERE reversal_of IS NOT NULL;   -- هر پرداخت فقط یک بار برگشت می‌خورد

CREATE FUNCTION payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.reversal_of IS DISTINCT FROM OLD.reversal_of THEN
    RAISE EXCEPTION 'payments_immutable: مبلغ، فاکتور و مشتریِ پرداخت ثبت‌شده تغییر نمی‌کند؛ از برگشت (void) استفاده کنید' USING ERRCODE = '23514';
  END IF;
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RAISE EXCEPTION 'payments_no_delete: پرداخت حذف نمی‌شود؛ از برگشت (void) استفاده کنید' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard_trg BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payments_guard();

-- ── فاکتور: اطلاعات ابطال ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN void_reason text NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN voided_at   timestamptz;
ALTER TABLE invoices ADD COLUMN voided_by   uuid REFERENCES users(id) ON DELETE SET NULL;

-- ── انبار: موجودی اولیه + حرکت‌ها = موجودی فعلی (قابل بازسازی) ────────────────────────────────────────────────────────
ALTER TABLE inventory ADD COLUMN opening_qty numeric(14,3) NOT NULL DEFAULT 0;
UPDATE inventory i SET opening_qty = i.qty - COALESCE((SELECT SUM(m.qty_delta) FROM inventory_movements m WHERE m.cafe_id = i.cafe_id AND m.item_id = i.id AND m.deleted_at IS NULL), 0);
ALTER TABLE inventory_movements ADD CONSTRAINT inv_mov_item_fk FOREIGN KEY (cafe_id, item_id) REFERENCES inventory(cafe_id, id);   -- حرکت فقط سرور و فقط برای کالای موجود ساخته می‌شود

-- ── دفتر کل حساب‌ها: مانده = مجموع ردیف‌ها (بدهکار مثبت، بستانکار منفی). ردیف‌ها تغییرناپذیرند ─────────────────────────────────────
CREATE TABLE ledger_entries (
  cafe_id     uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id          text NOT NULL,
  account_id  text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('opening','invoice','payment','reversal','adjustment','refund')),
  amount      bigint NOT NULL CHECK (amount <> 0),
  ref_type    text NOT NULL DEFAULT '',
  ref_id      text NOT NULL DEFAULT '',
  date        date,
  note        text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, id),
  FOREIGN KEY (cafe_id, account_id) REFERENCES accounts(cafe_id, id) ON DELETE CASCADE
);
CREATE INDEX ledger_account_idx ON ledger_entries(cafe_id, account_id, created_at);
CREATE INDEX ledger_ref_idx ON ledger_entries(cafe_id, ref_type, ref_id);
CREATE FUNCTION ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ledger_immutable: ردیف دفتر کل تغییر نمی‌کند؛ ردیف اصلاحی ثبت کنید' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER ledger_immutable_trg BEFORE UPDATE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
