/* ------------------------------------------------------------------ */
/* StockPage — record deliveries (stock + cost price update together),  */
/* review recent purchases, and manage the product catalogue.           */
/* ------------------------------------------------------------------ */
import { newId } from "../lib/ids.js";
import { useState, useEffect } from "react";
import { PackagePlus, Plus, Pencil, Trash2, SlidersHorizontal, Upload } from "lucide-react";
import { C, ugx, fmtDate } from "../lib/theme.js";
import { Card, Field, Modal, EmptyState, inputStyle } from "./ui/primitives.jsx";
import { applyRestock, applyAdjustment, ADJUST_REASONS } from "../lib/stock.js";
import { parseProductsCsv, IMPORT_TEMPLATE } from "../lib/importProducts.js";
import { startOfDay } from "../lib/finance.js";
import ProductModal from "./ProductModal.jsx";

export default function StockPage({ products, setProducts, purchases, setPurchases, adjustments = [], setAdjustments, role, userName = "" }) {
  const isAdmin = role === "admin";
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [costPricePerUnit, setCostPricePerUnit] = useState("");
  const [supplier, setSupplier] = useState("");
  const [paidNow, setPaidNow] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [batchExpiry, setBatchExpiry] = useState("");
  const [adjusting, setAdjusting] = useState(null);
  const [adj, setAdj] = useState({ counted: "", reason: "count", note: "" });
  const [adjError, setAdjError] = useState("");
  const [importResult, setImportResult] = useState(null); // { products, errors, skipped }
  const [note, setNote] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    const p = products.find((p) => p.id === Number(productId));
    if (p) setCostPricePerUnit(String(p.costPrice));
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  function recordPurchase() {
    const p = products.find((p) => p.id === Number(productId));
    if (!p || !qty || Number(qty) <= 0) return;
    const q = Number(qty);
    const cost = Math.round(costPricePerUnit === "" ? p.costPrice : Number(costPricePerUnit));
    const total = cost * q;
    const paid = paidNow === "" ? total : Number(paidNow);
    if (!(paid >= 0) || paid > total) { setNote(`The amount paid now must be between 0 and ${ugx(total)}.`); return; }
    const expiry = batchExpiry ? new Date(`${batchExpiry}T12:00:00`).getTime() : null;
    setProducts((ps) => ps.map((x) => (x.id === p.id ? applyRestock(x, q, cost, expiry) : x)));
    setPurchases((ps) => [
      ...ps,
      { id: newId(), productId: p.id, productName: p.name, qty: q, costPricePerUnit: cost, totalCost: total, paid, payMethod, supplier: supplier.trim(), date: Date.now() },
    ]);
    setNote(`Added ${q} ${p.unit}(s) of ${p.name} to stock.${paid < total ? ` ${ugx(total - paid)} still owed${supplier.trim() ? ` to ${supplier.trim()}` : " to the supplier"}.` : ""}`);
    setQty("");
    setSupplier("");
    setPaidNow("");
    setBatchExpiry("");
  }

  function openAdjust(p) {
    setAdjusting(p);
    setAdj({ counted: String(p.stock), reason: "count", note: "" });
    setAdjError("");
  }
  function saveAdjust() {
    const r = applyAdjustment(adjusting, adj.counted, adj.reason, { by: userName, note: adj.note });
    if (!r.ok) { setAdjError(r.error); return; }
    setProducts((ps) => ps.map((x) => (x.id === adjusting.id ? r.product : x)));
    setAdjustments((as) => [...as, r.adjustment]);
    setAdjusting(null);
  }

  function onPickCsv(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = parseProductsCsv(String(reader.result || ""));
      const have = new Set(products.map((p) => p.name.trim().toLowerCase()));
      const fresh = [];
      const skipped = [];
      r.products.forEach((p) => {
        const k = p.name.trim().toLowerCase();
        if (have.has(k)) skipped.push(p.name); else { have.add(k); fresh.push(p); }
      });
      setImportResult({ products: fresh, errors: r.errors, skipped });
    };
    reader.readAsText(file);
  }
  function confirmImport() {
    setProducts((ps) => [...ps, ...importResult.products.map((p) => ({ id: newId(), ...p }))]);
    setNote(`Imported ${importResult.products.length} product(s).`);
    setImportResult(null);
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "profitmind-products-template.csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function addProduct(data) {
    const id = newId();
    setProducts((ps) => [...ps, { id, ...data }]);
    setShowNewProduct(false);
    setProductId(String(id));
    setCostPricePerUnit(String(data.costPrice));
    setNote(`${data.name} added as a new product.`);
  }
  function updateProduct(id, data) {
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...data } : p)));
    setEditingProduct(null);
  }
  function deleteProduct(id) {
    setProducts((ps) => ps.filter((p) => p.id !== id));
    setConfirmDeleteId(null);
  }

  const recentPurchases = [...purchases].sort((a, b) => b.date - a.date).slice(0, 10);

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: C.ink, opacity: 0.6 }}>
        Log every delivery from your suppliers here — stock levels and cost prices update automatically.
      </p>

      <Card className="p-4 mb-6">
        <h3 className="font-medium mb-3" style={{ color: C.ink }}>Record stock received</h3>
        <div className="space-y-3">
          <Field label="Product">
            <select
              value={productId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setShowNewProduct(true);
                  return;
                }
                setProductId(e.target.value);
              }}
              style={inputStyle()}
            >
              <option value="">Choose a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new__">+ It's a new product…</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quantity received">
              <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle()} />
            </Field>
            <Field label="Cost price / unit (UGX)">
              <input type="number" value={costPricePerUnit} onChange={(e) => setCostPricePerUnit(e.target.value)} style={inputStyle()} />
            </Field>
          </div>
          <Field label="Supplier (optional)">
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle()} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Paid now (blank = paid in full)">
              <input type="number" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="UGX" style={inputStyle()} />
            </Field>
            <Field label="Paid with">
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={inputStyle()}>
                <option value="cash">Cash</option>
                <option value="momo">Mobile money</option>
                <option value="bank">Bank</option>
              </select>
            </Field>
          </div>
          <Field label="Expiry date of this delivery (optional)">
            <input type="date" value={batchExpiry} onChange={(e) => setBatchExpiry(e.target.value)} style={inputStyle()} />
          </Field>
          <button
            onClick={recordPurchase}
            disabled={!productId || !qty}
            className="w-full rounded-lg py-2.5 text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: C.greenDark }}
          >
            <PackagePlus size={16} /> Add to stock
          </button>
          <button
            onClick={() => setShowNewProduct(true)}
            className="w-full text-xs py-1 hover:underline"
            style={{ color: C.greenDark }}
          >
            Selling something new? Add it as a product first →
          </button>
          {note && <p className="text-xs" style={{ color: C.ink, opacity: 0.6 }}>{note}</p>}
        </div>
      </Card>

      <h3 className="font-medium mb-3" style={{ color: C.ink }}>Recent stock purchases</h3>
      <Card className="overflow-hidden mb-6">
        {recentPurchases.length === 0 ? (
          <EmptyState text="No stock purchases recorded yet." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ background: C.paper, color: C.ink, opacity: 0.5 }}>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Cost/unit</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentPurchases.map((pu) => (
                <tr key={pu.id} className="border-t" style={{ borderColor: C.line }}>
                  <td className="px-4 py-2" style={{ color: C.ink, opacity: 0.6 }}>{fmtDate(pu.date)}</td>
                  <td className="px-4 py-2 font-medium" style={{ color: C.ink }}>{pu.productName}</td>
                  <td className="px-4 py-2" style={{ color: C.ink, opacity: 0.6 }}>{pu.supplier || "—"}</td>
                  <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{pu.qty}</td>
                  <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ugx(pu.costPricePerUnit)}</td>
                  <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ugx(pu.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {isAdmin && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium" style={{ color: C.ink }}>Products</h3>
            <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewProduct(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border"
              style={{ borderColor: C.line, color: C.ink }}
            >
              <Plus size={14} /> Add product
            </button>
            <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: C.line, color: C.ink }}>
              <Upload size={14} /> Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onPickCsv} className="hidden" />
            </label>
            <button onClick={downloadTemplate} className="text-[11px] underline" style={{ color: C.ink, opacity: 0.55 }}>CSV template</button>
            </div>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ background: C.paper, color: C.ink, opacity: 0.5 }}>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Sell</th>
                  <th className="px-4 py-2 text-right">Stock</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: C.line }}>
                    <td className="px-4 py-2 font-medium" style={{ color: C.ink }}>
                      {p.name}
                      {p.expiryDate && p.stock > 0 && (() => {
                        const days = Math.round((startOfDay(p.expiryDate) - startOfDay(Date.now())) / 86400000);
                        if (days > 7) return null;
                        return <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: days < 0 ? C.brick : C.goldDark }}>{days < 0 ? "Expired" : days === 0 ? "Expires today" : `Expires in ${days}d`}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-2" style={{ color: C.ink, opacity: 0.6 }}>{p.category}</td>
                    <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ugx(p.costPrice)}</td>
                    <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ugx(p.sellPrice)}</td>
                    <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace", color: p.stock <= p.lowStockThreshold ? C.brick : C.ink }}>{p.stock}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => openAdjust(p)} className="p-1.5 rounded hover:bg-black/5" style={{ color: C.ink, opacity: 0.6 }} title="Adjust stock (count, damage, expiry…)">
                        <SlidersHorizontal size={14} />
                      </button>
                      <button onClick={() => setEditingProduct(p)} className="p-1.5 rounded hover:bg-black/5" style={{ color: C.ink, opacity: 0.6 }} title="Edit">
                        <Pencil size={14} />
                      </button>
                      {confirmDeleteId === p.id ? (
                        <button onClick={() => deleteProduct(p.id)} className="text-xs px-2 py-1 rounded ml-1" style={{ background: C.brick, color: "white" }}>
                          Confirm delete
                        </button>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(p.id)} className="p-1.5 rounded hover:bg-black/5 ml-1" style={{ color: C.brick, opacity: 0.7 }} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {isAdmin && adjustments.length > 0 && (
        <div className="mt-6">
          <h3 className="font-medium mb-3" style={{ color: C.ink }}>Recent stock adjustments</h3>
          <Card className="overflow-hidden">
            {[...adjustments].sort((a, b) => b.date - a.date).slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2 text-xs border-t first:border-t-0" style={{ borderColor: C.line, color: C.ink }}>
                <span style={{ opacity: 0.75 }}>{fmtDate(a.date)} · {a.name} · {(ADJUST_REASONS.find((r) => r.id === a.reason) || {}).label}{a.note ? ` — ${a.note}` : ""}{a.by ? ` · ${a.by}` : ""}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: a.delta < 0 ? C.brick : C.greenDark }}>{a.delta > 0 ? "+" : ""}{a.delta}{a.lossValue > 0 ? ` (${ugx(a.lossValue)} lost)` : ""}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {adjusting && (
        <Modal title={`Adjust stock — ${adjusting.name}`} onClose={() => setAdjusting(null)}>
          <p className="text-sm mb-3" style={{ color: C.ink, opacity: 0.65 }}>The app thinks you have {adjusting.stock} {adjusting.unit}(s). Enter what's really on the shelf; the difference is recorded.</p>
          <div className="space-y-3">
            <Field label="Quantity actually there">
              <input autoFocus type="number" value={adj.counted} onChange={(e) => setAdj({ ...adj, counted: e.target.value })} style={inputStyle()} />
            </Field>
            <Field label="Why is it different?">
              <select value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} style={inputStyle()}>
                {ADJUST_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Note (optional)">
              <input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} style={inputStyle()} />
            </Field>
            {adjError && <p className="text-xs" style={{ color: C.brick }}>{adjError}</p>}
            <button onClick={saveAdjust} className="w-full rounded-lg py-2.5 text-white font-medium" style={{ background: C.greenDark }}>Save adjustment</button>
          </div>
        </Modal>
      )}

      {importResult && (
        <Modal title="Import products" onClose={() => setImportResult(null)}>
          <p className="text-sm" style={{ color: C.ink }}><strong>{importResult.products.length}</strong> new product(s) ready to import.</p>
          {importResult.skipped.length > 0 && <p className="text-xs mt-2" style={{ color: C.ink, opacity: 0.65 }}>Skipped {importResult.skipped.length} that already exist: {importResult.skipped.slice(0, 5).join(", ")}{importResult.skipped.length > 5 ? "…" : ""}</p>}
          {importResult.errors.length > 0 && (
            <div className="mt-2 text-xs" style={{ color: C.brick }}>
              <p className="font-medium">{importResult.errors.length} row(s) have problems and were left out:</p>
              {importResult.errors.slice(0, 6).map((e) => <p key={e.line}>Line {e.line}: {e.message}</p>)}
              {importResult.errors.length > 6 && <p>…and {importResult.errors.length - 6} more.</p>}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={confirmImport} disabled={importResult.products.length === 0} className="flex-1 rounded-lg py-2.5 text-white text-sm disabled:opacity-40" style={{ background: C.greenDark }}>Import</button>
            <button onClick={downloadTemplate} className="rounded-lg py-2.5 px-3 text-xs border" style={{ borderColor: C.line, color: C.ink }}>Template</button>
          </div>
        </Modal>
      )}

      {showNewProduct && <ProductModal onSave={addProduct} onClose={() => setShowNewProduct(false)} />}
      {editingProduct && (
        <ProductModal product={editingProduct} onSave={(data) => updateProduct(editingProduct.id, data)} onClose={() => setEditingProduct(null)} />
      )}
    </div>
  );
}

