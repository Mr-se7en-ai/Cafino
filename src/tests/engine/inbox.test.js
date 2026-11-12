// اطلاعیه و تیکت از پنل مرکزی — دریافت، کش محلی، خوانده/نخوانده، صف آفلاین (ساخت تیکت، پاسخ، بستن)، ایمنی در برابر ارسال تکراری
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { E, fresh } from "./helpers.js";

// ── پنل مرکزی ساختگی (همان قرارداد inbox-api-fa.md) ─────────────────────────────────────────────────────────────────────
const srv = { net: "up", announcements: [], tickets: [], idem: new Map(), calls: [], missing: new Set(), loseNext: 0 };
const reset = () => { srv.net = "up"; srv.announcements = []; srv.tickets = []; srv.idem = new Map(); srv.calls = []; srv.missing = new Set(); srv.loseNext = 0; };
const json = (status, data) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => data });
globalThis.__fetchImpl = async (url, init = {}) => {
  if (srv.net === "down") throw new TypeError("Failed to fetch");
  const u = new URL(url), parts = u.pathname.split("/").filter(Boolean), m = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : undefined, key = init.headers?.["Idempotency-Key"] || null;
  srv.calls.push({ m, path: u.pathname, key, body });
  const res = parts[1];
  if (srv.missing.has(res)) return json(404, { error: { code: "not_found", message: "no route" } });
  if (res === "announcements" && m === "GET") return json(200, { data: srv.announcements });
  if (res === "tickets" && m === "GET") return json(200, { data: srv.tickets });
  if (res === "tickets" && m === "POST" && parts.length === 2) {
    if (key && srv.idem.has(key)) return json(200, { data: srv.idem.get(key) });
    const row = { id: body.id, number: String(1000 + srv.tickets.length + 1), subject: body.subject, category: body.category, priority: body.priority, status: "open", createdAt: body.createdAt, updatedAt: body.createdAt,
      messages: [{ id: body.message.id, from: "cafe", author: body.message.author, body: body.message.body, createdAt: body.message.createdAt }] };
    srv.tickets.push(row); if (key) srv.idem.set(key, row);
    if (srv.loseNext > 0) { srv.loseNext--; throw new TypeError("connection reset after processing"); }
    return json(201, { data: row });
  }
  if (res === "tickets" && parts[3] === "messages" && m === "POST") {
    const t = srv.tickets.find((x) => x.id === parts[2]); if (!t) return json(404, { error: { code: "not_found", message: "ticket" } });
    if (key && srv.idem.has(key)) return json(200, { data: srv.idem.get(key) });
    const msg = { id: body.id, from: "cafe", author: body.author, body: body.body, createdAt: body.createdAt };
    t.messages.push(msg); t.updatedAt = msg.createdAt; if (key) srv.idem.set(key, msg);
    return json(201, { data: msg });
  }
  if (res === "tickets" && m === "PATCH") { const t = srv.tickets.find((x) => x.id === parts[2]); if (!t) return json(404, { error: { code: "not_found", message: "x" } }); Object.assign(t, body); return json(200, { data: t }); }
  return json(404, { error: { code: "not_found", message: "?" } });
};
const adminReply = (id, body, at = new Date().toISOString()) => { const t = srv.tickets.find((x) => x.id === id); t.messages.push({ id: `a${t.messages.length}`, from: "admin", author: "پشتیبانی", body, createdAt: at }); t.updatedAt = at; t.status = "answered"; };
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const settle = async () => { await E.syncQueue.notifyOnline(); await E.syncQueue.idle(); };
const ops = () => E.syncQueue.list().filter((o) => o.status !== "done");

beforeEach(async () => {
  fresh(); reset();
  E.saveApiConfig({ baseUrl: "http://admin.test", cafeId: "c1" });
  E.setAuthenticatedUser({ id: "u1", email: "a@b.c", name: "صاحب کافی‌نت" });
  await E.syncQueue.clearAll(); E.syncQueue.resume?.();
});

test("نرمال‌سازی: نام‌های دیگر شدت/وضعیت/فرستنده و دادهٔ ناقص", () => {
  assert.equal(E.normalizeAnnouncement({ id: 1, title: "x", severity: "urgent" }).severity, "critical");
  assert.equal(E.normalizeAnnouncement({ id: 1, title: "x", level: "important" }).severity, "warning");
  assert.equal(E.normalizeAnnouncement({ id: 1, title: "x", severity: "???" }).severity, "info");
  assert.equal(E.normalizeAnnouncement({ id: 1, title: "x", link: "javascript:alert(1)" }).link, "", "پیوند غیر http حذف می‌شود");
  assert.equal(E.normalizeAnnouncement({ title: "بدون شناسه" }), null);
  assert.equal(E.normalizeAnnouncement({ id: 2 }), null);
  const t = E.normalizeTicket({ id: "t1", subject: "s", status: "resolved", messages: [{ id: "m2", sender: "support", body: "b", createdAt: ago(1) }, { id: "m1", from: "cafe", body: "a", createdAt: ago(3) }, { id: "m3", body: "" }] });
  assert.equal(t.status, "closed"); assert.equal(t.messages.length, 2);
  assert.deepEqual(t.messages.map((m) => m.from), ["cafe", "admin"], "به ترتیب زمان و با فرستندهٔ درست");
});

