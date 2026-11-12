import crypto from "node:crypto";
// منابع همگام‌سازی برنامه (مشتری، کالا، فاکتور، پرداخت …): CRUD مشترک مبتنی بر تعریف هر منبع.
// قرارداد: GET فهرست {data,meta}، GET/POST/PATCH/DELETE تکی با {data}. شناسه را کلاینت می‌سازد؛ ساخت تکراری همان رکورد را برمی‌گرداند.
// قاعدهٔ مالی: فیلدهای مشتق (جمع، پرداخت‌شده، مانده، وضعیت، مانده حساب، موجودی انبار) هرگز از کلاینت پذیرفته نمی‌شوند؛ فقط سرور از
// اقلام / پرداخت‌ها / دفتر کل / حرکت‌های انبار می‌سازد (lib/finance.js). هر نوشتن مالی با قبل/بعد/کاربر/IP/دلیل در زنجیرهٔ حسابرسی ثبت می‌شود.
import { tx } from "../db.js";
import { assertPerm } from "../lib/permissions.js";
import { audit } from "../lib/audit.js";
import { withIdempotency } from "../lib/idem.js";
import { HttpError, badRequest, conflict, forbidden, invalid, notFound } from "../lib/errors.js";
import { assertExists, computeTotals, ledgerSum, postEntry, postPaymentEntry, recomputeInvoice, statusOf, syncInvoiceLedger, ensureAccount } from "../lib/finance.js";
import { clampInt, toDate, toEnum, toId, toIdOrNull, toInt, toJson, toNum, toText, toTimestamp } from "../lib/validate.js";

export { recomputeInvoice };

const t = (key, max = 500) => (v) => toText(v, { key, max });
const money = (key, signed = false) => (v) => toInt(v, { key, signed });
const col = (name, key, coerce, extra = {}) => ({ name, key, coerce, ...extra });
const out = (name, key) => ({ name, key });

const ROLES_WRITE = ["owner", "manager", "staff"];
const ROLES_MANAGER = ["owner", "manager"];
const REASON_KEYS = ["reason", "voidReason", "editReason"];
const reasonOf = (body, q) => String((body && (body.reason ?? body.voidReason ?? body.editReason)) ?? q?.reason ?? "").trim().slice(0, 300);
const today = () => new Date().toISOString().slice(0, 10);

