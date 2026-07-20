// src/lib/achievements.js
//
// Static catalog of every BUILT-IN achievement, plus pure (no Firestore
// access) helpers to compute progress and figure out which ones just got
// crossed. Keeping this data-only and side-effect-free means the same list
// can safely be re-evaluated on every gameStats snapshot without risk of
// double-triggering anything — the actual "unlock + pay reward" write
// happens once, transactionally, in unlockAchievements() (lib/firestore.js).
//
// NOTE on scope vs. the original spec: this codebase has no "Focus Mode"
// feature (no separate distraction-blocking mode exists to count uses of),
// so "Use Focus Mode 20 Times" was swapped for "Complete 200 Sessions" —
// a milestone that actually maps to real, trackable data
// (sessionsCompleted, credited once per finished Study Timer countdown).
//
// ADMIN-EDITABLE ACHIEVEMENTS: the admin panel can override any field on a
// built-in achievement below (name/description/image/metric/target/
// reward/xpReward) and can add fully custom achievements, the same way the
// Store's built-in items can be overridden/extended (see
// src/lib/achievementOverrides.js, which fetches those live from Firestore
// and merges them on top of ACHIEVEMENTS via mergeAchievements()). Nothing
// in this file needs to change when the admin adds a new achievement —
// only when a NEW METRIC type needs to be supported does readMetricValue()
// below need a new case.
//
// `icon` is a Lucide icon name, used as a fallback badge image for
// achievements that don't have (or haven't been given) an `imageUrl` —
// every built-in achievement here predates image support, so they all rely
// on this fallback unless an admin later attaches an image via override.

export const ACHIEVEMENT_CATEGORY = {
  STUDY_TIME: "study_time",
  SESSIONS: "sessions",
  STREAK: "streak",
  XP: "xp",
  COINS: "coins",
  SUBJECT: "subject",
};

// `metric` says which gameStats field the achievement's progress is read
// from; `target` is the value that counts as "unlocked". `subject` is only
// present for per-subject achievements, and reads from
// gameStats.subjectSeconds[subject]. `reward` pays coins, `xpReward` pays
// XP — either, both, or neither (0) is valid.
export const ACHIEVEMENTS = [
  {
    id: "first_session",
    name: "First Study Session",
    description: "Complete your first study session.",
    icon: "Play",
    category: ACHIEVEMENT_CATEGORY.SESSIONS,
    metric: "sessionsCompleted",
    target: 1,
    reward: 100,
    xpReward: 0,
  },
  {
    id: "study_1h",
    name: "Study 1 Hour",
    description: "Reach 1 hour of total study time.",
    icon: "Clock",
    category: ACHIEVEMENT_CATEGORY.STUDY_TIME,
    metric: "totalStudySeconds",
    target: 3600,
    reward: 150,
    xpReward: 0,
  },
  {
    id: "study_5h",
    name: "Study 5 Hours",
    description: "Reach 5 hours of total study time.",
    icon: "Clock",
    category: ACHIEVEMENT_CATEGORY.STUDY_TIME,
    metric: "totalStudySeconds",
    target: 5 * 3600,
    reward: 400,
    xpReward: 0,
  },
  {
    id: "study_10h",
    name: "Study 10 Hours",
    description: "Reach 10 hours of total study time.",
    icon: "Clock",
    category: ACHIEVEMENT_CATEGORY.STUDY_TIME,
    metric: "totalStudySeconds",
    target: 10 * 3600,
    reward: 800,
    xpReward: 0,
  },
  {
    id: "study_50h",
    name: "Study 50 Hours",
    description: "Reach 50 hours of total study time.",
    icon: "Clock",
    category: ACHIEVEMENT_CATEGORY.STUDY_TIME,
    metric: "totalStudySeconds",
    target: 50 * 3600,
    reward: 3000,
    xpReward: 0,
  },
  {
    id: "study_100h",
    name: "Study 100 Hours",
    description: "Reach 100 hours of total study time.",
    icon: "Clock",
    category: ACHIEVEMENT_CATEGORY.STUDY_TIME,
    metric: "totalStudySeconds",
    target: 100 * 3600,
    reward: 6000,
    xpReward: 0,
  },
  {
    id: "sessions_10",
    name: "Complete 10 Sessions",
    description: "Finish 10 study timer sessions.",
    icon: "CheckCircle2",
    category: ACHIEVEMENT_CATEGORY.SESSIONS,
    metric: "sessionsCompleted",
    target: 10,
    reward: 250,
    xpReward: 0,
  },
  {
    id: "sessions_50",
    name: "Complete 50 Sessions",
    description: "Finish 50 study timer sessions.",
    icon: "CheckCircle2",
    category: ACHIEVEMENT_CATEGORY.SESSIONS,
    metric: "sessionsCompleted",
    target: 50,
    reward: 1000,
    xpReward: 0,
  },
  {
    id: "sessions_100",
    name: "Complete 100 Sessions",
    description: "Finish 100 study timer sessions.",
    icon: "CheckCircle2",
    category: ACHIEVEMENT_CATEGORY.SESSIONS,
    metric: "sessionsCompleted",
    target: 100,
    reward: 2000,
    xpReward: 0,
  },
  {
    id: "sessions_200",
    name: "Complete 200 Sessions",
    description: "Finish 200 study timer sessions.",
    icon: "CheckCircle2",
    category: ACHIEVEMENT_CATEGORY.SESSIONS,
    metric: "sessionsCompleted",
    target: 200,
    reward: 4000,
    xpReward: 0,
  },
  {
    id: "streak_7",
    name: "7-Day Streak",
    description: "Keep a study streak going for 7 days.",
    icon: "Flame",
    category: ACHIEVEMENT_CATEGORY.STREAK,
    metric: "streak",
    target: 7,
    reward: 500,
    xpReward: 0,
  },
  {
    id: "streak_30",
    name: "30-Day Streak",
    description: "Keep a study streak going for 30 days.",
    icon: "Flame",
    category: ACHIEVEMENT_CATEGORY.STREAK,
    metric: "streak",
    target: 30,
    reward: 2500,
    xpReward: 0,
  },
  {
    id: "streak_100",
    name: "100-Day Streak",
    description: "Keep a study streak going for 100 days.",
    icon: "Flame",
    category: ACHIEVEMENT_CATEGORY.STREAK,
    metric: "streak",
    target: 100,
    reward: 10000,
    xpReward: 0,
  },
  {
    id: "xp_10000",
    name: "Earn 10,000 XP",
    description: "Accumulate 10,000 total XP.",
    icon: "Shield",
    category: ACHIEVEMENT_CATEGORY.XP,
    metric: "totalXp",
    target: 10000,
    reward: 1000,
    xpReward: 0,
  },
  {
    id: "xp_100000",
    name: "Earn 100,000 XP",
    description: "Accumulate 100,000 total XP.",
    icon: "Shield",
    category: ACHIEVEMENT_CATEGORY.XP,
    metric: "totalXp",
    target: 100000,
    reward: 8000,
    xpReward: 0,
  },
  {
    id: "coins_50000",
    name: "Collect 50,000 Coins",
    description: "Earn a lifetime total of 50,000 coins.",
    icon: "Coins",
    category: ACHIEVEMENT_CATEGORY.COINS,
    // Measured against lifetime coins EARNED, not current balance, so
    // spending coins in the Store (or on a streak restore) never un-earns
    // this achievement or blocks it from unlocking. See
    // gameStats.lifetimeCoinsEarned in useAchievements.js.
    metric: "lifetimeCoinsEarned",
    target: 50000,
    reward: 0, // reward paid in coins would be circular for a coins-target badge
    xpReward: 0,
  },
];

