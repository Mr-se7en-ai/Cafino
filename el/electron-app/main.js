const { app, BrowserWindow, Menu, shell, ipcMain, dialog, safeStorage } = require("electron");
const dns = require("dns").promises;
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { registerDeviceIpc } = require("./native/bridge");
const { createAllowStore, createFetchGuard, createPrinterGuard, guardedFetch } = require("./native/netPolicy");
const { createSecureStore } = require("./native/secureStore");
const { createPermissionPolicy } = require("./native/permissions");

// صفحهٔ خود برنامه = فایل داخل پوشهٔ app (پل cafenetNative و IPC فقط برای همین‌هاست)
const appDir = path.join(__dirname, "app");
const isOwnPage = (u) => { try { const x = new URL(u); if (x.protocol !== "file:") return false; const p = path.resolve(decodeURIComponent(x.pathname.replace(/^\/([A-Za-z]:)/, "$1"))); return p === appDir || p.startsWith(appDir + path.sep); } catch { return false; } };
// فرستندهٔ IPC باید «فریم اصلی» و صفحهٔ خود برنامه باشد (نه iframe یا صفحهٔ دیگر)
const senderIsApp = (e) => { try { return !!e.senderFrame && e.senderFrame === e.sender.mainFrame && isOwnPage(e.senderFrame.url); } catch { return false; } };
const isPackaged = () => app.isPackaged && !process.env.CAFINO_DEVTOOLS;

// سخت‌سازی «همهٔ» webContents (از جمله پنجرهٔ مخفیِ چاپ): هیچ ناوبری/ریدایرکت/پنجرهٔ جدید/webview خارج از صفحهٔ برنامه
app.on("web-contents-created", (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  const block = (e, url) => { if (!isOwnPage(url)) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } };
  wc.on("will-navigate", block);
  wc.on("will-redirect", block);
  wc.on("will-attach-webview", (e) => e.preventDefault());
});

function createWindow() {
  const iconPath = path.join(__dirname, "app", "icon.png");
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f172a",
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: !isPackaged(),                      // در نسخهٔ نصبی ابزار توسعه‌دهنده بسته است (دستکاری سادهٔ دادهٔ برنامه از کنسول سخت‌تر می‌شود)
    },
  });
  if (isPackaged()) win.webContents.on("devtools-opened", () => win.webContents.closeDevTools());

  // Remove the default menu bar (File/Edit/View/...)
  Menu.setApplicationMenu(null);

  // لینک‌های بیرونی در مرورگر پیش‌فرض سیستم باز شوند
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // رندرر هرگز نباید از صفحهٔ برنامه خارج شود (پل cafenetNative فقط برای همین فایل‌هاست)
  win.webContents.on("will-navigate", (e, url) => { if (!isOwnPage(url)) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
  // فقط میکروفن (دستیار صوتی) و اعلان، آن هم فقط برای صفحهٔ خود برنامه؛ دوربین/صفحه‌نمایش/موقعیت و بقیه رد
  const perm = createPermissionPolicy({ isOwnPage });
  win.webContents.session.setPermissionRequestHandler((wc, permission, cb, details) => cb(perm.request(wc, permission, details)));
  win.webContents.session.setPermissionCheckHandler((wc, permission, origin, details) => perm.check(wc, permission, origin, details));
  win.webContents.session.setDevicePermissionHandler(() => false);          // USB/سریال/HID/بلوتوث از رندرر ممنوع (چاپگر/اسکنر از پل اصلی)

  win.loadFile(path.join(appDir, "index.html"));
}

// پنجرهٔ تأیید سیستم‌عامل (برای میزبان/پرینتر تازه) — خود صفحهٔ وب نمی‌تواند آن را تأیید کند
async function confirmNative(message) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const r = await dialog.showMessageBox(win, { type: "warning", buttons: ["اجازه نده", "اجازه می‌دهم"], defaultId: 0, cancelId: 0, noLink: true, title: "کافینو — تأیید دسترسی شبکه", message: "درخواست دسترسی شبکه", detail: message });
  return r.response === 1;
}
let policy = null;   // در app.whenReady ساخته می‌شود (به userData نیاز دارد)

