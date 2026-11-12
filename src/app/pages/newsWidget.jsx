// ویجت «اخبار کافی‌نت» (داشبورد مدیریتی): فقط سرتیتر هر خبر + ساعت و تاریخ زیر آن؛ پیش‌فرض ۱۰ خبر.
// منطق دریافت/کش در domain/newsFeed.js است؛ این فایل فقط نمایش و تنظیمات ویجت را دارد.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toFA } from "../core/format.js";
import { NEWS_COUNTS, NEWS_DEFAULT_COUNT, NEWS_PAGE_URL, NEWS_TTL_MS, formatNewsTime, getNewsConfig, loadNews, saveNewsConfig } from "../domain/newsFeed.js";
import { openLink } from "./links.jsx";

const input = { background: "var(--bg-app)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", width: "100%" };
const small = { background: "transparent", border: "none", color: "var(--accent-light)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "2px 4px" };

export function NewsWidget() {
  const [cfg, setCfg] = useState(() => getNewsConfig());
  const [data, setData] = useState({ items: [], at: 0, stale: false, error: "", loading: true });
  const [panel, setPanel] = useState(false);
  const [draft, setDraft] = useState(cfg);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async (force, c) => {
    setData((d) => ({ ...d, loading: true }));
    let r; try { r = await loadNews({ force: !!force, cfg: c || cfg }); } catch (e) { r = { items: [], at: 0, stale: false, error: String((e && e.message) || e) }; }
    if (alive.current) setData({ ...r, loading: false });
  }, [cfg]);

  useEffect(() => { refresh(false); }, [cfg.feedUrl, cfg.proxy]);
  useEffect(() => {
    const t = setInterval(() => { if (typeof document === "undefined" || !document.hidden) refresh(false); }, NEWS_TTL_MS);
    const on = () => refresh(false);
    window.addEventListener("online", on);
    return () => { clearInterval(t); window.removeEventListener("online", on); };
  }, [refresh]);

  const shown = data.items.slice(0, cfg.count);
  const upd = data.at ? formatNewsTime(data.at, true) : null;
  const save = () => { const c = saveNewsConfig(draft); setCfg(c); setPanel(false); refresh(true, c); };

  return (
    <div data-testid="news-widget" style={{ background: "var(--bg-card)", borderRadius: 14, padding: "14px 16px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)" }}>📰 اخبار کافی‌نت{shown.length > 0 && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}> ({toFA(shown.length)})</span>}</div>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <button data-testid="news-refresh" onClick={() => refresh(true)} disabled={data.loading} title="به‌روزرسانی اخبار" aria-label="به‌روزرسانی اخبار" style={{ ...small, fontSize: 14, opacity: data.loading ? .5 : 1 }}>{data.loading ? "…" : "↻"}</button>
          <button data-testid="news-settings" onClick={() => { setDraft(cfg); setPanel((p) => !p); }} title="تنظیمات ویجت" aria-label="تنظیمات ویجت اخبار" style={{ ...small, fontSize: 14 }}>⚙</button>
        </div>
      </div>

      {panel && (
        <div data-testid="news-panel" style={{ background: "var(--bg-app)", border: "1px dashed var(--accent-light)", borderRadius: 10, padding: "10px 12px", marginBottom: 10, display: "grid", gap: 8 }}>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>تعداد خبر
            <select data-testid="news-count" value={draft.count} onChange={(e) => setDraft({ ...draft, count: Number(e.target.value) })} style={input}>{NEWS_COUNTS.map((n) => <option key={n} value={n}>{toFA(n)} خبر{n === NEWS_DEFAULT_COUNT ? " (پیش‌فرض)" : ""}</option>)}</select>
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>آدرس فید (خالی = فید پیش‌فرض آنلاین‌کافه)
            <input data-testid="news-feed-url" dir="ltr" value={draft.feedUrl} onChange={(e) => setDraft({ ...draft, feedUrl: e.target.value })} placeholder="https://example.com/feed/" style={input} />
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>پراکسی دلخواه (اختیاری؛ فقط اگر CSP سرور شما آن میزبان را مجاز کرده باشد)
            <input data-testid="news-proxy" dir="ltr" value={draft.proxy} onChange={(e) => setDraft({ ...draft, proxy: e.target.value })} placeholder="https://proxy.example/?url={url}" style={input} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button data-testid="news-save" onClick={save} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>ذخیره و به‌روزرسانی</button>
            <button data-testid="news-reset" onClick={() => setDraft({ count: NEWS_DEFAULT_COUNT, feedUrl: "", proxy: "" })} style={{ ...small, border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>بازگشت به پیش‌فرض</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div data-testid="news-empty" style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12, padding: "16px 4px", lineHeight: 1.9 }}>
          {data.loading ? "در حال دریافت اخبار…" : <>
            خبری دریافت نشد.<br />
            <span style={{ fontSize: 11 }}>نسخهٔ دسکتاپ فید را مستقیم می‌خواند. در نسخهٔ وب باید به سرور کافینو وصل و وارد شده باشید (سرور فید را می‌گیرد)؛ مرورگر به‌تنهایی اجازهٔ خواندن سایت دیگر را ندارد.</span><br />
            <button onClick={() => openLink(cfg.feedUrl || NEWS_PAGE_URL)} style={{ ...small, fontSize: 12 }}>باز کردن صفحهٔ اخبار ↗</button>
          </>}
        </div>
      ) : (
        <div data-testid="news-list">
          {shown.map((n, i) => {
            const tm = formatNewsTime(n.ts, n.hasTime);
            const open = () => { if (n.link) openLink(n.link); };
            return (
              <div key={(n.link || n.title) + i} data-testid="news-item" role={n.link ? "link" : undefined} tabIndex={n.link ? 0 : undefined} onClick={open} onKeyDown={(e) => { if (n.link && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
                title={n.link ? "باز کردن خبر در مرورگر" : undefined}
                style={{ background: "var(--bg-app)", borderRadius: 9, padding: "8px 11px", marginBottom: 6, cursor: n.link ? "pointer" : "default" }}>
                <div data-testid="news-title" style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.7, overflowWrap: "anywhere" }}>{n.title}</div>
                <div data-testid="news-time" style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{tm.text ? `🕒 ${tm.text}` : "—"}</div>
              </div>
            );
          })}
        </div>
      )}

      {(data.stale || upd) && shown.length > 0 && (
        <div style={{ fontSize: 10.5, color: data.stale ? "#fbbf24" : "var(--text-dim)", marginTop: 4 }} data-testid={data.stale ? "news-stale" : "news-updated"}>
          {data.stale ? `⚠ اتصال به منبع برقرار نشد؛ آخرین خبرهای ذخیره‌شده (${upd ? upd.text : ""})` : `آخرین به‌روزرسانی: ${upd.text}`}
        </div>
      )}
    </div>
  );
}
