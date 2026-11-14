// ربات‌های گزارش بله و تلگرام (1.79): ذخیرهٔ رمزنگاری‌شدهٔ توکن، کلاینت Bot API (هر دو API سازگار با تلگرام‌اند)، قالب پیام فارسی،
// فرمان‌ها (فقط از چت پیوندخورده) و زمان‌بند گزارش روزانه. بدون وابستگی تازه: fetch داخلی Node.
// امنیت: توکن فقط رمزنگاری‌شده در پایگاه‌داده است و در هیچ پاسخ/لاگ/خطایی ظاهر نمی‌شود؛ نشانی API فقط از تنظیمات سرور می‌آید (نه از کاربر)،
// ریدایرکت پذیرفته نمی‌شود؛ پیام‌ها متن ساده‌اند (بدون parse_mode) تا نام مشتری/کالا نتواند قالب را تزریق کند.
import crypto from "node:crypto";
import { summaryOf } from "./reportData.js";

export const PROVIDERS = {
  telegram: { label: "تلگرام", host: "api.telegram.org", linkOf: (u, code) => `https://t.me/${u}${code ? `?start=${code}` : ""}` },
  bale: { label: "بله", host: "tapi.bale.ai", linkOf: (u) => `https://ble.ir/${u}` },
};
export const isProvider = (p) => Object.prototype.hasOwnProperty.call(PROVIDERS, p);
export const TOKEN_RE = /^\d{3,16}:[A-Za-z0-9_:-]{16,100}$/;
const LINK_TTL_MS = 10 * 60 * 1000, MAX_LINK_FAILS = 5;

