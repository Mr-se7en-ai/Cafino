import React, { useState } from "react";
import { ICON_DATA_URI, WORDMARK_SVG, WORDMARK_RATIO } from "./brandAssets.js";

// لوگوی رسمی کافینو. مسیر فایل از config.js (CAFINO_CONFIG.brandLogoUrl) خوانده می‌شود
// تا بدون بیلد مجدد قابل جایگزینی باشد. اگر خالی/ناموفق بود، نماد پیش‌فرض نمایش داده می‌شود.
const SAFE_URL = /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+|(?!\/\/)[A-Za-z0-9_./-]+\.(svg|png|jpe?g|webp))$/i;

// لوگوی پیش‌فرض: آیکن رسمی کافینو (brand/icon.svg). با brandLogoUrl در config.js جایگزین می‌شود.
const DEFAULT_LOGO = ICON_DATA_URI;

export function getBrandLogoUrl() {
  try {
    const cfg = typeof window !== "undefined" ? window.CAFINO_CONFIG : null;
    const u = cfg && typeof cfg.brandLogoUrl === "string" ? cfg.brandLogoUrl.trim() : "";
    return SAFE_URL.test(u) ? u : DEFAULT_LOGO;
  } catch { return DEFAULT_LOGO; }
}

/** لوگوی کامل (نشان + نوشتهٔ «کافینو»). رنگ متن از color اطراف گرفته می‌شود؛ پیش‌فرض متن اصلی تم. height بر حسب px. */
export function BrandWordmark({ height = 40, style, title = "کافینو" }) {
  return <span role="img" aria-label={title} data-testid="brand-wordmark" style={{ display: "inline-block", height, width: Math.round(height * WORDMARK_RATIO), color: "var(--text-primary)", lineHeight: 0, flexShrink: 0, ...style }}
    dangerouslySetInnerHTML={{ __html: WORDMARK_SVG.replace("<svg ", '<svg width="100%" height="100%" ') }} />;
}

export default function BrandLogo({ size = 36, fallbackSize, style }) {
  const url = getBrandLogoUrl();
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <span aria-hidden="true" style={{ fontSize: fallbackSize || Math.round(size * 0.72), flexShrink: 0, lineHeight: 1, ...style }}>🖥️</span>;
  }
  return <img src={url} alt="کافینو" width={size} height={size} onError={() => setFailed(true)}
    style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, ...style }} />;
}
