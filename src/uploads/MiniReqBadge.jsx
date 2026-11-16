import React from "react";
import { toFA } from "../app/core/format.js";
import { useMiniReqSummary } from "./miniReqState.js";

export function MiniReqBadge({ style }) {
  const { newCount } = useMiniReqSummary();
  if (!newCount) return null;
  return <span data-testid="miniapp-orders-badge" aria-label={`${newCount} سفارش تازه از مینی‌اپ`} style={{ background: "#dc2626", color: "#fff", borderRadius: 10, minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}>{toFA(newCount)}</span>;
}
