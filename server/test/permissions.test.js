// سیستم مجوز مستقل بک‌اند: پروفایل strict/compat، هر ۱۳ مجوز، سقف‌ها، سیاست قابل‌تنظیم، و قواعد مالک/مدیر.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { PERMISSION_KEYS, defaultPermissions, normalizePolicy, effective } from "../src/lib/permissions.js";

let url, S, C;       // S = strict (production-like) ؛ C = compat
const PW = "رمز-خیلی-قوی-۱۲۳";
const mkCtx = async (profile, email) => {
  const ctx = await makeApp(url, { env: { PERMISSION_PROFILE: profile }, cfg: {} });
  const c = client(ctx.app);
  const r = await c.post("/api/auth/register", { email, password: PW, firstName: "م", lastName: "ر", phone: "09121234567", shopName: "مجوز" });
  assert.equal(r.status, 201);
  const owner = (m, u, b, o = {}) => c.call(m, u, { body: b, bearer: r.data.accessToken, ...o });
  const mkUser = async (role, n) => {
    const inv = await owner("POST", "/api/users/invite", { email: `${role}${n}-${email}`, role, firstName: "ک", lastName: n });
    assert.equal(inv.status, 201, JSON.stringify(inv.json));
    const cc = client(ctx.app);
    const lg = await cc.post("/api/auth/login", { email: `${role}${n}-${email}`, password: inv.data.temporaryPassword }); assert.equal(lg.status, 200, JSON.stringify(lg.json));
    const ch = await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken }); assert.ok(ch.status < 300, JSON.stringify(ch.json));
    const l2 = await cc.post("/api/auth/login", { email: `${role}${n}-${email}`, password: PW }); assert.equal(l2.status, 200);
    return { id: inv.data.user.id, call: (m, u, b, o = {}) => cc.call(m, u, { body: b, bearer: l2.data.accessToken, ...o }) };
  };
  return { ctx, owner, mkUser, cafeId: r.data.user.branchId };
};
before(async () => { url = await startDb(); });
after(async () => { for (const x of [S, C]) { await x?.ctx.app.close(); await x?.ctx.pool.end(); } await stopDb(); });

test("پیش‌فرض‌ها: owner همه؛ manager همه؛ staff در strict محدود، در compat مثل قبل؛ PAYMENT_VOID_MIN_ROLE صریح حاکم است", () => {
  assert.equal(PERMISSION_KEYS.length, 21);   // ۱۸ مجوز 1.75 + سه مجوز دریافت فایل (QR): مشاهده، مدیریت، حذف گروهی
  for (const k of ["invoice.discount", "invoice.waive", "invoice.manual_total", "invoice.void", "payment.create", "payment.void", "account.opening_balance", "account.adjust", "expense.create", "expense.approve", "report.financial", "report.profit", "users.manage", "shift.operate", "shift.manage", "reconcile.request", "reconcile.approve", "report.bi"]) assert.ok(PERMISSION_KEYS.includes(k), k);
  const strict = { production: true, paymentVoidMinRole: "" }, compat = { production: false, paymentVoidMinRole: "" };
  assert.deepEqual([...defaultPermissions("owner", strict)].sort(), [...PERMISSION_KEYS].sort());
  assert.deepEqual([...defaultPermissions("manager", strict)].sort(), [...PERMISSION_KEYS].sort());
  assert.deepEqual([...defaultPermissions("staff", strict)].sort(), ["expense.create", "invoice.discount", "payment.create", "reconcile.request", "shift.operate", "upload.view"]);
  assert.equal(defaultPermissions("staff", compat).has("payment.void"), true);
  assert.equal(defaultPermissions("staff", { ...strict, paymentVoidMinRole: "staff" }).has("payment.void"), true, "env صریح staff");
  assert.equal(defaultPermissions("staff", { ...compat, paymentVoidMinRole: "manager" }).has("payment.void"), false, "env صریح manager");
  assert.equal(defaultPermissions("platform_admin", strict).size, 0);
  assert.equal(defaultPermissions("staff", { production: true, permissionProfile: "compat" }).has("invoice.waive"), true, "PERMISSION_PROFILE صریح");
});

