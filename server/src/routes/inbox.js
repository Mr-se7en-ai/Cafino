// سمت کافی‌نت: اطلاعیه‌ها (فقط‌خواندنی) و تیکت‌ها — قرارداد دقیق در admin-reference/inbox-api-fa.md
import crypto from "node:crypto";
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { withIdempotency } from "../lib/idem.js";
import { HttpError, conflict, invalid, notFound } from "../lib/errors.js";
import { clampInt, toEnum, toId, toText, toTimestamp } from "../lib/validate.js";

export const announcementToApi = (r) => ({
  id: r.id, title: r.title, body: r.body, severity: r.severity, pinned: r.pinned, link: r.link,
  publishedAt: new Date(r.published_at).toISOString(), expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : "",
});
export const messageToApi = (m) => ({ id: m.id, from: m.from_role, author: m.author, body: m.body, createdAt: new Date(m.created_at).toISOString() });
export const ticketToApi = (t, messages = []) => ({
  id: t.id, number: String(t.number), subject: t.subject, category: t.category, priority: t.priority, status: t.status,
  createdAt: new Date(t.created_at).toISOString(), updatedAt: new Date(t.updated_at).toISOString(), messages: messages.map(messageToApi),
});

export async function loadTickets(pool, where, params, limit = 100, offset = 0) {
  const t = await pool.query(`SELECT * FROM tickets WHERE ${where} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  if (!t.rows.length) return [];
  const ids = t.rows.map((x) => x.id), cafes = [...new Set(t.rows.map((x) => x.cafe_id))];
  const m = await pool.query("SELECT * FROM ticket_messages WHERE cafe_id = ANY($1::uuid[]) AND ticket_id = ANY($2) ORDER BY created_at, id", [cafes, ids]);
  const by = new Map();
  for (const x of m.rows) { const k = `${x.cafe_id}/${x.ticket_id}`; (by.get(k) || by.set(k, []).get(k)).push(x); }
  return t.rows.map((r) => ({ row: r, api: ticketToApi(r, by.get(`${r.cafe_id}/${r.id}`) || []) }));
}

export function registerInbox(app) {
  const { pool } = app;
  const cafeOnly = app.requireCafe({ allowSuspended: true });     // تعلیق‌شده‌ها هم باید بتوانند تیکت بزنند و اطلاعیه ببینند

  app.get("/api/announcements", { preHandler: cafeOnly }, async (req) => {
    const limit = clampInt(req.query.limit, 100, 1, 200);
    const r = await pool.query(
      `SELECT * FROM announcements WHERE (cardinality(target_cafes) = 0 OR $1::uuid = ANY(target_cafes)) AND (expires_at IS NULL OR expires_at > now()) AND published_at <= now()
       ORDER BY pinned DESC, published_at DESC LIMIT ${limit}`, [req.user.cafeId]);
    return { data: r.rows.map(announcementToApi) };
  });

  app.get("/api/tickets", { preHandler: cafeOnly }, async (req) => {
    const limit = clampInt(req.query.limit, 100, 1, 200), offset = clampInt(req.query.offset, 0, 0, 1e6);
    const list = await loadTickets(pool, "cafe_id = $1", [req.user.cafeId], limit, offset);
    return { data: list.map((x) => x.api) };
  });

  app.post("/api/tickets", { preHandler: cafeOnly }, async (req, reply) => {
    const cafeId = req.user.cafeId, b = req.body || {};
    const out = await tx(pool, (c) => withIdempotency(c, { scope: cafeId, req, run: async () => {
      const id = toId(b.id, "شناسهٔ تیکت");
      const subject = toText(b.subject, { max: 200, key: "subject" }).trim();
      const msg = b.message || {};
      const body = toText(msg.body ?? b.body, { max: 8000, key: "message.body" }).trim();
      if (subject.length < 3) throw invalid("موضوع تیکت کوتاه است");
      if (!body) throw invalid("متن تیکت لازم است");
      const dup = await c.query("SELECT * FROM tickets WHERE cafe_id=$1 AND id=$2", [cafeId, id]);
      if (dup.rows[0]) { const [x] = await loadTickets(c, "cafe_id=$1 AND id=$2", [cafeId, id]); return { status: 200, body: x.api }; }
      const recent = await c.query("SELECT count(*)::int AS n FROM tickets WHERE cafe_id=$1 AND created_at > now() - interval '1 hour'", [cafeId]);
      if (recent.rows[0].n >= 30) throw new HttpError(429, "rate_limited", "تعداد تیکت‌های ساعت اخیر زیاد است");
      const createdAt = toTimestamp(b.createdAt, "createdAt") || new Date().toISOString();
      await c.query("INSERT INTO tickets(cafe_id,id,subject,category,priority,created_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)",
        [cafeId, id, subject, toEnum(b.category, ["technical", "billing", "feature", "other"], { key: "category", def: "other" }), toEnum(b.priority, ["low", "normal", "high"], { key: "priority", def: "normal" }), req.user.id, createdAt]);
      await c.query("INSERT INTO ticket_messages(cafe_id,ticket_id,id,from_role,author,body,created_at) VALUES ($1,$2,$3,'cafe',$4,$5,$6)",
        [cafeId, id, toId(msg.id ?? crypto.randomUUID(), "شناسهٔ پیام"), toText(msg.author, { max: 120, key: "author" }), body, toTimestamp(msg.createdAt, "createdAt") || createdAt]);
      await audit(c, { cafeId, userId: req.user.id, action: "ticket.create", entity: "ticket", entityId: id, ip: req.ip });
      const [x] = await loadTickets(c, "cafe_id=$1 AND id=$2", [cafeId, id]);
      return { status: 201, body: x.api };
    } }));
    if (out.replay) reply.header("Idempotency-Replayed", "true");
    return reply.code(out.status).send({ data: out.body });
  });

  app.post("/api/tickets/:id/messages", { preHandler: cafeOnly }, async (req, reply) => {
    const cafeId = req.user.cafeId, id = toId(req.params.id), b = req.body || {};
    const out = await tx(pool, (c) => withIdempotency(c, { scope: cafeId, req, run: async () => {
      const t = (await c.query("SELECT * FROM tickets WHERE cafe_id=$1 AND id=$2 FOR UPDATE", [cafeId, id])).rows[0];
      if (!t) throw notFound("تیکت پیدا نشد");
      const mid = toId(b.id ?? crypto.randomUUID(), "شناسهٔ پیام");
      const dup = await c.query("SELECT * FROM ticket_messages WHERE cafe_id=$1 AND ticket_id=$2 AND id=$3", [cafeId, id, mid]);
      if (dup.rows[0]) return { status: 200, body: messageToApi(dup.rows[0]) };
      if (t.status === "closed") throw conflict("تیکت بسته است", "ticket_closed");
      const body = toText(b.body, { max: 8000, key: "body" }).trim();
      if (!body) throw invalid("متن پاسخ لازم است");
      const at = toTimestamp(b.createdAt, "createdAt") || new Date().toISOString();
      const m = (await c.query("INSERT INTO ticket_messages(cafe_id,ticket_id,id,from_role,author,body,created_at) VALUES ($1,$2,$3,'cafe',$4,$5,$6) RETURNING *",
        [cafeId, id, mid, toText(b.author, { max: 120, key: "author" }), body, at])).rows[0];
      await c.query("UPDATE tickets SET updated_at = GREATEST(updated_at, $3), status = CASE WHEN status = 'answered' THEN 'open' ELSE status END WHERE cafe_id=$1 AND id=$2", [cafeId, id, at]);
      return { status: 201, body: messageToApi(m) };
    } }));
    if (out.replay) reply.header("Idempotency-Replayed", "true");
    return reply.code(out.status).send({ data: out.body });
  });

  app.patch("/api/tickets/:id", { preHandler: cafeOnly }, async (req) => {
    const cafeId = req.user.cafeId, id = toId(req.params.id);
    const status = toEnum(req.body?.status, ["open", "closed"], { key: "status", def: "" });
    if (!status) throw invalid("فقط open یا closed");
    const r = await pool.query("UPDATE tickets SET status=$3, updated_at=now() WHERE cafe_id=$1 AND id=$2 RETURNING *", [cafeId, id, status]);
    if (!r.rows[0]) throw notFound("تیکت پیدا نشد");
    const [x] = await loadTickets(pool, "cafe_id=$1 AND id=$2", [cafeId, id]);
    return { data: x.api };
  });
}
