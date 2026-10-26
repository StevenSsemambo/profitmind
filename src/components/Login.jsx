/* ------------------------------------------------------------------ */
/* Login — demo account picker (Owner / Cashier), no PIN pad. See         */
/* seedData.js ACCOUNTS and the README for what a real login needs to     */
/* replace this with before this app ever holds a real shop's data.       */
/* ------------------------------------------------------------------ */
import { User, ShieldCheck } from "lucide-react";
import { C, FONT_IMPORT } from "../lib/theme.js";
import { ACCOUNTS } from "../lib/seedData.js";
import Logo from "./Logo.jsx";

export default function Login({ onLogin }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `radial-gradient(circle at 50% -10%, ${C.paperRaised} 0%, ${C.paper} 55%)`,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <style>{FONT_IMPORT}</style>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Logo size={60} />
          <h1 className="mt-4 text-2xl" style={{ fontFamily: "'Fraunces', serif", color: C.ink }}>ProfitMind</h1>
          <p className="mt-1 text-xs" style={{ color: C.ink, opacity: 0.5 }}>
            This demo skips the PIN pad — tap an account to see what that role can do.
          </p>
        </div>

        <div className="space-y-3">
          {ACCOUNTS.map((a) => (
            <button
              key={a.name}
              onClick={() => onLogin(a)}
              className="group w-full text-left rounded-2xl p-4 border transition-all hover:-translate-y-0.5"
              style={{
                borderColor: C.line,
                background: C.paperRaised,
                boxShadow: "0 1px 2px rgba(30,42,31,0.06)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 10px 24px -12px rgba(30,42,31,0.35)"; e.currentTarget.style.borderColor = a.role === "admin" ? C.goldDark : C.navy; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(30,42,31,0.06)"; e.currentTarget.style.borderColor = C.line; }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: a.role === "admin" ? "#F4E3D3" : "#E4E8ED" }}
                >
                  {a.role === "admin" ? <ShieldCheck size={18} style={{ color: C.goldDark }} /> : <User size={18} style={{ color: C.navy }} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium" style={{ color: C.ink, fontFamily: "'Fraunces', serif", fontSize: "1.05rem" }}>{a.name}</span>
                    <span
                      className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: a.role === "admin" ? "#F4E3D3" : "#E4E8ED", color: a.role === "admin" ? C.goldDark : C.navy }}
                    >
                      {a.role === "admin" ? "Owner" : "Cashier"}
                    </span>
                  </div>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: C.ink, opacity: 0.55 }}>{a.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-8 justify-center">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.gold }} />
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.brick }} />
          <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: C.ink, opacity: 0.35, fontFamily: "'IBM Plex Mono', monospace" }}>
            Sales · Debtors · Stock
          </span>
        </div>
      </div>
    </div>
  );
}

