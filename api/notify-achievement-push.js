// api/notify-achievement-push.js
//
// Fires a OneSignal push ("Achievement unlocked! 🏆 <name>") the moment a
// user unlocks an achievement, mirroring what already happens for the
// Study/Custom Timer (api/schedule-timer-notification.js) and the admin
// panel's broadcast messages (send-notification.js in the admin project).
//
// The achievement itself is unlocked, paid, and recorded in the user's
// in-app notifications bell entirely client-side (see
// src/lib/firestore.js's unlockAchievements + src/lib/notifications.js's
// notifyAchievementUnlocked) — that path is untouched. This endpoint is
// ONLY responsible for the push nudge on top, so a missing/failed push
// here never blocks or affects the actual unlock/reward.
//
// POST body: { achievementName: string }
// Requires a signed-in user (Firebase ID token, same as
// schedule-timer-notification.js).
//
// Best-effort by design: any failure (no push permission granted, OneSignal
// not configured, network hiccup) just means no push nudge went out — the
// achievement was still unlocked and still shows up in the in-app bell.
// Callers should treat a non-200 here as non-fatal.

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

async function sendOneSignalPush(playerId, title, message) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !restApiKey) return { skipped: true };

  const resp = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${restApiKey}` },
    body: JSON.stringify({
      app_id: appId,
      include_subscription_ids: [playerId],
      headings: { en: title },
      contents: { en: message },
      data: { targetUrl: "/" },
      android_sound: "default",
      ios_sound: "default",
    }),
  });
  const data = await resp.json();
  if (!resp.ok || data?.errors) {
    throw new Error(Array.isArray(data?.errors) ? data.errors.join(", ") : "OneSignal request failed");
  }
  return data;
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

  const rl = await checkRateLimit("notify-achievement-push", uid, { requests: 30, windowSeconds: 60 });
  if (!rl.success) return res.status(429).json({ error: "Too many requests, please slow down." });

  try {
    const { achievementName } = req.body || {};
    if (!achievementName?.trim()) {
      return res.status(400).json({ error: "Missing achievementName" });
    }

    const db = getAdminDb();
    const snap = await db.collection("users").doc(uid).get();
    const playerId = snap.exists ? snap.data().oneSignalUserId : null;

    if (!playerId) {
      // Not an error — user just hasn't granted push permission, or isn't
      // on the Median-wrapped app. The in-app bell entry still covers them.
      return res.status(200).json({ ok: true, pushSent: false, reason: "No push subscription for this user" });
    }

    try {
      const result = await sendOneSignalPush(playerId, "Achievement unlocked! 🏆", achievementName.trim());
      return res.status(200).json({ ok: true, pushSent: !result?.skipped });
    } catch (err) {
      console.error(`[notify-achievement-push] OneSignal send failed for uid=${uid}:`, err.message);
      return res.status(200).json({ ok: true, pushSent: false, pushError: err.message });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
