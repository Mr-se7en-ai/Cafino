// داده‌های نمونهٔ حالت مهمان — با همان موتورهای واقعی برنامه ساخته می‌شوند تا فروش، فاکتور، حسابداری، انبار و تعهدات با هم هم‌خوان باشند.
import { seedInboxDemo } from "../inbox/inbox.js";
import { TX_KEY, OBL_KEY } from "../app/core/constants.js";
import { todayIso } from "../app/core/jalali.js";
import { createSale, lsRead, lsWrite, uid } from "../app/domain/sales.jsx";
import { saveNote, saveReminder } from "../app/domain/notes.js";
import { generatePayroll, saveEmployee } from "../app/domain/payroll.js";
import { dateToJalali } from "../app/core/jalali.js";
import { GUEST_EMAIL, isGuestMode } from "./guestMode.js";
import { getSessionEmail, startSession } from "../services/auth/localAuth.js";

const SEEDED_KEY = "cafenet_guest_seeded";
const addDays = (n) => { const d = new Date(todayIso() + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function ensureGuestSession() {
  if (!isGuestMode()) return null;
  return getSessionEmail() || startSession(GUEST_EMAIL).email;
}

export function seedGuestData() {
  if (!isGuestMode() || lsRead(SEEDED_KEY, false)) return false;
  lsWrite("cafenet_shop", { name: "کافی‌نت نمونه (آزمایشی)" });
  lsWrite("cafenet_customers", [
    { id: 1, firstName: "علی", lastName: "رضایی", phone: "09121110001", address: "تهران، خیابان ولیعصر", wallet: 0 },
    { id: 2, firstName: "سارا", lastName: "احمدی", phone: "09121110002", address: "", wallet: 2000000 },
    { id: 3, firstName: "محمد", lastName: "کریمی", phone: "09121110003", address: "کرج، گوهردشت", wallet: 0 },
    { id: 4, firstName: "نگار", lastName: "حسینی", phone: "09121110004", address: "", wallet: 0 },
  ]);
  lsWrite("cafenet_inventory", [
    { id: 1, cat: "paper", name: "کاغذ A4 معمولی", qty: 400, minQty: 100, unit: "برگ", unitCost: 5000, salePrice: 10000 },
    { id: 2, cat: "cartridge", name: "کارتریج مشکی", qty: 3, minQty: 2, unit: "عدد", unitCost: 2500000, salePrice: 0 },
    { id: 3, cat: "accessories", name: "فلش ۳۲ گیگ", qty: 3, minQty: 3, unit: "عدد", unitCost: 4500000, salePrice: 6500000 },
  ]);
  const sell = (o) => { try { createSale(o); } catch { /* نمونه‌سازی هرگز برنامه را متوقف نمی‌کند */ } };
  sell({ customerId: 1, date: addDays(-3), items: [{ desc: "پرینت سیاه‌وسفید", qty: 20, price: 200000, stockId: 1, stockQty: 20 }], payments: [{ method: "cash", amount: 4000000 }] });
  sell({ customerId: 4, date: addDays(-3), items: [{ desc: "شارژ ایرانسل ۱۰۰ هزار تومان", qty: 1, price: 10000000 }], payments: [{ method: "cash", amount: 10000000 }] });
  sell({ customerId: 3, date: addDays(-1), dueDate: addDays(5), items: [{ desc: "ثبت‌نام آنلاین دانشگاه", qty: 1, price: 15000000 }], payments: [{ method: "cash", amount: 5000000 }] });
  sell({ customerId: 1, date: addDays(-1), channel: "online", online: { platform: "اینستاگرام", orderRef: "IG-2041", carrier: "پست", trackingCode: "RR123456789IR", address: "تهران، خیابان ولیعصر", shippingCost: 300000, platformFee: 50000, status: "shipped" },
    items: [{ desc: "فلش ۳۲ گیگ", qty: 1, price: 6500000, stockId: 3, stockQty: 1 }], payments: [{ method: "transfer", amount: 6500000 }] });
  sell({ customerId: 2, date: todayIso(), items: [{ desc: "اسکن و ارسال ایمیل", qty: 1, price: 1500000 }], payments: [{ method: "pos", amount: 1500000 }] });
  sell({ customerId: 1, date: todayIso(), items: [{ desc: "پرینت رنگی", qty: 10, price: 600000, stockId: 1, stockQty: 10 }], payments: [{ method: "cash", amount: 6000000 }] });
  lsWrite(TX_KEY, [...lsRead(TX_KEY, []),
    { id: uid(), type: "expense", category: "برق", amount: 12000000, desc: "قبض برق", date: addDays(-2) },
    { id: uid(), type: "expense", category: "اینترنت (ISP)", amount: 8000000, desc: "اینترنت ماهانه", date: addDays(-4) }]);
  lsWrite(OBL_KEY, [
    { id: uid(), kind: "rent", dir: "pay", title: "اجارهٔ مغازه", party: "مالک", amount: 150000000, dueDate: addDays(3), status: "pending", remindDays: 5, note: "" },
    { id: uid(), kind: "cheque", dir: "pay", title: "چک خرید تجهیزات", party: "فروشگاه رایانه", amount: 40000000, dueDate: addDays(10), status: "pending", chequeNo: "123456", bank: "ملی", remindDays: 3, note: "" },
  ]);
  saveEmployee({ name: "رضا محمدی", role: "اپراتور", salary: 80000000, payDay: 5 });
  saveEmployee({ name: "مریم صادقی", role: "صندوقدار", salary: 90000000, payDay: 5 });
  const [jy, jm] = dateToJalali(todayIso());
  generatePayroll(jy, jm);
  saveNote({ title: "به کافینو خوش آمدید", body: "این یک یادداشت نمونه است. می‌توانید یادداشت بسازید، سنجاق کنید یا از روی آن یادآور بسازید.", color: "yellow", pinned: true });
  saveReminder({ title: "پیگیری چک فروشگاه رایانه", note: "تماس با فروشنده", date: addDays(2), time: "10:00", repeat: "none" });
  saveReminder({ title: "تهیهٔ پشتیبان هفتگی", note: "", date: addDays(5), time: "18:00", repeat: "weekly" });
  try { seedInboxDemo(); } catch { /* نمونه‌سازی هرگز برنامه را متوقف نمی‌کند */ }
  lsWrite(SEEDED_KEY, true);
  return true;
}
