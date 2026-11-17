// بخش کافی‌نت مینی‌اپ: ورود با کد اتصال، خانه، سفارش‌ها، فایل‌ها، درخواست‌ها، حساب.
import React, { useEffect, useState } from "react";
import { faDigits, faNum, jalali, tomanText } from "./format.js";
import { Empty, ErrorBox, Icon, Skeleton, useAsync } from "./ui.jsx";
import { ChatBox, Items, PayBadge } from "./shop.jsx";

export const ORDER_STATUS = [["new", "سفارش جدید"], ["inprogress", "در حال انجام"], ["waiting_docs", "منتظر مدارک مشتری"], ["completed", "تکمیل شده"], ["delivered", "تحویل داده شده"]];
export const UPLOAD_STATUS = [["new", "جدید"], ["seen", "دیده شد"], ["printed", "چاپ شد"], ["done", "انجام شد"]];
const UP_KEYS = ["new", "seen", "printed", "done"];
export const REQ_LABEL = { new: "در انتظار بررسی", accepted: "پذیرفته شد", rejected: "رد شد", done: "انجام شد" };
const labelOf = (list, k) => (list.find((x) => x[0] === k) || [k, k])[1];

/** انتخاب وضعیت با دکمه‌های قطعه‌ای؛ وضعیت فعلی مشخص است */
function StatusPicker({ list, value, busy, onPick }) {
  return <div className="pick" role="group" aria-label="تغییر وضعیت">{list.map(([k, t]) => <button key={k} className={k === value ? "on" : ""} disabled={busy} aria-pressed={k === value} onClick={() => k !== value && onPick(k)}>{t}</button>)}</div>;
}

export function StaffGate({ api, info, onLinked }) {
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const submit = (e) => { e.preventDefault(); setBusy(true); setErr(""); api.call("POST", "staff/link", { code }).then(() => onLinked(), (x) => setErr(x.message)).finally(() => setBusy(false)); };
  return <form className="card stack" onSubmit={submit}><h3>اتصال حساب تلگرام به کافی‌نت</h3>
    <ol className="how"><li>در برنامهٔ کافینو وارد حساب خود شوید.</li><li>«دریافت فایل از مشتری» ← «مینی‌اپ تلگرام» ← «ساخت کد اتصال».</li><li>کد ۸ حرفی را همین‌جا بنویسید (۱۰ دقیقه اعتبار دارد).</li></ol>
    <input className="input ltr" dir="ltr" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck="false" maxLength={9} placeholder="ABCD-2345" aria-label="کد اتصال" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
    <button className="btn primary block" disabled={busy || code.replace(/[^A-Z0-9]/g, "").length < 8}>{busy ? "در حال بررسی…" : "اتصال و ورود"}</button>{err && <p className="warn" role="alert">{err}</p>}</form>;
}

function StaffHome({ api, go, bump }) {
  const [s, run] = useAsync(() => api.call("GET", "staff/home"), [bump]);
  if (s.loading && !s.data) return <Skeleton rows={3} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const d = s.data;
  return <div className="stack">
    <section className="card hello"><p className="hint">{d.staff.roleLabel}</p><h2>{d.staff.name}</h2><p className="hint">{d.staff.cafeName}</p></section>
    <div className="grid2">
      <button className="card stat tap" onClick={() => go("requests")}><p className="hint">درخواست جدید</p><p className={`big ${d.newRequests ? "warn" : ""}`}>{faNum(d.newRequests)}</p></button>
      {d.newUploads !== null && <button className="card stat tap" onClick={() => go("uploads")}><p className="hint">فایل جدید</p><p className={`big ${d.newUploads ? "warn" : ""}`}>{faNum(d.newUploads)}</p></button>}
      <button className="card stat tap" onClick={() => go("orders")}><p className="hint">سفارش باز</p><p className="big">{faNum(d.openOrders)}</p></button>
      <button className="card stat tap" onClick={() => go("requests")}><p className="hint">رسید در انتظار تأیید</p><p className={`big ${d.pendingPayments ? "warn" : ""}`}>{faNum(d.pendingPayments || 0)}</p></button>
      <button className="card stat tap" onClick={() => go("chat")}><p className="hint">پیام خوانده‌نشده</p><p className={`big ${d.unreadChats ? "warn" : ""}`}>{faNum(d.unreadChats || 0)}</p></button>
    </div>
    {!d.canMessage && <section className="card"><p className="warn">برای دریافت اعلان در تلگرام، یک‌بار در گفتگوی ربات دکمهٔ Start را بزنید.</p></section>}
  </div>;
}

