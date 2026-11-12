import { sha256 } from "./security.js";

// JSON با کلیدهای مرتب (jsonb ترتیب کلید را حفظ نمی‌کند؛ هش باید پایدار بماند)
export function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
}
const rowHash = (prev, r) => sha256([prev, r.cafe_id || "", r.user_id || "", r.action, r.entity || "", r.entity_id || "", canon(r.details || {}), r.created_at].join("|"));

// افزودن به زنجیرهٔ حسابرسی؛ داخل تراکنش فراخوانی شود (قفل مشورتی ترتیب را برای هر کافی‌نت تضمین می‌کند)
export async function audit(client, { cafeId = null, userId = null, action, entity = "", entityId = "", details = {}, ip = "" }) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`audit:${cafeId || "global"}`]);
  const last = await client.query("SELECT hash FROM audit_log WHERE cafe_id IS NOT DISTINCT FROM $1 ORDER BY id DESC LIMIT 1", [cafeId]);
  const prev = last.rows[0]?.hash || "";
  const created_at = new Date().toISOString();
  const row = { cafe_id: cafeId, user_id: userId, action, entity, entity_id: String(entityId ?? ""), details, created_at };
  await client.query(
    "INSERT INTO audit_log (cafe_id,user_id,action,entity,entity_id,details,ip,prev_hash,hash,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [cafeId, userId, action, row.entity, row.entity_id, JSON.stringify(details), String(ip).slice(0, 64), prev, rowHash(prev, row), created_at],
  );
}

export async function verifyAuditChain(pool, cafeId) {
  const { rows } = await pool.query("SELECT * FROM audit_log WHERE cafe_id IS NOT DISTINCT FROM $1 ORDER BY id", [cafeId]);
  let prev = "";
  for (const r of rows) {
    const ok = r.prev_hash === prev && r.hash === rowHash(prev, { ...r, created_at: new Date(r.created_at).toISOString() });
    if (!ok) return { ok: false, count: rows.length, brokenAt: Number(r.id) };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
