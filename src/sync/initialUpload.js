// «ارسال دادهٔ موجود به سرور»: هنگام انتقال از حالت محلی به سرور، همهٔ دادهٔ فعلی این دستگاه را (یک‌بار) به صف آفلاین می‌دهد.
// ایمن است چون هر عملیات همان Idempotency-Key و شناسهٔ ارسال زندهٔ برنامه را دارد: اجرای دوباره یا هم‌پوشانی با ارسال عادی
// هیچ رکورد تکراری نمی‌سازد (سرور ساخت تکراری را همان رکورد می‌شمارد). مبلغ‌ها و وضعیت فاکتور را سرور خودش از پرداخت‌ها می‌سازد.
import { queueOp } from "./index.js";
import * as mappers from "./mappers.js";
import { isPhotoRef } from "../data/customerFiles.js";

const key = (o) => String(o.id);

// ورودی: دادهٔ خام محلی. خروجی: فهرست ورودی‌های queueOp (بدون اجرا) — برای تست و پیش‌نمایش
export function buildUploadOps({ customers = [], inventory = [], sales = [], orders = [], transactions = [], obligations = [] } = {}, { finance = true } = {}) {
  const ops = [];
  const custIds = new Set();
  for (const c of customers) {
    if (c?.id == null) continue;
    const body = { ...c, id: key(c) };
    if (isPhotoRef(body.photo)) delete body.photo;                       // عکس‌ها در IndexedDB می‌مانند، نه روی سرور
    custIds.add(key(c));
    ops.push({ resource: "customers", action: "create", entityId: key(c), body, idem: `customer-${key(c)}`, label: `مشتری: ${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.id}` });
  }
  for (const it of inventory) {
    if (it?.id == null) continue;
    ops.push({ resource: "inventory", action: "create", entityId: key(it), body: { ...it, id: key(it) }, idem: `inventory-${key(it)}`, label: `کالا: ${it.name || it.id}` });
  }
  if (finance) {
    const invIds = new Set();
    for (const s of sales) {
      if (!s?.invoiceId) continue;
      invIds.add(String(s.invoiceId));
      const dep = s.customerId != null && custIds.has(String(s.customerId)) ? [`customers:${s.customerId}`] : [];
      ops.push({ resource: "invoices", action: "create", entityId: String(s.invoiceId), body: mappers.invoiceBody(s), idem: `invoice-${s.invoiceId}`, dependsOn: dep, label: `فاکتور #${s.number} — ${s.customerName || ""}` });
      if (s.cancelled) {                                  // ابطال فقط با دستور ابطال (مدیر + دلیل)؛ وضعیت داخل بدنهٔ فاکتور از کلاینت پذیرفته نمی‌شود
        ops.push({ resource: "invoices", action: "command", entityId: String(s.invoiceId), body: { reason: String(s.cancelReason || s.voidReason || "").trim() || "ابطال‌شده پیش از انتقال به سرور" }, meta: { path: `/api/invoices/${encodeURIComponent(String(s.invoiceId))}/void` }, idem: `invoice-void-${s.invoiceId}`, dependsOn: [`invoices:${s.invoiceId}`], label: `ابطال فاکتور #${s.number}` });
        continue;
      }
      for (const p of s.payments || []) {
        if (!p?.id || p.method === "free") continue;
        ops.push({ resource: "payments", action: "create", entityId: String(p.id), body: mappers.paymentBody(p, s), idem: `payment-${p.id}`, dependsOn: [`invoices:${s.invoiceId}`], label: `پرداخت — فاکتور #${s.number}` });
      }
    }
    for (const o of orders) {
      if (o?.id == null) continue;
      const dep = [...(o.customerId != null && custIds.has(String(o.customerId)) ? [`customers:${o.customerId}`] : []), ...(o.linkedInvoiceId && invIds.has(String(o.linkedInvoiceId)) ? [`invoices:${o.linkedInvoiceId}`] : [])];
      ops.push({ resource: "orders", action: "create", entityId: key(o), body: mappers.orderBody(o), idem: `order-${key(o)}`, dependsOn: dep, label: `سفارش: ${o.title || o.id}` });
    }
    for (const t of transactions) {
      if (t?.id == null || !mappers.isManualTransaction(t)) continue;
      ops.push({ resource: "transactions", action: "create", entityId: key(t), body: mappers.transactionBody(t), idem: `transaction-${key(t)}`, label: `${t.type === "income" ? "درآمد" : "هزینه"}: ${t.category || ""}` });
    }
    for (const b of obligations) {
      if (b?.id == null) continue;
      ops.push({ resource: "obligations", action: "create", entityId: key(b), body: { ...b, id: key(b) }, idem: `obligation-${key(b)}`, label: `تعهد: ${b.title || b.id}` });
    }
  }
  return ops;
}

export const countByResource = (ops) => ops.reduce((m, o) => ((m[o.resource] = (m[o.resource] || 0) + 1), m), {});

export const UPLOAD_STATE_KEY = "cafenet_initial_upload";
export function lastUpload() { try { return JSON.parse(localStorage.getItem(UPLOAD_STATE_KEY) || "null"); } catch { return null; } }

// اجرا روی دادهٔ واقعی این دستگاه؛ فقط وقتی API وصل است چیزی در صف می‌رود (queueOp خودش بررسی می‌کند)
export async function runInitialUpload(read, { finance = true } = {}) {
  const ops = buildUploadOps(read(), { finance });
  let queued = 0;
  for (const o of ops) { if (queueOp(o)) queued++; }
  const counts = countByResource(ops);
  try { localStorage.setItem(UPLOAD_STATE_KEY, JSON.stringify({ at: new Date().toISOString(), queued, counts })); } catch { /* ignore */ }
  return { total: ops.length, queued, counts };
}
