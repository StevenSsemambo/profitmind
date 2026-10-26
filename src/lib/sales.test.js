import { describe, it, expect } from "vitest";
import { applySale } from "./sales.js";
import { newId } from "./ids.js";

const products = [
  { id: 1, name: "Sugar", costPrice: 3800, sellPrice: 5000, stock: 10 },
  { id: 2, name: "Rice", costPrice: 9000, sellPrice: 12000, stock: 2 },
];
const debtors = [{ id: 7, name: "Sarah", owed: 10000, paid: 2000, history: [] }];
const line = (productId, name, qty, sellPrice, costPrice) => ({ productId, name, qty, sellPrice, costPrice });

describe("applySale", () => {
  it("deducts stock and records profit for a cash sale", () => {
    const r = applySale({ products, debtors, cart: [line(1, "Sugar", 3, 5000, 3800)], paymentMethod: "cash" });
    expect(r.ok).toBe(true);
    expect(r.products.find((p) => p.id === 1).stock).toBe(7);
    expect(r.sale.total).toBe(15000);
    expect(r.sale.profit).toBe(15000 - 3 * 3800);
    expect(r.debtors).toBe(debtors); // untouched
  });

  it("refuses to oversell and changes nothing", () => {
    const r = applySale({ products, debtors, cart: [line(2, "Rice", 3, 12000, 9000)], paymentMethod: "cash" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/only 2 left/);
  });

  it("charges the debtor on credit and credits any amount paid now", () => {
    const r = applySale({ products, debtors, cart: [line(1, "Sugar", 2, 5000, 3800)], paymentMethod: "credit", debtorId: "7", amountNow: 4000 });
    expect(r.ok).toBe(true);
    const d = r.debtors[0];
    expect(d.owed).toBe(20000);
    expect(d.paid).toBe(6000);
    expect(d.history).toHaveLength(2);
    expect(r.receipt.paidNow).toBe(4000);
  });

  it("caps the paid-now amount at the sale total", () => {
    const r = applySale({ products, debtors, cart: [line(1, "Sugar", 1, 5000, 3800)], paymentMethod: "credit", debtorId: 7, amountNow: 999999 });
    expect(r.receipt.paidNow).toBe(5000);
  });

  it("rejects a credit sale for a debtor that no longer exists", () => {
    const r = applySale({ products, debtors, cart: [line(1, "Sugar", 1, 5000, 3800)], paymentMethod: "credit", debtorId: 99 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no longer exists/);
  });

  it("requires a debtor for credit and a non-empty cart", () => {
    expect(applySale({ products, debtors, cart: [line(1, "Sugar", 1, 5000, 3800)], paymentMethod: "credit" }).ok).toBe(false);
    expect(applySale({ products, debtors, cart: [], paymentMethod: "cash" }).ok).toBe(false);
  });
});

describe("newId", () => {
  it("never repeats, even in a tight loop", () => {
    const seen = new Set();
    for (let i = 0; i < 5000; i++) seen.add(newId());
    expect(seen.size).toBe(5000);
  });
});
