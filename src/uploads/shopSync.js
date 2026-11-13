// همگام‌سازی «مشخصات عمومی کافی‌نت» از پروفایل فروشگاه برنامه به صفحهٔ ارسال فایل مشتری (نام، نشانی، تلفن، لوگو).
// منبع حقیقت: پروفایل فروشگاه (localStorage cafenet_shop). سرور فقط یک نسخهٔ عمومی از آن نگه می‌دارد.
import { useEffect, useRef } from "react";
import { uploads } from "./uploadsApi.js";

export const DEFAULT_SHOP_NAME = "کافی‌نت من";
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** فیلدهای عمومیِ پروفایل فروشگاه → بدنهٔ تنظیمات سرور. نام پیش‌فرض («کافی‌نت من») ارسال نمی‌شود تا نام ثبت‌شدهٔ سرور بماند. */
export function shopPayload(shop) {
  const s = shop && typeof shop === "object" ? shop : {};
  const name = clean(s.name, 80);
  return { shopName: name === DEFAULT_SHOP_NAME ? "" : name, shopAddress: clean(s.address, 200), shopPhone: clean(s.phone, 40), shopMobile: clean(s.mobile, 40) };
}
/** فقط فیلدهایی که با تنظیمات سرور فرق دارند. */
export function shopDiff(settings, payload) {
  const out = {};
  for (const k of ["shopName", "shopAddress", "shopPhone", "shopMobile"]) if ((settings?.[k] ?? "") !== payload[k]) out[k] = payload[k];
  return out;
}
/** اثر انگشت ساده و سریع (djb2) برای تشخیص تغییر تصویر مبدأ؛ امنیتی نیست. */
export function fingerprint(str) { const s = String(str || ""); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return `${s.length}:${(h >>> 0).toString(36)}`; }

const loadImage = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("لوگو خوانده نشد")); im.src = src; });
const blobOf = (cv, type, q) => new Promise((res) => cv.toBlob((b) => res(b), type, q));
const toB64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
/** لوگو را کوچک می‌کند (حداکثر ۲۵۶ پیکسل) و به WEBP/PNG زیر ۱۴۰ کیلوبایت تبدیل می‌کند. نیازمند مرورگر. */
export async function prepareLogo(src) {
  const im = await loadImage(src);
  const w0 = im.naturalWidth || im.width || 256, h0 = im.naturalHeight || im.height || 256;
  for (const side of [256, 192, 128, 96]) {
    const k = Math.min(1, side / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(im, 0, 0, w, h);
    for (const [type, q] of [["image/webp", 0.9], ["image/png", undefined]]) {
      const b = await blobOf(cv, type, q);
      if (b && b.type === type && b.size <= 140 * 1024) return { data: await toB64(b), mime: type, size: b.size };
    }
  }
  throw new Error("لوگو برای نمایش در صفحهٔ مشتری زیادی بزرگ است");
}

const LS = "cafino-up-logo-sync";
const rd = () => { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch { return null; } };
const wr = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* ذخیره ممکن نیست */ } };

/** یک‌بار همگام‌سازی: متن‌ها و لوگو. خروجی: تنظیمات تازهٔ سرور یا null اگر کاری لازم نبود. */
export async function syncShopProfile(settings, shop, { api = uploads, prepare = prepareLogo, read = rd, write = wr } = {}) {
  if (!settings?.canManage || settings.showShopInfo === false) return null;
  let latest = null;
  const diff = shopDiff(settings, shopPayload(shop));
  if (Object.keys(diff).length) latest = await api.saveSettings(diff);
  const src = shop?.logo && typeof shop.logo === "string" && /^data:image\//.test(shop.logo) ? shop.logo : "";
  if (src) {
    const fp = fingerprint(src), mark = read();
    const cur = latest || settings;
    if (!(mark && mark.fp === fp && cur.hasLogo && mark.hash === cur.logoHash)) {
      const p = await prepare(src);
      latest = await api.saveLogo(p.data);
      write({ fp, hash: latest.logoHash });
    }
  } else if (settings.hasLogo) {
    latest = await api.removeLogo(); write(null);
  }
  return latest;
}

/** hook: هر بار که تنظیمات یا پروفایل فروشگاه عوض شود، در پس‌زمینه همگام می‌کند (خطا بی‌صدا؛ بار بعد دوباره). */
export function useShopProfileSync(settings, shop, onSynced) {
  const busy = useRef(false), key = useRef("");
  useEffect(() => {
    if (!settings?.canManage || settings.showShopInfo === false || busy.current) return;
    const k = JSON.stringify([shopPayload(shop), fingerprint(shop?.logo), settings.updatedAt, settings.hasLogo]);
    if (k === key.current) return;
    key.current = k; busy.current = true;
    syncShopProfile(settings, shop).then((s) => { if (s) onSynced?.(s); }, () => { key.current = ""; }).finally(() => { busy.current = false; });
  }, [settings, shop, onSynced]);
}
