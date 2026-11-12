import crypto from "node:crypto";
import { HttpError } from "./errors.js";

// Idempotency-Key: ارسال تکراری یک درخواست (صف آفلاین، قطع شدن پاسخ) همان پاسخِ اول را می‌گیرد و رکورد دوم نمی‌سازد.
// اجرا داخل تراکنش و زیر قفل مشورتی: دو درخواست هم‌زمان با یک کلید پشت‌سرهم اجرا می‌شوند، نه هم‌زمان.
const hashReq = (method, path, body) => crypto.createHash("sha256").update(`${method} ${path}\n${JSON.stringify(body ?? null)}`).digest("hex");

export async function withIdempotency(client, { scope, req, run }) {
  const raw = req.headers["idempotency-key"];
  if (!raw) return run();
  const key = String(raw).slice(0, 200);
  if (!/^[\w.:@-]{1,200}$/.test(key)) throw new HttpError(400, "bad_idempotency_key", "Idempotency-Key نامعتبر است");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`idem:${scope}:${key}`]);
  const h = hashReq(req.method, req.routeOptions?.url || req.url.split("?")[0], req.body);
  const found = await client.query("SELECT request_hash, status, body FROM idempotency_keys WHERE scope=$1 AND key=$2", [scope, key]);
  if (found.rows[0]) {
    if (found.rows[0].request_hash !== h) throw new HttpError(422, "idempotency_key_reuse", "این Idempotency-Key قبلاً برای درخواست دیگری استفاده شده است");
    return { replay: true, status: found.rows[0].status, body: found.rows[0].body };
  }
  const result = await run();
  if (result && result.status >= 200 && result.status < 300) {
    await client.query("INSERT INTO idempotency_keys(scope,key,request_hash,status,body) VALUES ($1,$2,$3,$4,$5)", [scope, key, h, result.status, result.body === undefined ? null : JSON.stringify(result.body)]);
  }
  return result;
}
