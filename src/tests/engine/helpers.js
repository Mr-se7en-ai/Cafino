import * as E from "./.build/engine.mjs";
export { E };
export const T = (n) => n * 10;           // toman → rial (the app stores rial)

export function fresh({ wallet = 0, stock } = {}) {
  globalThis.__resetStorage();
  E.lsWrite("cafenet_customers", [
    { id: 1, firstName: "علی", lastName: "رضایی", phone: "09121234567", wallet },
    { id: 2, firstName: "سارا", lastName: "احمدی", phone: "09129999999", wallet: 0 },
  ]);
  E.lsWrite("cafenet_inventory", stock || [
    { id: 101, cat: "paper", name: "کاغذ A4", qty: 100, minQty: 10, unit: "برگ", unitCost: 500, salePrice: 1000 },
    { id: 102, cat: "cartridge", name: "تونر", qty: 3, minQty: 1, unit: "عدد", unitCost: 200000, salePrice: 0 },
  ]);
  return E;
}
export const item = (o = {}) => ({ desc: "پرینت", qty: 1, price: T(10000), ...o });
export const stockOf = (id) => E.lsRead("cafenet_inventory", []).find((s) => String(s.id) === String(id));
export const incomeTotal = () => E.lsRead("cafenet_tx3", []).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
export const expenseTotal = () => E.lsRead("cafenet_tx3", []).filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
export const ledgerDebt = (customerId) => {
  const acc = E.lsRead("cafenet_ledger2", []).find((a) => String(a.customerId) === String(customerId));
  return (acc?.entries || []).filter((e) => e.category === "بدهکار").reduce((s, e) => s + e.amount, 0);
};
export const customer = (id) => E.lsRead("cafenet_customers", []).find((c) => String(c.id) === String(id));