test("دریافت: اطلاعیه و تیکت ذخیره، منقضی‌ها کنار، نخوانده‌ها شمرده می‌شوند", async () => {
  srv.announcements = [
    { id: "a1", title: "عادی", body: "x", severity: "info", publishedAt: ago(5) },
    { id: "a2", title: "فوری", body: "y", severity: "critical", publishedAt: ago(1) },
    { id: "a3", title: "منقضی", body: "z", expiresAt: ago(2), publishedAt: ago(9) },
    { id: "a4", title: "سنجاق", body: "w", pinned: true, publishedAt: ago(40) },
  ];
  const r = await E.refreshInbox();
  assert.ok(r.ok); assert.equal(r.newAnnouncements.length, 3);
  const inbox = E.getInbox();
  assert.deepEqual(inbox.announcements.map((a) => a.id), ["a4", "a2", "a1"], "سنجاق‌شده اول، بعد تازه‌ترین؛ منقضی حذف");
  const s = E.unreadSummary();
  assert.equal(s.announcements, 3); assert.equal(s.critical.length, 1); assert.equal(s.critical[0].id, "a2");
  assert.ok(inbox.lastSync); assert.equal(inbox.lastError, null);
  E.markAnnouncementRead("a2");
  assert.equal(E.unreadSummary().critical.length, 0); assert.equal(E.unreadSummary().announcements, 2);
  await E.refreshInbox({ force: true });
  assert.equal(E.unreadSummary().announcements, 2, "خوانده‌شده پس از دریافت دوباره نخوانده نمی‌شود");
  E.markAllAnnouncementsRead(); assert.equal(E.unreadSummary().announcements, 0);
});

test("پاسخ ادمین نخوانده است تا تیکت باز شود؛ پاسخ تازه دوباره نشان می‌دهد", async () => {
  srv.tickets = [{ id: "t1", number: "1", subject: "چاپگر", status: "answered", createdAt: ago(5), updatedAt: ago(1),
    messages: [{ id: "m1", from: "cafe", body: "سلام", createdAt: ago(5) }, { id: "m2", from: "admin", body: "راه‌حل", createdAt: ago(1) }] }];
  await E.refreshInbox();
  assert.equal(E.unreadSummary().tickets, 1);
  E.markTicketSeen("t1"); assert.equal(E.unreadSummary().tickets, 0);
  await E.refreshInbox({ force: true }); assert.equal(E.unreadSummary().tickets, 0, "دریافت دوباره نشان را برنمی‌گرداند");
  adminReply("t1", "پیگیری شد", new Date(Date.now() + 1000).toISOString());
  const r = await E.refreshInbox({ force: true });
  assert.equal(E.unreadSummary().tickets, 1); assert.equal(r.newReplies.length, 1);
  assert.equal(E.getInbox().tickets[0].messages.length, 3);
});

test("نخوانده بودن به زمان پیام تکیه دارد نه ساعت دستگاه", async () => {
  const future = new Date(Date.now() + 30 * 86400e3).toISOString();      // ساعت سرور جلوتر از ساعت دستگاه
  srv.tickets = [{ id: "t1", subject: "s", messages: [{ id: "m", from: "admin", body: "b", createdAt: future }] }];
  await E.refreshInbox(); assert.equal(E.unreadSummary().tickets, 1);
  E.markTicketSeen("t1"); assert.equal(E.unreadSummary().tickets, 0, "با ساعت اشتباه هم باز و خوانده‌شده می‌شود");
});

test("ساخت تیکت آفلاین: فوری محلی، در صف، با اتصال یک بار می‌رسد (حتی با قطع وسط ارسال)", async () => {
  srv.net = "down";
  const r = E.createTicket({ subject: "قطع اینترنت", body: "از دیروز قطع است", category: "technical", priority: "high" });
  assert.ok(r.ok); assert.equal(r.ticket.pending, true);
  assert.equal(E.getInbox().tickets.length, 1);
  assert.equal(ops().length, 1);
  assert.equal(ops()[0].idem, `tickets-${r.ticket.id}`);
  await settle(); assert.equal(srv.tickets.length, 0); assert.equal(ops().length, 1, "هنوز در صف");
  srv.net = "up"; srv.loseNext = 1;                      // سرور پردازش می‌کند ولی پاسخ گم می‌شود
  await settle(); await settle(); await settle();
  assert.equal(srv.tickets.length, 1, "تیکت دوباره ساخته نشد");
  assert.equal(srv.tickets[0].subject, "قطع اینترنت"); assert.equal(srv.tickets[0].priority, "high");
  assert.equal(srv.tickets[0].messages[0].author, "صاحب کافی‌نت");
  await E.refreshInbox({ force: true });
  const t = E.getInbox().tickets;
  assert.equal(t.length, 1); assert.equal(t[0].pending, false); assert.equal(t[0].number, "1001");
  assert.equal(t[0].messages.length, 1, "پیام اول دو بار ثبت نشد");
});

