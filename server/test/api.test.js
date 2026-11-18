import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseTrustProxy, parseDbSsl, loadConfig } from "../src/config.js";
import { buildPgSsl } from "../src/db.js";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { hashPassword } from "../src/lib/security.js";
import { verifyAuditChain } from "../src/lib/audit.js";

let ctx, db, A, B, admin;   // A, B = دو کافی‌نت مستقل؛ admin = مدیر پنل مرکزی
const PW = "رمز-خیلی-قوی-۱۲۳";
const reg = async (email, shopName) => { const c = client(ctx.app); const r = await c.post("/api/auth/register", { email, password: PW, firstName: "علی", lastName: "رضایی", phone: "09121234567", shopName }); assert.equal(r.status, 201, JSON.stringify(r.json)); return { c, token: r.data.accessToken, user: r.data.user }; };

before(async () => {
  db = await startDb();
  ctx = await makeApp(db);
  A = await reg("a@cafe.test", "کافی‌نت الف");
  B = await reg("b@cafe.test", "کافی‌نت ب");
  await ctx.pool.query("INSERT INTO users(email,password_hash,role,first_name) VALUES ('root@cafino.test',$1,'platform_admin','مدیر')", [await hashPassword(PW)]);
  admin = client(ctx.app);
  const r = await admin.post("/api/auth/login", { email: "root@cafino.test", password: PW });
  assert.equal(r.status, 200); admin.token = r.data.accessToken;
});
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); });
const a = (m, u, body, o = {}) => A.c.call(m, u, { body, bearer: A.token, ...o });
const b = (m, u, body, o = {}) => B.c.call(m, u, { body, bearer: B.token, ...o });
const adm = (m, u, body) => admin.call(m, u, { body, bearer: admin.token });

test("سلامت: healthz و readyz", async () => {
  const c = client(ctx.app);
  assert.equal((await c.get("/healthz")).status, 200);
  assert.equal((await c.get("/readyz")).status, 200);
});

test("ورود/me: کوکی HttpOnly، me با کوکی، me بدون ورود ۴۰۱، پاسخ بدون رمز", async () => {
  const c = client(ctx.app);
  const r = await c.post("/api/auth/login", { email: "a@cafe.test", password: PW });
  assert.equal(r.status, 200); assert.ok(r.data.accessToken); assert.equal(r.data.user.role, "owner"); assert.ok(r.data.user.branchId && r.data.user.organizationId);
  assert.ok(!JSON.stringify(r.json).includes("password"));
  const sc = [].concat(r.headers["set-cookie"]).join("\n");
  assert.match(sc, /cafino_at=[^;]+;.*HttpOnly/i); assert.match(sc, /cafino_rt=[^;]+;.*Path=\/api\/auth;.*HttpOnly/i); assert.match(sc, /SameSite=Lax/i);
  assert.equal((await c.get("/api/auth/me")).data.email, "a@cafe.test");
  assert.equal((await client(ctx.app).get("/api/auth/me")).status, 401);
});

test("ورود اشتباه: پیام یکسان برای ایمیل ناموجود و رمز غلط؛ قفل پس از ۸ بار", async () => {
  const c = client(ctx.app);
  const r1 = await c.post("/api/auth/login", { email: "nobody@cafe.test", password: "whatever-123" });
  const r2 = await c.post("/api/auth/login", { email: "b@cafe.test", password: "wrong-password" });
  assert.equal(r1.status, 401); assert.equal(r2.status, 401); assert.equal(r1.json.error.message, r2.json.error.message);
  await ctx.pool.query("INSERT INTO users(org_id,cafe_id,email,password_hash,role) SELECT org_id,cafe_id,'lock@cafe.test',password_hash,'staff' FROM users WHERE email='a@cafe.test'");
  let last; for (let i = 0; i < 9; i++) last = await c.post("/api/auth/login", { email: "lock@cafe.test", password: "bad-password-1" });
  assert.equal(last.status, 429); assert.equal(last.json.error.code, "account_locked");
  assert.equal((await c.post("/api/auth/login", { email: "lock@cafe.test", password: PW })).status, 429, "حتی رمز درست در زمان قفل پذیرفته نمی‌شود");
});

test("refresh چرخشی: توکن قدیمی بعد از چرخش باطل؛ استفادهٔ دوباره کل خانواده را می‌بندد", async () => {
  const c = client(ctx.app);
  await c.post("/api/auth/login", { email: "a@cafe.test", password: PW });
  const old = c.jar.get("cafino_rt");
  const r = await c.post("/api/auth/refresh", {}); assert.equal(r.status, 200); assert.ok(r.data.accessToken);
  const fresh = c.jar.get("cafino_rt"); assert.notEqual(fresh, old);
  const thief = client(ctx.app); thief.jar.set("cafino_rt", old);
  assert.equal((await thief.post("/api/auth/refresh", {})).status, 401, "توکن قدیمی رد می‌شود");
  assert.equal((await c.post("/api/auth/refresh", {})).status, 401, "و خانواده باطل شده است");
});

test("me با access منقضی ولی refresh معتبر نشست تازه می‌سازد (باز کردن دوبارهٔ برنامه)", async () => {
  const c = client(ctx.app);
  await c.post("/api/auth/login", { email: "a@cafe.test", password: PW });
  c.jar.delete("cafino_at");
  const r = await c.get("/api/auth/me"); assert.equal(r.status, 200); assert.ok(r.data.accessToken); assert.ok(c.jar.get("cafino_at"));
});

test("خروج: refresh باطل و کوکی پاک", async () => {
  const c = client(ctx.app);
  await c.post("/api/auth/login", { email: "a@cafe.test", password: PW });
  const rt = c.jar.get("cafino_rt");
  assert.equal((await c.post("/api/auth/logout")).status, 204);
  const t = client(ctx.app); t.jar.set("cafino_rt", rt);
  assert.equal((await t.post("/api/auth/refresh", {})).status, 401);
});

test("امنیت درخواست: Origin بیگانه رد، JSON غیرمجاز ۴۱۵، توکن جعلی/دستکاری ۴۰۱", async () => {
  const evil = client(ctx.app, { origin: "https://evil.example" });
  assert.equal((await evil.post("/api/auth/login", { email: "a@cafe.test", password: PW })).json.error.code, "bad_origin");
  const t = client(ctx.app);
  assert.equal((await t.call("POST", "/api/customers", { body: "id=1", raw: true, headers: { "content-type": "text/plain" }, bearer: A.token })).status, 415);
  assert.equal((await t.get("/api/customers", { bearer: A.token.slice(0, -3) + "abc" })).status, 401);
  assert.equal((await t.get("/api/customers", { bearer: "x.y.z" })).status, 401);
  assert.equal((await t.call("POST", "/api/customers", { body: "{bad", raw: true, bearer: A.token })).status, 400);
});

