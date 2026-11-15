// ربات مشترک مینی‌اپ تلگرام (1.80) — «یک ربات برای همهٔ کافی‌نت‌ها». ربات فقط سه کار می‌کند:
//   ۱) /start c_<کد کافی‌نت> → کافی‌نت را برای این کاربر یادآوری می‌کند و دکمهٔ «ورود به کافینو» (web_app) می‌فرستد؛
//   ۲) دکمهٔ «ارسال شمارهٔ من» (request_contact): فقط اگر contact.user_id همان فرستندهٔ پیام باشد شماره «تأییدشده» ثبت می‌شود؛
//   ۳) تنظیم خودکار ربات هنگام راه‌اندازی: deleteWebhook، فرمان‌ها و دکمهٔ منوی پیش‌فرض.
// بدون وب‌هوک: getUpdates با اجارهٔ پایگاه‌داده (چند نمونهٔ سرور هم‌زمان پردازش نمی‌کنند). همهٔ پیام‌ها متن ساده‌اند (بدون parse_mode).
import { BotApiError, callApi } from "./bots.js";
import { codeFromPayload, normalizePhone, startPayloadOf } from "./miniapp.js";

const clean = (v, n = 120) => String(v ?? "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export const BTN_ENTER = "ورود به کافینو", BTN_PHONE = "ارسال شمارهٔ من";

export function createMiniappBot({ pool, cfg, log = {}, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  const warn = (o, m) => log.warn?.(o, m), token = cfg.miniappToken;
  const enabled = () => Boolean(token && cfg.miniappUrl);
  const api = (method, body) => callApi(cfg, "telegram", token, method, body, { fetchImpl });
  let info = null, nextTryAt = 0;

  const appUrl = (code) => `${cfg.miniappUrl}/${code ? `?c=${encodeURIComponent(code)}` : ""}`;
  const enterMarkup = (code) => ({ inline_keyboard: [[{ text: BTN_ENTER, web_app: { url: appUrl(code) } }]] });
  const say = (chatId, text, reply_markup) => api("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) });

  /** راه‌اندازی/پیکربندی ربات (idempotent). هر بار که getMe موفق نشده باشد دوباره تلاش می‌شود. */
  async function init() {
    const me = await api("getMe", {});
    info = { id: me.id, username: me.username || "" };
    await api("deleteWebhook", { drop_pending_updates: false }).catch((e) => warn({ err: e.message }, "miniapp deleteWebhook failed"));
    await api("setMyCommands", { commands: [{ command: "start", description: "شروع و ورود به کافینو" }, { command: "app", description: "باز کردن مینی‌اپ" }, { command: "help", description: "راهنما" }] }).catch((e) => warn({ err: e.message }, "miniapp setMyCommands failed"));
    await api("setChatMenuButton", { menu_button: { type: "web_app", text: BTN_ENTER, web_app: { url: appUrl("") } } }).catch((e) => warn({ err: e.message }, "miniapp setChatMenuButton failed"));
    await pool.query("UPDATE miniapp_bot_state SET bot_id=$1, bot_username=$2, last_error='', updated_at=now() WHERE id=1", [me.id, info.username]);
    return info;
  }

  async function cafeByCode(code) {
    if (!code) return null;
    const r = await pool.query("SELECT s.cafe_id, s.code, COALESCE(NULLIF(s.shop_name,''), c.name) AS name FROM upload_settings s JOIN cafes c ON c.id=s.cafe_id WHERE s.code=$1 AND s.miniapp_enabled AND c.status='active'", [code]);
    return r.rows[0] || null;
  }

  async function upsertUser(from, chatId) {
    const r = await pool.query(
      `INSERT INTO telegram_users (telegram_id, first_name, last_name, username, language, chat_id) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (telegram_id) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, username=EXCLUDED.username, language=EXCLUDED.language, chat_id=EXCLUDED.chat_id, updated_at=now()
       RETURNING *`, [from.id, clean(from.first_name, 128), clean(from.last_name, 128), clean(from.username, 64), clean(from.language_code, 16), chatId]);
    return r.rows[0];
  }

  async function welcome(chatId, user, cafe) {
    if (cafe) {
      await pool.query("UPDATE telegram_users SET last_cafe_id=$2, updated_at=now() WHERE telegram_id=$1", [user.telegram_id, cafe.cafe_id]);
      user.last_cafe_id = cafe.cafe_id;
      await api("setChatMenuButton", { chat_id: chatId, menu_button: { type: "web_app", text: BTN_ENTER, web_app: { url: appUrl(cafe.code) } } }).catch((e) => warn({ err: e.message }, "miniapp per-chat menu failed"));
      await say(chatId, `به کافی‌نت «${clean(cafe.name)}» خوش آمدید.\nبا دکمهٔ زیر وارد کافینو شوید؛ خدمات، قیمت‌ها و وضعیت سفارش‌هایتان را ببینید.`, enterMarkup(cafe.code));
    } else {
      const last = user.last_cafe_id ? (await pool.query("SELECT s.cafe_id, s.code, COALESCE(NULLIF(s.shop_name,''), c.name) AS name FROM upload_settings s JOIN cafes c ON c.id=s.cafe_id WHERE s.cafe_id=$1 AND s.miniapp_enabled AND c.status='active'", [user.last_cafe_id])).rows[0] : null;
      if (last) return welcome(chatId, user, last);
      return void await say(chatId, "برای شروع، لینک یا QR مخصوص کافی‌نت خودتان را از کافی‌نت بگیرید و باز کنید.");
    }
    if (!user.phone_verified_at) {
      await say(chatId, "برای دیدن سفارش‌ها و مانده حساب‌تان، شمارهٔ موبایل خود را با دکمهٔ «ارسال شمارهٔ من» تأیید کنید. شماره فقط برای شناسایی شما در همین کافی‌نت استفاده می‌شود.", { keyboard: [[{ text: BTN_PHONE, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true });
    }
  }

  async function onContact(chatId, from, contact, user) {
    if (Number(contact.user_id) !== Number(from.id)) return void await say(chatId, "فقط شمارهٔ خودتان پذیرفته می‌شود. دکمهٔ «ارسال شمارهٔ من» را بزنید.");
    const phone = normalizePhone(contact.phone_number);
    if (!phone) return void await say(chatId, "شمارهٔ موبایل ایران لازم است (مثل ۰۹۱۲…).", { remove_keyboard: true });
    // یک شماره فقط برای «آخرین حسابی که تأیید کرده» معتبر است (شمارهٔ بازیافت‌شده/حساب قدیمی نباید به اطلاعات مشتری دسترسی داشته باشد)
    const old = await pool.query("UPDATE telegram_users SET phone='', phone_verified_at=NULL, updated_at=now() WHERE phone=$1 AND telegram_id<>$2 RETURNING telegram_id", [phone, from.id]);
    if (old.rowCount) await pool.query("DELETE FROM telegram_links WHERE telegram_id = ANY($1::bigint[])", [old.rows.map((r) => r.telegram_id)]);
    await pool.query("UPDATE telegram_users SET phone=$2, phone_verified_at=now(), updated_at=now() WHERE telegram_id=$1", [from.id, phone]);
    const code = user.last_cafe_id ? (await pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [user.last_cafe_id])).rows[0]?.code || "" : "";
    await say(chatId, "✅ شمارهٔ شما تأیید شد. حالا مینی‌اپ را باز کنید.", code ? enterMarkup(code) : { remove_keyboard: true });
    if (code) await say(chatId, "دکمهٔ پایین صفحه نیز به همین کافی‌نت وصل است.", { remove_keyboard: true });
  }

  async function handle(u, budget) {
    const m = u?.message;
    if (!m || !m.from || m.from.is_bot || !m.chat || m.chat.type !== "private" || budget.left-- <= 0) return;
    const chatId = m.chat.id, user = await upsertUser(m.from, chatId);
    if (m.contact) return onContact(chatId, m.from, m.contact, user);
    const text = typeof m.text === "string" ? m.text.trim() : "";
    const mm = /^\/(start|app|help)(?:@\w+)?(?:\s+(\S+))?/.exec(text);
    if (!mm) return void await say(chatId, `برای ورود از دکمهٔ «${BTN_ENTER}» استفاده کنید. راهنما: /help`);
    if (mm[1] === "help") return void await say(chatId, `🤖 ربات کافینو\n\n/start — شروع و ورود\n/app — باز کردن مینی‌اپ\n\nهر کافی‌نت لینک یا QR مخصوص خودش را دارد؛ با آن وارد شوید.`);
    return welcome(chatId, user, await cafeByCode(codeFromPayload(mm[2])));
  }

  /** یک دور پردازش. true = کاری انجام شد. */
  async function tick() {
    if (!enabled() || now().getTime() < nextTryAt) return false;
    const lease = await pool.query("UPDATE miniapp_bot_state SET lease_until = now() + interval '30 seconds' WHERE id=1 AND (lease_until IS NULL OR lease_until < now()) RETURNING update_offset");
    if (!lease.rows[0]) return false;
    try {
      if (!info) await init();
      const ups = await api("getUpdates", { offset: Number(lease.rows[0].update_offset), limit: 30, timeout: 0, allowed_updates: ["message"] });
      const budget = { left: 20 };
      for (const u of Array.isArray(ups) ? ups : []) {
        try { await handle(u, budget); } catch (e) { if (e instanceof BotApiError && ["bad_token", "rate_limited"].includes(e.code)) throw e; warn({ err: e?.message }, "miniapp update failed"); }
        await pool.query("UPDATE miniapp_bot_state SET update_offset=$1 WHERE id=1 AND update_offset < $1", [Number(u.update_id) + 1]);
      }
      await pool.query("UPDATE miniapp_bot_state SET last_ok_at=now(), last_error='' WHERE id=1");
      return true;
    } catch (e) {
      const bad = e instanceof BotApiError ? e : new BotApiError("خطای داخلی ربات مینی‌اپ", { code: "internal" });
      if (!(e instanceof BotApiError)) warn({ err: e?.message }, "miniapp bot failed");
      nextTryAt = now().getTime() + Math.max((bad.retryAfter || 0) * 1000, bad.code === "bad_token" ? 3600e3 : 15e3);
      await pool.query("UPDATE miniapp_bot_state SET last_error=$1 WHERE id=1", [bad.message.slice(0, 300)]).catch(() => {});
      return false;
    } finally { await pool.query("UPDATE miniapp_bot_state SET lease_until=NULL WHERE id=1").catch(() => {}); }
  }

  let timer = null, busy = false;
  return {
    enabled, init, tick, appUrl,
    info: () => info,
    startLink: (code) => (info?.username ? `https://t.me/${info.username}?start=${startPayloadOf(code)}` : ""),
    start() {
      if (timer || !enabled()) return;
      timer = setInterval(async () => { if (busy) return; busy = true; try { await tick(); } catch (e) { warn({ err: e?.message }, "miniapp loop failed"); } finally { busy = false; } }, cfg.miniappPollIntervalMs);
      timer.unref?.();
      tick().catch(() => {});
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
