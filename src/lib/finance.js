/* ------------------------------------------------------------------ */
/* Finance — the real money picture: gross vs net profit, expenses,     */
/* expected cash in the till, what the shop owes suppliers, expiry      */
/* warnings and supplier price rises. Pure functions, unit tested.      */
/* ------------------------------------------------------------------ */
const DAY = 86400000;

export const EXPENSE_CATEGORIES = [
  "Rent", "Wages", "Electricity & water", "Transport", "Airtime & data",
  "Mobile money fees", "Licences & taxes", "Repairs", "Packaging", "Other",
];

export const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const activeSales = (sales) => sales.filter((s) => !s.voided);
const inRange = (t, start, end) => t >= start && t < end;

// Gross profit = sales minus what the goods cost. Net profit also takes off
// the running costs of the shop and stock lost to damage, expiry or theft.
export function periodFinance({ sales, expenses = [], adjustments = [], start, end }) {
  const inSales = activeSales(sales).filter((s) => inRange(s.date, start, end));
  const revenue = inSales.reduce((t, s) => t + s.total, 0);
  const gross = inSales.reduce((t, s) => t + s.profit, 0);
  const expensesTotal = expenses.filter((e) => inRange(e.date, start, end)).reduce((t, e) => t + e.amount, 0);
  const stockLoss = adjustments.filter((a) => inRange(a.date, start, end)).reduce((t, a) => t + (a.lossValue || 0), 0);
  const net = gross - expensesTotal - stockLoss;
  return { revenue, gross, expensesTotal, stockLoss, net, netMarginPct: revenue > 0 ? (net / revenue) * 100 : 0, salesCount: inSales.length };
}

// What should be physically in the cash drawer at the end of a day.
export function cashExpectedForDay({ sales, debtors, expenses = [], supplierPayments = [], purchases = [], dayStart, float = 0 }) {
  const end = dayStart + DAY;
  const daySales = activeSales(sales).filter((s) => inRange(s.date, dayStart, end));
  const cashSales = daySales.filter((s) => s.paymentMethod === "cash").reduce((t, s) => t + s.total, 0);
  const creditDown = daySales.filter((s) => s.paymentMethod === "credit").reduce((t, s) => t + (s.paidNow || 0), 0);

  let debtorCash = 0;
  let debtorMomo = 0;
  debtors.forEach((d) => (d.history || []).forEach((h) => {
    if (h.type !== "payment" || h.atSale || !inRange(h.date, dayStart, end)) return;
    if ((h.method || "cash") === "momo") debtorMomo += h.amount; else debtorCash += h.amount;
  }));

  const expensesCash = expenses.filter((e) => (e.method || "cash") === "cash" && inRange(e.date, dayStart, end)).reduce((t, e) => t + e.amount, 0);
  const supplierCash =
    supplierPayments.filter((p) => (p.method || "cash") === "cash" && inRange(p.date, dayStart, end)).reduce((t, p) => t + p.amount, 0) +
    purchases.filter((p) => (p.payMethod || "cash") === "cash" && inRange(p.date, dayStart, end)).reduce((t, p) => t + paidAtDelivery(p), 0);

  const momoSales = daySales.filter((s) => s.paymentMethod === "momo").reduce((t, s) => t + s.total, 0);
  const expected = Number(float || 0) + cashSales + creditDown + debtorCash - expensesCash - supplierCash;
  return { cashSales, creditDown, debtorCash, expensesCash, supplierCash, expected, momoReceived: momoSales + debtorMomo };
}

const paidAtDelivery = (p) => (p.paid === undefined || p.paid === null ? p.totalCost : p.paid);

// What the shop still owes each supplier (deliveries bought on credit, less payments made).
export function supplierBalances(purchases, supplierPayments = []) {
  const map = {};
  const key = (n) => (String(n || "").trim() || "Unknown supplier");
  purchases.forEach((p) => { const k = key(p.supplier); map[k] = (map[k] || 0) + (p.totalCost - paidAtDelivery(p)); });
  supplierPayments.forEach((p) => { const k = key(p.supplier); map[k] = (map[k] || 0) - p.amount; });
  return Object.entries(map).filter(([, owed]) => owed > 0).map(([supplier, owed]) => ({ supplier, owed })).sort((a, b) => b.owed - a.owed);
}

