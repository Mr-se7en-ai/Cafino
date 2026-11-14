-- 010: اتصال به ربات بله و تلگرام برای دریافت گزارش (افزودنی؛ مهاجرت‌های قبلی دست‌نخورده).
-- هر کافی‌نت برای هر پیام‌رسان حداکثر یک ربات دارد. توکن ربات رمزنگاری‌شده (AES-256-GCM) ذخیره می‌شود و هرگز به کلاینت برنمی‌گردد.
-- پیوند با چت: مدیر کد یک‌بارمصرف (هش‌شده، ۱۰ دقیقه) می‌گیرد و «/start کد» را به ربات می‌فرستد؛ فقط چت پیوندخورده فرمان می‌گیرد.

CREATE TABLE bot_connections (
  cafe_id          uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  provider         text        NOT NULL CHECK (provider IN ('telegram','bale')),
  token_enc        text        NOT NULL,                                   -- v1.iv.tag.ciphertext (base64url)
  token_hint       text        NOT NULL DEFAULT '' CHECK (length(token_hint) <= 8),   -- چهار نویسهٔ آخر برای شناسایی
  bot_id           text        NOT NULL DEFAULT '',
  bot_username     text        NOT NULL DEFAULT '' CHECK (length(bot_username) <= 64),
  bot_name         text        NOT NULL DEFAULT '' CHECK (length(bot_name) <= 120),
  chat_id          text,                                                   -- خالی = هنوز پیوند نخورده
  chat_title       text        NOT NULL DEFAULT '' CHECK (length(chat_title) <= 120),
  chat_type        text        NOT NULL DEFAULT '' CHECK (length(chat_type) <= 20),
  link_hash        text,                                                   -- SHA-256 کد پیوند
  link_expires_at  timestamptz,
  link_fails       integer     NOT NULL DEFAULT 0,                         -- کد غلط پشت‌سرهم؛ بعد از ۵ بار کد باطل می‌شود
  enabled          boolean     NOT NULL DEFAULT true,
  commands_enabled boolean     NOT NULL DEFAULT true,                      -- پاسخ به فرمان‌هایی مثل /today
  daily_enabled    boolean     NOT NULL DEFAULT false,
  daily_time       text        NOT NULL DEFAULT '21:00' CHECK (daily_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  low_stock_alert  boolean     NOT NULL DEFAULT true,                      -- هشدار کمبود موجودی داخل گزارش روزانه
  currency         text        NOT NULL DEFAULT 'toman' CHECK (currency IN ('toman','rial')),
  last_daily_date  date,
  next_try_at      timestamptz,                                            -- عقب‌نشینی پس از خطا / محدودیت نرخ (برای دریافت فرمان)
  daily_retry_at   timestamptz,                                            -- تلاش دوبارهٔ گزارش روزانه پس از خطا
  update_offset    bigint      NOT NULL DEFAULT 0,
  lease_until      timestamptz,                                            -- اجارهٔ پردازش (چند نمونهٔ API هم‌زمان یک ربات را پردازش نکنند)
  last_ok_at       timestamptz,
  last_error       text        NOT NULL DEFAULT '' CHECK (length(last_error) <= 300),
  last_error_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, provider)
);
CREATE INDEX bot_connections_active_idx ON bot_connections (enabled) WHERE enabled;
