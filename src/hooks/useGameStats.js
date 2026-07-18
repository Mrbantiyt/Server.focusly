// src/hooks/useGameStats.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { addFocusRewards, levelFromXp, registerDailyLogin, watchGameStats } from "../lib/firestore";
import { getXpPerTick, getCoinsPerMinute, REWARD_TICK_MS, COIN_MINUTE_MS } from "../lib/billing";

// ---------------------------------------------------------------------------
// FOCUS-SESSION REWARDS (XP + coins), plan-aware.
// ---------------------------------------------------------------------------
// - XP: +XP_PER_TICK_BY_PLAN[plan] every REWARD_TICK_MS (10s) of active
//   (`running`) focus-session time.
// - Coins: +COINS_PER_MINUTE_BY_PLAN[plan] for every FULL completed minute
//   of active focus-session time (partial minutes never pay out).
// - Rewards accrue ONLY while `running` is true. The instant it flips to
//   false (paused, stopped, cancelled, or the countdown completing), the
//   accrual interval below simply stops advancing — no reward is granted
//   for time that isn't actively running.
//
// PERSISTENCE / EXPLOIT-SAFETY, mirroring useCountdownTimer's approach:
//   - Progress toward the next tick/minute (`elapsedMsRef`) is mirrored to
//     localStorage on every 1s pulse, so backgrounding the app or a JS
//     runtime reload (native wrapper) resumes exactly where it left off
//     instead of losing partial progress or, worse, restarting the clock
//     and re-crediting time that was already paid out.
//   - Each completed tick/minute is credited to Firestore via
//     addFocusRewards(uid, newXpTicks, newCoinMinutes) as a DELTA the
//     instant it completes — not on some later re-derived total — so a
//     tick can only ever be sent once. Even if a flush somehow fires twice
//     for the same tick (network retry), whichever one actually reaches
//     the server first zeroes out the pending delta locally, so the retry
//     has nothing left to (re-)send.
//   - The reward RATE itself is decided server-side from the user's own
//     billing doc (see addFocusRewards in lib/firestore.js) — the client
//     only ever gets to say "one more tick/minute happened," never "credit
//     me at plan X's rate," so a tampered client can't fabricate a richer
//     payout than the account actually has.
const STORAGE_KEY_PREFIX = "focusly:rewardState:";

function loadPersistedRewardState(uid) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + uid);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.dayKey !== dayKeyFor(new Date())) return null; // fresh day, fresh progress
    return parsed;
  } catch {
    return null;
  }
}

function persistRewardState(uid, state) {
  if (!uid) return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + uid, JSON.stringify(state));
  } catch {
    // Storage unavailable — non-fatal; worst case a small amount of
    // in-progress (not-yet-credited) tick/minute progress is lost on an
    // interruption, same tradeoff as the countdown timer's own fallback.
  }
}

