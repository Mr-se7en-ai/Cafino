// مینی‌اپ تلگرام مشتریان (1.80).
//  صفحه و فایل‌ها (عمومی):  GET /m · GET /m/assets/:file          — پوستهٔ HTML (CSP اختصاصی؛ قابل نمایش درون تلگرام) و بسته‌های ایستا
//  مشتری (نشست مینی‌اپ، Bearer):
//    POST /api/miniapp/auth {initData, cafe?}  اعتبارسنجی امضای تلگرام در سرور ← توکن کوتاه‌عمر (۱ ساعت)
//    GET  /api/miniapp/me · /home · /services · /orders · /shop        DELETE /api/miniapp/link · DELETE /api/miniapp/me
//  کافی‌نت (ورود + مجوز upload.manage):  GET /api/miniapp/info · PATCH /api/miniapp/settings {enabled} · PUT /api/miniapp/tariff {groups}
// امنیت: توکن مینی‌اپ فقط برای همین مسیرهاست و در API کافی‌نت پذیرفته نمی‌شود؛ هر درخواست داده را فقط برای «همان تلگرام + همان کافی‌نت»
// برمی‌گرداند؛ مشتری فقط حساب/سفارش/فایل خودش را می‌بیند (اتصال با شمارهٔ تأییدشدهٔ تلگرام). نام کافی‌نت دیگر هرگز در پاسخ نیست.
import fs from "node:fs";
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { HttpError, forbidden, invalid, unauthorized } from "../lib/errors.js";
import { generateCode } from "../lib/uploads.js";
import { MiniappAuthError, codeFromPayload, phoneLikePatterns, samePhone, sanitizeTariff, signSession, tariffHash, verifyInitData, verifySession } from "../lib/miniapp.js";

const SHELL_CSP = ["default-src 'none'", "script-src 'self' https://telegram.org", "style-src 'self'", "style-src-attr 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
  "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-ancestors https://web.telegram.org https://webk.telegram.org https://webz.telegram.org https://*.telegram.org https://*.t.me"].join("; ");
