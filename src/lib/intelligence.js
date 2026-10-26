/* ------------------------------------------------------------------ */
/* Intelligence engine — sell-through forecasting, debtor risk,        */
/* slow-moving stock and same-day anomaly detection. Everything here   */
/* is computed live from the shop's own sales/purchase/debtor history  */
/* — no external data, no invented numbers.                            */
/*                                                                       */
/* Pulled out on its own (no React, no UI) specifically so it can be    */
/* unit-tested in isolation — feed it arrays of plain products/sales/    */
/* debtors/purchases objects and assert on the numbers it returns.      */
/* ------------------------------------------------------------------ */
import { ugx } from "./theme.js";


/* ------------------------------------------------------------------ */
/* Intelligence engine — sell-through forecasting, debtor risk,        */
/* slow-moving stock and same-day anomaly detection. Everything here   */
/* is computed live from the shop's own sales/purchase/debtor history  */
/* — no external data, no invented numbers.                            */
/* ------------------------------------------------------------------ */
export const LOOKBACK_DAYS = 14;

export function daysSince(ts) {
  return (Date.now() - ts) / 86400000;
}

// Same as what a simple velocity lookup would give you, but also tracks
// how many *distinct days* in the window actually had a sale of that
// product. This is the raw fact that confidence is graded on — two
// products can share a velocity of 1/day, but one from a single big sale
// and the other from steady daily sales, and those deserve very different
// trust levels.
export function computeVelocityDetail(products, sales, lookbackDays = LOOKBACK_DAYS) {
  const cutoff = Date.now() - lookbackDays * 86400000;
  const units = {};
  const saleDays = {}; // productId -> Set of day-keys with a sale
  sales.forEach((s) => {
    if (s.date < cutoff) return;
    const dayKey = new Date(s.date).toDateString();
    (s.items || []).forEach((i) => {
      units[i.productId] = (units[i.productId] || 0) + i.qty;
      if (!saleDays[i.productId]) saleDays[i.productId] = new Set();
      saleDays[i.productId].add(dayKey);
    });
  });
  const map = {};
  products.forEach((p) => {
    map[p.id] = {
      velocity: (units[p.id] || 0) / lookbackDays,
      daysWithSales: saleDays[p.id] ? saleDays[p.id].size : 0,
    };
  });
  return map;
}

// Turns a raw days-with-sales count into a plain confidence label, so the
// UI, the rule-based answers and the LLM all use the exact same threshold.
export function velocityConfidence(daysWithSales) {
  if (daysWithSales >= 7) return "high";
  if (daysWithSales >= 3) return "medium";
  return "low";
}

// Days-until-stockout and a suggested reorder qty per product, based on
// real sell-through rather than the static lowStockThreshold alone. Every
// item also carries a `reason` (the exact numbers behind the flag) and a
// `confidence` label (how much sales history that reasoning rests on) —
// both computed here, once, so a "why" question or a printed report can
// only ever repeat this fact, never invent a different one.
export function computeForecast(products, sales, purchases, lookbackDays = LOOKBACK_DAYS) {
  const detail = computeVelocityDetail(products, sales, lookbackDays);
  return products.map((p) => {
    const { velocity: v, daysWithSales } = detail[p.id] || { velocity: 0, daysWithSales: 0 };
    const daysLeft = v > 0 ? p.stock / v : null;
    const confidence = velocityConfidence(daysWithSales);
    const lastPurchase = [...purchases].reverse().find((pu) => pu.productId === p.id);
    const suggestedQty = v > 0
      ? Math.max(p.lowStockThreshold, Math.ceil(v * lookbackDays - p.stock))
      : Math.max(p.lowStockThreshold * 2 - p.stock, 0);

    const reason = v > 0
      ? `Selling ~${v.toFixed(1)} unit(s)/day (${daysWithSales} of the last ${lookbackDays} days had a sale), with ${p.stock} in stock — about ${Math.max(0, Math.round(daysLeft))} day(s) left at that pace, against your reorder threshold of ${p.lowStockThreshold}.`
      : `No sales recorded in the last ${lookbackDays} days to pace this from — ${p.stock} in stock vs a threshold of ${p.lowStockThreshold}, flagged on stock level alone.`;

    return {
      ...p,
      velocity: v,
      daysWithSales,
      confidence,
      daysLeft,
      suggestedQty,
      reason,
      lastSupplier: lastPurchase ? lastPurchase.supplier : "",
    };
  });
}

