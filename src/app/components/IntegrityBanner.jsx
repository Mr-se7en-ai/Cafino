import React, { useEffect, useRef, useState } from "react";
import { createSealer } from "../../services/security/localSeal.js";
import { askReason } from "../../audit/ReasonDialog.jsx";
import { audit } from "../../audit/auditTrail.js";
import { BTN } from "../core/constants.js";

// نسخهٔ دسکتاپ: اگر دادهٔ مالی محلی بیرون از برنامه تغییر کرده باشد (یا برنامه ناگهان بسته شده)، به مالک هشدار می‌دهد.
export function IntegrityBanner() {
  const [status, setStatus] = useState("off");
  const [hidden, setHidden] = useState(false);
  const sealer = useRef(null);
  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.cafenetNative : null;
    if (!bridge || !bridge.seal) return undefined;
    const s = createSealer({ bridge, onState: (st) => {
      setStatus(st.status);
      if (st.status === "mismatch") { try { audit({ action: "integrity_seal_mismatch", label: "دادهٔ مالی محلی با مهر یکپارچگی نمی‌خواند", severity: "critical", entityType: "یکپارچگی", details: "تغییر خارج از برنامه یا بسته‌شدن ناگهانی" }); } catch { /* ignore */ } }
    } });
    sealer.current = s; s.start();
    return () => s.stop();
  }, []);
  if (status !== "mismatch" || hidden) return null;
  const accept = async () => {
    const reason = await askReason({ title: "پذیرش وضعیت فعلی داده‌ها", desc: "با پذیرش، داده‌های فعلی مبنای جدید می‌شوند و این هشدار با دلیل شما در گزارش حسابرسی ثبت می‌شود.", presets: ["برنامه ناگهان بسته شده بود", "خودم بکاپ بازیابی کردم", "بررسی کردم و درست است"], icon: "🛡️" });
    if (reason === null || reason === undefined) return;
    const ok = await sealer.current.accept();
    if (ok) { try { audit({ action: "integrity_seal_accept", label: "پذیرش وضعیت فعلی دادهٔ مالی محلی", severity: "warning", entityType: "یکپارچگی", reason }); } catch { /* ignore */ } }
  };
  return (
    <div data-testid="integrity-banner" className="no-print" role="alert" style={{ position: "fixed", bottom: (typeof window !== "undefined" && window.innerWidth < 700) ? 72 : 0, left: 0, right: 0, zIndex: 249, background: "#7c2d12", color: "#fff", borderTop: "1px solid #fdba74", boxShadow: "0 -4px 18px #0006", padding: "8px 12px", fontSize: 12.5, lineHeight: 1.8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <span>⚠️ <b>داده‌های مالی این دستگاه با آخرین وضعیت ثبت‌شده نمی‌خوانند.</b> یا فایل‌های برنامه بیرون از برنامه ویرایش شده‌اند، یا برنامه ناگهان بسته شده است. اگر مطمئن نیستید، از «بکاپ» نسخه بگیرید و گزارش حسابرسی را بررسی کنید.</span>
      <button data-testid="integrity-accept" onClick={accept} style={{ ...BTN("#fff", "#7c2d12"), padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>بررسی کردم، بپذیر</button>
      <button data-testid="integrity-dismiss" onClick={() => setHidden(true)} style={{ ...BTN("#ffffff26", "#fff"), padding: "3px 10px", fontSize: 12, border: "1px solid #ffffff55" }}>فعلاً بستن</button>
    </div>
  );
}
