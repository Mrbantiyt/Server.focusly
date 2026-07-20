// scripts/migrate-clear-stale-onesignal-ids.js
//
// ONE-TIME migration for the OneSignal subscription-id bug fix in
// src/lib/median.js (previously saved the user-level `oneSignalId`
// instead of the per-device `subscription.id`, so pushes silently
// failed to reach existing devices even though Firestore had *a* value
// in `oneSignalUserId`).
//
// IMPORTANT: there is no way to recover the correct subscription id
// from the server side — it only exists on the user's device, inside
// the Median/OneSignal native bridge. This script cannot "fix" the ID
// itself. What it does instead is clear out the stale/incorrect value
// and mark the doc so the next time that user opens the (now-fixed)
// app, syncPushSubscription() in src/lib/median.js re-fetches and
// saves the correct subscription id automatically — no manual Firestore
// editing needed per user.
//
// This means: users who don't reopen the app won't be fixed by running
// this script alone. It just clears the bad data so nothing stale lingers
// and so you can see (via pushNeedsResync) who still hasn't reopened
// the app since the fix.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_KEY='<service account JSON as one line>' \
//     node scripts/migrate-clear-stale-onesignal-ids.js
//
// Safe to re-run.

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY env var is required.");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

async function main() {
  const snap = await db.collection("users").where("oneSignalUserId", "!=", null).get();
  console.log(`Found ${snap.size} user doc(s) with an existing oneSignalUserId.`);

  let cleared = 0;
  const CHUNK = 450;
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + CHUNK)) {
      batch.update(doc.ref, {
        // Drop the (likely stale/incorrect) id so nothing keeps
        // targeting a subscription id that may not actually exist.
        oneSignalUserId: FieldValue.delete(),
        pushSubscribed: false,
        // Lets you query for "who hasn't reconnected since the fix"
        // and, if you want, surface a "reconnect push" prompt in-app.
        pushNeedsResync: true,
      });
      cleared++;
    }
    await batch.commit();
    console.log(`Cleared ${Math.min(i + CHUNK, docs.length)}/${docs.length}...`);
  }

  console.log(`Done. Cleared stale oneSignalUserId on ${cleared} doc(s).`);
  console.log(
    "These users will get a correct subscription id saved automatically " +
    "the next time they open the app (via syncPushSubscription in " +
    "src/lib/median.js) — no further action needed per user."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
