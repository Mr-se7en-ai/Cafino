// یادداشت و یادآوری — صفحهٔ اصلی + هشدار سررسید (ReminderWatcher)
import React, { useEffect, useRef, useState } from "react";
import { toFA } from "../core/format.js";
import { BTN, INP } from "../core/constants.js";
import { JalaliPicker } from "../components/controls.jsx";
import { jalaliLabel } from "../domain/backup.js";
import { peekSearchFocus, clearSearchFocus } from "../domain/search.js";
import { disablePush, enablePush, pushState, pushUnavailableReason, sendTestPush } from "../../push/webPush.js";
import { todayIso } from "../core/jalali.js";
import { useDataSync } from "../domain/sales.jsx";
import { NOTE_COLORS, REPEATS, clearDoneReminders, completeReminder, deleteNote, deleteReminder, dueReminders, dueTs, filterNotes, getNotes, getReminders, markNotified, relativeLabel, reopenReminder, reminderState, saveNote, saveReminder, scheduledTs, snoozeReminder, snoozeToTomorrow, toggleNotePin, wasNotified } from "../domain/notes.js";

const colorOf = (k) => (NOTE_COLORS.find(([c]) => c === k) || NOTE_COLORS[0])[1];
const faRel = (ts) => relativeLabel(ts).replace(/\d+/g, (m) => toFA(m));
const lbl = { fontSize: 11, color: "var(--text-muted)" };
const timeFa = (t) => `\u2066${toFA(t || "09:00")}\u2069`; // جهت چپ‌به‌راست تا «۱۰:۰۰» به‌هم نریزد

