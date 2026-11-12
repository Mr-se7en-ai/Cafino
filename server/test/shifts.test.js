// قابلیت‌های 1.75: شیفت صندوق، درخواست اصلاح با تأیید مدیر، هوش کسب‌وکار (پیش‌بینی). همه روی PostgreSQL واقعی.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, stopDb, makeApp, client } from "./helpers.js";
import { linearForecast } from "../src/routes/bi.js";

const PW = "رمز-خیلی-قوی-۱۲۳";
let ctx, O, M, S, S2, cafeId;
const mk = async (owner, role, n) => {
  const email = `${role}${n}@feat.test`;
  const inv = await owner("POST", "/api/users/invite", { email, role, firstName: "ک", lastName: n }); assert.equal(inv.status, 201, JSON.stringify(inv.json));
  const cc = client(ctx.app), lg = await cc.post("/api/auth/login", { email, password: inv.data.temporaryPassword });
  await cc.call("POST", "/api/auth/password", { body: { currentPassword: inv.data.temporaryPassword, newPassword: PW }, bearer: lg.data.accessToken });
  const l2 = await cc.post("/api/auth/login", { email, password: PW });
  return { id: inv.data.user.id, call: (m, u, b) => cc.call(m, u, { body: b, bearer: l2.data.accessToken }) };
};
before(async () => {
  ctx = await makeApp(await startDb(), { env: { PERMISSION_PROFILE: "strict" } });
  const c = client(ctx.app), r = await c.post("/api/auth/register", { email: "own@feat.test", password: PW, firstName: "مالک", lastName: "الف", phone: "09121234567", shopName: "ویژگی" });
  cafeId = r.data.user.branchId; O = (m, u, b) => c.call(m, u, { body: b, bearer: r.data.accessToken });
  M = await mk(O, "manager", "1"); S = await mk(O, "staff", "1"); S2 = await mk(O, "staff", "2");
  await O("POST", "/api/customers", { id: "c1", firstName: "علی" });
});
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); });
const pay = (id, amount, method = "cash", extra = {}) => O("POST", "/api/payments", { id, amount, method, date: new Date().toISOString().slice(0, 10), customerId: "c1", ...extra });

