// نمایش و رندر PDF (pdf.js نسخهٔ legacy برای مرورگرهای/WebView قدیمی‌تر). پردازش خود pdf.js در Worker جدا (vendor-pdfjsworker) انجام می‌شود.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
(globalThis.__cfVendor ||= {}).pdfjs = pdfjs;
