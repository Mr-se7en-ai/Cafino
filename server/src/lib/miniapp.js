// مینی‌اپ تلگرام (1.80): اعتبارسنجی initData در سرور، نشست کوتاه‌عمر مینی‌اپ، یکسان‌سازی شمارهٔ موبایل و اعتبارسنجی تعرفهٔ عمومی.
// امنیت: initDataUnsafe فقط برای نمایش است؛ هویت فقط از «hash» امضاشده با توکن ربات (HMAC-SHA256 با کلید WebAppData) می‌آید.
// توکن ربات فقط از env خوانده می‌شود و در هیچ پاسخ/لاگی نیست.
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export class MiniappAuthError extends Error {
  constructor(code, message) { super(message); this.name = "MiniappAuthError"; this.code = code; }
}

/** رشتهٔ initData (query-string) → اعتبارسنجی امضا و تازگی. خروجی: { user, authDate, startParam, chatType } */
export function verifyInitData(initData, botToken, { maxAgeSec = 86400, now = () => Date.now() } = {}) {
  if (typeof initData !== "string" || initData.length < 20 || initData.length > 4096) throw new MiniappAuthError("bad_init_data", "داده‌های ورود تلگرام نامعتبر است");
  if (!botToken) throw new MiniappAuthError("disabled", "مینی‌اپ در این سرور فعال نیست");
  let params; try { params = new URLSearchParams(initData); } catch { throw new MiniappAuthError("bad_init_data", "داده‌های ورود تلگرام نامعتبر است"); }
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new MiniappAuthError("bad_init_data", "امضای ورود تلگرام ندارد");
  const keys = [...params.keys()].filter((k) => k !== "hash");
  if (new Set(keys).size !== keys.length) throw new MiniappAuthError("bad_init_data", "داده‌های ورود تلگرام تکراری است");
  const check = keys.sort().map((k) => `${k}=${params.get(k)}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const want = crypto.createHmac("sha256", secret).update(check).digest();
  const got = Buffer.from(hash, "hex");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) throw new MiniappAuthError("bad_signature", "امضای تلگرام معتبر نیست");
  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) throw new MiniappAuthError("bad_init_data", "زمان ورود تلگرام نامعتبر است");
  const nowSec = Math.floor(now() / 1000);
  if (authDate > nowSec + 300) throw new MiniappAuthError("bad_init_data", "زمان ورود تلگرام در آینده است");
  if (nowSec - authDate > maxAgeSec) throw new MiniappAuthError("expired", "ورود منقضی شده است؛ مینی‌اپ را از تلگرام دوباره باز کنید");
  let user; try { user = JSON.parse(params.get("user") || "null"); } catch { user = null; }
  if (!user || typeof user !== "object" || !Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot === true) throw new MiniappAuthError("bad_init_data", "کاربر تلگرام در داده‌های ورود نیست");
  const s = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").trim().slice(0, n);
  return {
    user: { id: user.id, firstName: s(user.first_name, 128), lastName: s(user.last_name, 128), username: s(user.username, 64), language: s(user.language_code, 16) },
    authDate, startParam: s(params.get("start_param"), 128), chatType: s(params.get("chat_type"), 20),
  };
}

// ── نشست مینی‌اپ: JWT کوتاه‌عمر با مخاطب جدا از نشست برنامهٔ کافی‌نت (توکن مینی‌اپ هرگز در API کافی‌نت پذیرفته نمی‌شود و برعکس) ──
const ISS = "cafino-api", AUD = "cafino-miniapp";
const keyOf = (cfg) => new Uint8Array(crypto.hkdfSync("sha256", Buffer.from(cfg.jwtSecret || "", "utf8"), Buffer.from("cafino-miniapp-session-v1"), Buffer.from("hs256"), 32));
export async function signSession(cfg, { telegramId, cafeId }) {
  return new SignJWT({ cid: cafeId || null }).setProtectedHeader({ alg: "HS256" }).setSubject(String(telegramId)).setIssuer(ISS).setAudience(AUD)
    .setIssuedAt().setExpirationTime(`${cfg.miniappSessionTtlSec}s`).sign(keyOf(cfg));
}
export async function verifySession(cfg, token) {
  try {
    const { payload } = await jwtVerify(token, keyOf(cfg), { issuer: ISS, audience: AUD, algorithms: ["HS256"] });
    if (!/^\d{1,15}$/.test(String(payload.sub))) return null;
    return { telegramId: Number(payload.sub), cafeId: payload.cid || null };
  } catch { return null; }
}

// ── شمارهٔ موبایل ایران: ارقام فارسی/عربی → لاتین؛ 0098/+98/98/0 حذف؛ نتیجه ۱۰ رقم (9xxxxxxxxx) یا "" ──────────────────────────
const DIG = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
export function normalizePhone(v) {
  let d = String(v ?? "").replace(/[۰-۹٠-٩]/g, (c) => DIG[c]).replace(/\D/g, "");
  if (d.startsWith("0098")) d = d.slice(4); else if (d.startsWith("98") && d.length === 12) d = d.slice(2); else if (d.startsWith("0")) d = d.slice(1);
  return /^9\d{9}$/.test(d) ? d : "";
}
// جست‌وجوی مشتری بر پایهٔ شمارهٔ یکسان‌شده در «برنامه» انجام می‌شود، نه با توابع متنی پایگاه‌داده (روی پایگاه‌دادهٔ غیر UTF8 ارقام فارسی را بایتی تبدیل می‌کنند).
// برای فایل‌ها فقط یک پیش‌فیلتر LIKE روی ۴ رقم آخر (لاتین/فارسی/عربی) می‌گذاریم و تطبیق نهایی در برنامه است.
const TO_FA = "۰۱۲۳۴۵۶۷۸۹", TO_AR = "٠١٢٣٤٥٦٧٨٩";
export const phoneLikePatterns = (phone) => { const t = String(phone).slice(-4); return [t, [...t].map((d) => TO_FA[+d]).join(""), [...t].map((d) => TO_AR[+d]).join("")].map((x) => `%${x}%`); };
export const samePhone = (a, b) => { const x = normalizePhone(a); return x !== "" && x === normalizePhone(b); };

// ── کد عمومی کافی‌نت در پیام شروع ربات: c_<۱۶ نویسهٔ base32> ───────────────────────────────────────────────────────────────
export const CODE_RE = /^[a-z2-7]{16}$/;
export const startPayloadOf = (code) => `c_${code}`;
export function codeFromPayload(v) {
  const m = /^(?:c_)?([a-z2-7]{16})$/.exec(String(v ?? "").trim().toLowerCase());
  return m ? m[1] : "";
}

// ── تعرفهٔ عمومی: [{cat, items:[{name, price}]}] با سقف‌های سخت؛ فقط متن ساده و مبلغ صحیح (ریال) ─────────────────────────────────
const cleanText = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export function sanitizeTariff(input) {
  if (!Array.isArray(input)) return { error: "تعرفه باید فهرست گروه‌ها باشد" };
  if (input.length > 40) return { error: "حداکثر ۴۰ گروه خدمات" };
  const groups = [];
  for (const g of input) {
    if (!g || typeof g !== "object" || !Array.isArray(g.items)) continue;
    if (g.items.length > 80) return { error: "حداکثر ۸۰ خدمت در هر گروه" };
    const items = [];
    for (const it of g.items) {
      if (!it || typeof it !== "object") continue;
      const name = cleanText(it.name, 120), price = Number(it.price);
      if (!name) continue;
      if (!Number.isFinite(price) || price < 0 || price > 1e11) return { error: `قیمت «${name}» نامعتبر است` };
      items.push({ name, price: Math.round(price) });
    }
    const cat = cleanText(g.cat, 80);
    if (cat && items.length) groups.push({ cat, items });
  }
  return { groups };
}
export const tariffHash = (groups) => crypto.createHash("sha256").update(JSON.stringify(groups)).digest("hex").slice(0, 32);
