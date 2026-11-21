// کلاینت ملی پیامک (melipayamak.com) — REST روی rest.payamak-panel.com/api/SendSMS.
//   SendSMS            : متن ساده از یک خط اختصاصی/عمومی   (username, password, to, from, text, isFlash)
//   BaseServiceNumber  : ارسال با الگوی (پترن) تأییدشده    (username, password, text = «آرگومان‌ها با ;»، to, bodyId)
//   GetCredit          : اعتبار باقی‌مانده                  (username, password)
// پاسخ: { Value, RetStatus, StrRetStatus }؛ موفق = RetStatus 1 و Value شناسهٔ پیامک (عدد بلند). کدهای کوتاه Value (۰..۱۷) خطا هستند.
// رمز حساب هرگز در لاگ/پیام خطا/پاسخ API نمی‌آید. درخواست‌ها محدود به زمان (timeout) هستند و HTTPS اجباری است (جز loopback برای تست).

export class SmsError extends Error {
  constructor(code, message, { status = 502, fatal = false } = {}) { super(message); this.code = code; this.status = status; this.fatal = fatal; }
}

// ── شمارهٔ موبایل ایران → 09xxxxxxxxx ─────────────────────────────────────────────────────────────────────────────────────
export const toLatinDigits = (v) => String(v ?? "")
  .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
/** فارسی/عربی/+98/0098/98/9xxxxxxxxx را به 09xxxxxxxxx تبدیل می‌کند؛ نامعتبر → "" */
export function normalizeMobile(value) {
  let d = toLatinDigits(value).replace(/[\s\-().‎‏]/g, "");
  if (/^\+/.test(d)) d = d.slice(1);
  d = d.replace(/\D/g, "");
  if (d.startsWith("0098")) d = d.slice(4);
  else if (d.startsWith("98") && d.length === 12) d = d.slice(2);
  if (/^9\d{9}$/.test(d)) d = `0${d}`;
  return /^09\d{9}$/.test(d) ? d : "";
}
export const maskMobile = (m) => (/^09\d{9}$/.test(m) ? `${m.slice(0, 4)}***${m.slice(-4)}` : "");

/** تعداد بخش‌های پیامک: فارسی (یونیکد) ۷۰ نویسه برای بخش اول و ۶۷ برای بخش‌های بعدی؛ لاتین ۱۶۰/۱۵۳ */
export function smsParts(text) {
  const t = String(text ?? ""); if (!t) return 0;
  const uni = /[^\x00-\x7f]/.test(t), one = uni ? 70 : 160, multi = uni ? 67 : 153;
  const n = [...t].length;
  return n <= one ? 1 : Math.ceil(n / multi);
}

// کدهای خطای SendSMS (ملی پیامک). نام کدها را فقط برای پیام کاربر استفاده می‌کنیم؛ تصمیم موفق/ناموفق بر پایهٔ ساختار پاسخ است.
const CODE_MESSAGES = {
  0: ["bad_credentials", "نام کاربری یا رمز عبور ملی پیامک درست نیست", true],
  2: ["no_credit", "اعتبار پنل ملی پیامک کافی نیست", true],
  3: ["daily_limit", "سقف ارسال روزانهٔ پنل پر شده است", true],
  4: ["volume_limit", "محدودیت حجم ارسال پنل", true],
  5: ["bad_sender", "شمارهٔ خط ارسال معتبر نیست یا به این پنل تعلق ندارد", true],
  6: ["maintenance", "سامانهٔ ملی پیامک در حال به‌روزرسانی است؛ بعداً تلاش کنید", false],
  7: ["filtered_text", "متن پیام شامل کلمهٔ فیلترشده است", false],
  9: ["public_line", "ارسال از خط عمومی با وب‌سرویس مجاز نیست؛ خط اختصاصی یا الگو (پترن) لازم است", true],
  10: ["inactive_user", "حساب ملی پیامک فعال نیست", true],
  11: ["not_sent", "پیام ارسال نشد", false],
  12: ["incomplete_docs", "مدارک حساب ملی پیامک کامل نیست", true],
  14: ["has_link", "متن پیام نباید لینک داشته باشد", false],
  15: ["opt_out_text", "برای ارسال به چند شماره «لغو۱۱» لازم است", false],
  16: ["no_recipient", "شمارهٔ گیرنده معتبر نیست", false],
  17: ["empty_text", "متن پیام خالی است", false],
  35: ["blacklist", "شمارهٔ گیرنده در لیست سیاه است", false],
};

function parseReply(json, { creditCall = false } = {}) {
  const ret = Number(json?.RetStatus), value = json?.Value == null ? "" : String(json.Value).trim();
  const str = String(json?.StrRetStatus || "").trim();
  if (creditCall) {
    if (ret === 1 && value !== "" && Number.isFinite(Number(value))) return { ok: true, value: Number(value) };
  } else if (ret === 1 && /^\d{4,}$/.test(value)) return { ok: true, value };      // شناسهٔ پیامک (recId)
  // خطا: کد کوتاه در Value یا متن StrRetStatus
  const n = /^-?\d{1,3}$/.test(value) ? Number(value) : NaN;
  if (CODE_MESSAGES[n]) { const [code, message, fatal] = CODE_MESSAGES[n]; return { ok: false, code, message, fatal, providerCode: n }; }
  return { ok: false, code: "provider_error", message: `ملی پیامک پیام را نپذیرفت${str ? ` (${str.slice(0, 60)})` : value ? ` (کد ${value.slice(0, 20)})` : ""}`, fatal: false, providerCode: Number.isFinite(n) ? n : null };
}

export function createMeliClient(cfg, { fetchImpl = globalThis.fetch } = {}) {
  const base = String(cfg.smsApiBase || "https://rest.payamak-panel.com/api/SendSMS").replace(/\/+$/, "");
  async function call(endpoint, form, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.smsTimeoutMs || 12000);
    let res;
    try {
      res = await fetchImpl(`${base}/${endpoint}`, {
        method: "POST", signal: ctrl.signal, redirect: "error",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(form).toString(),
      });
    } catch (e) {
      throw new SmsError(ctrl.signal.aborted ? "timeout" : "unreachable", ctrl.signal.aborted ? "پاسخی از ملی پیامک نرسید (زمان‌بر شد)" : "اتصال به ملی پیامک برقرار نشد", { status: 504 });
    } finally { clearTimeout(timer); }
    if (!res.ok) throw new SmsError("http_error", `ملی پیامک خطای HTTP ${res.status} داد`, { status: 502 });
    let json; try { json = await res.json(); } catch { throw new SmsError("bad_response", "پاسخ ملی پیامک قابل‌خواندن نبود", { status: 502 }); }
    const r = parseReply(json, opts);
    if (!r.ok) throw new SmsError(r.code, r.message, { status: r.fatal ? 422 : 502, fatal: r.fatal });
    return r.value;
  }
  return {
    /** متن ساده؛ برمی‌گرداند شناسهٔ پیامک */
    send: ({ username, password, from, to, text }) => call("SendSMS", { username, password, to, from, text, isFlash: "false" }),
    /** الگو (پترن) با bodyId؛ args آرایهٔ مقادیر الگو (با ; به هم می‌چسبند) */
    sendPattern: ({ username, password, bodyId, to, args }) => call("BaseServiceNumber", { username, password, text: args.map((a) => String(a).replace(/;/g, ",")).join(";"), to, bodyId: String(bodyId) }),
    credit: ({ username, password }) => call("GetCredit", { username, password }, { creditCall: true }),
  };
}
