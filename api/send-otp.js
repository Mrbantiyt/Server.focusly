// api/send-otp.js
//
// Generates a 6-digit OTP for email verification, stores a HASH of it
// (never the raw code) on otps/{uid} via the Admin SDK, and emails the raw
// code to the user via Gmail SMTP (see api/_lib/mailer.js).
//
// Security notes:
// - Only a SHA-256 hash of the OTP is ever persisted — even if the Firestore
//   data were somehow exposed, the raw code can't be recovered from it.
// - The otps/{uid} collection is never exposed to Firestore security rules
//   for client read/write (see firestore.rules) — Admin SDK only, so a
//   client can never plant or read another user's code.
// - Requires Firebase ID token auth (requireAuth) so only the currently
//   signed-in user can request a code be (re)sent to their own account —
//   this can't be used to spam arbitrary email addresses.
// - Rate-limited per uid to stop resend-spam abuse.
//
// Request:  POST, Authorization: Bearer <Firebase ID token>
// Response: { ok: true } | { error: string }

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";
import { requireAuth } from "./_lib/verifyAuth.js";
import { checkRateLimit } from "./_lib/rateLimit.js";
import { sendOtpEmail } from "./_lib/mailer.js";

function getAdminDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not configured on server");
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

function generateOtp() {
  // 6-digit numeric code, zero-padded (e.g. "004821")
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

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
  const tokenEmail = decoded.email;

  const rl = await checkRateLimit("send-otp", uid, { requests: 3, windowSeconds: 60 });
  if (!rl.success) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests — please wait a bit before requesting another code." });
  }

  try {
    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    const email = userSnap.exists ? userSnap.data()?.email : tokenEmail;
    if (!email) {
      return res.status(400).json({ error: "No email on file for this account." });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    await db.collection("otps").doc(uid).set({
      otpHash,
      expiresAt,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    const username = userSnap.exists ? userSnap.data()?.username : undefined;
    await sendOtpEmail({ to: email, otp, username });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
