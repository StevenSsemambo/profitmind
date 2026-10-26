/* ------------------------------------------------------------------ */
/* Export & Backup — CSV downloads of the shop's raw records, plus the  */
/* reset-to-demo-data control.                                          */
/* ------------------------------------------------------------------ */
import { useState } from "react";
import { Download, FileSpreadsheet, RotateCcw } from "lucide-react";
import { C } from "../lib/theme.js";
import { Card } from "./ui/primitives.jsx";
import { downloadCSV } from "../lib/csv.js";
import SecurityCard from "./SecurityCard.jsx";

export default function ExportPage({ products, sales, debtors, purchases, onReset, onBackedUp }) {
  const [note, setNote] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  function exportStock() {
    downloadCSV(
      "profitmind-stock.csv",
      products.map((p) => ({ name: p.name, category: p.category, costPrice: p.costPrice, sellPrice: p.sellPrice, stock: p.stock })),
      ["name", "category", "costPrice", "sellPrice", "stock"]
    );
    setNote("Stock CSV downloaded.");
  }
  function exportSales() {
    downloadCSV(
      "profitmind-sales.csv",
      sales.map((s) => ({ date: new Date(s.date).toISOString(), revenue: s.total, cost: s.cost, profit: s.profit, paymentMethod: s.paymentMethod })),
      ["date", "revenue", "cost", "profit", "paymentMethod"]
    );
    setNote("Sales CSV downloaded.");
  }
  function exportDebtors() {
    downloadCSV(
      "profitmind-debtors.csv",
      debtors.map((d) => ({ name: d.name, phone: d.phone, owed: d.owed, paid: d.paid, balance: d.owed - d.paid })),
      ["name", "phone", "owed", "paid", "balance"]
    );
    setNote("Debtors CSV downloaded.");
  }
  function exportPurchases() {
    downloadCSV(
      "profitmind-purchases.csv",
      purchases.map((p) => ({ date: new Date(p.date).toISOString(), product: p.productName, qty: p.qty, costPerUnit: p.costPricePerUnit, total: p.totalCost, supplier: p.supplier })),
      ["date", "product", "qty", "costPerUnit", "total", "supplier"]
    );
    setNote("Stock purchases CSV downloaded.");
  }
  function exportBackup() {
    const payload = { app: "profitmind", exportedAt: new Date().toISOString(), data: { products, sales, debtors, purchases } };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "profitmind-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNote("Full backup downloaded.");
    if (onBackedUp) onBackedUp();
  }

  const rows = [
    { label: "Sales", hint: "Every sale, with revenue, cost, profit and payment method", fn: exportSales },
    { label: "Stock", hint: "Current products, prices and stock levels", fn: exportStock },
    { label: "Debtors", hint: "Customers on credit and their balances", fn: exportDebtors },
    { label: "Stock purchases", hint: "Every delivery received from suppliers", fn: exportPurchases },
  ];

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: C.ink, opacity: 0.6 }}>
        Your data is saved automatically on this device. Export regularly too, so a lost or broken phone never means lost records.
        <br />
        <span className="text-xs">Looking for a business summary to read, print or send on WhatsApp? Head to the <strong>Reports</strong> tab — these raw CSV/JSON files are for backing up the underlying records.</span>
      </p>
      <Card className="divide-y overflow-hidden mb-6">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 p-4" style={{ borderColor: C.line }}>
            <div>
              <p className="font-medium text-sm" style={{ color: C.ink }}>{r.label}</p>
              <p className="text-xs" style={{ color: C.ink, opacity: 0.5 }}>{r.hint}</p>
            </div>
            <button
              onClick={r.fn}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border"
              style={{ borderColor: C.line, color: C.ink }}
            >
              <FileSpreadsheet size={14} /> CSV
            </button>
          </div>
        ))}
      </Card>
      <Card className="p-5 mb-6">
        <h3 className="font-medium mb-1" style={{ color: C.ink }}>Full backup</h3>
        <p className="text-xs mb-4" style={{ color: C.ink, opacity: 0.5 }}>
          One JSON file with everything — products, sales, purchases and debtors — for disaster recovery.
        </p>
        <button onClick={exportBackup} className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg text-white" style={{ background: C.greenDark }}>
          <Download size={16} /> Download full backup
        </button>
      </Card>
      {note && <p className="text-xs mb-6" style={{ color: C.ink, opacity: 0.6 }}>{note}</p>}

      <SecurityCard />

      <Card className="p-5" style={{ borderColor: C.brick }}>
        <h3 className="font-medium mb-1" style={{ color: C.ink }}>Reset shop data</h3>
        <p className="text-xs mb-4" style={{ color: C.ink, opacity: 0.5 }}>
          Wipes products, sales, debtors and purchases on this device and starts over from the sample data. Your PINs are kept. This cannot be undone — download a full backup first.
        </p>
        {confirmReset ? (
          <div className="flex gap-2">
            <button onClick={() => { onReset(); setConfirmReset(false); setNote("Demo data reset."); }} className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg text-white" style={{ background: C.brick }}>
              <RotateCcw size={16} /> Yes, reset everything
            </button>
            <button onClick={() => setConfirmReset(false)} className="text-sm px-4 py-2.5 rounded-lg border" style={{ borderColor: C.line, color: C.ink }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border" style={{ borderColor: C.brick, color: C.brick }}>
            <RotateCcw size={16} /> Reset demo data
          </button>
        )}
      </Card>
    </div>
  );
}

