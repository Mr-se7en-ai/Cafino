// مینی‌اپ تلگرام کافینو — فقط برای مشتری. همهٔ داده از API سرور می‌آید و هویت فقط با initDataِ امضاشدهٔ تلگرام ساخته می‌شود.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getTg } from "./tg.js";
import { createApi } from "./api.js";
import { faDigits, faNum, initial, jalali, telHref, tomanText } from "./format.js";
import { Empty, ErrorBox, Icon, Skeleton, useAsync } from "./ui.jsx";
import { REQ_LABEL, STAFF_TABS, StaffApp, StaffGate } from "./staff.jsx";
import { ChatBox, Items, PayBadge, PayBlock, PayChoices, cartCount, cartTotal } from "./shop.jsx";

const TABS = [["home", "خانه", "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"], ["services", "خدمات", "M4 6h16M4 12h16M4 18h10"], ["orders", "سفارش‌ها", "M6 3h12l2 4v14H4V7zM4 7h16M9 12h6"], ["support", "گفتگو", "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z"], ["account", "حساب", "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6"]];
function Stepper({ steps, stage }) {
  return <ol className="steps" aria-label="مراحل">{steps.map((s, i) => <li key={s} className={i < stage ? "done" : i === stage ? "now" : ""} aria-current={i === stage ? "step" : undefined}><i /><span>{s}</span></li>)}</ol>;
}
const OrderCard = ({ o }) => (
  <article className="card order">
    <div className="row"><h3>{o.title}</h3>{o.kind === "order" && o.amount > 0 && <span className="chip">{tomanText(o.amount)}</span>}</div>
    <p className="hint">{jalali(o.createdAt)}{o.kind === "upload" ? ` · ${faNum(o.files)} فایل` : ""}{o.code ? ` · کد ${faDigits(o.code)}` : ""}</p>
    {o.waiting && <p className="warn">منتظر مدارک شما هستیم؛ با کافی‌نت تماس بگیرید.</p>}
    <Stepper steps={o.steps} stage={o.stage} />
  </article>
);


function RequestForm({ api, preset, onDone, onCancel }) {
  const [service, setService] = useState(preset || ""), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const submit = (e) => { e.preventDefault(); setBusy(true); setErr(""); api.call("POST", "requests", { service, note }).then(() => onDone(), (x) => setErr(x.code === "phone_required" ? "ابتدا در «خانه» شمارهٔ موبایل خود را تأیید کنید." : x.message)).finally(() => setBusy(false)); };
  return <form className="card stack" onSubmit={submit}><h3>درخواست سفارش</h3>
    <input className="input" placeholder="چه کاری می‌خواهید؟ (مثلاً چاپ بنر ۲×۱)" aria-label="خدمت" maxLength={120} value={service} onChange={(e) => setService(e.target.value)} required />
    <textarea className="input area" placeholder="توضیحات (تعداد، رنگ، زمان تحویل…)" aria-label="توضیحات" maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    <div className="grid2"><button className="btn primary" disabled={busy || !service.trim()}>{busy ? "در حال ارسال…" : "ارسال درخواست"}</button><button type="button" className="btn" onClick={onCancel}>انصراف</button></div>
    {err && <p className="warn" role="alert">{err}</p>}<p className="hint">کافی‌نت درخواست را می‌بیند و نتیجه را همین‌جا اعلام می‌کند. فایل‌ها را از «ارسال فایل برای چاپ» بفرستید.</p></form>;
}
const RequestCard = ({ r, api, pay, onChanged }) => <article className="card order"><div className="row"><h3>{r.service}</h3><span className={`badge q-${r.status}`}>{REQ_LABEL[r.status]}</span></div><p className="hint">{jalali(r.createdAt)}</p><PayBadge r={r} /><Items items={r.items} total={r.total} />{r.note && <p>{r.note}</p>}{r.reply && <p className="strong">پاسخ کافی‌نت: <span className="plain">{r.reply}</span></p>}<PayBlock api={api} r={r} info={pay} onChanged={onChanged} /></article>;

