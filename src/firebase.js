// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCsrq5ZK-v3HaAfO8kaV0rzfDnodXAq5MA",
  authDomain: "focuslyread.firebaseapp.com",
  projectId: "focuslyread",
  storageBucket: "focuslyread.firebasestorage.app",
  messagingSenderId: "609684086563",
  appId: "1:609684086563:web:9ec48971332c4aa1deb696",
  measurementId: "G-MGLFNDZFWV",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline persistence: Firestore reads are served from a local IndexedDB
// cache first (instant, no network round-trip) and kept in sync in the
// background, instead of every read/listener waiting on the network. This
// is what actually makes the app feel faster overall — repeat loads (tasks,
// study history, stopwatch value) show cached data immediately instead of
// a blank/loading state until the server responds. persistentMultipleTabManager
// lets this work correctly if the user has the app open in more than one
// browser tab at once (falls back gracefully to memory-only cache in
// environments that don't support IndexedDB, e.g. some in-app webviews, so
// this never breaks the app — it just loses the speed-up there).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Analytics only works in the browser and only if the browser supports it
export let analytics = null;
analyticsSupported().then((ok) => {
  if (ok) analytics = getAnalytics(app);
});
