// ربات مشترک مینی‌اپ تلگرام (1.80) — «یک ربات برای همهٔ کافی‌نت‌ها». ربات فقط سه کار می‌کند:
//   ۱) /start c_<کد کافی‌نت> → کافی‌نت را برای این کاربر یادآوری می‌کند و دکمهٔ «ورود به کافینو» (web_app) می‌فرستد؛
//   ۲) دکمهٔ «ارسال شمارهٔ من» (request_contact): فقط اگر contact.user_id همان فرستندهٔ پیام باشد شماره «تأییدشده» ثبت می‌شود؛
//   ۳) تنظیم خودکار ربات هنگام راه‌اندازی: deleteWebhook، فرمان‌ها و دکمهٔ منوی پیش‌فرض.
// بدون وب‌هوک: getUpdates با اجارهٔ پایگاه‌داده (چند نمونهٔ سرور هم‌زمان پردازش نمی‌کنند). همهٔ پیام‌ها متن ساده‌اند (بدون parse_mode).
import { BotApiError, callApi } from "./bots.js";
import { codeFromPayload, normalizePhone, resolveIdentity, startPayloadOf } from "./miniapp.js";

const clean = (v, n = 120) => String(v ?? "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export const BTN_ENTER = "ورود به کافینو", BTN_PHONE = "ارسال شمارهٔ من";

// 1.86: همین کد دو کار می‌کند — «ربات مشترک» (پیش‌فرض) و «ربات اختصاصی یک کافی‌نت» (token/provider/fixedCafeId/store داده شود).
// ربات اختصاصی همیشه به یک کافی‌نت بسته است (/start هر چه باشد همان کافی‌نت)، هویت کاربرانش «مصنوعی و محدود به همان کافی‌نت» است
// و وضعیت (آفست/اجاره) در ردیف خودش در miniapp_cafe_bots نگه‌داری می‌شود.
export function createMiniappBot({ pool, cfg, log = {}, fetchImpl = globalThis.fetch, now = () => new Date(), token = cfg.miniappToken, provider = "telegram", fixedCafeId = null, store = null, cafeBots = null }) {
  const warn = (o, m) => log.warn?.(o, m);
  const enabled = () => Boolean(token && cfg.miniappUrl);
  const api = (method, body) => callApi(cfg, provider, token, method, body, { fetchImpl });
  let info = null, nextTryAt = 0;
  const sharedStore = {
    lease: async () => { const r = (await pool.query("UPDATE miniapp_bot_state SET lease_until = now() + interval '30 seconds' WHERE id=1 AND (lease_until IS NULL OR lease_until < now()) RETURNING update_offset")).rows[0]; return r ? Number(r.update_offset) : null; },
    offset: (n) => pool.query("UPDATE miniapp_bot_state SET update_offset=$1 WHERE id=1 AND update_offset < $1", [n]),
    ok: () => pool.query("UPDATE miniapp_bot_state SET last_ok_at=now(), last_error='' WHERE id=1"),
    fail: (m) => pool.query("UPDATE miniapp_bot_state SET last_error=$1 WHERE id=1", [m]),
    release: () => pool.query("UPDATE miniapp_bot_state SET lease_until=NULL WHERE id=1"),
    info: (me, username) => pool.query("UPDATE miniapp_bot_state SET bot_id=$1, bot_username=$2, last_error='', updated_at=now() WHERE id=1", [me.id, username]),
  };
  const st = store || sharedStore;

  const appUrl = (code) => `${cfg.miniappUrl}/${code ? `?c=${encodeURIComponent(code)}` : ""}`;
  const enterMarkup = (code) => ({ inline_keyboard: [[{ text: BTN_ENTER, web_app: { url: appUrl(code) } }]] });
  const sayRaw = (chatId, text, reply_markup) => api("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) });
  // بله: اگر دکمهٔ web_app پذیرفته نشد (پشتیبانی آن از اینجا قابل راستی‌آزمایی نبود) همان پیام با نشانی متنی دوباره فرستاده می‌شود
  const say = async (chatId, text, reply_markup) => {
    try { return await sayRaw(chatId, text, reply_markup); }
    catch (e) {
      const url = reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url;
      if (provider === "bale" && url && e instanceof BotApiError && e.status === 400) return sayRaw(chatId, `${text}\n${url}`);
      throw e;
    }
  };

  /** راه‌اندازی/پیکربندی ربات (idempotent). هر بار که getMe موفق نشده باشد دوباره تلاش می‌شود. */
  async function init() {
    const me = await api("getMe", {});
    info = { id: me.id, username: me.username || "" };
    await api("deleteWebhook", { drop_pending_updates: false }).catch((e) => warn({ err: e.message }, "miniapp deleteWebhook failed"));
    await api("setMyCommands", { commands: [{ command: "start", description: "شروع و ورود به کافینو" }, { command: "app", description: "باز کردن مینی‌اپ" }, { command: "help", description: "راهنما" }] }).catch((e) => warn({ err: e.message }, "miniapp setMyCommands failed"));
    await api("setChatMenuButton", { menu_button: { type: "web_app", text: BTN_ENTER, web_app: { url: appUrl(fixedCafeId ? (await cafeById(fixedCafeId))?.code || "" : "") } } }).catch((e) => warn({ err: e.message }, "miniapp setChatMenuButton failed"));
    await st.info(me, info.username);
    return info;
  }

  async function cafeByCode(code) {
    if (!code) return null;
    const r = await pool.query("SELECT s.cafe_id, s.code, COALESCE(NULLIF(s.shop_name,''), c.name) AS name FROM upload_settings s JOIN cafes c ON c.id=s.cafe_id WHERE s.code=$1 AND s.miniapp_enabled AND c.status='active'", [code]);
    return r.rows[0] || null;
  }

  const cafeById = async (id) => (await pool.query("SELECT s.cafe_id, s.code, COALESCE(NULLIF(s.shop_name,''), c.name) AS name FROM upload_settings s JOIN cafes c ON c.id=s.cafe_id WHERE s.cafe_id=$1 AND s.miniapp_enabled AND c.status='active'", [id])).rows[0] || null;

  /** ارسال یک پیام به یک کاربر با ربات درست: هویت مصنوعی ← ربات اختصاصی همان کافی‌نت؛ هویت واقعی ← ربات مشترک. */
  async function deliver(cafeId, telegramId, chatId, text, markup) {
    if (Number(telegramId) >= 1e15) {
      const idn = (await pool.query("SELECT cafe_id, provider FROM miniapp_identities WHERE telegram_id=$1", [telegramId])).rows[0];
      if (!idn || String(idn.cafe_id) !== String(cafeId)) return false;
      const own = cafeBots ? await cafeBots.sender(cafeId, idn.provider) : null;
      if (!own) return false;
      await own.say(chatId, text, markup); return true;
    }
    if (!enabled()) return false;
    await say(chatId, text, markup); return true;
  }

  const staffLink = async (tgId) => (await pool.query("SELECT 1 FROM telegram_staff_links WHERE telegram_id=$1", [tgId])).rowCount > 0;
  /** اعلان به کاربران کافی‌نتِ متصل (فقط کسانی که اعلان را روشن دارند و ربات را Start کرده‌اند). بی‌صدا شکست می‌خورد. */
  async function notifyStaff(cafeId, text) {
    if (!cfg.miniappUrl) return 0;
    const code = (await pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [cafeId])).rows[0]?.code || "";
    const r = await pool.query("SELECT t.chat_id, t.telegram_id FROM telegram_staff_links l JOIN telegram_users t ON t.telegram_id=l.telegram_id JOIN users u ON u.id=l.user_id WHERE l.cafe_id=$1 AND l.notify AND u.is_active AND t.chat_id IS NOT NULL LIMIT 20", [cafeId]);
    let n = 0;
    for (const x of r.rows) { try { if (await deliver(cafeId, x.telegram_id, x.chat_id, clean(text, 900).replace(/ ?\n ?/g, "\n"), { inline_keyboard: [[{ text: "باز کردن بخش کافی‌نت", web_app: { url: Number(x.telegram_id) >= 1e15 ? `${cfg.miniappUrl}/?m=staff&c=${encodeURIComponent(code)}` : `${cfg.miniappUrl}/?m=staff` } }]] })) n++; } catch (e) { warn({ err: e?.message }, "miniapp notify failed"); } }
    return n;
  }

  /** اعلان به یک مشتری (فقط اگر ربات را Start کرده باشد). با دکمهٔ باز کردن مینی‌اپ همان کافی‌نت. بی‌صدا شکست می‌خورد. */
  async function notifyCustomer(cafeId, telegramId, text) {
    if (!cfg.miniappUrl) return false;
    const r = (await pool.query("SELECT t.chat_id, s.code FROM telegram_users t, upload_settings s WHERE t.telegram_id=$1 AND s.cafe_id=$2", [telegramId, cafeId])).rows[0];
    if (!r || !r.chat_id) return false;
    try { return await deliver(cafeId, telegramId, r.chat_id, clean(text, 900).replace(/ ?\n ?/g, "\n"), { inline_keyboard: [[{ text: BTN_ENTER, web_app: { url: appUrl(r.code) } }]] }); } catch (e) { warn({ err: e?.message }, "miniapp customer notify failed"); return false; }
  }

  async function upsertUser(from, chatId, tid = from.id) {
    const r = await pool.query(
      `INSERT INTO telegram_users (telegram_id, first_name, last_name, username, language, chat_id) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (telegram_id) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, username=EXCLUDED.username, language=EXCLUDED.language, chat_id=EXCLUDED.chat_id, updated_at=now()
       RETURNING *`, [tid, clean(from.first_name, 128), clean(from.last_name, 128), clean(from.username, 64), clean(from.language_code, 16), chatId]);
    return r.rows[0];
  }

  async function welcome(chatId, user, cafe) {
    if (cafe) {
      await pool.query("UPDATE telegram_users SET last_cafe_id=$2, updated_at=now() WHERE telegram_id=$1", [user.telegram_id, cafe.cafe_id]);
      user.last_cafe_id = cafe.cafe_id;
      await api("setChatMenuButton", { chat_id: chatId, menu_button: { type: "web_app", text: BTN_ENTER, web_app: { url: appUrl(cafe.code) } } }).catch((e) => warn({ err: e.message }, "miniapp per-chat menu failed"));
      await say(chatId, `به کافی‌نت «${clean(cafe.name)}» خوش آمدید.\nبا دکمهٔ زیر وارد کافینو شوید؛ خدمات، قیمت‌ها و وضعیت سفارش‌هایتان را ببینید.`, enterMarkup(cafe.code));
    } else if (await staffLink(user.telegram_id)) {
      return void await say(chatId, "به بخش کافی‌نت کافینو خوش آمدید. با دکمهٔ زیر وارد شوید؛ سفارش‌ها، فایل‌ها و درخواست‌های مشتری را ببینید.", { inline_keyboard: [[{ text: "ورود کافی‌نت", web_app: { url: `${cfg.miniappUrl}/?m=staff` } }]] });
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
    const old = await pool.query("UPDATE telegram_users SET phone='', phone_verified_at=NULL, updated_at=now() WHERE phone=$1 AND telegram_id<>$2 RETURNING telegram_id", [phone, user.telegram_id]);
    if (old.rowCount) await pool.query("DELETE FROM telegram_links WHERE telegram_id = ANY($1::bigint[])", [old.rows.map((r) => r.telegram_id)]);
    await pool.query("UPDATE telegram_users SET phone=$2, phone_verified_at=now(), updated_at=now() WHERE telegram_id=$1", [user.telegram_id, phone]);
    const code = user.last_cafe_id ? (await pool.query("SELECT code FROM upload_settings WHERE cafe_id=$1", [user.last_cafe_id])).rows[0]?.code || "" : "";
    await say(chatId, "✅ شمارهٔ شما تأیید شد. حالا مینی‌اپ را باز کنید.", code ? enterMarkup(code) : { remove_keyboard: true });
    if (code) await say(chatId, "دکمهٔ پایین صفحه نیز به همین کافی‌نت وصل است.", { remove_keyboard: true });
  }

  async function handle(u, budget) {
    const m = u?.message;
    if (!m || !m.from || m.from.is_bot || !m.chat || m.chat.type !== "private" || budget.left-- <= 0) return;
    const chatId = m.chat.id, user = await upsertUser(m.from, chatId, fixedCafeId ? await resolveIdentity(pool, fixedCafeId, provider, m.from.id) : m.from.id);
    if (m.contact) return onContact(chatId, m.from, m.contact, user);
    const text = typeof m.text === "string" ? m.text.trim() : "";
    const mm = /^\/(start|app|help)(?:@\w+)?(?:\s+(\S+))?/.exec(text);
    if (!mm) return void await say(chatId, `برای ورود از دکمهٔ «${BTN_ENTER}» استفاده کنید. راهنما: /help`);
    if (mm[1] === "help") return void await say(chatId, `🤖 ربات کافینو\n\n/start — شروع و ورود\n/app — باز کردن مینی‌اپ\n\nهر کافی‌نت لینک یا QR مخصوص خودش را دارد؛ با آن وارد شوید.`);
    if (fixedCafeId) {     // ربات اختصاصی: هر /start همان کافی‌نت است
      const cafe = await cafeById(fixedCafeId);
      return cafe ? welcome(chatId, user, cafe) : void await say(chatId, "مینی‌اپ این کافی‌نت فعلاً بسته است.");
    }
    return welcome(chatId, user, await cafeByCode(codeFromPayload(mm[2])));
  }

  /** یک دور پردازش. true = کاری انجام شد. */
  async function tick() {
    if (!enabled() || now().getTime() < nextTryAt) return false;
    const offset = await st.lease();
    if (offset === null) return false;
    try {
      if (!info) await init();
      const ups = await api("getUpdates", { offset, limit: 30, timeout: 0, allowed_updates: ["message"] });
      const budget = { left: 20 };
      for (const u of Array.isArray(ups) ? ups : []) {
        try { await handle(u, budget); } catch (e) { if (e instanceof BotApiError && ["bad_token", "rate_limited"].includes(e.code)) throw e; warn({ err: e?.message }, "miniapp update failed"); }
        await st.offset(Number(u.update_id) + 1);
      }
      await st.ok();
      return true;
    } catch (e) {
      const bad = e instanceof BotApiError ? e : new BotApiError("خطای داخلی ربات مینی‌اپ", { code: "internal" });
      if (!(e instanceof BotApiError)) warn({ err: e?.message }, "miniapp bot failed");
      nextTryAt = now().getTime() + Math.max((bad.retryAfter || 0) * 1000, bad.code === "bad_token" ? 3600e3 : 15e3);
      await st.fail(bad.message.slice(0, 300)).catch(() => {});
      return false;
    } finally { await st.release().catch(() => {}); }
  }

  let timer = null, busy = false;
  return {
    enabled, init, tick, appUrl, notifyStaff, notifyCustomer, say, provider,
    info: () => info,
    startLink: (code) => (info?.username ? (provider === "bale" ? `https://ble.ir/${info.username}` : `https://t.me/${info.username}?start=${startPayloadOf(code)}`) : ""),
    start() {
      if (timer || !enabled()) return;
      timer = setInterval(async () => { if (busy) return; busy = true; try { await tick(); } catch (e) { warn({ err: e?.message }, "miniapp loop failed"); } finally { busy = false; } }, cfg.miniappPollIntervalMs);
      timer.unref?.();
      tick().catch(() => {});
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
