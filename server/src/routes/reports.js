// گزارش‌های تجمیعی (در خود پایگاه‌داده محاسبه می‌شوند، نه در حافظه)
import { toDate } from "../lib/validate.js";
import { summaryOf } from "../lib/reportData.js";

export function registerReports(app) {
  const { pool } = app;
  const mgr = [app.requirePerm("report.financial")];

  // GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get("/api/reports/summary", { preHandler: mgr }, async (req, reply) => {
    const cafeId = req.user.cafeId;
    const to = toDate(req.query.to, { key: "to" }) || new Date().toISOString().slice(0, 10);
    const from = toDate(req.query.from, { key: "from" }) || new Date(Date.parse(to) - 29 * 86400e3).toISOString().slice(0, 10);
    const { value, state } = await app.reportCache.get(cafeId, `summary:${from}:${to}`, () => summaryOf(pool, cafeId, from, to), { fresh: req.query.fresh === "true" });
    reply.header("x-report-cache", state);
    return { data: value };
  });
}
