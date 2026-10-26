/* ------------------------------------------------------------------ */
/* Debtors — credit book: balances, payment history, and per-debtor      */
/* WhatsApp reminders.                                                   */
/* ------------------------------------------------------------------ */
import { useState, useMemo, Fragment } from "react";
import { ChevronDown, ChevronUp, Phone, Search, UserPlus, Pencil, Trash2, CalendarClock } from "lucide-react";
import { C, ugx, fmtDate } from "../lib/theme.js";
import { Card, Field, Modal, EmptyState, inputStyle } from "./ui/primitives.jsx";
import { applyDebtorPayment } from "../lib/sales.js";
import { newId } from "../lib/ids.js";

const toDateInput = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");
const fromDateInput = (v) => (v ? new Date(`${v}T12:00:00`).getTime() : null);

export default function Debtors({ debtors, setDebtors, role }) {
  const isAdmin = role === "admin";
  const [payFor, setPayFor] = useState(null);
  const [amount, setAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payError, setPayError] = useState("");
  const [editor, setEditor] = useState(null); // null | { id?, name, phone, creditLimit, promiseDate }
  const [editError, setEditError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return debtors;
    return debtors.filter((d) => d.name.toLowerCase().includes(q) || (d.phone || "").includes(q));
  }, [debtors, query]);

  const totalOwed = debtors.reduce((s, d) => s + Math.max(0, d.owed - d.paid), 0);

  function recordPayment() {
    if (!payFor) return;
    const r = applyDebtorPayment(payFor, amount, payMethod);
    if (!r.ok) { setPayError(r.error); return; }
    // A payment keeps the promise open only if something is still owed.
    const settled = r.debtor.owed - r.debtor.paid <= 0;
    setDebtors((ds) => ds.map((d) => (d.id === payFor.id ? { ...r.debtor, promiseDate: settled ? null : d.promiseDate || null } : d)));
    setPayFor(null);
    setAmount("");
    setPayError("");
  }

  function saveDebtor() {
    const name = editor.name.trim();
    if (name.length < 2) return setEditError("Enter the customer's name.");
    const limit = Math.max(0, Number(editor.creditLimit) || 0);
    const phone = editor.phone.trim();
    const promiseDate = fromDateInput(editor.promiseDate);
    if (editor.id) {
      setDebtors((ds) => ds.map((d) => (d.id === editor.id ? { ...d, name, phone, creditLimit: limit, promiseDate } : d)));
    } else {
      if (debtors.some((d) => d.name.trim().toLowerCase() === name.toLowerCase())) return setEditError("A customer with that name already exists.");
      setDebtors((ds) => [...ds, { id: newId(), name, phone, owed: 0, paid: 0, creditLimit: limit, promiseDate, history: [] }]);
    }
    setEditor(null);
    setEditError("");
  }

  function deleteDebtor(id) {
    setDebtors((ds) => ds.filter((d) => d.id !== id));
    setConfirmDeleteId(null);
  }

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: C.ink, opacity: 0.6 }}>
        Customers buying on credit — <strong style={{ color: C.brick }}>{ugx(totalOwed)}</strong> owed to the business right now.
      </p>
      {isAdmin && (
        <button
          onClick={() => { setEditor({ name: "", phone: "", creditLimit: "", promiseDate: "" }); setEditError(""); }}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border mb-3"
          style={{ borderColor: C.line, color: C.ink }}
        >
          <UserPlus size={14} /> Add customer
        </button>
      )}
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
                      {(d.creditLimit > 0 || (d.promiseDate && balance > 0)) && (
                        <p className="text-[11px] font-normal mt-0.5 ml-5" style={{ color: d.promiseDate && balance > 0 && d.promiseDate < Date.now() - 86400000 ? C.brick : C.ink, opacity: 0.65 }}>
                          {d.creditLimit > 0 ? `Limit ${ugx(d.creditLimit)}` : ""}
                          {d.creditLimit > 0 && d.promiseDate && balance > 0 ? " · " : ""}
                          {d.promiseDate && balance > 0 ? (
                            <span className="inline-flex items-center gap-1"><CalendarClock size={10} /> Promised {fmtDate(d.promiseDate)}</span>
                          ) : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: C.ink, opacity: 0.6 }}>
                      {d.phone ? <span className="inline-flex items-center gap-1"><Phone size={12} />{d.phone}</span> : "—"}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, opacity: 0.6 }}>{ugx(d.owed)}</td>
                    <td className="px-4 py-3 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, opacity: 0.6 }}>{ugx(d.paid)}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace", color: balance > 0 ? C.brick : balance < 0 ? C.greenDark : C.ink }}>
                      {balance > 0 ? ugx(balance) : balance < 0 ? `Credit ${ugx(-balance)}` : "Settled"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => { setPayFor(d); setAmount(""); setPayMethod("cash"); setPayError(""); }}
                        disabled={balance <= 0}
                        className="text-xs hover:underline disabled:opacity-30 disabled:no-underline"
                        style={{ color: C.greenDark }}
                      >
                        Record payment
                      </button>
                      {isAdmin && (
                        <>
                          <button onClick={() => { setEditor({ id: d.id, name: d.name, phone: d.phone || "", creditLimit: d.creditLimit || "", promiseDate: toDateInput(d.promiseDate) }); setEditError(""); }} className="ml-3 p-1" title="Edit" style={{ color: C.ink, opacity: 0.5 }}>
                            <Pencil size={13} />
                          </button>
                          {balance === 0 && (confirmDeleteId === d.id ? (
                            <button onClick={() => deleteDebtor(d.id)} className="ml-1 text-[11px]" style={{ color: C.brick }}>Confirm</button>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(d.id)} className="ml-1 p-1" title="Delete (only when settled)" style={{ color: C.ink, opacity: 0.4 }}>
                              <Trash2 size={13} />
                            </button>
                          ))}
                        </>
                      )}
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
                                  {fmtDate(h.date)} — {h.type === "credit-sale" ? "Credit sale" : h.type === "void" ? "Sale voided" : `Payment received${h.method === "momo" ? " (mobile money)" : ""}`}
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
          <div className="space-y-3">
            <Field label="Amount received (UGX)">
              <input autoFocus type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setPayError(""); }} style={inputStyle()} />
            </Field>
            <Field label="Received as">
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={inputStyle()}>
                <option value="cash">Cash</option>
                <option value="momo">Mobile money</option>
              </select>
            </Field>
            {payError && <p className="text-xs" style={{ color: C.brick }}>{payError}</p>}
            <button onClick={recordPayment} className="w-full rounded-lg py-2.5 text-white font-medium" style={{ background: C.greenDark }}>
              Save payment
            </button>
          </div>
        </Modal>
      )}

      {editor && (
        <Modal title={editor.id ? "Edit customer" : "Add customer"} onClose={() => setEditor(null)}>
          <div className="space-y-3">
            <Field label="Name"><input autoFocus value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Phone (for WhatsApp reminders)"><input value={editor.phone} onChange={(e) => setEditor({ ...editor, phone: e.target.value })} placeholder="e.g. 0772123456" style={inputStyle()} /></Field>
            <Field label="Credit limit (UGX, 0 = no limit)"><input type="number" value={editor.creditLimit} onChange={(e) => setEditor({ ...editor, creditLimit: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Promised to pay by (optional)"><input type="date" value={editor.promiseDate} onChange={(e) => setEditor({ ...editor, promiseDate: e.target.value })} style={inputStyle()} /></Field>
            {editError && <p className="text-xs" style={{ color: C.brick }}>{editError}</p>}
            <button onClick={saveDebtor} className="w-full rounded-lg py-2.5 text-white font-medium" style={{ background: C.greenDark }}>Save customer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
