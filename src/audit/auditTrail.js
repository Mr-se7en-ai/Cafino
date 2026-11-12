// Audit Trail کافینو — دفتر رویدادهای حساس با زنجیرهٔ هش.
//
//  • رویدادهای «حساس/بحرانی» (ابطال، تغییر مبلغ/موجودی/قیمت، اصلاح حساب، بازیابی بکاپ، تغییر رمز، …) همیشه ثبت می‌شوند و در یک
//    زنجیرهٔ هش‌شده ذخیره می‌شوند: هر رویداد هش رویداد قبلی را دارد؛ ویرایش یا حذف یک رویداد از میانهٔ دفتر با «بررسی صحت» پیدا می‌شود.
//  • رویدادهای عادی (ورود، ثبت فروش…) در لاگ فعالیت سبک (حداکثر ۵۰۰ مورد) نگه داشته می‌شوند.
//  • هر رویداد: چه کسی، چه زمانی، چه عملیاتی، روی کدام رکورد، چه مبلغی، مقدار قبل/بعد، دلیل و کدام دستگاه.
//  ⚠ محدودیت صادقانه: حافظهٔ مرورگر را صاحب دستگاه می‌تواند کامل پاک کند؛ این زنجیره دستکاری و حذف ناقص را آشکار می‌کند، نه حذف کل داده را.
//    برای تضمین واقعی، رویدادها باید روی سرور هم نگه‌داری شوند.
import { sha256Sync } from "./sha256.js";
import { createId } from "../core/ids.js";
import { currentActor } from "../app/core/identity.js";
import { recordBeforeWrite } from "../data/transaction.js";
import { readTenantScope } from "../data/tenantScope.js";
import { APP_VERSION } from "../app/core/version.js";

export const AUDIT_KEY = "cafenet_audit_trail";
export const AUDIT_HEAD_KEY = "cafenet_audit_head";
export const ACTIVITY_KEY = "cafenet_activity_log";
export const DEVICE_KEY = "cafenet_device";
export const AUDIT_MAX = 3000, ACTIVITY_MAX = 500, GENESIS = "GENESIS";
export const MIN_REASON = 3;
let auditMax = AUDIT_MAX;
export const __setAuditMaxForTest = (n) => { auditMax = n; };

// فهرست رویدادهای حساس: severity = sensitive | critical؛ reason = دلیل اجباری در رابط
export const AUDIT_ACTIONS = {
  invoice_void:   { label: "ابطال فاکتور/فروش", severity: "sensitive", reason: true, entity: "فاکتور" },
  tx_void:        { label: "ابطال تراکنش", severity: "sensitive", reason: true, entity: "تراکنش" },
  entry_void:     { label: "ابطال سند حسابداری", severity: "sensitive", reason: true, entity: "سند" },
  void_restore:   { label: "بازگردانی مورد باطل‌شده", severity: "sensitive", reason: false, entity: "" },
  sale_revise:    { label: "ویرایش فاکتور / تغییر مبلغ", severity: "sensitive", reason: true, entity: "فاکتور" },
  payment_waive:  { label: "بخشودگی (رایگان‌کردن) مانده", severity: "sensitive", reason: true, entity: "فاکتور" },
  payment_delete: { label: "حذف پرداخت", severity: "sensitive", reason: true, entity: "پرداخت" },
  stock_adjust:   { label: "تغییر موجودی انبار", severity: "sensitive", reason: true, entity: "کالا" },
  stock_delete:   { label: "حذف کالا از انبار", severity: "sensitive", reason: true, entity: "کالا" },
  price_change:   { label: "تغییر قیمت", severity: "sensitive", reason: true, entity: "قیمت" },
  ledger_adjust:  { label: "اصلاح حساب مشتری", severity: "sensitive", reason: true, entity: "حساب" },
  customer_delete:{ label: "حذف مشتری", severity: "sensitive", reason: true, entity: "مشتری" },
  currency_change:{ label: "تغییر واحد پول", severity: "sensitive", reason: false, entity: "" },
  backup_restore: { label: "بازیابی از بکاپ", severity: "critical", reason: true, entity: "بکاپ" },
  backup_undo:    { label: "بازگشت به قبل از بازیابی", severity: "critical", reason: false, entity: "بکاپ" },
  password_change:{ label: "تغییر رمز عبور", severity: "critical", reason: false, entity: "حساب" },
  recovery_reset: { label: "ساخت کد بازیابی رمز", severity: "critical", reason: false, entity: "حساب" },
  password_reset: { label: "بازیابی رمز عبور", severity: "critical", reason: false, entity: "حساب" },
  permission_change: { label: "تغییر سطح دسترسی / نقش کاربر", severity: "critical", reason: false, entity: "کاربر" },
};
export const SEVERITY_LABEL = { info: "عادی", sensitive: "حساس", critical: "بحرانی" };
export const needsReason = (code) => !!(AUDIT_ACTIONS[code] && AUDIT_ACTIONS[code].reason);