// Items genuinely worth reordering now: about to run out by real pace,
// or below the manual threshold as a fallback for new/low-history items.
export function computeReorderDrafts(forecast) {
  return forecast
    .filter((p) => (p.daysLeft !== null && p.daysLeft <= 5) || p.stock <= p.lowStockThreshold)
    .filter((p) => p.suggestedQty > 0)
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
}

// Overstocked items that are barely moving — discount/bundle candidates.
export function computeSlowMoving(products, sales, lookbackDays = LOOKBACK_DAYS) {
  const detail = computeVelocityDetail(products, sales, lookbackDays);
  return products
    .map((p) => {
      const { velocity, daysWithSales } = detail[p.id] || { velocity: 0, daysWithSales: 0 };
      return {
        ...p,
        velocity,
        daysWithSales,
        confidence: velocityConfidence(daysWithSales),
        reason: `Only ~${velocity.toFixed(2)} unit(s)/day sold over the last ${lookbackDays} days (${daysWithSales} day(s) with any sale at all), while ${p.stock} unit(s) sit in stock — above your ${p.lowStockThreshold}-unit threshold.`,
      };
    })
    .filter((p) => p.stock > p.lowStockThreshold && p.velocity < 0.3)
    .sort((a, b) => a.velocity - b.velocity);
}

// Debtors whose payment behaviour is drifting — flagged by how long
// they've gone idle while still owing money, not just a flat balance.
export function computeDebtorRisk(debtors) {
  return debtors
    .map((d) => {
      const balance = d.owed - d.paid;
      const history = [...(d.history || [])].sort((a, b) => b.date - a.date);
      const lastActivity = history[0];
      const idleDays = lastActivity ? daysSince(lastActivity.date) : null;
      let risk = "low";
      const missedPromiseDays = d.promiseDate && balance > 0 ? Math.floor((Date.now() - d.promiseDate) / 86400000) : null;
      if (balance > 0) {
        if (idleDays !== null && idleDays >= 14) risk = "high";
        else if (idleDays !== null && idleDays >= 7) risk = "medium";
        // Breaking a promised payment date is a stronger signal than being quiet.
        if (missedPromiseDays !== null && missedPromiseDays >= 3) risk = "high";
        else if (missedPromiseDays !== null && missedPromiseDays >= 1 && risk === "low") risk = "medium";
      }
      const reason = missedPromiseDays !== null && missedPromiseDays >= 1
        ? `Owes ${ugx(balance)} and promised to pay ${missedPromiseDays} day(s) ago but hasn't.`
        : idleDays !== null
        ? `Owes ${ugx(balance)} with no payment or purchase activity in ${Math.round(idleDays)} day(s) — that crosses the ${risk === "high" ? "14-day high-risk" : "7-day medium-risk"} mark.`
        : `Owes ${ugx(balance)} with no recorded activity history at all.`;
      return { ...d, balance, idleDays, risk, reason };
    })
    .filter((d) => d.balance > 0 && d.risk !== "low")
    .sort((a, b) => (b.idleDays ?? 0) - (a.idleDays ?? 0));
}