test("هدرهای امنیتی و بدون افشا: بدون x-powered-by، خطای ۵۰۰ بدون جزئیات", async () => {
  const r = await client(ctx.app).get("/healthz");
  assert.ok(!r.headers["x-powered-by"]); assert.equal(r.headers["x-content-type-options"], "nosniff"); assert.match(r.headers["content-security-policy"], /default-src 'none'/);
  assert.equal((await client(ctx.app).get("/api/nope")).json.error.code, "not_found");
});

test("مشتری: ساخت، ساخت تکراری همان رکورد، ویرایش (کیف پول با PATCH عوض نمی‌شود)، فهرست و جستجو، حذف نرم", async () => {
  const body = { id: "c1", firstName: "سارا", lastName: "احمدی", phone: "09129999999", wallet: 5000000, tags: ["vip"] };
  const r = await a("POST", "/api/customers", body); assert.equal(r.status, 201); assert.equal(r.data.wallet, 5000000); assert.deepEqual(r.data.tags, ["vip"]);
  const again = await a("POST", "/api/customers", { ...body, firstName: "تغییر" }); assert.equal(again.status, 200); assert.equal(again.data.firstName, "سارا");
  const p = await a("PATCH", "/api/customers/c1", { phone: "09120000000", wallet: 999, note: "x" });
  assert.equal(p.data.phone, "09120000000"); assert.equal(p.data.wallet, 5000000, "کیف پول با PATCH تغییر نمی‌کند"); assert.equal(p.data.note, "x"); assert.deepEqual(p.data.tags, ["vip"], "ادغام، نه جایگزینی");
  const l = await a("GET", "/api/customers?q=سارا"); assert.equal(l.json.meta.total, 1); assert.equal(l.data[0].id, "c1");
  assert.equal((await a("GET", "/api/customers?q=%25")).json.meta.total, 0, "نویسهٔ % جستجوی عمومی نیست");
  assert.equal((await a("DELETE", "/api/customers/c1")).status, 204);
  assert.equal((await a("DELETE", "/api/customers/c1")).status, 204, "حذف دوباره بی‌اثر");
  assert.equal((await a("GET", "/api/customers/c1")).status, 404);
  assert.equal((await a("GET", "/api/customers")).json.meta.total, 0);
  assert.equal((await a("POST", "/api/customers", body)).json.error.code, "deleted", "رکورد حذف‌شده دوباره ساخته نمی‌شود");
});

test("جداسازی مستأجر: کافی‌نت ب هرگز دادهٔ الف را نمی‌بیند/نمی‌تواند تغییر دهد؛ هدر X-Cafe-Id جعلی اثری ندارد", async () => {
  await a("POST", "/api/customers", { id: "secret1", firstName: "فقط الف" });
  assert.equal((await b("GET", "/api/customers/secret1")).status, 404);
  assert.equal((await b("GET", "/api/customers")).json.meta.total, 0);
  assert.equal((await b("PATCH", "/api/customers/secret1", { firstName: "هک" })).status, 404);
  assert.equal((await b("DELETE", "/api/customers/secret1")).status, 204);
  assert.equal((await a("GET", "/api/customers/secret1")).data.firstName, "فقط الف", "حذف ب اثری روی الف نداشت");
  const forged = await b("GET", "/api/customers/secret1", undefined, { headers: { "x-cafe-id": A.user.branchId } });
  assert.equal(forged.status, 404);
  await b("POST", "/api/customers", { id: "secret1", firstName: "مال ب" });       // شناسهٔ یکسان در دو مستأجر مجاز و مستقل است
  assert.equal((await b("GET", "/api/customers/secret1")).data.firstName, "مال ب"); assert.equal((await a("GET", "/api/customers/secret1")).data.firstName, "فقط الف");
});

