// مینی‌اپ تلگرام (1.80) — منطق خالص سمت کلاینت: پل تلگرام، API، قالب‌بندی، همگام‌سازی تعرفه.
import test from "node:test";
import assert from "node:assert/strict";
import { getTg, readHashParams } from "../miniapp/tg.js";
import { createApi } from "../miniapp/api.js";
import { faDigits, faNum, jalali, telHref, toToman, tomanText } from "../miniapp/format.js";
import { scheduleTariffSync, syncTariffNow, tariffToPublic, _resetSyncForTests } from "../uploads/miniappApi.js";

test("tg: initData از SDK، وگرنه از hash نشانی؛ کد کافی‌نت از ?c=", () => {
  const w1 = { Telegram: { WebApp: { initData: "a=1&hash=x", colorScheme: "dark", isVersionAtLeast: () => true, requestContact() {} } }, location: { hash: "", search: "?c=abcdefghijklmnop" } };
  const t1 = getTg(w1); assert.equal(t1.initData, "a=1&hash=x"); assert.equal(t1.scheme, "dark"); assert.equal(t1.cafe, "abcdefghijklmnop"); assert.equal(t1.canRequestContact(), true);
  const w2 = { location: { hash: "#tgWebAppData=user%3D1%26hash%3Dz&tgWebAppVersion=8", search: "" }, matchMedia: () => ({ matches: true }) };
  const t2 = getTg(w2); assert.equal(t2.initData, "user=1&hash=z"); assert.equal(t2.hasSdk, false); assert.equal(t2.scheme, "dark"); assert.equal(t2.canRequestContact(), false);
  assert.equal(getTg({ location: { hash: "", search: "" } }).initData, "");
  assert.equal(readHashParams(undefined).get("x"), null);
  const t3 = getTg({ Telegram: { WebApp: { initData: "q", isVersionAtLeast: () => false, requestContact() {} } }, location: { hash: "", search: "" } }); assert.equal(t3.canRequestContact(), false);
});

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
test("api: ورود، Bearer، و ۴۰۱ → یک بار ورود دوباره و تکرار درخواست", async () => {
  const calls = []; let n = 0;
  const fetchImpl = async (url, init) => {
    calls.push([init.method, url, init.headers.authorization || ""]);
    if (url.endsWith("/auth")) { n++; return res(200, { data: { token: `T${n}`, cafe: { name: "ک" }, problem: "" } }); }
    if (url.endsWith("/me")) return init.headers.authorization === "Bearer T1" ? res(401, { error: { code: "unauthorized", message: "منقضی" } }) : res(200, { data: { ok: 1 } });
    return res(200, { data: {} });
  };
  const api = createApi({ initData: "d", cafe: "c", fetchImpl });
  assert.deepEqual(await api.me(), { ok: 1 });
  assert.deepEqual(calls.map((c) => [c[0], c[1].split("/api/miniapp/")[1], c[2]]), [["POST", "auth", ""], ["GET", "me", "Bearer T1"], ["POST", "auth", ""], ["GET", "me", "Bearer T2"]]);
  assert.equal(JSON.parse(JSON.stringify(api.info())).token, "T2");
});
test("api: خطای سرور پیام فارسی سرور را برمی‌گرداند و ورودهای هم‌زمان یکی می‌شوند", async () => {
  let auths = 0;
  const fetchImpl = async (url) => { if (url.endsWith("/auth")) { auths++; return res(200, { data: { token: "T" } }); } return res(409, { error: { code: "no_cafe", message: "کافی‌نت مشخص نیست" } }); };
  const api = createApi({ initData: "d", fetchImpl });
  const r = await Promise.allSettled([api.home(), api.orders(), api.shop()]);
  assert.equal(auths, 1); for (const x of r) { assert.equal(x.status, "rejected"); assert.equal(x.reason.status, 409); assert.equal(x.reason.code, "no_cafe"); assert.equal(x.reason.message, "کافی‌نت مشخص نیست"); }
  const bad = createApi({ initData: "d", fetchImpl: async () => res(401, { error: { code: "bad_signature", message: "امضای تلگرام معتبر نیست" } }) });
  await assert.rejects(() => bad.me(), (e) => e.status === 401 && e.code === "bad_signature");
});

