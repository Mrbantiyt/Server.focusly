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

// -----------------------------------------------------------------------
// DIAGNOSTIC SAFETY NET
// -----------------------------------------------------------------------
// index.css paints #root's background dark (#0E0E16) unconditionally, so
// if App ever throws before/during its first render — a bad import, a
// Firebase init error, a failed dynamic import/chunk, anything — the user
// just sees a solid black screen with zero information, because nothing
// ever painted over that background. There's also no visible signal if a
// lazy-loaded chunk (import()) fails to fetch, which happens silently.
//
// This catches both cases and renders the actual error message directly
// on-screen (readable on any phone, no DevTools needed) instead of a
// mysterious black rectangle. Safe to leave in permanently — it only ever
// shows if something has already gone wrong.
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Focusly crashed during render:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100dvh", width: "100%", boxSizing: "border-box",
          background: "#0E0E16", color: "#F2F2F7", padding: 20,
          fontFamily: "monospace", fontSize: 13, lineHeight: 1.5,
          whiteSpace: "pre-wrap", overflowY: "auto",
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#FF7A85" }}>
            App failed to load
          </div>
          <div>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Also catches errors that happen OUTSIDE React's render cycle (e.g. a
// dynamic import() for a lazy-loaded chunk failing to fetch, or an async
// error thrown from a Promise) — React's error boundary above only catches
// errors thrown synchronously during render/lifecycle, not these.
window.addEventListener("error", (e) => {
  console.error("Uncaught error before/outside React render:", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
