/* ------------------------------------------------------------------ */
/* Sales — one pure function that validates and applies a checkout in   */
/* a single step, so stock, debtor balance and the sales log can never  */
/* drift apart. No React, no DOM — unit tested in sales.test.js.        */
/* ------------------------------------------------------------------ */
import { newId } from "./ids.js";

export function applySale({ products, debtors, cart, paymentMethod, debtorId, amountNow, now = Date.now() }) {
  if (!cart || cart.length === 0) return { ok: false, error: "Cart is empty." };

  const isCredit = paymentMethod === "credit";
  let debtor = null;
  if (isCredit) {
    if (!debtorId) return { ok: false, error: "Pick who this credit sale is for before completing it." };
    debtor = debtors.find((d) => d.id === Number(debtorId));
    if (!debtor) return { ok: false, error: "That customer no longer exists — pick the debtor again." };
  }

  // Validate every line against live stock before changing anything.
  for (const item of cart) {
    const live = products.find((p) => p.id === item.productId);
    if (!live) return { ok: false, error: `${item.name} is no longer in stock records.` };
    if (!(item.qty > 0)) return { ok: false, error: `Invalid quantity for ${item.name}.` };
    if (live.stock < item.qty) return { ok: false, error: `Not enough stock for ${item.name} — only ${live.stock} left.` };
    if (!(item.sellPrice >= 0)) return { ok: false, error: `Invalid price for ${item.name}.` };
  }

  const total = cart.reduce((s, i) => s + i.sellPrice * i.qty, 0);
  const totalCost = cart.reduce((s, i) => s + i.costPrice * i.qty, 0);
  const paidNow = isCredit ? Math.max(0, Math.min(Number(amountNow) || 0, total)) : 0;

  const nextProducts = products.map((p) => {
    const line = cart.find((i) => i.productId === p.id);
    return line ? { ...p, stock: p.stock - line.qty } : p;
  });

  let nextDebtors = debtors;
  if (isCredit) {
    nextDebtors = debtors.map((d) => {
      if (d.id !== debtor.id) return d;
      const history = [...(d.history || []), { type: "credit-sale", amount: total, date: now }];
      if (paidNow > 0) history.push({ type: "payment", amount: paidNow, date: now, note: "Paid at time of sale" });
      return { ...d, owed: d.owed + total, paid: d.paid + paidNow, history };
    });
  }

  const sale = {
    id: newId(),
    total,
    cost: totalCost,
    profit: total - totalCost,
    paymentMethod,
    items: cart.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, sellPrice: i.sellPrice, costPrice: i.costPrice })),
    date: now,
  };

  return {
    ok: true,
    products: nextProducts,
    debtors: nextDebtors,
    sale,
    receipt: { items: cart, total, paymentMethod, debtorName: debtor ? debtor.name : null, paidNow, date: now },
  };
}
