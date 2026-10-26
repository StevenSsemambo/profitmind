/* ------------------------------------------------------------------ */
/* Login — first launch: the shop sets an Owner PIN and a Cashier PIN.  */
/* After that: pick a role, enter its PIN. PINs are stored hashed       */
/* (lib/auth.js), and repeated wrong guesses lock the role out.         */
/* ------------------------------------------------------------------ */
import { useState, useEffect } from "react";
import { User, ShieldCheck, ArrowLeft } from "lucide-react";
import { C, FONT_IMPORT } from "../lib/theme.js";
import { ACCOUNTS } from "../lib/seedData.js";
import { loadAuth, setupAuth, verifyPin, validPin } from "../lib/auth.js";
import { inputStyle } from "./ui/primitives.jsx";
import Logo from "./Logo.jsx";

const digitsOnly = (v) => v.replace(/\D/g, "").slice(0, 8);

function Shell({ children, subtitle }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: `radial-gradient(circle at 50% -10%, ${C.paperRaised} 0%, ${C.paper} 55%)`, fontFamily: "'Inter', sans-serif" }}
    >
      <style>{FONT_IMPORT}</style>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Logo size={60} />
          <h1 className="mt-4 text-2xl" style={{ fontFamily: "'Fraunces', serif", color: C.ink }}>ProfitMind</h1>
          {subtitle && <p className="mt-1 text-xs text-center" style={{ color: C.ink, opacity: 0.5 }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function PinField({ label, value, onChange, autoFocus }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide mb-1" style={{ color: C.ink, opacity: 0.5 }}>{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        style={{ ...inputStyle(), letterSpacing: "0.3em", fontFamily: "'IBM Plex Mono', monospace" }}
      />
    </label>
  );
}

function Setup({ onDone }) {
  const [owner, setOwner] = useState("");
  const [ownerAgain, setOwnerAgain] = useState("");
  const [cashier, setCashier] = useState("");
  const [cashierAgain, setCashierAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    if (!validPin(owner) || !validPin(cashier)) return setError("PINs must be 4–8 digits.");
    if (owner !== ownerAgain || cashier !== cashierAgain) return setError("The PIN confirmations don't match.");
    if (owner === cashier) return setError("Owner and Cashier PINs must be different.");
    setBusy(true);
    try {
      await setupAuth(owner, cashier);
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Shell subtitle="First time here — choose a PIN for the Owner and one for the Cashier. Keep the Owner PIN private.">
      <div className="space-y-3 rounded-2xl p-4 border" style={{ borderColor: C.line, background: C.paperRaised }}>
        <PinField label="Owner PIN" value={owner} onChange={setOwner} autoFocus />
        <PinField label="Repeat Owner PIN" value={ownerAgain} onChange={setOwnerAgain} />
        <PinField label="Cashier PIN" value={cashier} onChange={setCashier} />
        <PinField label="Repeat Cashier PIN" value={cashierAgain} onChange={setCashierAgain} />
        {error && <p className="text-xs" style={{ color: C.brick }}>{error}</p>}
        <button onClick={submit} disabled={busy} className="w-full text-sm py-2.5 rounded-lg text-white disabled:opacity-50" style={{ background: C.greenDark }}>
          {busy ? "Saving…" : "Save PINs and continue"}
        </button>
        <p className="text-[11px]" style={{ color: C.ink, opacity: 0.45 }}>
          Forgotten PIN? Back up first from Export &amp; Backup — clearing this browser's site data resets the app and its PINs.
        </p>
      </div>
    </Shell>
  );
}

function PinEntry({ account, onBack, onLogin }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const secondsLeft = lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;

  async function submit() {
    if (secondsLeft > 0 || busy) return;
    setBusy(true);
    setError("");
    const r = await verifyPin(account.role, pin);
    setBusy(false);
    if (r.ok) return onLogin(account);
    setPin("");
    if (r.lockedForMs) {
      setLockedUntil(Date.now() + r.lockedForMs);
      setNow(Date.now());
      setError("Too many wrong attempts.");
    } else {
      setError(r.attemptsLeft !== undefined ? `Wrong PIN — ${r.attemptsLeft} attempt(s) left before a lockout.` : "Wrong PIN.");
    }
  }

  return (
    <Shell subtitle={`Enter the ${account.role === "admin" ? "Owner" : "Cashier"} PIN`}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3 rounded-2xl p-4 border" style={{ borderColor: C.line, background: C.paperRaised }}>
        <PinField label={`${account.name} PIN`} value={pin} onChange={setPin} autoFocus />
        {secondsLeft > 0 && <p className="text-xs" style={{ color: C.brick }}>Locked — try again in {secondsLeft}s.</p>}
        {error && secondsLeft === 0 && <p className="text-xs" style={{ color: C.brick }}>{error}</p>}
        <button
          type="submit"
          disabled={busy || pin.length < 4 || secondsLeft > 0}
          className="w-full text-sm py-2.5 rounded-lg text-white disabled:opacity-40"
          style={{ background: C.greenDark }}
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs" style={{ color: C.ink, opacity: 0.6 }}>
          <ArrowLeft size={12} /> Back
        </button>
      </form>
    </Shell>
  );
}

export default function Login({ onLogin }) {
  const [auth, setAuth] = useState(undefined); // undefined = loading, null = not set up
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    loadAuth().then((a) => setAuth(a || null));
  }, []);

  if (auth === undefined) return null;
  if (auth === null) return <Setup onDone={() => loadAuth().then((a) => setAuth(a || null))} />;
  if (picked) return <PinEntry account={picked} onBack={() => setPicked(null)} onLogin={onLogin} />;

  return (
    <Shell subtitle="Choose who is using the till.">
      <div className="space-y-3">
        {ACCOUNTS.map((a) => (
          <button
            key={a.name}
            onClick={() => setPicked(a)}
            className="group w-full text-left rounded-2xl p-4 border transition-all hover:-translate-y-0.5"
            style={{ borderColor: C.line, background: C.paperRaised, boxShadow: "0 1px 2px rgba(30,42,31,0.06)" }}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: a.role === "admin" ? "#F4E3D3" : "#E4E8ED" }}>
                {a.role === "admin" ? <ShieldCheck size={18} style={{ color: C.goldDark }} /> : <User size={18} style={{ color: C.navy }} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" style={{ color: C.ink, fontFamily: "'Fraunces', serif", fontSize: "1.05rem" }}>{a.name}</span>
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0" style={{ background: a.role === "admin" ? "#F4E3D3" : "#E4E8ED", color: a.role === "admin" ? C.goldDark : C.navy }}>
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
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: C.ink, opacity: 0.35, fontFamily: "'IBM Plex Mono', monospace" }}>Sales · Debtors · Stock</span>
      </div>
    </Shell>
  );
}