test("format: ارقام فارسی، تومان از ریال، تاریخ امروز/دیروز، تلفن", () => {
  assert.equal(faDigits("کد 12345"), "کد ۱۲۳۴۵"); assert.equal(faNum(1250000), "۱٬۲۵۰٬۰۰۰");
  assert.equal(toToman(1250000), 125000); assert.equal(tomanText(80000), "۸٬۰۰۰ تومان"); assert.equal(tomanText(undefined), "۰ تومان");
  const now = Date.parse("2026-11-15T09:00:00Z");
  assert.match(jalali("2026-11-15T07:00:00Z", now), /^امروز /); assert.match(jalali("2026-11-14T07:00:00Z", now), /^دیروز /);
  assert.ok(jalali("2026-10-01T07:00:00Z", now).length > 5); assert.equal(jalali("خراب", now), "");
  assert.equal(telHref("021-66 00 11"), "tel:021660011"); assert.equal(telHref(""), "");
});

test("tariffToPublic: فقط نام و قیمت، ردیف‌های نامعتبر حذف", () => {
  const out = tariffToPublic([{ cat: " چاپ ", items: [{ id: 1, name: " A4 ", price: 20000.4, note: "x" }, { name: "", price: 1 }, { name: "منفی", price: -1 }, { name: "NaN", price: "abc" }] }, { cat: "خالی", items: [] }, { items: [{ name: "بی‌گروه", price: 1 }] }, null, { cat: "بدون آرایه" }]);
  assert.deepEqual(out, [{ cat: "چاپ", items: [{ name: "A4", price: 20000 }] }]);
  assert.deepEqual(tariffToPublic(undefined), []);
});
test("scheduleTariffSync: با تأخیر، حذف تکراری، و بی‌اثر بدون سرور/مهمان؛ خطا بی‌صدا", async () => {
  _resetSyncForTests();
  const puts = []; const api = { putTariff: async (g) => { puts.push(g); return {}; } };
  const data = [{ cat: "چاپ", items: [{ name: "A4", price: 10 }] }], on = { delayMs: 5, api, connected: () => true, guest: () => false };
  scheduleTariffSync(data, on); scheduleTariffSync(data, on);       // دو بار پشت‌سرهم → یک ارسال
  await new Promise((r) => setTimeout(r, 40)); assert.equal(puts.length, 1);
  scheduleTariffSync(data, on); await new Promise((r) => setTimeout(r, 40)); assert.equal(puts.length, 1, "بدون تغییر دوباره ارسال نمی‌شود");
  scheduleTariffSync([{ cat: "چاپ", items: [{ name: "A4", price: 11 }] }], on); await new Promise((r) => setTimeout(r, 40)); assert.equal(puts.length, 2);
  scheduleTariffSync([{ cat: "ن", items: [{ name: "x", price: 1 }] }], { ...on, connected: () => false }); scheduleTariffSync([{ cat: "ن", items: [{ name: "x", price: 1 }] }], { ...on, guest: () => true });
  await new Promise((r) => setTimeout(r, 40)); assert.equal(puts.length, 2);
  const failing = { putTariff: async () => { throw new Error("down"); } };
  scheduleTariffSync([{ cat: "ز", items: [{ name: "y", price: 1 }] }], { ...on, api: failing }); await new Promise((r) => setTimeout(r, 40));
  scheduleTariffSync([{ cat: "ز", items: [{ name: "y", price: 1 }] }], on); await new Promise((r) => setTimeout(r, 40)); assert.equal(puts.length, 3, "پس از خطا دوباره تلاش می‌شود");
  assert.deepEqual(await syncTariffNow(data, api), {});
});
