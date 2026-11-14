// ربات‌های گزارش بله/تلگرام (1.79). همهٔ مسیرها نیازمند مجوز «bot.manage» (مدیر/مالک) هستند؛ توکن هرگز در پاسخ نیست.
//  GET    /api/bots                      وضعیت هر دو پیام‌رسان
//  PUT    /api/bots/:provider            {token}       اتصال/تعویض توکن (با getMe اعتبارسنجی می‌شود)
//  PATCH  /api/bots/:provider            {enabled, commandsEnabled, dailyEnabled, dailyTime, lowStockAlert, currency}
//  POST   /api/bots/:provider/link       کد پیوند یک‌بارمصرف (۱۰ دقیقه)       POST …/unlink  جداکردن چت
//  POST   /api/bots/:provider/test       پیام آزمایشی                          POST …/send    {range} ارسال فوری گزارش
//  DELETE /api/bots/:provider            حذف اتصال و توکن
import { tx } from "../db.js";
import { audit } from "../lib/audit.js";
import { HttpError, invalid, notFound } from "../lib/errors.js";
import { BotApiError, PROVIDERS, RANGES, TOKEN_RE, encryptToken, hashCode, isProvider, newLinkCode } from "../lib/bots.js";

const bad = (e) => new HttpError(e.code === "bad_token" ? 422 : 502, e.code === "bad_token" ? "bot_bad_token" : "bot_api_error", e.message);
const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);

