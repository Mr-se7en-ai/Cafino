// پیامک (ملی پیامک): ورود با کد، تأیید موبایل در ثبت‌نام، اتصال پنل کافی‌نت و ارسال به مشتریان — با یک سرور HTTP جعلیِ ملی پیامک (مسیر واقعی HTTP/فرم).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { solveForTest } from "../src/lib/loginCaptcha.js";
import { normalizeMobile, smsParts, maskMobile } from "../src/lib/sms.js";
import { loadConfig } from "../src/config.js";

// ── سرور جعلی ملی پیامک ────────────────────────────────────────────────────────────────────────────────────────────────
const fake = { calls: [], badTo: new Set(), noCredit: false, down: false, validUser: "u1", validPass: "p1", seq: 1000000000 };
let srv, base;
const form = (body) => Object.fromEntries(new URLSearchParams(body));
function startFake() {
  srv = http.createServer((req, res) => {
    let raw = ""; req.on("data", (d) => { raw += d; });
    req.on("end", () => {
      const f = form(raw), ep = req.url.split("/").pop();
      fake.calls.push({ ep, ...f });
      const reply = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (fake.down) return reply({}, 503);
      const auth = fake.platformUser ? [fake.platformUser, fake.platformPass] : [fake.validUser, fake.validPass];
      const ok = (f.username === fake.validUser && f.password === fake.validPass) || (f.username === auth[0] && f.password === auth[1]);
      if (!ok) return reply({ Value: "0", RetStatus: 0, StrRetStatus: "UserNameOrPasswordInvalid" });
      if (ep === "GetCredit") return reply({ Value: "1500", RetStatus: 1, StrRetStatus: "Ok" });
      if (fake.noCredit) return reply({ Value: "2", RetStatus: 0, StrRetStatus: "Failed" });
      if (fake.badTo.has(f.to)) return reply({ Value: "35", RetStatus: 0, StrRetStatus: "Failed" });
      return reply({ Value: String(++fake.seq), RetStatus: 1, StrRetStatus: "Ok" });
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${srv.address().port}/api/SendSMS`; r(); }));
}
const lastOtp = () => { const c = [...fake.calls].reverse().find((x) => x.ep === "BaseServiceNumber"); return c?.text; };

let db, plat, noSms;
const PW = "رمز-خیلی-قوی-۱۲۳";
const ENV = () => ({ MELIPAYAMAK_USERNAME: "plat", MELIPAYAMAK_PASSWORD: "platpw", MELIPAYAMAK_OTP_BODY_ID: "98765", MELIPAYAMAK_API_BASE: base, SMS_OTP_RESEND_SEC: "10" });
before(async () => {
  await startFake();
  fake.platformUser = "plat"; fake.platformPass = "platpw";
  db = await startDb();
  plat = await makeApp(db, { env: ENV() });
  noSms = await makeApp(db, { env: { MELIPAYAMAK_API_BASE: base } });   // بدون حساب پلتفرم؛ فقط نشانی جعلی برای پنل کافی‌نت‌ها
});
after(async () => { await plat?.app.close(); await plat?.pool.end(); await noSms?.app.close(); await noSms?.pool.end(); await stopDb(); srv?.close(); });

const ipN = (() => { let n = 0; return () => `10.9.${Math.floor(++n / 250)}.${n % 250}`; })();
const send = async (app, body, ip = ipN()) => { const r = await app.inject({ method: "POST", url: "/api/auth/sms/send", remoteAddress: ip, headers: { "content-type": "application/json" }, payload: body }); return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null }; };
const withCaptcha = async (ctx, body, ip) => { const c = JSON.parse((await ctx.app.inject({ method: "GET", url: "/api/auth/captcha" })).body).data; return send(ctx.app, { ...body, captchaId: c.id, captchaAnswer: solveForTest(ctx.cfg, c.id) }, ip); };
const ageOtps = (ctx) => ctx.pool.query("UPDATE sms_otps SET created_at = created_at - interval '5 minutes'");
const post = (ctx, url, body, ip = ipN()) => ctx.app.inject({ method: "POST", url, remoteAddress: ip, headers: { "content-type": "application/json" }, payload: body }).then((r) => ({ status: r.statusCode, json: r.body ? JSON.parse(r.body) : null }));

async function registerOwner(ctx, { email, phone, shop = "کافی‌نت", sms = true }) {
  if (sms) { const s = await withCaptcha(ctx, { phone, purpose: "register" }); assert.equal(s.status, 202, JSON.stringify(s.json)); }
  const r = await post(ctx, "/api/auth/register", { email, password: PW, firstName: "ع", lastName: "ر", phone, shopName: shop, ...(sms ? { smsCode: lastOtp() } : {}) });
  return r;
}

test("نرمال‌سازی موبایل و شمارش بخش پیامک", () => {
  for (const [i, o] of [["09123456789", "09123456789"], ["۰۹۱۲۳۴۵۶۷۸۹", "09123456789"], ["+98 912 345 6789", "09123456789"], ["0098-912-345-6789", "09123456789"], ["989123456789", "09123456789"], ["9123456789", "09123456789"], ["٠٩١٢٣٤٥٦٧٨٩", "09123456789"], ["0912345678", ""], ["02112345678", ""], ["abc", ""], ["", ""], [null, ""]]) assert.equal(normalizeMobile(i), o, String(i));
  assert.equal(maskMobile("09123456789"), "0912***6789");
  assert.equal(smsParts(""), 0); assert.equal(smsParts("سلام"), 1); assert.equal(smsParts("ا".repeat(70)), 1); assert.equal(smsParts("ا".repeat(71)), 2); assert.equal(smsParts("a".repeat(160)), 1); assert.equal(smsParts("a".repeat(161)), 2);
});

test("پیکربندی: حساب ناقص یا HTTP غیرمجاز در problems می‌آید؛ بدون env پیامک خاموش است", () => {
  const e = { DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40) };
  const off = loadConfig(e); assert.equal(off.smsPlatformOn, false); assert.deepEqual(off.problems, []);
  assert.ok(loadConfig({ ...e, MELIPAYAMAK_USERNAME: "u" }).problems.some((p) => /ناقص/.test(p)));
  assert.ok(loadConfig({ ...e, MELIPAYAMAK_USERNAME: "u", MELIPAYAMAK_PASSWORD: "p", MELIPAYAMAK_FROM: "3000", MELIPAYAMAK_API_BASE: "http://evil.example/api" }).problems.some((p) => /HTTPS/.test(p)));
  const good = loadConfig({ ...e, MELIPAYAMAK_USERNAME: "u", MELIPAYAMAK_PASSWORD: "p", MELIPAYAMAK_FROM: "3000" });
  assert.equal(good.smsPlatformOn, true); assert.deepEqual(good.problems, []);
});

test("بدون حساب پلتفرم: گزینهٔ پیامک خاموش، ثبت‌نام مثل قبل بدون کد", async () => {
  const cfgR = await client(noSms.app).get("/api/auth/sms/config");
  assert.deepEqual([cfgR.data.login, cfgR.data.register], [false, false]);
  assert.equal((await post(noSms, "/api/auth/sms/send", { phone: "09120000001", purpose: "login" })).json.error.code, "sms_disabled");
  assert.equal((await client(noSms.app).get("/api/auth/captcha")).status, 404, "کپچای ورود خاموش و پیامک هم خاموش → ۴۰۴");
  const r = await registerOwner(noSms, { email: "nosms@cafe.test", phone: "09120000001", sms: false });
  assert.equal(r.status, 201);
});

test("ثبت‌نام با پیامک: بدون کد/شمارهٔ بد رد، کپچا لازم، کد غلط رد، کد درست → حساب با موبایل تأییدشده", async () => {
  const cfgR = await client(plat.app).get("/api/auth/sms/config");
  assert.deepEqual([cfgR.data.login, cfgR.data.register, cfgR.data.codeLength], [true, true, 6]);
  const body = { email: "o1@cafe.test", password: PW, firstName: "ع", lastName: "ر", shopName: "الف" };
  assert.equal((await post(plat, "/api/auth/register", { ...body, phone: "123" })).status, 422);
  assert.equal((await post(plat, "/api/auth/register", { ...body, phone: "09121110001" })).json.error.code, "sms_code_required");
  assert.equal((await post(plat, "/api/auth/sms/send", { phone: "09121110001", purpose: "register" })).json.error.code, "captcha_required", "بدون کپچا پیامک نمی‌رود");
  assert.equal(fake.calls.filter((c) => c.ep === "BaseServiceNumber").length, 0);
  const s = await withCaptcha(plat, { phone: "۰۹۱۲۱۱۱۰۰۰۱", purpose: "register" });
  assert.equal(s.status, 202); assert.equal(s.json.data.expiresIn, 300);
  const call = fake.calls.filter((c) => c.ep === "BaseServiceNumber").at(-1);
  assert.equal(call.bodyId, "98765"); assert.equal(call.to, "09121110001"); assert.match(call.text, /^\d{6}$/);
  const code = call.text;
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
  assert.equal((await post(plat, "/api/auth/register", { ...body, phone: "09121110001", smsCode: wrong })).json.error.code, "invalid_code");
  const ok = await post(plat, "/api/auth/register", { ...body, phone: "09121110001", smsCode: code.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) });
  assert.equal(ok.status, 201, JSON.stringify(ok.json)); assert.equal(ok.json.data.user.phoneVerified, true);
  const u = (await plat.pool.query("SELECT phone, phone_norm, phone_verified_at FROM users WHERE email='o1@cafe.test'")).rows[0];
  assert.equal(u.phone_norm, "09121110001"); assert.ok(u.phone_verified_at);
  assert.equal((await post(plat, "/api/auth/register", { ...body, phone: "09121110001", smsCode: code })).status >= 400, true, "کد مصرف‌شده دوباره کار نمی‌کند");
  const again = await withCaptcha(plat, { phone: "09121110001", purpose: "register" });
  assert.equal(again.json.error.code, "phone_taken", "یک شماره برای دو حساب ثبت نمی‌شود");
});

test("کد در پایگاه‌داده به‌صورت HMAC است نه خود کد", async () => {
  await withCaptcha(plat, { phone: "09121110002", purpose: "register" });
  const code = lastOtp();
  const rows = (await plat.pool.query("SELECT code_hash FROM sms_otps WHERE phone='09121110002'")).rows;
  assert.ok(rows.length >= 1); for (const r of rows) { assert.equal(r.code_hash.length, 64); assert.ok(!r.code_hash.includes(code)); }
});

test("ورود با پیامک: شمارهٔ ثبت‌شده و ناشناخته پاسخ یکسان؛ ناشناخته پیامک نمی‌گیرد؛ کد غلط/مصرف‌شده رد", async () => {
  await ageOtps(plat);
  const before = fake.calls.length;
  const unknown = await withCaptcha(plat, { phone: "09129999999", purpose: "login" });
  assert.equal(fake.calls.length, before, "برای شمارهٔ ناشناخته پیامکی نرفت");
  const known = await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  assert.equal(fake.calls.length, before + 1);
  assert.deepEqual(Object.keys(unknown.json.data).sort(), Object.keys(known.json.data).sort());
  assert.equal(unknown.status, known.status);
  const code = lastOtp(), wrong = String((Number(code) + 7) % 1000000).padStart(6, "0");
  assert.equal((await post(plat, "/api/auth/sms/login", { phone: "09121110001", code: wrong })).status, 401);
  assert.equal((await post(plat, "/api/auth/sms/login", { phone: "09129999999", code })).status, 401, "همان کد برای شمارهٔ دیگر بی‌اثر");
  const ok = await post(plat, "/api/auth/sms/login", { phone: "09121110001", code });
  assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.ok(ok.json.data.accessToken); assert.equal(ok.json.data.user.email, "o1@cafe.test");
  assert.equal((await post(plat, "/api/auth/sms/login", { phone: "09121110001", code })).status, 401, "یک‌بارمصرف");
  const audit = (await plat.pool.query("SELECT 1 FROM audit_log WHERE action='auth.login_sms'")).rows;
  assert.ok(audit.length >= 1);
});

test("بعد از ۵ حدس غلط حتی کد درست هم کار نمی‌کند؛ کد منقضی رد می‌شود", async () => {
  await ageOtps(plat);
  await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  const code = lastOtp(), wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
  for (let i = 0; i < 5; i++) assert.equal((await post(plat, "/api/auth/sms/login", { phone: "09121110001", code: wrong })).status, 401);
  assert.equal((await post(plat, "/api/auth/sms/login", { phone: "09121110001", code })).status, 401);
  await ageOtps(plat);
  await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  const c2 = lastOtp();
  await plat.pool.query("UPDATE sms_otps SET expires_at = now() - interval '1 second' WHERE phone='09121110001' AND used_at IS NULL");
  assert.equal((await post(plat, "/api/auth/sms/login", { phone: "09121110001", code: c2 })).status, 401, "منقضی");
});

test("فاصلهٔ ارسال مجدد و سقف ساعتی برای هر شماره", async () => {
  await ageOtps(plat);
  const first = await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  assert.equal(first.status, 202);
  const second = await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  assert.equal(second.status, 429); assert.equal(second.json.error.code, "sms_wait");
  for (let i = 0; i < 6; i++) { await ageOtps(plat); await withCaptcha(plat, { phone: "09121110001", purpose: "login" }); }
  await ageOtps(plat);
  const lim = await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  assert.equal(lim.status, 429); assert.equal(lim.json.error.code, "sms_limit");
});

test("خطای ملی پیامک: ارسال کد ناموفق → ۵۰۲ و کد باطل؛ اعتبار تمام → ۵۰۳ بدون افشای جزئیات", async () => {
  await plat.pool.query("DELETE FROM sms_otps");
  fake.down = true;
  const r = await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  fake.down = false;
  assert.equal(r.status, 502); assert.equal(r.json.error.code, "sms_send_failed");
  assert.equal((await plat.pool.query("SELECT count(*)::int n FROM sms_otps WHERE used_at IS NULL")).rows[0].n, 0);
  await plat.pool.query("DELETE FROM sms_otps");
  fake.noCredit = true;
  const r2 = await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  fake.noCredit = false;
  assert.equal(r2.status, 503); assert.equal(r2.json.error.code, "sms_unavailable"); assert.ok(!JSON.stringify(r2.json).includes("اعتبار"));
});

test("تأیید موبایل برای کاربر واردشده؛ شمارهٔ تأییدشدهٔ دیگری قابل‌گرفتن نیست؛ ورود با پیامک بعد از تأیید", async () => {
  const reg = await registerOwner(noSms, { email: "late@cafe.test", phone: "", sms: false });   // حساب بدون موبایل تأییدشده (روی noSms ثبت شد؛ همان پایگاه‌داده)
  assert.equal(reg.status, 201);
  const token = reg.json.data.accessToken;
  const bearer = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const call = (url, payload) => plat.app.inject({ method: "POST", url, remoteAddress: ipN(), headers: bearer, payload }).then((r) => ({ status: r.statusCode, json: r.body ? JSON.parse(r.body) : null }));
  assert.equal((await call("/api/auth/phone/send", { phone: "09121110001" })).json.error.code, "phone_taken");
  await ageOtps(plat);
  assert.equal((await call("/api/auth/phone/send", { phone: "09125550000" })).status, 202);
  const code = lastOtp();
  assert.equal((await call("/api/auth/phone/verify", { phone: "09125550000", code: "000000" })).status, 400);
  assert.equal((await call("/api/auth/phone/verify", { phone: "09125550000", code })).status, 200);
  const u = (await plat.pool.query("SELECT phone_norm, phone_verified_at FROM users WHERE email='late@cafe.test'")).rows[0];
  assert.equal(u.phone_norm, "09125550000"); assert.ok(u.phone_verified_at);
  await ageOtps(plat);
  assert.equal((await withCaptcha(plat, { phone: "09125550000", purpose: "login" })).status, 202);
  assert.equal((await post(plat, "/api/auth/sms/login", { phone: "09125550000", code: lastOtp() })).status, 200);
  assert.equal((await plat.app.inject({ method: "POST", url: "/api/auth/phone/send", payload: { phone: "09125550000" }, headers: { "content-type": "application/json" } })).statusCode, 401, "بدون ورود نمی‌شود");
});

test("کافی‌نت تعلیق‌شده با پیامک وارد نمی‌شود", async () => {
  await ageOtps(plat);
  const cafe = (await plat.pool.query("SELECT cafe_id FROM users WHERE phone_norm='09121110001'")).rows[0].cafe_id;
  await plat.pool.query("UPDATE cafes SET status='suspended' WHERE id=$1", [cafe]);
  await withCaptcha(plat, { phone: "09121110001", purpose: "login" });
  const r = await post(plat, "/api/auth/sms/login", { phone: "09121110001", code: lastOtp() });
  await plat.pool.query("UPDATE cafes SET status='active' WHERE id=$1", [cafe]);
  assert.equal(r.status, 403); assert.equal(r.json.error.code, "cafe_suspended");
});

// ── پیامک به مشتریان (حساب خود کافی‌نت) ───────────────────────────────────────────────────────────────────────────────────
let owner, o, staffTok, other;
async function mkOwner(ctx, email) {
  const r = await client(ctx.app).post("/api/auth/register", { email, password: PW, firstName: "ع", lastName: "ر", phone: "", shopName: email });
  assert.equal(r.status, 201, JSON.stringify(r.json)); return r.data.accessToken;
}
const api = (ctx, tok) => async (method, url, body) => { const r = await ctx.app.inject({ method, url, headers: { authorization: `Bearer ${tok}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, payload: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null, data: r.body ? JSON.parse(r.body)?.data : null }; };

test("اتصال پنل: رمز غلط رد؛ رمز درست ذخیره و رمزنگاری؛ پاسخ هیچ‌وقت رمز ندارد", async () => {
  owner = await mkOwner(noSms, "sms-owner@cafe.test"); o = api(noSms, owner);
  assert.equal((await o("GET", "/api/sms")).data.connected, false);
  assert.equal((await o("POST", "/api/sms/send", { text: "x", recipients: [{ phone: "09120000000" }] })).json.error.code, "sms_not_connected");
  assert.equal((await o("PUT", "/api/sms", { username: "u1", password: "bad", from: "30001234" })).json.error.code, "sms_bad_credentials");
  assert.equal((await o("PUT", "/api/sms", { username: "u1", password: "p1", from: "abc" })).status, 422);
  const ok = await o("PUT", "/api/sms", { username: "u1", password: "p1", from: "30001234" });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.deepEqual([ok.data.connected, ok.data.enabled, ok.data.from, ok.data.usernameHint], [true, true, "30001234", "**"]);
  assert.ok(!JSON.stringify(ok.json).includes("p1\""), "رمز در پاسخ نیست");
  const row = (await noSms.pool.query("SELECT username_enc, password_enc FROM sms_connections")).rows[0];
  assert.ok(row.password_enc.startsWith("v1.") && !row.password_enc.includes("p1") && !row.username_enc.includes("u1"));
  assert.equal((await o("GET", "/api/sms/credit")).data.credit, 1500);
});

test("مجوزها: کارمند پیش‌فرض نه می‌بیند نه می‌فرستد؛ با مجوز sms.send می‌فرستد ولی اتصال را عوض نمی‌کند", async () => {
  const inv = await o("POST", "/api/users/invite", { email: "sms-staff@cafe.test", firstName: "ر", lastName: "م", role: "staff" });
  const first = await client(noSms.app).post("/api/auth/login", { email: "sms-staff@cafe.test", password: inv.data.temporaryPassword });
  const chg = await api(noSms, first.data.accessToken)("POST", "/api/auth/password", { currentPassword: inv.data.temporaryPassword, newPassword: "رمز-کارمند-قوی-۷۷۷" });
  assert.equal(chg.status, 200, JSON.stringify(chg.json));          // بدون تغییر رمز موقت، همهٔ مسیرها ۴۰۳ password_change_required است (نه مجوز)
  staffTok = chg.data.accessToken; const s = api(noSms, staffTok);
  const denied = await s("GET", "/api/sms"); assert.equal(denied.status, 403); assert.equal(denied.json.error.code, "permission_denied");
  assert.equal((await s("POST", "/api/sms/send", { text: "x", recipients: [{ phone: "09120000000" }] })).json.error.code, "permission_denied");
  const pol = await o("GET", "/api/permissions");
  assert.ok(pol.data.catalogue.some((c) => c.key === "sms.send") && pol.data.catalogue.some((c) => c.key === "sms.manage"));
  const grant = await o("PUT", "/api/permissions", { roles: { staff: { grant: ["sms.send"] } } });
  assert.equal(grant.status, 200, JSON.stringify(grant.json));
  const seen = await s("GET", "/api/sms"); assert.equal(seen.status, 200, JSON.stringify(seen.json));
  assert.equal((await s("PUT", "/api/sms", { username: "u1", password: "p1", from: "30001234" })).status, 403);
  assert.equal((await s("DELETE", "/api/sms")).status, 403);
  assert.equal((await s("POST", "/api/sms/test", { to: "09120000000" })).status, 403, "پیام آزمایشی فقط با sms.manage");
});

test("ارسال به مشتریان: قالب {نام}، شمارهٔ فارسی/تکراری/نامعتبر، ثبت سابقه، گزارش هر گیرنده", async () => {
  fake.calls.length = 0; fake.badTo.add("09123330003");
  const batchId = "11111111-1111-4111-8111-111111111111";
  const r = await o("POST", "/api/sms/send", { batchId, text: "سلام {نام}، کافی‌نت امروز تا ۲۰ باز است", recipients: [
    { name: "علی", phone: "۰۹۱۲۳۳۳۰۰۰۱", ref: "c1" }, { name: "رضا", phone: "+989123330002", ref: "c2" }, { name: "بد", phone: "09123330003", ref: "c3" },
    { name: "تکراری", phone: "09123330001" }, { name: "خراب", phone: "12" }, { phone: "09123330004" }] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual([r.data.total, r.data.sent, r.data.failed, r.data.skipped.length], [4, 3, 1, 2]);
  const texts = Object.fromEntries(fake.calls.filter((c) => c.ep === "SendSMS").map((c) => [c.to, c.text]));
  assert.equal(texts["09123330001"], "سلام علی، کافی‌نت امروز تا ۲۰ باز است");
  assert.equal(texts["09123330004"], "سلام مشتری گرامی، کافی‌نت امروز تا ۲۰ باز است");
  assert.ok(fake.calls.filter((c) => c.ep === "SendSMS").every((c) => c.from === "30001234" && c.username === "u1"));
  assert.equal(r.data.results.find((x) => x.phone === "09123330003").status, "failed");
  const log = await o("GET", `/api/sms/messages?batchId=${batchId}`);
  assert.equal(log.data.length, 4); assert.equal(log.data.filter((m) => m.status === "failed").length, 1);
  assert.equal((await o("GET", "/api/sms/messages?customerRef=c1")).data.length, 1);
  assert.equal((await o("POST", "/api/sms/send", { batchId, text: "x", recipients: [{ phone: "09123330001" }] })).json.error.code, "duplicate_batch", "ارسال دوبارهٔ همان batch");
});

test("اعتبار تمام‌شده: ارسال متوقف می‌شود، خطا برای همه ثبت و وضعیت اتصال خطا می‌شود", async () => {
  fake.calls.length = 0; fake.noCredit = true;
  const r = await o("POST", "/api/sms/send", { text: "سلام", recipients: Array.from({ length: 10 }, (_, i) => ({ phone: `0912444000${i}` })) });
  fake.noCredit = false;
  assert.equal(r.status, 200); assert.equal(r.data.sent, 0); assert.equal(r.data.stopped, true);
  assert.ok(fake.calls.filter((c) => c.ep === "SendSMS").length <= 4, "بعد از اولین خطای اعتبار، تماس تازه‌ای نرفت");
  assert.match((await o("GET", "/api/sms")).data.lastError, /اعتبار/);
  assert.ok(r.data.results.every((x) => /اعتبار/.test(x.error)));
});

test("اعتبارسنجی ارسال: متن خالی/بلند، گیرندهٔ زیاد، فهرست بدون شمارهٔ معتبر", async () => {
  assert.equal((await o("POST", "/api/sms/send", { text: "  ", recipients: [{ phone: "09120000000" }] })).status, 422);
  assert.equal((await o("POST", "/api/sms/send", { text: "ا".repeat(501), recipients: [{ phone: "09120000000" }] })).status, 422);
  assert.equal((await o("POST", "/api/sms/send", { text: "x", recipients: Array.from({ length: 301 }, (_, i) => ({ phone: `09${String(100000000 + i)}` })) })).status, 422);
  assert.equal((await o("POST", "/api/sms/send", { text: "x", recipients: [{ phone: "12" }] })).status, 422);
  assert.equal((await o("POST", "/api/sms/send", { text: "x", recipients: [] })).status, 422);
});

test("خاموش‌کردن اتصال، پیام آزمایشی، جداسازی کافی‌نت‌ها و حذف اتصال", async () => {
  assert.equal((await o("PATCH", "/api/sms", { enabled: false })).data.enabled, false);
  assert.equal((await o("POST", "/api/sms/send", { text: "x", recipients: [{ phone: "09120000000" }] })).json.error.code, "sms_disabled");
  await o("PATCH", "/api/sms", { enabled: true });
  fake.calls.length = 0;
  assert.equal((await o("POST", "/api/sms/test", { to: "۰۹۱۲۰۰۰۰۰۰۰" })).data.ok, true);
  assert.equal(fake.calls.at(-1).to, "09120000000");
  other = api(noSms, await mkOwner(noSms, "sms-other@cafe.test"));
  assert.equal((await other("GET", "/api/sms")).data.connected, false, "اتصال کافی‌نت دیگر دیده نمی‌شود");
  assert.equal((await other("GET", "/api/sms/messages")).data.length, 0, "سابقهٔ کافی‌نت دیگر دیده نمی‌شود");
  assert.equal((await o("DELETE", "/api/sms")).status, 204);
  assert.equal((await o("GET", "/api/sms")).data.connected, false);
  assert.equal((await noSms.pool.query("SELECT count(*)::int n FROM sms_connections")).rows[0].n, 0, "رمز ذخیره‌شده حذف شد");
});
