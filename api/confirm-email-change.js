// api/confirm-email-change.js
//
// Step 2 of the "change account email" flow. Verifies the OTP the user
// typed against the hash stored on emailChangeOtps/{uid} (written by
// api/request-email-change.js). On success:
//   1. Updates the Firebase Auth account's email (Admin SDK — this is the
//      one operation that MUST happen server-side, since the client SDK's
//      updateEmail() would require a fresh client-side reauth token for an
//      already-verified account and can't be driven purely from an OTP).
//   2. Mirrors the new email onto users/{uid}.email, since that field (not
//      Firebase Auth) is what api/resolve-username.js reads for
//      username-based login (see lib/firestore.js:getEmailForUsername).
//   3. Deletes the used OTP doc so it can't be replayed.
//
// Security notes (mirrors verify-otp.js):
// - Compares hashes only, never the raw code.
// - Limits wrong-guess attempts (5) per issued code.
// - Rate-limited per uid on top of the attempts counter.
// - Requires Firebase ID token auth so a user can only confirm a change on
//   their OWN account/uid — never someone else's.
// - Re-checks the new email isn't already taken right before applying it
//   (closes the narrow window where someone else could have registered it
//   between request-email-change and this call).
//
// Request:  POST, Authorization: Bearer <Firebase ID token>, body: { otp: "123456" }
// Response: { ok: true, email: string } | { error: string }

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import crypto from "crypto";
import { requireAuth } from "./_lib/verifyAuth.js";
import { checkRateLimit } from "./_lib/rateLimit.js";

function getAdminApp() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not configured on server");
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getApps()[0];
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

const MAX_ATTEMPTS = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let decoded;
  try {
    decoded = await requireAuth(req);
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message });
  }
  const uid = decoded.uid;

  const rl = await checkRateLimit("confirm-email-change", uid, { requests: 10, windowSeconds: 60 });
  if (!rl.success) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many attempts — please wait a bit and try again." });
  }

  const otp = (req.body?.otp || "").trim();
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: "Enter the 6-digit code." });
  }

  try {
    getAdminApp();
    const adminAuth = getAuth();
    const db = getFirestore();

    const otpRef = db.collection("emailChangeOtps").doc(uid);
    const otpSnap = await otpRef.get();

    if (!otpSnap.exists) {
      return res.status(400).json({ error: "No pending email change found. Please start again." });
    }

    const { otpHash, newEmail, expiresAt, attempts = 0 } = otpSnap.data();

    if (Date.now() > expiresAt) {
      await otpRef.delete();
      return res.status(400).json({ error: "That code has expired. Please start again." });
    }

    if (attempts >= MAX_ATTEMPTS) {
      await otpRef.delete();
      return res.status(400).json({ error: "Too many incorrect attempts. Please start again." });
    }

    if (hashOtp(otp) !== otpHash) {
      await otpRef.update({ attempts: FieldValue.increment(1) });
      const remaining = MAX_ATTEMPTS - (attempts + 1);
      return res.status(400).json({ error: `Incorrect code. ${remaining} attempt(s) left.` });
    }

    // Re-check right before applying — closes the race where someone else
    // registers this email in the window between request and confirm.
    try {
      const existing = await adminAuth.getUserByEmail(newEmail);
      if (existing.uid !== uid) {
        await otpRef.delete();
        return res.status(400).json({ error: "That email is already in use by another account." });
      }
    } catch (e) {
      if (e?.code !== "auth/user-not-found") throw e;
      // Not found = still free, good.
    }

    // Apply the change. Firebase Auth's email is the source of truth for
    // login; users/{uid}.email is mirrored alongside it because that's the
    // field api/resolve-username.js reads for username-based login (see
    // getEmailForUsername in lib/firestore.js) — keeping both in sync here
    // means that lookup keeps working immediately, with no separate
    // client-side write required.
    await adminAuth.updateUser(uid, { email: newEmail, emailVerified: true });
    await db.collection("users").doc(uid).set({ email: newEmail }, { merge: true });
    await otpRef.delete();

    return res.status(200).json({ ok: true, email: newEmail });
  } catch (err) {
    if (err?.code === "auth/email-already-exists") {
      return res.status(400).json({ error: "That email is already in use by another account." });
    }
    return res.status(500).json({ error: err.message });
  }
}
