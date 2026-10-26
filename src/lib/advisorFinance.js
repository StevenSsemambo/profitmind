/* ------------------------------------------------------------------ */
/* Advisor — money, losses and controls. Turns the finance insights     */
/* into (a) plain-text digest lines the AI is grounded on and (b)       */
/* instant, data-only answers to the common owner questions.            */
/* ------------------------------------------------------------------ */
import { ugx } from "./theme.js";
import { buildFinanceInsights } from "./finance.js";
import { ADJUST_REASONS } from "./stock.js";

const reasonLabel = (id) => (ADJUST_REASONS.find((r) => r.id === id) || {}).label || id;
const list = (obj) => Object.entries(obj).map(([k, v]) => `${k}: ${typeof v === "number" && v > 1000 ? ugx(v) : v}`).join(", ");

export function financeInsights(products, sales, debtors, purchases, extras = {}) {
  return buildFinanceInsights({
    products, sales, debtors, purchases,
    expenses: extras.expenses || [], adjustments: extras.adjustments || [],
    cashups: extras.cashups || [], supplierPayments: extras.supplierPayments || [],
    // Voided sales are passed separately so the Advisor can spot patterns in them.
    allSales: extras.allSales,
  });
}

// `sales` here are live (non-voided) sales; voids come from extras.allSales.
function withVoids(products, sales, debtors, purchases, extras) {
  const merged = extras.allSales && extras.allSales.length ? extras.allSales : sales;
  const fin = financeInsights(products, merged, debtors, purchases, extras);
  return fin;
}

export function financeDigestLines(products, sales, debtors, purchases, extras = {}) {
  const f = withVoids(products, sales, debtors, purchases, extras);
  const noExpenses = (extras.expenses || []).length === 0;
  const lines = [
    `Definitions: "gross profit" = sales minus cost of goods. "Net profit" = gross profit minus running expenses and stock losses.`,
    `This month: ${ugx(f.month.revenue)} sales, ${ugx(f.month.gross)} gross profit, ${ugx(f.month.expensesTotal)} expenses, ${ugx(f.month.stockLoss)} stock losses → NET profit ${ugx(f.month.net)} (${f.month.netMarginPct.toFixed(1)}% of sales).${noExpenses ? " NOTE: the owner has recorded no expenses yet, so this net profit is probably overstated." : ""}`,
    `Last 7 days: ${ugx(f.week.revenue)} sales, ${ugx(f.week.gross)} gross profit, ${ugx(f.week.expensesTotal)} expenses, NET ${ugx(f.week.net)}.`,
  ];
  const cats = Object.entries(f.monthExpenseByCat).sort((a, b) => b[1] - a[1]);
  if (cats.length) lines.push(`Expenses this month by type: ${cats.map(([c, v]) => `${c} ${ugx(v)}`).join(", ")}.`);
  if (f.suppliersOwed.length) lines.push(`Owed to suppliers: ${f.suppliersOwed.map((s) => `${s.supplier} ${ugx(s.owed)}`).join(", ")}.`);
  if (f.expiry.expired.length) lines.push(`EXPIRED stock still on the shelf: ${f.expiry.expired.map((e) => `${e.name} (${e.stock} unit(s), ${ugx(e.costValue)} at cost, expired ${Math.abs(e.daysLeft)} day(s) ago)`).join("; ")}.`);
  if (f.expiry.soon.length) lines.push(`Expiring within 7 days: ${f.expiry.soon.map((e) => `${e.name} (${e.stock} unit(s), in ${e.daysLeft} day(s))`).join("; ")}.`);
  if (f.marginWatch.length) lines.push(`Supplier price rises squeezing margin: ${f.marginWatch.map((m) => `${m.name} cost rose ${m.risePct.toFixed(0)}% (${ugx(m.from)} → ${ugx(m.to)}), margin fell from ${m.oldMarginPct.toFixed(0)}% to ${m.newMarginPct.toFixed(0)}%; a price of about ${ugx(m.suggestedPrice)} restores it`).join("; ")}.`);
  if (f.voids.count) lines.push(`Voided sales in the last 7 days: ${f.voids.count} worth ${ugx(f.voids.value)} (by ${list(f.voids.by)}).`);
  if (f.discounts.total > 0) lines.push(`Discounts given at the till in the last 7 days: ${ugx(f.discounts.total)} (by ${list(f.discounts.by)}).`);
  if (f.cash.checked) lines.push(`Cash counts in the last 7 days: ${f.cash.checked}, total shortage ${ugx(Math.abs(f.cash.short))}${f.cash.short < 0 ? " (cash was SHORT)" : " (no shortages)"}.`);
  const losses = Object.entries(f.lossByReason);
  if (losses.length) lines.push(`Stock lost this month: ${losses.map(([r, v]) => `${reasonLabel(r)} ${ugx(v)}`).join(", ")}.`);
  return lines;
}

