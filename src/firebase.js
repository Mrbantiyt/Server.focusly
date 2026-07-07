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
import { getFirestore } from "firebase/firestore";

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
export const db = getFirestore(app);

// Analytics only works in the browser and only if the browser supports it
export let analytics = null;
analyticsSupported().then((ok) => {
  if (ok) analytics = getAnalytics(app);
});
