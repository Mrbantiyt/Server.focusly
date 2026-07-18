// src/lib/firestore.js
import {
  doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc, getDocs, writeBatch,
  onSnapshot, query, where, documentId, serverTimestamp, runTransaction, increment, Timestamp,
  orderBy, limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { dayKeyFor } from "./time";
import { PLAN, getXpPerTick, getCoinsPerMinute } from "./billing";


/* ---------------------------- study day (stopwatch) ---------------------------- */

// One doc per user per study-day: users/{uid}/studyDays/{dayKey} = { seconds }
// This tracks the Study Stopwatch only — task timers (Tasks tab) are
// intentionally separate and do not feed into this total.
export async function getStudyDay(uid, dayKey) {
  const ref = doc(db, "users", uid, "studyDays", dayKey);
  const snap = await getDoc(ref);
  return { seconds: snap.exists() ? snap.data().seconds || 0 : 0 };
}

// Day docs store an ABSOLUTE seconds value for that day (not incremental —
// see useStopwatch.js), so we can't just `increment()` the lifetime total
// on every flush; that would double-count every flush after the first for
// the same day. Instead this reads the day doc's previous value inside a
// transaction and folds only the DELTA into users/{uid}.totalStudySeconds,
// which is the running lifetime total the leaderboard ranks on.
export async function setStudyDay(uid, dayKey, seconds) {
  const dayRef = doc(db, "users", uid, "studyDays", dayKey);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    // Firestore transactions require ALL reads before ANY writes, so both
    // docs are read up front before either is written.
    const [daySnap, userSnap] = await Promise.all([tx.get(dayRef), tx.get(userRef)]);
    const prevSeconds = daySnap.exists() ? daySnap.data().seconds || 0 : 0;
    const delta = seconds - prevSeconds;

    tx.set(dayRef, { seconds, updatedAt: serverTimestamp() }, { merge: true });

    if (delta !== 0) {
      const prevTotal = userSnap.exists() ? userSnap.data().totalStudySeconds || 0 : 0;
      tx.set(userRef, { totalStudySeconds: Math.max(0, prevTotal + delta) }, { merge: true });
    }
  });
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

/* ------------------------- subject timer (per-day, per-subject) ---------------- */