const SNOOZES = [["10", "۱۰ دقیقه"], ["60", "یک ساعت"], ["tomorrow", "فردا ۹ صبح"]];
function SnoozeMenu({ onPick, testid }) {
  return (
    <select data-testid={testid} value="" onChange={(e) => { if (e.target.value) onPick(e.target.value); }} style={{ ...INP, marginTop: 0, width: "auto", padding: "4px 8px", fontSize: 12 }} aria-label="تعویق">
      <option value="">⏰ تعویق…</option>{SNOOZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>);
}
export const applySnooze = (id, v) => (v === "tomorrow" ? snoozeToTomorrow(id) : snoozeReminder(id, Number(v)));

// ───────── اعلان داخل برنامه + اعلان مرورگر (وقتی برنامه باز است) ─────────
export function ReminderWatcher({ isMobile, onOpen }) {
  const [, setTick] = useState(0);
  useDataSync(() => setTick((t) => t + 1));
  const dismissed = useRef(new Set());
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 15000); const vis = () => document.visibilityState === "visible" && setTick((t) => t + 1); document.addEventListener("visibilitychange", vis); return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); }; }, []);
  const due = dueReminders();
  const fresh = due.filter((r) => !dismissed.current.has(`${r.id}@${dueTs(r)}`));
  useEffect(() => {
    fresh.forEach((r) => {
      if (wasNotified(r)) return;
      markNotified(r);
      try { if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(`⏰ ${r.title}`, { body: r.note || `${r.date} ${r.time}`, tag: `cafino-${r.id}`, lang: "fa", dir: "rtl" }); } catch { /* ignore */ }
      try { const A = window.AudioContext || window.webkitAudioContext; if (A) { const c = new A(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.05; o.start(); o.stop(c.currentTime + 0.25); setTimeout(() => c.close(), 500); } } catch { /* مرورگر بدون اجازهٔ صدا */ }
    });
  });
  if (!fresh.length) return null;
  const shown = fresh.slice(0, 3);
  return (
    <div data-testid="reminder-toasts" role="alert" style={{ position: "fixed", left: 14, top: isMobile ? 70 : 74, zIndex: 195, width: "min(360px, calc(100vw - 28px))", display: "flex", flexDirection: "column", gap: 8 }}>
      {shown.map((r) => (
        <div key={r.id} data-testid="reminder-toast" style={{ background: "#78350f", color: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 12, padding: "10px 12px", boxShadow: "0 8px 24px #0009" }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>⏰ {r.title}</div>
          <div style={{ fontSize: 11, opacity: .85, marginTop: 2 }}>{jalaliLabel(r.date)} · {timeFa(r.time)} · {faRel(dueTs(r))}{r.note ? ` — ${r.note}` : ""}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button data-testid="toast-done" onClick={() => completeReminder(r.id)} style={{ ...BTN("#166534"), padding: "4px 10px", fontSize: 11 }}>✔ انجام شد</button>
            <button data-testid="toast-snooze" onClick={() => snoozeReminder(r.id, 10)} style={{ ...BTN("#92400e", "#fef3c7"), padding: "4px 10px", fontSize: 11 }}>۱۰ دقیقه بعد</button>
            <button data-testid="toast-seen" onClick={() => { dismissed.current.add(`${r.id}@${dueTs(r)}`); setTick((t) => t + 1); }} style={{ ...BTN("#fef3c7", "#78350f"), padding: "4px 10px", fontSize: 11 }}>دیدم</button>
            {onOpen && <button onClick={onOpen} style={{ background: "none", border: "none", color: "#fde68a", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>باز کردن ←</button>}
          </div>
        </div>))}
      {fresh.length > shown.length && <div style={{ background: "#78350f", color: "#fef3c7", borderRadius: 10, padding: "5px 10px", fontSize: 11, textAlign: "center" }}>و {toFA(fresh.length - shown.length)} یادآور دیگر…</div>}
    </div>);
}

// ───────── صفحهٔ یادداشت و یادآوری ─────────
const blankRem = () => ({ id: null, title: "", note: "", date: todayIso(), time: "09:00", repeat: "none" });
const blankNote = () => ({ id: null, title: "", body: "", color: "default", pinned: false });

function ReminderForm({ value, onChange, onSave, onCancel, err }) {
  return (
    <div data-testid="reminder-form" style={{ background: "var(--bg-card)", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--border)" }}>
      <label style={lbl}>چه چیزی را یادآوری کنم؟<input data-testid="rem-title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} placeholder="مثلاً: پیگیری چک آقای رضایی" style={{ ...INP, marginTop: 2 }} /></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}><div style={lbl}>تاریخ</div><JalaliPicker value={value.date} onChange={(d) => onChange({ ...value, date: d })} /></div>
        <label style={{ ...lbl, flex: "0 1 110px" }}>ساعت<input data-testid="rem-time" type="time" value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} style={{ ...INP, marginTop: 2, direction: "ltr" }} /></label>
        <label style={{ ...lbl, flex: "1 1 130px" }}>تکرار<select data-testid="rem-repeat" value={value.repeat} onChange={(e) => onChange({ ...value, repeat: e.target.value })} style={{ ...INP, marginTop: 2 }}>{REPEATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <label style={lbl}>توضیح (اختیاری)<input data-testid="rem-note" value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} style={{ ...INP, marginTop: 2 }} /></label>
      {err && <div style={{ fontSize: 12, color: "#f87171" }}>⚠️ {err}</div>}
      <div style={{ display: "flex", gap: 8 }}><button data-testid="rem-save" onClick={onSave} style={{ ...BTN("#2563eb"), flex: 1 }}>ذخیره یادآور</button><button onClick={onCancel} style={{ ...BTN("var(--border)", "var(--text-primary)"), flex: 1 }}>لغو</button></div>
    </div>);
}

// اعلان وقتی برنامه بسته است (Web Push). فقط وقتی مدیر نصب سرویس اعلان را در config.js تنظیم کرده فعال‌شدنی است.
const WHY = {
  guest: "در حالت مهمان اعلان پس‌زمینه فعال نمی‌شود.",
  unsupported: "این مرورگر از اعلان پس‌زمینه پشتیبانی نمی‌کند (روی آیفون ابتدا برنامه را به «صفحهٔ اصلی» اضافه کنید).",
  insecure: "اعلان پس‌زمینه فقط روی نشانی امن (HTTPS) کار می‌کند.",
  "no-service": "اعلان هنگام بسته‌بودن برنامه فعال نیست؛ برای راه‌اندازی، سرویس اعلان باید توسط مدیر نصب تنظیم شود.",
};
export function PushPanel() {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const why = pushUnavailableReason(), st = pushState();
  const refresh = () => setTick((t) => t + 1);
  const on = async () => { setBusy(true); setMsg(""); const r = await enablePush(); setBusy(false); setMsg(r.ok ? "" : r.reason === "denied" ? "اجازهٔ اعلان داده نشد. از تنظیمات مرورگر برای این سایت آن را فعال کنید." : r.reason === "service" ? "اتصال به سرویس اعلان برقرار نشد؛ کمی بعد دوباره تلاش کنید." : WHY[r.reason] || "فعال‌سازی انجام نشد."); refresh(); };
  const off = async () => { setBusy(true); await disablePush(); setBusy(false); setMsg(""); refresh(); };
  const test = async () => { setBusy(true); const r = await sendTestPush(); setBusy(false); setMsg(r.ok ? "اعلان آزمایشی فرستاده شد؛ چند ثانیه صبر کنید." : "ارسال آزمایشی ناموفق بود."); };
  const box = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 11, padding: "9px 13px", marginBottom: 12, fontSize: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
  if (why) return <div data-testid="push-panel" data-state="unavailable" style={{ ...box, color: "var(--text-muted)" }}>🔕 {WHY[why]}</div>;
  if (st.enabled && st.permission === "granted") {
    return (
      <div data-testid="push-panel" data-state="on" style={{ ...box, borderColor: "#16a34a66" }}>
        <span style={{ color: "#4ade80", fontWeight: 700 }}>🔔 اعلان پس‌زمینه فعال است</span>
        <span style={{ color: "var(--text-muted)" }}>{st.lastError ? `آخرین همگام‌سازی ناموفق بود (${st.lastError})` : st.lastSyncAt ? `${toFA(st.count || 0)} یادآور همگام شد` : "در حال همگام‌سازی…"}</span>
        <span style={{ flex: 1 }} />
        <button data-testid="push-test" disabled={busy} onClick={test} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "4px 10px", fontSize: 11 }}>اعلان آزمایشی</button>
        <button data-testid="push-off" disabled={busy} onClick={off} style={{ ...BTN("#450a0a", "#f87171"), padding: "4px 10px", fontSize: 11 }}>غیرفعال‌کردن</button>
        {msg && <div style={{ flexBasis: "100%", color: "var(--text-dim)" }}>{msg}</div>}
      </div>);
  }
  return (
    <div data-testid="push-panel" data-state="off" style={box}>
      <span style={{ color: "var(--text-secondary)" }}>🔕 برای دریافت یادآور وقتی برنامه بسته است، اعلان پس‌زمینه را فعال کنید.</span>
      <span style={{ flex: 1 }} />
      <button data-testid="push-on" disabled={busy} onClick={on} style={{ ...BTN("#2563eb"), padding: "5px 14px", fontSize: 12 }}>{busy ? "…" : "فعال‌کردن اعلان پس‌زمینه"}</button>
      {msg && <div data-testid="push-msg" style={{ flexBasis: "100%", color: "#fbbf24" }}>{msg}</div>}
    </div>);
}

function RemindersView({ prefill, clearPrefill }) {
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [perm, setPerm] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  useEffect(() => { if (prefill) { setForm({ ...blankRem(), ...prefill }); clearPrefill(); } }, [prefill]);  
  const now = Date.now(), list = getReminders();
  const state = (r) => reminderState(r, now);
  const open = list.filter((r) => r.status !== "done").sort((a, b) => dueTs(a) - dueTs(b));
  const dueList = open.filter((r) => state(r) === "due");
  const today = todayIso();
  const todayList = open.filter((r) => state(r) === "upcoming" && r.date === today);
  const later = open.filter((r) => state(r) === "upcoming" && r.date !== today);
  const done = list.filter((r) => r.status === "done").sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const save = () => { const r = saveReminder(form); if (!r.ok) { setErr(r.error); return; } setErr(""); setForm(null); };
  const askPerm = async () => { try { setPerm(await Notification.requestPermission()); } catch { /* ignore */ } };
  const row = (r) => {
    const st = state(r), isDone = r.status === "done";
    return (
      <div key={r.id} data-testid="reminder-row" data-state={isDone ? "done" : st} style={{ background: "var(--bg-card)", borderRadius: 11, padding: "10px 13px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderRight: `4px solid ${isDone ? "#4ade80" : st === "due" ? "#f87171" : "#60a5fa"}`, opacity: isDone ? 0.75 : 1 }}>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, textDecoration: isDone ? "line-through" : "none" }}>{r.title}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>🗓 {jalaliLabel(r.date)} · {timeFa(r.time)}{r.snoozeUntil && !isDone ? ` · تعویق تا ${timeFa(new Date(r.snoozeUntil).toTimeString().slice(0, 5))}` : ""}{r.repeat && r.repeat !== "none" ? ` · 🔁 ${REPEATS.find(([k]) => k === r.repeat)[1]}` : ""}</div>
          {r.note && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>📝 {r.note}</div>}
        </div>
        {!isDone && <span style={{ background: st === "due" ? "#450a0a" : "var(--bg-app)", color: st === "due" ? "#f87171" : "var(--text-muted)", borderRadius: 20, padding: "3px 11px", fontSize: 11, fontWeight: 700 }}>{faRel(dueTs(r))}</span>}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {!isDone ? <>
            <button data-testid="rem-done" onClick={() => completeReminder(r.id)} style={{ ...BTN("#166534"), padding: "5px 11px", fontSize: 12 }}>✔ انجام شد</button>
            <SnoozeMenu testid="rem-snooze" onPick={(v) => applySnooze(r.id, v)} />
            <button onClick={() => { setForm({ id: r.id, title: r.title, note: r.note, date: r.date, time: r.time, repeat: r.repeat }); setErr(""); }} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "5px 9px", fontSize: 12 }}>✏️</button>
          </> : <button onClick={() => reopenReminder(r.id)} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "5px 10px", fontSize: 12 }}>↩ بازگردانی</button>}
          <button data-testid="rem-del" onClick={() => deleteReminder(r.id)} style={{ ...BTN("#450a0a", "#f87171"), padding: "5px 9px", fontSize: 12 }}>🗑️</button>
        </div>
      </div>);
  };
  const section = (title, rows, color) => rows.length > 0 && <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6 }}>{title} ({toFA(rows.length)})</div><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map(row)}</div></div>;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {!form && <button data-testid="rem-new" onClick={() => { setForm(blankRem()); setErr(""); }} style={{ ...BTN("#16a34a"), padding: "7px 16px" }}>＋ یادآور جدید</button>}
        <span style={{ flex: 1 }} />
        {perm === "default" && <button data-testid="rem-perm" onClick={askPerm} style={{ ...BTN("var(--bg-card)", "var(--text-secondary)"), border: "1px solid var(--border)", padding: "6px 12px", fontSize: 12 }}>🔔 فعال‌کردن اعلان مرورگر</button>}
        {perm === "denied" && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>اعلان مرورگر مسدود است؛ یادآورها فقط داخل برنامه نشان داده می‌شوند.</span>}
        {done.length > 0 && <button onClick={clearDoneReminders} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 12px", fontSize: 12 }}>پاک‌کردن انجام‌شده‌ها</button>}
      </div>
      <PushPanel />
      {form && <ReminderForm value={form} onChange={setForm} onSave={save} onCancel={() => { setForm(null); setErr(""); }} err={err} />}
      {!open.length && !done.length && !form && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 28 }}>یادآوری ثبت نشده است. با «＋ یادآور جدید» شروع کنید؛ مثلاً پیگیری چک، تماس با مشتری یا تمدید سرویس.</div>}
      {section("⏰ سررسید شده", dueList, "#f87171")}
      {section("📅 امروز", todayList, "#fbbf24")}
      {section("🗓 بعداً", later, "#60a5fa")}
      {section("✅ انجام‌شده", done.slice(0, 20), "#4ade80")}
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.9, marginTop: 6 }}>وقتی برنامه باز است، سررسید یادآورها در پنجرهٔ بالای صفحه و زنگ اعلان‌ها نشان داده می‌شود. وقتی برنامه بسته است، فقط اگر «اعلان پس‌زمینه» (بالای همین صفحه) فعال باشد اعلان می‌رسد؛ در غیر این صورت یادآور در اولین باز کردن برنامه نشان داده می‌شود.</div>
    </div>);
}

