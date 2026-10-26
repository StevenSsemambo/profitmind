/* ------------------------------------------------------------------ */
/* Advisor rule engine — answers the common questions straight from     */
/* the shop's own numbers (no network call), and builds the plain-text  */
/* digest that's handed to Claude for anything it doesn't recognise.    */
/* This is deliberately React-free and side-effect-free so it can be    */
/* unit tested on its own: feed it a question string plus plain data     */
/* arrays, assert on the returned { source, text }.                     */
/* ------------------------------------------------------------------ */
import { ugx } from "./theme.js";
import { buildInsights, salesInRange, periodRange, parsePeriod, PERIOD_LABEL, LOOKBACK_DAYS, computeProductBreakdown, computeCategoryBreakdown } from "./intelligence.js";
import { parseScenario, simulateScenario, narrateScenario, findProductInText } from "./scenario.js";

export function buildDigest(products, sales, debtors, purchases) {
  const insights = buildInsights(products, sales, debtors, purchases);
  const {
    reorderDrafts, slowMoving, debtorRisk, anomalies,
    todayProducts, todayCategories, growth, basketToday, basketAll,
    busiestDay, inventory, debtorSummary,
  } = insights;

  const todaySales = salesInRange(sales, ...periodRange("today"));
  const revenue = todaySales.reduce((s, x) => s + x.total, 0);
  const profit = todaySales.reduce((s, x) => s + x.profit, 0);
  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const fmtPct = (v) => (v === null ? "no prior data to compare" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

  return [
    `Today: ${ugx(revenue)} revenue, ${ugx(profit)} net profit, ${todaySales.length} sale(s). Vs yesterday: ${fmtPct(growth.dayChangePct)}.`,
    `This week so far: ${ugx(growth.thisWeekRevenue)} revenue. Vs last week: ${fmtPct(growth.weekChangePct)}.`,
    `Overall (all-time) profit margin: ${overallMargin.toFixed(1)}% (${ugx(totalProfit)} profit on ${ugx(totalRevenue)} revenue across ${sales.length} sale(s)).`,
    todayProducts.length
      ? `Top-selling products TODAY by revenue: ${todayProducts.slice(0, 5).map((p) => `${p.name} (${p.units} unit(s), ${ugx(p.revenue)})`).join(", ")}.`
      : "No sales recorded yet today.",
    todayCategories.length
      ? `Revenue by category today: ${todayCategories.map((c) => `${c.category} (${ugx(c.revenue)})`).join(", ")}.`
      : "No category breakdown available yet today.",
    `Average sale today: ${ugx(basketToday.avgValue || 0)} across ${basketToday.avgItems.toFixed(1)} item(s) per sale (all-time average: ${ugx(basketAll.avgValue)}).`,
    busiestDay ? `Historically, ${busiestDay.day} is the best-performing day, averaging ${ugx(busiestDay.avgRevenue)} per sale.` : "Not enough history yet to identify a busiest day.",
    `Inventory on hand: ${inventory.skuCount} product(s), ${inventory.totalUnits} unit(s) total. Tied up at cost: ${ugx(inventory.costValue)}; retail value if all sold: ${ugx(inventory.retailValue)}.`,
    `Outstanding customer debt: ${ugx(debtorSummary.totalOwed)} across ${debtorSummary.debtorCount} debtor(s) with a balance.`,
    reorderDrafts.length
      ? `Forecast stockouts (based on real sell-through, not just the manual threshold) — each with its exact reason, quote these verbatim if asked "why": ${reorderDrafts
          .map((p) => `${p.name} [reason: ${p.reason}] [confidence: ${p.confidence}]`)
          .join("; ")}.`
      : "No products are forecast to run out soon.",
    slowMoving.length
      ? `Slow-moving / overstocked, each with its exact reason: ${slowMoving.map((p) => `${p.name} [reason: ${p.reason}]`).join("; ")}.`
      : "No notably slow-moving stock right now.",
    debtorRisk.length
      ? `Debtors worth following up, each with its exact reason: ${debtorRisk.map((d) => `${d.name} [reason: ${d.reason}]`).join("; ")}.`
      : "No debtors flagged as overdue right now.",
    anomalies.length ? `Flags today: ${anomalies.map((a) => a.text).join(" ")}` : "No anomalies detected today.",
  ].join("\n");
}

export function ruleBasedAnswer(question, products, sales, debtors, purchases) {
  const q = question.toLowerCase();
  const insights = buildInsights(products, sales, debtors, purchases);
  const period = parsePeriod(q);
  const label = PERIOD_LABEL[period];

  // WHY — explain a specific flagged product or debtor using the exact
  // `reason` computed alongside that flag, never a fresh guess.
  if (/\bwhy\b/.test(q)) {
    const { reorderDrafts, slowMoving, debtorRisk } = insights;
    const namedIn = (list) => list.find((x) => {
      const name = x.name.toLowerCase();
      if (q.includes(name)) return true;
      const firstWord = name.split(" ")[0];
      return firstWord.length >= 3 && q.includes(firstWord);
    });
    const p1 = namedIn(reorderDrafts);
    if (p1) return { source: "data", text: p1.reason };
    const p2 = namedIn(slowMoving);
    if (p2) return { source: "data", text: p2.reason };
    const d1 = namedIn(debtorRisk);
    if (d1) return { source: "data", text: d1.reason };
    if (/reorder|restock|stock/.test(q) && reorderDrafts.length) {
      return { source: "data", text: reorderDrafts.map((p) => `${p.name}: ${p.reason}`).join("\n") };
    }
    if (/debtor|owe|credit|follow.?up|chase/.test(q) && debtorRisk.length) {
      return { source: "data", text: debtorRisk.map((d) => `${d.name}: ${d.reason}`).join("\n") };
    }
    if (/slow|discount|overstock/.test(q) && slowMoving.length) {
      return { source: "data", text: slowMoving.map((p) => `${p.name}: ${p.reason}`).join("\n") };
    }
    // No specific flag matched — fall through, this may be a genuinely
    // open-ended "why" question better suited to the LLM fallback.
  }

  // CONFIDENCE — how much real sales history backs the current forecasts,
  // graded by the same daysWithSales threshold used to compute them.
  if (/confiden|how sure|how reliable|trust (this|these|it)|how accurate/.test(q)) {
    const counts = { high: 0, medium: 0, low: 0 };
    insights.forecast.forEach((p) => { counts[p.confidence] = (counts[p.confidence] || 0) + 1; });
    const lowItems = insights.forecast.filter((p) => p.confidence === "low" && (p.velocity > 0 || p.stock <= p.lowStockThreshold));
    return {
      source: "data",
      text:
        `Forecast confidence across your ${products.length} product(s): ${counts.high} high, ${counts.medium} medium, ${counts.low} low ` +
        `(based on how many of the last ${LOOKBACK_DAYS} days actually had a sale of that item).` +
        (lowItems.length ? ` Treat reorder suggestions for ${lowItems.slice(0, 4).map((p) => p.name).join(", ")} as rough guides only — too little sales history yet.` : " Nothing is currently flagged on thin data."),
    };
  }

  // WHAT-IF — a real simulation of a price or stock change, not a guess.
  if (/what if|what happens if|suppose i|if i (raise|lower|drop|increase|decrease|cut|stock|order|buy)/.test(q)) {
    const scenario = parseScenario(q, products);
    const result = scenario ? simulateScenario(products, sales, scenario) : null;
    if (result) {
      return { source: "data", text: narrateScenario(result) };
    }
    return {
      source: "data",
      text: "I couldn't pin down a product and a clear change from that — try something like \"what if I raise Sugar's price by 10%\" or \"what if I stock 50 more Bread\".",
    };
  }

  // PRODUCT LOOKUP — stock, price, or margin on one named product. Pure
  // field reads, so this works even with zero sales history.
  if (/\bstock\b|\bleft\b|\bhow much\b.*\b(do i have|is there|are there)\b|\bprice of|\bcost of|\bsells? for|\bmargin on|\bprofit on|\bhow much (does|is)\b.*(cost|sell)/.test(q)) {
    const p = findProductInText(q, products);
    if (p) {
      if (/margin|profit on/.test(q)) {
        const unitProfit = p.sellPrice - p.costPrice;
        const marginPct = p.sellPrice > 0 ? (unitProfit / p.sellPrice) * 100 : 0;
        return { source: "data", text: `${p.name}: ${ugx(unitProfit)} profit per unit sold — a ${marginPct.toFixed(1)}% margin (cost ${ugx(p.costPrice)}, sells for ${ugx(p.sellPrice)}).` };
      }
      if (/price of|cost of|sells? for|how much (does|is)/.test(q)) {
        return { source: "data", text: `${p.name} sells for ${ugx(p.sellPrice)} (costs ${ugx(p.costPrice)} to stock).` };
      }
      return { source: "data", text: `${p.name}: ${p.stock} ${p.unit}(s) in stock right now (reorder threshold: ${p.lowStockThreshold}).` };
    }
  }

  // SUPPLIER / PURCHASE HISTORY — who a product was last bought from.
  if (/who (do i|does the shop|should i)\b.*(buy|order)|supplier for|where (do i|does the shop) (get|buy|order)|last (order|purchase|delivery) of/.test(q)) {
    const p = findProductInText(q, products);
    if (p) {
      const recent = [...purchases].filter((x) => x.productId === p.id).sort((a, b) => b.date - a.date)[0];
      return {
        source: "data",
        text: recent
          ? `Last delivery of ${p.name}: ${recent.qty} unit(s) from ${recent.supplier || "an unrecorded supplier"} on ${new Date(recent.date).toLocaleDateString("en-GB")}.`
          : `No purchase history recorded yet for ${p.name}.`,
      };
    }
  }

  if (/how.*(doing|today|business)|sales today/.test(q) && period === "today") {
    const todaySales = salesInRange(sales, ...periodRange("today"));
    const revenue = todaySales.reduce((s, x) => s + x.total, 0);
    const profit = todaySales.reduce((s, x) => s + x.profit, 0);
    const g = insights.growth.dayChangePct;
    return {
      source: "data",
      text: `Today so far: ${ugx(revenue)} in sales, ${ugx(profit)} net profit.` + (g !== null ? ` That's ${g >= 0 ? "up" : "down"} ${Math.abs(g).toFixed(1)}% vs yesterday.` : ""),
    };
  }
  if (/restock|reorder|running out|forecast/.test(q)) {
    const { reorderDrafts } = insights;
    return {
      source: "data",
      text: reorderDrafts.length
        ? reorderDrafts
            .map((p) => `${p.name}: ${p.stock} left${p.daysLeft !== null ? `, ~${Math.max(0, Math.round(p.daysLeft))} day(s) at current pace` : ""} — reorder ~${p.suggestedQty}.`)
            .join("\n")
        : "Nothing urgent — stock levels are pacing fine against recent sales.",
    };
  }
  // NAMED DEBTOR — a specific person's balance, checked before the
  // generic overdue/total-debt rules so a name always wins.
  if (/owe|balance|paid/.test(q)) {
    const named = debtors.find((d) => {
      const name = d.name.toLowerCase();
      if (q.includes(name)) return true;
      const firstWord = name.split(" ")[0];
      return firstWord.length >= 3 && q.includes(firstWord);
    });
    if (named) {
      const balance = Math.max(0, (named.owed || 0) - (named.paid || 0));
      return {
        source: "data",
        text: balance > 0
          ? `${named.name} owes ${ugx(balance)} (${ugx(named.paid || 0)} paid of ${ugx(named.owed || 0)} total credit).`
          : `${named.name} has no outstanding balance right now.`,
      };
    }
  }
  if (/overdue|follow.?up|chase|debtor.*risk/.test(q)) {
    const { debtorRisk } = insights;
    return {
      source: "data",
      text: debtorRisk.length
        ? debtorRisk.map((d) => `${d.name} (${d.risk} risk): owes ${ugx(d.balance)}, no activity in ${Math.round(d.idleDays)} day(s).`).join("\n")
        : "No debtors look overdue right now.",
    };
  }
  if (/how many debtors|debtor.*(count|summary)/.test(q)) {
    const { debtorSummary } = insights;
    return { source: "data", text: `${debtorSummary.debtorCount} debtor(s) currently owe money, totalling ${ugx(debtorSummary.totalOwed)}.` };
  }
  if (/debt|owe|credit/.test(q)) {
    const total = debtors.reduce((s, d) => s + Math.max(0, d.owed - d.paid), 0);
    return { source: "data", text: `Total owed to the business right now: ${ugx(total)}.` };
  }
  if (/slow|discount|not selling|dead stock|overstock/.test(q)) {
    const { slowMoving } = insights;
    return {
      source: "data",
      text: slowMoving.length
        ? `Slow-moving: ${slowMoving.map((p) => `${p.name} (${p.stock} in stock, ~${p.velocity.toFixed(1)}/day)`).join(", ")} — good candidates for a discount or bundle.`
        : "Nothing is obviously slow-moving right now.",
    };
  }
  if (/inventory value|stock value|worth in stock|capital.*(stock|tied up)/.test(q)) {
    const { inventory } = insights;
    return {
      source: "data",
      text: `You have ${inventory.skuCount} product(s), ${inventory.totalUnits} unit(s) on hand — ${ugx(inventory.costValue)} tied up at cost, worth ${ugx(inventory.retailValue)} at retail (${ugx(inventory.potentialProfit)} potential profit if all sold).`,
    };
  }
  if (/busiest day|best day|slowest day/.test(q)) {
    const { busiestDay } = insights;
    return {
      source: "data",
      text: busiestDay ? `${busiestDay.day} is historically the best-performing day, averaging ${ugx(busiestDay.avgRevenue)} per sale.` : "Not enough sales history yet to tell.",
    };
  }
  if (/average sale|basket size|per (sale|transaction)/.test(q)) {
    const b = period === "today" ? insights.basketToday : insights.basketAll;
    return {
      source: "data",
      text: b.count > 0 ? `Average sale ${label}: ${ugx(b.avgValue)}, with ${b.avgItems.toFixed(1)} item(s) per sale across ${b.count} sale(s).` : `No sales recorded ${label} yet.`,
    };
  }
  if (/(grow|growth|compare|vs (last|yesterday)|up or down|trend)/.test(q)) {
    const { growth } = insights;
    const dayTxt = growth.dayChangePct !== null ? `${growth.dayChangePct >= 0 ? "up" : "down"} ${Math.abs(growth.dayChangePct).toFixed(1)}% vs yesterday` : "no prior day to compare";
    const weekTxt = growth.weekChangePct !== null ? `${growth.weekChangePct >= 0 ? "up" : "down"} ${Math.abs(growth.weekChangePct).toFixed(1)}% vs last week` : "no prior week to compare";
    return { source: "data", text: `Revenue is ${dayTxt}. This week is ${weekTxt}.` };
  }
  if (/margin|profit rate|markup/.test(q)) {
    const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
    const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { source: "data", text: `Overall profit margin so far: ${margin.toFixed(1)}% (${ugx(totalProfit)} profit on ${ugx(totalRevenue)} revenue).` };
  }
  if (/category|categories/.test(q) && /sell|revenue|best/.test(q)) {
    const cats = period === "today" ? insights.todayCategories : computeCategoryBreakdown(products, salesInRange(sales, ...periodRange(period)));
    return {
      source: "data",
      text: cats.length ? `Revenue by category ${label}: ${cats.map((c) => `${c.category} (${ugx(c.revenue)})`).join(", ")}.` : `No sales recorded ${label} yet.`,
    };
  }
  if (/best.?sell|top product|most sold|which (item|product)/.test(q)) {
    const periodSales = salesInRange(sales, ...periodRange(period));
    const ranked = computeProductBreakdown(periodSales);
    if (ranked.length === 0) return { source: "data", text: `No sales recorded ${label} yet, so nothing to rank.` };
    const top = ranked[0];
    const runnerUp = ranked[1];
    return {
      source: "data",
      text: `Best seller ${label}: ${top.name} — ${top.units} unit(s), ${ugx(top.revenue)} revenue.` + (runnerUp ? ` Runner-up: ${runnerUp.name} (${ugx(runnerUp.revenue)}).` : ""),
    };
  }
  if (/how many products|how many (skus|items)\b.*(stock|catalogue|carry)/.test(q)) {
    const totalUnits = products.reduce((s, p) => s + p.stock, 0);
    return { source: "data", text: `${products.length} product(s) in your catalogue, ${totalUnits} unit(s) on hand across all of them.` };
  }
  if (/(cash|momo|mobile money|payment method)/.test(q) && /how much|breakdown|split|total/.test(q)) {
    const periodSales = salesInRange(sales, ...periodRange(period));
    const byMethod = {};
    periodSales.forEach((s) => { byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + s.total; });
    const methodLabel = { cash: "Cash", momo: "Mobile Money", credit: "On credit" };
    const parts = Object.entries(byMethod).map(([k, v]) => `${methodLabel[k] || k}: ${ugx(v)}`);
    return { source: "data", text: parts.length ? `Payment breakdown ${label}: ${parts.join(", ")}.` : `No sales recorded ${label} yet.` };
  }
  if (/compare|which (sells|sold) better|better seller/.test(q)) {
    const matches = products.filter((p) => {
      const name = p.name.toLowerCase();
      if (q.includes(name)) return true;
      const firstWord = name.split(" ")[0];
      return firstWord.length >= 3 && q.includes(firstWord);
    });
    if (matches.length >= 2) {
      const ranked = computeProductBreakdown(salesInRange(sales, ...periodRange(period)));
      const rows = matches.slice(0, 2).map((p) => {
        const r = ranked.find((x) => x.name === p.name);
        return `${p.name}: ${r ? `${r.units} unit(s), ${ugx(r.revenue)}` : `no sales ${label}`}`;
      });
      return { source: "data", text: `${rows.join(" vs. ")} (${label}).` };
    }
  }
  if (/how many (sales|transactions|orders)/.test(q)) {
    const periodSales = salesInRange(sales, ...periodRange(period));
    return { source: "data", text: `${periodSales.length} sale(s) recorded ${label}.` };
  }
  return null;
}

// Last-resort answer when the rule engine found no exact match AND Claude
// is unreachable (offline, or the network call failed) — a real snapshot
// grounded in the shop's own data rather than a dead "couldn't answer".
// Never invents anything; if there's genuinely nothing to say it says so.
export function offlineFallbackAnswer(products, sales, debtors, purchases) {
  const insights = buildInsights(products, sales, debtors, purchases);
  const { reorderDrafts, debtorRisk } = insights;
  const todaySales = salesInRange(sales, ...periodRange("today"));
  const revenue = todaySales.reduce((s, x) => s + x.total, 0);
  const profit = todaySales.reduce((s, x) => s + x.profit, 0);

  const lines = [
    "I couldn't match that to a specific report, and the AI assistant isn't reachable right now — here's a quick snapshot instead:",
    `Today: ${ugx(revenue)} revenue, ${ugx(profit)} profit, ${todaySales.length} sale(s).`,
    reorderDrafts.length
      ? `${reorderDrafts.length} product(s) forecast to run low: ${reorderDrafts.slice(0, 3).map((p) => p.name).join(", ")}${reorderDrafts.length > 3 ? ", …" : ""}.`
      : "Nothing forecast to run low.",
    debtorRisk.length ? `${debtorRisk.length} debtor(s) worth following up.` : "No debtors flagged right now.",
    "Try naming a product, a customer, or a time period — e.g. \"how much Sugar do I have\" or \"what sold best this week\".",
  ];
  return lines.join("\n");
}

export const SUGGESTIONS = [
  "How is my business doing today?",
  "What sold best today?",
  "What should I restock?",
  "How much Sugar do I have?",
  "How much does Nakato owe?",
  "What if I raise Sugar's price by 10%?",
  "Who should I follow up with for payment?",
  "Is revenue up or down this week?",
];

