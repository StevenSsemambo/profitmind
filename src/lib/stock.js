/* ------------------------------------------------------------------ */
/* Stock rules — restocking with a weighted-average cost, and stock     */
/* adjustments (counts, damage, expiry, theft) that are logged as       */
/* losses instead of silently editing a number.                         */
/* ------------------------------------------------------------------ */
import { newId } from "./ids.js";

export const ADJUST_REASONS = [
  { id: "count", label: "Stock count correction" },
  { id: "damaged", label: "Damaged / broken" },
  { id: "expired", label: "Expired / spoiled" },
  { id: "missing", label: "Missing / stolen" },
  { id: "own-use", label: "Used by owner / family" },
  { id: "other", label: "Other" },
];

// Receiving a delivery. The cost price becomes a weighted average of what's
// still on the shelf and what just arrived, so older stock isn't re-priced.
export function applyRestock(product, qty, unitCost, expiryDate = null) {
  const q = Number(qty);
  const cost = Math.round(Number(unitCost));
  const oldStock = Math.max(0, product.stock);
  const newStock = product.stock + q;
  const avgCost = oldStock > 0 ? Math.round((oldStock * product.costPrice + q * cost) / (oldStock + q)) : cost;

  let expiry = product.expiryDate || null;
  if (expiryDate) {
    // Track the EARLIEST expiry on the shelf: a later batch must not hide an earlier one.
    if (!expiry || oldStock <= 0 || expiryDate < expiry) expiry = expiryDate;
  }
  return { ...product, stock: newStock, costPrice: avgCost, expiryDate: expiry };
}

// Setting a product's stock to what was actually counted. Anything missing
// is recorded as a loss at cost; extra stock found is recorded as a gain.
export function applyAdjustment(product, counted, reason, { by = "", note = "", now = Date.now() } = {}) {
  const target = Math.floor(Number(counted));
  if (!(target >= 0)) return { ok: false, error: "Enter the quantity you counted (0 or more)." };
  const delta = target - product.stock;
  if (delta === 0) return { ok: false, error: "That matches the stock already recorded — nothing to adjust." };
  const adjustment = {
    id: newId(),
    productId: product.id,
    name: product.name,
    delta,
    costPrice: product.costPrice,
    lossValue: delta < 0 ? -delta * product.costPrice : 0,
    reason,
    note: String(note || "").trim(),
    by,
    date: now,
  };
  return { ok: true, product: { ...product, stock: target }, adjustment };
}
