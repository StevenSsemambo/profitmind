/* ------------------------------------------------------------------ */
/* ProductModal — add/edit a product's name, category, pricing, and     */
/* reorder threshold.                                                    */
/* ------------------------------------------------------------------ */
import { useState } from "react";
import { C } from "../lib/theme.js";
import { Field, Modal, inputStyle } from "./ui/primitives.jsx";

const toDateInput = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

export default function ProductModal({ product, onSave, onClose }) {
  const [form, setForm] = useState(
    product
      ? { ...product, expiry: toDateInput(product.expiryDate) }
      : { name: "", category: "", unit: "", costPrice: "", sellPrice: "", lowStockThreshold: "", stock: "", expiry: "" }
  );
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.name.trim() || form.sellPrice === "" ) return;
    onSave({
      name: form.name.trim(),
      category: form.category.trim() || "General",
      unit: (form.unit || "").trim() || "pc",
      costPrice: Number(form.costPrice) || 0,
      sellPrice: Number(form.sellPrice) || 0,
      lowStockThreshold: Number(form.lowStockThreshold) || 5,
      // Stock on an existing product is changed through "Adjust stock" so every correction is logged.
      stock: product ? product.stock : Number(form.stock) || 0,
      expiryDate: form.expiry ? new Date(`${form.expiry}T12:00:00`).getTime() : null,
    });
  }
  return (
    <Modal title={product ? "Edit product" : "New product"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} style={inputStyle()} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Category">
            <input value={form.category} onChange={(e) => set("category", e.target.value)} style={inputStyle()} />
          </Field>
          <Field label="Unit">
            <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="pc, kg, bottle…" style={inputStyle()} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cost price (UGX)">
            <input type="number" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} style={inputStyle()} />
          </Field>
          <Field label="Sell price (UGX)">
            <input type="number" value={form.sellPrice} onChange={(e) => set("sellPrice", e.target.value)} style={inputStyle()} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Stock on hand">
            <input type="number" value={product ? product.stock : form.stock} disabled={!!product} onChange={(e) => set("stock", e.target.value)} style={inputStyle()} />
            {product && <span className="block text-[11px] mt-1" style={{ color: C.ink, opacity: 0.5 }}>Change it with “Adjust stock” so the difference is recorded.</span>}
          </Field>
          <Field label="Low stock alert at">
            <input type="number" value={form.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} style={inputStyle()} />
          </Field>
        </div>
        <Field label="Earliest expiry date on the shelf (optional)">
          <input type="date" value={form.expiry} onChange={(e) => set("expiry", e.target.value)} style={inputStyle()} />
        </Field>
        <button onClick={submit} className="w-full rounded-lg py-2.5 text-white font-medium" style={{ background: C.greenDark }}>
          Save product
        </button>
      </div>
    </Modal>
  );
}

