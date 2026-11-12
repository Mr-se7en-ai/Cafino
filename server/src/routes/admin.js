// پنل مرکزی (فقط نقش platform_admin): اطلاعیه‌ها، تیکت‌ها، کافی‌نت‌ها. همان قرارداد سرور مرجع، ولی با احراز هویت واقعی.
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { conflict, invalid, notFound } from "../lib/errors.js";
import { hashPassword, randomToken, validEmail } from "../lib/security.js";
import { clampInt, toEnum, toId, toText, toTimestamp } from "../lib/validate.js";
import { announcementToApi, loadTickets, messageToApi } from "./inbox.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v, what) => { if (!UUID.test(String(v))) throw invalid(`${what} نامعتبر است`); return String(v).toLowerCase(); };

export function registerAdmin(app) {
  const { pool } = app;
  const adm = { preHandler: app.requireAdmin };

  // ── اطلاعیه‌ها ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const annBody = (b) => ({
    title: toText(b.title, { max: 200, key: "title" }).trim(), body: toText(b.body, { max: 8000, key: "body" }),
    severity: toEnum(b.severity, ["info", "warning", "critical"], { key: "severity", def: "info" }), pinned: Boolean(b.pinned),
    link: (() => { const l = toText(b.link, { max: 500, key: "link" }); if (l && !/^https?:\/\//i.test(l)) throw invalid("پیوند باید با http(s) شروع شود"); return l; })(),
    expires_at: toTimestamp(b.expiresAt, "expiresAt"),
    target_cafes: (Array.isArray(b.targetCafes) ? b.targetCafes : []).slice(0, 1000).map((x) => uuid(x, "شناسهٔ کافی‌نت")),
  });
  app.get("/api/admin/announcements", adm, async () => {
    const r = await pool.query("SELECT * FROM announcements ORDER BY published_at DESC LIMIT 500");
    return { data: r.rows.map((x) => ({ ...announcementToApi(x), targetCafes: x.target_cafes })) };
  });
  app.post("/api/admin/announcements", adm, async (req, reply) => {
    const a = annBody(req.body || {});
    if (!a.title) throw invalid("عنوان لازم است");
    const r = await tx(pool, async (c) => {
      const row = (await c.query("INSERT INTO announcements(title,body,severity,pinned,link,expires_at,target_cafes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [a.title, a.body, a.severity, a.pinned, a.link, a.expires_at, a.target_cafes, req.user.id])).rows[0];
      await audit(c, { userId: req.user.id, action: "admin.announcement.create", entity: "announcement", entityId: row.id, details: { severity: a.severity, targets: a.target_cafes.length }, ip: req.ip });
      return row;
    });
    return reply.code(201).send({ data: { ...announcementToApi(r), targetCafes: r.target_cafes } });
  });
  app.patch("/api/admin/announcements/:id", adm, async (req) => {
    const id = uuid(req.params.id, "شناسه"), b = req.body || {};
    const cur = (await pool.query("SELECT * FROM announcements WHERE id=$1", [id])).rows[0];
    if (!cur) throw notFound("اطلاعیه پیدا نشد");
    const a = annBody({ title: cur.title, body: cur.body, severity: cur.severity, pinned: cur.pinned, link: cur.link, expiresAt: cur.expires_at, targetCafes: cur.target_cafes, ...b });
    const r = (await pool.query("UPDATE announcements SET title=$2,body=$3,severity=$4,pinned=$5,link=$6,expires_at=$7,target_cafes=$8 WHERE id=$1 RETURNING *", [id, a.title, a.body, a.severity, a.pinned, a.link, a.expires_at, a.target_cafes])).rows[0];
    return { data: { ...announcementToApi(r), targetCafes: r.target_cafes } };
  });
  app.delete("/api/admin/announcements/:id", adm, async (req, reply) => {
    await tx(pool, async (c) => {
      const r = await c.query("DELETE FROM announcements WHERE id=$1 RETURNING id", [uuid(req.params.id, "شناسه")]);
      if (r.rows[0]) await audit(c, { userId: req.user.id, action: "admin.announcement.delete", entity: "announcement", entityId: r.rows[0].id, ip: req.ip });
    });
    return reply.code(204).send();
  });

  // ── تیکت‌ها ───────────────────────────────────────────────────────────────────────────────────────────────────────
  app.get("/api/admin/tickets", adm, async (req) => {
    const limit = clampInt(req.query.limit, 50, 1, 200), offset = clampInt(req.query.offset, 0, 0, 1e6);
    const where = ["true"], params = [];
    if (req.query.status) { params.push(toEnum(req.query.status, ["open", "pending", "answered", "closed"], { key: "status" })); where.push(`status=$${params.length}`); }
    if (req.query.cafeId) { params.push(uuid(req.query.cafeId, "cafeId")); where.push(`cafe_id=$${params.length}`); }
    const list = await loadTickets(pool, where.join(" AND "), params, limit, offset);
    const names = new Map((await pool.query("SELECT id, name FROM cafes WHERE id = ANY($1::uuid[])", [[...new Set(list.map((x) => x.row.cafe_id))]])).rows.map((r) => [r.id, r.name]));
    return { data: list.map((x) => ({ ...x.api, cafeId: x.row.cafe_id, cafeName: names.get(x.row.cafe_id) || "" })) };
  });
  app.get("/api/admin/tickets/:cafeId/:id", adm, async (req) => {
    const list = await loadTickets(pool, "cafe_id=$1 AND id=$2", [uuid(req.params.cafeId, "cafeId"), toId(req.params.id)]);
    if (!list[0]) throw notFound("تیکت پیدا نشد");
    return { data: { ...list[0].api, cafeId: list[0].row.cafe_id } };
  });
  app.post("/api/admin/tickets/:cafeId/:id/reply", adm, async (req, reply) => {
    const cafeId = uuid(req.params.cafeId, "cafeId"), id = toId(req.params.id), b = req.body || {};
    const body = toText(b.body, { max: 8000, key: "body" }).trim();
    if (!body) throw invalid("متن پاسخ لازم است");
    const status = toEnum(b.status, ["pending", "answered", "closed"], { key: "status", def: "answered" });
    const m = await tx(pool, async (c) => {
      const t = (await c.query("SELECT 1 FROM tickets WHERE cafe_id=$1 AND id=$2 FOR UPDATE", [cafeId, id])).rows[0];
      if (!t) throw notFound("تیکت پیدا نشد");
      const mid = `adm_${randomToken(12)}`;
      const row = (await c.query("INSERT INTO ticket_messages(cafe_id,ticket_id,id,from_role,author,body) VALUES ($1,$2,$3,'admin',$4,$5) RETURNING *",
        [cafeId, id, mid, toText(b.author, { max: 120, key: "author" }) || "پشتیبانی کافینو", body])).rows[0];
      await c.query("UPDATE tickets SET status=$3, updated_at=now() WHERE cafe_id=$1 AND id=$2", [cafeId, id, status]);
      await audit(c, { cafeId, userId: req.user.id, action: "admin.ticket.reply", entity: "ticket", entityId: id, details: { status }, ip: req.ip });
      return row;
    });
    return reply.code(201).send({ data: messageToApi(m) });
  });
  app.patch("/api/admin/tickets/:cafeId/:id", adm, async (req) => {
    const cafeId = uuid(req.params.cafeId, "cafeId"), id = toId(req.params.id);
    const status = toEnum(req.body?.status, ["open", "pending", "answered", "closed"], { key: "status" });
    const r = await pool.query("UPDATE tickets SET status=$3, updated_at=now() WHERE cafe_id=$1 AND id=$2 RETURNING id", [cafeId, id, status]);
    if (!r.rows[0]) throw notFound("تیکت پیدا نشد");
    return { data: { id, status } };
  });

  // ── کافی‌نت‌ها ────────────────────────────────────────────────────────────────────────────────────────────────────
  app.get("/api/admin/cafes", adm, async (req) => {
    const limit = clampInt(req.query.limit, 100, 1, 500), offset = clampInt(req.query.offset, 0, 0, 1e6);
    const r = await pool.query(
      `SELECT c.*, (SELECT count(*)::int FROM users u WHERE u.cafe_id=c.id) AS users,
              (SELECT count(*)::int FROM invoices i WHERE i.cafe_id=c.id AND i.deleted_at IS NULL) AS invoices,
              (SELECT count(*)::int FROM tickets t WHERE t.cafe_id=c.id AND t.status <> 'closed') AS open_tickets
       FROM cafes c ORDER BY c.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return { data: r.rows.map((x) => ({ id: x.id, organizationId: x.org_id, name: x.name, city: x.city, status: x.status, users: x.users, invoices: x.invoices, openTickets: x.open_tickets, createdAt: new Date(x.created_at).toISOString() })) };
  });
  app.post("/api/admin/cafes", adm, async (req, reply) => {
    const b = req.body || {}, name = toText(b.name, { max: 120, key: "name" }).trim(), email = String(b.ownerEmail || "").trim().toLowerCase();
    if (!name) throw invalid("نام کافی‌نت لازم است");
    if (!validEmail(email)) throw invalid("ایمیل مالک نامعتبر است");
    const temp = randomToken(9), hash = await hashPassword(temp);
    const out = await tx(pool, async (c) => {
      if ((await c.query("SELECT 1 FROM users WHERE email=$1", [email])).rows[0]) throw conflict("این ایمیل قبلاً ثبت شده است", "email_taken");
      const org = (await c.query("INSERT INTO organizations(name) VALUES ($1) RETURNING id", [name])).rows[0];
      const cafe = (await c.query("INSERT INTO cafes(org_id,name,city) VALUES ($1,$2,$3) RETURNING *", [org.id, name, toText(b.city, { max: 80, key: "city" })])).rows[0];
      const u = (await c.query("INSERT INTO users(org_id,cafe_id,email,password_hash,first_name,last_name,phone,role,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,'owner',true) RETURNING id",
        [org.id, cafe.id, email, hash, toText(b.ownerFirstName, { max: 100, key: "ownerFirstName" }), toText(b.ownerLastName, { max: 100, key: "ownerLastName" }), toText(b.ownerPhone, { max: 30, key: "ownerPhone" })])).rows[0];
      await audit(c, { cafeId: cafe.id, userId: req.user.id, action: "admin.cafe.create", entity: "cafe", entityId: cafe.id, details: { owner: u.id }, ip: req.ip });
      return { cafe, ownerId: u.id };
    });
    return reply.code(201).send({ data: { id: out.cafe.id, organizationId: out.cafe.org_id, name, ownerId: out.ownerId, ownerEmail: email, temporaryPassword: temp } });
  });
  app.patch("/api/admin/cafes/:id", adm, async (req) => {
    const id = uuid(req.params.id, "شناسه"), b = req.body || {};
    return tx(pool, async (c) => {
      const cur = (await c.query("SELECT * FROM cafes WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!cur) throw notFound("کافی‌نت پیدا نشد");
      const status = b.status === undefined ? cur.status : toEnum(b.status, ["active", "suspended"], { key: "status" });
      const name = b.name === undefined ? cur.name : toText(b.name, { max: 120, key: "name" }).trim() || cur.name;
      await c.query("UPDATE cafes SET status=$2, name=$3 WHERE id=$1", [id, status, name]);
      if (status === "suspended") await c.query("UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE cafe_id=$1)", [id]);
      if (status !== cur.status) await audit(c, { cafeId: id, userId: req.user.id, action: `admin.cafe.${status}`, entity: "cafe", entityId: id, ip: req.ip });
      return { data: { id, status, name } };
    });
  });

  app.get("/api/admin/overview", adm, async () => {
    const q = (sql) => pool.query(sql).then((r) => r.rows[0]);
    const [c, u, t, i] = await Promise.all([
      q("SELECT count(*)::int AS total, count(*) FILTER (WHERE status='active')::int AS active FROM cafes"),
      q("SELECT count(*)::int AS total FROM users WHERE role <> 'platform_admin'"),
      q("SELECT count(*) FILTER (WHERE status <> 'closed')::int AS open FROM tickets"),
      q("SELECT count(*)::int AS last30 FROM invoices WHERE deleted_at IS NULL AND created_at > now() - interval '30 days'"),
    ]);
    return { data: { cafes: c.total, activeCafes: c.active, users: u.total, openTickets: t.open, invoicesLast30Days: i.last30 } };
  });
}