// One doc per user per study-day: users/{uid}/subjectDays/{dayKey} =
// { seconds: { [subjectName]: seconds, ... } }
// Tracks how long each subject was studied TODAY only, via the Custom
// (multi-subject) Timer. Intentionally day-scoped only (no lifetime total,
// no achievements hang off this) — the dashboard's "Today by Subject" list
// is the only consumer, and it resets naturally every day because it reads
// a fresh dayKey doc.
export async function addSubjectSeconds(uid, dayKey, subject, deltaSeconds) {
  if (!subject || deltaSeconds <= 0) return;
  const ref = doc(db, "users", uid, "subjectDays", dayKey);
  // Dots are the field-path separator in Firestore's dot-notation keys
  // (see the big comment below), so a subject name containing one (e.g.
  // "B.Tech", "Physics.") would otherwise be misread as a path into a
  // nested field instead of a literal map key. Strip dots from the key we
  // write under — display/grouping still uses the subject's real name
  // everywhere else, only the Firestore field key itself is sanitized.
  const fieldKey = subject.replace(/\./g, "_");
  // IMPORTANT: setDoc({ merge: true }) with a NESTED object value (e.g.
  // { seconds: { [subject]: increment(1) } }) replaces the entire `seconds`
  // map wholesale — merge only applies at the top level of the object you
  // pass, not recursively inside it. That would silently wipe out every
  // OTHER subject's already-saved seconds each time a different subject
  // gets credited. Using a dot-notation field path key instead
  // (`seconds.${fieldKey}`) makes Firestore treat it as a single scalar
  // field at that exact path, so merge:true only ever touches that one
  // subject's number and leaves every sibling subject field untouched.
  await setDoc(
    ref,
    { [`seconds.${fieldKey}`]: increment(deltaSeconds), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Live-listen to today's per-subject seconds map.
export function watchSubjectDay(uid, dayKey, cb) {
  const ref = doc(db, "users", uid, "subjectDays", dayKey);
  return onSnapshot(ref, (snap) => cb(snap.exists() ? snap.data().seconds || {} : {}));
}

/* ---------------------------------- tasks -------------------------------------- */

// users/{uid}/tasks/{taskId} = {
//   title, tag, elapsed, running, startedAt, done, createdAt,
// }
// `elapsed` is the banked total (seconds) as of the last time the task was
// paused/flushed. While `running` is true, `startedAt` (a millisecond
// epoch, set client-side) marks when the current run began — real elapsed
// time is `elapsed + (Date.now() - startedAt) / 1000`. Deriving it from a
// wall-clock timestamp instead of counting interval ticks means the timer
// stays correct even if the JS timer itself gets throttled/paused while the
// screen is off or the app is backgrounded — the moment the app wakes back
// up it recomputes from real elapsed time instead of having lost ticks.
// `done` is toggled manually via the checkmark.
export function watchTasks(uid, cb) {
  const ref = collection(db, "users", uid, "tasks");
  return onSnapshot(ref, (snap) => {
    const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    tasks.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    cb(tasks);
  });
}

export async function addTask(uid, title, tag = "Medium") {
  const ref = collection(db, "users", uid, "tasks");
  await addDoc(ref, {
    title, tag, done: false, elapsed: 0, running: false, startedAt: null,
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

// Deletes a task. `taskData` is optional: pass the task object if you
// already have it (e.g. from the live tasks list) to avoid an extra read.
//
// IMPORTANT: this credits the task's completion status into the lifetime
// taskStats counters BEFORE deleting it — exactly like runMidnightTaskReset
// does for the automatic daily wipe. Without this, manually deleting a
// task would silently erase it from "Total tasks" in Settings, even though
// that's meant to be a permanent, never-decreasing counter (same idea as
// "Total study time").
export async function deleteTask(uid, taskId, taskData = null) {
  const ref = doc(db, "users", uid, "tasks", taskId);

  let task = taskData;
  if (!task) {
    const snap = await getDoc(ref);
    task = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  // Credit lifetime counters for what's about to be deleted, same as the
  // midnight reset does for the tasks it wipes.
  const wasCompleted = !!task?.done;
  if (wasCompleted) {
    const statsRef = doc(db, "users", uid);
    await setDoc(statsRef, {
      "taskStats.totalCompleted": increment(1),
    }, { merge: true });
  }

  await deleteDoc(ref);
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

  // Safety net: only ever delete tasks actually created on a PREVIOUS day.
  // The `lastResetDay` guard above should already stop this from running
  // twice in one day, but it depends on the device clock and a network
  // round-trip — if it ever misfires (clock skew, a stale/missing
  // taskStats doc, etc.) this check is what stops a task you just made
  // today from being wiped out. `dayKeyFor` builds a local YYYY-MM-DD key
  // the same way the reset's own `todayKey` is built, so the comparison is
  // apples-to-apples.
  const docsToWipe = snap.docs.filter((d) => {
    const t = d.data();
    const createdMs = t.createdAt?.toMillis ? t.createdAt.toMillis() : null;
    // No createdAt yet (e.g. serverTimestamp hasn't resolved locally) —
    // treat as "created today" and leave it alone rather than risk
    // deleting a task that was just added.
    if (createdMs == null) return false;
    return dayKeyFor(new Date(createdMs)) !== todayKey;
  });
  if (docsToWipe.length === 0) return;

  let completedCount = 0;
  for (const d of docsToWipe) {
    const t = d.data();
    if (t.done) completedCount++;
  }

  // Credit lifetime counters for what's about to be deleted...
  if (completedCount > 0) {
    await setDoc(statsRef, {
      "taskStats.totalCompleted": increment(completedCount),
    }, { merge: true });
  }

  // ...then delete every task doc. Firestore batches cap at 500 writes,
  // which is far more than a daily task list will ever hold, but chunking
  // here means it stays correct even for an unusually large list.
  for (let i = 0; i < docsToWipe.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of docsToWipe.slice(i, i + 450)) batch.delete(d.ref);
    await batch.commit();
  }
}

/* ------------------------------------ leaderboard -------------------------------- */
// leaderboard/{uid} = {
//   username, totalStudySeconds, streak, level, updatedAt,
//   weeklyStudySeconds, weekStartKey
// }
//
// This is a small PUBLIC mirror doc, deliberately separate from the private
// users/{uid} doc (which holds email/billing/etc and stays owner-only-read).
// Only these fields ever get written here, so nothing sensitive is
// ever exposed. It's kept in sync from the client every time study time,
// streak, or level changes — see useLeaderboard.js.
//
// weeklyStudySeconds/weekStartKey power the "resets every Monday" leaderboard:
// weekStartKey is the Mon-Sun week (see getWeekStartKey in lib/time) that
// weeklyStudySeconds was accumulated for. watchLeaderboard filters to rows
// whose weekStartKey matches the CURRENT week, so anyone who hasn't studied
// yet this week simply drops out of the ranking the moment Monday starts —
// no batch job or cron needed, it happens naturally on their next sync.
export async function syncLeaderboardEntry(uid, { username, totalStudySeconds, streak, level, weeklyStudySeconds, weekStartKey }) {
  const ref = doc(db, "leaderboard", uid);
  await setDoc(ref, {
    username: username || "Anonymous",
    totalStudySeconds: totalStudySeconds || 0,
    streak: streak || 0,
    level: level || 0,
    weeklyStudySeconds: weeklyStudySeconds || 0,
    weekStartKey: weekStartKey || "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Top N users, live-updating.
// - lifetime mode (default): ranked by all-time totalStudySeconds.
// - weekly mode: ranked by weeklyStudySeconds, restricted to rows tagged
//   with the CURRENT Mon-Sun week's weekStartKey — anyone still tagged with
//   an older week (hasn't opened the app / studied since Monday) is
//   excluded rather than shown with a stale number.
export function watchLeaderboard(cb, topN = 50, { weekly = false, weekStartKey = "" } = {}) {
  const ref = collection(db, "leaderboard");
  const q = weekly
    ? query(ref, where("weekStartKey", "==", weekStartKey), orderBy("weeklyStudySeconds", "desc"), limit(topN))
    : query(ref, orderBy("totalStudySeconds", "desc"), limit(topN));
  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((d) => rows.push({ uid: d.id, ...d.data() }));
    cb(rows);
  });
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
      // Lifetime task counters. These survive the daily midnight task wipe
      // (see runMidnightTaskReset below) — the live `tasks` collection only
      // ever holds *today's* tasks, so "Total tasks" in Settings has to
      // come from this running total instead of tasks.length.
      taskStats: {
        totalCreated: d.taskStats?.totalCreated || 0,
        totalCompleted: d.taskStats?.totalCompleted || 0,
        lastResetDay: d.taskStats?.lastResetDay || null,
      },
      // Lifetime count of fully-completed Study Timer countdowns (see
      // incrementSessionsCompleted below) — feeds the "Complete N Sessions"
      // achievements and the Subject Analytics "Total sessions" stat.
      sessionsCompleted: d.sessionsCompleted || 0,
      // Monotonic running total of all coins ever earned (level-ups, focus
      // rewards, achievement payouts) — deliberately NEVER decremented by
      // spends (Store purchases, streak restore), so the "Collect 50,000
      // Coins" achievement can't be un-earned by spending and isn't
      // gameable by buying-then-not-really-having-collected it.
      lifetimeCoinsEarned: d.lifetimeCoinsEarned || 0,
      // Per-subject cumulative study seconds, e.g. { Mathematics: 1234 }.
      // Currently only written by the Subject Timer feature; kept here too
      // (not just in a subcollection) so achievement progress checks
      // ("Study Mathematics 10 Hours") can read it from the same live
      // gameStats snapshot everything else already uses.
      subjectSeconds: d.subjectSeconds || {},
      // IDs of achievements already unlocked, so the badge grid and the
      // unlock-detector both know what's already been awarded and never
      // re-credit or re-animate the same badge twice.
      unlockedAchievements: d.unlockedAchievements || [],
    });
  });
}

// Call once each time the Study Timer countdown reaches 0 naturally (i.e.
// `finished` flips true) — increments the lifetime "sessions completed"
// counter used by the Complete-N-Sessions achievements and Subject
// Analytics. Deliberately NOT tied to Start/Pause/Reset — only a countdown
// that actually ran out counts as a completed session, matching what the
// achievement copy ("Complete 10 Sessions") implies.
//
// Idempotency: the caller (App.jsx) is responsible for calling this only
// once per finish transition (edge-triggered on `finished` going false ->
// true), not on every render while `finished` stays true — see the
// sessionCreditedRef guard where it's called from.
export async function incrementSessionsCompleted(uid) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { sessionsCompleted: increment(1) }, { merge: true });
}

// Unlocks one or more achievements at once and credits their combined coin
// reward, in a single transaction — so a batch of simultaneous unlocks
// (e.g. crossing both "Study 1 Hour" and "Complete 10 Sessions" in the same
// tick) can't race with itself or with another coin-changing action
// (purchase, restore, level-up) the way two separate un-transacted writes
// could.
//
// Re-checks `owned.includes(id)` per-id inside the transaction (not just
// trusting the caller's `ids` list) so a duplicate/late-arriving call after
// the achievement was already unlocked elsewhere is a safe no-op for that
// id rather than double-paying its reward.
export async function unlockAchievements(uid, idsWithRewards) {
  if (!idsWithRewards.length) return { ok: true, newlyUnlocked: [], coinsAwarded: 0 };
  const ref = doc(db, "users", uid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists() ? snap.data() : {};
    const owned = new Set(d.unlockedAchievements || []);
    const coins = d.coins || 0;

    const newlyUnlocked = [];
    let coinsAwarded = 0;
    for (const { id, reward } of idsWithRewards) {
      if (owned.has(id)) continue;
      owned.add(id);
      newlyUnlocked.push(id);
      coinsAwarded += reward || 0;
    }

    if (newlyUnlocked.length === 0) return { ok: true, newlyUnlocked: [], coinsAwarded: 0 };

    tx.set(ref, {
      unlockedAchievements: Array.from(owned),
      coins: coins + coinsAwarded,
      lifetimeCoinsEarned: (d.lifetimeCoinsEarned || 0) + coinsAwarded,
    }, { merge: true });

    return { ok: true, newlyUnlocked, coinsAwarded };
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
    const newLifetimeCoins = (d.lifetimeCoinsEarned || 0) + coinsEarned;

    tx.set(ref, { xp: newXp, coins: newCoins, lifetimeCoinsEarned: newLifetimeCoins }, { merge: true });
    return { xp: newXp, coins: newCoins, level: newLevel, levelsGained };
  });

  return result;
}

