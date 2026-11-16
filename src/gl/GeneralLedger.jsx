// گزارش «دفتر کل» + «مغایرت‌گیری» (۱.۸۲): دفتر هر حساب (نقد، کارتخوان، حساب بانکی…) با مانده جاری، و تطبیق با صورت‌حساب بانک/شمارش نقد.
import React, { useMemo, useState, useCallback } from "react";
import { BTN, INP, TX_KEY } from "../app/core/constants.js";
import { fmtM, toFA, getCurrencyUnit, currencyLabel } from "../app/core/format.js";
import { JalaliPicker } from "../app/components/controls.jsx";
import { useDataSync, lsRead, lsWrite, PAY_METHODS, uid } from "../app/domain/sales.jsx";
import { logActivity } from "../app/core/activity.js";
import { currentActor } from "../app/core/identity.js";
import { GL_RECON_KEY, glAccountsFrom, buildLines, ledgerFor, summarizeAll, parseStatement, autoMatch, reconSummary, parseAmountInput, normRecon, markReconciled, unmark, addSession, reconState, toCsv, faDate } from "./glCore.js";

const card = { background: "var(--bg-card)", borderRadius: 12, padding: 16 };
const cell = { padding: "7px 8px", fontSize: 12, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const th = { ...cell, fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textAlign: "right", position: "sticky", top: 0, background: "var(--bg-card)" };
const num = (n) => toFA(Number(n || 0).toLocaleString("en-US"));
function download(name, text) { try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); } catch { /* ignore */ } }
const Stat = ({ l, v, c, t }) => <div data-testid={t} style={{ background: "var(--bg-app)", borderRadius: 10, padding: "10px 12px", minWidth: 120, flex: "1 1 120px" }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l}</div><div style={{ fontSize: 15, fontWeight: 800, color: c || "var(--text-primary)", marginTop: 2 }}>{v}</div></div>;
const sev = (n) => (n > 0 ? "#34d399" : n < 0 ? "#f87171" : "var(--text-primary)");

function useGl() {
  const [tick, setTick] = useState(0); useDataSync(() => setTick((t) => t + 1));
  const [recon, setRecon] = useState(() => normRecon(lsRead(GL_RECON_KEY, null)));
  const save = useCallback((next) => { setRecon(next); lsWrite(GL_RECON_KEY, next); }, []);
  const lines = useMemo(() => buildLines(lsRead(TX_KEY, [])), [tick]);  
  const accounts = useMemo(() => glAccountsFrom(PAY_METHODS), [tick]);  
  return { lines, accounts, recon, save };
}

function Filters({ accounts, account, setAccount, from, setFrom, to, setTo, allowAll }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>حساب</div>
        <select data-testid="gl-account" value={account} onChange={(e) => setAccount(e.target.value)} style={{ ...INP, marginTop: 0, minWidth: 190 }}>
          {allowAll && <option value="all">همهٔ حساب‌ها (خلاصه)</option>}
          {accounts.filter((a) => allowAll || a.reconcilable).map((a) => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}
        </select></div>
      <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>از تاریخ</div><JalaliPicker value={from} onChange={setFrom} placeholder="ابتدا…" /></div>
      <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>تا تاریخ</div><JalaliPicker value={to} onChange={setTo} placeholder="انتها…" /></div>
      {(from || to) && <button onClick={() => { setFrom(""); setTo(""); }} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "8px 12px", fontSize: 12 }}>پاک‌کردن بازه</button>}
    </div>
  );
}

const MARK = { ok: ["✓", "#34d399", "مغایرت‌گیری شده"], changed: ["⚠", "#fbbf24", "پس از مغایرت‌گیری، مبلغ یا تاریخ این تراکنش تغییر کرده است"], none: ["", "", ""] };

