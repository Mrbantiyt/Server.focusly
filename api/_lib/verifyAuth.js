// api/_lib/verifyAuth.js
//
// Shared helper: verifies the Firebase ID token sent by the client in the
// `Authorization: Bearer <idToken>` header. Every api/ endpoint that should
// only be usable by a logged-in user calls this first and stops immediately
// if it throws — this is what closes the "anyone can hit this URL with no
// login" gap that existed on openai-chat.js, telegram-upload.js and
// telegram-file.js.
//
// Requires the same FIREBASE_SERVICE_ACCOUNT_KEY env var already used by
// send-study-reminders.js (a Firebase service account JSON, as a
// single-line string, with at least Firebase Auth access).

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getAdminAuth() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not configured on server");
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getAuth();
}

// Throws on any failure (missing header, expired/invalid token, etc).
// On success, returns the decoded token, so callers can read decoded.uid.
export async function requireAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || !header.startsWith("Bearer ")) {
    const err = new Error("Missing Authorization header");
    err.statusCode = 401;
    throw err;
  }

  const idToken = header.slice("Bearer ".length).trim();
  if (!idToken) {
    const err = new Error("Empty bearer token");
    err.statusCode = 401;
    throw err;
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return decoded;
  } catch (e) {
    const err = new Error("Invalid or expired ID token");
    err.statusCode = 401;
    throw err;
  }
}
