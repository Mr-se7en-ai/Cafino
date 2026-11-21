// لایهٔ نازک روی API پیامک کافی‌نت (ملی پیامک). رمز پنل فقط هنگام اتصال به سرور می‌رود و هرگز برنمی‌گردد.
import { apiRequest } from "../services/api/client.js";

const J = (method, body) => ({ method, body: body ?? {} });
export const sms = {
  status: () => apiRequest("/api/sms"),
  connect: ({ username, password, from }) => apiRequest("/api/sms", J("PUT", { username, password, from })),
  patch: (body) => apiRequest("/api/sms", J("PATCH", body)),
  remove: () => apiRequest("/api/sms", { method: "DELETE" }),
  credit: () => apiRequest("/api/sms/credit"),
  test: (to) => apiRequest("/api/sms/test", J("POST", { to })),
  send: ({ text, recipients, batchId }) => apiRequest("/api/sms/send", J("POST", { text, recipients, batchId })),
  messages: ({ customerRef, batchId, limit } = {}) => {
    const q = new URLSearchParams(); if (customerRef) q.set("customerRef", customerRef); if (batchId) q.set("batchId", batchId); if (limit) q.set("limit", String(limit));
    const s = q.toString(); return apiRequest(`/api/sms/messages${s ? `?${s}` : ""}`);
  },
};
export const newBatchId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16)));
