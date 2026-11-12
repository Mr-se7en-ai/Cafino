// اطلاعیه و تیکت از پنل مرکزی (ادمین).
//
// اصل کار (همان اصل «اول محلی» بقیهٔ برنامه):
//  • اطلاعیه‌ها و تیکت‌ها از API پنل مرکزی خوانده و در حافظهٔ محلی نگه‌داشته می‌شوند؛ بدون اینترنت هم دیده می‌شوند.
//  • ساخت تیکت، پاسخ و بستن/بازکردن تیکت فوراً در دستگاه ثبت می‌شود و از «صف آفلاین» (src/sync) به سرور می‌رود؛
//    کلید Idempotency از شناسهٔ سمت‌کلاینت ساخته می‌شود، پس ارسال تکراری هرگز تیکت یا پیام دوم نمی‌سازد.
//  • «خوانده‌شدن» فقط محلی است (برای هر دستگاه)؛ پنل مرکزی چیزی دربارهٔ آن لازم ندارد.
//  • اگر پنل مرکزی هنوز این مسیرها را نداشته باشد (404/501) برنامه خطا نمی‌دهد؛ فقط «پشتیبانی نمی‌شود» ثبت می‌شود.
//
// قرارداد API: فایل «inbox-api-fa.md» (کنار سرور مرجع، پوشهٔ admin-reference).
import { fireDataChange, lsRead, lsWrite } from "../app/domain/sales.jsx";
import { apiRequest, isApiConnected } from "../services/api/client.js";
import { getAuthenticatedUser } from "../services/auth/session.js";
import { isGuestMode } from "../guest/guestMode.js";
import { queueOp, syncQueue } from "../sync/index.js";
import { entityKeyOf } from "../sync/ops.js";
import { APP_VERSION } from "../app/core/version.js";

export const INBOX_KEY = "cafenet_inbox";
export const PAGE_LIMIT = 100;
const MAX_TICKETS = 200;
const MAX_ANNOUNCEMENTS = 100;
const MAX_MESSAGES = 500;

export const SEVERITIES = { info: "اطلاع", warning: "مهم", critical: "فوری" };
export const TICKET_STATUS = { open: "باز", pending: "در حال بررسی", answered: "پاسخ داده شد", closed: "بسته" };
export const TICKET_CATEGORIES = { technical: "مشکل فنی", billing: "مالی و اشتراک", feature: "پیشنهاد / درخواست قابلیت", other: "سایر" };
export const TICKET_PRIORITIES = { low: "کم", normal: "عادی", high: "فوری" };

const str = (v, max = 4000) => (v == null ? "" : String(v)).slice(0, max);
const ts = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };
const nowIso = () => new Date().toISOString();
const rid = (p) => `${p}_${(globalThis.crypto?.randomUUID?.().replaceAll("-", "") || (Date.now().toString(16) + Math.random().toString(16).slice(2, 14))).slice(0, 24)}`;
const asList = (payload) => Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.results) ? payload.results : [];

// ── نرمال‌سازی: پنل مرکزی می‌تواند نام‌های رایج دیگر هم بفرستد؛ برنامه همیشه همین شکل را نگه می‌دارد ─────────────────────
const SEVERITY_ALIAS = { urgent: "critical", danger: "critical", error: "critical", important: "warning", warn: "warning", notice: "info", normal: "info" };
const STATUS_ALIAS = { in_progress: "pending", progress: "pending", replied: "answered", resolved: "closed", done: "closed", new: "open" };

export function normalizeAnnouncement(raw) {
  if (!raw || raw.id == null || raw.id === "") return null;
  const title = str(raw.title || raw.subject, 200).trim();
  const body = str(raw.body ?? raw.message ?? raw.content, 8000);
  if (!title && !body) return null;
  const sev0 = String(raw.severity || raw.level || "info").toLowerCase();
  const severity = SEVERITIES[sev0] ? sev0 : (SEVERITY_ALIAS[sev0] || "info");
  const link = str(raw.link || raw.url, 500);
  return {
    id: String(raw.id), title: title || "اطلاعیه", body, severity, pinned: Boolean(raw.pinned),
    publishedAt: str(raw.publishedAt || raw.published_at || raw.createdAt || raw.created_at, 40) || nowIso(),
    expiresAt: str(raw.expiresAt || raw.expires_at, 40) || "",
    link: /^https?:\/\//i.test(link) ? link : "",
  };
}

