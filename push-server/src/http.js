// لایهٔ HTTP (بدون فریم‌ورک). مسیرها:
//   GET  /api/push/public-key     → { publicKey }
//   POST /api/push/subscribe      { subscription, cafeId?, tz? }
//   POST /api/push/reminders      { endpoint, reminders:[{ id, title, body?, fireAt:[ms,…] }] }
//   POST /api/push/unsubscribe    { endpoint }
//   POST /api/push/test           { endpoint }
//   GET  /api/push/health
import http from "node:http";
import { PushError } from "./service.js";

const MAX_BODY = 256 * 1024;

export function createHttpServer({ service, publicKey, allowedOrigins = [], sharedKey = "", rateLimit = { perMinute: 120 }, now = () => Date.now() }) {
  const hits = new Map();
  const limited = (ip) => {
    const minute = Math.floor(now() / 60000);
    const h = hits.get(ip);
    if (!h || h.minute !== minute) { hits.set(ip, { minute, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
    return ++h.n > rateLimit.perMinute;
  };
  const corsFor = (origin) => {
    const any = !allowedOrigins.length;
    const ok = any || allowedOrigins.includes(origin);
    return ok ? { "Access-Control-Allow-Origin": any ? "*" : origin, Vary: "Origin", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "content-type,x-push-key", "Access-Control-Max-Age": "86400" } : null;
  };

  return http.createServer((req, res) => {
    const origin = req.headers.origin || "";
    const cors = corsFor(origin) || {};
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors }); res.end(body === undefined ? "" : JSON.stringify(body)); };
    if (origin && !corsFor(origin)) return send(403, { error: "origin not allowed" });
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    const ip = req.socket.remoteAddress || "?";
    if (limited(ip)) return send(429, { error: "too many requests" });
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/api/push/health") return send(200, { ok: true, ...service.stats() });
    if (req.method === "GET" && url.pathname === "/api/push/public-key") return send(200, { publicKey });
    if (req.method !== "POST" || !url.pathname.startsWith("/api/push/")) return send(404, { error: "not found" });
    if (sharedKey && req.headers["x-push-key"] !== sharedKey) return send(401, { error: "unauthorized" });
    let body = "", size = 0, dead = false;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { dead = true; send(413, { error: "payload too large" }); req.destroy(); } else body += c; });
    req.on("end", async () => {
      if (dead) return;
      let j;
      try { j = JSON.parse(body || "{}"); } catch { return send(400, { error: "invalid json" }); }
      try {
        switch (url.pathname) {
          case "/api/push/subscribe": return send(200, { ok: true, ...service.subscribe(j.subscription, { cafeId: j.cafeId, tz: j.tz }) });
          case "/api/push/reminders": return send(200, { ok: true, ...service.setReminders(j.endpoint, j.reminders) });
          case "/api/push/unsubscribe": return send(200, { ok: true, removed: service.unsubscribe(j.endpoint) });
          case "/api/push/test": await service.sendTest(j.endpoint); return send(200, { ok: true });
          default: return send(404, { error: "not found" });
        }
      } catch (e) {
        if (e instanceof PushError) return send(e.status, { error: e.message });
        return send(e?.statusCode === 410 || e?.statusCode === 404 ? 410 : 502, { error: "push delivery failed" });
      }
    });
  });
}
