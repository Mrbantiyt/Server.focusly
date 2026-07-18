// src/lib/achievements.js
//
// Static catalog of every achievement, plus pure (no Firestore access)
// helpers to compute progress and figure out which ones just got crossed.
// Keeping this data-only and side-effect-free means the same list can
// safely be re-evaluated on every gameStats snapshot without risk of
// double-triggering anything — the actual "unlock + pay reward" write
// happens once, transactionally, in unlockAchievements() (lib/firestore.js).
//
// NOTE on scope vs. the original spec: this codebase has no "Focus Mode"
// feature (no separate distraction-blocking mode exists to count uses of),
// so "Use Focus Mode 20 Times" was swapped for "Complete 200 Sessions" —
// a milestone that actually maps to real, trackable data
// (sessionsCompleted, credited once per finished Study Timer countdown).

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
// gameStats.subjectSeconds[subject].
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
  },
  {
    id: "subject_math_10h",
    name: "Study Mathematics 10 Hours",
    description: "Reach 10 hours studying Mathematics.",
    icon: "BookOpen",
    category: ACHIEVEMENT_CATEGORY.SUBJECT,
    metric: "subjectSeconds",
    subject: "Mathematics",
    target: 10 * 3600,
    reward: 1200,
  },
  {
    id: "subject_hindi_10h",
    name: "Study Hindi 10 Hours",
    description: "Reach 10 hours studying Hindi.",
    icon: "BookOpen",
    category: ACHIEVEMENT_CATEGORY.SUBJECT,
    metric: "subjectSeconds",
    subject: "Hindi",
    target: 10 * 3600,
    reward: 1200,
  },
  {
    id: "subject_science_10h",
    name: "Study Science 10 Hours",
    description: "Reach 10 hours studying Science.",
    icon: "BookOpen",
    category: ACHIEVEMENT_CATEGORY.SUBJECT,
    metric: "subjectSeconds",
    subject: "Science",
    target: 10 * 3600,
    reward: 1200,
  },
];

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
// the badge from ever visually "re-locking").
export function computeAchievementProgress(stats, unlockedIds = []) {
  const unlockedSet = new Set(unlockedIds);
  return ACHIEVEMENTS.map((a) => {
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
export function findNewlyEarnedAchievements(stats, unlockedIds = []) {
  const unlockedSet = new Set(unlockedIds);
  return ACHIEVEMENTS.filter((a) => {
    if (unlockedSet.has(a.id)) return false;
    return readMetricValue(a, stats) >= a.target;
  });
}
