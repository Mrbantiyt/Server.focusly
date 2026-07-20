// src/hooks/useAchievements.js
import { useEffect, useRef, useState } from "react";
import { computeAchievementProgress, findNewlyEarnedAchievements } from "../lib/achievements";
import { useMergedAchievements } from "../lib/achievementOverrides";
import { unlockAchievements } from "../lib/firestore";
import { notifyAchievementUnlocked } from "../lib/notifications";

// Watches a gameStats-shaped snapshot (plus totalStudySeconds, computed at
// the App level from history + todaySeconds) for achievements that have
// just crossed their target, credits their reward via a single batched
// transaction, and queues them up for a one-time celebration popup.
//
// SAFETY / IDEMPOTENCY:
//   - unlockAchievements() re-checks each id against the server's own
//     unlockedAchievements array inside its transaction, so even if this
//     effect somehow fired twice for the same newly-crossed id (e.g. two
//     App instances, a fast re-render), the reward is only ever paid once.
//   - Locally, `firingRef` prevents overlapping calls from the same hook
//     instance while one unlock request is still in flight, so a rapid
//     double-fire of the effect can't send two separate requests for the
//     same batch before the first one's result (and the resulting
//     unlockedAchievements update) has come back.
//   - The celebration queue is purely local UI state — if the app closes
//     before a queued celebration is shown, nothing is lost: the
//     achievement is already unlocked and paid server-side, it just won't
//     re-show the popup on the next load (unlockedIds already contains it,
//     so findNewlyEarnedAchievements won't re-offer it).
export function useAchievements(uid, statsForProgress) {
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const firingRef = useRef(false);
  // Merges in any admin-added/overridden achievements (image icon, custom
  // metric/target, coin+XP reward) on top of the built-in catalog — see
  // src/lib/achievementOverrides.js. Falls back to just the built-in list
  // until the first Firestore snapshot lands.
  const achievementList = useMergedAchievements();

  const progress = computeAchievementProgress(statsForProgress, statsForProgress.unlockedAchievements || [], achievementList);

  useEffect(() => {
    if (!uid || !statsForProgress.loaded) return;
    if (firingRef.current) return;

    const newlyEarned = findNewlyEarnedAchievements(statsForProgress, statsForProgress.unlockedAchievements || [], achievementList);
    if (newlyEarned.length === 0) return;

    firingRef.current = true;
    const idsWithRewards = newlyEarned.map((a) => ({ id: a.id, reward: a.reward, xpReward: a.xpReward || 0 }));
    unlockAchievements(uid, idsWithRewards)
      .then((res) => {
        if (res?.newlyUnlocked?.length) {
          const unlockedSet = new Set(res.newlyUnlocked);
          const toCelebrate = newlyEarned.filter((a) => unlockedSet.has(a.id));
          setCelebrationQueue((q) => [...q, ...toCelebrate]);
          // One notification per achievement that actually got unlocked
          // this call (re-checked server-side inside the transaction, so
          // this can't fire for an id someone else's session already
          // unlocked). Each uses ITS OWN reward/xpReward as the credited
          // amount — unlockAchievements only returns the batch's summed
          // total, but every id here was paid in full (the transaction
          // never partially pays one), so the per-achievement values are
          // exactly what was credited for it.
          toCelebrate.forEach((a) => {
            notifyAchievementUnlocked(uid, a, { coinsAwarded: a.reward, xpAwarded: a.xpReward || 0 });
          });
        }
      })
      .catch((err) => {
        console.warn("[achievements] Failed to unlock:", err);
      })
      .finally(() => {
        firingRef.current = false;
      });
    // Re-run whenever any underlying metric could have changed. Listing the
    // specific primitives (rather than the whole stats object, which is a
    // fresh reference every snapshot) avoids re-firing on every unrelated
    // render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    uid,
    statsForProgress.loaded,
    statsForProgress.sessionsCompleted,
    statsForProgress.totalStudySeconds,
    statsForProgress.streak,
    statsForProgress.totalXp,
    statsForProgress.lifetimeCoinsEarned,
    JSON.stringify(statsForProgress.subjectSeconds || {}),
    JSON.stringify(statsForProgress.unlockedAchievements || []),
    achievementList,
  ]);

  // Pops the oldest queued celebration off the front — call this from the
  // popup's onDone so multiple simultaneous unlocks celebrate one at a time
  // instead of overlapping.
  const dismissNextCelebration = () => setCelebrationQueue((q) => q.slice(1));

  return {
    achievements: progress,
    currentCelebration: celebrationQueue[0] || null,
    dismissNextCelebration,
  };
}
