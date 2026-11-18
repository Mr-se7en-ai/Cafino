// مینی‌اپ تلگرام مشتریان — سمت برنامهٔ کافی‌نت: وضعیت/فعال‌سازی، و همگام‌سازی تعرفه به سرور (منبع حقیقت تعرفه همین برنامه است).
import { apiRequest, isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";

export const miniapp = {
  info: () => apiRequest("/api/miniapp/info"),
  setEnabled: (enabled) => apiRequest("/api/miniapp/settings", { method: "PATCH", body: { enabled: !!enabled } }),
  putTariff: (groups) => apiRequest("/api/miniapp/tariff", { method: "PUT", body: { groups } }),
  // ── 1.81: بخش کافی‌نت در مینی‌اپ ──
  createStaffCode: () => apiRequest("/api/miniapp/staff-codes", { method: "POST", body: {} }),                       // {code:"ABCD-2345", expiresAt, botUsername}
  staffLinks: () => apiRequest("/api/miniapp/staff-links"),                                                           // {items:[…], canManageAll}
  unlinkStaff: (userId) => apiRequest(`/api/miniapp/staff-links/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  setStaffNotify: (userId, notify) => apiRequest(`/api/miniapp/staff-links/${encodeURIComponent(userId)}`, { method: "PATCH", body: { notify: !!notify } }),
  requests: () => apiRequest("/api/miniapp/requests-admin"),                                                          // {items:[…], newCount}
  setRequest: (id, body) => apiRequest(`/api/miniapp/requests-admin/${encodeURIComponent(id)}`, { method: "POST", body }),   // {status, reply?, orderId?}
  // ── 1.84: پرداخت، رسید و گفتگو ──
  inboxSummary: () => apiRequest("/api/miniapp/inbox-summary"),                                                       // {newRequests, pendingPayments, unreadChats}
  setPaySettings: (patch) => apiRequest("/api/miniapp/settings", { method: "PATCH", body: patch }),                   // {payCashEnabled, payCardEnabled, payCardNumber, payCardHolder, payBank}
  payAction: (id, body) => apiRequest(`/api/miniapp/requests-admin/${encodeURIComponent(id)}/pay`, { method: "POST", body }),   // {action: confirm|reject|cash_received, note?}
  receipt: (id) => apiRequest(`/api/miniapp/requests-admin/${encodeURIComponent(id)}/receipt`),                       // {mime, data(base64), at, ref, count}
  chats: () => apiRequest("/api/miniapp/chats-admin"),                                                                // {items:[{telegramId,name,phone,last,unread}], unread}
  chatThread: (tg, after = 0) => apiRequest(`/api/miniapp/chats-admin/${encodeURIComponent(tg)}${after ? `?after=${Number(after)}` : ""}`),
  sendChat: (tg, body) => apiRequest(`/api/miniapp/chats-admin/${encodeURIComponent(tg)}`, { method: "POST", body: { body } }),
  // ── 1.86: ربات مینی‌اپ اختصاصی هر کافی‌نت (تلگرام/بله) ──
  cafeBots: () => apiRequest("/api/miniapp/cafe-bots"),                                                                // {providers:[{provider,label,connected,botUsername,tokenHint,enabled,botLink,startLink,lastError…}], serverReady, httpsOk}
  connectCafeBot: (provider, token) => apiRequest(`/api/miniapp/cafe-bots/${encodeURIComponent(provider)}`, { method: "PUT", body: { token } }),
  setCafeBot: (provider, enabled) => apiRequest(`/api/miniapp/cafe-bots/${encodeURIComponent(provider)}`, { method: "PATCH", body: { enabled: !!enabled } }),
  checkCafeBot: (provider) => apiRequest(`/api/miniapp/cafe-bots/${encodeURIComponent(provider)}/check`, { method: "POST", body: {} }),
  removeCafeBot: (provider) => apiRequest(`/api/miniapp/cafe-bots/${encodeURIComponent(provider)}`, { method: "DELETE" }),
  orderActions: () => apiRequest("/api/miniapp/order-actions"),                                                       // {items:[{id,orderId,status,by}]}
  ackOrderActions: (body) => apiRequest("/api/miniapp/order-actions/ack", { method: "POST", body }),                  // {applied:[ids], notFound:[ids]}
};

/** داده‌های تعرفهٔ برنامه → گروه‌های عمومی [{cat, items:[{name, price}]}] (فقط نام و قیمت؛ بدون شناسه/توضیح داخلی). */
export function tariffToPublic(data) {
  const out = [];
  for (const g of Array.isArray(data) ? data : []) {
    if (!g || typeof g !== "object" || !Array.isArray(g.items)) continue;
    const items = g.items.filter((i) => i && typeof i.name === "string" && i.name.trim() && Number.isFinite(Number(i.price)) && Number(i.price) >= 0).map((i) => ({ name: i.name.trim().slice(0, 120), price: Math.round(Number(i.price)) }));
    const cat = String(g.cat ?? g.name ?? "").trim().slice(0, 80);
    if (cat && items.length) out.push({ cat, items });
  }
  return out;
}

let lastSent = "", timer = null;
/** همگام‌سازی با تأخیر (۳ ثانیه) و حذف تکراری؛ خطا بی‌صدا است (مینی‌اپ ضروری نیست) و بار بعد دوباره تلاش می‌شود. */
export function scheduleTariffSync(data, { delayMs = 3000, api = miniapp, connected = isApiConnected, guest = isGuestMode } = {}) {
  clearTimeout(timer);
  if (!connected() || guest()) return;
  const groups = tariffToPublic(data), sig = JSON.stringify(groups);
  if (sig === lastSent) return;
  timer = setTimeout(async () => { try { await api.putTariff(groups); lastSent = sig; } catch { /* بعداً دوباره */ } }, delayMs);
}
export async function syncTariffNow(data, api = miniapp) { const groups = tariffToPublic(data); const r = await api.putTariff(groups); lastSent = JSON.stringify(groups); return r; }
export const _resetSyncForTests = () => { lastSent = ""; clearTimeout(timer); };
