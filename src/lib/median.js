// src/lib/median.js
//
// Focusly is shipped as a native app via Median.co, which wraps this same
// website in a native shell. Median exposes a `median` JS object at
// runtime (only inside the wrapped app — it does not exist in a normal
// browser tab), which bridges to native plugins like OneSignal push.
// See: https://docs.median.co/docs/onesignal
//
// This only matters for users on the Median-wrapped app. When Focusly is
// opened as a regular website (e.g. testing in a desktop/mobile browser),
// `window.median` is undefined and everything here safely no-ops.
import { updateUserProfile } from "./firestore";

// Reads the device's OneSignal subscription id (assigned once the user
// grants push permission) and saves it to their Firestore profile, so a
// server-side job can later target this exact device via the OneSignal
// REST API. Safe to call on every app load — it's cheap and only writes
// when the id actually changes.
export async function syncPushSubscription(uid) {
  if (!uid) return;
  if (typeof window === "undefined" || !window.median?.onesignal?.onesignalInfo) return;
  try {
    const info = await window.median.onesignal.onesignalInfo();
    const oneSignalUserId = info?.oneSignalUserId || null;
    const subscribed = !!info?.oneSignalSubscribed;
    if (oneSignalUserId) {
      await updateUserProfile(uid, { oneSignalUserId, pushSubscribed: subscribed });
    }
  } catch {
    // Median bridge not ready / not running inside the wrapped app — ignore.
  }
}

// True only when running inside the Median-wrapped native app (not a
// regular browser tab), used to decide whether to show push-specific UI.
export function isMedianApp() {
  return typeof window !== "undefined" && !!window.median;
}