// Instant answers; returns null when the question isn't about these topics.
export function financeAnswer(q, products, sales, debtors, purchases, extras = {}) {
  const f = withVoids(products, sales, debtors, purchases, extras);
  const data = (text) => ({ source: "data", text });
  const noExpenses = (extras.expenses || []).length === 0;

  if (/net profit|real profit|actual profit|take[- ]?home|after (all )?(my )?(expenses|costs)|am i (really )?making (any )?money|is (the|my) (shop|business) profitable/.test(q)) {
    const m = f.month;
    return data(
      `This month so far: ${ugx(m.revenue)} in sales → ${ugx(m.gross)} gross profit, minus ${ugx(m.expensesTotal)} expenses and ${ugx(m.stockLoss)} stock losses = ${ugx(m.net)} net profit (${m.netMarginPct.toFixed(1)}% of sales).` +
      (noExpenses ? " You haven't recorded any expenses yet, so this is probably higher than the truth — add rent, wages, transport and other costs in the Money tab." : "")
    );
  }
  if (/\bexpens|running costs?|where (is|does) (my|the) money go|overheads?/.test(q)) {
    const cats = Object.entries(f.monthExpenseByCat).sort((a, b) => b[1] - a[1]);
    if (!cats.length) return data("No expenses are recorded this month. Add rent, wages, power, transport and similar costs in the Money tab so your profit is real.");
    return data(`Expenses this month: ${ugx(f.month.expensesTotal)} in total — ${cats.map(([c, v]) => `${c} ${ugx(v)}`).join(", ")}. That's ${f.month.revenue > 0 ? ((f.month.expensesTotal / f.month.revenue) * 100).toFixed(1) : "0"}% of your sales.`);
  }
  if (/owe.*suppl|suppl.*(owe|balance|credit)|payables?|what do i owe|who do i owe/.test(q)) {
    if (!f.suppliersOwed.length) return data("You don't owe any supplier right now.");
    return data(`You owe suppliers ${ugx(f.suppliersOwed.reduce((t, s) => t + s.owed, 0))}: ${f.suppliersOwed.map((s) => `${s.supplier} ${ugx(s.owed)}`).join(", ")}.`);
  }
  if (/expir|spoil|go(ing)? bad|best before|past (its )?date/.test(q)) {
    const { expired, soon } = f.expiry;
    if (!expired.length && !soon.length) return data("Nothing on your shelves is expired or expiring in the next 7 days (based on the expiry dates you've entered).");
    const parts = [];
    if (expired.length) parts.push(`Already expired: ${expired.map((e) => `${e.name} (${e.stock}, ${ugx(e.costValue)} at cost)`).join(", ")} — take them off the shelf and record them as expired in Stock → Adjust.`);
    if (soon.length) parts.push(`Expiring soon: ${soon.map((e) => `${e.name} (${e.stock}, ${e.daysLeft === 0 ? "today" : `in ${e.daysLeft}d`})`).join(", ")} — consider a discount to sell them first.`);
    return data(parts.join(" "));
  }
  if (/margin watch|supplier price|price (rise|rose|increase|hike)|cost(s)? (went|gone|have gone|has gone|rose|increased)|squeez|eating (into )?(my )?margin/.test(q)) {
    if (!f.marginWatch.length) return data("No supplier price rises are squeezing your margins right now.");
    return data(f.marginWatch.slice(0, 4).map((m) => `${m.name}: cost rose ${m.risePct.toFixed(0)}% (${ugx(m.from)} → ${ugx(m.to)}), so your margin fell from ${m.oldMarginPct.toFixed(0)}% to ${m.newMarginPct.toFixed(0)}%. Selling at about ${ugx(m.suggestedPrice)} would restore it.`).join(" "));
  }
  if (/cash (short|count|difference|gap)|till (short|balanc|count)|drawer|missing (cash|money)|money (is )?missing/.test(q)) {
    const c = f.cash;
    if (!c.checked) return data("There are no cash counts from the last 7 days. Do the closing count in Money → Cash count so any gap shows up the same day.");
    return data(c.short < 0 ? `Over the last 7 days you did ${c.checked} cash count(s) and the drawer was short by ${ugx(-c.short)} in total. Check the days in Money → Cash count and look at voids and discounts in History.` : `Over the last 7 days you did ${c.checked} cash count(s) and the drawer was never short.`);
  }
  if (/\bvoid|discount|cashier|who (sold|rang)|staff/.test(q)) {
    const bits = [];
    bits.push(f.voids.count ? `${f.voids.count} sale(s) worth ${ugx(f.voids.value)} were voided in the last 7 days (${list(f.voids.by)}).` : "No sales were voided in the last 7 days.");
    bits.push(f.discounts.total > 0 ? `Discounts given at the till: ${ugx(f.discounts.total)} (${list(f.discounts.by)}).` : "No discounts were given at the till.");
    return data(bits.join(" "));
  }
  if (/shrink|stock loss|lost stock|missing stock|stolen|stole|theft|damaged|wastage|waste/.test(q)) {
    const losses = Object.entries(f.lossByReason);
    if (!losses.length) return data("No stock losses are recorded this month. If the shelf count doesn't match, use Stock → Adjust so the loss is recorded.");
    return data(`Stock lost this month: ${losses.map(([r, v]) => `${reasonLabel(r)} ${ugx(v)}`).join(", ")} (${ugx(f.month.stockLoss)} in total, already taken off your net profit).`);
  }
  return null;
}

