// تعرفهٔ شخصی کاربر (فایل JPG/PDF). بایت‌ها رمزشده در IndexedDB جداگانه (نه خزانهٔ فایل مشتریان که پاک‌سازی خودکار دارد) و فقط
// یک رکورد کوچک متادیتا در localStorage می‌ماند. تا وقتی «فعال» است، صفحهٔ تعرفه به‌جای جدول داخلی همین فایل را نشان می‌دهد.
import { createFileStore, idbAdapter, validateUpload } from "../../data/fileStore.js";

export const TARIFF_FILE_KEY = "cafenet_tariff_file";
export const TARIFF_FILE_ID = "tariff-main";

let _store = null;
export function tariffVault() {
  if (_store) return _store;
  try { _store = createFileStore({ adapter: idbAdapter("cafenet_tariff_files") }); } catch { _store = null; }
  return _store;
}
export function setTariffVaultForTests(s) { _store = s; }

export function validateTariffFile(file) {
  if (file && !file.type) {                        // برخی مرورگرها برای فایل‌های دانلودشده type خالی می‌دهند
    const ext = String(file.name || "").toLowerCase().split(".").pop();
    if (ext === "pdf") file = { ...file, type: "application/pdf", size: file.size };
    else if (ext === "jpg" || ext === "jpeg") file = { ...file, type: "image/jpeg", size: file.size };
  }
  return validateUpload(file);
}

export function getTariffFileMeta(storage = globalThis.localStorage) {
  try { const m = JSON.parse(storage.getItem(TARIFF_FILE_KEY) || "null"); return m && m.id ? m : null; } catch { return null; }
}
const writeMeta = (m, storage) => { try { if (m) storage.setItem(TARIFF_FILE_KEY, JSON.stringify(m)); else storage.removeItem(TARIFF_FILE_KEY); } catch { /* ignore */ } };

// آپلود تعرفهٔ جدید (جایگزین فایل قبلی) و فعال‌کردن آن
export async function saveTariffFile(file, { store = tariffVault(), storage = globalThis.localStorage, now = Date.now } = {}) {
  const err = validateTariffFile(file);
  if (err) throw new Error(err);
  if (!store) throw new Error("ذخیره‌سازی امن فایل در این مرورگر در دسترس نیست");
  const type = file.type || (/\.pdf$/i.test(file.name || "") ? "application/pdf" : "image/jpeg");
  const blob = file.type ? file : new Blob([await file.arrayBuffer()], { type });
  await store.put(TARIFF_FILE_ID, blob, { name: file.name, type });
  const meta = { id: TARIFF_FILE_ID, name: String(file.name || "tariff").slice(0, 200), type: type === "image/jpg" ? "image/jpeg" : type, size: file.size, uploadedAt: now(), active: true };
  writeMeta(meta, storage);
  return meta;
}
export function setTariffFileActive(active, storage = globalThis.localStorage) {
  const m = getTariffFileMeta(storage); if (!m) return null;
  const n = { ...m, active: !!active }; writeMeta(n, storage); return n;
}
export async function removeTariffFile({ store = tariffVault(), storage = globalThis.localStorage } = {}) {
  try { if (store) await store.remove(TARIFF_FILE_ID); } catch { /* ignore */ }
  writeMeta(null, storage);
}
export async function loadTariffFileBlob({ store = tariffVault() } = {}) {
  return store ? store.get(TARIFF_FILE_ID) : null;
}
