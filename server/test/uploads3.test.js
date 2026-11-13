// صفحهٔ مشتری (1.78): مشخصات عمومی کافی‌نت (نام/نشانی/تلفن/لوگو) از پروفایل فروشگاه + فونت وزیرمتن. روی PostgreSQL واقعی.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { startDb, stopDb, makeApp, client } from "./helpers.js";

const PW = "رمز-خیلی-قوی-۱۲۳";
let url, ctx, O, O2, M, S, code1, code2;
const apps = [];
const J = (r) => { try { return JSON.parse(r.body); } catch { return null; } };
// PNG حداقلی معتبر (۱×۱) و JPEG/WEBP با سرایند درست
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([40, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(40, 2)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const b64 = (b) => b.toString("base64");

const boot = async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cafino-up3-"));
  const x = await makeApp(url, { env: { PERMISSION_PROFILE: "strict", UPLOAD_DIR: d } });
  x.dir = d; apps.push(x); return x;
};
const reg = async (x, email, shop) => { const c = client(x.app), r = await c.post("/api/auth/register", { email, password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: shop }); assert.equal(r.status, 201, JSON.stringify(r.json)); return (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken }); };
const mk = async (x, owner, role, n) => {
  const email = `${role}${n}@up3.test`;
  const inv = await owner("POST", "/api/users/invite", { email, role, firstName: "ک", lastName: n }); assert.equal(inv.status, 201, JSON.stringify(inv.json));
  const cc = client(x.app), lg = await cc.post("/api/auth/login", { email, password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email, password: PW });
  return (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken });
};
const info = async (code) => J(await ctx.app.inject({ method: "GET", url: `/api/public/upload/${code}` })).data;
const get = (u, headers) => ctx.app.inject({ method: "GET", url: u, headers });

before(async () => {
  url = await startDb();
  ctx = await boot();
  O = await reg(ctx, "own@up3.test", "کافه‌ی‌نمونه");
  O2 = await reg(ctx, "own2@up3.test", "کافه‌دوم");
  M = await mk(ctx, O, "manager", "1"); S = await mk(ctx, O, "staff", "1");
  code1 = (await O("GET", "/api/uploads/settings")).data.code;
  code2 = (await O2("GET", "/api/uploads/settings")).data.code;
});
after(async () => { for (const x of apps) { await x.app.close(); await x.pool.end(); fs.rmSync(x.dir, { recursive: true, force: true }); } await stopDb(); });

test("پیش‌فرض: مشخصات نمایش داده می‌شود و نام همان نام ثبت‌شدهٔ کافه است؛ لوگو ندارد", async () => {
  const i = await info(code1);
  assert.equal(i.cafeName, "کافه‌ی‌نمونه");
  assert.deepEqual(i.shop, { name: "", address: "", phone: "", mobile: "", logo: "" });
  const st = (await O("GET", "/api/uploads/settings")).data;
  assert.equal(st.showShopInfo, true); assert.equal(st.hasLogo, false);
  assert.equal((await get(`/u/${code1}/logo`)).statusCode, 404);
});

test("ذخیرهٔ مشخصات: نام/نشانی/تلفن/موبایل در اطلاعات عمومی می‌آید؛ مدیر مجاز است و کارمند نه", async () => {
  const body = { shopName: "کافی‌نت آفتاب", shopAddress: "تهران، خیابان آزادی، پلاک ۱۲", shopPhone: "021-12345678", shopMobile: "09121234567" };
  assert.equal((await S("PUT", "/api/uploads/settings", body)).status, 403);
  const r = await M("PUT", "/api/uploads/settings", body);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.data.shopName, "کافی‌نت آفتاب");
  const i = await info(code1);
  assert.equal(i.cafeName, "کافی‌نت آفتاب", "برچسب صفحه = نام پروفایل فروشگاه");
  assert.equal(i.shop.address, "تهران، خیابان آزادی، پلاک ۱۲");
  assert.equal(i.shop.phone, "021-12345678"); assert.equal(i.shop.mobile, "09121234567");
  assert.equal((await info(code2)).shop.name, "", "کافی‌نت دیگر بی‌اثر");
});