// The few things the Advisor should say first, without being asked.
// Ordered by how much they cost the owner; capped so it never becomes noise.
export function attentionItems(products, sales, debtors, purchases, extras = {}) {
  const f = withVoids(products, sales, debtors, purchases, extras);
  const items = [];
  const add = (severity, text, ask) => items.push({ severity, text, ask });

  if (f.expiry.expired.length) {
    const v = f.expiry.expired.reduce((t, e) => t + e.costValue, 0);
    add(3, `${f.expiry.expired.length} product(s) are past their expiry date and still in stock (${ugx(v)} at cost): ${f.expiry.expired.slice(0, 3).map((e) => e.name).join(", ")}.`, "Is anything expiring soon?");
  }
  if (f.cash.short < 0) add(3, `Your cash drawer was short by ${ugx(-f.cash.short)} over the last 7 days.`, "Have I had any cash shortages?");
  if (f.marginWatch.length) add(2, `${f.marginWatch[0].name}'s cost rose ${f.marginWatch[0].risePct.toFixed(0)}% and your margin fell to ${f.marginWatch[0].newMarginPct.toFixed(0)}%${f.marginWatch.length > 1 ? ` (plus ${f.marginWatch.length - 1} more)` : ""}.`, "Have any supplier prices squeezed my margins?");
  if (f.voids.count >= 3) add(2, `${f.voids.count} sales were voided in the last 7 days (${ugx(f.voids.value)}).`, "Show me voids and discounts");
  if (f.discounts.total > 0 && f.month.revenue > 0 && f.discounts.total / f.month.revenue > 0.03) add(2, `Discounts given at the till reached ${ugx(f.discounts.total)} this week.`, "Show me voids and discounts");
  if (f.expiry.soon.length) add(1, `${f.expiry.soon.length} product(s) expire within 7 days: ${f.expiry.soon.slice(0, 3).map((e) => e.name).join(", ")}.`, "Is anything expiring soon?");
  const owed = f.suppliersOwed.reduce((t, s) => t + s.owed, 0);
  if (owed > 0) add(1, `You owe suppliers ${ugx(owed)}.`, "What do I owe my suppliers?");
  if ((extras.expenses || []).length === 0 && sales.length >= 5) add(1, "No expenses are recorded, so your profit is overstated. Add rent, wages and transport in the Money tab.", "What is my real profit after expenses?");

  return items.sort((a, b) => b.severity - a.severity).slice(0, 4);
}
