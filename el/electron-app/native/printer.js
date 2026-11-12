// چاپ روی ویندوز: فهرست پرینترها، ارسال چاپ، و ردیابی جاب در spooler ویندوز (PowerShell Get-PrintJob).
// همهٔ وابستگی‌ها تزریق‌پذیرند تا بدون ویندوز هم تست شوند.
//  ⚠ شمارش «انجام‌شده» از spooler است (PagesPrinted)، نه از شمارندهٔ فیزیکی کاغذ. برای تطبیق نهایی از کنتور دستگاه استفاده می‌شود.
"use strict";
const path = require("path");

const PS_FLAGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];
const PS_LIST = "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Type,Shared,@{n='Color';e={try{(Get-PrintConfiguration -PrinterName $_.Name -ErrorAction Stop).Color}catch{$null}}} | ConvertTo-Json -Compress";
const PS_PORTS = "Get-PrinterPort | Select-Object Name,PrinterHostAddress | ConvertTo-Json -Compress";
// نام پرینتر از متغیر محیطی خوانده می‌شود (هرگز داخل متن اسکریپت نمی‌رود → تزریق دستور ممکن نیست)
const PS_JOBS = "Get-PrintJob -PrinterName $env:CAFINO_PRN -ErrorAction SilentlyContinue | Select-Object Id,DocumentName,JobStatus,TotalPages,PagesPrinted | ConvertTo-Json -Compress";
const ERROR_RE = /error|offline|paper|jam|intervention|blocked|deleted|deleting|restarted|user|toner|ink/i;
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const parseJson = (t) => { const s = String(t || "").trim(); if (!s) return []; try { return asArray(JSON.parse(s)); } catch { return []; } };
const PRINTER_STATUS = { 0: "ready", 1: "paused", 2: "error", 3: "deleting", 4: "paperJam", 5: "paperOut", 6: "manualFeed", 7: "paperProblem", 8: "offline" };