/** سبد خرید: مرور اقلام، تغییر تعداد، انتخاب روش پرداخت و ثبت سفارش */
function CartScreen({ api, cart, setCart, onDone, onBack }) {
  const [info, setInfo] = useState(null), [method, setMethod] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { api.call("GET", "pay-info").then((d) => { setInfo(d); setMethod((m) => m || (d.cash ? "cash" : d.card ? "card" : "")); }, (e) => setErr(e.message)); }, [api]);
  const lines = Object.entries(cart), total = cartTotal(cart);
  const step = (k, d) => setCart((c) => { const x = c[k]; if (!x) return c; const q = x.qty + d, n = { ...c }; if (q <= 0) delete n[k]; else n[k] = { ...x, qty: Math.min(q, 999) }; return n; });
  const submit = () => { setBusy(true); setErr(""); api.call("POST", "requests", { items: lines.map(([, x]) => ({ cat: x.cat, name: x.name, qty: x.qty })), payMethod: method, note }).then((r) => onDone(r), (x) => setErr(x.code === "phone_required" ? "ابتدا در «خانه» شمارهٔ موبایل خود را تأیید کنید." : x.message)).finally(() => setBusy(false)); };
  if (!lines.length) return <div className="stack"><Empty title="سبد خالی است" text="از «خدمات» مورد دلخواه را اضافه کنید." /><button className="btn block" onClick={onBack}>بازگشت به خدمات</button></div>;
  return <div className="stack"><h3 className="sec">سبد خرید</h3>
    <section className="card"><ul className="list lines">{lines.map(([k, x]) => <li key={k}><span>{x.name}<small className="hint block">{tomanText(x.price)} × {faNum(x.qty)}</small></span>
      <span className="qty"><button className="mini" aria-label={`کم کردن ${x.name}`} onClick={() => step(k, -1)}>−</button><b>{faNum(x.qty)}</b><button className="mini" aria-label={`زیاد کردن ${x.name}`} onClick={() => step(k, 1)}>+</button></span></li>)}
      <li className="sum"><span>جمع (تقریبی؛ سرور دوباره محاسبه می‌کند)</span><b data-testid="cart-total">{tomanText(total)}</b></li></ul></section>
    <section className="card stack"><h3>روش پرداخت</h3><PayChoices info={info} value={method} onChange={setMethod} />
      {info && !info.cash && !info.card && <p className="warn">کافی‌نت هنوز روش پرداختی را فعال نکرده؛ با کافی‌نت تماس بگیرید.</p>}
      {method === "card" && <p className="hint">بعد از ثبت سفارش، شمارهٔ کارت و دکمهٔ ارسال رسید را در «سفارش‌ها» می‌بینید.</p>}</section>
    <textarea className="input area" placeholder="توضیحات (زمان تحویل، رنگ، …)" aria-label="توضیحات" maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    <div className="grid2"><button className="btn primary" disabled={busy || !method} onClick={submit}>{busy ? "در حال ثبت…" : "ثبت سفارش"}</button><button className="btn" onClick={onBack}>ادامهٔ انتخاب</button></div>
    {err && <p className="warn" role="alert">{err}</p>}</div>;
}

function PhoneCard({ tg, api, bot, cafeCode, onDone }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const poll = (n) => { api.me().then((m) => { if (m.phoneVerified) { setBusy(false); onDone(); } else if (n > 0) timer.current = setTimeout(() => poll(n - 1), 2000); else { setBusy(false); setMsg("هنوز تأیید نشد. اگر دکمه را زدید چند لحظه بعد دوباره بررسی کنید."); } }, () => { setBusy(false); setMsg("ارتباط با سرور برقرار نشد."); }); };
  const start = () => {
    setMsg(""); setBusy(true);
    if (tg.canRequestContact()) tg.requestContact((ok) => { if (ok) poll(10); else { setBusy(false); setMsg("ارسال شماره لغو شد."); } });
    else { setBusy(false); setMsg(bot ? "نسخهٔ تلگرام شما درخواست شماره را نمی‌پذیرد. در گفتگوی ربات دکمهٔ «ارسال شمارهٔ من» را بزنید." : "تلگرام را به‌روز کنید."); if (bot) tg.openLink(`https://t.me/${bot}?start=c_${cafeCode}`); }
  };
  return <section className="card accent"><h3>تأیید شمارهٔ موبایل</h3><p className="hint">برای دیدن سفارش‌ها و مانده حساب‌تان، شمارهٔ تلگرام خودتان را تأیید کنید. فقط برای شناسایی شما در همین کافی‌نت استفاده می‌شود.</p>
    <button className="btn primary" onClick={start} disabled={busy}>{busy ? "در حال بررسی…" : "ارسال شمارهٔ من"}</button>{msg && <p className="warn" role="status">{msg}</p>}</section>;
}

