// api/_lib/sentry.js
//
// Minimal Sentry setup for Vercel serverless functions. Wrap any handler
// with withSentry(handler) to auto-capture unhandled errors and report
// them to Sentry, in addition to whatever the handler already returns to
// the client.
//
// Requires SENTRY_DSN env var (server-side — no VITE_ prefix). If unset,
// this is a no-op passthrough so local dev doesn't need a DSN configured.

import * as Sentry from "@sentry/node";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
  }
  initialized = true;
}

export function withSentry(handler) {
  return async function wrapped(req, res) {
    ensureInit();
    try {
      return await handler(req, res);
    } catch (err) {
      if (process.env.SENTRY_DSN) {
        Sentry.captureException(err);
        await Sentry.flush(2000); // give the event time to send before the function freezes
      }
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}
