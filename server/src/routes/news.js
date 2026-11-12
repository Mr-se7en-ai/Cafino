// GET /api/news?url=<فید> — پراکسی فید «اخبار کافی‌نت» با فهرست میزبان مجاز (لایهٔ ایمنی: lib/newsProxy.js).
import { HttpError } from "../lib/errors.js";
import { createNewsProxy, NewsProxyError } from "../lib/newsProxy.js";

export function registerNews(app, { proxy } = {}) {
  const p = proxy || createNewsProxy({ hosts: app.cfg.newsHosts });
  app.get("/api/news", { preHandler: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const url = req.query && req.query.url;
    if (typeof url !== "string" || url.length > 600) throw new HttpError(400, "bad_url", "آدرس فید لازم است");
    try { const r = await p.get(url); return { data: { text: r.text, contentType: r.contentType, fetchedAt: r.fetchedAt, cached: r.cached } }; }
    catch (e) { if (e instanceof NewsProxyError) throw new HttpError(e.status, e.code, e.message); throw e; }
  });
}
