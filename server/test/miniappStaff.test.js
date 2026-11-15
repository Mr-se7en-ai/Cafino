// مینی‌اپ تلگرام — بخش کافی‌نت و درخواست مشتری (1.81). PostgreSQL واقعی + Bot API جعلی. با تلگرام واقعی آزموده نشده است.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { startDb, stopDb, makeApp, client } from "./helpers.js";

const PW = "رمز-خیلی-قوی-۱۲۳", TOKEN = "444444444:AAMiniApp_test_token_for_tests_00002";
let ctx, fake, O, S, O2, cafeA, cafeB, codeA;
const sent = [];
const sign = (fields) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(fields)) p.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const check = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join("\n"); p.set("hash", crypto.createHmac("sha256", crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest()).update(check).digest("hex")); return p.toString(); };
const initFor = (id) => sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: { id, first_name: "کاربر", last_name: String(id), username: "u" + id, language_code: "fa" } });

before(async () => {
  const url = await startDb();
  fake = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { const m = /^\/bot[^/]+\/(\w+)$/.exec(req.url), body = b ? JSON.parse(b) : {}; res.writeHead(200, { "content-type": "application/json" });
    if (m && m[1] === "sendMessage") sent.push(body);
    res.end(JSON.stringify(m && m[1] === "getMe" ? { ok: true, result: { id: 444444444, is_bot: true, username: "cafino_mini_bot" } } : m && m[1] === "getUpdates" ? { ok: true, result: [] } : { ok: true, result: { message_id: 1 } })); }); });
  await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
  ctx = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", BOTS_ENABLED: "false", TELEGRAM_API_BASE: `http://127.0.0.1:${fake.address().port}`, MINIAPP_BOT_TOKEN: TOKEN, MINIAPP_URL: "https://cafino.example.ir/m", MINIAPP_AUTH_RATE_PER_MIN: "5000" } });
  const reg = async (email, shop) => { const c = client(ctx.app), r = await c.post("/api/auth/register", { email, password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: shop }); return (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }); };
  O = await reg("own@staff.test", "کافه الف"); O2 = await reg("own2@staff.test", "کافه ب");
  const inv = await O("POST", "/api/users/invite", { email: "emp@staff.test", role: "staff", firstName: "کارمند", lastName: "یک" });
  const cc = client(ctx.app), lg = await cc.post("/api/auth/login", { email: "emp@staff.test", password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email: "emp@staff.test", password: PW }); S = (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
  cafeA = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه الف'")).rows[0].id; cafeB = (await ctx.pool.query("SELECT id FROM cafes WHERE name='کافه ب'")).rows[0].id;
  await O("GET", "/api/miniapp/info"); await O2("GET", "/api/miniapp/info");
  codeA = (await ctx.pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeA])).rows[0].code;
  await ctx.app.miniappBot.init();
});
after(async () => { await ctx.app.close(); await ctx.pool.end(); await new Promise((ok) => fake.close(ok)); await stopDb(); });
const auth = async (id, cafe) => (await ctx.app.inject({ method: "POST", url: "/api/miniapp/auth", payload: { initData: initFor(id), ...(cafe ? { cafe } : {}) } })).json().data;
const call = async (token, method, path, body) => { const r = await ctx.app.inject({ method, url: `/api/miniapp/${path}`, headers: { authorization: `Bearer ${token}` }, ...(body ? { payload: body } : {}) }); return { status: r.statusCode, data: r.json().data, error: r.json().error }; };
const mkCode = async (api) => (await api("POST", "/api/miniapp/staff-codes")).data.code;
const verified = (id, phone) => ctx.pool.query("UPDATE telegram_users SET phone=$2, phone_verified_at=now(), chat_id=$1 WHERE telegram_id=$1", [id, phone]);

