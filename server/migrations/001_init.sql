-- کافینو — طرح پایگاه‌داده (PostgreSQL ≥ 14)
-- اصول:
--  • هر کافی‌نت (cafe) یک «مستأجر» است؛ همهٔ جدول‌های کسب‌وکار با cafe_id جدا می‌شوند و کلید اصلی (cafe_id, id) است.
--  • شناسهٔ رکورد را کلاینت (برنامهٔ آفلاین) می‌سازد، پس id از نوع text است و ساخت تکراری بی‌خطر است.
--  • مبلغ‌ها عدد صحیح (ریال) در bigint؛ ستون data (jsonb) بقیهٔ فیلدهای برنامه را بدون گم‌شدن نگه می‌دارد.
--  • حذف نرم (deleted_at)؛ هیچ رکورد مالی به‌صورت فیزیکی پاک نمی‌شود.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cafes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  city        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cafes_org_idx ON cafes(org_id);

CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  cafe_id               uuid REFERENCES cafes(id) ON DELETE RESTRICT,   -- NULL برای مدیر پنل مرکزی
  email                 citext NOT NULL UNIQUE,
  password_hash         text NOT NULL,
  first_name            text NOT NULL DEFAULT '',
  last_name             text NOT NULL DEFAULT '',
  phone                 text NOT NULL DEFAULT '',
  role                  text NOT NULL CHECK (role IN ('owner','manager','staff','platform_admin')),
  is_active             boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT false,
  failed_logins         int NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'platform_admin') = (cafe_id IS NULL))
);
CREATE INDEX users_cafe_idx ON users(cafe_id);

-- Refresh token چرخشی؛ فقط هش نگه‌داری می‌شود. استفادهٔ دوبارهٔ توکن باطل‌شده = کل خانواده باطل می‌شود.
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  user_agent   text NOT NULL DEFAULT '',
  ip           text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_user_idx ON refresh_tokens(user_id);

CREATE TABLE password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user_idx ON password_resets(user_id);

