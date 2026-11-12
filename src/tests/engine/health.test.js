// کنترل سلامت کسب‌وکار + تست‌های گارد (ثبت ID، setItem، رمز)
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fresh, item } from "./helpers.js";

let E;
beforeEach(() => { E = fresh(); });
const by = (r, id) => r.checks.find((c) => c.id === id);
const run = (o = {}) => E.runHealthCheck({ backupDays: 1, ...o });

test("سلامت: دادهٔ تمیز → همه سبز (بدون خطای بحرانی)", () => {
  E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: [{ method: "cash", amount: 100000 }] });
  const r = run();
  assert.equal(r.summary.bad, 0, JSON.stringify(r.checks.filter((c) => c.status === "bad")));
  assert.equal(by(r, "accounts").status, "ok");
  assert.equal(by(r, "stock").status, "ok");
  assert.equal(by(r, "audit").status, "ok");
  assert.equal(by(r, "unpaid").status, "ok");
  assert.equal(by(r, "backup").status, "ok");
});

test("سلامت: فاکتور پرداخت‌نشده شمرده می‌شود و بدهی بالای ۳۰ روز تشخیص داده می‌شود", () => {
  const r1 = E.createSale({ customerId: 2, items: [item({ price: 50000 })], payments: [] });
  E.createSale({ customerId: 1, items: [item({ price: 70000 })], payments: [{ method: "cash", amount: 20000 }] });
  let r = run();
  assert.equal(by(r, "unpaid").count, 2);
  assert.equal(by(r, "olddebt").status, "ok");
  const sales = E.lsRead("cafenet_sales", []);
  sales.find((s) => s.id === r1.sale.id).date = "2020-01-01";
  E.lsWrite("cafenet_sales", sales);
  r = run();
  assert.equal(by(r, "olddebt").count, 1); assert.equal(by(r, "olddebt").status, "warn");
});

test("سلامت: کالای زیر حداقل و موجودی منفی", () => {
  E.lsWrite("cafenet_inventory", [{ id: 1, name: "الف", qty: 2, minQty: 5, unit: "عدد" }, { id: 2, name: "ب", qty: 50, minQty: 5, unit: "عدد" }]);
  let r = run(); assert.equal(by(r, "lowstock").count, 1); assert.equal(by(r, "lowstock").status, "warn"); assert.equal(by(r, "stock").status, "ok");
  E.lsWrite("cafenet_inventory", [{ id: 1, name: "الف", qty: -3, minQty: 5 }]);
  r = run(); assert.equal(by(r, "stock").status, "bad");
});

test("سلامت: دستکاری داده‌ها (درآمد حذف‌شده، بدهی ناهماهنگ، مبلغ NaN) پیدا می‌شود", () => {
  const s = E.createSale({ customerId: 1, items: [item({ price: 100000 })], payments: [{ method: "cash", amount: 100000 }] }).sale;
  E.lsWrite("cafenet_tx3", E.lsRead("cafenet_tx3", []).filter((t) => String(t.saleId) !== String(s.id)));
  let r = run(); assert.equal(by(r, "accounts").status, "bad"); assert.ok(by(r, "accounts").items.some((x) => x.includes("درآمد")));
  const c = fresh();
  c.createSale({ customerId: 2, items: [item({ price: 100000 })], payments: [] });
  const led = c.lsRead("cafenet_ledger2", []); led[0].entries[0].amount = 1; c.lsWrite("cafenet_ledger2", led);
  r = run(); assert.equal(by(r, "accounts").status, "bad"); assert.ok(by(r, "accounts").items.some((x) => x.includes("بدهی دفتر حساب")));
  const d = fresh();
  d.lsWrite("cafenet_tx3", [{ id: "a", type: "income", amount: "NaN" }]);
  r = run(); assert.equal(by(r, "accounts").status, "bad");
});

test("سلامت: بکاپ — هرگز / قدیمی / تازه", () => {
  assert.equal(by(run({ backupDays: Infinity }), "backup").status, "bad");
  assert.equal(by(run({ backupDays: 10 }), "backup").status, "warn");
  assert.equal(by(run({ backupDays: 45 }), "backup").status, "bad");
  assert.equal(by(run({ backupDays: 2 }), "backup").status, "ok");
});

test("سلامت: همگام‌سازی — محلی / سالم / خطادار / صف", () => {
  assert.equal(by(run(), "sync").status, "info");
  const mk = (o) => run({ apiConnected: true, syncStats: { pending: 0, failed: 0, inflight: 0, total: 0, paused: null, reachable: true, online: true, ...o } });
  assert.equal(by(mk({}), "sync").status, "ok");
  assert.equal(by(mk({ failed: 2, total: 2 }), "sync").status, "bad");
  assert.equal(by(mk({ pending: 3, total: 3 }), "sync").status, "warn");
  assert.equal(by(mk({ pending: 3, total: 3 }), "pending").count, 3);
});

test("سلامت: دفتر حسابرسی دستکاری‌شده و عملیات بدون دلیل", () => {
  E.audit({ action: "stock_adjust", entityLabel: "کاغذ", reason: "" });
  E.audit({ action: "price_change", reason: "تورم" });
  let r = run(); assert.equal(by(r, "audit").status, "ok"); assert.equal(by(r, "noreason").count, 1);
  const s = JSON.parse(localStorage.getItem(E.AUDIT_KEY)); s.events[1].reason = "x"; localStorage.setItem(E.AUDIT_KEY, JSON.stringify(s));
  r = run(); assert.equal(by(r, "audit").status, "bad"); assert.equal(r.level, "bad");
});

