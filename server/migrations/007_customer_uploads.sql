-- 007: دریافت فایل از مشتری با QR (افزودنی؛ مهاجرت‌های قبلی دست‌نخورده).
-- هر کافی‌نت یک «کد عمومی» نامحدس (۸۰ بیت) دارد؛ QR به /u/<code> اشاره می‌کند. فایل‌ها روی دیسک (UPLOAD_DIR) و فقط متادیتا اینجاست.
-- این جدول‌ها مالی نیستند: حذف فایل = حذف فیزیکی دیسک + نشانهٔ deleted_at (سطر برای حسابرسی می‌ماند، نام فایل پاک می‌شود).

CREATE TABLE upload_settings (
  cafe_id        uuid        PRIMARY KEY REFERENCES cafes(id) ON DELETE RESTRICT,
  code           text        NOT NULL UNIQUE CHECK (code ~ '^[a-z2-7]{16}$'),
  enabled        boolean     NOT NULL DEFAULT true,
  max_file_mb    integer     NOT NULL DEFAULT 20  CHECK (max_file_mb BETWEEN 1 AND 100),
  max_files      integer     NOT NULL DEFAULT 10  CHECK (max_files BETWEEN 1 AND 30),
  retention_days integer     NOT NULL DEFAULT 30  CHECK (retention_days BETWEEN 1 AND 365),
  require_phone  boolean     NOT NULL DEFAULT false,
  notice         text        NOT NULL DEFAULT '' CHECK (length(notice) <= 300),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_uploads (
  cafe_id       uuid        NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  batch_id      uuid        NOT NULL,
  batch_code    text        NOT NULL CHECK (batch_code ~ '^[0-9]{5}$'),       -- کد پیگیری کوتاه که مشتری به کارمند نشان می‌دهد
  original_name text        NOT NULL,
  storage_key   text        NOT NULL,
  mime          text        NOT NULL DEFAULT '',
  size          bigint      NOT NULL CHECK (size >= 0),
  sha256        text        NOT NULL,
  sender_name   text        NOT NULL DEFAULT '',
  sender_phone  text        NOT NULL DEFAULT '',
  note          text        NOT NULL DEFAULT '',
  status        text        NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','printed','done')),
  ip_hash       text        NOT NULL DEFAULT '',                              -- هش IP (برای سقف سوءاستفاده؛ IP خام ذخیره نمی‌شود)
  created_at    timestamptz NOT NULL DEFAULT now(),
  status_at     timestamptz,
  status_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  deleted_at    timestamptz,
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX customer_uploads_list_idx ON customer_uploads (cafe_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX customer_uploads_code_idx ON customer_uploads (cafe_id, batch_code) WHERE deleted_at IS NULL;
CREATE INDEX customer_uploads_expiry_idx ON customer_uploads (created_at) WHERE deleted_at IS NULL;
