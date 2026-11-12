// Dedicated voice-assistant UI (separate from the smart chat-bot). It owns: the floating mic button,
// the assistant panel (live transcript, conversation, intent confirmation card, history/undo, settings),
// speech recognition + optional spoken replies. All decisions come from the Intent dialog (dialog.js).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createDialog, INITIAL_STATE } from "./dialog.js";
import { INTENT_BY_ID, SALE_LIKE } from "./intents.js";
import { TABS } from "./lexicon.js";
import { toLatinDigits } from "./normalize.js";
import { speechRecognitionErrorMessage, startPersianSpeechRecognition } from "../services/speechRecognition.js";

export const VOICE_CFG_KEY = "cafenet_voice_cfg";
const DEFAULT_CFG = { autoRun: false, speak: true, handsFree: true, showIntent: false };
const EXAMPLES = ["هزینه ۵۰۰ هزار تومان بابت کاغذ", "مشتری جدید علی رضایی ۰۹۱۲۱۲۳۴۵۶۷", "درآمد ۲ میلیون تومان پرینت دیروز", "فروش امروز چقدر بود؟"];

const CSS = `
@keyframes va-pulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}70%{box-shadow:0 0 0 16px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
@keyframes va-bar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
@keyframes va-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.va-bars{display:flex;gap:3px;align-items:center;height:22px}
.va-bars i{display:block;width:3px;height:100%;border-radius:2px;background:#fff;animation:va-bar .9s ease-in-out infinite}
.va-bars i:nth-child(2){animation-delay:.12s}.va-bars i:nth-child(3){animation-delay:.24s}.va-bars i:nth-child(4){animation-delay:.36s}.va-bars i:nth-child(5){animation-delay:.48s}
.va-msg{animation:va-in .18s ease-out}
.va-panel button{font-family:inherit}
.va-panel input,.va-panel select{font-family:inherit}
@media (prefers-reduced-motion:reduce){.va-bars i,.va-msg{animation:none}}
`;

const MicSvg = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v4" /><path d="M8 22h8" />
  </svg>
);

