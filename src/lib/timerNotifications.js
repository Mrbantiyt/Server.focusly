// src/lib/timerNotifications.js
//
// Talks to api/schedule-timer-notification.js so the Study Timer's
// completion alert (sound + vibrate) reaches the user via push notification
// even if they've backgrounded or fully closed the app — the in-app beep in
// TimerCard.jsx only works while the tab/app is open and running.
//
// Both calls are intentionally "fire and forget" from the caller's point of
// view: a failure here (no push permission granted, network hiccup, server
// not configured) should never block or break the in-app timer itself,
// since the in-app beep is still the primary alert whenever the app is
// open. Errors are swallowed and logged rather than thrown.

import { auth } from "../firebase";

async function callScheduleApi(body) {
  const user = auth.currentUser;
  if (!user) return; // not signed in — nothing to schedule against
  try {
    const idToken = await user.getIdToken();
    await fetch("/api/schedule-timer-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn("[timerNotifications] request failed (non-fatal):", err);
  }
}

// Schedules a push notification `secondsFromNow` seconds out. Call this the
// moment the countdown starts (or resumes after a pause), passing however
// many seconds are left on the clock right now.
export function scheduleTimerNotification(secondsFromNow) {
  return callScheduleApi({ action: "schedule", seconds: secondsFromNow });
}

// Cancels a previously-scheduled notification. Call this on Pause and on
// Reset, so stopping the countdown early doesn't still buzz the phone later
// for a timer that's no longer running.
export function cancelTimerNotification() {
  return callScheduleApi({ action: "cancel" });
}
