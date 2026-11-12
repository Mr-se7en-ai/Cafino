// اتصال به ClamAV (clamd) با پروتکل INSTREAM — فایل از دیسک به‌صورت جریان (chunk) فرستاده می‌شود و در حافظه نمی‌ماند.
//  حالت‌ها (UPLOAD_AV_MODE):  off = اسکن نمی‌شود | optional = اگر clamd در دسترس نبود فایل بدون اسکن پذیرفته می‌شود | required = اگر در دسترس نبود ارسال رد می‌شود (fail-closed)
//  پیش‌فرض: اگر CLAMAV_HOST یا CLAMAV_SOCKET تنظیم شده باشد «required»، وگرنه «off».
//  نکته: StreamMaxLength در clamd.conf باید دست‌کم برابر بزرگ‌ترین حجم مجاز فایل (۱۰۰ مگابایت) باشد وگرنه clamd فایل‌های بزرگ را رد می‌کند.
import fs from "node:fs";
import net from "node:net";

const CHUNK = 64 * 1024;

/** نتیجه: { status: "clean" } | { status: "infected", signature } | { status: "error", message } */
export function scanFileViaClamd(filePath, { host, port = 3310, socketPath, timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    let settled = false, out = "";
    const finish = (r) => { if (settled) return; settled = true; clearTimeout(timer); try { sock.destroy(); } catch { /* ignore */ } try { rs?.destroy(); } catch { /* ignore */ } resolve(r); };
    const sock = socketPath ? net.createConnection({ path: socketPath }) : net.createConnection({ host, port });
    let rs = null;
    const timer = setTimeout(() => finish({ status: "error", message: "timeout" }), timeoutMs);
    sock.on("error", (e) => finish({ status: "error", message: e.code || e.message }));
    sock.on("data", (d) => { out += d.toString("utf8"); });
    sock.on("close", () => {
      const line = out.replace(/\0/g, "").trim();
      if (/\bOK$/.test(line)) return finish({ status: "clean" });
      const m = /^stream:\s*(.+?)\s+FOUND$/i.exec(line);
      if (m) return finish({ status: "infected", signature: m[1].slice(0, 100) });
      finish({ status: "error", message: line ? line.slice(0, 120) : "empty_response" });
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      rs = fs.createReadStream(filePath, { highWaterMark: CHUNK });
      rs.on("data", (buf) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(buf.length, 0);
        if (!sock.write(Buffer.concat([len, buf]))) { rs.pause(); sock.once("drain", () => rs.resume()); }
      });
      rs.on("end", () => sock.write(Buffer.alloc(4)));
      rs.on("error", (e) => finish({ status: "error", message: e.code || e.message }));
    });
  });
}

export function pingClamd({ host, port = 3310, socketPath, timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    let out = "", done = false;
    const end = (v) => { if (done) return; done = true; clearTimeout(t); try { sock.destroy(); } catch { /* ignore */ } resolve(v); };
    const sock = socketPath ? net.createConnection({ path: socketPath }) : net.createConnection({ host, port });
    const t = setTimeout(() => end(false), timeoutMs);
    sock.on("error", () => end(false));
    sock.on("connect", () => sock.write("zPING\0"));
    sock.on("data", (d) => { out += d.toString(); if (out.includes("PONG")) end(true); });
    sock.on("close", () => end(out.includes("PONG")));
  });
}

/** اسکنر مطابق تنظیمات سرور. scan(path) → {status:"clean"|"infected"|"skipped"|"unavailable", signature?} */
export function createScanner(cfg, log = () => {}) {
  const mode = cfg.uploadAvMode || "off";
  const target = { host: cfg.clamavHost, port: cfg.clamavPort, socketPath: cfg.clamavSocket, timeoutMs: cfg.clamavTimeoutMs };
  let pingCache = { at: 0, ok: false };
  return {
    mode,
    engine: mode === "off" ? "" : "clamav",
    async available() {
      if (mode === "off") return false;
      if (Date.now() - pingCache.at < 15000) return pingCache.ok;
      const ok = await pingClamd(target); pingCache = { at: Date.now(), ok }; return ok;
    },
    async scan(filePath) {
      if (mode === "off") return { status: "skipped" };
      const r = await scanFileViaClamd(filePath, target);
      if (r.status === "clean" || r.status === "infected") { pingCache = { at: Date.now(), ok: true }; return r; }
      pingCache = { at: Date.now(), ok: false };
      log(`clamd scan error: ${r.message}`);
      return mode === "required" ? { status: "unavailable", message: r.message } : { status: "skipped", message: r.message };
    },
  };
}
