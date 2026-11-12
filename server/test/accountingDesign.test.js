// اعتبارسنجی «طراحی» حسابداری پیشرفته: فایل پیشنهادی روی PostgreSQL واقعی اعمال می‌شود (در تراکنشِ برگشت‌داده‌شده — هیچ اثری باقی نمی‌ماند)
// و رفتارش با دادهٔ نمونه سنجیده می‌شود. همچنین تضمین می‌کند که این طراحی در پوشهٔ مهاجرت‌های اجرایی نیست.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { startDb, stopDb, makeApp } from "./helpers.js";

let ctx, cafe;
const SQL = fs.readFileSync(new URL("../design/accounting/001_chart_journal.proposed.sql", import.meta.url), "utf8");
before(async () => { ctx = await makeApp(await startDb()); cafe = (await ctx.pool.query("INSERT INTO organizations(name) VALUES ('o') RETURNING id")).rows[0].id; cafe = (await ctx.pool.query("INSERT INTO cafes(org_id,name) VALUES ($1,'c') RETURNING id", [cafe])).rows[0].id; });
after(async () => { await ctx?.app.close(); await ctx?.pool.end(); await stopDb(); });

test("طراحی در migrations نیست و به جدول‌های مالی فعلی تریگر/FK ندارد", () => {
  assert.ok(!fs.readdirSync(new URL("../migrations", import.meta.url)).some((f) => /account|journal|coa/i.test(f)));
  assert.ok(!/ON\s+(invoices|payments|ledger_entries|accounts)\b/i.test(SQL.replace(/--.*$/gm, "")), "نباید به جدول‌های مالی فعلی وصل باشد");
});

test("اعمال روی PostgreSQL، سند تراز/نامتوازن، معادلهٔ حسابداری، تراز آزمایشی، سود و زیان، جریان وجه نقد، تغییرناپذیری", async () => {
  const c = await ctx.pool.connect();
  try {
    await c.query("BEGIN"); await c.query(SQL);
    for (const [code, name, type, parent, cash] of [["1", "دارایی‌ها", "asset", null, false], ["1101", "صندوق", "asset", "1", true], ["1103", "دریافتنی", "asset", "1", false], ["2101", "پیش‌دریافت", "liability", null, false], ["3101", "سرمایه", "equity", null, false], ["4101", "درآمد فروش", "revenue", null, false], ["5101", "هزینهٔ چای", "expense", null, false]])
      await c.query("INSERT INTO coa_accounts(cafe_id,code,name,type,parent,is_cash) VALUES ($1,$2,$3,$4,$5,$6)", [cafe, code, name, type, parent, cash]);
    const post = async (id, date, lines) => { await c.query("SAVEPOINT s"); try { await c.query("SET CONSTRAINTS ALL DEFERRED"); await c.query("INSERT INTO journal_entries(cafe_id,id,entry_date) VALUES ($1,$2,$3)", [cafe, id, date]); for (const [i, [a, d, k]] of lines.entries()) await c.query("INSERT INTO journal_lines(cafe_id,entry_id,line_no,account,debit,credit) VALUES ($1,$2,$3,$4,$5,$6)", [cafe, id, i + 1, a, d, k]); await c.query("SET CONSTRAINTS ALL IMMEDIATE"); await c.query("RELEASE SAVEPOINT s"); } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); throw e; } };
    const rej = async (sql, params, re) => { await c.query("SAVEPOINT r"); try { await assert.rejects(c.query(sql, params), re); } finally { await c.query("ROLLBACK TO SAVEPOINT r"); } };
    await post("e0", "2026-01-01", [["1101", 5_000_000, 0], ["3101", 0, 5_000_000]]);          // سرمایهٔ اولیه
    await post("e1", "2026-01-10", [["1103", 1_000_000, 0], ["4101", 0, 1_000_000]]);          // فاکتور
    await post("e2", "2026-01-12", [["1101", 600_000, 0], ["1103", 0, 600_000]]);              // دریافت نقدی
    await post("e3", "2026-01-15", [["5101", 50_000, 0], ["1101", 0, 50_000]]);                // هزینه
    await assert.rejects(post("bad", "2026-01-16", [["1101", 100, 0], ["4101", 0, 99]]), /تراز نیست/);
    await assert.rejects(post("one", "2026-01-16", [["1101", 100, 0]]), /تراز نیست/);
    await rej("INSERT INTO journal_lines(cafe_id,entry_id,line_no,account,debit,credit) VALUES ($1,'e1',9,'1101',5,5)", [cafe], /check/);   // هر خط یک طرف
    const tb = (await c.query("SELECT code, debit::int d, credit::int c, balance::int b FROM v_trial_balance WHERE cafe_id=$1 ORDER BY code", [cafe])).rows;
    assert.equal(tb.reduce((a, r) => a + r.d, 0), tb.reduce((a, r) => a + r.c, 0), "جمع بدهکار = جمع بستانکار");
    assert.equal(tb.find((r) => r.code === "1101").b, 5_000_000 + 600_000 - 50_000);
    const is = (await c.query("SELECT type, SUM(amount)::int s FROM fn_income_statement($1,'2026-01-01','2026-01-31') GROUP BY type", [cafe])).rows, rev = is.find((r) => r.type === "revenue").s, exp = is.find((r) => r.type === "expense").s;
    assert.equal(rev - exp, 950_000, "سود خالص");
    const bs = (await c.query("SELECT section, SUM(amount)::int s FROM fn_balance_sheet($1,'2026-01-31') GROUP BY section", [cafe])).rows, S = Object.fromEntries(bs.map((r) => [r.section, r.s]));
    assert.equal(S.asset, S.liability === undefined ? S.equity : S.liability + S.equity, "دارایی = بدهی + حقوق صاحبان سرمایه (با سود انباشته)");
    assert.equal(S.asset, 5_000_000 + 600_000 - 50_000 + 400_000);
    const cf = (await c.query("SELECT counter_account a, inflow::int i, outflow::int o FROM fn_cash_flow($1,'2026-01-01','2026-01-31') ORDER BY 1", [cafe])).rows;
    assert.deepEqual(cf, [{ a: "1103", i: 600_000, o: 0 }, { a: "3101", i: 5_000_000, o: 0 }, { a: "5101", i: 0, o: 50_000 }]);
    // تغییرناپذیری و سند معکوس
    await rej("UPDATE journal_lines SET debit=1 WHERE entry_id='e1'", [], /journal_immutable/);
    await rej("DELETE FROM journal_entries WHERE id='e1'", [], /journal_immutable/);
    await post("e1r", "2026-01-20", [["4101", 1_000_000, 0], ["1103", 0, 1_000_000]]);          // معکوس فاکتور
    await c.query("UPDATE journal_entries SET status='reversed' WHERE id='e1'");
    const rev2 = (await c.query("SELECT COALESCE(SUM(amount),0)::int s FROM fn_income_statement($1,'2026-01-01','2026-01-31') WHERE type='revenue'", [cafe])).rows[0].s; assert.equal(rev2, 0);
  } finally { await c.query("ROLLBACK"); c.release(); }
  assert.equal((await ctx.pool.query("SELECT to_regclass('journal_entries') AS t")).rows[0].t, null, "هیچ اثری روی پایگاه‌داده باقی نمانده");
});