// درخواست‌های دستیار هوشمند: فقط میزبان‌های مجاز (فهرست پیش‌فرض ارائه‌دهندگان + تأیید کاربر)، بدون ریدایرکت، هدرهای مجاز، سقف حجم
ipcMain.handle("cafenet:fetch", async (e, { url, opts } = {}) => {
  if (!senderIsApp(e)) throw new Error("درخواست نامعتبر است.");
  const req = await policy.fetchGuard.authorize(url, opts);
  return guardedFetch(req, { authorize: (u, o) => policy.fetchGuard.authorize(u, o) });
});

// چاپ مستقیم با SumatraPDF همراه pdf-to-printer (فقط ویندوز)؛ تصاویر با چاپ بی‌صدای Chromium
async function printFile(file, o) {
  if (o.ext === "pdf") {
    const pdfToPrinter = require("pdf-to-printer");
    return pdfToPrinter.print(file, { printer: o.printer, copies: o.copies, monochrome: !!o.monochrome, ...(o.pages ? { pages: o.pages } : {}) });
  }
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, javascript: false } });   // فقط یک تصویر؛ بدون JS و بدون preload
  const html = file + ".html";
  try {
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>@page{margin:0}html,body{margin:0}img{width:100%;height:auto;display:block}</style><img src="${path.basename(file)}">`);
    await w.loadFile(html);
    await new Promise((resolve, reject) => w.webContents.print({ silent: true, deviceName: o.printer, copies: o.copies, color: !o.monochrome, printBackground: true }, (ok, why) => (ok ? resolve() : reject(new Error(why || "print failed")))));
  } finally { w.destroy(); try { fs.unlinkSync(html); } catch { /* ignore */ } }
}

app.whenReady().then(() => {
  const userData = app.getPath("userData");
  const store = createAllowStore({ fs, file: path.join(userData, "net-allow.json") });
  const extra = String(process.env.CAFINO_FETCH_HOSTS || "").split(",").map((x) => x.trim()).filter(Boolean);   // مدیر IT: میزبان‌های اضافهٔ مجاز (متغیر محیطی سیستم)
  const electronPrinters = async () => { const w = BrowserWindow.getAllWindows()[0]; return w ? w.webContents.getPrintersAsync() : []; };
  const secureStore = createSecureStore({ safeStorage, fs, path, dir: path.join(userData, "secure") });
  let listWinPrinters = async () => [];
  policy = {
    fetchGuard: createFetchGuard({ store, confirm: confirmNative, lookup: (h, o) => dns.lookup(h, o), extraHosts: extra }),
    printerGuard: createPrinterGuard({ store, confirm: confirmNative, listPrinters: () => listWinPrinters() }),
  };
  const dev = registerDeviceIpc({ ipcMain, shell, app, execFile, fs, path, printFile, electronPrinters, trustSender: senderIsApp, printerGuard: policy.printerGuard, secureStore });
  if (dev && dev.printer && dev.printer.list) listWinPrinters = () => (process.platform === "win32" ? dev.printer.list() : Promise.resolve([]));
  createWindow();
  // لینوکس: اگر سرویس کلیدها نبود (basic_text)، کاربر یک‌بار با راه‌حل مطلع شود؛ رازها ذخیره نمی‌شوند (به‌جای ذخیرهٔ ضعیف)
  { const st = secureStore.status(); if (!st.available && process.platform === "linux" && !process.env.CAFINO_SUPPRESS_KEYRING_WARNING) { console.warn("[cafino] secure storage:", st.backend, st.level); dialog.showMessageBox({ type: "warning", buttons: ["متوجه شدم"], title: "کافینو — ذخیرهٔ امن", message: "ذخیرهٔ امن سیستم‌عامل فعال نیست", detail: st.warning, noLink: true }).catch(() => {}); } }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