function NotesView({ onRemind, autoNew }) {
  const [q, setQ] = useState("");
  const [form, setForm] = useState(() => (autoNew ? blankNote() : null));
  const [err, setErr] = useState("");
  const rows = filterNotes(getNotes(), q);
  const save = () => { const r = saveNote(form); if (!r.ok) { setErr(r.error); return; } setErr(""); setForm(null); };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {!form && <button data-testid="note-new" onClick={() => { setForm(blankNote()); setErr(""); }} style={{ ...BTN("#16a34a"), padding: "7px 16px" }}>＋ یادداشت جدید</button>}
        <input data-testid="note-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 جستجو در یادداشت‌ها" style={{ ...INP, marginTop: 0, flex: "1 1 180px", maxWidth: 320 }} />
      </div>
      {form && (
        <div data-testid="note-form" style={{ background: "var(--bg-card)", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--border)" }}>
          <input data-testid="note-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="عنوان (اختیاری)" style={INP} />
          <textarea data-testid="note-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} placeholder="متن یادداشت…" style={{ ...INP, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {NOTE_COLORS.map(([k, c]) => <button key={k} aria-label={`رنگ ${k}`} onClick={() => setForm({ ...form, color: k })} style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: form.color === k ? "3px solid #fff" : "2px solid transparent", cursor: "pointer", outline: form.color === k ? `2px solid ${c}` : "none" }} />)}
            <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5, ...{ marginRight: "auto" } }}><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />📌 سنجاق‌شده</label>
          </div>
          {err && <div style={{ fontSize: 12, color: "#f87171" }}>⚠️ {err}</div>}
          <div style={{ display: "flex", gap: 8 }}><button data-testid="note-save" onClick={save} style={{ ...BTN("#2563eb"), flex: 1 }}>ذخیره</button><button onClick={() => { setForm(null); setErr(""); }} style={{ ...BTN("var(--border)", "var(--text-primary)"), flex: 1 }}>لغو</button></div>
        </div>)}
      {!rows.length && !form && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 28 }}>{q ? "یادداشتی با این جستجو پیدا نشد." : "هنوز یادداشتی نیست. «＋ یادداشت جدید» را بزنید."}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
        {rows.map((n) => (
          <div key={n.id} data-testid="note-card" style={{ background: "var(--bg-card)", borderRadius: 12, padding: "12px 14px", borderTop: `4px solid ${colorOf(n.color)}`, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "flex-start" }}>
              <div style={{ fontSize: 14, fontWeight: 800, minWidth: 0, overflowWrap: "anywhere" }}>{n.pinned ? "📌 " : ""}{n.title || "بدون عنوان"}</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{jalaliLabel(new Date(n.updatedAt).toISOString().slice(0, 10))}</div>
            </div>
            {n.body && <div style={{ fontSize: 12.5, lineHeight: 1.9, color: "var(--text-secondary)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 180, overflow: "auto" }}>{n.body}</div>}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: "auto" }}>
              <button data-testid="note-pin" onClick={() => toggleNotePin(n.id)} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "4px 8px", fontSize: 11 }}>{n.pinned ? "برداشتن سنجاق" : "📌 سنجاق"}</button>
              <button data-testid="note-remind" onClick={() => onRemind({ title: n.title || n.body.slice(0, 60), note: n.title ? n.body.slice(0, 200) : "" })} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "4px 8px", fontSize: 11 }}>⏰ یادآور</button>
              <button onClick={() => { setForm({ ...n }); setErr(""); }} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "4px 8px", fontSize: 11 }}>✏️</button>
              <button data-testid="note-del" onClick={() => { if (window.confirm("این یادداشت حذف شود؟")) deleteNote(n.id); }} style={{ ...BTN("#450a0a", "#f87171"), padding: "4px 8px", fontSize: 11 }}>🗑️</button>
            </div>
          </div>))}
      </div>
    </div>);
}