export const DEFS = {
  customers: {
    table: "customers", label: "مشتری", deleteRoles: ROLES_MANAGER, search: ["first_name", "last_name", "phone"],
    cols: [col("first_name", "firstName", t("firstName", 120)), col("last_name", "lastName", t("lastName", 120)), col("phone", "phone", t("phone", 40)), col("address", "address", t("address", 500)),
      col("wallet", "wallet", money("wallet"), { createOnly: true })],     // کیف پول فقط هنگام ساخت؛ بعد از آن از مسیر فاکتورها تغییر می‌کند
  },
  inventory: {
    table: "inventory", label: "کالا", singular: "inventory", deleteRoles: ROLES_MANAGER, search: ["name"],
    required: ["name"],
    cols: [col("name", "name", t("name", 200)), col("cat", "cat", t("cat", 80)),
      col("qty", "qty", (v) => toNum(v, { key: "qty" }), { createOnly: true, alias: ["quantity"] }),     // موجودی بعد از ساخت فقط با «حرکت انبار» عوض می‌شود
      col("min_qty", "minQty", (v) => toNum(v, { key: "minQty", signed: false })), col("unit", "unit", t("unit", 40)),
      col("unit_cost", "unitCost", money("unitCost")), col("sale_price", "salePrice", money("salePrice"))],
    out: [out("opening_qty", "openingQty")],
    reserved: ["openingQty"],
    prepare: ({ mode, vals }) => (mode === "create" ? { ...vals, opening_qty: vals.qty ?? 0 } : vals),     // موجودی اولیه = موجودی هنگام ساخت؛ بعد فقط حرکت‌ها
  },
  inventoryMovements: {
    table: "inventory_movements", route: "inventory-movements", label: "حرکت انبار", singular: "inventory.movement", deleteRoles: [], optionalId: true, immutable: true,
    required: ["inventoryItemId", "quantity"],
    cols: [col("item_id", "inventoryItemId", (v) => toId(v, "کالا"), { alias: ["itemId"] }), col("qty_delta", "quantity", (v) => toNum(v, { key: "quantity" }), { alias: ["qtyDelta"] }),
      col("reason", "kind", t("kind", 80), { alias: ["reason"] }), col("ref", "ref", t("ref", 200)), col("date", "date", (v) => toDate(v, { key: "date" }))],
    prepare: async ({ vals, c, cafeId }) => {                      // حرکت فقط برای کالای موجود (پیش از درج؛ کلید خارجی هم پشتیبان است)
      const it = await c.query("SELECT 1 FROM inventory WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [cafeId, vals.item_id]);   // قفل پیش از درج: کلید خارجی حرکت قفل مشترک می‌گیرد و ارتقای آن به قفل نوشتن بن‌بست می‌ساخت
      if (!it.rows[0]) throw notFound("کالای این حرکت پیدا نشد");
      return vals;
    },
    afterWrite: async ({ c, cafeId, row, op, ctx }) => {
      if (op !== "create") return;
      const cur = await c.query("SELECT qty::float8 AS q FROM inventory WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [cafeId, row.item_id]);
      ctx.auditAction = "inventory.movement";
      const upd = await c.query("UPDATE inventory SET qty = qty + $3, updated_at = now() WHERE cafe_id=$1 AND id=$2 RETURNING qty::float8 AS q", [cafeId, row.item_id, row.qty_delta]);
      ctx.details = { itemId: row.item_id, delta: Number(row.qty_delta), qtyBefore: cur.rows[0].q, qtyAfter: upd.rows[0].q, movementKind: row.reason, ref: row.ref };
      ctx.reason = row.reason || "";
    },
  },
  orders: {
    table: "orders", label: "سفارش", deleteRoles: ROLES_WRITE, search: ["title"],
    cols: [col("customer_id", "customerId", toIdOrNull), col("title", "title", t("title", 300)), col("status", "status", t("status", 40)), col("amount", "amount", money("amount")),
      col("sale_id", "saleId", toIdOrNull), col("invoice_id", "invoiceId", toIdOrNull)],
  },
  invoices: {
    table: "invoices", label: "فاکتور", singular: "invoice", deleteRoles: ROLES_MANAGER, search: ["number", "customer_name"],
    // قابل‌نوشتن: شماره، مشتری، تاریخ‌ها، اقلام، تخفیف، بخشودگی، یادداشت. جمع/مبلغ نهایی از اقلام؛ پرداخت‌شده از پرداخت‌ها؛ مانده و وضعیت مشتق.
    cols: [col("number", "number", t("number", 60)), col("sale_id", "saleId", toIdOrNull), col("customer_id", "customerId", toIdOrNull), col("customer_name", "customerName", t("customerName", 300)),
      col("date", "date", (v) => toDate(v, { key: "date" })), col("due_date", "dueDate", (v) => toDate(v, { key: "dueDate" })),
      col("items", "items", (v) => toJson(v, { key: "items", array: true, maxBytes: 524288 }), { json: true }),
      col("discount", "discount", money("discount")), col("waived_amount", "waivedAmount", money("waivedAmount")), col("notes", "notes", t("notes", 4000))],
    out: [out("subtotal", "subtotal"), out("total_amount", "totalAmount"), out("paid_amount", "paidAmount"), out("remaining_amount", "remainingAmount"), out("status", "status"), out("void_reason", "voidReason")],
    reserved: ["subtotal", "totalAmount", "paidAmount", "remainingAmount", "status", "voidedAt", "voidedBy", "taxAmount"],
    prepare: prepareInvoice,
    afterWrite: async ({ c, cafeId, row, userId }) => { const inv = await recomputeInvoice(c, cafeId, row.id); if (inv) await syncInvoiceLedger(c, cafeId, inv, userId); },
    afterDelete: async ({ c, cafeId, row, userId }) => { await syncInvoiceLedger(c, cafeId, row, userId); },
  },
  payments: {
    table: "payments", label: "پرداخت", singular: "payment", deleteRoles: [], patchRoles: ROLES_MANAGER, createPermission: "payment.create", required: ["amount"],
    // پرداخت ثبت‌شده تغییرناپذیر است (مبلغ/فاکتور/مشتری/حساب فقط هنگام ساخت — تریگر 003 پشتیبان آن است؛ روش و تاریخ را فقط مدیر با «دلیل» و با ثبت در حسابرسی می‌تواند اصلاح کند). حذف نداریم؛ برگشت: POST /api/payments/:id/void
    cols: [col("invoice_id", "invoiceId", toIdOrNull, { createOnly: true }), col("customer_id", "customerId", toIdOrNull, { createOnly: true }),
      col("amount", "amount", (v) => { const n = toInt(v, { key: "amount" }); if (n <= 0) throw invalid("مبلغ پرداخت باید بزرگ‌تر از صفر باشد"); return n; }, { createOnly: true }),
      col("method", "method", t("method", 40)), col("date", "date", (v) => toDate(v, { key: "date" })), col("account_id", "accountId", toIdOrNull, { createOnly: true })],
    out: [out("kind", "kind"), out("reversal_of", "reversalOf"), out("void_reason", "voidReason")],
    reserved: ["kind", "reversalOf", "voidReason"],
    prepare: preparePayment,
    afterWrite: async ({ c, cafeId, row, before, op, ctx, userId }) => {
      for (const inv of new Set([row?.invoice_id, before?.invoice_id].filter(Boolean))) await recomputeInvoice(c, cafeId, inv);
      if (op === "create") await postPaymentEntry(c, cafeId, row, userId);
      if (op === "create" && ctx?.credit) await postCredit(c, cafeId, row, ctx, userId);
    },
  },
  accounts: {
    table: "accounts", label: "حساب", singular: "account", deleteRoles: ROLES_MANAGER, search: ["name"],
    // مانده فقط مجموع ردیف‌های دفتر کل است. «balance» هنگام ساخت = ردیف «مانده اولیه»؛ بعد از آن فقط /adjust یا فاکتور/پرداخت.
    cols: [col("customer_id", "customerId", toIdOrNull), col("name", "name", t("name", 300)), col("balance", "balance", money("balance", true), { createOnly: true })],
    prepare: async ({ mode, vals, ctx, c, cafeId, cfg, perms }) => {
      if (vals.customer_id) await assertExists(c, cfg, cafeId, "customers", vals.customer_id, "مشتری");
      if (mode === "create") {
        if (vals.balance) {                                              // مانده اولیه یک سند مالی است: مجوز + سقف
          assertPerm(perms, "account.opening_balance", "تعیین مانده اولیهٔ حساب فقط با مجوز «account.opening_balance» ممکن است");
          const max = perms.limits.openingBalanceMax; if (max != null && Math.abs(vals.balance) > max) throw forbidden(`مانده اولیه از سقف مجاز (${max}) بیشتر است`, "limit_exceeded");
        }
        ctx.opening = vals.balance || 0; return { ...vals, balance: 0 };
      }
      return vals;
    },
    afterWrite: async ({ c, cafeId, row, op, ctx, userId }) => {
      if (op === "create" && ctx.opening) await postEntry(c, { cafeId, accountId: row.id, kind: "opening", amount: ctx.opening, refType: "account", refId: row.id, entryId: `open-${row.id}`, date: today(), note: "مانده اولیه", userId });
    },
  },
  transactions: {
    table: "transactions", label: "تراکنش", singular: "transaction", deleteRoles: ROLES_MANAGER, search: ["description", "category"], required: ["type", "amount"],
    cols: [col("type", "type", (v) => toEnum(v, ["income", "expense"], { key: "type", def: "income" })), col("amount", "amount", money("amount")), col("date", "date", (v) => toDate(v, { key: "date" })),
      col("category", "category", t("category", 200)), col("description", "description", t("description", 1000), { alias: ["desc"] }), col("method", "method", t("method", 40))],
    prepare: async ({ vals, perms }) => { if (vals.type === "expense") assertPerm(perms, "expense.create"); return vals; },     // تراکنش «هزینه» هم هزینه است
  },
  expenses: {
    table: "expenses", label: "هزینه", singular: "expense", deleteRoles: ROLES_MANAGER, createPermission: "expense.create", search: ["description", "category"], required: ["amount"],
    cols: [col("amount", "amount", money("amount")), col("date", "date", (v) => toDate(v, { key: "date" })), col("category", "category", t("category", 200)),
      col("description", "description", t("description", 1000), { alias: ["desc"] }), col("method", "method", t("method", 40))],
  },
  obligations: {
    table: "obligations", label: "تعهد", singular: "obligation", deleteRoles: ROLES_MANAGER, search: ["title", "party"],
    cols: [col("kind", "kind", t("kind", 60)), col("dir", "dir", t("dir", 20)), col("title", "title", t("title", 300)), col("party", "party", t("party", 300)),
      col("amount", "amount", money("amount")), col("due_date", "dueDate", (v) => toDate(v, { key: "dueDate" })), col("status", "status", t("status", 40))],
  },
  settings: {
    table: "settings", label: "تنظیم", deleteRoles: ROLES_MANAGER, writeRoles: ROLES_MANAGER, cols: [],
  },
};

// ── فاکتور: مبالغ را سرور از اقلام می‌سازد ───────────────────────────────────────────────────────────────────────────────
async function prepareInvoice({ mode, vals, body, existing, perms, userId, c, cafeId, cfg, ctx }) {
  if (vals.customer_id) await assertExists(c, cfg, cafeId, "customers", vals.customer_id, "مشتری");
  const out = { ...vals };
  if (mode === "update") {
    if (existing.status === "void" && body.status !== "void") throw conflict("فاکتور باطل‌شده قابل ویرایش نیست", "invoice_void");
    if (body.status === "void" && existing.status !== "void") {      // مسیر قدیمیِ ابطال (PATCH status=void)؛ مسیر جدید: POST /api/invoices/:id/void
      assertPerm(perms, "invoice.void", "ابطال فاکتور فقط با مجوز «invoice.void» مجاز است");
      Object.assign(out, { status: "void", void_reason: reasonOf(body) || "بدون توضیح", voided_at: new Date().toISOString(), voided_by: userId });
      ctx.auditAction = "invoice.void"; ctx.reason = out.void_reason;
      return out;
    }
  }
  const touched = mode === "create" || vals.items !== undefined || vals.discount !== undefined || body.totalAmount !== undefined;
  const items = vals.items !== undefined ? vals.items : (existing?.items || []);
  const discount = vals.discount !== undefined ? vals.discount : Number(existing?.discount || 0);
  if (touched) {
    // فاکتور بدون قلم (دستی/بازمانده): مبلغ را فقط مدیر می‌تواند بدهد؛ در غیر این صورت مبلغ همیشه از اقلام ساخته می‌شود
    const manual = perms.has("invoice.manual_total") && body.totalAmount !== undefined ? toInt(body.totalAmount, { key: "totalAmount" }) : (mode === "update" && !items.length ? Number(existing.subtotal) : null);
    if (mode === "create" && !items.length && manual == null) throw invalid("فاکتور باید دست‌کم یک قلم داشته باشد");
    const tt = computeTotals({ items, discount, manualTotal: manual });
    if (tt.discount > Number(existing?.discount || 0)) {                 // افزایش تخفیف: مجوز + سقف درصد
      assertPerm(perms, "invoice.discount", "اعمال تخفیف فقط با مجوز «invoice.discount» مجاز است");
      const pct = perms.limits.discountMaxPercent;
      if (pct != null && tt.subtotal > 0 && tt.discount * 100 > pct * tt.subtotal) throw forbidden(`تخفیف از سقف مجاز (${pct}٪) بیشتر است`, "limit_exceeded");
    }
    Object.assign(out, { items: tt.items, subtotal: tt.subtotal, discount: tt.discount, total_amount: tt.total });
  }
  const total = out.total_amount !== undefined ? out.total_amount : Number(existing?.total_amount || 0);
  const paid = Number(existing?.paid_amount || 0);
  const waivedIn = vals.waived_amount !== undefined ? vals.waived_amount : Number(existing?.waived_amount || 0);
  out.waived_amount = Math.min(Math.max(0, waivedIn), Math.max(0, total - paid));      // بخشودگی از مانده بیشتر نمی‌شود
  if (out.waived_amount > Number(existing?.waived_amount || 0)) {                       // افزایش بخشودگی: مجوز + سقف مبلغ
    assertPerm(perms, "invoice.waive", "بخشودگی فقط با مجوز «invoice.waive» مجاز است");
    const max = perms.limits.waiveMaxAmount; if (max != null && out.waived_amount > max) throw forbidden(`بخشودگی از سقف مجاز (${max}) بیشتر است`, "limit_exceeded");
  }
  if (mode === "create") Object.assign(out, { paid_amount: 0, remaining_amount: total, status: statusOf({ total, paid: 0, waived: out.waived_amount }).status });
  ctx.reason = ctx.reason || reasonOf(body);
  return out;
}

// ── پرداخت: همیشه به فاکتور موجود (و مشتریِ همان فاکتور) وصل است؛ ویرایش فقط فیلدهای غیرمالی، با دلیل ───────────────────────────────
async function preparePayment({ mode, vals, body, existing, c, cafeId, cfg, ctx }) {
  if (mode === "update") {
    ctx.reason = reasonOf(body);
    if (existing.kind === "reversal") throw conflict("ردیف برگشت قابل ویرایش نیست", "payment_reversal_immutable");
    if (ctx.reason.length < 3) throw invalid("برای ویرایش پرداخت «reason» (دلیل) لازم است");
    if ((body.amount !== undefined && Number(body.amount) !== Number(existing.amount)) || (body.invoiceId !== undefined && String(body.invoiceId || "") !== String(existing.invoice_id || "")) || (body.customerId !== undefined && String(body.customerId || "") !== String(existing.customer_id || "")))
      throw new HttpError(422, "payment_immutable", "مبلغ، فاکتور و مشتریِ پرداخت ثبت‌شده تغییر نمی‌کند؛ پرداخت را برگشت بزنید و پرداخت درست را ثبت کنید");
    return vals;
  }
  const out = { ...vals };
  let invoice = null;
  if (vals.invoice_id) {
    invoice = await c.query("SELECT * FROM invoices WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [cafeId, vals.invoice_id]).then((r) => r.rows[0]);   // قفل فاکتور: پرداخت هم‌زمان با ابطال/ویرایش صف می‌شود
    if (!invoice && cfg?.referenceChecks !== "off") throw new HttpError(422, "unknown_reference", `فاکتور «${vals.invoice_id}» در این کافی‌نت وجود ندارد`);
    if (invoice?.status === "void") throw conflict("روی فاکتور باطل‌شده پرداخت ثبت نمی‌شود", "invoice_void");
  }
  if (invoice) {
    if (vals.customer_id && invoice.customer_id && vals.customer_id !== invoice.customer_id) throw new HttpError(422, "reference_mismatch", "مشتریِ پرداخت با مشتریِ فاکتور یکی نیست");
    if (!vals.customer_id && invoice.customer_id) out.customer_id = invoice.customer_id;
  }
  if (out.customer_id) await assertExists(c, cfg, cafeId, "customers", out.customer_id, "مشتری");
  ctx.reason = reasonOf(body);
  // پرداخت بیش از مانده: سیاست OVERPAYMENT_POLICY — credit (پیش‌فرض): فقط تا مانده روی فاکتور می‌نشیند و مازاد «اعتبار مشتری» جداگانه ثبت می‌شود
  if (invoice && cfg?.overpaymentPolicy !== "allow") {
    const remaining = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount) - Number(invoice.waived_amount));
    if (out.amount > remaining) {
      if (cfg?.overpaymentPolicy === "reject") throw new HttpError(422, "overpayment", `مبلغ پرداخت از مانده فاکتور (${remaining}) بیشتر است`);
      if (!out.customer_id) throw new HttpError(422, "overpayment_no_customer", `مبلغ پرداخت از مانده فاکتور (${remaining}) بیشتر است و فاکتور مشتری ندارد تا مازاد به‌عنوان اعتبار ثبت شود`);
      ctx.credit = out.amount - remaining;
      if (remaining > 0) out.amount = remaining; else { out.invoice_id = null; ctx.creditOnly = true; }     // مانده صفر: کل مبلغ فقط اعتبار مشتری است
    }
  }
  return out;
}

// اعتبار مشتری: ردیف پرداختِ جدا (بدون فاکتور) که با creditOf به پرداخت اصلی وصل است؛ برگشت پرداخت اصلی آن را هم برمی‌گرداند
async function postCredit(c, cafeId, row, ctx, userId) {
  if (ctx.creditOnly) { await c.query("UPDATE payments SET data = data || $3::jsonb WHERE cafe_id=$1 AND id=$2", [cafeId, row.id, JSON.stringify({ creditOnly: true })]); return; }
  const id = `${row.id}~credit`.slice(0, 128);
  const ins = await c.query("INSERT INTO payments (cafe_id,id,invoice_id,customer_id,amount,method,date,kind,data) VALUES ($1,$2,NULL,$3,$4,$5,$6,'payment',$7) ON CONFLICT (cafe_id,id) DO NOTHING RETURNING *",
    [cafeId, id, row.customer_id, ctx.credit, row.method, row.date, JSON.stringify({ creditOf: row.id })]);
  if (ins.rows[0]) await postPaymentEntry(c, cafeId, ins.rows[0], userId);
}

const txr = (pool, fn) => tx(pool, fn, { retries: 4 });          // بن‌بست/سریال‌سازی ⇒ تکرار خودکار تراکنش (همه‌چیز داخل تراکنش است)

const SYSTEM_KEYS = new Set(["cafeId", "organizationId", "branchId", "deletedAt", "version", ...REASON_KEYS]);

function present(def, body, key, alias = []) {
  for (const k of [key, ...alias]) if (body[k] !== undefined) return body[k];
  return undefined;
}

// بدنهٔ ورودی ← ستون‌های نوع‌دار + data
export function parseBody(def, body, { partial, role }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("بدنهٔ درخواست باید یک شیء JSON باشد");
  const vals = {};
  for (const c of def.cols) {
    const raw = present(def, body, c.key, c.alias);
    if (raw === undefined) continue;
    if (partial && c.createOnly) continue;
    vals[c.name] = c.coerce(raw);
  }
  if (!partial) for (const k of def.required || []) {
    const c = def.cols.find((x) => x.key === k);
    if (present(def, body, k, c?.alias) === undefined || present(def, body, k, c?.alias) === "") throw invalid(`فیلد «${k}» لازم است`);
  }
  if (def.guard) def.guard({ role }, vals);
  const data = {};
  for (const [k, v] of Object.entries(body)) if (!SYSTEM_KEYS.has(k)) data[k] = v;
  for (const c of def.cols.filter((x) => x.createOnly)) { delete data[c.key]; for (const a of c.alias || []) delete data[a]; }   // مقدار معتبر در ستون نوع‌دار است
  for (const k of def.reserved || []) delete data[k];                                                                                 // مقادیر مشتق هرگز در data ذخیره نمی‌شوند
  for (const o of def.out || []) delete data[o.key];
  const size = Buffer.byteLength(JSON.stringify(data));
  if (size > 600000) throw invalid("رکورد بیش از حد بزرگ است");
  return { vals, data };
}

export function rowToApi(def, row) {
  const out = { ...(row.data || {}), id: row.id };
  for (const c of [...def.cols, ...(def.out || [])]) if (row[c.name] !== undefined) out[c.key] = row[c.name];
  if (def.table === "inventory_movements") { delete out.itemId; }
  out.createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  out.updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;
  if (row.deleted_at) out.deletedAt = new Date(row.deleted_at).toISOString();
  return out;
}

// تصویر فشردهٔ رکورد برای حسابرسی (فقط ستون‌های نوع‌دار؛ اقلام فقط به‌صورت شمارش)
function snapshot(def, row) {
  if (!row) return undefined;
  const o = {};
  for (const c of [...def.cols, ...(def.out || [])]) { if (row[c.name] === undefined || c.name === "items") continue; o[c.key] = row[c.name] instanceof Date ? row[c.name].toISOString().slice(0, 10) : row[c.name]; }
  if (Array.isArray(row.items)) o.itemsCount = row.items.length;
  return o;
}

// نشانگر صفحه‌بندی: base64url از [updated_at به‌صورت متن با دقت میکروثانیه، id] — دقت میکروثانیه لازم است وگرنه ردیف‌های هم‌زمان جا می‌افتند
const encodeCursor = (ts, id) => Buffer.from(JSON.stringify([ts, id])).toString("base64url");
function decodeCursor(raw) {
  let v; try { v = JSON.parse(Buffer.from(String(raw).slice(0, 400), "base64url").toString("utf8")); } catch { v = null; }
  if (!Array.isArray(v) || typeof v[0] !== "string" || typeof v[1] !== "string" || !/^\d{4}-\d\d-\d\d[ T][\d:.]+(Z|[+-]\d\d(:?\d\d)?)$/.test(v[0]) || v[1].length > 200) throw badRequest("cursor نامعتبر است");
  return { ts: v[0], id: v[1] };
}

const q = (name) => `"${name}"`;
const dbVal = (def, name, v) => (def.cols.find((c) => c.name === name)?.json ? JSON.stringify(v) : v);   // آرایهٔ JS را pg به‌صورت آرایهٔ PostgreSQL می‌فرستد؛ ستون jsonb رشتهٔ JSON می‌خواهد

async function auditWrite(c, req, def, name, { action, id, before, after, ctx }) {
  const details = { ...(before ? { before: snapshot(def, before) } : {}), ...(after ? { after: snapshot(def, after) } : {}), ...(ctx.details || {}), reason: ctx.reason || "" };
  await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: action || ctx.auditAction || `${def.singular || name}.${ctx.op}`, entity: name, entityId: id, details, ip: req.ip });
}

