-- 011: مینی‌اپ تلگرام مشتریان (ربات مشترک همهٔ کافی‌نت‌ها) — فقط افزودنی؛ مهاجرت‌های قبلی دست‌نخورده.
-- هویت = شناسهٔ عددی تلگرام (امضاشده در initData). شمارهٔ موبایل فقط وقتی «تأییدشده» است که تلگرام خودش آن را برای همان کاربر فرستاده باشد.

-- هر کافی‌نت می‌تواند مینی‌اپ خودش را خاموش کند (QR دریافت فایل و بقیهٔ بخش‌ها اثری نمی‌پذیرند)
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS miniapp_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE telegram_users (
  telegram_id       bigint      PRIMARY KEY,
  first_name        text        NOT NULL DEFAULT '' CHECK (length(first_name) <= 128),
  last_name         text        NOT NULL DEFAULT '' CHECK (length(last_name) <= 128),
  username          text        NOT NULL DEFAULT '' CHECK (length(username) <= 64),
  language          text        NOT NULL DEFAULT '' CHECK (length(language) <= 16),
  phone             text        NOT NULL DEFAULT '' CHECK (length(phone) <= 20),     -- فقط ۱۰ رقم آخر (مثلاً 9121234567)، پس از تأیید تلگرام
  phone_verified_at timestamptz,
  chat_id           bigint,                                                          -- گفتگوی خصوصی با ربات (برای اعلان‌های بعدی)
  last_cafe_id      uuid        REFERENCES cafes(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- اتصال یک حساب تلگرام به یک مشتریِ یک کافی‌نت. هر مشتری در هر کافی‌نت فقط یک حساب تلگرام دارد (اتصال تازه جایگزین قبلی می‌شود).
CREATE TABLE telegram_links (
  cafe_id      uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  telegram_id  bigint      NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  customer_id  text        NOT NULL,
  linked_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  PRIMARY KEY (cafe_id, telegram_id),
  UNIQUE (cafe_id, customer_id)
);

-- نسخهٔ عمومی تعرفهٔ کافی‌نت (از برنامه همگام می‌شود؛ منبع حقیقت تعرفهٔ خود برنامه است). فقط نام و قیمت (ریال).
CREATE TABLE shop_public_tariff (
  cafe_id    uuid        PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
  data       jsonb       NOT NULL DEFAULT '[]',
  hash       text        NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(data::text) <= 200000)
);

-- وضعیت ربات مشترک (یک ردیف): آفست getUpdates و اجارهٔ پردازش برای چند نمونهٔ سرور
CREATE TABLE miniapp_bot_state (
  id            smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  update_offset bigint      NOT NULL DEFAULT 0,
  bot_id        bigint,
  bot_username  text        NOT NULL DEFAULT '',
  lease_until   timestamptz,
  last_ok_at    timestamptz,
  last_error    text        NOT NULL DEFAULT '' CHECK (length(last_error) <= 300),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO miniapp_bot_state (id) VALUES (1) ON CONFLICT DO NOTHING;
