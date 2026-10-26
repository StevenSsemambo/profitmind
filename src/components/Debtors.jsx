/* ------------------------------------------------------------------ */
/* Debtors — credit book: balances, payment history, and per-debtor      */
/* WhatsApp reminders.                                                   */
/* ------------------------------------------------------------------ */
import { useState, useMemo, Fragment } from "react";
import { ChevronDown, ChevronUp, Phone, Search } from "lucide-react";
import { C, ugx, fmtDate } from "../lib/theme.js";
import { Card, Field, Modal, EmptyState, inputStyle } from "./ui/primitives.jsx";

export default function Debtors({ debtors, setDebtors }) {
  const [payFor, setPayFor] = useState(null);
  const [amount, setAmount] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return debtors;
    return debtors.filter((d) => d.name.toLowerCase().includes(q) || (d.phone || "").includes(q));
  }, [debtors, query]);

  const totalOwed = debtors.reduce((s, d) => s + Math.max(0, d.owed - d.paid), 0);

  function recordPayment() {
    if (!payFor || !amount) return;
    const amt = Number(amount);
    setDebtors((ds) => ds.map((d) => (
      d.id === payFor.id
        ? { ...d, paid: d.paid + amt, history: [...(d.history || []), { type: "payment", amount: amt, date: Date.now() }] }
        : d
    )));
    setPayFor(null);
    setAmount("");
  }

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: C.ink, opacity: 0.6 }}>
        Customers buying on credit — <strong style={{ color: C.brick }}>{ugx(totalOwed)}</strong> owed to the business right now.
      </p>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.ink, opacity: 0.4 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers by name or phone…"
          style={{ ...inputStyle(), paddingLeft: "2.25rem" }}
        />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ background: C.paperRaised, color: C.ink, opacity: 0.5 }}>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3 text-right">Owed</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const balance = d.owed - d.paid;
              const isOpen = expanded === d.id;
              const history = [...(d.history || [])].sort((a, b) => b.date - a.date);
              return (
                <Fragment key={d.id}>
                  <tr className="border-t" style={{ borderColor: C.line }}>
                    <td className="px-4 py-3 font-medium" style={{ color: C.ink }}>
                      <button onClick={() => setExpanded(isOpen ? null : d.id)} className="flex items-center gap-1.5">
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {d.name}
                      </button>
                    </td>
                    <td className="px-4 py-3" style={{ color: C.ink, opacity: 0.6 }}>
                      {d.phone ? <span className="inline-flex items-center gap-1"><Phone size={12} />{d.phone}</span> : "—"}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, opacity: 0.6 }}>{ugx(d.owed)}</td>
                    <td className="px-4 py-3 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, opacity: 0.6 }}>{ugx(d.paid)}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace", color: balance > 0 ? C.brick : balance < 0 ? C.greenDark : C.ink }}>
                      {balance > 0 ? ugx(balance) : balance < 0 ? `Credit ${ugx(-balance)}` : "Settled"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setPayFor(d)}
                        disabled={balance <= 0}
                        className="text-xs hover:underline disabled:opacity-30 disabled:no-underline"
                        style={{ color: C.greenDark }}
                      >
                        Record payment
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ borderColor: C.line }} className="border-t">
                      <td colSpan={6} className="px-4 py-3" style={{ background: C.paper }}>
                        {history.length === 0 ? (
                          <p className="text-xs" style={{ color: C.ink, opacity: 0.5 }}>No transaction history yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {history.map((h, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span style={{ color: C.ink, opacity: 0.6 }}>
                                  {fmtDate(h.date)} — {h.type === "credit-sale" ? "Credit sale" : "Payment received"}
                                  {h.note ? ` (${h.note})` : ""}
                                </span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: h.type === "credit-sale" ? C.brick : C.greenDark }}>
                                  {h.type === "credit-sale" ? "+" : "-"}{ugx(h.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6}><EmptyState text={`No customers match "${query}".`} /></td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {payFor && (
        <Modal title="Record payment" onClose={() => setPayFor(null)}>
          <p className="text-sm mb-4" style={{ color: C.ink, opacity: 0.6 }}>{payFor.name} owes {ugx(payFor.owed - payFor.paid)}</p>
          <Field label="Amount received (UGX)">
            <input autoFocus type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle()} />
          </Field>
          <button onClick={recordPayment} className="w-full mt-3 rounded-lg py-2.5 text-white font-medium" style={{ background: C.greenDark }}>
            Save payment
          </button>
        </Modal>
      )}
    </div>
  );
}

