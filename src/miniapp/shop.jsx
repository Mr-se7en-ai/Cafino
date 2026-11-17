// اجزای مشترک سبد خرید، پرداخت و گفتگو در مینی‌اپ (بخش مشتری و بخش کافی‌نت)
import React, { useCallback, useEffect, useRef, useState } from "react";
import { faDigits, faNum, jalali, tomanText } from "./format.js";

export const PAY_LABEL = { unpaid: "پرداخت نشده", receipt_sent: "رسید در انتظار تأیید", paid: "پرداخت شد", rejected: "رسید رد شد" };
export const METHOD_LABEL = { cash: "پرداخت حضوری", card: "کارت‌به‌کارت" };
export const cartTotal = (cart) => Object.values(cart).reduce((a, x) => a + x.price * x.qty, 0);
export const cartCount = (cart) => Object.values(cart).reduce((a, x) => a + x.qty, 0);
export const cardFmt = (n) => faDigits(String(n || "").replace(/(\d{4})(?=\d)/g, "$1 "));

/** اقلام و جمع یک درخواست */
export function Items({ items, total }) {
  if (!items || !items.length) return null;
  return <ul className="list lines">{items.map((x, i) => <li key={`${x.name}${i}`}><span>{x.name} <small className="hint">×{faNum(x.qty)}</small></span><b>{tomanText(x.price * x.qty)}</b></li>)}
    <li className="sum"><span>جمع</span><b>{tomanText(total)}</b></li></ul>;
}
export const PayBadge = ({ r }) => r.total > 0 ? <span className={`badge p-${r.payStatus}`}>{METHOD_LABEL[r.payMethod]} · {PAY_LABEL[r.payStatus]}</span> : null;

/** تصویر انتخاب‌شده را کوچک می‌کند (حداکثر ۱۴۰۰ پیکسل، JPEG) و data-URL برمی‌گرداند */
export function fileToImage(file, maxSide = 1400) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود."));
    const rd = new FileReader();   // data: مجاز است؛ blob: در CSP مینی‌اپ نیست
    rd.onerror = () => reject(new Error("خواندن تصویر ممکن نشد."));
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, maxSide / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          let q = 0.82, out = c.toDataURL("image/jpeg", q);
          while (out.length > 1_900_000 && q > 0.4) { q -= 0.12; out = c.toDataURL("image/jpeg", q); }
          out.length > 1_900_000 ? reject(new Error("تصویر خیلی بزرگ است؛ تصویر کوچک‌تری بفرستید.")) : resolve(out);
        } catch { reject(new Error("خواندن تصویر ممکن نشد.")); }
      };
      img.onerror = () => reject(new Error("تصویر خوانده نشد."));
      img.src = String(rd.result);
    };
    rd.readAsDataURL(file);
  });
}

/** کارت پرداخت یک درخواست برای مشتری: اطلاعات کارت + ارسال رسید */
export function PayBlock({ api, r, info, onChanged }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [ref, setRef] = useState("");
  const file = useRef(null);
  if (!(r.total > 0) || r.status === "rejected") return null;
  if (r.payStatus === "paid") return <p className="ok strong">✓ پرداخت شما تأیید شد.</p>;
  if (r.payMethod === "cash") return <p className="hint">پرداخت حضوری: هنگام تحویل به کافی‌نت پرداخت کنید.</p>;
  const send = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    setBusy(true); setMsg("");
    try { const image = await fileToImage(f); await api.call("POST", `requests/${r.id}/receipt`, { image, ref }); setRef(""); setMsg("رسید ارسال شد؛ منتظر تأیید کافی‌نت باشید."); onChanged(); }
    catch (x) { setMsg(x.message); } finally { setBusy(false); }
  };
  const ci = info && info.cardInfo;
  return <div className="payblock">
    {r.payStatus === "receipt_sent" && <p className="warn strong">رسید شما ارسال شد و در انتظار تأیید کافی‌نت است.</p>}
    {r.payStatus === "rejected" && <p className="warn strong">رسید رد شد{r.payNote ? `: ${r.payNote}` : ""}. رسید درست را دوباره بفرستید.</p>}
    {ci ? <div className="cardbox"><p className="hint">مبلغ {tomanText(r.total)} را به این کارت واریز کنید:</p><p className="cardno" dir="ltr">{cardFmt(ci.number)}</p><p className="hint">{[ci.holder, ci.bank].filter(Boolean).join(" · ")}</p>
      <button className="mini" onClick={() => { try { navigator.clipboard.writeText(ci.number); setMsg("شمارهٔ کارت کپی شد."); } catch { setMsg("کپی ممکن نشد؛ شماره را دستی بنویسید."); } }}>کپی شمارهٔ کارت</button></div> : <p className="hint">اطلاعات کارت هنوز در دسترس نیست؛ با کافی‌نت تماس بگیرید.</p>}
    {r.payStatus !== "receipt_sent" && <>
      <input className="input ltr" dir="ltr" inputMode="numeric" maxLength={40} placeholder="شمارهٔ پیگیری (اختیاری)" aria-label="شمارهٔ پیگیری" value={ref} onChange={(e) => setRef(e.target.value)} />
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={send} data-testid="receipt-file" />
      <button className="btn primary block" disabled={busy || !ci} onClick={() => file.current && file.current.click()}>{busy ? "در حال ارسال…" : r.payStatus === "rejected" ? "ارسال رسید جدید" : "ارسال تصویر رسید"}</button></>}
    {msg && <p className="hint" role="status">{msg}</p>}
  </div>;
}

