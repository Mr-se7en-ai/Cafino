// صفحهٔ «اطلاعیه و تیکت»: دریافت از پنل مرکزی، گفت‌وگوی تیکت، ساخت تیکت جدید. همه‌چیز از حافظهٔ محلی خوانده می‌شود،
// پس بدون اینترنت هم کار می‌کند؛ ثبت‌های جدید از صف آفلاین می‌روند.
import React, { useState, useEffect, useMemo, useRef } from "react";
import Icon from "../components/Icon.jsx";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { formatLogTimestamp } from "../app/core/activity.js";
import { useDataSync } from "../app/domain/sales.jsx";
import { isGuestMode } from "../guest/guestMode.js";
import { isApiConnected } from "../services/api/client.js";
import {
  SEVERITIES, TICKET_STATUS, TICKET_CATEGORIES, TICKET_PRIORITIES, getInbox, refreshInbox, unreadSummary, ticketUnread, announcementUnread,
  markAnnouncementRead, markAllAnnouncementsRead, markTicketSeen, createTicket, replyTicket, setTicketStatus, canWrite,
} from "./inbox.js";

const SEV = { info: "#60a5fa", warning: "#fbbf24", critical: "#f87171" };
const ST_COLOR = { open: "#60a5fa", pending: "#fbbf24", answered: "#34d399", closed: "#94a3b8" };
const Pill = ({ color, children, ...r }) => <span {...r} style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: 20, padding: "1px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;

export function useInbox() {
  const [, force] = useState(0);
  useDataSync(() => force((n) => n + 1));
  return getInbox();
}

// نوار اطلاعیهٔ فوری زیر هدر (در MainApp)
export function UrgentAnnouncementBar({ onOpen }) {
  const inbox = useInbox();
  const s = unreadSummary(inbox);
  const a = s.critical[0];
  if (!a) return null;
  return (
    <div data-testid="urgent-bar" role="alert" className="no-print" style={{ background: "linear-gradient(90deg,#991b1b,#dc2626)", color: "#fff", padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700 }}>
      <Icon name="Megaphone" size={16} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}{s.critical.length > 1 ? ` (و ${toFA(s.critical.length - 1)} اطلاعیهٔ فوری دیگر)` : ""}</span>
      <button data-testid="urgent-open" onClick={onOpen} style={{ ...BTN("#fff", "#991b1b"), padding: "4px 12px", fontSize: 12 }}>مشاهده</button>
      <button data-testid="urgent-dismiss" onClick={() => markAnnouncementRead(a.id)} title="خواندم" aria-label="خواندم" style={{ ...BTN("transparent", "#fff"), padding: "2px 8px", fontSize: 16, border: "1px solid #fff8" }}>×</button>
    </div>
  );
}

export function InboxBadge({ style }) {
  const inbox = useInbox();
  const n = unreadSummary(inbox).total;
  if (!n) return null;
  return <span data-testid="inbox-badge" style={{ background: "#dc2626", color: "#fff", borderRadius: 10, minWidth: 18, height: 18, padding: "0 5px", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}>{toFA(n)}</span>;
}

function AnnouncementCard({ a, unread, open, onToggle }) {
  const color = SEV[a.severity] || SEV.info;
  return (
    <div data-testid="ann-item" data-id={a.id} data-severity={a.severity} data-unread={unread ? "1" : "0"} style={{ background: "var(--bg-app)", borderRadius: 12, padding: "12px 14px", borderInlineStart: `4px solid ${color}` }}>
      <button onClick={onToggle} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box" }}>
        {unread && <span title="خوانده‌نشده" style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 14, fontWeight: unread ? 800 : 600, color: "var(--text-primary)" }}>{a.pinned ? "📌 " : ""}{a.title}</span>
        <Pill color={color}>{SEVERITIES[a.severity]}</Pill>
      </button>
      <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>{formatLogTimestamp(a.publishedAt)}</div>
      {open && <div style={{ marginTop: 8, fontSize: 13, lineHeight: 2, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
        {a.body}
        {a.link && <div style={{ marginTop: 6 }}><a href={a.link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>باز کردن پیوند ↗</a></div>}
      </div>}
    </div>
  );
}

function Announcements({ inbox }) {
  const [open, setOpen] = useState(null);
  const list = inbox.announcements;
  const unread = list.filter((a) => announcementUnread(a, inbox.seen.ann)).length;
  const toggle = (a) => { const next = open === a.id ? null : a.id; setOpen(next); if (next) markAnnouncementRead(a.id); };
  if (!list.length) return <Empty icon="Megaphone" text="اطلاعیه‌ای وجود ندارد." sub={inbox.supported.announcements === false ? "پنل مرکزی هنوز اطلاعیه‌ها را پشتیبانی نمی‌کند." : "اطلاعیه‌های پنل مرکزی همین‌جا نمایش داده می‌شود."} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {unread > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
        <span>{toFA(unread)} اطلاعیهٔ خوانده‌نشده</span>
        <button data-testid="ann-readall" onClick={markAllAnnouncementsRead} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "4px 12px", fontSize: 11.5 }}>همه را خوانده کن</button>
      </div>}
      {list.map((a) => <AnnouncementCard key={a.id} a={a} unread={announcementUnread(a, inbox.seen.ann)} open={open === a.id} onToggle={() => toggle(a)} />)}
    </div>
  );
}