test("کد اتصال: یک‌بارمصرف، فقط هش در DB، کد غلط/منقضی/دوباره رد می‌شود", async () => {
  const t = (await auth(7001)).token;
  assert.equal((await call(t, "POST", "staff/link", { code: "ABCD-2345" })).error.code, "bad_code");
  assert.equal((await call(t, "POST", "staff/link", { code: "x" })).status, 422);
  const code = await mkCode(S);
  const stored = (await ctx.pool.query("SELECT code_hash FROM miniapp_staff_codes")).rows.map((r) => r.code_hash);
  assert.ok(!stored.some((h) => h.includes(code.replace("-", ""))), "کد خام ذخیره نمی‌شود");
  const ok1 = await call(t, "POST", "staff/link", { code: code.toLowerCase() });
  assert.equal(ok1.status, 200); assert.equal(ok1.data.staff.role, "staff"); assert.equal(ok1.data.staff.cafeName, "کافه الف");
  const t2 = (await auth(7002)).token;
  assert.equal((await call(t2, "POST", "staff/link", { code })).error.code, "bad_code", "کد مصرف‌شده دوباره کار نمی‌کند");
  const c2 = await mkCode(S); await ctx.pool.query("UPDATE miniapp_staff_codes SET expires_at=now()-interval '1 second' WHERE used_at IS NULL");
  assert.equal((await call(t2, "POST", "staff/link", { code: c2 })).error.code, "bad_code", "کد منقضی");
  const c3 = await mkCode(S), c4 = await mkCode(S);
  assert.equal((await call(t2, "POST", "staff/link", { code: c3 })).error.code, "bad_code", "کد جدید کد قبلی را باطل می‌کند");
  assert.equal((await call(t2, "POST", "staff/link", { code: c4 })).status, 200);    // حساب دوم جای حساب قبلی همان کاربر می‌نشیند
  assert.equal((await ctx.pool.query("SELECT count(*)::int n FROM telegram_staff_links WHERE user_id=(SELECT id FROM users WHERE email='emp@staff.test')")).rows[0].n, 1);
  const tOld = await call(t, "GET", "staff/me"); assert.equal(tOld.status, 403); assert.equal(tOld.error.code, "not_staff");
});

test("auth: حساب کافی‌نتی در پاسخ staff دارد؛ مشتری عادی ندارد؛ بدون اتصال همهٔ مسیرهای staff بسته است", async () => {
  assert.equal((await auth(7002, codeA)).staff.roleLabel, "کارمند");
  assert.equal((await auth(7003, codeA)).staff, null);
  const t = (await auth(7003, codeA)).token;
  for (const p of ["staff/home", "staff/orders", "staff/uploads", "staff/requests", "staff/me"]) assert.equal((await call(t, "GET", p)).status, 403, p);
  assert.equal((await call(t, "POST", "staff/orders/x/status", { status: "new" })).status, 403);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/miniapp/staff/home" })).statusCode, 401);
});

test("تغییر وضعیت سفارش: صف دستور؛ برنامه می‌بیند، اعمال و تأیید می‌کند؛ کافی‌نت دیگر دسترسی ندارد", async () => {
  await ctx.pool.query("INSERT INTO customers (cafe_id,id,first_name,last_name,phone) VALUES ($1,'c1','علی','رضایی','09123334455')", [cafeA]);
  await ctx.pool.query("INSERT INTO orders (cafe_id,id,customer_id,title,status,amount) VALUES ($1,'o1','c1','چاپ بنر','new',900000),($1,'o2','c1','اسکن','delivered',100000),($2,'ob','x','سفارش کافه ب','new',5)", [cafeA, cafeB]);
  const t = (await auth(7002)).token;
  const list = await call(t, "GET", "staff/orders?filter=open");
  assert.deepEqual(list.data.items.map((x) => x.id), ["o1"]); assert.equal(list.data.items[0].customer, "علی رضایی");
  assert.equal(list.data.items[0].amount, null, "کارمند بدون مجوز مالی مبلغ نمی‌بیند");
  assert.equal((await call(t, "GET", "staff/orders?filter=done")).data.items[0].id, "o2");
  assert.equal((await call(t, "POST", "staff/orders/ob/status", { status: "completed" })).status, 404, "سفارش کافی‌نت دیگر");
  assert.equal((await call(t, "POST", "staff/orders/o1/status", { status: "bogus" })).status, 422);
  const r = await call(t, "POST", "staff/orders/o1/status", { status: "inprogress" }); assert.equal(r.data.pending.status, "inprogress");
  await call(t, "POST", "staff/orders/o1/status", { status: "completed" });       // دستور جدید جایگزین دستور قبلی می‌شود
  const acts = (await O("GET", "/api/miniapp/order-actions")).data.items; assert.equal(acts.length, 1); assert.equal(acts[0].status, "completed"); assert.equal(acts[0].by, "کارمند یک");
  assert.equal((await O2("GET", "/api/miniapp/order-actions")).data.items.length, 0, "کافی‌نت دیگر صف را نمی‌بیند");
  assert.equal((await call(t, "GET", "staff/orders?filter=open")).data.items[0].pending.status, "completed");
  assert.equal((await ctx.pool.query("SELECT status FROM orders WHERE cafe_id=$1 AND id='o1'", [cafeA])).rows[0].status, "new", "سرور خودسرانه سفارش را عوض نمی‌کند (برنامه مرجع است)");
  const ack = await O("POST", "/api/miniapp/order-actions/ack", { applied: [acts[0].id] }); assert.equal(ack.data.applied, 1);
  assert.equal((await O("GET", "/api/miniapp/order-actions")).data.items.length, 0);
  assert.equal((await O2("POST", "/api/miniapp/order-actions/ack", { applied: [acts[0].id] })).data.applied, 0);
  await ctx.pool.query("UPDATE orders SET status='completed' WHERE cafe_id=$1 AND id='o1'", [cafeA]);      // برنامه وضعیت را همگام کرد
  await call(t, "POST", "staff/orders/o1/status", { status: "delivered" }); const a2 = (await O("GET", "/api/miniapp/order-actions")).data.items;
  await O("POST", "/api/miniapp/order-actions/ack", { notFound: [a2[0].id] });
  assert.equal((await ctx.pool.query("SELECT result FROM miniapp_order_actions WHERE id=$1", [a2[0].id])).rows[0].result, "not_found");
});

