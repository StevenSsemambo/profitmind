/* ------------------------------------------------------------------ */
/* Export & Backup — CSV downloads of the shop's raw records, plus the  */
/* reset-to-demo-data control.                                          */
/* ------------------------------------------------------------------ */
import { useState } from "react";
import { Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { C } from "../lib/theme.js";
import { Card, Modal } from "./ui/primitives.jsx";
import { buildBackup, parseBackup } from "../lib/backup.js";
import { downloadCSV } from "../lib/csv.js";
import SecurityCard from "./SecurityCard.jsx";

export default function ExportPage({ products, sales, debtors, purchases, expenses = [], cashups = [], adjustments = [], supplierPayments = [], reportSettings, shop, onRenameShop, onRestore, onReset, onBackedUp }) {
  const [shopName, setShopName] = useState((shop && shop.name) || "");
  const [note, setNote] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [restorePreview, setRestorePreview] = useState(null); // { data, summary }
  const [restoreError, setRestoreError] = useState("");

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
      sales.map((s) => ({ date: new Date(s.date).toISOString(), revenue: s.total, cost: s.cost, profit: s.profit, paymentMethod: s.paymentMethod, soldBy: s.by || "", discount: s.discount || 0, status: s.voided ? `VOIDED: ${s.voided.reason}` : "ok" })),
      ["date", "revenue", "cost", "profit", "paymentMethod", "soldBy", "discount", "status"]
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
  function exportExpenses() {
    downloadCSV(
      "profitmind-expenses.csv",
      expenses.map((e) => ({ date: new Date(e.date).toISOString(), category: e.category, amount: e.amount, paidWith: e.method, note: e.note || "" })),
      ["date", "category", "amount", "paidWith", "note"]
    );
    setNote("Expenses CSV downloaded.");
  }
  function onPickBackup(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setRestoreError("");
    const reader = new FileReader();
    reader.onload = () => {
      const r = parseBackup(String(reader.result || ""));
      if (!r.ok) { setRestoreError(r.error); return; }
      setRestorePreview(r);
    };
    reader.onerror = () => setRestoreError("Couldn't read that file.");
    reader.readAsText(file);
  }
  function confirmRestore() {
    onRestore(restorePreview.data);
    setRestorePreview(null);
    setNote("Backup restored. Your shop's records are back.");
  }
  function exportBackup() {
    const payload = buildBackup({ products, sales, debtors, purchases, expenses, cashups, adjustments, supplierPayments, reportSettings, shop });
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
    { label: "Expenses", hint: "Rent, wages, transport and other running costs", fn: exportExpenses },
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
          One file with everything — products, sales (including voided), debtors, purchases, expenses, cash counts and stock adjustments. Keep a copy somewhere safe (WhatsApp to yourself, email, Google Drive).
        </p>
        <button onClick={exportBackup} className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg text-white" style={{ background: C.greenDark }}>
          <Download size={16} /> Download full backup
        </button>
        <div className="mt-5 pt-4 border-t" style={{ borderColor: C.line }}>
          <p className="text-sm font-medium mb-1" style={{ color: C.ink }}>Restore from a backup</p>
          <p className="text-xs mb-3" style={{ color: C.ink, opacity: 0.5 }}>
            Replaces everything on this device with the contents of a backup file. You'll see a summary and confirm before anything changes.
          </p>
          <label className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border cursor-pointer" style={{ borderColor: C.line, color: C.ink }}>
            <Upload size={16} /> Choose backup file
            <input type="file" accept=".json,application/json" onChange={onPickBackup} className="hidden" />
          </label>
          {restoreError && <p className="text-xs mt-3" style={{ color: C.brick }}>{restoreError}</p>}
        </div>
      </Card>

      {restorePreview && (
        <Modal title="Restore this backup?" onClose={() => setRestorePreview(null)}>
          <p className="text-sm mb-2" style={{ color: C.ink }}>
            {restorePreview.summary.products} products · {restorePreview.summary.sales} sales · {restorePreview.summary.debtors} customers · {restorePreview.summary.purchases} deliveries · {restorePreview.summary.expenses} expenses
          </p>
          {restorePreview.summary.exportedAt && <p className="text-xs mb-3" style={{ color: C.ink, opacity: 0.6 }}>Made on {new Date(restorePreview.summary.exportedAt).toLocaleString("en-GB")}</p>}
          <p className="text-xs mb-4" style={{ color: C.brick }}>This replaces what is on this device right now. Download a backup of the current data first if you might need it.</p>
          <div className="flex gap-2">
            <button onClick={confirmRestore} className="flex-1 rounded-lg py-2.5 text-white text-sm" style={{ background: C.brick }}>Yes, restore</button>
            <button onClick={() => setRestorePreview(null)} className="rounded-lg py-2.5 px-4 text-sm border" style={{ borderColor: C.line, color: C.ink }}>Cancel</button>
          </div>
        </Modal>
      )}
      {note && <p className="text-xs mb-6" style={{ color: C.ink, opacity: 0.6 }}>{note}</p>}

      <Card className="p-5 mb-6">
        <h3 className="font-medium mb-1" style={{ color: C.ink }}>Shop name</h3>
        <p className="text-xs mb-3" style={{ color: C.ink, opacity: 0.5 }}>Shown at the top of the app, on receipts and on reports.</p>
        <div className="flex gap-2">
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} style={{ width: "100%", borderRadius: "0.5rem", border: `1px solid ${C.line}`, padding: "0.5rem 0.75rem", background: "white" }} />
          <button onClick={() => { onRenameShop(shopName); setNote("Shop name saved."); }} disabled={shopName.trim().length < 2} className="text-sm px-4 rounded-lg text-white disabled:opacity-40" style={{ background: C.greenDark }}>Save</button>
        </div>
      </Card>

      <SecurityCard />

      <Card className="p-5" style={{ borderColor: C.brick }}>
        <h3 className="font-medium mb-1" style={{ color: C.ink }}>Erase all shop data</h3>
        <p className="text-xs mb-4" style={{ color: C.ink, opacity: 0.5 }}>
          Deletes every product, sale, customer, expense and record on this device and leaves the shop empty. Your PINs and shop name are kept. This cannot be undone — download a full backup first.
        </p>
        {confirmReset ? (
          <div className="flex gap-2">
            <button onClick={() => { onReset(); setConfirmReset(false); setNote("All shop data erased."); }} className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg text-white" style={{ background: C.brick }}>
              <RotateCcw size={16} /> Yes, erase everything
            </button>
            <button onClick={() => setConfirmReset(false)} className="text-sm px-4 py-2.5 rounded-lg border" style={{ borderColor: C.line, color: C.ink }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border" style={{ borderColor: C.brick, color: C.brick }}>
            <RotateCcw size={16} /> Erase all shop data
          </button>
        )}
      </Card>
    </div>
  );
}

