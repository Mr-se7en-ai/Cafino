// عنوان و زیرعنوان صفحه‌ها در «تم نارنجی»
export const ORANGE_TITLES = { dashboard: "داشبورد مالی", mgmt: "داشبورد مدیریتی", pos: "ثبت سریع خدمات", customers: "مشتریان", invoice: "فاکتورها", report: "گزارش‌های مالی" };
export const ORANGE_SUBTITLES = {
  dashboard: "خلاصهٔ وضعیت مالی کافی‌نت امروز",
  mgmt: "کاشی‌ها، دسترسی سریع و ابزارهای مدیریت",
  pos: "سه قدم تا ثبت کامل خدمات",
  customers: "پرونده، کیف پول و تخفیف اختصاصی هر مشتری",
  invoice: "صدور، چاپ و بایگانی فاکتور",
  report: "درآمد، هزینه و دفتر کل با بازهٔ شمسی",
  transactions: "درآمدها و هزینه‌های ثبت‌شده", ledger: "حساب مشتریان و بدهی‌ها", inventory: "موجودی و کالاهای انبار", tariff: "نرخ خدمات کافی‌نت", settings: "ظاهر، پشتیبان‌گیری و تنظیمات برنامه",
};
export const orangeTitle = (key, fallback) => ORANGE_TITLES[key] || fallback;
