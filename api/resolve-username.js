// api/resolve-username.js
//
// SECURITY FIX: previously the client resolved "username -> email" by
// reading usernames/{usernameLower} directly from Firestore, which meant
// that document had to be publicly readable (login-by-username happens
// BEFORE the user is authenticated) — and since email lived on that same
// doc, ANYONE could enumerate usernames and harvest email addresses.
//
// This endpoint moves that lookup server-side. The public
// usernames/{usernameLower} doc now only ever stores { uid } — no email —
// so it can stay publicly readable (still needed for username-availability
// checks) without leaking anything. Email now lives ONLY on users/{uid},
// which is private, and this endpoint (using the Admin SDK, which bypasses
// security rules) is the one place allowed to cross that boundary, and only
// to return a single email for a single valid username — not to list or
// search anything.
//
// Request:  POST, body: { username: "someuser" }
// Response: { email: string | null }

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

function normalizeUsername(username) {
  return (username || "").trim().replace(/^@/, "").toLowerCase();
}

// This endpoint is unauthenticated by necessity (username lookup happens
// before login), so it's rate-limited by IP instead of uid — otherwise it's
// an open username -> email-existence oracle a bot could hammer.
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit("resolve-username", ip, { requests: 5, windowSeconds: 60 });
  if (!rl.success) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests — please slow down and try again shortly." });
  }

  const key = normalizeUsername(req.body?.username);
  if (!key) {
    return res.status(400).json({ error: "username required" });
  }

  try {
    const db = getAdminDb();

    const usernameSnap = await db.collection("usernames").doc(key).get();
    if (!usernameSnap.exists) {
      return res.status(200).json({ email: null });
    }
    const uid = usernameSnap.data()?.uid;
    if (!uid) {
      return res.status(200).json({ email: null });
    }

    // Email lives on the private users/{uid} doc now, not on the public
    // usernames doc — this Admin SDK read is the only path that can see it
    // before the user is authenticated.
    const userSnap = await db.collection("users").doc(uid).get();
    const email = userSnap.exists ? userSnap.data()?.email || null : null;

    return res.status(200).json({ email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
