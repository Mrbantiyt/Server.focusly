// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Error monitoring — only turns on if VITE_SENTRY_DSN is set (Vercel env
// vars / .env), so local dev without a DSN just skips it silently instead
// of throwing. Get a free DSN at https://sentry.io (see README section on
// monitoring setup).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1, // 10% of transactions — keeps free-tier quota under control
  });
}

// TEMPORARY DEBUG HELPER: shows any uncaught error directly on screen
// instead of a silent blank page, so a crash can be diagnosed on a phone
// with no access to devtools/console. Safe to remove once the underlying
// bug is fixed.
function showFatalError(err) {
  const root = document.getElementById("root");
  if (!root) return;
  const message = (err && (err.stack || err.message)) || String(err);
  root.innerHTML =
    '<div style="background:#1a0000;color:#ffb3b3;font-family:monospace;' +
    'font-size:13px;white-space:pre-wrap;padding:16px;min-height:100vh;' +
    'box-sizing:border-box;line-height:1.5;">' +
    '<div style="color:#ff6666;font-weight:bold;font-size:16px;margin-bottom:12px;">' +
    'App crashed — error below:</div>' +
    message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
    "</div>";
}

window.addEventListener("error", (e) => showFatalError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showFatalError(e.reason));

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("RootErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.error) {
      const message = this.state.error.stack || this.state.error.message || String(this.state.error);
      return (
        <div style={{
          background: "#1a0000", color: "#ffb3b3", fontFamily: "monospace",
          fontSize: 13, whiteSpace: "pre-wrap", padding: 16, minHeight: "100vh",
          boxSizing: "border-box", lineHeight: 1.5,
        }}>
          <div style={{ color: "#ff6666", fontWeight: "bold", fontSize: 16, marginBottom: 12 }}>
            App crashed — error below:
          </div>
          {message}
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  );
} catch (err) {
  showFatalError(err);
}
