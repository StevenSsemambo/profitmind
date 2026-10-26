/* First-run setup (owner only): name the shop, then start empty or explore with sample data. */
import { useState } from "react";
import { Store, Sparkles } from "lucide-react";
import { C, FONT_IMPORT } from "../lib/theme.js";
import { inputStyle } from "./ui/primitives.jsx";

export default function SetupWizard({ onDone }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("fresh");
  const ok = name.trim().length >= 2;

  const Option = ({ id, icon: Icon, title, text }) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className="w-full text-left rounded-xl border p-4 flex gap-3"
      style={{ borderColor: mode === id ? C.greenDark : C.line, background: mode === id ? "rgba(46,107,69,0.07)" : C.paperRaised }}
    >
      <Icon size={18} style={{ color: C.greenDark, flexShrink: 0, marginTop: 2 }} />
      <span>
        <span className="block text-sm font-medium" style={{ color: C.ink }}>{title}</span>
        <span className="block text-xs mt-0.5" style={{ color: C.ink, opacity: 0.6 }}>{text}</span>
      </span>
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.paper, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <form
        onSubmit={(e) => { e.preventDefault(); if (ok) onDone(name, mode === "demo"); }}
        className="w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-2xl" style={{ fontFamily: "'Fraunces', serif", color: C.ink }}>Set up your shop</h1>
          <p className="text-xs mt-1" style={{ color: C.ink, opacity: 0.55 }}>Two quick questions, then you're ready to sell.</p>
        </div>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide mb-1" style={{ color: C.ink, opacity: 0.5 }}>Shop name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mama Sarah's Mini Mart" style={inputStyle()} />
          <span className="block text-[11px] mt-1" style={{ color: C.ink, opacity: 0.45 }}>Shown on receipts and reports.</span>
        </label>
        <div className="space-y-2">
          <Option id="fresh" icon={Store} title="Start with my own shop" text="Empty and clean. Add your products in the Stock tab (you can import a CSV file) and start selling." />
          <Option id="demo" icon={Sparkles} title="Explore with sample data" text="Pre-filled with example products and customers so you can try everything. Erase it later in Export & Backup." />
        </div>
        <button type="submit" disabled={!ok} className="w-full text-sm py-2.5 rounded-lg text-white disabled:opacity-40" style={{ background: C.greenDark }}>
          Continue
        </button>
      </form>
    </div>
  );
}