const SHELL_HTML = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>کافینو</title><link rel="stylesheet" href="/m/assets/app.css"><script src="https://telegram.org/js/telegram-web-app.js"></script></head><body><div id="root"></div><script src="/m/assets/app.js" defer></script></body></html>`;
const ASSETS = {
  "app.js": ["application/javascript; charset=utf-8", "../assets/miniapp/app.js"], "app.css": ["text/css; charset=utf-8", "../assets/miniapp/app.css"],
  "vazirmatn-400.woff2": ["font/woff2", "../assets/fonts/Vazirmatn-Regular.woff2"], "vazirmatn-700.woff2": ["font/woff2", "../assets/fonts/Vazirmatn-Bold.woff2"],
};
const UPLOAD_STEPS = ["دریافت شد", "کارمند دید", "چاپ شد", "انجام شد"], ORDER_STEPS = ["ثبت شد", "در حال انجام", "تکمیل شد", "تحویل شد"];
const ORDER_STAGE = { new: 0, inprogress: 1, waiting_docs: 1, completed: 2, delivered: 3 };
const OPEN_ORDER = ["new", "inprogress", "waiting_docs"];
const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);
const fullName = (r) => [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim();

export async function registerMiniapp(app, bot) {
  const { pool, cfg } = app;
  const assetCache = new Map();

  // ── پوسته و فایل‌های ایستا ─────────────────────────────────────────────────────────────────────────────
  const shell = async (req, reply) => reply.header("content-security-policy", SHELL_CSP).header("cache-control", "no-store").header("x-content-type-options", "nosniff").header("referrer-policy", "no-referrer").header("x-robots-tag", "noindex, nofollow").type("text/html; charset=utf-8").send(SHELL_HTML);
  const shellOpts = { config: { rateLimit: { max: 120, timeWindow: "1 minute" }, helmet: { contentSecurityPolicy: false, frameguard: false } } };
  app.get("/m", shellOpts, shell);
  app.get("/m/", shellOpts, shell);
  app.get("/m/assets/:file", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (req, reply) => {
    const a = Object.prototype.hasOwnProperty.call(ASSETS, req.params.file) ? ASSETS[req.params.file] : null;
    if (!a) return reply.code(404).type("text/plain; charset=utf-8").send("not found");
    if (!assetCache.has(req.params.file)) {
      try { assetCache.set(req.params.file, await fs.promises.readFile(new URL(a[1], import.meta.url))); } catch { return reply.code(404).type("text/plain; charset=utf-8").send("not found"); }
    }
    const font = a[0] === "font/woff2";
    return reply.header("cache-control", font ? "public, max-age=31536000, immutable" : "no-cache").header("x-content-type-options", "nosniff").header("cross-origin-resource-policy", "same-origin").type(a[0]).send(assetCache.get(req.params.file));
  });

  // ── کمک‌ها ──────────────────────────────────────────────────────────────────────────────────────────────────
  const CAFE_SQL = `SELECT s.cafe_id, s.code, s.miniapp_enabled, s.enabled AS upload_enabled, s.show_shop_info, s.shop_name, s.shop_address, s.shop_phone, s.shop_mobile, s.shop_logo_hash, c.name, c.status
    FROM upload_settings s JOIN cafes c ON c.id = s.cafe_id`;
  const cafeView = (r) => r && ({
    name: r.shop_name || r.name, code: r.code, address: r.show_shop_info ? r.shop_address : "", phone: r.show_shop_info ? r.shop_phone : "", mobile: r.show_shop_info ? r.shop_mobile : "",
    logoUrl: r.show_shop_info && r.shop_logo_hash ? `/u/${r.code}/logo` : null, uploadPath: r.upload_enabled ? `/u/${r.code}` : null,
  });
  const usable = (r) => r && r.miniapp_enabled && r.status === "active";

  async function ensureLink(telegramId, cafeId, phone) {
    const ex = (await pool.query("SELECT l.customer_id, c.first_name, c.last_name FROM telegram_links l LEFT JOIN customers c ON c.cafe_id=l.cafe_id AND c.id=l.customer_id AND c.deleted_at IS NULL WHERE l.cafe_id=$1 AND l.telegram_id=$2", [cafeId, telegramId])).rows[0];
    if (ex && (ex.first_name !== null || ex.last_name !== null)) { await pool.query("UPDATE telegram_links SET last_seen_at=now() WHERE cafe_id=$1 AND telegram_id=$2", [cafeId, telegramId]); return { customerId: ex.customer_id, name: fullName(ex) }; }
    if (ex) await pool.query("DELETE FROM telegram_links WHERE cafe_id=$1 AND telegram_id=$2", [cafeId, telegramId]);     // مشتری حذف شده
    if (!phone) return null;
    const m = (await pool.query("SELECT id, first_name, last_name, phone FROM customers WHERE cafe_id=$1 AND deleted_at IS NULL AND phone <> '' LIMIT 100000", [cafeId])).rows.filter((x) => samePhone(x.phone, phone)).slice(0, 2);
    if (m.length > 1) return { ambiguous: true };
    if (!m[0]) return null;
    await tx(pool, async (c) => {
      await c.query("DELETE FROM telegram_links WHERE cafe_id=$1 AND customer_id=$2 AND telegram_id <> $3", [cafeId, m[0].id, telegramId]);
      await c.query("INSERT INTO telegram_links (cafe_id, telegram_id, customer_id, last_seen_at) VALUES ($1,$2,$3,now()) ON CONFLICT (cafe_id, telegram_id) DO UPDATE SET customer_id=EXCLUDED.customer_id, last_seen_at=now()", [cafeId, telegramId, m[0].id]);
    });
    return { customerId: m[0].id, name: fullName(m[0]) };
  }

  // ── احراز هویت: امضای تلگرام ← توکن مینی‌اپ ─────────────────────────────────────────────────────────────────────
  app.post("/api/miniapp/auth", { config: { rateLimit: { max: cfg.miniappAuthRatePerMin, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!bot.enabled()) throw new HttpError(503, "miniapp_disabled", "مینی‌اپ در این سرور فعال نیست");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let v;
    try { v = verifyInitData(body.initData, cfg.miniappToken, { maxAgeSec: cfg.miniappAuthMaxAgeSec }); }
    catch (e) { if (e instanceof MiniappAuthError) throw new HttpError(401, e.code, e.message); throw e; }
    const u = (await pool.query(
      `INSERT INTO telegram_users (telegram_id, first_name, last_name, username, language) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (telegram_id) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, username=EXCLUDED.username, language=EXCLUDED.language, updated_at=now() RETURNING *`,
      [v.user.id, v.user.firstName, v.user.lastName, v.user.username, v.user.language])).rows[0];
    const code = codeFromPayload(body.cafe) || codeFromPayload(v.startParam);
    let row = null, problem = "";
    if (code) {
      row = (await pool.query(`${CAFE_SQL} WHERE s.code = $1`, [code])).rows[0] || null;
      if (!row) problem = "not_found"; else if (!usable(row)) { problem = "disabled"; row = null; }
    } else if (u.last_cafe_id) {
      row = (await pool.query(`${CAFE_SQL} WHERE s.cafe_id = $1`, [u.last_cafe_id])).rows[0] || null;
      if (!usable(row)) { row = null; problem = "no_cafe"; }
    } else problem = "no_cafe";
    if (row && String(u.last_cafe_id) !== String(row.cafe_id)) await pool.query("UPDATE telegram_users SET last_cafe_id=$2 WHERE telegram_id=$1", [u.telegram_id, row.cafe_id]);
    const token = await signSession(cfg, { telegramId: u.telegram_id, cafeId: row?.cafe_id || null });
    reply.header("cache-control", "no-store");
    return { data: { token, expiresIn: cfg.miniappSessionTtlSec, problem, cafe: cafeView(row), user: { firstName: u.first_name }, phoneVerified: !!u.phone_verified_at, botUsername: bot.info()?.username || "" } };
  });

  // ── نشست مینی‌اپ ────────────────────────────────────────────────────────────────────────────────────────────────
  const session = async (req) => {
    const h = req.headers.authorization || "";
    const s = h.startsWith("Bearer ") ? await verifySession(cfg, h.slice(7)) : null;
    if (!s) throw unauthorized("نشست مینی‌اپ منقضی شده است؛ دوباره وارد شوید");
    const u = (await pool.query("SELECT * FROM telegram_users WHERE telegram_id=$1", [s.telegramId])).rows[0];
    if (!u) throw unauthorized();
    let cafe = null;
    if (s.cafeId) {
      cafe = (await pool.query(`${CAFE_SQL} WHERE s.cafe_id = $1`, [s.cafeId])).rows[0] || null;
      if (!usable(cafe)) throw forbidden("مینی‌اپ این کافی‌نت فعلاً بسته است", "miniapp_closed");
    }
    req.mini = { tg: u, cafe };
  };
  const needCafe = (req) => { if (!req.mini.cafe) throw new HttpError(409, "no_cafe", "کافی‌نت مشخص نیست؛ لینک یا QR کافی‌نت را باز کنید"); return req.mini.cafe; };
  const mini = { preHandler: [session], config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
  const ok = (reply, data) => reply.header("cache-control", "no-store").send({ data });

  const linkOf = async (req) => ensureLink(Number(req.mini.tg.telegram_id), needCafe(req).cafe_id, req.mini.tg.phone_verified_at ? req.mini.tg.phone : "");

  app.get("/api/miniapp/me", mini, async (req, reply) => {
    const cafe = needCafe(req), link = await linkOf(req);
    return ok(reply, { cafe: cafeView(cafe), user: { firstName: req.mini.tg.first_name }, phoneVerified: !!req.mini.tg.phone_verified_at, linked: link && link.customerId ? { name: link.name } : null, ambiguous: !!link?.ambiguous, botUsername: bot.info()?.username || "" });
  });

  const stageOfUpload = (n) => Math.max(0, Math.min(3, Number(n)));
  async function uploadsOf(cafeId, customerId, phone, limit = 30) {
    const r = await pool.query(
      `SELECT batch_id, batch_code, created_at, status, order_label, sender_phone, customer_ref FROM customer_uploads
       WHERE cafe_id=$1 AND deleted_at IS NULL AND (customer_ref=$2 OR ($3::text[] IS NOT NULL AND sender_phone LIKE ANY($3::text[])))
       ORDER BY created_at DESC LIMIT 500`, [cafeId, customerId || "\u0001none", phone ? phoneLikePatterns(phone) : null]);
    const by = new Map();
    for (const x of r.rows) {
      if (!((customerId && x.customer_ref === customerId) || (phone && samePhone(x.sender_phone, phone)))) continue;     // LIKE فقط پیش‌فیلتر است؛ تطبیق نهایی دقیق
      const st = ({ new: 0, seen: 1, printed: 2, done: 3 })[x.status] ?? 0, b = by.get(x.batch_id);
      if (!b) by.set(x.batch_id, { code: x.batch_code, createdAt: x.created_at, files: 1, stage: st, label: x.order_label || "" });
      else { b.files++; b.stage = Math.min(b.stage, st); b.label = b.label || x.order_label || ""; if (x.created_at < b.createdAt) b.createdAt = x.created_at; }
    }
    return [...by.values()].slice(0, limit).map((x) => ({ kind: "upload", code: x.code, title: x.label || "ارسال فایل", files: x.files, stage: stageOfUpload(x.stage), steps: UPLOAD_STEPS, createdAt: iso(x.createdAt), done: x.stage >= 3 }));
  }
  async function ordersOf(cafeId, customerId, limit = 30) {
    if (!customerId) return [];
    const r = await pool.query("SELECT id, title, status, amount, created_at FROM orders WHERE cafe_id=$1 AND customer_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $3", [cafeId, customerId, limit]);
    return r.rows.map((x) => ({ kind: "order", title: x.title || "سفارش", amount: Number(x.amount), stage: ORDER_STAGE[x.status] ?? 0, steps: ORDER_STEPS, waiting: x.status === "waiting_docs", createdAt: iso(x.created_at), done: !OPEN_ORDER.includes(x.status) }));
  }
  const phoneOf = (req) => (req.mini.tg.phone_verified_at ? req.mini.tg.phone : "");

  app.get("/api/miniapp/home", mini, async (req, reply) => {
    const cafe = needCafe(req), link = await linkOf(req), cid = link?.customerId || "";
    const ups = await uploadsOf(cafe.cafe_id, cid, phoneOf(req), 10), ords = await ordersOf(cafe.cafe_id, cid, 10);
    let debt = 0, monthOrders = 0;
    if (cid) {
      debt = Number((await pool.query("SELECT COALESCE(SUM(remaining_amount),0) AS d FROM invoices WHERE cafe_id=$1 AND customer_id=$2 AND deleted_at IS NULL AND status IN ('unpaid','partial')", [cafe.cafe_id, cid])).rows[0].d);
      monthOrders = (await pool.query("SELECT count(*)::int AS n FROM orders WHERE cafe_id=$1 AND customer_id=$2 AND deleted_at IS NULL AND created_at >= date_trunc('month', now())", [cafe.cafe_id, cid])).rows[0].n;
    }
    const active = [...ups, ...ords].filter((x) => !x.done).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
    return ok(reply, { cafe: cafeView(cafe), user: { firstName: req.mini.tg.first_name }, phoneVerified: !!req.mini.tg.phone_verified_at, linked: cid ? { name: link.name } : null, ambiguous: !!link?.ambiguous,
      debtRial: debt, monthOrders, active });
  });

  app.get("/api/miniapp/orders", mini, async (req, reply) => {
    const cafe = needCafe(req), link = await linkOf(req), cid = link?.customerId || "";
    const items = [...(await uploadsOf(cafe.cafe_id, cid, phoneOf(req))), ...(await ordersOf(cafe.cafe_id, cid))].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return ok(reply, { linked: !!cid, phoneVerified: !!req.mini.tg.phone_verified_at, items });
  });

  app.get("/api/miniapp/services", mini, async (req, reply) => {
    const cafe = needCafe(req);
    const r = (await pool.query("SELECT data, updated_at FROM shop_public_tariff WHERE cafe_id=$1", [cafe.cafe_id])).rows[0];
    return ok(reply, { groups: r?.data || [], updatedAt: r ? iso(r.updated_at) : null });
  });
  app.get("/api/miniapp/shop", mini, async (req, reply) => ok(reply, { cafe: cafeView(needCafe(req)) }));

  app.delete("/api/miniapp/link", mini, async (req, reply) => {
    const cafe = needCafe(req);
    await pool.query("DELETE FROM telegram_links WHERE cafe_id=$1 AND telegram_id=$2", [cafe.cafe_id, req.mini.tg.telegram_id]);
    return ok(reply, { linked: null });
  });
  // حذف شمارهٔ تأییدشده و همهٔ اتصال‌ها (حق حذف دادهٔ خود کاربر)
  app.delete("/api/miniapp/me", mini, async (req, reply) => {
    await tx(pool, async (c) => {
      await c.query("DELETE FROM telegram_links WHERE telegram_id=$1", [req.mini.tg.telegram_id]);
      await c.query("UPDATE telegram_users SET phone='', phone_verified_at=NULL, updated_at=now() WHERE telegram_id=$1", [req.mini.tg.telegram_id]);
    });
    return ok(reply, { phoneVerified: false, linked: null });
  });

  // ── سمت کافی‌نت ─────────────────────────────────────────────────────────────────────────────────────────────────
  const manage = { preHandler: [app.requirePerm("upload.manage")] };
  const ensureSettings = async (cafeId) => {
    let r = await pool.query("SELECT cafe_id, code, miniapp_enabled FROM upload_settings WHERE cafe_id=$1", [cafeId]);
    for (let i = 0; i < 5 && !r.rows[0]; i++) r = await pool.query("INSERT INTO upload_settings (cafe_id, code) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING cafe_id, code, miniapp_enabled", [cafeId, generateCode()]);
    if (!r.rows[0]) r = await pool.query("SELECT cafe_id, code, miniapp_enabled FROM upload_settings WHERE cafe_id=$1", [cafeId]);
    return r.rows[0] || null;
  };
  app.get("/api/miniapp/info", manage, async (req) => {
    const s = await ensureSettings(req.user.cafeId);
    const linked = s ? (await pool.query("SELECT count(*)::int AS n FROM telegram_links WHERE cafe_id=$1", [req.user.cafeId])).rows[0].n : 0;
    const t = (await pool.query("SELECT hash, updated_at, jsonb_array_length(data) AS groups FROM shop_public_tariff WHERE cafe_id=$1", [req.user.cafeId])).rows[0];
    let botUsername = bot.info()?.username || "";
    if (!botUsername) botUsername = (await pool.query("SELECT bot_username FROM miniapp_bot_state WHERE id=1")).rows[0]?.bot_username || "";
    return { data: { serverEnabled: bot.enabled(), botUsername, hasCode: !!s, enabled: s ? s.miniapp_enabled : true, link: s && botUsername ? `https://t.me/${botUsername}?start=c_${s.code}` : "", linkedCustomers: linked,
      tariff: t ? { hash: t.hash, updatedAt: iso(t.updated_at), groups: t.groups } : null } };
  });
  app.patch("/api/miniapp/settings", manage, async (req) => {
    const en = req.body?.enabled;
    if (typeof en !== "boolean") throw invalid("مقدار «enabled» باید بله/خیر باشد");
    const s = await ensureSettings(req.user.cafeId);
    if (!s) throw new HttpError(409, "upload_settings_missing", "تنظیمات کافی‌نت ساخته نشد؛ دوباره تلاش کنید");
    await tx(pool, async (c) => {
      await c.query("UPDATE upload_settings SET miniapp_enabled=$2, updated_at=now() WHERE cafe_id=$1", [req.user.cafeId, en]);
      await audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action: "miniapp.settings", entity: "miniapp", details: { enabled: en }, ip: req.ip });
    });
    return { data: { enabled: en } };
  });
  app.put("/api/miniapp/tariff", { ...manage, config: { rateLimit: { max: 30, timeWindow: "1 minute" } }, bodyLimit: 400 * 1024 }, async (req) => {
    const r = sanitizeTariff(req.body?.groups);
    if (r.error) throw invalid(r.error);
    const hash = tariffHash(r.groups);
    const cur = (await pool.query("SELECT hash FROM shop_public_tariff WHERE cafe_id=$1", [req.user.cafeId])).rows[0];
    if (cur?.hash === hash) return { data: { hash, changed: false, groups: r.groups.length } };
    await pool.query("INSERT INTO shop_public_tariff (cafe_id, data, hash) VALUES ($1,$2,$3) ON CONFLICT (cafe_id) DO UPDATE SET data=EXCLUDED.data, hash=EXCLUDED.hash, updated_at=now()", [req.user.cafeId, JSON.stringify(r.groups), hash]);
    return { data: { hash, changed: true, groups: r.groups.length } };
  });
}