// Credits focus-session XP + coins for a chunk of newly-completed reward
// units. `newXpTicks` = number of NEW 10s reward-ticks to credit right now;
// `newCoinMinutes` = number of NEW full completed minutes to credit right
// now. Both are DELTAS (not running totals) — the caller (useGameStats) is
// responsible for only ever counting each tick/minute once, the same way
// useCountdownTimer's bankSeconds() only ever banks each elapsed second
// once. That guarantee comes from ticks/minutes being derived from a
// monotonic local ref that's only ever incremented forward, mirrored to
// localStorage so a minimize/reload resumes it instead of restarting it —
// never from re-deriving "time elapsed" from wall-clock math that could
// double count.
//
// Reward RATES are looked up here from the user's OWN billing doc on the
// server side — never trusted from the caller — so a tampered/replayed
// client call can influence *how many* ticks/minutes it claims but can
// never claim a richer plan's payout per tick/minute than the account
// actually has.
//
// Wrapped in a transaction for the same reason as addXp: two near-
// simultaneous flushes (double-fired interval, two tabs) must not both
// read the same stale xp/coins and clobber each other.
export async function addFocusRewards(uid, newXpTicks, newCoinMinutes) {
  const xpTicks = Math.max(0, Math.floor(newXpTicks) || 0);
  const coinMinutes = Math.max(0, Math.floor(newCoinMinutes) || 0);
  if (xpTicks <= 0 && coinMinutes <= 0) return null;

  const ref = doc(db, "users", uid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists() ? snap.data() : {};

    const prevXp = d.xp || 0;
    const prevCoins = d.coins || 0;

    const xpPerTick = getXpPerTick(d.billing);
    const coinsPerMinute = getCoinsPerMinute(d.billing);

    const xpAwarded = xpTicks * xpPerTick;
    const focusCoinsAwarded = coinMinutes * coinsPerMinute;

    const newXp = prevXp + xpAwarded;

    // Level-up coin bonus (existing behavior) still applies on top of the
    // per-minute focus coins above — leveling up from XP has always paid
    // out level*1000 coins, and this keeps that intact.
    const prevLevel = levelFromXp(prevXp).level;
    const newLevel = levelFromXp(newXp).level;
    let levelUpCoins = 0;
    for (let lvl = prevLevel + 1; lvl <= newLevel; lvl++) {
      levelUpCoins += lvl * 1000;
    }

    const newCoins = prevCoins + focusCoinsAwarded + levelUpCoins;
    const newLifetimeCoins = (d.lifetimeCoinsEarned || 0) + focusCoinsAwarded + levelUpCoins;

    tx.set(ref, { xp: newXp, coins: newCoins, lifetimeCoinsEarned: newLifetimeCoins }, { merge: true });

    return {
      xp: newXp,
      coins: newCoins,
      xpAwarded,
      coinsAwarded: focusCoinsAwarded + levelUpCoins,
      level: newLevel,
      levelsGained: Math.max(0, newLevel - prevLevel),
    };
  });
}


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

