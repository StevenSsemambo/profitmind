/* ------------------------------------------------------------------ */
/* Product import from a CSV file (exported from Excel / Google Sheets).*/
/* Forgiving about column names and quoting, strict about the numbers.  */
/* ------------------------------------------------------------------ */
const MAX_ROWS = 2000;

export const IMPORT_TEMPLATE = "name,category,unit,costPrice,sellPrice,stock,lowStockThreshold\nSugar 1kg,Groceries,kg,3800,5000,20,10\nBread,Bakery,loaf,2500,3000,15,5\n";

// Minimal RFC-4180 style parser: quoted fields, escaped quotes, CRLF, BOM.
export function parseCsvText(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const ALIASES = {
  name: ["name", "product", "productname", "item"],
  category: ["category", "type", "group"],
  unit: ["unit", "uom"],
  costPrice: ["costprice", "cost", "buyingprice", "buyprice", "purchaseprice"],
  sellPrice: ["sellprice", "sellingprice", "price", "saleprice", "retailprice"],
  stock: ["stock", "qty", "quantity", "onhand", "stockonhand"],
  lowStockThreshold: ["lowstockthreshold", "lowstock", "reorderlevel", "reorder", "minstock"],
};
const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z]/g, "");
const num = (v) => { const n = Number(String(v).replace(/[,\s]/g, "")); return String(v).trim() === "" ? NaN : n; };

// -> { ok, products, errors: [{line, message}] }
export function parseProductsCsv(text) {
  const rows = parseCsvText(text);
  if (rows.length < 2) return { ok: false, products: [], errors: [{ line: 1, message: "The file needs a header row and at least one product." }] };
  if (rows.length - 1 > MAX_ROWS) return { ok: false, products: [], errors: [{ line: 1, message: `Too many rows (max ${MAX_ROWS}). Split the file.` }] };

  const header = rows[0].map(norm);
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) col[key] = header.findIndex((h) => names.includes(h));
  if (col.name === -1 || col.sellPrice === -1) {
    return { ok: false, products: [], errors: [{ line: 1, message: "Couldn't find the 'name' and 'sellPrice' columns. Download the template to see the expected layout." }] };
  }

  const products = [];
  const errors = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const get = (k) => (col[k] === -1 ? "" : (r[col[k]] ?? "").trim());
    const name = get("name");
    const sellPrice = num(get("sellPrice"));
    const costPrice = get("costPrice") === "" ? 0 : num(get("costPrice"));
    const stock = get("stock") === "" ? 0 : num(get("stock"));
    const low = get("lowStockThreshold") === "" ? 5 : num(get("lowStockThreshold"));
    if (!name) return errors.push({ line, message: "Missing product name." });
    if (!(sellPrice > 0)) return errors.push({ line, message: `“${name}”: selling price must be a number above 0.` });
    if (!(costPrice >= 0)) return errors.push({ line, message: `“${name}”: cost price isn't a valid number.` });
    if (!(stock >= 0)) return errors.push({ line, message: `“${name}”: stock isn't a valid number.` });
    if (!(low >= 0)) return errors.push({ line, message: `“${name}”: low-stock level isn't a valid number.` });
    products.push({
      name, category: get("category") || "General", unit: get("unit") || "pc",
      costPrice: Math.round(costPrice), sellPrice: Math.round(sellPrice), stock: Math.floor(stock), lowStockThreshold: Math.floor(low),
    });
  });
  return { ok: products.length > 0, products, errors };
}
