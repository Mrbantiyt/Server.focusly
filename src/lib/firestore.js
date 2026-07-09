// src/lib/firestore.js
import {
  doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc, getDocs, writeBatch,
  onSnapshot, query, where, documentId, serverTimestamp, runTransaction, increment,
} from "firebase/firestore";
import { db } from "../firebase";
import { deleteMediaFiles } from "./media";

/* ---------------------------- study day (stopwatch) ---------------------------- */

// One doc per user per study-day: users/{uid}/studyDays/{dayKey} = { seconds }
// This tracks the Study Stopwatch only — task timers (Tasks tab) are
// intentionally separate and do not feed into this total.
export async function getStudyDay(uid, dayKey) {
  const ref = doc(db, "users", uid, "studyDays", dayKey);
  const snap = await getDoc(ref);
  return { seconds: snap.exists() ? snap.data().seconds || 0 : 0 };
}

export async function setStudyDay(uid, dayKey, seconds) {
  const ref = doc(db, "users", uid, "studyDays", dayKey);
  await setDoc(ref, { seconds, updatedAt: serverTimestamp() }, { merge: true });
}

// Live-listen to today's doc so the stopwatch stays in sync across tabs/devices
export function watchStudyDay(uid, dayKey, cb) {
  const ref = doc(db, "users", uid, "studyDays", dayKey);
  return onSnapshot(ref, (snap) => cb({ seconds: snap.exists() ? snap.data().seconds || 0 : 0 }));
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
//   goals: [{ id, text, done, photoPath }]   <- photoPath is a Supabase
//                                               Storage object path (see
//                                               src/lib/media.js), resolved
//                                               to a public CDN URL via
//                                               mediaSrc() — the bucket is
//                                               public, so no token needs
//                                               to stay server-side here.
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
  // Fire-and-forget lifetime counter bump — Settings' "Total tasks" reads
  // this instead of the live tasks collection, since that collection gets
  // wiped every midnight (see runMidnightTaskReset). Dot-notation path is
  // required here (not a nested object) so `merge: true` + `increment()`
  // only touches this one field instead of overwriting the whole
  // `taskStats` map and losing the other counters.
  const statsRef = doc(db, "users", uid);
  await setDoc(statsRef, { "taskStats.totalCreated": increment(1) }, { merge: true });
}

export async function updateTask(uid, taskId, patch) {
  const ref = doc(db, "users", uid, "tasks", taskId);
  await updateDoc(ref, patch);
}