/** گزینه‌های پرداخت (به‌زودی: درگاه و کیف پول) */
export function PayChoices({ info, value, onChange }) {
  if (!info) return null;
  const opt = (k, title, sub, on) => <label key={k} className={`opt ${value === k ? "on" : ""} ${on ? "" : "off"}`}><input type="radio" name="pay" disabled={!on} checked={value === k} onChange={() => onChange(k)} /><span><b>{title}</b><small className="hint">{sub}</small></span></label>;
  return <div className="stack" role="radiogroup" aria-label="روش پرداخت">
    {info.cash && opt("cash", "پرداخت حضوری", "هنگام تحویل در کافی‌نت", true)}
    {info.card && opt("card", "کارت‌به‌کارت", "واریز به کارت کافی‌نت و ارسال رسید", true)}
    <div className="opt off soon"><span><b>درگاه پرداخت آنلاین</b><small className="hint">به‌زودی</small></span><i className="chip">به‌زودی</i></div>
    <div className="opt off soon"><span><b>کیف پول</b><small className="hint">به‌زودی</small></span><i className="chip">به‌زودی</i></div>
  </div>;
}

/** گفتگو: لیست پیام‌ها با پولینگ سبک؛ برای مشتری و کافی‌نت مشترک */
export function ChatBox({ api, listPath, sendPath, me, interval = 6000, onRead, placeholder = "پیام خود را بنویسید…" }) {
  const [items, setItems] = useState([]), [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [loaded, setLoaded] = useState(false);
  const last = useRef(0), box = useRef(null), alive = useRef(true);
  const merge = useCallback((add) => { if (!add.length) return; setItems((cur) => { const seen = new Set(cur.map((m) => m.id)); const next = [...cur, ...add.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id); last.current = next.length ? next[next.length - 1].id : 0; return next; }); }, []);
  const load = useCallback(() => api.call("GET", `${listPath}${last.current ? `${listPath.includes("?") ? "&" : "?"}after=${last.current}` : ""}`).then((d) => { if (!alive.current) return; merge(d.items || []); setLoaded(true); onRead && onRead(); }, (e) => { if (alive.current) { setErr(e.message); setLoaded(true); } }), [api, listPath, merge, onRead]);
  useEffect(() => { alive.current = true; last.current = 0; setItems([]); setLoaded(false); load(); const t = setInterval(() => { if (!document.hidden) load(); }, interval); return () => { alive.current = false; clearInterval(t); }; }, [listPath, interval]);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [items.length]);
  const send = (e) => { e.preventDefault(); const body = text.trim(); if (!body) return; setBusy(true); setErr(""); api.call("POST", sendPath, { body }).then((m) => { setText(""); merge([m]); }, (x) => setErr(x.message)).finally(() => setBusy(false)); };
  return <div className="chat">
    <div className="msgs" ref={box} role="log" aria-live="polite" aria-label="پیام‌ها">
      {!loaded ? <p className="hint center">در حال بارگذاری…</p> : !items.length ? <p className="hint center">هنوز پیامی نیست. اولین پیام را بفرستید.</p> :
        items.map((m) => <div key={m.id} className={`msg ${m.sender === me ? "mine" : "theirs"}`}><p>{m.body}</p><small>{m.sender !== me && m.by ? `${m.by} · ` : ""}{jalali(m.at)}{m.sender === me && m.read ? " · ✓✓" : ""}</small></div>)}
    </div>
    <form className="compose" onSubmit={send}><textarea className="input area" rows={2} maxLength={1000} placeholder={placeholder} aria-label="متن پیام" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn primary" disabled={busy || !text.trim()}>{busy ? "…" : "ارسال"}</button></form>
    {err && <p className="warn" role="alert">{err}</p>}
  </div>;
}
