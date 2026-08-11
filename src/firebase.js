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
  memoryLocalCache,
} from "firebase/firestore";

// Your web app's Firebase configuration.
//
// NOTE ON apiKey: this is NOT a secret, even though it looks like one.
// Firebase web API keys only identify which Firebase project a request
// belongs to — they don't grant access to anything by themselves. Actual
// access control is enforced server-side by firestore.rules (see that
// file) and by Firebase Auth. It's safe and expected for this to be
// visible in client-side code / browser devtools / your public bundle;
// Google's own docs confirm this. Do not move this to an env var expecting
// it to become secret — it won't, and NEXT_PUBLIC_/VITE_-style env vars
// end up in the client bundle anyway, so nothing would actually change.
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
// browser tab at once.
//
// IMPORTANT: initializeFirestore() with persistentLocalCache runs at
// MODULE LOAD TIME, before React ever mounts — and on some real-world
// mobile environments (IndexedDB blocked by device storage policy,
// private/incognito mode on certain Android builds, some in-app webviews,
// storage quota already exhausted, etc.) it throws SYNCHRONOUSLY instead
// of quietly falling back. Because this happens during import — before
// App.jsx, before main.jsx's error boundary can mount anything — an
// uncaught throw here takes down the entire app with literally nothing on
// screen (just index.css's plain dark background showing through an empty
// #root), and no error boundary can ever catch it because nothing ever
// got the chance to run. This was very likely the actual cause of the
// blank black screen.
//
// Fix: try persistent (IndexedDB) cache first: if the environment can't
// support it, catch the throw and re-initialize with a plain in-memory
// cache instead. The app still works fully either way — the only
// difference is whether Firestore reads are cached across page reloads.
function createFirestoreDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn(
      "Firestore persistent (IndexedDB) cache unavailable in this environment — " +
      "falling back to in-memory cache. The app will still work normally; " +
      "it just won't cache data across page reloads.",
      err
    );
    try {
      return initializeFirestore(app, { localCache: memoryLocalCache() });
    } catch (err2) {
      // Last resort: no explicit cache config at all (Firestore's default).
      console.warn("Firestore memoryLocalCache also failed — using default init.", err2);
      return initializeFirestore(app, {});
    }
  }
}

export const db = createFirestoreDb();

// Analytics only works in the browser and only if the browser supports it
export let analytics = null;
analyticsSupported().then((ok) => {
  if (ok) analytics = getAnalytics(app);
});
