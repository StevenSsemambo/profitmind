/* ------------------------------------------------------------------ */
/* Money — the owner's view of the shop's real finances: true profit    */
/* after expenses, the end-of-day cash count, running costs, and what   */
/* the shop still owes its suppliers.                                   */
/* ------------------------------------------------------------------ */
import { useState, useMemo } from "react";
import { Wallet, Receipt, Truck, Trash2 } from "lucide-react";
import { C, ugx, fmtDate } from "../lib/theme.js";
import { newId } from "../lib/ids.js";
import { EXPENSE_CATEGORIES, periodFinance, cashExpectedForDay, supplierBalances, startOfDay, dayKey } from "../lib/finance.js";
import { Card, Field, Modal, KpiCard, EmptyState, inputStyle } from "./ui/primitives.jsx";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const METHODS = [{ id: "cash", label: "Cash" }, { id: "momo", label: "Mobile money" }, { id: "bank", label: "Bank" }];

function Row({ label, value, sign, bold }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-0.5" style={{ color: C.ink, fontWeight: bold ? 600 : 400 }}>
      <span className="min-w-0" style={{ opacity: bold ? 1 : 0.65 }}>{sign ? `${sign} ` : ""}{label}</span>
      <span className="whitespace-nowrap shrink-0" style={mono}>{ugx(value)}</span>
    </div>
  );
}

