// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

globalThis.React = React;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const { default: App } = await import("../src/App.jsx");
const { setupAuth } = await import("../src/lib/auth.js");
const { STORAGE_KEY } = await import("../src/lib/storage.js");

describe("a shop that was already using the old version", () => {
  beforeAll(async () => {
    localStorage.clear();
    await setupAuth("4821", "7390");
    // Exactly what the previous version saved: no shop, expenses, cashups, etc.
    localStorage.setItem("profitmind:" + STORAGE_KEY, JSON.stringify({
      products: [{ id: 1, name: "Old Sugar", category: "G", unit: "kg", costPrice: 3800, sellPrice: 5000, lowStockThreshold: 5, stock: 12 }],
      sales: [{ id: 9, total: 10000, cost: 7600, profit: 2400, paymentMethod: "cash", date: Date.now() - 3600000, items: [{ productId: 1, name: "Old Sugar", qty: 2, sellPrice: 5000, costPrice: 3800 }] }],
      debtors: [{ id: 3, name: "Old Debtor", phone: "", owed: 8000, paid: 1000, history: [] }],
      purchases: [],
      reportSettings: {},
    }));
  });

  it("skips setup, keeps every record, and can still void an old cash sale", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Owner/ }, { timeout: 4000 }));
    fireEvent.change(await screen.findByLabelText(/PIN/i), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await screen.findByText("My Shop", {}, { timeout: 4000 });           // default name, no wizard
    expect(screen.queryByText(/Set up your shop/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^\s*Debtors\s*$/ }));
    await screen.findByText("Old Debtor");

    fireEvent.click(screen.getByRole("button", { name: /^\s*History\s*$/ }));
    fireEvent.change(await screen.findByDisplayValue(/Today/), { target: { value: "all" } });
    await screen.findByText(/2× Old Sugar/);
    fireEvent.click(screen.getByRole("button", { name: /void/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Wrong item/i), { target: { value: "legacy test" } });
    fireEvent.click(screen.getByRole("button", { name: /^void sale$/i }));
    await screen.findByText(/legacy test/);
  }, 30000);
});
