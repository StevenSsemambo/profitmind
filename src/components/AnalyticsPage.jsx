/* ------------------------------------------------------------------ */
/* Analytics — owner-only dashboard: KPIs, daily trend, top products,   */
/* payment mix, and low stock                                          */
/* ------------------------------------------------------------------ */
import { useMemo } from "react";
import { AlertTriangle, PackagePlus, HandCoins } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { C, ugx } from "../lib/theme.js";
import { buildInsights } from "../lib/intelligence.js";
import { PAYMENT_METHODS } from "../lib/seedData.js";
import { Card, EmptyState, KpiCard } from "./ui/primitives.jsx";

export default function AnalyticsPage({ products, sales, debtors, purchases }) {
  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
  const totalCOGS = purchases.reduce((s, x) => s + x.totalCost, 0);
  const outstandingDebt = debtors.reduce((s, d) => s + Math.max(0, d.owed - d.paid), 0);
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const insights = useMemo(() => buildInsights(products, sales, debtors, purchases), [products, sales, debtors, purchases]);
  const { reorderDrafts, slowMoving, debtorRisk, anomalies } = insights;

  const dailyData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const daySales = sales.filter((s) => s.date >= d.getTime() && s.date < next.getTime());
      days.push({
        label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        revenue: daySales.reduce((s, x) => s + x.total, 0),
        profit: daySales.reduce((s, x) => s + x.profit, 0),
      });
    }
    return days;
  }, [sales]);

  const paymentBreakdown = useMemo(() => {
    const map = {};
    sales.forEach((s) => { map[s.paymentMethod] = (map[s.paymentMethod] || 0) + s.total; });
    return PAYMENT_METHODS.map((pm) => ({ name: pm.label, value: map[pm.id] || 0 })).filter((x) => x.value > 0);
  }, [sales]);

  const topProducts = useMemo(() => {
    const map = {};
    sales.forEach((s) => (s.items || []).forEach((i) => { map[i.name] = (map[i.name] || 0) + i.sellPrice * i.qty; }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, revenue]) => ({ name, revenue }));
  }, [sales]);

  const PIE_COLORS = [C.green, C.gold, C.navy, C.brick];

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: C.ink, opacity: 0.6 }}>
        A live view of how the shop is performing — built from every sale, purchase and debtor record.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total revenue" value={ugx(totalRevenue)} />
        <KpiCard label="Net profit" value={ugx(totalProfit)} accent={C.greenDark} />
        <KpiCard label="Profit margin" value={`${margin.toFixed(1)}%`} />
        <KpiCard label="Outstanding debt" value={ugx(outstandingDebt)} accent={outstandingDebt > 0 ? C.brick : C.ink} />
      </div>

      {anomalies.length > 0 && (
        <Card className="p-4 mb-6" style={{ borderColor: C.brick }}>
          <h3 className="font-medium mb-2 flex items-center gap-2" style={{ color: C.brick }}>
            <AlertTriangle size={16} /> Flagged today
          </h3>
          <div className="space-y-1">
            {anomalies.map((a) => (
              <p key={a.id} className="text-sm" style={{ color: C.ink }}>{a.text}</p>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 mb-6">
        <h3 className="font-medium mb-3" style={{ color: C.ink }}>Revenue &amp; profit — last 7 days</h3>
        {sales.length === 0 ? (
          <EmptyState text="No sales recorded yet — make a sale to see this chart fill in." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.ink }} />
              <YAxis tick={{ fontSize: 11, fill: C.ink }} width={40} />
              <Tooltip formatter={(v) => ugx(v)} contentStyle={{ borderColor: C.line, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke={C.navy} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke={C.greenDark} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card className="p-4">
          <h3 className="font-medium mb-3" style={{ color: C.ink }}>Top products by revenue</h3>
          {topProducts.length === 0 ? (
            <EmptyState text="No sales yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.ink }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.ink }} width={90} />
                <Tooltip formatter={(v) => ugx(v)} contentStyle={{ borderColor: C.line, fontSize: 12 }} />
                <Bar dataKey="revenue" fill={C.green} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-medium mb-3" style={{ color: C.ink }}>Payment method mix</h3>
          {paymentBreakdown.length === 0 ? (
            <EmptyState text="No sales yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={paymentBreakdown} dataKey="value" nameKey="name" outerRadius={75} label={(e) => e.name}>
                  {paymentBreakdown.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => ugx(v)} contentStyle={{ borderColor: C.line, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="p-4 mb-6">
        <h3 className="font-medium mb-3 flex items-center gap-2" style={{ color: C.ink }}>
          <PackagePlus size={16} style={{ color: C.goldDark }} /> Stock forecast
        </h3>
        <p className="text-xs mb-3" style={{ color: C.ink, opacity: 0.5 }}>
          Based on actual sell-through over the last 14 days, not just the manual reorder threshold.
        </p>
        {reorderDrafts.length === 0 ? (
          <p className="text-sm" style={{ color: C.ink, opacity: 0.5 }}>Nothing is forecast to run out soon.</p>
        ) : (
          <div className="space-y-2">
            {reorderDrafts.map((p) => (
              <div key={p.id}>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1.5" style={{ color: C.ink }}>
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: p.confidence === "high" ? C.green : p.confidence === "medium" ? C.goldDark : C.brick }}
                      title={`${p.confidence} confidence`}
                    />
                    {p.name}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.brick }}>
                    {p.stock} left{p.daysLeft !== null ? ` · ~${Math.max(0, Math.round(p.daysLeft))}d` : ""} · reorder ~{p.suggestedQty}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5 pl-3" style={{ color: C.ink, opacity: 0.45 }}>{p.reason}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2" style={{ color: C.ink }}>
            <AlertTriangle size={16} style={{ color: C.ink, opacity: 0.6 }} /> Slow-moving stock
          </h3>
          {slowMoving.length === 0 ? (
            <p className="text-sm" style={{ color: C.ink, opacity: 0.5 }}>Nothing looks overstocked or stuck right now.</p>
          ) : (
            <div className="space-y-2">
              {slowMoving.map((p) => (
                <div key={p.id}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: C.ink }}>{p.name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, opacity: 0.6 }}>
                      {p.stock} in stock · ~{p.velocity.toFixed(1)}/day
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: C.ink, opacity: 0.45 }}>{p.reason}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2" style={{ color: C.ink }}>
            <HandCoins size={16} style={{ color: C.navy }} /> Debtor risk
          </h3>
          {debtorRisk.length === 0 ? (
            <p className="text-sm" style={{ color: C.ink, opacity: 0.5 }}>No debtors flagged as overdue right now.</p>
          ) : (
            <div className="space-y-2">
              {debtorRisk.map((d) => (
                <div key={d.id}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: C.ink }}>{d.name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: d.risk === "high" ? C.brick : C.goldDark }}>
                      {ugx(d.balance)} · idle {Math.round(d.idleDays)}d
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: C.ink, opacity: 0.45 }}>{d.reason}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="text-[11px]" style={{ color: C.ink, opacity: 0.4 }}>
        Total spent restocking so far: {ugx(totalCOGS)}.
      </p>
    </div>
  );
}

