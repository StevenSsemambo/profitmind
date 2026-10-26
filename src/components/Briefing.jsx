/* ------------------------------------------------------------------ */
/* Briefing — the Advisor's proactive panel: forecast stockouts,        */
/* debtors to follow up, and slow-moving stock, each with a one-tap      */
/* action. Reorders are delay-committed with an undo window; reminders   */
/* and supplier messages are outbound WhatsApp text with nothing to      */
/* undo, so they commit immediately.                                     */
/* ------------------------------------------------------------------ */
import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, PackagePlus, AlertTriangle, HandCoins, Send } from "lucide-react";
import { C, ugx } from "../lib/theme.js";
import { buildInsights } from "../lib/intelligence.js";
import { Card } from "./ui/primitives.jsx";
import InsightSection from "./InsightSection.jsx";

const REORDER_UNDO_MS = 6000;

// Proactive briefing — surfaces what the Advisor knows without being asked,
// with one-tap actions (confirm reorder / send reminder) to close the loop.
// Reorders are delay-committed so a fat-fingered tap can be undone before it
// ever touches stock or purchase history; debtor reminders and supplier
// messages are just outbound WhatsApp text, so there's nothing there to undo.
export default function Briefing({ products, sales, debtors, purchases, onConfirmReorder }) {
  const insights = useMemo(() => buildInsights(products, sales, debtors, purchases), [products, sales, debtors, purchases]);
  const { reorderDrafts, slowMoving, debtorRisk, anomalies } = insights;
  const [confirmedIds, setConfirmedIds] = useState([]);
  const [remindedIds, setRemindedIds] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [qtyDrafts, setQtyDrafts] = useState({}); // productId -> string, overrides suggestedQty

  // Delay-commit state for reorders: while `pending` is set, nothing has
  // actually been written yet — a timer fires the real commit unless undone.
  const [pending, setPending] = useState(null); // { ids, qtyMap, supplierMap, expiresAt, secondsLeft }
  const pendingTimeoutRef = useRef(null);
  const pendingTickRef = useRef(null);

  // Sequential reminder "queue" — a real batch WhatsApp send isn't possible
  // (browsers require a user gesture per compose window and will block a
  // loop of window.open calls), so this strings individual one-tap sends
  // into a fast, guided sequence instead of pretending to fire them all at once.
  const [reminderQueue, setReminderQueue] = useState([]); // debtor ids left to send
  const [reminderQueueTotal, setReminderQueueTotal] = useState(0); // size of the queue when it started, for "2 of 5"

  useEffect(() => () => {
    if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    if (pendingTickRef.current) clearInterval(pendingTickRef.current);
  }, []);

  function toggleWhy(key) {
    setExpandedKeys((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key]));
  }

  function qtyFor(p) {
    const raw = qtyDrafts[p.id];
    return raw === undefined || raw === "" ? p.suggestedQty : raw;
  }
  function setQty(id, value) {
    setQtyDrafts((d) => ({ ...d, [id]: value }));
  }

  function clearPendingTimers() {
    if (pendingTimeoutRef.current) { clearTimeout(pendingTimeoutRef.current); pendingTimeoutRef.current = null; }
    if (pendingTickRef.current) { clearInterval(pendingTickRef.current); pendingTickRef.current = null; }
  }

  function commitPending(ids, qtyMap, supplierMap) {
    ids.forEach((id) => {
      const qty = Number(qtyMap[id]) || 0;
      if (qty > 0) onConfirmReorder(id, qty, supplierMap[id] || "");
    });
    setConfirmedIds((cs) => [...cs, ...ids]);
  }

  // Queues one or more products for reorder — used by both the single
  // "Confirm" button and "Confirm all".
  function queueReorder(list) {
    const ids = list.map((p) => p.id);
    const qtyMap = {}, supplierMap = {};
    list.forEach((p) => { qtyMap[p.id] = qtyFor(p); supplierMap[p.id] = p.lastSupplier; });

    clearPendingTimers();
    const expiresAt = Date.now() + REORDER_UNDO_MS;
    setPending({ ids, qtyMap, supplierMap, expiresAt, secondsLeft: Math.ceil(REORDER_UNDO_MS / 1000) });

    pendingTimeoutRef.current = setTimeout(() => {
      commitPending(ids, qtyMap, supplierMap);
      setPending(null);
      clearPendingTimers();
    }, REORDER_UNDO_MS);

    pendingTickRef.current = setInterval(() => {
      setPending((cur) => (cur ? { ...cur, secondsLeft: Math.max(0, Math.ceil((cur.expiresAt - Date.now()) / 1000)) } : cur));
    }, 250);
  }

  function handleConfirm(p) {
    queueReorder([p]);
  }
  function handleConfirmAll() {
    const toQueue = reorderDrafts.filter((p) => !confirmedIds.includes(p.id) && !(pending && pending.ids.includes(p.id)));
    if (toQueue.length) queueReorder(toQueue);
  }
  function undoOne(id) {
    setPending((cur) => {
      if (!cur) return cur;
      const ids = cur.ids.filter((x) => x !== id);
      if (ids.length === 0) { clearPendingTimers(); return null; }
      return { ...cur, ids };
    });
  }
  function undoAllPending() {
    clearPendingTimers();
    setPending(null);
  }

  // ---- Debtor reminders ----
  function sendReminderText(d) {
    const text = `Hello ${d.name}, this is a friendly reminder from the shop — your outstanding balance is ${ugx(d.balance)}. Kindly clear it when convenient. Thank you!`;
    const digits = (d.phone || "").replace(/[^\d]/g, "");
    if (digits) window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank");
    else if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }
  function remind(d) {
    sendReminderText(d);
    setRemindedIds((ids) => [...ids, d.id]);
  }
  function startRemindAll() {
    const queue = debtorRisk.filter((d) => !remindedIds.includes(d.id)).map((d) => d.id);
    if (queue.length) { setReminderQueue(queue); setReminderQueueTotal(queue.length); }
  }
  function sendNextInQueue() {
    const d = debtorRisk.find((x) => x.id === reminderQueue[0]);
    if (d) remind(d);
    setReminderQueue((q) => q.slice(1));
  }
  function skipInQueue() {
    setReminderQueue((q) => q.slice(1));
  }

  // ---- Supplier reorder messages — mirrors the debtor-reminder pattern ----
  function messageSupplier(p) {
    const qty = qtyFor(p);
    const who = p.lastSupplier ? p.lastSupplier : "there";
    const text = `Hi ${who}, please deliver ${qty} ${p.unit}(s) of ${p.name} when you're able to. Thank you!`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  const CONF_COLOR = { high: C.green, medium: C.goldDark, low: C.brick };
  const unconfirmedReorders = reorderDrafts.filter((p) => !confirmedIds.includes(p.id));
  const unremindedDebtors = debtorRisk.filter((d) => !remindedIds.includes(d.id));
  const nothingToFlag = reorderDrafts.length === 0 && slowMoving.length === 0 && debtorRisk.length === 0 && anomalies.length === 0;
  const queueDebtor = reminderQueue.length ? debtorRisk.find((d) => d.id === reminderQueue[0]) : null;

  return (
    <Card className="p-4 mb-4">
      <h3 className="font-medium mb-3 flex items-center gap-2" style={{ color: C.ink, fontFamily: "'Fraunces', serif" }}>
        <Sparkles size={16} style={{ color: C.goldDark }} /> Today's briefing
      </h3>

      {nothingToFlag && (
        <p className="text-sm" style={{ color: C.ink, opacity: 0.5 }}>
          Nothing urgent — stock, debtors and sales are all tracking normally.
        </p>
      )}

      {anomalies.length > 0 && (
        <InsightSection icon={AlertTriangle} color={C.brick} title="Flags">
          <div className="space-y-1">
            {anomalies.map((a) => (
              <p key={a.id} className="text-sm" style={{ color: C.ink }}>{a.text}</p>
            ))}
          </div>
        </InsightSection>
      )}

      {reorderDrafts.length > 0 && (
        <InsightSection
          icon={PackagePlus}
          color={C.goldDark}
          title="Forecast stockouts"
          action={
            unconfirmedReorders.length > 1 && (
              <button onClick={handleConfirmAll} className="text-[11px] px-2 py-1 rounded-md border shrink-0" style={{ borderColor: C.line, color: C.greenDark }}>
                Confirm all ({unconfirmedReorders.length})
              </button>
            )
          }
        >
          {pending && (
            <div className="flex items-center justify-between gap-2 text-xs rounded-md px-2.5 py-1.5 mb-2" style={{ background: "rgba(217,164,65,0.15)", color: C.ink }}>
              <span>{pending.ids.length} reorder(s) queued — writing to stock in {pending.secondsLeft}s</span>
              <button onClick={undoAllPending} className="underline shrink-0" style={{ color: C.brick }}>Undo all</button>
            </div>
          )}
          <div className="space-y-2">
            {reorderDrafts.map((p) => {
              const key = `reorder-${p.id}`;
              const isConfirmed = confirmedIds.includes(p.id);
              const isPending = !!pending && pending.ids.includes(p.id);
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span style={{ color: C.ink }}>
                      {p.name} — {p.daysLeft !== null ? `~${Math.max(0, Math.round(p.daysLeft))}d left` : `${p.stock} left`}
                    </span>
                    {isConfirmed ? (
                      <span className="text-xs shrink-0" style={{ color: C.greenDark }}>Reorder logged ✓</span>
                    ) : isPending ? (
                      <span className="flex items-center gap-2 text-xs shrink-0">
                        <span style={{ color: C.goldDark }}>Queued ({pending.secondsLeft}s)</span>
                        <button onClick={() => undoOne(p.id)} className="underline" style={{ color: C.brick }}>Undo</button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min={1}
                          value={qtyFor(p)}
                          onChange={(e) => setQty(p.id, e.target.value)}
                          className="w-14 text-xs rounded-md border px-1.5 py-1 text-right"
                          style={{ borderColor: C.line, fontFamily: "'IBM Plex Mono', monospace", color: C.ink, background: "white" }}
                          title="Reorder quantity — edit before confirming"
                        />
                        <button onClick={() => handleConfirm(p)} className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: C.line, color: C.greenDark }}>
                          Confirm
                        </button>
                        <button onClick={() => messageSupplier(p)} className="p-1 rounded hover:bg-black/5" style={{ color: C.navy }} title={p.lastSupplier ? `Message ${p.lastSupplier}` : "Message supplier"}>
                          <Send size={13} />
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: CONF_COLOR[p.confidence] }}>
                      {p.confidence} confidence
                    </span>
                    <button onClick={() => toggleWhy(key)} className="text-[10px] underline" style={{ color: C.ink, opacity: 0.5 }}>
                      {expandedKeys.includes(key) ? "Hide why" : "Why?"}
                    </button>
                  </div>
                  {expandedKeys.includes(key) && (
                    <p className="text-xs mt-1 rounded-md p-2" style={{ color: C.ink, opacity: 0.75, background: C.paper }}>{p.reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        </InsightSection>
      )}

      {debtorRisk.length > 0 && (
        <InsightSection
          icon={HandCoins}
          color={C.navy}
          title="Debtors to follow up"
          action={
            unremindedDebtors.length > 1 && !reminderQueue.length && (
              <button onClick={startRemindAll} className="text-[11px] px-2 py-1 rounded-md border shrink-0" style={{ borderColor: C.line, color: C.navy }}>
                Remind all ({unremindedDebtors.length})
              </button>
            )
          }
        >
          {queueDebtor && (
            <div className="flex items-center justify-between gap-2 text-xs rounded-md px-2.5 py-1.5 mb-2" style={{ background: "rgba(43,58,85,0.1)", color: C.ink }}>
              <span>Reminder {reminderQueueTotal - reminderQueue.length + 1} of {reminderQueueTotal}: {queueDebtor.name} owes {ugx(queueDebtor.balance)}</span>
              <span className="flex items-center gap-2 shrink-0">
                <button onClick={sendNextInQueue} className="px-2 py-1 rounded-md text-white" style={{ background: C.navy }}>Send</button>
                <button onClick={skipInQueue} className="underline" style={{ color: C.ink, opacity: 0.6 }}>Skip</button>
                <button onClick={() => setReminderQueue([])} className="underline" style={{ color: C.brick }}>Cancel</button>
              </span>
            </div>
          )}
          <div className="space-y-2">
            {debtorRisk.map((d) => {
              const key = `debtor-${d.id}`;
              return (
                <div key={d.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span style={{ color: C.ink }}>
                      {d.name} owes {ugx(d.balance)} — idle {Math.round(d.idleDays)}d ({d.risk} risk)
                    </span>
                    {remindedIds.includes(d.id) ? (
                      <span className="text-xs shrink-0" style={{ color: C.greenDark }}>Reminder sent ✓</span>
                    ) : (
                      <button onClick={() => remind(d)} className="text-xs px-2.5 py-1 rounded-lg border shrink-0" style={{ borderColor: C.line, color: C.navy }}>
                        Send reminder
                      </button>
                    )}
                  </div>
                  <button onClick={() => toggleWhy(key)} className="text-[10px] underline mt-0.5" style={{ color: C.ink, opacity: 0.5 }}>
                    {expandedKeys.includes(key) ? "Hide why" : "Why?"}
                  </button>
                  {expandedKeys.includes(key) && (
                    <p className="text-xs mt-1 rounded-md p-2" style={{ color: C.ink, opacity: 0.75, background: C.paper }}>{d.reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        </InsightSection>
      )}

      {slowMoving.length > 0 && (
        <InsightSection icon={AlertTriangle} color={C.ink} title="Slow-moving stock">
          <div className="space-y-2">
            {slowMoving.map((p) => {
              const key = `slow-${p.id}`;
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span style={{ color: C.ink }}>{p.name}</span>
                    <button onClick={() => toggleWhy(key)} className="text-[10px] underline shrink-0" style={{ color: C.ink, opacity: 0.5 }}>
                      {expandedKeys.includes(key) ? "Hide why" : "Why?"}
                    </button>
                  </div>
                  {expandedKeys.includes(key) && (
                    <p className="text-xs mt-1 rounded-md p-2" style={{ color: C.ink, opacity: 0.75, background: C.paper }}>{p.reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        </InsightSection>
      )}
    </Card>
  );
}

// Voice — wraps the browser's built-in speech recognition (mic → text) and
// speech synthesis (text → spoken reply). Fully feature-detected: on a
// browser without support, speechSupported/synthSupported are false and
// the UI simply hides the mic/voice controls — typing still works exactly
// as before.
