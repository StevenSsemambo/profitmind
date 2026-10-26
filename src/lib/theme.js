/* ------------------------------------------------------------------ */
/* Design tokens — the paper/ledger palette, Fraunces display type,    */
/* mono for figures. Imported by every component that needs C.*        */
/* ------------------------------------------------------------------ */
export const C = {
  ink: "#1E2A1F",
  paper: "#EDEFE6",
  paperRaised: "#F7F8F2",
  gold: "#D9A441",
  goldDark: "#B3812C",
  green: "#3B6E52",
  greenDark: "#2A4E3B",
  brick: "#B4483A",
  navy: "#2B3A55",
  line: "#D3D3C2",
};

export const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@500&family=Inter:wght@400;500;600&display=swap');`;

export function ugx(n) {
  return "UGX " + Math.round(n || 0).toLocaleString("en-UG");
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
