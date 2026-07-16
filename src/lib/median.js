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
//
// IMPORTANT TIMING NOTE: `window.median` (and its `.onesignal` sub-object)
// is injected by the native shell AFTER the page's JS has already started
// running — it is not guaranteed to exist on the very first check. Median's
// own docs recommend waiting for a "ready" signal rather than checking
// window.median immediately. A single immediate check that silently
// returns if the bridge isn't there yet (the previous version of this
// file) can permanently miss the subscription id if the bridge happens to
// become ready between polls, or logs nothing to explain why it never
// worked. This version waits for `median.onesignal` to actually exist
// before calling onesignalInfo(), logs every outcome to the console so a
// failure is visible instead of silent, and is safe to call repeatedly.
import { updateUserProfile } from "./firestore";

const LOG_PREFIX = "[median/push]";

// Resolves once `window.median.onesignal.onesignalInfo` exists, or resolves
// to false after `timeoutMs` if it never appears (e.g. plain browser tab,
// or the native bridge genuinely failed to inject).
function waitForOneSignalBridge(timeoutMs = 8000, pollMs = 250) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (window.median?.onesignal?.onesignalInfo) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, pollMs);
    };
    check();
  });
}

// Reads the device's OneSignal subscription id (assigned once the user
// grants push permission) and saves it to their Firestore profile, so a
// server-side job can later target this exact device via the OneSignal
// REST API. Safe to call on every app load — it's cheap and only writes
// when the id actually changes.
//
// Returns a status object so callers (e.g. the Settings screen) can show
// the person exactly what happened, without needing to open a browser
// console:
//   { state: "not-median" }        — regular browser tab, nothing to do
//   { state: "bridge-unavailable" } — inside the app, but OneSignal never
//                                      became available (native config issue)
//   { state: "no-permission" }      — bridge is fine, but no subscription id
//                                      yet (push permission not granted, or
//                                      still registering)
//   { state: "connected", oneSignalUserId, subscribed }
//   { state: "error", message }
export async function syncPushSubscription(uid) {
  if (!uid) return { state: "not-median" };
  if (typeof window === "undefined") return { state: "not-median" };
  if (!window.median) return { state: "not-median" };

  const bridgeReady = await waitForOneSignalBridge();
  if (!bridgeReady) {
    console.warn(`${LOG_PREFIX} window.median exists but onesignal.onesignalInfo never became available — OneSignal may not be configured for this app build (check Median App Studio > Native Plugins > OneSignal), or the app needs a rebuild.`);
    return { state: "bridge-unavailable" };
  }

  try {
    const info = await window.median.onesignal.onesignalInfo();
    // The new (non-legacy) OneSignal SDK returns the subscription id as
    // `oneSignalId` and subscription status nested under
    // `subscription.optedIn`, instead of the older `oneSignalUserId` /
    // `oneSignalSubscribed` fields. Check both shapes so this works
    // whether Legacy Mode is on or off in Median App Studio.
    const oneSignalUserId = info?.oneSignalId || info?.oneSignalUserId || null;
    const subscribed = info?.subscription?.optedIn ?? !!info?.oneSignalSubscribed;
    console.log(`${LOG_PREFIX} onesignalInfo() ->`, { oneSignalUserId, subscribed });

    if (!oneSignalUserId) {
      console.warn(`${LOG_PREFIX} No oneSignalUserId yet — user likely hasn't granted push permission, or OneSignal hasn't finished registering this device. Will retry on next poll.`);
      return { state: "no-permission", rawInfo: info };
    }
    await updateUserProfile(uid, { oneSignalUserId, pushSubscribed: subscribed });
    console.log(`${LOG_PREFIX} Saved oneSignalUserId to Firestore profile.`);
    return { state: "connected", oneSignalUserId, subscribed, rawInfo: info };
  } catch (err) {
    console.error(`${LOG_PREFIX} onesignalInfo() call failed:`, err);
    return { state: "error", message: err?.message || String(err) };
  }
}

// True only when running inside the Median-wrapped native app (not a
// regular browser tab), used to decide whether to show push-specific UI.
export function isMedianApp() {
  return typeof window !== "undefined" && !!window.median;
}
