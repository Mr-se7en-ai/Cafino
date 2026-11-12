// سرویس اعلان کافینو.  اجرا:  npm install && npm start
// متغیرهای محیطی: PORT (8787)، DATA_DIR (./data)، VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (mailto:…)،
//   ALLOWED_ORIGINS (فهرست مبدأهای مجاز با ویرگول؛ خالی = همه)، PUSH_SHARED_KEY (اختیاری)، TICK_SECONDS (20)
import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { createFileStore } from "./src/store.js";
import { createPushService } from "./src/service.js";
import { createHttpServer } from "./src/http.js";

const dataDir = path.resolve(process.env.DATA_DIR || "./data");
fs.mkdirSync(dataDir, { recursive: true });

function loadVapid() {
  let pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  const file = path.join(dataDir, "vapid.json");
  if (!pub || !priv) {
    try { ({ publicKey: pub, privateKey: priv } = JSON.parse(fs.readFileSync(file, "utf8"))); } catch { /* تازه */ }
  }
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    fs.writeFileSync(file, JSON.stringify({ publicKey: pub, privateKey: priv }), { mode: 0o600 });
    console.log("کلیدهای VAPID ساخته و در", file, "ذخیره شد.");
  }
  return { pub, priv, subject: process.env.VAPID_SUBJECT || "mailto:admin@example.com" };
}

if (process.argv.includes("--generate-keys")) {
  const k = webpush.generateVAPIDKeys();
  console.log("VAPID_PUBLIC_KEY=" + k.publicKey + "\nVAPID_PRIVATE_KEY=" + k.privateKey);
  process.exit(0);
}

const vapid = loadVapid();
webpush.setVapidDetails(vapid.subject, vapid.pub, vapid.priv);
const store = createFileStore(path.join(dataDir, "push-store.json"));
const service = createPushService({
  store,
  sender: (subscription, payload, options) => webpush.sendNotification(subscription, payload, options),
  log: (...a) => console.log("[push]", ...a),
});
const server = createHttpServer({
  service, publicKey: vapid.pub,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  sharedKey: process.env.PUSH_SHARED_KEY || "",
});
const port = Number(process.env.PORT || 8787);
server.listen(port, () => console.log(`سرویس اعلان کافینو روی پورت ${port} آماده است. کلید عمومی (برای config.js):\n${vapid.pub}`));

const every = Math.max(5, Number(process.env.TICK_SECONDS || 20)) * 1000;
let busy = false;
const timer = setInterval(async () => { if (busy) return; busy = true; try { const n = await service.tick(); if (n) console.log("[push] sent", n); } catch (e) { console.error("[push] tick error", e); } finally { busy = false; } }, every);
const stop = () => { clearInterval(timer); store.flush?.(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
