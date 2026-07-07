// src/hooks/useAuth.js
import { useEffect, useState } from "react";
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile,
} from "firebase/auth";
import { auth } from "../firebase";
import { ensureUserProfile, claimUsername, getEmailForUsername, isUsernameAvailable } from "../lib/firestore";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Signs up with username + email + password. Reserves the username first
  // (throws if taken) so we never end up with an auth account whose
  // username reservation silently failed.
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

  return { user, loading, signupWithEmail, loginWithEmail, resetPassword, logout };
}