function StaffOrders({ api, bump }) {
  const [f, setF] = useState("open"), [q, setQ] = useState(""), [qq, setQq] = useState("");
  useEffect(() => { const t = setTimeout(() => setQq(q), 350); return () => clearTimeout(t); }, [q]);
  const [s, run] = useAsync(() => api.call("GET", `staff/orders?filter=${f}&q=${encodeURIComponent(qq)}`), [f, qq, bump]);
  const [open, setOpen] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const pick = (id, status) => { setBusy(true); setMsg(""); api.call("POST", `staff/orders/${encodeURIComponent(id)}/status`, { status }).then((r) => { setMsg(r.note || "انجام شد"); run(); }, (e) => setMsg(e.message)).finally(() => setBusy(false)); };
  return <div className="stack">
    <div className="seg" role="tablist">{[["open", "باز"], ["done", "تمام‌شده"], ["all", "همه"]].map(([k, t]) => <button key={k} role="tab" aria-selected={f === k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{t}</button>)}</div>
    <input className="input" type="search" placeholder="جست‌وجوی سفارش یا مشتری…" aria-label="جست‌وجو" value={q} onChange={(e) => setQ(e.target.value)} />
    {msg && <p className="hint center" role="status">{msg}</p>}
    {s.loading && !s.data ? <Skeleton rows={3} /> : s.error ? <ErrorBox error={s.error} onRetry={run} /> : !s.data.items.length ? <Empty title="سفارشی نیست" /> :
      s.data.items.map((o) => <article key={o.id} className="card order">
        <button className="rowbtn" onClick={() => setOpen(open === o.id ? "" : o.id)} aria-expanded={open === o.id}><div className="row"><h3>{o.title}</h3>{o.amount ? <span className="chip">{tomanText(o.amount)}</span> : null}</div>
          <p className="hint">{o.customer || "مشتری ثبت‌نشده"} · {jalali(o.createdAt)}</p>
          <p><span className={`badge s-${o.status}`}>{labelOf(ORDER_STATUS, o.status)}</span>{o.pending && <span className="badge wait">← {labelOf(ORDER_STATUS, o.pending.status)} (در انتظار برنامه)</span>}</p></button>
        {open === o.id && <StatusPicker list={ORDER_STATUS} value={(o.pending && o.pending.status) || o.status} busy={busy} onPick={(k) => pick(o.id, k)} />}
      </article>)}
    <p className="hint center">تغییر وضعیت سفارش وقتی اعمال می‌شود که برنامهٔ کافینو روی یک دستگاه باز و آنلاین باشد.</p></div>;
}

function StaffUploads({ api, bump }) {
  const [s, run] = useAsync(() => api.call("GET", "staff/uploads"), [bump]);
  const [open, setOpen] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  if (s.loading && !s.data) return <Skeleton rows={3} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const pick = (id, status) => { setBusy(true); setErr(""); api.call("POST", `staff/uploads/${id}/status`, { status }).then(run, (e) => setErr(e.message)).finally(() => setBusy(false)); };
  if (!s.data.items.length) return <Empty title="فایلی دریافت نشده" />;
  return <div className="stack">{err && <p className="warn" role="alert">{err}</p>}
    {s.data.items.map((u) => <article key={u.batchId} className="card order"><button className="rowbtn" onClick={() => setOpen(open === u.batchId ? "" : u.batchId)} aria-expanded={open === u.batchId}>
      <div className="row"><h3>{u.label || "ارسال فایل"} · کد {faDigits(u.code)}</h3><span className="chip">{faNum(u.files)} فایل</span></div>
      <p className="hint">{[u.sender, u.phone && faDigits(u.phone), jalali(u.createdAt)].filter(Boolean).join(" · ")}</p>{u.note && <p>{u.note}</p>}
      <p><span className={`badge u-${u.stage}`}>{UPLOAD_STATUS[u.stage][1]}</span></p></button>
      {open === u.batchId && <StatusPicker list={UPLOAD_STATUS} value={UP_KEYS[u.stage]} busy={busy} onPick={(k) => pick(u.batchId, k)} />}</article>)}
    <p className="hint center">دانلود و حذف فایل‌ها فقط در برنامهٔ کافینو انجام می‌شود.</p></div>;
}

/** رسید کارت‌به‌کارت: بارگذاری تنبل و نمایش تصویر */
function Receipt({ api, id }) {
  const [s, setS] = useState({ state: "idle" });
  const load = () => { setS({ state: "loading" }); api.call("GET", `staff/requests/${id}/receipt`).then((d) => setS({ state: "ok", d }), (e) => setS({ state: "err", msg: e.message })); };
  if (s.state === "idle") return <button className="btn block" onClick={load}>دیدن رسید</button>;
  if (s.state === "loading") return <p className="hint center">در حال بارگذاری رسید…</p>;
  if (s.state === "err") return <p className="warn" role="alert">{s.msg}</p>;
  return <figure className="receipt"><img alt="رسید پرداخت مشتری" src={`data:${s.d.mime};base64,${s.d.data}`} />{s.d.ref && <figcaption className="hint">شمارهٔ پیگیری: <span dir="ltr">{faDigits(s.d.ref)}</span></figcaption>}{s.d.count > 1 && <figcaption className="hint">آخرین رسید از {faNum(s.d.count)} رسید</figcaption>}</figure>;
}

function PayActions({ api, r, canManage, done }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [note, setNote] = useState("");
  if (!(r.total > 0) || r.payStatus === "paid") return null;
  const act = (action) => { setBusy(true); setErr(""); api.call("POST", `staff/requests/${r.id}/pay`, { action, note }).then(done, (e) => setErr(e.message)).finally(() => setBusy(false)); };
  if (!canManage) return <p className="hint">تأیید پرداخت فقط برای مالک/مدیر یا کاربر با دسترسی مدیریت فایل‌هاست.</p>;
  return <div className="stack">
    {r.payStatus === "receipt_sent" && <><Receipt api={api} id={r.id} /><input className="input" placeholder="دلیل رد رسید (اختیاری)" maxLength={300} aria-label="دلیل رد" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="grid2"><button className="btn primary" disabled={busy} onClick={() => act("confirm")}>تأیید پرداخت</button><button className="btn danger" disabled={busy} onClick={() => act("reject")}>رد رسید</button></div></>}
    {r.payMethod === "cash" && r.payStatus !== "receipt_sent" && <button className="btn block" disabled={busy} onClick={() => act("cash_received")}>دریافت حضوری انجام شد</button>}
    {r.payMethod === "card" && r.payStatus !== "receipt_sent" && <p className="hint">منتظر ارسال رسید از مشتری. اگر حضوری پرداخت کرد:</p>}
    {r.payMethod === "card" && r.payStatus !== "receipt_sent" && <button className="btn block" disabled={busy} onClick={() => act("cash_received")}>دریافت حضوری انجام شد</button>}
    {err && <p className="warn" role="alert">{err}</p>}</div>;
}

function StaffRequests({ api, bump }) {
  const [s, run] = useAsync(() => api.call("GET", "staff/requests"), [bump]);
  const [busy, setBusy] = useState(""), [err, setErr] = useState(""), [reply, setReply] = useState({});
  if (s.loading && !s.data) return <Skeleton rows={3} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const act = (id, status) => { setBusy(id); setErr(""); api.call("POST", `staff/requests/${id}/status`, { status, reply: reply[id] || "" }).then(run, (e) => setErr(e.message)).finally(() => setBusy("")); };
  if (!s.data.items.length) return <Empty title="درخواستی نیست" text="وقتی مشتری از مینی‌اپ درخواست بدهد اینجا و در برنامه می‌بینید." />;
  return <div className="stack">{err && <p className="warn" role="alert">{err}</p>}
    {s.data.items.map((r) => <article key={r.id} className="card order"><div className="row"><h3>{r.service}</h3><span className={`badge q-${r.status}`}>{REQ_LABEL[r.status]}</span></div>
      <p className="hint">{r.customer || "مشتری"}{r.phone ? ` · ۰${faDigits(r.phone)}` : ""} · {jalali(r.createdAt)}</p><PayBadge r={r} /><Items items={r.items} total={r.total} />{r.note && <p>{r.note}</p>}{r.reply && <p className="hint">پاسخ: {r.reply}</p>}
      <PayActions api={api} r={r} canManage={s.data.canManage !== false} done={run} />
      {r.status !== "done" && r.status !== "rejected" && <>{r.status === "new" && <input className="input" placeholder="پاسخ به مشتری (اختیاری)" maxLength={300} aria-label="پاسخ" value={reply[r.id] || ""} onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} />}
        <div className="grid2">{r.status === "new" ? <><button className="btn primary" disabled={!!busy} onClick={() => act(r.id, "accepted")}>پذیرش</button><button className="btn danger" disabled={!!busy} onClick={() => act(r.id, "rejected")}>رد</button></> : <button className="btn primary" disabled={!!busy} onClick={() => act(r.id, "done")}>انجام شد</button>}</div></>}
      {r.phone && <a className="btn block" href={`tel:0${r.phone}`}>تماس با مشتری</a>}</article>)}</div>;
}