test("کاراکترهای کنترلی/جهت‌دهی حذف می‌شوند؛ طول بیش از حد رد می‌شود", async () => {
  const r = await O("PUT", "/api/uploads/settings", { shopName: "کافه‮خطرناک\n\u0000ب", shopAddress: "الف⁦ب\r\nج" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const i = (await info(code1)).shop;
  assert.doesNotMatch(i.name, /[\u0000-\u001f‪-‮⁦-⁩]/);
  assert.doesNotMatch(i.address, /[\u0000-\u001f‪-‮⁦-⁩]/);
  assert.equal((await O("PUT", "/api/uploads/settings", { shopAddress: "ن".repeat(500) })).status, 422);
  await O("PUT", "/api/uploads/settings", { shopName: "کافی‌نت آفتاب", shopAddress: "تهران، خیابان آزادی، پلاک ۱۲" });
});

test("لوگو: PNG/JPEG/WEBP پذیرفته، SVG و فایل بی‌معنی و حجم زیاد رد، کارمند 403", async () => {
  assert.equal((await S("PUT", "/api/uploads/shop-logo", { data: b64(PNG) })).status, 403);
  assert.equal((await O("PUT", "/api/uploads/shop-logo", { data: b64(SVG) })).status, 415, "SVG ممنوع");
  assert.equal((await O("PUT", "/api/uploads/shop-logo", { data: b64(Buffer.from("hello world, not an image")) })).status, 415);
  assert.equal((await O("PUT", "/api/uploads/shop-logo", { data: "!!!نامعتبر!!!" })).status, 400);
  assert.equal((await O("PUT", "/api/uploads/shop-logo", {})).status, 400);
  const big = Buffer.concat([PNG, Buffer.alloc(160 * 1024, 7)]);
  assert.equal((await O("PUT", "/api/uploads/shop-logo", { data: b64(big) })).status, 413);
  assert.equal((await O("GET", "/api/uploads/settings")).data.hasLogo, false, "رد شده‌ها چیزی ذخیره نکردند");
  for (const [b, mime] of [[PNG, "image/png"], [JPG, "image/jpeg"], [WEBP, "image/webp"]]) {
    const r = await O("PUT", "/api/uploads/shop-logo", { data: `data:${mime};base64,${b64(b)}` });
    assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.data.hasLogo, true);
    const g = await get(`/u/${code1}/logo`);
    assert.equal(g.statusCode, 200); assert.equal(g.headers["content-type"].split(";")[0], mime);
    assert.deepEqual(g.rawPayload, b);
  }
});

test("سرو لوگو: هدرهای امنیتی، ETag/304، آدرس نسخه‌دار در اطلاعات عمومی، جداسازی کافی‌نت‌ها", async () => {
  await O("PUT", "/api/uploads/shop-logo", { data: b64(PNG) });
  const g = await get(`/u/${code1}/logo`);
  assert.equal(g.headers["x-content-type-options"], "nosniff");
  assert.equal(g.headers["content-security-policy"], "default-src 'none'");
  assert.equal(g.headers["cross-origin-resource-policy"], "same-origin");
  const etag = g.headers.etag; assert.ok(etag);
  assert.equal((await get(`/u/${code1}/logo`, { "if-none-match": etag })).statusCode, 304);
  const sh = (await info(code1)).shop;
  assert.match(sh.logo, /^logo\?v=[0-9a-f]{16}$/);
  assert.equal(etag, `"${crypto.createHash("sha256").update(PNG).digest("hex")}"`);
  assert.equal((await get(`/u/${code2}/logo`)).statusCode, 404, "لوگوی کافی‌نت اول به کد دوم نشت نمی‌کند");
  assert.equal((await get(`/u/aaaaaaaaaaaaaaaa/logo`)).statusCode, 404);
});

test("لوگو و مشخصات برای QR موقت (نشست) هم نمایش داده می‌شود", async () => {
  const r = await S("POST", "/api/uploads/sessions", { label: "سفارش ۱", ttlMinutes: 30, maxFiles: 3 });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const i = await info(r.data.code);
  assert.equal(i.kind, "session"); assert.equal(i.shop.phone, "021-12345678"); assert.match(i.shop.logo, /^logo\?v=/);
  const g = await get(`/u/${r.data.code}/logo`); assert.equal(g.statusCode, 200);
});

test("خاموش کردن «نمایش مشخصات»: shop=null و لوگو 404؛ برچسب به نام ثبت‌شدهٔ کافه برمی‌گردد", async () => {
  const r = await O("PUT", "/api/uploads/settings", { showShopInfo: false });
  assert.equal(r.data.showShopInfo, false);
  const i = await info(code1);
  assert.equal(i.shop, null);
  assert.equal((await get(`/u/${code1}/logo`)).statusCode, 404);
  assert.equal(JSON.stringify(i).includes("آزادی"), false, "نشانی فاش نمی‌شود");
  await O("PUT", "/api/uploads/settings", { showShopInfo: true });
  assert.ok((await info(code1)).shop.address);
});

test("حذف لوگو: از سرور پاک می‌شود و 404 می‌دهد؛ کارمند 403", async () => {
  assert.equal((await S("DELETE", "/api/uploads/shop-logo")).status, 403);
  const r = await O("DELETE", "/api/uploads/shop-logo");
  assert.equal(r.status, 200); assert.equal(r.data.hasLogo, false);
  assert.equal((await get(`/u/${code1}/logo`)).statusCode, 404);
  assert.equal((await info(code1)).shop.logo, "");
});

test("فونت وزیرمتن: فقط دو فایل مجاز، woff2 واقعی، کش طولانی؛ مسیر دلخواه/پیمایش مسیر 404", async () => {
  for (const n of ["vazirmatn-400.woff2", "vazirmatn-700.woff2"]) {
    const r = await get(`/u/assets/${n}`);
    assert.equal(r.statusCode, 200, n);
    assert.equal(r.headers["content-type"].split(";")[0], "font/woff2");
    assert.match(r.headers["cache-control"], /immutable/);
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.rawPayload.toString("latin1", 0, 4), "wOF2", "امضای woff2");
    assert.ok(r.rawPayload.length > 10000);
  }
  for (const n of ["x.woff2", "OFL.txt", "Vazirmatn-Regular.woff2", "..%2F..%2Fpackage.json", "%2e%2e%2fuploads.js", "constructor", "__proto__", "hasOwnProperty"]) {
    assert.equal((await get(`/u/assets/${n}`)).statusCode, 404, n);
  }
});

