// دریافت فایل از مشتری با QR (1.76): کد یکتا، آپلود عمومی با اعتبارسنجی، فهرست/دانلود/وضعیت/حذف، جداسازی کافی‌نت‌ها، سقف‌ها، پاکسازی. همه روی PostgreSQL واقعی.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { sanitizeName, pathForKey, checkFile, generateCode, isCode, sweepExpired } from "../src/lib/uploads.js";
import { UPLOAD_PAGE_CSP, UPLOAD_PAGE_HTML } from "../src/lib/uploadPage.js";

const PW = "رمز-خیلی-قوی-۱۲۳";
let ctx, dir, O, M, S, O2, cafeId, cafe2;
const PDF = (n = 200) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(n, 0x41)]);
const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

function multipartBody(fields, files) {
  const b = "----cafinoTest" + crypto.randomBytes(6).toString("hex"); const parts = [];
  for (const [k, v] of Object.entries(fields || {})) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files || []) parts.push(Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${f.field || "files"}"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.data, Buffer.from("\r\n")]));
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}
const send = (code, fields, files, extra = {}) => { const m = multipartBody(fields, files); return ctx.app.inject({ method: "POST", url: `/api/public/upload/${code}`, payload: m.payload, headers: { ...m.headers, ...extra } }); };
const J = (r) => { try { return JSON.parse(r.body); } catch { return null; } };
const mk = async (owner, role, n) => {
  const email = `${role}${n}@up.test`;
  const inv = await owner("POST", "/api/users/invite", { email, role, firstName: "ک", lastName: n }); assert.equal(inv.status, 201, JSON.stringify(inv.json));
  const cc = client(ctx.app), lg = await cc.post("/api/auth/login", { email, password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email, password: PW });
  return (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
};
const reg = async (email, shop) => { const c = client(ctx.app), r = await c.post("/api/auth/register", { email, password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: shop }); return { call: (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }), cafeId: r.data.user.branchId }; };
const ls = async (who, q = "") => (await who("GET", `/api/uploads${q}`)).data;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cafino-up-"));
  ctx = await makeApp(await startDb(), { env: { PERMISSION_PROFILE: "strict", UPLOAD_DIR: dir, UPLOAD_CAFE_QUOTA_MB: "10", UPLOAD_IP_PER_HOUR: "1000", UPLOAD_DAILY_FILES_PER_CAFE: "40" } });
  const a = await reg("own@up.test", "کافه‌آپلود"); O = a.call; cafeId = a.cafeId;
  const b = await reg("own2@up.test", "کافه‌دوم"); O2 = b.call; cafe2 = b.cafeId;
  M = await mk(O, "manager", "1"); S = await mk(O, "staff", "1");
});
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); fs.rmSync(dir, { recursive: true, force: true }); });

test("ابزارها: نام امن، امضای بایت، کد عمومی، مسیر ذخیره", () => {
  assert.equal(sanitizeName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeName("C:\\x\\a\u202Etxt.pdf"), "atxt.pdf");               // کنترل جهت (RLO) حذف می‌شود
  assert.equal(sanitizeName("  ...hidden.pdf "), "hidden.pdf");
  assert.equal(sanitizeName("\u0000\u0001"), "file");
  assert.ok(sanitizeName("a".repeat(300) + ".pdf").length <= 120 && sanitizeName("a".repeat(300) + ".pdf").endsWith(".pdf"));
  assert.equal(checkFile("a.pdf", PDF()), null);
  assert.equal(checkFile("a.pdf", PNG()), "bad_signature");
  assert.equal(checkFile("a.exe", Buffer.from("MZ")), "bad_ext");
  assert.equal(checkFile("a.pdf.exe", PDF()), "bad_ext");
  assert.equal(checkFile("a.txt", Buffer.from("سلام")), null);
  assert.equal(checkFile("a.txt", Buffer.from([65, 0, 66])), "bad_signature");
  assert.equal(checkFile("a.docx", Buffer.from([0x50, 0x4b, 3, 4, 0])), null);
  for (let i = 0; i < 50; i++) assert.ok(isCode(generateCode()));
  assert.equal(new Set(Array.from({ length: 200 }, generateCode)).size, 200);
  assert.throws(() => pathForKey({ uploadDir: dir }, "../../etc/passwd"));
  assert.throws(() => pathForKey({ uploadDir: dir }, `${crypto.randomUUID()}/2026-01/../../x`));
});

