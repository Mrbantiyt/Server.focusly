// src/hooks/useAuth.js
import { useEffect, useState } from "react";
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile,
} from "firebase/auth";
import { auth } from "../firebase";
import { ensureUserProfile, claimUsername, getEmailForUsername, isUsernameAvailable, repairUsernameEmail } from "../lib/firestore";

// Calls a same-origin /api endpoint with the current user's Firebase ID
// token attached, so the server can trust req.uid without the client being
// able to spoof it. Used for the OTP send/verify endpoints.
async function callWithAuth(path, body) {
  const current = auth.currentUser;
  if (!current) throw new Error("Not signed in.");
  const idToken = await current.getIdToken();
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body || {}),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      // Fire-and-forget: fixes any username reservation left with a
      // missing/null email by an older buggy build. Safe to run on every
      // sign-in — it's a no-op once the doc is already correct.
      if (u) repairUsernameEmail(u.uid, u.email);
    });
    return unsub;
  }, []);

  // Signs up with username + email + password. Reserves the username first
  // (throws if taken) so we never end up with an auth account whose
  // username reservation silently failed. The account is created and
  // signed in immediately (unverified) — a 6-digit OTP is emailed right
  // after. The Firebase session has to stay alive for that OTP call (send/
  // verify both require an ID token), but App.jsx gates the UI: while
  // emailVerified is false it shows a blocking "verify your email" screen
  // instead of the dashboard, so the account can't actually be used until
  // the code is entered.
  const signupWithEmail = async ({ username, email, password }) => {
    const available = await isUsernameAvailable(username);
    if (!available) throw new Error("That username is already taken.");

    const result = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await updateProfile(result.user, { displayName: username });
      await ensureUserProfile(result.user);
      await claimUsername(result.user.uid, username, email);
    } catch (e) {
      // Roll back: if profile/username setup fails, don't leave the user
      // stuck signed-in with a half-created account.
      await signOut(auth);
      throw e;
    }

    // Best-effort: don't fail signup itself if the OTP email couldn't be
    // sent (e.g. mailer misconfigured) — the user can retry from the
    // verification screen ("Resend code").
    try {
      await callWithAuth("/api/send-otp");
    } catch {
      // swallow — Login.jsx's verification screen offers a resend button
    }

    return result.user;
  };

  // Logs in with either an email address or a username, plus password.
  const loginWithEmail = async ({ identifier, password }) => {
    const trimmed = identifier.trim();
    // A real email always has a domain with a dot after the @
    // (e.g. a@b.com). "@bantiraj" has no dot after the @, so it's
    // treated as a username typed with a leading @, not an email.
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

    let email = trimmed;
    if (!looksLikeEmail) {
      const foundEmail = await getEmailForUsername(trimmed);
      if (!foundEmail) throw new Error("No account found with that username.");
      email = foundEmail;
    }
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const logout = () => signOut(auth);

  // Requests a fresh OTP be emailed to the currently signed-in user.
  const sendOtp = () => callWithAuth("/api/send-otp");

  // Verifies the OTP the user typed; on success the server sets
  // users/{uid}.emailVerified = true.
  const verifyOtp = (otp) => callWithAuth("/api/verify-otp", { otp });

  return { user, loading, signupWithEmail, loginWithEmail, resetPassword, logout, sendOtp, verifyOtp };
}
