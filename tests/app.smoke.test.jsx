// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";

globalThis.React = React;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));

const { default: App } = await import("../src/App.jsx");
const { setupAuth } = await import("../src/lib/auth.js");

const click = (el) => fireEvent.click(el);
const type = (el, value) => fireEvent.change(el, { target: { value } });
const tab = (name) => screen.getByRole("button", { name: new RegExp(`^\\s*${name}\\s*$`) });

describe("app smoke test: a new shop, end to end", () => {
  beforeAll(async () => { localStorage.clear(); await setupAuth("4821", "7390"); });

  it("walks through login, shop setup, selling, voiding, money and backup", async () => {
    render(<App />);

    // Login as Owner with the PIN
    click(await screen.findByRole("button", { name: /Owner/ }, { timeout: 4000 }));
    type(await screen.findByLabelText(/Owner PIN|PIN/i), "4821");
    click(screen.getByRole("button", { name: /unlock/i }));

    // First-run setup: name the shop, start with sample data so there is stock to sell
    await screen.findByText(/Set up your shop/i, {}, { timeout: 4000 });
    type(screen.getByPlaceholderText(/Mama Sarah/i), "Test Mini Mart");
    click(screen.getByText(/Explore with sample data/i));
    click(screen.getByRole("button", { name: /continue/i }));

    // Main app shows the shop name and the new tabs
    await screen.findByText("Test Mini Mart");
    for (const t of ["Sell", "History", "Debtors", "Stock", "Money", "Analytics", "Reports", "Export", "Advisor"]) {
      expect(tab(t)).toBeTruthy();
    }

    // Sell one item for cash, then void it from History and check the stock comes back
    click(tab("Sell"));
    const oil = await screen.findByText("Cooking Oil 1L");
    click(oil.closest("button"));
    click(screen.getByRole("button", { name: /complete sale/i }));
    click(tab("History"));
    await screen.findByText(/1× Cooking Oil 1L/);
    click(screen.getByRole("button", { name: /void/i }));
    type(await screen.findByPlaceholderText(/Wrong item/i), "Rang up by mistake");
    click(screen.getByRole("button", { name: /^void sale$/i }));
    await screen.findByText(/Rang up by mistake/);
    click(tab("Stock"));
    await screen.findByText(/Record stock received/i);
    expect(screen.getAllByText("14").length).toBeGreaterThan(0); // Cooking Oil back to its original 14

    // Money tab renders real-profit figures and the cash count
    click(tab("Money"));
    expect((await screen.findAllByText(/Net profit/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cash count — today/i)).toBeTruthy();
    expect(screen.getByText(/Owed to suppliers/i)).toBeTruthy();

    // Add an expense and see it listed
    const amount = screen.getAllByRole("spinbutton").find((el) => el.closest("label")?.textContent.includes("Amount (UGX)"));
    type(amount, "15000");
    click(screen.getByRole("button", { name: /add expense/i }));
    expect((await screen.findAllByText(/15,000/)).length).toBeGreaterThan(0);

    // Stock tab: adjust dialog opens
    click(tab("Stock"));
    await screen.findByText(/Record stock received/i);
    expect(screen.getAllByTitle(/Adjust stock/i).length).toBeGreaterThan(0);

    // Debtors tab: add customer dialog
    click(tab("Debtors"));
    click(await screen.findByRole("button", { name: /add customer/i }));
    await screen.findByText(/Credit limit/i);

    // Export tab: restore control present
    click(tab("Export"));
    await screen.findByText(/Restore from a backup/i);

    // History tab renders
    click(tab("History"));
    await screen.findByText(/Every sale, newest first/i);

    // Analytics + Advisor lazily load without crashing
    click(tab("Analytics"));
    expect((await screen.findAllByText(/Net profit \(after expenses\)/i, {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    click(tab("Advisor"));
    expect((await screen.findAllByText(/real profit after expenses/i, {}, { timeout: 5000 })).length).toBeGreaterThan(0);
  }, 30000);
});