// Deletes a task, and any goal-proof photos it had, from storage too —
// so removing a task doesn't leave orphaned images behind in Supabase.
// `taskData` is optional: pass the task object if you already have it
// (e.g. from the live tasks list) to avoid an extra read; otherwise this
// fetches it itself so photo cleanup still happens either way.
//
// IMPORTANT: this credits the task's completion status into the lifetime
// taskStats counters BEFORE deleting it — exactly like runMidnightTaskReset
// does for the automatic daily wipe. Without this, manually deleting a
// task would silently erase it from "Total tasks"/"Goals completed" in
// Settings, even though those are meant to be permanent, never-decreasing
// counters (same idea as "Total study time").
export async function deleteTask(uid, taskId, taskData = null) {
  const ref = doc(db, "users", uid, "tasks", taskId);

  let task = taskData;
  if (!task) {
    const snap = await getDoc(ref);
    task = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
  const goals = task?.goals || [];
  const photoPaths = goals.map((g) => g.photoPath).filter(Boolean);

  // Credit lifetime counters for what's about to be deleted, same as the
  // midnight reset does for the tasks it wipes.
  const wasCompleted = !!task?.done;
  const goalsDoneCount = goals.filter((g) => g.done).length;
  if (wasCompleted || goalsDoneCount > 0) {
    const statsRef = doc(db, "users", uid);
    await setDoc(statsRef, {
      "taskStats.totalCompleted": increment(wasCompleted ? 1 : 0),
      "taskStats.totalGoalsCompleted": increment(goalsDoneCount),
    }, { merge: true });
  }

  await deleteDoc(ref);

  if (photoPaths.length > 0) {
    await deleteMediaFiles(photoPaths);
  }
}

// Runs once per calendar day (called from useTasks, guarded by
// taskStats.lastResetDay so it only actually executes the first time it's
// invoked on a given day, no matter how many tabs/devices are open).
//
// Tasks are meant to be a daily list, not a permanently growing one — this
// wipes everything in users/{uid}/tasks at the local midnight boundary,
// but first folds each task's completion status into the lifetime
// taskStats counters, so "Total tasks completed" in Settings keeps
// counting up forever even though the live list resets to empty every day.
export async function runMidnightTaskReset(uid, todayKey) {
  const statsRef = doc(db, "users", uid);

  // Transaction just for the "have we already reset today" check + claim,
  // so two tabs racing at midnight can't both run the wipe twice.
  const shouldRun = await runTransaction(db, async (tx) => {
    const snap = await tx.get(statsRef);
    const lastResetDay = snap.exists() ? snap.data()?.taskStats?.lastResetDay : null;
    if (lastResetDay === todayKey) return false;
    tx.set(statsRef, { "taskStats.lastResetDay": todayKey }, { merge: true });
    return true;
  });
  if (!shouldRun) return;

  const tasksRef = collection(db, "users", uid, "tasks");
  const snap = await getDocs(tasksRef);
  if (snap.empty) return;

  let completedCount = 0;
  let goalsCompletedCount = 0;
  const photoPaths = [];
  for (const d of snap.docs) {
    const t = d.data();
    if (t.done) completedCount++;
    const goals = t.goals || [];
    goalsCompletedCount += goals.filter((g) => g.done).length;
    goals.forEach((g) => { if (g.photoPath) photoPaths.push(g.photoPath); });
  }

  // Credit lifetime counters for what's about to be deleted...
  if (completedCount > 0 || goalsCompletedCount > 0) {
    await setDoc(statsRef, {
      "taskStats.totalCompleted": increment(completedCount),
      "taskStats.totalGoalsCompleted": increment(goalsCompletedCount),
    }, { merge: true });
  }

  // ...then delete every task doc. Firestore batches cap at 500 writes,
  // which is far more than a daily task list will ever hold, but chunking
  // here means it stays correct even for an unusually large list.
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 450)) batch.delete(d.ref);
    await batch.commit();
  }

  // Finally, clean up every goal-proof photo that belonged to today's
  // (now-deleted) tasks, so they don't sit in Supabase forever as orphaned
  // files with no Firestore doc pointing at them anymore. Chunked the same
  // way as the delete-endpoint's own per-call cap.
  for (let i = 0; i < photoPaths.length; i += 200) {
    await deleteMediaFiles(photoPaths.slice(i, i + 200));
  }
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
// `taskState.elapsed` (passed in from Tasks.jsx) is already the LIVE
// elapsed value for a running task (see useTasks.js's liveTasks mapping) —
// it already accounts for time since `startedAt`. So when the task
// auto-completes we just bank it as-is; adding (Date.now() - startedAt) on
// top again would double-count the current run.
export async function setGoalDone(uid, taskId, currentGoals, goalId, isDone, photoPath = null, taskState = {}) {
  const prevGoal = (currentGoals || []).find((g) => g.id === goalId);
  const oldPhotoPath = prevGoal?.photoPath || null;

  const goals = (currentGoals || []).map((g) =>
    g.id === goalId ? { ...g, done: isDone, photoPath: isDone ? photoPath : null } : g
  );
  const allDone = goals.length > 0 && goals.every((g) => g.done);

  const patch = { goals, done: allDone };
  if (allDone && taskState.running) {
    patch.elapsed = Math.floor(taskState.elapsed || 0);
    patch.running = false;
    patch.startedAt = null;
  }

  await updateTask(uid, taskId, patch);

  // If this goal had a different photo before (unmarking it, or replacing
  // it with a fresh proof photo), delete the old one from storage — it's
  // no longer referenced by anything in Firestore, so leaving it would
  // just be an orphaned file taking up storage forever.
  if (oldPhotoPath && oldPhotoPath !== photoPath) {
    await deleteMediaFiles([oldPhotoPath]);
  }

  return goals;
}

export async function removeGoal(uid, taskId, currentGoals, goalId) {
  const removed = (currentGoals || []).find((g) => g.id === goalId);
  const goals = (currentGoals || []).filter((g) => g.id !== goalId);
  const allDone = goals.length > 0 && goals.every((g) => g.done);
  await updateTask(uid, taskId, { goals, done: allDone });

  if (removed?.photoPath) {
    await deleteMediaFiles([removed.photoPath]);
  }

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
  let cumulativeAtLevelStart = 0; // total lifetime XP required to REACH the current level
  while (remaining >= needed) {
    remaining -= needed;
    cumulativeAtLevelStart += needed;
    level += 1;
    needed = xpNeededForLevel(level);
  }
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel: needed,
    // Lifetime/cumulative view: how much total XP you've earned so far (just `xp`,
    // exposed here for convenience) and the total lifetime XP needed to hit the
    // next level — i.e. cumulativeAtLevelStart + needed. Neither of these ever
    // resets to 0 as you level up, unlike xpIntoLevel/xpForNextLevel above.
    totalXp: xp,
    totalXpForNextLevel: cumulativeAtLevelStart + needed,
  };
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
      // Lifetime task/goal counters. These survive the daily midnight task
      // wipe (see runMidnightTaskReset below) — the live `tasks` collection
      // only ever holds *today's* tasks, so "Total tasks" in Settings has to
      // come from this running total instead of tasks.length.
      taskStats: {
        totalCreated: d.taskStats?.totalCreated || 0,
        totalCompleted: d.taskStats?.totalCompleted || 0,
        totalGoalsCompleted: d.taskStats?.totalGoalsCompleted || 0,
        lastResetDay: d.taskStats?.lastResetDay || null,
      },
    });
  });
}

