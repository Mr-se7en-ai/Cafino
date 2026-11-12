// Shared test context for the voice assistant (no DOM / storage).
function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const sal = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return [gy, gm, gd];
}
function gregorianToJalali(gy, gm, gd) {
  const g = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
const pad = (n) => String(n).padStart(2, "0");
export const jalali = {
  toIso: (y, m, d) => { const [gy, gm, gd] = jalaliToGregorian(y, m, d); return `${gy}-${pad(gm)}-${pad(gd)}`; },
  fromIso: (iso) => { const [y, m, d] = iso.split("-").map(Number); return gregorianToJalali(y, m, d); },
};

export const baseCtx = (over = {}) => ({
  today: "2026-10-22",
  defaultUnit: "rial",
  jalali,
  categories: {
    income: ["پرینت", "اسکن", "مبلغ دلخواه"],
    expense: ["برق", "اینترنت (ISP)", "اجاره", "حقوق کارمند", "تعمیر و نگهداری", "خرید تجهیزات", "نوشیدنی و مواد مصرفی", "سایر هزینه"],
  },
  customers: [
    { id: 1, firstName: "علی", lastName: "رضایی", phone: "09121234567", wallet: 0 },
    { id: 2, firstName: "سارا", lastName: "محمدی", phone: "09351112233", wallet: 500000 },
    { id: 3, firstName: "علی", lastName: "کریمی", phone: "09120000000", wallet: 0 },
  ],
  inventory: [
    { id: 11, name: "کاغذ A4 معمولی", qty: 8, unit: "بسته", salePrice: 0 },
    { id: 12, name: "کارتریج مشکی", qty: 2, unit: "عدد", salePrice: 0 },
    { id: 13, name: "فلش ۳۲ گیگ", qty: 5, unit: "عدد", salePrice: 3000000 },
  ],
  sales: [
    { id: "s1", number: 1023, customerId: 1, customerName: "علی رضایی", total: 4000000, paid: 1000000, waived: 0, cancelled: false },
    { id: "s2", number: 1024, customerId: 2, customerName: "سارا محمدی", total: 800000, paid: 800000, waived: 0, cancelled: false },
  ],
  ...over,
});
