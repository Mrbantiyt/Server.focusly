// api/backup-export.js
//
// Triggered weekly by Vercel Cron (see the `crons` entry in vercel.json).
// Dumps every top-level Firestore collection this app uses (users,
// usernames — plus each user's tasks/studyDays/aiChat/notifications
// subcollections) to a single timestamped JSON file in a private Supabase
// Storage bucket. This exists purely as a disaster-recovery / vendor
// lock-in safety net — if Firestore data were ever lost or you needed to
// migrate off it, you'd have a portable JSON snapshot instead of nothing.
//
// This is NOT a replacement for Firestore's own point-in-time recovery /
// scheduled backups (paid Firestore feature) — it's a free, simple
// supplement, and it's fine for a project this size. Restore is a manual,
// scripted process (read the JSON, re-`setDoc` each doc) — this endpoint
// only exports, it never writes back into Firestore.
//
// Required environment variables (already-existing ones are reused):
//   FIREBASE_SERVICE_ACCOUNT_KEY - same as send-study-reminders.js
//   SUPABASE_URL / SUPABASE_SECRET_KEY - same as supabase-upload.js
//   CRON_SECRET - same pattern as send-study-reminders.js
//   BACKUP_BUCKET_NAME - a SEPARATE, private Supabase bucket (not the
//                        public "Focusly" media bucket) — create this once
//                        in the Supabase dashboard, see README.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { withSentry } from "./_lib/sentry.js";

function getAdminDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not configured on server");
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

const BACKUP_BUCKET = process.env.BACKUP_BUCKET_NAME || "focusly-backups";

async function exportUserSubcollections(db, uid) {
  const subcollections = ["tasks", "studyDays", "aiChat", "notifications"];
  const out = {};
  for (const sub of subcollections) {
    const snap = await db.collection("users").doc(uid).collection(sub).get();
    out[sub] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return out;
}

async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  // Fail CLOSED: if CRON_SECRET isn't configured, refuse rather than allow
  // every request through unauthenticated (this endpoint dumps all user data).
  if (!cronSecret) {
    console.error("[backup-export] CRON_SECRET not configured on server — refusing request.");
    return res.status(500).json({ error: "Server misconfiguration" });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = getAdminDb();

    const [usersSnap, usernamesSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("usernames").get(),
    ]);

    const users = [];
    for (const doc of usersSnap.docs) {
      const subcollections = await exportUserSubcollections(db, doc.id);
      users.push({ id: doc.id, ...doc.data(), ...subcollections });
    }
    const usernames = usernamesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const snapshot = {
      exportedAt: new Date().toISOString(),
      userCount: users.length,
      users,
      usernames,
    };

    const filename = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(filename, Buffer.from(JSON.stringify(snapshot)), {
        contentType: "application/json",
        upsert: true, // same-day re-run overwrites rather than erroring
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    return res.status(200).json({ ok: true, filename, userCount: users.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default withSentry(handler);
