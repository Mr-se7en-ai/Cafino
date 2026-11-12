// مجوزهای کافی‌نت: فهرست، مجوزهای مؤثر کاربر جاری، و (برای دارندگان users.manage) مشاهده/ویرایش سیاست.
//   GET /api/permissions           → { profile, catalogue, limitKeys, me: { permissions, limits }, defaults?, policy?, users? }
//   PUT /api/permissions           → جایگزینی کامل سیاست { roles, users, limits } (نسخه‌دار، با حسابرسی)
// قواعد: مالک همیشه همهٔ مجوزها را دارد؛ فقط مالک می‌تواند نقش «مدیر» را تغییر دهد یا users.manage را واگذار کند؛ کاربر نمی‌تواند مجوز خودش را افزایش دهد.
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { conflict, forbidden } from "../lib/errors.js";
import { LIMIT_KEYS, PERMISSIONS, PERMISSION_KEYS, defaultPermissions, effective, normalizePolicy, resolveProfile } from "../lib/permissions.js";

export function registerPermissions(app) {
  const { pool, cfg } = app;

  app.get("/api/permissions", { preHandler: [app.requireCafe()] }, async (req) => {
    const perms = await app.perms.forRequest(req);
    const data = { profile: resolveProfile(cfg), catalogue: PERMISSION_KEYS.map((key) => ({ key, label: PERMISSIONS[key] })), limitKeys: LIMIT_KEYS, me: { role: req.user.role, permissions: perms.list, limits: perms.limits } };
    if (perms.has("users.manage")) {
      const policy = await app.perms.loadPolicy(req.user.cafeId);
      const users = (await pool.query("SELECT id, email, first_name, last_name, role, is_active FROM users WHERE cafe_id=$1 ORDER BY created_at", [req.user.cafeId])).rows;
      data.defaults = Object.fromEntries(["manager", "staff"].map((r) => [r, [...defaultPermissions(r, cfg)].sort()]));
      data.policy = { roles: policy.roles || {}, users: policy.users || {}, limits: policy.limits || {}, version: policy.version || 0 };
      data.users = users.map((u) => ({ id: u.id, email: u.email, name: `${u.first_name || ""} ${u.last_name || ""}`.trim(), role: u.role, isActive: u.is_active, permissions: effective({ role: u.role, userId: u.id, policy, cfg }).list }));
    }
    return { data };
  });

  app.put("/api/permissions", { preHandler: [app.requirePerm("users.manage")] }, async (req) => {
    const cafeId = req.user.cafeId, body = req.body || {}, isOwner = req.user.role === "owner";
    const out = await tx(pool, async (c) => {
      const users = (await c.query("SELECT id, role FROM users WHERE cafe_id=$1", [cafeId])).rows;
      const policy = normalizePolicy(body, { userIds: new Set(users.map((u) => u.id)) });
      const cur = (await c.query("SELECT policy, version FROM permission_policies WHERE cafe_id=$1 FOR UPDATE", [cafeId])).rows[0];
      if (body.version !== undefined && Number(body.version) !== (cur?.version || 0)) throw conflict("سیاست در این بین تغییر کرده است؛ دوباره بارگیری کنید", "policy_version_conflict");
      const before = cur?.policy || {};
      if (!isOwner) {
        // غیرمالک: نقش مدیر و کاربرانِ مدیر/مالک قابل‌تغییر نیستند، users.manage واگذار نمی‌شود، و مجوز خودش را افزایش نمی‌دهد
        const roleOf = new Map(users.map((u) => [u.id, u.role]));
        if (JSON.stringify(policy.roles.manager || null) !== JSON.stringify(before.roles?.manager || null) || JSON.stringify(policy.limits.manager || null) !== JSON.stringify(before.limits?.manager || null)) throw forbidden("فقط مالک می‌تواند مجوز نقش مدیر را تغییر دهد");
        for (const uid of new Set([...Object.keys(policy.users), ...Object.keys(before.users || {})])) {
          if (JSON.stringify(policy.users[uid] || null) !== JSON.stringify(before.users?.[uid] || null) && roleOf.get(uid) !== "staff") throw forbidden("فقط مالک می‌تواند مجوز مدیران را تغییر دهد");
        }
        const touchesUM = (p) => [...Object.values(p.roles || {}), ...Object.values(p.users || {})].some((x) => (x.grant || []).includes("users.manage"));
        if (touchesUM(policy) && !touchesUM(before)) throw forbidden("فقط مالک می‌تواند «users.manage» را واگذار کند");
      }
      const version = (cur?.version || 0) + 1;
      await c.query("INSERT INTO permission_policies(cafe_id,policy,version,updated_by,updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (cafe_id) DO UPDATE SET policy=$2, version=$3, updated_by=$4, updated_at=now()", [cafeId, JSON.stringify(policy), version, req.user.id]);
      await audit(c, { cafeId, userId: req.user.id, action: "permissions.update", entity: "permissions", entityId: String(version), details: { before, after: policy, version }, ip: req.ip });
      return { policy, version };
    });
    app.perms.invalidate(cafeId);
    return { data: { policy: out.policy, version: out.version } };
  });
}