// Merges admin panel overrides/custom achievements on top of the built-in
// ACHIEVEMENTS list, the same shape src/lib/storeOverrides.js uses for
// Store items: `overrides` is { [achievementId]: {field overrides...} }
// keyed by built-in id, `custom` is an array of fully admin-created
// achievement objects (already shaped like an ACHIEVEMENTS entry, minted
// with their own unique id by the admin panel). Every function below
// accepts an optional pre-merged list (defaulting to plain ACHIEVEMENTS)
// so existing callers that don't care about admin customization keep
// working unchanged.
export function mergeAchievements(overrides = {}, custom = []) {
  const withOverrides = ACHIEVEMENTS.map((a) => {
    const o = overrides[a.id];
    if (!o) return a;
    return {
      ...a,
      name: o.name ?? a.name,
      description: o.description ?? a.description,
      imageUrl: o.imageUrl ?? a.imageUrl,
      metric: o.metric ?? a.metric,
      subject: o.subject ?? a.subject,
      target: o.target ?? a.target,
      reward: o.reward ?? a.reward,
      xpReward: o.xpReward ?? a.xpReward ?? 0,
    };
  });
  const customFormatted = custom.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon || "Award",
    imageUrl: c.imageUrl,
    category: ACHIEVEMENT_CATEGORY.SESSIONS, // not shown anywhere; harmless default for custom badges
    metric: c.metric,
    subject: c.subject,
    target: c.target,
    reward: c.reward || 0,
    xpReward: c.xpReward || 0,
  }));
  return [...withOverrides, ...customFormatted];
}

// Reads whatever raw value an achievement's metric points to out of a
// gameStats-shaped object. Subject achievements dig one level deeper into
// subjectSeconds[subject].
function readMetricValue(achievement, stats) {
  if (achievement.metric === "subjectSeconds") {
    return (stats.subjectSeconds || {})[achievement.subject] || 0;
  }
  return stats[achievement.metric] || 0;
}

// Returns every achievement enriched with { value, progressPct, unlocked }
// for the given stats snapshot. `unlockedIds` (from
// gameStats.unlockedAchievements) is authoritative for `unlocked` — once
// something is in that set it stays shown as unlocked even if some
// hypothetical future change made the underlying metric dip back down
// (shouldn't happen for any of these monotonic counters, but this keeps
// the badge from ever visually "re-locking"). `list` defaults to the
// built-in catalog, but callers wanting admin-added achievements shown too
// should pass mergeAchievements(overrides, custom) instead.
export function computeAchievementProgress(stats, unlockedIds = [], list = ACHIEVEMENTS) {
  const unlockedSet = new Set(unlockedIds);
  return list.map((a) => {
    const value = readMetricValue(a, stats);
    const alreadyUnlocked = unlockedSet.has(a.id);
    const progressPct = Math.max(0, Math.min(100, Math.round((value / a.target) * 100)));
    return {
      ...a,
      value,
      progressPct,
      unlocked: alreadyUnlocked || value >= a.target,
    };
  });
}

// Given the enriched list above, returns just the ones that have crossed
// their target but are NOT YET in unlockedIds — i.e. newly-earned this
// tick, still needing their one-time unlock transaction + celebration.
export function findNewlyEarnedAchievements(stats, unlockedIds = [], list = ACHIEVEMENTS) {
  const unlockedSet = new Set(unlockedIds);
  return list.filter((a) => {
    if (unlockedSet.has(a.id)) return false;
    return readMetricValue(a, stats) >= a.target;
  });
}
