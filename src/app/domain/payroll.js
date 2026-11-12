// حقوق کارمندان — منطق خالص + ذخیره‌سازی. هر ماه برای هر کارمند فعال یک «تعهد» از نوع salary ساخته می‌شود؛
// پرداخت آن (settleObligation) همان هزینهٔ «حقوق کارمند» را در حسابداری ثبت می‌کند و ابطال/برگشتش هم از مسیر تعهدات است.
import { EMP_KEY, JM, OBL_KEY, latinDigits } from "../core/constants.js";
import { dateToJalali, jalaliMonthDays, jalaliToIso } from "../core/jalali.js";
import { emitDataChange, lsRead, lsWrite, uid } from "./sales.jsx";

const int = (v) => Math.max(0, Math.round(Number(latinDigits(String(v == null ? "" : v)).replace(/[,٬\s]/g, "")) || 0));
const str = (v, max = 120) => String(v == null ? "" : v).trim().slice(0, max);

export const getEmployees = () => lsRead(EMP_KEY, []);

export function normalizeEmployee(e) {
  const payDay = Math.min(31, Math.max(1, int(e.payDay) || 1));
  return { id: e.id || uid(), name: str(e.name), role: str(e.role, 60), phone: str(e.phone, 20), salary: int(e.salary), payDay, active: e.active !== false, note: str(e.note, 300) };
}

export function saveEmployee(input) {
  const emp = normalizeEmployee(input);
  if (!emp.name) return { ok: false, error: "نام کارمند را وارد کنید" };
  if (emp.salary <= 0) return { ok: false, error: "حقوق ماهانه باید بیشتر از صفر باشد" };
  const list = getEmployees();
  const next = list.some((x) => String(x.id) === String(emp.id)) ? list.map((x) => (String(x.id) === String(emp.id) ? emp : x)) : [...list, emp];
  lsWrite(EMP_KEY, next); emitDataChange();
  return { ok: true, employee: emp };
}

export function removeEmployee(id) {
  lsWrite(EMP_KEY, getEmployees().filter((x) => String(x.id) !== String(id))); emitDataChange();
}

export const ymKey = (jy, jm) => `${jy}-${String(jm).padStart(2, "0")}`;
export const ymOfIso = (iso) => { const [jy, jm] = dateToJalali(iso); return [jy, jm]; };
export const shiftMonth = (jy, jm, k) => { const t = jy * 12 + (jm - 1) + k; return [Math.floor(t / 12), (t % 12) + 1]; };
export const monthLabel = (jy, jm) => `${JM[jm - 1]} ${jy}`;
export const monthDueDate = (jy, jm, payDay) => jalaliToIso(jy, jm, Math.min(Math.max(1, payDay), jalaliMonthDays(jy, jm)));

export const payrollItems = (jy, jm) => lsRead(OBL_KEY, []).filter((o) => o.kind === "salary" && o.ym === ymKey(jy, jm));

// کارمندان فعالی که برای این ماه هنوز ردیف حقوق ندارند
export function missingPayroll(jy, jm) {
  const have = new Set(payrollItems(jy, jm).map((o) => String(o.empId)));
  return getEmployees().filter((e) => e.active !== false && e.salary > 0 && !have.has(String(e.id)));
}

// ساخت لیست حقوق ماه؛ تکراری نمی‌سازد (برای هر کارمند و ماه فقط یک ردیف).
export function generatePayroll(jy, jm) {
  const todo = missingPayroll(jy, jm);
  if (!todo.length) return { created: 0, items: [] };
  const items = todo.map((e) => ({
    id: uid(), kind: "salary", dir: "pay", title: `حقوق ${e.name} — ${monthLabel(jy, jm)}`, party: e.name,
    amount: e.salary, base: e.salary, extra: 0, deduct: 0, empId: e.id, ym: ymKey(jy, jm),
    dueDate: monthDueDate(jy, jm, e.payDay), status: "pending", remindDays: 3, note: "",
  }));
  lsWrite(OBL_KEY, [...lsRead(OBL_KEY, []), ...items]); emitDataChange();
  return { created: items.length, items };
}

// اضافه‌کار / پاداش (extra) و کسورات / مساعده (deduct) فقط تا قبل از پرداخت قابل تغییرند.
export function updatePayrollItem(id, patch) {
  const list = lsRead(OBL_KEY, []);
  const cur = list.find((o) => String(o.id) === String(id));
  if (!cur || cur.kind !== "salary") return { ok: false, error: "ردیف حقوق پیدا نشد" };
  if (cur.status === "done") return { ok: false, error: "حقوق پرداخت‌شده قابل ویرایش نیست؛ ابتدا پرداخت را برگردانید" };
  const extra = patch.extra !== undefined ? int(patch.extra) : cur.extra || 0;
  const deduct = patch.deduct !== undefined ? int(patch.deduct) : cur.deduct || 0;
  const base = cur.base != null ? cur.base : cur.amount;
  const amount = base + extra - deduct;
  if (amount <= 0) return { ok: false, error: "مبلغ نهایی باید بیشتر از صفر باشد" };
  lsWrite(OBL_KEY, list.map((o) => (String(o.id) === String(id) ? { ...o, extra, deduct, amount, note: patch.note !== undefined ? str(patch.note, 300) : o.note } : o)));
  emitDataChange();
  return { ok: true, amount };
}

export function payrollSummary(items) {
  const sum = (a) => a.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const paid = items.filter((o) => o.status === "done"), pending = items.filter((o) => o.status !== "done");
  return { count: items.length, total: sum(items), paid: sum(paid), pending: sum(pending), paidCount: paid.length, pendingCount: pending.length };
}
