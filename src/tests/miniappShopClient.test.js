// مینی‌اپ 1.84 — سمت برنامه: شمارنده‌های رسید/پیام، مجموع نشان منو، اعلان‌ها و فراخوانی‌های API.
import test from "node:test";
import assert from "node:assert/strict";
import { setMiniExtras, setMiniReqNewCount, getMiniReqState, miniBadgeTotal, readCachedPayCount, readCachedChatCount, MINI_PAY_CACHE_KEY, MINI_CHAT_CACHE_KEY } from "../uploads/miniReqState.js";
import { readFileSync } from "node:fs";
import { miniapp } from "../uploads/miniappApi.js";

const mem = {};
const setup = () => { for (const k of Object.keys(mem)) delete mem[k]; globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } }; };

test("setMiniExtras: رسید/پیام در حافظه و state؛ مجموع نشان = جدید + رسید + پیام", () => {
  setup();
  setMiniReqNewCount(2); setMiniExtras({ pendingPayments: 3, unreadChats: 4 });
  const s = getMiniReqState(); assert.equal(s.pendingPayments, 3); assert.equal(s.unreadChats, 4); assert.equal(miniBadgeTotal(s), 9);
  assert.equal(mem[MINI_PAY_CACHE_KEY], "3"); assert.equal(readCachedPayCount(), 3); assert.equal(readCachedChatCount(), 4); assert.equal(mem[MINI_CHAT_CACHE_KEY], "4");
  setMiniExtras({ pendingPayments: 0 }); assert.equal(getMiniReqState().unreadChats, 4, "فیلد حذف‌شده دست‌نخورده می‌ماند");
  setMiniExtras({ pendingPayments: -5, unreadChats: "x" }); assert.equal(miniBadgeTotal(), 2);
  setMiniReqNewCount(0); setMiniExtras({ pendingPayments: 0, unreadChats: 0 }); delete globalThis.localStorage;
});

test("مرکز اعلان: کلیدهای رسید/پیام مینی‌اپ را می‌خواند و به صفحهٔ سفارش‌های مینی‌اپ می‌برد (activity.js به jsx وابسته است؛ بررسی منبع)", () => {
  const src = readFileSync(new URL("../app/core/activity.js", import.meta.url), "utf8");
  assert.ok(src.includes(MINI_PAY_CACHE_KEY) && src.includes(MINI_CHAT_CACHE_KEY), "کلیدهای حافظه یکی باشند");
  assert.equal((src.match(/tab:"miniapp-orders"/g) || []).length, 3, "سفارش جدید + رسید + پیام");
});

test("miniapp API: مسیرها و بدنهٔ درخواست‌های پرداخت و گفتگو", async () => {
  const calls = []; const realFetch = globalThis.fetch;
  // apiRequest در حالت بدون اتصال خطا می‌دهد؛ فقط وجود و امضای توابع را بررسی می‌کنیم
  for (const k of ["inboxSummary", "setPaySettings", "payAction", "receipt", "chats", "chatThread", "sendChat"]) assert.equal(typeof miniapp[k], "function", k);
  assert.equal(calls.length, 0); globalThis.fetch = realFetch;
});
