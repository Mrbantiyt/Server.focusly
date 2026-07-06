// src/lib/firestore.js
import {
  doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, documentId, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/* ---------------------------- study day (stopwatch) ---------------------------- */

// One doc per user per study-day: users/{uid}/studyDays/{dayKey} = { seconds }
export async function getStudyDay(uid, dayKey) {
  const ref = doc(db, "users", uid, "studyDays", dayKey);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data().seconds || 0 : 0;
}

export async function setStudyDay(uid, dayKey, seconds) {
  const ref = doc(db, "users", uid, "studyDays", dayKey);
  await setDoc(ref, { seconds, updatedAt: serverTimestamp() }, { merge: true });
}

// Live-listen to today's doc so the stopwatch stays in sync across tabs/devices
export function watchStudyDay(uid, dayKey, cb) {
  const ref = doc(db, "users", uid, "studyDays", dayKey);
  return onSnapshot(ref, (snap) => cb(snap.exists() ? snap.data().seconds || 0 : 0));
}

// Range query across day-key docs (day keys are "YYYY-MM-DD" strings, so they
// sort correctly) — used to fill the calendar and the 7-day/1-month graph.
export function watchStudyHistory(uid, startKey, endKey, cb) {
  const ref = collection(db, "users", uid, "studyDays");
  const q = query(ref, where(documentId(), ">=", startKey), where(documentId(), "<=", endKey));
  return onSnapshot(q, (snap) => {
    const history = {};
    snap.forEach((d) => { history[d.id] = d.data().seconds || 0; });
    cb(history);
  });
}

/* ---------------------------------- tasks -------------------------------------- */

// users/{uid}/tasks/{taskId} = {
//   title, tag, elapsed, running, done, createdAt,
//   goals: [{ id, text, done, photoPath }]   <- photoPath is a Telegram file
//                                               path (see src/lib/media.js),
//                                               NOT a raw URL (keeps the bot
//                                               token server-side only).
// }
// `done` is derived automatically: true once every goal in `goals` is done
// (a task with zero goals is completed manually via the checkmark instead).
export function watchTasks(uid, cb) {
  const ref = collection(db, "users", uid, "tasks");
  return onSnapshot(ref, (snap) => {
    const tasks = snap.docs.map((d) => ({ id: d.id, goals: [], ...d.data() }));
    tasks.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    cb(tasks);
  });
}

export async function addTask(uid, title, tag = "Medium") {
  const ref = collection(db, "users", uid, "tasks");
  await addDoc(ref, {
    title, tag, done: false, elapsed: 0, running: false, goals: [],
    createdAt: serverTimestamp(),
  });
}

export async function updateTask(uid, taskId, patch) {
  const ref = doc(db, "users", uid, "tasks", taskId);
  await updateDoc(ref, patch);
}

export async function deleteTask(uid, taskId) {
  const ref = doc(db, "users", uid, "tasks", taskId);
  await deleteDoc(ref);
}

// Add a new goal (sub-step) to a task.
export async function addGoal(uid, taskId, currentGoals, text) {
  const goal = { id: `${Date.now()}`, text, done: false, photoPath: null };
  const goals = [...(currentGoals || []), goal];
  await updateTask(uid, taskId, { goals, done: false });
  return goals;
}

// Mark a goal done/undone. When marking done, `photoPath` (from
// uploadProofPhoto) is attached as proof. The parent task auto-completes
// once every goal is done, and auto-reopens if any goal is undone.
export async function setGoalDone(uid, taskId, currentGoals, goalId, isDone, photoPath = null) {
  const goals = (currentGoals || []).map((g) =>
    g.id === goalId ? { ...g, done: isDone, photoPath: isDone ? photoPath : null } : g
  );
  const allDone = goals.length > 0 && goals.every((g) => g.done);
  await updateTask(uid, taskId, { goals, done: allDone });
  return goals;
}

export async function removeGoal(uid, taskId, currentGoals, goalId) {
  const goals = (currentGoals || []).filter((g) => g.id !== goalId);
  const allDone = goals.length > 0 && goals.every((g) => g.done);
  await updateTask(uid, taskId, { goals, done: allDone });
  return goals;
}

/* ---------------------------------- profile ------------------------------------ */

export async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  await setDoc(ref, {
    name: user.displayName || "Student",
    email: user.email || null,
    photoURL: user.photoURL || null,
    lastLogin: serverTimestamp(),
  }, { merge: true });
}

// Lets the user override their display name / photo from Settings without
// touching their Google auth identity.
export async function updateUserProfile(uid, patch) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, patch, { merge: true });
}

export function watchUserProfile(uid, cb) {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => cb(snap.exists() ? snap.data() : null));
}
