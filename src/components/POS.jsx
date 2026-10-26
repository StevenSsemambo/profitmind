/* ------------------------------------------------------------------ */
/* POS — the till. Cart, stock-capped quantities, cash/momo/credit      */
/* checkout, and a shareable receipt.                                   */
/* ------------------------------------------------------------------ */
import { useState, useMemo } from "react";
import { Search, Plus, Minus, Trash2, Receipt, Share2, Phone } from "lucide-react";
import { C } from "../lib/theme.js";
import { ugx } from "../lib/theme.js";
import { PAYMENT_METHODS } from "../lib/seedData.js";
import { newId } from "../lib/ids.js";
import { Card, Field, Modal, inputStyle } from "./ui/primitives.jsx";

export default function POS({ products, debtors, setDebtors, onCompleteSale, role }) {
  const canEditPrice = role === "admin"; // cashiers can't discount below the listed price
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [debtorId, setDebtorId] = useState("");
  const [amountNow, setAmountNow] = useState("");
  const [showNewDebtor, setShowNewDebtor] = useState(false);
  const [newDebtorName, setNewDebtorName] = useState("");
  const [newDebtorPhone, setNewDebtorPhone] = useState("");
  const [error, setError] = useState("");
  const [editingPriceId, setEditingPriceId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  function addToCart(p) {
    if (p.stock <= 0) return;
    setCart((c) => {
      const existing = c.find((i) => i.productId === p.id);
      if (existing) {
        if (existing.qty >= p.stock) return c; // capped at real stock
        return c.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...c, { productId: p.id, name: p.name, sellPrice: p.sellPrice, listPrice: p.sellPrice, costPrice: p.costPrice, qty: 1 }];
    });
  }

  function changeQty(productId, delta) {
    const live = products.find((p) => p.id === productId);
    const ceiling = live ? live.stock : Infinity;
    setCart((c) =>
      c
        .map((i) => (i.productId === productId ? { ...i, qty: Math.max(0, Math.min(i.qty + delta, ceiling)) } : i))
        .filter((i) => i.qty > 0)
    );
  }

  function updatePrice(productId, newPrice) {
    setCart((c) => c.map((i) => (i.productId === productId ? { ...i, sellPrice: Math.max(0, newPrice) } : i)));
  }

  function removeItem(productId) {
    setCart((c) => c.filter((i) => i.productId !== productId));
  }

  const total = cart.reduce((s, i) => s + i.sellPrice * i.qty, 0);

  function addNewDebtor() {
    if (!newDebtorName.trim()) return;
    const id = newId();
    setDebtors((d) => [...d, { id, name: newDebtorName.trim(), phone: newDebtorPhone.trim(), owed: 0, paid: 0, history: [] }]);
    setDebtorId(String(id));
    setShowNewDebtor(false);
    setNewDebtorName("");
    setNewDebtorPhone("");
  }

  function checkout() {
    setError("");
    if (cart.length === 0) return;
    // One atomic step in App: validates stock + debtor, then updates stock,
    // the debtor's balance and the sales log together (see lib/sales.js).
    const result = onCompleteSale({ cart, paymentMethod, debtorId, amountNow });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLastReceipt(result.receipt);
    setCart([]);
    setPaymentMethod("cash");
    setDebtorId("");
    setAmountNow("");
  }

  function shareReceipt() {
    if (!lastReceipt) return;
    const lines = lastReceipt.items.map((i) => `${i.qty}x ${i.name} — ${ugx(i.sellPrice * i.qty)}`).join("\n");
    const statusLine =
      lastReceipt.paymentMethod === "credit"
        ? `ON CREDIT — ${lastReceipt.debtorName}${lastReceipt.paidNow > 0 ? ` (${ugx(lastReceipt.paidNow)} paid now)` : ""}`
        : lastReceipt.paymentMethod === "momo"
        ? "PAID — MOBILE MONEY"
        : "PAID — CASH";
    const text = `ProfitMind Receipt\n${lines}\n\nTOTAL: ${ugx(lastReceipt.total)}\n${statusLine}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
  }

  return (
    <div className="grid md:grid-cols-5 gap-6">
      <div className="md:col-span-3">
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.ink, opacity: 0.4 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            style={{ ...inputStyle(), paddingLeft: "2.25rem" }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.stock <= 0}
              className="text-left rounded-xl p-3 border disabled:opacity-40 hover:border-current transition-colors"
              style={{ borderColor: C.line, background: C.paperRaised }}
            >
              <p className="font-medium text-sm leading-tight" style={{ color: C.ink }}>{p.name}</p>
              <p className="text-xs mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, opacity: 0.6 }}>
                {ugx(p.sellPrice)}
              </p>
              <p className="text-[11px] mt-1" style={{ color: p.stock <= p.lowStockThreshold ? C.brick : C.ink, opacity: 0.7 }}>
                {p.stock} in stock
              </p>
            </button>
          ))}
          {filtered.length === 0 && <p className="col-span-full text-sm" style={{ color: C.ink, opacity: 0.4 }}>No products match "{query}".</p>}
        </div>
      </div>

      <div className="md:col-span-2">
        <Card className="p-4 mb-4">
          <h3 className="font-medium mb-3" style={{ color: C.ink }}>Current sale</h3>
          {cart.length === 0 && <p className="text-sm" style={{ color: C.ink, opacity: 0.5 }}>No items yet — tap a product to add it.</p>}
          <div className="space-y-2 mb-4">
            {cart.map((i) => {
              const live = products.find((p) => p.id === i.productId);
              const atCeiling = live ? i.qty >= live.stock : false;
              const belowCost = i.sellPrice < i.costPrice;
              return (
                <div key={i.productId}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex-1 truncate" style={{ color: C.ink }}>{i.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeQty(i.productId, -1)} className="p-1 rounded hover:bg-black/5"><Minus size={14} /></button>
                      <span className="w-5 text-center" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{i.qty}</span>
                      <button
                        onClick={() => changeQty(i.productId, 1)}
                        disabled={atCeiling}
                        title={atCeiling ? "No more in stock" : undefined}
                        className="p-1 rounded hover:bg-black/5 disabled:opacity-30"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {canEditPrice && editingPriceId === i.productId ? (
                      <input
                        type="number"
                        autoFocus
                        value={i.sellPrice}
                        onChange={(e) => updatePrice(i.productId, Number(e.target.value))}
                        onBlur={() => setEditingPriceId(null)}
                        onKeyDown={(e) => { if (e.key === "Enter") setEditingPriceId(null); }}
                        className="w-20 text-right"
                        style={{ fontFamily: "'IBM Plex Mono', monospace", border: `1px solid ${C.line}`, borderRadius: "0.25rem", padding: "2px 4px" }}
                      />
                    ) : (
                      <button
                        onClick={() => canEditPrice && setEditingPriceId(i.productId)}
                        className={canEditPrice ? "w-20 text-right hover:underline" : "w-20 text-right cursor-default"}
                        title={canEditPrice ? "Click to adjust price (e.g. give a discount)" : "Only the owner can change prices"}
                        style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}
                      >
                        {ugx(i.sellPrice * i.qty)}
                      </button>
                    )}
                    <button onClick={() => removeItem(i.productId)} className="p-1" style={{ color: C.ink, opacity: 0.4 }}><Trash2 size={14} /></button>
                  </div>
                  {belowCost && (
                    <p className="text-[10px] text-right" style={{ color: C.brick }}>Below cost price ({ugx(i.costPrice)}/unit)</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t pt-3 flex items-center justify-between font-medium mb-4" style={{ borderColor: C.line, color: C.ink }}>
            <span>Total</span>
            <span className="text-lg" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ugx(total)}</span>
          </div>

          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: C.ink, opacity: 0.5 }}>Payment method</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setPaymentMethod(id); setError(""); }}
                className="flex flex-col items-center gap-1 rounded-lg border py-2 text-xs"
                style={{
                  borderColor: paymentMethod === id ? C.goldDark : C.line,
                  background: paymentMethod === id ? "#F4E3D3" : "transparent",
                  color: C.ink,
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          {paymentMethod === "credit" && (
            <div className="mb-3 space-y-2">
              <select value={debtorId} onChange={(e) => { setDebtorId(e.target.value); setError(""); }} style={inputStyle()}>
                <option value="">Who is this sale for?</option>
                {debtors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={() => setShowNewDebtor(true)} className="text-xs hover:underline" style={{ color: C.greenDark }}>
                + New customer
              </button>
              <Field label="Amount received now (optional)">
                <input type="number" value={amountNow} onChange={(e) => setAmountNow(e.target.value)} placeholder="0" style={inputStyle()} />
              </Field>
              {Number(amountNow) > 0 && (
                <p className="text-xs" style={{ color: C.ink, opacity: 0.6 }}>
                  Remaining on credit: {ugx(Math.max(0, total - Number(amountNow)))}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs mb-3" style={{ color: C.brick }}>{error}</p>}

          <button
            onClick={checkout}
            disabled={cart.length === 0}
            className="w-full rounded-lg py-2.5 text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: C.greenDark }}
          >
            <Receipt size={16} /> Complete sale
          </button>
        </Card>

        {lastReceipt && (
          <Card className="p-4 pb-6" style={{ boxShadow: "0 8px 24px -12px rgba(30,42,31,0.35)" }}>
            <p className="text-xs text-center mb-2 tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, opacity: 0.6 }}>RECEIPT</p>
            {lastReceipt.items.map((i, idx) => (
              <div key={idx} className="flex justify-between text-xs py-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>
                <span>{i.qty}x {i.name}</span>
                <span>{ugx(i.sellPrice * i.qty)}</span>
              </div>
            ))}
            <div className="mt-2 pt-2 flex justify-between text-sm font-medium" style={{ borderTop: `1px dashed ${C.line}`, fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>
              <span>TOTAL</span>
              <span>{ugx(lastReceipt.total)}</span>
            </div>
            <p className="text-center text-[11px] mt-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, opacity: 0.6 }}>
              {lastReceipt.paymentMethod === "credit"
                ? `ON CREDIT — ${lastReceipt.debtorName}${lastReceipt.paidNow > 0 ? ` (${ugx(lastReceipt.paidNow)} paid now)` : ""}`
                : lastReceipt.paymentMethod === "momo" ? "PAID — MOBILE MONEY" : "PAID — CASH"}
            </p>
            <button
              onClick={shareReceipt}
              className="w-full mt-4 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 border"
              style={{ borderColor: C.line, color: C.ink }}
            >
              <Share2 size={14} /> Share receipt
            </button>
          </Card>
        )}
      </div>

      {showNewDebtor && (
        <Modal title="New customer" onClose={() => setShowNewDebtor(false)}>
          <div className="space-y-3">
            <Field label="Name">
              <input autoFocus value={newDebtorName} onChange={(e) => setNewDebtorName(e.target.value)} style={inputStyle()} />
            </Field>
            <Field label="Phone (optional)">
              <input value={newDebtorPhone} onChange={(e) => setNewDebtorPhone(e.target.value)} style={inputStyle()} />
            </Field>
            <button onClick={addNewDebtor} className="w-full rounded-lg py-2.5 text-white font-medium" style={{ background: C.greenDark }}>
              Save customer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