export function normalizeMessage(raw) {
  if (!raw) return null;
  const body = str(raw.body ?? raw.message ?? raw.text, 8000);
  if (!body) return null;
  const who = String(raw.from || raw.sender || raw.authorType || raw.author_type || raw.role || "").toLowerCase();
  const from = ["admin", "staff", "support", "agent", "central"].includes(who) ? "admin" : "cafe";
  return {
    id: String(raw.id ?? raw.clientId ?? rid("m")), clientId: raw.clientId ? String(raw.clientId) : "",
    from, author: str(raw.author || raw.authorName || raw.author_name, 120),
    body, createdAt: str(raw.createdAt || raw.created_at, 40) || nowIso(), pending: Boolean(raw.pending),
  };
}

export function normalizeTicket(raw) {
  if (!raw || raw.id == null || raw.id === "") return null;
  const st0 = String(raw.status || "open").toLowerCase();
  const status = TICKET_STATUS[st0] ? st0 : (STATUS_ALIAS[st0] || "open");
  const messages = (Array.isArray(raw.messages) ? raw.messages : []).map(normalizeMessage).filter(Boolean)
    .sort((a, b) => ts(a.createdAt) - ts(b.createdAt)).slice(-MAX_MESSAGES);
  const created = str(raw.createdAt || raw.created_at, 40) || messages[0]?.createdAt || nowIso();
  const cat = String(raw.category || "other"), pri = String(raw.priority || "normal");
  return {
    id: String(raw.id), clientId: raw.clientId ? String(raw.clientId) : "", number: raw.number != null ? String(raw.number) : "",
    subject: str(raw.subject || raw.title, 200).trim() || "تیکت", status,
    category: TICKET_CATEGORIES[cat] ? cat : "other", priority: TICKET_PRIORITIES[pri] ? pri : "normal",
    createdAt: created, updatedAt: str(raw.updatedAt || raw.updated_at, 40) || messages[messages.length - 1]?.createdAt || created,
    messages, pending: Boolean(raw.pending),
  };
}

// ── ادغام: نتیجهٔ سرور برنده است، ولی هر چیزی که هنوز به سرور نرسیده نباید گم شود ────────────────────────────────────────
export function mergeTickets(local, remote, { complete = true } = {}) {
  const out = [];
  const used = new Set();
  const migrated = {};                          // شناسهٔ محلی ← شناسهٔ سرور (وقتی سرور شناسهٔ دیگری داده)
  for (const r of remote) {
    const l = local.find((x) => x.id === r.id || (r.clientId && x.id === r.clientId) || (x.clientId && x.clientId === r.id));
    if (l) {
      used.add(l.id);
      if (l.id !== r.id) migrated[l.id] = r.id;
      const known = new Set(r.messages.flatMap((m) => [m.id, m.clientId].filter(Boolean)));
      const stillPending = (l.messages || []).filter((m) => m.pending && !known.has(m.id));
      const messages = [...r.messages, ...stillPending].sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
      out.push({ ...r, messages, pending: false, updatedAt: stillPending.length && ts(l.updatedAt) > ts(r.updatedAt) ? l.updatedAt : r.updatedAt,
        status: l.statusPending && l.status !== r.status ? l.status : (stillPending.length && r.status === "answered" ? "open" : r.status), statusPending: Boolean(l.statusPending && l.status !== r.status) });
    } else out.push({ ...r, pending: false });
  }
  for (const l of local) {
    if (used.has(l.id)) continue;
    // هنوز ارسال‌نشده → نگه دار. قبلاً در سرور بوده و حالا نیست (حذف شده) → فقط وقتی فهرست سرور کامل بوده حذف کن.
    if (l.pending || !complete) out.push(l);
  }
  out.sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt));
  return { tickets: out.slice(0, MAX_TICKETS), migrated };
}