test("فاکتور + پرداخت: مبالغ را سرور از اقلام و پرداخت‌ها می‌سازد؛ فیلدهای مشتقِ کلاینت نادیده گرفته می‌شوند", async () => {
  await a("POST", "/api/customers", { id: "c9", firstName: "ع" });
  const inv = { id: "inv1", number: "1001", customerId: "c9", customerName: "ع", date: "2026-10-30", items: [{ description: "پرینت", quantity: 2, unitPrice: 50000, total: 1 }],
    subtotal: 1, totalAmount: 1, paidAmount: 100000, remainingAmount: 0, status: "paid" };      // کلاینت دروغ می‌گوید
  const r = await a("POST", "/api/invoices", inv);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.data.subtotal, 100000); assert.equal(r.data.totalAmount, 100000, "جمع از اقلام ساخته می‌شود"); assert.equal(r.data.items[0].total, 100000);
  assert.equal(r.data.paidAmount, 0, "paidAmount کلاینت نادیده گرفته می‌شود"); assert.equal(r.data.remainingAmount, 100000); assert.equal(r.data.status, "unpaid");
  assert.equal(r.data.remainingAmount !== 0 && r.data.status !== "paid", true);
  const p1 = await a("POST", "/api/payments", { id: "p1", invoiceId: "inv1", amount: 40000, method: "cash", date: "2026-10-30" }, { headers: { "idempotency-key": "payment-p1" } });
  assert.equal(p1.status, 201); assert.equal(p1.data.customerId, "c9", "مشتری از فاکتور پر می‌شود");
  let g = (await a("GET", "/api/invoices/inv1")).data; assert.equal(g.paidAmount, 40000); assert.equal(g.remainingAmount, 60000); assert.equal(g.status, "partial");
  await a("POST", "/api/payments", { id: "p2", invoiceId: "inv1", amount: 60000, method: "card", date: "2026-10-30" });
  g = (await a("GET", "/api/invoices/inv1")).data; assert.equal(g.status, "paid"); assert.equal(g.remainingAmount, 0);
  // حذف پرداخت وجود ندارد؛ برگشت با ردیف منفی
  const del = await a("DELETE", "/api/payments/p2"); assert.equal(del.status, 405); assert.equal(del.json.error.code, "payment_delete_forbidden");
  assert.equal((await a("POST", "/api/payments/p2/void", {})).status, 422, "دلیل الزامی است");
  const vd = await a("POST", "/api/payments/p2/void", { reason: "اشتباه در ثبت" }); assert.equal(vd.status, 201); assert.equal(vd.data.amount, -60000); assert.equal(vd.data.kind, "reversal"); assert.equal(vd.data.reversalOf, "p2");
  assert.equal((await a("POST", "/api/payments/p2/void", { reason: "اشتباه در ثبت" })).data.id, vd.data.id, "برگشت دوباره همان برگشت است");
  assert.equal((await a("GET", "/api/payments/p2")).data.amount, 60000, "ردیف اصلی دست‌نخورده می‌ماند");
  g = (await a("GET", "/api/invoices/inv1")).data; assert.equal(g.status, "partial"); assert.equal(g.paidAmount, 40000);
  assert.equal((await a("POST", `/api/payments/${vd.data.id}/void`, { reason: "x y z" })).status, 409, "برگشت را نمی‌توان برگشت زد");
  assert.equal((await a("PATCH", "/api/payments/p1", { amount: 1, reason: "تلاش" })).status, 422, "مبلغ پرداخت ثبت‌شده تغییر نمی‌کند");
  assert.equal((await a("PATCH", "/api/payments/p1", { method: "pos" })).status, 422, "ویرایش بدون دلیل ممنوع");
  assert.equal((await a("PATCH", "/api/payments/p1", { method: "pos", reason: "اصلاح روش" })).data.method, "pos");
  const waive = await a("PATCH", "/api/invoices/inv1", { waivedAmount: 60000, remainingAmount: 5, status: "paid", paidAmount: 999 });
  assert.equal(waive.data.status, "paid"); assert.equal(waive.data.remainingAmount, 0); assert.equal(waive.data.paidAmount, 40000, "paid فقط مجموع پرداخت‌هاست");
  const big = await a("PATCH", "/api/invoices/inv1", { waivedAmount: 99999999 }); assert.equal(big.data.waivedAmount, 60000, "بخشودگی از مانده بیشتر نمی‌شود");
  const edit = await a("PATCH", "/api/invoices/inv1", { items: [{ description: "پرینت", quantity: 3, unitPrice: 50000 }], discount: 10000 });
  assert.equal(edit.data.totalAmount, 140000); assert.equal(edit.data.discount, 10000);
  assert.equal(edit.data.remainingAmount, 140000 - 40000 - 60000, "با تغییر اقلام، مانده دوباره مشتق می‌شود");
  assert.equal((await a("POST", "/api/payments", { id: "pu", invoiceId: "ghost-inv", amount: 5 })).json.error.code, "unknown_reference", "پرداخت یتیم ساخته نمی‌شود");
  assert.equal((await a("POST", "/api/payments", { id: "pm", invoiceId: "inv1", customerId: "other", amount: 5 })).status, 422);
  const manual = await a("POST", "/api/invoices", { id: "inv-no-items", number: "x", date: "2026-10-30" }); assert.equal(manual.status, 422, "فاکتور بی‌قلم و بی‌مبلغ رد می‌شود");
});

test("اعتبارسنجی: مبلغ منفی/اعشاری/متنی، تاریخ بد، شناسهٔ خطرناک، پرداخت صفر، نوع اشتباه", async () => {
  const bad = async (path, body, code = "validation_error") => { const r = await a("POST", path, body); assert.equal(r.status, 422, `${path} ${JSON.stringify(body)} → ${r.status}`); assert.equal(r.json.error.code, code); };
  await bad("/api/invoices", { id: "i-neg", totalAmount: -5 });
  await bad("/api/invoices", { id: "i-dec", totalAmount: 10.5 });
  await bad("/api/invoices", { id: "i-str", totalAmount: "abc" });
  await bad("/api/invoices", { id: "i-date", date: "۱۴۰۵/۰۸/۰۹" });
  await bad("/api/invoices", { id: "i-items", items: "not-array" });
  await bad("/api/invoices", { id: "bad id with space" });
  await bad("/api/invoices", { id: "i/../x" });
  await bad("/api/invoices", {});
  await bad("/api/payments", { id: "pz", invoiceId: "inv1", amount: 0 });
  await bad("/api/transactions", { id: "t-x", type: "gift", amount: 5 });
  await bad("/api/transactions", { id: "t-y", type: "income" });
  await bad("/api/customers", { id: "cx", firstName: "x".repeat(500) });
  assert.equal((await a("POST", "/api/customers", [1, 2])).status, 400);
});

test("حرکت انبار: موجودی فقط با حرکت عوض می‌شود، idempotent با کلید، PATCH موجودی را عوض نمی‌کند، کالای ناموجود ۴۰۴", async () => {
  await a("POST", "/api/inventory", { id: "paper", name: "کاغذ A4", qty: 100, minQty: 20, unit: "برگ", unitCost: 500, salePrice: 1000 });
  const mv = { inventoryItemId: "paper", quantity: -30, kind: "adjustment", note: "فروش" };
  const r1 = await a("POST", "/api/inventory-movements", mv, { headers: { "idempotency-key": "inventory-movement-m1" } });
  const r2 = await a("POST", "/api/inventory-movements", mv, { headers: { "idempotency-key": "inventory-movement-m1" } });
  assert.equal(r1.status, 201); assert.equal(r2.status, 201); assert.equal(r2.headers["idempotency-replayed"], "true"); assert.equal(r1.data.id, r2.data.id);
  assert.equal((await a("GET", "/api/inventory/paper")).data.qty, 70, "دو بار ارسال، یک بار کسر");
  await a("PATCH", "/api/inventory/paper", { qty: 5000, name: "کاغذ A4 ممتاز" });
  const g = (await a("GET", "/api/inventory/paper")).data; assert.equal(g.qty, 70); assert.equal(g.name, "کاغذ A4 ممتاز");
  assert.equal((await a("POST", "/api/inventory-movements", { inventoryItemId: "ghost", quantity: 1 })).status, 404);
  assert.equal((await a("DELETE", "/api/inventory-movements/x")).status, 404, "حرکت انبار حذف‌ناپذیر است");
  await a("POST", "/api/inventory", { id: "toner", name: "تونر", qty: 3, minQty: 5 });
});

