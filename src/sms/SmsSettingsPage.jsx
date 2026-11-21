// تنظیمات ← اتصال ← «پیامک»: اتصال پنل ملی پیامکِ خودِ کافی‌نت (برای ارسال پیامک به مشتریان).
// نام کاربری/رمز فقط هنگام ذخیره به سرور می‌رود، آنجا رمزنگاری می‌شود و هرگز به برنامه برنمی‌گردد.
// پیامک «ورود/ثبت‌نام» از حساب پلتفرم است و به این بخش ربطی ندارد.
import React, { useState, useEffect, useCallback } from "react";
import Icon from "../components/Icon.jsx";
import { BTN, INP } from "../app/core/constants.js";
import { toFA } from "../app/core/format.js";
import { isApiConnected } from "../services/api/client.js";
import { isGuestMode } from "../guest/guestMode.js";
import { card, sub, Note, Pill, msgOf, smallBtn } from "../uploads/ui.jsx";
import { sms } from "./smsApi.js";
import { isMobile } from "./smsLogic.js";

const statusPill = (s) => (!s.connected ? { color: "#94a3b8", text: "متصل نیست" } : !s.enabled ? { color: "#fbbf24", text: "خاموش" } : s.lastError ? { color: "#f87171", text: "خطا در آخرین ارسال" } : { color: "#34d399", text: "فعال" });