export function sortAnnouncements(list) {
  return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (ts(b.publishedAt) - ts(a.publishedAt)));
}
export const isExpired = (a, now = Date.now()) => Boolean(a.expiresAt) && ts(a.expiresAt) > 0 && ts(a.expiresAt) < now;

// ── ذخیرهٔ محلی ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const blank = () => ({ announcements: [], tickets: [], seen: { ann: {}, ticket: {} }, lastSync: "", lastError: null, supported: { announcements: null, tickets: null } });
export function getInbox() {
  const raw = lsRead(INBOX_KEY, null);
  const b = blank();
  if (!raw || typeof raw !== "object") return b;
  return {
    ...b, ...raw,
    announcements: Array.isArray(raw.announcements) ? raw.announcements : [],
    tickets: Array.isArray(raw.tickets) ? raw.tickets : [],
    seen: { ann: { ...(raw.seen?.ann || {}) }, ticket: { ...(raw.seen?.ticket || {}) } },
    supported: { ...b.supported, ...(raw.supported || {}) },
  };
}
function saveInbox(next, { quiet = false } = {}) {
  const before = JSON.stringify(lsRead(INBOX_KEY, null));
  const json = JSON.stringify(next);
  if (before === json) return false;
  lsWrite(INBOX_KEY, next);
  if (!quiet) fireDataChange();
  return true;
}

// ── خوانده/نخوانده ────────────────────────────────────────────────────────────────────────────────────────────────────────
export const latestAdminTs = (t) => (t.messages || []).filter((m) => m.from === "admin").reduce((mx, m) => Math.max(mx, ts(m.createdAt)), 0);
export const ticketUnread = (t, seen) => latestAdminTs(t) > (Number(seen?.[t.id]) || 0);
export const announcementUnread = (a, seen, now = Date.now()) => !isExpired(a, now) && !seen?.[a.id];

export function unreadSummary(inbox = getInbox(), now = Date.now()) {
  const anns = inbox.announcements.filter((a) => announcementUnread(a, inbox.seen.ann, now));
  const tickets = inbox.tickets.filter((t) => ticketUnread(t, inbox.seen.ticket));
  return {
    announcements: anns.length, tickets: tickets.length, total: anns.length + tickets.length,
    critical: sortAnnouncements(anns.filter((a) => a.severity === "critical")), annList: sortAnnouncements(anns), ticketList: tickets,
  };
}
export const unreadCount = () => unreadSummary().total;

export function markAnnouncementRead(id) {
  const inbox = getInbox();
  if (inbox.seen.ann[id]) return;
  inbox.seen.ann[id] = Date.now();
  saveInbox(inbox);
}
export function markAllAnnouncementsRead() {
  const inbox = getInbox();
  inbox.announcements.forEach((a) => { if (!inbox.seen.ann[a.id]) inbox.seen.ann[a.id] = Date.now(); });
  saveInbox(inbox);
}
export function markTicketSeen(id) {
  const inbox = getInbox();
  const t = inbox.tickets.find((x) => x.id === id);
  if (!t) return;
  const latest = latestAdminTs(t);
  if ((Number(inbox.seen.ticket[id]) || 0) >= latest) return;
  inbox.seen.ticket[id] = latest;                // به زمان خود پیام، نه ساعت دستگاه (ساعت اشتباه = نشان اشتباه)
  saveInbox(inbox);
}

// ── اعلان‌های زنگوله (computeNotifications) ───────────────────────────────────────────────────────────────────────────────
export function inboxNotifications() {
  try {
    const s = unreadSummary();
    const out = [];
    s.annList.slice(0, 10).forEach((a) => out.push({
      icon: a.severity === "critical" ? "🚨" : "📢", color: a.severity === "critical" ? "#f87171" : a.severity === "warning" ? "#fbbf24" : "#60a5fa",
      level: a.severity === "critical" ? "critical" : a.severity === "warning" ? "attention" : "info", category: "اطلاعیه", tab: "inbox",
      text: `اطلاعیهٔ پنل مرکزی: ${a.title}`, detail: a.body.slice(0, 120),
    }));
    s.ticketList.slice(0, 10).forEach((t) => out.push({
      icon: "💬", color: "#34d399", level: "attention", category: "تیکت", tab: "inbox", text: `پاسخ جدید به تیکت «${t.subject}»`, detail: t.number ? `شمارهٔ تیکت: ${t.number}` : "",
    }));
    return out;
  } catch { return []; }
}

