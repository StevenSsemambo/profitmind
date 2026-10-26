/* ------------------------------------------------------------------ */
/* App shell — login gate, tab routing, top-level state, persistence,   */
/* and the weekly/monthly report due-check (banner + browser            */
/* notification).                                                       */
/* ------------------------------------------------------------------ */
import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { Bell, LogOut, X, AlertTriangle, DatabaseBackup } from "lucide-react";
import { C, FONT_IMPORT } from "./lib/theme.js";
import { storage, STORAGE_KEY } from "./lib/storage.js";
import { computeReportDue } from "./lib/reports.js";
import { applySale, applyVoid } from "./lib/sales.js";
import { applyRestock } from "./lib/stock.js";
import { activeSales } from "./lib/finance.js";
import { newId } from "./lib/ids.js";
import { SEED_PRODUCTS, SEED_DEBTORS, SEED_PURCHASES, TABS, DEFAULT_REPORT_SETTINGS } from "./lib/seedData.js";

import Splash from "./components/Splash.jsx";
import Login from "./components/Login.jsx";
import POS from "./components/POS.jsx";
import Debtors from "./components/Debtors.jsx";
import StockPage from "./components/StockPage.jsx";
import SalesHistory from "./components/SalesHistory.jsx";
import MoneyPage from "./components/MoneyPage.jsx";
import SetupWizard from "./components/SetupWizard.jsx";
// Owner-only pages are split into their own chunks (recharts is the big one),
// so the till loads fast on slow mobile connections.
const AnalyticsPage = lazy(() => import("./components/AnalyticsPage.jsx"));
const ReportsPage = lazy(() => import("./components/ReportsPage.jsx"));
const ExportPage = lazy(() => import("./components/ExportPage.jsx"));
const Advisor = lazy(() => import("./components/Advisor.jsx"));

const BACKUP_REMINDER_DAYS = 7;