test("Idempotency-Key: بدنهٔ متفاوت با کلید یکسان ۴۲۲؛ ارسال هم‌زمان فقط یک رکورد می‌سازد", async () => {
  const k = { "idempotency-key": "customer-race" };
  const rs = await Promise.all(Array.from({ length: 8 }, () => a("POST", "/api/customers", { firstName: "هم‌زمان" }, { headers: k })));   // بدون id → خطا؟ نه: id لازم است
  assert.ok(rs.every((r) => r.status === 422), "بدون شناسه رد می‌شود");
  const body = { id: "race1", firstName: "هم‌زمان" };
  const rs2 = await Promise.all(Array.from({ length: 8 }, () => a("POST", "/api/customers", body, { headers: { "idempotency-key": "customer-race1" } })));
  assert.ok(rs2.every((r) => r.status === 201 || r.status === 200)); assert.equal((await a("GET", "/api/customers?q=هم‌زمان")).json.meta.total, 1);
  const diff = await a("POST", "/api/customers", { id: "race2", firstName: "دیگر" }, { headers: { "idempotency-key": "customer-race1" } });
  assert.equal(diff.status, 422); assert.equal(diff.json.error.code, "idempotency_key_reuse");
});

test("RBAC: کارمند فروش می‌زند ولی ابطال فاکتور، حذف مشتری، کاربران و گزارش ممنوع؛ دعوت کاربر با رمز موقت و اجبار تغییر", async () => {
  const inv = await a("POST", "/api/users/invite", { email: "staff@cafe.test", firstName: "رضا", lastName: "م", role: "staff" });
  assert.equal(inv.status, 201); assert.ok(inv.data.temporaryPassword.length >= 10); assert.equal(inv.data.user.role, "staff");
  const s = client(ctx.app);
  const lr = await s.post("/api/auth/login", { email: "staff@cafe.test", password: inv.data.temporaryPassword }); assert.equal(lr.status, 200); assert.equal(lr.data.user.mustChangePassword, true);
  const sb = lr.data.accessToken, sa = (m, u, body) => s.call(m, u, { body, bearer: sb });
  assert.equal((await sa("GET", "/api/customers")).json.error.code, "password_change_required");
  const ch = await sa("POST", "/api/auth/password", { currentPassword: inv.data.temporaryPassword, newPassword: "یک-رمز-تازه-۹۸۷۶" }); assert.equal(ch.status, 200);
  const tok = ch.data.accessToken, st = (m, u, body) => s.call(m, u, { body, bearer: tok });
  assert.equal((await st("POST", "/api/customers", { id: "by-staff", firstName: "x" })).status, 201);
  assert.equal((await st("POST", "/api/invoices", { id: "s-inv", number: "5", items: [{ description: "x", quantity: 1, unitPrice: 1000 }], totalAmount: 5, date: "2026-10-30" })).status, 201);
  const v = await st("PATCH", "/api/invoices/s-inv", { status: "void" }); assert.equal(v.status, 403);
  assert.equal((await st("POST", "/api/invoices/s-inv/void", { reason: "تلاش کارمند" })).status, 403, "ابطال فقط مدیر");
  assert.equal((await st("GET", "/api/invoices/s-inv")).data.totalAmount, 1000, "کارمند مبلغ را از اقلام می‌گیرد، نه از totalAmount کلاینت");
  assert.equal((await st("DELETE", "/api/customers/by-staff")).status, 403);
  assert.equal((await st("GET", "/api/users")).status, 403);
  assert.equal((await st("GET", "/api/reports/summary")).status, 403);
  assert.equal((await st("POST", "/api/accounts/x/adjust", { amount: 1, reason: "abc" })).status, 403);
  assert.equal((await st("POST", "/api/integrity/rebuild", {})).status, 403);
  assert.equal((await st("GET", "/api/admin/cafes")).status, 403);
  assert.equal((await a("PATCH", "/api/invoices/s-inv", { status: "void", voidReason: "اشتباه" })).data.status, "void", "مدیر می‌تواند باطل کند");
  const me = await a("GET", "/api/users"); assert.ok(me.data.length >= 2);
  assert.equal((await a("PATCH", `/api/users/${inv.data.user.id}`, { isActive: false })).data.id, inv.data.user.id);
  assert.equal((await s.call("GET", "/api/customers", { bearer: tok })).status, 401, "کاربر غیرفعال فوراً از کار می‌افتد");
});

test("رمز عبور: ضعیف رد؛ تغییر رمز همهٔ نشست‌های دیگر را می‌بندد؛ بازیابی با کد ۸رقمی (یک‌بارمصرف، حداکثر ۵ تلاش)", async () => {
  const weak = client(ctx.app);
  assert.equal((await weak.post("/api/auth/register", { email: "w@cafe.test", password: "12345678" })).status, 422);
  assert.equal((await weak.post("/api/auth/register", { email: "w@cafe.test", password: "short" })).status, 422);
  assert.equal((await weak.post("/api/auth/register", { email: "a@cafe.test", password: PW })).status, 409);
  const sent = []; ctx.app.mailer.send = async (m) => { sent.push(m); };
  const f = client(ctx.app);
  assert.equal((await f.post("/api/auth/forgot-password", { email: "nobody@x.test" })).status, 202);
  assert.equal(sent.length, 0, "برای ایمیل ناموجود چیزی ارسال نمی‌شود ولی پاسخ یکسان است");
  assert.equal((await f.post("/api/auth/forgot-password", { email: "b@cafe.test" })).status, 202);
  const code = sent[0].text.match(/\d{8}/)[0];
  for (let i = 0; i < 5; i++) assert.equal((await f.post("/api/auth/reset-password", { email: "b@cafe.test", code: "00000000", newPassword: "یک-رمز-تازه-۱۱۱۱" })).status, 400);
  assert.equal((await f.post("/api/auth/reset-password", { email: "b@cafe.test", code, newPassword: "یک-رمز-تازه-۱۱۱۱" })).status, 400, "پس از ۵ تلاش اشتباه حتی کد درست باطل است");
  await f.post("/api/auth/forgot-password", { email: "b@cafe.test" });
  const code2 = sent[1].text.match(/\d{8}/)[0];
  assert.equal((await f.post("/api/auth/reset-password", { email: "b@cafe.test", code: code2, newPassword: "یک-رمز-تازه-۱۱۱۱" })).status, 204);
  assert.equal((await f.post("/api/auth/reset-password", { email: "b@cafe.test", code: code2, newPassword: "یک-رمز-تازه-۲۲۲۲" })).status, 400, "کد یک‌بارمصرف است");
  assert.equal((await b("GET", "/api/customers")).status, 200, "توکن دسترسی کوتاه‌عمر تا انقضا معتبر است");
  assert.equal((await client(ctx.app).post("/api/auth/login", { email: "b@cafe.test", password: "یک-رمز-تازه-۱۱۱۱" })).status, 200);
});

