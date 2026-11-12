// ذخیرهٔ امن رمزها و «مهر یکپارچگی» دادهٔ مالی با رمزنگاری سیستم‌عامل (Electron safeStorage):
//   ویندوز → DPAPI (وابسته به حساب کاربری ویندوز) ، macOS → Keychain ، لینوکس → libsecret/kwallet.
// فایل‌ها در پوشهٔ دادهٔ برنامه ذخیره می‌شوند ولی فقط با همان حساب کاربری سیستم‌عامل قابل رمزگشایی‌اند.
// ⚠ این جلوی «ویرایش دستی فایل‌ها/حافظهٔ مرورگر» و رونوشت‌برداری از دیسک را می‌گیرد؛ جلوی کدی که با همان حساب کاربری اجرا شود را نه.
"use strict";
const crypto = require("crypto");

const SECRET_NAMES = new Set(["ai_agent_key"]);           // فقط نام‌های از پیش‌تعریف‌شده؛ رندرر نام دلخواه نمی‌سازد
const MAX_SECRET = 4096;

// وضعیت ذخیرهٔ امن. روی لینوکس، safeStorage وقتی libsecret/kwallet نیست به «basic_text» برمی‌گردد (کلید ثابت و عملاً بدون محافظت)
// و isEncryptionAvailable() هم true می‌دهد؛ این را «در دسترس نیست» حساب می‌کنیم و هشدار روشن با راهِ حل می‌دهیم.
const WEAK_BACKENDS = new Set(["basic_text", "unknown_backend", "not_available"]);
const LINUX_HINT = "روی اوبونتو/لینوکس سرویس کلیدها (libsecret) فعال نیست. نصب: sudo apt install gnome-keyring libsecret-1-0 و ورود به نشست گرافیکی (یا kwallet)؛ سپس برنامه را دوباره باز کنید. تا آن زمان رمز کلید هوش مصنوعی و مهر یکپارچگی ذخیره نمی‌شود.";
function storageStatus(safeStorage, platform = process.platform) {
  let enc = false; try { enc = !!(safeStorage && safeStorage.isEncryptionAvailable()); } catch { enc = false; }
  let backend = platform === "win32" ? "dpapi" : platform === "darwin" ? "keychain" : "unknown";
  if (platform === "linux") { try { backend = typeof safeStorage.getSelectedStorageBackend === "function" ? String(safeStorage.getSelectedStorageBackend()) : "unknown"; } catch { backend = "unknown"; } }
  const weak = platform === "linux" && WEAK_BACKENDS.has(backend);
  const available = enc && !weak;
  return { available, backend, level: available ? "ok" : weak && enc ? "weak" : "unavailable", warning: available ? "" : (platform === "linux" ? LINUX_HINT : "ذخیرهٔ امن سیستم‌عامل در دسترس نیست.") };
}

function createSecureStore({ safeStorage, fs, path, dir, platform = process.platform }) {
  const status = () => storageStatus(safeStorage, platform);
  const ok = () => status().available;
  const file = (name) => path.join(dir, name);
  const writeEnc = (name, text) => { fs.mkdirSync(dir, { recursive: true }); const f = file(name); fs.writeFileSync(f + ".tmp", safeStorage.encryptString(text)); fs.renameSync(f + ".tmp", f); };
  const readEnc = (name) => { try { return safeStorage.decryptString(fs.readFileSync(file(name))); } catch { return null; } };

  const secretFile = (n) => { if (!SECRET_NAMES.has(n)) throw new Error("نام راز مجاز نیست"); return "secret-" + n + ".bin"; };
  const secrets = {
    available: ok, status,
    set(name, value) {
      const f = secretFile(name); if (!ok()) throw new Error("ذخیرهٔ امن سیستم‌عامل در دسترس نیست");
      const v = String(value == null ? "" : value); if (v.length > MAX_SECRET) throw new Error("مقدار بیش از حد بزرگ است");
      if (!v) { try { fs.unlinkSync(file(f)); } catch { /* ignore */ } return true; }
      writeEnc(f, v); return true;
    },
    get(name) { const f = secretFile(name); if (!ok()) return ""; return readEnc(f) || ""; },
    delete(name) { const f = secretFile(name); try { fs.unlinkSync(file(f)); } catch { /* ignore */ } return true; },
  };

  // مهر یکپارچگی: رندرر هش SHA-256 دادهٔ مالی محلی را می‌دهد؛ پردازش اصلی آن را رمز می‌کند و ذخیره می‌کند.
  // اگر دادهٔ مرورگر وقتی برنامه بسته بود دستی عوض شود، هش با مهر نمی‌خواند → «mismatch».
  const HASH = /^[0-9a-f]{64}$/;
  const seal = {
    set(hash) { if (!ok()) return { ok: false, reason: "unavailable" }; if (!HASH.test(String(hash))) throw new Error("هش نامعتبر است"); writeEnc("integrity-seal.bin", JSON.stringify({ hash, at: Date.now(), n: crypto.randomBytes(4).toString("hex") })); return { ok: true }; },
    verify(hash) {
      if (!ok()) return { status: "unavailable" }; if (!HASH.test(String(hash))) throw new Error("هش نامعتبر است");
      const raw = readEnc("integrity-seal.bin");
      if (raw === null) return { status: fs.existsSync(file("integrity-seal.bin")) ? "mismatch" : "none" };     // فایل هست ولی رمزگشایی نشد = دستکاری/حساب دیگر
      try { const j = JSON.parse(raw); return { status: j.hash === hash ? "ok" : "mismatch", sealedAt: j.at }; } catch { return { status: "mismatch" }; }
    },
  };
  return { secrets, seal, status };
}
module.exports = { createSecureStore, storageStatus, SECRET_NAMES, WEAK_BACKENDS };
