// تولید QR (کتابخانهٔ qrcode-generator، MIT) به‌صورت SVG؛ مستقل از شبکه و CSP-سازگار.
import qrcode from "qrcode-generator";

/** ماتریس QR: آرایهٔ دوبعدی از true/false. سطح تصحیح خطا پیش‌فرض Q (۲۵٪) تا چاپ‌های کم‌کیفیت هم خوانده شوند. */
export function qrMatrix(text, ecc = "Q") {
  const qr = qrcode(0, ecc);           // typeNumber 0 = خودکار
  qr.addData(String(text), "Byte");
  qr.make();
  const n = qr.getModuleCount(), rows = [];
  for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(qr.isDark(r, c)); rows.push(row); }
  return rows;
}

/** SVG QR با حاشیهٔ آرام (quiet zone ≥ ۴ ماژول مطابق استاندارد). رنگ تیره/روشن قابل تنظیم؛ پیش‌فرض سیاه روی سفید برای بیشترین خوانایی. */
export function qrSvg(text, { ecc = "Q", margin = 4, dark = "#000", light = "#fff", size = 0 } = {}) {
  const m = qrMatrix(text, ecc), n = m.length, full = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) {            // هر ردیف: ادغام ماژول‌های تیرهٔ پشت‌سرهم در یک مستطیل
    let c = 0;
    while (c < n) { if (!m[r][c]) { c++; continue; } let e = c; while (e < n && m[r][e]) e++; d += `M${c + margin} ${r + margin}h${e - c}v1h-${e - c}z`; c = e; }
  }
  const dim = size ? ` width="${size}" height="${size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}"${dim} shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${full}" height="${full}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
