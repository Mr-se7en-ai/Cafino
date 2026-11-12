// بازرسی و بازسازی یکپارچگی مالی: مقادیر مشتق (پرداخت‌شده/مانده/وضعیت، مانده حساب، موجودی انبار) را با منبع حقیقتشان مقایسه می‌کند
// و ارجاع‌های یتیم (مشتری/فاکتور ناموجود) را گزارش می‌دهد. بازسازی فقط برای مدیر؛ هر بازسازی در حسابرسی ثبت می‌شود.
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { conflict, forbidden, invalid, notFound } from "../lib/errors.js";
import { rebuildAccounts, rebuildInventory, rebuildInvoices } from "../lib/finance.js";
import { reconcile, repairLedgerDocuments } from "../lib/reconcile.js";
import { toIdOrNull, toText } from "../lib/validate.js";
import crypto from "node:crypto";

const ROLES_MANAGER = ["owner", "manager"];
const SCOPES = ["invoices", "ledger", "accounts", "inventory"];     // ترتیب اجرا: فاکتور/پرداخت → اسناد دفتر → مانده حساب‌ها → انبار

export function registerIntegrity(app) {
  const { pool } = app;
  const guard = { preHandler: [app.requireCafe(), app.requireRole(ROLES_MANAGER)] };

  // گزارش کامل تطبیق (فقط‌خواندنی): { ok, summary:{critical,high,medium,low}, checks, findings[], invoices, accounts, inventory, orphans }
  app.get("/api/integrity", guard, async (req) => {
    const r = await reconcile(pool, req.user.cafeId);
    // سازگاری با نسخه‌های قبل: کلیدهای قدیمیِ «یتیم‌ها»
    const LEGACY = { "payment.orphan_invoice": "paymentsWithoutInvoice", "payment.orphan_customer": "paymentsWithoutCustomer", "invoice.orphan_customer": "invoicesWithoutCustomer", "order.orphan_customer": "ordersWithoutCustomer", "order.orphan_invoice": "ordersWithoutInvoice", "payment.customer_mismatch": "paymentCustomerMismatch" };
    const orphans = Object.fromEntries(Object.values(LEGACY).map((k) => [k, []]));
    for (const f of r.findings) if (LEGACY[f.code]) orphans[LEGACY[f.code]].push(f.id);
    return { data: { ...r, orphans } };
  });

  // اجرای (یا پیش‌نمایش) بازسازی؛ هر دو مسیر (مستقیمِ مدیر و تأییدِ درخواست) همین تابع را می‌روند
  async function runRebuild(c, cafeId, scope, { dryRun, userId, reason, action = "integrity.rebuild", extra = {} }) {
    const result = {};
    if (!(await c.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok", [`rebuild:${cafeId}`])).rows[0].ok) throw conflict("بازسازی دیگری برای این کافی‌نت در حال اجراست؛ کمی بعد دوباره تلاش کنید", "rebuild_in_progress");
    const before = (await reconcile(c, cafeId)).summary;
    if (scope.includes("invoices")) result.invoices = await rebuildInvoices(c, cafeId, { dryRun, userId });      // پیش از حساب‌ها: دفتر کل از فاکتور/پرداخت ساخته می‌شود
    if (scope.includes("ledger")) result.ledger = await repairLedgerDocuments(c, cafeId, { dryRun, userId });     // فقط سند اصلاحیِ جدید؛ ردیف قدیمی دست نمی‌خورد
    if (scope.includes("accounts")) result.accounts = await rebuildAccounts(c, cafeId, { dryRun });
    if (scope.includes("inventory")) result.inventory = await rebuildInventory(c, cafeId, { dryRun });
    const after = dryRun ? before : (await reconcile(c, cafeId)).summary;
    if (!dryRun) await audit(c, { cafeId, userId, action, entity: "integrity", entityId: scope.join(","), details: { reason: String(reason || "").slice(0, 300), before, after, result: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { checked: v.checked, fixed: v.fixed }])), ...extra } });
    return { result, before, after };
  }
  const parseScope = (raw) => { const scope = raw === undefined ? SCOPES : [].concat(raw); if (!scope.length || scope.some((s) => !SCOPES.includes(s))) throw invalid(`«scope» باید زیرمجموعهٔ ${SCOPES.join(" | ")} باشد`); return scope; };

  // بازسازی همه‌چیز یا بخشی (مستقیم، فقط مدیر/مالک؛ رفتار قبلی): { scope: ["invoices","accounts","inventory"], dryRun?: boolean }
  app.post("/api/integrity/rebuild", guard, async (req) => {
    const body = req.body || {}, scope = parseScope(body.scope), dryRun = body.dryRun === true, cafeId = req.user.cafeId;
    const out = await tx(pool, (c) => runRebuild(c, cafeId, scope, { dryRun, userId: req.user.id, reason: body.reason }));
    return { data: { dryRun, ...out.result, before: out.before, after: out.after } };
  });

  // ── درخواست اصلاح با تأیید مدیر: کارمند/مدیر درخواست می‌دهد (با پیش‌نمایش dry-run)، مدیر/مالک تأیید یا رد می‌کند ──────────
  const reqPerm = { preHandler: [app.requirePerm("reconcile.request", "reconcile.approve")] };
  const apprPerm = { preHandler: [app.requirePerm("reconcile.approve")] };
  const pub = (r) => ({ id: r.id, scope: r.scope, reason: r.reason, status: r.status, requestedBy: r.requested_by, requestedByName: r.requested_by_name, requestedAt: r.requested_at, decidedBy: r.decided_by, decidedByName: r.decided_by_name, decidedAt: r.decided_at, decisionNote: r.decision_note, preview: r.preview, result: r.result });
  const SEL = `SELECT r.*, (SELECT btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')) FROM users u WHERE u.id=r.requested_by) AS requested_by_name, (SELECT btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')) FROM users u WHERE u.id=r.decided_by) AS decided_by_name FROM correction_requests r`;

  app.post("/api/integrity/corrections", reqPerm, async (req, reply) => {
    const body = req.body || {}, cafeId = req.user.cafeId, scope = parseScope(body.scope);
    const reason = toText(body.reason, { max: 500, key: "reason" }).trim(); if (reason.length < 5) throw invalid("دلیل درخواست دست‌کم ۵ نویسه باشد");
    const id = `cr_${crypto.randomUUID()}`;
    const row = await tx(pool, async (c) => {
      if ((await c.query("SELECT 1 FROM correction_requests WHERE cafe_id=$1 AND status='pending' AND scope=$2::text[] AND requested_by=$3", [cafeId, scope, req.user.id])).rowCount) throw conflict("درخواست مشابه شما هنوز منتظر تأیید است", "correction_pending");
      const dry = await runRebuild(c, cafeId, scope, { dryRun: true, userId: req.user.id });          // فقط‌خواندنی (dryRun)
      const preview = { before: dry.before, wouldChange: Object.fromEntries(Object.entries(dry.result).map(([k, v]) => [k, { checked: v.checked, fixed: v.fixed, sample: (v.drift || v.changes || v.items || []).slice?.(0, 20) }])) };
      await c.query("INSERT INTO correction_requests (cafe_id,id,scope,reason,requested_by,preview) VALUES ($1,$2,$3,$4,$5,$6)", [cafeId, id, scope, reason, req.user.id, JSON.stringify(preview)]);
      await audit(c, { cafeId, userId: req.user.id, action: "integrity.correction.request", entity: "correction", entityId: id, details: { scope, reason }, ip: req.ip });
      return (await c.query(`${SEL} WHERE r.cafe_id=$1 AND r.id=$2`, [cafeId, id])).rows[0];
    });
    return reply.code(201).send({ data: pub(row) });
  });

  app.get("/api/integrity/corrections", reqPerm, async (req) => {
    const cafeId = req.user.cafeId, perms = await app.perms.forRequest(req), st = req.query.status;
    if (st !== undefined && !["pending", "approved", "rejected", "failed"].includes(st)) throw invalid("status نامعتبر");
    const params = [cafeId]; let w = "r.cafe_id=$1";
    if (st) { params.push(st); w += ` AND r.status=$${params.length}`; }
    if (!perms.has("reconcile.approve")) { params.push(req.user.id); w += ` AND r.requested_by=$${params.length}`; }      // درخواست‌دهنده فقط درخواست‌های خودش را می‌بیند
    return { data: (await pool.query(`${SEL} WHERE ${w} ORDER BY r.requested_at DESC LIMIT 200`, params)).rows.map(pub) };
  });

  async function decide(req, approve) {
    const cafeId = req.user.cafeId, id = String(req.params.id), body = req.body || {};
    const note = toText(body.note ?? "", { max: 500, key: "note" }).trim();
    if (!approve && note.length < 3) throw invalid("برای رد درخواست دلیل بنویسید");
    return tx(pool, async (c) => {
      const r = (await c.query("SELECT * FROM correction_requests WHERE cafe_id=$1 AND id=$2 FOR UPDATE", [cafeId, id])).rows[0];
      if (!r) throw notFound("درخواست پیدا نشد");
      if (r.status !== "pending") throw conflict(`این درخواست پیش‌تر «${r.status}» شده است`, "already_decided");
      if (r.requested_by === req.user.id && req.user.role !== "owner") throw forbidden("تأیید یا رد درخواست خودتان مجاز نیست (دو نفره)", "self_approval");   // مالک استثناست (بالاترین مرجع)
      let result = null;
      if (approve) { const out = await runRebuild(c, cafeId, r.scope, { dryRun: false, userId: req.user.id, reason: r.reason, action: "integrity.correction.apply", extra: { requestId: id, requestedBy: r.requested_by } }); result = { before: out.before, after: out.after, applied: Object.fromEntries(Object.entries(out.result).map(([k, v]) => [k, { checked: v.checked, fixed: v.fixed }])) }; }
      await c.query("UPDATE correction_requests SET status=$3, decided_by=$4, decided_at=now(), decision_note=$5, result=$6 WHERE cafe_id=$1 AND id=$2", [cafeId, id, approve ? "approved" : "rejected", req.user.id, note, result ? JSON.stringify(result) : null]);
      if (!approve) await audit(c, { cafeId, userId: req.user.id, action: "integrity.correction.reject", entity: "correction", entityId: id, details: { note }, ip: req.ip });
      return (await c.query(`${SEL} WHERE r.cafe_id=$1 AND r.id=$2`, [cafeId, id])).rows[0];
    });
  }
  app.post("/api/integrity/corrections/:id/approve", apprPerm, async (req) => ({ data: pub(await decide(req, true)) }));
  app.post("/api/integrity/corrections/:id/reject", apprPerm, async (req) => ({ data: pub(await decide(req, false)) }));

  // «Rebuild Inventory»: qty = opening_qty + مجموع حرکت‌ها (برای همهٔ کالاها یا itemId)
  app.post("/api/inventory/rebuild", guard, async (req) => {
    const body = req.body || {}, itemId = toIdOrNull(body.itemId), dryRun = body.dryRun === true, cafeId = req.user.cafeId;
    const r = await tx(pool, async (c) => {
      const res = await rebuildInventory(c, cafeId, { itemId, dryRun });
      if (!dryRun) await audit(c, { cafeId, userId: req.user.id, action: "inventory.rebuild", entity: "inventory", entityId: itemId || "*", details: { checked: res.checked, fixed: res.fixed, drift: res.drift.slice(0, 50), reason: String(body.reason || "").slice(0, 300) }, ip: req.ip });
      return res;
    });
    return { data: { dryRun, ...r } };
  });
}
