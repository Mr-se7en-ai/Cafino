// دریافت فایل از مشتری: ابزارهای امن — کد عمومی، پاک‌سازی نام، تشخیص نوع با امضای بایت، مسیر ذخیره و پاکسازی منقضی‌ها.
// فایل هرگز اجرا یا inline نمایش داده نمی‌شود؛ فقط با Content-Disposition: attachment توسط کاربر احراز‌شدهٔ همان کافی‌نت دانلود می‌شود.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ALLOWED_EXTS = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "txt", "csv"];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];
const SIGS = {
  pdf: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  jpg: (b) => startsWith(b, [0xff, 0xd8, 0xff]), jpeg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && b.subarray(8, 12).toString("latin1") === "WEBP",
  docx: zip, xlsx: zip, pptx: zip, odt: zip,
  doc: (b) => startsWith(b, OLE), xls: (b) => startsWith(b, OLE), ppt: (b) => startsWith(b, OLE),
  txt: text, csv: text,
};
function startsWith(b, sig) { return b.length >= sig.length && sig.every((x, i) => b[i] === x); }
function zip(b) { return startsWith(b, [0x50, 0x4b, 0x03, 0x04]); }
function text(b) { return !b.includes(0); }          // متن ساده: بایت NUL نداشته باشد (فایل باینری نیست)
export const MIME_BY_EXT = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", odt: "application/vnd.oasis.opendocument.text", txt: "text/plain", csv: "text/csv" };

export const extOf = (name) => { const m = /\.([A-Za-z0-9]{1,6})$/.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; };
/** null = پذیرفته؛ وگرنه کد خطا: bad_ext | bad_signature */
export function checkFile(name, head) {
  const ext = extOf(name);
  if (!ALLOWED_EXTS.includes(ext)) return "bad_ext";
  return SIGS[ext](head) ? null : "bad_signature";
}

/** نام نمایشی امن: بدون مسیر، نویسه‌های کنترلی و کنترل جهت (Bidi)، حداکثر ۱۲۰ نویسه. */
export function sanitizeName(raw) {
  let s = String(raw ?? "").normalize("NFC");
  s = s.split(/[\\/]/).pop();
  s = s.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩<>:"|?*]/g, "").trim().replace(/^\.+/, "").trim();
  if (s.length > 120) { const e = extOf(s); s = s.slice(0, 120 - (e ? e.length + 1 : 0)) + (e ? `.${e}` : ""); }
  return s || "file";
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
/** کد عمومی ۱۶ نویسه‌ای (۸۰ بیت آنتروپی) — از روی QR/URL قابل حدس نیست. */
export function generateCode() {
  const b = crypto.randomBytes(10); let bits = 0, val = 0, out = "";
  for (const x of b) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  return out.slice(0, 16);
}
export const isCode = (c) => /^[a-z2-7]{16}$/.test(String(c || ""));
/** رمز وضعیت هر ارسال (۱۲۸ بیت): فقط هش آن ذخیره می‌شود؛ مشتری با آن فقط وضعیت ارسال خودش را می‌بیند. */
export const newSecret = () => crypto.randomBytes(16).toString("hex");
export const hashSecret = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const safeEqualHex = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };
/** تغییر نام: پسوند باید همان پسوند فایل بماند (جلوگیری از ناسازگاری نام و محتوا). پسوند ننوشته باشد خودکار اضافه می‌شود. */
export function renameKeepExt(newRaw, oldName) {
  const ext = extOf(oldName); let n = sanitizeName(newRaw);
  if (n === "file" && !String(newRaw ?? "").trim()) return { error: "empty" };
  const e2 = extOf(n);
  if (e2 && e2 !== ext && ALLOWED_EXTS.includes(e2)) return { error: "ext_changed" };
  if (e2 !== ext) n = (n.replace(/\.+$/, "") + (ext ? `.${ext}` : "")).slice(0, 120);
  return { name: n };
}
export const batchCode = () => String(crypto.randomInt(0, 100000)).padStart(5, "0");

export const uploadRoot = (cfg) => path.resolve(cfg.uploadDir);
export const tmpDir = (cfg) => path.join(uploadRoot(cfg), "tmp");
export function newKey(cafeId) { const d = new Date(); return `${cafeId}/${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}`; }
/** مسیر واقعی روی دیسک؛ کلید باید دقیقاً قالب خودمان باشد (جلوگیری از path traversal). */
export function pathForKey(cfg, key) {
  if (!/^[0-9a-f-]{36}\/\d{4}-\d{2}\/[0-9a-f-]{36}$/.test(key)) throw new Error("storage_key نامعتبر");
  const p = path.join(uploadRoot(cfg), key);
  if (!p.startsWith(uploadRoot(cfg) + path.sep)) throw new Error("storage_key نامعتبر");
  return p;
}
export const ipHash = (cfg, ip) => crypto.createHash("sha256").update(`${cfg.jwtSecret}|${ip}`).digest("hex").slice(0, 32);

/** فایل‌های منقضی را از دیسک پاک و سطر را علامت می‌زند؛ نام فایل پاک می‌شود. تعداد را برمی‌گرداند.
 *  منقضی = (بیش از retention_days از دریافت) یا (چاپ‌شده/انجام‌شده و بیش از done_retention_days از تغییر وضعیت). «نگه‌داری ویژه» (protected) هرگز خودکار پاک نمی‌شود. */
export async function sweepExpired(pool, cfg, log = () => {}) {
  const r = await pool.query(`SELECT u.cafe_id, u.id, u.storage_key FROM customer_uploads u JOIN upload_settings s ON s.cafe_id = u.cafe_id
    WHERE u.deleted_at IS NULL AND NOT u.protected AND (
      u.created_at < now() - (s.retention_days || ' days')::interval
      OR (u.status IN ('printed','done') AND COALESCE(u.status_at, u.created_at) < now() - (s.done_retention_days || ' days')::interval)
    ) LIMIT 500`);
  let n = 0;
  for (const x of r.rows) {
    try { await fs.promises.rm(pathForKey(cfg, x.storage_key), { force: true }); } catch (e) { log(`sweep rm failed: ${e.message}`); continue; }
    await pool.query("UPDATE customer_uploads SET deleted_at = now(), original_name = '', note = '' WHERE cafe_id = $1 AND id = $2", [x.cafe_id, x.id]); n++;
  }
  // فایل‌های موقت رهاشده (آپلود نیمه‌کاره) بیش از ۲ ساعت
  try { for (const f of await fs.promises.readdir(tmpDir(cfg))) { const p = path.join(tmpDir(cfg), f); const st = await fs.promises.stat(p); if (Date.now() - st.mtimeMs > 2 * 3600e3) await fs.promises.rm(p, { force: true }); } } catch { /* پوشه هنوز نیست */ }
  // ردّ ضدویروس‌های قدیمی‌تر از ۹۰ روز
  try { await pool.query("DELETE FROM upload_blocked WHERE created_at < now() - interval '90 days'"); } catch (e) { log(`blocked cleanup failed: ${e.message}`); }
  return n;
}