// Stock on the shelf that is past, or close to, its expiry date.
export function expiryAlerts(products, now = Date.now(), soonDays = 7) {
  const today = startOfDay(now);
  const expired = [];
  const soon = [];
  products.forEach((p) => {
    if (!p.expiryDate || p.stock <= 0) return;
    const daysLeft = Math.round((startOfDay(p.expiryDate) - today) / DAY);
    const row = { id: p.id, name: p.name, stock: p.stock, daysLeft, costValue: p.stock * p.costPrice };
    if (daysLeft < 0) expired.push(row);
    else if (daysLeft <= soonDays) soon.push(row);
  });
  expired.sort((a, b) => a.daysLeft - b.daysLeft);
  soon.sort((a, b) => a.daysLeft - b.daysLeft);
  return { expired, soon };
}

// Supplier price rises that have squeezed a product's margin.
export function marginWatch(products, purchases) {
  const out = [];
  products.forEach((p) => {
    const buys = purchases.filter((x) => x.productId === p.id && x.costPricePerUnit > 0).sort((a, b) => a.date - b.date);
    if (buys.length < 2 || !(p.sellPrice > 0)) return;
    const prev = buys[buys.length - 2].costPricePerUnit;
    const last = buys[buys.length - 1].costPricePerUnit;
    const rise = (last - prev) / prev;
    if (rise < 0.05) return;
    const oldMargin = (p.sellPrice - prev) / p.sellPrice;
    const newMargin = (p.sellPrice - last) / p.sellPrice;
    if (newMargin > oldMargin - 0.03) return;
    const suggested = Math.ceil(last / (1 - Math.max(oldMargin, 0.05)) / 100) * 100;
    out.push({ id: p.id, name: p.name, from: prev, to: last, risePct: rise * 100, oldMarginPct: oldMargin * 100, newMarginPct: newMargin * 100, sellPrice: p.sellPrice, suggestedPrice: suggested });
  });
  return out.sort((a, b) => b.risePct - a.risePct);
}

// One bundle of money-related findings, used by the Advisor and the dashboards.
export function buildFinanceInsights({ products, sales, debtors, purchases, expenses = [], adjustments = [], cashups = [], supplierPayments = [], now = Date.now() }) {
  const today = startOfDay(now);
  const d = new Date(today);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const week = periodFinance({ sales, expenses, adjustments, start: today - 6 * DAY, end: today + DAY });
  const month = periodFinance({ sales, expenses, adjustments, start: monthStart, end: today + DAY });

  const monthExpenseByCat = {};
  expenses.filter((e) => e.date >= monthStart).forEach((e) => { monthExpenseByCat[e.category] = (monthExpenseByCat[e.category] || 0) + e.amount; });

  const weekAgo = today - 6 * DAY;
  const voids = sales.filter((s) => s.voided && s.voided.at >= weekAgo);
  const voidsBy = {};
  voids.forEach((s) => { const k = s.voided.by || "unknown"; voidsBy[k] = (voidsBy[k] || 0) + 1; });

  const discountBy = {};
  activeSales(sales).filter((s) => s.date >= weekAgo && s.discount > 0).forEach((s) => { const k = s.by || "unknown"; discountBy[k] = (discountBy[k] || 0) + s.discount; });

  const recentCashups = cashups.filter((c) => c.date >= weekAgo);
  const cashShort = recentCashups.filter((c) => c.diff < 0).reduce((t, c) => t + c.diff, 0);

  const lossByReason = {};
  adjustments.filter((a) => a.date >= monthStart && a.lossValue > 0).forEach((a) => { lossByReason[a.reason] = (lossByReason[a.reason] || 0) + a.lossValue; });

  return {
    week, month, monthExpenseByCat,
    suppliersOwed: supplierBalances(purchases, supplierPayments),
    expiry: expiryAlerts(products, now),
    marginWatch: marginWatch(products, purchases),
    voids: { count: voids.length, value: voids.reduce((t, s) => t + s.total, 0), by: voidsBy },
    discounts: { total: Object.values(discountBy).reduce((t, v) => t + v, 0), by: discountBy },
    cash: { checked: recentCashups.length, short: cashShort, last: [...cashups].sort((a, b) => b.date - a.date)[0] || null },
    lossByReason,
  };
}
