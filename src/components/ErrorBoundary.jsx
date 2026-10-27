/* Last line of defence: if anything unexpected breaks while the app is
   drawing, show a calm recovery screen instead of a blank white page.
   Nothing is deleted — the shop's records live safely in this device's storage. */
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Visible in the browser console / remote debugging for diagnosis.
    console.error("ProfitMind crashed while rendering:", error, info && info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#EDEFE6", color: "#1E2A1F", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px", fontFamily: "Fraunces, Georgia, serif" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, opacity: 0.75, margin: "0 0 16px" }}>
            ProfitMind hit an unexpected problem and stopped. <strong>Your shop's records are safe</strong> — they're stored on this device and haven't been changed.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#2A4E3B", color: "white", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" }}
          >
            Reload ProfitMind
          </button>
          <p style={{ fontSize: 11, opacity: 0.5, margin: "16px 0 0", wordBreak: "break-word" }}>
            Details for support: {String((this.state.error && this.state.error.message) || this.state.error).slice(0, 160)}
          </p>
        </div>
      </div>
    );
  }
}