function Home({ api, tg, go, bump }) {
  const [s, run] = useAsync(() => api.home(), [bump]);
  if (s.loading && !s.data) return <Skeleton rows={3} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const d = s.data;
  return <div className="stack">
    <section className="card hello"><p className="hint">سلام{d.user.firstName ? ` ${d.user.firstName}` : ""}</p><h2>{d.cafe.name}</h2></section>
    {!d.phoneVerified && <PhoneCard tg={tg} api={api} bot={d.botUsername} cafeCode={d.cafe.code} onDone={run} />}
    {d.phoneVerified && d.ambiguous && <section className="card"><p className="warn">چند حساب با این شماره در کافی‌نت ثبت شده؛ برای اتصال با کافی‌نت تماس بگیرید.</p></section>}
    {d.phoneVerified && !d.ambiguous && !d.linked && <section className="card"><p>حساب شما هنوز در کافی‌نت ثبت نشده است. بعد از اولین مراجعه یا ثبت سفارش، اطلاعات حساب اینجا نمایش داده می‌شود.</p></section>}
    {d.linked && <div className="grid2"><div className="card stat"><p className="hint">مانده حساب</p><p className={`big ${d.debtRial > 0 ? "warn" : "ok"}`}>{d.debtRial > 0 ? tomanText(d.debtRial) : "تسویه"}</p></div><div className="card stat"><p className="hint">سفارش این ماه</p><p className="big">{faNum(d.monthOrders)}</p></div></div>}
    <section><h3 className="sec">آخرین وضعیت</h3>{d.active ? <OrderCard o={d.active} /> : <Empty title="سفارش فعالی ندارید" text="با ارسال فایل یا ثبت سفارش در کافی‌نت، اینجا پیگیری کنید." />}</section>
    {d.cafe.uploadPath && <button className="btn primary block" onClick={() => tg.openLink(location.origin + d.cafe.uploadPath)}>ارسال فایل برای چاپ</button>}
    <button className="btn block" onClick={() => go("services")}>دیدن خدمات و قیمت‌ها</button>
  </div>;
}

function Services({ api, onRequest, cart, setCart, openCart }) {
  const [s, run] = useAsync(() => api.services(), []);
  const [q, setQ] = useState("");
  const groups = useMemo(() => { const t = q.trim(); const g = (s.data && s.data.groups) || []; if (!t) return g; return g.map((x) => ({ ...x, items: x.items.filter((i) => i.name.includes(t) || x.cat.includes(t)) })).filter((x) => x.items.length); }, [s.data, q]);
  if (s.loading && !s.data) return <Skeleton rows={4} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  if (!s.data.groups.length) return <Empty title="هنوز تعرفه‌ای ثبت نشده" text="کافی‌نت هنوز قیمت‌ها را منتشر نکرده است." />;
  return <div className="stack"><input className="input" type="search" placeholder="جست‌وجوی خدمت…" aria-label="جست‌وجوی خدمت" value={q} onChange={(e) => setQ(e.target.value)} />
    {!groups.length && <Empty title="موردی پیدا نشد" />}
    {groups.map((g) => <section key={g.cat} className="card"><h3>{g.cat}</h3><ul className="list">{g.items.map((i) => { const k = `${g.cat}|${i.name}`, q = cart[k] ? cart[k].qty : 0; return <li key={i.name}><span>{i.name}</span><b>{tomanText(i.price)}</b>{q ? <span className="qty"><button className="mini" aria-label={`کم کردن ${i.name}`} onClick={() => setCart((c) => { const n = { ...c }; if (q <= 1) delete n[k]; else n[k] = { ...c[k], qty: q - 1 }; return n; })}>−</button><b>{faNum(q)}</b><button className="mini" aria-label={`زیاد کردن ${i.name}`} onClick={() => setCart((c) => ({ ...c, [k]: { ...c[k], qty: Math.min(q + 1, 999) } }))}>+</button></span> : <button className="mini" onClick={() => setCart((c) => ({ ...c, [k]: { cat: g.cat, name: i.name, price: i.price, qty: 1 } }))} aria-label={`افزودن ${i.name} به سبد`}>+ سبد</button>}</li>; })}</ul></section>)}
    <p className="hint center">قیمت‌ها طبق تعرفهٔ کافی‌نت است؛ مبلغ نهایی ممکن است در صورت نیاز توسط کافی‌نت اصلاح شود.</p>
    <button className="link" onClick={() => onRequest("")}>خدمتی در لیست نیست؟ درخواست آزاد بدهید</button>
    {cartCount(cart) > 0 && <div className="cartbar"><button className="btn primary block" data-testid="open-cart" onClick={openCart}>مشاهدهٔ سبد · {faNum(cartCount(cart))} مورد · {tomanText(cartTotal(cart))}</button></div>}</div>;
}