test("شیفت: باز → فقط یک شیفت باز؛ دریافت/هزینه نقدی محاسبه؛ بستن با اختلاف نیازمند توضیح؛ بسته‌شده تغییرناپذیر", async () => {
  assert.equal((await S.call("GET", "/api/shifts/current")).data, null);
  const bad = await S.call("POST", "/api/shifts/open", { openingCash: -5 }); assert.equal(bad.status, 422);
  const op = await S.call("POST", "/api/shifts/open", { openingCash: 1_000_000, note: "صبح" }); assert.equal(op.status, 201, JSON.stringify(op.json));
  const id = op.data.id; assert.equal(op.data.status, "open"); assert.equal(op.data.openedBy, S.id);
  const dup = await S2.call("POST", "/api/shifts/open", { openingCash: 1 }); assert.equal(dup.status, 409); assert.equal(dup.json.error.code, "shift_already_open");
  // رقابت هم‌زمان: دو باز کردن هم‌زمان → دقیقاً یکی موفق (شیفتِ باز وجود دارد؛ هر دو باید 409 شوند)
  const race = await Promise.all([S.call("POST", "/api/shifts/open", { openingCash: 1 }), M.call("POST", "/api/shifts/open", { openingCash: 1 })]); assert.deepEqual(race.map((x) => x.status), [409, 409]);
  // سند‌ها: ۳۰۰هزار نقدی + ۲۰۰هزار کارت + ۱۰۰هزار نقدی که برگشت می‌خورد + هزینهٔ نقدی ۵۰هزار + هزینهٔ کارتی ۷۰هزار
  assert.equal((await pay("sp1", 300_000)).status, 201);
  assert.equal((await pay("sp2", 200_000, "card")).status, 201);
  assert.equal((await pay("sp3", 100_000)).status, 201);
  const v = await O("POST", "/api/payments/sp3/void", { reason: "اشتباه ثبت شد" }); assert.ok(v.status < 300, JSON.stringify(v.json));
  assert.equal((await O("POST", "/api/expenses", { id: "se1", amount: 50_000, method: "cash", category: "چای", date: "2026-01-01" })).status, 201);
  assert.equal((await O("POST", "/api/expenses", { id: "se2", amount: 70_000, method: "card", category: "قبض", date: "2026-01-01" })).status, 201);
  const cur = (await S.call("GET", "/api/shifts/current")).data;
  assert.equal(cur.live.net.cash, 300_000); assert.equal(cur.live.net.card, 200_000); assert.equal(cur.live.cashExpenses, 50_000);
  assert.equal(cur.live.expectedCash, 1_000_000 + 300_000 - 50_000, "= آغازین + نقدی خالص − هزینهٔ نقدی (کارت در صندوق نیست)");
  // اختلاف بدون توضیح → 422 با مقدار مورد انتظار
  const noNote = await S.call("POST", `/api/shifts/${id}/close`, { countedCash: 1_200_000 }); assert.equal(noNote.status, 422); assert.equal(noNote.json.error.details.difference, -50_000);
  // کارمندِ دیگر نمی‌تواند شیفتِ همکارش را ببندد/ببیند؛ ورودی نامعتبر
  assert.equal((await S2.call("POST", `/api/shifts/${id}/close`, { countedCash: 1, note: "x y z" })).status, 403);
  assert.equal((await S2.call("GET", `/api/shifts/${id}`)).status, 403);
  assert.equal((await S.call("POST", `/api/shifts/${id}/close`, { countedCash: "12" })).status, 422);
  const cl = await S.call("POST", `/api/shifts/${id}/close`, { countedCash: 1_200_000, note: "۵۰ هزار تومان کسری؛ پول خرد" }); assert.equal(cl.status, 200, JSON.stringify(cl.json));
  assert.equal(cl.data.status, "closed"); assert.equal(cl.data.expectedCash, 1_250_000); assert.equal(cl.data.difference, -50_000); assert.equal(cl.data.totals.cashNet, 300_000);
  assert.equal((await S.call("POST", `/api/shifts/${id}/close`, { countedCash: 1, note: "دوباره" })).status, 409, "بستن مجدد");
  // تغییرناپذیری در پایگاه‌داده (حتی با اتصال مالک)
  await assert.rejects(ctx.pool.query("UPDATE cash_shifts SET counted_cash=9 WHERE id=$1", [id]), /تغییرناپذیر|check|cash_shifts_guard/);
  await assert.rejects(ctx.pool.query("DELETE FROM cash_shifts WHERE id=$1", [id]), /financial_no_delete/);
  const live = (await M.call("GET", `/api/shifts/${id}`)).data; assert.equal(live.live.driftSinceClose, 0);
  // حسابرسی ثبت شده و زنجیره سالم
  const a = (await O("GET", "/api/audit?limit=50")).data; assert.ok(a.some((x) => x.action === "shift.open") && a.some((x) => x.action === "shift.close"));
  assert.equal((await O("GET", "/api/audit/verify")).data.ok, true);
});

test("شیفت: سند دیرهنگام با زمان داخل شیفت → driftSinceClose نشان می‌دهد؛ گزارش عملکرد و مجوزها", async () => {
  const sh = (await M.call("POST", "/api/shifts/open", { openingCash: 500_000 })).data; assert.ok(sh.id);
  assert.equal((await pay("sp4", 80_000)).status, 201);
  const cl = await M.call("POST", `/api/shifts/${sh.id}/close`, { countedCash: 580_000 }); assert.equal(cl.status, 200); assert.equal(cl.data.difference, 0);
  // سندی که created_at آن در پنجرهٔ شیفتِ بسته‌شده است ولی بعداً ثبت شد (مثل همگام‌سازی آفلاین)
  await ctx.pool.query("INSERT INTO payments(cafe_id,id,customer_id,amount,method,date,created_at,updated_at) VALUES ($1,'late1','c1',25000,'cash',current_date, $2, $2)", [cafeId, new Date((Date.parse(cl.data.openedAt) + Date.parse(cl.data.closedAt)) / 2)]);
  const d = (await M.call("GET", `/api/shifts/${sh.id}`)).data; assert.equal(d.live.driftSinceClose, 25_000);
  assert.equal((await S.call("GET", "/api/shifts")).status, 403, "کارمند فهرست همه را نمی‌بیند");
  assert.equal((await S.call("GET", "/api/shifts/report")).status, 403);
  const rep = (await M.call("GET", "/api/shifts/report")).data; assert.equal(rep.closedShifts, 2);
  const p1 = rep.people.find((p) => p.userId === S.id), p2 = rep.people.find((p) => p.userId === M.id);
  assert.equal(p1.shortage, 50_000); assert.equal(p1.accuracyPct, 0); assert.equal(p2.accuracyPct, 100); assert.equal(rep.total.shortage, 50_000);
  const list = (await M.call("GET", "/api/shifts?status=closed")).data; assert.equal(list.length, 2);
});

