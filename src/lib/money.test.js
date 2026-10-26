import { describe, it, expect } from "vitest";
import { applySale, applyVoid, applyDebtorPayment } from "./sales.js";
import { applyRestock, applyAdjustment } from "./stock.js";
import { periodFinance, cashExpectedForDay, supplierBalances, expiryAlerts, marginWatch, buildFinanceInsights, startOfDay } from "./finance.js";
import { buildBackup, parseBackup } from "./backup.js";

const DAY = 86400000;
const now = new Date(2026, 9, 26, 15, 0, 0).getTime();
const today = startOfDay(now);
const mkProducts = () => [{ id: 1, name: "Sugar", costPrice: 3800, sellPrice: 5000, stock: 10 }];
const mkDebtors = () => [{ id: 7, name: "Sarah", owed: 10000, paid: 2000, creditLimit: 0, history: [] }];
const line = (qty, sell = 5000, list = 5000) => ({ productId: 1, name: "Sugar", qty, sellPrice: sell, listPrice: list, costPrice: 3800 });

describe("sales: who, discounts, credit limits", () => {
  it("records cashier, discount and debtor on the sale", () => {
    const r = applySale({ products: mkProducts(), debtors: mkDebtors(), cart: [line(2, 4500, 5000)], paymentMethod: "credit", debtorId: 7, amountNow: 1000, by: "Cashier", now });
    expect(r.ok).toBe(true);
    expect(r.sale.by).toBe("Cashier");
    expect(r.sale.discount).toBe(1000);
    expect(r.sale.debtorId).toBe(7);
    expect(r.sale.paidNow).toBe(1000);
  });
  it("blocks a credit sale over the customer's limit", () => {
    const debtors = [{ ...mkDebtors()[0], creditLimit: 12000 }]; // already owes 8000
    const r = applySale({ products: mkProducts(), debtors, cart: [line(1)], paymentMethod: "credit", debtorId: 7, now });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/credit limit/);
    const ok = applySale({ products: mkProducts(), debtors, cart: [line(1)], paymentMethod: "credit", debtorId: 7, amountNow: 1000, now });
    expect(ok.ok).toBe(true);
  });
});

describe("applyVoid", () => {
  it("restores stock and reverses a credit sale, keeping the record", () => {
    const sold = applySale({ products: mkProducts(), debtors: mkDebtors(), cart: [line(2)], paymentMethod: "credit", debtorId: 7, amountNow: 3000, by: "Cashier", now });
    const v = applyVoid({ products: sold.products, debtors: sold.debtors, sales: [sold.sale], saleId: sold.sale.id, by: "Owner", reason: "Wrong item", now });
    expect(v.ok).toBe(true);
    expect(v.products[0].stock).toBe(10);
    const d = v.debtors[0];
    expect(d.owed - d.paid).toBe(10000 - 2000); // back to the starting balance
    expect(v.sales[0].voided.reason).toBe("Wrong item");
    expect(v.sales).toHaveLength(1);
  });
  it("needs a reason, refuses twice, and flags old credit sales it can't reverse", () => {
    const sold = applySale({ products: mkProducts(), debtors: mkDebtors(), cart: [line(1)], paymentMethod: "cash", by: "C", now });
    const base = { products: sold.products, debtors: mkDebtors(), sales: [sold.sale], saleId: sold.sale.id, by: "O", now };
    expect(applyVoid({ ...base, reason: "" }).ok).toBe(false);
    const once = applyVoid({ ...base, reason: "mistake" });
    expect(applyVoid({ ...base, sales: once.sales, reason: "mistake" }).ok).toBe(false);
    const old = { id: 5, total: 5000, profit: 1000, date: now, paymentMethod: "credit", items: [] };
    expect(applyVoid({ ...base, sales: [old], saleId: 5, reason: "mistake" }).error).toMatch(/older credit sale/);
  });
});

describe("applyDebtorPayment", () => {
  it("accepts a valid payment with its method", () => {
    const r = applyDebtorPayment(mkDebtors()[0], 3000, "momo", now);
    expect(r.ok).toBe(true);
    expect(r.debtor.paid).toBe(5000);
    expect(r.debtor.history[0].method).toBe("momo");
  });
  it("refuses overpayment, zero and settled accounts", () => {
    expect(applyDebtorPayment(mkDebtors()[0], 9000).ok).toBe(false);
    expect(applyDebtorPayment(mkDebtors()[0], 0).ok).toBe(false);
    expect(applyDebtorPayment({ ...mkDebtors()[0], paid: 10000 }, 100).ok).toBe(false);
  });
});