function Orders({ api, bump, newRequest, setNewRequest }) {
  const [s, run] = useAsync(() => api.orders(), [bump]);
  const [rq, runRq] = useAsync(() => api.call("GET", "requests"), [bump]);
  const [filter, setFilter] = useState("open"), [pay, setPay] = useState(null);
  useEffect(() => { api.call("GET", "pay-info").then(setPay, () => {}); }, [api, bump]);
  if (s.loading && !s.data) return <Skeleton rows={3} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const items = s.data.items.filter((x) => (filter === "open" ? !x.done : x.done));
  const reqs = (rq.data && rq.data.items) || [];
  return <div className="stack">
    {newRequest === null ? <button className="btn primary block" onClick={() => setNewRequest("")}>+ درخواست سفارش جدید</button> : <RequestForm api={api} preset={newRequest} onDone={() => { setNewRequest(null); runRq(); }} onCancel={() => setNewRequest(null)} />}
    {reqs.length > 0 && <section><h3 className="sec">درخواست‌های شما</h3><div className="stack">{reqs.slice(0, 10).map((r) => <RequestCard key={r.id} r={r} api={api} pay={pay} onChanged={runRq} />)}</div></section>}
    <div className="seg" role="tablist">{[["open", "در جریان"], ["done", "تمام‌شده"]].map(([k, t]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{t}</button>)}</div>
    {!s.data.phoneVerified && !s.data.linked && <p className="hint center">برای دیدن همهٔ سفارش‌ها شمارهٔ خود را در «خانه» تأیید کنید.</p>}
    {items.length ? items.map((o, i) => <OrderCard key={`${o.kind}${o.code || ""}${i}`} o={o} />) : <Empty title={filter === "open" ? "سفارش در جریان ندارید" : "سفارش تمام‌شده‌ای نیست"} />}</div>;
}

function Support({ api, tg, onRead }) {
  const [seg, setSeg] = useState("chat");
  return <div className="stack"><div className="seg" role="tablist">{[["chat", "گفتگو با کافی‌نت"], ["info", "اطلاعات تماس"]].map(([k, t]) => <button key={k} role="tab" aria-selected={seg === k} className={seg === k ? "on" : ""} onClick={() => setSeg(k)}>{t}</button>)}</div>
    {seg === "chat" ? <ChatBox api={api} listPath="chat" sendPath="chat" me="customer" onRead={onRead} placeholder="پیام برای کافی‌نت…" /> : <ShopInfo api={api} tg={tg} />}</div>;
}
function ShopInfo({ api, tg }) {
  const [s, run] = useAsync(() => api.shop(), []);
  if (s.loading && !s.data) return <Skeleton rows={2} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const c = s.data.cafe;
  return <div className="stack"><section className="card center">{c.logoUrl ? <img className="logo" src={c.logoUrl} alt="" /> : <div className="logo ph">{initial(c.name)}</div>}<h2>{c.name}</h2></section>
    {c.address && <section className="card"><p className="hint">نشانی</p><p>{c.address}</p></section>}
    {c.phone && <a className="btn block" href={telHref(c.phone)}>تماس: {c.phone}</a>}
    {c.mobile && <a className="btn block" href={telHref(c.mobile)}>موبایل: {c.mobile}</a>}
    {c.uploadPath && <button className="btn primary block" onClick={() => tg.openLink(location.origin + c.uploadPath)}>ارسال فایل برای چاپ</button>}
    {!c.address && !c.phone && !c.mobile && <Empty title="اطلاعات تماس ثبت نشده" />}</div>;
}

function Account({ api, bump, refresh }) {
  const [s, run] = useAsync(() => api.me(), [bump]);
  const [sure, setSure] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  if (s.loading && !s.data) return <Skeleton rows={2} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const d = s.data, act = (fn) => { setBusy(true); setErr(""); fn().then(() => { setSure(false); refresh(); }, (e) => setErr(e.message)).finally(() => setBusy(false)); };
  return <div className="stack">
    <section className="card"><h3>{d.user.firstName || "کاربر تلگرام"}</h3><ul className="list"><li><span>شمارهٔ موبایل</span><b className={d.phoneVerified ? "ok" : "warn"}>{d.phoneVerified ? "تأیید شده" : "تأیید نشده"}</b></li><li><span>اتصال به حساب کافی‌نت</span><b>{d.linked ? d.linked.name || "متصل" : d.ambiguous ? "نیاز به بررسی کافی‌نت" : "—"}</b></li></ul></section>
    {d.linked && <button className="btn block" disabled={busy} onClick={() => act(() => api.unlink())}>قطع اتصال از این کافی‌نت</button>}
    {!sure ? <button className="btn danger block" onClick={() => setSure(true)}>حذف شماره و اطلاعات من</button>
      : <section className="card"><p className="strong">مطمئنید؟</p><p className="hint">شمارهٔ تأییدشده و اتصال به همهٔ کافی‌نت‌ها پاک می‌شود. اطلاعات خود کافی‌نت (سفارش‌ها و فاکتورها) حذف نمی‌شود.</p><div className="grid2"><button className="btn danger" disabled={busy} onClick={() => act(() => api.forgetMe())}>بله، حذف شود</button><button className="btn" onClick={() => setSure(false)}>انصراف</button></div></section>}
    {err && <p className="warn" role="alert">{err}</p>}
  </div>;
}

function Problem({ kind }) {
  const t = { not_found: ["لینک کافی‌نت معتبر نیست", "لینک یا QR را دوباره از کافی‌نت بگیرید."], disabled: ["مینی‌اپ این کافی‌نت فعلاً بسته است", "با کافی‌نت تماس بگیرید."], no_cafe: ["کافی‌نت مشخص نیست", "لینک یا QR مخصوص کافی‌نت خود را باز کنید؛ با آن مینی‌اپ به همان کافی‌نت وصل می‌شود."] }[kind] || ["خطا", ""];
  return <Empty title={t[0]} text={t[1]} />;
}

const MODE_KEY = "cafino_mode";
const readMode = () => { try { const v = localStorage.getItem(MODE_KEY); return v === "staff" || v === "customer" ? v : ""; } catch { return ""; } };
const saveMode = (m) => { try { m ? localStorage.setItem(MODE_KEY, m) : localStorage.removeItem(MODE_KEY); } catch { /* بدون ذخیره هم کار می‌کند */ } };

/** صفحهٔ ورود دو بخشی: حساب مشتری | ورود کافی‌نت */
function Gate({ api, info, onPick, onLinked, tg }) {
  const [showLink, setShowLink] = useState(false);
  const canCustomer = !info.problem;
  return <div className="boot stack"><section className="card center"><h2>کافینو</h2><p className="hint">وارد کدام بخش می‌شوید؟</p></section>
    <button className="card gate" data-testid="gate-customer" disabled={!canCustomer} onClick={() => onPick("customer")}><b>حساب مشتری</b><span className="hint">{canCustomer ? `خدمات، سفارش‌ها و حساب شما در «${info.cafe.name}»` : "برای ورود مشتری، لینک یا QR کافی‌نت را باز کنید"}</span></button>
    {info.staff ? <button className="card gate" data-testid="gate-staff" onClick={() => onPick("staff")}><b>ورود به حساب کافی‌نت</b><span className="hint">{info.staff.name} — {info.staff.cafeName}</span></button>
      : !showLink ? <button className="card gate" data-testid="gate-staff" onClick={() => setShowLink(true)}><b>ورود به حساب کافی‌نت</b><span className="hint">برای مالک و کارمندان؛ با کد اتصال از برنامه</span></button>
      : <StaffGate api={api} info={info} onLinked={onLinked} />}
    {!tg.hasSdk && <p className="hint center">برای بهترین تجربه از داخل تلگرام باز کنید.</p>}</div>;
}

function App({ tg }) {
  const api = useMemo(() => createApi({ initData: tg.initData, cafe: tg.cafe }), [tg]);
  const [boot, setBoot] = useState({ state: "loading" }), [mode, setMode] = useState(""), [tab, setTab] = useState("home"), [bump, setBump] = useState(0), [newRequest, setNewRequest] = useState(null), [cart, setCart] = useState({}), [cartOpen, setCartOpen] = useState(false), [unread, setUnread] = useState(0);
  const start = useCallback(() => {
    if (!tg.initData) return setBoot({ state: "error", error: new Error("این صفحه باید از داخل تلگرام باز شود.") });
    setBoot({ state: "loading" });
    api.login().then((d) => {
      setBoot({ state: "ready", info: d });
      const want = tg.mode || readMode();          // لینک ربات کافی‌نت (?m=staff) یا آخرین انتخاب
      setMode(want === "staff" && d.staff ? "staff" : want === "customer" && !d.problem ? "customer" : (tg.cafe && !d.staff) ? "customer" : "");
    }, (error) => setBoot({ state: "error", error }));
  }, [api, tg]);
  useEffect(() => { tg.ready(); start(); }, [start, tg]);
  useEffect(() => { document.documentElement.dataset.theme = tg.scheme === "dark" ? "dark" : "light"; }, [tg]);
  const custMode = boot.state === "ready" && mode === "customer" && !boot.info.problem;
  const pollUnread = useCallback(() => { api.call("GET", "chat/unread").then((d) => setUnread(d.unread || 0), () => {}); }, [api]);
  useEffect(() => { if (!custMode) return undefined; pollUnread(); const t = setInterval(() => { if (!document.hidden) pollUnread(); }, 20000); return () => clearInterval(t); }, [custMode, pollUnread]);
  if (boot.state === "loading") return <div className="boot"><Skeleton rows={3} /></div>;
  if (boot.state === "error") return <div className="boot"><ErrorBox error={boot.error} onRetry={start} /></div>;
  const info = boot.info, pick = (m) => { saveMode(m); setMode(m); setTab("home"); window.scrollTo(0, 0); }, refresh = () => setBump((n) => n + 1);
  if (!mode) return <Gate api={api} info={info} tg={tg} onPick={pick} onLinked={() => { saveMode("staff"); start(); }} />;
  const go = (t) => { tg.haptic(); setTab(t); window.scrollTo(0, 0); };
  const top = <header className="top"><b>{mode === "staff" && info.staff ? info.staff.cafeName : info.cafe ? info.cafe.name : "کافینو"}</b><button className="swap" onClick={() => pick("")} aria-label="تغییر بخش">تغییر بخش</button></header>;
  if (mode === "staff") return <>{top}<main className="page"><StaffApp api={api} tg={tg} tab={tab} go={go} bump={bump} refresh={refresh} onUnlinked={() => { saveMode(""); start(); }} /></main>
    <nav className="nav" aria-label="بخش‌های کافی‌نت">{STAFF_TABS.map(([k, t, d]) => <button key={k} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}><Icon d={d} /><span>{t}</span></button>)}</nav></>;
  if (info.problem) return <>{top}<main className="page"><Problem kind={info.problem} /><button className="btn block" onClick={() => pick("")}>ورود به حساب کافی‌نت</button></main></>;
  const ask = (name) => { setNewRequest(name); go("orders"); };
  const onOrdered = () => { setCart({}); setCartOpen(false); setNewRequest(null); refresh(); go("orders"); };
  const View = cartOpen ? <CartScreen api={api} cart={cart} setCart={setCart} onDone={onOrdered} onBack={() => setCartOpen(false)} /> : { home: <Home api={api} tg={tg} go={go} bump={bump} />, services: <Services api={api} onRequest={ask} cart={cart} setCart={setCart} openCart={() => setCartOpen(true)} />, orders: <Orders api={api} bump={bump} newRequest={newRequest} setNewRequest={setNewRequest} />, support: <Support api={api} tg={tg} onRead={() => setUnread(0)} />, account: <Account api={api} bump={bump} refresh={refresh} /> }[tab];
  return <>{top}<main className="page">{View}</main>
    <nav className="nav" aria-label="بخش‌ها">{TABS.map(([k, t, d]) => <button key={k} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => { setCartOpen(false); go(k); }}><Icon d={d} /><span>{t}</span>{k === "support" && unread > 0 && <i className="dot" data-testid="chat-unread">{faNum(unread)}</i>}{k === "services" && cartCount(cart) > 0 && <i className="dot">{faNum(cartCount(cart))}</i>}</button>)}</nav></>;
}

createRoot(document.getElementById("root")).render(<App tg={getTg()} />);
