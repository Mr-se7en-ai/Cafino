// دریافت فایل (1.77): QR موقت سفارش، اتصال به سفارش/مشتری، وضعیت ارسال برای مشتری، مرتب‌سازی/جستجو/تغییر نام/نگه‌داری ویژه/حذف گروهی با مجوز،
// ساخت فایل از ابزار PDF، خلاصهٔ نشان منو، پاکسازی فایل‌های انجام‌شده و ضدویروس ClamAV (پروتکل با سرور ساختگی + clamd واقعی در صورت وجود). همه روی PostgreSQL واقعی.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { sweepExpired, renameKeepExt, tmpDir } from "../src/lib/uploads.js";
import { scanFileViaClamd, pingClamd } from "../src/lib/av.js";

const PW = "رمز-خیلی-قوی-۱۲۳";
let url, dir, ctx, O, M, S, O2, cafeId;
const apps = [];
const PDF = (n = 200, tag = "A") => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(n, tag.charCodeAt(0))]);
const EICAR = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");

function multipartBody(fields, files) {
  const b = "----cafinoTest" + crypto.randomBytes(6).toString("hex"); const parts = [];
  for (const [k, v] of Object.entries(fields || {})) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files || []) parts.push(Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${f.field || "files"}"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.data, Buffer.from("\r\n")]));
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}
const send = (app, code, fields, files) => { const m = multipartBody(fields, files); return app.inject({ method: "POST", url: `/api/public/upload/${code}`, payload: m.payload, headers: m.headers }); };
const J = (r) => { try { return JSON.parse(r.body); } catch { return null; } };
const boot = async (env) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cafino-up2-"));
  const x = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", UPLOAD_DIR: d, UPLOAD_IP_PER_HOUR: "1000", UPLOAD_DAILY_FILES_PER_CAFE: "500", ...env } });
  x.dir = d; apps.push(x); return x;
};
const reg = async (x, email, shop) => { const c = client(x.app), r = await c.post("/api/auth/register", { email, password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: shop }); assert.equal(r.status, 201, JSON.stringify(r.json)); return { call: (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }), cafeId: r.data.user.branchId }; };
const mk = async (x, owner, role, n) => {
  const email = `${role}${n}@up2.test`;
  const inv = await owner("POST", "/api/users/invite", { email, role, firstName: "ک", lastName: n }); assert.equal(inv.status, 201, JSON.stringify(inv.json));
  const cc = client(x.app), lg = await cc.post("/api/auth/login", { email, password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email, password: PW });
  return (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
};

before(async () => {
  url = await startDb();
  ctx = await boot({});
  const a = await reg(ctx, "own@up2.test", "کافه‌اول"); O = a.call; cafeId = a.cafeId;
  O2 = (await reg(ctx, "own2@up2.test", "کافه‌دوم")).call;
  M = await mk(ctx, O, "manager", "1"); S = await mk(ctx, O, "staff", "1");
});
after(async () => { for (const x of apps) { await x.app.close(); await x.pool.end(); fs.rmSync(x.dir, { recursive: true, force: true }); } await stopDb(); });

const newSession = async (who, body = {}) => { const r = await who("POST", "/api/uploads/sessions", { label: "سفارش چاپ ۱۲۴", orderRef: "ord-124", orderLabel: "چاپ بروشور", customerRef: "cus-9", customerLabel: "علی رضایی", ttlMinutes: 60, maxFiles: 5, ...body }); assert.equal(r.status, 201, JSON.stringify(r.json)); return r.data; };

test("QR موقت: ساخت توسط کارمند، صفحهٔ عمومی با عنوان و انقضا، آپلود با اتصال خودکار به سفارش/مشتری", async () => {
  assert.equal((await ctx.app.inject({ method: "POST", url: "/api/uploads/sessions", payload: {} })).statusCode, 401);
  const ss = await newSession(S);
  assert.match(ss.code, /^[a-z2-7]{16}$/); assert.equal(ss.state, "active"); assert.equal(ss.path, `/u/${ss.code}`);
  const shop = (await O("GET", "/api/uploads/settings")).data.code; assert.notEqual(ss.code, shop);
  const info = J(await ctx.app.inject({ method: "GET", url: `/api/public/upload/${ss.code}` })).data;
  assert.equal(info.kind, "session"); assert.equal(info.label, "سفارش چاپ ۱۲۴"); assert.ok(Date.parse(info.expiresAt) > Date.now());
  assert.equal(JSON.stringify(info).includes("ord-124") || JSON.stringify(info).includes("رضایی"), false, "ارجاع سفارش/مشتری به مشتری نمایش داده نمی‌شود");
  assert.equal(info.maxFiles, 5);
  const up = await send(ctx.app, ss.code, { name: "علی" }, [{ name: "a.pdf", data: PDF(300) }, { name: "b.pdf", data: PDF(100, "B") }]);
  assert.equal(up.statusCode, 201, up.body);
  const d = J(up).data; assert.equal(d.count, 2); assert.match(d.statusToken, /^[0-9a-f-]{36}\.[0-9a-f]{32}$/);
  const list = (await S("GET", `/api/uploads?session=${ss.id}`)).data;
  assert.equal(list.length, 2);
  for (const f of list) { assert.equal(f.orderRef, "ord-124"); assert.equal(f.customerLabel, "علی رضایی"); assert.equal(f.sessionId, ss.id); assert.equal(f.scan, "skipped"); }
  assert.equal((await S("GET", `/api/uploads/sessions`)).data.find((x) => x.id === ss.id).uploads, 2);
  assert.equal((await S("GET", `/api/uploads?order=ord-124`)).data.length, 2);
  assert.equal((await O2("GET", `/api/uploads?order=ord-124`)).data.length, 0, "کافی‌نت دیگر نمی‌بیند");
});

test("وضعیت ارسال برای مشتری: فقط با رمز همان ارسال؛ با تغییر وضعیت توسط کارمند عوض می‌شود", async () => {
  const ss = await newSession(S, { label: "وضعیت" });
  const a = J(await send(ctx.app, ss.code, {}, [{ name: "x.pdf", data: PDF() }])).data, b = J(await send(ctx.app, ss.code, {}, [{ name: "y.pdf", data: PDF(50, "C") }])).data;
  const get = (code, tok) => ctx.app.inject({ method: "GET", url: `/api/public/upload/${code}/status/${tok}` });
  let r = await get(ss.code, a.statusToken); assert.equal(r.statusCode, 200);
  assert.deepEqual(J(r).data.files.map((f) => [f.name, f.status]), [["x.pdf", "new"]]);
  const f = (await S("GET", `/api/uploads?session=${ss.id}&q=x.pdf`)).data[0];
  assert.equal((await S("PATCH", `/api/uploads/${f.id}`, { status: "printed" })).data.status, "printed");
  assert.equal(J(await get(ss.code, a.statusToken)).data.files[0].status, "printed");
  assert.equal(J(await get(ss.code, b.statusToken)).data.files[0].status, "new", "ارسال دیگر جدا است");
  // رمز اشتباه / رمز ارسال دیگر با batchId این ارسال / کد کافی‌نت دیگر / قالب خراب
  const [bid] = a.statusToken.split(".");
  assert.equal((await get(ss.code, `${bid}.${"0".repeat(32)}`)).statusCode, 404);
  assert.equal((await get(ss.code, `${bid}.${b.statusToken.split(".")[1]}`)).statusCode, 404);
  const other = (await O2("GET", "/api/uploads/settings")).data.code;
  assert.equal((await get(other, a.statusToken)).statusCode, 404, "کد کافی‌نت دیگر ارسال را پیدا نمی‌کند");
  assert.equal((await get(ss.code, "xx")).statusCode, 404);
  // حذف فایل → «حذف‌شده» و بدون نام
  assert.equal((await S("DELETE", `/api/uploads/${f.id}`)).status, 200);
  assert.deepEqual(J(await get(ss.code, a.statusToken)).data.files, [{ name: "", size: 0, status: "removed" }]);
});

test("انقضا، بستن و سقف تعداد QR موقت", async () => {
  const ss = await newSession(S, { maxFiles: 2, label: "سقف" });
  assert.equal((await send(ctx.app, ss.code, {}, [{ name: "1.pdf", data: PDF() }])).statusCode, 201);
  const full = await send(ctx.app, ss.code, {}, [{ name: "2.pdf", data: PDF(10, "B") }, { name: "3.pdf", data: PDF(10, "C") }]);
  assert.equal(full.statusCode, 422); assert.equal(J(full).error.code, "session_full");
  assert.equal((await S("GET", `/api/uploads?session=${ss.id}`)).data.length, 1, "همه‌یا‌هیچ");
  // منقضی
  await ctx.pool.query("UPDATE upload_sessions SET expires_at = now() - interval '1 minute' WHERE id=$1", [ss.id]);
  let r = await send(ctx.app, ss.code, {}, [{ name: "4.pdf", data: PDF() }]); assert.equal(r.statusCode, 410); assert.equal(J(r).error.code, "session_expired");
  assert.equal((await ctx.app.inject({ method: "GET", url: `/api/public/upload/${ss.code}` })).statusCode, 410);
  assert.equal((await S("GET", "/api/uploads/sessions")).data.some((x) => x.id === ss.id), false, "منقضی از فهرست فعال‌ها خارج است");
  assert.equal((await S("GET", "/api/uploads/sessions?all=1")).data.find((x) => x.id === ss.id).state, "expired");
  // بسته شدن دستی
  const s2 = await newSession(S, { label: "بسته" });
  assert.equal((await O2("POST", `/api/uploads/sessions/${s2.id}/close`)).status, 404, "کافی‌نت دیگر نمی‌تواند ببندد");
  assert.equal((await S("POST", `/api/uploads/sessions/${s2.id}/close`)).data.state, "closed");
  r = await send(ctx.app, s2.code, {}, [{ name: "5.pdf", data: PDF() }]); assert.equal(r.statusCode, 410); assert.equal(J(r).error.code, "session_closed");
  // غیرفعال‌سازی دریافت فایل، QR موقت را هم می‌بندد؛ مقادیر ورودی محدود می‌شوند
  const s3 = await newSession(S, { ttlMinutes: 999999, maxFiles: 9999, label: "x".repeat(200).slice(0, 80) });
  assert.ok(Date.parse(s3.expiresAt) - Date.now() <= 7 * 864e5 + 5000); assert.equal(s3.maxFiles, 100);
  assert.equal((await M("PUT", "/api/uploads/settings", { enabled: false })).status, 200);
  assert.equal((await send(ctx.app, s3.code, {}, [{ name: "6.pdf", data: PDF() }])).statusCode, 403);
  assert.equal((await S("POST", "/api/uploads/sessions", { label: "n" })).status, 403);
  assert.equal((await M("PUT", "/api/uploads/settings", { enabled: true })).status, 200);
  assert.equal((await ctx.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE cafe_id=$1 AND action='upload.session_create'", [cafeId])).rows[0].n >= 3, true);
});

test("مدیریت فایل: جستجو (سفارش/مشتری)، مرتب‌سازی، اتصال/رفع اتصال، تغییر نام (پسوند ثابت)، نگه‌داری ویژه", async () => {
  const ss = await newSession(S, { label: "مدیریت", orderRef: "", orderLabel: "", customerRef: "", customerLabel: "", maxFiles: 10 });
  await send(ctx.app, ss.code, { name: "سارا" }, [{ name: "b-mid.pdf", data: PDF(500) }, { name: "a-small.pdf", data: PDF(20, "B") }, { name: "c-big.pdf", data: PDF(5000, "C") }]);
  const names = async (q) => (await S("GET", `/api/uploads?session=${ss.id}${q}`)).data.map((x) => x.name);
  assert.deepEqual(await names("&sort=name&dir=asc"), ["a-small.pdf", "b-mid.pdf", "c-big.pdf"]);
  assert.deepEqual(await names("&sort=size&dir=desc"), ["c-big.pdf", "b-mid.pdf", "a-small.pdf"]);
  assert.deepEqual(await names("&sort=size&dir=asc"), ["a-small.pdf", "b-mid.pdf", "c-big.pdf"]);
  assert.equal((await S("GET", `/api/uploads?sort=drop_table`)).status, 422);
  assert.equal((await S("GET", `/api/uploads?sort=name'; --`)).status, 422);
  assert.equal((await S("GET", `/api/uploads?session=${ss.id}&unlinked=1`)).data.length, 3);
  const all = (await S("GET", `/api/uploads?session=${ss.id}`)).data;
  // اتصال گروهی
  const lk = await S("POST", "/api/uploads/link", { ids: all.slice(0, 2).map((x) => x.id), orderRef: "ord-777", orderLabel: "کارت ویزیت", customerRef: "cus-5", customerLabel: "مریم" });
  assert.equal(lk.data.updated, 2);
  assert.equal((await S("GET", "/api/uploads?order=ord-777")).data.length, 2);
  assert.equal((await S("GET", "/api/uploads?customer=cus-5&q=" + encodeURIComponent("کارت"))).data.length, 2, "جستجو در عنوان سفارش");
  assert.equal((await S("GET", `/api/uploads?session=${ss.id}&unlinked=1`)).data.length, 1);
  // اتصال کل ارسال با batchId، سپس رفع اتصال
  assert.equal((await S("POST", "/api/uploads/link", { batchId: all[0].batchId, orderRef: "ord-1" })).data.updated, 3);
  assert.equal((await S("POST", "/api/uploads/link", { batchId: all[0].batchId })).data.updated, 3);
  assert.equal((await S("GET", `/api/uploads?session=${ss.id}&unlinked=1`)).data.length, 3);
  assert.equal((await S("POST", "/api/uploads/link", { ids: ["not-a-uuid"] })).status, 422);
  assert.equal((await O2("POST", "/api/uploads/link", { ids: [all[0].id], orderRef: "hack" })).data.updated, 0, "کافی‌نت دیگر روی فایل اثر ندارد");
  // تغییر نام
  const f = all.find((x) => x.name === "b-mid.pdf");
  let r = await S("PATCH", `/api/uploads/${f.id}`, { name: "بروشور نهایی" }); assert.equal(r.status, 200); assert.equal(r.data.name, "بروشور نهایی.pdf");
  assert.equal((await S("PATCH", `/api/uploads/${f.id}`, { name: "x.exe" })).data.name, "x.exe.pdf", "پسوند غیرمجاز نام عادی می‌شود، پسوند اجرایی واقعی نمی‌گیرد");
  assert.equal((await S("PATCH", `/api/uploads/${f.id}`, { name: "x.docx" })).status, 422, "تغییر پسوند مجاز به مجاز رد می‌شود");
  assert.equal((await S("PATCH", `/api/uploads/${f.id}`, { name: "   " })).status, 422);
  assert.equal((await S("PATCH", `/api/uploads/${f.id}`, { name: "../../etc/p.pdf" })).data.name, "p.pdf");
  assert.equal((await S("PATCH", `/api/uploads/${f.id}`, {})).status, 422);
  assert.equal((await O2("PATCH", `/api/uploads/${f.id}`, { name: "h.pdf" })).status, 404);
  assert.ok((await ctx.pool.query("SELECT 1 FROM audit_log WHERE cafe_id=$1 AND action='upload.rename'", [cafeId])).rows.length >= 1);
  assert.deepEqual(renameKeepExt("a.PDF", "q.pdf"), { name: "a.PDF" });
  // نگه‌داری ویژه: کارمند نمی‌تواند حذف کند؛ مدیر می‌تواند
  assert.equal((await S("PATCH", `/api/uploads/${f.id}`, { protected: true })).data.protected, true);
  assert.equal((await S("GET", "/api/uploads?protected=1")).data.length >= 1, true);
  const del = await S("DELETE", `/api/uploads/${f.id}`); assert.equal(del.status, 403);
  assert.equal((await M("DELETE", `/api/uploads/${f.id}`)).status, 200);
});

test("حذف گروهی: فقط با مجوز upload.bulk_delete؛ فایل نگه‌داری‌ویژه کنار گذاشته می‌شود؛ جداسازی کافی‌نت‌ها؛ فایل از دیسک پاک می‌شود", async () => {
  const ss = await newSession(S, { label: "گروهی", maxFiles: 10 });
  await send(ctx.app, ss.code, {}, [1, 2, 3, 4].map((i) => ({ name: `f${i}.pdf`, data: PDF(30 + i, String.fromCharCode(64 + i)) })));
  const rows = (await M("GET", `/api/uploads?session=${ss.id}&sort=name&dir=asc`)).data; assert.equal(rows.length, 4);
  const keys = (await ctx.pool.query("SELECT storage_key FROM customer_uploads WHERE session_id=$1", [ss.id])).rows.map((x) => x.storage_key);
  assert.equal((await S("POST", "/api/uploads/bulk-delete", { ids: rows.map((x) => x.id) })).status, 403, "کارمند در حالت strict مجوز حذف گروهی ندارد");
  assert.equal((await M("POST", "/api/uploads/bulk-delete", { ids: [] })).status, 422);
  assert.equal((await M("POST", "/api/uploads/bulk-delete", { ids: ["zzz"] })).status, 422);
  assert.equal((await M("POST", "/api/uploads/bulk-delete", { ids: Array.from({ length: 201 }, () => crypto.randomUUID()) })).status, 422);
  assert.equal((await O2("POST", "/api/uploads/bulk-delete", { ids: rows.map((x) => x.id) })).data.deleted, 0, "کافی‌نت دیگر نمی‌تواند حذف کند");
  await M("PATCH", `/api/uploads/${rows[0].id}`, { protected: true });
  const r = await M("POST", "/api/uploads/bulk-delete", { ids: rows.map((x) => x.id) }); assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.data.deleted, 3); assert.deepEqual(r.data.skipped, [rows[0].id]);
  assert.equal((await M("GET", `/api/uploads?session=${ss.id}`)).data.length, 1);
  const { pathForKey } = await import("../src/lib/uploads.js");
  const gone = keys.filter((k) => !fs.existsSync(pathForKey(ctx.cfg, k)));
  assert.equal(gone.length, 3, "سه فایل از دیسک پاک شد و فایل ویژه ماند");
  const a = await ctx.pool.query("SELECT details FROM audit_log WHERE cafe_id=$1 AND action='upload.bulk_delete' ORDER BY id DESC LIMIT 1", [cafeId]);
  assert.equal(a.rows[0].details.count, 3); assert.equal(a.rows[0].details.skippedProtected, 1);
});

test("ساخت فایل از ابزار PDF (derive): همان ارسال/سفارش، وضعیت دیده‌شده، مشتری آن را در وضعیت نمی‌بیند", async () => {
  const ss = await newSession(S, { label: "ابزار" });
  const up = J(await send(ctx.app, ss.code, { name: "رضا" }, [{ name: "src.pdf", data: PDF(400) }])).data;
  const src = (await S("GET", `/api/uploads?session=${ss.id}`)).data[0];
  const m = multipartBody({ from: src.id, name: "ادغام‌شده.pdf" }, [{ field: "file", name: "out.pdf", data: PDF(900, "Z") }]);
  const r = await ctx.app.inject({ method: "POST", url: "/api/uploads/derive", payload: m.payload, headers: { ...m.headers, authorization: `Bearer ${await tokenOf(S)}` } });
  assert.equal(r.statusCode, 201, r.body);
  const d = J(r).data; assert.equal(d.name, "ادغام‌شده.pdf"); assert.equal(d.derivedFrom, src.id); assert.equal(d.batchId, src.batchId); assert.equal(d.orderRef, "ord-124"); assert.equal(d.status, "seen"); assert.equal(d.senderName, "رضا");
  const st = J(await ctx.app.inject({ method: "GET", url: `/api/public/upload/${ss.code}/status/${up.statusToken}` })).data;
  assert.equal(st.files.length, 1, "مشتری فایل ساخته‌شدهٔ کارمند را نمی‌بیند");
  // مبدأ ناموجود/کافی‌نت دیگر/ نوع غیرمجاز/امضای جعلی
  const bad = async (fields, files) => { const mm = multipartBody(fields, files); return (await ctx.app.inject({ method: "POST", url: "/api/uploads/derive", payload: mm.payload, headers: { ...mm.headers, authorization: `Bearer ${await tokenOf(S)}` } })).statusCode; };
  assert.equal(await bad({ from: crypto.randomUUID() }, [{ field: "file", name: "a.pdf", data: PDF() }]), 404);
  assert.equal(await bad({ from: src.id }, [{ field: "file", name: "a.exe", data: PDF() }]), 422);
  assert.equal(await bad({ from: src.id }, [{ field: "file", name: "a.pdf", data: Buffer.from("not a pdf") }]), 422);
  assert.equal(await bad({}, [{ field: "file", name: "a.pdf", data: PDF() }]), 422);
  assert.equal((await ctx.app.inject({ method: "POST", url: "/api/uploads/derive", payload: m.payload, headers: m.headers })).statusCode, 401);
});
const tokens = new Map();
async function tokenOf(call) { // توکن را از نسخهٔ کلاینت نمی‌شود گرفت؛ برای derive دوباره وارد می‌شویم
  if (tokens.has(call)) return tokens.get(call);
  const c = client(ctx.app); const r = await c.post("/api/auth/login", { email: "staff1@up2.test", password: PW }); tokens.set(call, r.data.accessToken); return r.data.accessToken;
}

test("خلاصهٔ نشان منو: تعداد جدید و آخرین ارسال؛ با دیدن/تغییر وضعیت کم می‌شود؛ کافی‌نت‌ها جدا", async () => {
  const c2 = await reg(ctx, "own3@up2.test", "کافه‌سوم"); const code = (await c2.call("GET", "/api/uploads/settings")).data.code;
  assert.equal((await c2.call("GET", "/api/uploads/summary")).data.newCount, 0); assert.equal((await c2.call("GET", "/api/uploads/summary")).data.latest, null);
  await send(ctx.app, code, { name: "نیما" }, [{ name: "a.pdf", data: PDF() }, { name: "b.pdf", data: PDF(9, "B") }]);
  const s = (await c2.call("GET", "/api/uploads/summary")).data; assert.equal(s.newCount, 2); assert.equal(s.latest.count, 2); assert.equal(s.latest.senderName, "نیما"); assert.match(s.latest.batchCode, /^\d{5}$/);
  const list = (await c2.call("GET", "/api/uploads")).data;
  assert.equal((await c2.call("POST", "/api/uploads/bulk-status", { ids: [list[0].id], status: "seen" })).data.updated, 1);
  assert.equal((await c2.call("GET", "/api/uploads/summary")).data.newCount, 1);
  assert.equal((await O2("GET", "/api/uploads/summary")).data.newCount, 0);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/uploads/summary" })).statusCode, 401);
});

test("پاکسازی خودکار: فایل چاپ‌شده/انجام‌شده بعد از done_retention_days پاک می‌شود؛ نگه‌داری ویژه و فایل تازه نه", async () => {
  const c = await reg(ctx, "own4@up2.test", "کافه‌چهارم"); const code = (await c.call("GET", "/api/uploads/settings")).data.code;
  await send(ctx.app, code, {}, [{ name: "done.pdf", data: PDF() }, { name: "keep.pdf", data: PDF(9, "B") }, { name: "fresh.pdf", data: PDF(9, "C") }, { name: "old.pdf", data: PDF(9, "D") }]);
  const rows = (await c.call("GET", "/api/uploads")).data; const id = (n) => rows.find((x) => x.name === n).id;
  assert.equal((await c.call("PUT", "/api/uploads/settings", { doneRetentionDays: 2 })).data.doneRetentionDays, 2);
  await c.call("PATCH", `/api/uploads/${id("done.pdf")}`, { status: "done" }); await c.call("PATCH", `/api/uploads/${id("keep.pdf")}`, { status: "done", protected: true });
  await c.call("PATCH", `/api/uploads/${id("fresh.pdf")}`, { status: "done" });
  await ctx.pool.query("UPDATE customer_uploads SET status_at = now() - interval '3 days' WHERE id = ANY($1::uuid[])", [[id("done.pdf"), id("keep.pdf")]]);
  await ctx.pool.query("UPDATE customer_uploads SET created_at = now() - interval '40 days' WHERE id = ANY($1::uuid[])", [[id("old.pdf"), id("keep.pdf")]]);
  const n = await sweepExpired(ctx.pool, ctx.cfg);
  assert.ok(n >= 2);
  const left = (await c.call("GET", "/api/uploads")).data.map((x) => x.name).sort();
  assert.deepEqual(left, ["fresh.pdf", "keep.pdf"]);
});

// ── ضدویروس ──
function mockClamd({ evil = "EVILMOCK", hang = false } = {}) {
  const state = { scans: 0, bytes: 0, last: null };
  const srv = net.createServer((sock) => {
    let buf = Buffer.alloc(0), mode = null, body = [], total = 0;
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (!mode) { const z = buf.indexOf(0); if (z < 0) return; const cmd = buf.subarray(0, z).toString(); buf = buf.subarray(z + 1); if (cmd === "zPING") { sock.write("PONG\0"); return; } if (cmd !== "zINSTREAM") { sock.end("UNKNOWN COMMAND\0"); return; } mode = "stream"; }
      while (mode === "stream" && buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) { state.scans++; state.bytes = total; const all = Buffer.concat(body); state.last = all; if (!hang) sock.end(all.includes(evil) ? "stream: Mock.Evil.Signature FOUND\0" : "stream: OK\0"); mode = "done"; return; }
        if (buf.length < 4 + len) return;
        body.push(buf.subarray(4, 4 + len)); total += len; buf = buf.subarray(4 + len);
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((res) => srv.listen(0, "127.0.0.1", () => res({ srv, port: srv.address().port, state })));
}
const deadPort = async () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

test("ضدویروس (پروتکل INSTREAM با سرور ساختگی): قطعه‌بندی بی‌نقص، آلوده رد، تمیز clean؛ مسیر مستقیم scanFileViaClamd", async () => {
  const m = await mockClamd(); const f = path.join(os.tmpdir(), "av-" + crypto.randomUUID());
  try {
    const big = crypto.randomBytes(3 * 1024 * 1024 + 123); fs.writeFileSync(f, big);
    assert.deepEqual(await scanFileViaClamd(f, { host: "127.0.0.1", port: m.port }), { status: "clean" });
    assert.equal(m.state.bytes, big.length); assert.ok(m.state.last.equals(big), "همهٔ بایت‌ها بدون تغییر رسید");
    fs.writeFileSync(f, Buffer.concat([Buffer.from("xx"), Buffer.from("EVILMOCK")])); assert.deepEqual(await scanFileViaClamd(f, { host: "127.0.0.1", port: m.port }), { status: "infected", signature: "Mock.Evil.Signature" });
    assert.equal(await pingClamd({ host: "127.0.0.1", port: m.port }), true);
    assert.equal((await scanFileViaClamd(f, { host: "127.0.0.1", port: await deadPort() })).status, "error");
    const h = await mockClamd({ hang: true }); assert.equal((await scanFileViaClamd(f, { host: "127.0.0.1", port: h.port, timeoutMs: 400 })).message, "timeout"); h.srv.close();
  } finally { m.srv.close(); fs.rmSync(f, { force: true }); }
});

test("ضدویروس در مسیر آپلود: required (آلوده رد + ثبت، قطع‌بودن clamd → ۵۰۳)، optional (بدون اسکن پذیرفته می‌شود)", async () => {
  const m = await mockClamd();
  const x = await boot({ UPLOAD_AV_MODE: "required", CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(m.port) });
  const o = await reg(x, "own-av@up2.test", "کافه‌ضدویروس"); const code = (await o.call("GET", "/api/uploads/settings")).data.code;
  const set = (await o.call("GET", "/api/uploads/settings")).data; assert.deepEqual(set.av, { mode: "required", engine: "clamav", available: true });
  const ok = await send(x.app, code, {}, [{ name: "ok.pdf", data: PDF() }]); assert.equal(ok.statusCode, 201); assert.equal(J(ok).data.scanned, true);
  assert.equal((await o.call("GET", "/api/uploads")).data[0].scan, "clean");
  const virus = await send(x.app, code, {}, [{ name: "fine.pdf", data: PDF(5, "B") }, { name: "bad.pdf", data: Buffer.concat([PDF(), Buffer.from("EVILMOCK")]) }]);
  assert.equal(virus.statusCode, 422); assert.equal(J(virus).error.code, "infected"); assert.match(J(virus).error.message, /bad\.pdf/);
  assert.equal((await o.call("GET", "/api/uploads")).data.length, 1, "کل ارسال آلوده رد شد (همه‌یا‌هیچ)");
  assert.equal(fs.readdirSync(tmpDir(x.cfg)).length, 0, "فایل موقت پاک شد");
  const bl = (await o.call("GET", "/api/uploads/blocked")).data; assert.equal(bl.length, 1); assert.equal(bl[0].name, "bad.pdf"); assert.match(bl[0].reason, /Mock\.Evil/);
  assert.equal((await o.call("GET", "/api/uploads/summary")).data.blocked7d, 1);
  m.srv.close(); await new Promise((r) => setTimeout(r, 50));
  const down = await send(x.app, code, {}, [{ name: "later.pdf", data: PDF(7, "C") }]); assert.equal(down.statusCode, 503); assert.equal(J(down).error.code, "av_unavailable");
  assert.equal((await o.call("GET", "/api/uploads")).data.length, 1, "fail-closed: چیزی ذخیره نشد");
  // optional: همان قطعی، فایل بدون اسکن (scan=skipped) ذخیره می‌شود
  const y = await boot({ UPLOAD_AV_MODE: "optional", CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(await deadPort()) });
  const o2 = await reg(y, "own-av2@up2.test", "کافه‌اختیاری"); const code2 = (await o2.call("GET", "/api/uploads/settings")).data.code;
  const r2 = await send(y.app, code2, {}, [{ name: "z.pdf", data: PDF() }]); assert.equal(r2.statusCode, 201); assert.equal(J(r2).data.scanned, false);
  assert.equal((await o2.call("GET", "/api/uploads")).data[0].scan, "skipped");
  // پیش‌فرض: بدون clamd → off
  assert.equal(ctx.cfg.uploadAvMode, "off"); assert.equal((await O("GET", "/api/uploads/settings")).data.av.mode, "off");
});

const realClamd = await pingClamd({ host: "127.0.0.1", port: 3310 });
test("ضدویروس با clamd واقعی (EICAR): آلوده رد، تمیز پذیرفته؛ فایل بزرگ ۱۵ مگابایتی بی‌خطا", { skip: realClamd ? false : "clamd روی 127.0.0.1:3310 در دسترس نیست" }, async () => {
  const x = await boot({ CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: "3310" });
  assert.equal(x.cfg.uploadAvMode, "required");
  const o = await reg(x, "own-real@up2.test", "کافه‌clamd"); const code = (await o.call("GET", "/api/uploads/settings")).data.code;
  assert.equal((await o.call("GET", "/api/uploads/settings")).data.av.available, true);
  const bad = await send(x.app, code, {}, [{ name: "eicar.txt", data: EICAR }]);
  assert.equal(bad.statusCode, 422, bad.body); assert.equal(J(bad).error.code, "infected");
  assert.equal((await o.call("GET", "/api/uploads/blocked")).data[0].reason.includes("Cafino.Test.Eicar"), true);
  const clean = await send(x.app, code, {}, [{ name: "hello.txt", data: Buffer.from("سلام دنیا") }, { name: "big.pdf", data: PDF(15 * 1048576, "Q") }]);
  assert.equal(clean.statusCode, 201, clean.body); assert.equal(J(clean).data.scanned, true);
  assert.deepEqual((await o.call("GET", "/api/uploads")).data.map((f) => f.scan), ["clean", "clean"]);
});
