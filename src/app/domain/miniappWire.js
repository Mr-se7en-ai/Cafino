// اتصال منطق مینی‌اپ (src/uploads/miniappOrders.js) به ذخیرهٔ محلی سفارش‌ها و صف همگام‌سازی برنامه.
import { lsRead, lsWrite, emitDataChange, uid, syncTxOp } from "./sales.jsx";
import { ORDERS_STORAGE_KEY, CUSTOMERS_STORAGE_KEY, ORDER_STATUSES, TX_KEY } from "../core/constants.js";
import { logActivity } from "../core/activity.js";
import { todayIso } from "../core/jalali.js";
import { isApiConnected } from "../../services/api/client.js";
import { queueOp, mappers as syncMappers } from "../../sync/index.js";
import { reportError } from "../../diagnostics/index.js";
import { startMiniappOrderSync, buildOrderFromRequest, findCustomerForRequest, customerFromRequest } from "../../uploads/miniappOrders.js";

const labelOf = (k) => (ORDER_STATUSES.find((s) => s.key === k) || {}).label || k;

/** وضعیت یک سفارش محلی را عوض می‌کند و به همگام‌سازی می‌سپارد (همان الگوی صفحهٔ سفارش‌ها). */
export function applyStatusFromMiniapp(order, status, by) {
  lsWrite(ORDERS_STORAGE_KEY, lsRead(ORDERS_STORAGE_KEY, []).map((o) => (String(o.id) === String(order.id) ? { ...o, status } : o)));
  try { if (isApiConnected()) queueOp({ resource: "orders", action: "update", entityId: String(order.serverId ?? order.id), body: { status }, label: `وضعیت سفارش «${order.title}» (مینی‌اپ)` }); } catch (e) { reportError(e, "sync", { stage: "miniapp-order-status" }); }
  logActivity("وضعیت سفارش (از مینی‌اپ)", `${order.title} — ${labelOf(status)}${by ? ` — توسط ${by}` : ""}`);
}

export const miniappOrderDeps = { readOrders: () => lsRead(ORDERS_STORAGE_KEY, []), applyStatus: applyStatusFromMiniapp, emit: () => emitDataChange() };
export const startMiniappOrders = () => startMiniappOrderSync({ deps: miniappOrderDeps });

/** مشتریِ برنامه برای درخواست را برمی‌گرداند؛ اگر نبود (و نام/موبایل داشت) می‌سازد و برای همگام‌سازی صف می‌کند. */
export function ensureCustomerForRequest(req) {
  const customers = lsRead(CUSTOMERS_STORAGE_KEY, []);
  const found = findCustomerForRequest(req, customers);
  if (found) return found;
  const nc = customerFromRequest(req, { id: uid() });
  if (!nc) return null;
  lsWrite(CUSTOMERS_STORAGE_KEY, [...customers, nc]);
  try { if (isApiConnected()) queueOp({ resource: "customers", action: "create", entityId: nc.id, body: nc, idem: `customer-${nc.id}`, label: `مشتری: ${[nc.firstName, nc.lastName].filter(Boolean).join(" ")} (مینی‌اپ)` }); } catch (e) { reportError(e, "sync", { stage: "miniapp-customer-create" }); }
  logActivity("افزودن مشتری (از درخواست مینی‌اپ)", [nc.firstName, nc.lastName].filter(Boolean).join(" "));
  emitDataChange();
  return nc;
}

