/* ------------------------------------------------------------------ */
/* Periodic reports — the intelligence layer reshaped into a Today /   */
/* This-Week / This-Month digest, plus the WhatsApp text version, the   */
/* printable/PDF version, and the "is a report due" check that drives   */
/* both the in-app banner and the browser notification.                 */
/* ------------------------------------------------------------------ */
import { periodFinance } from "./finance.js";
import { ugx, fmtDate } from "./theme.js";
import { daysSince, salesInRange, computeProductBreakdown, computeCategoryBreakdown, computeBasketStats, buildInsights } from "./intelligence.js";

export function computePeriodCompare(sales, period) {
  const now = Date.now();
  let curStart, curEnd, prevStart, prevEnd, compareLabel;
  if (period === "week") {
    curStart = now - 7 * 86400000; curEnd = now;
    prevStart = now - 14 * 86400000; prevEnd = now - 7 * 86400000;
    compareLabel = "last week";
  } else if (period === "month") {
    curStart = now - 30 * 86400000; curEnd = now;
    prevStart = now - 60 * 86400000; prevEnd = now - 30 * 86400000;
    compareLabel = "last month";
  } else {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yestStart = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);
    curStart = todayStart.getTime(); curEnd = now;
    prevStart = yestStart.getTime(); prevEnd = todayStart.getTime();
    compareLabel = "yesterday";
  }
  const curSales = salesInRange(sales, curStart, curEnd);
  const prevSales = salesInRange(sales, prevStart, prevEnd);
  const curRevenue = curSales.reduce((s, x) => s + x.total, 0);
  const prevRevenue = prevSales.reduce((s, x) => s + x.total, 0);
  const changePct = prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue) * 100 : null;
  return { curStart, curEnd, curSales, prevSales, curRevenue, prevRevenue, changePct, compareLabel };
}

export const PERIOD_TITLE = { today: "Today's", week: "This Week's", month: "This Month's" };

// Builds one structured report object for a given period. This is the
// single source of truth used by both the WhatsApp text version and the
// printable/PDF version below, so the two are always in sync.
export function buildPeriodReport(products, sales, debtors, purchases, period = "week", expenses = [], adjustments = []) {
  const insights = buildInsights(products, sales, debtors, purchases);
  const compare = computePeriodCompare(sales, period);
  const periodSales = compare.curSales;
  const profit = periodSales.reduce((s, x) => s + x.profit, 0); // gross profit
  const fin = periodFinance({ sales: [], expenses, adjustments, start: compare.curStart, end: compare.curEnd + 1 });
  const expensesTotal = fin.expensesTotal;
  const stockLoss = fin.stockLoss;
  const topProducts = computeProductBreakdown(periodSales).slice(0, 5);
  const categories = computeCategoryBreakdown(products, periodSales);
  const basket = computeBasketStats(periodSales);

  return {
    period,
    periodTitle: PERIOD_TITLE[period] || "This Period's",
    rangeLabel: period === "today" ? fmtDate(Date.now()) : `${fmtDate(compare.curStart)} – ${fmtDate(compare.curEnd)}`,
    generatedAt: Date.now(),
    revenue: compare.curRevenue,
    profit,
    grossProfit: profit,
    expensesTotal,
    stockLoss,
    netProfit: profit - expensesTotal - stockLoss,
    hasExpenses: expenses.length > 0,
    salesCount: periodSales.length,
    changePct: compare.changePct,
    compareLabel: compare.compareLabel,
    avgSaleValue: basket.avgValue,
    topProducts,
    categories,
    reorderDrafts: insights.reorderDrafts,
    slowMoving: insights.slowMoving,
    debtorRisk: insights.debtorRisk,
    debtorSummary: insights.debtorSummary,
    inventory: insights.inventory,
    anomalies: period === "today" ? insights.anomalies : [],
  };
}

