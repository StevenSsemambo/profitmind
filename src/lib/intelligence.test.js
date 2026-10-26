import { describe, it, expect } from "vitest";
import { computeForecast, computeReorderDrafts, computeDebtorRisk, computeSlowMoving, computeAnomalies } from "./intelligence.js";

const DAY = 86400000;

function product(overrides = {}) {
  return { id: 1, name: "Sugar 1kg", category: "Groceries", unit: "kg", costPrice: 3800, sellPrice: 5000, lowStockThreshold: 15, stock: 6, ...overrides };
}
function sale({ productId = 1, qty = 1, daysAgo = 0, sellPrice = 5000, costPrice = 3800 } = {}) {
  return {
    id: Math.random(),
    items: [{ productId, name: "Sugar 1kg", qty, sellPrice, costPrice }],
    total: sellPrice * qty,
    date: Date.now() - daysAgo * DAY,
    paymentMethod: "cash",
  };
}

describe("computeForecast", () => {
  it("flags a product selling steadily every day as high confidence", () => {
    const products = [product({ stock: 6 })];
    const sales = [0, 1, 2, 3, 4, 5, 6].map((d) => sale({ daysAgo: d, qty: 1 }));
    const [f] = computeForecast(products, sales, []);
    expect(f.confidence).toBe("high");
    expect(f.daysLeft).not.toBeNull();
  });

  it("flags a product with a single big sale as low confidence, not high velocity", () => {
    const products = [product({ stock: 6 })];
    const sales = [sale({ daysAgo: 1, qty: 20 })]; // one big sale, one day with activity
    const [f] = computeForecast(products, sales, []);
    expect(f.confidence).toBe("low");
  });

  it("does not forecast a stockout for a product with no recent sales", () => {
    const products = [product({ stock: 6 })];
    const [f] = computeForecast(products, [], []);
    expect(f.daysLeft).toBeNull();
  });
});

describe("computeReorderDrafts", () => {
  it("only surfaces products projected to run out, not everything in stock", () => {
    const products = [product({ id: 1, stock: 2 }), product({ id: 2, name: "Rice 2kg", stock: 500 })];
    const sales = [0, 1, 2, 3].map((d) => sale({ productId: 1, daysAgo: d, qty: 1 }));
    const forecast = computeForecast(products, sales, []);
    const drafts = computeReorderDrafts(forecast);
    expect(drafts.some((d) => d.id === 1)).toBe(true);
    expect(drafts.some((d) => d.id === 2)).toBe(false);
  });
});

describe("computeDebtorRisk", () => {
  it("rates a long-idle, unpaid balance as high risk", () => {
    const debtors = [{ id: 1, name: "Nakato", owed: 50000, paid: 0, history: [{ type: "credit-sale", amount: 50000, date: Date.now() - 40 * DAY }] }];
    const [risk] = computeDebtorRisk(debtors);
    expect(risk.risk).toBe("high");
    expect(risk.balance).toBe(50000);
  });

  it("excludes debtors with a zero balance", () => {
    const debtors = [{ id: 1, name: "Okello", owed: 10000, paid: 10000, history: [] }];
    expect(computeDebtorRisk(debtors)).toHaveLength(0);
  });
});

describe("computeAnomalies", () => {
  it("returns nothing when there is no sales activity", () => {
    expect(computeAnomalies([])).toEqual([]);
  });
});
