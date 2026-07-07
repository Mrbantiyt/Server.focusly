// src/hooks/useAuth.js
import { useEffect, useState } from "react";
import {
  onAuthStateChanged, signInWithPopup, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
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

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(result.user);
    return result.user;
  };

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
      await claimUsername(result.user.uid, username);
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
    let email = identifier;
    if (!identifier.includes("@")) {
      const foundEmail = await getEmailForUsername(identifier);
      if (!foundEmail) throw new Error("No account found with that username.");
      email = foundEmail;
    }
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const logout = () => signOut(auth);

  return { user, loading, loginWithGoogle, signupWithEmail, loginWithEmail, resetPassword, logout };
}
