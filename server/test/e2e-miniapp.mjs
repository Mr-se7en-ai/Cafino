// E2E مینی‌اپ: سرور واقعی + PostgreSQL واقعی + Chromium واقعی (Playwright) + Bot API جعلی + «تلگرام شبیه‌سازی‌شده» (window.Telegram.WebApp ساختگی).
// با تلگرام واقعی آزمایش نمی‌شود (شبکهٔ این محیط بسته است). اجرا: node test/e2e-miniapp.mjs [پوشهٔ تصاویر]
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
const { chromium } = createRequire(import.meta.url)("playwright");
const SHOTS = process.argv[2] || "/tmp/miniapp-shots"; fs.mkdirSync(SHOTS, { recursive: true });
const TOKEN = "555555555:AAE2E_fake_token_for_tests_000000001", PW = "رمز-خیلی-قوی-۱۲۳";
const must = (c, m) => { if (!c) { console.error("✗ FAIL:", m); process.exitCode = 1; throw new Error(m); } console.log("✓", m); };

function sign(user, token = TOKEN) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAHx", user: JSON.stringify(user) });
  const check = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join("\n");
  p.set("hash", crypto.createHmac("sha256", crypto.createHmac("sha256", "WebAppData").update(token).digest()).update(check).digest("hex"));
  return p.toString();
}
// Bot API جعلی (فقط برای راه‌اندازی ربات)
const fake = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { const m = /^\/bot[^/]+\/(\w+)$/.exec(req.url); res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(m && m[1] === "getMe" ? { ok: true, result: { id: 555555555, is_bot: true, username: "cafino_e2e_bot" } } : m && m[1] === "getUpdates" ? { ok: true, result: [] } : { ok: true, result: true })); }); });
await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
const url = await startDb();
const ctx = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", BOTS_ENABLED: "false", TELEGRAM_API_BASE: `http://127.0.0.1:${fake.address().port}`, MINIAPP_BOT_TOKEN: TOKEN, MINIAPP_URL: "http://127.0.0.1/m", MINIAPP_AUTH_RATE_PER_MIN: "5000" } });
await ctx.app.listen({ port: 0, host: "127.0.0.1" });
const base = `http://127.0.0.1:${ctx.app.server.address().port}`;
let browser;
try {
  const c = client(ctx.app), reg = await c.post("/api/auth/register", { email: "own@e2e.test", password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: "گیم‌نت آرتین" });
  const O = (m, u, b) => c.call(m, u, { body: b, bearer: reg.data.accessToken });
  const info = await O("GET", "/api/miniapp/info"); must(info.status === 200, "اطلاعات مینی‌اپ سمت کافی‌نت");
  const cafe = (await ctx.pool.query("SELECT id FROM cafes LIMIT 1")).rows[0].id, code = (await ctx.pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafe])).rows[0].code;
  await ctx.pool.query("UPDATE upload_settings SET show_shop_info=true, shop_address='تهران، خیابان آزادی، پلاک ۱۲', shop_phone='02166001122', shop_mobile='09121112233' WHERE cafe_id=$1", [cafe]);
  await ctx.pool.query("INSERT INTO customers (cafe_id,id,first_name,last_name,phone) VALUES ($1,'c1','علی','رضایی','09123334455')", [cafe]);
  await ctx.pool.query("INSERT INTO invoices (cafe_id,id,customer_id,status,remaining_amount,total_amount) VALUES ($1,'i1','c1','unpaid',1250000,1250000)", [cafe]);
  await ctx.pool.query("INSERT INTO orders (cafe_id,id,customer_id,title,status,amount) VALUES ($1,'o1','c1','چاپ ۲۰ برگ A4 رنگی','inprogress',800000),($1,'o2','c1','اسکن مدارک','delivered',150000)", [cafe]);
  await ctx.pool.query("INSERT INTO customer_uploads (cafe_id,batch_id,batch_code,original_name,storage_key,size,sha256,sender_phone,customer_ref,status) VALUES ($1,$3,'12345','a.pdf',$2,1,'x','09123334455','','seen')", [cafe, crypto.randomUUID(), crypto.randomUUID()]);
  const put = await O("PUT", "/api/miniapp/tariff", { groups: [{ cat: "چاپ", items: [{ name: "پرینت A4 سیاه‌سفید", price: 20000 }, { name: "پرینت A4 رنگی", price: 80000 }] }, { cat: "اسکن", items: [{ name: "اسکن هر برگ", price: 30000 }] }] });
  must(put.status === 200 && put.data.changed, "همگام‌سازی تعرفه از سمت کافی‌نت");

  browser = await chromium.launch();
  const user = { id: 9001, first_name: "علی", last_name: "رضایی", username: "ali", language_code: "fa" };
  const sdk = (verified) => `window.__contactAsked=0;window.Telegram={WebApp:{initData:new URLSearchParams(location.hash.slice(1)).get('tgWebAppData')||'',colorScheme:window.__scheme||'light',ready(){},expand(){},close(){},openLink(u){window.__opened=u},isVersionAtLeast(){return true},requestContact(cb){window.__contactAsked++;fetch('/__verify').then(()=>cb(true))},HapticFeedback:{impactOccurred(){}}}};`;
  const open = async (scheme, hash, { sdkOn = true, withCafe = true } = {}) => {
    const ctxb = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, locale: "fa-IR", colorScheme: scheme });
    const page = await ctxb.newPage(), errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.route("https://tapi.bale.ai/**", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));   // SDK بله (1.86): شبکه بسته است
    await page.route("https://telegram.org/**", (r) => (sdkOn ? r.fulfill({ contentType: "application/javascript", body: sdk() }) : r.abort()));
    await page.route("**/__verify", async (r) => { await ctx.pool.query("UPDATE telegram_users SET phone='9123334455', phone_verified_at=now() WHERE telegram_id=9001"); r.fulfill({ body: "ok" }); });   // «ربات» پس از ارسال مخاطب شماره را تأیید می‌کند
    await page.addInitScript((s) => { window.__scheme = s; }, scheme);
    const csp = []; page.on("response", (r) => { if (r.url().endsWith("/m") || r.url().includes("/m?")) csp.push(r.headers()["content-security-policy"]); });
    await page.goto(`${base}/m${withCafe ? `?c=${code}` : ""}#tgWebAppData=${encodeURIComponent(hash)}`, { waitUntil: "networkidle" });
    return { page, errors, csp, ctxb };
  };
  const init = sign(user);

  // ۱) بدون شماره: خانه + کارت تأیید شماره
  let t = await open("light", init);
  await t.page.waitForSelector("text=گیم‌نت آرتین"); await t.page.waitForSelector("text=تأیید شمارهٔ موبایل");
  must((await t.page.locator(".top b").innerText()) === "گیم‌نت آرتین", "سربرگ: نام کافی‌نت");
  must((await t.page.locator(".stat").count()) === 0, "پیش از تأیید شماره، مانده حساب دیده نمی‌شود");
  must(t.csp[0] && t.csp[0].includes("frame-ancestors") && t.csp[0].includes("telegram.org"), "CSP پوسته اجازهٔ نمایش درون تلگرام را می‌دهد");
  await t.page.screenshot({ path: path.join(SHOTS, "01-home-unverified-light.png") });

  // ۲) تأیید شماره (requestContact شبیه‌سازی‌شده) → مانده حساب و سفارش
  await t.page.click("text=ارسال شمارهٔ من");
  await t.page.waitForSelector(".stat", { timeout: 15000 });
  must((await t.page.evaluate(() => window.__contactAsked)) === 1, "requestContact یک بار صدا زده شد");
  const home = await t.page.locator(".page").innerText();
  must(/۱٬۲۵۰٬۰۰۰ تومان|۱۲۵٬۰۰۰ تومان/.test(home) && home.includes("۱۲۵٬۰۰۰ تومان"), "مانده حساب به تومان (۱٬۲۵۰٬۰۰۰ ریال = ۱۲۵٬۰۰۰ تومان)");
  must(home.includes("ارسال فایل") && home.includes("کد ۱۲۳۴۵"), "آخرین وضعیت: جدیدترین مورد در جریان (ارسال فایل با کد پیگیری فارسی)");
  await t.page.screenshot({ path: path.join(SHOTS, "02-home-verified-light.png") });

  // ۳) خدمات + جست‌وجو
  await t.page.click(".nav >> text=خدمات"); await t.page.waitForSelector("text=پرینت A4 رنگی");
  must((await t.page.locator(".list li").count()) === 3 && (await t.page.locator(".page").innerText()).includes("۸٬۰۰۰ تومان"), "تعرفه با قیمت تومان (۸۰٬۰۰۰ ریال = ۸٬۰۰۰ تومان)");
  await t.page.fill("input[type=search]", "اسکن"); must((await t.page.locator(".list li").count()) === 1, "جست‌وجوی خدمات");
  await t.page.screenshot({ path: path.join(SHOTS, "03-services-light.png") });

  // ۴) سفارش‌ها: در جریان / تمام‌شده، مراحل
  await t.page.click(".nav >> text=سفارش‌ها"); await t.page.waitForSelector("text=در جریان");
  must((await t.page.locator(".order").count()) === 2, "در جریان: سفارش + ارسال فایل");
  must((await t.page.locator(".steps .now").count()) === 2, "مرحلهٔ جاری هر سفارش مشخص است");
  await t.page.screenshot({ path: path.join(SHOTS, "04-orders-light.png") });
  await t.page.click("[role=tab]:has-text('تمام‌شده')"); must((await t.page.locator(".order").count()) === 1, "تمام‌شده: سفارش تحویل‌شده");

  // ۵) پشتیبانی و حساب
  await t.page.click(".nav >> text=گفتگو"); await t.page.click("role=tab[name=\"اطلاعات تماس\"]"); await t.page.waitForSelector("text=تهران، خیابان آزادی");
  must((await t.page.locator("a[href^='tel:']").count()) === 2, "تماس: دو شماره");
  await t.page.screenshot({ path: path.join(SHOTS, "05-support-light.png") });
  await t.page.click(".nav >> text=حساب"); await t.page.waitForSelector("text=تأیید شده");
  await t.page.screenshot({ path: path.join(SHOTS, "06-account-light.png") });
  must(t.errors.length === 0, "بدون خطای کنسول/صفحه" + (t.errors.length ? ": " + t.errors.join(" | ") : ""));
  await t.ctxb.close();

  // ۶) تم تیره + مسیر جایگزین بدون SDK (initData از hash)
  t = await open("dark", init, { sdkOn: false });
  await t.page.waitForSelector(".stat");
  must((await t.page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "تم تیره از prefers-color-scheme (بدون SDK)");
  await t.page.screenshot({ path: path.join(SHOTS, "07-home-dark-fallback.png") });
  await t.ctxb.close();

  // ۷) امضای نامعتبر / بدون initData / لینک نامعتبر
  t = await open("light", sign(user, "999:other_token_not_ours"));
  await t.page.waitForSelector("[role=alert]"); must((await t.page.locator("[role=alert]").innerText()).includes("امضای تلگرام"), "initData با توکن دیگر رد می‌شود");
  await t.page.screenshot({ path: path.join(SHOTS, "08-bad-signature.png") }); await t.ctxb.close();
  const ctxc = await browser.newContext(), pg = await ctxc.newPage(); await pg.route("https://telegram.org/**", (r) => r.abort()); await pg.route("https://tapi.bale.ai/**", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
  await pg.goto(`${base}/m`, { waitUntil: "networkidle" }); await pg.waitForSelector("[role=alert]");
  must((await pg.locator("[role=alert]").innerText()).includes("داخل تلگرام"), "بدون initData (مرورگر معمولی) پیام «از داخل تلگرام باز کنید»"); await ctxc.close();
  const t2 = await open("light", init); await t2.page.goto(`${base}/m?c=zzzzzzzzzzzzzzzz#tgWebAppData=${encodeURIComponent(init)}`); await t2.page.waitForSelector("text=لینک کافی‌نت معتبر نیست"); must(true, "کد کافی‌نت نامعتبر → پیام مناسب"); await t2.ctxb.close();

  // ── ۸) ورود دو بخشی: مشتری | کافی‌نت (کد اتصال → کافی‌نت → مدیریت سفارش/فایل/درخواست) ──
  await ctx.pool.query("UPDATE telegram_users SET chat_id=9100 WHERE false");
  const emp = { id: 9100, first_name: "مریم", last_name: "کارمند", username: "maryam", language_code: "fa" };
  const initStaff = sign(emp);
  let g = await open("light", initStaff, { withCafe: false });                     // بدون کد کافی‌نت: فقط ورود کافی‌نت ممکن است
  await g.page.waitForSelector('[data-testid="gate-staff"]');
  must(await g.page.locator('[data-testid="gate-customer"]').isDisabled(), "بدون لینک کافی‌نت، ورود مشتری غیرفعال است و راهنما می‌دهد");
  await g.page.screenshot({ path: path.join(SHOTS, "10-gate.png") });
  await g.page.click('[data-testid="gate-staff"]'); await g.page.waitForSelector("text=اتصال حساب تلگرام به کافی‌نت");
  await g.page.fill("input[aria-label='کد اتصال']", "ZZZZ-9999"); await g.page.click("text=اتصال و ورود"); await g.page.waitForSelector("[role=alert]");
  must((await g.page.locator("[role=alert]").innerText()).includes("کد اتصال نامعتبر"), "کد اشتباه رد می‌شود");
  const invite = await O("POST", "/api/users/invite", { email: "emp@e2e.test", role: "staff", firstName: "مریم", lastName: "کارمند" });
  const cc = client(ctx.app), lg = await cc.post("/api/auth/login", { email: "emp@e2e.test", password: invite.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: invite.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email: "emp@e2e.test", password: PW }), E = (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
  const linkCode = (await E("POST", "/api/miniapp/staff-codes")).data.code;
  await g.page.fill("input[aria-label='کد اتصال']", linkCode); await g.page.click("text=اتصال و ورود");
  await g.page.waitForSelector("text=مریم کارمند"); must((await g.page.locator(".nav button").count()) === 6, "پس از اتصال وارد بخش کافی‌نت می‌شود (۶ تب)");
  must((await g.page.locator(".top").innerText()).includes("گیم‌نت آرتین"), "سربرگ نام کافی‌نت");
  await g.page.screenshot({ path: path.join(SHOTS, "11-staff-home.png") });
  // سفارش‌ها: تغییر وضعیت = صف دستور
  await g.page.click(".nav >> text=سفارش‌ها"); await g.page.waitForSelector("text=چاپ ۲۰ برگ A4 رنگی");
  await g.page.click("text=چاپ ۲۰ برگ A4 رنگی"); await g.page.click(".pick >> text=تکمیل شده"); await g.page.waitForSelector("text=در انتظار برنامه");
  const acts = (await O("GET", "/api/miniapp/order-actions")).data.items; must(acts.length === 1 && acts[0].status === "completed" && acts[0].orderId === "o1", "دستور تغییر وضعیت در صفِ برنامه ثبت شد");
  await g.page.screenshot({ path: path.join(SHOTS, "12-staff-orders.png") });
  // فایل‌ها
  await g.page.click(".nav >> text=فایل‌ها"); await g.page.waitForSelector("text=ارسال فایل"); await g.page.click("text=ارسال فایل"); await g.page.click(".pick >> text=چاپ شد");
  await g.page.waitForSelector(".badge.u-2"); must((await ctx.pool.query("SELECT status FROM customer_uploads WHERE batch_code='12345'")).rows.every((r) => r.status === "printed"), "وضعیت فایل در دیتابیس (و برنامه) عوض شد");
  // مشتری درخواست می‌دهد (UI واقعی) → کارمند می‌بیند و می‌پذیرد
  const cust = await open("light", init);
  await cust.page.click(".nav >> text=سفارش‌ها"); await cust.page.click("text=+ درخواست سفارش جدید");
  await cust.page.fill("input[aria-label='خدمت']", "چاپ بنر ۲×۱"); await cust.page.fill("textarea[aria-label='توضیحات']", "رنگی، فردا صبح"); await cust.page.click("text=ارسال درخواست");
  await cust.page.waitForSelector("text=در انتظار بررسی");
  must((await ctx.pool.query("SELECT service,status FROM miniapp_requests")).rows[0].service === "چاپ بنر ۲×۱", "درخواست مشتری در سرور ثبت شد");
  await cust.page.screenshot({ path: path.join(SHOTS, "13-customer-request.png") });
  must((await (await fetch(`${base}/api/miniapp/requests-admin`, { headers: { authorization: `Bearer ${reg.data.accessToken}` } })).json()).data.newCount === 1, "درخواست در برنامهٔ کافی‌نت دیده می‌شود");
  await g.page.click(".nav >> text=درخواست‌ها"); await g.page.waitForSelector("text=چاپ بنر ۲×۱"); await g.page.fill("input[aria-label='پاسخ']", "فردا ظهر آماده است"); await g.page.click("button:has-text('پذیرش')");
  await g.page.waitForSelector(".badge.q-accepted"); await g.page.screenshot({ path: path.join(SHOTS, "14-staff-requests.png") });
  await cust.page.reload({ waitUntil: "networkidle" }); await cust.page.click(".nav >> text=سفارش‌ها"); await cust.page.waitForSelector("text=پاسخ کافی‌نت");
  must((await cust.page.locator(".page").innerText()).includes("فردا ظهر آماده است"), "مشتری پاسخ و وضعیت «پذیرفته شد» را می‌بیند");
  // تغییر بخش + ماندگاری انتخاب + قطع اتصال
  await g.page.click("[aria-label='تغییر بخش']"); await g.page.waitForSelector('[data-testid="gate-staff"]'); must((await g.page.locator('[data-testid="gate-staff"]').innerText()).includes("مریم کارمند"), "دکمهٔ «تغییر بخش» به صفحهٔ ورود دو بخشی برمی‌گردد");
  await g.page.click('[data-testid="gate-staff"]'); await g.page.click(".nav >> text=حساب"); await g.page.click("text=قطع اتصال این حساب تلگرام"); await g.page.click("text=بله، قطع شود");
  await g.page.waitForSelector('[data-testid="gate-staff"]'); must((await g.page.locator('[data-testid="gate-staff"]').innerText()).includes("با کد اتصال"), "پس از قطع اتصال دوباره کد لازم است");
  const real = [...g.errors, ...cust.errors].filter((e) => !/Failed to load resource: the server responded with a status of (400|403)/.test(e));   // ۴۰۰ (کد اشتباه) و ۴۰۳ (تازه‌سازی پس از قطع اتصال) عمدی‌اند
  must(real.length === 0, "بخش کافی‌نت و درخواست بدون خطای کنسول/صفحه" + real.join(" | "));
  await g.ctxb.close(); await cust.ctxb.close();
  console.log(`\nتصاویر: ${SHOTS}`);
} finally { await browser?.close(); await ctx.app.close(); await ctx.pool.end(); fake.close(); await stopDb(); }
