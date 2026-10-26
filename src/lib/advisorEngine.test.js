import { describe, it, expect } from "vitest";
import { ruleBasedAnswer, offlineFallbackAnswer } from "./advisorEngine.js";

const DAY = 86400000;

const products = [
  { id: 1, name: "Sugar 1kg", category: "Groceries", unit: "kg", costPrice: 3800, sellPrice: 5000, lowStockThreshold: 15, stock: 6 },
  { id: 2, name: "Rice 2kg", category: "Groceries", unit: "bag", costPrice: 9000, sellPrice: 12000, lowStockThreshold: 6, stock: 18 },
];
const debtors = [
  { id: 1, name: "Nakato Sarah", owed: 45000, paid: 20000, history: [] },
];
const purchases = [
  { id: 1, productId: 1, productName: "Sugar 1kg", qty: 20, costPricePerUnit: 3800, totalCost: 76000, supplier: "Shoprite Wholesale", date: Date.now() - 3 * DAY },
];
const sales = [
  { id: 1, items: [{ productId: 1, name: "Sugar 1kg", qty: 2, sellPrice: 5000, costPrice: 3800 }], total: 10000, profit: 2400, date: Date.now(), paymentMethod: "cash" },
  { id: 2, items: [{ productId: 2, name: "Rice 2kg", qty: 1, sellPrice: 12000, costPrice: 9000 }], total: 12000, profit: 3000, date: Date.now(), paymentMethod: "momo" },
];

describe("ruleBasedAnswer — product lookup", () => {
  it("answers a stock question for a named product without any sales history needed", () => {
    const r = ruleBasedAnswer("how much sugar do i have", products, [], [], []);
    expect(r).not.toBeNull();
    expect(r.text).toMatch(/6/);
  });

  it("answers a price question", () => {
    const r = ruleBasedAnswer("what is the price of rice", products, [], [], []);
    expect(r.text).toMatch(/12,000|12000/);
  });
});

describe("ruleBasedAnswer — named debtor", () => {
  it("answers a specific debtor's balance ahead of the generic debt total", () => {
    const r = ruleBasedAnswer("how much does nakato owe", products, sales, debtors, purchases);
    expect(r.text).toMatch(/25,000|25000/); // 45000 - 20000
  });
});

describe("ruleBasedAnswer — supplier lookup", () => {
  it("answers a supplier question using purchase history", () => {
    const r = ruleBasedAnswer("who do i buy sugar from", products, sales, debtors, purchases);
    expect(r.text).toMatch(/Shoprite Wholesale/);
  });
});

describe("ruleBasedAnswer — payment method breakdown", () => {
  it("splits revenue by payment method", () => {
    const r = ruleBasedAnswer("what's my cash vs momo breakdown today", products, sales, debtors, purchases);
    expect(r.text).toMatch(/Cash/);
    expect(r.text).toMatch(/Mobile Money/);
  });
});

describe("offlineFallbackAnswer", () => {
  it("always returns a non-empty, grounded snapshot, never a dead end", () => {
    const text = offlineFallbackAnswer(products, sales, debtors, purchases);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/Today:/);
  });

  it("still returns a useful snapshot with completely empty data", () => {
    const text = offlineFallbackAnswer([], [], [], []);
    expect(text).toMatch(/Today:/);
  });
});
