/* ------------------------------------------------------------------ */
/* Auth — PIN login for Owner and Cashier. PINs are set by the shop on  */
/* first launch and stored only as salted PBKDF2 hashes, never in plain */
/* text. Repeated wrong guesses trigger a growing lockout.              */
/*                                                                      */
/* Honest limit: this app has no server, so everything lives in the     */
/* browser. The PIN stops casual access at the till; it is not strong   */
/* protection against someone with developer tools and the phone in     */
/* their hands. Real protection needs a backend (see README).           */
/* ------------------------------------------------------------------ */
import { storage } from "./storage.js";

const AUTH_KEY = "auth-v1";
const ITERATIONS = 150000;
const MAX_FREE_ATTEMPTS = 5;

export const validPin = (pin) => /^\d{4,8}$/.test(String(pin || ""));

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPin(pin, saltB64) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: ITERATIONS }, key, 256);
  return toB64(bits);
}

async function makeRecord(pin) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await hashPin(pin, salt), fails: 0, lockedUntil: 0 };
}

export async function loadAuth() {
  const res = await storage.get(AUTH_KEY);
  if (!res || !res.value) return null;
  try { return JSON.parse(res.value); } catch { return null; }
}

async function saveAuth(auth) {
  const ok = await storage.set(AUTH_KEY, JSON.stringify(auth));
  if (!ok) throw new Error("Couldn't save PINs on this device (storage full or blocked).");
}

export async function setupAuth(ownerPin, cashierPin) {
  if (!validPin(ownerPin) || !validPin(cashierPin)) throw new Error("PINs must be 4–8 digits.");
  if (ownerPin === cashierPin) throw new Error("Owner and Cashier PINs must be different.");
  const auth = { admin: await makeRecord(ownerPin), cashier: await makeRecord(cashierPin) };
  await saveAuth(auth);
  return auth;
}

// -> { ok: true } | { ok: false, lockedForMs?: number, attemptsLeft?: number }
export async function verifyPin(role, pin) {
  const auth = await loadAuth();
  if (!auth || !auth[role]) return { ok: false };
  const rec = auth[role];
  const now = Date.now();
  if (rec.lockedUntil && rec.lockedUntil > now) return { ok: false, lockedForMs: rec.lockedUntil - now };

  const attempt = await hashPin(String(pin || ""), rec.salt);
  if (attempt === rec.hash) {
    if (rec.fails || rec.lockedUntil) await saveAuth({ ...auth, [role]: { ...rec, fails: 0, lockedUntil: 0 } });
    return { ok: true };
  }

  const fails = (rec.fails || 0) + 1;
  let lockedUntil = 0;
  if (fails >= MAX_FREE_ATTEMPTS) {
    const lockMs = Math.min(60000 * 2 ** (fails - MAX_FREE_ATTEMPTS), 15 * 60000); // 1, 2, 4 … 15 min
    lockedUntil = now + lockMs;
  }
  await saveAuth({ ...auth, [role]: { ...rec, fails, lockedUntil } });
  return lockedUntil
    ? { ok: false, lockedForMs: lockedUntil - now }
    : { ok: false, attemptsLeft: MAX_FREE_ATTEMPTS - fails };
}

// Changing a PIN requires the current Owner PIN.
export async function changePin(role, newPin, ownerPin) {
  if (!validPin(newPin)) throw new Error("PINs must be 4–8 digits.");
  const check = await verifyPin("admin", ownerPin);
  if (!check.ok) throw new Error(check.lockedForMs ? "Too many wrong attempts — wait and try again." : "Owner PIN is incorrect.");
  const auth = await loadAuth();
  const other = role === "admin" ? "cashier" : "admin";
  if (auth[other] && (await hashPin(newPin, auth[other].salt)) === auth[other].hash) {
    throw new Error("Owner and Cashier PINs must be different.");
  }
  await saveAuth({ ...auth, [role]: await makeRecord(newPin) });
}
