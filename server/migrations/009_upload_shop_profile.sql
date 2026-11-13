-- مشخصات عمومی کافی‌نت برای صفحهٔ ارسال فایل مشتری (از «پروفایل فروشگاه» برنامه همگام می‌شود).
-- فقط افزودنی: ستون‌های جدید با مقدار پیش‌فرض؛ جدول و داده‌های قبلی دست نمی‌خورد.
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS show_shop_info boolean NOT NULL DEFAULT true;
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS shop_name text NOT NULL DEFAULT '';
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS shop_address text NOT NULL DEFAULT '';
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS shop_phone text NOT NULL DEFAULT '';
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS shop_mobile text NOT NULL DEFAULT '';
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS shop_logo bytea;
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS shop_logo_mime text;
ALTER TABLE upload_settings ADD COLUMN IF NOT EXISTS shop_logo_hash text;
ALTER TABLE upload_settings ADD CONSTRAINT upload_settings_shop_len CHECK (char_length(shop_name) <= 80 AND char_length(shop_address) <= 200 AND char_length(shop_phone) <= 40 AND char_length(shop_mobile) <= 40);
ALTER TABLE upload_settings ADD CONSTRAINT upload_settings_logo_size CHECK (shop_logo IS NULL OR octet_length(shop_logo) <= 200000);
