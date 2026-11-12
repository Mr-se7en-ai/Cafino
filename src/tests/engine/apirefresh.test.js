// توکن دسترسی منقضی (۴۰۱) → یک‌بار refresh با کوکی و تکرار درخواست؛ برای درخواست‌های هم‌زمان فقط یک refresh
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { E, fresh } from "./helpers.js";

let calls, tokenValid, refreshOk, rejectedRefreshes;
const json = (status, data) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => data });
const fetchImpl = async (url, init = {}) => {
  const path = new URL(url).pathname; calls.push(`${init.method || "GET"} ${path}`);
  if (path === "/api/auth/refresh") { if (!refreshOk) { rejectedRefreshes++; return json(401, { error: { code: "unauthorized", message: "no" } }); } tokenValid = "fresh"; return json(200, { data: { accessToken: "fresh", user: { id: "u1", email: "a@b.c" } } }); }
  const auth = init.headers?.Authorization;
  if (auth !== `Bearer ${tokenValid}`) return json(401, { error: { code: "unauthorized", message: "expired" } });
  return json(200, { data: [{ id: "1" }] });
};
const mk = () => E.createApiClient({ getConfig: () => ({ baseUrl: "http://srv.test", cafeId: "" }), fetchImpl, getScope: () => ({}) });
beforeEach(() => { fresh(); calls = []; tokenValid = "fresh"; refreshOk = true; rejectedRefreshes = 0; E.setAuthSession({ accessToken: "stale", user: { id: "u1", email: "a@b.c" } }); });

test("۴۰۱ → refresh → همان درخواست با توکن تازه موفق", async () => {
  const r = await mk().request("/api/customers");
  assert.deepEqual(r, [{ id: "1" }]); assert.equal(E.getAuthToken(), "fresh");
  assert.deepEqual(calls, ["GET /api/customers", "POST /api/auth/refresh", "GET /api/customers"]);
});

test("هم‌زمان: ۵ درخواست منقضی فقط یک refresh می‌سازند", async () => {
  const c = mk();
  const rs = await Promise.all(Array.from({ length: 5 }, () => c.request("/api/orders")));
  assert.equal(rs.length, 5); assert.equal(calls.filter((x) => x.includes("/auth/refresh")).length, 1);
});

test("refresh ردشده: همان ۴۰۱ به فراخواننده می‌رسد و حلقه نمی‌سازد", async () => {
  refreshOk = false;
  await assert.rejects(mk().request("/api/customers"), (e) => e.status === 401);
  assert.equal(rejectedRefreshes, 1); assert.equal(calls.filter((x) => x === "GET /api/customers").length, 1);
});

test("مسیرهای /api/auth/ و حالت بدون ورود refresh نمی‌زنند", async () => {
  tokenValid = "other";
  await assert.rejects(mk().request("/api/auth/me"), (e) => e.status === 401);
  assert.ok(!calls.some((x) => x.includes("/auth/refresh")));
  E.clearAuthSession(); calls = [];
  await assert.rejects(mk().request("/api/customers"), (e) => e.status === 401);
  assert.ok(!calls.some((x) => x.includes("/auth/refresh")), "بدون نشست محلی، refresh بی‌معناست");
});

test("بعد از refresh موفق، درخواست دوم هم‌چنان ۴۰۱ شد → بی‌نهایت تکرار نمی‌شود", async () => {
  const f = async (url, init = {}) => { const p = new URL(url).pathname; calls.push(p); return p === "/api/auth/refresh" ? json(200, { data: { accessToken: "x" } }) : json(401, { error: { code: "unauthorized", message: "no" } }); };
  const c = E.createApiClient({ getConfig: () => ({ baseUrl: "http://srv.test" }), fetchImpl: f, getScope: () => ({}) });
  await assert.rejects(c.request("/api/customers"), (e) => e.status === 401);
  assert.deepEqual(calls, ["/api/customers", "/api/auth/refresh", "/api/customers"]);
});

test("config.js: apiBaseUrl «same-origin» همان مبدأ صفحه می‌شود (برنامه و API پشت یک دامنه)", () => {
  const keep = { c: globalThis.CAFINO_CONFIG, l: globalThis.location };
  try {
    globalThis.CAFINO_CONFIG = { apiBaseUrl: "same-origin" };
    globalThis.location = { origin: "https://cafe.example.com" };
    assert.equal(E.getApiConfig().baseUrl, "https://cafe.example.com");
    globalThis.location = { origin: "null" };                      // file:// → خالی (حالت محلی)
    assert.equal(E.getApiConfig().baseUrl, "");
    globalThis.CAFINO_CONFIG = { apiBaseUrl: "https://api.example.com/" };
    assert.equal(E.getApiConfig().baseUrl, "https://api.example.com");
  } finally { globalThis.CAFINO_CONFIG = keep.c; globalThis.location = keep.l; }
});