export default function SmsSettingsPage() {
  const connected = isApiConnected(), guest = isGuestMode();
  const [s, setS] = useState(null), [err, setErr] = useState(""), [ok, setOk] = useState(""), [busy, setBusy] = useState("");
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [from, setFrom] = useState(""), [edit, setEdit] = useState(false);
  const [credit, setCredit] = useState(null), [testTo, setTestTo] = useState("");

  const reload = useCallback(async () => { try { const r = await sms.status(); setS(r); setErr(""); } catch (e) { setErr(msgOf(e)); } }, []);
  useEffect(() => { if (connected && !guest) reload(); }, [connected, guest, reload]);

  const run = async (key, fn, done) => { setBusy(key); setErr(""); setOk(""); try { const r = await fn(); if (done) setOk(done); await reload(); return r; } catch (e) { setErr(msgOf(e)); } finally { setBusy(""); } };
  const save = () => {
    if (!username.trim() || !password || !from.trim()) { setErr("نام کاربری، رمز و شمارهٔ خط را کامل وارد کنید"); return; }
    run("connect", async () => { await sms.connect({ username: username.trim(), password, from: from.trim() }); setPassword(""); setUsername(""); setEdit(false); }, "پنل ملی پیامک متصل شد.");
  };
  const checkCredit = () => run("credit", async () => { const r = await sms.credit(); setCredit(r?.credit ?? null); });
  const sendTest = () => {
    if (!isMobile(testTo)) { setErr("شمارهٔ موبایل آزمایشی معتبر نیست"); return; }
    run("test", () => sms.test(testTo), "پیام آزمایشی فرستاده شد.");
  };
  const disconnect = () => { if (window.confirm("اتصال پنل ملی پیامک و نام کاربری/رمز ذخیره‌شده حذف شود؟")) run("rm", async () => { await sms.remove(); setCredit(null); }, "اتصال حذف شد."); };

  const st = s ? statusPill(s) : null, showForm = s && (!s.connected || edit);
  return (
    <div data-testid="sms-settings" style={{ maxWidth: 940, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Icon name="Send" size={20} style={{ color: "var(--accent-light)" }} /><b style={{ fontSize: 17 }}>پیامک به مشتریان (ملی پیامک)</b></div>
        <div style={sub}>پنل <a href="https://www.melipayamak.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>ملی پیامک</a> خودتان را وصل کنید تا از بخش «مشتریان ← پیامک» برای مشتریان پیام بفرستید. هزینهٔ هر پیامک از اعتبار پنل خودتان کم می‌شود.</div>
      </div>
      {(!connected || guest)
        ? <div style={card} data-testid="sms-offline"><Note>{guest ? "در حالت مهمان این بخش در دسترس نیست." : "ارسال پیامک از طریق سرور کافینو انجام می‌شود؛ ابتدا به سرور وصل شوید (تنظیمات ← سرور)."}</Note></div>
        : <>
          {err && <Note kind="error" data-testid="sms-error">{err}</Note>}
          {ok && <Note kind="ok" data-testid="sms-ok">{ok}</Note>}
          {s && <div style={card} data-testid="sms-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>وضعیت اتصال</b><Pill color={st.color} data-testid="sms-status">{st.text}</Pill>
              {s.connected && <span style={sub}>کاربر <b dir="ltr">{s.usernameHint}</b> · خط <b dir="ltr">{toFA(s.from)}</b></span>}
              <span style={{ flex: 1 }} />
              {s.connected && <button onClick={disconnect} style={smallBtn("#7f1d1d")} data-testid="sms-remove">حذف اتصال</button>}
            </div>
            {s.connected && s.lastError && <Note kind="warn">آخرین خطا: {s.lastError}</Note>}
            {s.connected && !edit && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button disabled={!!busy} onClick={checkCredit} data-testid="sms-credit-btn" style={smallBtn("var(--bg-app)", "var(--text-primary)", { border: "1px solid var(--border)" })}>{busy === "credit" ? "…" : "نمایش اعتبار پنل"}</button>
                {credit !== null && <span data-testid="sms-credit" style={{ fontSize: 13 }}>اعتبار: <b>{toFA(Number(credit).toLocaleString("en-US"))}</b> <span style={sub}>(به واحد پنل، معمولاً ریال)</span></span>}
                <span style={{ flex: 1 }} />
                <button onClick={() => { setEdit(true); setFrom(s.from || ""); }} data-testid="sms-edit" style={smallBtn("var(--bg-app)", "var(--text-primary)", { border: "1px solid var(--border)" })}>تعویض نام کاربری/رمز/خط</button>
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={!!s.enabled} onChange={(e) => run("patch", () => sms.patch({ enabled: e.target.checked }))} data-testid="sms-enabled" /> ارسال پیامک فعال باشد</label>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input data-testid="sms-test-to" type="tel" inputMode="tel" dir="ltr" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="شمارهٔ آزمایشی مثل ۰۹۱۲۳۴۵۶۷۸۹" style={{ ...INP, width: 240 }} />
                <button disabled={!!busy || !s.enabled} onClick={sendTest} data-testid="sms-test-btn" style={smallBtn("#2563eb")}>{busy === "test" ? "…" : "ارسال پیام آزمایشی"}</button>
              </div>
            </div>}
            {showForm && <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="sms-form">
              <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>نام کاربری پنل ملی پیامک
                <input data-testid="sms-username" autoComplete="off" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} style={INP} /></label>
              <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>رمز عبور پنل
                <input data-testid="sms-password" type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} style={INP} /></label>
              <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>شمارهٔ خط ارسال‌کننده (مثلاً 3000xxxx یا 5000xxxx)
                <input data-testid="sms-from" inputMode="numeric" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} style={INP} /></label>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={!!busy} onClick={save} data-testid="sms-save" style={{ ...BTN("#16a34a"), padding: "9px 18px" }}>{busy === "connect" ? "در حال بررسی با ملی پیامک…" : "بررسی و ذخیره"}</button>
                {s.connected && <button onClick={() => { setEdit(false); setPassword(""); setUsername(""); }} style={{ ...BTN("var(--bg-app)", "var(--text-secondary)"), border: "1px solid var(--border)", padding: "9px 14px" }}>انصراف</button>}
              </div>
              <div style={sub}>پیش از ذخیره، اعتبار پنل با همین مشخصات از ملی پیامک پرسیده می‌شود تا از درستی آن مطمئن شویم. رمز روی سرور رمزنگاری می‌شود و دوباره نمایش داده نمی‌شود.</div>
            </div>}
          </div>}
          <div style={card}>
            <b style={{ fontSize: 14 }}>راهنما</b>
            <ol style={{ ...sub, margin: 0, paddingInlineStart: 18, lineHeight: 2 }}>
              <li>در ملی پیامک ثبت‌نام و مدارک را تکمیل کنید و یک خط اختصاصی (سری 3000 یا 5000) تهیه کنید.</li>
              <li>ارسال با وب‌سرویس معمولاً فقط از خط اختصاصی مجاز است؛ خط عمومی ممکن است رد شود.</li>
              <li>نام کاربری و رمز پنل را همین‌جا وارد کنید؛ سپس از «مشتریان ← پیامک» پیام بفرستید.</li>
              <li>پیام تبلیغاتی به گیرندهٔ ناشناس خلاف مقررات اپراتورهاست؛ فقط به مشتریان خودتان پیام بدهید و در پیام تبلیغی «لغو ۱۱» را بنویسید.</li>
              <li>دسترسی «ارسال پیامک» و «مدیریت پیامک» را مالک در «حسابرسی ← مرکز مالی سرور ← دسترسی‌ها» به کارمندان می‌دهد.</li>
            </ol>
          </div>
        </>}
    </div>
  );
}