// Compact, WhatsApp-friendly plain text version (WhatsApp supports
// *bold* and _italic_ markdown-style formatting in message bodies).
export function digestToWhatsAppText(report, shopName = "My Shop") {
  const fmtPct = (v) => (v === null ? "no prior period to compare" : `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}% vs ${report.compareLabel}`);
  const lines = [];
  lines.push(`*${shopName} — ${report.periodTitle} Report*`);
  lines.push(`_${report.rangeLabel} · via ProfitMind_`);
  lines.push("");
  lines.push(`💰 Revenue: *${ugx(report.revenue)}*`);
  lines.push(`📈 Gross profit: *${ugx(report.grossProfit ?? report.profit)}*`);
  if (report.expensesTotal > 0 || report.stockLoss > 0) {
    lines.push(`🧾 Expenses: ${ugx(report.expensesTotal)}${report.stockLoss > 0 ? ` · stock lost: ${ugx(report.stockLoss)}` : ""}`);
    lines.push(`✅ Net profit: *${ugx(report.netProfit)}*`);
  } else if (!report.hasExpenses) {
    lines.push("_No expenses recorded, so net profit can't be shown yet._");
  }
  lines.push(`🧾 Sales: ${report.salesCount} (avg ${ugx(Math.round(report.avgSaleValue))})`);
  lines.push(fmtPct(report.changePct));

  if (report.topProducts.length) {
    lines.push("");
    lines.push("*Top sellers:*");
    report.topProducts.forEach((p) => lines.push(`• ${p.name} — ${p.units} unit(s), ${ugx(p.revenue)}`));
  }
  if (report.reorderDrafts.length) {
    lines.push("");
    lines.push("*⚠️ Reorder soon:*");
    report.reorderDrafts.slice(0, 5).forEach((p) => lines.push(`• ${p.name}${p.daysLeft !== null ? ` — ~${Math.round(p.daysLeft)}d of stock left` : " — below reorder level"}`));
  }
  if (report.debtorSummary.debtorCount > 0) {
    lines.push("");
    lines.push(`*Debtors:* ${ugx(report.debtorSummary.totalOwed)} owed by ${report.debtorSummary.debtorCount} customer(s)`);
    if (report.debtorRisk.length) {
      report.debtorRisk.slice(0, 3).forEach((d) => lines.push(`• ${d.name} — ${ugx(d.balance)}${d.idleDays !== null ? ` (quiet ${Math.round(d.idleDays)}d)` : ""}`));
    }
  }
  if (report.anomalies.length) {
    lines.push("");
    lines.push("*Worth checking:*");
    report.anomalies.forEach((a) => lines.push(`• ${a.text}`));
  }
  lines.push("");
  lines.push(`Inventory: ${report.inventory.skuCount} product(s), ${ugx(report.inventory.costValue)} tied up at cost.`);
  return lines.join("\n");
}

