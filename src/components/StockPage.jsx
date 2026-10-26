/* ------------------------------------------------------------------ */
/* StockPage — record deliveries (stock + cost price update together),  */
/* review recent purchases, and manage the product catalogue.           */
/* ------------------------------------------------------------------ */
import { useState, useEffect } from "react";
import { PackagePlus, Plus, Pencil, Trash2 } from "lucide-react";
import { C, ugx, fmtDate } from "../lib/theme.js";
import { Card, Field, EmptyState, inputStyle } from "./ui/primitives.jsx";
import ProductModal from "./ProductModal.jsx";

export default function StockPage({ products, setProducts, purchases, setPurchases, role }) {
  const isAdmin = role === "admin";
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [costPricePerUnit, setCostPricePerUnit] = useState("");
  const [supplier, setSupplier] = useState("");
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
    const cost = costPricePerUnit === "" ? p.costPrice : Number(costPricePerUnit);
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, stock: x.stock + q, costPrice: cost } : x)));
    setPurchases((ps) => [
      ...ps,
      { id: Date.now() + Math.random(), productId: p.id, productName: p.name, qty: q, costPricePerUnit: cost, totalCost: cost * q, supplier: supplier.trim(), date: Date.now() },
    ]);
    setNote(`Added ${q} ${p.unit}(s) of ${p.name} to stock.`);
    setQty("");
    setSupplier("");
  }

  function addProduct(data) {
    const id = Math.max(0, ...products.map((p) => p.id)) + 1;
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
            <button
              onClick={() => setShowNewProduct(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border"
              style={{ borderColor: C.line, color: C.ink }}
            >
              <Plus size={14} /> Add product
            </button>
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
                    <td className="px-4 py-2 font-medium" style={{ color: C.ink }}>{p.name}</td>
                    <td className="px-4 py-2" style={{ color: C.ink, opacity: 0.6 }}>{p.category}</td>
                    <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ugx(p.costPrice)}</td>
                    <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ugx(p.sellPrice)}</td>
                    <td className="px-4 py-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace", color: p.stock <= p.lowStockThreshold ? C.brick : C.ink }}>{p.stock}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
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

      {showNewProduct && <ProductModal onSave={addProduct} onClose={() => setShowNewProduct(false)} />}
      {editingProduct && (
        <ProductModal product={editingProduct} onSave={(data) => updateProduct(editingProduct.id, data)} onClose={() => setEditingProduct(null)} />
      )}
    </div>
  );
}