test("پاسخ به تیکتی که هنوز ارسال نشده: بعد از ساخت تیکت می‌رود و با سرور هم‌ترتیب است", async () => {
  srv.net = "down";
  const { ticket } = E.createTicket({ subject: "موضوع", body: "متن اول" });
  assert.ok(E.replyTicket(ticket.id, "توضیح بیشتر").ok);
  assert.equal(ops().length, 2);
  const msgOp = ops().find((o) => o.resource === "ticketMessages");
  assert.ok(msgOp.dependsOn.includes(`tickets:${ticket.id}`));
  assert.equal(msgOp.req.path, `/api/tickets/${ticket.id}/messages`);
  srv.net = "up"; await settle(); await settle();
  assert.deepEqual(srv.calls.filter((c) => c.m === "POST").map((c) => c.path.endsWith("/messages") ? "msg" : "ticket"), ["ticket", "msg"]);
  assert.equal(srv.tickets[0].messages.length, 2);
  await E.refreshInbox({ force: true });
  const t = E.getInbox().tickets[0];
  assert.equal(t.messages.length, 2); assert.ok(t.messages.every((m) => !m.pending)); assert.equal(t.pending, false);
});

test("پاسخ هنوز نرسیده روی نتیجهٔ دریافت جدید نمی‌پرد (گم نمی‌شود)", async () => {
  srv.tickets = [{ id: "t1", subject: "s", status: "answered", createdAt: ago(3), updatedAt: ago(2), messages: [{ id: "m1", from: "admin", body: "سلام", createdAt: ago(2) }] }];
  await E.refreshInbox();
  srv.net = "down";
  assert.ok(E.replyTicket("t1", "پاسخ آفلاین من").ok);
  srv.net = "up"; srv.missing.add("announcements");
  // دریافت می‌آید و پاسخ ما هنوز روی سرور نیست
  const real = globalThis.__fetchImpl; globalThis.__fetchImpl = async (u, i = {}) => (i.method === "POST" ? (() => { throw new TypeError("offline"); })() : real(u, i));
  await E.refreshInbox({ force: true });
  globalThis.__fetchImpl = real;
  const t = E.getInbox().tickets[0];
  assert.equal(t.messages.length, 2); assert.equal(t.messages[1].pending, true); assert.equal(t.status, "open", "پاسخ‌دادن تیکت «پاسخ داده شد» را باز می‌کند");
  await settle(); await E.refreshInbox({ force: true });
  assert.equal(E.getInbox().tickets[0].messages.filter((m) => m.body === "پاسخ آفلاین من").length, 1);
});

test("بستن و بازکردن تیکت از صف می‌رود؛ پاسخ به تیکت بسته رد می‌شود", async () => {
  srv.tickets = [{ id: "t1", subject: "s", status: "open", createdAt: ago(3), updatedAt: ago(3), messages: [{ id: "m1", from: "cafe", body: "x", createdAt: ago(3) }] }];
  await E.refreshInbox();
  assert.ok(E.setTicketStatus("t1", "closed").ok);
  assert.equal(E.getInbox().tickets[0].status, "closed");
  assert.equal(E.replyTicket("t1", "سلام").ok, false);
  await settle();
  assert.equal(srv.tickets[0].status, "closed");
  await E.refreshInbox({ force: true }); assert.equal(E.getInbox().tickets[0].statusPending, false);
  assert.ok(E.setTicketStatus("t1", "open").ok); await settle();
  assert.equal(srv.tickets[0].status, "open");
  assert.equal(E.setTicketStatus("t1", "weird").ok, false);
});

test("اعتبارسنجی ورودی و عدم اتصال", () => {
  assert.equal(E.createTicket({ subject: "ab", body: "متن" }).ok, false);
  assert.equal(E.createTicket({ subject: "موضوع خوب", body: " " }).ok, false);
  E.saveApiConfig({ baseUrl: "", cafeId: "" });
  const r = E.createTicket({ subject: "موضوع خوب", body: "متن خوب" });
  assert.equal(r.ok, false); assert.match(r.error, /پنل مرکزی/);
  assert.equal(E.getInbox().tickets.length, 0);
});