-- ── دادهٔ کسب‌وکار (همه با cafe_id) ───────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE customers (
  cafe_id     uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id          text NOT NULL,
  first_name  text NOT NULL DEFAULT '',
  last_name   text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  wallet      bigint NOT NULL DEFAULT 0,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX customers_phone_idx ON customers(cafe_id, phone) WHERE deleted_at IS NULL;

CREATE TABLE inventory (
  cafe_id     uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id          text NOT NULL,
  name        text NOT NULL,
  cat         text NOT NULL DEFAULT '',
  qty         numeric(14,3) NOT NULL DEFAULT 0,
  min_qty     numeric(14,3) NOT NULL DEFAULT 0,
  unit        text NOT NULL DEFAULT '',
  unit_cost   bigint NOT NULL DEFAULT 0,
  sale_price  bigint NOT NULL DEFAULT 0,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  PRIMARY KEY (cafe_id, id)
);

CREATE TABLE inventory_movements (
  cafe_id     uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id          text NOT NULL,
  item_id     text NOT NULL,
  qty_delta   numeric(14,3) NOT NULL,
  reason      text NOT NULL DEFAULT '',
  ref         text NOT NULL DEFAULT '',
  date        date,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX inv_mov_item_idx ON inventory_movements(cafe_id, item_id);

CREATE TABLE orders (
  cafe_id      uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id           text NOT NULL,
  customer_id  text,
  title        text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'new',
  amount       bigint NOT NULL DEFAULT 0,
  sale_id      text,
  invoice_id   text,
  data         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX orders_status_idx ON orders(cafe_id, status) WHERE deleted_at IS NULL;

CREATE TABLE invoices (
  cafe_id           uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id                text NOT NULL,
  number            text NOT NULL DEFAULT '',
  sale_id           text,
  customer_id       text,
  customer_name     text NOT NULL DEFAULT '',
  date              date,
  due_date          date,
  items             jsonb NOT NULL DEFAULT '[]',
  subtotal          bigint NOT NULL DEFAULT 0,
  discount          bigint NOT NULL DEFAULT 0,
  total_amount      bigint NOT NULL DEFAULT 0,
  paid_amount       bigint NOT NULL DEFAULT 0,
  waived_amount     bigint NOT NULL DEFAULT 0,
  remaining_amount  bigint NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','void')),
  notes             text NOT NULL DEFAULT '',
  data              jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  PRIMARY KEY (cafe_id, id)
);
-- شمارهٔ فاکتور را هر دستگاه آفلاین می‌سازد؛ یکتایی سخت باعث گیرکردن صف همگام‌سازی می‌شد. تکراری‌ها در گزارش «تعارض شماره» دیده می‌شوند.
CREATE INDEX invoices_number_idx ON invoices(cafe_id, number);
CREATE INDEX invoices_customer_idx ON invoices(cafe_id, customer_id);
CREATE INDEX invoices_date_idx ON invoices(cafe_id, date) WHERE deleted_at IS NULL;

CREATE TABLE payments (
  cafe_id      uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id           text NOT NULL,
  invoice_id   text,
  customer_id  text,
  amount       bigint NOT NULL,
  method       text NOT NULL DEFAULT 'cash',
  date         date,
  account_id   text,
  data         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX payments_invoice_idx ON payments(cafe_id, invoice_id);
CREATE INDEX payments_date_idx ON payments(cafe_id, date) WHERE deleted_at IS NULL;

CREATE TABLE accounts (          -- دفتر حساب هر شخص/مشتری (بدهکار/بستانکار)
  cafe_id      uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id           text NOT NULL,
  customer_id  text,
  name         text NOT NULL DEFAULT '',
  balance      bigint NOT NULL DEFAULT 0,
  data         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (cafe_id, id)
);

CREATE TABLE transactions (
  cafe_id      uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id           text NOT NULL,
  type         text NOT NULL CHECK (type IN ('income','expense')),
  amount       bigint NOT NULL CHECK (amount >= 0),
  date         date,
  category     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  method       text NOT NULL DEFAULT 'cash',
  data         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX transactions_date_idx ON transactions(cafe_id, date, type) WHERE deleted_at IS NULL;

CREATE TABLE expenses (
  cafe_id      uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id           text NOT NULL,
  amount       bigint NOT NULL CHECK (amount >= 0),
  date         date,
  category     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  method       text NOT NULL DEFAULT 'cash',
  data         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (cafe_id, id)
);

CREATE TABLE obligations (
  cafe_id      uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id           text NOT NULL,
  kind         text NOT NULL DEFAULT '',
  dir          text NOT NULL DEFAULT 'pay',
  title        text NOT NULL DEFAULT '',
  party        text NOT NULL DEFAULT '',
  amount       bigint NOT NULL DEFAULT 0,
  due_date     date,
  status       text NOT NULL DEFAULT 'pending',
  data         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX obligations_due_idx ON obligations(cafe_id, due_date) WHERE deleted_at IS NULL;

CREATE TABLE settings (
  cafe_id     uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id          text NOT NULL,             -- کلید تنظیم (مثلاً shop, tariff)
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  PRIMARY KEY (cafe_id, id)
);

-- ── اطلاعیه و تیکت (پنل مرکزی ↔ کافی‌نت) ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  severity      text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  pinned        boolean NOT NULL DEFAULT false,
  link          text NOT NULL DEFAULT '',
  target_cafes  uuid[] NOT NULL DEFAULT '{}',        -- خالی = همهٔ کافی‌نت‌ها
  published_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX announcements_pub_idx ON announcements(published_at DESC);

CREATE SEQUENCE ticket_number_seq START 1001;
CREATE TABLE tickets (
  cafe_id     uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  id          text NOT NULL,
  number      bigint NOT NULL DEFAULT nextval('ticket_number_seq'),
  subject     text NOT NULL,
  category    text NOT NULL DEFAULT 'other',
  priority    text NOT NULL DEFAULT 'normal',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','answered','closed')),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, id)
);
CREATE INDEX tickets_status_idx ON tickets(status, updated_at DESC);

CREATE TABLE ticket_messages (
  cafe_id     uuid NOT NULL,
  ticket_id   text NOT NULL,
  id          text NOT NULL,
  from_role   text NOT NULL CHECK (from_role IN ('cafe','admin')),
  author      text NOT NULL DEFAULT '',
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, ticket_id, id),
  FOREIGN KEY (cafe_id, ticket_id) REFERENCES tickets(cafe_id, id) ON DELETE CASCADE
);

-- ── ایمنی و ردیابی ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- پاسخ ذخیره‌شدهٔ درخواست‌های دارای Idempotency-Key (ارسال تکراری از صف آفلاین همان پاسخ را می‌گیرد، نه رکورد دوم)
CREATE TABLE idempotency_keys (
  scope         text NOT NULL,                       -- cafe_id یا user:<id>
  key           text NOT NULL,
  request_hash  text NOT NULL,
  status        int NOT NULL,
  body          jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);
CREATE INDEX idempotency_created_idx ON idempotency_keys(created_at);

-- لاگ حسابرسی سمت سرور با زنجیرهٔ هش برای هر کافی‌نت (تغییر یا حذف یک ردیف در /api/audit/verify لو می‌رود)
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  cafe_id     uuid,
  user_id     uuid,
  action      text NOT NULL,
  entity      text NOT NULL DEFAULT '',
  entity_id   text NOT NULL DEFAULT '',
  details     jsonb NOT NULL DEFAULT '{}',
  ip          text NOT NULL DEFAULT '',
  prev_hash   text NOT NULL DEFAULT '',
  hash        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_cafe_idx ON audit_log(cafe_id, id);