export function registerResources(app) {
  const { pool, cfg } = app;

  for (const [name, def] of Object.entries(DEFS)) {
    const base = `/api/${def.route || name}`;
    const writeRoles = def.writeRoles || ROLES_WRITE;
    const isSettings = def.table === "settings";
    const filterCols = [...def.cols, ...(def.out || [])];

    // ── فهرست ───────────────────────────────────────────────────────────────────────────────────────────────────────
    app.get(base, { preHandler: app.requireCafe() }, async (req) => {
      const cafeId = req.user.cafeId;
      const limit = clampInt(req.query.limit, 100, 1, 500), offset = clampInt(req.query.offset, 0, 0, 1e7);
      const where = ["cafe_id = $1"], params = [cafeId];
      const includeDeleted = req.query.includeDeleted === "true" && ROLES_MANAGER.includes(req.user.role);
      if (!includeDeleted) where.push("deleted_at IS NULL");
      if (req.query.updatedSince) { params.push(toTimestamp(req.query.updatedSince, "updatedSince")); where.push(`updated_at > $${params.length}`); }
      if (req.query.q && def.search?.length) { params.push(`%${String(req.query.q).slice(0, 80).replace(/[\\%_]/g, "\\$&")}%`); where.push(`(${def.search.map((s) => `${q(s)} ILIKE $${params.length}`).join(" OR ")})`); }
      for (const c of filterCols) {                                    // فیلتر ساده روی ستون‌ها: ?customerId=…&status=…
        const v = req.query[c.key];
        if (typeof v === "string" && v !== "" && !["items", "wallet"].includes(c.key) && v.length <= 200) { params.push(v); where.push(`${q(c.name)}::text = $${params.length}`); }
      }
      if (req.query.from && def.cols.some((c) => c.name === "date")) { params.push(toDate(req.query.from, { key: "from" })); where.push(`date >= $${params.length}`); }
      if (req.query.to && def.cols.some((c) => c.name === "date")) { params.push(toDate(req.query.to, { key: "to" })); where.push(`date <= $${params.length}`); }
      // صفحه‌بندی کلیدی (cursor): برای فهرست‌های بزرگ و همگام‌سازی؛ هزینه‌اش به عمق صفحه بستگی ندارد (OFFSET=50000 → ~۳۳ms، cursor → ~۰٫۱ms در بنچمارک ۱۰۰هزار فاکتور)
      let cursorOn = false;
      if (req.query.cursor !== undefined && req.query.cursor !== "") {
        const cur = decodeCursor(req.query.cursor);
        params.push(cur.ts); const pt = params.length; params.push(cur.id); const pi = params.length;
        where.push(`updated_at <= $${pt}::timestamptz AND (updated_at < $${pt}::timestamptz OR id > $${pi})`); cursorOn = true;
      }
      const w = where.join(" AND ");
      const wantCount = req.query.count === "true" || (!cursorOn && req.query.count !== "false");   // count(*) روی جدول بزرگ گران است؛ با cursor یا count=false حذف می‌شود
      const total = wantCount ? (await pool.query(`SELECT count(*)::int AS n FROM ${def.table} WHERE ${w}`, params)).rows[0].n : null;
      const fetched = (await pool.query(`SELECT *, updated_at::text AS _cur FROM ${def.table} WHERE ${w} ORDER BY updated_at DESC, id LIMIT ${limit + 1} OFFSET ${cursorOn ? 0 : offset}`, params)).rows;
      const hasMore = fetched.length > limit, rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows[rows.length - 1];
      return { data: rows.map((r) => rowToApi(def, r)), meta: { total, limit, offset: cursorOn ? 0 : offset, hasMore, nextCursor: hasMore && last ? encodeCursor(last._cur, last.id) : null } };
    });

    app.get(`${base}/:id`, { preHandler: app.requireCafe() }, async (req) => {
      const r = await pool.query(`SELECT * FROM ${def.table} WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL`, [req.user.cafeId, toId(req.params.id)]);
      if (!r.rows[0]) throw notFound(`${def.label} پیدا نشد`);
      return { data: rowToApi(def, r.rows[0]) };
    });

    // ── ساخت ────────────────────────────────────────────────────────────────────────────────────────────────────────
    app.post(base, { preHandler: [app.requireCafe(), app.requireRole(writeRoles)] }, async (req, reply) => {
      const cafeId = req.user.cafeId, perms = await app.perms.forRequest(req);
      if (def.createPermission) assertPerm(perms, def.createPermission);
      const out = await txr(pool, (c) => withIdempotency(c, { scope: cafeId, req, run: async () => {
        const body = req.body || {};
        if (typeof body !== "object" || Array.isArray(body)) throw badRequest("بدنهٔ درخواست باید یک شیء JSON باشد");
        const id = body.id !== undefined && body.id !== null && body.id !== "" ? toId(body.id) : (def.optionalId ? `${name}_${crypto.randomUUID()}` : toId(body.id));
        const parsed = parseBody(def, body, { partial: false, role: req.user.role });
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`row:${cafeId}:${def.table}:${id}`]);        // ساخت هم‌زمانِ یک شناسه پشت هم صف می‌شود؛ دومی «رکورد موجود» را می‌بیند نه خطای تکراری
        const existing = await c.query(`SELECT * FROM ${def.table} WHERE cafe_id=$1 AND id=$2 FOR UPDATE`, [cafeId, id]);
        if (existing.rows[0] && !existing.rows[0].deleted_at) return { status: 200, body: rowToApi(def, existing.rows[0]), existed: true };   // ساخت تکراری = همان رکورد
        if (existing.rows[0]?.deleted_at) throw new HttpError(409, "deleted", `${def.label} قبلاً حذف شده است`);
        const ctx = { op: "create", reason: reasonOf(body) };
        const finalVals = def.prepare ? await def.prepare({ mode: "create", vals: parsed.vals, body, existing: null, role: req.user.role, perms, userId: req.user.id, c, cafeId, cfg, ctx }) : parsed.vals;
        const names = Object.keys(finalVals);
        const cols = ["cafe_id", "id", ...names, "data"], params = [cafeId, id, ...names.map((n) => dbVal(def, n, finalVals[n])), JSON.stringify(parsed.data)];
        const ph = cols.map((_, i) => `$${i + 1}`);
        const inserted = await c.query(`INSERT INTO ${def.table} (${cols.map(q).join(",")}) VALUES (${ph.join(",")}) RETURNING *`, params);
        if (def.afterWrite) await def.afterWrite({ c, cafeId, row: inserted.rows[0], before: null, op: "create", ctx, userId: req.user.id });
        const fresh = def.afterWrite ? (await c.query(`SELECT * FROM ${def.table} WHERE cafe_id=$1 AND id=$2`, [cafeId, id])).rows[0] : inserted.rows[0];
        if (def.singular) await auditWrite(c, req, def, name, { id, after: fresh, ctx });
        return { status: 201, body: rowToApi(def, fresh) };
      } }));
      if (out.replay) reply.header("Idempotency-Replayed", "true");
      return reply.code(out.status).send({ data: out.body });
    });

    // ── ویرایش (ادغام فیلدها) ────────────────────────────────────────────────────────────────────────────────────────
    if (!def.immutable) app.patch(`${base}/:id`, { preHandler: [app.requireCafe(), app.requireRole(def.patchRoles || writeRoles)] }, async (req, reply) => {
      const cafeId = req.user.cafeId, id = toId(req.params.id), perms = await app.perms.forRequest(req);
      const out = await txr(pool, (c) => withIdempotency(c, { scope: cafeId, req, run: async () => {
        const cur = await c.query(`SELECT * FROM ${def.table} WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, [cafeId, id]);
        if (!cur.rows[0]) throw notFound(`${def.label} پیدا نشد`);
        const body = req.body || {};
        const parsed = parseBody(def, body, { partial: true, role: req.user.role });
        const ctx = { op: "update", reason: reasonOf(body) };
        const finalVals = def.prepare ? await def.prepare({ mode: "update", vals: parsed.vals, body, existing: cur.rows[0], role: req.user.role, perms, userId: req.user.id, c, cafeId, cfg, ctx }) : parsed.vals;
        delete parsed.data.id;
        const names = Object.keys(finalVals);
        const sets = names.map((n, i) => `${q(n)} = $${i + 3}`);
        sets.push(`data = data || $${names.length + 3}::jsonb`, "updated_at = now()");
        const upd = await c.query(`UPDATE ${def.table} SET ${sets.join(", ")} WHERE cafe_id=$1 AND id=$2 RETURNING *`, [cafeId, id, ...names.map((n) => dbVal(def, n, finalVals[n])), JSON.stringify(parsed.data)]);
        if (def.afterWrite) await def.afterWrite({ c, cafeId, row: upd.rows[0], before: cur.rows[0], op: "update", ctx, userId: req.user.id });
        const fresh = def.afterWrite ? (await c.query(`SELECT * FROM ${def.table} WHERE cafe_id=$1 AND id=$2`, [cafeId, id])).rows[0] : upd.rows[0];
        if (def.singular) await auditWrite(c, req, def, name, { id, before: cur.rows[0], after: fresh, ctx });
        return { status: 200, body: rowToApi(def, fresh) };
      } }));
      if (out.replay) reply.header("Idempotency-Replayed", "true");
      return reply.code(out.status).send({ data: out.body });
    });

    // ── حذف نرم ─────────────────────────────────────────────────────────────────────────────────────────────────────
    if (def.deleteRoles.length) app.delete(`${base}/:id`, { preHandler: [app.requireCafe(), app.requireRole(def.deleteRoles)] }, async (req, reply) => {
      const cafeId = req.user.cafeId, id = toId(req.params.id);
      await txr(pool, async (c) => {
        const cur = await c.query(`UPDATE ${def.table} SET deleted_at = now(), updated_at = now() WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING *`, [cafeId, id]);
        if (!cur.rows[0]) return;                                   // حذف دوباره بی‌اثر است (صف آفلاین ممکن است تکرار کند)
        const ctx = { op: "delete", reason: reasonOf(req.body, req.query) };
        if (def.afterDelete) await def.afterDelete({ c, cafeId, row: cur.rows[0], userId: req.user.id });
        await auditWrite(c, req, def, name, { id, before: cur.rows[0], ctx });
      });
      return reply.code(204).send();
    });
    void isSettings;
  }

  // ── پرداخت: حذف وجود ندارد؛ برگشت (reversal) با ردیف منفی ──────────────────────────────────────────────────────────────
  app.delete("/api/payments/:id", { preHandler: [app.requireCafe()] }, async (_req, reply) => reply.code(405).header("Allow", "GET, PATCH").send({ error: { code: "payment_delete_forbidden", message: "پرداخت حذف نمی‌شود؛ برای اصلاح از POST /api/payments/:id/void (برگشت با ردیف منفی) استفاده کنید" } }));

  app.post("/api/payments/:id/void", { preHandler: [app.requirePerm("payment.void")] }, async (req, reply) => {
    const cafeId = req.user.cafeId, id = toId(req.params.id), def = DEFS.payments;
    const reason = reasonOf(req.body);
    if (reason.length < 3) throw invalid("«reason» (دلیل برگشت پرداخت) لازم است");
    const out = await txr(pool, (c) => withIdempotency(c, { scope: cafeId, req, run: async () => {
      const orig = (await c.query("SELECT * FROM payments WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [cafeId, id])).rows[0];
      if (!orig) throw notFound("پرداخت پیدا نشد");
      if (orig.kind === "reversal") throw conflict("ردیف برگشت را نمی‌توان دوباره برگشت زد", "payment_reversal_immutable");
      const prev = (await c.query("SELECT * FROM payments WHERE cafe_id=$1 AND reversal_of=$2", [cafeId, id])).rows[0];
      if (prev) return { status: 200, body: rowToApi(def, prev) };                               // برگشت دوباره = همان برگشت
      if (orig.invoice_id) await c.query("SELECT 1 FROM invoices WHERE cafe_id=$1 AND id=$2 FOR UPDATE", [cafeId, orig.invoice_id]);
      const revId = req.body?.id ? toId(req.body.id) : `rev_${id}`.slice(0, 128);
      const ins = await c.query(
        "INSERT INTO payments (cafe_id,id,invoice_id,customer_id,amount,method,date,account_id,kind,reversal_of,void_reason,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'reversal',$9,$10,$11) RETURNING *",
        [cafeId, revId, orig.invoice_id, orig.customer_id, -Number(orig.amount), orig.method, toDate(req.body?.date, { key: "date" }) || today(), orig.account_id, id, reason, JSON.stringify({ voidedBy: req.user.id })]);
      await def.afterWrite({ c, cafeId, row: ins.rows[0], before: null, op: "create", ctx: {}, userId: req.user.id });
      // اعتبار مشتریِ ناشی از همین پرداخت (مازاد) هم برگشت می‌خورد
      for (const cr of (await c.query("SELECT * FROM payments WHERE cafe_id=$1 AND kind='payment' AND deleted_at IS NULL AND data->>'creditOf'=$2 AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.cafe_id=payments.cafe_id AND r.reversal_of=payments.id)", [cafeId, id])).rows) {
        const rv = await c.query("INSERT INTO payments (cafe_id,id,invoice_id,customer_id,amount,method,date,account_id,kind,reversal_of,void_reason,data) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,'reversal',$8,$9,$10) RETURNING *",
          [cafeId, `rev_${cr.id}`.slice(0, 128), cr.customer_id, -Number(cr.amount), cr.method, ins.rows[0].date, cr.account_id, cr.id, reason, JSON.stringify({ voidedBy: req.user.id, creditOf: id })]);
        await def.afterWrite({ c, cafeId, row: rv.rows[0], before: null, op: "create", ctx: {}, userId: req.user.id });
      }
      await audit(c, { cafeId, userId: req.user.id, action: "payment.void", entity: "payments", entityId: id, details: { before: snapshot(def, orig), after: snapshot(def, ins.rows[0]), reason }, ip: req.ip });
      return { status: 201, body: rowToApi(def, ins.rows[0]) };
    } }));
    if (out.replay) reply.header("Idempotency-Replayed", "true");
    return reply.code(out.status).send({ data: out.body });
  });

  // ── ابطال فاکتور (فقط مدیر، دلیل الزامی). پرداخت‌های ثبت‌شده دست‌نخورده می‌مانند (به‌صورت اعتبار مشتری در دفتر کل) ─────────────────────────
  app.post("/api/invoices/:id/void", { preHandler: [app.requirePerm("invoice.void")] }, async (req, reply) => {
    const cafeId = req.user.cafeId, id = toId(req.params.id), def = DEFS.invoices;
    const reason = reasonOf(req.body);
    if (reason.length < 3) throw invalid("«reason» (دلیل ابطال) لازم است");
    const out = await txr(pool, (c) => withIdempotency(c, { scope: cafeId, req, run: async () => {
      const cur = (await c.query("SELECT * FROM invoices WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [cafeId, id])).rows[0];
      if (!cur) throw notFound("فاکتور پیدا نشد");
      if (cur.status === "void") return { status: 200, body: rowToApi(def, cur) };
      await c.query("UPDATE invoices SET status='void', void_reason=$3, voided_at=now(), voided_by=$4, updated_at=now() WHERE cafe_id=$1 AND id=$2", [cafeId, id, reason, req.user.id]);
      const inv = await recomputeInvoice(c, cafeId, id);
      await syncInvoiceLedger(c, cafeId, inv, req.user.id);
      await audit(c, { cafeId, userId: req.user.id, action: "invoice.void", entity: "invoices", entityId: id, details: { before: snapshot(def, cur), after: snapshot(def, inv), reason }, ip: req.ip });
      return { status: 200, body: rowToApi(def, inv) };
    } }));
    if (out.replay) reply.header("Idempotency-Replayed", "true");
    return reply.code(out.status).send({ data: out.body });
  });

  // ── حساب: دفتر کل و تعدیل ───────────────────────────────────────────────────────────────────────────────────────────
  app.get("/api/accounts/:id/ledger", { preHandler: app.requireCafe() }, async (req) => {
    const cafeId = req.user.cafeId, id = toId(req.params.id);
    const acc = (await pool.query("SELECT * FROM accounts WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL", [cafeId, id])).rows[0];
    if (!acc) throw notFound("حساب پیدا نشد");
    const limit = clampInt(req.query.limit, 200, 1, 1000), offset = clampInt(req.query.offset, 0, 0, 1e7);
    const rows = (await pool.query("SELECT id, kind, amount, ref_type, ref_id, date, note, created_by, created_at FROM ledger_entries WHERE cafe_id=$1 AND account_id=$2 ORDER BY created_at, id LIMIT $3 OFFSET $4", [cafeId, id, limit, offset])).rows;
    const computed = await ledgerSum(pool, cafeId, id);
    return { data: { account: rowToApi(DEFS.accounts, acc), balance: computed, consistent: computed === Number(acc.balance), entries: rows.map((r) => ({ id: r.id, kind: r.kind, amount: r.amount, refType: r.ref_type, refId: r.ref_id, date: r.date, note: r.note, createdBy: r.created_by, createdAt: new Date(r.created_at).toISOString() })) } };
  });

  // تعدیل دستی مانده (اصلاح/برگشت وجه): ردیف جدید با دلیلِ الزامی؛ مثبت = بدهکارتر شدن مشتری، منفی = بستانکارتر
  app.post("/api/accounts/:id/adjust", { preHandler: [app.requirePerm("account.adjust")] }, async (req, reply) => {
    const cafeId = req.user.cafeId, id = toId(req.params.id), body = req.body || {};
    const amount = toInt(body.amount, { key: "amount", signed: true });
    if (!amount) throw invalid("«amount» باید غیرصفر باشد");
    const kind = body.kind === undefined ? "adjustment" : body.kind;
    if (!["adjustment", "refund"].includes(kind)) throw invalid("«kind» باید adjustment یا refund باشد");
    const reason = reasonOf(body);
    if (reason.length < 3) throw invalid("«reason» (دلیل تعدیل) لازم است");
    const out = await txr(pool, (c) => withIdempotency(c, { scope: cafeId, req, run: async () => {
      const acc = (await c.query("SELECT * FROM accounts WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [cafeId, id])).rows[0];
      if (!acc) throw notFound("حساب پیدا نشد");
      const entry = await postEntry(c, { cafeId, accountId: id, kind, amount: kind === "refund" ? Math.abs(amount) : amount, refType: "manual", refId: body.id ? toId(body.id) : "", entryId: body.id ? `adj-${toId(body.id)}` : undefined, date: toDate(body.date, { key: "date" }) || today(), note: reason, userId: req.user.id });
      const after = (await c.query("SELECT * FROM accounts WHERE cafe_id=$1 AND id=$2", [cafeId, id])).rows[0];
      if (entry) await audit(c, { cafeId, userId: req.user.id, action: "account.adjust", entity: "accounts", entityId: id, details: { before: { balance: Number(acc.balance) }, after: { balance: Number(after.balance) }, entryId: entry.id, kind, amount: Number(entry.amount), reason }, ip: req.ip });
      return { status: 201, body: { ...rowToApi(DEFS.accounts, after), entryId: entry?.id ?? null } };
    } }));
    if (out.replay) reply.header("Idempotency-Replayed", "true");
    return reply.code(out.status).send({ data: out.body });
  });

  // ── انبار: دفتر یک کالا (موجودی اولیه + حرکت‌ها) ─────────────────────────────────────────────────────────────────────────
  app.get("/api/inventory/:id/ledger", { preHandler: app.requireCafe() }, async (req) => {
    const cafeId = req.user.cafeId, id = toId(req.params.id);
    const it = (await pool.query("SELECT id, name, qty::float8 AS qty, opening_qty::float8 AS opening FROM inventory WHERE cafe_id=$1 AND id=$2 AND deleted_at IS NULL", [cafeId, id])).rows[0];
    if (!it) throw notFound("کالا پیدا نشد");
    const mv = (await pool.query("SELECT id, qty_delta::float8 AS delta, reason, ref, date, created_at FROM inventory_movements WHERE cafe_id=$1 AND item_id=$2 AND deleted_at IS NULL ORDER BY created_at, id", [cafeId, id])).rows;
    const computed = Math.round((it.opening + mv.reduce((s, m) => s + m.delta, 0)) * 1000) / 1000;
    return { data: { id: it.id, name: it.name, openingQty: it.opening, qty: it.qty, computedQty: computed, consistent: Math.abs(computed - it.qty) < 0.0005, movements: mv.map((m) => ({ id: m.id, delta: m.delta, kind: m.reason, ref: m.ref, date: m.date, createdAt: new Date(m.created_at).toISOString() })) } };
  });
}
