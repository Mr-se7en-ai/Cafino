// کاربران کافی‌نت (مدیر): فهرست، دعوت با رمز موقت، تغییر نقش/فعال‌بودن، گزارش حسابرسی
import { tx } from "../db.js";
import { audit, verifyAuditChain } from "../lib/audit.js";
import { conflict, forbidden, invalid, notFound } from "../lib/errors.js";
import { hashPassword, randomToken, validEmail } from "../lib/security.js";
import { clampInt, toEnum, toId, toText } from "../lib/validate.js";
import { publicUser } from "./auth.js";

export function registerUsers(app) {
  const { pool } = app;
  const mgr = [app.requirePerm("users.manage")];

  app.get("/api/users", { preHandler: mgr }, async (req) => {
    const r = await pool.query("SELECT * FROM users WHERE cafe_id=$1 ORDER BY created_at", [req.user.cafeId]);
    return { data: r.rows.map(publicUser), meta: { total: r.rows.length } };
  });

  app.post("/api/users/invite", { preHandler: mgr }, async (req, reply) => {
    const b = req.body || {}, email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) throw invalid("ایمیل نامعتبر است");
    // «admin» در فرم برنامه یعنی مدیر؛ مالک فقط هنگام ساخت کافی‌نت تعیین می‌شود
    const requested = b.role === "admin" ? "manager" : b.role;
    const role = toEnum(requested, ["staff", "manager"], { key: "role", def: "staff" });
    if (role === "manager" && req.user.role !== "owner") throw forbidden("فقط مالک می‌تواند مدیر اضافه کند");
    const temp = randomToken(9);
    const hash = await hashPassword(temp);
    const user = await tx(pool, async (c) => {
      if ((await c.query("SELECT 1 FROM users WHERE email=$1", [email])).rows[0]) throw conflict("این ایمیل قبلاً ثبت شده است", "email_taken");
      const u = (await c.query("INSERT INTO users(org_id,cafe_id,email,password_hash,first_name,last_name,phone,role,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *",
        [req.user.orgId, req.user.cafeId, email, hash, toText(b.firstName, { max: 100, key: "firstName" }), toText(b.lastName, { max: 100, key: "lastName" }), toText(b.phone, { max: 30, key: "phone" }), role])).rows[0];
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "user.invite", entity: "user", entityId: u.id, details: { role }, ip: req.ip });
      return u;
    });
    return reply.code(201).send({ data: { user: publicUser(user), temporaryPassword: temp } });
  });

  app.patch("/api/users/:id", { preHandler: mgr }, async (req) => {
    const id = toId(req.params.id), b = req.body || {};
    return tx(pool, async (c) => {
      const u = (await c.query("SELECT * FROM users WHERE id=$1 AND cafe_id=$2 FOR UPDATE", [id, req.user.cafeId])).rows[0];
      if (!u) throw notFound("کاربر پیدا نشد");
      if (u.role === "owner" && req.user.role !== "owner") throw forbidden("تغییر مالک فقط برای خود مالک مجاز است");
      if (u.id === req.user.id && (b.isActive === false || (b.role && b.role !== u.role))) throw forbidden("نمی‌توانید نقش یا فعال‌بودن خودتان را تغییر دهید");
      const role = b.role === undefined ? u.role : toEnum(b.role, ["staff", "manager"], { key: "role" });
      if (u.role === "owner" && b.role !== undefined && role !== "owner") throw forbidden("نقش مالک قابل تغییر نیست");
      const active = b.isActive === undefined ? u.is_active : Boolean(b.isActive);
      const r = (await c.query("UPDATE users SET role=$2, is_active=$3 WHERE id=$1 RETURNING *", [id, u.role === "owner" ? "owner" : role, active])).rows[0];
      if (!active) await c.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id=$1 AND revoked_at IS NULL", [id]);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "user.update", entity: "user", entityId: id, details: { role: r.role, isActive: active }, ip: req.ip });
      return { data: publicUser(r) };
    });
  });

  // ── گزارش حسابرسی سمت سرور ─────────────────────────────────────────────────────────────────────────────────────────
  app.get("/api/audit", { preHandler: mgr }, async (req) => {
    const limit = clampInt(req.query.limit, 100, 1, 500), offset = clampInt(req.query.offset, 0, 0, 1e7);
    const r = await pool.query("SELECT id, user_id, action, entity, entity_id, details, ip, created_at FROM audit_log WHERE cafe_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3", [req.user.cafeId, limit, offset]);
    return { data: r.rows.map((x) => ({ id: Number(x.id), userId: x.user_id, action: x.action, entity: x.entity, entityId: x.entity_id, details: x.details, ip: x.ip, createdAt: new Date(x.created_at).toISOString() })) };
  });
  app.get("/api/audit/verify", { preHandler: mgr }, async (req) => ({ data: await verifyAuditChain(pool, req.user.cafeId) }));
}