// ── دریافت از پنل مرکزی ───────────────────────────────────────────────────────────────────────────────────────────────────
let inflight = null;
const errInfo = (e) => ({ code: e?.code || (e?.status ? `http_${e.status}` : "error"), message: String(e?.message || e || "").slice(0, 200), at: nowIso() });
const isMissing = (e) => e?.status === 404 || e?.status === 501 || e?.status === 405;

export function refreshInbox({ request = apiRequest, force = false } = {}) {
  if (inflight && !force) return inflight;
  inflight = (async () => {
    if (isGuestMode()) return { ok: true, skipped: "guest" };
    if (!isApiConnected()) return { ok: true, skipped: "no-api" };
    if (!getAuthenticatedUser()) return { ok: true, skipped: "no-auth" };
    const [a, t] = await Promise.allSettled([request(`/api/announcements?limit=${PAGE_LIMIT}`), request(`/api/tickets?limit=${PAGE_LIMIT}`)]);
    const inbox = getInbox();
    const prevAnn = new Set(inbox.announcements.map((x) => x.id));
    const result = { ok: true, newAnnouncements: [], newReplies: [], errors: [] };
    if (a.status === "fulfilled") {
      const list = asList(a.value).map(normalizeAnnouncement).filter(Boolean).filter((x) => !isExpired(x));
      inbox.announcements = sortAnnouncements(list).slice(0, MAX_ANNOUNCEMENTS);
      inbox.supported.announcements = true;
      result.newAnnouncements = inbox.announcements.filter((x) => !prevAnn.has(x.id) && !inbox.seen.ann[x.id]);
      // خوانده‌شده‌هایی که دیگر در فهرست نیستند حافظه را پر نکنند
      const ids = new Set(inbox.announcements.map((x) => x.id));
      Object.keys(inbox.seen.ann).forEach((id) => { if (!ids.has(id)) delete inbox.seen.ann[id]; });
    } else if (isMissing(a.reason)) { inbox.supported.announcements = false; }
    else result.errors.push(errInfo(a.reason));
    if (t.status === "fulfilled") {
      const remote = asList(t.value).map(normalizeTicket).filter(Boolean);
      const beforeAdmin = Object.fromEntries(inbox.tickets.map((x) => [x.id, latestAdminTs(x)]));
      const { tickets, migrated } = mergeTickets(inbox.tickets, remote, { complete: remote.length < PAGE_LIMIT });
      Object.entries(migrated).forEach(([from, to]) => { if (inbox.seen.ticket[from] != null) { inbox.seen.ticket[to] = inbox.seen.ticket[from]; delete inbox.seen.ticket[from]; } });
      inbox.tickets = tickets;
      inbox.supported.tickets = true;
      result.newReplies = tickets.filter((x) => latestAdminTs(x) > (beforeAdmin[x.id] ?? 0) && ticketUnread(x, inbox.seen.ticket));
      const ids = new Set(tickets.map((x) => x.id));
      Object.keys(inbox.seen.ticket).forEach((id) => { if (!ids.has(id)) delete inbox.seen.ticket[id]; });
    } else if (isMissing(t.reason)) { inbox.supported.tickets = false; }
    else result.errors.push(errInfo(t.reason));
    inbox.lastError = result.errors[0] || null;
    if (!result.errors.length) inbox.lastSync = nowIso();
    saveInbox(inbox);
    result.ok = !result.errors.length;
    return result;
  })().finally(() => { inflight = null; });
  return inflight;
}