describe("stock: restock averaging and adjustments", () => {
  it("blends cost price instead of overwriting it", () => {
    const p = applyRestock({ id: 1, stock: 10, costPrice: 3000 }, 10, 4000);
    expect(p.stock).toBe(20);
    expect(p.costPrice).toBe(3500);
  });
  it("uses the new cost when the shelf was empty", () => {
    expect(applyRestock({ id: 1, stock: 0, costPrice: 3000 }, 5, 4000).costPrice).toBe(4000);
  });
  it("keeps the earliest expiry on the shelf", () => {
    const a = applyRestock({ id: 1, stock: 5, costPrice: 1, expiryDate: 100 }, 5, 1, 500);
    expect(a.expiryDate).toBe(100);
    const b = applyRestock({ id: 1, stock: 5, costPrice: 1, expiryDate: 500 }, 5, 1, 100);
    expect(b.expiryDate).toBe(100);
    const c = applyRestock({ id: 1, stock: 0, costPrice: 1, expiryDate: 100 }, 5, 1, 900);
    expect(c.expiryDate).toBe(900);
  });
  it("logs a shortage as a loss at cost and a surplus as no loss", () => {
    const short = applyAdjustment({ id: 1, name: "Sugar", stock: 10, costPrice: 3800 }, 7, "missing", { by: "Owner", now });
    expect(short.adjustment.delta).toBe(-3);
    expect(short.adjustment.lossValue).toBe(11400);
    expect(short.product.stock).toBe(7);
    const extra = applyAdjustment({ id: 1, name: "Sugar", stock: 10, costPrice: 3800 }, 12, "count", { now });
    expect(extra.adjustment.lossValue).toBe(0);
    expect(applyAdjustment({ id: 1, name: "Sugar", stock: 10, costPrice: 1 }, 10, "count").ok).toBe(false);
  });
});

describe("finance: gross vs net profit", () => {
  it("takes expenses and stock losses off gross profit; ignores voided sales", () => {
    const sales = [
      { id: 1, total: 100000, profit: 30000, date: today + 1000 },
      { id: 2, total: 50000, profit: 20000, date: today + 2000, voided: { at: now, by: "O", reason: "x" } },
    ];
    const expenses = [{ id: 1, amount: 8000, date: today + 3000, category: "Transport" }];
    const adjustments = [{ id: 1, lossValue: 2000, date: today + 4000 }];
    const f = periodFinance({ sales, expenses, adjustments, start: today, end: today + DAY });
    expect(f.revenue).toBe(100000);
    expect(f.gross).toBe(30000);
    expect(f.net).toBe(30000 - 8000 - 2000);
  });
});

describe("finance: expected cash for the day", () => {
  it("adds cash in and subtracts cash out, without double counting at-sale payments", () => {
    const sale1 = { id: 1, total: 20000, profit: 5000, date: today + 1, paymentMethod: "cash" };
    const sale2 = { id: 2, total: 10000, profit: 2000, date: today + 2, paymentMethod: "credit", paidNow: 4000 };
    const sale3 = { id: 3, total: 7000, profit: 1000, date: today + 3, paymentMethod: "momo" };
    const debtors = [{ id: 1, history: [
      { type: "payment", amount: 4000, date: today + 2, atSale: true, method: "cash" },
      { type: "payment", amount: 6000, date: today + 5, method: "cash" },
      { type: "payment", amount: 2500, date: today + 6, method: "momo" },
    ] }];
    const r = cashExpectedForDay({
      sales: [sale1, sale2, sale3], debtors,
      expenses: [{ id: 1, amount: 3000, date: today + 7, method: "cash" }, { id: 2, amount: 9999, date: today + 8, method: "momo" }],
      supplierPayments: [{ id: 1, amount: 1000, date: today + 9, method: "cash" }],
      purchases: [{ id: 1, totalCost: 50000, paid: 15000, payMethod: "cash", date: today + 10 }],
      dayStart: today, float: 5000,
    });
    // 5000 float + 20000 cash sale + 4000 down payment + 6000 debtor cash − 3000 expense − 1000 supplier − 15000 delivery
    expect(r.expected).toBe(5000 + 20000 + 4000 + 6000 - 3000 - 1000 - 15000);
    expect(r.momoReceived).toBe(7000 + 2500);
  });
});

