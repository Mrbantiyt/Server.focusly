// scripts/migrate-strip-username-emails.js
//
// ONE-TIME migration: strips the `email` field from every existing
// usernames/{key} document, since that field must no longer exist there
// (see the SECURITY comment in firestore.rules / firestore.js). Run this
// once, right after deploying the new firestore.rules and application
// code — old docs written before this fix still have email sitting on
// them and will keep leaking it publicly until this runs.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_KEY='<service account JSON as one line>' \
//     node scripts/migrate-strip-username-emails.js
//
// Safe to re-run — docs with no email field are simply skipped.

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
  const snap = await db.collection("usernames").get();
  console.log(`Found ${snap.size} usernames doc(s).`);

  let touched = 0;
  let batch = db.batch();
  let inBatch = 0;

  for (const d of snap.docs) {
    const data = d.data();
    if (Object.prototype.hasOwnProperty.call(data, "email")) {
      batch.update(d.ref, { email: FieldValue.delete() });
      touched++;
      inBatch++;
      if (inBatch >= 450) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
  }
  if (inBatch > 0) await batch.commit();

  console.log(`Stripped email from ${touched} doc(s). Done.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
