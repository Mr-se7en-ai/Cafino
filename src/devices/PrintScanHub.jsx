// صفحهٔ «پرینت و اسکن»: دو زیرتب — «ثبت سریع» (فرم قبلی) و «مرکز چاپ و اسکن» (دستگاه‌ها، جاب‌ها، کنتور، گزارش).
import React, { useState } from "react";
import { BTN } from "../app/core/constants.js";
import { PrintScanSection, suggestPrintUnitPrice } from "../app/pages/printScan.jsx";
import { useTariffData } from "../app/pages/tariff.jsx";
import { PrintCenter } from "./PrintCenterUI.jsx";

const TABS = [["quick", "⚡ ثبت سریع"], ["center", "🖨️ مرکز چاپ و اسکن"]];

export function PrintScanHub({ transactions, setTransactions, initialTab = "quick" }) {
  const [tab, setTab] = useState(initialTab);
  const [tariffData] = useTariffData();
  return (
    <div data-testid="printscan-hub">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map(([k, l]) => (
          <button key={k} data-testid={`ps-tab-${k}`} onClick={() => setTab(k)} style={{ ...BTN(tab === k ? "#2563eb" : "var(--bg-card)", tab === k ? "#fff" : "var(--text-secondary)"), padding: "8px 16px", fontSize: 12.5, border: tab === k ? "none" : "1px solid var(--border)" }}>{l}</button>
        ))}
      </div>
      {tab === "quick"
        ? <PrintScanSection transactions={transactions} setTransactions={setTransactions} />
        : <PrintCenter suggestPrice={(kind, color, size) => suggestPrintUnitPrice(tariffData, kind, color, size)} />}
    </div>
  );
}