// Same-day pricing mistakes and unusual revenue swings — the sort of
// thing a bookkeeper would catch but a busy owner won't cross-check.
export function computeAnomalies(sales) {
  const anomalies = [];
  const todaySales = sales.filter((s) => daysSince(s.date) < 1);

  todaySales.forEach((s) => {
    const margin = s.total > 0 ? s.profit / s.total : 0;
    if (s.total > 0 && margin < 0.05) {
      anomalies.push({
        id: `margin-${s.id}`,
        confidence: "high",
        text: `A sale of ${ugx(s.total)} today had only ${(margin * 100).toFixed(1)}% margin — worth checking for a pricing or discount mistake.`,
      });
    }
  });

  const trailing = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    trailing.push(sales.filter((s) => s.date >= d.getTime() && s.date < next.getTime()).reduce((s, x) => s + x.total, 0));
  }
  const avg = trailing.reduce((a, b) => a + b, 0) / (trailing.length || 1);
  const todayCutoff = new Date(); todayCutoff.setHours(0, 0, 0, 0);
  const todayRevenue = sales.filter((s) => s.date >= todayCutoff.getTime()).reduce((s, x) => s + x.total, 0);
  const hoursPassed = (Date.now() - todayCutoff.getTime()) / 3600000;
  if (avg > 0 && hoursPassed >= 6 && todayRevenue < avg * 0.4) {
    anomalies.push({
      id: "revenue-drop",
      confidence: "high",
      text: `Revenue so far today (${ugx(todayRevenue)}) is well below the recent daily average of ${ugx(Math.round(avg))} for this time of day.`,
    });
  }
  return anomalies;
}

// ---- Time periods -----------------------------------------------------
// Every question can be scoped to "today", "yesterday", "week" or "month"
// (or "all" for the full history). This is what let the AI reason about
// "today" vs "overall" instead of only ever answering in aggregate.
export function parsePeriod(q) {
  if (/\btoday\b/.test(q)) return "today";
  if (/\byesterday\b/.test(q)) return "yesterday";
  if (/this week|past week|last 7 days|weekly/.test(q)) return "week";
  if (/this month|past month|last 30 days|monthly/.test(q)) return "month";
  return "all";
}
export function periodRange(period) {
  const now = Date.now();
  if (period === "today") {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    return [s.getTime(), now];
  }
  if (period === "yesterday") {
    const e = new Date(); e.setHours(0, 0, 0, 0);
    const s = new Date(e); s.setDate(s.getDate() - 1);
    return [s.getTime(), e.getTime()];
  }
  if (period === "week") return [now - 7 * 86400000, now];
  if (period === "month") return [now - 30 * 86400000, now];
  return [0, now];
}
export const PERIOD_LABEL = { today: "today", yesterday: "yesterday", week: "in the last 7 days", month: "in the last 30 days", all: "overall" };

export function salesInRange(sales, start, end) {
  return sales.filter((s) => s.date >= start && s.date <= end);
}

// Per-product breakdown (units, revenue, profit) for a set of sales —
// the thing that was missing when someone asked "what sold most today".
export function computeProductBreakdown(periodSales) {
  const map = {};
  periodSales.forEach((s) => (s.items || []).forEach((i) => {
    if (!map[i.name]) map[i.name] = { name: i.name, units: 0, revenue: 0 };
    map[i.name].units += i.qty;
    map[i.name].revenue += i.sellPrice * i.qty;
  }));
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

// Revenue by category for a set of sales.
export function computeCategoryBreakdown(products, periodSales) {
  const catByName = {};
  products.forEach((p) => { catByName[p.name] = p.category; });
  const map = {};
  periodSales.forEach((s) => (s.items || []).forEach((i) => {
    const cat = catByName[i.name] || "Uncategorised";
    map[cat] = (map[cat] || 0) + i.sellPrice * i.qty;
  }));
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([category, revenue]) => ({ category, revenue }));
}

