const { contextBridge, ipcRenderer } = require("electron");
// پل امن: درخواست ایجنت هوش مصنوعی + دستگاه‌های ویندوز (چاپ، اسکن، کنتور). رندرر فقط این توابع را می‌بیند.
const inv = (ch) => (arg) => ipcRenderer.invoke(ch, arg);
contextBridge.exposeInMainWorld("cafenetNative", {
  fetch: (url, opts) => ipcRenderer.invoke("cafenet:fetch", { url, opts }),
  platform: process.platform,
  capabilities: inv("cafino:caps"),
  printer: { getPrinters: inv("cafino:printers"), print: inv("cafino:print"), readCounter: inv("cafino:printerCounter") },
  // ذخیرهٔ امن رمزها و مهر یکپارچگی (DPAPI/Keychain/libsecret). نام‌ها در پردازش اصلی محدود به فهرست ثابت‌اند.
  secrets: { set: (name, value) => ipcRenderer.invoke("cafino:secretSet", { name, value }), get: (name) => ipcRenderer.invoke("cafino:secretGet", { name }), delete: (name) => ipcRenderer.invoke("cafino:secretDelete", { name }) },
  seal: { set: (hash) => ipcRenderer.invoke("cafino:sealSet", { hash }), verify: (hash) => ipcRenderer.invoke("cafino:sealVerify", { hash }) },
  scanner: { getScanners: inv("cafino:scanners"), scan: inv("cafino:scan"), showFile: inv("cafino:showScan") },
});
