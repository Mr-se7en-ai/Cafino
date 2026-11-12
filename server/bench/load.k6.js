// بار ترکیبی واقع‌نما روی API. اجرا: k6 run -e BASE=http://127.0.0.1:3911 -e VUS=50 -e DUR=30s -e THINK=0.2 bench/load.k6.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

const BASE = __ENV.BASE, THINK = Number(__ENV.THINK || "0.2");
const creds = JSON.parse(open(__ENV.CREDS || "/tmp/bench-creds.json"));
export const options = {
  scenarios: { mix: { executor: "constant-vus", vus: Number(__ENV.VUS || 10), duration: __ENV.DUR || "30s" } },
  summaryTrendStats: ["min", "med", "p(90)", "p(95)", "p(99)", "max", "avg"],
  thresholds: {},
};
const T = {}; for (const n of ["list_customers", "list_invoices", "list_invoices_deep", "list_invoices_nocount", "list_invoices_cursor_deep", "sync_pull", "report_summary", "list_payments", "create_customer", "create_payment", "ledger", "me"]) T[n] = new Trend(`lat_${n}`, true);
const errors = new Rate("errors"), reqs = new Counter("reqs_total");

export function setup() {
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: creds.email, password: creds.password }), { headers: { "content-type": "application/json" } });
  if (r.status !== 200) throw new Error("login failed " + r.status + r.body);
  const token = r.json("data.accessToken");
  // نشانگر صفحهٔ عمیق (بعد از ۵۰هزار ردیف) برای سنجش cursor؛ سرور قدیمی نشانگر نمی‌دهد → null
  const deep = http.get(`${BASE}/api/invoices?limit=50&offset=50000&count=false`, { headers: { authorization: `Bearer ${token}` } });
  let cursor = null; try { cursor = deep.json("meta.nextCursor") || null; } catch (e) { cursor = null; }
  return { token, cursor };
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function call(name, method, path, body, token, extraHeaders) {
  const res = http.request(method, `${BASE}${path}`, body ? JSON.stringify(body) : null, { headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(extraHeaders || {}) }, tags: { name } });
  T[name].add(res.timings.duration); reqs.add(1);
  const ok = res.status >= 200 && res.status < 300; errors.add(!ok);
  check(res, { [`${name} 2xx`]: () => ok });
  return res;
}
export default function (d) {
  const t = d.token, x = Math.random();
  if (x < 0.22) call("list_customers", "GET", `/api/customers?limit=50&offset=${pick([0, 0, 0, 50, 100])}`, null, t);
  else if (x < 0.42) call("list_invoices", "GET", `/api/invoices?limit=50&offset=0`, null, t);
  else if (x < 0.47) call("list_invoices_deep", "GET", `/api/invoices?limit=50&offset=${pick([20000, 50000, 80000])}`, null, t);
  else if (x < 0.52) { if (d.cursor) call("list_invoices_cursor_deep", "GET", `/api/invoices?limit=50&count=false&cursor=${encodeURIComponent(d.cursor)}`, null, t); else call("list_invoices_nocount", "GET", `/api/invoices?limit=50&count=false`, null, t); }
  else if (x < 0.62) call("sync_pull", "GET", `/api/invoices?limit=200&updatedSince=${encodeURIComponent(new Date(Date.now() - 7 * 864e5).toISOString())}`, null, t);
  else if (x < 0.74) call("report_summary", "GET", `/api/reports/summary`, null, t);
  else if (x < 0.82) call("list_payments", "GET", `/api/payments?limit=50`, null, t);
  else if (x < 0.86) call("ledger", "GET", `/api/accounts/a${1 + Math.floor(Math.random() * 10000)}/ledger?limit=50`, null, t);
  else if (x < 0.90) call("me", "GET", `/api/auth/me`, null, t);
  else if (x < 0.96) call("create_customer", "POST", `/api/customers`, { id: `k6c-${__VU}-${__ITER}-${Date.now()}`, firstName: "تست", lastName: "بار", phone: "09120000000" }, t);
  else {
    const inv = `i${1 + Math.floor(Math.random() * 100000)}`;
    call("create_payment", "POST", `/api/payments`, { id: `k6p-${__VU}-${__ITER}-${Date.now()}`, invoiceId: inv, amount: 1000, method: "cash", date: new Date().toISOString().slice(0, 10) }, t, { "idempotency-key": `k6-${__VU}-${__ITER}-${Date.now()}` });
  }
  sleep(THINK);
}
