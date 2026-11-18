// پل تلگرام/بله: SDK رسمی (window.Telegram.WebApp) یا — اگر telegram.org در دسترس نبود — خواندن initData از hash نشانی.
// initDataUnsafe هرگز برای تصمیم‌گیری استفاده نمی‌شود؛ فقط رشتهٔ امضاشدهٔ initData به سرور می‌رود.
export function readHashParams(hash) {
  try { return new URLSearchParams(String(hash || "").replace(/^#/, "")); } catch { return new URLSearchParams(); }
}
export function getTg(win = typeof window !== "undefined" ? window : {}) {
  // 1.86: بله هم مینی‌اپ دارد؛ SDK آن (window.Bale.WebApp) با همان شکل کار می‌کند — «اولین SDKی که initData دارد» انتخاب می‌شود.
  // (نام سراسری بله از اینجا راستی‌آزمایی نشد؛ اگر نبود، همان hash نشانی خوانده می‌شود.)
  const cands = [win.Telegram && win.Telegram.WebApp, win.Bale && win.Bale.WebApp].filter(Boolean);
  const sdk = cands.find((x) => x.initData) || cands[0];
  const hp = readHashParams(win.location && win.location.hash);
  const initData = (sdk && sdk.initData) || hp.get("tgWebAppData") || "";
  const q = win.location && win.location.search ? new URLSearchParams(win.location.search) : new URLSearchParams();
  const cafe = q.get("c") || "", mode = q.get("m") === "staff" ? "staff" : "";
  let scheme = (sdk && sdk.colorScheme) || "";
  if (!scheme) { try { scheme = win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { scheme = "light"; } }
  const atLeast = (v) => { try { return !!(sdk && sdk.isVersionAtLeast && sdk.isVersionAtLeast(v)); } catch { return false; } };
  return {
    sdk, initData, cafe, mode, scheme, hasSdk: !!sdk,
    ready() { try { sdk && sdk.ready(); sdk && sdk.expand && sdk.expand(); } catch {} },
    canRequestContact: () => !!(sdk && typeof sdk.requestContact === "function" && atLeast("8.0")),
    requestContact: (cb) => { try { sdk.requestContact((ok) => cb && cb(!!ok)); } catch { cb && cb(false); } },
    close() { try { sdk && sdk.close(); } catch {} },
    openLink(url) { try { if (sdk && sdk.openLink) sdk.openLink(url); else win.open(url, "_blank", "noopener"); } catch {} },
    haptic(kind = "light") { try { sdk && sdk.HapticFeedback && sdk.HapticFeedback.impactOccurred(kind); } catch {} },
  };
}
