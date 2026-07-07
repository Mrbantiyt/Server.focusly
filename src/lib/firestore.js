// src/lib/firestore.js
import {
  doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, documentId, serverTimestamp, runTransaction,
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
//   title, tag, elapsed, running, startedAt, done, createdAt,
//   goals: [{ id, text, done, photoPath }]   <- photoPath is a Telegram file
//                                               path (see src/lib/media.js),
//                                               NOT a raw URL (keeps the bot
//                                               token server-side only).
// }
// `elapsed` is the banked total (seconds) as of the last time the task was
// paused/flushed. While `running` is true, `startedAt` (a millisecond
// epoch, set client-side) marks when the current run began — real elapsed
// time is `elapsed + (Date.now() - startedAt) / 1000`. Deriving it from a
// wall-clock timestamp instead of counting interval ticks means the timer
// stays correct even if the JS timer itself gets throttled/paused while the
// screen is off or the app is backgrounded — the moment the app wakes back
// up it recomputes from real elapsed time instead of having lost ticks.
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
    title, tag, done: false, elapsed: 0, running: false, startedAt: null, goals: [],
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

/* -------------------------------- gamification ---------------------------------- */

export function xpNeededForLevel(level) {
  return level === 0 ? 100 : 100 + level * 500;
}

export function levelFromXp(xp) {
  let level = 0;
  let remaining = xp;
  let needed = xpNeededForLevel(level);
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = xpNeededForLevel(level);
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: needed };
}

export function watchGameStats(uid, cb) {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => {
    const d = snap.exists() ? snap.data() : {};
    cb({
      xp: d.xp || 0,
      coins: d.coins || 0,
      streak: d.streak || 0,
      lastStreakDay: d.lastStreakDay || null,
      streakDays: d.streakDays || {},
      ownedItems: d.ownedItems || [],
      activeMascot: d.activeMascot || "default",
    });
  });
}

export async function addXp(uid, amount) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};
  const prevXp = d.xp || 0;
  const prevCoins = d.coins || 0;

  const newXp = prevXp + amount;
  const prevLevel = levelFromXp(prevXp).level;
  const newLevel = levelFromXp(newXp).level;
  const levelsGained = Math.max(0, newLevel - prevLevel);
  const newCoins = prevCoins + levelsGained * 1000;

  await setDoc(ref, { xp: newXp, coins: newCoins }, { merge: true });
  return { xp: newXp, coins: newCoins, level: newLevel, levelsGained };
}

export async function registerDailyLogin(uid, todayKey, yesterdayKey) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};
  const lastDay = d.lastStreakDay || null;

  if (lastDay === todayKey) return;

  const continuing = lastDay === yesterdayKey;
  const newStreak = continuing ? (d.streak || 0) + 1 : 1;
  const streakDays = { ...(d.streakDays || {}), [todayKey]: true };

  await setDoc(ref, { streak: newStreak, lastStreakDay: todayKey, streakDays }, { merge: true });
}

/* ------------------------------------ store ------------------------------------- */

// Buys a store item for `cost` coins (fails if not enough coins or already
// owned), adds it to users/{uid}.ownedItems, and equips it as the active
// mascot. Returns { ok, reason? }.
export async function purchaseItem(uid, itemId, cost) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};
  const owned = d.ownedItems || [];

  if (owned.includes(itemId)) return { ok: false, reason: "already-owned" };

  const coins = d.coins || 0;
  if (coins < cost) return { ok: false, reason: "not-enough-coins" };

  await setDoc(ref, {
    coins: coins - cost,
    ownedItems: [...owned, itemId],
    activeMascot: itemId,
  }, { merge: true });

  return { ok: true };
}

// Switches the equipped mascot to an already-owned item (or back to "default").
export async function setActiveMascot(uid, itemId) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { activeMascot: itemId }, { merge: true });
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

/* --------------------------------- usernames ------------------------------------ */
// A separate `usernames/{usernameLower}` collection is used as a reservation
// table so we can atomically guarantee no two users ever hold the same
// username (Firestore has no unique-constraint on fields, only on doc IDs).
// Each doc = { uid }. The user's own profile also stores `username` /
// `usernameLower` for display + lookups.

function normalizeUsername(username) {
  return (username || "").trim().toLowerCase();
}

export function isValidUsername(username) {
  return /^[a-zA-Z0-9_.]{3,20}$/.test((username || "").trim());
}

export async function isUsernameAvailable(username) {
  const key = normalizeUsername(username);
  if (!key) return false;
  const ref = doc(db, "usernames", key);
  const snap = await getDoc(ref);
  return !snap.exists();
}

// Atomically claims `username` for `uid`, releasing any username the user
// previously held. Throws if the username is invalid or already taken by
// someone else.
export async function claimUsername(uid, username) {
  const trimmed = (username || "").trim();
  if (!isValidUsername(trimmed)) {
    throw new Error("Username must be 3-20 characters: letters, numbers, _ or . only.");
  }
  const key = normalizeUsername(trimmed);
  const usernameRef = doc(db, "usernames", key);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const usernameSnap = await tx.get(usernameRef);
    if (usernameSnap.exists() && usernameSnap.data().uid !== uid) {
      throw new Error("That username is already taken.");
    }
    const userSnap = await tx.get(userRef);
    const prevUsernameLower = userSnap.exists() ? userSnap.data().usernameLower : null;

    // Release the user's previous username reservation, if different.
    if (prevUsernameLower && prevUsernameLower !== key) {
      const prevRef = doc(db, "usernames", prevUsernameLower);
      tx.delete(prevRef);
    }

    tx.set(usernameRef, { uid }, { merge: true });
    tx.set(userRef, { username: trimmed, usernameLower: key }, { merge: true });
  });

  return trimmed;
}

// Looks up the email associated with a username, so users can log in with
// either their username or their email (Firebase Auth itself only accepts
// email + password).
export async function getEmailForUsername(username) {
  const key = normalizeUsername(username);
  const ref = doc(db, "usernames", key);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const uid = snap.data().uid;
  const userSnap = await getDoc(doc(db, "users", uid));
  return userSnap.exists() ? userSnap.data().email || null : null;
}