// ── ثبت‌های کاربر: محلی + صف آفلاین ───────────────────────────────────────────────────────────────────────────────────────
const me = () => { const u = getAuthenticatedUser(); return u ? String(u.name || u.fullName || u.email || "").slice(0, 120) : ""; };

export function canWrite() { return isGuestMode() || isApiConnected(); }

export function createTicket({ subject, body, category = "technical", priority = "normal" } = {}) {
  const s = str(subject, 200).trim(), b = str(body, 8000).trim();
  if (s.length < 3) return { ok: false, error: "موضوع تیکت را بنویسید (دست‌کم ۳ حرف)." };
  if (b.length < 3) return { ok: false, error: "متن تیکت را بنویسید." };
  if (!canWrite()) return { ok: false, error: "این نسخه به پنل مرکزی وصل نیست؛ تیکت فقط پس از اتصال قابل ارسال است." };
  const id = rid("tk"), created = nowIso();
  const message = { id: rid("m"), from: "cafe", author: me(), body: b, createdAt: created, pending: true };
  const demo = isGuestMode();                      // حالت مهمان به سرور نمی‌رود؛ «در انتظار ارسال» معنا ندارد
  if (demo) message.pending = false;
  const ticket = normalizeTicket({ id, subject: s, category, priority, status: "open", createdAt: created, updatedAt: created, messages: [message], pending: !demo });
  ticket.messages = [message];
  ticket.pending = !demo;
  const inbox = getInbox();
  inbox.tickets = [ticket, ...inbox.tickets].slice(0, MAX_TICKETS);
  inbox.seen.ticket[id] = 0;
  saveInbox(inbox);
  queueOp({
    resource: "tickets", action: "create", entityId: id, label: `تیکت: ${s}`,
    body: { id, subject: s, category: ticket.category, priority: ticket.priority, status: "open", createdAt: created, body: b,
      message: { id: message.id, body: b, createdAt: created, author: message.author }, source: { app: "cafino", version: APP_VERSION } },
  });
  return { ok: true, ticket };
}

export function replyTicket(id, text) {
  const b = str(text, 8000).trim();
  if (b.length < 1) return { ok: false, error: "متن پاسخ را بنویسید." };
  const inbox = getInbox();
  const t = inbox.tickets.find((x) => x.id === id);
  if (!t) return { ok: false, error: "تیکت پیدا نشد." };
  if (t.status === "closed") return { ok: false, error: "تیکت بسته است؛ برای ادامه آن را دوباره باز کنید." };
  const message = { id: rid("m"), from: "cafe", author: me(), body: b, createdAt: nowIso(), pending: !isGuestMode() };
  t.messages = [...t.messages, message];
  t.updatedAt = message.createdAt;
  if (t.status === "answered") { t.status = "open"; }
  saveInbox(inbox);
  queueOp({
    resource: "ticketMessages", action: "command", entityId: message.id, idem: `ticket-message-${message.id}`,
    meta: { path: `/api/tickets/${encodeURIComponent(t.id)}/messages` }, label: `پاسخ به تیکت: ${t.subject}`,
    dependsOn: t.pending ? [entityKeyOf("tickets", t.id)] : [],
    body: { id: message.id, body: b, createdAt: message.createdAt, author: message.author },
  });
  return { ok: true, message };
}

export function setTicketStatus(id, status) {
  if (!["open", "closed"].includes(status)) return { ok: false, error: "وضعیت نامعتبر است." };
  const inbox = getInbox();
  const t = inbox.tickets.find((x) => x.id === id);
  if (!t) return { ok: false, error: "تیکت پیدا نشد." };
  if (t.status === status) return { ok: true };
  t.status = status; t.statusPending = !isGuestMode(); t.updatedAt = nowIso();
  saveInbox(inbox);
  queueOp({ resource: "tickets", action: "update", entityId: t.id, body: { status }, label: status === "closed" ? `بستن تیکت: ${t.subject}` : `بازکردن تیکت: ${t.subject}`, dependsOn: t.pending ? [entityKeyOf("tickets", t.id)] : [] });
  return { ok: true };
}

