/* ------------------------------------------------------------------ */
/* Reports — Today / Weekly / Monthly digest, sent via WhatsApp or       */
/* printed to PDF, plus the due-date reminder settings and browser       */
/* notification opt-in.                                                  */
/* ------------------------------------------------------------------ */
import { useState, useMemo } from "react";
import { Bell, Printer, Send, AlertTriangle, Phone } from "lucide-react";
import { C, ugx } from "../lib/theme.js";
import { buildPeriodReport, sendDigestWhatsApp, printPeriodReport } from "../lib/reports.js";
import { Card } from "./ui/primitives.jsx";

const REPORT_PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

function ReportKPI({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border p-3" style={{ borderColor: C.line, background: C.paperRaised }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: C.ink, opacity: 0.5 }}>{label}</p>
      <p className="text-base font-semibold mt-1" style={{ color: C.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</p>
    </div>
  );
}

export default function ReportsPage({ products, sales, debtors, purchases, expenses = [], adjustments = [], settings, setSettings, shopName = "My Shop" }) {
  const [period, setPeriod] = useState("week");
  const [note, setNote] = useState("");
  const [phoneDraft, setPhoneDraft] = useState(settings.whatsappNumber || "");
  const [notifPermission, setNotifPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNote("This browser doesn't support notifications — the in-app banner will still work.");
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    setSettings((s) => ({ ...s, notificationsEnabled: perm === "granted" }));
    setNote(
      perm === "granted"
        ? "Notifications enabled — you'll get one the moment a report is due, as long as this browser is running."
        : "Notifications weren't allowed — you'll still see the in-app banner when you open ProfitMind."
    );
  }
  function disableNotifications() {
    setSettings((s) => ({ ...s, notificationsEnabled: false }));
    setNote("Notifications turned off — you'll still see the in-app banner.");
  }

  const report = useMemo(
    () => buildPeriodReport(products, sales, debtors, purchases, period, expenses, adjustments),
    [products, sales, debtors, purchases, expenses, adjustments, period]
  );

  function markDelivered() {
    const now = Date.now();
    setSettings((s) => ({
      ...s,
      ...(period === "week" ? { lastWeeklySent: now } : period === "month" ? { lastMonthlySent: now } : {}),
    }));
  }
  function handleWhatsApp() {
    sendDigestWhatsApp(report, shopName, settings.whatsappNumber);
    markDelivered();
    setNote("Opened WhatsApp with the report ready to send.");
  }
  function handlePrint() {
    printPeriodReport(report, shopName);
    markDelivered();
    setNote("Opened the print dialog — choose \"Save as PDF\" as the destination to download it.");
  }
  function savePhone() {
    setSettings((s) => ({ ...s, whatsappNumber: phoneDraft.trim() }));
    setNote("WhatsApp number saved.");
  }

  const changeTxt = report.changePct === null
    ? `No prior period to compare yet.`
    : `${report.changePct >= 0 ? "Up" : "Down"} ${Math.abs(report.changePct).toFixed(1)}% vs ${report.compareLabel}.`;

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: C.ink, opacity: 0.6 }}>
        A ready-to-read business summary — print it, save it as a PDF, or send it straight to WhatsApp.
      </p>

      <div className="flex gap-1 mb-5 rounded-lg border p-1 w-fit" style={{ borderColor: C.line }}>
        {REPORT_PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className="text-xs px-3 py-1.5 rounded-md"
            style={{
              background: period === p.id ? C.greenDark : "transparent",
              color: period === p.id ? "#fff" : C.ink,
              fontWeight: period === p.id ? 600 : 400,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Card className="p-5 mb-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-medium" style={{ color: C.ink, fontFamily: "'Fraunces', serif" }}>
            {report.periodTitle} Report
          </h3>
          <span className="text-[11px]" style={{ color: C.ink, opacity: 0.5 }}>{report.rangeLabel}</span>
        </div>
        <p className="text-xs mb-4" style={{ color: C.green }}>{changeTxt}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <ReportKPI label="Revenue" value={ugx(report.revenue)} />
          <ReportKPI label="Gross profit" value={ugx(report.grossProfit)} />
          <ReportKPI label="Net profit" value={report.hasExpenses || report.stockLoss > 0 ? ugx(report.netProfit) : "—"} />
          <ReportKPI label="Sales" value={report.salesCount} />
        </div>

        {report.topProducts.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium mb-1.5" style={{ color: C.ink }}>Top sellers</p>
            {report.topProducts.map((p) => (
              <div key={p.name} className="flex justify-between text-xs py-1" style={{ color: C.ink, opacity: 0.75 }}>
                <span>{p.name} · {p.units} unit(s)</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ugx(p.revenue)}</span>
              </div>
            ))}
          </div>
        )}

        {report.reorderDrafts.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: C.brick }}>
              <AlertTriangle size={12} /> Reorder soon
            </p>
            {report.reorderDrafts.slice(0, 5).map((p) => (
              <div key={p.id} className="flex justify-between text-xs py-1" style={{ color: C.ink, opacity: 0.75 }}>
                <span>{p.name}</span>
                <span>{p.daysLeft !== null ? `~${Math.round(p.daysLeft)}d left` : "below reorder level"}</span>
              </div>
            ))}
          </div>
        )}

        {report.debtorSummary.debtorCount > 0 && (
          <p className="text-xs" style={{ color: C.ink, opacity: 0.7 }}>
            Debtors: {ugx(report.debtorSummary.totalOwed)} owed by {report.debtorSummary.debtorCount} customer(s).
          </p>
        )}
      </Card>

      <Card className="p-5 mb-5">
        <h3 className="font-medium mb-1" style={{ color: C.ink }}>Deliver this report</h3>
        <p className="text-xs mb-4" style={{ color: C.ink, opacity: 0.5 }}>
          Send it to your own WhatsApp (or forward it to a manager), or save it as a PDF for your records.
        </p>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0 rounded-lg border px-3 py-2" style={{ borderColor: C.line }}>
            <Phone size={14} style={{ color: C.ink, opacity: 0.4 }} />
            <input
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="e.g. 2567xxxxxxxx"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm"
              style={{ color: C.ink }}
            />
          </div>
          <button onClick={savePhone} className="text-xs px-3 py-2 rounded-lg border shrink-0" style={{ borderColor: C.line, color: C.ink }}>
            Save
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleWhatsApp} className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg text-white" style={{ background: C.greenDark }}>
            <Send size={16} /> Send via WhatsApp
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border" style={{ borderColor: C.line, color: C.ink }}>
            <Printer size={16} /> Print / Save as PDF
          </button>
        </div>
        {note && <p className="text-xs mt-3" style={{ color: C.ink, opacity: 0.6 }}>{note}</p>}
      </Card>

      <Card className="p-5">
        <h3 className="font-medium mb-1 flex items-center gap-2" style={{ color: C.ink }}>
          <Bell size={15} /> Monday-morning reminders
        </h3>
        <p className="text-xs mb-4" style={{ color: C.ink, opacity: 0.5 }}>
          ProfitMind can't send WhatsApp messages while the app is fully closed — WhatsApp delivery needs either the app open or a
          server-side WhatsApp Business API connection. What it <em>can</em> do is have the weekly/monthly report ready and
          flagged the moment you next open the app, so it's a single tap rather than something you have to remember to build.
        </p>
        <label className="flex items-center gap-2 text-sm mb-2" style={{ color: C.ink }}>
          <input
            type="checkbox"
            checked={!!settings.autoWeekly}
            onChange={(e) => setSettings((s) => ({ ...s, autoWeekly: e.target.checked }))}
          />
          Flag my weekly report every Monday
        </label>
        <label className="flex items-center gap-2 text-sm mb-4" style={{ color: C.ink }}>
          <input
            type="checkbox"
            checked={!!settings.autoMonthly}
            onChange={(e) => setSettings((s) => ({ ...s, autoMonthly: e.target.checked }))}
          />
          Flag my monthly report on the 1st–3rd of each month
        </label>

        <div className="rounded-lg border p-3" style={{ borderColor: C.line }}>
          <p className="text-xs font-medium mb-1 flex items-center gap-1.5" style={{ color: C.ink }}>
            <Bell size={12} /> Browser notifications
          </p>
          <p className="text-[11px] mb-2" style={{ color: C.ink, opacity: 0.55 }}>
            Best-effort alert the moment a report becomes due, even if ProfitMind is just sitting in the background — not only
            when you happen to open it. This still needs the browser itself to be running; it won't reach you if the app or
            browser has been fully closed or the phone restarted, so treat it as a bonus nudge on top of the in-app banner, not a replacement for it.
          </p>
          {notifPermission === "unsupported" ? (
            <p className="text-[11px]" style={{ color: C.ink, opacity: 0.4 }}>Not supported in this browser.</p>
          ) : notifPermission === "denied" ? (
            <p className="text-[11px]" style={{ color: C.brick }}>Blocked in this browser's settings — enable notifications for this site to use it.</p>
          ) : settings.notificationsEnabled && notifPermission === "granted" ? (
            <div className="flex items-center justify-between">
              <span className="text-xs flex items-center gap-1.5" style={{ color: C.greenDark }}><Bell size={12} /> Enabled</span>
              <button onClick={disableNotifications} className="text-[11px] underline" style={{ color: C.ink, opacity: 0.6 }}>Turn off</button>
            </div>
          ) : (
            <button onClick={enableNotifications} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: C.line, color: C.ink }}>
              Enable browser notifications
            </button>
          )}
        </div>

        <p className="text-[11px] mt-4" style={{ color: C.ink, opacity: 0.4 }}>
          For true unattended delivery — a report that lands on WhatsApp before you've opened the app at all, even with the
          phone locked or the browser fully closed — the production build wires this same digest into a small server-side
          scheduler using the WhatsApp Business Cloud API and real Web Push (with a service worker and push subscription),
          since only a backend can run reliably at 7am regardless of what the browser is doing.
        </p>
      </Card>
    </div>
  );
}

