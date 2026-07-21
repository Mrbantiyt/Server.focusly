// src/hooks/useLiveClock.js
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// A live wall-clock — the real current date/time, ticking every second.
// ---------------------------------------------------------------------------
// Unlike the countdown/stopwatch timers in this app, this hook has no drift
// risk at all: it never accumulates or counts anything. Every tick just
// reads `new Date()` fresh, so whatever the device's system clock says IS
// the value — a throttled/backgrounded interval can only make the display
// update less often, never make it WRONG. The moment the app is
// foregrounded again, the next render (forced by the visibility listener
// below) reads the current real time immediately, so there's no stale
// catch-up delay either.
export function useLiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);

    // Snap to the real time immediately on foreground, rather than waiting
    // up to 1s for the next throttled-then-resumed tick.
    const onVisibility = () => { if (document.visibilityState === "visible") setNow(new Date()); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  return now;
}