test("سلامت: فقط‌خواندنی است (هیچ کلیدی تغییر نمی‌کند)", () => {
  E.createSale({ customerId: 2, items: [item({ price: 50000 })], payments: [] });
  const snap = () => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
  const before = snap(); run(); assert.equal(snap(), before);
});

test("ابطال/ویرایش/بخشودگی/بکاپ در Audit ثبت می‌شوند و داده‌ها پس از restore پاک نمی‌شوند", async () => {
  const s = E.createSale({ customerId: 2, items: [item({ price: 100000 })], payments: [] }).sale;
  E.receiveSalePayment(s.id, 10000, "free", undefined, "مشتری ثابت");
  E.reviseSale(s.id, { customerId: 2, items: [item({ price: 120000 })], payments: [] }, "اصلاح قیمت");
  E.cancelSale(s.id, "اشتباه در ثبت مشتری");
  const ev = E.getChainEvents();
  assert.deepEqual(ev.map((e) => e.action), ["payment_waive", "sale_revise", "invoice_void"]);
  assert.equal(ev[0].reason, "مشتری ثابت"); assert.equal(ev[1].after.total, 120000); assert.equal(ev[2].reason, "اشتباه در ثبت مشتری");
  assert.ok(ev.every((e) => e.entity.id !== "" || e.entity.label));
  const payload = await E.buildBackupPayload("full");
  E.restoreBackup(JSON.stringify(payload));
  assert.equal(E.getChainEvents().length, 3, "restore دفتر حسابرسی را پاک نمی‌کند");
  assert.equal(E.verifyAuditChain().ok, true);
});

test("تراکنش برگشت‌خورده (rollback) رویداد Audit باقی نمی‌گذارد", () => {
  const r = E.runTransaction("x", () => { E.audit({ action: "price_change", reason: "تست" }); throw new Error("boom"); });
  assert.equal(r.ok, false); assert.equal(r.rolledBack, true);
  assert.equal(E.getChainEvents().length, 0);
});

// ───────── گارد: باگ‌هایی که بازبینی ادعا کرده بود نباید برگردند ─────────
const walk = (d, out = []) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "tests" && f !== ".build") walk(p, out); } else if (/\.(js|jsx)$/.test(f)) out.push(p); } return out; };
const SRC = new URL("../../", import.meta.url).pathname;

test("گارد: هیچ localStorage.setItem بدون کلید (تک‌آرگومانی) در سورس نیست", () => {
  const bad = [];
  for (const f of walk(SRC)) { const t = readFileSync(f, "utf8"); for (const m of t.matchAll(/\.setItem\(([^)]*)\)/g)) { let depth = 0, commas = 0; for (const ch of m[1]) { if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--; else if (ch === "," && depth === 0) commas++; } if (commas < 1 && m[1].trim()) bad.push(`${f.replace(SRC, "")}: setItem(${m[1].slice(0, 40)})`); } }
  assert.deepEqual(bad, []);
});

test("گارد: saveUsers با کلید cafenet_users می‌نویسد", () => {
  const t = readFileSync(SRC + "services/auth/localAuth.js", "utf8");
  assert.match(t, /function saveUsers[^{]*\{[^}]*setItem\(USERS_KEY,/);
  assert.match(t, /USERS_KEY\s*=\s*["']cafenet_users["']/);
});

test("گارد: شناسهٔ موجودیت‌ها از Date.now()/Math.random() ساخته نمی‌شود (جز فهرست مجاز)", () => {
  const ALLOW = /(^|\/)(audit\/auditTrail|core\/ids|sync\/|push\/|diagnostics\/|app\/domain\/sales|tests\/)/;
  const bad = [];
  for (const f of walk(SRC)) { const rel = f.replace(SRC, ""); if (ALLOW.test(rel)) continue; const t = readFileSync(f, "utf8"); for (const m of t.matchAll(/\bid\s*:\s*[^,}\n]*(Date\.now\(\)|Math\.random\(\))[^,}\n]*/g)) bad.push(`${rel}: ${m[0].slice(0, 70)}`); }
  // فایل‌های مجاز فقط برای شناسهٔ رسانه/پیام موقت؛ هر مورد جدید باید آگاهانه به این فهرست اضافه شود
  const known = bad.filter((x) => !/ph_|msg|toast|tmp|photo|file|voice/i.test(x));
  assert.deepEqual(known, [], "شناسهٔ موجودیت باید با createId() ساخته شود");
});

test("گارد: createId/uid حتی با ده‌ها هزار فراخوانی پشت‌سرهم یکتا و صعودی است", () => {
  const set = new Set(); let prev = 0;
  for (let i = 0; i < 20000; i++) { const id = E.createId("rec"); assert.ok(id > prev); prev = id; set.add(id); }
  assert.equal(set.size, 20000);
  assert.ok(Number.isSafeInteger(prev), "شناسه عدد صحیح امن باقی می‌ماند");
});
