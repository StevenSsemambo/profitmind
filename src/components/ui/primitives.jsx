/* ------------------------------------------------------------------ */
/* Small shared building blocks used across every tab.                  */
/* ------------------------------------------------------------------ */
import { X } from "lucide-react";
import { C } from "../../lib/theme.js";

export function Card({ children, style, className = "" }) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{ borderColor: C.line, background: C.paperRaised, ...style }}
    >
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide mb-1" style={{ color: C.ink, opacity: 0.5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function inputStyle() {
  return {
    width: "100%",
    borderRadius: "0.5rem",
    border: `1px solid ${C.line}`,
    padding: "0.5rem 0.75rem",
    background: "white",
  };
}

// Wraps a wide table so it scrolls sideways inside its card (never cut off),
// with a hint on phones. Put it directly around the <table>.
export function TableScroll({ children, min = 640 }) {
  return (
    <>
      <div className="table-scroll" style={{ "--table-min": `${min}px` }}>{children}</div>
      <p className="sm:hidden text-[11px] px-4 py-2 border-t text-center" style={{ borderColor: C.line, color: C.ink, opacity: 0.5 }}>
        Swipe sideways to see all columns →
      </p>
    </>
  );
}

// On phones the dialog is a full-width sheet from the bottom that stays above
// the keyboard (dvh), on larger screens a centred card.
export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={onClose}>
      <div
        className="rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-sm max-h-[92vh] sm:max-h-[85vh] overflow-y-auto"
        style={{ background: C.paperRaised, maxHeight: "min(92dvh, 92vh)", paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg" style={{ fontFamily: "'Fraunces', serif", color: C.ink }}>
            {title}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5" style={{ color: C.ink, opacity: 0.5 }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function KpiCard({ label, value, accent }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide mb-1" style={{ color: C.ink, opacity: 0.5 }}>{label}</p>
      <p className="text-lg" style={{ fontFamily: "'IBM Plex Mono', monospace", color: accent || C.ink }}>{value}</p>
    </Card>
  );
}

export function EmptyState({ text }) {
  return <p className="text-sm py-8 text-center" style={{ color: C.ink, opacity: 0.4 }}>{text}</p>;
}
