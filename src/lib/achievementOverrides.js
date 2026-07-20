// src/lib/achievementOverrides.js
//
// Fetches admin-set overrides (field edits on built-in achievements) and
// fully custom admin-added achievements from Firestore, so the app can
// merge them onto the hardcoded ACHIEVEMENTS list without needing its own
// admin-only write path — all writes happen from the admin panel via the
// Admin SDK (see focusly-admin-panel/api/store-items.js, resource=
// achievements). Clients only ever read these two collections (see
// firestore.rules).
//
// LIVE-SYNCED (not one-time fetch): achievements are edited from the
// separate admin panel while this app may already be open in someone's
// session, so this uses onSnapshot listeners rather than a single getDocs
// call — a change the admin makes (new achievement, edited reward, etc.)
// shows up here within moments. A shared in-memory cache is kept (and
// pushed to every subscriber immediately if already populated) so repeated
// reads across components stay instant; only the underlying data source is
// "live" instead of "fetch once forever". Structurally identical to
// src/lib/storeOverrides.js — see that file for the same pattern applied
// to Store items.

import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { mergeAchievements } from "./achievements";

let cache = null; // { overrides: {id: {...fields}}, custom: [{id, ...fields}] }
const subscribers = new Set();
let overridesUnsub = null;
let customUnsub = null;
let latestOverrides = {};
let latestCustom = [];

function publish() {
  cache = { overrides: latestOverrides, custom: latestCustom };
  subscribers.forEach((cb) => cb(cache));
}

// Starts the live listeners exactly once (module-level, shared across every
// caller/component), so we don't open duplicate Firestore subscriptions
// per hook instance.
function ensureListening() {
  if (overridesUnsub) return; // already listening

  overridesUnsub = onSnapshot(
    collection(db, "achievementOverrides"),
    (snap) => {
      const overrides = {};
      snap.forEach((d) => { overrides[d.id] = d.data(); });
      latestOverrides = overrides;
      publish();
    },
    (err) => console.warn("achievementOverrides listener error, keeping last known values:", err)
  );

  customUnsub = onSnapshot(
    collection(db, "achievementsCustom"),
    (snap) => {
      latestCustom = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      publish();
    },
    (err) => console.warn("achievementsCustom listener error, keeping last known values:", err)
  );
}

// Returns the current overrides/custom snapshot, subscribing `onUpdate` (if
// given) to receive every future live update too. Returns an unsubscribe
// function.
export function watchAchievementOverrides(onUpdate) {
  ensureListening();
  if (onUpdate) {
    subscribers.add(onUpdate);
    if (cache) onUpdate(cache); // deliver whatever we already have immediately
  }
  return () => { if (onUpdate) subscribers.delete(onUpdate); };
}

// Convenience hook: returns the fully merged achievement list (built-in +
// overrides + custom), live-updating whenever the admin changes anything.
// Starts from the plain built-in list so achievements render immediately
// on first paint, then re-merges once the first Firestore snapshot lands.
export function useMergedAchievements() {
  const [merged, setMerged] = useState(() => mergeAchievements({}, []));
  useEffect(() => {
    const unsub = watchAchievementOverrides(({ overrides, custom }) => {
      setMerged(mergeAchievements(overrides, custom));
    });
    return unsub;
  }, []);
  return merged;
}