// Day-over-day and week-over-week growth, so the AI can say whether the
// business is up or down, not just what the raw number is.
export function computeGrowth(sales) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const todayRevenue = salesInRange(sales, todayStart.getTime(), Date.now()).reduce((s, x) => s + x.total, 0);
  const yesterdayRevenue = salesInRange(sales, yesterdayStart.getTime(), todayStart.getTime()).reduce((s, x) => s + x.total, 0);

  const thisWeekRevenue = salesInRange(sales, Date.now() - 7 * 86400000, Date.now()).reduce((s, x) => s + x.total, 0);
  const lastWeekRevenue = salesInRange(sales, Date.now() - 14 * 86400000, Date.now() - 7 * 86400000).reduce((s, x) => s + x.total, 0);

  const dayChangePct = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;
  const weekChangePct = lastWeekRevenue > 0 ? ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100 : null;

  return { todayRevenue, yesterdayRevenue, dayChangePct, thisWeekRevenue, lastWeekRevenue, weekChangePct };
}

// Average basket size and value — a core retail health metric.
export function computeBasketStats(periodSales) {
  if (periodSales.length === 0) return { avgValue: 0, avgItems: 0, count: 0 };
  const totalValue = periodSales.reduce((s, x) => s + x.total, 0);
  const totalItems = periodSales.reduce((s, x) => s + (x.items || []).reduce((a, i) => a + i.qty, 0), 0);
  return { avgValue: totalValue / periodSales.length, avgItems: totalItems / periodSales.length, count: periodSales.length };
}

// Which day of the week performs best historically — helps with staffing
// and promotion timing decisions.
export function computeBusiestDay(sales) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  sales.forEach((s) => {
    const day = new Date(s.date).getDay();
    totals[day] += s.total;
    counts[day] += 1;
  });
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const avgs = totals.map((t, i) => (counts[i] > 0 ? t / counts[i] : 0));
  const bestIdx = avgs.indexOf(Math.max(...avgs));
  return avgs[bestIdx] > 0 ? { day: DAY_NAMES[bestIdx], avgRevenue: avgs[bestIdx] } : null;
}

// Snapshot of everything sitting in the shop right now — total capital
// tied up in stock, at both cost and retail value.
export function computeInventorySummary(products) {
  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  const costValue = products.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const retailValue = products.reduce((s, p) => s + p.stock * p.sellPrice, 0);
  return { skuCount: products.length, totalUnits, costValue, retailValue, potentialProfit: retailValue - costValue };
}

// Overall debtor book health, beyond just the flagged high/medium risk ones.
export function computeDebtorSummary(debtors) {
  const withBalance = debtors.filter((d) => d.owed - d.paid > 0);
  const totalOwed = withBalance.reduce((s, d) => s + (d.owed - d.paid), 0);
  return { debtorCount: withBalance.length, totalOwed, allDebtorCount: debtors.length };
}

// The full business-intelligence layer — everything the Advisor can
// surface without being asked, or reason about when it is. Computed live
// from the shop's own records; nothing here is ever invented.
export function buildInsights(products, sales, debtors, purchases) {
  const forecast = computeForecast(products, sales, purchases);
  const reorderDrafts = computeReorderDrafts(forecast);
  const slowMoving = computeSlowMoving(products, sales);
  const debtorRisk = computeDebtorRisk(debtors);
  const anomalies = computeAnomalies(sales);

  const [todayStart, todayEnd] = periodRange("today");
  const [weekStart, weekEnd] = periodRange("week");
  const todaySales = salesInRange(sales, todayStart, todayEnd);
  const weekSales = salesInRange(sales, weekStart, weekEnd);

  const todayProducts = computeProductBreakdown(todaySales);
  const weekProducts = computeProductBreakdown(weekSales);
  const allTimeProducts = computeProductBreakdown(sales);
  const todayCategories = computeCategoryBreakdown(products, todaySales);
  const growth = computeGrowth(sales);
  const basketToday = computeBasketStats(todaySales);
  const basketAll = computeBasketStats(sales);
  const busiestDay = computeBusiestDay(sales);
  const inventory = computeInventorySummary(products);
  const debtorSummary = computeDebtorSummary(debtors);

  return {
    forecast, reorderDrafts, slowMoving, debtorRisk, anomalies,
    todayProducts, weekProducts, allTimeProducts, todayCategories,
    growth, basketToday, basketAll, busiestDay, inventory, debtorSummary,
  };
}
