// اتصال منطق مینی‌اپ (src/uploads/miniappOrders.js) به ذخیرهٔ محلی سفارش‌ها و صف همگام‌سازی برنامه.
import { lsRead, lsWrite, emitDataChange, uid } from "./sales.jsx";
import { ORDERS_STORAGE_KEY, CUSTOMERS_STORAGE_KEY, ORDER_STATUSES } from "../core/constants.js";
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
