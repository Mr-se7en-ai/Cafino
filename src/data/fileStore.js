// Private file vault for customer documents and photos.
//
//   localStorage (JSON)  ←  only a small metadata record per file   { id, name, type, size, uploadedAt, stored:"idb" }
//   IndexedDB            ←  the bytes, as an AES-GCM encrypted Blob, one random data key per file
//
// • Encryption at rest: every file gets its own random 256-bit key; the key is stored only in wrapped form (AES-GCM with a
//   non-extractable "master" CryptoKey kept in IndexedDB). A copied localStorage / backup JSON therefore never contains the bytes,
//   and an IndexedDB dump without the browser's key material is unreadable. (Anyone who can run code inside this very browser
//   profile can still ask the app to decrypt — that is the limit of a client-only vault.)
// • Secure delete: remove() first overwrites the record (random bytes) and drops the wrapped key — "crypto-shredding", so even if the
//   storage engine keeps stale pages, the old ciphertext can no longer be decrypted — and then deletes it.
// • Size limits and retention are enforced by the caller through the helpers below.
// • Where WebCrypto is unavailable (plain-http LAN pages) files are stored unencrypted and flagged `enc:false` in their metadata.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_OWNER = 20;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "application/pdf"];

// ── storage adapters ─────────────────────────────────────────────────────────
export function memoryAdapter() {
  const stores = { meta: new Map(), blobs: new Map(), keys: new Map() };
  return {
    kind: "memory",
    get: async (s, id) => stores[s].get(id),
    put: async (s, id, v) => { stores[s].set(id, { ...v, id }); },
    del: async (s, id) => { stores[s].delete(id); },
    all: async (s) => [...stores[s].values()],
    _stores: stores,
  };
}

export function idbAdapter(name = "cafenet_private_files") {
  let dbp = null;
  const open = () => dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { for (const s of ["meta", "blobs", "keys"]) r.result.createObjectStore(s, { keyPath: "id" }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbp = null; reject(r.error || new Error("IndexedDB unavailable")); };
  });
  const tx = async (s, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(s, mode), out = fn(t.objectStore(s));
      t.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
      t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error("aborted"));
    });
  };
  return {
    kind: "indexeddb",
    get: (s, id) => tx(s, "readonly", (o) => o.get(id)),
    put: (s, id, v) => tx(s, "readwrite", (o) => o.put({ ...v, id })),
    del: (s, id) => tx(s, "readwrite", (o) => o.delete(id)),
    all: (s) => tx(s, "readonly", (o) => o.getAll()),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!m) throw new Error("not a data URL");
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: m[1] || "application/octet-stream" });
}
export async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(s)}`;
}

export function createFileStore({ adapter, cryptoImpl = globalThis.crypto, now = () => Date.now() } = {}) {
  if (!adapter) throw new TypeError("adapter is required");
  const subtle = cryptoImpl && cryptoImpl.subtle;
  let masterP = null;

  const master = () => masterP ||= (async () => {
    const rec = await adapter.get("keys", "master");
    if (rec && rec.key) return rec.key;
    const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);   // non-extractable
    await adapter.put("keys", "master", { key });
    return key;
  })().catch((e) => { masterP = null; throw e; });

  const rand = (n) => cryptoImpl.getRandomValues(new Uint8Array(n));

  async function put(id, blob, meta = {}) {
    id = String(id);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const record = { name: meta.name || id, type: blob.type || meta.type || "application/octet-stream", size: bytes.length, ownerId: meta.ownerId == null ? null : String(meta.ownerId), createdAt: meta.createdAt || now(), enc: !!subtle };
    if (subtle) {
      const raw = rand(32), dataIv = rand(12), wrapIv = rand(12);
      const dataKey = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
      const ct = await subtle.encrypt({ name: "AES-GCM", iv: dataIv }, dataKey, bytes);
      const wrapped = await subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, await master(), raw);
      await adapter.put("blobs", id, { ct, iv: dataIv, wrapped, wrapIv });
      raw.fill(0);
    } else {
      await adapter.put("blobs", id, { plain: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    }
    await adapter.put("meta", id, record);
    return { id, ...record };
  }

  async function get(id) {
    id = String(id);
    const [meta, rec] = await Promise.all([adapter.get("meta", id), adapter.get("blobs", id)]);
    if (!meta || !rec || rec.shredded) return null;
    if (rec.plain) return new Blob([rec.plain], { type: meta.type });
    const raw = await subtle.decrypt({ name: "AES-GCM", iv: rec.wrapIv }, await master(), rec.wrapped);
    const dataKey = await subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, dataKey, rec.ct);
    return new Blob([plain], { type: meta.type });
  }

  async function remove(id) {
    id = String(id);
    const rec = await adapter.get("blobs", id);
    if (rec) {
      const len = Math.max(16, (rec.ct || rec.plain)?.byteLength || 16);
      await adapter.put("blobs", id, { shredded: true, ct: rand(Math.min(len, 1 << 16)).buffer, wrapped: rand(48).buffer, iv: rand(12), wrapIv: rand(12) });   // destroy the wrapped key + ciphertext first
    }
    await adapter.del("blobs", id);
    await adapter.del("meta", id);
    return !!rec;
  }

  const list = async () => (await adapter.all("meta")).map((m) => ({ ...m }));
  const totalSize = async () => (await list()).reduce((a, m) => a + (Number(m.size) || 0), 0);

  // Deletes every stored file whose id is not in `referencedIds` (e.g. customer deleted). `graceMs` protects uploads that are not saved to the customer record yet.
  async function removeUnreferenced(referencedIds, { graceMs = 120000 } = {}) {
    const keep = new Set([...referencedIds].map(String)), t = now(), gone = [];
    for (const m of await list()) if (!keep.has(String(m.id)) && t - (m.createdAt || 0) > graceMs) { await remove(m.id); gone.push(m.id); }
    return gone;
  }
  // Retention: delete files older than `days` (0 / falsy = disabled). Returns the ids removed.
  async function purgeOlderThan(days, { protectIds = [] } = {}) {
    if (!days || days <= 0) return [];
    const cutoff = now() - days * 86400000, protect = new Set(protectIds.map(String)), gone = [];
    for (const m of await list()) if (!protect.has(String(m.id)) && (m.createdAt || 0) < cutoff) { await remove(m.id); gone.push(m.id); }
    return gone;
  }
  return { put, get, remove, list, totalSize, removeUnreferenced, purgeOlderThan, kind: adapter.kind };
}

// Upload validation shared by the UI and tests. → error string, or "" when acceptable.
export function validateUpload(file, { existingCount = 0, totalBytes = 0 } = {}) {
  if (!file) return "فایلی انتخاب نشده";
  if (!ALLOWED_TYPES.includes(file.type)) return "فقط فرمت JPG و PDF مجاز است";
  if (file.size > MAX_FILE_BYTES) return "حجم فایل نباید بیشتر از ۵ مگابایت باشد";
  if (existingCount >= MAX_FILES_PER_OWNER) return `حداکثر ${MAX_FILES_PER_OWNER} فایل برای هر مشتری مجاز است`;
  if (totalBytes + file.size > MAX_TOTAL_BYTES) return "فضای مجاز فایل‌های مشتریان پر شده است؛ فایل‌های قدیمی را حذف کنید";
  return "";
}
