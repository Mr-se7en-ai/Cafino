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

test("api: درخواست بدون بدنه (DELETE/GET) هدر content-type نمی‌فرستد (فستیفای ۴۰۰ می‌دهد) ولی POST می‌فرستد", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push([init.method, url.split("/api/miniapp/")[1], init.headers["content-type"] || "", init.body || ""]); return url.endsWith("/auth") ? res(200, { data: { token: "T" } }) : res(200, { data: {} }); };
  const api = createApi({ initData: "d", fetchImpl });
  await api.unlink(); await api.forgetMe(); await api.call("POST", "requests", { service: "x" });
  assert.deepEqual(seen.slice(1), [["DELETE", "link", "", ""], ["DELETE", "me", "", ""], ["POST", "requests", "application/json", '{"service":"x"}']]);
  assert.equal(seen[0][2], "application/json");
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

// ── 1.81: سمت برنامهٔ کافی‌نت ──
import { planOrderActions, buildOrderFromRequest, applyPendingOrderActions, secondsLeft, ORDER_STATUS_KEYS } from "../uploads/miniappOrders.js";
import { miniapp } from "../uploads/miniappApi.js";

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("planOrderActions: یافتن با id یا serverId، هم‌وضعیت=applied بی‌تغییر، ناموجود/نامعتبر", () => {
  const orders = [{ id: "o1", status: "new", title: "الف" }, { id: 7, serverId: "srv-7", status: "inprogress", title: "ب" }, { id: "o3", status: "completed", title: "ج" }];
  const p = planOrderActions([
    { id: ID(1), orderId: "o1", status: "completed", by: "علی" },
    { id: ID(2), orderId: "srv-7", status: "delivered" },
    { id: ID(3), orderId: "o3", status: "completed" },           // همان وضعیت: تأیید می‌شود ولی تغییری نمی‌خواهد
    { id: ID(4), orderId: "nope", status: "new" },
    { id: ID(5), orderId: "o1", status: "bogus" },               // وضعیت نامعتبر: نادیده
    { id: 9, orderId: "o1", status: "new" },                      // id نامعتبر: نادیده
  ], orders);
  assert.deepEqual(p.applied, [ID(1), ID(2), ID(3)]); assert.deepEqual(p.notFound, [ID(4)]);
  assert.deepEqual(p.updates.map((u) => [String(u.order.id), u.status, u.by]), [["o1", "completed", "علی"], ["7", "delivered", ""]]);
  assert.deepEqual(planOrderActions(null, null), { updates: [], applied: [], notFound: [] });
  assert.ok(ORDER_STATUS_KEYS.includes("waiting_docs"));
});

test("buildOrderFromRequest: فقط برای مشتری شناخته‌شده؛ قالب سفارش", () => {
  const customers = [{ id: 12, firstName: "سارا", lastName: "رضایی" }];
  const o = buildOrderFromRequest({ customerId: "12", service: "پرینت رنگی", note: "۱۰ برگ" }, { customers, id: 555, today: "2026-11-15" });
  assert.deepEqual(o, { id: 555, customerId: "12", customerName: "سارا رضایی", title: "پرینت رنگی", notes: "۱۰ برگ — (درخواست از مینی‌اپ تلگرام)", amount: 0, status: "new", createdAt: "2026-11-15", source: "miniapp" });
  assert.equal(buildOrderFromRequest({ customerId: "99", service: "x" }, { customers, id: 1, today: "t" }), null);
  assert.equal(buildOrderFromRequest({ service: "x" }, { customers, id: 1, today: "t" }), null);
});

test("applyPendingOrderActions: اعمال، emit فقط وقتی تغییر هست، ack با فهرست درست", async () => {
  const orders = [{ id: "o1", status: "new", title: "الف" }], applied = [], acks = []; let emits = 0;
  const api = { orderActions: async () => ({ items: [{ id: ID(1), orderId: "o1", status: "completed", by: "م" }, { id: ID(2), orderId: "x", status: "new" }] }), ackOrderActions: async (b) => { acks.push(b); return {}; } };
  const deps = { readOrders: () => orders, applyStatus: (o, s, by) => applied.push([o.id, s, by]), emit: () => { emits++; } };
  const r = await applyPendingOrderActions({ api, deps });
  assert.deepEqual(r, { applied: 1, notFound: 1, changed: 1 }); assert.deepEqual(applied, [["o1", "completed", "م"]]); assert.equal(emits, 1);
  assert.deepEqual(acks, [{ applied: [ID(1)], notFound: [ID(2)] }]);
  // صف خالی: نه emit نه ack
  const none = await applyPendingOrderActions({ api: { orderActions: async () => ({ items: [] }), ackOrderActions: async () => { throw new Error("نباید"); } }, deps });
  assert.deepEqual(none, { applied: 0, notFound: 0, changed: 0 }); assert.equal(emits, 1);
});

test("secondsLeft + نقطه‌های API جدید به مسیر درست می‌روند", () => {
  assert.equal(secondsLeft(new Date(Date.now() + 125_000).toISOString()) >= 124, true);
  assert.equal(secondsLeft(new Date(Date.now() - 5000).toISOString()), 0); assert.equal(secondsLeft("x"), 0);
  for (const k of ["createStaffCode", "staffLinks", "unlinkStaff", "setStaffNotify", "requests", "setRequest", "orderActions", "ackOrderActions"]) assert.equal(typeof miniapp[k], "function", k);
});
