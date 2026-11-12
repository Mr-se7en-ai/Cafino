#!/usr/bin/env node
// سرور مرجع «پنل مرکزی» برای اطلاعیه و تیکت — فقط برای توسعه و تست، بدون وابستگی (Node 18+).
// قرارداد کامل: inbox-api-fa.md.  اجرا:  node server.mjs   (پورت پیش‌فرض ۸۷۸۷؛ ADMIN_KEY برای مسیرهای مدیر)
//
// ⚠️ این سرور توکن را «اعتبارسنجی نمی‌کند». پنل واقعی باید Authorization را بررسی کند و هر کافی‌نت فقط تیکت‌ها و
//    اطلاعیه‌های خودش را ببیند (X-Cafe-Id فقط راهنماست، نه مجوز).
import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-dev-key";
const FILE = process.env.DB_FILE || "";
let db = { announcements: [], tickets: [], seq: 1000 };
if (FILE) { try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* تازه */ } }
const save = () => { if (FILE) try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch { /* ignore */ } };
const idem = new Map();                    // Idempotency-Key → پاسخ قبلی (در پنل واقعی در پایگاه‌داده نگه دارید)
const now = () => new Date().toISOString();
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

function send(res, status, data, origin) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin || "*", "access-control-allow-credentials": "true", vary: "origin",
    "access-control-allow-headers": "authorization,content-type,idempotency-key,x-cafe-id,x-organization-id,x-branch-id,x-admin-key",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  });
  res.end(status === 204 ? "" : JSON.stringify(data));
}
const readBody = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 1e6) req.destroy(); }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok(null); } }); });
const visibleTo = (a, cafe) => !a.cafeIds?.length || a.cafeIds.includes(cafe);
const view = (t) => ({ ...t, cafeId: undefined });

export function createServer() {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const u = new URL(req.url, "http://x"), parts = u.pathname.split("/").filter(Boolean), m = req.method;
    if (m === "OPTIONS") return send(res, 204, null, origin);
    const reply = (s, d) => send(res, s, d, origin);
    const cafe = String(req.headers["x-cafe-id"] || "");
    const body = m === "POST" || m === "PATCH" ? await readBody(req) : undefined;
    if (body === null) return reply(400, { error: { code: "bad_json", message: "JSON نامعتبر" } });
    const admin = req.headers["x-admin-key"] === ADMIN_KEY;

    // ── سمت کافی‌نت ────────────────────────────────────────────────────────────────────────────────────────────
    if (parts[0] === "api" && parts[1] === "announcements" && m === "GET") {
      const t = Date.now();
      return reply(200, { data: db.announcements.filter((a) => visibleTo(a, cafe) && (!a.expiresAt || Date.parse(a.expiresAt) > t)).map(({ cafeIds, ...a }) => a) });
    }
    if (parts[0] === "api" && parts[1] === "tickets") {
      const mine = db.tickets.filter((t) => t.cafeId === cafe);
      if (m === "GET" && parts.length === 2) return reply(200, { data: mine.map(view) });
      const key = req.headers["idempotency-key"];
      if (key && idem.has(key)) return reply(200, { data: idem.get(key) });
      if (m === "POST" && parts.length === 2) {
        if (!body.id || !body.subject || !body.message?.body) return reply(422, { error: { code: "validation", message: "id، subject و message.body لازم است" } });
        const dup = db.tickets.find((t) => t.id === String(body.id) && t.cafeId === cafe);
        if (dup) return reply(200, { data: view(dup) });
        const t = { id: String(body.id), cafeId: cafe, number: String(++db.seq), subject: String(body.subject).slice(0, 200), category: body.category || "other", priority: body.priority || "normal", status: "open",
          createdAt: body.createdAt || now(), updatedAt: body.createdAt || now(), messages: [{ id: String(body.message.id || uid("m")), from: "cafe", author: body.message.author || "", body: String(body.message.body), createdAt: body.message.createdAt || now() }] };
        db.tickets.push(t); save(); if (key) idem.set(key, view(t));
        return reply(201, { data: view(t) });
      }
      const t = mine.find((x) => x.id === parts[2]);
      if (!t) return reply(404, { error: { code: "not_found", message: "تیکت پیدا نشد" } });
      if (m === "POST" && parts[3] === "messages") {
        if (!body.body) return reply(422, { error: { code: "validation", message: "body لازم است" } });
        if (t.status === "closed") return reply(409, { error: { code: "ticket_closed", message: "تیکت بسته است" } });
        const dup = t.messages.find((x) => x.id === String(body.id));
        if (dup) return reply(200, { data: dup });
        const msg = { id: String(body.id || uid("m")), from: "cafe", author: body.author || "", body: String(body.body), createdAt: body.createdAt || now() };
        t.messages.push(msg); t.updatedAt = msg.createdAt; if (t.status === "answered") t.status = "open"; save(); if (key) idem.set(key, msg);
        return reply(201, { data: msg });
      }
      if (m === "PATCH" && parts.length === 3) {
        if (!["open", "closed"].includes(body.status)) return reply(422, { error: { code: "validation", message: "فقط open یا closed" } });
        t.status = body.status; t.updatedAt = now(); save();
        return reply(200, { data: view(t) });
      }
    }

    // ── سمت مدیر (برای آزمایش؛ پنل واقعی رابط خودش را دارد) ───────────────────────────────────────────────────────────
    if (parts[0] === "admin") {
      if (!admin) return reply(401, { error: { code: "unauthorized", message: "X-Admin-Key" } });
      if (parts[1] === "announcements" && m === "POST") {
        const a = { id: uid("a"), title: body.title || "", body: body.body || "", severity: body.severity || "info", pinned: Boolean(body.pinned), publishedAt: now(), expiresAt: body.expiresAt || "", link: body.link || "", cafeIds: body.cafeIds || [] };
        db.announcements.unshift(a); save(); return reply(201, { data: a });
      }
      if (parts[1] === "announcements" && parts[2] && m === "DELETE") { db.announcements = db.announcements.filter((a) => a.id !== parts[2]); save(); return reply(204, null); }
      if (parts[1] === "tickets" && m === "GET") return reply(200, { data: db.tickets });
      if (parts[1] === "tickets" && parts[3] === "reply" && m === "POST") {
        const t = db.tickets.find((x) => x.id === parts[2]); if (!t) return reply(404, { error: { code: "not_found", message: "x" } });
        const msg = { id: uid("m"), from: "admin", author: body.author || "پشتیبانی", body: body.body || "", createdAt: now() };
        t.messages.push(msg); t.updatedAt = msg.createdAt; t.status = body.status || "answered"; save(); return reply(201, { data: msg });
      }
      if (parts[1] === "reset" && m === "POST") { db = { announcements: [], tickets: [], seq: 1000 }; idem.clear(); save(); return reply(200, { data: "ok" }); }
    }
    return reply(404, { error: { code: "not_found", message: "مسیر ناشناخته" } });
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createServer().listen(PORT, () => console.log(`پنل مرکزی مرجع روی http://localhost:${PORT} (ADMIN_KEY=${ADMIN_KEY})`));
}
