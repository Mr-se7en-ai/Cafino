// تنظیمات ← اتصال ← «مینی‌اپ تلگرام» / «مینی‌اپ بله» (1.86): هر کافی‌نت ربات خودش را وصل می‌کند و مینی‌اپ مخصوص خودش را راه می‌اندازد.
// توکن فقط یک‌بار فرستاده می‌شود و روی سرور رمزنگاری می‌ماند؛ هرگز به برنامه برنمی‌گردد. بدون سرور فقط راهنما نشان داده می‌شود.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../components/Icon.jsx";
import { BTN } from "../app/core/constants.js";
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { card, sub, Note, Pill, msgOf, smallBtn } from "./ui.jsx";
import { miniapp } from "./miniappApi.js";
import { qrSvg } from "./qr.js";
import { isTokenShape } from "../bots/botsApi.js";
import { MINI_BOT_HOWTO, statusOfMini } from "./miniappBotMeta.js";

export default function MiniappBotPage({ provider }) {
  const connected = isApiConnected(), guest = isGuestMode(), how = MINI_BOT_HOWTO[provider] || MINI_BOT_HOWTO.telegram;
  const [data, setData] = useState(null), [err, setErr] = useState(""), [ok, setOk] = useState(""), [token, setToken] = useState(""), [busy, setBusy] = useState(""), [edit, setEdit] = useState(false);
  const reload = useCallback(async () => { try { setData(await miniapp.cafeBots()); setErr(""); } catch (e) { setErr(msgOf(e)); } }, []);
  useEffect(() => { if (connected && !guest) reload(); }, [connected, guest, reload]);
  const s = data?.providers?.find((p) => p.provider === provider);
  const link = s?.startLink || s?.botLink || "";
  const svg = useMemo(() => (link ? qrSvg(link, { ecc: "Q" }) : ""), [link]);
  const run = async (key, fn, done) => { setBusy(key); setErr(""); setOk(""); try { const r = await fn(); if (done) setOk(typeof done === "function" ? done(r) : done); await reload(); } catch (e) { setErr(msgOf(e)); } finally { setBusy(""); } };
  const connect = () => run("connect", async () => { const r = await miniapp.connectCafeBot(provider, token.trim()); setToken(""); setEdit(false); return r; }, (r) => (r?.warning ? `ربات متصل شد، ولی: ${r.warning}` : "ربات متصل شد و مینی‌اپ شما با همین ربات کار می‌کند."));
  const disconnect = () => { if (window.confirm(`اتصال ربات ${how.label} و توکن ذخیره‌شده حذف شود؟ مشتریان و سفارش‌ها می‌مانند؛ فقط ورود از این ربات بسته می‌شود.`)) run("rm", () => miniapp.removeCafeBot(provider), "اتصال حذف شد."); };
  const st = statusOfMini(s, data?.serverReady && data?.httpsOk);
  return (
    <div data-testid={`mbot-page-${provider}`} style={{ maxWidth: 940, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Icon name="Send" size={20} style={{ color: how.color }} /><b style={{ fontSize: 17 }}>مینی‌اپ {how.label} کافی‌نت شما</b></div>
        <div style={sub}>با وصل‌کردن ربات خودتان، مشتری‌های شما مینی‌اپ را از ربات «همین کافی‌نت» باز می‌کنند (نه ربات مشترک کافینو): خدمات و قیمت‌ها، سفارش، پرداخت، گفتگو و مانده حساب. اعلان‌ها هم از همین ربات می‌رسد.</div>
      </div>
      {(!connected || guest)
        ? <div style={card} data-testid="mbot-offline"><Note>{guest ? "در حالت مهمان این بخش در دسترس نیست." : "ربات مینی‌اپ روی سرور کافینو اجرا می‌شود؛ برای راه‌اندازی ابتدا به سرور وصل شوید."}</Note></div>
        : <div style={card} data-testid={`mbot-card-${provider}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 15 }}>ربات {how.label}</b>
            <Pill color={st.color} data-testid={`mbot-status-${provider}`}>{st.text}</Pill>
            {s?.connected && s.botUsername && <span dir="ltr" style={{ ...sub, direction: "ltr" }}>@{s.botUsername}</span>}
            <span style={{ flex: 1 }} />
            {s?.connected && <button onClick={disconnect} style={smallBtn("#7f1d1d")} data-testid={`mbot-remove-${provider}`}>حذف اتصال</button>}
          </div>
          {err && <Note kind="error" data-testid={`mbot-err-${provider}`}>{err}</Note>}
          {ok && <Note kind="ok" data-testid={`mbot-ok-${provider}`}>{ok}</Note>}
          {data && !data.serverReady && <Note kind="warn" data-testid="mbot-server-off">نشانی مینی‌اپ روی سرور تنظیم نشده است (MINIAPP_URL یا PUBLIC_BASE_URL)؛ مدیر سرور باید آن را بگذارد، وگرنه اتصال انجام نمی‌شود. راهنما: server/MINIAPP-fa.md</Note>}
          {data && data.serverReady && !data.httpsOk && <Note kind="warn">نشانی مینی‌اپ باید با https شروع شود؛ پیام‌رسان‌ها مینی‌اپ را روی http باز نمی‌کنند.</Note>}
          {s?.connected && s.lastError && <Note kind="warn" data-testid={`mbot-lasterr-${provider}`}>آخرین خطا: {s.lastError}</Note>}

          {(!s?.connected || edit) && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {!s?.connected && <ol style={{ margin: 0, paddingInlineStart: 18, ...sub, lineHeight: 2 }}>{how.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>}
            {!s?.connected && <Note kind="warn">{how.note}</Note>}
            <input dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AAxxxxxxxxxxxxxxxxxxxx" autoComplete="off" spellCheck={false} aria-label={`توکن ربات ${how.label}`} data-testid={`mbot-token-${provider}`}
              style={{ background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text-primary)", fontFamily: "monospace", fontSize: 13 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={connect} disabled={!isTokenShape(token) || busy === "connect"} data-testid={`mbot-connect-${provider}`} style={{ ...BTN("#16a34a", "#fff"), opacity: isTokenShape(token) ? 1 : 0.5 }}>{busy === "connect" ? "در حال اتصال…" : s?.connected ? "تعویض توکن" : "اتصال و راه‌اندازی مینی‌اپ"}</button>
              {edit && <button onClick={() => { setEdit(false); setToken(""); }} style={BTN("var(--bg-app)", "var(--text-secondary)")}>انصراف</button>}
            </div>
            <div style={sub}>توکن فقط یک‌بار فرستاده و روی سرور رمزنگاری می‌شود؛ بعد از آن هیچ‌جا نمایش داده نمی‌شود. هر ربات فقط برای یک کار و یک کافی‌نت می‌تواند باشد.</div>
          </div>}

          {s?.connected && !edit && <>
            <div style={{ ...sub, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span>توکن: <span dir="ltr">••••{s.tokenHint}</span></span>
              <button onClick={() => setEdit(true)} style={smallBtn("var(--bg-app)", "var(--text-secondary)", { border: "1px solid var(--border)" })} data-testid={`mbot-edit-${provider}`}>تعویض توکن</button>
              <button disabled={!!busy} onClick={() => run("check", () => miniapp.checkCafeBot(provider), "اتصال سالم است و ربات دوباره تنظیم شد.")} style={smallBtn("#2563eb")} data-testid={`mbot-check-${provider}`}>بررسی اتصال</button>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" data-testid={`mbot-toggle-${provider}`} checked={!!s.enabled} disabled={!!busy} onChange={(e) => run("toggle", () => miniapp.setCafeBot(provider, e.target.checked), e.target.checked ? "ربات روشن شد." : "ربات خاموش شد؛ ورود از این ربات بسته است.")} /> ربات مینی‌اپ فعال باشد</label>
            {link && <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
              <div data-testid={`mbot-qr-${provider}`} style={{ width: 130, height: 130, flex: "none", borderRadius: 12, overflow: "hidden", border: `3px solid ${how.color}`, background: "#fff" }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg width="100%" height="100%" ') }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
                <div style={sub}>لینک ربات شما (برای مشتری‌ها بفرستید یا QR را چاپ کنید):</div>
                <div dir="ltr" data-testid={`mbot-link-${provider}`} style={{ direction: "ltr", fontFamily: "monospace", fontSize: 12.5, userSelect: "all", wordBreak: "break-all" }}>{link}</div>
                <div style={sub}>مشتری ربات را باز می‌کند، Start می‌زند و از دکمهٔ منوی ربات، مینی‌اپ را می‌بیند. برای دریافت اعلان باید یک‌بار Start زده باشد.</div>
              </div>
            </div>}
            <div style={sub}>ربات هر چند ثانیه یک‌بار پیام‌ها را از {how.label} می‌گیرد (بدون وب‌هوک). {s.lastOkAt ? "آخرین پرسش موفق: " + new Date(s.lastOkAt).toLocaleString("fa-IR") : "هنوز پرسشی انجام نشده."}</div>
          </>}
        </div>}
    </div>
  );
}
