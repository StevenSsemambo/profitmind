/* ------------------------------------------------------------------ */
/* Sales — one pure function that validates and applies a checkout in   */
/* a single step, so stock, debtor balance and the sales log can never  */
/* drift apart. No React, no DOM — unit tested in sales.test.js.        */
/* ------------------------------------------------------------------ */
import { newId } from "./ids.js";

export function applySale({ products, debtors, cart, paymentMethod, debtorId, amountNow, by = "", now = Date.now() }) {
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

  if (isCredit && debtor.creditLimit > 0) {
    const after = debtor.owed - debtor.paid + total - paidNow;
    if (after > debtor.creditLimit) {
      return {
        ok: false,
        error: `${debtor.name}'s credit limit is ${debtor.creditLimit.toLocaleString("en-UG")} UGX — this sale would take them to ${after.toLocaleString("en-UG")}. Take a payment first or ask the owner to raise the limit.`,
      };
    }
  }

  const nextProducts = products.map((p) => {
    const line = cart.find((i) => i.productId === p.id);
    return line ? { ...p, stock: p.stock - line.qty } : p;
  });

  let nextDebtors = debtors;
  if (isCredit) {
    nextDebtors = debtors.map((d) => {
      if (d.id !== debtor.id) return d;
      const history = [...(d.history || []), { type: "credit-sale", amount: total, date: now }];
      if (paidNow > 0) history.push({ type: "payment", amount: paidNow, date: now, method: "cash", atSale: true, note: "Paid at time of sale" });
      return { ...d, owed: d.owed + total, paid: d.paid + paidNow, history };
    });
  }

  const sale = {
    id: newId(),
    total,
    cost: totalCost,
    profit: total - totalCost,
    paymentMethod,
    items: cart.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, sellPrice: i.sellPrice, costPrice: i.costPrice, listPrice: i.listPrice ?? i.sellPrice })),
    // Discount = how far the till price was pushed below the listed price.
    discount: cart.reduce((sum, i) => sum + Math.max(0, (i.listPrice ?? i.sellPrice) - i.sellPrice) * i.qty, 0),
    by,
    debtorId: isCredit ? debtor.id : null,
    paidNow,
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

/* ------------------------------------------------------------------ */
/* Voiding a sale — puts the stock back, reverses any credit charged,   */
/* and keeps the record (struck through, with who/why) so nothing can   */
/* quietly disappear. Voided sales are excluded from all totals.        */
/* ------------------------------------------------------------------ */
export function applyVoid({ products, debtors, sales, saleId, by = "", reason, now = Date.now() }) {
  const sale = sales.find((s) => s.id === saleId);
  if (!sale) return { ok: false, error: "Sale not found." };
  if (sale.voided) return { ok: false, error: "This sale is already voided." };
  const why = String(reason || "").trim();
  if (why.length < 3) return { ok: false, error: "Please give a short reason for voiding this sale." };
  if (sale.paymentMethod === "credit" && !sale.debtorId) {
    return { ok: false, error: "This older credit sale doesn't record which customer it was for, so it can't be reversed automatically. Adjust the customer's balance by hand." };
  }

  const nextProducts = products.map((p) => {
    const line = (sale.items || []).find((i) => i.productId === p.id);
    return line ? { ...p, stock: p.stock + line.qty } : p;
  });

  let nextDebtors = debtors;
  if (sale.paymentMethod === "credit") {
    nextDebtors = debtors.map((d) => {
      if (d.id !== sale.debtorId) return d;
      return {
        ...d,
        owed: d.owed - sale.total,
        paid: d.paid - (sale.paidNow || 0),
        history: [...(d.history || []), { type: "void", amount: sale.total, date: now, note: why }],
      };
    });
  }

  const nextSales = sales.map((s) => (s.id === saleId ? { ...s, voided: { at: now, by, reason: why } } : s));
  return { ok: true, products: nextProducts, debtors: nextDebtors, sales: nextSales };
}

/* ------------------------------------------------------------------ */
/* Recording a payment from a debtor — can't exceed what they owe.      */
/* ------------------------------------------------------------------ */
export function applyDebtorPayment(debtor, amount, method = "cash", now = Date.now()) {
  const amt = Number(amount);
  if (!(amt > 0)) return { ok: false, error: "Enter an amount above zero." };
  const balance = debtor.owed - debtor.paid;
  if (balance <= 0) return { ok: false, error: `${debtor.name} doesn't owe anything.` };
  if (amt > balance) return { ok: false, error: `That's more than they owe (${balance.toLocaleString("en-UG")} UGX).` };
  return {
    ok: true,
    debtor: {
      ...debtor,
      paid: debtor.paid + amt,
      history: [...(debtor.history || []), { type: "payment", amount: amt, date: now, method }],
    },
  };
}