// ---------------------------------------------------------------------------
// STREAK RESTORE
// ---------------------------------------------------------------------------
// Eligibility check — pure function, no reads/writes, safe to call from the
// UI on every render to decide whether to show the "Restore Streak" button.
//
// A streak is restorable only if EXACTLY one day was missed:
//   - lastStreakDay is two calendar days before today (yesterday was skipped,
//     the day before that was the last login) — restoring brings the streak
//     back to life as if yesterday had been logged in after all.
//   - If lastStreakDay is null (never logged in) there's nothing to restore.
//   - If more than one day was missed (lastStreakDay is 3+ days back),
//     restore is intentionally NOT offered — matches "only the most recently
//     missed day" from the spec.
//   - If lastStreakDay is today or yesterday, the streak isn't broken at
//     all, so there's nothing to restore.
export function isStreakRestoreEligible({ lastStreakDay, todayKey, yesterdayKey, dayBeforeYesterdayKey }) {
  if (!lastStreakDay) return false;
  return lastStreakDay === dayBeforeYesterdayKey && lastStreakDay !== todayKey && lastStreakDay !== yesterdayKey;
}

// Spends `cost` coins to restore a just-broken streak. Transaction-wrapped
// for the same double-tap/multi-tab safety reason as purchaseItem/addXp.
//
// Re-validates eligibility server-side (inside the transaction, from fresh
// data) rather than trusting the client's `eligible` check — the client-side
// isStreakRestoreEligible() above is only for deciding whether to SHOW the
// button; this is the actual gate on whether the spend+restore is allowed to
// happen at all, so a stale UI state can't restore something that's no
// longer eligible (e.g. two rapid taps, or time passing between render and
// click that pushes lastStreakDay further into the past).
//
// On success: streakDays gets yesterday marked active (so the calendar view
// reflects the restored day), and lastStreakDay is set to yesterdayKey — NOT
// todayKey — so today's own registerDailyLogin() call still runs its normal
// "continuing" check and bumps the streak by 1 for today on top of the
// restored value, exactly as if yesterday had been a normal login.
// restoresUsed is tracked for potential future limits/analytics; it does not
// currently gate anything.
export async function restoreStreak(uid, { todayKey, yesterdayKey, dayBeforeYesterdayKey, cost = 10000 }) {
  const ref = doc(db, "users", uid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists() ? snap.data() : {};

    const lastDay = d.lastStreakDay || null;
    const eligible = isStreakRestoreEligible({ lastStreakDay: lastDay, todayKey, yesterdayKey, dayBeforeYesterdayKey });
    if (!eligible) return { ok: false, reason: "not-eligible" };

    const coins = d.coins || 0;
    if (coins < cost) return { ok: false, reason: "not-enough-coins" };

    const streakDays = { ...(d.streakDays || {}), [yesterdayKey]: true };
    const restoresUsed = (d.streakRestoresUsed || 0) + 1;

    tx.set(ref, {
      coins: coins - cost,
      lastStreakDay: yesterdayKey,
      streakDays,
      streakRestoresUsed: restoresUsed,
    }, { merge: true });

    // streak count itself (d.streak) is left untouched — it was never
    // decremented when the day was missed (registerDailyLogin only ever
    // increments or resets-to-1 on the NEXT login), so there's nothing to
    // add back to it here. Restoring is really about un-breaking the CHAIN
    // (lastStreakDay/streakDays) so today's login continues it instead of
    // resetting it to 1.
    return { ok: true, coins: coins - cost };
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

// Live-watches the single config/appUpdate doc that drives the "app update
// available" banner at the top of the app. Written only by the admin panel
// (Admin SDK, bypasses firestore.rules) — this is a read-only listener, so
// toggling it on/off in the admin panel shows/hides the banner for every
// signed-in user within a second or two, no app redeploy needed.
export function watchAppUpdateConfig(cb) {
  const ref = doc(db, "config", "appUpdate");
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
//
// SECURITY: the usernames/{key} doc only ever stores { uid } now — no
// email. It used to also store email because username-login needed to
// look email up BEFORE the user was authenticated, and this doc is the
// only one readable pre-auth — but that meant the doc had to be public,
// so anyone could enumerate usernames and harvest emails. That lookup now
// goes through api/resolve-username.js (Admin SDK, server-side) instead,
// which reads email from the private users/{uid} doc. `email` is still
// accepted as a param here for backwards compatibility with callers, but
// is intentionally ignored/unused — email is written to users/{uid} by
// ensureUserProfile, not here.
export async function claimUsername(uid, username, _email) {
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

    tx.set(usernameRef, { uid }, { merge: true });
    tx.set(userRef, { username: trimmed, usernameLower: key }, { merge: true });
  });

  return trimmed;
}

// Looks up the email associated with a username, so users can log in with
// either their username or their email (Firebase Auth itself only accepts
// email + password).
//
// SECURITY: this now calls a server endpoint (Admin SDK) instead of reading
// Firestore directly — the public usernames/{key} doc no longer stores
// email, so there's nothing to read here client-side.
export async function getEmailForUsername(username) {
  try {
    const resp = await fetch("/api/resolve-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.email || null;
  } catch {
    return null;
  }
}

// Legacy self-heal, now a no-op: older versions of the app could reserve a
// username with a missing/null email directly on the usernames/{key} doc.
// That doc no longer stores email at all (see claimUsername above), so
// there's nothing left to repair — email always comes from users/{uid}.
// Kept as a no-op export so existing call sites (useAuth.js) don't need
// to change.
export async function repairUsernameEmail(_uid, _email) {
  return;
}

/* ------------------------------- Ask AI chat ------------------------------------ */

// Single doc holds the whole "Ask AI" conversation for a user:
// users/{uid}/aiChat/session = { messages: [{ role, content, imagePreview }], updatedAt }
// A single doc (rather than one-doc-per-message) is enough for a chat this
// size and keeps loading/saving/clearing a single round trip.
export async function getAiChat(uid) {
  const ref = doc(db, "users", uid, "aiChat", "session");
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().messages || []) : null;
}

export async function saveAiChat(uid, messages) {
  const ref = doc(db, "users", uid, "aiChat", "session");
  await setDoc(ref, { messages, updatedAt: serverTimestamp() });
}

export async function clearAiChat(uid) {
  const ref = doc(db, "users", uid, "aiChat", "session");
  await deleteDoc(ref);
}

/* ---------------------------------- notes -------------------------------------- */

// users/{uid}/notes/{noteId} = { title, text, createdAt, updatedAt }
// A plain, permanent notes list (like the built-in Notes app on a phone) —
// replaces the old daily Tasks tab. `title` is a separate heading field
// (like the "Title" box in a phone's stock Notes app) — it's optional, and
// the list view falls back to the first line of `text` when it's empty.
// No character limit is enforced anywhere in this file or the UI; a
// Firestore document can hold up to ~1MiB total, which is effectively
// unlimited for typed notes.
export function watchNotes(uid, cb) {
  const ref = collection(db, "users", uid, "notes");
  return onSnapshot(ref, (snap) => {
    const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Most recently edited first, like a real notes app.
    notes.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    cb(notes);
  });
}

export async function addNote(uid, text = "", title = "") {
  const ref = collection(db, "users", uid, "notes");
  const docRef = await addDoc(ref, {
    title,
    text,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

// `updates` is a partial object, e.g. { text } or { title } or both — so
// callers can save just the field that changed without clobbering the other.
export async function updateNote(uid, noteId, updates) {
  const ref = doc(db, "users", uid, "notes", noteId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteNote(uid, noteId) {
  const ref = doc(db, "users", uid, "notes", noteId);
  await deleteDoc(ref);
}

/* --------------------------------- billing --------------------------------- */
// users/{uid}.billing = { plan, activatedAt, expiresAt, lastRedeemedCode }
// users/{uid}.aiUsage = { dayKey, count }  <- today's "Ask AI" message count,
//   reset implicitly whenever dayKey no longer matches today (see
//   incrementAiUsage below) rather than a separate midnight-wipe job.
//
// redeemCodes/{CODE} = { plan, days, used, createdAt, redeemedBy, redeemedAt }
// — one doc PER ADMIN-ISSUED CODE, provisioned ahead of time (see
// scripts/generate-redeem-codes.js) using the Firebase Admin SDK, which
// bypasses client security rules entirely. Regular clients can never create
// documents in this collection (see firestore.rules) — they can only flip
// an existing code's `used` flag from false to true, and only once. This is
// what makes a code "authorized": redemption succeeds only if a document
// for that exact code already exists here, never merely because a string
// happens to match some expected pattern.

// Redeems an admin-issued code for `uid`. Throws a user-facing Error if the
// code doesn't exist in the authorized redeemCodes collection, or has
// already been used. On success, activates/extends the user's plan (using
// the plan/days stored on the code doc — never anything parsed from the
// code string itself) and returns { plan, days }.
export async function redeemCode(uid, rawCode) {
  const code = (rawCode || "").trim().toUpperCase();
  if (!code) {
    throw new Error("Please enter a redeem code.");
  }

  const codeRef = doc(db, "redeemCodes", code);
  const userRef = doc(db, "users", uid);

  const result = await runTransaction(db, async (tx) => {
    // ALL reads must happen before any writes in a Firestore transaction.
    const codeSnap = await tx.get(codeRef);
    // The code must already exist as an admin-provisioned document —
    // format alone (however code-shaped) is never sufficient.
    if (!codeSnap.exists()) {
      throw new Error("That redeem code isn't valid.");
    }
    const codeData = codeSnap.data();
    if (codeData.used) {
      throw new Error("This redeem code has already been used.");
    }
    const { plan, days } = codeData;
    if ((plan !== PLAN.TEAM && plan !== PLAN.MAX) || !Number.isFinite(days) || days <= 0) {
      // Defensive only — a well-formed admin-issued code should never hit
      // this, but never trust stored data blindly for something that
      // grants paid access.
      throw new Error("That redeem code isn't valid.");
    }

    const userSnap = await tx.get(userRef);
    const existingBilling = userSnap.exists() ? userSnap.data().billing : null;

    // If the user already has time left on the SAME plan, stack the new
    // days on top of the remaining time instead of resetting the clock —
    // redeeming two 30-day Team codes back to back should give 60 days,
    // not just replace one 30-day window with another.
    const now = Date.now();
    const existingExpiresMs = existingBilling?.expiresAt?.toMillis ? existingBilling.expiresAt.toMillis() : 0;
    const baseMs = existingBilling?.plan === plan && existingExpiresMs > now ? existingExpiresMs : now;
    const expiresAtMs = baseMs + days * 24 * 60 * 60 * 1000;

    // Update (never create) — flips used:false -> used:true. See
    // firestore.rules: this is the only write clients are allowed to make
    // to this collection, and it can only ever happen once per code.
    tx.update(codeRef, { used: true, redeemedBy: uid, redeemedAt: serverTimestamp() });
    tx.set(
      userRef,
      {
        billing: {
          plan,
          activatedAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(expiresAtMs),
          lastRedeemedCode: code,
        },
      },
      { merge: true }
    );

    return { plan, days };
  });

  return result;
}

// Bumps today's Ask-AI message counter by 1, transparently rolling it over
// to a fresh count of 1 if `dayKey` has moved on since the last message
// (no separate midnight-reset job needed — the rollover happens lazily,
// the same way the redeem code stacking above does).
export async function incrementAiUsage(uid, dayKey) {
  const ref = doc(db, "users", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const usage = snap.exists() ? snap.data().aiUsage : null;
    const count = usage && usage.dayKey === dayKey ? (usage.count || 0) + 1 : 1;
    tx.set(ref, { aiUsage: { dayKey, count } }, { merge: true });
  });
}

// Adds `deltaSeconds` to today's Ask-AI TIME usage (how long the AI screen
// has been open), rolling over to a fresh total if `dayKey` has moved on —
// same lazy-reset pattern as incrementAiUsage/redeemCode above, so there's
// no separate midnight job. Called periodically (e.g. every ~10s) while the
// AI screen is open, rather than once at the end, so a closed tab/killed
// app doesn't lose the time already spent.
export async function addAiUsageSeconds(uid, dayKey, deltaSeconds) {
  const ref = doc(db, "users", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const usage = snap.exists() ? snap.data().aiUsage : null;
    const prevSeconds = usage && usage.dayKey === dayKey ? usage.seconds || 0 : 0;
    const count = usage && usage.dayKey === dayKey ? usage.count || 0 : 0;
    tx.set(ref, { aiUsage: { dayKey, count, seconds: prevSeconds + deltaSeconds } }, { merge: true });
  });
}


