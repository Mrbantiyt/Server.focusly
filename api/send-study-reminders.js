// api/send-study-reminders.js
//
// Triggered once a day by Vercel Cron (see the `crons` entry in
// vercel.json) at 12:30 UTC == 18:00 (6:00 PM) India Standard Time.
// Vercel's free Hobby plan only allows daily cron jobs, so every user
// currently gets the same fixed reminder time rather than a personalized
// one — see the "Study reminder" toggle in Settings → Notifications.
//
// For each user with `studyReminder.enabled === true` and a saved
// `oneSignalUserId` (captured client-side once they've opened the
// Median-wrapped app and granted push permission — see src/lib/median.js),
// this sends a push notification through the OneSignal REST API.
//
// Required environment variables (set in Vercel Project Settings):
//   ONESIGNAL_APP_ID       - from OneSignal dashboard > Settings > Keys & IDs
//   ONESIGNAL_REST_API_KEY - from the same page
//   FIREBASE_SERVICE_ACCOUNT_KEY - a Firebase service account JSON (as a
//                            single-line string) with Firestore read access
//                            to this project, used here (server-side only)
//                            to read which users have reminders enabled.
//   CRON_SECRET             - auto-provisioned by Vercel; verified below so
//                            only Vercel's own cron invocations (or calls
//                            that know the secret) can trigger a send.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not configured on server");
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

async function sendOneSignalPush(playerIds) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !restApiKey) throw new Error("ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY not configured on server");

  const resp = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${restApiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_subscription_ids: playerIds,
      headings: { en: "Time to study 📚" },
      contents: { en: "It's 6 PM — hop into Focusly and get some study time in today." },
      // Opens the app's home tab when the notification is tapped, via the
      // Median OneSignal integration's targetUrl convention.
      data: { targetUrl: "/" },
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.errors?.join(", ") || "OneSignal request failed");
  return data;
}

export default async function handler(req, res) {
  // Vercel automatically sends this header on real cron invocations. This
  // also allows manually triggering a test send by passing the same
  // secret as a Bearer token.
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  // Fail CLOSED: if CRON_SECRET isn't configured, refuse rather than allow
  // every request through unauthenticated.
  if (!cronSecret) {
    console.error("[send-study-reminders] CRON_SECRET not configured on server — refusing request.");
    return res.status(500).json({ error: "Server misconfiguration" });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("users").where("studyReminder.enabled", "==", true).get();

    const playerIds = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.oneSignalUserId) playerIds.push(d.oneSignalUserId);
    });

    if (playerIds.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, message: "No subscribed users with reminders enabled" });
    }

    // OneSignal accepts up to 2000 recipient ids per call; chunk just in
    // case this ever grows past that.
    const chunkSize = 2000;
    let sent = 0;
    for (let i = 0; i < playerIds.length; i += chunkSize) {
      const chunk = playerIds.slice(i, i + chunkSize);
      await sendOneSignalPush(chunk);
      sent += chunk.length;
    }

    return res.status(200).json({ ok: true, sent });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
