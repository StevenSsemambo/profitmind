import { describe, it, expect, beforeEach } from "vitest";

// storage.js talks to window.localStorage; give the node test env a stub.
const mem = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  },
};

const { setupAuth, verifyPin, changePin, loadAuth, validPin } = await import("./auth.js");

beforeEach(() => mem.clear());

describe("auth", () => {
  it("validates PIN shape", () => {
    expect(validPin("1234")).toBe(true);
    expect(validPin("123")).toBe(false);
    expect(validPin("12ab")).toBe(false);
  });

  it("stores only hashes, never the PIN", async () => {
    await setupAuth("4821", "7390");
    const raw = JSON.stringify(await loadAuth());
    expect(raw).not.toContain("4821");
    expect(raw).not.toContain("7390");
  });

  it("accepts the right PIN and rejects the wrong one", async () => {
    await setupAuth("4821", "7390");
    expect((await verifyPin("admin", "4821")).ok).toBe(true);
    expect((await verifyPin("admin", "7390")).ok).toBe(false);
    expect((await verifyPin("cashier", "7390")).ok).toBe(true);
  });

  it("locks out after repeated wrong guesses", async () => {
    await setupAuth("4821", "7390");
    let r;
    for (let i = 0; i < 5; i++) r = await verifyPin("admin", "0000");
    expect(r.lockedForMs).toBeGreaterThan(0);
    // even the correct PIN is refused while locked
    expect((await verifyPin("admin", "4821")).ok).toBe(false);
  });

  it("requires distinct PINs and the owner PIN to change one", async () => {
    await expect(setupAuth("1111", "1111")).rejects.toThrow();
    await setupAuth("4821", "7390");
    await expect(changePin("cashier", "5555", "wrong")).rejects.toThrow();
    await changePin("cashier", "5555", "4821");
    expect((await verifyPin("cashier", "5555")).ok).toBe(true);
    await expect(changePin("cashier", "4821", "4821")).rejects.toThrow(/different/);
  });
});
