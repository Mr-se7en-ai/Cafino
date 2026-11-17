-- 013: سبد خرید، گفتگو و پرداخت در مینی‌اپ (1.84) — فقط افزودنی.
-- قیمت‌ها همیشه در سرور از «تعرفهٔ عمومی» محاسبه می‌شود (مشتری فقط نام و تعداد می‌فرستد).

-- ── سبد: اقلام، جمع، روش و وضعیت پرداخت روی درخواست ──
ALTER TABLE miniapp_requests ADD COLUMN items      jsonb  NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 30);
ALTER TABLE miniapp_requests ADD COLUMN total      bigint NOT NULL DEFAULT 0 CHECK (total >= 0 AND total <= 1000000000000);   -- ریال
ALTER TABLE miniapp_requests ADD COLUMN pay_method text   NOT NULL DEFAULT 'cash' CHECK (pay_method IN ('cash', 'card'));
ALTER TABLE miniapp_requests ADD COLUMN pay_status text   NOT NULL DEFAULT 'unpaid' CHECK (pay_status IN ('unpaid', 'receipt_sent', 'paid', 'rejected'));
ALTER TABLE miniapp_requests ADD COLUMN pay_note   text   NOT NULL DEFAULT '' CHECK (length(pay_note) <= 1200);          -- دلیل ردِ رسید (به مشتری نشان داده می‌شود)
ALTER TABLE miniapp_requests ADD COLUMN pay_ref    text   NOT NULL DEFAULT '' CHECK (length(pay_ref) <= 160);            -- شمارهٔ پیگیری که مشتری می‌نویسد
ALTER TABLE miniapp_requests ADD COLUMN paid_at    timestamptz;
ALTER TABLE miniapp_requests ADD COLUMN paid_by    uuid REFERENCES users(id) ON DELETE SET NULL;

-- رسید کارت‌به‌کارت (تصویر کوچک؛ فقط jpeg/png/webp با بررسی امضای فایل)
CREATE TABLE miniapp_receipts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id     uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  request_id  uuid        NOT NULL REFERENCES miniapp_requests(id) ON DELETE CASCADE,
  telegram_id bigint      NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  mime        text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  data        bytea       NOT NULL CHECK (octet_length(data) BETWEEN 100 AND 1500000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miniapp_receipts_req_idx ON miniapp_receipts(request_id, created_at DESC);

-- ── تنظیمات پرداخت کافی‌نت (برای نمایش به مشتری در مینی‌اپ) ──
ALTER TABLE upload_settings ADD COLUMN pay_cash_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE upload_settings ADD COLUMN pay_card_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE upload_settings ADD COLUMN pay_card_number  text    NOT NULL DEFAULT '' CHECK (pay_card_number = '' OR pay_card_number ~ '^[0-9]{16}$');
ALTER TABLE upload_settings ADD COLUMN pay_card_holder  text    NOT NULL DEFAULT '' CHECK (length(pay_card_holder) <= 240);
ALTER TABLE upload_settings ADD COLUMN pay_bank         text    NOT NULL DEFAULT '' CHECK (length(pay_bank) <= 160);

-- ── گفتگو: یک رشتهٔ پیام برای هر مشتریِ تلگرام در هر کافی‌نت ──
CREATE TABLE miniapp_messages (
  id          bigserial   PRIMARY KEY,
  cafe_id     uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  telegram_id bigint      NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  sender      text        NOT NULL CHECK (sender IN ('customer', 'cafe')),
  by_user     uuid        REFERENCES users(id) ON DELETE SET NULL,
  by_name     text        NOT NULL DEFAULT '' CHECK (length(by_name) <= 400),
  request_id  uuid        REFERENCES miniapp_requests(id) ON DELETE SET NULL,
  body        text        NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  read_at     timestamptz,                                   -- زمان دیده‌شدن توسط «طرف مقابل»
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miniapp_messages_thread_idx ON miniapp_messages(cafe_id, telegram_id, id DESC);
CREATE INDEX miniapp_messages_unread_idx ON miniapp_messages(cafe_id, sender) WHERE read_at IS NULL;
