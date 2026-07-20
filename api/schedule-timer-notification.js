// api/schedule-timer-notification.js
//
// Study Timer AND Custom (multi-subject) Timer completion alert, delivered
// even if the app is closed/backgrounded.
//
// NOTE — shared single slot per user: both src/hooks/useCountdownTimer.js
// (Study Timer) and src/hooks/useSubjectTimer.js (Custom Timer) call this
// same endpoint and share one `users/{uid}.timerNotification` slot. Each
// Start replaces whatever was previously scheduled here. This matches how
// the in-app countdowns already work (both bank into the same "Time today"
// total) and covers the normal case of running one timer at a time. If a
// user starts BOTH timers at once, whichever Start call lands last wins the
// scheduled push slot — a rare edge case, not handled specially here.
//
// The Timer card's in-app beep (src/components/TimerCard.jsx) only fires
// while the tab/app is open and in memory — if the user backgrounds the app
// or locks their phone, that JS timer is suspended and the beep never
// happens. To guarantee the "your timer is done" alert (sound + vibrate)
// reaches the user regardless, we ask OneSignal to deliver a push at a
// specific future time using its `send_after` scheduling parameter — this
// is a single "schedule and forget" API call made the moment the user
// presses Start; no server-side polling or cron job is needed to make it
// fire later.
//
// Two actions, both POST, both require a signed-in user (Firebase ID token):
//   { action: "schedule", seconds: <number> }  -> schedules a push `seconds`
//       from now, cancelling any previously-scheduled one for this user
//       first (so pressing Start again, e.g. after Reset, doesn't stack
//       duplicate alerts).
//   { action: "cancel" }  -> cancels a previously-scheduled push (called on
//       Pause/Reset, so pausing early doesn't still buzz the phone later
//       for a countdown that's no longer running).
//
// Requires (same as api/send-study-reminders.js):
//   ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, FIREBASE_SERVICE_ACCOUNT_KEY
//
// Notification ids are kept in Firestore at users/{uid}.timerNotification =
// { id, scheduledFor } so a later cancel call knows what to cancel, and so
// a stale/expired id left over from a previous session doesn't cause
// errors (cancelling an already-delivered id is treated as a no-op).

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { requireAuth } from "./_lib/verifyAuth.js";
import { checkRateLimit } from "./_lib/rateLimit.js";

function getAdminDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not configured on server");
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

async function createScheduledPush(playerId, sendAfterIso) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !restApiKey) throw new Error("ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY not configured on server");

  const resp = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${restApiKey}` },
    body: JSON.stringify({
      app_id: appId,
      include_subscription_ids: [playerId],
      send_after: sendAfterIso,
      headings: { en: "Timer complete! ⏰" },
      contents: { en: "Your timer is completed, please reset it." },
      data: { targetUrl: "/" },
      // Ensures the device actually vibrates/sounds on delivery, not just a
      // silent notification-center entry.
      android_sound: "default",
      ios_sound: "default",
      priority: 10,
    }),
  });

  const data = await resp.json();
  // OneSignal can return HTTP 200 with an empty id and a populated `errors`
  // array (e.g. the subscription id is unsubscribed/invalid) — that's a
  // failed send, not a success, even though resp.ok is true. Checking only
  // resp.ok let failures pass through silently with no notification ever
  // actually scheduled.
  if (!resp.ok || !data?.id) {
    const reason = Array.isArray(data?.errors) ? data.errors.join(", ") : JSON.stringify(data?.errors || data);
    throw new Error(reason || "OneSignal schedule request failed");
  }
  return data.id; // OneSignal notification id — needed to cancel later
}

async function cancelScheduledPush(notificationId) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !restApiKey) throw new Error("ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY not configured on server");

  const resp = await fetch(
    `https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${appId}`,
    { method: "DELETE", headers: { Authorization: `Basic ${restApiKey}` } }
  );
  // A 200 means it was cancelled; a 404 just means it already fired or
  // expired — both are fine outcomes for a cancel, so only genuine errors
  // (5xx, auth failures) should surface.
  if (!resp.ok && resp.status !== 404) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.errors?.join(", ") || `OneSignal cancel failed (${resp.status})`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let decoded;
  try {
    decoded = await requireAuth(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }
  const uid = decoded.uid;

  const rl = await checkRateLimit("schedule-timer-notification", uid, { requests: 30, windowSeconds: 60 });
  if (!rl.success) return res.status(429).json({ error: "Too many requests, please slow down." });

  const db = getAdminDb();
  const userRef = db.collection("users").doc(uid);

  try {
    const { action, seconds } = req.body || {};

    if (action === "cancel") {
      const snap = await userRef.get();
      const existing = snap.exists ? snap.data().timerNotification : null;
      if (existing?.id) {
        await cancelScheduledPush(existing.id).catch(() => {}); // best-effort — don't fail the request over a stale/already-fired id
        await userRef.set({ timerNotification: null }, { merge: true });
      }
      return res.status(200).json({ ok: true, cancelled: !!existing?.id });
    }

    if (action === "schedule") {
      const delaySeconds = Math.max(1, Math.floor(Number(seconds)));
      if (!Number.isFinite(delaySeconds)) return res.status(400).json({ error: "Invalid seconds" });
      // Cap at 24h — matches OneSignal's own scheduling window and avoids
      // accidentally scheduling something absurd from a bad client value.
      if (delaySeconds > 24 * 3600) return res.status(400).json({ error: "seconds too large (max 24h)" });

      const snap = await userRef.get();
      const profile = snap.exists ? snap.data() : {};
      const playerId = profile.oneSignalUserId;
      if (!playerId) {
        // Not an error — the user just hasn't granted push permission (or
        // isn't on the Median-wrapped app). The in-app beep still covers
        // them while the app is open.
        return res.status(200).json({ ok: true, scheduled: false, reason: "No push subscription for this user" });
      }

      // Cancel any previous pending alert for this user first, so
      // Start -> Reset -> Start doesn't leave two alerts scheduled.
      const existing = profile.timerNotification;
      if (existing?.id) await cancelScheduledPush(existing.id).catch(() => {});

      const sendAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();
      let notificationId;
      try {
        notificationId = await createScheduledPush(playerId, sendAfter);
      } catch (err) {
        console.error(`[schedule-timer-notification] OneSignal schedule failed for uid=${uid}, subscription_id=${playerId}:`, err.message);
        throw err;
      }
      await userRef.set({ timerNotification: { id: notificationId, scheduledFor: sendAfter } }, { merge: true });

      return res.status(200).json({ ok: true, scheduled: true, sendAfter });
    }

    return res.status(400).json({ error: "action must be 'schedule' or 'cancel'" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