function LedgerView({ gl, account, setAccount, from, setFrom, to, setTo }) {
  const [q, setQ] = useState(""), [limit, setLimit] = useState(100);
  const unit = currencyLabel();
  const opening = (acc) => Number(gl.recon.openings[acc] || 0);
  const sum = useMemo(() => summarizeAll(gl.lines, gl.accounts, { from, to, openings: gl.recon.openings }), [gl.lines, gl.accounts, from, to, gl.recon.openings]);
  const one = account !== "all" ? ledgerFor(gl.lines, account, { from, to, opening: opening(account), q }) : null;
  const acc = gl.accounts.find((a) => a.key === account);
  const exportCsv = () => {
    if (!one) { download("cafino-gl-summary.csv", toCsv(sum.map((s) => [s.account.label, s.opening, s.debit, s.credit, s.closing, s.count]), ["حساب", "مانده اول دوره", "بدهکار (ورود)", "بستانکار (خروج)", "مانده پایان", "تعداد ردیف"])); return; }
    download(`cafino-gl-${account}.csv`, toCsv(one.rows.map((r) => [faDate(r.date), r.category, r.desc, r.ref, r.debit, r.credit, r.balance, reconState(gl.recon, r) === "none" ? "" : "مغایرت‌گیری"]), ["تاریخ", "دسته", "شرح", "مرجع", "بدهکار (ورود)", "بستانکار (خروج)", "مانده", "وضعیت"]));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <Filters accounts={gl.accounts} account={account} setAccount={setAccount} from={from} setFrom={setFrom} to={to} setTo={setTo} allowAll />
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.9 }}>بدهکار = ورود پول (درآمد و دریافت‌ها)، بستانکار = خروج پول (هزینه‌ها). هزینه‌های خودکار مصرف مواد و فروش نسیه در دفتر نمی‌آیند؛ فقط جابه‌جایی واقعی وجه. مبالغ به {unit}.</div>
      </div>
      {!one && <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><b style={{ fontSize: 14 }}>📒 خلاصهٔ حساب‌ها</b><button data-testid="gl-csv" onClick={exportCsv} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>⬇ CSV</button></div>
        <table data-testid="gl-summary" style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead><tr>{["حساب", "مانده اول دوره", "بدهکار", "بستانکار", "مانده پایان", "ردیف"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{sum.map((s) => <tr key={s.account.key} data-testid="gl-sum-row" onClick={() => setAccount(s.account.key)} style={{ cursor: "pointer" }}>
            <td style={cell}>{s.account.icon} {s.account.label}</td><td style={cell}>{fmtM(s.opening)}</td><td style={{ ...cell, color: "#34d399" }}>{fmtM(s.debit)}</td><td style={{ ...cell, color: "#f87171" }}>{fmtM(s.credit)}</td><td style={{ ...cell, fontWeight: 700, color: sev(s.closing) }}>{fmtM(s.closing)}</td><td style={cell}>{toFA(s.count)}</td></tr>)}</tbody>
        </table>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>برای دیدن ریز دفتر، روی یک حساب بزنید.</div>
      </div>}
      {one && <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stat t="gl-opening" l="مانده اول دوره" v={fmtM(one.opening)} /><Stat t="gl-debit" l="جمع بدهکار (ورود)" v={fmtM(one.debit)} c="#34d399" /><Stat t="gl-credit" l="جمع بستانکار (خروج)" v={fmtM(one.credit)} c="#f87171" /><Stat t="gl-closing" l="مانده پایان" v={fmtM(one.closing)} c={sev(one.closing)} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input data-testid="gl-q" value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} placeholder="جستجو در شرح، دسته، مرجع یا مبلغ…" style={{ ...INP, marginTop: 0, flex: "1 1 200px" }} />
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>مانده اولیهٔ دستی ({unit}):
            <input data-testid="gl-open-input" defaultValue={gl.recon.openings[account] ? String(getCurrencyUnit() === "toman" ? gl.recon.openings[account] / 10 : gl.recon.openings[account]) : ""} key={account} onBlur={(e) => { const v = parseAmountInput(e.target.value, getCurrencyUnit()); const o = { ...gl.recon.openings }; if (v) o[account] = v; else delete o[account]; if (JSON.stringify(o) !== JSON.stringify(gl.recon.openings)) { gl.save({ ...gl.recon, openings: o }); logActivity("مانده اولیهٔ دفتر کل", `${acc?.label || account}: ${v ? fmtM(v) : "حذف شد"}`); } }} inputMode="numeric" style={{ ...INP, marginTop: 0, width: 130 }} />
          </label>
          <button data-testid="gl-csv" onClick={exportCsv} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "8px 14px", fontSize: 12 }}>⬇ CSV</button>
        </div>
        {one.rows.length === 0 ? <div data-testid="gl-empty" style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: 18 }}>ردیفی در این بازه نیست.</div> :
          <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
            <table data-testid="gl-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr>{["تاریخ", "شرح", "دسته", "بدهکار", "بستانکار", "مانده", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
              <tbody>{one.rows.slice(0, limit).map((r) => { const st = reconState(gl.recon, r), m = MARK[st]; return (
                <tr key={r.key} data-testid="gl-row" data-state={st}>
                  <td style={cell}>{faDate(r.date)}</td><td style={{ ...cell, whiteSpace: "normal", minWidth: 160 }}>{r.desc || "—"}</td><td style={cell}>{r.category}</td>
                  <td style={{ ...cell, color: "#34d399" }}>{r.debit ? fmtM(r.debit) : ""}</td><td style={{ ...cell, color: "#f87171" }}>{r.credit ? fmtM(r.credit) : ""}</td><td style={{ ...cell, fontWeight: 700 }}>{fmtM(r.balance)}</td>
                  <td style={{ ...cell, color: m[1] }} title={m[2]}>{m[0]}</td></tr>); })}</tbody>
            </table>
            {one.rows.length > limit && <div style={{ textAlign: "center", padding: 10 }}><button onClick={() => setLimit((l) => l + 200)} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>نمایش بیشتر ({toFA(one.rows.length - limit)} ردیف دیگر)</button></div>}
          </div>}
      </div>}
    </div>
  );
}