test("اطلاعیه و تیکت: چرخهٔ کامل بین پنل مرکزی و کافی‌نت (هدف‌گذاری، انقضا، idempotent، پاسخ ادمین، بسته‌شدن، جداسازی)", async () => {
  const A_id = A.user.branchId, B_id = B.user.branchId;
  assert.equal((await adm("POST", "/api/admin/announcements", { title: "همگانی", body: "x", severity: "critical", pinned: true })).status, 201);
  await adm("POST", "/api/admin/announcements", { title: "فقط الف", body: "y", targetCafes: [A_id] });
  await adm("POST", "/api/admin/announcements", { title: "منقضی", expiresAt: "2020-01-01T00:00:00Z" });
  assert.equal((await adm("POST", "/api/admin/announcements", { title: "پیوند بد", link: "javascript:alert(1)" })).status, 422);
  const la = (await a("GET", "/api/announcements")).data.map((x) => x.title), lb = (await b("GET", "/api/announcements")).data.map((x) => x.title);
  assert.deepEqual(la, ["همگانی", "فقط الف"]); assert.deepEqual(lb, ["همگانی"]);
  assert.equal((await a("GET", "/api/announcements")).data[0].severity, "critical");

  const t = { id: "tk_1", subject: "چاپگر کار نمی‌کند", category: "technical", priority: "high", createdAt: "2026-10-31T10:00:00Z", message: { id: "m_1", body: "از صبح", author: "علی", createdAt: "2026-10-31T10:00:00Z" } };
  const k = { "idempotency-key": "tickets-tk_1" };
  const c1 = await a("POST", "/api/tickets", t, { headers: k }); const c2 = await a("POST", "/api/tickets", t, { headers: k });
  assert.equal(c1.status, 201); assert.equal(c2.status, 201); assert.equal(c1.data.number, c2.data.number); assert.equal(c1.data.messages.length, 1);
  assert.equal((await a("POST", "/api/tickets", t)).status, 200, "ساخت تکراری بدون کلید هم همان تیکت");
  assert.equal((await a("GET", "/api/tickets")).data.length, 1); assert.equal((await b("GET", "/api/tickets")).data.length, 0);
  assert.equal((await b("POST", "/api/tickets/tk_1/messages", { id: "x", body: "نفوذ" })).status, 404);

  const m1 = { id: "m_2", body: "توضیح بیشتر", createdAt: "2026-10-31T10:05:00Z" };
  assert.equal((await a("POST", "/api/tickets/tk_1/messages", m1, { headers: { "idempotency-key": "ticket-message-m_2" } })).status, 201);
  assert.equal((await a("POST", "/api/tickets/tk_1/messages", m1)).status, 200, "پیام تکراری دوباره ثبت نمی‌شود");
  assert.equal((await a("GET", "/api/tickets")).data[0].messages.length, 2);

  const list = await adm("GET", "/api/admin/tickets?status=open"); assert.equal(list.data.length, 1); assert.equal(list.data[0].cafeName, "کافی‌نت الف");
  const rep = await adm("POST", `/api/admin/tickets/${A_id}/tk_1/reply`, { body: "غلتک را تمیز کنید", author: "پشتیبانی" }); assert.equal(rep.status, 201); assert.equal(rep.data.from, "admin");
  const after = (await a("GET", "/api/tickets")).data[0]; assert.equal(after.status, "answered"); assert.equal(after.messages.at(-1).from, "admin");
  await a("POST", "/api/tickets/tk_1/messages", { id: "m_3", body: "ممنون، درست شد" });
  assert.equal((await a("GET", "/api/tickets")).data[0].status, "open", "پاسخ کافی‌نت تیکت را دوباره باز می‌کند");
  assert.equal((await a("PATCH", "/api/tickets/tk_1", { status: "closed" })).data.status, "closed");
  assert.equal((await a("POST", "/api/tickets/tk_1/messages", { id: "m_4", body: "بعد از بسته" })).json.error.code, "ticket_closed");
  assert.equal((await a("PATCH", "/api/tickets/tk_1", { status: "hacked" })).status, 422);
});

test("پنل مرکزی: ساخت کافی‌نت با مالک و رمز موقت، تعلیق (قطع فوری دسترسی ولی تیکت مجاز)، فعال‌سازی دوباره؛ سطح‌دسترسی", async () => {
  const mk = await adm("POST", "/api/admin/cafes", { name: "کافی‌نت جدید", city: "تهران", ownerEmail: "owner@new.test", ownerFirstName: "م" });
  assert.equal(mk.status, 201); assert.ok(mk.data.temporaryPassword);
  const o = client(ctx.app);
  const lr = await o.post("/api/auth/login", { email: "owner@new.test", password: mk.data.temporaryPassword }); assert.equal(lr.data.user.mustChangePassword, true);
  const ch = await o.call("POST", "/api/auth/password", { body: { currentPassword: mk.data.temporaryPassword, newPassword: "رمز-مالک-تازه-۴۵۶" }, bearer: lr.data.accessToken });
  const tok = ch.data.accessToken, ow = (m, u, body) => o.call(m, u, { body, bearer: tok });
  assert.equal((await ow("GET", "/api/customers")).status, 200);
  assert.equal((await adm("PATCH", `/api/admin/cafes/${mk.data.id}`, { status: "suspended" })).status, 200);
  const susp = await ow("GET", "/api/customers"); assert.equal(susp.status, 403); assert.equal(susp.json.error.code, "cafe_suspended");
  assert.equal((await ow("POST", "/api/tickets", { id: "tk_s", subject: "چرا تعلیق شدم", message: { body: "لطفاً بررسی کنید" } })).status, 201, "تعلیق‌شده می‌تواند تیکت بزند");
  assert.equal((await client(ctx.app).post("/api/auth/login", { email: "owner@new.test", password: "رمز-مالک-تازه-۴۵۶" })).json.error.code, "cafe_suspended");
  await adm("PATCH", `/api/admin/cafes/${mk.data.id}`, { status: "active" });
  assert.equal((await ow("GET", "/api/customers")).status, 200);
  assert.equal((await adm("POST", "/api/admin/cafes", { name: "تکراری", ownerEmail: "owner@new.test" })).status, 409);
  const ov = await adm("GET", "/api/admin/overview"); assert.ok(ov.data.cafes >= 3 && ov.data.openTickets >= 1);
  assert.equal((await a("GET", "/api/admin/overview")).status, 403);
  assert.equal((await client(ctx.app).get("/api/admin/overview")).status, 401);
  assert.equal((await admin.call("GET", "/api/customers", { bearer: admin.token })).status, 403, "مدیر مرکزی به دادهٔ مالی کافی‌نت‌ها دسترسی ندارد");
});

