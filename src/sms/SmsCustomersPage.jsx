// مشتریان ← «پیامک»: انتخاب مشتریان، نوشتن متن (با {نام})، ارسال با پنل ملی پیامکِ کافی‌نت و دیدن نتیجه/سابقه.
// ارسال روی سرور انجام می‌شود (شمارهٔ نامعتبر/تکراری رد می‌شود، هر پیام در سابقه ثبت می‌شود، ارسال دوباره با همان batchId تکراری نمی‌شود).
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { card, sub, Note, Pill, msgOf, smallBtn } from "../uploads/ui.jsx";
import { sms, newBatchId } from "./smsApi.js";
import { MAX_RECIPIENTS, MAX_TEXT, TEMPLATES, buildRecipients, customerName, messageStats, normalizeMobile } from "./smsLogic.js";

const SHOW_MAX = 200;
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } };

export default function SmsCustomersPage({ customers = [] }) {
  const connected = isApiConnected(), guest = isGuestMode();
  const [st, setSt] = useState(null), [err, setErr] = useState(""), [text, setText] = useState(""), [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set()), [busy, setBusy] = useState(false), [result, setResult] = useState(null), [history, setHistory] = useState(null);
  const batch = useRef(newBatchId());

  const loadHistory = useCallback(async () => { try { setHistory(await sms.messages({ limit: 30 })); } catch { setHistory(null); } }, []);
  useEffect(() => {
    if (!connected || guest) return;
    (async () => { try { setSt(await sms.status()); setErr(""); } catch (e) { setErr(msgOf(e)); } })();
    loadHistory();
  }, [connected, guest, loadHistory]);

  const all = useMemo(() => buildRecipients(customers), [customers]);
  const phoneOf = useMemo(() => new Map(all.recipients.map((r) => [r.ref, r.phone])), [all]);
  const rows = useMemo(() => {
    const term = String(q).trim().toLowerCase(), digits = normalizeMobile(q) || String(q).replace(/\D/g, "");
    return all.recipients.filter((r) => !term || r.name.toLowerCase().includes(term) || (digits.length >= 3 && r.phone.includes(digits)));
  }, [all, q]);
  const chosen = useMemo(() => all.recipients.filter((r) => sel.has(r.ref)), [all, sel]);
  const stats = messageStats(text, chosen.length);

  const toggle = (ref) => setSel((s) => { const n = new Set(s); if (n.has(ref)) n.delete(ref); else n.add(ref); return n; });
  const selectShown = () => setSel((s) => { const n = new Set(s); rows.slice(0, SHOW_MAX).forEach((r) => n.add(r.ref)); return n; });
  const clearSel = () => setSel(new Set());
  const changeText = (v) => { setText(v); batch.current = newBatchId(); setResult(null); };     // متن عوض شد → ارسال تازه است

  const problem = !st?.connected ? "پنل ملی پیامک متصل نیست" : !st.enabled ? "ارسال پیامک خاموش است" : !chosen.length ? "مشتری‌ای انتخاب نشده" : chosen.length > MAX_RECIPIENTS ? `حداکثر ${toFA(MAX_RECIPIENTS)} گیرنده در هر ارسال` : stats.empty ? "متن پیام خالی است" : stats.tooLong ? "متن بیش از حد طولانی است" : "";
  const send = async () => {
    if (problem || busy) return;
    if (!window.confirm(`این پیام برای ${toFA(chosen.length)} مشتری ارسال شود؟ (حدود ${toFA(stats.totalParts)} پیامک از اعتبار پنل شما کم می‌شود)`)) return;
    setBusy(true); setErr(""); setResult(null);
    try {
      const r = await sms.send({ text: text.trim(), recipients: chosen.map(({ ref, name, phone }) => ({ ref, name, phone })), batchId: batch.current });
      setResult(r); batch.current = newBatchId(); loadHistory();
      try { setSt(await sms.status()); } catch { /* ignore */ }
    } catch (e) { setErr(e?.code === "duplicate_batch" ? "این ارسال قبلاً انجام شده است؛ نتیجه را در «سابقهٔ ارسال» ببینید." : msgOf(e)); if (e?.code === "duplicate_batch") loadHistory(); }
    setBusy(false);
  };

  if (!connected || guest) return <div style={card} data-testid="sms-cust-offline"><Note>{guest ? "در حالت مهمان این بخش در دسترس نیست." : "ارسال پیامک از طریق سرور کافینو انجام می‌شود؛ ابتدا به سرور وصل شوید."}</Note></div>;

  return (
    <div data-testid="sms-customers" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {err && <Note kind="error" data-testid="sms-cust-error">{err}</Note>}
      {st && !st.connected && <Note kind="warn" data-testid="sms-cust-notconnected">پنل ملی پیامک هنوز متصل نشده است. از «تنظیمات ← اتصال ← پیامک» نام کاربری، رمز و خط ارسال را وارد کنید.</Note>}
      {st?.connected && !st.enabled && <Note kind="warn">ارسال پیامک خاموش است (تنظیمات ← اتصال ← پیامک).</Note>}

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>۱) انتخاب مشتریان</b>
          <Pill color="#60a5fa" data-testid="sms-cust-count">{toFA(chosen.length)} انتخاب‌شده از {toFA(all.recipients.length)} مشتری دارای شماره</Pill>
          {all.noPhone.length > 0 && <span style={sub}>{toFA(all.noPhone.length)} مشتری شمارهٔ معتبر ندارند</span>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input data-testid="sms-cust-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی نام یا شماره…" style={{ ...INP, width: 240 }} />
          <button type="button" onClick={selectShown} data-testid="sms-cust-all" style={smallBtn("var(--bg-app)", "var(--text-primary)", { border: "1px solid var(--border)" })}>انتخاب همهٔ نمایش‌داده‌شده</button>
          <button type="button" onClick={clearSel} style={smallBtn("var(--bg-app)", "var(--text-secondary)", { border: "1px solid var(--border)" })}>پاک کردن انتخاب</button>
        </div>
        <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          {rows.slice(0, SHOW_MAX).map((r) => (
            <label key={r.ref} data-testid={`sms-cust-row-${r.ref}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 12px", fontSize: 13, borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
              <input type="checkbox" checked={sel.has(r.ref)} onChange={() => toggle(r.ref)} />
              <span style={{ flex: 1 }}>{r.name || "بدون نام"}</span><span dir="ltr" style={sub}>{toFA(r.phone)}</span>
            </label>
          ))}
          {!rows.length && <div style={{ ...sub, padding: 14 }}>مشتری‌ای با شمارهٔ معتبر پیدا نشد.</div>}
        </div>
        {rows.length > SHOW_MAX && <div style={sub}>{toFA(SHOW_MAX)} مورد اول نمایش داده شد؛ برای دیدن بقیه جست‌وجو کنید.</div>}
      </div>

      <div style={card}>
        <b style={{ fontSize: 14 }}>۲) متن پیام</b>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={sub}>الگوهای آماده:</span>
          {TEMPLATES.map(([t, l]) => <button key={l} type="button" onClick={() => changeText(t)} style={smallBtn("var(--bg-app)", "var(--text-primary)", { border: "1px solid var(--border)" })}>{l}</button>)}
          <button type="button" onClick={() => changeText(`${text}${text && !/\s$/.test(text) ? " " : ""}{نام}`)} style={smallBtn("var(--bg-app)", "var(--accent-light)", { border: "1px dashed var(--accent-light)" })}>+ نام مشتری</button>
        </div>
        <textarea data-testid="sms-cust-text" value={text} onChange={(e) => changeText(e.target.value)} rows={5} placeholder="متن پیام… برای درج نام هر مشتری {نام} بنویسید" style={{ ...INP, resize: "vertical", lineHeight: 1.9 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", ...sub }} data-testid="sms-cust-stats">
          <span>{toFA(stats.len)} / {toFA(MAX_TEXT)} نویسه</span><span>· {toFA(stats.parts)} بخش برای هر مشتری</span>{chosen.length > 0 && <span>· جمعاً حدود {toFA(stats.totalParts)} پیامک</span>}
        </div>
        {stats.tooLong && <Note kind="error">متن از {toFA(MAX_TEXT)} نویسه بیشتر است.</Note>}
        {stats.hasLink && <Note kind="warn">ملی پیامک معمولاً پیام دارای لینک را رد می‌کند (خطای «لینک»)، مگر لینک مجاز و ثبت‌شده باشد.</Note>}
        {chosen.length > 1 && !/لغو\s*[۱1]{2}|لغو\s*۱۱/.test(text) && text.trim() && <Note>اگر پیام تبلیغاتی است، طبق مقررات اپراتورها «لغو ۱۱» را در انتهای متن بنویسید.</Note>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={send} disabled={!!problem || busy} data-testid="sms-cust-send" style={{ ...BTN("#16a34a"), padding: "10px 22px", opacity: problem || busy ? 0.55 : 1 }}>{busy ? "در حال ارسال… (چند لحظه صبر کنید)" : `ارسال به ${toFA(chosen.length)} مشتری`}</button>
          {problem && <span style={sub} data-testid="sms-cust-problem">{problem}</span>}
        </div>
      </div>

      {result && <div style={card} data-testid="sms-cust-result">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <b style={{ fontSize: 14 }}>نتیجهٔ ارسال</b>
          <Pill color="#34d399">{toFA(result.sent)} موفق</Pill>
          {result.failed > 0 && <Pill color="#f87171">{toFA(result.failed)} ناموفق</Pill>}
          {result.skipped?.length > 0 && <Pill color="#fbbf24">{toFA(result.skipped.length)} ردشده</Pill>}
        </div>
        {result.stopped && <Note kind="error">ارسال میانهٔ کار متوقف شد (اعتبار یا تنظیمات پنل مشکل دارد)؛ پیام‌های باقی‌مانده فرستاده نشدند.</Note>}
        {result.results?.filter((r) => r.status === "failed").slice(0, 20).map((r) => <div key={r.phone} style={{ fontSize: 12.5, color: "#f87171" }}>✗ {r.name || "—"} <span dir="ltr">{toFA(r.phone)}</span>: {r.error}</div>)}
        {result.skipped?.slice(0, 20).map((r, i) => <div key={i} style={{ fontSize: 12.5, color: "#fbbf24" }}>• {r.name || "—"} <span dir="ltr">{toFA(r.phone)}</span>: {r.reason}</div>)}
      </div>}

      <div style={card} data-testid="sms-cust-history">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ fontSize: 14 }}>سابقهٔ ارسال</b><button type="button" onClick={loadHistory} style={smallBtn("var(--bg-app)", "var(--text-secondary)", { border: "1px solid var(--border)" })}>تازه‌سازی</button></div>
        {history?.length ? <div style={{ maxHeight: 280, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {history.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 10, padding: "6px 2px", borderBottom: "1px solid var(--border)", fontSize: 12.5, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ color: m.status === "sent" ? "#34d399" : "#f87171" }}>{m.status === "sent" ? "✓" : "✗"}</span>
              <span>{m.name || "—"}</span><span dir="ltr" style={sub}>{toFA(m.phone)}</span><span style={{ ...sub, flex: 1, minWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.body}</span>
              <span style={sub}>{fmtTime(m.createdAt)}</span>{m.error && <span style={{ color: "#f87171" }}>{m.error}</span>}
            </div>
          ))}
        </div> : <div style={sub}>هنوز پیامکی ارسال نشده است.</div>}
      </div>
    </div>
  );
}
