// ربات مینی‌اپ اختصاصی هر کافی‌نت (1.86). مجوز «bot.manage» (مدیر/مالک)؛ توکن هرگز در پاسخ نیست.
//  GET    /api/miniapp/cafe-bots                 وضعیت تلگرام و بله + آمادگی سرور (نشانی HTTPS)
//  PUT    /api/miniapp/cafe-bots/:provider {token}   اتصال/تعویض توکن (با getMe اعتبارسنجی؛ ربات تنظیم می‌شود)
//  PATCH  /api/miniapp/cafe-bots/:provider {enabled} روشن/خاموش
//  POST   /api/miniapp/cafe-bots/:provider/check     بررسی دوبارهٔ اتصال و تنظیم مجدد ربات
//  DELETE /api/miniapp/cafe-bots/:provider           حذف اتصال و توکن (کاربران و سفارش‌ها می‌مانند)
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { HttpError, invalid, notFound } from "../lib/errors.js";
import { BotApiError, PROVIDERS, TOKEN_RE, callApi, encryptToken, isProvider } from "../lib/bots.js";
import { aadOf } from "../lib/miniappCafeBots.js";
import { generateCode } from "../lib/uploads.js";

const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);
const bad = (e) => new HttpError(e.code === "bad_token" ? 422 : 502, e.code === "bad_token" ? "bot_bad_token" : "bot_api_error", e.message);

