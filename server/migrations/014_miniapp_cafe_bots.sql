-- 014: ربات مینی‌اپ اختصاصی هر کافی‌نت (تلگرام یا بله) — فقط افزودنی.
-- هر کافی‌نت می‌تواند توکن رباتِ خودش را وارد کند؛ مینی‌اپ همان کافی‌نت از طریق همان ربات باز می‌شود.
-- توکن فقط رمزنگاری‌شده (AES-256-GCM، همان کلید ربات‌های گزارش) ذخیره می‌شود.

CREATE TABLE miniapp_cafe_bots (
  cafe_id       uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  provider      text        NOT NULL CHECK (provider IN ('telegram','bale')),
  token_enc     text        NOT NULL,
  token_hint    text        NOT NULL DEFAULT '' CHECK (length(token_hint) <= 8),
  bot_id        bigint      NOT NULL,
  bot_username  text        NOT NULL DEFAULT '' CHECK (length(bot_username) <= 64),
  bot_name      text        NOT NULL DEFAULT '' CHECK (length(bot_name) <= 240),
  enabled       boolean     NOT NULL DEFAULT true,
  update_offset bigint      NOT NULL DEFAULT 0,
  lease_until   timestamptz,
  last_poll_at  timestamptz,
  last_ok_at    timestamptz,
  last_error    text        NOT NULL DEFAULT '' CHECK (length(last_error) <= 600),
  last_error_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, provider),
  UNIQUE (provider, bot_id)               -- یک ربات فقط برای یک کافی‌نت (دو کافی‌نت نمی‌توانند یک توکن را بردارند)
);
CREATE INDEX miniapp_cafe_bots_poll ON miniapp_cafe_bots (last_poll_at NULLS FIRST) WHERE enabled;

-- هویت «محدود به کافی‌نت»: کاربرِ ربات اختصاصی یک شناسهٔ مصنوعی (≥ 10^15) می‌گیرد، نه شناسهٔ واقعی تلگرام/بله.
-- دلیل امنیتی: صاحب ربات اختصاصی توکن را دارد و می‌تواند initData با هر شناسه‌ای امضا کند؛ با شناسهٔ مصنوعی چنین جعلی
-- فقط «هویت‌های همان کافی‌نت» را می‌سازد و هرگز به حساب واقعی کاربر در ربات مشترک/کافی‌نت‌های دیگر نمی‌رسد.
CREATE SEQUENCE miniapp_synth_id_seq START 1000000000000000 MINVALUE 1000000000000000 NO CYCLE;
CREATE TABLE miniapp_identities (
  cafe_id     uuid   NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  provider    text   NOT NULL CHECK (provider IN ('telegram','bale')),
  raw_id      bigint NOT NULL,                          -- شناسهٔ کاربر در همان پیام‌رسان
  telegram_id bigint NOT NULL UNIQUE,                   -- شناسهٔ مصنوعی که در جدول‌های مینی‌اپ استفاده می‌شود
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, provider, raw_id)
);
