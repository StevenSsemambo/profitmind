/* ------------------------------------------------------------------ */
/* ProductModal — add/edit a product's name, category, pricing, and     */
/* reorder threshold.                                                    */
/* ------------------------------------------------------------------ */
import { useState } from "react";
import { C } from "../lib/theme.js";
import { Field, Modal, inputStyle } from "./ui/primitives.jsx";

export default function ProductModal({ product, onSave, onClose }) {
  const [form, setForm] = useState(
    product
      ? { ...product }
      : { name: "", category: "", unit: "", costPrice: "", sellPrice: "", lowStockThreshold: "", stock: "" }
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
      stock: Number(form.stock) || 0,
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
            <input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} style={inputStyle()} />
          </Field>
          <Field label="Low stock alert at">
            <input type="number" value={form.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} style={inputStyle()} />
          </Field>
        </div>
        <button onClick={submit} className="w-full rounded-lg py-2.5 text-white font-medium" style={{ background: C.greenDark }}>
          Save product
        </button>
      </div>
    </Modal>
  );
}