test("صفحهٔ HTML مشتری: فونت و لوگو در CSP مجاز است و فایل‌های فونت به همان مسیرها اشاره دارند", async () => {
  const r = await get(`/u/${code1}`);
  assert.equal(r.statusCode, 200);
  const csp = r.headers["content-security-policy"];
  assert.match(csp, /font-src 'self'/); assert.match(csp, /img-src 'self' data:/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(r.body, /\/u\/assets\/vazirmatn-400\.woff2/); assert.match(r.body, /\/u\/assets\/vazirmatn-700\.woff2/);
  assert.match(r.body, /Vazirmatn/);
  assert.doesNotMatch(r.body, /fonts\.googleapis|cdn\./i, "هیچ منبع بیرونی");
});

test("جداسازی: تغییر مشخصات یک کافی‌نت روی دیگری اثر ندارد و مدیر کافی‌نت دیگر نمی‌تواند لوگو بگذارد", async () => {
  await O2("PUT", "/api/uploads/shop-logo", { data: b64(JPG) });
  const g2 = await get(`/u/${code2}/logo`); assert.equal(g2.statusCode, 200); assert.deepEqual(g2.rawPayload, JPG);
  assert.equal((await get(`/u/${code1}/logo`)).statusCode, 404);
  assert.equal((await info(code1)).shop.logo, "");
});
