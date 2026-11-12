// Maps the app's local (localStorage-first) records to the server API payloads used by the offline queue.
// Kept in ONE file on purpose: when the backend schema changes, this is the only place to adjust.
// Payload shapes follow src/domain/validation.js (invoice: number/items/totalAmount/status; payment: invoiceId/amount/method;
// transaction: type/amount/date) plus the extra fields the local data model carries.

const str = (v) => (v === undefined || v === null ? null : String(v));

export function invoiceStatus(sale) {
  if (sale.cancelled) return "void";
  const remaining = Math.max(0, (Number(sale.total) || 0) - (Number(sale.paid) || 0) - (Number(sale.waived) || 0));
  if (remaining <= 0) return "paid";
  return (Number(sale.paid) || 0) > 0 ? "partial" : "unpaid";
}

export function isoTimestamp(date, time) {
  try { return new Date(`${date}T${time || "00:00"}:00`).toISOString(); } catch { return undefined; }
}

export function invoiceBody(sale) {
  const items = (sale.lines || []).map((l) => ({
    id: str(l.id), description: l.desc, quantity: Number(l.qty) || 0, unit: l.unit || "", unitPrice: Number(l.price) || 0,
    total: (Number(l.qty) || 0) * (Number(l.price) || 0), category: l.category || "",
  }));
  return {
    id: str(sale.invoiceId), number: str(sale.number), saleId: str(sale.id), customerId: str(sale.customerId), customerName: sale.customerName || "",
    date: sale.date, dueDate: sale.dueDate || null, items, subtotal: Number(sale.subtotal) || 0, discount: Number(sale.discount) || 0,
    // مبلغ نهایی، پرداخت‌شده، مانده و وضعیت را سرور از اقلام/پرداخت‌ها می‌سازد؛ paidAmount/remainingAmount/status عمداً فرستاده نمی‌شوند.
    // totalAmount فقط راهنمای فاکتور بدون قلم است (سرور وقتی قلم هست آن را نادیده می‌گیرد).
    totalAmount: Number(sale.total) || 0, waivedAmount: Number(sale.waived) || 0,
    notes: sale.notes || "", source: "cafenet-ui", createdAt: isoTimestamp(sale.date, sale.time),
  };
}

export function paymentBody(payment, sale) {
  return {
    id: str(payment.id), invoiceId: str(payment.invoiceId || sale?.invoiceId), customerId: str(payment.customerId ?? sale?.customerId),
    amount: Number(payment.amount) || 0, method: payment.method || "cash", date: payment.date, accountId: str(payment.accountId), source: "cafenet-ui",
  };
}

export function orderBody(order) {
  return {
    id: str(order.id), customerId: str(order.customerId), customerName: order.customerName || "", title: order.title || "سفارش", notes: order.notes || "",
    amount: Number(order.amount) || 0, status: order.status || "new", createdAt: order.createdAt, saleId: str(order.saleId), invoiceId: str(order.linkedInvoiceId), source: "cafenet-ui",
  };
}

export function transactionBody(tx) {
  return {
    id: str(tx.id), type: tx.type, amount: Number(tx.amount) || 0, date: tx.date, category: tx.category || "", description: tx.desc || "",
    method: tx.method || "cash", source: "cafenet-ui",
  };
}

// A transaction that is a by-product of a sale/payment is reconstructed by the server from the invoice + payments;
// only hand-entered transactions are pushed on their own (otherwise income would be counted twice).
export const isManualTransaction = (tx) => !(tx && (tx.saleId || tx.invoiceId || tx.paymentId || tx.linkTxId || tx.oblId));
