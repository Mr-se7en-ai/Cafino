import test from "node:test";
import assert from "node:assert/strict";
import { createPushService } from "../src/service.js";
import { createMemoryStore } from "../src/store.js";
import { createHttpServer } from "../src/http.js";

async function start(opts = {}) {
  const sent = [];
  const service = createPushService({ store: createMemoryStore(), sender: async (s, p) => { sent.push(JSON.parse(p)); } });
  const server = createHttpServer({ service, publicKey: "PUBKEY", ...opts });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { base, post, sent, service, close: () => new Promise((r) => server.close(r)) };
}
const SUB = { endpoint: "https://fcm.example.com/send/xyz", keys: { p256dh: "P", auth: "A" } };

test("جریان کامل HTTP: کلید عمومی → اشتراک → یادآورها → آزمایشی → لغو", async () => {
  const s = await start();
  try {
    assert.equal((await (await fetch(s.base + "/api/push/public-key")).json()).publicKey, "PUBKEY");
    assert.equal((await s.post("/api/push/subscribe", { subscription: SUB, cafeId: "c1", tz: "Asia/Tehran" })).status, 200);
    const r = await s.post("/api/push/reminders", { endpoint: SUB.endpoint, reminders: [{ id: "1", title: "الف", fireAt: [Date.now() + 1e6] }] });
    assert.deepEqual(await r.json(), { ok: true, count: 1 });
    assert.equal((await s.post("/api/push/test", { endpoint: SUB.endpoint })).status, 200);
    assert.equal(s.sent[0].tag, "cafino-test");
    assert.equal((await (await fetch(s.base + "/api/push/health")).json()).subscriptions, 1);
    assert.equal((await (await s.post("/api/push/unsubscribe", { endpoint: SUB.endpoint })).json()).removed, true);
  } finally { await s.close(); }
});
test("خطاها: JSON خراب، اشتراک نامعتبر، مسیر ناشناخته، بدنهٔ بزرگ", async () => {
  const s = await start();
  try {
    const bad = await fetch(s.base + "/api/push/subscribe", { method: "POST", body: "{not json" });
    assert.equal(bad.status, 400);
    assert.equal((await s.post("/api/push/subscribe", { subscription: { endpoint: "http://x" } })).status, 400);
    assert.equal((await s.post("/api/push/reminders", { endpoint: "https://unknown/x", reminders: [] })).status, 404);
    assert.equal((await fetch(s.base + "/nope")).status, 404);
    const big = await s.post("/api/push/subscribe", { pad: "x".repeat(300 * 1024) }).catch(() => ({ status: 413 }));
    assert.equal(big.status, 413);
  } finally { await s.close(); }
});
test("کلید مشترک و مبدأهای مجاز (CORS) و محدودیت نرخ", async () => {
  const s = await start({ sharedKey: "k1", allowedOrigins: ["https://app.example.com"], rateLimit: { perMinute: 5 } });
  try {
    assert.equal((await s.post("/api/push/subscribe", { subscription: SUB })).status, 401);
    assert.equal((await s.post("/api/push/subscribe", { subscription: SUB }, { "x-push-key": "k1", origin: "https://app.example.com" })).status, 200);
    const evil = await s.post("/api/push/subscribe", { subscription: SUB }, { "x-push-key": "k1", origin: "https://evil.example" });
    assert.equal(evil.status, 403);
    const pre = await fetch(s.base + "/api/push/subscribe", { method: "OPTIONS", headers: { origin: "https://app.example.com" } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "https://app.example.com");
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await fetch(s.base + "/api/push/health")).status;
    assert.equal(last, 429);
  } finally { await s.close(); }
});