test("اصلاح مالی با تأیید مدیر: درخواست (dry-run) → رد/تأیید؛ دو نفره؛ تغییرناپذیر؛ حسابرسی", async () => {
  // خرابی عمدی: مانده فاکتور را مستقیم در DB خراب می‌کنیم
  await O("POST", "/api/invoices", { id: "ci1", number: "CI1", customerId: "c1", date: "2026-02-01", subtotal: 100_000, totalAmount: 100_000, status: "unpaid" });
  await ctx.pool.query("ALTER TABLE invoices DISABLE TRIGGER USER"); await ctx.pool.query("UPDATE invoices SET paid_amount=40000, remaining_amount=60000, status='partial' WHERE id='ci1'"); await ctx.pool.query("ALTER TABLE invoices ENABLE TRIGGER USER");
  const rep = (await O("GET", "/api/integrity")).data; assert.ok(rep.findings.some((f) => f.id === "ci1"), "خرابی دیده شود");
  assert.equal((await S.call("POST", "/api/integrity/corrections", { scope: ["invoices"], reason: "x" })).status, 422);
  assert.equal((await S.call("POST", "/api/integrity/corrections", { scope: ["bogus"], reason: "دلیل کافی" })).status, 422);
  const rq = await S.call("POST", "/api/integrity/corrections", { scope: ["invoices"], reason: "مانده فاکتور ci1 با پرداخت‌ها نمی‌خواند" }); assert.equal(rq.status, 201, JSON.stringify(rq.json));
  assert.equal(rq.data.status, "pending"); assert.ok(rq.data.preview.before);
  assert.equal(Number((await ctx.pool.query("SELECT paid_amount FROM invoices WHERE id='ci1'")).rows[0].paid_amount), 40000, "درخواست چیزی را تغییر نمی‌دهد");
  assert.equal((await S.call("POST", "/api/integrity/corrections", { scope: ["invoices"], reason: "مانده فاکتور ci1 با پرداخت‌ها نمی‌خواند" })).status, 409, "درخواست تکراری");
  assert.equal((await S.call("POST", `/api/integrity/corrections/${rq.data.id}/approve`, {})).status, 403, "کارمند تأیید نمی‌کند");
  assert.equal((await S2.call("GET", "/api/integrity/corrections")).data.length, 0, "کارمند دیگر درخواست همکارش را نمی‌بیند");
  assert.equal((await S.call("GET", "/api/integrity/corrections")).data.length, 1);
  // رد نیازمند دلیل
  assert.equal((await M.call("POST", `/api/integrity/corrections/${rq.data.id}/reject`, {})).status, 422);
  // تأیید → اجرا؛ مانده درست می‌شود
  const ap = await M.call("POST", `/api/integrity/corrections/${rq.data.id}/approve`, { note: "بررسی شد" }); assert.equal(ap.status, 200, JSON.stringify(ap.json));
  assert.equal(ap.data.status, "approved"); assert.equal(ap.data.decidedBy, M.id); assert.ok(ap.data.result.after);
  const inv = (await ctx.pool.query("SELECT paid_amount, remaining_amount, status FROM invoices WHERE id='ci1'")).rows[0]; assert.equal(inv.status, "unpaid"); assert.equal(Number(inv.remaining_amount), 100000);
  assert.equal((await M.call("POST", `/api/integrity/corrections/${rq.data.id}/approve`, {})).status, 409, "تصمیم تکراری");
  await assert.rejects(ctx.pool.query("UPDATE correction_requests SET status='pending', decided_at=NULL WHERE id=$1", [rq.data.id]), /تغییرناپذیر|correction_requests_guard/);
  await assert.rejects(ctx.pool.query("DELETE FROM correction_requests"), /financial_no_delete/);
  const a = (await O("GET", "/api/audit?limit=100")).data; assert.ok(a.some((x) => x.action === "integrity.correction.request") && a.some((x) => x.action === "integrity.correction.apply"));
  // دو نفره: مدیری که درخواست داده خودش تأیید نمی‌کند؛ مالک می‌تواند
  const r2 = await M.call("POST", "/api/integrity/corrections", { scope: ["accounts"], reason: "بازسازی مانده حساب‌ها" }); assert.equal(r2.status, 201);
  const self = await M.call("POST", `/api/integrity/corrections/${r2.data.id}/approve`, {}); assert.equal(self.status, 403); assert.equal(self.json.error.code, "self_approval");
  const rj = await O("POST", `/api/integrity/corrections/${r2.data.id}/reject`, { note: "فعلاً لازم نیست" }); assert.equal(rj.status, 200); assert.equal(rj.data.status, "rejected");
  assert.equal((await O("GET", "/api/integrity/corrections?status=pending")).data.length, 0);
  assert.equal((await O("GET", "/api/audit/verify")).data.ok, true);
});