export async function registerMiniappCafeBots(app, bot, cafeBots) {
  const { pool, cfg } = app;
  const guard = { preHandler: [app.requirePerm("bot.manage")] };
  const limited = { ...guard, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
  const prov = (req) => { const p = String(req.params.provider || ""); if (!isProvider(p)) throw notFound("پیام‌رسان ناشناخته است"); return p; };
  const rowOf = async (cafeId, provider) => (await pool.query("SELECT * FROM miniapp_cafe_bots WHERE cafe_id=$1 AND provider=$2", [cafeId, provider])).rows[0] || null;
  // کد کافی‌نت اگر هنوز ساخته نشده باشد همین‌جا ساخته می‌شود (دکمهٔ منوی ربات و لینک‌ها به آن نیاز دارند)
  const codeOf = async (cafeId) => {
    let r = await pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeId]);
    for (let i = 0; i < 5 && !r.rows[0]; i++) r = await pool.query("INSERT INTO upload_settings (cafe_id, code) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING code", [cafeId, generateCode()]);
    if (!r.rows[0]) r = await pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeId]);
    return r.rows[0]?.code || "";
  };
  const httpsOk = () => /^https:\/\//i.test(cfg.miniappUrl || "");
  const shape = (provider, r, code) => {
    const meta = PROVIDERS[provider], base = { provider, label: meta.label, connected: !!r };
    if (!r) return base;
    return { ...base, botUsername: r.bot_username, botName: r.bot_name, tokenHint: r.token_hint, enabled: r.enabled,
      botLink: r.bot_username ? meta.linkOf(r.bot_username) : "", startLink: r.bot_username ? meta.linkOf(r.bot_username, provider === "telegram" && code ? `c_${code}` : "") : "",
      lastOkAt: iso(r.last_ok_at), lastError: r.last_error || "", lastErrorAt: iso(r.last_error_at), connectedAt: iso(r.created_at) };
  };
  const log = (c, req, action, provider, details = {}) => audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action, entity: "miniapp_cafe_bot", entityId: provider, details, ip: req.ip });
  const api = (provider, token, method, body = {}) => callApi(cfg, provider, token, method, body);

  app.get("/api/miniapp/cafe-bots", guard, async (req) => {
    const rows = (await pool.query("SELECT * FROM miniapp_cafe_bots WHERE cafe_id=$1", [req.user.cafeId])).rows, code = await codeOf(req.user.cafeId);
    return { data: { providers: Object.keys(PROVIDERS).map((p) => shape(p, rows.find((r) => r.provider === p), code)), serverReady: !!cfg.miniappUrl, httpsOk: httpsOk(), miniappUrl: cfg.miniappUrl || "", sharedBot: bot.enabled(), pollIntervalSec: Math.round(cfg.miniappPollIntervalMs / 1000) } };
  });

  app.put("/api/miniapp/cafe-bots/:provider", limited, async (req) => {
    const provider = prov(req), token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!TOKEN_RE.test(token)) throw invalid("توکن ربات نامعتبر است؛ شکل درست مثل 123456789:AAxxxxxxxx است (از BotFather در تلگرام یا بات‌فادر در بله بگیرید)");
    if (!cfg.miniappUrl) throw new HttpError(409, "miniapp_url_missing", "نشانی HTTPS مینی‌اپ روی سرور تنظیم نشده است (MINIAPP_URL یا PUBLIC_BASE_URL)؛ از مدیر سرور بخواهید آن را تنظیم کند");
    if (cfg.miniappToken && token === cfg.miniappToken) throw new HttpError(409, "bot_in_use", "این همان ربات مشترک کافینو است؛ رباتِ خودتان را بسازید و توکنش را وارد کنید");
    let me;
    try { me = await api(provider, token, "getMe"); } catch (e) { if (e instanceof BotApiError) throw bad(e); throw e; }
    if (!me?.id || me.is_bot === false) throw new HttpError(502, "bot_api_error", "پاسخ نامعتبر از پیام‌رسان");
    const cafeId = req.user.cafeId, botId = String(me.id);
    // یک ربات همزمان در دو جا پرسش (getUpdates) نمی‌شود: نه با ربات گزارش، نه با ربات مشترک، نه کافی‌نت دیگر
    if (String(cfg.miniappToken || "").split(":")[0] === botId && provider === "telegram") throw new HttpError(409, "bot_in_use", "این همان ربات مشترک کافینو است");
    if ((await pool.query("SELECT 1 FROM bot_connections WHERE provider=$1 AND bot_id=$2", [provider, botId])).rowCount) throw new HttpError(409, "bot_in_use", "این ربات برای «گزارش‌ها» به کار رفته؛ برای مینی‌اپ یک ربات جدا بسازید (هر ربات فقط یک کار)");
    const other = (await pool.query("SELECT cafe_id FROM miniapp_cafe_bots WHERE provider=$1 AND bot_id=$2", [provider, botId])).rows[0];
    if (other && String(other.cafe_id) !== String(cafeId)) throw new HttpError(409, "bot_in_use", "این ربات قبلاً برای کافی‌نت دیگری ثبت شده است");
    // پیام‌های قدیمیِ پیش از اتصال بازپخش نشوند؛ وب‌هوکِ احتمالی حذف شود (getUpdates با وب‌هوک کار نمی‌کند)
    let offset = 0;
    try { await api(provider, token, "deleteWebhook"); } catch { /* همهٔ API‌ها این متد را ندارند */ }
    try { const last = await api(provider, token, "getUpdates", { offset: -1, limit: 1, timeout: 0 }); if (Array.isArray(last) && last[0]) offset = Number(last[0].update_id) + 1; } catch { /* بی‌اهمیت */ }
    const enc = encryptToken(cfg, token, aadOf(cafeId, provider));
    await tx(pool, async (c) => {
      const cur = (await c.query("SELECT bot_id FROM miniapp_cafe_bots WHERE cafe_id=$1 AND provider=$2 FOR UPDATE", [cafeId, provider])).rows[0];
      await c.query(`INSERT INTO miniapp_cafe_bots (cafe_id, provider, token_enc, token_hint, bot_id, bot_username, bot_name, update_offset)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (cafe_id, provider) DO UPDATE SET token_enc=$3, token_hint=$4, bot_id=$5, bot_username=$6, bot_name=$7, enabled=true, update_offset=$8, lease_until=NULL, last_error='', last_error_at=NULL, updated_at=now()`,
        [cafeId, provider, enc, token.slice(-4), botId, String(me.username || "").slice(0, 64), String(me.first_name || "").slice(0, 120), offset]);
      await log(c, req, "miniapp_bot.connect", provider, { botUsername: me.username || "", replaced: !!cur });
    });
    await codeOf(cafeId);
    cafeBots.forget(cafeId, provider);
    const row = await rowOf(cafeId, provider), inst = cafeBots.instanceOf(row);
    let warning = "";
    try { await inst.init(); } catch (e) { warning = e instanceof BotApiError ? e.message : "راه‌اندازی اولیهٔ ربات کامل نشد"; await pool.query("UPDATE miniapp_cafe_bots SET last_error=$3, last_error_at=now() WHERE cafe_id=$1 AND provider=$2", [cafeId, provider, warning.slice(0, 300)]); }
    return { data: { ...shape(provider, await rowOf(cafeId, provider), await codeOf(cafeId)), warning, httpsOk: httpsOk() } };
  });

  app.patch("/api/miniapp/cafe-bots/:provider", guard, async (req) => {
    const provider = prov(req), cur = await rowOf(req.user.cafeId, provider);
    if (!cur) throw new HttpError(404, "bot_not_connected", "ابتدا توکن ربات را وارد کنید");
    if (typeof req.body?.enabled !== "boolean") throw invalid("مقدار «enabled» باید بله/خیر باشد");
    await tx(pool, async (c) => {
      await c.query("UPDATE miniapp_cafe_bots SET enabled=$3, lease_until=NULL, last_error=CASE WHEN $3 THEN '' ELSE last_error END, updated_at=now() WHERE cafe_id=$1 AND provider=$2", [req.user.cafeId, provider, req.body.enabled]);
      await log(c, req, "miniapp_bot.settings", provider, { enabled: req.body.enabled });
    });
    cafeBots.forget(req.user.cafeId, provider);
    return { data: shape(provider, await rowOf(req.user.cafeId, provider), await codeOf(req.user.cafeId)) };
  });

  app.post("/api/miniapp/cafe-bots/:provider/check", limited, async (req) => {
    const provider = prov(req), cur = await rowOf(req.user.cafeId, provider);
    if (!cur) throw new HttpError(404, "bot_not_connected", "ابتدا توکن ربات را وارد کنید");
    const inst = cafeBots.instanceOf(cur);
    if (!inst) throw new HttpError(409, "bot_token_unreadable", "توکن ذخیره‌شده خوانده نشد؛ توکن را دوباره وارد کنید");
    try { await inst.init(); } catch (e) {
      const msg = e instanceof BotApiError ? e.message : "بررسی ناموفق بود";
      await pool.query("UPDATE miniapp_cafe_bots SET last_error=$3, last_error_at=now() WHERE cafe_id=$1 AND provider=$2", [req.user.cafeId, provider, msg.slice(0, 300)]);
      if (e instanceof BotApiError) throw bad(e); throw e;
    }
    await pool.query("UPDATE miniapp_cafe_bots SET last_ok_at=now() WHERE cafe_id=$1 AND provider=$2", [req.user.cafeId, provider]);
    await tx(pool, (c) => log(c, req, "miniapp_bot.check", provider, {}));
    return { data: shape(provider, await rowOf(req.user.cafeId, provider), await codeOf(req.user.cafeId)) };
  });

  app.delete("/api/miniapp/cafe-bots/:provider", guard, async (req) => {
    const provider = prov(req);
    if (!(await rowOf(req.user.cafeId, provider))) throw new HttpError(404, "bot_not_connected", "این ربات متصل نیست");
    await tx(pool, async (c) => { await c.query("DELETE FROM miniapp_cafe_bots WHERE cafe_id=$1 AND provider=$2", [req.user.cafeId, provider]); await log(c, req, "miniapp_bot.disconnect", provider, {}); });
    cafeBots.forget(req.user.cafeId, provider);
    return { data: shape(provider, null) };
  });
}