test("گزارش خلاصه از SQL: درآمد، وصولی، مطالبات، هزینه، مشتریان برتر، کم‌موجودی، شمارهٔ تکراری", async () => {
  const c = client(ctx.app), r0 = await c.post("/api/auth/register", { email: "rep@cafe.test", password: PW, shopName: "گزارش" }), tk = r0.data.accessToken;
  const x = (m, u, body) => c.call(m, u, { body, bearer: tk });
  await x("POST", "/api/customers", { id: "k1", firstName: "الف" });
  await x("POST", "/api/invoices", { id: "r1", number: "7", customerId: "k1", customerName: "الف", date: "2026-10-20", totalAmount: 300000 });
  await x("POST", "/api/invoices", { id: "r2", number: "7", customerId: "k1", customerName: "الف", date: "2026-10-21", totalAmount: 200000 });
  await x("POST", "/api/invoices", { id: "r3", number: "9", customerId: "k1", date: "2026-10-22", totalAmount: 999999 });
  await x("PATCH", "/api/invoices/r3", { status: "void" });
  await x("POST", "/api/payments", { id: "q1", invoiceId: "r1", amount: 300000, date: "2026-10-20" });
  await x("POST", "/api/transactions", { id: "tx1", type: "income", amount: 50000, date: "2026-10-22" });
  await x("POST", "/api/transactions", { id: "tx2", type: "expense", amount: 80000, date: "2026-10-22" });
  await x("POST", "/api/expenses", { id: "ex1", amount: 20000, date: "2026-10-23" });
  await x("POST", "/api/inventory", { id: "low", name: "کم", qty: 1, minQty: 5 });
  const s = (await x("GET", "/api/reports/summary?from=2026-10-01&to=2026-10-31")).data;
  assert.equal(s.revenue, 500000); assert.equal(s.invoiceCount, 2); assert.equal(s.collected, 300000); assert.equal(s.receivable, 200000);
  assert.equal(s.income, 50000); assert.equal(s.expense, 100000); assert.equal(s.netCash, 300000 + 50000 - 100000);
  assert.equal(s.topCustomers[0].total, 500000); assert.equal(s.lowStock[0].id, "low"); assert.deepEqual(s.duplicateInvoiceNumbers.map((d) => d.number), ["7"]);
  assert.equal(s.daily.length, 2);
  assert.equal((await x("GET", "/api/reports/summary?from=bad")).status, 422);
});

test("لاگ حسابرسی سرور: زنجیرهٔ هش سالم؛ دستکاری مستقیم پایگاه‌داده لو می‌رود", async () => {
  const cafeId = A.user.branchId;
  const ok = await verifyAuditChain(ctx.pool, cafeId); assert.equal(ok.ok, true); assert.ok(ok.count >= 3);
  assert.equal((await a("GET", "/api/audit/verify")).data.ok, true);
  assert.ok((await a("GET", "/api/audit?limit=5")).data.some((e) => e.action.includes("invoice.void") || e.action.includes("delete")));
  // از 1.75 تریگر 003 دستکاری را «رد» می‌کند؛ برای آزمودن کشف دستکاری، مالک پایگاه‌داده تریگر را موقتاً غیرفعال می‌کند (سناریوی ابرکاربر)
  await assert.rejects(ctx.pool.query("UPDATE audit_log SET details = '{\"x\":1}' WHERE cafe_id=$1", [cafeId]), /audit_log_immutable/);
  await ctx.pool.query("ALTER TABLE audit_log DISABLE TRIGGER audit_log_immutable_trg");
  await ctx.pool.query("UPDATE audit_log SET details = '{\"x\":1}' WHERE id = (SELECT min(id) FROM audit_log WHERE cafe_id=$1)", [cafeId]);
  await ctx.pool.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_immutable_trg");
  const bad = await verifyAuditChain(ctx.pool, cafeId); assert.equal(bad.ok, false); assert.ok(bad.brokenAt);
});

