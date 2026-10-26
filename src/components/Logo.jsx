/* ------------------------------------------------------------------ */
/* Logo — an ascending ledger bar-chart in a rounded badge. Built from  */
/* the app's own palette rather than a generic icon.                    */
/* ------------------------------------------------------------------ */
import { C } from "../lib/theme.js";

export default function Logo({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="18" fill={C.greenDark} />
      <rect x="13" y="35" width="9" height="16" rx="2.5" fill={C.gold} />
      <rect x="27.5" y="23" width="9" height="28" rx="2.5" fill={C.paperRaised} />
      <rect x="42" y="12" width="9" height="39" rx="2.5" fill={C.gold} />
    </svg>
  );
}