test("پنل مرکزی بدون این مسیرها (۴۰۴): خطا نمی‌دهد، فقط «پشتیبانی نمی‌شود»", async () => {
  srv.missing.add("announcements"); srv.missing.add("tickets");
  const r = await E.refreshInbox();
  assert.equal(r.ok, true); assert.equal(r.errors.length, 0);
  const inbox = E.getInbox(); assert.equal(inbox.supported.announcements, false); assert.equal(inbox.supported.tickets, false); assert.equal(inbox.lastError, null);
});

test("قطع شبکه: خطا ثبت می‌شود ولی دادهٔ قبلی می‌ماند", async () => {
  srv.announcements = [{ id: "a1", title: "x", body: "y" }];
  await E.refreshInbox();
  srv.net = "down";
  const r = await E.refreshInbox({ force: true });
  assert.equal(r.ok, false); assert.equal(E.getInbox().lastError.code, "network_error");
  assert.equal(E.getInbox().announcements.length, 1, "کش محلی سالم می‌ماند");
});

test("بدون اتصال / بدون ورود / مهمان: هیچ درخواستی نمی‌رود", async () => {
  E.saveApiConfig({ baseUrl: "", cafeId: "" });
  assert.equal((await E.refreshInbox()).skipped, "no-api");
  E.saveApiConfig({ baseUrl: "http://admin.test", cafeId: "" }); E.clearAuthSession();
  assert.equal((await E.refreshInbox()).skipped, "no-auth");
  E.setAuthenticatedUser({ id: "u1", email: "a@b.c" });
  globalThis.sessionStorage.setItem("cafenet_guest_mode", "1");
  assert.equal((await E.refreshInbox()).skipped, "guest");
  globalThis.sessionStorage.removeItem("cafenet_guest_mode");
  assert.equal(srv.calls.length, 0);
});

test("ادغام: ارسال‌نشده‌ها می‌مانند، حذف‌شده‌های سرور وقتی فهرست کامل است می‌روند، شناسهٔ سرور جایگزین می‌شود", () => {
  const local = [
    { id: "L1", subject: "محلی", status: "open", pending: true, messages: [], updatedAt: ago(1), createdAt: ago(1) },
    { id: "S1", subject: "قدیمی", status: "open", pending: false, messages: [], updatedAt: ago(9), createdAt: ago(9) },
    { id: "C1", subject: "ساخته‌شده", status: "open", pending: true, messages: [{ id: "cm", from: "cafe", body: "b", createdAt: ago(2), pending: true }], updatedAt: ago(2), createdAt: ago(2) },
  ];
  const remote = [E.normalizeTicket({ id: "srv-9", clientId: "C1", subject: "ساخته‌شده", messages: [{ id: "x", clientId: "cm", from: "cafe", body: "b", createdAt: ago(2) }], createdAt: ago(2), updatedAt: ago(2) })];
  const full = E.mergeTickets(local, remote, { complete: true });
  assert.deepEqual(full.tickets.map((t) => t.id).sort(), ["L1", "srv-9"]);
  assert.equal(full.migrated.C1, "srv-9");
  assert.equal(full.tickets.find((t) => t.id === "srv-9").messages.length, 1, "پیام محلی با clientId یکی شد");
  const partial = E.mergeTickets(local, remote, { complete: false });
  assert.ok(partial.tickets.some((t) => t.id === "S1"), "فهرست ناقص → چیزی حذف نمی‌شود");
});

test("اعلان‌های زنگوله: اطلاعیهٔ فوری critical و پاسخ تیکت", async () => {
  srv.announcements = [{ id: "a1", title: "قطعی سرور", body: "ساعت ۲۲", severity: "critical", publishedAt: ago(1) }];
  srv.tickets = [{ id: "t1", number: "77", subject: "فاکتور", messages: [{ id: "m", from: "admin", body: "بله", createdAt: ago(1) }] }];
  await E.refreshInbox();
  const n = E.inboxNotifications();
  assert.equal(n.length, 2); assert.equal(n.find((x) => x.category === "اطلاعیه").level, "critical");
  assert.ok(n.every((x) => x.tab === "inbox"));
});

test("حالت مهمان: دادهٔ نمونه و تیکت محلی بدون صف", () => {
  globalThis.sessionStorage.setItem("cafenet_guest_mode", "1"); globalThis.__resetStorage();
  assert.equal(E.seedInboxDemo(), true); assert.equal(E.seedInboxDemo(), false);
  const s = E.unreadSummary(); assert.ok(s.announcements >= 1); assert.equal(s.tickets, 1);
  const r = E.createTicket({ subject: "تیکت نمونه", body: "متن نمونه" });
  assert.ok(r.ok); assert.equal(r.ticket.pending, false);
  assert.equal(E.syncQueue.list().length, 0);
  globalThis.sessionStorage.removeItem("cafenet_guest_mode");
});
