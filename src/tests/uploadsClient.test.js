import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import jsQR from "jsqr";
import { qrMatrix, qrSvg } from "../uploads/qr.js";
import { publicUploadUrl, fmtSize, groupBatches, buildPosterHtml, STATUSES } from "../uploads/uploadsApi.js";
const escapeHtml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);   // همان قرارداد escapeHtml برنامه (format.js در Node بدون بیلد قابل‌import نیست)
import { ICON_DATA_URI, WORDMARK_SVG } from "../app/components/brandAssets.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

function decode(text, ecc) {
  const m = qrMatrix(text, ecc), n = m.length, S = 8, Q = 4, W = (n + Q * 2) * S;
  const data = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (((r + Q) * S + y) * W + (c + Q) * S + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
  return jsQR(data, W, W)?.data;
}

test("QR: ماتریس واقعاً با یک رمزگشای مستقل (jsQR) خوانده می‌شود — برای نشانی‌های واقعی در هر سه سطح تصحیح خطا", () => {
  const urls = ["https://cafino.example.com/u/abcdefghijklmnop", "https://my-cafe.ir/u/k7q2m5x4z3w6v2b5", "http://192.168.1.20:8080/u/aaaaaaaaaaaaaaaa"];
  for (const u of urls) for (const e of ["L", "M", "Q"]) assert.equal(decode(u, e), u, `${e} ${u}`);
});

test("QR SVG: viewBox با حاشیهٔ آرام ۴ ماژول، بدون اسکریپت/ارجاع بیرونی، تیره/روشن", () => {
  const n = qrMatrix("x").length, s = qrSvg("x");
  assert.match(s, new RegExp(`viewBox="0 0 ${n + 8} ${n + 8}"`));
  assert.doesNotMatch(s.replace('xmlns="http://www.w3.org/2000/svg"', ""), /href=|onload|https?:/i);   // جز xmlns هیچ ارجاع بیرونی ندارد
  assert.match(s, /fill="#000"/); assert.match(s, /fill="#fff"/);
  assert.ok(!/<image|<foreignObject|<script/.test(s));
});

test("نشانی عمومی: PUBLIC_BASE_URL سرور اولویت دارد، بعد مبدأ API، بعد مبدأ مرورگر؛ بدون کد → خالی", () => {
  const st = { code: "abcdefghijklmnop", url: null };
  assert.equal(publicUploadUrl({ ...st, url: "https://x.ir/u/abcdefghijklmnop" }, { baseUrl: "https://api.ir" }, "https://o.ir"), "https://x.ir/u/abcdefghijklmnop");
  assert.equal(publicUploadUrl(st, { baseUrl: "https://api.ir/" }, "https://o.ir"), "https://api.ir/u/abcdefghijklmnop");
  assert.equal(publicUploadUrl(st, { baseUrl: "" }, "https://o.ir"), "https://o.ir/u/abcdefghijklmnop");
  assert.equal(publicUploadUrl(st, { baseUrl: "" }, "file://"), "");
  assert.equal(publicUploadUrl({}, { baseUrl: "https://api.ir" }, ""), "");
});

test("فهرست: گروه‌بندی بر اساس ارسال، جدیدترین اول؛ حجم فارسی‌پسند", () => {
  const items = [{ id: "1", batchId: "A", createdAt: "2026-01-01T10:00:00Z", name: "a" }, { id: "2", batchId: "B", createdAt: "2026-01-02T10:00:00Z", name: "b" }, { id: "3", batchId: "A", createdAt: "2026-01-01T10:00:00Z", name: "c" }];
  const g = groupBatches(items); assert.deepEqual(g.map((x) => x.batchId), ["B", "A"]); assert.equal(g[1].files.length, 2);
  assert.equal(fmtSize(500), "1 کیلوبایت"); assert.equal(fmtSize(1536 * 1024), "1.5 مگابایت");
});

test("پوستر: نام کافی‌نت/نشانی escape می‌شود (XSS)، QR و لوگو داخل پوستر است", () => {
  const html = buildPosterHtml({ shopName: '<img src=x onerror=alert(1)>', url: 'https://a.ir/u/"x"', qrSvgText: qrSvg("https://a.ir"), wordmarkSvg: WORDMARK_SVG, esc: escapeHtml, notice: "<b>hi</b>" });
  assert.ok(!html.includes("<img src=x"));   assert.ok(html.includes("&lt;img src=x"));
  assert.ok(!html.includes("<b>hi</b>"));
  assert.match(html, /<svg[^>]*viewBox/); assert.match(html, /size:A4/);
});

test("برند: آیکن پیش‌فرض و لوگوی کامل از فایل‌های رسمی brand/ ساخته شده‌اند", () => {
  assert.match(ICON_DATA_URI, /^data:image\/svg\+xml;base64,/);
  assert.equal(Buffer.from(ICON_DATA_URI.split(",")[1], "base64").toString("utf8"), read("../../brand/icon.svg").trim());
  assert.match(WORDMARK_SVG, /currentColor/);                      // رنگ متن با تم عوض می‌شود
  assert.ok(!WORDMARK_SVG.includes("#2b1610"));
  const gen = read("../../scripts/gen-brand-assets.mjs"); assert.match(gen, /brand/);
});

test("ثبت: تب uploads در TABS، NAV_TREE (مدیریت) و MainApp؛ وضعیت‌ها با سرور یکی است", () => {
  const c = read("../app/core/constants.js"), m = read("../app/app/MainApp.jsx"), srv = read("../../server/src/routes/uploads.js");
  assert.match(c, /key:"uploads",icon:"FolderOpen",label:"مدیریت فایل"/); assert.match(c, /\{key:"uploads",featured:true\}/); assert.doesNotMatch(c, /group:"manage"[^\n]*"uploads"/);
  assert.match(m, /activeTab==="uploads"&&<UploadsPage\/>/);
  assert.match(read("../components/Icon.jsx"), /QrCode/);
  const sv = srv.match(/STATUSES = \[([^\]]+)\]/); assert.ok(sv);
  assert.deepEqual(sv[1].split(",").map((s) => s.trim().replace(/["']/g, "")), STATUSES);
});

test("آیکن‌های برنامه (PWA/Electron/اندروید) از لوگوی رسمی ساخته شده‌اند", () => {
  for (const f of ["pwa/icons/icon-192.png", "pwa/icons/icon-512.png", "pwa/icons/icon-maskable-512.png", "pwa/icons/apple-touch-icon.png", "el/electron-app/app/icon.png", "el/electron-app/build/icon.ico", "brand/logo.svg", "brand/logo-white.svg", "brand/icon.svg"]) {
    const b = readFileSync(new URL(`../../${f}`, import.meta.url)); assert.ok(b.length > 500, f);
    if (f.endsWith(".png")) assert.equal(b.subarray(1, 4).toString(), "PNG", f);
  }
  const png = (f) => { const b = readFileSync(new URL(`../../${f}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(png("pwa/icons/icon-192.png"), [192, 192]); assert.deepEqual(png("pwa/icons/icon-512.png"), [512, 512]); assert.deepEqual(png("pwa/icons/icon-maskable-512.png"), [512, 512]);
});
