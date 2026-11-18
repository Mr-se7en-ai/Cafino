// ربات‌های مینی‌اپ اختصاصی کافی‌نت‌ها (1.86) — هر کافی‌نت می‌تواند توکن رباتِ تلگرام و/یا بلهٔ خودش را وارد کند.
// هر ردیف miniapp_cafe_bots یک نمونهٔ createMiniappBot با «کافی‌نتِ ثابت» و وضعیت (آفست/اجاره) مخصوص خودش است؛
// پرسش (getUpdates) با اجارهٔ پایگاه‌داده انجام می‌شود، پس چند نمونهٔ سرور یک ربات را دوبار پردازش نمی‌کنند.
// توکن: رمزنگاری‌شده (AES-256-GCM با AAD مخصوص هر ردیف)؛ هرگز در پاسخ/لاگ نیست.
import { decryptToken } from "./bots.js";
import { createMiniappBot } from "./miniappBot.js";

export const aadOf = (cafeId, provider) => `miniapp-bot:${cafeId}:${provider}`;

export function createCafeBots({ pool, cfg, log = {}, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  const cache = new Map();   // «کافی‌نت:پیام‌رسان» → { stamp, bot }
  const warn = (o, m) => log.warn?.(o, m);

  const rowStore = (cafeId, provider) => {
    const w = "cafe_id=$1 AND provider=$2", a = [cafeId, provider];
    return {
      lease: async () => { const r = (await pool.query(`UPDATE miniapp_cafe_bots SET lease_until = now() + interval '30 seconds' WHERE ${w} AND enabled AND (lease_until IS NULL OR lease_until < now()) RETURNING update_offset`, a)).rows[0]; return r ? Number(r.update_offset) : null; },
      offset: (n) => pool.query(`UPDATE miniapp_cafe_bots SET update_offset=$3 WHERE ${w} AND update_offset < $3`, [...a, n]),
      ok: () => pool.query(`UPDATE miniapp_cafe_bots SET last_ok_at=now(), last_error='', last_error_at=NULL WHERE ${w}`, a),
      fail: (m) => pool.query(`UPDATE miniapp_cafe_bots SET last_error=$3, last_error_at=now() WHERE ${w}`, [...a, m]),
      release: () => pool.query(`UPDATE miniapp_cafe_bots SET lease_until=NULL WHERE ${w}`, a),
      info: (me, username) => pool.query(`UPDATE miniapp_cafe_bots SET bot_username=$3, last_error='', last_error_at=NULL WHERE ${w}`, [...a, String(username || "").slice(0, 64)]),
    };
  };

  /** نمونهٔ ربات برای یک ردیف؛ با تغییر توکن/به‌روزرسانی ردیف دوباره ساخته می‌شود. null = توکن خوانده نشد (کلید رمزنگاری عوض شده). */
  function instanceOf(row) {
    const key = `${row.cafe_id}:${row.provider}`, stamp = String(new Date(row.updated_at).getTime());
    const hit = cache.get(key);
    if (hit && hit.stamp === stamp) return hit.bot;
    let token;
    try { token = decryptToken(cfg, row.token_enc, aadOf(row.cafe_id, row.provider)); } catch { cache.delete(key); return null; }
    const bot = createMiniappBot({ pool, cfg, log, fetchImpl, now, token, provider: row.provider, fixedCafeId: row.cafe_id, store: rowStore(row.cafe_id, row.provider) });
    cache.set(key, { stamp, bot });
    return bot;
  }
  const forget = (cafeId, provider) => cache.delete(`${cafeId}:${provider}`);

  /** فرستندهٔ ربات اختصاصی (برای اعلان‌ها). null = این کافی‌نت چنین رباتی ندارد/خاموش است. */
  async function sender(cafeId, provider) {
    const row = (await pool.query("SELECT * FROM miniapp_cafe_bots WHERE cafe_id=$1 AND provider=$2 AND enabled", [cafeId, provider])).rows[0];
    return row ? instanceOf(row) : null;
  }

  /** یک دور پرسش: ربات‌هایی که مدت بیشتری است پرسش نشده‌اند اول می‌آیند (عدالت)؛ هر گروه ۵تایی هم‌زمان. */
  async function tick() {
    if (!cfg.miniappUrl) return 0;
    const rows = (await pool.query(
      `UPDATE miniapp_cafe_bots SET last_poll_at=now() WHERE (cafe_id, provider) IN (
         SELECT cafe_id, provider FROM miniapp_cafe_bots WHERE enabled AND (lease_until IS NULL OR lease_until < now()) ORDER BY last_poll_at NULLS FIRST LIMIT $1) RETURNING *`, [cfg.miniappCafeBotsPerTick])).rows;
    let n = 0;
    for (let i = 0; i < rows.length; i += 5) {
      await Promise.allSettled(rows.slice(i, i + 5).map(async (r) => {
        const bot = instanceOf(r);
        if (!bot) return void await pool.query("UPDATE miniapp_cafe_bots SET last_error='توکن ذخیره‌شده خوانده نشد (کلید رمزنگاری عوض شده؟)؛ توکن را دوباره وارد کنید', last_error_at=now() WHERE cafe_id=$1 AND provider=$2", [r.cafe_id, r.provider]);
        try { if (await bot.tick()) n++; } catch (e) { warn({ err: e?.message }, "miniapp cafe bot tick failed"); }
      }));
    }
    return n;
  }

  let timer = null, busy = false;
  return {
    tick, sender, instanceOf, forget,
    start() {
      if (timer || !cfg.miniappUrl) return;
      timer = setInterval(async () => { if (busy) return; busy = true; try { await tick(); } catch (e) { warn({ err: e?.message }, "miniapp cafe bots loop failed"); } finally { busy = false; } }, cfg.miniappPollIntervalMs);
      timer.unref?.();
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
