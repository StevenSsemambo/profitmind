export function downloadCSV(filename, rows, headers) {
  const esc = (v) => {
    let s = v === null || v === undefined ? "" : String(v);
    // A text cell starting with = + - @ is run as a formula by Excel/Sheets.
    // Prefix an apostrophe so product or customer names can't do that.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