// ───────── ابزار ─────────
const ls = () => globalThis.localStorage;
const readJson = (k, fb) => { try { const v = JSON.parse(ls().getItem(k)); return v == null ? fb : v; } catch { return fb; } };
function writeJson(k, v) { try { recordBeforeWrite(k); ls().setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
export function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}
const clip = (v, n = 800) => { if (v == null) return null; try { const s = canon(v); return s.length > n ? { _truncated: s.slice(0, n) } : v; } catch { return null; } };
const str = (v, n = 300) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const eventHash = (e) => { const { hash, ...rest } = e; return sha256Sync(canon(rest)); };

// ───────── دستگاه ─────────
function guessDevice() {
  const ua = (globalThis.navigator && navigator.userAgent) || "";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "مرورگر";
  return `${br}${os ? " · " + os : ""}`;
}
export function getDevice() {
  let d = readJson(DEVICE_KEY, null);
  if (!d || !d.id) {
    let id; try { id = globalThis.crypto.randomUUID().slice(0, 8).toUpperCase(); } catch { id = Math.random().toString(16).slice(2, 10).toUpperCase(); }
    d = { id, label: "" };
    try { ls().setItem(DEVICE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }
  return { id: d.id, label: d.label || guessDevice(), custom: !!d.label };
}
export function setDeviceLabel(label) {
  const d = readJson(DEVICE_KEY, null) || { id: getDevice().id, label: "" };
  d.label = str(label, 40);
  try { ls().setItem(DEVICE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  return getDevice();
}

// ───────── ذخیره ─────────
function load() {
  const s = readJson(AUDIT_KEY, null);
  if (s && Array.isArray(s.events)) return { v: 1, base: s.base && s.base.hash ? s.base : { seq: 0, hash: GENESIS }, events: s.events.filter((e) => e && typeof e === "object") };
  return { v: 1, base: { seq: 0, hash: GENESIS }, events: [] };
}
export const getChainEvents = () => load().events;

// ثبت یک رویداد. input: { action(code), entityType?, entityId?, entityLabel?, amount?, before?, after?, reason?, details?, severity? }
// رویدادهای حساس همیشه ثبت می‌شوند (حتی اگر دلیل خالی باشد؛ در این حالت پرچم no_reason می‌گیرند).
export function audit(input = {}) {
  const code = str(input.action, 60) || "activity";
  const meta = AUDIT_ACTIONS[code];
  const severity = input.severity || (meta ? meta.severity : "info");
  const actor = (() => { try { const a = currentActor(); return { id: str(a.id, 80), email: str(a.email, 80), name: str(a.name, 80) }; } catch { return { id: "", email: "", name: "—" }; } })();
  const dev = getDevice();
  const scope = (() => { try { return readTenantScope(); } catch { return {}; } })();
  const reason = str(input.reason, 300);
  const base = {
    ts: new Date().toISOString(), actor, device: { id: dev.id, label: dev.label },
    action: code, label: str(input.label, 120) || (meta ? meta.label : code), severity,
    entity: { type: str(input.entityType || (meta && meta.entity), 40), id: input.entityId == null ? "" : str(input.entityId, 80), label: str(input.entityLabel, 160) },
    amount: Number.isFinite(Number(input.amount)) && input.amount !== undefined && input.amount !== null && input.amount !== "" ? Number(input.amount) : null,
    before: clip(input.before), after: clip(input.after), reason, details: str(input.details, 400),
    flags: meta && meta.reason && reason.length < MIN_REASON ? ["no_reason"] : [],
    org: scope.organizationId || "", branch: scope.branchId || "", appVersion: APP_VERSION,
  };
  if (severity === "info") return appendInfo(base);
  const st = load();
  const last = st.events[st.events.length - 1];
  const seq = (last ? last.seq : st.base.seq) + 1, prev = last ? last.hash : st.base.hash;
  const ev = { id: String(createId("event")), seq, ...base, prev };
  ev.hash = eventHash(ev);
  st.events.push(ev);
  if (st.events.length > auditMax) { const cut = st.events.splice(0, st.events.length - auditMax); st.base = { seq: cut[cut.length - 1].seq, hash: cut[cut.length - 1].hash }; }
  writeJson(AUDIT_KEY, st);
  writeJson(AUDIT_HEAD_KEY, { seq: ev.seq, hash: ev.hash });
  return ev;
}

// ───────── لاگ سبک (رویدادهای عادی) ─────────
function appendInfo(base) {
  const ev = { id: String(createId("event")), ...base };
  const log = readJson(ACTIVITY_KEY, []);
  const arr = Array.isArray(log) ? log : [];
  arr.push({ ...ev, user: base.actor.email || base.actor.name || "—", details: base.details || base.entity.label || "", eventType: "audit", schemaVersion: 2, organizationId: base.org, branchId: base.branch });
  writeJson(ACTIVITY_KEY, arr.length > ACTIVITY_MAX ? arr.slice(arr.length - ACTIVITY_MAX) : arr);
  return ev;
}
export function getInfoLog() { const l = readJson(ACTIVITY_KEY, []); return Array.isArray(l) ? l : []; }

// ───────── خواندن و فیلتر ─────────
// همهٔ رویدادها (زنجیره + لاگ سبک) به یک شکل یکسان، جدیدترین اول
export function normalizeEvent(e) {
  const isChain = typeof e.seq === "number";
  return {
    id: e.id, ts: e.ts, chain: isChain, seq: e.seq || null, severity: e.severity || "info", action: e.action, label: e.label || e.action,
    actor: e.actor ? (e.actor.name || e.actor.email || "—") : (e.user || "—"), actorEmail: e.actor ? e.actor.email : (e.user || ""),
    device: e.device ? e.device.label : "", entityType: e.entity ? e.entity.type : "", entityId: e.entity ? e.entity.id : "", entityLabel: e.entity ? e.entity.label : "",
    amount: e.amount == null ? null : e.amount, before: e.before || null, after: e.after || null, reason: e.reason || "", details: e.details || "",
    noReason: !!(e.flags && e.flags.includes("no_reason")),
  };
}
export function getAuditEvents({ severity = null, action = null, q = "", from = "", to = "", onlyNoReason = false, includeInfo = true } = {}) {
  let list = load().events.map(normalizeEvent);
  if (includeInfo) list = list.concat(getInfoLog().map((e) => normalizeEvent({ ...e, action: e.action, label: e.label || e.action })));
  const qq = str(q, 80).toLowerCase();
  list = list.filter((e) => (!severity || e.severity === severity) && (!action || e.action === action) && (!onlyNoReason || e.noReason)
    && (!from || e.ts >= from) && (!to || e.ts <= to + "T23:59:59.999Z")
    && (!qq || `${e.label} ${e.actor} ${e.entityLabel} ${e.entityId} ${e.reason} ${e.details} ${e.device}`.toLowerCase().includes(qq)));
  return list.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : (b.seq || 0) - (a.seq || 0)));
}

// ───────── بررسی صحت زنجیره ─────────
export function verifyAuditChain() {
  const st = load(), head = readJson(AUDIT_HEAD_KEY, null);
  let prev = st.base.hash, seq = st.base.seq, n = 0;
  for (const e of st.events) {
    n++;
    if (e.seq !== seq + 1) return { ok: false, checked: n, problem: "seq_gap", atSeq: e.seq, message: `ردیف ${seq + 1} در دفتر وجود ندارد (حذف رویداد)` };
    if (e.prev !== prev) return { ok: false, checked: n, problem: "broken_link", atSeq: e.seq, message: `پیوند رویداد ${e.seq} با رویداد قبلی شکسته است` };
    if (eventHash(e) !== e.hash) return { ok: false, checked: n, problem: "hash_mismatch", atSeq: e.seq, message: `محتوای رویداد ${e.seq} پس از ثبت تغییر کرده است` };
    prev = e.hash; seq = e.seq;
  }
  if (head && head.seq > seq) return { ok: false, checked: n, problem: "truncated", atSeq: seq, message: `${head.seq - seq} رویداد آخر دفتر حذف شده است` };
  if (head && head.seq === seq && head.hash !== prev) return { ok: false, checked: n, problem: "head_mismatch", atSeq: seq, message: "رویداد آخر با نشانهٔ ذخیره‌شده نمی‌خواند" };
  return { ok: true, checked: n, message: n ? `${n} رویداد حساس سالم است` : "رویداد حساسی ثبت نشده" };
}
export function auditStats() {
  const ev = load().events, d = Date.now() - 30 * 864e5;
  const recent = ev.filter((e) => Date.parse(e.ts) >= d);
  return { total: ev.length, recent30: recent.length, noReason: ev.filter((e) => (e.flags || []).includes("no_reason")).length, noReason30: recent.filter((e) => (e.flags || []).includes("no_reason")).length, critical30: recent.filter((e) => e.severity === "critical").length, capacity: Math.round((ev.length / auditMax) * 100) };
}

// ───────── خروجی ─────────
export function eventsToCsv(list) {
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["زمان (UTC)", "شدت", "عملیات", "کاربر", "دستگاه", "نوع رکورد", "شناسهٔ رکورد", "رکورد", "مبلغ (ریال)", "دلیل", "جزئیات", "قبل", "بعد", "ردیف", "بدون دلیل"];
  return "﻿" + [head.map(q).join(","), ...list.map((e) => [e.ts, SEVERITY_LABEL[e.severity] || e.severity, e.label, e.actor, e.device, e.entityType, e.entityId, e.entityLabel, e.amount == null ? "" : e.amount, e.reason, e.details, e.before ? canon(e.before) : "", e.after ? canon(e.after) : "", e.seq || "", e.noReason ? "بله" : ""].map(q).join(","))].join("\r\n");
}
export const exportChainJson = () => JSON.stringify({ app: "cafino", exportedAt: new Date().toISOString(), version: APP_VERSION, base: load().base, head: readJson(AUDIT_HEAD_KEY, null), events: load().events }, null, 1);
// تأیید یک خروجی JSON بیرونی (بدون نیاز به حافظهٔ برنامه)
export function verifyExportedChain(json) {
  let o; try { o = typeof json === "string" ? JSON.parse(json) : json; } catch { return { ok: false, message: "فایل معتبر نیست" }; }
  if (!o || !Array.isArray(o.events)) return { ok: false, message: "فایل معتبر نیست" };
  let prev = (o.base && o.base.hash) || GENESIS, seq = (o.base && o.base.seq) || 0;
  for (const e of o.events) { if (e.seq !== seq + 1 || e.prev !== prev || eventHash(e) !== e.hash) return { ok: false, atSeq: e.seq, message: `رویداد ${e.seq} سالم نیست` }; prev = e.hash; seq = e.seq; }
  return { ok: true, checked: o.events.length, message: `${o.events.length} رویداد سالم است` };
}
