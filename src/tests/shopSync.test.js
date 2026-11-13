import test from "node:test";
import assert from "node:assert/strict";
import { shopPayload, shopDiff, fingerprint, syncShopProfile, DEFAULT_SHOP_NAME } from "../uploads/shopSync.js";

const IMG = "data:image/png;base64,AAAA";
const mkApi = (hash = "h1") => { const calls = []; return { calls, saveSettings: async (d) => { calls.push(["settings", d]); return { canManage: true, showShopInfo: true, hasLogo: false, logoHash: "", ...d }; }, saveLogo: async (b) => { calls.push(["logo", b]); return { canManage: true, showShopInfo: true, hasLogo: true, logoHash: hash }; }, removeLogo: async () => { calls.push(["rm"]); return { canManage: true, showShopInfo: true, hasLogo: false, logoHash: "" }; } }; };
const mem = () => { let v = null; return { read: () => v, write: (x) => { v = x; } }; };
const prepare = async () => ({ data: "QUJD", mime: "image/png", size: 3 });

test("shopPayload: فیلدها پاک‌سازی و کوتاه می‌شوند؛ نام پیش‌فرض ارسال نمی‌شود", () => {
  assert.deepEqual(shopPayload({ name: DEFAULT_SHOP_NAME, address: " تهران \n خیابان ", phone: "021", mobile: "0912" }), { shopName: "", shopAddress: "تهران خیابان", shopPhone: "021", shopMobile: "0912" });
  assert.equal(shopPayload({ name: "ن".repeat(200) }).shopName.length, 80);
  assert.equal(shopPayload({ address: "ب".repeat(500) }).shopAddress.length, 200);
  assert.deepEqual(shopPayload(null), { shopName: "", shopAddress: "", shopPhone: "", shopMobile: "" });
  assert.equal(shopPayload({ name: "a\u0000b\u001fc" }).shopName, "a b c");
});
test("shopDiff: فقط فیلدهای متفاوت", () => {
  const p = { shopName: "الف", shopAddress: "ب", shopPhone: "", shopMobile: "" };
  assert.deepEqual(shopDiff({ shopName: "الف", shopAddress: "ب" }, p), {});
  assert.deepEqual(shopDiff({ shopName: "x", shopAddress: "ب" }, p), { shopName: "الف" });
  assert.deepEqual(shopDiff({}, p), { shopName: "الف", shopAddress: "ب" });
});
test("fingerprint: برای تصویر متفاوت متفاوت و برای یکسان ثابت", () => {
  assert.equal(fingerprint(IMG), fingerprint(IMG)); assert.notEqual(fingerprint(IMG), fingerprint(IMG + "x")); assert.equal(fingerprint(""), fingerprint(null));
});
test("sync: بدون مجوز مدیریت یا با نمایش خاموش هیچ درخواستی نمی‌رود", async () => {
  const api = mkApi();
  assert.equal(await syncShopProfile({ canManage: false }, { name: "ک", logo: IMG }, { api, prepare, ...mem() }), null);
  assert.equal(await syncShopProfile({ canManage: true, showShopInfo: false }, { name: "ک", logo: IMG }, { api, prepare, ...mem() }), null);
  assert.equal(api.calls.length, 0);
});
test("sync: متن‌ها و لوگو یک‌بار ارسال می‌شود و با بار دوم تکرار نمی‌شود", async () => {
  const api = mkApi("H1"), m = mem(), shop = { name: "آفتاب", address: "تهران", phone: "021", mobile: "", logo: IMG };
  let st = { canManage: true, showShopInfo: true, hasLogo: false, logoHash: "", shopName: "", shopAddress: "", shopPhone: "", shopMobile: "" };
  const r = await syncShopProfile(st, shop, { api, prepare, ...m });
  assert.deepEqual(api.calls.map((c) => c[0]), ["settings", "logo"]);
  assert.deepEqual(api.calls[0][1], { shopName: "آفتاب", shopAddress: "تهران", shopPhone: "021" });
  assert.equal(api.calls[1][1], "QUJD"); assert.deepEqual(m.read().hash, "H1");
  st = { ...r, shopName: "آفتاب", shopAddress: "تهران", shopPhone: "021", shopMobile: "" };
  api.calls.length = 0;
  assert.equal(await syncShopProfile(st, shop, { api, prepare, ...m }), null); assert.equal(api.calls.length, 0, "بدون تغییر، بدون درخواست");
  api.calls.length = 0;
  await syncShopProfile(st, { ...shop, logo: IMG + "ZZ" }, { api, prepare, ...m }); assert.deepEqual(api.calls.map((c) => c[0]), ["logo"], "با تغییر تصویر دوباره ارسال می‌شود");
});
test("sync: اگر لوگوی سرور با نشانهٔ محلی نخواند (مثلاً سرور عوض شد) دوباره ارسال می‌شود", async () => {
  const api = mkApi("NEW"), m = mem(); m.write({ fp: fingerprint(IMG), hash: "OLD" });
  await syncShopProfile({ canManage: true, showShopInfo: true, hasLogo: true, logoHash: "NEW2" }, { logo: IMG }, { api, prepare, ...m });
  assert.deepEqual(api.calls.map((c) => c[0]), ["logo"]);
});
test("sync: حذف لوگو در پروفایل، لوگوی سرور را حذف می‌کند؛ لوگوی غیرتصویر نادیده گرفته می‌شود", async () => {
  const api = mkApi(), m = mem(); m.write({ fp: "x", hash: "y" });
  await syncShopProfile({ canManage: true, showShopInfo: true, hasLogo: true, logoHash: "y" }, { logo: "" }, { api, prepare, ...m });
  assert.deepEqual(api.calls.map((c) => c[0]), ["rm"]); assert.equal(m.read(), null);
  api.calls.length = 0;
  await syncShopProfile({ canManage: true, showShopInfo: true, hasLogo: false }, { logo: "javascript:alert(1)" }, { api, prepare, ...m });
  assert.equal(api.calls.length, 0);
});
test("sync: خطای آماده‌سازی لوگو به بیرون می‌رسد (hook آن را بی‌صدا می‌گیرد و بعداً دوباره تلاش می‌کند)", async () => {
  await assert.rejects(syncShopProfile({ canManage: true, showShopInfo: true, hasLogo: false }, { logo: IMG }, { api: mkApi(), prepare: async () => { throw new Error("بزرگ"); }, ...mem() }), /بزرگ/);
});
