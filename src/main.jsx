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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