/** سفارش محلی از درخواست مشتری می‌سازد (مشتری ناشناخته را هم می‌سازد)؛ شناسهٔ سفارش را برمی‌گرداند یا null. amount به ریال. */
export function createOrderFromRequest(req, { amount = 0 } = {}) {
  const c = ensureCustomerForRequest(req);
  if (!c) return null;
  const o = buildOrderFromRequest(req, { customers: [c], id: uid(), today: todayIso(), amount });
  if (!o) return null;
  lsWrite(ORDERS_STORAGE_KEY, [...lsRead(ORDERS_STORAGE_KEY, []), o]);
  try { if (isApiConnected()) queueOp({ resource: "orders", action: "create", entityId: o.id, body: syncMappers.orderBody(o), idem: `order-${o.id}`, dependsOn: [`customers:${o.customerId}`], label: `سفارش: ${o.title} (مینی‌اپ)` }); } catch (e) { reportError(e, "sync", { stage: "miniapp-order-create" }); }
  logActivity("ثبت سفارش (از درخواست مینی‌اپ)", `${o.customerName} — ${o.title}`);
  emitDataChange();
  return String(o.id);
}

const PAID_TX_KEY = "cafino_miniapp_paid_tx";
const readPaid = () => { try { const v = JSON.parse(localStorage.getItem(PAID_TX_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
export const isMiniappIncomeRecorded = (reqId) => !!readPaid()[String(reqId)];
/** درآمدِ پرداخت‌شدهٔ یک درخواست را یک‌بار (ضد تکرار) در تراکنش‌ها ثبت می‌کند. به‌صورت دستی و با دکمه صدا زده می‌شود؛ شناسهٔ تراکنش یا null. */
export function recordMiniappIncome(req) {
  if (!req || !(Number(req.total) > 0) || req.payStatus !== "paid") return null;
  const done = readPaid();
  if (done[String(req.id)]) return null;
  const tx = { id: uid(), type: "income", category: "سفارش مینی‌اپ", amount: Math.round(Number(req.total)), desc: `${String(req.service || "سفارش").slice(0, 100)}${req.customer ? ` — ${req.customer}` : ""} (مینی‌اپ، ${req.payMethod === "card" ? "کارت‌به‌کارت" : "حضوری"})`, date: todayIso(), method: req.payMethod === "card" ? "transfer" : "cash" };
  lsWrite(TX_KEY, [...lsRead(TX_KEY, []), tx]);
  try { syncTxOp("create", tx, { force: true }); } catch (e) { reportError(e, "sync", { stage: "miniapp-income" }); }
  try { localStorage.setItem(PAID_TX_KEY, JSON.stringify({ ...done, [String(req.id)]: String(tx.id) })); } catch { /* ذخیره‌سازی در دسترس نیست */ }
  logActivity("ثبت درآمد (از پرداخت مینی‌اپ)", `${tx.desc} — ${tx.amount}`);
  emitDataChange();
  return String(tx.id);
}

/** فرستندهٔ فایل (نام/موبایل از صفحهٔ ارسال مشتری) را با یک دکمه به مشتریان برنامه اضافه می‌کند؛ اگر با همان موبایل مشتری باشد دوباره نمی‌سازد.
 *  برمی‌گرداند: { customer, created } یا null (نه نام دارد نه موبایل). */
export function addUploadSenderToCustomers({ name = "", phone = "" } = {}) {
  const customers = lsRead(CUSTOMERS_STORAGE_KEY, []);
  const probe = { customer: name, phone };
  const found = findCustomerForRequest(probe, customers);
  if (found) return { customer: found, created: false };
  const nc = customerFromRequest(probe, { id: uid() });
  if (!nc) return null;
  const c = { ...nc, note: "ثبت‌شده با یک دکمه از فایل ارسالی مشتری" };
  lsWrite(CUSTOMERS_STORAGE_KEY, [...customers, c]);
  try { if (isApiConnected()) queueOp({ resource: "customers", action: "create", entityId: c.id, body: c, idem: `customer-${c.id}`, label: `مشتری: ${[c.firstName, c.lastName].filter(Boolean).join(" ")} (از فایل ارسالی)` }); } catch (e) { reportError(e, "sync", { stage: "upload-sender-customer" }); }
  logActivity("افزودن مشتری (از فایل ارسالی)", [c.firstName, c.lastName].filter(Boolean).join(" "));
  emitDataChange();
  return { customer: c, created: true };
}