test("normalizePolicy: مجوز ناشناخته/نقش owner/سقف نامعتبر/تعارض grant-deny رد می‌شود", () => {
  const bad = [{ roles: { owner: { deny: ["payment.void"] } } }, { roles: { staff: { grant: ["x.y"] } } }, { roles: { staff: { grant: ["payment.void"], deny: ["payment.void"] } } },
    { limits: { staff: { discountMaxPercent: 101 } } }, { limits: { staff: { waiveMaxAmount: -1 } } }, { limits: { staff: { foo: 1 } } }, { limits: { staff: { waiveMaxAmount: 1.5 } } }, [], null];
  for (const b of bad) assert.throws(() => normalizePolicy(b), /./, JSON.stringify(b));
  assert.deepEqual(normalizePolicy({ roles: { staff: { grant: ["payment.void"] } }, limits: { staff: { discountMaxPercent: 10, waiveMaxAmount: null } } }), { roles: { staff: { grant: ["payment.void"], deny: [] } }, users: {}, limits: { staff: { discountMaxPercent: 10 } } });
  assert.equal(effective({ role: "owner", userId: "u", policy: { roles: { manager: { deny: ["payment.void"] } } }, cfg: {} }).has("payment.void"), true);
});

test("strict: کارمند نمی‌تواند پرداخت را برگشت بزند، بخشودگی بدهد، مانده اولیه بگذارد، فاکتور را باطل/تعدیل کند، گزارش مالی ببیند یا کاربر مدیریت کند", async () => {
  S = await mkCtx("strict", "s@strict.test");
  const { owner } = S, st = await S.mkUser("staff", "1");
  assert.equal((await owner("POST", "/api/customers", { id: "c1", firstName: "الف" })).status, 201);
  assert.equal((await owner("POST", "/api/accounts", { id: "a1", customerId: "c1", name: "الف" })).status, 201);
  const inv = await st.call("POST", "/api/invoices", { id: "i1", number: "1", customerId: "c1", date: "2026-11-01", items: [{ description: "x", quantity: 1, unitPrice: 100000 }], discount: 10000 });
  assert.equal(inv.status, 201, "تخفیف برای کارمند مجاز است"); assert.equal(inv.data.discount, 10000);
  const pay = await st.call("POST", "/api/payments", { id: "p1", invoiceId: "i1", amount: 30000, date: "2026-11-01" }); assert.equal(pay.status, 201, "ثبت پرداخت مجاز");
  const deny = async (res, code = "permission_denied") => { assert.equal(res.status, 403, JSON.stringify(res.json)); assert.equal(res.json.error.code, code); };
  await deny(await st.call("POST", "/api/payments/p1/void", { reason: "اشتباه" }));
  await deny(await st.call("PATCH", "/api/invoices/i1", { waivedAmount: 5000 }));
  await deny(await st.call("POST", "/api/accounts", { id: "a2", name: "ب", balance: 5000 }));
  assert.equal((await st.call("POST", "/api/accounts", { id: "a3", name: "ج" })).status, 201, "حساب بدون مانده اولیه مجاز");
  await deny(await st.call("POST", "/api/invoices/i1/void", { reason: "ابطال" }));
  await deny(await st.call("POST", "/api/accounts/a1/adjust", { amount: 1, reason: "تعدیل" }));
  await deny(await st.call("GET", "/api/reports/summary"));
  await deny(await st.call("GET", "/api/users"));
  await deny(await st.call("PUT", "/api/permissions", { roles: { staff: { grant: ["users.manage"] } } }));
  // تخفیف + مبلغ دستی: مبلغ دستی را کارمند نمی‌تواند (نادیده گرفته می‌شود)
  const man = await st.call("POST", "/api/invoices", { id: "i2", number: "2", date: "2026-11-01", items: [{ description: "y", quantity: 1, unitPrice: 5000 }], totalAmount: 1 }); assert.equal(man.status, 201); assert.equal(man.data.totalAmount, 5000);
  // مالک می‌تواند همه را
  assert.equal((await owner("PATCH", "/api/invoices/i1", { waivedAmount: 5000 })).status, 200);
  assert.equal((await owner("POST", "/api/payments/p1/void", { reason: "اشتباه" })).status, 201);
  assert.equal((await owner("GET", "/api/reports/summary")).status, 200);
  // GET /api/permissions: کارمند فقط مجوزهای خودش را می‌بیند
  const me = await st.call("GET", "/api/permissions"); assert.equal(me.status, 200); assert.deepEqual(me.data.me.permissions, ["expense.create", "invoice.discount", "payment.create", "reconcile.request", "shift.operate", "upload.view"]); assert.equal(me.data.policy, undefined); assert.equal(me.data.profile, "strict");
});

