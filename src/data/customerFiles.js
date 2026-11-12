// App-level glue between customer records (localStorage) and the private file vault (IndexedDB).
import { createFileStore, idbAdapter, dataUrlToBlob, blobToDataUrl } from "./fileStore.js";

export const PRIVACY_CFG_KEY = "cafenet_privacy_cfg";
export const CUSTOMERS_KEY = "cafenet_customers";
export const PHOTO_PREFIX = "idb:";

let _store = null;
export function vault() {
  if (_store) return _store;
  try { _store = createFileStore({ adapter: idbAdapter() }); } catch { _store = null; }
  return _store;
}
export function setVaultForTests(store) { _store = store; }

export function getPrivacyConfig(storage = globalThis.localStorage) {
  try { return { retentionDays: 0, ...(JSON.parse(storage.getItem(PRIVACY_CFG_KEY) || "{}") || {}) }; } catch { return { retentionDays: 0 }; }
}
export function setPrivacyConfig(patch, storage = globalThis.localStorage) {
  try { storage.setItem(PRIVACY_CFG_KEY, JSON.stringify({ ...getPrivacyConfig(storage), ...patch })); } catch { /* ignore */ }
}

export const isPhotoRef = (v) => typeof v === "string" && v.startsWith(PHOTO_PREFIX);
export const photoRefId = (v) => String(v).slice(PHOTO_PREFIX.length);
export const makePhotoRef = (id) => PHOTO_PREFIX + id;

// every vault id a customer list refers to
export function referencedIds(customers) {
  const ids = [];
  for (const c of customers || []) {
    for (const f of c.files || []) if (f && f.stored === "idb") ids.push(String(f.id));
    if (isPhotoRef(c.photo)) ids.push(photoRefId(c.photo));
  }
  return ids;
}

// Moves legacy Base64 files / photos out of the customer records into the vault.
// → { replacements: Map<customerId, { files: Map<fileId, meta>, photo?: ref }>, moved: number, failed: number }
export async function migrateInlineMedia(customers, store = vault()) {
  const replacements = new Map(); let moved = 0, failed = 0;
  if (!store) return { replacements, moved, failed };
  for (const c of customers || []) {
    const rep = { files: new Map() };
    for (const f of c.files || []) {
      if (!f || typeof f.data !== "string" || !f.data.startsWith("data:")) continue;
      try {
        const blob = dataUrlToBlob(f.data);
        await store.put(f.id, blob, { name: f.name, type: f.type || blob.type, ownerId: c.id });
        rep.files.set(String(f.id), { id: f.id, name: f.name, type: f.type || blob.type, size: blob.size, uploadedAt: f.uploadedAt, stored: "idb" });
        moved++;
      } catch { failed++; }
    }
    if (typeof c.photo === "string" && c.photo.startsWith("data:")) {
      try {
        const id = `ph_${c.id}_${Date.now().toString(36)}`;
        await store.put(id, dataUrlToBlob(c.photo), { name: "photo.jpg", type: "image/jpeg", ownerId: c.id });
        rep.photo = makePhotoRef(id); moved++;
      } catch { failed++; }
    }
    if (rep.files.size || rep.photo) replacements.set(String(c.id), rep);
  }
  return { replacements, moved, failed };
}

// Applies replacements to the LATEST customer list (so edits made while the migration ran are not lost).
export function applyReplacements(customers, replacements) {
  return (customers || []).map((c) => {
    const rep = replacements.get(String(c.id));
    if (!rep) return c;
    const next = { ...c };
    if (rep.files.size) next.files = (c.files || []).map((f) => (f && rep.files.has(String(f.id)) ? rep.files.get(String(f.id)) : f));
    if (rep.photo && typeof c.photo === "string" && c.photo.startsWith("data:")) next.photo = rep.photo;
    return next;
  });
}

// Manual backup files must be self-contained: put the bytes back inline (data URLs) into the customers JSON.
export async function inlineMediaForBackup(customersJson, store = vault()) {
  if (!store || !customersJson) return customersJson;
  let list; try { list = JSON.parse(customersJson); } catch { return customersJson; }
  if (!Array.isArray(list)) return customersJson;
  let changed = false;
  for (const c of list) {
    for (let i = 0; i < (c.files || []).length; i++) {
      const f = c.files[i];
      if (f && f.stored === "idb") {
        try { const b = await store.get(f.id); if (b) { c.files[i] = { id: f.id, name: f.name, type: f.type, size: f.size, uploadedAt: f.uploadedAt, data: await blobToDataUrl(b) }; changed = true; } } catch { /* keep metadata only */ }
      }
    }
    if (isPhotoRef(c.photo)) { try { const b = await store.get(photoRefId(c.photo)); if (b) { c.photo = await blobToDataUrl(b); changed = true; } } catch { /* keep ref */ } }
  }
  return changed ? JSON.stringify(list) : customersJson;
}

// Remove vault files that no customer refers to any more (customer deleted, file removed in another tab, …) and apply the retention policy.
export async function sweepVault(customers, { store = vault(), cfg = getPrivacyConfig() } = {}) {
  if (!store) return { orphans: [], expired: [] };
  const refs = referencedIds(customers);
  const orphans = await store.removeUnreferenced(refs);
  const expired = cfg.retentionDays > 0 ? await store.purgeOlderThan(cfg.retentionDays, { protectIds: [] }) : [];
  return { orphans, expired, expiredIds: expired };
}
// Retention also has to clear the dangling metadata that points at the deleted bytes.
export function dropMissingRefs(customers, goneIds) {
  const gone = new Set(goneIds.map(String));
  if (!gone.size) return customers;
  return (customers || []).map((c) => {
    const files = (c.files || []).filter((f) => !(f && f.stored === "idb" && gone.has(String(f.id))));
    const photo = isPhotoRef(c.photo) && gone.has(photoRefId(c.photo)) ? "" : c.photo;
    return files.length === (c.files || []).length && photo === c.photo ? c : { ...c, files, photo };
  });
}