export default function App() {
  const [user, setUser] = useState(null); // { name, role }
  const [tab, setTab] = useState("pos");
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [debtors, setDebtors] = useState(SEED_DEBTORS);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState(SEED_PURCHASES);
  const [reportSettings, setReportSettings] = useState(DEFAULT_REPORT_SETTINGS);
  const [shop, setShop] = useState({ name: "My Shop", setupDone: true });
  const [expenses, setExpenses] = useState([]);
  const [cashups, setCashups] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [lastBackupAt, setLastBackupAt] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [dismissedBackup, setDismissedBackup] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [booting, setBooting] = useState(true);
  const notifiedRef = useRef({ weekly: false, monthly: false });

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1300);
    return () => clearTimeout(t);
  }, []);

  // A left-open tab won't otherwise notice a day boundary go by (Sunday
  // night into Monday, month-end into month-start) since nothing forces a
  // re-render — this heartbeat re-checks every few minutes so the banner
  // and any browser notification can still fire without a page reload.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Fires a real browser notification the moment a report becomes due, if
  // the owner opted in — this can reach them while ProfitMind is merely
  // backgrounded, not just when they happen to reopen the tab. It still
  // can't fire once the browser itself is fully closed; that gap is called
  // out explicitly in the Reports settings rather than left implicit.
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (!reportSettings.notificationsEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;

    const { weeklyDue, monthlyDue } = computeReportDue(reportSettings);

    if (weeklyDue && !notifiedRef.current.weekly) {
      const n = new Notification("Weekly report ready — ProfitMind", { body: "Your weekly business digest is ready to review and send." });
      n.onclick = () => { window.focus(); setTab("reports"); n.close(); };
      notifiedRef.current.weekly = true;
    }
    if (!weeklyDue) notifiedRef.current.weekly = false;

    if (monthlyDue && !notifiedRef.current.monthly) {
      const n = new Notification("Monthly report ready — ProfitMind", { body: "Your monthly business digest is ready to review and send." });
      n.onclick = () => { window.focus(); setTab("reports"); n.close(); };
      notifiedRef.current.monthly = true;
    }
    if (!monthlyDue) notifiedRef.current.monthly = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, reportSettings, tick]);

  // Load any previously saved data for this device on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (!cancelled && (!res || !res.value)) {
          // Brand-new install: the owner will be walked through setup.
          setShop({ name: "", setupDone: false });
        }
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          // Shops that were already using the app before setup existed are treated as set up.
          setShop(parsed.shop && typeof parsed.shop === "object" ? { name: "My Shop", setupDone: true, ...parsed.shop } : { name: "My Shop", setupDone: true });
          if (parsed.expenses) setExpenses(parsed.expenses);
          if (parsed.cashups) setCashups(parsed.cashups);
          if (parsed.adjustments) setAdjustments(parsed.adjustments);
          if (parsed.supplierPayments) setSupplierPayments(parsed.supplierPayments);
          if (parsed.products) setProducts(parsed.products);
          if (parsed.sales) setSales(parsed.sales);
          if (parsed.debtors) setDebtors(parsed.debtors);
          if (parsed.purchases) setPurchases(parsed.purchases);
          if (parsed.reportSettings) setReportSettings({ ...DEFAULT_REPORT_SETTINGS, ...parsed.reportSettings });
          if (parsed.lastBackupAt) setLastBackupAt(parsed.lastBackupAt);
        }
      } catch (e) {
        // No saved data yet, or storage unavailable — fall back to seed data.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist on every change, once the initial load has finished.
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const ok = await storage.set(STORAGE_KEY, JSON.stringify({ products, sales, debtors, purchases, reportSettings, lastBackupAt, shop, expenses, cashups, adjustments, supplierPayments }));
        setSaveFailed(!ok); // storage.set returns null when the browser refuses (full / blocked)
      } catch (e) {
        setSaveFailed(true);
      }
    })();
  }, [products, sales, debtors, purchases, reportSettings, lastBackupAt, shop, expenses, cashups, adjustments, supplierPayments, loaded]);

  // Voided sales stay on record (History) but never count in any total.
  const liveSales = useMemo(() => activeSales(sales), [sales]);

  // One checkout = one validated, atomic update of stock + debtor + sales log.
  function completeSale({ cart, paymentMethod, debtorId, amountNow }) {
    const result = applySale({ products, debtors, cart, paymentMethod, debtorId, amountNow, by: user ? user.name : "" });
    if (!result.ok) return result;
    setProducts(result.products);
    setDebtors(result.debtors);
    setSales((s) => [...s, result.sale]);
    return result;
  }
  // Used by the Advisor's proactive reorder drafts — logs a purchase and
  // bumps stock in one step, the same way a manual restock in Stock does.
  function confirmReorder(productId, qty, supplier) {
    const p = products.find((x) => x.id === productId);
    if (!p || !qty || qty <= 0) return;
    const cost = p.costPrice;
    setProducts((ps) => ps.map((x) => (x.id === productId ? applyRestock(x, qty, cost) : x)));
    setPurchases((ps) => [
      ...ps,
      { id: newId(), productId, productName: p.name, qty, costPricePerUnit: cost, totalCost: cost * qty, supplier: supplier || "", date: Date.now() },
    ]);
  }

  function voidSale(saleId, reason) {
    const result = applyVoid({ products, debtors, sales, saleId, by: user ? user.name : "", reason });
    if (!result.ok) return result;
    setProducts(result.products);
    setDebtors(result.debtors);
    setSales(result.sales);
    return result;
  }

  // First-run setup: name the shop, then start empty or with sample data.
  function finishSetup(name, useDemo) {
    if (!useDemo) {
      setProducts([]); setDebtors([]); setPurchases([]); setSales([]);
    }
    setShop({ name: name.trim() || "My Shop", setupDone: true });
  }

  // Replaces everything with a validated backup (see lib/backup.js).
  function restoreBackup(data) {
    setProducts(data.products);
    setSales(data.sales);
    setDebtors(data.debtors);
    setPurchases(data.purchases);
    setExpenses(data.expenses);
    setCashups(data.cashups);
    setAdjustments(data.adjustments);
    setSupplierPayments(data.supplierPayments);
    setReportSettings({ ...DEFAULT_REPORT_SETTINGS, ...(data.reportSettings || {}) });
    setShop({ name: "My Shop", setupDone: true, ...(data.shop || {}) });
    setLastBackupAt(Date.now());
  }

  // Erases the shop's records (PINs and shop name are kept).
  async function resetAll() {
    setProducts([]); setDebtors([]); setSales([]); setPurchases([]);
    setExpenses([]); setCashups([]); setAdjustments([]); setSupplierPayments([]);
    setReportSettings(DEFAULT_REPORT_SETTINGS);
    setLastBackupAt(null);
  }

  if (booting || !loaded) {
    return <Splash />;
  }

  if (!user) {
    return <Login onLogin={(a) => { setUser(a); setTab("pos"); }} />;
  }

  if (!shop.setupDone) {
    if (user.role === "admin") return <SetupWizard onDone={finishSetup} />;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p className="mb-4">The owner needs to finish setting up the shop first. Please ask them to sign in.</p>
          <button onClick={() => setUser(null)} className="text-sm underline">Back to sign in</button>
        </div>
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => t.roles.includes(user.role));

  // Best-effort "it's ready" nudge — since a browser tab can't fire at
  // 7am while closed, the next best thing is surfacing the digest the
  // instant the owner opens the app on Monday (or month-start), rather
  // than making them remember to go check the Reports tab.
  const dueFlags = computeReportDue(reportSettings);
  const weeklyDue = user.role === "admin" && dueFlags.weeklyDue;
  const monthlyDue = user.role === "admin" && dueFlags.monthlyDue;
  const bannerPeriod = weeklyDue ? "week" : monthlyDue ? "month" : null;
  const backupAgeDays = lastBackupAt ? (Date.now() - lastBackupAt) / 86400000 : Infinity;
  const backupOverdue = user.role === "admin" && sales.length > 0 && backupAgeDays >= BACKUP_REMINDER_DAYS;

  return (
    <div className="min-h-screen" style={{ background: C.paper, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: C.gold }} />
            <span className="w-2 h-2 rounded-full" style={{ background: C.green }} />
            <span className="w-2 h-2 rounded-full" style={{ background: C.brick }} />
            <h1 className="text-xl ml-1" style={{ fontFamily: "'Fraunces', serif", color: C.ink }}>{shop.name || "ProfitMind"}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium" style={{ color: C.ink }}>{user.name}</p>
              <p className="text-[11px]" style={{ color: C.ink, opacity: 0.5 }}>{user.role === "admin" ? "Owner / Admin" : "Cashier"}</p>
            </div>
            <button
              onClick={() => setUser(null)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border"
              style={{ borderColor: C.line, color: C.ink }}
              title="Switch user"
            >
              <LogOut size={13} /> Switch
            </button>
          </div>
        </div>
        <p className="text-xs mb-6" style={{ color: C.ink, opacity: 0.5 }}>
          {user.role === "admin"
            ? "Signed in as Owner — full access, including everyday Sell/Debtors/Stock work at the till."
            : "Signed in as Cashier — till and stock access only. Analytics, Reports, Export & Backup and the Advisor are owner-only."}
        </p>

        <div className="flex gap-1 mb-6 border-b overflow-x-auto" style={{ borderColor: C.line }}>
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm -mb-px border-b-2 whitespace-nowrap"
              style={{
                borderColor: tab === id ? C.goldDark : "transparent",
                color: tab === id ? C.ink : "rgba(30,42,31,0.5)",
                fontWeight: tab === id ? 600 : 400,
              }}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {saveFailed && (
          <div className="flex items-center gap-2 rounded-lg border px-4 py-3 mb-5" style={{ borderColor: C.brick, background: "rgba(178,58,46,0.08)" }}>
            <AlertTriangle size={16} style={{ color: C.brick, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: C.ink }}>
              This device couldn't save your latest changes (storage may be full or blocked). Don't close the app — ask the owner to download a backup now.
            </p>
          </div>
        )}

        {backupOverdue && !dismissedBackup && tab !== "export" && (
          <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 mb-5" style={{ borderColor: C.goldDark, background: "rgba(217,164,65,0.12)" }}>
            <div className="flex items-center gap-2 min-w-0">
              <DatabaseBackup size={16} style={{ color: C.goldDark, flexShrink: 0 }} />
              <p className="text-xs" style={{ color: C.ink }}>
                {lastBackupAt ? `Your last backup was ${Math.floor(backupAgeDays)} days ago.` : "You haven't made a backup yet."} Your records only live on this phone.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setTab("export")} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: C.greenDark }}>Back up now</button>
              <button onClick={() => setDismissedBackup(true)} className="p-1" style={{ color: C.ink, opacity: 0.4 }}><X size={14} /></button>
            </div>
          </div>
        )}

        {bannerPeriod && !dismissedBanner && tab !== "reports" && (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 mb-5"
            style={{ borderColor: C.goldDark, background: "rgba(217,164,65,0.12)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Bell size={16} style={{ color: C.goldDark, flexShrink: 0 }} />
              <p className="text-xs" style={{ color: C.ink }}>
                Your {bannerPeriod === "week" ? "weekly" : "monthly"} report is ready to send.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setTab("reports")}
                className="text-xs px-3 py-1.5 rounded-lg text-white"
                style={{ background: C.greenDark }}
              >
                Open report
              </button>
              <button onClick={() => setDismissedBanner(true)} className="p-1" style={{ color: C.ink, opacity: 0.4 }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {tab === "pos" && (
          <POS products={products} debtors={debtors} setDebtors={setDebtors} onCompleteSale={completeSale} role={user.role} />
        )}
        {tab === "history" && <SalesHistory sales={sales} role={user.role} onVoid={voidSale} />}
        {tab === "debtors" && <Debtors debtors={debtors} setDebtors={setDebtors} role={user.role} />}
        {tab === "stock" && (
          <StockPage products={products} setProducts={setProducts} purchases={purchases} setPurchases={setPurchases} adjustments={adjustments} setAdjustments={setAdjustments} role={user.role} userName={user.name} />
        )}
        {tab === "money" && user.role === "admin" && (
          <MoneyPage
            sales={liveSales}
            debtors={debtors}
            purchases={purchases}
            expenses={expenses} setExpenses={setExpenses}
            cashups={cashups} setCashups={setCashups}
            adjustments={adjustments}
            supplierPayments={supplierPayments} setSupplierPayments={setSupplierPayments}
            userName={user.name}
          />
        )}
        <Suspense fallback={<p className="text-xs" style={{ color: C.ink, opacity: 0.5 }}>Loading…</p>}>
        {tab === "analytics" && user.role === "admin" && (
          <AnalyticsPage products={products} sales={liveSales} debtors={debtors} purchases={purchases} expenses={expenses} adjustments={adjustments} onOpenMoney={() => setTab("money")} />
        )}
        {tab === "reports" && user.role === "admin" && (
          <ReportsPage
            shopName={shop.name}
            expenses={expenses}
            adjustments={adjustments}
            products={products}
            sales={liveSales}
            debtors={debtors}
            purchases={purchases}
            settings={reportSettings}
            setSettings={setReportSettings}
          />
        )}
        {tab === "export" && user.role === "admin" && (
          <ExportPage products={products} sales={sales} debtors={debtors} purchases={purchases} expenses={expenses} cashups={cashups} adjustments={adjustments} supplierPayments={supplierPayments} reportSettings={reportSettings} shop={shop} onRenameShop={(name) => setShop((s) => ({ ...s, name: name.trim() || s.name }))} onRestore={restoreBackup} onReset={resetAll} onBackedUp={() => { setLastBackupAt(Date.now()); setDismissedBackup(false); }} />
        )}
        {tab === "advisor" && user.role === "admin" && (
          <Advisor products={products} sales={liveSales} debtors={debtors} purchases={purchases} extras={{ expenses, adjustments, cashups, supplierPayments, allSales: sales }} onConfirmReorder={confirmReorder} />
        )}
        </Suspense>
      </div>
    </div>
  );
}
