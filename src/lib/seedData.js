/* ------------------------------------------------------------------ */
/* Seed data — mirrors a real Kampala shop rather than placeholder      */
/* Lorem-ipsum stock, plus the static config for tabs/roles/accounts.   */
/* ------------------------------------------------------------------ */
import {
  Banknote, Smartphone, HandCoins, ShoppingCart, PackagePlus,
  BarChart3, FileText, Download, Sparkles,
} from "lucide-react";

export const SEED_PRODUCTS = [
  { id: 1, name: "Cooking Oil 1L", category: "Groceries", unit: "bottle", costPrice: 8500, sellPrice: 11000, lowStockThreshold: 10, stock: 14 },
  { id: 2, name: "Sugar 1kg", category: "Groceries", unit: "kg", costPrice: 3800, sellPrice: 5000, lowStockThreshold: 15, stock: 6 },
  { id: 3, name: "Bread", category: "Bakery", unit: "loaf", costPrice: 2500, sellPrice: 3500, lowStockThreshold: 8, stock: 22 },
  { id: 4, name: "Milk 500ml", category: "Dairy", unit: "pack", costPrice: 1500, sellPrice: 2200, lowStockThreshold: 12, stock: 3 },
  { id: 5, name: "Rice 2kg", category: "Groceries", unit: "bag", costPrice: 9000, sellPrice: 12000, lowStockThreshold: 6, stock: 18 },
  { id: 6, name: "Soap Bar", category: "Household", unit: "pc", costPrice: 1200, sellPrice: 2000, lowStockThreshold: 10, stock: 2 },
];

export const SEED_DEBTORS = [
  {
    id: 1, name: "Nakato Sarah", phone: "0772 111 222", owed: 45000, paid: 20000,
    history: [
      { type: "credit-sale", amount: 45000, date: Date.now() - 5 * 86400000 },
      { type: "payment", amount: 20000, date: Date.now() - 2 * 86400000 },
    ],
  },
  {
    id: 2, name: "Okello James", phone: "0701 333 444", owed: 18000, paid: 18000,
    history: [
      { type: "credit-sale", amount: 18000, date: Date.now() - 9 * 86400000 },
      { type: "payment", amount: 18000, date: Date.now() - 7 * 86400000 },
    ],
  },
];

export const SEED_PURCHASES = [
  { id: 1, productId: 1, productName: "Cooking Oil 1L", qty: 20, costPricePerUnit: 8500, totalCost: 170000, supplier: "Shoprite Wholesale", date: Date.now() - 6 * 86400000 },
  { id: 2, productId: 3, productName: "Bread", qty: 30, costPricePerUnit: 2500, totalCost: 75000, supplier: "City Bakery", date: Date.now() - 1 * 86400000 },
];

export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "momo", label: "Mobile Money", icon: Smartphone },
  { id: "credit", label: "On credit", icon: HandCoins },
];

export const TABS = [
  { id: "pos", label: "Sell", icon: ShoppingCart, roles: ["admin", "cashier"] },
  { id: "debtors", label: "Debtors", icon: HandCoins, roles: ["admin", "cashier"] },
  { id: "stock", label: "Stock", icon: PackagePlus, roles: ["admin", "cashier"] },
  { id: "analytics", label: "Analytics", icon: BarChart3, roles: ["admin"] },
  { id: "reports", label: "Reports", icon: FileText, roles: ["admin"] },
  { id: "export", label: "Export", icon: Download, roles: ["admin"] },
  { id: "advisor", label: "Advisor", icon: Sparkles, roles: ["admin"] },
];

export const DEFAULT_REPORT_SETTINGS = { whatsappNumber: "", autoWeekly: true, autoMonthly: true, lastWeeklySent: null, lastMonthlySent: null, notificationsEnabled: false };

// Roles shown on the login screen. PINs are chosen by the shop on first
// launch and stored hashed (see lib/auth.js) — none are hard-coded here.
export const ACCOUNTS = [
  { name: "Owner", role: "admin", desc: "Full access — Sell, Debtors, Stock, Analytics, Export & Backup, Advisor." },
  { name: "Cashier", role: "cashier", desc: "Till & stock only — Sell, Debtors and Stock. No access to Analytics, exports, or the Advisor." },
];
