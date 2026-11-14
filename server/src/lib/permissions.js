// سیستم مجوز مستقل بک‌اند: هر عملیات حساس مالی یک «مجوز» مشخص دارد و نقش فقط مجموعه‌ای پیش‌فرض از مجوزهاست.
// مجوز مؤثر = پیش‌فرض نقش (بر پایهٔ پروفایل) ± تغییرات نقش در سیاست کافی‌نت ± تغییرات همان کاربر؛ مالک همیشه همه را دارد.
// پروفایل: «strict» (پیش‌فرضِ Production) عملیات حساس را مدیرمحور می‌کند؛ «compat» رفتار پیش از 1.75 است (توسعه/تست).
import { forbidden, invalid } from "./errors.js";

export const PERMISSIONS = {
  "invoice.discount": "اعمال تخفیف روی فاکتور",
  "invoice.waive": "بخشودگی (waive) مانده فاکتور",
  "invoice.manual_total": "تعیین دستی مبلغ کل فاکتور (بدون قلم)",
  "invoice.void": "ابطال فاکتور",
  "payment.create": "ثبت پرداخت",
  "payment.void": "برگشت (void) پرداخت",
  "account.opening_balance": "تعیین مانده اولیه حساب مشتری",
  "account.adjust": "تعدیل دستی مانده حساب / برگشت وجه",
  "expense.create": "ثبت هزینه",
  "expense.approve": "تأیید هزینه",
  "report.financial": "مشاهده گزارش‌های مالی (درآمد، دریافت، مطالبات، صندوق)",
  "report.profit": "مشاهده سود و هزینهٔ تمام‌شده",
  "users.manage": "مدیریت کاربران و مجوزها",
  "shift.operate": "باز و بسته‌کردن شیفت صندوق خود",
  "shift.manage": "مشاهدهٔ همهٔ شیفت‌ها، بستن شیفت دیگران و گزارش عملکرد شیفت",
  "reconcile.request": "ثبت درخواست اصلاح مالی (نیازمند تأیید مدیر)",
  "reconcile.approve": "تأیید یا رد درخواست اصلاح مالی",
  "report.bi": "هوش کسب‌وکار (روند فروش، مشتریان غیرفعال، پیش‌بینی)",
  "upload.view": "مشاهده، دانلود و حذف فایل‌های دریافتی از مشتری (QR)",
  "upload.manage": "تنظیمات QR دریافت فایل (فعال/غیرفعال، سقف‌ها، تعویض کد)",
  "upload.bulk_delete": "حذف گروهی فایل‌های دریافتی از مشتری",
  "bot.manage": "اتصال و مدیریت ربات بله/تلگرام برای دریافت گزارش",
};
export const PERMISSION_KEYS = Object.keys(PERMISSIONS);
const ALL = new Set(PERMISSION_KEYS);
const MANAGER_DEFAULT = PERMISSION_KEYS;                                                       // مدیر: همه (همان رفتار موجود)
const STAFF_COMPAT = ["invoice.discount", "invoice.waive", "payment.create", "payment.void", "account.opening_balance", "expense.create", "shift.operate", "reconcile.request", "upload.view"];   // رفتار پیش از 1.75
const STAFF_STRICT = ["invoice.discount", "payment.create", "expense.create", "shift.operate", "reconcile.request", "upload.view"];                 // Production: بخشودگی، برگشت پرداخت و مانده اولیه فقط مدیر/مالک

export const LIMIT_KEYS = { discountMaxPercent: "سقف درصد تخفیف روی هر فاکتور (۰–۱۰۰)", waiveMaxAmount: "سقف مبلغ بخشودگی هر فاکتور (ریال)", openingBalanceMax: "سقف مبلغ مانده اولیه حساب (ریال)" };
export const POLICY_ROLES = ["manager", "staff"];

export function resolveProfile(cfg) { return cfg?.permissionProfile === "compat" || cfg?.permissionProfile === "strict" ? cfg.permissionProfile : (cfg?.production ? "strict" : "compat"); }

// پیش‌فرض نقش؛ PAYMENT_VOID_MIN_ROLE (اگر صریح تنظیم شده) بر برگشت پرداخت کارمند حاکم است
export function defaultPermissions(role, cfg) {
  if (role === "owner") return new Set(PERMISSION_KEYS);
  if (role === "manager") return new Set(MANAGER_DEFAULT);
  if (role !== "staff") return new Set();
  const s = new Set(resolveProfile(cfg) === "strict" ? STAFF_STRICT : STAFF_COMPAT);
  if (cfg?.paymentVoidMinRole === "staff") s.add("payment.void"); else if (cfg?.paymentVoidMinRole === "manager") s.delete("payment.void");
  return s;
}

