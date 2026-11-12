import test from "node:test";
import assert from "node:assert/strict";
import { createFileStore, memoryAdapter, dataUrlToBlob, blobToDataUrl, validateUpload, MAX_FILE_BYTES } from "../data/fileStore.js";
import { migrateInlineMedia, applyReplacements, inlineMediaForBackup, referencedIds, sweepVault, dropMissingRefs } from "../data/customerFiles.js";

const mk = (now = () => Date.now()) => { const adapter = memoryAdapter(); return { adapter, store: createFileStore({ adapter, now }) }; };
const blobOf = (txt, type = "application/pdf") => new Blob([txt], { type });
const text = async (b) => new TextDecoder().decode(await b.arrayBuffer());

test("round trip: bytes come back identical; stored bytes are ciphertext, not the file", async () => {
  const { store, adapter } = mk();
  await store.put("f1", blobOf("SECRET-NATIONAL-ID-0012345678"), { name: "id.pdf", ownerId: 7 });
  assert.equal(await text(await store.get("f1")), "SECRET-NATIONAL-ID-0012345678");
  const rec = adapter._stores.blobs.get("f1");
  assert.equal(rec.plain, undefined);
  assert.ok(!Buffer.from(rec.ct).toString("latin1").includes("SECRET-NATIONAL"));
  assert.equal((await store.list())[0].enc, true);
  assert.equal(adapter._stores.keys.get("master").key.extractable, false, "master key is non-extractable");
});
test("every file has its own key: same content → different ciphertext", async () => {
  const { store, adapter } = mk();
  await store.put("a", blobOf("same")); await store.put("b", blobOf("same"));
  assert.notDeepEqual(Buffer.from(adapter._stores.blobs.get("a").ct), Buffer.from(adapter._stores.blobs.get("b").ct));
});
test("secure delete: record is shredded then removed; get() returns null", async () => {
  const { store, adapter } = mk();
  await store.put("x", blobOf("data")); const before = adapter._stores.blobs.get("x");
  const seen = []; const origDel = adapter.del; adapter.del = async (s, id) => { if (s === "blobs") seen.push(JSON.stringify(Object.keys(adapter._stores.blobs.get(id) || {}))); return origDel(s, id); };
  await store.remove("x");
  assert.ok(seen[0].includes("shredded"), "overwritten before delete");
  assert.equal(await store.get("x"), null); assert.equal(adapter._stores.blobs.size, 0); assert.equal(adapter._stores.meta.size, 0);
  assert.notEqual(before.wrapped, undefined);
});
test("orphan sweep honours the grace period", async () => {
  let t = 1_000_000; const { store } = mk(() => t);
  await store.put("keep", blobOf("1")); await store.put("old", blobOf("2")); t += 200_000; await store.put("fresh", blobOf("3"));
  const gone = await store.removeUnreferenced(["keep"], { graceMs: 120000 });
  assert.deepEqual(gone, ["old"]); assert.deepEqual((await store.list()).map((m) => m.id).sort(), ["fresh", "keep"]);
});
test("retention: deletes files older than N days only", async () => {
  let t = 10 * 86400000; const { store } = mk(() => t);
  await store.put("old", blobOf("1")); t += 100 * 86400000; await store.put("new", blobOf("2"));
  assert.deepEqual(await store.purgeOlderThan(0), []);
  assert.deepEqual(await store.purgeOlderThan(90), ["old"]); assert.deepEqual((await store.list()).map((m) => m.id), ["new"]);
});
test("upload validation: type, size, count, quota", () => {
  assert.match(validateUpload({ type: "image/png", size: 10 }), /JPG/);
  assert.match(validateUpload({ type: "application/pdf", size: MAX_FILE_BYTES + 1 }), /۵ مگابایت/);
  assert.match(validateUpload({ type: "application/pdf", size: 10 }, { existingCount: 20 }), /حداکثر/);
  assert.match(validateUpload({ type: "application/pdf", size: 10 }, { totalBytes: 200 * 1024 * 1024 }), /پر شده/);
  assert.equal(validateUpload({ type: "image/jpeg", size: 1000 }), "");
});
test("migration: Base64 files + photo move to the vault; latest edits survive; refs resolve", async () => {
  const { store } = mk();
  const url = "data:application/pdf;base64," + Buffer.from("PDFBYTES").toString("base64");
  const photo = "data:image/jpeg;base64," + Buffer.from("JPEGBYTES").toString("base64");
  const customers = [{ id: 1, firstName: "a", files: [{ id: 11, name: "x.pdf", type: "application/pdf", size: 8, uploadedAt: "2026-01-01", data: url }], photo }, { id: 2, firstName: "b", files: [] }];
  const { replacements, moved, failed } = await migrateInlineMedia(customers, store);
  assert.equal(moved, 2); assert.equal(failed, 0);
  const latest = [{ ...customers[0], note: "edited meanwhile" }, customers[1]];
  const out = applyReplacements(latest, replacements);
  assert.equal(out[0].note, "edited meanwhile"); assert.equal(out[0].files[0].data, undefined); assert.equal(out[0].files[0].stored, "idb"); assert.match(out[0].photo, /^idb:ph_1_/);
  assert.ok(!JSON.stringify(out).includes("base64"));
  assert.equal(await text(await store.get(11)), "PDFBYTES");
  assert.equal(referencedIds(out).length, 2);
  // backup export is self-contained again, and migration after restore is idempotent
  const inlined = JSON.parse(await inlineMediaForBackup(JSON.stringify(out), store));
  assert.equal(inlined[0].files[0].data, url); assert.equal(inlined[0].photo, photo);
  const again = await migrateInlineMedia(inlined, store); assert.equal(again.moved, 2);
});
test("sweepVault removes deleted customers' files and dropMissingRefs cleans metadata", async () => {
  let t = 1_000_000; const { store } = mk(() => t);
  await store.put("f1", blobOf("1")); await store.put("f2", blobOf("2")); t += 300_000;
  const customers = [{ id: 1, files: [{ id: "f1", stored: "idb" }] }];
  const r = await sweepVault(customers, { store, cfg: { retentionDays: 0 } }); assert.deepEqual(r.orphans, ["f2"]);
  const cleaned = dropMissingRefs([{ id: 1, files: [{ id: "f1", stored: "idb" }, { id: "f9", stored: "idb" }] }], ["f9"]);
  assert.deepEqual(cleaned[0].files.map((f) => f.id), ["f1"]);
});
test("data URL helpers", async () => { const b = dataUrlToBlob("data:text/plain;base64,aGk="); assert.equal(await text(b), "hi"); assert.equal(await blobToDataUrl(b), "data:text/plain;base64,aGk="); });