test("مهاجرت: دوباره‌اجرا بی‌خطر و هیچ مهاجرتی تکرار نمی‌شود", async () => {
  const { migrate } = await import("../src/db.js");
  assert.deepEqual(await migrate(ctx.pool), []);
  assert.equal((await ctx.pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, 14);
});

test("قرارداد با کلاینت واقعی: بدنه‌هایی که mappers برنامه می‌سازد مستقیم پذیرفته می‌شوند و برمی‌گردند", async () => {
  const m = await import("../../src/sync/mappers.js");
  const sale = { id: "s77", invoiceId: "inv77", number: "1077", customerId: "c77", customerName: "نگار حسینی", date: "2026-10-31", time: "14:30", subtotal: 300000, discount: 0, total: 300000, paid: 100000, waived: 0,
    lines: [{ id: "l1", desc: "پرینت رنگی", qty: 3, price: 100000, unit: "برگ", category: "print" }], notes: "تست" };
  await a("POST", "/api/customers", { id: "c77", firstName: "نگار", lastName: "حسینی", phone: "09121110004", address: "", wallet: 0, walletHistory: [], serviceHistory: [], photo: "" });      // کلاینت واقعی ابتدا مشتری را می‌فرستد (dependsOn)
  const inv = await a("POST", "/api/invoices", m.invoiceBody(sale), { headers: { "idempotency-key": "invoice-inv77" } });
  assert.equal(inv.status, 201, JSON.stringify(inv.json)); assert.equal(inv.data.items[0].description, "پرینت رنگی"); assert.equal(inv.data.paidAmount, 0, "paid کلاینت نادیده؛ فقط پرداخت‌ها حساب می‌شوند"); assert.equal(inv.data.remainingAmount, 300000);
  const pay = await a("POST", "/api/payments", m.paymentBody({ id: "pay77", invoiceId: "inv77", customerId: "c77", amount: 100000, method: "cash", date: "2026-10-31" }, sale), { headers: { "idempotency-key": "payment-pay77" } });
  assert.equal(pay.status, 201, JSON.stringify(pay.json)); assert.equal((await a("GET", "/api/invoices/inv77")).data.remainingAmount, 200000);
  const ord = await a("POST", "/api/orders", m.orderBody({ id: "o77", customerId: "c77", customerName: "نگار", title: "ثبت‌نام", amount: 15000000, status: "new", createdAt: "2026-10-31T10:00:00Z", saleId: "s77" }));
  assert.equal(ord.status, 201, JSON.stringify(ord.json)); assert.equal((await a("PATCH", "/api/orders/o77", { status: "done" })).data.status, "done");
  const tx = await a("POST", "/api/transactions", m.transactionBody({ id: "t77", type: "expense", amount: 12000000, date: "2026-10-30", category: "برق", desc: "قبض برق", method: "cash" }));
  assert.equal(tx.status, 201, JSON.stringify(tx.json)); assert.equal(tx.data.description, "قبض برق");
  const inventory = await a("POST", "/api/inventory", { id: "7", cat: "paper", name: "کاغذ A4 معمولی", qty: 400, minQty: 100, unit: "برگ", unitCost: 5000, salePrice: 10000 });
  assert.equal(inventory.status, 201); assert.equal((await a("GET", "/api/inventory/7")).data.qty, 400);
  const ob = await a("POST", "/api/obligations", { id: "ob1", kind: "rent", dir: "pay", title: "اجارهٔ مغازه", party: "مالک", amount: 150000000, dueDate: "2026-11-03", status: "pending", reminders: [3, 1] });
  assert.equal(ob.status, 201); assert.deepEqual(ob.data.reminders, [3, 1]);
  const st = await a("POST", "/api/settings", { id: "shop", name: "کافی‌نت من" }); assert.equal(st.status, 201);
  const fullList = await a("GET", "/api/invoices?limit=1&offset=0"); assert.equal(fullList.json.meta.limit, 1); assert.ok(Array.isArray(fullList.json.data));
});

// ── امنیت شبکه: Trust Proxy / SSL پایگاه‌داده / سیاست آفلاین ─────────────────────────────────────────────────────────────

test("parseTrustProxy: پیش‌فرض تولید ۱ هاپ؛ true دیگر «اعتماد به همه» نیست؛ ورودی نامعتبر/ستاره رد می‌شود", () => {
  assert.deepEqual(parseTrustProxy("", true), { value: 1, problem: null });
  assert.deepEqual(parseTrustProxy("", false), { value: false, problem: null });
  assert.equal(parseTrustProxy("true", true).value, 1);
  assert.equal(parseTrustProxy("false", true).value, false);
  assert.equal(parseTrustProxy("2", true).value, 2);
  assert.deepEqual(parseTrustProxy("10.0.0.0/8, loopback, 2001:db8::/32", true).value, ["10.0.0.0/8", "loopback", "2001:db8::/32"]);
  for (const bad of ["*", "all", "10.0.0.0/33", "abc", "10.0.0.1/8/9", "999.1.1.1"]) assert.ok(parseTrustProxy(bad, true).problem, bad);
  assert.ok(parseTrustProxy("9", true).problem);
});

test("DB_SSL: verify پیش‌فرضِ true؛ no-verify در تولید رد؛ CA خوانده می‌شود؛ فایل ناموجود خطای روشن", () => {
  const base = { DATABASE_URL: "postgres://u:p@db.example.com/x", JWT_SECRET: "x".repeat(48), NODE_ENV: "production" };
  assert.equal(parseDbSsl(""), "off"); assert.equal(parseDbSsl("false"), "off"); assert.equal(parseDbSsl("true"), "verify"); assert.equal(parseDbSsl("require"), "verify"); assert.equal(parseDbSsl("no-verify"), "no-verify"); assert.equal(parseDbSsl("xyz"), "invalid");
  assert.equal(buildPgSsl(loadConfig({ ...base })), undefined);
  assert.deepEqual(buildPgSsl(loadConfig({ ...base, DB_SSL: "true" })), { rejectUnauthorized: true });
  assert.equal(buildPgSsl(loadConfig({ ...base, DB_SSL: "true", DB_SSL_CA: "-----BEGIN CERTIFICATE-----\\nAAA\\n-----END CERTIFICATE-----" })).ca.includes("\nAAA\n"), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ca-")); const f = path.join(dir, "ca.pem"); fs.writeFileSync(f, "PEMDATA");
  const withFile = buildPgSsl(loadConfig({ ...base, DB_SSL: "true", DB_SSL_CA_FILE: f }));
  assert.equal(withFile.ca, "PEMDATA"); assert.equal(withFile.rejectUnauthorized, true);
  assert.throws(() => buildPgSsl(loadConfig({ ...base, DB_SSL: "true", DB_SSL_CA_FILE: path.join(dir, "nope.pem") })), /DB_SSL_CA_FILE/);
  // no-verify: در تولید خطای پیکربندی، با تأیید صریح مجاز
  assert.ok(loadConfig({ ...base, DB_SSL: "no-verify" }).problems.some((p) => /no-verify/.test(p)));
  assert.equal(loadConfig({ ...base, DB_SSL: "no-verify", DB_SSL_ALLOW_INSECURE: "true" }).problems.some((p) => /no-verify/.test(p)), false);
  assert.equal(buildPgSsl(loadConfig({ ...base, DB_SSL: "no-verify", DB_SSL_ALLOW_INSECURE: "true" })).rejectUnauthorized, false);
  assert.ok(loadConfig({ ...base, DB_SSL: "maybe" }).problems.some((p) => /DB_SSL/.test(p)));
  // هشدار برای میزبان عمومی بدون TLS؛ شبکهٔ داخلی بی‌هشدار
  assert.equal(loadConfig({ ...base }).warnings.some((w) => /بدون TLS/.test(w)), true);
  assert.equal(loadConfig({ ...base, DATABASE_URL: "postgres://u:p@db:5432/x" }).warnings.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Trust Proxy واقعی: IP از راست‌ترین آدرس نامعتبر خوانده می‌شود؛ XFF جعلی نه سهمیهٔ ورود را دور می‌زند نه لاگ حسابرسی را آلوده می‌کند", async () => {
  const { app, pool } = await makeApp(db, { env: { TRUST_PROXY: "1", AUTH_RATE_LIMIT_MAX: "4" } });
  try {
    const email = "ratelimit@example.com";
    const call = (spoof) => app.inject({ method: "POST", url: "/api/auth/login", remoteAddress: "172.20.0.5", headers: { "content-type": "application/json", "x-forwarded-for": `${spoof}, 203.0.113.9` }, payload: { email, password: "bad-pass-1" } });
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await call(`6.6.6.${i}`)).statusCode);       // هر بار «IP جعلی» تازه
    assert.ok(codes.includes(429), `باید ۴۲۹ برسد: ${codes}`);
    // IP ثبت‌شده در لاگ حسابرسی هم باید «راست‌ترین آدرس نامعتبر» باشد، نه مقدار جعلیِ سمت چپ
    const ok = client(app);
    const rr = await ok.post("/api/auth/register", { email: "xff-ok@cafe.test", password: PW, firstName: "علی", lastName: "ر", phone: "09121234567", shopName: "xff" }, { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.77" } });
    assert.equal(rr.status, 201);
    const ips = (await pool.query("SELECT ip FROM audit_log WHERE action='auth.register' ORDER BY id DESC LIMIT 1")).rows.map((r) => r.ip);
    assert.deepEqual(ips, ["203.0.113.77"], `IP ثبت‌شده باید راست‌ترین آدرس باشد، نه مقدار جعلی سمت چپ: ${ips}`);
    // بدون Trust Proxy: IP همان اتصال TCP است و XFF اصلاً خوانده نمی‌شود
    const off = await makeApp(db, { env: { TRUST_PROXY: "false" } });
    try {
      const rq = await off.app.inject({ method: "POST", url: "/api/auth/login", remoteAddress: "198.51.100.7", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" }, payload: { email: "a@cafe.test", password: PW } });
      assert.equal(rq.statusCode, 200);
      const ip = (await off.pool.query("SELECT ip FROM audit_log WHERE action='auth.login' ORDER BY id DESC LIMIT 1")).rows[0].ip;
      assert.equal(ip, "198.51.100.7");
    } finally { await off.app.close(); await off.pool.end(); }
  } finally { await app.close(); await pool.end(); }
});

test("سیاست آفلاین: سرور مدت مجاز را برای هر نقش می‌دهد (مالک ۲۴ ساعت، کارمند ۸ ساعت)؛ قابل تنظیم با env", async () => {
  const { app, pool } = await makeApp(db, { env: { OFFLINE_SESSION_MAX_AGE_OWNER_SEC: "7200", OFFLINE_SESSION_MAX_AGE_STAFF_SEC: "600" } });
  try {
    const o = client(app);
    const r = await o.post("/api/auth/register", { email: "pol-owner@cafe.test", password: PW, firstName: "علی", lastName: "ر", phone: "09121234567", shopName: "پولیسی" });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.data.user.offlinePolicy.maxAgeSec, 7200);
    const me = await o.get("/api/auth/me", { bearer: r.data.accessToken });
    assert.equal(me.data.offlinePolicy.maxAgeSec, 7200); assert.equal(me.data.offlinePolicy.sensitiveOps, "online-only");
    const inv = await o.post("/api/users/invite", { email: "pol-staff@cafe.test", firstName: "رضا", lastName: "م", role: "staff" }, { bearer: r.data.accessToken });
    assert.equal(inv.status, 201, JSON.stringify(inv.json));
    const s = client(app);
    const lr = await s.post("/api/auth/login", { email: "pol-staff@cafe.test", password: inv.data.temporaryPassword });
    assert.equal(lr.data.user.offlinePolicy.maxAgeSec, 600);
    // نقش‌های دیگر: مدیر هم سخت‌گیرانه مثل کارمند؛ پیش‌فرض‌ها ۲۴/۸ ساعت
    const d = loadConfig({ DATABASE_URL: "postgres://u:p@db/x", JWT_SECRET: "x".repeat(48) });
    assert.equal(d.offlineMaxAgeOwnerSec, 86400); assert.equal(d.offlineMaxAgeStaffSec, 28800);
  } finally { await app.close(); await pool.end(); }
});

test("برگشت پرداخت: پیش‌فرض کارمند هم می‌تواند؛ با PAYMENT_VOID_MIN_ROLE=manager فقط مالک/مدیر", async () => {
  for (const [i, [env, staffStatus]] of [[{}, 201], [{ PAYMENT_VOID_MIN_ROLE: "manager" }, 403]].entries()) {
    const { app, pool } = await makeApp(db, { env });
    try {
      const o = client(app);
      const r = await o.post("/api/auth/register", { email: `pv-owner${i}@cafe.test`, password: PW, firstName: "علی", lastName: "ر", phone: "09121234567", shopName: "برگشت" });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const ob = r.data.accessToken, oa = (m, u, body) => o.call(m, u, { body, bearer: ob });
      const inv = await oa("POST", "/api/users/invite", { email: `pv-staff${i}@cafe.test`, firstName: "رضا", lastName: "م", role: "staff" });
      const s = client(app);
      const lr = await s.post("/api/auth/login", { email: `pv-staff${i}@cafe.test`, password: inv.data.temporaryPassword });
      const ch = await s.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: "یک-رمز-تازه-۹۸۷۶" }, bearer: lr.data.accessToken });
      const sa = (m, u, body) => s.call(m, u, { body, bearer: ch.data.accessToken });
      assert.equal((await oa("POST", "/api/invoices", { id: "pv-inv", number: "1", items: [{ description: "x", quantity: 1, unitPrice: 1000 }], date: "2026-10-30" })).status, 201);
      assert.equal((await oa("POST", "/api/payments", { id: "pv-p1", invoiceId: "pv-inv", amount: 500, method: "cash", date: "2026-10-30" })).status, 201);
      assert.equal((await sa("POST", "/api/payments/pv-p1/void", { reason: "اشتباه در ثبت" })).status, staffStatus);
      if (staffStatus === 403) assert.equal((await oa("POST", "/api/payments/pv-p1/void", { reason: "اشتباه در ثبت" })).status, 201, "مالک همیشه می‌تواند");
    } finally { await app.close(); await pool.end(); }
  }
});

test("اخبار کافی‌نت: /api/news نیاز به ورود دارد و فقط میزبان‌های مجاز را می‌گیرد (بدون شبکه)", async () => {
  assert.equal((await client(ctx.app).get("/api/news?url=" + encodeURIComponent("https://onlinecofe.ir/feed/"))).status, 401);
  const c = client(ctx.app); const l = await c.post("/api/auth/login", { email: "a@cafe.test", password: PW }); assert.equal(l.status, 200);
  const bad = await c.get("/api/news?url=" + encodeURIComponent("https://evil.example/feed"), { bearer: l.data.accessToken });
  assert.equal(bad.status, 403); assert.equal(bad.json.error.code, "host_not_allowed");
  assert.equal((await c.get("/api/news?url=" + encodeURIComponent("http://onlinecofe.ir/feed"), { bearer: l.data.accessToken })).status, 400);
  assert.equal((await c.get("/api/news", { bearer: l.data.accessToken })).status, 400);
});