function Empty({ icon, text, sub }) {
  return <div data-testid="inbox-empty" style={{ textAlign: "center", padding: "34px 10px", color: "var(--text-muted)" }}>
    <Icon name={icon} size={30} style={{ opacity: 0.5 }} />
    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: "var(--text-secondary)" }}>{text}</div>
    {sub && <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.9 }}>{sub}</div>}
  </div>;
}

function NewTicket({ onDone, onCancel }) {
  const [f, setF] = useState({ subject: "", body: "", category: "technical", priority: "normal" });
  const [err, setErr] = useState("");
  const submit = (e) => { e.preventDefault(); const r = createTicket(f); if (!r.ok) { setErr(r.error); return; } onDone(r.ticket); };
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form data-testid="ticket-form" onSubmit={submit} style={{ background: "var(--bg-app)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--accent-light)" }}>تیکت جدید</div>
      <label style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>موضوع<input data-testid="tk-subject" value={f.subject} onChange={set("subject")} maxLength={200} style={INP} placeholder="مثلاً: مشکل در چاپ فاکتور" /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>دسته<select data-testid="tk-category" value={f.category} onChange={set("category")} style={INP}>{Object.entries(TICKET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>اولویت<select data-testid="tk-priority" value={f.priority} onChange={set("priority")} style={INP}>{Object.entries(TICKET_PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <label style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>شرح مشکل یا درخواست<textarea data-testid="tk-body" value={f.body} onChange={set("body")} rows={5} maxLength={8000} style={{ ...INP, resize: "vertical", lineHeight: 1.9 }} /></label>
      {err && <div data-testid="tk-error" style={{ color: "#f87171", fontSize: 12.5 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button data-testid="tk-submit" type="submit" style={{ ...BTN("#2563eb"), padding: "10px 22px" }}>ارسال تیکت</button>
        <button type="button" onClick={onCancel} style={{ ...BTN("var(--border)", "var(--text-secondary)") }}>انصراف</button>
      </div>
      {isApiConnected() && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>اگر اینترنت قطع باشد، تیکت در دستگاه نگه‌داری می‌شود و با وصل‌شدن خودکار ارسال می‌شود.</div>}
    </form>
  );
}

function Thread({ ticket, seen, onBack }) {
  const [text, setText] = useState(""), [err, setErr] = useState("");
  const endRef = useRef(null);
  useEffect(() => { markTicketSeen(ticket.id); }, [ticket.id, ticket.messages.length]);
  useEffect(() => { try { endRef.current?.scrollIntoView?.({ block: "nearest" }); } catch { /* ignore */ } }, [ticket.messages.length]);
  const closed = ticket.status === "closed";
  const send = (e) => { e.preventDefault(); const r = replyTicket(ticket.id, text); if (!r.ok) { setErr(r.error); return; } setErr(""); setText(""); };
  return (
    <div data-testid="ticket-thread" data-id={ticket.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button data-testid="tk-back" onClick={onBack} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}><Icon name="ArrowRight" size={14} />بازگشت به تیکت‌ها</button>
        <div style={{ flex: 1 }} />
        {closed
          ? <button data-testid="tk-reopen" onClick={() => setTicketStatus(ticket.id, "open")} style={{ ...BTN("#0d9488"), padding: "6px 14px", fontSize: 12 }}>باز کردن دوباره</button>
          : <button data-testid="tk-close" onClick={() => setTicketStatus(ticket.id, "closed")} style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "6px 14px", fontSize: 12 }}>بستن تیکت</button>}
      </div>
      <div style={{ background: "var(--bg-app)", borderRadius: 12, padding: "10px 14px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{ticket.subject}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
          <Pill color={ST_COLOR[ticket.status]} data-testid="tk-status">{TICKET_STATUS[ticket.status]}</Pill>
          <Pill color="#94a3b8">{TICKET_CATEGORIES[ticket.category]}</Pill>
          {ticket.priority === "high" && <Pill color="#f87171">فوری</Pill>}
          {ticket.number && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>شمارهٔ تیکت: {toFA(ticket.number)}</span>}
          {(ticket.pending || ticket.statusPending) && <span data-testid="tk-pending" style={{ fontSize: 11, color: "#fbbf24" }}>⏳ در انتظار ارسال به پنل مرکزی</span>}
        </div>
      </div>
      <div data-testid="tk-messages" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "52vh", overflowY: "auto", padding: 2 }}>
        {ticket.messages.map((m) => {
          const admin = m.from === "admin";
          return (
            <div key={m.id} data-testid="tk-msg" data-from={m.from} style={{ alignSelf: admin ? "flex-end" : "flex-start", maxWidth: "88%", background: admin ? "#0f766e33" : "#1d4ed833", border: `1px solid ${admin ? "#14b8a655" : "#3b82f655"}`, borderRadius: 12, padding: "8px 12px" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>{admin ? (m.author || "پشتیبانی") : (m.author || "شما")} · {formatLogTimestamp(m.createdAt)}{m.pending ? " · ⏳" : ""}</div>
              <div style={{ fontSize: 13, lineHeight: 2, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{m.body}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {closed
        ? <div style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}><Icon name="Lock" size={14} />این تیکت بسته است. برای ادامه آن را دوباره باز کنید.</div>
        : <form onSubmit={send} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea data-testid="tk-reply" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={8000} placeholder="پاسخ شما…" style={{ ...INP, marginTop: 0, resize: "vertical", flex: 1, lineHeight: 1.9 }} />
          <button data-testid="tk-send" type="submit" disabled={!text.trim()} style={{ ...BTN("#2563eb"), padding: "11px 16px", opacity: text.trim() ? 1 : 0.5, display: "flex", alignItems: "center", gap: 6 }}><Icon name="Send" size={15} />ارسال</button>
        </form>}
      {err && <div style={{ color: "#f87171", fontSize: 12.5 }}>{err}</div>}
    </div>
  );
}

function Tickets({ inbox, openId, setOpenId }) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("all");
  const cur = inbox.tickets.find((t) => t.id === openId);
  if (cur) return <Thread ticket={cur} seen={inbox.seen.ticket} onBack={() => setOpenId(null)} />;
  if (creating) return <NewTicket onCancel={() => setCreating(false)} onDone={(t) => { setCreating(false); setOpenId(t.id); }} />;
  const list = inbox.tickets.filter((t) => filter === "all" ? true : filter === "open" ? t.status !== "closed" : t.status === "closed");
  const writable = canWrite();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {[["all", "همه"], ["open", "باز"], ["closed", "بسته"]].map(([k, l]) => (
          <button key={k} data-testid={`tkf-${k}`} onClick={() => setFilter(k)} style={{ ...BTN(filter === k ? "#2563eb" : "var(--border)", filter === k ? "#fff" : "var(--text-secondary)"), padding: "5px 14px", fontSize: 12 }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button data-testid="tk-new" onClick={() => setCreating(true)} disabled={!writable} title={writable ? "" : "این نسخه به پنل مرکزی وصل نیست"} style={{ ...BTN("#16a34a"), padding: "7px 16px", display: "flex", alignItems: "center", gap: 6, opacity: writable ? 1 : 0.5 }}><Icon name="Plus" size={15} />تیکت جدید</button>
      </div>
      {!list.length && <Empty icon="MessageSquare" text={inbox.tickets.length ? "تیکتی با این فیلتر نیست." : "هنوز تیکتی ندارید."}
        sub={!writable ? "برای ارسال تیکت، برنامه باید به پنل مرکزی متصل باشد (مدیر نصب، نشانی سرور را در config.js تنظیم می‌کند)." : inbox.supported.tickets === false ? "پنل مرکزی هنوز تیکت را پشتیبانی نمی‌کند." : "برای گزارش مشکل یا درخواست، «تیکت جدید» را بزنید."} />}
      {list.map((t) => {
        const un = ticketUnread(t, inbox.seen.ticket);
        const last = t.messages[t.messages.length - 1];
        return (
          <button key={t.id} data-testid="tk-item" data-id={t.id} data-unread={un ? "1" : "0"} onClick={() => setOpenId(t.id)} style={{ all: "unset", cursor: "pointer", boxSizing: "border-box", display: "block", background: "var(--bg-app)", borderRadius: 12, padding: "11px 14px", borderInlineStart: `4px solid ${ST_COLOR[t.status]}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {un && <span title="پاسخ جدید" style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />}
              <span style={{ flex: 1, fontSize: 14, fontWeight: un ? 800 : 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
              <Pill color={ST_COLOR[t.status]}>{TICKET_STATUS[t.status]}</Pill>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {last ? `${last.from === "admin" ? "پشتیبانی" : "شما"}: ${last.body}` : ""}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{formatLogTimestamp(t.updatedAt)}{t.pending ? " · ⏳ در انتظار ارسال" : ""}</div>
          </button>
        );
      })}
    </div>
  );
}

export function InboxPage({ initialTab = "announcements" }) {
  const inbox = useInbox();
  const [tab, setTab] = useState(initialTab), [openId, setOpenId] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const s = useMemo(() => unreadSummary(inbox), [inbox]);
  const guest = isGuestMode(), connected = isApiConnected();
  const refresh = async () => {
    setBusy(true); setMsg("");
    try { const r = await refreshInbox({ force: true }); setMsg(r.skipped === "no-api" ? "این نسخه به پنل مرکزی وصل نیست." : r.skipped === "guest" ? "حالت مهمان: دادهٔ نمونه." : r.ok ? "به‌روز شد." : "دریافت ناموفق بود؛ دادهٔ ذخیره‌شده نمایش داده می‌شود."); }
    catch { setMsg("دریافت ناموفق بود."); }
    setBusy(false);
  };
  const TabBtn = ({ k, label, n }) => (
    <button data-testid={`inbox-tab-${k}`} onClick={() => { setTab(k); setOpenId(null); }} style={{ ...BTN(tab === k ? "#2563eb" : "var(--bg-app)", tab === k ? "#fff" : "var(--text-secondary)"), padding: "8px 18px", fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}>
      {label}{n > 0 && <span data-testid={`inbox-count-${k}`} style={{ background: "#dc2626", color: "#fff", borderRadius: 9, minWidth: 18, height: 18, padding: "0 5px", fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{toFA(n)}</span>}
    </button>
  );
  return (
    <div data-testid="inbox-page" style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon name="Megaphone" size={20} style={{ color: "var(--accent-light)" }} />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--accent-light)" }}>اطلاعیه و تیکت</div>
            <div data-testid="inbox-status" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              {guest ? "حالت مهمان — دادهٔ نمونه" : !connected ? "به پنل مرکزی وصل نیستید" : inbox.lastError ? `آخرین دریافت ناموفق بود (${inbox.lastError.code})` : inbox.lastSync ? `آخرین دریافت: ${formatLogTimestamp(inbox.lastSync)}` : "هنوز دریافت نشده"}
              {msg ? ` · ${msg}` : ""}
            </div>
          </div>
          <button data-testid="inbox-refresh" onClick={refresh} disabled={busy || guest || !connected} title="دریافت از پنل مرکزی" style={{ ...BTN("var(--border)", "var(--text-secondary)"), padding: "7px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6, opacity: busy || guest || !connected ? 0.5 : 1 }}><Icon name="RefreshCw" size={14} />{busy ? "…" : "به‌روزرسانی"}</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <TabBtn k="announcements" label="اطلاعیه‌ها" n={s.announcements} />
          <TabBtn k="tickets" label="تیکت‌ها" n={s.tickets} />
        </div>
        {tab === "announcements" ? <Announcements inbox={inbox} /> : <Tickets inbox={inbox} openId={openId} setOpenId={setOpenId} />}
      </div>
    </div>
  );
}