test("فایل‌های مشتری در مینی‌اپ کافی‌نت: دسته‌بندی، تغییر وضعیت (در برنامه هم دیده می‌شود)، و مجوز", async () => {
  const b1 = crypto.randomUUID();
  for (const n of ["a.pdf", "b.pdf"]) await ctx.pool.query("INSERT INTO customer_uploads (cafe_id,batch_id,batch_code,original_name,storage_key,size,sha256,sender_name,sender_phone,status) VALUES ($1,$2,'12345',$3,$4,1,'x','سارا','09120000000','new')", [cafeA, b1, n, crypto.randomUUID()]);
  const t = (await auth(7002)).token;
  const l = (await call(t, "GET", "staff/uploads")).data.items; assert.equal(l.length, 1); assert.equal(l[0].files, 2); assert.equal(l[0].stage, 0); assert.equal(l[0].sender, "سارا");
  assert.equal((await call(t, "POST", `staff/uploads/${b1}/status`, { status: "printed" })).data.files, 2);
  assert.equal((await O("GET", "/api/uploads")).data.every((x) => x.status === "printed"), true, "برنامه همان وضعیت را می‌بیند");
  assert.equal((await call(t, "POST", `staff/uploads/${b1}/status`, { status: "nope" })).status, 422);
  assert.equal((await call(t, "POST", `staff/uploads/${crypto.randomUUID()}/status`, { status: "done" })).status, 404);
  await ctx.pool.query("UPDATE permission_policies SET policy = jsonb_set(COALESCE(policy,'{}'::jsonb), '{staff}', '{\"deny\":[\"upload.view\"]}') WHERE cafe_id=$1", [cafeA]);
  ctx.app.perms.invalidate(cafeA);
});

