-- 1.88.0 — پیامک (ملی پیامک): کد یک‌بارمصرف ورود/ثبت‌نام/تأیید موبایل + اتصال پیامک هر کافی‌نت + سابقهٔ ارسال به مشتریان.
-- هیچ رمز یا کد خامی در پایگاه‌داده نیست: کد OTP فقط به‌صورت HMAC، و رمز پنل پیامک کافی‌نت با AES-256-GCM رمزنگاری می‌شود.

-- ۱) موبایل تأییدشدهٔ کاربر (برای «ورود با پیامک»). فقط بعد از تأیید کد ثبت می‌شود و یکتاست.
ALTER TABLE users ADD COLUMN phone_norm text, ADD COLUMN phone_verified_at timestamptz;
ALTER TABLE users ADD CONSTRAINT users_phone_norm_chk CHECK (phone_norm IS NULL OR phone_norm ~ '^09[0-9]{9}$');
CREATE UNIQUE INDEX users_phone_norm_uq ON users(phone_norm) WHERE phone_norm IS NOT NULL;

-- ۲) کدهای یک‌بارمصرف
CREATE TABLE sms_otps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose     text NOT NULL CHECK (purpose IN ('login','register','verify')),
  phone       text NOT NULL CHECK (phone ~ '^09[0-9]{9}$'),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,     -- ورود: کاربر مقصد (برای شمارهٔ ناشناخته NULL و پیامکی هم فرستاده نمی‌شود)
  code_hash   text NOT NULL,                                    -- HMAC(کلید سرور، شماره:هدف:کد) — خود کد هرگز ذخیره نمی‌شود
  attempts    int  NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_otps_phone_idx ON sms_otps(phone, purpose, created_at DESC);
CREATE INDEX sms_otps_ip_idx ON sms_otps(ip, created_at DESC);

-- ۳) اتصال پیامکِ هر کافی‌نت (حساب خود کافی‌نت در ملی پیامک؛ هزینه از اعتبار خودش)
CREATE TABLE sms_connections (
  cafe_id        uuid PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
  username_enc   text NOT NULL,
  password_enc   text NOT NULL,
  username_hint  text NOT NULL DEFAULT '',                      -- دو نویسهٔ اول + ستاره، فقط برای نمایش
  from_number    text NOT NULL,
  enabled        boolean NOT NULL DEFAULT true,
  last_ok_at     timestamptz,
  last_error     text,
  last_error_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ۴) سابقهٔ پیامک‌های ارسالی به مشتریان (متن و شماره برای پیگیری؛ فقط افزودنی از دید برنامه)
CREATE TABLE sms_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  batch_id      uuid,
  kind          text NOT NULL DEFAULT 'customer' CHECK (kind IN ('customer','test')),
  customer_ref  text,
  name          text,
  phone         text NOT NULL,
  body          text NOT NULL,
  parts         int  NOT NULL DEFAULT 1,
  status        text NOT NULL CHECK (status IN ('sent','failed')),
  provider_ref  text,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_messages_cafe_idx ON sms_messages(cafe_id, created_at DESC);
CREATE INDEX sms_messages_batch_idx ON sms_messages(cafe_id, batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX sms_messages_customer_idx ON sms_messages(cafe_id, customer_ref, created_at DESC) WHERE customer_ref IS NOT NULL;