test("تنظیمات: هر کافی‌نت کد مخصوص خود را دارد؛ کارمند فقط می‌بیند؛ مدیر تغییر می‌دهد؛ تعویض کد QR قبلی را باطل می‌کند", async () => {
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/uploads/settings" })).statusCode, 401);
  const s1 = (await O("GET", "/api/uploads/settings")).data, s2 = (await O2("GET", "/api/uploads/settings")).data;
  assert.ok(isCode(s1.code) && isCode(s2.code) && s1.code !== s2.code);
  assert.equal(s1.path, `/u/${s1.code}`); assert.equal(s1.enabled, true); assert.equal(s1.canManage, true);
  assert.equal((await O("GET", "/api/uploads/settings")).data.code, s1.code);               // ثابت می‌ماند
  const st = await S("GET", "/api/uploads/settings"); assert.equal(st.status, 200); assert.equal(st.data.canManage, false);
  assert.equal((await S("PUT", "/api/uploads/settings", { enabled: false })).status, 403);
  assert.equal((await S("POST", "/api/uploads/settings/rotate-code")).status, 403);
  const up = await M("PUT", "/api/uploads/settings", { maxFileMb: 3, maxFiles: 4, notice: "ساعت کاری ۸ تا ۲۲", retentionDays: 7 }); assert.equal(up.status, 200, JSON.stringify(up.json));
  assert.equal(up.data.maxFileMb, 3); assert.equal(up.data.notice, "ساعت کاری ۸ تا ۲۲");
  assert.equal((await M("PUT", "/api/uploads/settings", { maxFileMb: 9999 })).data.maxFileMb, 100);   // سقف سخت
  await M("PUT", "/api/uploads/settings", { maxFileMb: 3 });
  const rot = await M("POST", "/api/uploads/settings/rotate-code"); assert.equal(rot.status, 200); assert.notEqual(rot.data.code, s1.code);
  assert.equal((await ctx.app.inject({ method: "GET", url: `/api/public/upload/${s1.code}` })).statusCode, 404);   // QR قدیمی باطل
  assert.equal((await ctx.app.inject({ method: "GET", url: `/api/public/upload/${rot.data.code}` })).statusCode, 200);
  const a = await ctx.pool.query("SELECT action FROM audit_log WHERE cafe_id=$1 AND action LIKE 'upload.%' ORDER BY id", [cafeId]);
  assert.ok(a.rows.some((r) => r.action === "upload.settings") && a.rows.some((r) => r.action === "upload.rotate_code"));
});

test("صفحهٔ عمومی: HTML با CSP مبتنی بر هش (بدون unsafe-inline برای اسکریپت)، کد نامعتبر ۴۰۴", async () => {
  const code = (await O("GET", "/api/uploads/settings")).data.code;
  const r = await ctx.app.inject({ method: "GET", url: `/u/${code}` });
  assert.equal(r.statusCode, 200); assert.match(r.headers["content-type"], /text\/html/);
  assert.equal(r.headers["content-security-policy"], UPLOAD_PAGE_CSP);
  assert.match(UPLOAD_PAGE_CSP, /script-src 'sha256-[A-Za-z0-9+/=]+'/); assert.doesNotMatch(UPLOAD_PAGE_CSP, /unsafe-inline|unsafe-eval/);
  assert.match(UPLOAD_PAGE_CSP, /connect-src 'self'/); assert.match(UPLOAD_PAGE_CSP, /frame-ancestors 'none'/);
  assert.doesNotMatch(UPLOAD_PAGE_HTML.replace(/<script>[\s\S]*<\/script>/, "").replace(/<style>[\s\S]*<\/style>/, ""), / style=| on\w+=|javascript:/);                      // با CSP سازگار
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal((await ctx.app.inject({ method: "GET", url: "/u/short" })).statusCode, 404);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/u/" + "a".repeat(16) })).statusCode, 200);   // صفحه برای هر کد معتبرالقالب باز می‌شود؛ وجود کافه را فاش نمی‌کند
  const info = await ctx.app.inject({ method: "GET", url: `/api/public/upload/${code}` });
  assert.deepEqual(Object.keys(J(info).data).sort(), ["allowedExts", "cafeName", "expiresAt", "kind", "label", "maxFileMb", "maxFiles", "notice", "requirePhone", "serverTime", "shop"]);
  assert.equal(J(info).data.cafeName, "کافه‌آپلود");
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/public/upload/" + "b".repeat(16) })).statusCode, 404);
});

