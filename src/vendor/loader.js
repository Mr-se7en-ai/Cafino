// Heavy third-party libraries (Excel export, PDF export) are NOT part of the main bundle.
// They are built as separate classic-script chunks (chunks/vendor-<name>.<hash>.js) and loaded the first time they are needed.
// Classic scripts (not ES modules) are used on purpose: they also work when the app is opened from file:// and inside Electron.
//   • normal install / PWA / Electron : <script src="chunks/…"> is injected (the service worker pre-caches the files → works offline)
//   • single-file standalone build    : the chunk text is embedded as <script type="text/plain" id="cf-chunk-NAME"> and evaluated lazily
/* global __CF_CHUNKS__ */
const MAP = typeof __CF_CHUNKS__ !== "undefined" ? __CF_CHUNKS__ : {};
const pending = {};
// آدرس فایل یک chunk (برای Web Worker)؛ در نسخهٔ تک‌فایلی وجود ندارد
export const vendorUrl = (name) => MAP[name] || "";

export function loadVendor(name) {
  const ready = globalThis.__cfVendor && globalThis.__cfVendor[name];
  if (ready) return Promise.resolve(ready);
  if (pending[name]) return pending[name];
  const p = new Promise((resolve, reject) => {
    const finish = () => {
      const mod = globalThis.__cfVendor && globalThis.__cfVendor[name];
      if (mod) resolve(mod); else reject(new Error(`ماژول «${name}» بارگذاری شد ولی آماده نیست`));
    };
    const fail = (why) => { delete pending[name]; reject(new Error(`بارگذاری ماژول «${name}» ناموفق بود${why ? " (" + why + ")" : ""}. اتصال یا فایل‌های برنامه را بررسی کنید.`)); };
    try {
      const embedded = document.getElementById("cf-chunk-" + name);
      if (embedded) {
        const s = document.createElement("script");
        s.text = embedded.textContent;
        document.head.appendChild(s);
        s.remove();
        finish();
        return;
      }
      const src = MAP[name];
      if (!src) { fail("مسیر فایل نامشخص"); return; }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = finish;
      s.onerror = () => { s.remove(); fail(navigator.onLine === false ? "آفلاین و فایل ذخیره نشده" : "فایل پیدا نشد"); };
      document.head.appendChild(s);
    } catch (e) { fail(e && e.message); }
  });
  pending[name] = p;
  return p;
}
