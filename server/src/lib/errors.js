// خطاهای قابل‌نمایش به کلاینت: { error: { code, message, details } } — همان شکلی که ApiError برنامه می‌خواند.
export class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const badRequest = (m, d) => new HttpError(400, "bad_request", m, d);
export const unauthorized = (m = "ورود لازم است") => new HttpError(401, "unauthorized", m);
export const forbidden = (m = "دسترسی ندارید", code = "forbidden") => new HttpError(403, code, m);
export const notFound = (m = "پیدا نشد") => new HttpError(404, "not_found", m);
export const conflict = (m, code = "conflict") => new HttpError(409, code, m);
export const invalid = (m, details) => new HttpError(422, "validation_error", m, details);
