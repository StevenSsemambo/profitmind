/* ------------------------------------------------------------------ */
/* Scenario simulator — real "what if" math, computed the same way a    */
/* reorder or risk flag is: deterministically, from the shop's own      */
/* numbers. The AI's job is only to narrate this result, never to       */
/* estimate one itself.                                                 */
/* ------------------------------------------------------------------ */
import { ugx } from "./theme.js";
import { computeVelocityDetail, velocityConfidence } from "./intelligence.js";

export function findProductInText(text, products) {
  const q = text.toLowerCase();
  return products.find((p) => {
    const name = p.name.toLowerCase();
    if (q.includes(name)) return true;
    const firstWord = name.split(" ")[0];
    return firstWord.length >= 3 && q.includes(firstWord);
  }) || null;
}

// Parses a "what if" question into a concrete scenario: a price change
// (± % on sell price) or a stock change (± units bought/held). Anything
// it can't confidently parse returns null rather than guessing.
export function parseScenario(q, products) {
  const product = findProductInText(q, products);
  if (!product) return null;

  const pctMatch = q.match(/(\d+(?:\.\d+)?)\s*%/);
  if (/price|charge|sell (it|them) (at|for)|discount|markup/.test(q) && pctMatch) {
    let value = parseFloat(pctMatch[1]);
    if (/lower|drop|discount|reduce|cut|decrease|less/.test(q)) value = -Math.abs(value);
    else value = Math.abs(value);
    return { productId: product.id, type: "price", value };
  }

  const unitMatch = q.match(/(\d+)\s*(more|extra|additional|units?|pcs?|pieces?)?/);
  if (/stock|order|buy|restock|inventory|hold/.test(q) && unitMatch) {
    let value = parseInt(unitMatch[1], 10);
    if (/less|fewer|reduce|cut/.test(q)) value = -value;
    return { productId: product.id, type: "stock", value };
  }
  return null;
}

// The actual simulation — pure arithmetic on real velocity, cost and
// price for the named product. No demand-elasticity is assumed; that
// limitation is stated explicitly in the result so it's never implied
// to be more certain than it is.
export function simulateScenario(products, sales, scenario) {
  const p = products.find((x) => x.id === scenario.productId);
  if (!p) return null;
  const detail = computeVelocityDetail(products, sales)[p.id] || { velocity: 0, daysWithSales: 0 };
  const velocity = detail.velocity;
  const confidence = velocityConfidence(detail.daysWithSales);

  if (scenario.type === "price") {
    const newPrice = Math.round(p.sellPrice * (1 + scenario.value / 100));
    const marginOld = p.sellPrice - p.costPrice;
    const marginNew = newPrice - p.costPrice;
    const dailyProfitOld = marginOld * velocity;
    const dailyProfitNew = marginNew * velocity;
    return {
      type: "price",
      productName: p.name,
      velocity,
      confidence,
      oldPrice: p.sellPrice,
      newPrice,
      dailyProfitOld,
      dailyProfitNew,
      deltaDailyProfit: dailyProfitNew - dailyProfitOld,
      caveat: "This assumes the same daily sales pace continues at the new price — it does not model whether customers would buy more or less because of it.",
    };
  }

  if (scenario.type === "stock") {
    const extraUnits = scenario.value;
    const extraCost = extraUnits * p.costPrice;
    const extraDays = velocity > 0 ? extraUnits / velocity : null;
    return {
      type: "stock",
      productName: p.name,
      velocity,
      confidence,
      extraUnits,
      extraCost,
      extraDays,
      caveat: "This assumes sales continue at the current pace — a promotion, season, or slow week would change the real outcome.",
    };
  }
  return null;
}

// Turns a simulation result into a plain-language answer. Kept separate
// from simulateScenario so the same structured result can also feed a
// UI card later without re-deriving the numbers.
export function narrateScenario(result) {
  if (!result) return null;
  const confNote = result.confidence === "low"
    ? " (Note: this product has very little recent sales history, so the daily pace used here is a rough estimate.)"
    : "";
  if (result.type === "price") {
    const dir = result.deltaDailyProfit >= 0 ? "+" : "";
    return (
      `If ${result.productName}'s price moves from ${ugx(result.oldPrice)} to ${ugx(result.newPrice)}: at the current pace of ` +
      `~${result.velocity.toFixed(1)} unit(s)/day, daily profit would go from ${ugx(Math.round(result.dailyProfitOld))} to ` +
      `${ugx(Math.round(result.dailyProfitNew))} (${dir}${ugx(Math.round(result.deltaDailyProfit))}/day).${confNote} ${result.caveat}`
    );
  }
  return (
    `Buying ${result.extraUnits} more ${result.productName} would cost ${ugx(result.extraCost)} upfront. At the current pace of ` +
    `~${result.velocity.toFixed(1)} unit(s)/day, that's about ${result.extraDays !== null ? `${Math.round(result.extraDays)} more day(s) of stock` : "an unknown number of extra days (no recent sales to pace it from)"}.` +
    `${confNote} ${result.caveat}`
  );
}
