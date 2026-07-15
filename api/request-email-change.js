// api/request-email-change.js
//
// Step 1 of the "change account email" flow. Validates the requested new
// email (not already in use by another account) and emails a 6-digit OTP
// to THAT NEW ADDRESS — proving the user actually owns/controls it before
// anything is changed. The OTP hash + pending new email are stored on
// emailChangeOtps/{uid} (Admin SDK only, same isolation as otps/{uid} used
// by signup verification). Nothing on the account is modified yet — that
// only happens in api/confirm-email-change.js after the code is verified.
//
// Security notes (mirrors send-otp.js):
// - Only a SHA-256 hash of the OTP is ever persisted.
// - emailChangeOtps/{uid} is never exposed to Firestore security rules for
//   client read/write — Admin SDK only.
// - Requires Firebase ID token auth so a user can only request a change on
//   their OWN account.
// - Rate-limited per uid to stop resend-spam / brute-force setup abuse.
// - Refuses to send to an email already used by another Firebase Auth
//   account, so this can't be used to silently probe which emails are
//   registered beyond what Firebase's own error would already reveal.
//
// Request:  POST, Authorization: Bearer <Firebase ID token>, body: { newEmail: "..." }
// Response: { ok: true } | { error: string }

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import crypto from "crypto";
import { requireAuth } from "./_lib/verifyAuth.js";
import { checkRateLimit } from "./_lib/rateLimit.js";
import { sendEmailChangeOtpEmail } from "./_lib/mailer.js";

function getAdminApp() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not configured on server");
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getApps()[0];
}

function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const rl = await checkRateLimit("request-email-change", uid, { requests: 3, windowSeconds: 60 });
  if (!rl.success) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests — please wait a bit before trying again." });
  }

  const newEmail = (req.body?.newEmail || "").trim().toLowerCase();
  if (!EMAIL_RE.test(newEmail)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    getAdminApp();
    const adminAuth = getAuth();
    const db = getFirestore();

    const currentUser = await adminAuth.getUser(uid);
    if (newEmail === (currentUser.email || "").toLowerCase()) {
      return res.status(400).json({ error: "That's already your current email." });
    }

    // Refuse if another account already owns this email — mirrors the
    // check Firebase Auth itself would do on the actual update, just
    // surfaced earlier with a clearer message.
    try {
      await adminAuth.getUserByEmail(newEmail);
      return res.status(400).json({ error: "That email is already in use by another account." });
    } catch (e) {
      if (e?.code !== "auth/user-not-found") throw e;
      // user-not-found is the expected/good case — email is free.
    }

    const userSnap = await db.collection("users").doc(uid).get();
    const username = userSnap.exists ? userSnap.data()?.username : undefined;

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    await db.collection("emailChangeOtps").doc(uid).set({
      otpHash,
      newEmail,
      expiresAt,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    await sendEmailChangeOtpEmail({ to: newEmail, otp, username });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