test("آپلود: موفق → فهرست → دانلود (attachment/nosniff) → وضعیت → حذف (فایل واقعاً از دیسک پاک می‌شود)", async () => {
  const code = (await O("GET", "/api/uploads/settings")).data.code;
  const r = await send(code, { name: "علی", phone: "09121112233", note: "۲ نسخه رنگی" }, [{ name: "رزومه ./ علی.pdf", data: PDF(500) }, { name: "عکس.png", data: PNG() }]);
  assert.equal(r.statusCode, 201, r.body); const d = J(r).data; assert.match(d.batchCode, /^\d{5}$/); assert.equal(d.count, 2);
  const l = await ls(S); assert.equal(l.length, 2);                                       // کارمند هم می‌بیند
  const f = l.find((x) => x.name.endsWith(".pdf")); assert.equal(f.batchCode, d.batchCode); assert.equal(f.senderName, "علی"); assert.equal(f.status, "new"); assert.equal(f.size, PDF(500).length);
  assert.equal(f.name, "علی.pdf");                                                          // مسیر حذف شد
  assert.equal((await S("GET", "/api/uploads")).json.meta.newCount, 2);
  const dl = await ctx.app.inject({ method: "GET", url: `/api/uploads/${f.id}/download`, headers: { authorization: `Bearer ${(await (async () => { const c = client(ctx.app); const x = await c.post("/api/auth/login", { email: "own@up.test", password: PW }); return x.data.accessToken; })())}` } });
  assert.equal(dl.statusCode, 200); assert.ok(dl.rawPayload.equals(PDF(500)));
  assert.match(dl.headers["content-disposition"], /^attachment;/); assert.equal(dl.headers["x-content-type-options"], "nosniff"); assert.equal(dl.headers["content-type"], "application/octet-stream");
  assert.equal((await ls(O, "?status=seen")).length, 1);                                    // دانلود = دیده‌شده
  const p = await O("PATCH", `/api/uploads/${f.id}`, { status: "printed" }); assert.equal(p.data.status, "printed");
  assert.equal((await O("PATCH", `/api/uploads/${f.id}`, { status: "hacked" })).status, 422);
  assert.equal((await ls(O, `?q=${d.batchCode}`)).length, 2);                               // جستجو با کد پیگیری
  assert.equal((await ls(O, `?q=${encodeURIComponent("علی")}`)).length, 2);
  const row = (await ctx.pool.query("SELECT storage_key FROM customer_uploads WHERE id=$1", [f.id])).rows[0];
  const onDisk = pathForKey(ctx.cfg, row.storage_key); assert.ok(fs.existsSync(onDisk));
  assert.notEqual(path.basename(onDisk), f.name);                                           // نام روی دیسک تصادفی است
  assert.equal((await S("DELETE", `/api/uploads/${f.id}`)).status, 200);
  assert.ok(!fs.existsSync(onDisk)); assert.equal((await ls(O)).length, 1);
  assert.equal((await O("GET", `/api/uploads/${f.id}/download`)).status, 404);
  const a = await ctx.pool.query("SELECT details FROM audit_log WHERE cafe_id=$1 AND action='upload.delete'", [cafeId]); assert.equal(a.rows.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(dir, "tmp")), []);                              // فایل موقت نمانده
});