function createPrinterService({ exec, electronPrinters, printFile, fs, os, tmpDir, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, randomId }) {
  const rid = randomId || (() => Math.random().toString(36).slice(2, 10));
  const ps = async (cmd, env) => { const r = await exec("powershell.exe", [...PS_FLAGS, cmd], { env: { ...process.env, ...(env || {}) }, timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }); return typeof r === "string" ? r : (r && r.stdout) || ""; };

  async function list() {
    let rows = [];
    try { rows = parseJson(await ps(PS_LIST)); } catch { rows = []; }
    let ports = {};
    try { parseJson(await ps(PS_PORTS)).forEach((p) => { if (p && p.Name && p.PrinterHostAddress) ports[p.Name] = p.PrinterHostAddress; }); } catch { /* ignore */ }
    if (!rows.length && electronPrinters) {
      try { rows = (await electronPrinters()).map((p) => ({ Name: p.name, DriverName: "", PortName: "", PrinterStatus: p.status || 0, Color: null, isDefault: !!p.isDefault })); } catch { /* ignore */ }
    }
    return rows.filter((r) => r && r.Name).map((r) => ({
      name: String(r.Name), displayName: String(r.Name), driver: String(r.DriverName || ""), port: String(r.PortName || ""), ip: ports[r.PortName] || "",
      status: PRINTER_STATUS[r.PrinterStatus] || (typeof r.PrinterStatus === "string" ? r.PrinterStatus.toLowerCase() : "ready"), color: r.Color === true, shared: !!r.Shared,
    }));
  }

  // فایل از رندرر به صورت بایت می‌رسد؛ در پوشهٔ موقت با نام تصادفی نوشته می‌شود (مسیر دلخواه از رندرر پذیرفته نمی‌شود)
  const EXT = { pdf: "pdf", png: "png", jpg: "jpg", jpeg: "jpg", bmp: "bmp" };
  const MAX_BYTES = 60 * 1024 * 1024;
  function stage(fileName, bytes) {
    const ext = EXT[String(fileName || "").split(".").pop().toLowerCase()];
    if (!ext) throw new Error("فقط فایل PDF و تصویر (PNG/JPG/BMP) قابل چاپ مستقیم است؛ بقیه را ابتدا به PDF تبدیل کنید");
    const buf = Buffer.from(bytes || []);
    if (!buf.length) throw new Error("فایل خالی است");
    if (buf.length > MAX_BYTES) throw new Error("حجم فایل بیش از ۶۰ مگابایت است");
    if (ext === "pdf" && buf.slice(0, 4).toString("latin1") !== "%PDF") throw new Error("فایل PDF معتبر نیست");
    const id = "cafino-" + rid();
    const file = path.join(tmpDir, `${id}.${ext}`);
    fs.writeFileSync(file, buf);
    return { id, file, ext };
  }

  // درخواست: { printer, fileName, bytes, pages (تعداد صفحه‌های فایل), copies, color, pageRange? }
  async function print(req, onProgress) {
    const printers = await list();
    const target = printers.find((p) => p.name === req.printer);
    if (!target) throw new Error("پرینتر انتخاب‌شده در ویندوز پیدا نشد");
    if (["offline", "paperOut", "paperJam", "error"].includes(target.status)) throw new Error(`پرینتر آمادهٔ چاپ نیست (${target.status})`);
    const copies = Math.max(1, Math.min(999, Math.floor(Number(req.copies) || 1)));
    const pages = Math.max(1, Math.floor(Number(req.pages) || 1));
    const requested = pages * copies;
    const staged = stage(req.fileName, req.bytes);
    const t0 = now();
    try {
      await printFile(staged.file, { printer: target.name, copies, monochrome: !req.color, ext: staged.ext, pages: req.pageRange || undefined });
    } catch (e) { try { fs.unlinkSync(staged.file); } catch { /* ignore */ } throw new Error("ارسال به پرینتر ناموفق بود: " + (e && e.message)); }
    const r = await track({ printer: target.name, match: staged.id, requested, onProgress, t0 });
    setTimeout(() => { try { fs.unlinkSync(staged.file); } catch { /* ignore */ } }, 30000);
    return { ...r, requested, printer: target.name };
  }

  // ردیابی تا ناپدید شدن جاب از صف. نتیجه: { done, failed, status, assumed, observed }
  async function track({ printer, match, requested, onProgress, t0, pollMs = 1000, appearMs = 15000, maxMs = 15 * 60 * 1000 }) {
    let seen = false, maxPrinted = 0, errSeen = "", lastStatus = "", total = requested;
    const start = now();
    for (;;) {
      await wait(pollMs);
      let jobs = [];
      try { jobs = parseJson(await ps(PS_JOBS, { CAFINO_PRN: printer })); } catch { jobs = []; }
      const j = jobs.find((x) => String(x.DocumentName || "").includes(match));
      if (j) {
        seen = true; lastStatus = String(j.JobStatus || ""); if (Number(j.TotalPages) > 0) total = Number(j.TotalPages);
        maxPrinted = Math.max(maxPrinted, Number(j.PagesPrinted) || 0);
        if (ERROR_RE.test(lastStatus)) errSeen = lastStatus;
        if (onProgress) { try { onProgress({ printed: maxPrinted, total, status: lastStatus }); } catch { /* ignore */ } }
      } else if (seen) {
        // جاب از صف رفت
        if (/deleted|deleting/i.test(lastStatus) || (errSeen && !/printing|spooling/i.test(lastStatus))) {
          const done = Math.min(requested, maxPrinted);
          return { done, failed: requested - done, status: done === 0 ? "failed" : "partial", error: errSeen || lastStatus, assumed: false };
        }
        return { done: requested, failed: 0, status: "done", assumed: false };
      } else if (now() - start > appearMs) {
        // هیچ‌وقت در صف دیده نشد؛ احتمالاً خیلی سریع چاپ شده یا spooler پاسخ نداد → «فرض شده» و قابل‌بررسی با کنتور
        return { done: requested, failed: 0, status: "done", assumed: true };
      }
      if (now() - start > maxMs) return { done: Math.min(requested, maxPrinted), failed: requested - Math.min(requested, maxPrinted), status: "partial", error: "timeout", assumed: false };
    }
  }

  async function jobStatus(printer, match) {
    const jobs = parseJson(await ps(PS_JOBS, { CAFINO_PRN: printer }));
    const j = jobs.find((x) => String(x.DocumentName || "").includes(match));
    return j ? { found: true, status: String(j.JobStatus || ""), printed: Number(j.PagesPrinted) || 0, total: Number(j.TotalPages) || 0 } : { found: false };
  }
  return { list, print, track, jobStatus, stage };
}
module.exports = { createPrinterService, PS_JOBS, PS_LIST, ERROR_RE, parseJson };