function StaffChat({ api, bump }) {
  const [s, run] = useAsync(() => api.call("GET", "staff/chats"), [bump]);
  const [open, setOpen] = useState(null);
  useEffect(() => { if (open) return undefined; const t = setInterval(() => { if (!document.hidden) run(); }, 15000); return () => clearInterval(t); }, [open]);
  if (open) return <div className="stack"><button className="link" onClick={() => { setOpen(null); run(); }}>← همهٔ گفتگوها</button><h3>{open.name}{open.phone ? <small className="hint"> · {faDigits(open.phone)}</small> : null}</h3>
    <ChatBox api={api} listPath={`staff/chats/${open.telegramId}`} sendPath={`staff/chats/${open.telegramId}`} me="cafe" placeholder="پاسخ به مشتری…" /></div>;
  if (s.loading && !s.data) return <Skeleton rows={3} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  if (!s.data.items.length) return <Empty title="گفتگویی نیست" text="وقتی مشتری از مینی‌اپ پیام بدهد اینجا و در برنامهٔ کافینو می‌بینید." />;
  return <div className="stack">{s.data.items.map((t) => <button key={t.telegramId} className="card order tap" onClick={() => setOpen(t)}><div className="row"><h3>{t.name}</h3>{t.unread > 0 && <span className="badge q-new">{faNum(t.unread)} جدید</span>}</div><p className="hint">{t.last.sender === "cafe" ? "شما: " : ""}{t.last.body}</p><p className="hint">{jalali(t.last.at)}</p></button>)}</div>;
}