export async function registerBots(app, bots) {
  const { pool, cfg } = app;
  const guard = { preHandler: [app.requirePerm("bot.manage")] };
  const limited = { ...guard, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
  const prov = (req) => { const p = String(req.params.provider || ""); if (!isProvider(p)) throw notFound("پیام‌رسان ناشناخته است"); return p; };
  const rowOf = async (cafeId, provider) => (await pool.query("SELECT * FROM bot_connections WHERE cafe_id=$1 AND provider=$2", [cafeId, provider])).rows[0] || null;
  const needRow = async (req, provider) => { const r = await rowOf(req.user.cafeId, provider); if (!r) throw new HttpError(404, "bot_not_connected", "ابتدا توکن ربات را وارد کنید"); return r; };
  const shape = (provider, r) => {
    const meta = PROVIDERS[provider], base = { provider, label: meta.label, connected: !!r };
    if (!r) return base;
    const linkPending = !!(r.link_hash && r.link_expires_at && new Date(r.link_expires_at) > new Date());
    return { ...base, botUsername: r.bot_username, botName: r.bot_name, tokenHint: r.token_hint, botLink: r.bot_username ? meta.linkOf(r.bot_username) : "", linked: !!r.chat_id, chatTitle: r.chat_title, chatType: r.chat_type,
      enabled: r.enabled, commandsEnabled: r.commands_enabled, dailyEnabled: r.daily_enabled, dailyTime: r.daily_time, lowStockAlert: r.low_stock_alert, currency: r.currency,
      linkPending, linkExpiresAt: linkPending ? iso(r.link_expires_at) : null, lastDailyDate: r.last_daily_date ? String(r.last_daily_date.toISOString ? r.last_daily_date.toISOString().slice(0, 10) : r.last_daily_date).slice(0, 10) : null,
      lastOkAt: iso(r.last_ok_at), lastError: r.last_error || "", lastErrorAt: iso(r.last_error_at) };
  };
  const log = (c, req, action, provider, details = {}) => audit(c, { cafeId: req.user.cafeId, userId: req.user.id, action, entity: "bot_connection", entityId: provider, details, ip: req.ip });

  app.get("/api/bots", guard, async (req) => {
    const rows = (await pool.query("SELECT * FROM bot_connections WHERE cafe_id=$1", [req.user.cafeId])).rows;
    return { data: { providers: Object.keys(PROVIDERS).map((p) => shape(p, rows.find((r) => r.provider === p))), tz: cfg.botTz, schedulerOn: !!cfg.botsEnabled, pollIntervalSec: Math.round(cfg.botPollIntervalMs / 1000) } };
  });

  app.put("/api/bots/:provider", limited, async (req) => {
    const provider = prov(req), token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!TOKEN_RE.test(token)) throw invalid("توکن ربات نامعتبر است؛ شکل درست مثل 123456789:AAxxxxxxxx است (از BotFather در تلگرام یا بات‌فادر در بله بگیرید)");
    let me;
    try { me = await bots.api(provider, token, "getMe", {}); } catch (e) { if (e instanceof BotApiError) throw bad(e); throw e; }
    if (!me?.id) throw new HttpError(502, "bot_api_error", "پاسخ نامعتبر از پیام‌رسان");
    // توکن‌های قدیمی را نادیده بگیر تا فرمان‌های پیش از اتصال بازپخش نشوند؛ وب‌هوکِ احتمالی حذف می‌شود (getUpdates با وب‌هوک کار نمی‌کند)
    let offset = 0;
    try { await bots.api(provider, token, "deleteWebhook", {}); } catch { /* همه‌ی API‌ها این متد را ندارند */ }
    try { const last = await bots.api(provider, token, "getUpdates", { offset: -1, limit: 1, timeout: 0 }); if (Array.isArray(last) && last[0]) offset = Number(last[0].update_id) + 1; } catch { /* بی‌اهمیت */ }
    const cafeId = req.user.cafeId, botId = String(me.id), enc = encryptToken(cfg, token, bots.tokenAad(cafeId, provider));
    await tx(pool, async (c) => {
      const cur = (await c.query("SELECT bot_id FROM bot_connections WHERE cafe_id=$1 AND provider=$2 FOR UPDATE", [cafeId, provider])).rows[0];
      const same = cur && cur.bot_id === botId;      // همان ربات (فقط توکن بازسازی شده) → پیوند چت و تنظیمات می‌ماند
      await c.query(`INSERT INTO bot_connections (cafe_id, provider, token_enc, token_hint, bot_id, bot_username, bot_name, update_offset)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (cafe_id, provider) DO UPDATE SET token_enc=$3, token_hint=$4, bot_id=$5, bot_username=$6, bot_name=$7, enabled=true, next_try_at=NULL, last_error='', last_error_at=NULL, lease_until=NULL, update_offset=$8,
          chat_id=CASE WHEN $9 THEN bot_connections.chat_id ELSE NULL END, chat_title=CASE WHEN $9 THEN bot_connections.chat_title ELSE '' END, chat_type=CASE WHEN $9 THEN bot_connections.chat_type ELSE '' END,
          link_hash=NULL, link_expires_at=NULL, link_fails=0, daily_retry_at=NULL, updated_at=now()`,
        [cafeId, provider, enc, token.slice(-4), botId, String(me.username || "").slice(0, 64), String(me.first_name || "").slice(0, 120), offset, !!same]);
      await log(c, req, "bot.connect", provider, { botUsername: me.username || "", replaced: !!cur, sameBot: !!same });
    });
    return { data: shape(provider, await rowOf(cafeId, provider)) };
  });

  app.patch("/api/bots/:provider", guard, async (req) => {
    const provider = prov(req), cur = await needRow(req, provider), b = req.body || {}, set = {};
    const flag = (k, col) => { if (b[k] !== undefined) set[col] = !!b[k]; };
    flag("enabled", "enabled"); flag("commandsEnabled", "commands_enabled"); flag("dailyEnabled", "daily_enabled"); flag("lowStockAlert", "low_stock_alert");
    if (b.dailyTime !== undefined) { if (typeof b.dailyTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.dailyTime)) throw invalid("ساعت گزارش روزانه باید به شکل HH:MM باشد"); set.daily_time = b.dailyTime; }
    if (b.currency !== undefined) { if (!["toman", "rial"].includes(b.currency)) throw invalid("واحد پول فقط toman یا rial است"); set.currency = b.currency; }
    if (set.daily_enabled && !cur.chat_id) throw invalid("برای گزارش روزانه ابتدا چت را به ربات پیوند دهید");
    if (set.enabled === true) { set.next_try_at = null; set.last_error = ""; }
    if (set.daily_time !== undefined || set.daily_enabled === true) set.daily_retry_at = null;
    // فرمان‌هایی که در زمان خاموشیِ ربات/فرمان‌ها فرستاده شده‌اند بعد از روشن‌شدن بازپخش نمی‌شوند
    if ((set.commands_enabled === true && !cur.commands_enabled) || (set.enabled === true && !cur.enabled)) { try { await bots.skipPending(provider, bots.tokenOf(cur), cur.cafe_id); } catch { /* ignore */ } }
    const keys = Object.keys(set);
    if (keys.length) await tx(pool, async (c) => {
      await c.query(`UPDATE bot_connections SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(", ")}, updated_at=now() WHERE cafe_id=$1 AND provider=$2`, [req.user.cafeId, provider, ...keys.map((k) => set[k])]);
      await log(c, req, "bot.settings", provider, set);
    });
    return { data: shape(provider, await rowOf(req.user.cafeId, provider)) };
  });

  app.post("/api/bots/:provider/link", limited, async (req) => {
    const provider = prov(req), cur = await needRow(req, provider), code = newLinkCode(), exp = new Date(Date.now() + bots.LINK_TTL_MS);
    try { await bots.skipPending(provider, bots.tokenOf(cur), cur.cafe_id); } catch { /* کلید رمزنگاری تغییر کرده؛ tick خطا را ثبت می‌کند */ }
    await tx(pool, async (c) => {
      await c.query("UPDATE bot_connections SET link_hash=$3, link_expires_at=$4, link_fails=0, enabled=true, next_try_at=NULL, updated_at=now() WHERE cafe_id=$1 AND provider=$2", [req.user.cafeId, provider, hashCode(code), exp]);
      await log(c, req, "bot.link_code", provider, {});
    });
    const meta = PROVIDERS[provider];
    return { data: { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: exp.toISOString(), command: `/start ${code}`, botLink: cur.bot_username ? meta.linkOf(cur.bot_username, provider === "telegram" ? code : "") : "" } };
  });

  app.post("/api/bots/:provider/unlink", guard, async (req) => {
    const provider = prov(req); await needRow(req, provider);
    await tx(pool, async (c) => {
      await c.query("UPDATE bot_connections SET chat_id=NULL, chat_title='', chat_type='', link_hash=NULL, link_expires_at=NULL, daily_enabled=false, updated_at=now() WHERE cafe_id=$1 AND provider=$2", [req.user.cafeId, provider]);
      await log(c, req, "bot.unlink", provider, {});
    });
    return { data: shape(provider, await rowOf(req.user.cafeId, provider)) };
  });

  const deliver = async (req, text) => {
    const provider = prov(req), row = await needRow(req, provider);
    if (!row.chat_id) throw new HttpError(409, "bot_not_linked", "هنوز چتی به این ربات پیوند نخورده است");
    try { await bots.send(provider, bots.tokenOf(row), row.chat_id, await text(row)); }
    catch (e) { if (e instanceof BotApiError) { await pool.query("UPDATE bot_connections SET last_error=$3, last_error_at=now() WHERE cafe_id=$1 AND provider=$2", [row.cafe_id, provider, e.message.slice(0, 300)]); throw bad(e); } throw e; }
    await pool.query("UPDATE bot_connections SET last_ok_at=now(), last_error='' WHERE cafe_id=$1 AND provider=$2", [row.cafe_id, provider]);
    return provider;
  };
  app.post("/api/bots/:provider/test", limited, async (req) => {
    const p = await deliver(req, async () => "✅ پیام آزمایشی کافینو — اتصال ربات برقرار است.");
    await tx(pool, (c) => log(c, req, "bot.test", p, {}));
    return { data: { ok: true } };
  });
  app.post("/api/bots/:provider/send", limited, async (req) => {
    const range = String(req.body?.range || "today");
    if (!RANGES[range]) throw invalid("بازهٔ گزارش نامعتبر است (today | yesterday | week | month)");
    const p = await deliver(req, (row) => bots.buildReport(row, range));
    await tx(pool, (c) => log(c, req, "bot.send_report", p, { range }));
    return { data: { ok: true } };
  });

  app.delete("/api/bots/:provider", guard, async (req) => {
    const provider = prov(req); await needRow(req, provider);
    await tx(pool, async (c) => { await c.query("DELETE FROM bot_connections WHERE cafe_id=$1 AND provider=$2", [req.user.cafeId, provider]); await log(c, req, "bot.disconnect", provider, {}); });
    return { data: shape(provider, null) };
  });
}