// Wrapped in a transaction so two near-simultaneous calls (e.g. finishing
// two tasks back-to-back, or two open tabs) can never both read the same
// stale xp/coins value and silently clobber each other's write. Firestore
// retries the transaction automatically if it detects a conflicting write
// mid-flight, so this is safe under real concurrency, unlike the previous
// plain getDoc + setDoc version.
export async function addXp(uid, amount) {
  const ref = doc(db, "users", uid);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists() ? snap.data() : {};
    const prevXp = d.xp || 0;
    const prevCoins = d.coins || 0;

    const newXp = prevXp + amount;
    const prevLevel = levelFromXp(prevXp).level;
    const newLevel = levelFromXp(newXp).level;
    const levelsGained = Math.max(0, newLevel - prevLevel);

    let coinsEarned = 0;
    for (let lvl = prevLevel + 1; lvl <= newLevel; lvl++) {
      coinsEarned += lvl * 1000;
    }
    const newCoins = prevCoins + coinsEarned;

    tx.set(ref, { xp: newXp, coins: newCoins }, { merge: true });
    return { xp: newXp, coins: newCoins, level: newLevel, levelsGained };
  });

  return result;
}

// Transactional so two logins firing near-simultaneously (e.g. two tabs
// open right at midnight rollover) can't both read "not logged in today
// yet" and both increment the streak — the second one now sees the first
// one's write and correctly no-ops instead of double-counting.
export async function registerDailyLogin(uid, todayKey, yesterdayKey) {
  const ref = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists() ? snap.data() : {};
    const lastDay = d.lastStreakDay || null;

    if (lastDay === todayKey) return;

    const continuing = lastDay === yesterdayKey;
    const newStreak = continuing ? (d.streak || 0) + 1 : 1;
    const streakDays = { ...(d.streakDays || {}), [todayKey]: true };

    tx.set(ref, { streak: newStreak, lastStreakDay: todayKey, streakDays }, { merge: true });
  });
}

/* ------------------------------------ store ------------------------------------- */

// Buys a store item for `cost` coins (fails if not enough coins or already
// owned), adds it to users/{uid}.ownedItems, and equips it as the active
// mascot. Returns { ok, reason? }.
//
// Wrapped in a transaction for the same reason as addXp/registerDailyLogin:
// without it, two near-simultaneous purchase taps (double-tap, or two open
// tabs) could both read "coins: 1000, not yet owned", both pass the checks,
// and both write — silently double-spending coins or double-charging for
// the same item.
export async function purchaseItem(uid, itemId, cost) {
  const ref = doc(db, "users", uid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists() ? snap.data() : {};
    const owned = d.ownedItems || [];

    if (owned.includes(itemId)) return { ok: false, reason: "already-owned" };

    const coins = d.coins || 0;
    if (coins < cost) return { ok: false, reason: "not-enough-coins" };

    tx.set(ref, {
      coins: coins - cost,
      ownedItems: [...owned, itemId],
      activeMascot: itemId,
    }, { merge: true });

    return { ok: true };
  });
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
  return (username || "").trim().replace(/^@/, "").toLowerCase();
}

export function isValidUsername(username) {
  return /^[a-zA-Z0-9_.]{3,20}$/.test((username || "").trim().replace(/^@/, ""));
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
export async function claimUsername(uid, username, email) {
  const trimmed = (username || "").trim().replace(/^@/, "");
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

    // Email is duplicated onto the usernames doc (not just users/{uid})
    // because username-login looks this doc up BEFORE the user is
    // authenticated, and users/{uid} is only readable once signed in.
    tx.set(usernameRef, { uid, email: email || null }, { merge: true });
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
  return snap.data().email || null;
}

// Self-heal: older versions of the app could reserve a username with a
// missing/null email (e.g. changing username from Settings without also
// updating the usernames/{key} doc), which silently breaks username-login
// forever since getEmailForUsername() has nothing to return. Called after
// every successful sign-in with a trusted (uid, email) pair, so it only
// ever repairs the CURRENT user's own reservation — never touches anyone
// else's doc. No-ops if the doc is already correct.
export async function repairUsernameEmail(uid, email) {
  if (!uid || !email) return;
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    const usernameLower = userSnap.exists() ? userSnap.data().usernameLower : null;
    if (!usernameLower) return;

    const usernameRef = doc(db, "usernames", usernameLower);
    const usernameSnap = await getDoc(usernameRef);
    if (!usernameSnap.exists()) return;

    const data = usernameSnap.data();
    if (data.uid === uid && data.email !== email) {
      await setDoc(usernameRef, { uid, email }, { merge: true });
    }
  } catch {
    // Best-effort repair — never block sign-in over this.
  }
}