export default function MoneyPage({ sales, debtors, purchases, expenses, setExpenses, cashups, setCashups, adjustments, supplierPayments, setSupplierPayments, userName }) {
  const now = Date.now();
  const today = startOfDay(now);
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();

  const month = useMemo(() => periodFinance({ sales, expenses, adjustments, start: monthStart, end: today + 86400000 }), [sales, expenses, adjustments, monthStart, today]);
  const todayFin = useMemo(() => periodFinance({ sales, expenses, adjustments, start: today, end: today + 86400000 }), [sales, expenses, adjustments, today]);

  // ---------- Cash-up ----------
  const lastCashup = [...cashups].sort((a, b) => b.date - a.date)[0];
  const todaysCashup = cashups.find((c) => c.day === dayKey(now));
  const [floatStr, setFloatStr] = useState(todaysCashup ? String(todaysCashup.float) : lastCashup ? String(lastCashup.counted) : "0");
  const [counted, setCounted] = useState("");
  const [cashNote, setCashNote] = useState("");
  const cash = useMemo(
    () => cashExpectedForDay({ sales, debtors, expenses, supplierPayments, purchases, dayStart: today, float: Number(floatStr) || 0 }),
    [sales, debtors, expenses, supplierPayments, purchases, today, floatStr]
  );
  const diff = counted === "" ? null : Number(counted) - cash.expected;

  function saveCashup() {
    if (counted === "" || Number(counted) < 0) return;
    const rec = { id: newId(), date: now, day: dayKey(now), float: Number(floatStr) || 0, expected: cash.expected, counted: Number(counted), diff: Number(counted) - cash.expected, by: userName, note: cashNote.trim() };
    setCashups((cs) => [...cs.filter((c) => c.day !== rec.day), rec]);
    setCounted(""); setCashNote("");
  }

  // ---------- Expenses ----------
  const [exp, setExp] = useState({ category: EXPENSE_CATEGORIES[0], amount: "", method: "cash", note: "" });
  const [confirmDel, setConfirmDel] = useState(null);
  const monthExpenses = expenses.filter((e) => e.date >= monthStart).sort((a, b) => b.date - a.date);
  const byCat = useMemo(() => {
    const m = {};
    monthExpenses.forEach((e) => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  function addExpense() {
    const amount = Number(exp.amount);
    if (!(amount > 0)) return;
    setExpenses((es) => [...es, { id: newId(), date: Date.now(), category: exp.category, amount, method: exp.method, note: exp.note.trim(), by: userName }]);
    setExp({ ...exp, amount: "", note: "" });
  }

  // ---------- Suppliers ----------
  const owed = useMemo(() => supplierBalances(purchases, supplierPayments), [purchases, supplierPayments]);
  const totalOwed = owed.reduce((t, s) => t + s.owed, 0);
  const [payTo, setPayTo] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payErr, setPayErr] = useState("");

  function paySupplier() {
    const amt = Number(payAmt);
    if (!(amt > 0)) return setPayErr("Enter an amount above zero.");
    if (amt > payTo.owed) return setPayErr(`That's more than you owe them (${ugx(payTo.owed)}).`);
    setSupplierPayments((ps) => [...ps, { id: newId(), supplier: payTo.supplier, amount: amt, method: payMethod, date: Date.now(), by: userName }]);
    setPayTo(null); setPayAmt(""); setPayErr("");
  }

  const recentCashups = [...cashups].sort((a, b) => b.date - a.date).slice(0, 7);

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: C.ink, opacity: 0.6 }}>
        The shop's real money: what's left after running costs, what should be in the till, and what you still owe.
      </p>

      {/* True profit */}
      <div>
        <h3 className="font-medium mb-2" style={{ color: C.ink }}>This month</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <KpiCard label="Sales" value={ugx(month.revenue)} />
          <KpiCard label="Gross profit" value={ugx(month.gross)} />
          <KpiCard label="Expenses + losses" value={ugx(month.expensesTotal + month.stockLoss)} accent={C.brick} />
          <KpiCard label="Net profit" value={ugx(month.net)} accent={month.net >= 0 ? C.greenDark : C.brick} />
        </div>
        <Card className="p-4">
          <Row label="Gross profit (sales minus cost of goods)" value={month.gross} />
          <Row label="Running expenses" value={month.expensesTotal} sign="−" />
          <Row label="Stock lost (damaged, expired, missing)" value={month.stockLoss} sign="−" />
          <div className="border-t my-2" style={{ borderColor: C.line }} />
          <Row label="Net profit" value={month.net} bold />
          <p className="text-[11px] mt-2" style={{ color: C.ink, opacity: 0.5 }}>
            Today so far: net {ugx(todayFin.net)} on {ugx(todayFin.revenue)} of sales. Debtors' unpaid balances are not cash yet — see Debtors.
          </p>
        </Card>
      </div>

      {/* Cash-up */}
      <Card className="p-4">
        <h3 className="font-medium mb-1 flex items-center gap-2" style={{ color: C.ink }}><Wallet size={16} /> Cash count — today</h3>
        <p className="text-xs mb-3" style={{ color: C.ink, opacity: 0.55 }}>Count the drawer at closing. ProfitMind works out what should be there; any gap is recorded.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Field label="Cash in the drawer when you opened (UGX)">
              <input type="number" value={floatStr} onChange={(e) => setFloatStr(e.target.value)} style={inputStyle()} />
            </Field>
            <div className="mt-3">
              <Row label="Opening cash" value={Number(floatStr) || 0} />
              <Row label="Cash sales" value={cash.cashSales} sign="+" />
              <Row label="Paid at time of credit sale" value={cash.creditDown} sign="+" />
              <Row label="Debtors paid in cash" value={cash.debtorCash} sign="+" />
              <Row label="Expenses paid in cash" value={cash.expensesCash} sign="−" />
              <Row label="Suppliers paid in cash" value={cash.supplierCash} sign="−" />
              <div className="border-t my-2" style={{ borderColor: C.line }} />
              <Row label="Should be in the drawer" value={cash.expected} bold />
              <p className="text-[11px] mt-1" style={{ color: C.ink, opacity: 0.5 }}>Mobile money received today: {ugx(cash.momoReceived)} — compare with your mobile money statement.</p>
            </div>
          </div>
          <div>
            <Field label="Cash you actually counted (UGX)">
              <input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} style={inputStyle()} />
            </Field>
            {diff !== null && (
              <p className="text-sm mt-2" style={{ color: diff === 0 ? C.greenDark : C.brick }}>
                {diff === 0 ? "Perfect — the drawer matches." : diff < 0 ? `Short by ${ugx(-diff)}.` : `Over by ${ugx(diff)}.`}
              </p>
            )}
            <div className="mt-3">
              <Field label="Note (optional)">
                <input value={cashNote} onChange={(e) => setCashNote(e.target.value)} placeholder="e.g. gave change from own pocket" style={inputStyle()} />
              </Field>
            </div>
            <button onClick={saveCashup} disabled={counted === ""} className="w-full mt-3 rounded-lg py-2.5 text-white text-sm disabled:opacity-40" style={{ background: C.greenDark }}>
              {todaysCashup ? "Update today's count" : "Save today's count"}
            </button>
          </div>
        </div>
        {recentCashups.length > 0 && (
          <div className="mt-4 border-t pt-3" style={{ borderColor: C.line }}>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: C.ink, opacity: 0.5 }}>Recent counts</p>
            {recentCashups.map((c) => (
              <div key={c.id} className="flex justify-between text-xs py-0.5" style={{ color: C.ink }}>
                <span style={{ opacity: 0.65 }}>{fmtDate(c.date)}{c.by ? ` · ${c.by}` : ""}{c.note ? ` · ${c.note}` : ""}</span>
                <span style={{ ...mono, color: c.diff === 0 ? C.greenDark : C.brick }}>{c.diff === 0 ? "balanced" : c.diff < 0 ? `short ${ugx(-c.diff)}` : `over ${ugx(c.diff)}`}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Expenses */}
      <Card className="p-4">
        <h3 className="font-medium mb-1 flex items-center gap-2" style={{ color: C.ink }}><Receipt size={16} /> Expenses</h3>
        <p className="text-xs mb-3" style={{ color: C.ink, opacity: 0.55 }}>Rent, wages, power, transport, airtime, mobile money fees — anything the shop pays to keep running. Don't enter stock purchases here; use Stock.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <Field label="Type">
            <select value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })} style={inputStyle()}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount (UGX)">
            <input type="number" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} style={inputStyle()} />
          </Field>
          <Field label="Paid with">
            <select value={exp.method} onChange={(e) => setExp({ ...exp, method: e.target.value })} style={inputStyle()}>
              {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Note">
            <input value={exp.note} onChange={(e) => setExp({ ...exp, note: e.target.value })} style={inputStyle()} />
          </Field>
        </div>
        <button onClick={addExpense} disabled={!(Number(exp.amount) > 0)} className="text-sm px-4 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: C.greenDark }}>
          Add expense
        </button>

        {byCat.length > 0 && (
          <div className="mt-4 text-xs" style={{ color: C.ink }}>
            <p className="uppercase tracking-wide mb-1" style={{ opacity: 0.5 }}>This month by type</p>
            {byCat.map(([cat, amt]) => (
              <div key={cat} className="flex justify-between py-0.5"><span style={{ opacity: 0.7 }}>{cat}</span><span style={mono}>{ugx(amt)}</span></div>
            ))}
          </div>
        )}
        <div className="mt-3">
          {monthExpenses.length === 0 ? <EmptyState text="No expenses recorded this month." /> : monthExpenses.slice(0, 15).map((e) => (
            <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-t" style={{ borderColor: C.line, color: C.ink }}>
              <span style={{ opacity: 0.75 }}>{fmtDate(e.date)} · {e.category}{e.note ? ` — ${e.note}` : ""} · {(METHODS.find((m) => m.id === e.method) || {}).label}</span>
              <span className="flex items-center gap-2">
                <span style={mono}>{ugx(e.amount)}</span>
                {confirmDel === e.id ? (
                  <button onClick={() => { setExpenses((es) => es.filter((x) => x.id !== e.id)); setConfirmDel(null); }} className="text-[11px]" style={{ color: C.brick }}>Confirm</button>
                ) : (
                  <button onClick={() => setConfirmDel(e.id)} title="Delete" style={{ color: C.ink, opacity: 0.4 }}><Trash2 size={12} /></button>
                )}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Suppliers */}
      <Card className="p-4">
        <h3 className="font-medium mb-1 flex items-center gap-2" style={{ color: C.ink }}><Truck size={16} /> Owed to suppliers</h3>
        <p className="text-xs mb-3" style={{ color: C.ink, opacity: 0.55 }}>Deliveries you took on credit show up here when you record them in Stock with a part payment.</p>
        {owed.length === 0 ? (
          <EmptyState text="You don't owe any supplier right now." />
        ) : (
          <>
            <p className="text-sm mb-2" style={{ color: C.brick }}>Total owed: <strong>{ugx(totalOwed)}</strong></p>
            {owed.map((s) => (
              <div key={s.supplier} className="flex items-center justify-between py-2 border-t text-sm" style={{ borderColor: C.line, color: C.ink }}>
                <span>{s.supplier}</span>
                <span className="flex items-center gap-3">
                  <span style={{ ...mono, color: C.brick }}>{ugx(s.owed)}</span>
                  <button onClick={() => { setPayTo(s); setPayAmt(""); setPayErr(""); }} className="text-xs hover:underline" style={{ color: C.greenDark }}>Record payment</button>
                </span>
              </div>
            ))}
          </>
        )}
      </Card>

      {payTo && (
        <Modal title={`Pay ${payTo.supplier}`} onClose={() => setPayTo(null)}>
          <p className="text-sm mb-3" style={{ color: C.ink, opacity: 0.65 }}>You owe {ugx(payTo.owed)}.</p>
          <div className="space-y-3">
            <Field label="Amount paid (UGX)"><input autoFocus type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} style={inputStyle()} /></Field>
            <Field label="Paid with">
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={inputStyle()}>
                {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            {payErr && <p className="text-xs" style={{ color: C.brick }}>{payErr}</p>}
            <button onClick={paySupplier} className="w-full rounded-lg py-2.5 text-white font-medium" style={{ background: C.greenDark }}>Save payment</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