test("درخواست مشتری: نیاز به شمارهٔ تأییدشده، ثبت، اعلان تلگرام به کارمند، مدیریت در برنامه و پیگیری مشتری", async () => {
  const t = (await auth(7003, codeA)).token;
  assert.equal((await call(t, "POST", "requests", { service: "چاپ بنر" })).error.code, "phone_required");
  await verified(7003, "9123334455");
  assert.equal((await call(t, "POST", "requests", { service: "  " })).status, 422);
  // کارمند باید اعلان بگیرد: chat_id او + notify
  await ctx.pool.query("UPDATE telegram_users SET chat_id=7002 WHERE telegram_id=7002");
  sent.length = 0;
  const r = await call(t, "POST", "requests", { service: "چاپ بنر ۲×۱", note: "رنگی، فردا صبح" });
  assert.equal(r.status, 201); assert.equal(r.data.customer, "علی رضایی", "مشتری با شماره به مشتری کافی‌نت وصل می‌شود"); assert.equal(r.data.status, "new");
  await new Promise((ok) => setTimeout(ok, 100));
  const msg = sent.find((m) => m.chat_id === 7002); assert.ok(msg && msg.text.includes("چاپ بنر") && msg.text.includes("علی رضایی"), "اعلان به کارمند");
  assert.ok(JSON.stringify(msg.reply_markup).includes("/m/?m=staff"));
  assert.ok(!sent.some((m) => m.chat_id === 7003), "اعلان به خود مشتری نمی‌رود");
  const admin = (await O("GET", "/api/miniapp/requests-admin")).data; assert.equal(admin.newCount, 1); assert.equal(admin.items[0].customerId, "c1");
  assert.equal((await O2("GET", "/api/miniapp/requests-admin")).data.items.length, 0, "کافی‌نت دیگر درخواست را نمی‌بیند");
  const st = (await auth(7002)).token;
  assert.equal((await call(st, "GET", "staff/requests")).data.items.length, 1);
  const acc = await O("POST", `/api/miniapp/requests-admin/${r.data.id}`, { status: "accepted", reply: "فردا ظهر آماده است", orderId: "ord-9" });
  assert.equal(acc.status, 200); assert.equal(acc.data.status, "accepted");
  const mine = (await call(t, "GET", "requests")).data.items[0]; assert.equal(mine.status, "accepted"); assert.equal(mine.reply, "فردا ظهر آماده است");
  assert.equal((await call(st, "POST", `staff/requests/${r.data.id}/status`, { status: "done" })).data.status, "done");
  assert.equal((await call(st, "POST", `staff/requests/${r.data.id}/status`, { status: "new" })).status, 422);
  assert.equal((await O("POST", `/api/miniapp/requests-admin/${crypto.randomUUID()}`, { status: "done" })).status, 404);
  assert.equal((await O2("POST", `/api/miniapp/requests-admin/${r.data.id}`, { status: "rejected" })).status, 404, "کافی‌نت دیگر نمی‌تواند تغییر دهد");
  for (let i = 0; i < 5; i++) await call(t, "POST", "requests", { service: `x${i}` });
  assert.equal((await call(t, "POST", "requests", { service: "ششم" })).error.code, "too_many_open");
});

test("مدیریت اتصال‌ها در برنامه: فهرست، اعلان، قطع؛ غیرفعال‌شدن کاربر فوراً دسترسی را می‌بندد", async () => {
  const own = (await O("GET", "/api/miniapp/staff-links")).data; assert.equal(own.canManageAll, true); assert.equal(own.items.length, 1); assert.equal(own.items[0].roleLabel, "کارمند");
  const mineOnly = (await S("GET", "/api/miniapp/staff-links")).data; assert.equal(mineOnly.canManageAll, false); assert.equal(mineOnly.items.length, 1);
  const uid = own.items[0].userId;
  assert.equal((await S("PATCH", `/api/miniapp/staff-links/${uid}`, { notify: false })).data.updated, 1);
  sent.length = 0; await ctx.app.miniappBot.notifyStaff(cafeA, "x"); assert.equal(sent.length, 0, "اعلان خاموش");
  await S("PATCH", `/api/miniapp/staff-links/${uid}`, { notify: true });
  assert.equal((await O2("DELETE", `/api/miniapp/staff-links/${uid}`)).data.removed, 0, "کافی‌نت دیگر");
  const t = (await auth(7002)).token; assert.equal((await call(t, "GET", "staff/home")).status, 200);
  await ctx.pool.query("UPDATE users SET is_active=false WHERE email='emp@staff.test'");
  assert.equal((await call(t, "GET", "staff/home")).status, 403, "کاربر غیرفعال");
  assert.equal((await auth(7002)).staff, null);
  await ctx.pool.query("UPDATE users SET is_active=true WHERE email='emp@staff.test'");
  assert.equal((await O("DELETE", `/api/miniapp/staff-links/${uid}`)).data.removed, 1);
  assert.equal((await call(t, "GET", "staff/home")).status, 403, "پس از قطع اتصال");
  assert.equal((await ctx.pool.query("SELECT count(*)::int n FROM audit_log WHERE action LIKE 'miniapp.%'")).rows[0].n > 5, true, "حسابرسی ثبت شده");
});