test("BI: سری ماهانه، سود/هزینه، مشتریان غیرفعال، پیش‌بینی؛ فقط دارندگان report.bi", async () => {
  const ins = (id, date, total, cust = "c1") => ctx.pool.query("INSERT INTO invoices(cafe_id,id,number,customer_id,customer_name,date,subtotal,total_amount,status) VALUES ($1,$2,$2,$3,'x',$4,$5,$5,'paid')", [cafeId, id, cust, date, total]);
  await O("POST", "/api/customers", { id: "c2", firstName: "قدیمی" });
  const asOf = "2026-10-20", mons = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  for (const [i, m] of mons.entries()) { await ins(`bi${i}`, `${m}-10`, 1_000_000 + i * 100_000); }
  await ins("bic2", "2026-01-15", 5_000_000, "c2");                                                         // c2 آخرین خرید بیش از ۲۸۰ روز قبل، خارج از پنجرهٔ سری → غیرفعال
  await ins("bicur", "2026-10-05", 999_999);                                                                // ماه جاری (ناقص)
  await ctx.pool.query("INSERT INTO expenses(cafe_id,id,amount,date,category) VALUES ($1,'bie1',300000,'2026-09-12','x')", [cafeId]);
  assert.equal((await S.call("GET", `/api/bi/overview?asOf=${asOf}`)).status, 403);
  const r = await M.call("GET", `/api/bi/overview?asOf=${asOf}&months=8&inactiveDays=60`); assert.equal(r.status, 200, JSON.stringify(r.json));
  const d = r.data, sep = d.series.find((s) => s.month === "2026-09");
  assert.equal(sep.revenue, 1_500_000); assert.equal(sep.expenses, 300_000); assert.equal(sep.profit, 1_200_000);
  assert.equal(d.series.at(-1).month, "2026-10"); assert.equal(d.series.at(-1).partial, true);
  assert.equal(d.growth.month, "2026-09"); assert.equal(d.growth.revenuePct, Math.round(((1_500_000 - 1_400_000) / 1_400_000) * 1000) / 10);
  assert.ok(d.inactiveCustomers.items.some((x) => x.id === "c2" && x.totalSpent === 5_000_000 && x.daysSince > 200)); assert.ok(!d.inactiveCustomers.items.some((x) => x.id === "c1"));
  assert.equal(d.forecast.available, true); assert.equal(d.forecast.predictions.length, 3);
  assert.ok(d.forecast.predictions[0].value > 1_400_000, "روند صعودی ≈ ۱٫۶ میلیون");
  assert.equal((await M.call("GET", "/api/bi/overview?asOf=bad")).status, 422);
});

test("linearForecast: خط کامل، نقاط ناکافی، نویز و بازه", () => {
  const f = linearForecast([100, 200, 300, 400, 500], 2); assert.equal(f.available, true); assert.deepEqual(f.predictions.map((p) => p.value), [600, 700]); assert.equal(f.r2, 1); assert.equal(f.slopePerMonth, 100);
  assert.equal(linearForecast([1, 2, 3], 3).available, false);
  const n = linearForecast([100, 180, 330, 380, 520, 560], 1); assert.ok(n.r2 > 0.9 && n.r2 < 1 && n.predictions[0].low < n.predictions[0].value && n.predictions[0].high > n.predictions[0].value);
  assert.equal(linearForecast([500, 400, 300, 200, 100], 3).predictions.at(-1).value, 0, "هرگز منفی نمی‌شود");
});

test("shiftTotals: روی یک اتصال تراکنش کوئری‌ها پشت‌سرهم اجرا می‌شوند (نه هم‌زمان؛ pg@9 این را حذف می‌کند)", async () => {
  const { shiftTotals } = await import("../src/routes/shifts.js");
  const c = await ctx.pool.connect(); let inflight = 0, maxInflight = 0, n = 0; const orig = c.query.bind(c);
  c.query = (...a) => { inflight++; n++; maxInflight = Math.max(maxInflight, inflight); const r = orig(...a); Promise.resolve(r).finally(() => { inflight--; }).catch(() => {}); return r; };
  try { const t = await shiftTotals(c, cafeId, new Date(Date.now() - 864e5).toISOString(), new Date().toISOString()); assert.equal(typeof t.cashNet, "number"); }
  finally { c.query = orig; c.release(); }
  assert.equal(n, 4); assert.equal(maxInflight, 1, "کوئری‌ها هم‌زمان روی یک اتصال اجرا شده‌اند");
});
