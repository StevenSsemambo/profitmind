/* ------------------------------------------------------------------ */
/* Backup & restore. A backup is a plain JSON file the owner keeps      */
/* (WhatsApp, email, Drive). Restoring validates everything first so a  */
/* wrong or damaged file can never wipe the shop's real data.           */
/* ------------------------------------------------------------------ */
export const BACKUP_VERSION = 2;
const LIST_KEYS = ["products", "sales", "debtors", "purchases", "expenses", "cashups", "adjustments", "supplierPayments"];
const MAX_BYTES = 15 * 1024 * 1024;

export function buildBackup(state) {
  const data = {};
  LIST_KEYS.forEach((k) => { data[k] = state[k] || []; });
  data.reportSettings = state.reportSettings || {};
  data.shop = state.shop || {};
  return { app: "profitmind", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// -> { ok: true, data, summary } | { ok: false, error }
export function parseBackup(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "The file is empty." };
  if (text.length > MAX_BYTES) return { ok: false, error: "The file is too large to be a ProfitMind backup." };
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, error: "That isn't a valid backup file (it couldn't be read)." }; }
  if (!json || typeof json !== "object" || json.app !== "profitmind" || typeof json.data !== "object" || !json.data) {
    return { ok: false, error: "That file isn't a ProfitMind backup." };
  }
  if (json.version && json.version > BACKUP_VERSION) {
    return { ok: false, error: "This backup was made by a newer version of ProfitMind. Update the app first." };
  }

  const src = json.data;
  const data = {};
  for (const k of LIST_KEYS) {
    const v = src[k];
    if (v === undefined) { data[k] = []; continue; }
    if (!Array.isArray(v)) return { ok: false, error: `The backup looks damaged (“${k}” is not a list).` };
    data[k] = v;
  }
  if (data.products.length + data.sales.length + data.debtors.length === 0) {
    return { ok: false, error: "The backup contains no products, sales or customers." };
  }

  const bad = (arr, test) => arr.findIndex((x) => !x || typeof x !== "object" || !test(x));
  const checks = [
    ["products", (p) => isNum(p.id) && typeof p.name === "string" && isNum(p.stock) && isNum(p.costPrice) && isNum(p.sellPrice)],
    ["sales", (s) => isNum(s.id) && isNum(s.total) && isNum(s.profit) && isNum(s.date)],
    ["debtors", (d) => isNum(d.id) && typeof d.name === "string" && isNum(d.owed) && isNum(d.paid)],
    ["purchases", (p) => isNum(p.id) && isNum(p.totalCost) && isNum(p.date)],
    ["expenses", (e) => isNum(e.id) && isNum(e.amount) && isNum(e.date)],
    ["cashups", (c) => isNum(c.id) && isNum(c.date)],
    ["adjustments", (a) => isNum(a.id) && isNum(a.date)],
    ["supplierPayments", (p) => isNum(p.id) && isNum(p.amount) && isNum(p.date)],
  ];
  for (const [k, test] of checks) {
    const i = bad(data[k], test);
    if (i !== -1) return { ok: false, error: `The backup looks damaged (entry ${i + 1} in “${k}” is incomplete).` };
  }

  data.reportSettings = src.reportSettings && typeof src.reportSettings === "object" ? src.reportSettings : null;
  data.shop = src.shop && typeof src.shop === "object" ? src.shop : null;

  return {
    ok: true,
    data,
    summary: {
      exportedAt: json.exportedAt || null,
      products: data.products.length, sales: data.sales.length, debtors: data.debtors.length,
      purchases: data.purchases.length, expenses: data.expenses.length,
    },
  };
}
