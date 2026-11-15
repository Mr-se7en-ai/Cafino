// مینی‌اپ تلگرام کافینو — فقط برای مشتری. همهٔ داده از API سرور می‌آید و هویت فقط با initDataِ امضاشدهٔ تلگرام ساخته می‌شود.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getTg } from "./tg.js";
import { createApi } from "./api.js";
import { faDigits, faNum, initial, jalali, telHref, tomanText } from "./format.js";

const TABS = [["home", "خانه", "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"], ["services", "خدمات", "M4 6h16M4 12h16M4 18h10"], ["orders", "سفارش‌ها", "M6 3h12l2 4v14H4V7zM4 7h16M9 12h6"], ["support", "پشتیبانی", "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z"], ["account", "حساب", "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6"]];
const Icon = ({ d }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

function useAsync(fn, deps) {
  const [s, set] = useState({ loading: true, data: null, error: null });
  const run = useCallback(() => { set((x) => ({ ...x, loading: true, error: null })); fn().then((data) => set({ loading: false, data, error: null }), (error) => set({ loading: false, data: null, error })); }, deps);
  useEffect(() => { run(); }, [run]);
  return [s, run];
}

const Skeleton = ({ rows = 3 }) => <div className="stack" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="card sk" />)}</div>;
const ErrorBox = ({ error, onRetry }) => <div className="card center" role="alert"><p className="strong">{error && error.message || "خطا"}</p><button className="btn" onClick={onRetry}>تلاش دوباره</button></div>;
const Empty = ({ icon = "M5 4h14v16H5z", title, text }) => <div className="empty"><Icon d={icon} /><p className="strong">{title}</p>{text && <p className="hint">{text}</p>}</div>;

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

function Services({ api }) {
  const [s, run] = useAsync(() => api.services(), []);
  const [q, setQ] = useState("");
  const groups = useMemo(() => { const t = q.trim(); const g = (s.data && s.data.groups) || []; if (!t) return g; return g.map((x) => ({ ...x, items: x.items.filter((i) => i.name.includes(t) || x.cat.includes(t)) })).filter((x) => x.items.length); }, [s.data, q]);
  if (s.loading && !s.data) return <Skeleton rows={4} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  if (!s.data.groups.length) return <Empty title="هنوز تعرفه‌ای ثبت نشده" text="کافی‌نت هنوز قیمت‌ها را منتشر نکرده است." />;
  return <div className="stack"><input className="input" type="search" placeholder="جست‌وجوی خدمت…" aria-label="جست‌وجوی خدمت" value={q} onChange={(e) => setQ(e.target.value)} />
    {!groups.length && <Empty title="موردی پیدا نشد" />}
    {groups.map((g) => <section key={g.cat} className="card"><h3>{g.cat}</h3><ul className="list">{g.items.map((i) => <li key={i.name}><span>{i.name}</span><b>{tomanText(i.price)}</b></li>)}</ul></section>)}
    <p className="hint center">قیمت‌ها تقریبی است؛ مبلغ نهایی را کافی‌نت اعلام می‌کند.</p></div>;
}

function Orders({ api, bump }) {
  const [s, run] = useAsync(() => api.orders(), [bump]);
  const [filter, setFilter] = useState("open");
  if (s.loading && !s.data) return <Skeleton rows={3} />;
  if (s.error) return <ErrorBox error={s.error} onRetry={run} />;
  const items = s.data.items.filter((x) => (filter === "open" ? !x.done : x.done));
  return <div className="stack">
    <div className="seg" role="tablist">{[["open", "در جریان"], ["done", "تمام‌شده"]].map(([k, t]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{t}</button>)}</div>
    {!s.data.phoneVerified && !s.data.linked && <p className="hint center">برای دیدن همهٔ سفارش‌ها شمارهٔ خود را در «خانه» تأیید کنید.</p>}
    {items.length ? items.map((o, i) => <OrderCard key={`${o.kind}${o.code || ""}${i}`} o={o} />) : <Empty title={filter === "open" ? "سفارش در جریان ندارید" : "سفارش تمام‌شده‌ای نیست"} />}</div>;
}

function Support({ api, tg }) {
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
  return <div className="boot"><Empty title={t[0]} text={t[1]} /></div>;
}

function App({ tg }) {
  const api = useMemo(() => createApi({ initData: tg.initData, cafe: tg.cafe }), [tg]);
  const [boot, setBoot] = useState({ state: "loading" }), [tab, setTab] = useState("home"), [bump, setBump] = useState(0);
  const start = useCallback(() => {
    if (!tg.initData) return setBoot({ state: "error", error: new Error("این صفحه باید از داخل تلگرام باز شود.") });
    setBoot({ state: "loading" }); api.login().then((d) => setBoot({ state: d.problem ? "problem" : "ready", info: d }), (error) => setBoot({ state: "error", error }));
  }, [api, tg]);
  useEffect(() => { tg.ready(); start(); }, [start, tg]);
  useEffect(() => { document.documentElement.dataset.theme = tg.scheme === "dark" ? "dark" : "light"; }, [tg]);
  if (boot.state === "loading") return <div className="boot"><Skeleton rows={3} /></div>;
  if (boot.state === "error") return <div className="boot"><ErrorBox error={boot.error} onRetry={start} /></div>;
  if (boot.state === "problem") return <Problem kind={boot.info.problem} />;
  const go = (t) => { tg.haptic(); setTab(t); window.scrollTo(0, 0); }, refresh = () => setBump((n) => n + 1);
  const View = { home: <Home api={api} tg={tg} go={go} bump={bump} />, services: <Services api={api} />, orders: <Orders api={api} bump={bump} />, support: <Support api={api} tg={tg} />, account: <Account api={api} bump={bump} refresh={refresh} /> }[tab];
  return <><header className="top"><b>{boot.info.cafe.name}</b></header><main className="page">{View}</main>
    <nav className="nav" aria-label="بخش‌ها">{TABS.map(([k, t, d]) => <button key={k} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}><Icon d={d} /><span>{t}</span></button>)}</nav></>;
}

createRoot(document.getElementById("root")).render(<App tg={getTg()} />);