// ── رمزنگاری توکن (AES-256-GCM؛ کلید از BOT_TOKEN_KEY یا مشتق از JWT_SECRET) ──────────────────────────────────────────
const keyOf = (cfg) => Buffer.from(crypto.hkdfSync("sha256", Buffer.from(cfg.botTokenKey || cfg.jwtSecret || "", "utf8"), Buffer.from("cafino-bot-token-v1"), Buffer.from("aes-256-gcm"), 32));
export function encryptToken(cfg, token, aad = "") {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", keyOf(cfg), iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}
export function decryptToken(cfg, enc, aad = "") {
  const [v, iv, tag, ct] = String(enc).split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad_token_blob");
  const d = crypto.createDecipheriv("aes-256-gcm", keyOf(cfg), Buffer.from(iv, "base64url"));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

// ── کلاینت Bot API ────────────────────────────────────────────────────────────────────────────────────────────────────
export class BotApiError extends Error {
  constructor(message, { status = 0, code = "", retryAfter = 0 } = {}) { super(message); this.name = "BotApiError"; this.status = status; this.code = code; this.retryAfter = retryAfter; }
}
const apiBase = (cfg, provider) => (provider === "bale" ? cfg.baleApiBase : cfg.telegramApiBase) || `https://${PROVIDERS[provider].host}`;
const scrub = (s, token) => String(s ?? "").split(token).join("***").replace(/\d{6,16}:[A-Za-z0-9_-]{16,}/g, "***").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200);
export async function callApi(cfg, provider, token, method, body = {}, { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
  let res, json;
  try {
    res = await fetchImpl(`${apiBase(cfg, provider)}/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal, redirect: "error" });
    const text = await res.text();
    try { json = JSON.parse(text); } catch { json = null; }
  } catch (e) {
    const timeout = e?.name === "AbortError";
    throw new BotApiError(timeout ? `پاسخی از ${PROVIDERS[provider].label} نیامد (مهلت تمام شد)` : `اتصال سرور به ${PROVIDERS[provider].label} برقرار نشد${provider === "telegram" ? " (اگر سرور در ایران است، تلگرام فیلتر است؛ TELEGRAM_API_BASE را روی یک پراکسی تنظیم کنید)" : ""}`, { code: timeout ? "timeout" : "network" });
  } finally { clearTimeout(timer); }
  if (!json || json.ok !== true) {
    const status = Number(json?.error_code || res?.status || 0), retryAfter = Number(json?.parameters?.retry_after || 0);
    throw new BotApiError(`${PROVIDERS[provider].label}: ${scrub(json?.description || `خطای ${status}`, token) || "خطا"}`, { status, code: status === 401 || status === 404 ? "bad_token" : status === 429 ? "rate_limited" : status === 403 ? "forbidden" : status === 409 ? "conflict" : "api", retryAfter });
  }
  return json.result;
}

// ── تاریخ و قالب‌بندی فارسی ───────────────────────────────────────────────────────────────────────────────────────────
const FA = "۰۱۲۳۴۵۶۷۸۹";
export const faDigits = (v) => String(v).replace(/\d/g, (d) => FA[+d]);
export function money(rial, currency = "toman") {
  const n = Math.round(Number(rial) / (currency === "rial" ? 1 : 10)) || 0, neg = n < 0;
  return `${neg ? "−" : ""}${faDigits(String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "٬"))} ${currency === "rial" ? "ریال" : "تومان"}`;
}
export function toJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979; gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
  jy += 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30), jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];     // اندیس = getUTCDay
export function fmtDate(iso, withWeekday = false) {
  const [y, m, d] = iso.split("-").map(Number), [jy, jm, jd] = toJalali(y, m, d);
  return `${faDigits(jd)} ${MONTHS[jm - 1]} ${faDigits(jy)}${withWeekday ? ` (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` : ""}`;
}
export function localNow(tz, at = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
export const RANGES = {
  today: { title: "گزارش امروز", span: (t) => [t, t] },
  yesterday: { title: "گزارش دیروز", span: (t) => [addDays(t, -1), addDays(t, -1)] },
  week: { title: "گزارش ۷ روز اخیر", span: (t) => [addDays(t, -6), t] },
  month: { title: "گزارش ۳۰ روز اخیر", span: (t) => [addDays(t, -29), t] },
};
const oneLine = (v, max = 60) => String(v ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function formatReport(s, { range = "today", cafeName = "", currency = "toman", lowStock = true, today }) {
  const r = RANGES[range], [from, to] = r.span(today), single = from === to, m = (v) => money(v, currency);
  const L = [`📊 ${r.title}${cafeName ? ` — ${oneLine(cafeName)}` : ""}`, single ? `📅 ${fmtDate(from, true)}` : `📅 ${fmtDate(from)} تا ${fmtDate(to)}`, ""];
  L.push(`💰 فروش: ${m(s.revenue)} (${faDigits(s.invoiceCount)} فاکتور)`);
  if (s.discount > 0) L.push(`🏷 تخفیف داده‌شده: ${m(s.discount)}`);
  L.push(`✅ دریافتی: ${m(s.collected)}`);
  if (s.income) L.push(`➕ درآمد متفرقه: ${m(s.income)}`);
  L.push(`💸 هزینه: ${m(s.expense)}`);
  L.push(`📈 خالص صندوق: ${m(s.netCash)}`);
  L.push("", `🧾 مطالبات باز (کل): ${m(s.receivable)} در ${faDigits(s.openInvoices)} فاکتور`);
  if (!single && s.topCustomers?.length) { L.push("", "🏆 مشتریان برتر:"); s.topCustomers.slice(0, 3).forEach((c, i) => L.push(`${faDigits(i + 1)}. ${oneLine(c.name) || "—"}: ${m(c.total)}`)); }
  if (lowStock && s.lowStock?.length) { L.push("", `⚠️ کمبود موجودی (${faDigits(s.lowStock.length)} کالا):`); s.lowStock.slice(0, 8).forEach((x) => L.push(`• ${oneLine(x.name)}: ${faDigits(x.qty)} (حداقل ${faDigits(x.minQty)})`)); if (s.lowStock.length > 8) L.push(`و ${faDigits(s.lowStock.length - 8)} کالای دیگر`); }
  return L.join("\n");
}
export function formatDebts(rows, currency = "toman") {
  if (!rows.length) return "🧾 مطالبات باز: هیچ فاکتور بازی وجود ندارد ✅";
  const L = ["🧾 بدهکاران (بیشترین مانده)", ""];
  rows.forEach((r, i) => L.push(`${faDigits(i + 1)}. ${oneLine(r.name) || "—"}: ${money(r.remaining, currency)} (${faDigits(r.invoices)} فاکتور)`));
  return L.join("\n");
}
export function formatStock(rows) {
  if (!rows.length) return "📦 موجودی: هیچ کالایی زیر حداقل نیست ✅";
  const L = [`📦 کمبود موجودی (${faDigits(rows.length)} کالا)`, ""];
  rows.slice(0, 30).forEach((x) => L.push(`• ${oneLine(x.name)}: ${faDigits(x.qty)} (حداقل ${faDigits(x.minQty)})`));
  if (rows.length > 30) L.push(`و ${faDigits(rows.length - 30)} کالای دیگر`);
  return L.join("\n");
}
export const HELP = ["🤖 ربات گزارش کافینو", "", "/today یا «امروز» — گزارش امروز", "/yesterday یا «دیروز»", "/week یا «هفته» — ۷ روز اخیر", "/month یا «ماه» — ۳۰ روز اخیر", "/debts یا «بدهکاران» — مانده مشتریان", "/stock یا «انبار» — کمبود موجودی", "/help — این راهنما"].join("\n");

// ── فرمان‌ها ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const ALIASES = { start: "start", help: "help", "راهنما": "help", today: "today", "امروز": "today", "گزارش امروز": "today", yesterday: "yesterday", "دیروز": "yesterday", "گزارش دیروز": "yesterday", week: "week", "هفته": "week", "هفته اخیر": "week", month: "month", "ماه": "month", debts: "debts", "بدهکاران": "debts", "مطالبات": "debts", stock: "stock", "انبار": "stock", "موجودی": "stock" };
/** متن پیام → { cmd, arg } یا null. فقط «/فرمان[@نام‌ربات] آرگومان» یا یکی از واژه‌های فارسی (کل پیام). */
export function parseCommand(text) {
  const t = String(text ?? "").replace(/[‌‎‏]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!t) return null;
  if (t.startsWith("/")) { const m = /^\/([A-Za-z_]{1,32})(?:@[A-Za-z0-9_]{1,64})?(?:\s+(.*))?$/.exec(t); if (!m) return null; const cmd = ALIASES[m[1].toLowerCase()]; return cmd ? { cmd, arg: (m[2] || "").trim() } : null; }
  const cmd = ALIASES[t]; return cmd ? { cmd, arg: "" } : null;
}
export const newLinkCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.randomBytes(8); let s = ""; for (let i = 0; i < 8; i++) s += A[b[i] % A.length]; return s; };
export const normalizeCode = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashCode = (c) => crypto.createHash("sha256").update(normalizeCode(c)).digest("hex");
const eqHex = (a, b) => { const x = Buffer.from(String(a), "hex"), y = Buffer.from(String(b), "hex"); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

// ── سرویس ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function createBotService({ pool, cfg, log = {}, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  const warn = (o, m) => log.warn?.(o, m), tz = cfg.botTz || "Asia/Tehran";
  const api = (provider, token, method, body, opt) => callApi(cfg, provider, token, method, body, { fetchImpl, ...opt });
  const tokenAad = (cafeId, provider) => `${cafeId}:${provider}`;
  const tokenOf = (row) => decryptToken(cfg, row.token_enc, tokenAad(row.cafe_id, row.provider));

  async function send(provider, token, chatId, text) {
    const parts = []; let rest = String(text);
    while (rest.length > 3800) { let i = rest.lastIndexOf("\n", 3800); if (i < 1000) i = 3800; parts.push(rest.slice(0, i)); rest = rest.slice(i).replace(/^\n/, ""); }
    parts.push(rest);
    for (const p of parts) await api(provider, token, "sendMessage", { chat_id: chatId, text: p, disable_web_page_preview: true });
  }
  async function cafeName(cafeId) { return (await pool.query("SELECT name FROM cafes WHERE id=$1", [cafeId])).rows[0]?.name || ""; }
  async function buildReport(row, range) {
    const today = localNow(tz, now()).date, [from, to] = RANGES[range].span(today);
    const s = await summaryOf(pool, row.cafe_id, from, to);
    return formatReport(s, { range, cafeName: await cafeName(row.cafe_id), currency: row.currency, lowStock: row.low_stock_alert, today });
  }
  async function debts(row) {
    const r = await pool.query("SELECT COALESCE(NULLIF(MAX(customer_name),''),'—') AS name, SUM(remaining_amount) AS remaining, COUNT(*)::int AS invoices FROM invoices WHERE cafe_id=$1 AND deleted_at IS NULL AND status IN ('unpaid','partial') GROUP BY COALESCE(customer_id::text, customer_name) ORDER BY SUM(remaining_amount) DESC LIMIT 10", [row.cafe_id]);
    return formatDebts(r.rows.map((x) => ({ name: x.name, remaining: Number(x.remaining), invoices: x.invoices })), row.currency);
  }
  async function stock(row) {
    const r = await pool.query("SELECT name, qty, min_qty FROM inventory WHERE cafe_id=$1 AND deleted_at IS NULL AND qty <= min_qty ORDER BY qty LIMIT 50", [row.cafe_id]);
    return formatStock(r.rows.map((x) => ({ name: x.name, qty: Number(x.qty), minQty: Number(x.min_qty) })));
  }
  async function textFor(row, cmd) {
    if (cmd === "help" || cmd === "start") return HELP;
    if (cmd === "debts") return debts(row);
    if (cmd === "stock") return stock(row);
    return buildReport(row, cmd);
  }
  async function patch(row, set) {
    const keys = Object.keys(set), vals = keys.map((k) => set[k]);
    await pool.query(`UPDATE bot_connections SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(", ")}, updated_at=now() WHERE cafe_id=$1 AND provider=$2`, [row.cafe_id, row.provider, ...vals]);
  }

  /** یک به‌روزرسانی ورودی. فقط (۱) «/start کد» برای پیوند و (۲) فرمان از چت پیوندخورده پردازش می‌شود؛ بقیه بی‌صدا نادیده گرفته می‌شوند. */
  async function handleUpdate(row, token, u, budget) {
    const m = u?.message; if (!m || typeof m.text !== "string" || !m.chat) return;
    const chatId = String(m.chat.id), cmd = parseCommand(m.text);
    const linked = row.chat_id && String(row.chat_id) === chatId;
    if (cmd?.cmd === "start" && cmd.arg && !linked) return tryLink(row, token, m, cmd.arg);
    if (cmd?.cmd === "start" && !linked) return void await send(row.provider, token, chatId, "برای اتصال، در برنامهٔ کافینو (بخش «ربات‌ها») «اتصال چت» را بزنید و کد نمایش‌داده‌شده را این‌طور بفرستید:\n/start کد");
    if (!linked || !row.commands_enabled || !cmd) return;
    if (budget.left-- <= 0) return;
    await send(row.provider, token, chatId, await textFor(row, cmd.cmd));
  }
  async function tryLink(row, token, m, arg) {
    const chatId = String(m.chat.id), live = row.link_hash && row.link_expires_at && new Date(row.link_expires_at) > now();
    if (!live) { await patch(row, { link_hash: null, link_expires_at: null, link_fails: 0 }); row.link_hash = null; return void await send(row.provider, token, chatId, "کد پیوند منقضی شده یا ساخته نشده است. در برنامهٔ کافینو دوباره «اتصال چت» را بزنید."); }
    if (!eqHex(hashCode(arg), row.link_hash)) {
      const fails = row.link_fails + 1;
      await patch(row, fails >= MAX_LINK_FAILS ? { link_hash: null, link_expires_at: null, link_fails: 0 } : { link_fails: fails });
      row.link_fails = fails; if (fails >= MAX_LINK_FAILS) { row.link_hash = null; row.link_fails = 0; }
      return void await send(row.provider, token, chatId, fails >= MAX_LINK_FAILS ? "چند بار کد اشتباه فرستاده شد؛ کد باطل شد. در برنامه کد تازه بگیرید." : "کد نادرست است.");
    }
    const title = oneLine(m.chat.title || [m.chat.first_name, m.chat.last_name].filter(Boolean).join(" ") || m.chat.username || "", 120);
    await patch(row, { chat_id: chatId, chat_title: title, chat_type: oneLine(m.chat.type, 20), link_hash: null, link_expires_at: null, link_fails: 0 });
    row.chat_id = chatId; row.link_hash = null;
    await send(row.provider, token, chatId, `✅ این چت به کافی‌نت «${oneLine(await cafeName(row.cafe_id))}» وصل شد.\n\n${HELP}`);
  }

  async function poll(row, token) {
    if (!row.link_hash && !(row.chat_id && row.commands_enabled)) return;      // نه در انتظار پیوند و نه چت پیوندخورده → اصلاً صف دریافت نمی‌شود
    const ups = await api(row.provider, token, "getUpdates", { offset: Number(row.update_offset), limit: 20, timeout: 0, allowed_updates: ["message"] });
    const budget = { left: 5 };
    for (const u of Array.isArray(ups) ? ups : []) {
      try { await handleUpdate(row, token, u, budget); } catch (e) { if (e instanceof BotApiError && ["bad_token", "rate_limited"].includes(e.code)) throw e; warn({ cafeId: row.cafe_id, provider: row.provider, err: e.message }, "bot update failed"); }
      row.update_offset = Number(u.update_id) + 1; await patch(row, { update_offset: row.update_offset });
    }
  }

  async function dailyIfDue(row, token) {
    if (!row.daily_enabled || !row.chat_id) return;
    const t = localNow(tz, now());
    if (t.hhmm < row.daily_time || (row.last_daily_date && String(row.last_daily_date.toISOString ? row.last_daily_date.toISOString().slice(0, 10) : row.last_daily_date).slice(0, 10) >= t.date)) return;
    if (row.daily_retry_at && new Date(row.daily_retry_at) > now()) return;
    try {
      await send(row.provider, token, row.chat_id, await buildReport(row, "today"));
      await patch(row, { last_daily_date: t.date, daily_retry_at: null });
    } catch (e) { await patch(row, { daily_retry_at: new Date(now().getTime() + Math.max(e?.retryAfter || 0, 300) * 1000) }); throw e; }
  }

  async function processRow(row) {
    let token;
    try { token = tokenOf(row); } catch { await patch(row, { last_error: "کلید رمزنگاری تغییر کرده؛ ربات را دوباره متصل کنید", last_error_at: now(), next_try_at: new Date(now().getTime() + 3600e3) }); return; }
    try {
      await poll(row, token);
      await dailyIfDue(row, token);
      await patch(row, { last_ok_at: now(), last_error: "", next_try_at: null });
    } catch (e) {
      const bad = e instanceof BotApiError ? e : new BotApiError("خطای داخلی هنگام پردازش ربات", { code: "internal" });
      if (!(e instanceof BotApiError)) warn({ cafeId: row.cafe_id, provider: row.provider, err: e?.message }, "bot processing failed");
      const set = { last_error: bad.message.slice(0, 300), last_error_at: now(), next_try_at: new Date(now().getTime() + Math.max(bad.retryAfter * 1000, bad.code === "bad_token" ? 3600e3 : 30e3)) };
      if (bad.code === "bad_token") { set.enabled = false; set.last_error = `توکن ربات نامعتبر یا باطل شده است؛ توکن تازه را وارد کنید (${bad.message.slice(0, 120)})`; }
      await patch(row, set);
    }
  }

  /** پیام‌های انباشتهٔ قبلی را رد می‌کند (مثلاً /start با کد قدیمی نباید از تلاش‌های مجاز کد تازه کم کند). بهترین‌تلاش. */
  async function skipPending(provider, token, cafeId) {
    try { const last = await api(provider, token, "getUpdates", { offset: -1, limit: 1, timeout: 0 }); const off = Array.isArray(last) && last[0] ? Number(last[0].update_id) + 1 : null; if (off !== null) await pool.query("UPDATE bot_connections SET update_offset=GREATEST(update_offset,$3) WHERE cafe_id=$1 AND provider=$2", [cafeId, provider, off]); } catch { /* بی‌اهمیت */ }
  }
  let timer = null, busy = false;
  /** یک دور: ردیف‌های آمادهٔ پردازش را با «اجاره» برمی‌دارد تا چند نمونهٔ API یک ربات را هم‌زمان پردازش نکنند. */
  async function tick({ concurrency = 4 } = {}) {
    const r = await pool.query("SELECT cafe_id, provider FROM bot_connections WHERE enabled AND (lease_until IS NULL OR lease_until < now()) AND (next_try_at IS NULL OR next_try_at <= now()) ORDER BY updated_at LIMIT 100");
    let done = 0; const q = r.rows.slice();
    await Promise.all(Array.from({ length: Math.min(concurrency, q.length) }, async () => {
      for (let k = q.shift(); k; k = q.shift()) {
        const c = await pool.query("UPDATE bot_connections SET lease_until = now() + interval '60 seconds' WHERE cafe_id=$1 AND provider=$2 AND enabled AND (lease_until IS NULL OR lease_until < now()) RETURNING *", [k.cafe_id, k.provider]);
        if (!c.rows[0]) continue;
        try { await processRow(c.rows[0]); done++; } catch (e) { warn({ err: e?.message }, "bot tick failed"); }
        finally { await pool.query("UPDATE bot_connections SET lease_until = NULL WHERE cafe_id=$1 AND provider=$2", [k.cafe_id, k.provider]).catch(() => {}); }
      }
    }));
    return done;
  }
  return {
    api, send, tick, skipPending, tokenOf, tokenAad, textFor, buildReport, tz,
    start() { if (timer || !cfg.botsEnabled) return; timer = setInterval(async () => { if (busy) return; busy = true; try { await tick(); } catch (e) { warn({ err: e?.message }, "bot loop failed"); } finally { busy = false; } }, cfg.botPollIntervalMs); timer.unref?.(); },
    stop() { if (timer) clearInterval(timer); timer = null; },
    LINK_TTL_MS,
  };
}