test("compat: رفتار پیش از 1.75 (کارمند می‌تواند برگشت پرداخت/بخشودگی/مانده اولیه بدهد) ولی ابطال فاکتور/تعدیل/گزارش همچنان مدیرمحور", async () => {
  C = await mkCtx("compat", "c@compat.test");
  const { owner } = C, st = await C.mkUser("staff", "1");
  await owner("POST", "/api/customers", { id: "c1", firstName: "الف" });
  await owner("POST", "/api/invoices", { id: "i1", number: "1", customerId: "c1", date: "2026-11-01", items: [{ description: "x", quantity: 1, unitPrice: 100000 }] });
  assert.equal((await st.call("POST", "/api/payments", { id: "p1", invoiceId: "i1", amount: 30000, date: "2026-11-01" })).status, 201);
  assert.equal((await st.call("PATCH", "/api/invoices/i1", { waivedAmount: 5000 })).status, 200);
  assert.equal((await st.call("POST", "/api/accounts", { id: "a2", name: "ب", balance: 5000 })).status, 201);
  assert.equal((await st.call("POST", "/api/payments/p1/void", { reason: "اشتباه" })).status, 201);
  assert.equal((await st.call("POST", "/api/invoices/i1/void", { reason: "ابطال" })).status, 403);
  assert.equal((await st.call("GET", "/api/reports/summary")).status, 403);
});

test("سیاست کافی‌نت: مالک مجوز کارمند را تنظیم می‌کند؛ سقف تخفیف/بخشودگی/مانده؛ تغییر فوری؛ مجوز هر کاربر؛ نسخه‌بندی و حسابرسی", async () => {
  const { owner, cafeId, ctx } = S, st = await S.mkUser("staff", "2"), st3 = await S.mkUser("staff", "3");
  await owner("POST", "/api/invoices", { id: "i5", number: "5", date: "2026-11-01", items: [{ description: "x", quantity: 1, unitPrice: 100000 }] });
  const put = await owner("PUT", "/api/permissions", { version: 0, roles: { staff: { grant: ["invoice.waive", "account.opening_balance"] } }, users: { [st3.id]: { deny: ["payment.create"] } }, limits: { staff: { discountMaxPercent: 10, waiveMaxAmount: 4000, openingBalanceMax: 1000 } } });
  assert.equal(put.status, 200, JSON.stringify(put.json)); assert.equal(put.data.version, 1);
  ctx.app.perms.invalidate(cafeId);
  // سقف‌ها
  assert.equal((await st.call("PATCH", "/api/invoices/i5", { waivedAmount: 5000 })).json.error.code, "limit_exceeded");
  assert.equal((await st.call("PATCH", "/api/invoices/i5", { waivedAmount: 4000 })).data.waivedAmount, 4000);
  assert.equal((await st.call("POST", "/api/invoices", { id: "i6", number: "6", date: "2026-11-01", items: [{ description: "x", quantity: 1, unitPrice: 100000 }], discount: 11000 })).json.error.code, "limit_exceeded");
  assert.equal((await st.call("POST", "/api/invoices", { id: "i7", number: "7", date: "2026-11-01", items: [{ description: "x", quantity: 1, unitPrice: 100000 }], discount: 10000 })).status, 201);
  assert.equal((await st.call("POST", "/api/accounts", { id: "a9", name: "x", balance: 2000 })).json.error.code, "limit_exceeded");
  assert.equal((await st.call("POST", "/api/accounts", { id: "a10", name: "x", balance: 900 })).status, 201);
  // مجوز مخصوص کاربر
  assert.equal((await st3.call("POST", "/api/payments", { id: "pp", invoiceId: "i5", amount: 100, date: "2026-11-01" })).status, 403);
  assert.equal((await st.call("POST", "/api/payments", { id: "pp2", invoiceId: "i5", amount: 100, date: "2026-11-01" })).status, 201);
  // تداخل نسخه
  assert.equal((await owner("PUT", "/api/permissions", { version: 0, roles: {} })).status, 409);
  const full = await owner("GET", "/api/permissions"); assert.equal(full.data.policy.version, 1); assert.ok(full.data.users.find((u) => u.id === st3.id).permissions.every((p) => p !== "payment.create"));
  // حسابرسی
  const a = (await ctx.pool.query("SELECT details FROM audit_log WHERE cafe_id=$1 AND action='permissions.update'", [cafeId])).rows; assert.equal(a.length, 1); assert.equal(a[0].details.version, 1);
});