function cleanForSpeech(text) {
  return String(text || "").replace(/[«»*_`]/g, " ").replace(/[^\p{L}\p{N}\s.,؟?!،:؛()-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 260);
}
function hasPersianVoice() {
  try { return (window.speechSynthesis?.getVoices?.() || []).some((v) => /^fa/i.test(v.lang)); } catch { return false; }
}

// navSlot: on phones the mic button lives inside the bottom navigation bar (a DOM node owned by the host);
// on desktop it is a floating button at the bottom-left corner.
export default function VoiceAssistant({ getContext, deps, isMobile, navSlot, store, format }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("chat");
  const [st, setSt] = useState(INITIAL_STATE);
  const [cfg, setCfgState] = useState(() => ({ ...DEFAULT_CFG, ...(store?.read?.(VOICE_CFG_KEY, null) || {}) }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speechErr, setSpeechErr] = useState("");
  const [text, setText] = useState("");
  const [ttsOk, setTtsOk] = useState(true);

  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const depsRef = useRef(deps); depsRef.current = deps;
  const ctxRef = useRef(getContext); ctxRef.current = getContext;
  const recRef = useRef(null);
  const lastVoiceRef = useRef(false);
  const spokenRef = useRef(null);
  const feedRef = useRef(null);
  const inputRef = useRef(null);

  const dialog = useMemo(() => {
    const stableDeps = new Proxy({}, { get: (_, k) => (k === "format" ? depsRef.current.format : (...a) => depsRef.current[k]?.(...a)) });
    return createDialog({ getContext: () => ctxRef.current(), deps: stableDeps, getConfig: () => cfgRef.current, onChange: setSt });
  }, []);

  const setCfg = (patch) => { const next = { ...cfgRef.current, ...patch }; setCfgState(next); try { store?.write?.(VOICE_CFG_KEY, next); } catch { /* ignore */ } };

  // ── speech in ──
  const stopListening = () => { try { recRef.current?.stop(); } catch { /* ignore */ } };
  const startListening = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    if (recRef.current && listening) return;
    try {
      recRef.current = startPersianSpeechRecognition({
        interim: true,
        onStart: () => { setListening(true); setSpeechErr(""); setInterim(""); },
        onInterim: (t) => setInterim(t),
        onResult: (t) => { setInterim(""); lastVoiceRef.current = true; dialog.submit(t, { voice: true }); },
        onError: (m) => { setListening(false); setInterim(""); setSpeechErr(m); },
        onEnd: () => { setListening(false); setInterim(""); },
      });
    } catch (e) { setListening(false); setSpeechErr(e?.message || speechRecognitionErrorMessage("not-allowed")); }
  };
  useEffect(() => () => { try { recRef.current?.abort?.(); } catch { /* ignore */ } try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, []);

  // open from outside (dashboard tile / other components) and with Alt+V
  useEffect(() => {
    const onOpen = (e) => { setOpen(true); if (e?.detail?.listen !== false) setTimeout(startListening, 150); };
    const onKey = (e) => { if (e.altKey && (e.key === "v" || e.key === "V" || e.key === "م")) { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("cafenet:voice-assistant", onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("cafenet:voice-assistant", onOpen); window.removeEventListener("keydown", onKey); };
  }, []);  

  useEffect(() => {
    setTtsOk(hasPersianVoice());
    const h = () => setTtsOk(hasPersianVoice());
    try { window.speechSynthesis?.addEventListener?.("voiceschanged", h); return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", h); } catch { return undefined; }
  }, []);

  // ── speech out + hands-free follow-up listening ──
  const last = st.messages[st.messages.length - 1];
  useEffect(() => {
    if (!last || last.role !== "assistant" || spokenRef.current === last.id) return;
    spokenRef.current = last.id;
    if (!lastVoiceRef.current) return;
    const wantsReply = ["ask", "choice", "confirm"].includes(last.kind);
    const after = () => { if (wantsReply && cfgRef.current.handsFree && open) setTimeout(startListening, 250); };
    if (cfgRef.current.speak && ttsOk && "speechSynthesis" in window) {
      try {
        const u = new SpeechSynthesisUtterance(cleanForSpeech(last.text)); u.lang = "fa-IR";
        const v = window.speechSynthesis.getVoices().find((x) => /^fa/i.test(x.lang)); if (v) u.voice = v;
        u.onend = after; u.onerror = after; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      } catch { after(); }
    } else after();
  }, [last?.id]);  

  useEffect(() => { try { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); } catch { /* ignore */ } }, [st.messages.length, st.phase, open, tab]);
  useEffect(() => { if (open && tab === "chat") setTimeout(() => { try { inputRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ } }, 80); }, [open, tab]);
  useEffect(() => { if (st.phase === "ask" || st.phase === "idle") setEditing(false); }, [st.phase]);

  const send = (t, voice = false) => { const v = String(t ?? text).trim(); if (!v) return; lastVoiceRef.current = voice; setText(""); dialog.submit(v); };

  const ctx = open ? getContext() : null;
  const pending = st.pending;
  const def = pending ? INTENT_BY_ID[pending.intent] : null;
  const showCard = !!pending && def?.kind === "write" && ["confirm", "ask", "choice"].includes(st.phase);
  const entryById = (id) => st.history.find((h) => h.id === id);

  const panelStyle = isMobile
    ? { position: "fixed", left: 8, right: 8, bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)", height: "min(640px, calc(100vh - 160px))" }
    : { position: "fixed", left: 24, bottom: 90, width: 410, height: "min(660px, calc(100vh - 120px))" };
  const toggle = () => { if (open) { stopListening(); setOpen(false); } else setOpen(true); };

  const mic = (
    <button data-testid="va-mic" onClick={listening ? stopListening : startListening} aria-label={listening ? "توقف شنیدن" : "شروع گفتن"} aria-pressed={listening}
      style={{ width: 46, height: 46, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", background: listening ? "#dc2626" : "linear-gradient(135deg,#0f766e,#14b8a6)", animation: listening ? "va-pulse 1.4s infinite" : "none" }}>
      {listening ? <span className="va-bars"><i /><i /><i /><i /><i /></span> : <MicSvg />}
    </button>
  );

  return (
    <div className="no-print" data-testid="voice-assistant">
      <style>{CSS}</style>
      {open && (
        <div className="va-panel" role="dialog" aria-label="دستیار صوتی" data-testid="va-panel" style={{ ...panelStyle, zIndex: 170, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "0 22px 56px #000b", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* header */}
          <div style={{ background: "linear-gradient(135deg,#0f766e,#0d9488 55%,#115e59)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "#ffffff26", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><MicSvg size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>دستیار صوتی</div>
              <div data-testid="va-status" style={{ color: "#ccfbf1", fontSize: 10.5 }}>{st.busy ? "در حال اجرا…" : listening ? "در حال شنیدن…" : st.phase === "confirm" ? "منتظر تأیید شما" : st.phase === "ask" || st.phase === "choice" ? "منتظر پاسخ شما" : "آماده — بگویید یا بنویسید"}</div>
            </div>
            <button data-testid="va-settings" title="تنظیمات دستیار" onClick={() => setSettingsOpen((o) => !o)} style={hdrBtn}>⚙️</button>
            <button data-testid="va-close" title="بستن" onClick={() => { stopListening(); setOpen(false); }} style={hdrBtn}>✕</button>
          </div>
          {/* tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg-app)" }}>
            {[["chat", "گفتگو"], ["history", `سابقه${st.history.length ? ` (${format.num(st.history.length)})` : ""}`], ["help", "دستورها"]].map(([k, l]) => (
              <button key={k} data-testid={`va-tab-${k}`} onClick={() => setTab(k)} style={{ flex: 1, padding: "8px 4px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === k ? 800 : 500, background: "transparent", color: tab === k ? "var(--accent-light)" : "var(--text-muted)", borderBottom: tab === k ? "2px solid #14b8a6" : "2px solid transparent" }}>{l}</button>
            ))}
          </div>

          {settingsOpen && (
            <div data-testid="va-settings-box" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg-app)", fontSize: 12, lineHeight: 1.9 }}>
              <Toggle label="ثبت خودکار فرمان‌های مطمئن (بدون پرسش تأیید)" testid="va-cfg-autorun" on={cfg.autoRun} onChange={(v) => setCfg({ autoRun: v })} />
              {cfg.autoRun && <div style={{ fontSize: 10.5, color: "#fbbf24", margin: "0 0 4px" }}>فقط وقتی مبلغ، دسته و ... کاملاً مشخص باشد اجرا می‌شود؛ هر ثبت را می‌توانید با «واگرد» برگردانید.</div>}
              <Toggle label="پاسخ صوتی" testid="va-cfg-speak" on={cfg.speak} onChange={(v) => setCfg({ speak: v })} />
              {cfg.speak && !ttsOk && <div style={{ fontSize: 10.5, color: "#fbbf24", margin: "0 0 4px" }}>صدای فارسی روی این دستگاه نصب نیست؛ پاسخ‌ها فقط نوشته می‌شوند.</div>}
              <Toggle label="بعد از هر پرسش، خودکار دوباره گوش بده (دست‌آزاد)" testid="va-cfg-handsfree" on={cfg.handsFree} onChange={(v) => setCfg({ handsFree: v })} />
              <Toggle label="نمایش ساختار Intent در کارت تأیید" testid="va-cfg-intent" on={cfg.showIntent} onChange={(v) => setCfg({ showIntent: v })} />
            </div>
          )}

          {/* body */}
          {tab === "chat" && (
            <>
              <div ref={feedRef} data-testid="va-feed" style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {!st.messages.length && (
                  <div data-testid="va-empty" style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, lineHeight: 2, padding: "14px 6px" }}>
                    <div style={{ fontSize: 34 }}>🎙️</div>
                    دکمهٔ میکروفون را بزنید و فرمان بگویید، یا در کادر پایین تایپ کنید.
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      {EXAMPLES.map((e) => <button key={e} data-testid="va-example" onClick={() => send(e)} style={chipBtn}>«{e}»</button>)}
                    </div>
                  </div>
                )}
                {st.messages.map((m) => <Bubble key={m.id} m={m} entry={m.entryId ? entryById(m.entryId) : null} onUndo={() => dialog.undoEntry(m.entryId)} />)}
                {interim && <div data-testid="va-interim" style={{ alignSelf: "flex-start", maxWidth: "88%", fontSize: 12.5, color: "var(--text-muted)", fontStyle: "italic", padding: "4px 10px" }}>🎙️ {interim}…</div>}
                {st.busy && <div style={{ alignSelf: "flex-end", fontSize: 12, color: "var(--text-muted)" }}>در حال اجرا…</div>}
                {st.phase === "choice" && st.options && (
                  <div data-testid="va-options" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {st.options.map((o, i) => <button key={String(o.value)} data-testid="va-option" onClick={() => { lastVoiceRef.current = false; dialog.choose(o.value); }} style={{ ...chipBtn, padding: "7px 12px" }}>{format.num(i + 1)}) {o.label}</button>)}
                  </div>
                )}
                {showCard && ctx && (
                  <IntentCard pending={pending} def={def} ctx={ctx} format={format} cfg={cfg} editing={editing || pending.missing.length > 0 || Object.keys(pending.errors || {}).length > 0} setEditing={setEditing}
                    onEdit={(k, v) => dialog.edit(k, v)} onConfirm={() => { lastVoiceRef.current = false; dialog.confirm(); }} onCancel={() => dialog.cancel()} busy={st.busy}
                    onOpenForm={deps.openForm && deps.canOpenForm?.(pending.intent, pending.slots) ? () => { const ok = deps.openForm(pending.intent, pending.slots); if (ok) { dialog.cancel("فرم مربوط باز شد؛ مقادیر را بازبینی و ثبت کنید."); setOpen(false); } } : null} />
                )}
              </div>
              {speechErr && <div role="status" data-testid="va-speech-error" style={{ padding: "4px 14px", fontSize: 11, color: "#fbbf24" }}>{speechErr}</div>}
              <div style={{ display: "flex", gap: 8, padding: "8px 12px 12px", alignItems: "center", borderTop: "1px solid var(--border)" }}>
                {mic}
                <input ref={inputRef} data-testid="va-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder={st.phase === "confirm" ? "«تأیید» یا «لغو»، یا مقدار جدید…" : st.phase === "ask" ? "پاسخ را بگویید یا بنویسید…" : "فرمان را بگویید یا بنویسید…"}
                  style={{ flex: 1, minWidth: 0, background: "var(--bg-app)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 12px", fontSize: 13 }} />
                <button data-testid="va-send" onClick={() => send()} disabled={!text.trim() || st.busy} style={{ border: "none", borderRadius: 10, padding: "0 14px", height: 42, background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: !text.trim() || st.busy ? 0.5 : 1 }}>ارسال</button>
              </div>
            </>
          )}

          {tab === "history" && (
            <div data-testid="va-history" style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {!st.history.length && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, padding: 24 }}>هنوز چیزی با دستیار ثبت نشده است.</div>}
              {st.history.map((h) => (
                <div key={h.id} data-testid="va-history-item" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "9px 12px", background: "var(--bg-app)", opacity: h.undone ? 0.55 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.icon} {h.label}{h.undone ? " (برگشت داده شد)" : ""}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{new Date(h.ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0", lineHeight: 1.8 }}>{h.say}</div>
                  {h.raw && <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>«{h.raw}»</div>}
                  {!h.undone && (h.undo
                    ? <button data-testid="va-history-undo" onClick={() => dialog.undoEntry(h.id)} style={{ ...chipBtn, marginTop: 6, color: "#f87171" }}>↩ واگرد</button>
                    : h.undoNote && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>{h.undoNote}</div>)}
                </div>
              ))}
            </div>
          )}

          {tab === "help" && (
            <div data-testid="va-help" style={{ flex: 1, overflowY: "auto", padding: 14, fontSize: 12.5, lineHeight: 2 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>چه چیزهایی را می‌فهمم؟</div>
              {["هزینه / درآمد: «هزینه ۵۰۰ هزار تومان بابت کاغذ»", "مشتری: «مشتری جدید علی رضایی ۰۹۱۲۱۲۳۴۵۶۷»", "فروش: «فروش ۲ برگ پرینت رنگی ۱۵ هزار تومان به علی رضایی»", "دریافت وجه: «دریافت وجه فاکتور شماره ۱۰۲۳» یا «علی رضایی ۵۰۰ هزار تومان پرداخت کرد»", "انبار: «۵ بسته کاغذ A4 وارد انبار شد» / «۲ عدد کارتریج از انبار خارج کن»", "فرم‌ها و بخش‌ها: «سفارش جدید»، «فاکتور جدید»، «فروش شارژ»، «باز کن گزارش‌ها»", "پرسش: «فروش امروز چقدر بود؟»، «بدهکارها؟»", "برگرداندن: «آخری رو پاک کن»"].map((x) => <div key={x} style={{ borderBottom: "1px dashed var(--border)", padding: "3px 0" }}>{x}</div>)}
              <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 11.5 }}>مبلغ را به ریال یا تومان بگویید (بدون واحد = واحد پولی تنظیمات). تاریخ‌هایی مثل «دیروز»، «۳ روز پیش» و «۲۵ مهر» پشتیبانی می‌شود. هر ثبت مالی قبل از اجرا نمایش داده می‌شود و با «واگرد» برمی‌گردد. میانبر: Alt+V.</div>
            </div>
          )}
        </div>
      )}
      {!isMobile && (
        <button data-testid="va-fab" className="no-print" onClick={toggle} title="دستیار صوتی (Alt+V)" aria-label="دستیار صوتی"
          style={{ position: "fixed", left: 24, bottom: 24, zIndex: 171, width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", background: listening ? "#dc2626" : "linear-gradient(135deg,#0f766e,#14b8a6)", boxShadow: "0 8px 24px #0007", animation: listening ? "va-pulse 1.4s infinite" : "none" }}>
          {open ? <span style={{ fontSize: 20 }}>✕</span> : <MicSvg size={24} />}
        </button>
      )}
      {isMobile && navSlot && createPortal(
        <>
          <button data-testid="va-nav-mic" onClick={toggle} aria-label="دستیار صوتی" aria-pressed={open}
            style={{ position: "absolute", left: "50%", top: -20, transform: "translateX(-50%)", width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", background: listening ? "#dc2626" : "linear-gradient(135deg,#0f766e,#14b8a6)", boxShadow: "0 0 0 6px var(--bg-card), 0 8px 18px #0f766e88", animation: listening ? "va-pulse 1.4s infinite" : "none", WebkitTapHighlightColor: "transparent", zIndex: 2 }}>
            {listening ? <span className="va-bars"><i /><i /><i /><i /><i /></span> : open ? <span style={{ fontSize: 20 }}>✕</span> : <MicSvg size={25} />}
          </button>
          <span aria-hidden="true" style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 11, fontWeight: open ? 700 : 500, color: open || listening ? "#2dd4bf" : "var(--text-muted)", fontFamily: "inherit", pointerEvents: "none" }}>دستیار</span>
        </>,
        navSlot
      )}
    </div>
  );
}

const hdrBtn = { background: "#ffffff1f", border: "none", color: "#fff", cursor: "pointer", fontSize: 15, borderRadius: 8, width: 30, height: 30 };
const chipBtn = { background: "var(--bg-app)", color: "var(--accent-light)", border: "1px solid var(--border)", borderRadius: 14, padding: "5px 11px", fontSize: 12, cursor: "pointer", textAlign: "start" };

function Toggle({ label, on, onChange, testid }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
      <input type="checkbox" data-testid={testid} checked={!!on} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

function Bubble({ m, entry, onUndo }) {
  const me = m.role === "user";
  const tone = m.kind === "error" ? { bg: "#450a0a", fg: "#fca5a5", bd: "#dc2626" } : m.kind === "done" ? { bg: "var(--bg-app)", fg: "var(--text-primary)", bd: "#16a34a" } : { bg: "var(--bg-app)", fg: "var(--text-primary)", bd: "transparent" };
  return (
    <div className="va-msg" data-testid={me ? "va-msg-user" : "va-msg-assistant"} data-kind={m.kind || ""}
      style={{ alignSelf: me ? "flex-start" : "flex-end", maxWidth: "90%", background: me ? "#2563eb" : tone.bg, color: me ? "#fff" : tone.fg, borderRadius: me ? "14px 14px 14px 3px" : "14px 14px 3px 14px", padding: "8px 12px", fontSize: 12.5, lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-word", borderInlineStart: !me && tone.bd !== "transparent" ? `3px solid ${tone.bd}` : "none" }}>
      {me && m.voice && <span style={{ opacity: 0.8 }}>🎙️ </span>}
      {m.kind === "done" && !me && <span>✅ </span>}
      {m.text}
      {m.details?.length > 0 && <ul style={{ margin: "4px 0 0", paddingInlineStart: 18, fontSize: 11.5, opacity: 0.9 }}>{m.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
      {m.kind === "done" && m.undoable && entry && !entry.undone && <div><button data-testid="va-undo" onClick={onUndo} style={{ ...chipBtn, marginTop: 6, color: "#f87171", padding: "3px 10px" }}>↩ واگرد</button></div>}
      {m.kind === "done" && entry?.undone && <div style={{ fontSize: 11, opacity: 0.7 }}>(برگشت داده شد)</div>}
    </div>
  );
}

function fmtValue(v, format) {
  if (v && typeof v === "object") {
    if ("money" in v) return <span>{format.money(v.money)}{v.note ? ` (${v.note})` : ""}</span>;
    if ("date" in v) return format.date(v.date);
    if ("ltr" in v) return <span dir="ltr">{v.ltr}</span>;
    if ("num" in v) return v.raw ? <span dir="ltr">{v.num}</span> : format.num(v.num);
  }
  return String(v ?? "—");
}

function IntentCard({ pending, def, ctx, format, cfg, editing, setEditing, onEdit, onConfirm, onCancel, onOpenForm, busy }) {
  const errs = pending.errors || {};
  const rows = def.summary(pending.slots, ctx);
  const canConfirm = !pending.missing.length && !Object.keys(errs).length && !busy;
  const pct = Math.round((pending.confidence || 0) * 100);
  // the machine-readable form of what was understood (shown on request, handy for debugging / trust)
  const plain = { intent: pending.intent, confidence: pending.confidence, slots: Object.fromEntries(Object.entries(pending.slots).filter(([k]) => !["categoryGuess", "before", "isNew"].includes(k))) };
  return (
    <div data-testid="va-card" className="va-msg" style={{ border: "1px solid #14b8a6", background: "var(--bg-app)", borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5 }}>{def.icon} {def.label}</div>
        <span title="اطمینان تشخیص" style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 10, background: pct >= 80 ? "#14532d" : pct >= 55 ? "#713f12" : "#7f1d1d", color: "#fff" }}>اطمینان {format.num(pct)}٪</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 12px", fontSize: 12.5, marginBottom: 6 }}>
        {rows.map(([k, v], i) => <React.Fragment key={i}><span style={{ color: "var(--text-muted)" }}>{k}</span><b style={{ fontWeight: 600 }}>{fmtValue(v, format)}</b></React.Fragment>)}
      </div>
      {(pending.warnings || []).map((w, i) => <div key={i} data-testid="va-warning" style={{ fontSize: 11.5, color: "#fbbf24", lineHeight: 1.8 }}>⚠️ {w}</div>)}
      {Object.values(errs).map((e, i) => <div key={i} data-testid="va-error" style={{ fontSize: 11.5, color: "#f87171", lineHeight: 1.8 }}>⛔ {e}</div>)}
      {pending.missing.length > 0 && <div style={{ fontSize: 11.5, color: "#f87171" }}>اطلاعات ناقص: {pending.missing.map((k) => def.fields.find((f) => f.name === k)?.label || k).join("، ")}</div>}

      {editing && (
        <div data-testid="va-edit-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          {def.fields.map((f) => <Field key={f.name} f={f} pending={pending} ctx={ctx} format={format} err={errs[f.name] || (pending.missing.includes(f.name) ? "لازم است" : "")} onEdit={onEdit} />)}
        </div>
      )}
      {cfg.showIntent && <pre dir="ltr" data-testid="va-intent-json" style={{ margin: "8px 0 0", fontSize: 10.5, background: "#0b1220", color: "#a5f3fc", borderRadius: 8, padding: 8, overflowX: "auto", textAlign: "left" }}>{JSON.stringify(plain, null, 2)}</pre>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button data-testid="va-confirm" disabled={!canConfirm} onClick={onConfirm} style={{ flex: 1, minWidth: 90, border: "none", borderRadius: 9, padding: "9px 12px", background: "#16a34a", color: "#fff", fontWeight: 800, cursor: canConfirm ? "pointer" : "not-allowed", opacity: canConfirm ? 1 : 0.45 }}>✅ ثبت</button>
        <button data-testid="va-edit" onClick={() => setEditing(!editing)} style={{ ...chipBtn, borderRadius: 9, padding: "9px 12px" }}>✏️ {editing ? "بستن ویرایش" : "ویرایش"}</button>
        {onOpenForm && <button data-testid="va-open-form" onClick={onOpenForm} style={{ ...chipBtn, borderRadius: 9, padding: "9px 12px" }}>🧾 در فرم</button>}
        <button data-testid="va-cancel" onClick={onCancel} style={{ ...chipBtn, borderRadius: 9, padding: "9px 12px", color: "#f87171" }}>✖ لغو</button>
      </div>
    </div>
  );
}

const inp = { width: "100%", boxSizing: "border-box", background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 9px", fontSize: 12.5 };

function Field({ f, pending, ctx, format, err, onEdit }) {
  const v = pending.slots[f.name];
  const lab = <div style={{ fontSize: 10.5, color: err ? "#f87171" : "var(--text-muted)", marginBottom: 2 }}>{f.label}{f.name === "amount" || f.type === "money" ? ` (${format.unitLabel()})` : ""}</div>;
  const wrap = (node) => <div style={{ gridColumn: f.type === "text" && f.name !== "unit" ? "1 / -1" : "auto" }}>{lab}{node}</div>;
  const border = err ? { borderColor: "#dc2626" } : null;
  if (f.type === "money") {
    return wrap(<input data-testid={`va-f-${f.name}`} dir="ltr" inputMode="numeric" value={v ? String(format.toDisplay(v)) : ""} placeholder="0" style={{ ...inp, ...border, textAlign: "left" }}
      onChange={(e) => { const n = Number(toLatinDigits(e.target.value).replace(/[^\d.]/g, "")) || 0; onEdit(f.name, format.fromDisplay(n)); }} />);
  }
  if (f.type === "number") {
    return wrap(<input data-testid={`va-f-${f.name}`} dir="ltr" inputMode="decimal" value={v ?? ""} style={{ ...inp, ...border, textAlign: "left" }} onChange={(e) => onEdit(f.name, Number(toLatinDigits(e.target.value).replace(/[^\d.]/g, "")) || 0)} />);
  }
  if (f.type === "phone") {
    return wrap(<input data-testid={`va-f-${f.name}`} dir="ltr" inputMode="tel" value={v ?? ""} style={{ ...inp, ...border, textAlign: "left" }} onChange={(e) => onEdit(f.name, toLatinDigits(e.target.value).replace(/[^\d]/g, "").slice(0, 11))} />);
  }
  if (f.type === "text") {
    return wrap(<input data-testid={`va-f-${f.name}`} value={v ?? ""} style={{ ...inp, ...border }} onChange={(e) => onEdit(f.name, f.name === "invoiceNo" ? toLatinDigits(e.target.value).replace(/\D/g, "") : e.target.value)} />);
  }
  if (f.type === "time") {
    return wrap(<input data-testid={`va-f-${f.name}`} type="time" dir="ltr" value={v ?? ""} style={{ ...inp, ...border, textAlign: "left" }} onChange={(e) => onEdit(f.name, e.target.value)} />);
  }
  if (f.type === "date") {
    const opts = f.future ? [["امروز", ctx.today], ["فردا", shiftIso(ctx.today, 1)], ["پس‌فردا", shiftIso(ctx.today, 2)]] : [["امروز", ctx.today], ["دیروز", shiftIso(ctx.today, -1)], ["پریروز", shiftIso(ctx.today, -2)]];
    return wrap(
      <div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {opts.map(([l, iso]) => <button key={iso} data-testid="va-date-chip" onClick={() => onEdit("date", iso)} style={{ ...chipBtn, padding: "3px 8px", fontSize: 11, background: v === iso ? "#0f766e" : "var(--bg-card)", color: v === iso ? "#fff" : "var(--accent-light)" }}>{l}</button>)}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{format.date(v)}</div>
      </div>
    );
  }
  let options = f.options || [];
  if (f.optionsFrom) options = (ctx.categories?.[f.optionsFrom] || []).map((c) => [c, c]);
  if (f.type === "customer") {
    options = [...(f.name === "customerId" && SALE_LIKE.has(pending.intent) ? [["", "مشتری نقدی (بدون مشتری)"]] : [["__none", "— انتخاب کنید —"]]), ...(ctx.customers || []).map((c) => [String(c.id), `${c.firstName || ""} ${c.lastName || ""}`.trim()])];
    return wrap(<select data-testid={`va-f-${f.name}`} value={v == null ? (SALE_LIKE.has(pending.intent) ? "" : "__none") : String(v)} style={{ ...inp, ...border }}
      onChange={(e) => { const raw = e.target.value; const c = (ctx.customers || []).find((x) => String(x.id) === raw); onEdit("customerId", raw === "" || raw === "__none" ? null : c ? c.id : raw); }}>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>);
  }
  if (f.type === "tab") options = TABS.map((t) => [t.key, t.label]);
  return wrap(<select data-testid={`va-f-${f.name}`} value={v ?? ""} style={{ ...inp, ...border }} onChange={(e) => { onEdit(f.name, e.target.value); if (f.type === "tab") onEdit("tabLabel", TABS.find((t) => t.key === e.target.value)?.label || ""); }}>
    {!options.some(([k]) => k === v) && <option value={v ?? ""}>{v || "— انتخاب کنید —"}</option>}
    {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select>);
}

function shiftIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
