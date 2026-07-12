// src/hooks/useLeaderboard.js
import { useEffect, useRef, useState } from "react";
import { syncLeaderboardEntry, watchLeaderboard } from "../lib/firestore";
import { getWeekStartKey } from "../lib/time";

// Keeps two things going:
// 1) Syncs the signed-in user's own leaderboard/{uid} mirror doc (username,
//    lifetime study seconds, THIS WEEK's study seconds + which week that is,
//    streak, level) whenever those values change — so their rank stays
//    current without a dedicated write path elsewhere.
// 2) Live-watches the top N rows across all users — sorted by lifetime
//    total, or (when `weekly` is true) sorted by this-week's total and
//    restricted to rows tagged with the current Mon-Sun week, so the
//    ranking naturally resets every Monday with no cron/batch job.
//
// `weeklyStudySeconds` is passed in already computed by the caller (from
// `history` + today's live seconds) since only the caller knows the day-by-
// day breakdown needed to sum "since this Monday".
//
// `enabled` lets the caller mount this only while a leaderboard view is
// actually open, so we're not running an always-on cross-user listener for
// the whole app session.
export function useLeaderboard(uid, { username, totalStudySeconds, weeklyStudySeconds, streak, level }, enabled, { weekly = false } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const lastSyncedRef = useRef(null);
  const weekStartKey = getWeekStartKey();

  // Sync this user's own entry. Runs independently of `enabled` — a user's
  // rank should stay fresh even if they never open a Leaderboard view
  // themselves, since other people's views of the list depend on it.
  useEffect(() => {
    if (!uid) return;
    const key = `${username || ""}:${totalStudySeconds || 0}:${weeklyStudySeconds || 0}:${weekStartKey}:${streak || 0}:${level || 0}`;
    if (lastSyncedRef.current === key) return;
    lastSyncedRef.current = key;
    syncLeaderboardEntry(uid, { username, totalStudySeconds, weeklyStudySeconds, weekStartKey, streak, level });
  }, [uid, username, totalStudySeconds, weeklyStudySeconds, weekStartKey, streak, level]);

  // Watch the ranked list only while enabled (i.e. a leaderboard view is open).
  useEffect(() => {
    if (!enabled) { setRows([]); setLoading(true); return; }
    setLoading(true);
    const unsub = watchLeaderboard((list) => {
      setRows(list);
      setLoading(false);
    }, 50, { weekly, weekStartKey });
    return () => unsub();
  }, [enabled, weekly, weekStartKey]);

  return { rows, loading };
}
