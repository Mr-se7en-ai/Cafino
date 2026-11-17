import React from "react";
import { toFA } from "../app/core/format.js";
import { useMiniReqSummary, miniBadgeTotal } from "./miniReqState.js";

export function MiniReqBadge({ style }) {
  const st = useMiniReqSummary(), newCount = miniBadgeTotal(st);
  if (!newCount) return null;
  return <span data-testid="miniapp-orders-badge" aria-label={`${newCount} مورد تازه از مینی‌اپ (سفارش، رسید یا پیام)`} style={{ background: "#dc2626", color: "#fff", borderRadius: 10, minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}>{toFA(newCount)}</span>;
}
