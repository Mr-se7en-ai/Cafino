import { asAppError } from "../core/errors.js";
import { recordBeforeWrite, inTransaction } from "./transaction.js";

function getStorage(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function readJsonValue(key, fallback, { storage } = {}) {
  return readJsonResult(key, fallback, { storage }).value;
}

export function readJsonResult(key, fallback, { storage } = {}) {
  try {
    const store = getStorage(storage);
    const raw = store?.getItem(key);
    if (raw == null) return { ok: true, value: fallback };
    return { ok: true, value: JSON.parse(raw) };
  } catch (cause) {
    return { ok: false, value: fallback, error: asAppError(cause, "storage_read_failed") };
  }
}

export function writeJsonValue(key, value, { storage } = {}) {
  try {
    const store = getStorage(storage);
    if (!store) throw new Error("Storage is unavailable");
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("Value cannot be serialized");
    recordBeforeWrite(key, storage);
    store.setItem(key, serialized);
    return { ok: true, value };
  } catch (cause) {
    const error = asAppError(cause, "storage_write_failed");
    try {
      globalThis.window?.dispatchEvent(new CustomEvent("cafenet:storage-error", {
        detail: { key, code: error.code },
      }));
    } catch {}
    return { ok: false, error, inTransaction: inTransaction() };
  }
}

export function removeStorageValue(key, { storage } = {}) {
  try {
    recordBeforeWrite(key, storage);
    getStorage(storage)?.removeItem(key);
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: asAppError(cause, "storage_remove_failed") };
  }
}

export class LocalRepository {
  constructor({ key, fallback, validate = () => true, storage } = {}) {
    if (!key) throw new TypeError("Repository key is required");
    this.key = key;
    this.fallback = fallback;
    this.validate = validate;
    this.storage = storage;
  }

  read() {
    const stored = readJsonResult(this.key, this.fallback, { storage: this.storage });
    if (!stored.ok) return { ...stored, error: { ...stored.error, details: { ...stored.error.details, key: this.key } } };
    const value = stored.value;
    const result = this.validate(value);
    return result === true ? { ok: true, value } : {
      ok: false,
      value: this.fallback,
      error: { code: "stored_data_invalid", key: this.key, issues: result },
    };
  }

  write(value) {
    const result = this.validate(value);
    if (result !== true) return {
      ok: false,
      error: { code: "validation_failed", key: this.key, issues: result },
    };
    return writeJsonValue(this.key, value, { storage: this.storage });
  }

  update(updater) {
    const current = this.read();
    if (!current.ok) return current;
    let next;
    try {
      next = updater(current.value);
    } catch (cause) {
      return { ok: false, error: asAppError(cause, "repository_update_failed") };
    }
    return this.write(next);
  }

  remove() {
    return removeStorageValue(this.key, { storage: this.storage });
  }
}