// ── اعلان سیستم‌عامل (وقتی برنامه در پس‌زمینه است) ────────────────────────────────────────────────────────────────────────
export async function showSystemNotice(title, body, tag) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
    if (typeof document !== "undefined" && document.visibilityState === "visible") return false;
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) { await reg.showNotification(title, { body, tag, dir: "rtl", lang: "fa" }); return true; }
    new Notification(title, { body, tag, dir: "rtl", lang: "fa" });
    return true;
  } catch { return false; }
}

// ── زمان‌بندی دریافت ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function startInboxPolling({ intervalMs = 60000, request } = {}) {
  if (typeof window === "undefined") return () => {};
  let stopped = false, debounce = null;
  const run = async () => {
    if (stopped) return;
    try {
      const r = await refreshInbox({ request });
      (r.newAnnouncements || []).slice(0, 3).forEach((a) => showSystemNotice(`اطلاعیه: ${a.title}`, a.body.slice(0, 140), `ann-${a.id}`));
      (r.newReplies || []).slice(0, 3).forEach((t) => showSystemNotice(`پاسخ به تیکت: ${t.subject}`, "پاسخ جدیدی از پشتیبانی رسید.", `tk-${t.id}`));
    } catch { /* دریافت هرگز برنامه را نمی‌اندازد */ }
  };
  const soon = (ms) => { clearTimeout(debounce); debounce = setTimeout(run, ms); };
  const onVisible = () => { if (document.visibilityState === "visible") soon(300); };
  const onOnline = () => soon(500);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  const timer = setInterval(() => { if (document.visibilityState !== "hidden") run(); }, intervalMs);
  // وقتی تیکت یا پاسخی به سرور رسید، کمی بعد فهرست را بگیر تا نشان «در انتظار ارسال» برداشته شود
  const unsub = syncQueue.subscribe?.((ev) => {
    if (ev?.type !== "applied") return;
    const inbox = getInbox();
    if (inbox.tickets.some((t) => t.pending || t.statusPending || (t.messages || []).some((m) => m.pending))) soon(900);
  });
  soon(1500);
  return () => { stopped = true; clearTimeout(debounce); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline); try { unsub?.(); } catch { /* ignore */ } };
}

// ── نمونهٔ حالت مهمان ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function seedInboxDemo() {
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const inbox = getInbox();
  if (inbox.announcements.length || inbox.tickets.length) return false;
  inbox.announcements = sortAnnouncements([
    { id: "demo-a1", title: "به کافینو خوش آمدید", body: "این یک اطلاعیهٔ نمونه است. در نسخهٔ واقعی، اطلاعیه‌های پنل مرکزی (به‌روزرسانی، اطلاعیهٔ فوری، تعطیلی پشتیبانی…) همین‌جا و در زنگوله بالای صفحه نمایش داده می‌شود.", severity: "info", pinned: true, publishedAt: ago(30) },
    { id: "demo-a2", title: "به‌روزرسانی برنامه در راه است", body: "نسخهٔ جدید شامل بهبود مرکز چاپ و اسکن است. پیش از به‌روزرسانی یک پشتیبان تهیه کنید.", severity: "warning", pinned: false, publishedAt: ago(6) },
  ].map(normalizeAnnouncement));
  inbox.tickets = [normalizeTicket({
    id: "demo-t1", number: "1001", subject: "نمونه: چاپگر صف را نشان نمی‌دهد", category: "technical", priority: "normal", status: "answered", createdAt: ago(20), updatedAt: ago(2),
    messages: [
      { id: "demo-m1", from: "cafe", author: "شما", body: "سلام، بعد از تغییر چاپگر، کارهای چاپ در مرکز چاپ ثبت نمی‌شود.", createdAt: ago(20) },
      { id: "demo-m2", from: "admin", author: "پشتیبانی کافینو", body: "سلام. لطفاً در «تنظیمات ← پرینت و اسکن» دستگاه جدید را اضافه کنید و دوباره امتحان کنید. اگر درست نشد همین‌جا بنویسید.", createdAt: ago(2) },
    ] })];
  saveInbox(inbox, { quiet: true });
  return true;
}