// Tracks XP / level / coins / streak for the signed-in user.
// - XP grows only while the countdown timer (`running`) is true, at a rate
//   determined by the user's current plan (see lib/billing.js).
// - Coins grow the same way, once per full completed minute of running time.
// - Level derives from total XP: level 1 needs 100 XP, then +500 XP per level.
// - Crossing into level N additionally credits N*1000 coins (level 1 = 1000,
//   level 2 = 2000, etc.) — unchanged from before.
// - Streak: bumped once per calendar day on login (see registerDailyLogin).
//
// `billing` is the raw Firestore billing field (users/{uid}.billing) —
// passed through so the LOCAL tick/minute rate used for on-screen feedback
// matches the plan; the actual payout is still decided server-side.
export function useGameStats(uid, running, billing) {
  const [stats, setStats] = useState({
    xp: 0, coins: 0, streak: 0, streakDays: {}, lastStreakDay: null, ownedItems: [], activeMascot: "default",
    sessionsCompleted: 0, lifetimeCoinsEarned: 0, subjectSeconds: {}, unlockedAchievements: [],
  });
  // True only once watchGameStats' onSnapshot callback has actually fired
  // for the current uid — lets consumers (e.g. App.jsx's level-up
  // detector) tell "this is the local default state, before Firestore has
  // said anything" apart from "Firestore confirmed this is the real level",
  // so a fresh app load's default-state level (e.g. level 1 from xp:0)
  // is never mistaken for a real baseline that a later real snapshot
  // could look like a level-up jump from.
  const [loaded, setLoaded] = useState(false);
  const loginRegisteredRef = useRef(null);

  // live sync from Firestore
  useEffect(() => {
    if (!uid) {
      setStats({
        xp: 0, coins: 0, streak: 0, streakDays: {}, lastStreakDay: null, ownedItems: [], activeMascot: "default",
        sessionsCompleted: 0, lifetimeCoinsEarned: 0, subjectSeconds: {}, unlockedAchievements: [],
      });
      setLoaded(false);
      return;
    }
    setLoaded(false);
    return watchGameStats(uid, (next) => {
      setStats(next);
      setLoaded(true);
    });
  }, [uid]);

  // credit the daily-login streak once per uid per day
  useEffect(() => {
    if (!uid) return;
    const todayKey = dayKeyFor(new Date());
    if (loginRegisteredRef.current === `${uid}:${todayKey}`) return;
    loginRegisteredRef.current = `${uid}:${todayKey}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    registerDailyLogin(uid, todayKey, dayKeyFor(yesterday));
  }, [uid]);

  // --- focus-session XP/coin accrual -------------------------------------
  const persisted = loadPersistedRewardState(uid);
  const dayKeyRef = useRef(persisted?.dayKey || dayKeyFor(new Date()));
  // Progress toward the NEXT xp tick / coin minute, in elapsed ms of
  // running time. Reset to 0 the instant a tick/minute completes and gets
  // credited — never re-derived from a running total, so nothing here can
  // be replayed into a double credit.
  const xpElapsedMsRef = useRef(persisted?.xpElapsedMs || 0);
  const coinElapsedMsRef = useRef(persisted?.coinElapsedMs || 0);
  const runningRef = useRef(running);
  const uidRef = useRef(uid);
  useEffect(() => { runningRef.current = running; }, [running]);

  // Reset in-progress (not-yet-credited) accrual when the signed-in user
  // actually changes — carrying one user's partial tick into another
  // user's session would be a real bug, same reasoning as
  // useCountdownTimer's uidForRef guard.
  useEffect(() => {
    if (uidRef.current !== uid) {
      uidRef.current = uid;
      xpElapsedMsRef.current = 0;
      coinElapsedMsRef.current = 0;
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const id = setInterval(() => {
      const key = dayKeyFor(new Date());
      if (key !== dayKeyRef.current) {
        // Fresh calendar day: any not-yet-credited partial progress from
        // yesterday is intentionally dropped (matches how "Time today"
        // itself starts over at a new studyDays/{dayKey} doc) rather than
        // silently rolling into today's count.
        dayKeyRef.current = key;
        xpElapsedMsRef.current = 0;
        coinElapsedMsRef.current = 0;
      }

      // Stop awarding immediately the moment the timer isn't running —
      // paused, stopped, cancelled, or completed all set `running` false,
      // so this is the single choke point that covers all of them.
      if (!runningRef.current) return;

      xpElapsedMsRef.current += 1000;
      coinElapsedMsRef.current += 1000;

      let newXpTicks = 0;
      let newCoinMinutes = 0;

      if (xpElapsedMsRef.current >= REWARD_TICK_MS) {
        newXpTicks = Math.floor(xpElapsedMsRef.current / REWARD_TICK_MS);
        xpElapsedMsRef.current -= newXpTicks * REWARD_TICK_MS;
      }
      if (coinElapsedMsRef.current >= COIN_MINUTE_MS) {
        newCoinMinutes = Math.floor(coinElapsedMsRef.current / COIN_MINUTE_MS);
        coinElapsedMsRef.current -= newCoinMinutes * COIN_MINUTE_MS;
      }

      if (newXpTicks > 0 || newCoinMinutes > 0) {
        // Fire-and-forget: addFocusRewards is itself a transaction, so a
        // slow/failed call here just means this chunk's reward lands a
        // moment later (or is retried), never that it's lost or doubled —
        // the elapsed-ms refs above have already been decremented, so even
        // if this specific call fails outright, the *next* completed tick
        // still only sends its own new delta, not a re-sum of everything.
        addFocusRewards(uid, newXpTicks, newCoinMinutes).catch((err) => {
          console.warn("[gameStats] Failed to credit focus rewards:", err);
        });
      }

      persistRewardState(uid, {
        dayKey: dayKeyRef.current,
        xpElapsedMs: xpElapsedMsRef.current,
        coinElapsedMs: coinElapsedMsRef.current,
      });
    }, 1000);

    return () => clearInterval(id);
  }, [uid]);

  const { level, xpIntoLevel, xpForNextLevel, totalXp, totalXpForNextLevel } = levelFromXp(stats.xp);

  return {
    xp: stats.xp,
    coins: stats.coins,
    streak: stats.streak,
    streakDays: stats.streakDays,
    lastStreakDay: stats.lastStreakDay,
    ownedItems: stats.ownedItems,
    activeMascot: stats.activeMascot,
    sessionsCompleted: stats.sessionsCompleted,
    lifetimeCoinsEarned: stats.lifetimeCoinsEarned,
    subjectSeconds: stats.subjectSeconds,
    unlockedAchievements: stats.unlockedAchievements,
    level,
    xpIntoLevel,
    xpForNextLevel,
    totalXp,
    totalXpForNextLevel,
    // True once the FIRST real Firestore snapshot for this uid has landed
    // (see the `loaded` state above) — false during the brief window where
    // `stats` is still just the local default.
    loaded,
    // Exposed for optional UI feedback (e.g. "earning X XP / 10s on your
    // plan"), not required for the reward system itself to function.
    xpPerTick: getXpPerTick(billing),
    coinsPerMinute: getCoinsPerMinute(billing),
  };
}
