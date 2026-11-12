-- 004: سیاست مجوزهای هر کافی‌نت (نسخهٔ 1.75.0). مجوزهای پیش‌فرض نقش‌ها در کد (lib/permissions.js) است؛ این جدول فقط «تغییرات» مالک را نگه می‌دارد:
--   { roles: { manager|staff: { grant:[...], deny:[...] } }, users: { <userId>: { grant:[...], deny:[...] } }, limits: { manager|staff: { discountMaxPercent, waiveMaxAmount, openingBalanceMax } } }
-- مالک (owner) همیشه همهٔ مجوزها را دارد و با این جدول محدود نمی‌شود. هر تغییر در گزارش حسابرسی ثبت می‌شود.
CREATE TABLE permission_policies (
  cafe_id     uuid PRIMARY KEY REFERENCES cafes(id) ON DELETE RESTRICT,
  policy      jsonb NOT NULL DEFAULT '{}',
  version     integer NOT NULL DEFAULT 1,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
