// «سفارش‌های مینی‌اپ» (1.83) — منطق خالص: تطبیق مشتری با موبایل، ساخت مشتری، سفارش با مبلغ، فیلتر/شمارش، شمارندهٔ نشان.
import test from "node:test";
import assert from "node:assert/strict";
import { normPhone, findCustomerForRequest, customerFromRequest, buildOrderFromRequest, reqCounts, filterRequests } from "../uploads/miniappOrders.js";
import { setMiniReqNewCount, getMiniReqState, readCachedNewCount, MINI_REQ_CACHE_KEY, startMiniReqPolling } from "../uploads/miniReqState.js";

test("normPhone: ارقام فارسی/عربی و پیش‌شمارهٔ ایران یکسان می‌شوند", () => {
  assert.equal(normPhone("۰۹۱۲۳۳۳۴۴۵۵"), "9123334455");
  assert.equal(normPhone("+98 912 333 4455"), "9123334455");
  assert.equal(normPhone("00989123334455"), "9123334455");
  assert.equal(normPhone("٠٩١٢٣٣٣٤٤٥٥"), "9123334455");
  assert.equal(normPhone("123"), "");
  assert.equal(normPhone(null), "");
});

test("findCustomerForRequest: اول شناسه، بعد موبایل؛ وگرنه null", () => {
  const cs = [{ id: "a", firstName: "علی", phone: "09123334455" }, { id: "b", firstName: "سارا", phone: "0935 111 2233" }];
  assert.equal(findCustomerForRequest({ customerId: "b", phone: "09123334455" }, cs).id, "b");
  assert.equal(findCustomerForRequest({ customerId: "zzz", phone: "+989123334455" }, cs).id, "a");
  assert.equal(findCustomerForRequest({ phone: "۰۹۳۵۱۱۱۲۲۳۳" }, cs).id, "b");
  assert.equal(findCustomerForRequest({ phone: "09100000000" }, cs), null);
  assert.equal(findCustomerForRequest({}, cs), null);
  assert.equal(findCustomerForRequest({ phone: "09123334455" }, null), null);
});

test("customerFromRequest: نام را به نام/نام‌خانوادگی می‌شکند؛ بدون نام و موبایل null", () => {
  const c = customerFromRequest({ customer: "  علی   رضا  رضایی ", phone: "09123334455" }, { id: 7 });
  assert.equal(c.id, "7"); assert.equal(c.firstName, "علی رضا"); assert.equal(c.lastName, "رضایی"); assert.equal(c.phone, "09123334455"); assert.deepEqual(c.files, []);
  assert.equal(customerFromRequest({ customer: "تک‌نام", phone: "" }, { id: 1 }).firstName, "تک‌نام");
  assert.equal(customerFromRequest({ customer: "", phone: "09121112233" }, { id: 2 }).firstName, "09121112233");
  assert.equal(customerFromRequest({ customer: "", phone: "" }, { id: 3 }), null);
});

test("buildOrderFromRequest: مشتری با موبایل پیدا می‌شود؛ مبلغ نامعتبر/منفی صفر است؛ شناسهٔ درخواست حفظ می‌شود", () => {
  const cs = [{ id: "a", firstName: "علی", lastName: "رضایی", phone: "09123334455" }];
  const req = { id: "r1", customer: "علی", phone: "+989123334455", service: "پرینت رنگی", note: "۲۰ برگ" };
  const o = buildOrderFromRequest(req, { customers: cs, id: "o1", today: "2026-11-16", amount: 450000 });
  assert.equal(o.customerId, "a"); assert.equal(o.customerName, "علی رضایی"); assert.equal(o.amount, 450000); assert.equal(o.source, "miniapp"); assert.equal(o.miniappRequestId, "r1"); assert.match(o.notes, /۲۰ برگ/);
  assert.equal(buildOrderFromRequest(req, { customers: cs, id: "o2", today: "t", amount: -5 }).amount, 0);
  assert.equal(buildOrderFromRequest(req, { customers: cs, id: "o3", today: "t", amount: "x" }).amount, 0);
  assert.equal(buildOrderFromRequest({ ...req, phone: "09100000000" }, { customers: cs, id: "o4", today: "t" }), null);
});

test("reqCounts / filterRequests: شمارش وضعیت‌ها، فیلتر و جست‌وجو (نام، خدمت، موبایل با ارقام فارسی)", () => {
  const items = [
    { id: 1, status: "new", customer: "علی رضایی", phone: "09123334455", service: "پرینت رنگی", note: "" },
    { id: 2, status: "accepted", customer: "سارا", phone: "09351112233", service: "اسکن", note: "فوری" },
    { id: 3, status: "done", customer: "رضا", phone: "", service: "تایپ", note: "" },
    { id: 4, status: "rejected", customer: "مینا", phone: "", service: "ثبت‌نام", note: "" },
  ];
  assert.deepEqual(reqCounts(items), { new: 1, accepted: 1, done: 1, rejected: 1, all: 4 });
  assert.deepEqual(reqCounts(null), { new: 0, accepted: 0, done: 0, rejected: 0, all: 0 });
  assert.deepEqual(filterRequests(items, { filter: "new" }).map((r) => r.id), [1]);
  assert.deepEqual(filterRequests(items, { filter: "all", q: "اسکن" }).map((r) => r.id), [2]);
  assert.deepEqual(filterRequests(items, { filter: "all", q: "۰۹۱۲۳۳۳۴۴۵۵" }).map((r) => r.id), [1]);
  assert.deepEqual(filterRequests(items, { filter: "done", q: "اسکن" }), []);
  assert.deepEqual(filterRequests(items, { filter: "all", q: "فوری" }).map((r) => r.id), [2]);
});

test("setMiniReqNewCount: شمارنده و نسخهٔ ذخیره‌شده برای مرکز اعلان", () => {
  const mem = {}; globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  setMiniReqNewCount(3); assert.equal(getMiniReqState().newCount, 3); assert.equal(mem[MINI_REQ_CACHE_KEY], "3"); assert.equal(readCachedNewCount(), 3);
  setMiniReqNewCount(-2); assert.equal(getMiniReqState().newCount, 0); assert.equal(readCachedNewCount(), 0);
  setMiniReqNewCount("x"); assert.equal(getMiniReqState().newCount, 0);
  delete globalThis.localStorage;
});

test("startMiniReqPolling: بدون window بی‌اثر است", () => { assert.equal(typeof startMiniReqPolling({ isOn: () => false }), "function"); });
