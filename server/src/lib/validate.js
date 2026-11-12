import { invalid } from "./errors.js";

const ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/;
export function toId(v, what = "شناسه") {
  if (v === undefined || v === null || v === "") throw invalid(`${what} لازم است`);
  const s = String(v);
  if (!ID_RE.test(s)) throw invalid(`${what} نامعتبر است`);
  return s;
}
export const toIdOrNull = (v) => (v === undefined || v === null || v === "" ? null : toId(v));

export function toText(v, { max = 500, key = "" } = {}) {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") throw invalid(`مقدار «${key}» باید متن باشد`);
  const s = String(v);
  if (s.length > max) throw invalid(`«${key}» بیش از ${max} نویسه است`);
  return s.replace(/\u0000/g, "");
}
export function toInt(v, { key = "", signed = false } = {}) {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw invalid(`«${key}» باید عدد صحیح باشد`);
  if (!signed && n < 0) throw invalid(`«${key}» نباید منفی باشد`);
  if (Math.abs(n) > 1e15) throw invalid(`«${key}» بیش از حد بزرگ است`);
  return n;
}
export function toNum(v, { key = "", signed = true } = {}) {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw invalid(`«${key}» باید عدد باشد`);
  if (!signed && n < 0) throw invalid(`«${key}» نباید منفی باشد`);
  if (Math.abs(n) > 1e11) throw invalid(`«${key}» بیش از حد بزرگ است`);
  return Math.round(n * 1000) / 1000;
}
export function toDate(v, { key = "" } = {}) {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw invalid(`«${key}» باید تاریخ میلادی YYYY-MM-DD باشد`);
  return s;
}
export function toEnum(v, list, { key = "", def } = {}) {
  if (v === undefined || v === null || v === "") return def ?? list[0];
  if (!list.includes(v)) throw invalid(`«${key}» باید یکی از ${list.join(" | ")} باشد`);
  return v;
}
export function toJson(v, { key = "", maxBytes = 262144, array = false } = {}) {
  if (v === undefined || v === null) return array ? [] : {};
  if (array ? !Array.isArray(v) : (typeof v !== "object" || Array.isArray(v))) throw invalid(`«${key}» ساختار نامعتبر دارد`);
  if (Buffer.byteLength(JSON.stringify(v)) > maxBytes) throw invalid(`«${key}» بیش از حد بزرگ است`);
  return v;
}
export const clampInt = (v, def, min, max) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
export function toTimestamp(v, key = "") {
  if (v === undefined || v === null || v === "") return null;
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) throw invalid(`«${key}» باید تاریخ‌وساعت معتبر باشد`);
  return new Date(t).toISOString();
}
