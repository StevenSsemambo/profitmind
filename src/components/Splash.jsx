import { C, FONT_IMPORT } from "../lib/theme.js";
import Logo from "./Logo.jsx";

export default function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: C.paper, fontFamily: "'Inter', sans-serif" }}>
      <style>{`${FONT_IMPORT}
        @keyframes pm-pop { from { opacity: 0; transform: scale(0.82); } to { opacity: 1; transform: scale(1); } }
        @keyframes pm-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pm-load { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>
      <div style={{ animation: "pm-pop 0.5s cubic-bezier(.2,.9,.3,1.2)" }}>
        <Logo size={76} />
      </div>
      <h1
        className="mt-5 text-3xl"
        style={{ fontFamily: "'Fraunces', serif", color: C.ink, animation: "pm-fade 0.5s ease-out 0.15s both" }}
      >
        ProfitMind
      </h1>
      <p
        className="mt-1 text-[11px] uppercase tracking-[0.2em]"
        style={{ color: C.ink, opacity: 0.45, fontFamily: "'IBM Plex Mono', monospace", animation: "pm-fade 0.5s ease-out 0.3s both" }}
      >
        Every shilling, accounted for
      </p>
      <div className="mt-6 rounded-full overflow-hidden" style={{ width: 120, height: 3, background: C.line }}>
        <div style={{ height: "100%", width: "100%", background: C.gold, transformOrigin: "left", animation: "pm-load 1.1s ease-in-out forwards" }} />
      </div>
    </div>
  );
}