function StaffAccount({ api, bump, refresh, onUnlinked, tg }) {
  const [s, run] = useAsync(() => api.call("GET", "staff/me"), [bump]);
  const [busy, setBusy] = useState(false), [sure, setSure] = useState(false), [err, setErr] = useState("");
  if (s.loading && !s.data) return <Skeleton rows={2} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const d = s.data, st = d.staff, act = (fn) => { setBusy(true); setErr(""); fn().then(() => { refresh(); run(); }, (e) => setErr(e.message)).finally(() => setBusy(false)); };
  return <div className="stack"><section className="card"><h3>{st.name}</h3><ul className="list"><li><span>نقش</span><b>{st.roleLabel}</b></li><li><span>کافی‌نت</span><b>{st.cafeName}</b></li>
      <li><span>اعلان تلگرام</span><b className={st.notify && d.canMessage ? "ok" : "warn"}>{!d.canMessage ? "ربات را Start کنید" : st.notify ? "روشن" : "خاموش"}</b></li></ul></section>
    <button className="btn block" disabled={busy} onClick={() => act(() => api.call("PATCH", "staff/me", { notify: !st.notify }))}>{st.notify ? "خاموش‌کردن اعلان‌ها" : "روشن‌کردن اعلان‌ها"}</button>
    {!d.canMessage && d.botUsername && <button className="btn block" onClick={() => tg.openLink(`https://t.me/${d.botUsername}?start=staff`)}>باز کردن ربات (Start)</button>}
    {!sure ? <button className="btn danger block" onClick={() => setSure(true)}>قطع اتصال این حساب تلگرام</button> : <section className="card"><p className="strong">مطمئنید؟</p><p className="hint">برای ورود دوباره باید در برنامه کد جدید بسازید.</p><div className="grid2"><button className="btn danger" disabled={busy} onClick={() => act(async () => { await api.call("DELETE", "staff/link"); onUnlinked(); })}>بله، قطع شود</button><button className="btn" onClick={() => setSure(false)}>انصراف</button></div></section>}
    {err && <p className="warn" role="alert">{err}</p>}</div>;
}

export const STAFF_TABS = [["home", "خانه", "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"], ["orders", "سفارش‌ها", "M6 3h12l2 4v14H4V7zM4 7h16M9 12h6"], ["uploads", "فایل‌ها", "M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"], ["requests", "درخواست‌ها", "M4 5h16v11H8l-4 4z"], ["chat", "گفتگو", "M21 12a8 8 0 01-11.6 7.1L4 20l1.1-4.6A8 8 0 1121 12z"], ["account", "حساب", "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6"]];
export function StaffApp({ api, tg, tab, go, bump, refresh, onUnlinked }) {
  return { home: <StaffHome api={api} go={go} bump={bump} />, orders: <StaffOrders api={api} bump={bump} />, uploads: <StaffUploads api={api} bump={bump} />, requests: <StaffRequests api={api} bump={bump} />, chat: <StaffChat api={api} bump={bump} />, account: <StaffAccount api={api} bump={bump} refresh={refresh} onUnlinked={onUnlinked} tg={tg} /> }[tab];
}
export { Icon };