test("قواعد مدیر: مدیر فقط کارمندان را تنظیم می‌کند، نه نقش/کاربران مدیر، نه users.manage؛ مالک را نمی‌توان محدود کرد", async () => {
  const { owner } = S, mg = await S.mkUser("manager", "1"), st = await S.mkUser("staff", "4");
  const base = (await owner("GET", "/api/permissions")).data.policy, keep = { roles: base.roles, users: base.users, limits: base.limits };
  const mut = (f) => { const p = JSON.parse(JSON.stringify(keep)); f(p); return { ...p, version: base.version }; };
  assert.equal((await mg.call("PUT", "/api/permissions", mut((p) => { p.roles.manager = { deny: ["payment.void"] }; }))).status, 403);
  assert.equal((await mg.call("PUT", "/api/permissions", mut((p) => { p.roles.staff = { ...(p.roles.staff || {}), grant: [...(p.roles.staff?.grant || []), "users.manage"] }; }))).status, 403);
  assert.equal((await mg.call("PUT", "/api/permissions", mut((p) => { p.users[mg.id] = { grant: [] , deny: ["report.profit"] }; }))).status, 403, "مدیر مجوز مدیران را (حتی خودش) تغییر نمی‌دهد");
  const ok = await mg.call("PUT", "/api/permissions", mut((p) => { p.users[st.id] = { grant: ["payment.void"], deny: [] }; })); assert.equal(ok.status, 200, JSON.stringify(ok.json));
  S.ctx.app.perms.invalidate(S.cafeId);
  assert.equal((await st.call("GET", "/api/permissions")).data.me.permissions.includes("payment.void"), true);
  const ownerMe = (await owner("GET", "/api/permissions")).data.me; assert.equal(ownerMe.permissions.length, 21);
  assert.equal((await owner("PUT", "/api/permissions", { roles: { owner: { deny: ["users.manage"] } } })).status, 422);
});

test("report.financial/report.profit: مجوز جداگانهٔ گزارش‌ها از سیاست خوانده می‌شود", async () => {
  const { owner } = S, st = await S.mkUser("staff", "5");
  const base = (await owner("GET", "/api/permissions")).data.policy;
  await owner("PUT", "/api/permissions", { version: base.version, roles: { ...base.roles, staff: { grant: ["report.financial"], deny: [] } }, users: base.users, limits: base.limits });
  S.ctx.app.perms.invalidate(S.cafeId);
  assert.equal((await st.call("GET", "/api/reports/summary")).status, 200);
});