describe("finance: supplier balances, expiry, margin watch", () => {
  it("tracks what is owed to suppliers after part payments", () => {
    const purchases = [
      { id: 1, supplier: "City Bakery", totalCost: 75000, paid: 25000, date: 1 },
      { id: 2, supplier: "City Bakery", totalCost: 10000, date: 2 }, // older record: fully paid
    ];
    expect(supplierBalances(purchases, [{ id: 1, supplier: "City Bakery", amount: 20000, date: 3 }])).toEqual([{ supplier: "City Bakery", owed: 30000 }]);
    expect(supplierBalances(purchases, [{ id: 1, supplier: "City Bakery", amount: 50000, date: 3 }])).toEqual([]);
  });
  it("flags expired and soon-to-expire stock only if some is on hand", () => {
    const products = [
      { id: 1, name: "Milk", stock: 4, costPrice: 1000, expiryDate: today - DAY },
      { id: 2, name: "Yoghurt", stock: 6, costPrice: 500, expiryDate: today + 3 * DAY },
      { id: 3, name: "Bread", stock: 0, costPrice: 2500, expiryDate: today - DAY },
      { id: 4, name: "Rice", stock: 9, costPrice: 1, expiryDate: today + 60 * DAY },
    ];
    const a = expiryAlerts(products, now);
    expect(a.expired.map((x) => x.name)).toEqual(["Milk"]);
    expect(a.soon.map((x) => x.name)).toEqual(["Yoghurt"]);
  });
  it("spots a supplier price rise that squeezed the margin and suggests a price", () => {
    const products = [{ id: 1, name: "Oil", sellPrice: 10000, costPrice: 9000, stock: 5 }];
    const purchases = [
      { id: 1, productId: 1, costPricePerUnit: 8000, date: 1 },
      { id: 2, productId: 1, costPricePerUnit: 9000, date: 2 },
    ];
    const [w] = marginWatch(products, purchases);
    expect(Math.round(w.risePct)).toBe(13);
    expect(Math.round(w.newMarginPct)).toBe(10);
    expect(w.suggestedPrice).toBeGreaterThan(w.sellPrice);
    expect(marginWatch(products, [purchases[0]])).toEqual([]);
  });
  it("summarises voids and discounts by person", () => {
    const sales = [
      { id: 1, total: 5000, profit: 1000, date: now, voided: { at: now, by: "Cashier", reason: "x" } },
      { id: 2, total: 5000, profit: 1000, date: now, discount: 700, by: "Owner" },
    ];
    const i = buildFinanceInsights({ products: [], sales, debtors: [], purchases: [], now });
    expect(i.voids).toMatchObject({ count: 1, value: 5000, by: { Cashier: 1 } });
    expect(i.discounts.by.Owner).toBe(700);
  });
});

describe("backup & restore", () => {
  const state = { products: [{ id: 1, name: "A", stock: 1, costPrice: 1, sellPrice: 2 }], sales: [], debtors: [], purchases: [], expenses: [{ id: 1, amount: 5, date: 1, category: "Rent" }], shop: { name: "Mama's Shop" } };
  it("round-trips a full backup", () => {
    const r = parseBackup(JSON.stringify(buildBackup(state)));
    expect(r.ok).toBe(true);
    expect(r.data.expenses).toHaveLength(1);
    expect(r.data.shop.name).toBe("Mama's Shop");
  });
  it("accepts an old (v1) backup without the new lists", () => {
    const old = { app: "profitmind", exportedAt: "2026-01-01", data: { products: state.products, sales: [], debtors: [], purchases: [] } };
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok).toBe(true);
    expect(r.data.expenses).toEqual([]);
  });
  it("rejects wrong, damaged and empty files without throwing", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup(JSON.stringify({ hello: 1 })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: "profitmind", data: { products: "oops" } })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: "profitmind", data: { products: [{ id: 1 }] } })).error).toMatch(/incomplete/);
    expect(parseBackup(JSON.stringify({ app: "profitmind", data: { products: [] } })).ok).toBe(false);
    expect(parseBackup("").ok).toBe(false);
  });
});

