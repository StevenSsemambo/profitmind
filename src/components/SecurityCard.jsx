/* Change Owner / Cashier PIN — requires the current Owner PIN. */
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { C } from "../lib/theme.js";
import { Card, Field, inputStyle } from "./ui/primitives.jsx";
import { changePin } from "../lib/auth.js";

export default function SecurityCard() {
  const [role, setRole] = useState("cashier");
  const [ownerPin, setOwnerPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await changePin(role, newPin, ownerPin);
      setMsg({ ok: true, text: `${role === "admin" ? "Owner" : "Cashier"} PIN changed.` });
      setOwnerPin("");
      setNewPin("");
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 mb-6">
      <h3 className="font-medium mb-1 flex items-center gap-2" style={{ color: C.ink }}><KeyRound size={16} /> PINs</h3>
      <p className="text-xs mb-4" style={{ color: C.ink, opacity: 0.5 }}>
        Change the Owner or Cashier PIN (4–8 digits). You need your current Owner PIN to confirm.
      </p>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <Field label="Change PIN for">
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle()}>
            <option value="cashier">Cashier</option>
            <option value="admin">Owner</option>
          </select>
        </Field>
        <Field label="Current Owner PIN">
          <input type="password" inputMode="numeric" maxLength={8} autoComplete="off" value={ownerPin} onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ""))} style={inputStyle()} />
        </Field>
        <Field label="New PIN">
          <input type="password" inputMode="numeric" maxLength={8} autoComplete="off" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} style={inputStyle()} />
        </Field>
      </div>
      <button
        onClick={submit}
        disabled={busy || ownerPin.length < 4 || newPin.length < 4}
        className="text-sm px-4 py-2.5 rounded-lg text-white disabled:opacity-40"
        style={{ background: C.greenDark }}
      >
        {busy ? "Saving…" : "Change PIN"}
      </button>
      {msg && <p className="text-xs mt-3" style={{ color: msg.ok ? C.greenDark : C.brick }}>{msg.text}</p>}
    </Card>
  );
}