export function NotesPage() {
  const [, setTick] = useState(0);
  useDataSync(() => setTick((t) => t + 1));
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 20000); return () => clearInterval(iv); }, []);
  const [focus0] = useState(() => peekSearchFocus("notes"));
  useEffect(() => { clearSearchFocus(); }, []);   // از نتیجهٔ جستجوی «کافیند» یا کار سریع
  const [tab, setTab] = useState(focus0 && (focus0.view === "notes" || focus0.kind === "new_note") ? "notes" : "reminders");
  const [prefill, setPrefill] = useState(focus0 && focus0.kind === "new_reminder" ? {} : null);
  const dueCount = dueReminders().length, pending = getReminders().filter((r) => r.status !== "done").length;
  const tb = (k, l) => <button key={k} data-testid={`notes-tab-${k}`} onClick={() => setTab(k)} style={{ ...BTN(tab === k ? "#2563eb" : "var(--bg-card)", tab === k ? "#fff" : "var(--text-secondary)"), padding: "8px 18px", fontSize: 13, border: `1px solid ${tab === k ? "#2563eb" : "var(--border)"}` }}>{l}</button>;
  return (
    <div data-testid="notes-page" style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {tb("reminders", `⏰ یادآورها${pending ? ` (${toFA(pending)})` : ""}`)}{tb("notes", "📝 یادداشت‌ها")}
        {dueCount > 0 && <span data-testid="due-count" style={{ alignSelf: "center", background: "#450a0a", color: "#f87171", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{toFA(dueCount)} سررسید شده</span>}
      </div>
      {tab === "reminders" ? <RemindersView prefill={prefill} clearPrefill={() => setPrefill(null)} /> : <NotesView autoNew={!!(focus0 && focus0.kind === "new_note")} onRemind={(p) => { setPrefill(p); setTab("reminders"); }} />}
    </div>);
}

// ───────── ویجت داشبورد: یادآورهای پیش‌رو + یادداشت‌های سنجاق‌شده + افزودن سریع ─────────
const QUICK_WHEN = [["1h", "۱ ساعت دیگر"], ["today18", "امروز ۱۸:۰۰"], ["tom9", "فردا ۹:۰۰"], ["week", "هفتهٔ بعد"]];
export function quickWhen(key, now = new Date()) {
  const d = new Date(now), p2 = (n) => String(n).padStart(2, "0");
  if (key === "1h") d.setHours(d.getHours() + 1);
  else if (key === "today18") { d.setHours(18, 0, 0, 0); if (d <= now) d.setDate(d.getDate() + 1); }
  else if (key === "tom9") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  else { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
  return { date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
}
export function NotesWidget({ onNavigate }) {
  const [, setTick] = useState(0);
  useDataSync(() => setTick((t) => t + 1));
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(iv); }, []);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("tom9");
  const [mode, setMode] = useState("reminder");
  const [err, setErr] = useState("");
  const now = Date.now();
  const open = getReminders().filter((r) => r.status !== "done").sort((a, b) => dueTs(a) - dueTs(b));
  const dueN = open.filter((r) => reminderState(r, now) === "due").length;
  const pinned = filterNotes(getNotes(), "").slice(0, 2);
  const add = () => {
    const r = mode === "note" ? saveNote({ title: "", body: title, color: "yellow", pinned: false }) : saveReminder({ title, ...quickWhen(when), repeat: "none" });
    if (!r.ok) { setErr(r.error); return; }
    setErr(""); setTitle("");
  };
  const chip = (k, l) => <button key={k} onClick={() => setMode(k)} style={{ background: mode === k ? "var(--accent,#2563eb)" : "var(--bg-app)", color: mode === k ? "#fff" : "var(--text-secondary)", border: "none", borderRadius: 14, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>;
  return (
    <div data-testid="notes-widget" style={{ background: "var(--bg-card)", borderRadius: 14, padding: "14px 16px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)" }}>⏰ یادداشت و یادآوری{dueN > 0 && <span style={{ marginRight: 6, background: "#450a0a", color: "#f87171", borderRadius: 12, padding: "1px 8px", fontSize: 11 }}>{toFA(dueN)} سررسید</span>}</div>
        {onNavigate && <button onClick={() => onNavigate("notes")} style={{ background: "transparent", border: "none", color: "var(--accent-light)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>همه ←</button>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>{chip("reminder", "⏰ یادآور")}{chip("note", "📝 یادداشت")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        <input data-testid="qw-title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={mode === "note" ? "یادداشت سریع…" : "یادآوری چه چیزی؟"} style={{ ...INP, marginTop: 0, flex: "1 1 140px", minWidth: 0, padding: "6px 9px", fontSize: 12 }} />
        {mode === "reminder" && <select data-testid="qw-when" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...INP, marginTop: 0, width: "auto", padding: "6px 8px", fontSize: 12 }}>{QUICK_WHEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
        <button data-testid="qw-add" onClick={add} style={{ ...BTN("#16a34a"), padding: "6px 14px", fontSize: 12 }}>＋</button>
      </div>
      {err && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 4 }}>⚠️ {err}</div>}
      <div style={{ marginTop: 8 }}>
        {open.length === 0 && pinned.length === 0 && <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12, padding: "12px 0" }}>یادآور یا یادداشتی نیست</div>}
        {open.slice(0, 4).map((r) => {
          const due = reminderState(r, now) === "due";
          return (
            <div key={r.id} data-testid="qw-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--bg-app)", borderRadius: 9, padding: "7px 10px", marginBottom: 5, borderRight: `3px solid ${due ? "#f87171" : "#60a5fa"}` }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div><div style={{ fontSize: 10, color: due ? "#f87171" : "var(--text-muted)" }}>{jalaliLabel(r.date)} · {timeFa(r.time)} · {faRel(dueTs(r))}</div></div>
              <button data-testid="qw-done" title="انجام شد" onClick={() => completeReminder(r.id)} style={{ ...BTN("#166534"), padding: "4px 9px", fontSize: 12 }}>✔</button>
            </div>);
        })}
        {open.length > 4 && <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>و {toFA(open.length - 4)} یادآور دیگر</div>}
        {pinned.map((n) => (
          <div key={n.id} data-testid="qw-note" style={{ background: "var(--bg-app)", borderRadius: 9, padding: "7px 10px", marginTop: 5, borderRight: `3px solid ${colorOf(n.color)}` }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{n.pinned ? "📌 " : ""}{n.title || "یادداشت"}</div>
            {n.body && <div style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
          </div>))}
      </div>
    </div>);
}
