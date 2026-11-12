// ذخیره‌سازی ساده روی فایل JSON (نوشتن اتمیک). برای چند صد اشتراک کافی است؛ برای مقیاس بزرگ‌تر می‌توان همین رابط را روی PostgreSQL پیاده کرد.
import fs from "node:fs";
import path from "node:path";

export function createMemoryStore(initial = { subs: {} }) {
  const data = JSON.parse(JSON.stringify(initial));
  return { data, save() {} };
}

export function createFileStore(file) {
  let data = { subs: {} };
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); if (!data.subs) data.subs = {}; } catch { /* فایل تازه */ }
  let timer = null, dirty = false;
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };
  return {
    data,
    save() { dirty = true; if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 400); timer.unref?.(); },
    flush,
  };
}
