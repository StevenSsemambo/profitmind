import { describe, it, expect, vi } from "vitest";
import { escapeHtml, printPeriodReport } from "./reports.js";

describe("escapeHtml", () => {
  it("neutralises markup and quotes", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escapeHtml("Tom & Jerry's")).toBe("Tom &amp; Jerry&#39;s");
    expect(escapeHtml(null)).toBe("");
  });
});

describe("printPeriodReport", () => {
  it("never writes raw user-supplied markup into the print page", () => {
    let written = "";
    globalThis.window = { open: vi.fn(() => ({ document: { open() {}, write: (h) => (written = h), close() {} } })) };
    const evil = `<script>alert(1)</script>`;
    printPeriodReport(
      {
        periodTitle: "This Week's", rangeLabel: "1–7", revenue: 1, profit: 1, salesCount: 1, changePct: null, compareLabel: "last week",
        topProducts: [{ name: evil, units: 1, revenue: 1 }], categories: [{ category: evil, revenue: 1 }],
        reorderDrafts: [{ name: evil, daysLeft: 2, suggestedQty: 3 }], debtorRisk: [{ name: evil, balance: 5, idleDays: 3 }],
        inventory: { skuCount: 1, totalUnits: 1, costValue: 1, retailValue: 1 }, generatedAt: Date.now(),
      },
      evil
    );
    expect(written).not.toContain("<script>alert(1)</script>");
    expect(written).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
