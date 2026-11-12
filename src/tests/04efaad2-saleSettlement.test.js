import test from "node:test";
import assert from "node:assert/strict";
import { settleSale, calculateSaleProfit } from "../domain/saleSettlement.js";

test("sale settlement allocates wallet, cash, waived, and remaining amounts consistently", () => {
  const result = settleSale({
    subtotal: 1000,
    discount: 100,
    walletBalance: 200,
    payments: [
      { method: "wallet", amount: 250 },
      { method: "cash", amount: 300 },
      { method: "free", amount: 100 },
      { method: "credit", amount: 1000 },
    ],
  });
  assert.equal(result.total, 900);
  assert.equal(result.walletUsed, 200);
  assert.equal(result.paid, 500);
  assert.equal(result.waived, 100);
  assert.equal(result.remaining, 300);
  assert.deepEqual(result.payments.map(row => row.method), ["wallet", "cash"]);
});

test("walk-in sale cannot leave a debt and cannot overspend wallet balance", () => {
  assert.throws(() => settleSale({ subtotal: 500, walkIn: true, payments: [{ method: "cash", amount: 499 }] }), /Invalid sale/);
  const result = settleSale({ subtotal: 500, walletBalance: 100, payments: [{ method: "wallet", amount: 500 }] });
  assert.equal(result.walletUsed, 100);
  assert.equal(result.remaining, 400);
});

test("sale profit is derived from revenue and direct plus operating costs", () => {
  assert.deepEqual(calculateSaleProfit({ revenue: 1000, directCost: 250, operatingCost: 100 }), {
    revenue: 1000, directCost: 250, grossProfit: 750, operatingCost: 100, netProfit: 650,
  });
});
