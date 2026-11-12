// پل IPC بین رندرر و ویندوز. همهٔ ورودی‌ها اعتبارسنجی می‌شوند؛ رندرر هیچ مسیر یا دستور دلخواهی نمی‌فرستد.
"use strict";
const { createPrinterService } = require("./printer");
const { createScannerService } = require("./scanner");
const { snmpGet, OID_LIFE_COUNT } = require("./snmp");

function registerDeviceIpc({ ipcMain, shell, app, execFile, fs, path, electronPrinters, printFile, platform = process.platform, trustSender = () => true, printerGuard, secureStore, snmpOptions = {} }) {
  const { promisify } = require("util");
  const exec = promisify(execFile);
  const tmpDir = path.join(app.getPath("temp"), "cafino-print");
  const scansDir = path.join(app.getPath("documents"), "CAFINO-Scans");
  fs.mkdirSync(tmpDir, { recursive: true });
  const win = platform === "win32";
  const printer = createPrinterService({ exec, electronPrinters, printFile, fs, tmpDir });
  const scanner = createScannerService({ exec, fs, scansDir });
  // هر هندلر: فرستنده باید صفحهٔ خود برنامه باشد (نه iframe/صفحهٔ بیرونی)
  const trusted = (e) => { if (!trustSender(e)) throw new Error("درخواست نامعتبر است."); };
  const handle = (ch, fn) => ipcMain.handle(ch, async (e, a) => { trusted(e); return fn(a, e); });
  const guard = (fn) => async (a) => { if (!win) throw new Error("این قابلیت فقط در نسخهٔ ویندوز کار می‌کند"); return fn(a || {}); };

  handle("cafino:caps", async () => ({ platform, printer: win, scanner: win, snmp: true, secureStore: !!(secureStore && secureStore.secrets.available()), secureStoreStatus: secureStore ? secureStore.status() : { available: false, backend: "none", level: "unavailable", warning: "" }, version: 3 }));
  handle("cafino:printers", guard(() => printer.list()));
  handle("cafino:print", guard((a) => printer.print({ printer: String(a.printer || ""), fileName: String(a.fileName || ""), bytes: a.bytes, pages: a.pages, copies: a.copies, color: !!a.color, pageRange: a.pageRange ? String(a.pageRange).replace(/[^0-9,\-]/g, "").slice(0, 60) : "" })));
  handle("cafino:printerCounter", async (a) => {
    // IP باید خصوصی LAN و «پرینتر شناخته‌شده» باشد (printerGuard)؛ بدون guard فقط قاعدهٔ IP خصوصی در snmpGet اعمال می‌شود
    const ip = printerGuard ? await printerGuard.authorize(a && a.ip) : String((a && a.ip) || "").trim();
    const value = await snmpGet(ip, { community: String((a && a.community) || "public"), oid: OID_LIFE_COUNT, ...snmpOptions });
    return { value, source: "snmp" };
  });
  handle("cafino:scanners", guard(() => scanner.list()));
  handle("cafino:scan", guard((a) => scanner.scan({ scannerId: String(a.scannerId || ""), dpi: a.dpi, color: String(a.color || "color"), source: String(a.source || "flatbed"), maxPages: a.maxPages })));
  handle("cafino:showScan", async (p) => { if (!scanner.insideScans(p)) throw new Error("مسیر مجاز نیست"); shell.showItemInFolder(path.resolve(String(p))); return true; });
  // رازها و مهر یکپارچگی (ذخیرهٔ امن سیستم‌عامل)
  if (secureStore) {
    handle("cafino:secretSet", async (a) => secureStore.secrets.set(String(a && a.name), a && a.value));
    handle("cafino:secretGet", async (a) => secureStore.secrets.get(String(a && a.name)));
    handle("cafino:secretDelete", async (a) => secureStore.secrets.delete(String(a && a.name)));
    handle("cafino:sealSet", async (a) => secureStore.seal.set(String(a && a.hash)));
    handle("cafino:sealVerify", async (a) => secureStore.seal.verify(String(a && a.hash)));
  }
  return { printer, scanner };
}
module.exports = { registerDeviceIpc };