// Opens a wa.me deep link pre-filled with the digest text — one tap to
// pick a chat (the owner's own number, a manager, or a family member)
// and hit send. This is the same real WhatsApp share pattern used for
// receipts and debtor reminders elsewhere in the app.
export function sendDigestWhatsApp(report, shopName, phone) {
  const text = digestToWhatsAppText(report, shopName);
  const digits = (phone || "").replace(/[^\d]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  const url = `${base}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

// Renders the same report as a clean, print-ready HTML page in a new
// tab and triggers the browser's print dialog, where "Save as PDF" is
// a built-in destination on iOS, Android, Windows and macOS alike —
// so this is a genuine on-device PDF export with no extra library.
// Everything the user typed (shop, product, category, debtor names) must be
// escaped before it goes into the generated HTML page.
export function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printPeriodReport(report, shopNameRaw) {
  const win = window.open("", "_blank");
  if (!win) return;
  const shopName = escapeHtml(shopNameRaw);
  const e = escapeHtml;
  const row = (label, value) => `<tr><td>${e(label)}</td><td style="text-align:right">${e(value)}</td></tr>`;
  const section = (title, bodyHtml) => (bodyHtml ? `<h2>${e(title)}</h2>${bodyHtml}` : "");

  const topProductsRows = report.topProducts.map((p) => row(p.name, `${p.units} unit(s) · ${ugx(p.revenue)}`)).join("");
  const reorderRows = report.reorderDrafts.slice(0, 8).map((p) => row(p.name, p.daysLeft !== null ? `~${Math.round(p.daysLeft)}d left · reorder ${p.suggestedQty}` : `reorder ${p.suggestedQty}`)).join("");
  const debtorRows = report.debtorRisk.slice(0, 8).map((d) => row(d.name, `${ugx(d.balance)}${d.idleDays !== null ? ` · quiet ${Math.round(d.idleDays)}d` : ""}`)).join("");
  const categoryRows = report.categories.map((c) => row(c.category, ugx(c.revenue))).join("");
  const changeTxt = report.changePct === null ? `No prior ${report.compareLabel === "last week" ? "week" : report.compareLabel === "last month" ? "month" : "day"} to compare.` : `${report.changePct >= 0 ? "Up" : "Down"} ${Math.abs(report.changePct).toFixed(1)}% vs ${report.compareLabel}.`;

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${shopName} — ${e(report.periodTitle)} Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1E2A1F; margin: 0; padding: 36px; max-width: 760px; }
  .brand { display:flex; align-items:center; gap:6px; margin-bottom: 4px; }
  .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
  h1 { font-size: 22px; margin: 6px 0 2px; }
  .sub { font-size: 11px; color: #6b6b5f; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 22px; }
  .kpis { display: flex; gap: 14px; margin-bottom: 20px; }
  .kpi { flex: 1; border: 1px solid #D3D3C2; border-radius: 8px; padding: 12px 14px; }
  .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #8a8a7d; }
  .kpi .value { font-size: 19px; font-weight: 600; margin-top: 4px; }
  .change { font-size: 12px; color: #3B6E52; margin-bottom: 24px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; margin: 22px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #D9A441; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 5px 2px; border-bottom: 1px solid #ece9dc; }
  .empty { font-size: 12px; color: #8a8a7d; font-style: italic; }
  .footer { margin-top: 32px; font-size: 10px; color: #9a9a8c; text-align: center; }
  @media print { body { padding: 0 24px; } }
</style></head>
<body>
  <div class="brand">
    <span class="dot" style="background:#D9A441"></span>
    <span class="dot" style="background:#3B6E52"></span>
    <span class="dot" style="background:#B4483A"></span>
  </div>
  <h1>${shopName}</h1>
  <div class="sub">${e(report.periodTitle)} Report · ${e(report.rangeLabel)}</div>

  <div class="kpis">
    <div class="kpi"><div class="label">Revenue</div><div class="value">${e(ugx(report.revenue))}</div></div>
    <div class="kpi"><div class="label">Gross Profit</div><div class="value">${e(ugx(report.grossProfit ?? report.profit))}</div></div>
    <div class="kpi"><div class="label">Net Profit</div><div class="value">${e(report.hasExpenses || report.stockLoss > 0 ? ugx(report.netProfit) : "n/a")}</div></div>
    <div class="kpi"><div class="label">Sales</div><div class="value">${e(report.salesCount)}</div></div>
  </div>
  <div class="change">${e(changeTxt)}</div>

  ${section("Top Sellers", topProductsRows ? `<table>${topProductsRows}</table>` : `<p class="empty">No sales recorded in this period.</p>`)}
  ${section("Revenue by Category", categoryRows ? `<table>${categoryRows}</table>` : "")}
  ${section("Reorder Soon", reorderRows ? `<table>${reorderRows}</table>` : `<p class="empty">Nothing urgently needs reordering.</p>`)}
  ${section("Debtors Needing Follow-up", debtorRows ? `<table>${debtorRows}</table>` : `<p class="empty">No overdue debtor balances flagged.</p>`)}
  ${section("Inventory Snapshot", `<table>${row("Products on hand", report.inventory.skuCount)}${row("Units on hand", report.inventory.totalUnits)}${row("Tied up at cost", ugx(report.inventory.costValue))}${row("Retail value if sold", ugx(report.inventory.retailValue))}</table>`)}

  <div class="footer">Generated ${new Date(report.generatedAt).toLocaleString("en-GB")} · ProfitMind</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };</script>
</body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function computeReportDue(settings) {
  const now = new Date();
  const isMonday = now.getDay() === 1;
  const isMonthStart = now.getDate() <= 3;
  const weeklyStale = !settings.lastWeeklySent || daysSince(settings.lastWeeklySent) >= 6;
  const monthlyStale = !settings.lastMonthlySent || daysSince(settings.lastMonthlySent) >= 27;
  return {
    weeklyDue: !!settings.autoWeekly && isMonday && weeklyStale,
    monthlyDue: !!settings.autoMonthly && isMonthStart && monthlyStale,
  };
}