const HELP = `هر خط یک ردیف صورت‌حساب. مثال‌ها:
۱۴۰۵/۰۷/۰۹   ۱,۰۰۰,۰۰۰   واریز پایانه        (مبلغ مثبت = واریز، منفی = برداشت)
۱۴۰۵/۰۷/۱۰   -۳۰۰,۰۰۰   اجاره
یا ستونی (از Excel کپی کنید): تاریخ ⇥ شرح ⇥ برداشت ⇥ واریز`;

function ReconView({ gl, account, setAccount, from, setFrom, to, setTo }) {
  const unit = getCurrencyUnit();
  const [closing, setClosing] = useState(""), [text, setText] = useState(""), [win, setWin] = useState(2), [res, setRes] = useState(null), [pick, setPick] = useState({ b: null, s: null }), [msg, setMsg] = useState(null);
  const acc = gl.accounts.find((a) => a.key === account);
  const led = ledgerFor(gl.lines, account, { from, to, opening: gl.recon.openings[account] || 0 });
  const pending = led.rows.filter((r) => reconState(gl.recon, r) === "none");
  const doneCount = led.rows.length - pending.length;
  const run = () => {
    const parsed = parseStatement(text, { unit });
    const m = autoMatch(pending, parsed.rows, { dayWindow: win });
    setRes({ stmt: parsed.rows, errors: parsed.errors, pairs: m.pairs }); setPick({ b: null, s: null }); setMsg(null);
  };
  const stmtById = useMemo(() => new Map((res?.stmt || []).map((s) => [s.id, s])), [res]);
  const matchedB = new Set((res?.pairs || []).map((p) => p.lineKey)), matchedS = new Set((res?.pairs || []).map((p) => p.stmtId));
  const unB = pending.filter((l) => !matchedB.has(l.key)), unS = (res?.stmt || []).filter((s) => !matchedS.has(s.id));
  const stmtClosing = parseAmountInput(closing, unit);
  const sum = reconSummary({ bookClosing: led.closing, stmtClosing, unmatchedBook: unB, unmatchedStmt: unS });
  const manual = () => {
    const b = pending.find((l) => l.key === pick.b), s = stmtById.get(pick.s);
    if (!b || !s) return;
    if (b.net !== s.amount) { setMsg({ k: "warn", t: "مبلغ دو ردیف یکی نیست؛ تطبیق دستی فقط برای هم‌مبلغ‌هاست. اگر اختلافِ کارمزد یا خطای ثبت است، اول تراکنش را اصلاح یا ثبت کنید." }); return; }
    setRes((r) => ({ ...r, pairs: [...r.pairs, { lineKey: b.key, stmtId: s.id, dayDiff: Math.abs((Date.parse(b.date) - Date.parse(s.date)) / 864e5), mode: "manual" }] })); setPick({ b: null, s: null }); setMsg(null);
  };
  const unpair = (key) => setRes((r) => ({ ...r, pairs: r.pairs.filter((p) => p.lineKey !== key) }));
  const commit = () => {
    if (!res || !res.pairs.length) { setMsg({ k: "warn", t: "هنوز ردیفی تطبیق نخورده است." }); return; }
    const at = Date.now(), by = currentActor().name || currentActor().email || "", id = uid();
    const byKey = new Map(pending.map((l) => [l.key, l])), lines = res.pairs.map((p) => byKey.get(p.lineKey)).filter(Boolean);
    const modes = Object.fromEntries(res.pairs.map((p) => [p.lineKey, p.mode]));
    let next = markReconciled(gl.recon, lines, { at, by, session: id, modes });
    next = addSession(next, { id, at, by, account, accountLabel: acc?.label || account, from, to, bookClosing: sum.bookClosing, stmtClosing: sum.stmtClosing, diff: sum.diff, unexplained: sum.unexplained, matched: lines.length, unmatchedBook: unB.length, unmatchedStmt: unS.length });
    gl.save(next);
    logActivity("مغایرت‌گیری دفتر کل", `${acc?.label || account} — ${toFA(lines.length)} ردیف تطبیق، ${sum.balanced === null ? "بدون مانده صورت‌حساب" : sum.balanced ? "بدون اختلاف توضیح‌نشده" : `اختلاف توضیح‌نشده ${fmtM(Math.abs(sum.unexplained))}`}`);
    setRes(null); setText(""); setClosing(""); setMsg({ k: "ok", t: `${toFA(lines.length)} ردیف مغایرت‌گیری و ثبت شد.` });
  };
  const sessions = gl.recon.sessions.filter((s) => s.account === account).slice(0, 8);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <Filters accounts={gl.accounts} account={account} setAccount={setAccount} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stat t="rc-book" l="مانده دفتر (پایان بازه)" v={fmtM(led.closing)} /><Stat l="ردیف‌های بازه" v={toFA(led.count)} /><Stat t="rc-pending" l="هنوز مغایرت‌گیری‌نشده" v={toFA(pending.length)} c={pending.length ? "#fbbf24" : "#34d399"} /><Stat l="مغایرت‌گیری‌شده" v={toFA(doneCount)} c="#34d399" />
        </div>
      </div>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ fontSize: 14 }}>🔍 صورت‌حساب بانک / شمارش نقد</b>
        <label style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>مانده پایانِ طبق صورت‌حساب بانک یا شمارش نقد ({currencyLabel()}):
          <input data-testid="rc-closing" value={closing} onChange={(e) => setClosing(e.target.value)} inputMode="numeric" placeholder="مثلاً ۱۱,۰۰۰,۰۰۰" style={{ ...INP, marginTop: 0, width: 170 }} /></label>
        <textarea data-testid="rc-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={HELP} rows={6} spellCheck={false} style={{ ...INP, marginTop: 0, fontFamily: "monospace", fontSize: 12, direction: "ltr", textAlign: "left", resize: "vertical" }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12 }}>اختلاف روزِ مجاز: <select value={win} onChange={(e) => setWin(+e.target.value)} style={{ ...INP, marginTop: 0, width: 90 }}>{[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{toFA(d)} روز</option>)}</select></label>
          <button data-testid="rc-run" onClick={run} disabled={!text.trim() && closing === ""} style={{ ...BTN("#2563eb"), padding: "9px 18px", fontSize: 13, opacity: !text.trim() && closing === "" ? 0.5 : 1 }}>تحلیل و تطبیق خودکار</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.9, whiteSpace: "pre-line" }}>{HELP}{"\n"}فقط ردیف‌هایی که هنوز مغایرت‌گیری نشده‌اند تطبیق داده می‌شوند. اگر فقط مانده را وارد کنید (مثلاً شمارش نقد)، اختلاف کل نمایش داده می‌شود.</div>
      </div>

      {res && <div data-testid="rc-result" style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stat t="rc-matched" l="تطبیق‌خورده" v={toFA(res.pairs.length)} c="#34d399" /><Stat t="rc-unb" l="فقط در دفتر" v={toFA(unB.length)} c={unB.length ? "#fbbf24" : undefined} /><Stat t="rc-uns" l="فقط در صورت‌حساب" v={toFA(unS.length)} c={unS.length ? "#fbbf24" : undefined} />
          {sum.diff !== null && <Stat t="rc-diff" l="اختلاف مانده (بانک − دفتر)" v={fmtM(sum.diff)} c={sev(-Math.abs(sum.diff))} />}
          {sum.unexplained !== null && <Stat t="rc-unexplained" l="اختلاف توضیح‌نشده" v={sum.balanced ? "۰ ✓" : fmtM(sum.unexplained)} c={sum.balanced ? "#34d399" : "#f87171"} />}
        </div>
        {sum.balanced === false && <div data-testid="rc-warn" style={{ background: "#7f1d1d33", color: "#fca5a5", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.9 }}>بعد از کنار گذاشتنِ ردیف‌های تطبیق‌نخورده، هنوز {fmtM(Math.abs(sum.unexplained))} اختلاف می‌ماند. معمولاً یعنی مانده اول دورهٔ دفتر و بانک یکی نیست (مانده اولیه را بالا در «دفتر کل» تنظیم کنید)، بازهٔ تاریخ با صورت‌حساب نمی‌خواند، یا ردیفی از صورت‌حساب جا افتاده است.</div>}
        {sum.balanced === true && <div data-testid="rc-ok" style={{ background: "#14532d33", color: "#4ade80", borderRadius: 10, padding: "9px 12px", fontSize: 12.5 }}>همهٔ اختلاف با ردیف‌های تطبیق‌نخورده توضیح داده شد.</div>}
        {res.errors.length > 0 && <div data-testid="rc-errors" style={{ fontSize: 12, color: "#fbbf24", lineHeight: 1.9 }}>{toFA(res.errors.length)} خط خوانده نشد: {res.errors.slice(0, 5).map((e) => `خط ${toFA(e.line)} (${e.reason})`).join("، ")}{res.errors.length > 5 ? "…" : ""}</div>}
        {msg && <div style={{ fontSize: 12.5, color: msg.k === "warn" ? "#fbbf24" : "#4ade80" }}>{msg.t}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
          <div><div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>فقط در دفتر (در بانک نیست)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 260, overflowY: "auto" }}>
              {unB.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>—</div>}
              {unB.map((l) => <button key={l.key} data-testid="rc-unb-row" onClick={() => setPick((p) => ({ ...p, b: p.b === l.key ? null : l.key }))} style={{ textAlign: "right", background: pick.b === l.key ? "#2563eb33" : "var(--bg-app)", border: `1px solid ${pick.b === l.key ? "#2563eb" : "transparent"}`, borderRadius: 9, padding: "7px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--text-primary)" }}>{faDate(l.date)} · <b style={{ color: sev(l.net) }}>{fmtM(l.net)}</b> · {l.desc || l.category || "—"}</button>)}
            </div></div>
          <div><div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>فقط در صورت‌حساب (در دفتر نیست)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 260, overflowY: "auto" }}>
              {unS.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>—</div>}
              {unS.map((s) => <button key={s.id} data-testid="rc-uns-row" onClick={() => setPick((p) => ({ ...p, s: p.s === s.id ? null : s.id }))} style={{ textAlign: "right", background: pick.s === s.id ? "#2563eb33" : "var(--bg-app)", border: `1px solid ${pick.s === s.id ? "#2563eb" : "transparent"}`, borderRadius: 9, padding: "7px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--text-primary)" }}>{faDate(s.date)} · <b style={{ color: sev(s.amount) }}>{fmtM(s.amount)}</b> · {s.desc || "—"}</button>)}
            </div></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button data-testid="rc-manual" onClick={manual} disabled={!pick.b || !pick.s} style={{ ...BTN("var(--border)", "var(--text-primary)"), padding: "8px 14px", fontSize: 12, opacity: pick.b && pick.s ? 1 : 0.5 }}>تطبیق دستیِ دو ردیف انتخاب‌شده</button>
          <span style={{ flex: 1 }} />
          <button data-testid="rc-commit" onClick={commit} style={{ ...BTN("#16a34a"), padding: "9px 18px", fontSize: 13 }}>✓ ثبت مغایرت‌گیری ({toFA(res.pairs.length)} ردیف)</button>
        </div>
        {res.pairs.length > 0 && <details><summary style={{ fontSize: 12.5, cursor: "pointer" }}>ردیف‌های تطبیق‌خورده ({toFA(res.pairs.length)})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 220, overflowY: "auto" }}>{res.pairs.map((p) => { const l = led.rows.find((r) => r.key === p.lineKey), s = stmtById.get(p.stmtId); return l && s ? (
            <div key={p.lineKey} data-testid="rc-pair" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, background: "var(--bg-app)", borderRadius: 8, padding: "6px 10px", flexWrap: "wrap" }}>
              <span style={{ color: "#34d399" }}>✓</span><span>{faDate(l.date)} ↔ {faDate(s.date)}{p.dayDiff ? ` (${toFA(p.dayDiff)} روز اختلاف)` : ""}</span><b style={{ color: sev(l.net) }}>{fmtM(l.net)}</b><span style={{ color: "var(--text-muted)" }}>{l.desc || l.category}</span><span style={{ flex: 1 }} /><button onClick={() => unpair(p.lineKey)} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11 }}>جدا کردن</button></div>) : null; })}</div></details>}
      </div>}
      {!res && msg && <div style={{ fontSize: 12.5, color: msg.k === "warn" ? "#fbbf24" : "#4ade80" }} data-testid="rc-msg">{msg.t}</div>}

      {doneCount > 0 && <div style={{ ...card, fontSize: 12.5 }}>
        <b>ردیف‌های مغایرت‌گیری‌شده در این بازه: {toFA(doneCount)}</b>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{led.rows.filter((r) => reconState(gl.recon, r) !== "none").slice(0, 30).map((r) => { const st = reconState(gl.recon, r); return <span key={r.key} data-testid="rc-done-row" style={{ background: "var(--bg-app)", borderRadius: 8, padding: "4px 9px", fontSize: 11.5 }}>{MARK[st][0]} {faDate(r.date)} · {fmtM(r.net)}<button title="برداشتن علامت" onClick={() => { gl.save(unmark(gl.recon, r.key)); logActivity("برداشتن علامت مغایرت‌گیری", `${acc?.label || account} — ${faDate(r.date)} ${fmtM(r.net)}`); }} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", marginInlineStart: 4 }}>×</button></span>; })}</div></div>}
      {sessions.length > 0 && <div data-testid="rc-sessions" style={{ ...card, fontSize: 12.5 }}>
        <b>تاریخچهٔ مغایرت‌گیری این حساب</b>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>{sessions.map((s) => <div key={s.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", background: "var(--bg-app)", borderRadius: 8, padding: "6px 10px" }}><span>{faDate(new Date(s.at).toISOString().slice(0, 10))}</span><span>{toFA(s.matched)} ردیف</span><span style={{ color: s.unexplained === 0 ? "#34d399" : s.unexplained == null ? "var(--text-muted)" : "#f87171" }}>{s.unexplained == null ? "بدون مانده بانک" : s.unexplained === 0 ? "بدون اختلاف توضیح‌نشده" : `اختلاف ${fmtM(Math.abs(s.unexplained))}`}</span><span style={{ color: "var(--text-muted)" }}>{s.by}</span></div>)}</div></div>}
    </div>
  );
}

export default function GeneralLedger() {
  const gl = useGl();
  const [view, setView] = useState("ledger"), [account, setAccount] = useState("all"), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const recAccount = gl.accounts.find((a) => a.key === account && a.reconcilable) ? account : (gl.accounts.find((a) => a.reconcilable)?.key || "cash");
  return (
    <div data-testid="gl-page" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[["ledger", "📒 دفتر کل"], ["recon", "🔍 مغایرت‌گیری"]].map(([k, l]) => <button key={k} data-testid={`gl-view-${k}`} onClick={() => setView(k)} style={{ ...BTN(view === k ? "#2563eb" : "var(--bg-card)", view === k ? "#fff" : "var(--text-secondary)"), padding: "8px 16px", fontSize: 12.5, border: view === k ? "none" : "1px solid var(--border)" }}>{l}</button>)}
      </div>
      {view === "ledger"
        ? <LedgerView gl={gl} account={account} setAccount={setAccount} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        : <ReconView key={recAccount} gl={gl} account={recAccount} setAccount={setAccount} from={from} setFrom={setFrom} to={to} setTo={setTo} />}
    </div>
  );
}