const pickKeys = (arr, where) => {
  if (arr === undefined) return [];
  if (!Array.isArray(arr)) throw invalid(`«${where}» باید فهرست باشد`);
  const bad = arr.filter((k) => !ALL.has(k)); if (bad.length) throw invalid(`مجوز ناشناخته در «${where}»: ${bad.join("، ")}`);
  return [...new Set(arr)];
};

// اعتبارسنجی و نرمال‌سازی سیاست ورودی مالک
export function normalizePolicy(raw, { userIds } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("سیاست باید یک شیء باشد");
  const out = { roles: {}, users: {}, limits: {} };
  for (const [role, v] of Object.entries(raw.roles || {})) {
    if (!POLICY_ROLES.includes(role)) throw invalid(`نقش «${role}» قابل‌تنظیم نیست (مالک همیشه همه مجوزها را دارد)`);
    const grant = pickKeys(v?.grant, `roles.${role}.grant`), deny = pickKeys(v?.deny, `roles.${role}.deny`);
    if (grant.some((k) => deny.includes(k))) throw invalid(`مجوز هم‌زمان در grant و deny نقش ${role} است`);
    out.roles[role] = { grant, deny };
  }
  for (const [uid, v] of Object.entries(raw.users || {})) {
    if (userIds && !userIds.has(uid)) throw invalid(`کاربر «${uid}» در این کافی‌نت نیست`);
    const grant = pickKeys(v?.grant, `users.${uid}.grant`), deny = pickKeys(v?.deny, `users.${uid}.deny`);
    if (grant.some((k) => deny.includes(k))) throw invalid("مجوز هم‌زمان در grant و deny است");
    if (grant.length || deny.length) out.users[uid] = { grant, deny };
  }
  for (const [role, v] of Object.entries(raw.limits || {})) {
    if (!POLICY_ROLES.includes(role)) throw invalid(`سقف برای نقش «${role}» قابل‌تنظیم نیست`);
    const l = {};
    for (const [k, n] of Object.entries(v || {})) {
      if (!(k in LIMIT_KEYS)) throw invalid(`سقف ناشناخته «${k}»`);
      if (n === null) continue;                                                              // null = بدون سقف
      if (!Number.isInteger(n) || n < 0 || (k === "discountMaxPercent" && n > 100) || n > 1e13) throw invalid(`مقدار سقف «${k}» نامعتبر است`);
      l[k] = n;
    }
    if (Object.keys(l).length) out.limits[role] = l;
  }
  return out;
}

export function effective({ role, userId, policy, cfg }) {
  const set = defaultPermissions(role, cfg);
  const limits = {};
  if (role === "owner") return { has: (p) => ALL.has(p), list: PERMISSION_KEYS.slice(), limits };
  const rp = policy?.roles?.[role]; if (rp) { for (const k of rp.grant || []) set.add(k); for (const k of rp.deny || []) set.delete(k); }
  const up = policy?.users?.[userId]; if (up) { for (const k of up.grant || []) set.add(k); for (const k of up.deny || []) set.delete(k); }
  Object.assign(limits, policy?.limits?.[role] || {});
  return { has: (p) => set.has(p), list: [...set].sort(), limits };
}

export function createPermissionService({ pool, cfg, ttlMs = 5000, now = Date.now }) {
  const cache = new Map();
  const loadPolicy = async (cafeId) => {
    const hit = cache.get(cafeId); if (hit && now() - hit.t < ttlMs) return hit.policy;
    const r = await pool.query("SELECT policy, version FROM permission_policies WHERE cafe_id=$1", [cafeId]);
    const policy = r.rows[0] ? { ...r.rows[0].policy, version: r.rows[0].version } : {};
    cache.set(cafeId, { t: now(), policy }); return policy;
  };
  const svc = {
    loadPolicy, invalidate: (cafeId) => cache.delete(cafeId),
    async forUser(user) {
      if (!user?.cafeId) return effective({ role: user?.role, userId: user?.id, policy: {}, cfg });
      return effective({ role: user.role, userId: user.id, policy: await loadPolicy(user.cafeId), cfg });
    },
    async forRequest(req) { return (req._perms ||= await svc.forUser(req.user)); },
    // preHandler: ورود به کافی‌نت + داشتن «یکی از» مجوزها
    require(app, ...perms) {
      const cafe = app.requireCafe();
      return async (req) => {
        await cafe(req);
        const p = await svc.forRequest(req);
        if (!perms.some((k) => p.has(k))) throw forbidden(`دسترسی «${perms[0]}» لازم است`, "permission_denied");
      };
    },
  };
  return svc;
}

// بررسی داخل کنترل‌کننده (شرطی بر اساس بدنه)
export function assertPerm(perms, key, message) { if (!perms.has(key)) throw forbidden(message || `دسترسی «${key}» لازم است`, "permission_denied"); }