import { parseProductsCsv } from "./importProducts.js";
describe("product CSV import", () => {
  it("reads a normal file, with flexible headers, quotes and Windows line endings", () => {
    const csv = '\uFEFFProduct,Category,Buying Price,Selling Price,Qty\r\n"Soap, bar",Home,"1,200",1500,10\r\nSugar,,3800,5000,\r\n';
    const r = parseProductsCsv(csv);
    expect(r.ok).toBe(true);
    expect(r.products[0]).toMatchObject({ name: "Soap, bar", category: "Home", costPrice: 1200, sellPrice: 1500, stock: 10 });
    expect(r.products[1]).toMatchObject({ name: "Sugar", category: "General", stock: 0, lowStockThreshold: 5 });
  });
  it("reports bad rows by line number and still imports the good ones", () => {
    const r = parseProductsCsv("name,sellPrice\nGood,500\n,300\nBad,abc\nNeg,-5\n");
    expect(r.products).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
  it("rejects files without the needed columns or rows", () => {
    expect(parseProductsCsv("foo,bar\n1,2").ok).toBe(false);
    expect(parseProductsCsv("name,sellPrice").ok).toBe(false);
  });
});

import { buildPeriodReport, digestToWhatsAppText } from "./reports.js";
import { ruleBasedAnswer, buildDigest } from "./advisorEngine.js";
describe("reports and advisor use real profit", () => {
  const products = [{ id: 1, name: "Sugar", category: "G", unit: "kg", costPrice: 3800, sellPrice: 5000, stock: 5, lowStockThreshold: 3, expiryDate: today - DAY }];
  const t = Date.now();
  const sales = [{ id: 1, total: 100000, cost: 70000, profit: 30000, date: t - 1000, paymentMethod: "cash", items: [{ productId: 1, name: "Sugar", qty: 20, sellPrice: 5000, costPrice: 3800 }] }];
  const expenses = [{ id: 1, amount: 12000, date: t - 500, category: "Transport", method: "cash" }];
  it("report separates gross, expenses and net", () => {
    const r = buildPeriodReport(products, sales, [], [], "today", expenses, []);
    expect(r.grossProfit).toBe(30000);
    expect(r.expensesTotal).toBe(12000);
    expect(r.netProfit).toBe(18000);
    expect(digestToWhatsAppText(r, "Shop")).toContain("Net profit");
  });
  it("report admits when no expenses exist instead of calling gross 'net'", () => {
    const r = buildPeriodReport(products, sales, [], [], "today", [], []);
    expect(digestToWhatsAppText(r, "Shop")).toContain("No expenses recorded");
  });
  it("Advisor answers net-profit and expiry questions from the data", () => {
    const extras = { expenses, adjustments: [], cashups: [], supplierPayments: [], allSales: sales };
    expect(ruleBasedAnswer("what is my real profit after expenses?", products, sales, [], [], extras).text).toMatch(/net profit/);
    expect(ruleBasedAnswer("is anything expiring?", products, sales, [], [], extras).text).toMatch(/Sugar/);
    expect(buildDigest(products, sales, [], [], extras)).toContain("NET profit");
  });
});

import { attentionItems } from "./advisorFinance.js";
describe("Advisor speaks first", () => {
  it("surfaces expired stock and missing expenses, most serious first, capped at four", () => {
    const products = [{ id: 1, name: "Milk", stock: 6, costPrice: 1000, sellPrice: 1500, expiryDate: today - 2 * DAY }];
    const sales = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, total: 1000, profit: 300, date: now - i * 1000 }));
    const items = attentionItems(products, sales, [], [], { expenses: [], adjustments: [], cashups: [], supplierPayments: [], allSales: sales });
    expect(items[0].text).toMatch(/past their expiry/);
    expect(items.some((i) => /No expenses are recorded/.test(i.text))).toBe(true);
    expect(items.length).toBeLessThanOrEqual(4);
  });
  it("stays quiet when nothing is wrong", () => {
    expect(attentionItems([], [], [], [], {})).toEqual([]);
  });
});
