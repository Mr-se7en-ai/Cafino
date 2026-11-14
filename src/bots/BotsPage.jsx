// «ربات‌های گزارش (بله و تلگرام)»: اتصال ربات، پیوند چت با کد یک‌بارمصرف، گزارش روزانه و ارسال فوری.
// ربات روی سرور کار می‌کند (توکن رمزنگاری‌شده روی سرور می‌ماند و هرگز به برنامه برنمی‌گردد)؛ بدون سرور فقط راهنما نشان داده می‌شود.
import React, { useState, useEffect, useCallback } from "react";
import Icon from "../components/Icon.jsx";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { card, sub, Note, Pill, msgOf, smallBtn } from "../uploads/ui.jsx";
import { bots, RANGE_LABELS, HOWTO, statusOf, secondsLeft, mmss, isTokenShape } from "./botsApi.js";

function LinkBox({ provider, s, reload, setErr }) {
  const [info, setInfo] = useState(null), [left, setLeft] = useState(0), [busy, setBusy] = useState(false);
  const make = async () => { setBusy(true); try { const r = await bots.link(provider); setInfo(r); setLeft(secondsLeft(r.expiresAt)); await reload(); } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); } };
  useEffect(() => { if (!info) return undefined; const t = setInterval(() => setLeft(secondsLeft(info.expiresAt)), 1000); return () => clearInterval(t); }, [info]);
  useEffect(() => { if (!s.linkPending) return undefined; const t = setInterval(reload, 3000); return () => clearInterval(t); }, [s.linkPending, reload]);
  useEffect(() => { if (s.linked) setInfo(null); }, [s.linked]);
  const live = info && left > 0 && s.linkPending;
  return (
    <div data-testid={`bot-link-${provider}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!live && <div><button onClick={make} disabled={busy} data-testid={`bot-linkbtn-${provider}`} style={BTN("#2563eb", "#fff")}>{busy ? "…" : "ساخت کد اتصال چت"}</button></div>}
      {live && <div style={{ background: "var(--bg-app)", border: "1px dashed var(--border)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={sub}>این پیام را از همان چتی که می‌خواهید گزارش بگیرد برای ربات {s.botUsername ? <b dir="ltr">@{s.botUsername}</b> : "ربات"} بفرستید:</div>
        <div dir="ltr" data-testid={`bot-code-${provider}`} style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, letterSpacing: 2, userSelect: "all" }}>/start {info.code}</div>
        <div style={sub}>اعتبار کد: <b>{toFA(mmss(left))}</b> · یک‌بارمصرف است{info.botLink ? <> · <a href={info.botLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>باز کردن ربات</a></> : null}</div>
        <div style={sub}>پس از ارسال، این صفحه خودکار به‌روز می‌شود.</div>
      </div>}
    </div>
  );
}

function Provider({ provider, s, reload, token: tokenCfg }) {
  const [token, setToken] = useState(""), [err, setErr] = useState(""), [okMsg, setOk] = useState(""), [busy, setBusy] = useState(""), [edit, setEdit] = useState(false);
  const how = HOWTO[provider], st = statusOf(s);
  const run = async (key, fn, done) => { setBusy(key); setErr(""); setOk(""); try { await fn(); if (done) setOk(done); await reload(); } catch (e) { setErr(msgOf(e)); } finally { setBusy(""); } };
  const connect = () => run("connect", async () => { await bots.connect(provider, token.trim()); setToken(""); setEdit(false); }, "ربات متصل شد.");
  const patch = (b) => run("patch", () => bots.patch(provider, b));
  const disconnect = () => { if (window.confirm(`اتصال ربات ${s.label} و توکن ذخیره‌شده حذف شود؟`)) run("rm", () => bots.remove(provider), "اتصال حذف شد."); };
  const unlink = () => { if (window.confirm("چت از ربات جدا شود؟ گزارش روزانه هم خاموش می‌شود.")) run("unlink", () => bots.unlink(provider), "چت جدا شد."); };
  return (
    <div style={card} data-testid={`bot-card-${provider}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Icon name="Send" size={18} style={{ color: "var(--accent-light)" }} /><b style={{ fontSize: 15 }}>{s.label}</b>
        <Pill color={st.color} data-testid={`bot-status-${provider}`}>{st.text}</Pill>
        {s.connected && s.botUsername && <span dir="ltr" style={{ ...sub, direction: "ltr" }}>@{s.botUsername}</span>}
        <span style={{ flex: 1 }} />
        {s.connected && <button onClick={disconnect} style={smallBtn("#7f1d1d")} data-testid={`bot-remove-${provider}`}>حذف اتصال</button>}
      </div>
      {err && <Note kind="error" data-testid={`bot-err-${provider}`}>{err}</Note>}
      {okMsg && <Note kind="ok">{okMsg}</Note>}
      {s.connected && s.lastError && <Note kind="warn" data-testid={`bot-lasterr-${provider}`}>آخرین خطا: {s.lastError}</Note>}

      {(!s.connected || edit) && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!s.connected && <ol style={{ margin: 0, paddingInlineStart: 18, ...sub, lineHeight: 2 }}>{how.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>}
        {!s.connected && how.note && <Note kind="warn">{how.note}</Note>}
        <input dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AAxxxxxxxxxxxxxxxxxxxx" autoComplete="off" spellCheck={false} aria-label={`توکن ربات ${s.label}`} data-testid={`bot-token-${provider}`} style={{ ...INP, fontFamily: "monospace" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={connect} disabled={!isTokenShape(token) || busy === "connect"} data-testid={`bot-connect-${provider}`} style={{ ...BTN("#16a34a", "#fff"), opacity: isTokenShape(token) ? 1 : 0.5 }}>{busy === "connect" ? "در حال بررسی…" : s.connected ? "تعویض توکن" : "اتصال ربات"}</button>
          {edit && <button onClick={() => { setEdit(false); setToken(""); }} style={BTN("var(--bg-app)", "var(--text-secondary)")}>انصراف</button>}
        </div>
        <div style={sub}>توکن فقط یک‌بار فرستاده و روی سرور رمزنگاری می‌شود؛ بعد از آن هیچ‌جا نمایش داده نمی‌شود. برای ربات اختصاصی بسازید (وب‌هوکِ احتمالی آن ربات پاک می‌شود).</div>
      </div>}

      {s.connected && !edit && <>
        <div style={{ ...sub, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span>توکن: <span dir="ltr">••••{s.tokenHint}</span></span>
          <button onClick={() => setEdit(true)} style={smallBtn("var(--bg-app)", "var(--text-secondary)", { border: "1px solid var(--border)" })} data-testid={`bot-edit-${provider}`}>تعویض توکن</button>
          {s.botLink && <a href={s.botLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>باز کردن ربات</a>}
        </div>

        {!s.linked
          ? <><Note>هنوز چتی به این ربات وصل نیست. کد اتصال بسازید و آن را از چت (خصوصی یا گروه) برای ربات بفرستید.</Note><LinkBox provider={provider} s={s} reload={reload} setErr={setErr} /></>
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid={`bot-linked-${provider}`}>
              <Pill color="#34d399">چت پیوندخورده</Pill><b>{s.chatTitle || "—"}</b><span style={sub}>({s.chatType === "private" ? "خصوصی" : s.chatType ? "گروه" : ""})</span>
              <button onClick={unlink} style={smallBtn("var(--bg-app)", "#f87171", { border: "1px solid var(--border)" })} data-testid={`bot-unlink-${provider}`}>جدا کردن چت</button>
            </div>
            {s.chatType && s.chatType !== "private" && <Note kind="warn">این یک گروه است؛ همهٔ اعضای گروه می‌توانند گزارش مالی را ببینند و فرمان بدهند.</Note>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={sub}>ارسال فوری:</span>
              {RANGE_LABELS.map(([k, l]) => <button key={k} disabled={!!busy} onClick={() => run("send" + k, () => bots.send(provider, k), `گزارش «${l}» فرستاده شد.`)} data-testid={`bot-send-${provider}-${k}`} style={smallBtn("var(--bg-app)", "var(--text-primary)", { border: "1px solid var(--border)" })}>{l}</button>)}
              <button disabled={!!busy} onClick={() => run("test", () => bots.test(provider), "پیام آزمایشی فرستاده شد.")} data-testid={`bot-test-${provider}`} style={smallBtn("#2563eb")}>پیام آزمایشی</button>
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={!!s.dailyEnabled} onChange={(e) => patch({ dailyEnabled: e.target.checked })} data-testid={`bot-daily-${provider}`} /> گزارش روزانهٔ خودکار</label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: s.dailyEnabled ? 1 : 0.5 }}>ساعت ارسال (وقت ایران):
                <input type="time" value={s.dailyTime || "21:00"} disabled={!s.dailyEnabled} onChange={(e) => e.target.value && patch({ dailyTime: e.target.value })} data-testid={`bot-time-${provider}`} style={{ ...INP, width: 120 }} /></label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={!!s.lowStockAlert} onChange={(e) => patch({ lowStockAlert: e.target.checked })} /> هشدار کمبود موجودی در گزارش</label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={!!s.commandsEnabled} onChange={(e) => patch({ commandsEnabled: e.target.checked })} data-testid={`bot-cmds-${provider}`} /> پاسخ به فرمان‌ها (<span dir="ltr">/today ، /debts ، /stock</span> و …)</label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>واحد مبلغ:
                <select value={s.currency} onChange={(e) => patch({ currency: e.target.value })} style={{ ...INP, width: 120 }}><option value="toman">تومان</option><option value="rial">ریال</option></select></label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={!!s.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /> ربات فعال باشد</label>
            </div>
          </div>}
      </>}
    </div>
  );
}

export default function BotsPage() {
  const connected = isApiConnected(), guest = isGuestMode();
  const [data, setData] = useState(null), [err, setErr] = useState("");
  const reload = useCallback(async () => { try { setData(await bots.list()); setErr(""); } catch (e) { setErr(msgOf(e)); } }, []);
  useEffect(() => { if (connected && !guest) reload(); }, [connected, guest, reload]);
  return (
    <div data-testid="bots-page" style={{ maxWidth: 940, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Icon name="Send" size={20} style={{ color: "var(--accent-light)" }} /><b style={{ fontSize: 17 }}>ربات بله و تلگرام</b></div>
        <div style={sub}>گزارش فروش، دریافتی، هزینه، مطالبات و کمبود موجودی را هر شب خودکار در بله یا تلگرام بگیرید، یا هر لحظه با فرمان‌هایی مثل «امروز» و «بدهکاران» از ربات بخواهید. فقط چتی که با کد یک‌بارمصرف پیوند بخورد جواب می‌گیرد.</div>
      </div>
      {(!connected || guest)
        ? <div style={card} data-testid="bots-offline"><Note>{guest ? "در حالت مهمان این بخش در دسترس نیست." : "ربات‌ها روی سرور کافینو اجرا می‌شوند (گزارش‌ها از پایگاه‌دادهٔ سرور ساخته می‌شود)، پس این بخش به اتصال سرور نیاز دارد."}</Note></div>
        : <>
          {err && <Note kind="error" data-testid="bots-error">{err}</Note>}
          {data && !data.schedulerOn && <Note kind="warn">زمان‌بند ربات روی این سرور خاموش است (BOTS_ENABLED=false)؛ گزارش خودکار و پاسخ به فرمان‌ها کار نمی‌کند.</Note>}
          {data?.providers?.map((s) => <Provider key={s.provider} provider={s.provider} s={s} reload={reload} />)}
        </>}
    </div>
  );
}
