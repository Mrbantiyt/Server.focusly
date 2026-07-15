// api/verify-otp.js
//
// Verifies the 6-digit OTP the user typed against the hash stored on
// otps/{uid} (written by api/send-otp.js). On success, sets
// users/{uid}.emailVerified = true and deletes the used OTP doc so it can't
// be replayed.
//
// Security notes:
// - Compares hashes (never stores/compares the raw code at rest).
// - Limits wrong-guess attempts (5) per issued code, then requires a fresh
//   code via send-otp — stops someone from brute-forcing a 6-digit code
//   (1 in 1,000,000) via unlimited guesses.
// - Also rate-limited per uid on top of the attempts counter, since a fresh
//   OTP request resets attempts back to 0.
// - Requires Firebase ID token auth so a user can only verify their OWN
//   account, never someone else's uid.
//
// Request:  POST, Authorization: Bearer <Firebase ID token>, body: { otp: "123456" }
// Response: { ok: true } | { error: string }

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";
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

  const rl = await checkRateLimit("verify-otp", uid, { requests: 10, windowSeconds: 60 });
  if (!rl.success) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many attempts — please wait a bit and try again." });
  }

  const otp = (req.body?.otp || "").trim();
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: "Enter the 6-digit code." });
  }

  try {
    const db = getAdminDb();
    const otpRef = db.collection("otps").doc(uid);
    const otpSnap = await otpRef.get();

    if (!otpSnap.exists) {
      return res.status(400).json({ error: "No verification code found. Please request a new one." });
    }

    const { otpHash, expiresAt, attempts = 0 } = otpSnap.data();

    if (Date.now() > expiresAt) {
      await otpRef.delete();
      return res.status(400).json({ error: "That code has expired. Please request a new one." });
    }

    if (attempts >= MAX_ATTEMPTS) {
      await otpRef.delete();
      return res.status(400).json({ error: "Too many incorrect attempts. Please request a new code." });
    }

    if (hashOtp(otp) !== otpHash) {
      await otpRef.update({ attempts: FieldValue.increment(1) });
      const remaining = MAX_ATTEMPTS - (attempts + 1);
      return res.status(400).json({ error: `Incorrect code. ${remaining} attempt(s) left.` });
    }

    // Correct — mark verified and clean up the used code.
    await db.collection("users").doc(uid).set({ emailVerified: true }, { merge: true });
    await otpRef.delete();

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