test("رد شدن: پسوند غیرمجاز، امضای جعلی، فایل خالی، خیلی بزرگ، تعداد زیاد — همه‌یا‌هیچ و بدون جا گذاشتن فایل", async () => {
  const code = (await O("GET", "/api/uploads/settings")).data.code;
  const before = (await ctx.pool.query("SELECT count(*)::int n FROM customer_uploads WHERE cafe_id=$1", [cafeId])).rows[0].n;
  const cases = [
    [[{ name: "a.pdf", data: PDF() }, { name: "virus.exe", data: Buffer.from("MZ......") }], 422, "bad_ext"],
    [[{ name: "a.pdf.js", data: PDF() }], 422, "bad_ext"],
    [[{ name: "fake.pdf", data: PNG() }], 422, "bad_signature"],
    [[{ name: "empty.pdf", data: Buffer.alloc(0) }], 422, "empty_file"],
    [[{ name: "big.pdf", data: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(4 * 1048576, 1)]) }], 422, "file_too_large"],
    [Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.pdf`, data: PDF() })), 422, null],
    [[], 422, null],
  ];
  for (const [files, st, ec] of cases) { const r = await send(code, {}, files); assert.equal(r.statusCode, st, r.body); if (ec) assert.equal(J(r).error.code, ec); }
  assert.equal((await ctx.pool.query("SELECT count(*)::int n FROM customer_uploads WHERE cafe_id=$1", [cafeId])).rows[0].n, before);
  assert.deepEqual(fs.readdirSync(path.join(dir, "tmp")), []);
  const nonMulti = await ctx.app.inject({ method: "POST", url: `/api/public/upload/${code}`, payload: { a: 1 } }); assert.ok([415, 422].includes(nonMulti.statusCode));
  await M("PUT", "/api/uploads/settings", { requirePhone: true });
  assert.equal((await send(code, { phone: "123" }, [{ name: "a.pdf", data: PDF() }])).statusCode, 422);
  assert.equal((await send(code, { phone: "09120000000" }, [{ name: "a.pdf", data: PDF() }])).statusCode, 201);
  await M("PUT", "/api/uploads/settings", { requirePhone: false });
});

test("جداسازی: کافی‌نت دیگر فایل‌ها را نمی‌بیند/دانلود/حذف نمی‌کند؛ غیرفعال‌سازی QR → بسته", async () => {
  const mine = await ls(O); assert.ok(mine.length >= 2);
  assert.equal((await ls(O2)).length, 0);
  assert.equal((await O2("GET", `/api/uploads/${mine[0].id}/download`)).status, 404);
  assert.equal((await O2("DELETE", `/api/uploads/${mine[0].id}`)).status, 404);
  assert.equal((await O2("PATCH", `/api/uploads/${mine[0].id}`, { status: "done" })).status, 404);
  const code = (await O("GET", "/api/uploads/settings")).data.code;
  assert.equal((await M("PUT", "/api/uploads/settings", { enabled: false })).data.enabled, false);
  const r = await send(code, {}, [{ name: "a.pdf", data: PDF() }]); assert.equal(r.statusCode, 403); assert.equal(J(r).error.code, "upload_closed");
  assert.equal((await ctx.app.inject({ method: "GET", url: `/api/public/upload/${code}` })).statusCode, 403);
  await M("PUT", "/api/uploads/settings", { enabled: true });
  await ctx.pool.query("UPDATE cafes SET status='suspended' WHERE id=$1", [cafe2]);
  const c2 = (await O2("GET", "/api/uploads/settings")); assert.equal(c2.status, 403);       // کافی‌نت معلق
  await ctx.pool.query("UPDATE cafes SET status='active' WHERE id=$1", [cafe2]);
});

test("سقف فضا: بعد از پر شدن سهمیهٔ کافی‌نت ۵۰۷؛ پاکسازی منقضی‌ها فایل و نام را پاک می‌کند", async () => {
  const code = (await O2("GET", "/api/uploads/settings")).data.code;
  await O2("PUT", "/api/uploads/settings", { maxFileMb: 8 });
  const big = () => Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(6 * 1048576, 7)]);
  assert.equal((await send(code, {}, [{ name: "a.pdf", data: big() }])).statusCode, 201);
  const r = await send(code, {}, [{ name: "b.pdf", data: big() }]); assert.equal(r.statusCode, 507); assert.equal(J(r).error.code, "upload_quota");
  const used = (await O2("GET", "/api/uploads/settings")).data; assert.ok(used.usedBytes > 6e6 && used.quotaBytes === 10 * 1048576);
  const row = (await ctx.pool.query("SELECT id, storage_key FROM customer_uploads WHERE cafe_id=$1", [cafe2])).rows[0], disk = pathForKey(ctx.cfg, row.storage_key);
  assert.ok(fs.existsSync(disk));
  await ctx.pool.query("UPDATE customer_uploads SET created_at = now() - interval '40 days' WHERE id=$1", [row.id]);
  assert.ok((await sweepExpired(ctx.pool, ctx.cfg)) >= 1);
  assert.ok(!fs.existsSync(disk));
  const after = (await ctx.pool.query("SELECT deleted_at, original_name FROM customer_uploads WHERE id=$1", [row.id])).rows[0]; assert.ok(after.deleted_at); assert.equal(after.original_name, "");
  assert.equal((await ls(O2)).length, 0);
});

test("سقف روزانه و دسترسی: کارمند در پروفایل strict مجوز view دارد، manage ندارد", async () => {
  const me = (await S("GET", "/api/permissions")).data.me.permissions;
  assert.ok(me.includes("upload.view")); assert.ok(!me.includes("upload.manage"));
  assert.ok((await O("GET", "/api/permissions")).data.me.permissions.includes("upload.manage"));
});
