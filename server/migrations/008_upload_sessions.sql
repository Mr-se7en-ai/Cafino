-- 008: QR موقت هر سفارش/جلسه، اتصال فایل به سفارش/مشتری، نگه‌داری ویژه، ضدویروس، پاکسازی فایل‌های انجام‌شده (افزودنی؛ 007 دست‌نخورده).
-- «جلسه» = یک QR موقت با کد یکتای ۸۰ بیتی و زمان انقضا؛ مشتری فقط می‌تواند فایل بفرستد (هرگز فهرست یا دانلود ندارد).
-- ارجاع سفارش/مشتری متن آزاد است (شناسهٔ برنامهٔ کافی‌نت)، چون سفارش‌ها در برنامه هستند؛ اینجا فقط برچسب و ارجاع نگه‌داری می‌شود.

ALTER TABLE upload_settings
  ADD COLUMN done_retention_days integer NOT NULL DEFAULT 7 CHECK (done_retention_days BETWEEN 1 AND 365);

CREATE TABLE upload_sessions (
  cafe_id        uuid        NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  code           text        NOT NULL UNIQUE CHECK (code ~ '^[a-z2-7]{16}$'),
  label          text        NOT NULL DEFAULT '' CHECK (length(label) <= 80),     -- متنی که به مشتری نشان داده می‌شود (مثلاً «سفارش چاپ ۱۲۴»)
  order_ref      text        NOT NULL DEFAULT '' CHECK (length(order_ref) <= 64),
  order_label    text        NOT NULL DEFAULT '' CHECK (length(order_label) <= 120),
  customer_ref   text        NOT NULL DEFAULT '' CHECK (length(customer_ref) <= 64),
  customer_label text        NOT NULL DEFAULT '' CHECK (length(customer_label) <= 120),
  max_files      integer     NOT NULL DEFAULT 20 CHECK (max_files BETWEEN 1 AND 100),   -- سقف کل فایل‌های این جلسه
  max_file_mb    integer     CHECK (max_file_mb BETWEEN 1 AND 100),                      -- خالی = سقف عمومی کافی‌نت
  expires_at     timestamptz NOT NULL,
  closed_at      timestamptz,
  created_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX upload_sessions_list_idx ON upload_sessions (cafe_id, created_at DESC);

ALTER TABLE customer_uploads
  ADD COLUMN session_id     uuid,
  ADD COLUMN order_ref      text    NOT NULL DEFAULT '' CHECK (length(order_ref) <= 64),
  ADD COLUMN order_label    text    NOT NULL DEFAULT '' CHECK (length(order_label) <= 120),
  ADD COLUMN customer_ref   text    NOT NULL DEFAULT '' CHECK (length(customer_ref) <= 64),
  ADD COLUMN customer_label text    NOT NULL DEFAULT '' CHECK (length(customer_label) <= 120),
  ADD COLUMN protected      boolean NOT NULL DEFAULT false,                -- «نگه‌داری ویژه»: پاک‌سازی خودکار و حذف گروهی آن را کنار می‌گذارند
  ADD COLUMN scan_status    text    NOT NULL DEFAULT 'skipped' CHECK (scan_status IN ('clean','skipped')),
  ADD COLUMN secret_hash    text    NOT NULL DEFAULT '',                   -- هش رمز وضعیت: فقط ارسال‌کننده با همان رمز وضعیت ارسال خودش را می‌بیند
  ADD COLUMN derived_from   uuid;                                          -- فایل ساخته‌شده با ابزارهای PDF از این فایل
CREATE INDEX customer_uploads_session_idx ON customer_uploads (cafe_id, session_id) WHERE deleted_at IS NULL AND session_id IS NOT NULL;
CREATE INDEX customer_uploads_order_idx ON customer_uploads (cafe_id, order_ref) WHERE deleted_at IS NULL AND order_ref <> '';
CREATE INDEX customer_uploads_customer_idx ON customer_uploads (cafe_id, customer_ref) WHERE deleted_at IS NULL AND customer_ref <> '';

-- فایل‌هایی که ضدویروس رد کرد (ذخیره نمی‌شوند؛ فقط نام، نام امضا و زمان برای اطلاع کافی‌نت)
CREATE TABLE upload_blocked (
  cafe_id    uuid        NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  file_name  text        NOT NULL DEFAULT '',
  reason     text        NOT NULL DEFAULT '' CHECK (length(reason) <= 120),
  ip_hash    text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX upload_blocked_idx ON upload_blocked (cafe_id, created_at DESC);
