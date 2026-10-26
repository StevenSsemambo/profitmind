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

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto"
        style={{ background: C.paperRaised }}
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
