-- 012: بخش کافی‌نتِ مینی‌اپ تلگرام (1.81) — فقط افزودنی.
-- ورود کافی‌نت با «کد اتصال یک‌بارمصرف» که کاربر داخل برنامه می‌سازد؛ درخواست سفارش مشتری؛ صف دستور تغییر وضعیت سفارش (برنامه اعمال می‌کند).

-- کد اتصال: فقط هش نگه‌داری می‌شود؛ ۱۰ دقیقه اعتبار؛ یک‌بار مصرف
CREATE TABLE miniapp_staff_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id    uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text        NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miniapp_staff_codes_user_idx ON miniapp_staff_codes(user_id, created_at DESC);

-- اتصال حساب تلگرام به یک کاربر کافی‌نت (هر کاربر فقط یک حساب تلگرام؛ هر تلگرام در هر کافی‌نت یک کاربر)
CREATE TABLE telegram_staff_links (
  cafe_id     uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  telegram_id bigint      NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notify      boolean     NOT NULL DEFAULT true,
  linked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, telegram_id),
  UNIQUE (user_id)
);

-- درخواست سفارش مشتری از مینی‌اپ (سرور مرجع است؛ برنامه آن را می‌خواند و مدیریت می‌کند)
CREATE TABLE miniapp_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  telegram_id   bigint      NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  customer_id   text,
  customer_name text        NOT NULL DEFAULT '' CHECK (length(customer_name) <= 200),
  phone         text        NOT NULL DEFAULT '' CHECK (length(phone) <= 20),
  service       text        NOT NULL CHECK (length(service) BETWEEN 1 AND 120),
  note          text        NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  status        text        NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','rejected','done')),
  status_at     timestamptz,
  status_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  reply         text        NOT NULL DEFAULT '' CHECK (length(reply) <= 300),
  order_id      text,                                  -- شناسهٔ سفارشی که برنامه از این درخواست ساخته
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miniapp_requests_cafe_idx ON miniapp_requests(cafe_id, status, created_at DESC);
CREATE INDEX miniapp_requests_tg_idx ON miniapp_requests(cafe_id, telegram_id, created_at DESC);

-- صف تغییر وضعیت سفارش: سفارش‌ها در برنامه نگه‌داری می‌شوند؛ برنامه (وقتی باز است) دستور را اعمال و تأیید می‌کند
CREATE TABLE miniapp_order_actions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id    uuid        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  order_id   text        NOT NULL,
  status     text        NOT NULL CHECK (status IN ('new','inprogress','waiting_docs','completed','delivered')),
  by_user    uuid        REFERENCES users(id) ON DELETE SET NULL,
  by_name    text        NOT NULL DEFAULT '' CHECK (length(by_name) <= 200),
  result     text        NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','applied','not_found')),
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at    timestamptz
);
CREATE UNIQUE INDEX miniapp_order_actions_pending ON miniapp_order_actions(cafe_id, order_id) WHERE result = 'pending';
CREATE INDEX miniapp_order_actions_cafe_idx ON miniapp_order_actions(cafe_id, created_at DESC);
