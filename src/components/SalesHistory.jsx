/* ------------------------------------------------------------------ */
/* Sales history — every sale, with who rang it up, and the ability to  */
/* void a mistake (stock goes back, credit is reversed, reason kept).   */
/* Cashiers see today only; the owner sees everything.                  */
/* ------------------------------------------------------------------ */
import { useState, useMemo } from "react";
import { Ban, Tag } from "lucide-react";
import { C, ugx } from "../lib/theme.js";
import { startOfDay } from "../lib/finance.js";
import { Card, Field, Modal, EmptyState, inputStyle } from "./ui/primitives.jsx";

const fmtTime = (ms) => new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const METHOD = { cash: "Cash", momo: "Mobile money", credit: "Credit" };

export default function SalesHistory({ sales, role, onVoid }) {
  const isAdmin = role === "admin";
  const [range, setRange] = useState("today");
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const rows = useMemo(() => {
    const today = startOfDay(Date.now());
    const from = !isAdmin || range === "today" ? today : range === "week" ? today - 6 * 86400000 : 0;
    return sales.filter((s) => s.date >= from).sort((a, b) => b.date - a.date).slice(0, 200);
  }, [sales, range, isAdmin]);

  function confirmVoid() {
    const r = onVoid(target.id, reason);
    if (!r.ok) { setError(r.error); return; }
    setTarget(null); setReason(""); setError("");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm" style={{ color: C.ink, opacity: 0.6 }}>
          {isAdmin ? "Every sale, newest first. Made a mistake? Void it — the record is kept." : "Today's sales. Rang something up wrongly? Void it and ring it up again."}
        </p>
        {isAdmin && (
          <select value={range} onChange={(e) => setRange(e.target.value)} style={{ ...inputStyle(), width: "auto" }}>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="all">All (latest 200)</option>
          </select>
        )}
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState text="No sales in this period yet." />
        ) : (
          rows.map((s) => (
            <div key={s.id} className="px-4 py-3 border-t first:border-t-0" style={{ borderColor: C.line, opacity: s.voided ? 0.55 : 1 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: C.ink, textDecoration: s.voided ? "line-through" : "none" }}>
                    {(s.items || []).map((i) => `${i.qty}× ${i.name}`).join(", ") || "Sale"}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: C.ink, opacity: 0.55 }}>
                    {fmtTime(s.date)} · {METHOD[s.paymentMethod] || s.paymentMethod}{s.by ? ` · ${s.by}` : ""}
                  </p>
                  {s.discount > 0 && (
                    <p className="text-[11px] mt-0.5 inline-flex items-center gap-1" style={{ color: C.goldDark }}>
                      <Tag size={11} /> Discount given: {ugx(s.discount)}
                    </p>
                  )}
                  {s.voided && (
                    <p className="text-[11px] mt-0.5" style={{ color: C.brick }}>
                      Voided {fmtTime(s.voided.at)}{s.voided.by ? ` by ${s.voided.by}` : ""} — {s.voided.reason}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink, textDecoration: s.voided ? "line-through" : "none" }}>{ugx(s.total)}</p>
                  {!s.voided && (
                    <button onClick={() => { setTarget(s); setReason(""); setError(""); }} className="mt-1 text-[11px] inline-flex items-center gap-1 hover:underline" style={{ color: C.brick }}>
                      <Ban size={11} /> Void
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      {target && (
        <Modal title="Void this sale?" onClose={() => setTarget(null)}>
          <p className="text-sm mb-3" style={{ color: C.ink, opacity: 0.7 }}>
            {(target.items || []).map((i) => `${i.qty}× ${i.name}`).join(", ")} — {ugx(target.total)}. The items go back into stock
            {target.paymentMethod === "credit" ? " and the customer's balance is reduced" : ""}. The sale stays in the list, marked as voided.
          </p>
          <Field label="Reason (required)">
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong item, customer changed mind" style={inputStyle()} />
          </Field>
          {error && <p className="text-xs mt-2" style={{ color: C.brick }}>{error}</p>}
          <button onClick={confirmVoid} disabled={reason.trim().length < 3} className="w-full mt-3 rounded-lg py-2.5 text-white font-medium disabled:opacity-40" style={{ background: C.brick }}>
            Void sale
          </button>
        </Modal>
      )}
    </div>
  );
}
