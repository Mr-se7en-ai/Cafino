import { ValidationError } from "../core/errors.js";

// Pure financial decision for the invoice spine. No storage, IDs, or UI concerns.
export function settleSale({ subtotal, discount = 0, payments = [], walletBalance = 0, walkIn = false }) {
  const rawSubtotal = Number(subtotal);
  if (!Number.isFinite(rawSubtotal) || rawSubtotal <= 0) {
    throw new ValidationError("sale", ["subtotal must be a positive number"]);
  }
  const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), rawSubtotal);
  const total = rawSubtotal - safeDiscount;
  if (total <= 0) throw new ValidationError("sale", ["total must be positive"]);

  let remainingToAllocate = total;
  let walletRemaining = Math.max(0, Number(walletBalance) || 0);
  let waived = 0;
  const received = [];
  for (const row of Array.isArray(payments) ? payments : []) {
    let amount = Math.min(Math.max(0, Number(row?.amount) || 0), remainingToAllocate);
    if (amount <= 0 || row?.method === "credit") continue;
    if (row.method === "free") {
      waived += amount;
      remainingToAllocate -= amount;
      continue;
    }
    if (row.method === "wallet") {
      amount = Math.min(amount, walletRemaining);
      walletRemaining -= amount;
    }
    if (amount <= 0) continue;
    received.push({ method: row.method || "cash", amount, date: row.date || "" });
    remainingToAllocate -= amount;
  }
  const paid = received.reduce((sum, row) => sum + row.amount, 0);
  const walletUsed = received.filter(row => row.method === "wallet").reduce((sum, row) => sum + row.amount, 0);
  const remaining = Math.max(0, total - paid - waived);
  if (walkIn && remaining > 0) throw new ValidationError("sale", ["walk-in sales must be fully settled"]);
  return { subtotal: rawSubtotal, discount: safeDiscount, total, paid, waived, walletUsed, remaining, payments: received };
}

export function calculateSaleProfit({ revenue = 0, directCost = 0, operatingCost = 0 } = {}) {
  const income = Math.max(0, Number(revenue) || 0);
  const direct = Math.max(0, Number(directCost) || 0);
  const operating = Math.max(0, Number(operatingCost) || 0);
  return { revenue: income, directCost: direct, grossProfit: income - direct, operatingCost: operating, netProfit: income - direct - operating };
}
